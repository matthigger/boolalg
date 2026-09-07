/* Core expression machinery: AST, masks, cost, paths, notation, parsing
   and rendering. No DOM here -- see ui.js. Mirrors SPEC.md sections 2, 4,
   5 and 10. */

export const OPS = ['and', 'or'];

/* ---- construction ------------------------------------------------- */

export const vr = (i) => ({ k: 'var', i });
export const cn = (v) => ({ k: 'const', v });
export const nt = (a) => ({ k: 'not', a });
export const df = (l, r) => ({ k: 'diff', l, r });
export const sy = (l, r) => ({ k: 'sym', l, r });

/* Build a flat chain: nested chains of the same operator are absorbed,
   a single term collapses to itself, and an emptied chain becomes the
   operator's identity (T for and, F for or). That last case is reached
   by factoring, e.g. (x and C) or (C and C) on C. */
export function ch(op, terms) {
  const flat = [];
  for (const t of terms) {
    if (t.k === op) flat.push(...t.ts);
    else flat.push(t);
  }
  if (flat.length === 0) return cn(op === 'and');
  if (flat.length === 1) return flat[0];
  return { k: op, ts: flat };
}
export const and = (...t) => ch('and', t);
export const or = (...t) => ch('or', t);

export const dual = (op) => (op === 'and' ? 'or' : 'and');
export const isChain = (n) => n.k === 'and' || n.k === 'or';

/* ---- structural equality ------------------------------------------ */

export function eq(a, b) {
  if (a === b) return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'var': return a.i === b.i;
    case 'const': return a.v === b.v;
    case 'not': return eq(a.a, b.a);
    case 'diff': case 'sym': return eq(a.l, b.l) && eq(a.r, b.r);
    default:
      return a.ts.length === b.ts.length &&
        a.ts.every((t, i) => eq(t, b.ts[i]));
  }
}

/* A stable key for visited-sets and memoisation. Order sensitive, so
   two expressions differing only in term order are distinct -- rules
   match modulo commutativity instead (see rules.js). */
export function key(n) {
  switch (n.k) {
    case 'var': return 'v' + n.i;
    case 'const': return n.v ? 'T' : 'F';
    case 'not': return '!' + key(n.a);
    case 'diff': return '(' + key(n.l) + '-' + key(n.r) + ')';
    case 'sym': return '(' + key(n.l) + '^' + key(n.r) + ')';
    default: return (n.k === 'and' ? '&(' : '|(') +
      n.ts.map(key).join(',') + ')';
  }
}

/* ---- sugar -------------------------------------------------------- */

/* Rewrite difference and symmetric difference away. Mask and cost are
   always computed on this form (SPEC.md section 8.3). */
export function desugar(n) {
  switch (n.k) {
    case 'var': case 'const': return n;
    case 'not': return nt(desugar(n.a));
    case 'diff': return and(desugar(n.l), nt(desugar(n.r)));
    case 'sym': {
      const l = desugar(n.l), r = desugar(n.r);
      return or(and(l, nt(r)), and(r, nt(l)));
    }
    default: return ch(n.k, n.ts.map(desugar));
  }
}

export function hasSugar(n) {
  switch (n.k) {
    case 'var': case 'const': return false;
    case 'not': return hasSugar(n.a);
    case 'diff': case 'sym': return true;
    default: return n.ts.some(hasSugar);
  }
}

/* ---- semantics ---------------------------------------------------- */

/* Compute the 2^n-bit mask. Bit r is set iff the expression holds on
   case r, where variable i is true iff bit (n-1-i) of r is set --
   so the table counts up from 000 (SPEC.md section 2.1). */
export function mask(n, nv) {
  const full = (1 << (1 << nv)) - 1;
  switch (n.k) {
    case 'var': {
      let m = 0;
      for (let r = 0; r < (1 << nv); r++) {
        if ((r >> (nv - 1 - n.i)) & 1) m |= 1 << r;
      }
      return m;
    }
    case 'const': return n.v ? full : 0;
    case 'not': return full & ~mask(n.a, nv);
    case 'diff': case 'sym': return mask(desugar(n), nv);
    default: {
      let acc = null;
      for (const t of n.ts) {
        const m = mask(t, nv);
        acc = acc === null ? m : (n.k === 'and' ? acc & m : acc | m);
      }
      return acc;
    }
  }
}

/* Evaluate under one assignment, recording the value of every node so
   the circuit can label its wires (SPEC.md section 9.3). */
export function evalAt(n, row, nv, out = new Map()) {
  let v;
  switch (n.k) {
    case 'var': v = ((row >> (nv - 1 - n.i)) & 1) === 1; break;
    case 'const': v = n.v; break;
    case 'not': v = !evalAt(n.a, row, nv, out); break;
    case 'diff': case 'sym': v = evalAt(desugar(n), row, nv, out); break;
    default: {
      const vals = n.ts.map((t) => evalAt(t, row, nv, out));
      v = n.k === 'and' ? vals.every(Boolean) : vals.some(Boolean);
    }
  }
  out.set(n, v);
  return v;
}

/* Count operator nodes on the desugared form: each not is 1, a k-term
   chain is k-1. This is the course's own measure. */
export function cost(n) { return rawCost(desugar(n)); }
function rawCost(n) {
  switch (n.k) {
    case 'var': case 'const': return 0;
    case 'not': return 1 + rawCost(n.a);
    default: return n.ts.length - 1 + n.ts.reduce((s, t) => s + rawCost(t), 0);
  }
}

/* ---- paths and selections ----------------------------------------- */

/* A path is a list of steps from the root: 'a' into a not, 'l'/'r' into
   sugar, or an integer index into a chain. A selection is a path plus,
   optionally, a half-open range of that chain's terms. */
export const selEq = (a, b) =>
  !!a && !!b && a.path.join() === b.path.join() &&
  a.from === b.from && a.to === b.to;

export function at(root, path) {
  let n = root;
  for (const s of path) {
    if (s === 'a') n = n.a;
    else if (s === 'l') n = n.l;
    else if (s === 'r') n = n.r;
    else n = n.ts[s];
  }
  return n;
}

/* Resolve a selection to the node the rules should act on. A term range
   becomes a virtual chain of just those terms (SPEC.md section 5.2.1). */
export function focus(root, sel) {
  const n = at(root, sel.path);
  if (sel.from == null) return n;
  return ch(n.k, n.ts.slice(sel.from, sel.to));
}

export function replaceAt(root, path, next) {
  if (path.length === 0) return next;
  const [s, ...rest] = path;
  if (s === 'a') return nt(replaceAt(root.a, rest, next));
  if (s === 'l') return { ...root, l: replaceAt(root.l, rest, next) };
  if (s === 'r') return { ...root, r: replaceAt(root.r, rest, next) };
  const ts = root.ts.slice();
  ts[s] = replaceAt(root.ts[s], rest, next);
  return ch(root.k, ts);
}

/* Substitute the result of a rewrite back in. A term range is spliced
   in place so the chain's other terms keep their order. */
export function replaceSel(root, sel, next) {
  if (sel.from == null) return replaceAt(root, sel.path, next);
  const parent = at(root, sel.path);
  const ts = parent.ts.slice();
  ts.splice(sel.from, sel.to - sel.from, next);
  return replaceAt(root, sel.path, ch(parent.k, ts));
}

/* Every selectable unit: each subtree, plus each contiguous run of two
   or more terms of each chain. */
export function* selections(root, path = []) {
  yield { path, from: null, to: null };
  const n = at(root, path);
  if (n.k === 'not') yield* selections(root, [...path, 'a']);
  else if (n.k === 'diff' || n.k === 'sym') {
    yield* selections(root, [...path, 'l']);
    yield* selections(root, [...path, 'r']);
  } else if (isChain(n)) {
    for (let i = 0; i < n.ts.length; i++) {
      for (let j = i + 2; j <= n.ts.length; j++) {
        if (!(i === 0 && j === n.ts.length)) yield { path, from: i, to: j };
      }
    }
    for (let i = 0; i < n.ts.length; i++) {
      yield* selections(root, [...path, i]);
    }
  }
}
