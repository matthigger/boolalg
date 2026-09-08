/* The example catalogue and the maker behind each "make one up" button
   (SPEC.md section 3.1).

   Difficulty is measured, not guessed: an expression is as hard as the
   derivation it needs, so a candidate is generated, minimised, and kept
   only if the number of steps between it and its minimum falls in the
   band asked for. That keeps a generated problem honest -- a long
   expression that collapses in one step is not spicy, and the search
   is what says so. */

import { nt, ch, vr, mask, cost, desugar } from './core.js';
import { toText, PRESETS } from './text.js';
import { target, derive } from './minimize.js';

export const LEVELS = ['mild', 'medium', 'spicy'];

export const BLURB = {
  mild: 'one law, one step',
  medium: 'a few steps, and a choice of where to start',
  spicy: 'long enough that the order you pick matters',
};

/* Bands are in derivation steps. The caps on the search are small
   because this runs on a button press: a candidate that needs a deep
   search to place is not one worth waiting for. */
const BAND = {
  mild: { nv: 2, depth: 2, min: 1, max: 2, tries: 120 },
  medium: { nv: 3, depth: 3, min: 3, max: 5, tries: 160 },
  spicy: { nv: 3, depth: 4, min: 6, max: 40, tries: 220 },
};
/* Filed by measured difficulty: the steps between the expression and
   its minimum. A mild example may take none at all -- DeMorgan on a
   Venn is already as short as it goes, and is worth loading anyway for
   what the diagram does while the rule is applied. */
export const CATALOGUE = {
  mild: [
    ['(A u B)^C', 'sets', 'DeMorgan on a Venn — watch the shading hold still'],
    ['~(A & B)', 'logic', "DeMorgan's, in a single rewrite"],
    ['(A u B) - C', 'sets', 'difference, and the Definition that unlocks it'],
    ['A n (A u B)', 'sets', 'Absorption: the bracket never gets to matter'],
    ['A u A^C', 'sets', 'Complement: the two halves are everything'],
    ['~((A & B) | ~C)', 'logic', 'circuit01 — table, circuit, wire tracing'],
  ],
  medium: [
    ['(A & B) | (A & ~B)', 'logic', 'the B cancels out entirely'],
    ['~((C | ~A) & (A | C) & ~C)', 'logic', 'show this is always true'],
    ['(A u B) n (A u B^C)', 'sets', 'and here the B disappears too'],
    ['~(~B | ~C | A)', 'logic', 'one DeMorgan, then tidy up after it'],
    ['(B | A | C) & ~A', 'logic', 'distribute, then watch a term die'],
    ['A & (C | B) & (~A | C)', 'logic', 'three conditions that come to two'],
    ['~A & ~(~C | A) & ~B', 'logic', 'a pile of negations with a short answer'],
  ],
  spicy: [
    ['(C & B) | (~C & B) | (A & ~B)', 'logic', 'circuit04 — simplify it to A ∨ B'],
    ['(~~C & ~B & (B | A)) | ~~B', 'logic', 'the double negations are the easy part'],
    ['~(~B | (~A & B) | (C & B))', 'logic', 'one long DeMorgan and its fallout'],
    ['(A - B) u (B - A)', 'sets', 'symmetric difference, the long way round'],
    ['A ^ B', 'logic', 'exclusive or, unfolded by Definition'],
    ['~A & ~C & ~(~C & B & ~A)', 'logic', 'nine steps down to three letters'],
  ],
};

/* ---- making one up ------------------------------------------------- */

function randomExpr(nv, depth, r) {
  if (depth <= 0 || r() < 0.22) {
    const leaf = vr(Math.floor(r() * nv));
    return r() < 0.32 ? nt(leaf) : leaf;
  }
  const k = r();
  if (k < 0.18) return nt(randomExpr(nv, depth - 1, r));
  const n = r() < 0.62 ? 2 : 3;
  const ts = [];
  for (let i = 0; i < n; i++) ts.push(randomExpr(nv, depth - 1, r));
  return ch(k < 0.6 ? 'or' : 'and', ts);
}

/* Every variable in play, or the problem is really a smaller one. */
function usesAll(n, nv) {
  const seen = new Set();
  const walk = (x) => {
    if (x.k === 'var') seen.add(x.i);
    else if (x.k === 'not') walk(x.a);
    else if (x.k === 'diff' || x.k === 'sym') { walk(x.l); walk(x.r); }
    else if (x.ts) x.ts.forEach(walk);
  };
  walk(n);
  return seen.size === nv;
}

/* Returns {src, mode, steps}, or null if nothing in the band turned up.
   The caller decides what to do with a miss; it is not an error, just
   an unlucky run of the dice. */
export function makeOne(level, mode = 'logic', r = Math.random) {
  const b = BAND[level];
  for (let i = 0; i < b.tries; i++) {
    const e = randomExpr(b.nv, b.depth, r);
    if (!usesAll(e, b.nv)) continue;
    const c = cost(e);
    if (c < 3 || c > 14) continue;
    const t = target(e, b.nv);
    if (c <= t.cost) continue;
    const m = mask(e, b.nv);
    // A problem that is secretly a constant reads as a trick, except at
    // mild, where "this is always true" is the whole point.
    if (level !== 'mild' && (m === 0 || m === (1 << (1 << b.nv)) - 1)) continue;
    const d = derive(desugar(e), t.cost, b.nv,
                     { maxNodes: 1500, maxSteps: 14 });
    if (!d.ok || !d.path) continue;
    const n = d.path.length;
    if (n < b.min || n > b.max) continue;
    return { src: toText(e, mode, PRESETS.ABC), mode, steps: n };
  }
  return null;
}
