/* The truth table (SPEC.md section 9.1).

   Columns run: one per variable, then one per operator node of the
   selected line in evaluation order, then the output. That mirrors
   circuit04.tex's solution table, which shows the working the course
   asks for. Because chains are n-ary there is no column for a partial
   OR, which is exactly what that table does too.

   Only the output column is clickable; the intermediate columns are
   working, not state. */

import { el, clear } from './dom.js';
import { toText } from './text.js';
import { evalAt, isChain } from './core.js';

/* Operator nodes in evaluation order, root last. */
export function gateNodes(n, out = []) {
  switch (n.k) {
    case 'var': case 'const': break;
    case 'not': gateNodes(n.a, out); out.push(n); break;
    case 'diff': case 'sym':
      gateNodes(n.l, out); gateNodes(n.r, out); out.push(n); break;
    default:
      for (const t of n.ts) gateNodes(t, out);
      out.push(n);
  }
  return out;
}

export function render(host, opts) {
  const { expr, nv, letters, mode, mask, selNode, showWork,
          onToggle, onHoverRow, hoverRow } = opts;
  clear(host);

  const inner = gateNodes(expr).slice(0, -1);
  const cols = showWork ? inner.slice(-6) : [];

  const head = el('tr', {}, [
    ...letters.slice(0, nv).map((L) => el('th', { text: L })),
    ...cols.map((n) => el('th', {
      class: 'sub' + (selNode && n === selNode ? ' selcol' : ''),
      text: toText(n, mode, letters),
    })),
    el('th', { class: selNode === expr ? 'selcol' : '',
               text: toText(expr, mode, letters) }),
  ]);

  const rows = [];
  for (let r = 0; r < (1 << nv); r++) {
    const vals = new Map();
    evalAt(expr, r, nv, vals);
    const on = (mask >> r) & 1;
    const tr = el('tr', {
      class: hoverRow === r ? 'hov' : '',
      onmouseenter: () => onHoverRow?.(r),
    }, [
      ...Array.from({ length: nv }, (_, i) =>
        el('td', { class: 'v', text: String((r >> (nv - 1 - i)) & 1) })),
      ...cols.map((n) => el('td', {
        class: vals.get(n) ? 'one' : '', text: vals.get(n) ? '1' : '0' })),
      el('td', {
        class: 'out' + (on ? ' one' : ''), text: on ? '1' : '0',
        title: 'click to flip this row',
        onclick: () => onToggle?.(r),
      }),
    ]);
    rows.push(tr);
  }

  const table = el('table', { class: 'tt' },
    [el('thead', {}, [head]), el('tbody', {
      onmouseleave: () => onHoverRow?.(null) }, rows)]);
  host.appendChild(table);
}
