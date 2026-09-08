/* Notation, parsing and plain-text rendering (SPEC.md sections 5.1,
   5.4, 10). One glyph table, used by every surface. */

import { vr, cn, nt, df, sy, ch, isChain } from './core.js';

export const GLYPH = {
  logic: { and: '∧', or: '∨', T: 'T', F: 'F', diff: '−', sym: '⊕',
           notPre: '¬', notPost: '' },
  sets: { and: '∩', or: '∪', T: 'U', F: '∅', diff: '−', sym: 'Δ',
          notPre: '', notPost: 'ᶜ' },
};

export const PRESETS = {
  ABC: ['A', 'B', 'C', 'D'],
  PQR: ['P', 'Q', 'R', 'S'],
  pqr: ['p', 'q', 'r', 's'],
};

/* ---- tokenising --------------------------------------------------- */

/* Multi-letter words, matched case-insensitively. */
const WORD = {
  and: 'AND', or: 'OR', not: 'NOT', true: 'T', false: 'F',
  union: 'OR', inter: 'AND', empty: 'F', xor: 'SYM',
};

/* Single letters, matched case-sensitively so that lowercase u is
   union while uppercase U is the universal set. None of these clash
   with the variable presets A-D, P-S, p-s. */
const SINGLE = {
  u: 'OR', v: 'OR', n: 'AND', U: 'T', T: 'T', t: 'T', F: 'F', f: 'F',
};

/* LaTeX spellings, so a student can paste from a problem set or type
   what they would write in a document. \overline and \bar are NOT
   because the {...} that follows them tokenises as a bracketed group. */
const LATEX = {
  cap: 'AND', land: 'AND', wedge: 'AND', cdot: 'AND',
  cup: 'OR', lor: 'OR', vee: 'OR',
  neg: 'NOT', lnot: 'NOT', sim: 'NOT', complement: 'NOT',
  overline: 'NOT', bar: 'NOT',
  setminus: 'DIFF', smallsetminus: 'DIFF', backslash: 'DIFF',
  oplus: 'SYM', triangle: 'SYM', bigtriangleup: 'SYM',
  emptyset: 'F', varnothing: 'F', bot: 'F',
  top: 'T',
};

function tokenise(src) {
  const out = [];
  let i = 0;
  const push = (t, v) => out.push({ t, v, at: i });
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('∧∩&*·'.includes(c)) { push('AND'); i++; continue; }
    if ('∨∪|+'.includes(c)) { push('OR'); i++; continue; }
    if ('¬!~'.includes(c)) { push('NOT'); i++; continue; }
    if ('−-'.includes(c)) { push('DIFF'); i++; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
      if (!m) { push('DIFF'); i++; continue; }
      const t = LATEX[m[1].toLowerCase()];
      if (!t) throw new PErr(`unknown command "\\${m[1]}"`, i);
      push(t); i += m[0].length; continue;
    }
    if ('Δ∆⊕'.includes(c)) { push('SYM'); i++; continue; }
    if (c === '(' || c === '{') { push('LP'); i++; continue; }
    if (c === ')' || c === '}') { push('RP'); i++; continue; }
    if (c === '=') { push('EQ'); i++; continue; }
    if (c === '∅') { push('F'); i++; continue; }
    if (c === "'" || c === 'ᶜ') { push('POST'); i++; continue; }
    if (c === '^') {
      // ^C is complement, ^{cc} is two of them; a bare ^ is symmetric
      // difference.
      const m = /^\^\s*(?:\{\s*([Cc]+)\s*\}|([Cc]))/.exec(src.slice(i));
      if (m) {
        for (const _ of (m[1] || m[2])) push('POST');
        i += m[0].length; continue;
      }
      push('SYM'); i++; continue;
    }
    if (/[0-9]/.test(c)) { push(c === '0' ? 'F' : 'T'); i++; continue; }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z]+/.exec(src.slice(i))[0];
      if (m.length > 1) {
        const w = WORD[m.toLowerCase()];
        if (!w) throw new PErr(`unknown word "${m}"`, i);
        push(w); i += m.length; continue;
      }
      if (SINGLE[m]) { push(SINGLE[m]); i++; continue; }
      push('VAR', m); i++; continue;
    }
    throw new PErr(`unexpected "${c}"`, i);
  }
  push('END');
  return out;
}

export class PErr extends Error {
  constructor(msg, at) { super(msg); this.at = at; }
}

/* ---- parsing ------------------------------------------------------ */

/* Parse tolerantly, accepting every notation the course materials use.
   Returns {expr, letters}; letters are assigned indices in sorted order
   so A,B,C and p,q,r both map to 0,1,2 (SPEC.md section 10). */
export function parse(src) {
  const tk = tokenise(src);
  let p = 0;
  const peek = () => tk[p].t;
  const take = () => tk[p++];
  const seen = new Set();

  function expr() { return orx(); }

  function orx() {
    const ts = [andx()];
    while (peek() === 'OR') { take(); ts.push(andx()); }
    return ts.length === 1 ? ts[0] : ch('or', ts);
  }
  function andx() {
    const ts = [diffx()];
    while (peek() === 'AND') { take(); ts.push(diffx()); }
    return ts.length === 1 ? ts[0] : ch('and', ts);
  }
  function diffx() {
    let n = unary();
    while (peek() === 'DIFF' || peek() === 'SYM') {
      const op = take().t;
      n = op === 'DIFF' ? df(n, unary()) : sy(n, unary());
    }
    return n;
  }
  function unary() {
    if (peek() === 'NOT') { take(); return nt(unary()); }
    return postfix();
  }
  function postfix() {
    let n = atom();
    while (peek() === 'POST') { take(); n = nt(n); }
    return n;
  }
  function atom() {
    const t = take();
    if (t.t === 'LP') {
      const n = expr();
      if (peek() !== 'RP') throw new PErr('missing )', tk[p].at);
      take();
      let m = n;
      while (peek() === 'POST') { take(); m = nt(m); }
      return m;
    }
    if (t.t === 'T') return cn(true);
    if (t.t === 'F') return cn(false);
    if (t.t === 'VAR') { seen.add(t.v); return { k: 'var', name: t.v }; }
    throw new PErr(`expected an expression`, t.at);
  }

  const tree = expr();
  if (peek() !== 'END') throw new PErr('unexpected trailing input', tk[p].at);

  const letters = [...seen].sort();
  if (letters.length === 0) letters.push('A');
  const bind = (n) => {
    if (n.k === 'var') return vr(letters.indexOf(n.name));
    if (n.k === 'not') return nt(bind(n.a));
    if (n.k === 'diff') return df(bind(n.l), bind(n.r));
    if (n.k === 'sym') return sy(bind(n.l), bind(n.r));
    if (isChain(n)) return ch(n.k, n.ts.map(bind));
    return n;
  };
  return { expr: bind(tree), letters };
}

/* ---- rendering ---------------------------------------------------- */

/* True when a child needs brackets inside a parent: only when the two
   are different binary operators. A chain's own terms are never
   grouped, since the node is n-ary (SPEC.md section 5.1). */
export function needsParens(child, parentKind) {
  if (!parentKind) return false;
  const binary = ['and', 'or', 'diff', 'sym'];
  return binary.includes(child.k) && child.k !== parentKind;
}

export function toText(n, mode = 'logic', letters = PRESETS.ABC,
                       parentKind = null) {
  const g = GLYPH[mode];
  const wrap = (s) => (needsParens(n, parentKind) ? `(${s})` : s);
  switch (n.k) {
    case 'var': return letters[n.i] ?? '?';
    case 'const': return n.v ? g.T : g.F;
    case 'not': {
      const inner = n.a;
      const simple = inner.k === 'var' || inner.k === 'const' ||
        inner.k === 'not';
      const body = toText(inner, mode, letters, null);
      const b = simple ? body : `(${body})`;
      return g.notPre ? g.notPre + b : b + g.notPost;
    }
    case 'diff':
      return wrap(`${toText(n.l, mode, letters, 'diff')} ${g.diff} ` +
        `${toText(n.r, mode, letters, 'diff')}`);
    case 'sym':
      return wrap(`${toText(n.l, mode, letters, 'sym')} ${g.sym} ` +
        `${toText(n.r, mode, letters, 'sym')}`);
    default:
      return wrap(n.ts.map((t) => toText(t, mode, letters, n.k))
        .join(` ${g[n.k]} `));
  }
}

/* ---- LaTeX --------------------------------------------------------- */

const TEX = {
  logic: { and: '\\land', or: '\\lor', diff: '\\setminus', sym: '\\oplus',
           T: '\\mathrm{T}', F: '\\mathrm{F}', notPre: '\\lnot ' },
  sets: { and: '\\cap', or: '\\cup', diff: '\\setminus', sym: '\\triangle',
          T: 'U', F: '\\emptyset', notPre: '' },
};

/* Render for a .tex file. Complement is an overline in sets, where the
   bar is the notation the handout uses, and a prefix \lnot in logic. An
   overline already groups what it covers, so it takes no brackets. */
export function toTeX(n, mode = 'logic', letters = PRESETS.ABC,
                      parentKind = null) {
  const g = TEX[mode];
  const wrap = (s) => (needsParens(n, parentKind) ? `\\left(${s}\\right)` : s);
  switch (n.k) {
    case 'var': return letters[n.i] ?? '?';
    case 'const': return n.v ? g.T : g.F;
    case 'not': {
      const body = toTeX(n.a, mode, letters, null);
      if (!g.notPre) return `\\overline{${body}}`;
      const simple = ['var', 'const', 'not'].includes(n.a.k);
      return g.notPre + (simple ? body : `\\left(${body}\\right)`);
    }
    case 'diff':
      return wrap(`${toTeX(n.l, mode, letters, 'diff')} ${g.diff} ` +
        `${toTeX(n.r, mode, letters, 'diff')}`);
    case 'sym':
      return wrap(`${toTeX(n.l, mode, letters, 'sym')} ${g.sym} ` +
        `${toTeX(n.r, mode, letters, 'sym')}`);
    default:
      return wrap(n.ts.map((t) => toTeX(t, mode, letters, n.k))
        .join(` ${g[n.k]} `));
  }
}

/* The same string toText builds, plus where each subtree landed in it:
   a map from JSON.stringify(path) to [start, end). An exporter drawing
   its own text needs this to put a mark around a part of a line -- the
   DOM spans that carry it on screen do not survive into a canvas. */
export function toTextSpans(n, mode = 'logic', letters = PRESETS.ABC) {
  const g = GLYPH[mode];
  const at = new Map();
  let out = '';
  const walk = (node, path, parentKind) => {
    const start = out.length;
    const paren = needsParens(node, parentKind);
    if (paren) out += '(';
    switch (node.k) {
      case 'var': out += letters[node.i] ?? '?'; break;
      case 'const': out += node.v ? g.T : g.F; break;
      case 'not': {
        const simple = ['var', 'const', 'not'].includes(node.a.k);
        const body = () => {
          if (!simple) out += '(';
          walk(node.a, [...path, 'a'], null);
          if (!simple) out += ')';
        };
        if (g.notPre) { out += g.notPre; body(); }
        else { body(); out += g.notPost; }
        break;
      }
      case 'diff': case 'sym':
        walk(node.l, [...path, 'l'], node.k);
        out += ` ${node.k === 'diff' ? g.diff : g.sym} `;
        walk(node.r, [...path, 'r'], node.k);
        break;
      default:
        node.ts.forEach((t, i) => {
          if (i) out += ` ${g[node.k]} `;
          walk(t, [...path, i], node.k);
        });
    }
    if (paren) out += ')';
    at.set(JSON.stringify(path), [start, out.length]);
  };
  walk(n, [], null);
  return { text: out, at };
}

/* toTeX, with named subtrees wrapped in a \bastep macro. marks maps
   JSON.stringify(path) to a colour name the caller has defined; the
   macro itself is left for the caller to emit, so a reader can redefine
   it without touching the body of the derivation. */
export function toTeXMarked(n, mode, letters, marks,
                            path = [], parentKind = null) {
  const g = TEX[mode];
  const rec = (c, seg, pk) =>
    toTeXMarked(c, mode, letters, marks, [...path, seg], pk);
  let s;
  switch (n.k) {
    case 'var': s = letters[n.i] ?? '?'; break;
    case 'const': s = n.v ? g.T : g.F; break;
    case 'not': {
      const body = rec(n.a, 'a', null);
      if (!g.notPre) { s = `\\overline{${body}}`; break; }
      const simple = ['var', 'const', 'not'].includes(n.a.k);
      s = g.notPre + (simple ? body : `\\left(${body}\\right)`);
      break;
    }
    case 'diff': case 'sym': {
      const inner = `${rec(n.l, 'l', n.k)} ${g[n.k]} ${rec(n.r, 'r', n.k)}`;
      s = needsParens(n, parentKind) ? `\\left(${inner}\\right)` : inner;
      break;
    }
    default: {
      const inner = n.ts.map((t, i) => rec(t, i, n.k)).join(` ${g[n.k]} `);
      s = needsParens(n, parentKind) ? `\\left(${inner}\\right)` : inner;
    }
  }
  const c = marks?.get(JSON.stringify(path));
  return c ? `\\bastep{${c}}{${s}}` : s;
}
