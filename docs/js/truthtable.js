/* The truth table (SPEC.md section 9.1).

   Columns run: one per variable, then one per operator node of the
   selected line in evaluation order, then the output. That mirrors
   circuit04.tex's solution table, which shows the working the course
   asks for. Because chains are n-ary there is no column for a partial
   OR, which is exactly what that table does too.

   Only the output column is clickable; the intermediate columns are
   working, not state.

   Applying a law adds and removes working columns, and if the table
   were free to resize and centre itself, every column -- including
   A, B, C -- would slide sideways under the reader's eye on each step.

   So the wrapper is a constant width and is what gets centred, and
   the table is left-aligned inside it. The variable columns therefore
   start at the same x for the life of a derivation, while the table's
   right edge is free to come in as the expression simplifies. Holding
   the table itself to a constant width instead would leave a 288px
   hole in the middle of it once the last working column went away. */

import { el, clear } from './dom.js';
import { toText } from './text.js';
import { evalAt, isChain, key } from './core.js';

const VAR_W = 42;       // px per variable column
const WORK_BLOCK = 288; // px the wrapper reserves for working columns
const OUT_W = 156;      // px the wrapper reserves for the output column
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
  const { expr, nv, letters, mode, mask, selNode, showWork, workCols,
          compact, onToggle, onHoverRow, hoverRow } = opts;
  clear(host);

  const inner = gateNodes(expr).slice(0, -1);
  const cols = workCols ?? (showWork ? inner.slice(-MAX_WORK) : []);

  // One <col> per column, so the widths above are what actually happens
  // rather than a suggestion the browser may ignore. Per-column width is
  // floored to a whole pixel: WORK_BLOCK / cols.length is rarely an
  // integer, and letting the browser round five fractional columns moved
  // the table by a pixel or three -- exactly the drift this is here to
  // stop.
  const wrapW = nv * VAR_W + WORK_BLOCK + OUT_W;
  // Only the variable columns are pinned. A working column is sized by
  // the expression in its head, because dividing a fixed block between
  // however many there are wrapped those heads over two and three
  // lines -- and a header is the one thing in the column that has to be
  // read. The table may now outgrow the wrapper to the right; its left
  // edge, which is what the reader is tracking, does not move.
  const group = compact ? null : el('colgroup', {}, [
    ...Array.from({ length: nv }, () =>
      el('col', { style: `width:${VAR_W}px` })),
    ...cols.map(() => el('col')),
    el('col'),
  ]);

  const label = (n) => toText(n, mode, letters);

  /* Which column the selection lands in, by value rather than by node
     identity: a clicked A is a different object from the A the header
     was built from, and picking a column that is already drawn is the
     whole point of asking. -1 when the selection has no column. */
  const selCol = (() => {
    if (!selNode) return -1;
    if (selNode.k === 'var') return selNode.i < nv ? selNode.i : -1;
    const k = key(selNode);
    const i = cols.findIndex((c) => key(c) === k);
    if (i >= 0) return nv + i;
    return key(expr) === k ? nv + cols.length : -1;
  })();
  const sel = (i) => (i === selCol ? ' selcol' : '');

  const head = el('tr', {}, [
    ...letters.slice(0, nv).map((L, i) =>
      el('th', { class: 'var' + sel(i), text: L })),
    ...cols.map((n, i) => el('th', {
      class: 'sub' + sel(nv + i), text: label(n), title: label(n),
    })),
    el('th', { class: sel(nv + cols.length).trim(),
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
        el('td', { class: 'v' + sel(i),
                   text: String((r >> (nv - 1 - i)) & 1) })),
      ...cols.map((n, i) => el('td', {
        class: (vals.get(n) ? 'one' : '') + sel(nv + i),
        text: vals.get(n) ? '1' : '0' })),
      el('td', {
        class: 'out' + (on ? ' one' : '') + sel(nv + cols.length),
        text: on ? '1' : '0',
        title: 'click to flip this row',
        onclick: () => onToggle?.(r),
      }),
    ]);
    rows.push(tr);
  }

  const table = el('table', {
    class: 'tt' + (compact ? ' compact' : ''),
  }, [
    group,
    el('thead', {}, [head]),
    el('tbody', { onmouseleave: () => onHoverRow?.(null) }, rows),
  ]);
  // The trace has to clear when the pointer leaves the table by any
  // route, including out through the header or the table's own margin.
  // The wrapper keeps its constant width and stays centred: that is
  // what holds the table's left edge, and so the variable columns,
  // still as the working columns come and go. The table inside is free
  // to run past its right edge.
  const wrap = el('div', { class: 'ttwrap',
    style: compact ? null : `width:${wrapW}px`,
    onmouseleave: () => onHoverRow?.(null) }, [table]);
  host.appendChild(wrap);
}
