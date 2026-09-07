/* The application: state, the expression pane, the algebra rail, and
   the wiring between them. See SPEC.md sections 3 to 10. */

import { el, svg, clear } from './dom.js';
import { vr, cn, nt, ch, eq, key, mask, cost, isChain, at, focus,
         replaceSel, selections, desugar } from './core.js';
import { parse, toText, GLYPH, PRESETS, needsParens, PErr } from './text.js';
import { rewritesOf, searchRewrites, label, GROUPS } from './rules.js';
import { target, derive, minTable } from './minimize.js';
import * as Venn from './venn.js';
import * as TT from './truthtable.js';
import * as Circuit from './circuit.js';

/* ---- state -------------------------------------------------------- */

const S = {
  mode: 'sets',
  nv: 3,
  letters: PRESETS.ABC,
  lines: [],            // {expr, rule, sel}
  sel: null,            // selection within selectedLine
  selectedLine: 0,
  hoverRow: null,
  hint: 0,              // 0 none, 1 expression, 2 also the rule
  showWork: true,
  note: '',
};

const cur = () => S.lines[S.selectedLine]?.expr ?? null;
const lastExpr = () => S.lines.at(-1)?.expr ?? null;
const curMask = () => (cur() ? mask(cur(), S.nv) : 0);

function setExpr(expr, letters) {
  if (letters) S.letters = letters;
  S.lines = [{ expr, rule: null, sel: null }];
  S.selectedLine = 0;
  S.sel = null;
  S.hint = 0;
  S.note = '';
}

/* Synthesise an expression for a mask (SPEC.md section 8.2), using the
   stage 1 witness so clicking gives back a tidy expression rather than
   a full sum of minterms. */
function minimalFor(m) {
  const e = minTable(S.nv).get(m);
  return e ? e.node : cn(false);
}

/* ---- expression rendering ----------------------------------------- */

const txt = (s) => document.createTextNode(s);

function nodeDom(n, path, parentKind) {
  const g = GLYPH[S.mode];
  const sp = el('span', { class: 'nd', data: { path: JSON.stringify(path) } });
  const paren = needsParens(n, parentKind);
  if (paren) sp.appendChild(txt('('));
  switch (n.k) {
    case 'var': sp.appendChild(txt(S.letters[n.i] ?? '?')); break;
    case 'const': sp.appendChild(txt(n.v ? g.T : g.F)); break;
    case 'not': {
      const inner = n.a;
      const simple = ['var', 'const', 'not'].includes(inner.k);
      const body = () => {
        if (!simple) sp.appendChild(txt('('));
        sp.appendChild(nodeDom(inner, [...path, 'a'], null));
        if (!simple) sp.appendChild(txt(')'));
      };
      if (g.notPre) { sp.appendChild(txt(g.notPre)); body(); }
      else { body(); sp.appendChild(el('sup', { text: 'C' })); }
      break;
    }
    case 'diff': case 'sym': {
      sp.appendChild(nodeDom(n.l, [...path, 'l'], n.k));
      sp.appendChild(txt(` ${n.k === 'diff' ? g.diff : g.sym} `));
      sp.appendChild(nodeDom(n.r, [...path, 'r'], n.k));
      break;
    }
    default:
      n.ts.forEach((t, i) => {
        if (i) sp.appendChild(txt(` ${g[n.k]} `));
        sp.appendChild(nodeDom(t, [...path, i], n.k));
      });
  }
  if (paren) sp.appendChild(txt(')'));
  return sp;
}

/* Snap two clicked paths to a selectable unit: the same subtree, a run
   of one chain's terms, or the smallest subtree covering both. Nothing
   else is representable, so a drag can never yield a non-expression. */
function unify(root, p1, p2) {
  let i = 0;
  while (i < p1.length && i < p2.length && p1[i] === p2[i]) i++;
  const prefix = p1.slice(0, i);
  if (i < p1.length && i < p2.length) {
    const parent = at(root, prefix);
    if (isChain(parent) && typeof p1[i] === 'number' &&
        typeof p2[i] === 'number' && p1[i] !== p2[i]) {
      const a = Math.min(p1[i], p2[i]), b = Math.max(p1[i], p2[i]);
      if (a === 0 && b === parent.ts.length - 1) {
        return { path: prefix, from: null, to: null };
      }
      return { path: prefix, from: a, to: b + 1 };
    }
  }
  return { path: prefix, from: null, to: null };
}

function markSel(host, expr, sel, cls = 'sel') {
  for (const n of host.querySelectorAll('.nd')) n.classList.remove(cls);
  if (!sel) return;
  const paths = sel.from == null ? [sel.path]
    : Array.from({ length: sel.to - sel.from },
                 (_, k) => [...sel.path, sel.from + k]);
  for (const p of paths) {
    const q = JSON.stringify(p);
    const node = [...host.querySelectorAll('.nd')]
      .find((n) => n.dataset.path === q);
    if (node) node.classList.add(cls);
  }
}

function renderLines() {
  const host = document.getElementById('lines');
  clear(host);
  S.lines.forEach((ln, i) => {
    const exprBox = el('span', { class: 'expr' }, [nodeDom(ln.expr, [], null)]);
    const row = el('div', {
      class: 'dline' + (i === S.selectedLine ? ' active' : ''),
      onmousedown: () => { if (i !== S.selectedLine) {
        S.selectedLine = i; S.sel = null; render(); } },
    }, [
      el('span', { class: 'eqs', text: i ? '=' : '' }),
      exprBox,
      ln.rule ? el('span', { class: 'rule', text: label(ln.rule) }) : null,
    ]);
    host.appendChild(row);
    if (i === S.selectedLine) {
      wireSelection(exprBox, ln.expr);
      // Every render rebuilds these spans, so the live selection has to
      // be repainted here -- the drag handlers only ever marked the DOM
      // they were dragged over, which the render then threw away.
      markSel(exprBox, ln.expr, S.sel, 'sel');
    }
    if (ln.sel) markSel(exprBox, ln.expr, ln.sel, 'span');
  });
}

function wireSelection(host, expr) {
  let anchor = null, last = null;
  const pathAt = (t) => {
    const n = t && t.closest ? t.closest('.nd') : null;
    return n ? JSON.parse(n.dataset.path) : null;
  };
  function finish(ev) {
    if (!anchor) return;
    // Released off the expression: fall back to the last term the drag
    // was actually over, so overshooting does not shrink the selection.
    S.sel = unify(expr, anchor, pathAt(ev.target) || last || anchor);
    anchor = null;
    S.hint = 0;
    render();
  }
  host.addEventListener('mousedown', (ev) => {
    anchor = pathAt(ev.target);
    last = anchor;
    if (!anchor) return;
    ev.preventDefault();
    // The release often lands outside the expression, so catch it on the
    // window rather than losing the drag.
    window.addEventListener('mouseup', finish, { once: true });
  });
  host.addEventListener('mousemove', (ev) => {
    const p = pathAt(ev.target);
    if (!anchor) {
      markSel(host, expr, p ? { path: p, from: null, to: null } : null, 'hov');
      return;
    }
    if (!p) return;
    last = p;
    markSel(host, expr, unify(expr, anchor, p), 'sel');
  });
  host.addEventListener('mouseleave', () => markSel(host, expr, null, 'hov'));
}

/* ---- viewer ------------------------------------------------------- */

function renderViewer() {
  const host = document.getElementById('viewer');
  clear(host);
  const expr = cur();
  if (!expr) return renderEmptyHint(host);
  const m = curMask();
  const selNode = S.sel ? focus(expr, S.sel) : null;
  const selMask = selNode ? mask(selNode, S.nv) : null;

  if (S.mode === 'sets') {
    const pane = el('div', { class: 'pane' });
    pane.appendChild(el('h2', { text: 'Venn diagram' }));
    const body = el('div', { class: 'panebody' });
    const cap = el('div', { class: 'caption' });
    Venn.render(body, {
      nv: S.nv, on: m, sel: selMask, letters: S.letters, mode: S.mode,
      onToggle: (r) => toggleRegion(r),
      onHover: (r) => {
        cap.textContent = r == null
          ? (selMask != null
              ? 'darker fill: the selection · lighter: the whole line'
              : 'click a region to shade it')
          : Venn.regionName(r, S.nv, S.letters, S.mode);
      },
    });
    cap.textContent = selMask != null
      ? 'darker fill: the selection · lighter: the whole line'
      : 'click a region to shade it';
    pane.appendChild(body);
    pane.appendChild(cap);
    host.appendChild(pane);
    return;
  }

  const p1 = el('div', { class: 'pane tt-pane' },
    [el('h2', { text: 'Truth table' })]);
  const b1 = el('div', { class: 'panebody' });
  TT.render(b1, {
    expr, nv: S.nv, letters: S.letters, mode: S.mode, mask: m,
    selNode, showWork: S.showWork, hoverRow: S.hoverRow,
    onToggle: (r) => toggleRegion(r),
    onHoverRow: (r) => { S.hoverRow = r; renderViewer(); },
  });
  p1.appendChild(b1);

  const p2 = el('div', { class: 'pane' }, [el('h2', {
    text: 'Circuit' + (S.hoverRow != null ? ` — row ${S.hoverRow
      .toString(2).padStart(S.nv, '0')}` : '') })]);
  const b2 = el('div', { class: 'panebody' });
  Circuit.render(b2, { expr, nv: S.nv, letters: S.letters, row: S.hoverRow });
  p2.appendChild(b2);
  p2.appendChild(el('div', { class: 'caption',
    text: S.hoverRow == null ? 'hover a truth-table row to trace the wires'
                             : 'values shown on every wire' }));
  host.appendChild(p1);
  host.appendChild(p2);
}

function renderEmptyHint(host) {
  const pane = el('div', { class: 'pane' });
  pane.appendChild(el('h2', { text: S.mode === 'sets' ? 'Venn diagram'
                                                      : 'Truth table' }));
  const body = el('div', { class: 'panebody' });
  if (S.mode === 'sets') {
    Venn.render(body, { nv: S.nv, on: 0, sel: null, letters: S.letters,
      mode: S.mode, onToggle: (r) => toggleRegion(r) });
  } else {
    TT.render(body, { expr: cn(false), nv: S.nv, letters: S.letters,
      mode: S.mode, mask: 0, showWork: false,
      onToggle: (r) => toggleRegion(r) });
  }
  pane.appendChild(body);
  pane.appendChild(el('div', { class: 'caption',
    text: 'click a region to build an expression, or pick an example' }));
  host.appendChild(pane);
}

/* Flipping a bit changes what the expression means, so the derivation
   is replaced rather than extended (SPEC.md section 4.1). */
let warned = false;
function toggleRegion(r) {
  const m = curMask() ^ (1 << r);
  setExpr(minimalFor(m));
  if (!warned && S.lines.length) {
    warned = true;
    toast('editing the diagram replaces the derivation');
  }
  render();
}

/* ---- algebra rail ------------------------------------------------- */

function available() {
  const expr = cur();
  if (!expr) return new Map();
  const sel = S.sel ?? { path: [], from: null, to: null };
  const f = focus(expr, sel);
  const byGroup = new Map();
  for (const r of searchRewrites(f)) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  return byGroup;
}

function renderRules() {
  const host = document.getElementById('rules');
  clear(host);
  const avail = available();
  const hintPlan = S.hint >= 2 ? plan() : null;
  for (const g of GROUPS) {
    const rs = avail.get(g) || [];
    const usable = g !== 'Associative' && rs.length > 0;
    const isHint = hintPlan?.path?.[0]?.group === g;
    const btn = el('button', {
      class: 'r' + (isHint ? ' hint' : ''),
      disabled: !usable,
      title: g === 'Associative'
        ? 'built into how chains are written here'
        : (usable ? 'apply to the selection' : 'does not apply here'),
      onclick: () => applyRule(g, rs),
    }, [
      label(g),
      rs.length > 1 ? el('span', { class: 'dir', text: `  ×${rs.length}` })
                    : null,
    ]);
    host.appendChild(el('div', { class: 'rule-row' }, [
      btn,
      el('button', { class: 'info', text: 'i', title: 'what is this law?',
        onclick: (ev) => { ev.stopPropagation(); showLaw(g); } }),
    ]));
  }
  document.getElementById('simpNote').textContent = S.note;
}

function applyRule(group, rs) {
  if (group === 'Associative' || !rs.length) return;
  const expr = cur();
  const sel = S.sel ?? { path: [], from: null, to: null };
  const best = rs.slice().sort((a, b) => cost(a.next) - cost(b.next))[0];
  const next = replaceSel(expr, sel, best.next);
  if (mask(next, S.nv) !== mask(expr, S.nv)) {
    toast('⚠ that step would change the meaning — not applied');
    return;
  }
  S.lines = S.lines.slice(0, S.selectedLine + 1);
  S.lines.push({ expr: next, rule: group, sel });
  S.selectedLine = S.lines.length - 1;
  S.sel = null;
  S.hint = 0;
  S.note = '';
  render();
}

/* ---- simplify and hints ------------------------------------------- */

function plan() {
  const expr = cur();
  if (!expr) return null;
  const t = target(expr, S.nv);
  // Already at target cost. Report ok so callers that only test .ok do
  // not mistake this for a failed search.
  if (cost(expr) <= t.cost) return { done: true, ok: true, path: [], t };
  const r = derive(expr, t.cost, S.nv);
  return { ...r, t };
}

function doHint(level) {
  const p = plan();
  if (!p) return;
  if (p.done) { S.note = ''; render(); return; }
  if (!p.ok) {
    S.note = `minimal form is ${toText(p.t.node, S.mode, S.letters)}` +
             ' (no derivation found)';
    render(); return;
  }
  S.hint = level;
  S.sel = p.path[0].sel;
  S.note = level === 1
    ? 'work on the highlighted part'
    : `use ${label(p.path[0].group)} on the highlighted part`;
  render();
}

function applyNext() {
  const p = plan();
  if (!p || p.done || !p.ok) { doHint(1); return; }
  const st = p.path[0];
  S.lines = S.lines.slice(0, S.selectedLine + 1);
  S.lines.push({ expr: st.node, rule: st.group, sel: st.sel });
  S.selectedLine = S.lines.length - 1;
  S.sel = null;
  S.hint = 0;
  S.note = '';
  render();
}

function runAll() {
  for (let i = 0; i < 40; i++) {
    const p = plan();
    if (!p || p.done || !p.ok) break;
    const st = p.path[0];
    S.lines.push({ expr: st.node, rule: st.group, sel: st.sel });
    S.selectedLine = S.lines.length - 1;
  }
  const p = plan();
  S.note = p && !p.done && !p.ok
    ? `minimal form is ${toText(p.t.node, S.mode, S.letters)}` +
      ' (no derivation found)'
    : '';
  S.sel = null; S.hint = 0;
  render();
}

/* ---- law demonstration (SPEC.md section 6.3) ---------------------- */

const LAWS = {
  Associative: ['(A u B) u C', 'A u (B u C)'],
  Commutative: ['A u B', 'B u A'],
  'Double Negation': ['(A^C)^C', 'A'],
  "DeMorgan's": ['(A u B)^C', 'A^C n B^C'],
  Distributive: ['A n (B u C)', '(A n B) u (A n C)'],
  Absorption: ['A n (A u B)', 'A'],
  Complement: ['A u A^C', '1'],
  Idempotent: ['A u A', 'A'],
  Identity: ['0 u A', 'A'],
  Domination: ['1 u A', '1'],
  Definition: ['A - B', 'A n B^C'],
};

function showLaw(group) {
  const [ls, rs] = LAWS[group];
  const L = parse(ls).expr, R = parse(rs).expr;
  const nv = 3;
  const side = (e, i) => {
    const box = el('div', { class: 'side' });
    box.appendChild(el('div', { class: 't',
      text: toText(e, S.mode, S.letters) }));
    if (S.mode === 'sets') {
      const h = el('div', { class: 'minivenn' });
      Venn.render(h, { nv, on: mask(e, nv), sel: null, letters: S.letters,
        mode: S.mode, idp: `d${i}` });
      box.appendChild(h);
    } else {
      const h = el('div');
      TT.render(h, { expr: e, nv, letters: S.letters, mode: S.mode,
        mask: mask(e, nv), showWork: false });
      box.appendChild(h);
    }
    return box;
  };
  const same = mask(L, nv) === mask(R, nv);
  const body = group === 'Associative'
    ? el('p', { text: 'Already built into how chains are written here. ' +
        'That A ' + GLYPH[S.mode].or + ' B ' + GLYPH[S.mode].or +
        ' C needs no parentheses is this law — so there is nothing to ' +
        'apply, and no step to add.' })
    : el('div', { class: 'lawgrid' }, [
        side(L, 0), el('div', { class: 'mid', text: '=' }), side(R, 1)]);

  const canApply = (available().get(group) || []).length > 0 &&
                   group !== 'Associative';
  openCard(el('div', { class: 'card' }, [
    el('h3', { text: label(group) + (group === 'Associative' ? '' : ' Law') }),
    el('p', { text: group === 'Associative' ? '' : (same
      ? 'Both sides pick out exactly the same thing — which is why ' +
        'rewriting one into the other never changes the picture.'
      : 'these differ — that would be a bug') }),
    body,
    el('div', { class: 'cardfoot' }, [
      canApply ? el('button', { class: 'primary',
        text: 'try it on my expression',
        onclick: () => { closeCard(); applyRule(group, available().get(group)); },
      }) : null,
      el('button', { class: 'ghost', text: 'dismiss', onclick: closeCard }),
    ]),
  ]));
}

/* ---- examples (SPEC.md section 3.1) ------------------------------- */

const EXAMPLES = [
  ['(A u B)^C', 'sets', 'DeMorgan on a Venn diagram — watch the shading hold still'],
  ['A n (A u B)', 'sets', 'Absorption: a big expression collapses in one step'],
  ['(A u B) - C', 'sets', 'difference, and the Definition step that unlocks it'],
  ['~((A & B) | ~C)', 'logic', 'circuit01 — truth table, circuit, wire tracing'],
  ['(C & B) | (~C & B) | (A & ~B)', 'logic', 'circuit04 — simplify it to A ∨ B'],
  ['(~A | ~B) | (A & B)', 'logic', 'show this is always true'],
];

function showExamples() {
  openCard(el('div', { class: 'card' }, [
    el('h3', { text: 'Examples' }),
    el('p', { text: 'Each one loads an expression and gets out of the way.' }),
    el('div', { class: 'exlist' }, EXAMPLES.map(([src, mode, why]) =>
      el('button', { onclick: () => { closeCard(); load(src, mode); } }, [
        el('div', { class: 'ex-e',
          text: toText(parse(src).expr, mode, PRESETS.ABC) }),
        el('div', { class: 'ex-d', text: why }),
      ]))),
    el('div', { class: 'cardfoot' }, [
      el('button', { class: 'ghost', text: 'start empty',
        onclick: () => { closeCard(); S.lines = []; S.sel = null; render(); } }),
      el('button', { class: 'ghost', text: 'dismiss', onclick: closeCard }),
    ]),
  ]));
}

function load(src, mode) {
  const { expr, letters } = parse(src);
  if (mode) S.mode = mode;
  S.nv = Math.max(2, Math.min(4, letters.length));
  setExpr(expr, letters);
  document.getElementById('src').value = toText(expr, S.mode, S.letters);
  render();
}

/* ---- overlays ----------------------------------------------------- */

function openCard(card) {
  const o = document.getElementById('overlay');
  clear(o);
  o.appendChild(card);
  o.hidden = false;
  o.onclick = (ev) => { if (ev.target === o) closeCard(); };
}
function closeCard() { document.getElementById('overlay').hidden = true; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCard(); S.sel = null; render(); }
});

let toastT = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---- URL state ---------------------------------------------------- */

function toUrl() {
  const p = new URLSearchParams();
  p.set('mode', S.mode);
  p.set('n', S.nv);
  if (cur()) p.set('e', toText(S.lines[0].expr, 'logic', S.letters));
  return location.origin + location.pathname + '?' + p.toString();
}
function fromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('mode') === 'logic' || p.get('mode') === 'sets') S.mode = p.get('mode');
  const n = +p.get('n');
  if (n >= 2 && n <= 4) S.nv = n;
  const e = p.get('e');
  if (e) { try { load(e, S.mode); } catch (_) { /* ignore a bad link */ } }
  // Instructor deep links: open with the derivation already worked, or
  // with one truth-table row traced (SPEC.md section 16.3).
  if (p.get('solve') === '1' && cur()) runAll();
  const row = p.get('row');
  if (row != null && row !== '' && !Number.isNaN(+row)) S.hoverRow = +row;
}

/* ---- render ------------------------------------------------------- */

function render() {
  for (const b of document.querySelectorAll('#modeToggle button')) {
    b.setAttribute('aria-selected', String(b.dataset.mode === S.mode));
  }
  const vp = document.getElementById('varPick');
  clear(vp);
  for (const n of [2, 3, 4]) {
    vp.appendChild(el('button', {
      text: String(n), 'aria-selected': String(n === S.nv),
      disabled: n === 4 && S.mode === 'sets',
      title: n === 4 && S.mode === 'sets'
        ? 'four sets would need four ellipses — logic mode only' : '',
      onclick: () => { S.nv = n; if (cur()) reseed(); render(); },
    }));
  }
  renderViewer();
  renderLines();
  renderRules();
  const p = cur() ? plan() : null;
  document.getElementById('simplify').disabled = !cur() || !!p?.done;
  document.getElementById('simplify').textContent =
    p?.done ? 'already minimal' : 'Simplify';
  for (const id of ['hintExpr', 'hintRule', 'applyStep', 'runAll']) {
    document.getElementById(id).disabled = !cur() || !!p?.done;
  }
}

/* Widen or narrow the variable count. An expression whose variables
   all still fit is kept as it is -- the extra variable is simply
   unused. Only a narrowing that would orphan a variable has to
   re-seed, since a mask computed at one width means nothing at
   another. */
function reseed() {
  padLetters();
  const e = cur();
  if (!e) return;
  if (maxVar(e) < S.nv) {
    S.lines = S.lines.filter((ln) => maxVar(ln.expr) < S.nv);
    if (!S.lines.length) S.lines = [{ expr: e, rule: null, sel: null }];
    S.selectedLine = Math.min(S.selectedLine, S.lines.length - 1);
    S.sel = null;
    return;
  }
  setExpr(minimalFor(mask(e, S.nv) & ((1 << (1 << S.nv)) - 1)));
}

function maxVar(n) {
  switch (n.k) {
    case 'var': return n.i;
    case 'const': return -1;
    case 'not': return maxVar(n.a);
    case 'diff': case 'sym': return Math.max(maxVar(n.l), maxVar(n.r));
    default: return Math.max(...n.ts.map(maxVar));
  }
}

/* Keep at least nv letters, borrowing from whichever preset the
   existing ones came from. */
function padLetters() {
  if (S.letters.length >= S.nv) return;
  const src = Object.values(PRESETS)
    .find((p) => p[0] === S.letters[0]) || PRESETS.ABC;
  const out = S.letters.slice();
  for (const L of src) if (!out.includes(L) && out.length < S.nv) out.push(L);
  while (out.length < S.nv) out.push(PRESETS.ABC[out.length]);
  S.letters = out;
}

/* ---- boot --------------------------------------------------------- */

function boot() {
  for (const b of document.querySelectorAll('#modeToggle button')) {
    b.onclick = () => {
      S.mode = b.dataset.mode;
      if (S.mode === 'sets' && S.nv > 3) { S.nv = 3; reseed(); }
      const inp = document.getElementById('src');
      if (cur()) inp.value = toText(S.lines[0].expr, S.mode, S.letters);
      render();
    };
  }
  document.getElementById('examplesBtn').onclick = showExamples;
  document.getElementById('simplify').onclick = runAll;
  document.getElementById('hintExpr').onclick = () => doHint(1);
  document.getElementById('hintRule').onclick = () => doHint(2);
  document.getElementById('applyStep').onclick = applyNext;
  document.getElementById('runAll').onclick = runAll;
  document.getElementById('reset').onclick = () => {
    if (S.lines.length) { S.lines = [S.lines[0]]; S.selectedLine = 0; }
    S.sel = null; S.hint = 0; S.note = ''; render();
  };
  document.getElementById('share').onclick = async () => {
    const u = toUrl();
    history.replaceState(null, '', u);
    try { await navigator.clipboard.writeText(u); toast('link copied'); }
    catch (_) { toast('link is in the address bar'); }
  };

  const inp = document.getElementById('src');
  const err = document.getElementById('srcErr');
  const tryParse = () => {
    const v = inp.value.trim();
    if (!v) { err.textContent = ''; return; }
    try {
      const { expr, letters } = parse(v);
      err.textContent = '';
      S.nv = Math.max(S.nv, Math.min(4, letters.length));
      if (S.mode === 'sets' && S.nv > 3) S.nv = 3;
      setExpr(expr, letters);
      render();
    } catch (e) {
      err.textContent = e instanceof PErr
        ? `${e.message}${e.at != null ? ` at position ${e.at + 1}` : ''}`
        : e.message;
    }
  };
  inp.addEventListener('change', tryParse);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryParse(); });

  fromUrl();
  render();
}

/* Exposed so the interaction tests can drive the app, and so a
   confused instructor can poke at it from the console. */
window.BAE = { S, render, load, unify, applyRule, available, plan,
               doHint, applyNext, runAll, toggleRegion, minimalFor,
               setExpr, reseed };

boot();
