/* The truth table (SPEC.md section 9.1).

   Columns run: one per variable, then one per operator node of the
   selected line in evaluation order, then the output. That mirrors
   circuit04.tex's solution table, which shows the working the course
   asks for. Because chains are n-ary there is no column for a partial
   OR, which is exactly what that table does too.

   Only the output column is clickable; the intermediate columns are
   working, not state.

   The table is laid out to a constant total width. Applying a law adds
   and removes working columns, and if the table were free to resize,
   every column -- including A, B, C -- would slide sideways under the
   reader's eye on each step. Instead the variable columns get a fixed
   width and the working columns share a fixed block between them, so
   the whole table keeps its size and the variables keep their place;
   only the working columns get narrower as more of them appear. */

import { el, clear } from './dom.js';
import { toText } from './text.js';
import { evalAt, isChain } from './core.js';

const VAR_W = 42;       // px per variable column
const WORK_BLOCK = 300; // px shared by however many working columns
const OUT_W = 116;      // px for the output column
const MAX_WORK = 6;

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

/* Move the row trace without rebuilding the table. Re-rendering under
   the cursor loses the mouseleave that clears it. */
export function markRow(host, r) {
  const rows = host.querySelectorAll('table.tt tbody tr');
  rows.forEach((tr, i) => tr.classList.toggle('hov', i === r));
}

export function render(host, opts) {
  const { expr, nv, letters, mode, mask, selNode, showWork,
          onToggle, onHoverRow, hoverRow } = opts;
  clear(host);

  const inner = gateNodes(expr).slice(0, -1);
  const cols = showWork ? inner.slice(-MAX_WORK) : [];

  // One <col> per column, so the widths above are what actually happens
  // rather than a suggestion the browser may ignore. The per-column
  // width is floored to a whole pixel and the remainder parked in the
  // spacer: WORK_BLOCK / cols.length is rarely an integer, and letting
  // the browser round five fractional columns moves the table by a
  // pixel or three -- which is the jump this whole scheme exists to
  // prevent. The spacer is always present so the arithmetic is the same
  // whether or not there are working columns to show.
  const workW = cols.length ? Math.floor(WORK_BLOCK / cols.length) : 0;
  const slack = WORK_BLOCK - workW * cols.length;
  const total = nv * VAR_W + WORK_BLOCK + OUT_W;
  const group = el('colgroup', {}, [
    ...Array.from({ length: nv }, () =>
      el('col', { style: `width:${VAR_W}px` })),
    ...cols.map(() => el('col', { style: `width:${workW}px` })),
    el('col', { class: 'spacer', style: `width:${slack}px` }),
    el('col', { style: `width:${OUT_W}px` }),
  ]);

  const label = (n) => toText(n, mode, letters);
  const head = el('tr', {}, [
    ...letters.slice(0, nv).map((L) => el('th', { class: 'var', text: L })),
    ...cols.map((n) => el('th', {
      class: 'sub' + (selNode && n === selNode ? ' selcol' : ''),
      text: label(n), title: label(n),
    })),
    el('th', { class: 'spacer' }),
    el('th', { class: selNode === expr ? 'selcol' : '',
               text: label(expr), title: label(expr) }),
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
      el('td', { class: 'spacer' }),
      el('td', {
        class: 'out' + (on ? ' one' : ''), text: on ? '1' : '0',
        title: 'click to flip this row',
        onclick: () => onToggle?.(r),
      }),
    ]);
    rows.push(tr);
  }

  const table = el('table', { class: 'tt', style: `width:${total}px` }, [
    group,
    el('thead', {}, [head]),
    el('tbody', { onmouseleave: () => onHoverRow?.(null) }, rows),
  ]);
  // The trace has to clear when the pointer leaves the table by any
  // route, including out through the header or the table's own margin.
  const wrap = el('div', { class: 'ttwrap',
    onmouseleave: () => onHoverRow?.(null) }, [table]);
  host.appendChild(wrap);
}
