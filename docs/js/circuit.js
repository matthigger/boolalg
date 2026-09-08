/* The circuit viewer (SPEC.md sections 9.2 and 9.3).

   Gates are 2-input, so an n-ary chain is binarised left-associatively
   at draw time: a 3-term OR becomes two OR gates, the first combining
   terms 1 and 2. That is what circuit04.png draws. The grouping belongs
   to the picture, not to the expression.

   Hovering a truth-table row labels every wire with its 0 or 1, so a
   student can find the gate where their expectation and the circuit
   part company. */

import { svg, clear } from './dom.js';

/* Gap between the variable buses and the first gate column. Wide enough
   that a constant's lead and its T/F label fit without running back
   into the buses. */
const GW = 34, GH = 13, COLW = 62, ROWH = 34, BUS0 = 46, BUSW = 11,
      GAP = 34, CONSTW = 26;

/* ---- graph ---- */

/* Desugars and binarises in one walk rather than calling core.desugar()
   first, so that `sel` -- a set of nodes from the original tree -- can
   be carried down by identity. core.desugar() rebuilds every interior
   node, which would throw that identity away and leave nothing to
   match the selection against. */
function build(expr, sel) {
  const gates = [];
  const push = (type, inputs, node, inSel) =>
    ({ kind: 'gate',
       id: gates.push({ type, inputs, node, sel: inSel,
                        id: gates.length }) - 1 });

  function go(n, inSel) {
    const here = inSel || !!sel?.has(n);
    switch (n.k) {
      case 'var': return { kind: 'var', i: n.i, sel: here };
      case 'const': return { kind: 'const', v: n.v, sel: here };
      case 'not': return push('not', [go(n.a, here)], n, here);
      // A − B is A ∧ ¬B.
      case 'diff': return push('and',
        [go(n.l, here), push('not', [go(n.r, here)], null, here)], n, here);
      // A Δ B is (A ∧ ¬B) ∨ (B ∧ ¬A), so each side is drawn twice.
      case 'sym': {
        const a1 = push('and',
          [go(n.l, here), push('not', [go(n.r, here)], null, here)], null, here);
        const a2 = push('and',
          [go(n.r, here), push('not', [go(n.l, here)], null, here)], null, here);
        return push('or', [a1, a2], n, here);
      }
      default: {
        const rs = n.ts.map((t) => go(t, here));
        let acc = rs[0];
        for (let i = 1; i < rs.length; i++) {
          acc = push(n.k, [acc, rs[i]],
                     i === rs.length - 1 ? n : null, here);
        }
        return acc;
      }
    }
  }
  const out = go(expr, false);
  /* Two things in one id-ordered pass. Gate refs are plain {kind,id}
     objects, so copy the gate's own flag onto them and the drawing code
     can ask any ref whether it is selected. And a gate all of whose
     inputs are selected computes exactly the selection even if the gate
     itself is not in it -- which is what a term-range selection looks
     like once the chain has been binarised. Inputs always have lower
     ids than the gate they feed, so one pass settles it. */
  for (const gt of gates) {
    for (const r of gt.inputs) if (r.kind === 'gate') r.sel = gates[r.id].sel;
    if (!gt.sel && gt.inputs.every((r) => r.sel)) gt.sel = true;
  }
  if (out.kind === 'gate') out.sel = gates[out.id].sel;
  return { gates, out };
}

function layout(g, nv) {
  /* A bare variable or constant has no gates at all: the whole circuit
     is one labelled source and its lead. The box is still a circuit-
     sized one, because the svg is drawn at the pane's full width and a
     box tight around two glyphs would be scaled up until the letter
     dwarfed the same letter in every other circuit. */
  if (!g.gates.length) return { leaves: [], w: 280, h: 100, maxD: 0 };

  const depth = (r) => r.kind !== 'gate' ? 0
    : 1 + Math.max(...g.gates[r.id].inputs.map(depth));
  let slot = 0;
  const leaves = [];
  const place = (r) => {
    if (r.kind !== 'gate') {
      const y = 22 + nv * 16 + slot++ * ROWH;
      leaves.push({ ref: r, y });
      return y;
    }
    const gt = g.gates[r.id];
    const ys = gt.inputs.map(place);
    gt.y = ys.reduce((a, b) => a + b, 0) / ys.length;
    gt.d = depth(r);
    gt.x = BUS0 + BUSW * nv + GAP + (gt.d - 1) * COLW;
    return gt.y;
  };
  place(g.out);
  const maxD = Math.max(1, ...g.gates.map((x) => x.d || 1));
  const w = BUS0 + BUSW * nv + GAP + maxD * COLW + 40;
  /* Height comes from the lowest thing actually drawn, plus half a gate
     body. Deriving it from the row count alone clipped whichever gate
     sat on the bottom row: its body extends GH below its centre line,
     and the viewBox stopped at the centre line. */
  const lowest = Math.max(0, ...leaves.map((l) => l.y),
                          ...g.gates.map((x) => x.y));
  const h = Math.max(90, lowest + GH + 12, 18 + nv * 16 + 26);
  return { leaves, w, h, maxD };
}

/* ---- values ---- */

function values(g, row, nv) {
  const v = new Map();
  const get = (r) => {
    if (r.kind === 'var') return ((row >> (nv - 1 - r.i)) & 1) === 1;
    if (r.kind === 'const') return r.v;
    if (v.has(r.id)) return v.get(r.id);
    const gt = g.gates[r.id];
    const xs = gt.inputs.map(get);
    const out = gt.type === 'not' ? !xs[0]
      : gt.type === 'and' ? xs.every(Boolean) : xs.some(Boolean);
    v.set(r.id, out);
    return out;
  };
  get(g.out);
  return { gateVal: v, refVal: get };
}

/* ---- shapes ---- */

const andPath = (x, y) =>
  `M${x},${y - GH} L${x + GW * 0.45},${y - GH} ` +
  `A${GH},${GH} 0 0 1 ${x + GW * 0.45},${y + GH} L${x},${y + GH} Z`;
const orPath = (x, y) =>
  `M${x},${y - GH} Q${x + GW * 0.55},${y - GH} ${x + GW},${y} ` +
  `Q${x + GW * 0.55},${y + GH} ${x},${y + GH} ` +
  `Q${x + GW * 0.30},${y} ${x},${y - GH} Z`;
const notPath = (x, y) =>
  `M${x},${y - GH} L${x + GW * 0.66},${y} L${x},${y + GH} Z`;

export function render(host, opts) {
  const { expr, nv, letters, row, sel } = opts;
  clear(host);
  const g = build(expr, sel);
  const L = layout(g, nv);
  const vals = row == null ? null : values(g, row, nv);

  const root = svg('svg', { class: 'circuit', viewBox: `0 0 ${L.w} ${L.h}`,
    preserveAspectRatio: 'xMidYMid meet' });

  const outX = (r) => r.kind === 'gate'
    ? g.gates[r.id].x + (g.gates[r.id].type === 'not' ? GW * 0.66 + 8 : GW)
    : null;
  const val = (r) => {
    if (!vals) return null;
    if (r.kind === 'var') return ((row >> (nv - 1 - r.i)) & 1) === 1;
    if (r.kind === 'const') return r.v;
    return vals.gateVal.get(r.id);
  };
  const wcls = (r) => 'wire' + (val(r) === true ? ' on' : '');

  /* The gateless case. The buses below are built from gate inputs, so
     with no gates nothing was drawn on the left, and outX returns null
     for a non-gate, which left a malformed output lead and the bare
     letter Y standing for an expression that is really just A. */
  if (!g.gates.length) {
    const cx = L.w / 2, cy = L.h / 2;
    const on = val(g.out) === true;
    const d = `M${cx - 34},${cy} H${cx + 46}`;
    root.appendChild(svg('text', { class: 'ilabel', x: cx - 46, y: cy + 5 },
      [g.out.kind === 'var' ? (letters[g.out.i] ?? '?')
                            : (g.out.v ? 'T' : 'F')]));
    if (g.out.sel) root.appendChild(svg('path', { class: 'wire-hl', d }));
    root.appendChild(svg('path', { class: wcls(g.out), d }));
    if (vals) {
      root.appendChild(svg('text', { class: 'wval' + (on ? ' on' : ''),
        x: cx - 24, y: cy - 5 }, [on ? '1' : '0']));
    }
    host.appendChild(root);
    return;
  }

  // Variable buses on the left, one column each, with junction dots.
  const busX = (i) => BUS0 + i * BUSW;
  const uses = new Map();
  for (const gt of g.gates) {
    gt.inputs.forEach((r, k) => {
      if (r.kind !== 'var') return;
      const y = gt.type === 'not' ? gt.y : gt.y + (k === 0 ? -7 : 7);
      if (!uses.has(r.i)) uses.set(r.i, []);
      uses.get(r.i).push(y);
    });
  }
  // Each variable gets its own label row, so the buses never overlap.
  const labelY = (i) => 18 + i * 16;
  for (const [i, ys] of uses) {
    const ly = labelY(i);
    const lo = Math.min(...ys, ly), hi = Math.max(...ys, ly);
    const on = vals && ((row >> (nv - 1 - i)) & 1) === 1;
    const c = 'wire' + (on ? ' on' : '');
    root.appendChild(svg('text', { class: 'ilabel', x: 10, y: ly + 4 },
      [letters[i] ?? '?']));
    root.appendChild(svg('line', { class: c, x1: 20, y1: ly,
      x2: busX(i), y2: ly }));
    root.appendChild(svg('line', { class: c, x1: busX(i), y1: lo,
      x2: busX(i), y2: hi }));
    if (vals) {
      root.appendChild(svg('text', { class: 'wval' + (on ? ' on' : ''),
        x: 26, y: ly - 4 }, [on ? '1' : '0']));
    }
    for (const y of ys) {
      root.appendChild(svg('circle', { class: 'wdot', cx: busX(i), cy: y, r: 2.4 }));
    }
  }

  // Wires into each gate.
  for (const gt of g.gates) {
    gt.inputs.forEach((r, k) => {
      const ty = gt.type === 'not' ? gt.y : gt.y + (k === 0 ? -7 : 7);
      // A constant is its own little source just left of the gate. It
      // used to fall through to busX(0), which drew its lead along
      // variable A's bus and read as if A fed the gate.
      const sx = r.kind === 'var' ? busX(r.i)
        : r.kind === 'const' ? gt.x - CONSTW
        : outX(r);
      const sy = r.kind === 'gate' ? g.gates[r.id].y : ty;
      const mx = r.kind === 'gate' ? (sx + gt.x) / 2 : sx;
      const d = r.kind === 'gate'
        ? `M${sx},${sy} H${mx} V${ty} H${gt.x}`
        : `M${sx},${ty} H${gt.x}`;
      if (r.sel) root.appendChild(svg('path', { class: 'wire-hl', d }));
      root.appendChild(svg('path', { class: wcls(r), d }));
      if (r.kind === 'const') {
        root.appendChild(svg('text', {
          class: 'ilabel', 'text-anchor': 'end', x: sx - 5, y: ty + 4.5 },
          [r.v ? 'T' : 'F']));
      }
    });
  }

  // Gates, then their output stubs and value labels.
  for (const gt of g.gates) {
    const p = gt.type === 'and' ? andPath(gt.x, gt.y)
      : gt.type === 'or' ? orPath(gt.x, gt.y) : notPath(gt.x, gt.y);
    const gcls = 'gate' + (gt.sel ? ' sel' : '');
    root.appendChild(svg('path', { class: gcls, d: p }));
    if (gt.type === 'not') {
      root.appendChild(svg('circle', { class: gcls,
        cx: gt.x + GW * 0.66 + 4, cy: gt.y, r: 4 }));
    }
    if (vals) {
      const on = gt.id === g.out.id ? null : vals.gateVal.get(gt.id);
      const v = vals.gateVal.get(gt.id);
      root.appendChild(svg('text', {
        class: 'wval' + (v ? ' on' : ''),
        x: outX({ kind: 'gate', id: gt.id }) + 5, y: gt.y - 5 },
        [v ? '1' : '0']));
    }
  }

  // The output lead.
  const ox = outX(g.out), oy = g.gates[g.out.id]?.y ?? 26;
  const outD = `M${ox},${oy} H${ox + 26}`;
  if (g.out.sel) root.appendChild(svg('path', { class: 'wire-hl', d: outD }));
  root.appendChild(svg('path', { class: wcls(g.out), d: outD }));
  root.appendChild(svg('text', { class: 'ilabel', x: ox + 30, y: oy + 5 },
    ['Y']));

  host.appendChild(root);
}
