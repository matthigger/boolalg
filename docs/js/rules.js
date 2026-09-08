/* The rule table of SPEC.md Appendix B, and rewrite enumeration.

   Rules act on a selection, which resolves to either a subtree or a
   virtual chain of some of a chain's terms (SPEC.md section 5.2.1).
   Matching is modulo commutativity: every two-operand rule is tried
   with its operands both ways round, which is what lets the handout's
   own "empty set union A = A" apply to a student's "A union empty set",
   and is why the search needs no explicit Commutative move.

   Associative has no entry. Chains are n-ary, so both sides of the law
   render identically and there is nothing to rewrite; it appears in the
   UI as an explainer (SPEC.md section 5.2.2). */

import { cn, nt, ch, eq, dual, isChain, cost } from './core.js';

/* Off-handout rules carry a trailing star, so a student never cites a
   law the course did not give them. Commutative is not starred: it was
   added to logic_set_identities alongside Associative. Definition is,
   since difference has no entry there (SPEC.md section 8.3). */
export const OFF_HANDOUT = ['Definition'];

/* Handout order, with Commutative beside Associative as on the sheet. */
export const GROUPS = [
  'Associative', 'Commutative', 'Double Negation', "DeMorgan's",
  'Distributive', 'Absorption', 'Complement', 'Idempotent', 'Identity',
  'Domination', 'Definition',
];
export const label = (g) => (OFF_HANDOUT.includes(g) ? g + '*' : g);

const unit = (op) => cn(op === 'and');
const zero = (op) => cn(op !== 'and');

/* All single-rule rewrites of a focus node. Each result is
   {group, next, expands}. */
export function rewritesOf(f) {
  const out = [];
  const add = (group, next, expands = false) =>
    out.push({ group, next, expands });

  if (f.k === 'diff') {
    add('Definition', ch('and', [f.l, nt(f.r)]));
  }
  if (f.k === 'sym') {
    add('Definition', ch('or', [{ k: 'diff', l: f.l, r: f.r },
                                { k: 'diff', l: f.r, r: f.l }]));
  }

  if (f.k === 'not') {
    const inner = f.a;
    if (inner.k === 'not') add('Double Negation', inner.a);
    // The complement of a constant. Nothing else in the table touches
    // it, so a derivation reaching the empty set's complement had no
    // move left and stopped one step short of the universe.
    if (inner.k === 'const') add('Definition', cn(!inner.v));
    if (isChain(inner) && inner.ts.length === 2) {
      add("DeMorgan's", ch(dual(inner.k), inner.ts.map(nt)));
    }
  }

  if (isChain(f)) {
    const op = f.k, dl = dual(op), ts = f.ts;
    const u = unit(op), z = zero(op);
    // Replace operand i with a result and remove operand j.
    const put = (i, j, node) => {
      const out2 = [];
      ts.forEach((t, k) => {
        if (k === i) out2.push(node);
        else if (k !== j) out2.push(t);
      });
      return ch(op, out2);
    };
    // Remove one operand, leaving every other term where it was.
    const drop = (i) => ch(op, ts.filter((_, k) => k !== i));

    if (ts.length === 2) add('Commutative', ch(op, [ts[1], ts[0]]));

    for (let i = 0; i < ts.length; i++) {
      for (let j = 0; j < ts.length; j++) {
        if (i === j) continue;
        const a = ts[i], b = ts[j];
        if (i < j && eq(a, b)) add('Idempotent', drop(j));
        if (eq(b, nt(a))) add('Complement', put(i, j, z));
        if (eq(a, u)) add('Identity', drop(i));
        if (eq(a, z)) add('Domination', put(i, j, z));
        // Absorption: a and (a or b) = a
        if (isChain(b) && b.k === dl && b.ts.some((t) => eq(t, a))) {
          add('Absorption', drop(j));
        }
        // Distributive, factoring: (a and x) or (a and y) = a and (x or y)
        if (isChain(a) && a.k === dl && isChain(b) && b.k === dl) {
          for (const c of a.ts) {
            if (!b.ts.some((t) => eq(t, c))) continue;
            const ra = ch(dl, a.ts.filter((t) => !eq(t, c)));
            const rb = ch(dl, b.ts.filter((t) => !eq(t, c)));
            add('Distributive', put(i, j, ch(dl, [c, ch(op, [ra, rb])])));
          }
        }
        // DeMorgan, collecting: not a and not b = not (a or b)
        if (a.k === 'not' && b.k === 'not') {
          add("DeMorgan's", put(i, j, nt(ch(dl, [a.a, b.a]))));
        }
        // Distributive, expanding: a and (x or y) = (a and x) or (a and y)
        if (isChain(b) && b.k === dl) {
          add('Distributive',
              put(i, j, ch(dl, b.ts.map((t) => ch(op, [a, t])))), true);
        }
      }
    }

    // Whole-chain forms, for a selection of three or more terms.
    if (ts.length > 2) {
      if (ts.some((t) => eq(t, z))) add('Domination', z);
      if (ts.every((t) => eq(t, ts[0]))) add('Idempotent', ts[0]);
      if (ts.every((t) => isChain(t) && t.k === dl)) {
        for (const c of ts[0].ts) {
          if (!ts.every((t) => t.ts.some((x) => eq(x, c)))) continue;
          const parts = ts.map((t) => ch(dl, t.ts.filter((x) => !eq(x, c))));
          add('Distributive', ch(dl, [c, ch(op, parts)]));
        }
      }
    }
  }

  // Expanding directions offered to students but never preferred.
  add('Double Negation', nt(nt(f)), true);
  add('Idempotent', ch('and', [f, f]), true);
  add('Idempotent', ch('or', [f, f]), true);

  // Drop no-ops and de-duplicate.
  const seen = new Set();
  return out.filter((r) => {
    if (eq(r.next, f)) return false;
    const k = r.group + '|' + JSON.stringify(r.next);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* Rewrites usable by the search: contracting rules plus expanding
   Distributive, which the prototype showed is required (proto/
   FINDINGS.md). The other expanding directions only widen the tree. */
export function searchRewrites(f) {
  return rewritesOf(f).filter(
    (r) => !r.expands || r.group === 'Distributive');
}
