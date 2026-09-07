/* The two-stage minimiser of SPEC.md section 7, validated in Python
   first (proto/FINDINGS.md).

   Stage 1 finds the provably minimal operator count for a mask by
   working outward in increasing cost, so the first formula reaching a
   mask is optimal. Affordable for n <= 3; at n = 4 the pair work is
   some 65000 times larger, so that case falls back to reporting the
   best form the search finds.

   Stage 2 searches the handout rules for a derivation down to that
   cost. Measured on the course's own problems: 13/13 reached, mean 2.8
   steps, 5-7 nodes expanded. */

import { vr, cn, nt, ch, key, cost, mask, desugar } from './core.js';
import { searchRewrites } from './rules.js';
import { selections, focus, replaceSel } from './core.js';

const DP_CACHE = new Map();

export function minTable(nv) {
  if (DP_CACHE.has(nv)) return DP_CACHE.get(nv);
  const cells = 1 << nv, full = (1 << cells) - 1;
  const best = new Map();
  const byCost = new Map();
  const offer = (m, c, node) => {
    if (best.has(m)) return;
    best.set(m, { cost: c, node });
    if (!byCost.has(c)) byCost.set(c, []);
    byCost.get(c).push(m);
  };
  for (const v of [false, true]) offer(mask(cn(v), nv), 0, cn(v));
  for (let i = 0; i < nv; i++) offer(mask(vr(i), nv), 0, vr(i));

  for (let c = 1; best.size < full + 1 && c < 40; c++) {
    for (const m of (byCost.get(c - 1) || []).slice()) {
      offer(full & ~m, c, nt(best.get(m).node));
    }
    for (let i = 0; i < c; i++) {
      const j = c - 1 - i;
      if (j < i) break;
      for (const a of byCost.get(i) || []) {
        for (const b of byCost.get(j) || []) {
          const na = best.get(a).node, nb = best.get(b).node;
          offer(a & b, c, ch('and', [na, nb]));
          offer(a | b, c, ch('or', [na, nb]));
        }
      }
    }
  }
  DP_CACHE.set(nv, best);
  return best;
}

/* The minimum cost for an expression, and a witness at that cost.
   proved is false at n = 4, where stage 1 is skipped. */
export function target(expr, nv) {
  const m = mask(expr, nv);
  if (nv <= 3) {
    const e = minTable(nv).get(m);
    return { cost: e.cost, node: e.node, proved: true, mask: m };
  }
  const best = greedy(expr, nv);
  return { cost: cost(best), node: best, proved: false, mask: m };
}

function greedy(expr, nv) {
  let cur = desugar(expr);
  for (let i = 0; i < 200; i++) {
    let next = null;
    for (const st of steps(cur)) {
      if (cost(st.next) < cost(cur) && (!next || cost(st.next) < cost(next))) {
        next = st.next;
      }
    }
    if (!next) break;
    cur = next;
  }
  return cur;
}

/* Every one-rule rewrite of a whole expression, tagged with the
   selection it acted on so the UI can highlight it. */
export function* steps(expr) {
  for (const sel of selections(expr)) {
    const f = focus(expr, sel);
    for (const r of searchRewrites(f)) {
      yield { group: r.group, sel, next: replaceSel(expr, sel, r.next) };
    }
  }
}

/* Best-first search for a derivation reaching targetCost. Caps are far
   above anything measured; they bound pathological input only. */
export function derive(expr, targetCost, nv,
                       { maxNodes = 20000, maxSteps = 40 } = {}) {
  const start = desugar(expr);
  if (cost(start) <= targetCost) return { path: [], nodes: 0, ok: true };
  const m0 = mask(start, nv);
  const seen = new Map([[key(start), 0]]);
  let heap = [{ f: cost(start) - targetCost, g: 0, node: start, path: [] }];
  let nodes = 0;

  while (heap.length && nodes < maxNodes) {
    heap.sort((a, b) => a.f - b.f || a.g - b.g);
    const cur = heap.shift();
    nodes++;
    if (cur.g >= maxSteps) continue;
    for (const st of steps(cur.node)) {
      if (mask(st.next, nv) !== m0) continue;   // never emit a bad step
      const c = cost(st.next);
      const path = [...cur.path,
        { group: st.group, sel: st.sel, node: st.next, from: cur.node }];
      if (c <= targetCost) return { path, nodes, ok: true };
      const k = key(st.next);
      if ((seen.get(k) ?? Infinity) <= cur.g + 1) continue;
      seen.set(k, cur.g + 1);
      heap.push({ f: cur.g + 1 + c - targetCost, g: cur.g + 1,
                  node: st.next, path });
    }
  }
  return { path: null, nodes, ok: false };
}
