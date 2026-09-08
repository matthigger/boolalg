/* The Venn viewer (SPEC.md section 8).

   Regions are rendered by nesting clip paths -- for each variable a
   region is clipped either to that circle or to its complement -- which
   gives 2^n independently fillable areas without any path arithmetic.
   Hit testing does not use those shapes at all: a click is resolved by
   testing the point against each circle, which is exact and immune to
   the quirks of pointer events through clip paths.

   Region 0 is outside every circle. It is a real, shadeable region, not
   background: A^C and B^C need it. */

import { svg, clear } from './dom.js';

export function geometry(nv) {
  /* One variable is one circle, centred. Padding the diagram out to two
     would put a second circle on the page for a set the expression never
     mentioned, labelled with a letter that was never declared. */
  if (nv <= 1) {
    return { w: 260, h: 250,
      circles: [{ cx: 130, cy: 122, r: 74 }],
      labels: [{ x: 72, y: 56 }] };
  }
  if (nv === 2) {
    return { w: 260, h: 250,
      circles: [{ cx: 98, cy: 122, r: 66 }, { cx: 162, cy: 122, r: 66 }],
      labels: [{ x: 46, y: 60 }, { x: 214, y: 60 }] };
  }
  const cx = 130, cy = 116, d = 52, r = 68;
  return { w: 260, h: 250, circles: [
      { cx: cx - d * 0.866, cy: cy - d * 0.5, r },
      { cx: cx + d * 0.866, cy: cy - d * 0.5, r },
      { cx, cy: cy + d, r }],
    labels: [{ x: 26, y: 48 }, { x: 228, y: 48 }, { x: 130, y: 246 }] };
}

/* Which region a point falls in: variable i contributes bit
   (nv-1-i), matching the case indexing of SPEC.md section 2.1. */
export function regionAt(g, nv, x, y) {
  let r = 0;
  for (let i = 0; i < nv; i++) {
    const c = g.circles[i];
    if ((x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r * c.r) r |= 1 << (nv - 1 - i);
  }
  return r;
}

const circlePath = (c) =>
  `M ${c.cx - c.r},${c.cy} a ${c.r},${c.r} 0 1,0 ${2 * c.r},0 ` +
  `a ${c.r},${c.r} 0 1,0 ${-2 * c.r},0 Z`;

export function render(host, opts) {
  const { nv, on, sel, letters, mode, onToggle, onHover,
          idp = 'v' } = opts;
  const g = geometry(nv);
  clear(host);

  const defs = svg('defs');
  for (let i = 0; i < nv; i++) {
    const c = g.circles[i];
    defs.appendChild(svg('clipPath', { id: `${idp}in${i}` },
      [svg('path', { d: circlePath(c) })]));
    // The complement: the frame with the circle punched out.
    defs.appendChild(svg('clipPath', { id: `${idp}out${i}`,
      'clip-rule': 'evenodd' },
      [svg('path', { 'clip-rule': 'evenodd',
        d: `M0,0 H${g.w} V${g.h} H0 Z ` + circlePath(c) })]));
  }

  const root = svg('svg', {
    class: 'venn', viewBox: `0 0 ${g.w} ${g.h}`,
    preserveAspectRatio: 'xMidYMid meet', role: 'img',
  }, [defs]);

  root.appendChild(svg('rect', { class: 'vframe', x: 0.5, y: 0.5,
    width: g.w - 1, height: g.h - 1, rx: 4 }));

  for (let r = 0; r < (1 << nv); r++) {
    let node = svg('rect', {
      class: 'vregion' + (((on >> r) & 1) ? ' on' : '') +
             (sel != null && ((sel >> r) & 1) ? ' sel' : ''),
      x: 0, y: 0, width: g.w, height: g.h,
      'data-r': r, 'pointer-events': 'none',
    });
    for (let i = nv - 1; i >= 0; i--) {
      const inside = (r >> (nv - 1 - i)) & 1;
      node = svg('g', {
        'clip-path': `url(#${idp}${inside ? 'in' : 'out'}${i})` }, [node]);
    }
    root.appendChild(node);
  }

  for (let i = 0; i < nv; i++) {
    root.appendChild(svg('path', { class: 'vcircle', d: circlePath(g.circles[i]) }));
    root.appendChild(svg('text', { class: 'vlabel', x: g.labels[i].x,
      y: g.labels[i].y, 'text-anchor': 'middle' }, [letters[i] ?? '?']));
  }

  const pt = (ev) => {
    const b = root.getBoundingClientRect();
    return [(ev.clientX - b.left) * g.w / b.width,
            (ev.clientY - b.top) * g.h / b.height];
  };
  root.addEventListener('click', (ev) => {
    const [x, y] = pt(ev);
    onToggle?.(regionAt(g, nv, x, y));
  });
  root.addEventListener('mousemove', (ev) => {
    const [x, y] = pt(ev);
    const r = regionAt(g, nv, x, y);
    for (const n of root.querySelectorAll('.vregion')) {
      n.classList.toggle('hov', +n.dataset.r === r);
    }
    onHover?.(r);
  });
  root.addEventListener('mouseleave', () => {
    for (const n of root.querySelectorAll('.vregion')) n.classList.remove('hov');
    onHover?.(null);
  });

  host.appendChild(root);
  return g;
}

/* The minterm naming a region, e.g. "A ∩ B^C ∩ C". */
export function regionName(r, nv, letters, mode) {
  const g = mode === 'sets' ? { and: ' ∩ ', c: 'ᶜ', pre: '' }
                            : { and: ' ∧ ', c: '', pre: '¬' };
  const parts = [];
  for (let i = 0; i < nv; i++) {
    const inside = (r >> (nv - 1 - i)) & 1;
    const L = letters[i] ?? '?';
    parts.push(inside ? L : (g.pre ? g.pre + L : L + g.c));
  }
  return parts.join(g.and);
}
