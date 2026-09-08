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
   the table itself to a constant width instead would leave a hole in
   the middle of it once the last working column went away.

   That width is the seed line's own table, measured. A fixed per-column
   allowance has to be wide enough for the widest table it will ever
   hold, and one that suits three variables leaves a four-variable table
   hanging off the wrapper's right while the wrapper stays centred for a
   narrower one -- dead space on the left, clipping on the right. The
   seed holds for the life of a derivation (a new expression starts a
   new one), so measuring it pins the wrapper for exactly as long as the
   variable columns have to stay put. */

import { el, clear } from './dom.js';
import { toText } from './text.js';
import { evalAt, isChain, key } from './core.js';

const VAR_W = 42;       // px per variable column
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

/* The working columns drawn for an expression, innermost first. */
function working(expr, showWork) {
  if (!showWork) return [];
  return gateNodes(expr).slice(0, -1).slice(-MAX_WORK);
}

/* One col per column, so the variable width above is what actually
   happens rather than a suggestion the browser may ignore. Only the
   variable columns are pinned: a working column is sized by the
   expression in its head, because dividing a fixed block between
   however many there are wrapped those heads over two and three
   lines -- and a header is the one thing in the column that has to be
   read. */
function colGroup(nv, ncols) {
  return el('colgroup', {}, [
    ...Array.from({ length: nv }, () =>
      el('col', { style: `width:${VAR_W}px` })),
    ...Array.from({ length: ncols + 1 }, () => el('col')),
  ]);
}

/* The header row: one cell per variable, per working column, then the
   expression itself. sel marks the selected column, if any. */
function headRow(expr, cols, nv, letters, mode, sel = () => '') {
  const label = (n) => toText(n, mode, letters);
  return el('tr', {}, [
    ...letters.slice(0, nv).map((L, i) =>
      el('th', { class: 'var' + sel(i), text: L })),
    ...cols.map((n, i) => el('th', {
      class: 'sub' + sel(nv + i), text: label(n), title: label(n),
    })),
    el('th', { class: sel(nv + cols.length).trim(),
               text: label(expr), title: label(expr) }),
  ]);
}

/* Width of the table that head and group describe, unconstrained.
   Two rows are enough to measure: every column is as wide as the wider
   of its header and a one-character value. Off-screen rather than
   hidden, since a display:none table has no width to read. */
function naturalWidth(head, group, ncol) {
  const row = el('tr', {}, [
    ...Array.from({ length: ncol - 1 }, () => el('td', { text: '0' })),
    el('td', { class: 'out', text: '0' }),
  ]);
  const table = el('table', { class: 'tt' }, [
    group, el('thead', {}, [head]), el('tbody', {}, [row]),
  ]);
  const probe = el('div', { class: 'ttprobe' }, [table]);
  document.body.appendChild(probe);
  const w = table.getBoundingClientRect().width;
  probe.remove();
  return Math.ceil(w);
}

/* Move the row trace without rebuilding the table. Re-rendering under
   the cursor loses the mouseleave that clears it. */
export function markRow(host, r) {
  const rows = host.querySelectorAll('table.tt tbody tr');
  rows.forEach((tr, i) => tr.classList.toggle('hov', i === r));
}

export function render(host, opts) {
  const { expr, nv, letters, mode, mask, selNode, showWork, workCols,
          pinExpr, compact, onToggle, onHoverRow, hoverRow } = opts;
  clear(host);

  const cols = workCols ?? working(expr, showWork);
  const group = compact ? null : colGroup(nv, cols.length);

  // The seed line, not this one: the wrapper has to hold still while the
  // derivation runs, and the table it holds may outgrow it to the right
  // as a law expands the expression. Its left edge, which is what the
  // reader is tracking, does not move.
  const pin = pinExpr ?? expr;
  const pinCols = working(pin, showWork);
  const wrapW = compact ? 0
    : naturalWidth(headRow(pin, pinCols, nv, letters, mode),
                   colGroup(nv, pinCols.length), nv + pinCols.length + 1);

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

  const head = headRow(expr, cols, nv, letters, mode, sel);

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
