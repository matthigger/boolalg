/* The application: state, the expression pane, the algebra rail, and
   the wiring between them. See SPEC.md sections 3 to 10. */

import { el, svg, clear } from './dom.js';
import { vr, cn, nt, ch, eq, key, mask, cost, isChain, at, focus,
         replaceSel, selections, desugar } from './core.js';
import { parse, toText, GLYPH, PRESETS, needsParens, PErr } from './text.js';
import { rewritesOf, searchRewrites, label, GROUPS } from './rules.js';
import { target, derive, minTable } from './minimize.js';
import * as Venn from './venn.js';
import * as TT from './truthtable.js';
import * as Circuit from './circuit.js';
import * as Ex from './export.js';
import { CATALOGUE, LEVELS, BLURB, makeOne } from './examples.js';

/* ---- state -------------------------------------------------------- */

const S = {
  // The coloured boxes marking what each step changed.
  annotate: true,
  mode: 'sets',
  nv: 3,
  letters: PRESETS.ABC,
  lines: [],            // {expr, rule, sel}
  sel: null,            // selection within selectedLine
  selectedLine: 0,
  hoverRow: null,
  hint: 0,              // 0 none, 1 expression, 2 also the rule
  showWork: true,
  note: '',
};

const cur = () => S.lines[S.selectedLine]?.expr ?? null;
const lastExpr = () => S.lines.at(-1)?.expr ?? null;
const curMask = () => (cur() ? mask(cur(), S.nv) : 0);

/* Three views, two notations. `mode` picks what the viewer draws; the
   glyphs an expression is written in follow from it, and logic and
   circuit share the logic ones. Everything that renders text asks for
   `notn()`, never `S.mode`, so adding a fourth view cannot silently
   change how expressions read. */
const NOTATION = { sets: 'sets', logic: 'logic', circuit: 'logic' };
const notn = (m = S.mode) => NOTATION[m] ?? 'logic';
const MODES = ['sets', 'logic', 'circuit'];
/* Four sets would need four ellipses, so the Venn caps out at three. */
const maxVars = (m = S.mode) => (m === 'sets' ? 3 : 4);

function setExpr(expr, letters) {
  if (letters) S.letters = letters;
  S.lines = [{ expr, rule: null, sel: null }];
  S.selectedLine = 0;
  S.sel = null;
  S.hint = 0;
  S.note = '';
}

/* Synthesise an expression for a mask (SPEC.md section 8.2), using the
   stage 1 witness so clicking gives back a tidy expression rather than
   a full sum of minterms. */
function minimalFor(m) {
  const e = minTable(S.nv).get(m);
  return e ? e.node : cn(false);
}

/* ---- expression rendering ----------------------------------------- */

const txt = (s) => document.createTextNode(s);

function nodeDom(n, path, parentKind, letters = S.letters) {
  const g = GLYPH[notn()];
  const sp = el('span', { class: 'nd', data: { path: JSON.stringify(path) } });
  const paren = needsParens(n, parentKind);
  if (paren) sp.appendChild(txt('('));
  switch (n.k) {
    case 'var': sp.appendChild(txt(letters[n.i] ?? '?')); break;
    case 'const': sp.appendChild(txt(n.v ? g.T : g.F)); break;
    case 'not': {
      const inner = n.a;
      const simple = ['var', 'const', 'not'].includes(inner.k);
      const body = () => {
        if (!simple) sp.appendChild(txt('('));
        sp.appendChild(nodeDom(inner, [...path, 'a'], null, letters));
        if (!simple) sp.appendChild(txt(')'));
      };
      if (g.notPre) { sp.appendChild(txt(g.notPre)); body(); }
      else { body(); sp.appendChild(el('sup', { text: 'C' })); }
      break;
    }
    case 'diff': case 'sym': {
      sp.appendChild(nodeDom(n.l, [...path, 'l'], n.k, letters));
      sp.appendChild(txt(` ${n.k === 'diff' ? g.diff : g.sym} `));
      sp.appendChild(nodeDom(n.r, [...path, 'r'], n.k, letters));
      break;
    }
    default:
      n.ts.forEach((t, i) => {
        if (i) sp.appendChild(txt(` ${g[n.k]} `));
        sp.appendChild(nodeDom(t, [...path, i], n.k, letters));
      });
  }
  if (paren) sp.appendChild(txt(')'));
  return sp;
}

/* Snap two clicked paths to a selectable unit: the same subtree, a run
   of one chain's terms, or the smallest subtree covering both. Nothing
   else is representable, so a drag can never yield a non-expression. */
function unify(root, p1, p2) {
  let i = 0;
  while (i < p1.length && i < p2.length && p1[i] === p2[i]) i++;
  const prefix = p1.slice(0, i);
  if (i < p1.length && i < p2.length) {
    const parent = at(root, prefix);
    if (isChain(parent) && typeof p1[i] === 'number' &&
        typeof p2[i] === 'number' && p1[i] !== p2[i]) {
      const a = Math.min(p1[i], p2[i]), b = Math.max(p1[i], p2[i]);
      if (a === 0 && b === parent.ts.length - 1) {
        return { path: prefix, from: null, to: null };
      }
      return { path: prefix, from: a, to: b + 1 };
    }
  }
  return { path: prefix, from: null, to: null };
}

/* The spans a selection covers: one subtree, or one per term of a run. */
const spanPaths = (sel) => (sel.from == null ? [sel.path]
  : Array.from({ length: sel.to - sel.from },
               (_, k) => [...sel.path, sel.from + k]));

const nodeAtPath = (host, p) => {
  const q = JSON.stringify(p);
  return [...host.querySelectorAll('.nd')].find((n) => n.dataset.path === q);
};

function markSel(host, expr, sel, cls = 'sel') {
  for (const n of host.querySelectorAll('.nd')) n.classList.remove(cls);
  if (!sel) return;
  for (const p of spanPaths(sel)) nodeAtPath(host, p)?.classList.add(cls);
}

/* Like markSel but additive, and it can carry a colour in. One line
   holds both the result of its own step and the input to the next, so
   clearing first would rub out whichever was painted earlier. */
function paintSpan(host, sel, cls, vars) {
  if (!sel) return;
  for (const p of spanPaths(sel)) {
    const node = nodeAtPath(host, p);
    if (!node) continue;
    node.classList.add(cls);
    for (const [k, v] of Object.entries(vars)) node.style.setProperty(k, v);
  }
}

/* The narrowest pair of selections covering what changed between two
   consecutive lines -- where the rule was applied, and what it left
   behind. Read off the trees rather than recorded at apply time,
   because ch() flattens and collapses as it rebuilds, so where a
   replacement actually lands is not something the caller can predict.

   Walks both trees together while they read the same; at a chain it
   strips the terms that match at each end, so rewriting one term of a
   sum is reported as that term and not as the whole sum. */
function changeSpan(a, b, path = []) {
  const whole = { before: { path, from: null, to: null },
                  after: { path, from: null, to: null } };
  if (key(a) === key(b)) return null;
  if (a.k !== b.k) return whole;
  switch (a.k) {
    case 'var': case 'const': return whole;
    case 'not': return changeSpan(a.a, b.a, [...path, 'a']) ?? whole;
    case 'diff': case 'sym': {
      const l = key(a.l) !== key(b.l), r = key(a.r) !== key(b.r);
      if (l && !r) return changeSpan(a.l, b.l, [...path, 'l']) ?? whole;
      if (r && !l) return changeSpan(a.r, b.r, [...path, 'r']) ?? whole;
      return whole;
    }
    default: {
      let i = 0;
      while (i < a.ts.length && i < b.ts.length &&
             key(a.ts[i]) === key(b.ts[i])) i++;
      let j = 0;
      while (j < a.ts.length - i && j < b.ts.length - i &&
             key(a.ts[a.ts.length - 1 - j]) ===
             key(b.ts[b.ts.length - 1 - j])) j++;
      const an = a.ts.length - i - j, bn = b.ts.length - i - j;
      // A term vanished with nothing in its place, so there is no
      // meaningful span on one side; fall back to the enclosing chain.
      if (!an || !bn) return whole;
      if (an === 1 && bn === 1) {
        return changeSpan(a.ts[i], b.ts[i], [...path, i]) ?? whole;
      }
      const run = (n, len) => (i === 0 && n === len
        ? { path, from: null, to: null } : { path, from: i, to: i + n });
      return { before: run(an, a.ts.length), after: run(bn, b.ts.length) };
    }
  }
}

/* One colour per step, cycled. See the --step-N block in style.css. */
const STEP_COLOURS = 7;
const stepVars = (i) => ({
  '--step': `var(--step-${i})`,
  '--step-soft': `var(--step-${i}-soft)`,
});

/* Drop the last step. Only the last one is offered: removing a line
   from the middle would leave every line below it claiming a rule that
   no longer connects it to the line above. */
function undoLast() {
  if (S.lines.length < 2) return;
  S.lines.pop();
  S.selectedLine = Math.min(S.selectedLine, S.lines.length - 1);
  S.sel = null;
  S.hint = 0;
  S.note = '';
  render();
}

function renderLines() {
  const host = document.getElementById('lines');
  clear(host);
  const boxes = [];
  S.lines.forEach((ln, i) => {
    const exprBox = el('span', { class: 'expr' }, [nodeDom(ln.expr, [], null)]);
    const step = S.annotate && i && ln.rule
      ? stepVars(((i - 1) % STEP_COLOURS) + 1) : null;
    const ruleTag = ln.rule
      ? el('span', { class: 'rule' + (step ? ' step' : ''),
                     text: label(ln.rule) })
      : null;
    if (step) {
      for (const [k, v] of Object.entries(step)) ruleTag.style.setProperty(k, v);
    }
    const undo = i && i === S.lines.length - 1 && ln.rule
      ? el('button', { class: 'undo', text: '\u00d7', type: 'button',
          title: `undo ${label(ln.rule)}`,
          onmousedown: (e) => e.stopPropagation(),
          onclick: (e) => { e.stopPropagation(); undoLast(); } })
      : null;
    const row = el('div', {
      class: 'dline' + (i === S.selectedLine ? ' active' : ''),
      onmousedown: () => { if (i !== S.selectedLine) {
        S.selectedLine = i; S.sel = null; render(); } },
    }, [
      el('span', { class: 'eqs', text: i ? '=' : '' }),
      exprBox,
      ruleTag,
      undo,
    ]);
    host.appendChild(row);
    boxes.push(exprBox);
    if (i === S.selectedLine) {
      wireSelection(exprBox, ln.expr);
      // Every render rebuilds these spans, so the live selection has to
      // be repainted here -- the drag handlers only ever marked the DOM
      // they were dragged over, which the render then threw away.
      markSel(exprBox, ln.expr, S.sel, 'sel');
    }
  });

  /* Second pass, because a step paints the line above as well as its
     own, and that line is only built once the loop above has run. */
  if (!S.annotate) return;
  S.lines.forEach((ln, i) => {
    if (!i || !ln.rule) return;
    const d = changeSpan(S.lines[i - 1].expr, ln.expr);
    if (!d) return;
    const vars = stepVars(((i - 1) % STEP_COLOURS) + 1);
    paintSpan(boxes[i], d.after, 'after', vars);
    paintSpan(boxes[i - 1], d.before, 'before', vars);
  });
}

function wireSelection(host, expr) {
  let anchor = null, last = null;
  const pathAt = (t) => {
    const n = t && t.closest ? t.closest('.nd') : null;
    return n ? JSON.parse(n.dataset.path) : null;
  };
  function finish(ev) {
    if (!anchor) return;
    // Released off the expression: fall back to the last term the drag
    // was actually over, so overshooting does not shrink the selection.
    S.sel = unify(expr, anchor, pathAt(ev.target) || last || anchor);
    anchor = null;
    S.hint = 0;
    render();
  }
  host.addEventListener('mousedown', (ev) => {
    anchor = pathAt(ev.target);
    last = anchor;
    if (!anchor) return;
    ev.preventDefault();
    // The release often lands outside the expression, so catch it on the
    // window rather than losing the drag.
    window.addEventListener('mouseup', finish, { once: true });
  });
  host.addEventListener('mousemove', (ev) => {
    const p = pathAt(ev.target);
    if (!anchor) {
      markSel(host, expr, p ? { path: p, from: null, to: null } : null, 'hov');
      return;
    }
    if (!p) return;
    last = p;
    markSel(host, expr, unify(expr, anchor, p), 'sel');
  });
  host.addEventListener('mouseleave', () => markSel(host, expr, null, 'hov'));
}

/* ---- exports (SPEC.md section 16) --------------------------------- */

/* What renderLines paints, as data: for each line, the parts a step
   marked and the colour it used. The exporters draw their own text, so
   they need the paths rather than the DOM spans carrying them. */
function stepMarks() {
  const marks = S.lines.map(() => []);
  if (!S.annotate) return marks;
  S.lines.forEach((ln, i) => {
    if (!i || !ln.rule) return;
    const d = changeSpan(S.lines[i - 1].expr, ln.expr);
    if (!d) return;
    const step = ((i - 1) % STEP_COLOURS) + 1;
    if (d.after) marks[i].push({ paths: spanPaths(d.after), step });
    if (d.before) marks[i - 1].push({ paths: spanPaths(d.before), step });
  });
  return marks;
}

/* Named after the expression, so a folder of these still says which is
   which once they are out of the tool. */
const exportBase = () => Ex.slug(cur() ? toText(cur(), notn(), S.letters)
                                       : 'expression');

function exportBar(items) {
  return el('span', { class: 'exports' }, items.map(([name, fn]) =>
    el('button', {
      class: 'exp', text: name, type: 'button',
      title: `download as ${name}`,
      onclick: async () => {
        try { await fn(); } catch (e) { toast(`export failed: ${e.message}`); }
      },
    })));
}

const tableData = () => Ex.tableData({
  expr: cur(), nv: S.nv, letters: S.letters, mode: notn(),
  mask: curMask(), showWork: S.showWork });

function tableExports() {
  return exportBar([
    ['png', () => Ex.canvasPNG(Ex.tablePNG(tableData()),
                               `${exportBase()}-table.png`)],
    ['csv', () => Ex.save(`${exportBase()}-table.csv`,
                          Ex.tableCSV(tableData()), 'text/csv')],
    ['tex', () => Ex.save(`${exportBase()}-table.tex`,
                          Ex.tableTeX(tableData(),
                            `Truth table for ${toText(cur(), notn(), S.letters)}`),
                          'application/x-tex')],
  ]);
}

function vennExports() {
  return exportBar([
    ['png', async () => {
      const g = document.querySelector('#viewer svg.venn');
      if (!g) throw new Error('nothing drawn yet');
      Ex.canvasPNG(await Ex.svgPNG(g), `${exportBase()}-venn.png`);
    }],
  ]);
}

function circuitExports() {
  return exportBar([
    ['png', async () => {
      const g = circuitBody?.querySelector('svg.circuit');
      if (!g) throw new Error('nothing drawn yet');
      Ex.canvasPNG(await Ex.svgPNG(g), `${exportBase()}-circuit.png`);
    }],
  ]);
}

function renderExprBar() {
  const host = document.getElementById('exprExport');
  if (!host) return;
  clear(host);
  if (!cur()) return;
  // Nothing has been derived yet, so there are no steps to mark.

  const seg = el('span', { class: 'seg', id: 'markToggle' },
    [true, false].map((on) => el('button', {
      text: on ? 'on' : 'off', type: 'button',
      'aria-selected': String(S.annotate === on),
      onclick: () => { S.annotate = on; render(); },
    })));
  host.appendChild(el('span', { class: 'marks' }, [
    el('span', { class: 'mlbl', text: 'step marks',
      title: 'the coloured boxes showing what each step changed' }),
    seg,
  ]));
  host.appendChild(exportBar([
    ['png', () => Ex.canvasPNG(
       Ex.derivationPNG(S.lines, notn(), S.letters, stepMarks()),
       `${exportBase()}.png`)],
    ['tex', () => Ex.save(`${exportBase()}.tex`,
       Ex.derivationTeX(S.lines, notn(), S.letters, stepMarks()),
       'application/x-tex')],
  ]));
}

/* ---- viewer ------------------------------------------------------- */

/* Hovering a truth-table row retraces the circuit, and that must not go
   through render(). Rebuilding the table under the cursor destroys the
   element the pointer is sitting in, so the mouseleave that clears the
   trace never arrives and the circuit stays stuck on the last row. Hold
   handles to the live panes instead and repaint only what changed. */
let ttHost = null, circuitBody = null, circuitHead = null, circuitCap = null;
let circuitTitle = null;

function setHoverRow(r) {
  if (S.hoverRow === r) return;
  S.hoverRow = r;
  if (ttHost) TT.markRow(ttHost, r);
  drawCircuit();
}

/* The nodes a selection covers, for the circuit to recognise as it
   walks the same tree. Identity, not paths: the circuit binarises and
   desugars as it goes, so paths would not survive the trip. */
function selNodes(expr, sel) {
  if (!expr || !sel) return null;
  const parent = at(expr, sel.path);
  const roots = sel.from == null ? [parent] : parent.ts.slice(sel.from, sel.to);
  const out = new Set();
  const walk = (n) => {
    out.add(n);
    if (n.k === 'not') walk(n.a);
    else if (n.k === 'diff' || n.k === 'sym') { walk(n.l); walk(n.r); }
    else if (n.ts) n.ts.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

function drawCircuit() {
  if (!circuitBody) return;
  const row = S.hoverRow;
  clear(circuitBody);
  Circuit.render(circuitBody,
    { expr: cur(), nv: S.nv, letters: S.letters, row,
      sel: selNodes(cur(), S.sel) });
  circuitTitle.textContent = 'Circuit' + (row == null ? ''
    : ` — row ${row.toString(2).padStart(S.nv, '0')}`);
  circuitCap.textContent = row == null
    ? 'hover a truth-table row to trace the wires'
    : 'values shown on every wire';
}

function renderViewer() {
  const host = document.getElementById('viewer');
  clear(host);
  ttHost = circuitBody = circuitHead = circuitCap = null;
  const expr = cur();
  // A row index outlives the table it came from when nv shrinks.
  if (S.hoverRow != null && S.hoverRow >= (1 << S.nv)) S.hoverRow = null;
  if (!expr) return renderEmptyHint(host);
  const m = curMask();
  const selNode = S.sel ? focus(expr, S.sel) : null;
  const selMask = selNode ? mask(selNode, S.nv) : null;

  if (S.mode === 'sets') {
    const pane = el('div', { class: 'pane' });
    pane.appendChild(el('h2', {},
      [el('span', { text: 'Venn diagram' }), vennExports()]));
    const body = el('div', { class: 'panebody' });
    const cap = el('div', { class: 'caption' });
    const idle = () => (selMask != null
      ? 'green fill: the selection · blue: the whole line'
      : 'click a region to shade it');
    Venn.render(body, {
      nv: S.nv, on: m, sel: selMask, letters: S.letters, mode: notn(),
      onToggle: (r) => toggleRegion(r),
      onHover: (r) => {
        cap.textContent = r == null ? idle()
          : Venn.regionName(r, S.nv, S.letters, notn());
      },
    });
    cap.textContent = idle();
    pane.appendChild(body);
    pane.appendChild(cap);
    host.appendChild(pane);
    return;
  }

  /* Logic shows the table alone; circuit shows the table and the
     circuit it drives, side by side. */
  const p1 = el('div', { class: 'pane tt-pane' },
    [el('h2', {}, [el('span', { text: 'Truth table' }), tableExports()])]);
  const b1 = el('div', { class: 'panebody' });
  ttHost = b1;
  TT.render(b1, {
    expr, nv: S.nv, letters: S.letters, mode: notn(), mask: m,
    pinExpr: S.lines[0].expr,
    selNode, showWork: S.showWork, hoverRow: S.hoverRow,
    onToggle: (r) => toggleRegion(r),
    onHoverRow: setHoverRow,
  });
  p1.appendChild(b1);
  p1.appendChild(el('div', { class: 'caption',
    text: 'click a value in the last column to flip that row' }));
  host.appendChild(p1);

  if (S.mode !== 'circuit') return;

  circuitTitle = el('span', {});
  circuitHead = el('h2', {}, [circuitTitle, circuitExports()]);
  circuitCap = el('div', { class: 'caption' });
  circuitBody = el('div', { class: 'panebody' });
  const p2 = el('div', { class: 'pane' }, [circuitHead, circuitBody, circuitCap]);
  host.appendChild(p2);
  drawCircuit();
}

function renderEmptyHint(host) {
  const pane = el('div', { class: 'pane' });
  pane.appendChild(el('h2', { text: S.mode === 'sets' ? 'Venn diagram'
                                                      : 'Truth table' }));
  const body = el('div', { class: 'panebody' });
  if (S.mode === 'sets') {
    Venn.render(body, { nv: S.nv, on: 0, sel: null, letters: S.letters,
      mode: notn(), onToggle: (r) => toggleRegion(r) });
  } else {
    TT.render(body, { expr: cn(false), nv: S.nv, letters: S.letters,
      mode: notn(), mask: 0, showWork: false,
      onToggle: (r) => toggleRegion(r) });
  }
  pane.appendChild(body);
  pane.appendChild(el('div', { class: 'caption',
    text: S.mode === 'sets'
      ? 'click a region to build an expression, or pick an example'
      : 'click a row to build an expression, or pick an example' }));
  host.appendChild(pane);
}

/* Flipping a bit changes what the expression means, so the derivation
   is replaced rather than extended (SPEC.md section 4.1). */
let warned = false;
function toggleRegion(r) {
  const m = curMask() ^ (1 << r);
  setExpr(minimalFor(m));
  if (!warned && S.lines.length) {
    warned = true;
    toast('editing the diagram replaces the derivation');
  }
  render();
}

/* ---- algebra rail ------------------------------------------------- */

function available() {
  const expr = cur();
  if (!expr) return new Map();
  const sel = S.sel ?? { path: [], from: null, to: null };
  const f = focus(expr, sel);
  const byGroup = new Map();
  for (const r of searchRewrites(f)) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  return byGroup;
}

function renderRules() {
  const host = document.getElementById('rules');
  clear(host);
  const avail = available();
  const hintPlan = S.hint >= 2 ? plan() : null;
  for (const g of GROUPS) {
    const rs = avail.get(g) || [];
    const usable = g !== 'Associative' && rs.length > 0;
    const isHint = hintPlan?.path?.[0]?.group === g;
    const btn = el('button', {
      class: 'r' + (isHint ? ' hint' : ''),
      disabled: !usable,
      title: g === 'Associative'
        ? 'built into how chains are written here'
        : (usable ? 'apply to the selection' : 'does not apply here'),
      onclick: () => applyRule(g, rs),
    }, [
      label(g),
      rs.length > 1 ? el('span', { class: 'dir', text: `  ×${rs.length}` })
                    : null,
    ]);
    host.appendChild(el('div', { class: 'rule-row' }, [
      btn,
      el('button', { class: 'info', text: 'i', title: 'what is this law?',
        onclick: (ev) => { ev.stopPropagation(); showLaw(g); } }),
    ]));
  }
  document.getElementById('simpNote').textContent = S.note;
}

function applyRule(group, rs) {
  if (group === 'Associative' || !rs.length) return;
  const expr = cur();
  const sel = S.sel ?? { path: [], from: null, to: null };
  const best = rs.slice().sort((a, b) => cost(a.next) - cost(b.next))[0];
  const next = replaceSel(expr, sel, best.next);
  if (mask(next, S.nv) !== mask(expr, S.nv)) {
    toast('⚠ that step would change the meaning — not applied');
    return;
  }
  S.lines = S.lines.slice(0, S.selectedLine + 1);
  S.lines.push({ expr: next, rule: group, sel });
  S.selectedLine = S.lines.length - 1;
  S.sel = null;
  S.hint = 0;
  S.note = '';
  render();
}

/* ---- simplify and hints ------------------------------------------- */

function plan() {
  const expr = cur();
  if (!expr) return null;
  const t = target(expr, S.nv);
  // Already at target cost. Report ok so callers that only test .ok do
  // not mistake this for a failed search.
  if (cost(expr) <= t.cost) return { done: true, ok: true, path: [], t };
  const r = derive(expr, t.cost, S.nv);
  return { ...r, t };
}

function doHint(level) {
  const p = plan();
  if (!p) return;
  if (p.done) { S.note = ''; render(); return; }
  if (!p.ok) {
    S.note = `minimal form is ${toText(p.t.node, notn(), S.letters)}` +
             ' (no derivation found)';
    render(); return;
  }
  S.hint = level;
  S.sel = p.path[0].sel;
  S.note = level === 1
    ? 'work on the highlighted part'
    : `use ${label(p.path[0].group)} on the highlighted part`;
  render();
}

function applyNext() {
  const p = plan();
  if (!p || p.done || !p.ok) { doHint(1); return; }
  const st = p.path[0];
  S.lines = S.lines.slice(0, S.selectedLine + 1);
  S.lines.push({ expr: st.node, rule: st.group, sel: st.sel });
  S.selectedLine = S.lines.length - 1;
  S.sel = null;
  S.hint = 0;
  S.note = '';
  render();
}

function runAll() {
  for (let i = 0; i < 40; i++) {
    const p = plan();
    if (!p || p.done || !p.ok) break;
    const st = p.path[0];
    S.lines.push({ expr: st.node, rule: st.group, sel: st.sel });
    S.selectedLine = S.lines.length - 1;
  }
  const p = plan();
  S.note = p && !p.done && !p.ok
    ? `minimal form is ${toText(p.t.node, notn(), S.letters)}` +
      ' (no derivation found)'
    : '';
  S.sel = null; S.hint = 0;
  render();
}

/* ---- law demonstration (SPEC.md section 6.3) ---------------------- */

/* Each law carries its worked forms and a sentence of intuition,
   written once per notation: "every point is inside A or outside it"
   and "A is either true or false" are the same fact, but only one of
   them reads as an explanation to a student in front of a truth table.

   layout 'pair' sets the two sides against an equals sign. layout
   'single' shows one table carrying the whole statement in its columns,
   for the laws whose point is that a column comes out constant or
   matches one already there; in sets, where a diagram has no columns to
   compare, it falls back to the pair.

   The pair is shown, not argued. That both sides agree is what the
   diagrams below them demonstrate, so no sentence says so. */
const LAWS = {
  Associative: {
    layout: 'solo',
    demos: [['A u B u C', 'A u B u C'], ['A n B n C', 'A n B n C']],
    // Written out rather than read off the demo: the parser flattens
    // both bracketings to the same node, which is the law itself.
    rules: {
      sets: ['(A ∪ B) ∪ C = A ∪ (B ∪ C)', '(A ∩ B) ∩ C = A ∩ (B ∩ C)'],
      logic: ['(A ∨ B) ∨ C = A ∨ (B ∨ C)', '(A ∧ B) ∧ C = A ∧ (B ∧ C)'],
    },
    sets: '(A ∪ B) ∪ C = A ∪ (B ∪ C): it does not matter which union '
        + 'you do first. Because the answer never depends on the '
        + 'bracketing, we drop the brackets and write A ∪ B ∪ C. The '
        + 'same holds for A ∩ B ∩ C.',
    logic: '(A ∨ B) ∨ C = A ∨ (B ∨ C): it does not matter which one you '
         + 'do first. Because the answer never depends on the '
         + 'bracketing, we drop the brackets and write A ∨ B ∨ C. The '
         + 'same holds for A ∧ B ∧ C.',
    warn: {
      sets: 'Both operations have to be the same one. '
          + '(A ∩ B) ∪ C is not A ∩ (B ∪ C).',
      logic: 'Both operations have to be the same one. '
           + '(A ∧ B) ∨ C is not A ∧ (B ∨ C).',
    },
  },
  Commutative: {
    layout: 'pair',
    demos: [['A u B', 'B u A']],
    sets: 'Order carries no information: A ∪ B and B ∪ A shade the same '
        + 'region, and so do A ∩ B and B ∩ A. Either side may be '
        + 'written first, whenever that makes the next step easier to '
        + 'see.',
    logic: 'Order carries no information: A ∨ B and B ∨ A come out true '
         + 'in exactly the same rows, and so do A ∧ B and B ∧ A.',
  },
  'Double Negation': {
    layout: 'single',
    demos: [['(A^C)^C', 'A']],
    sets: 'Two complements cancel. Everything outside everything-'
        + 'outside-A is A again.',
    logic: 'Two negations cancel. ¬¬A says exactly what A says.',
  },
  "DeMorgan's": {
    layout: 'pair',
    demos: [['(A u B)^C', 'A^C n B^C']],
    sets: "DeMorgan's Law distributes a complement over another "
        + 'operation. The complement sits outside the brackets in the '
        + 'first expression, and lands on each set in the second. The '
        + 'operation flips as it goes, so ∪ becomes ∩.',
    logic: "DeMorgan's Law distributes a negation over another "
         + 'operation. The negation sits outside the brackets in the '
         + 'first expression, and lands on each boolean in the second. '
         + 'The operation flips as it goes, so ∨ becomes ∧.',
  },
  Distributive: {
    layout: 'pair',
    demos: [['A n (B u C)', '(A n B) u (A n C)']],
    sets: 'A condition shared across a choice can be handed to each '
        + 'branch separately: the part of A lying in B or C is the part '
        + 'in B together with the part in C.',
    logic: 'A condition shared across a choice can be handed to each '
         + 'branch, the way multiplying out a bracket does: '
         + 'A ∧ (B ∨ C) becomes (A ∧ B) ∨ (A ∧ C).',
  },
  Absorption: {
    layout: 'pair',
    demos: [['A n (A u B)', 'A']],
    sets: 'Once you are inside A, being inside A ∪ B is automatic. B '
        + 'never gets to matter.',
    logic: 'If A holds then A ∨ B holds too, so requiring both is just '
         + 'requiring A. B never gets to matter.',
  },
  Complement: {
    layout: 'single',
    demos: [['A u A^C', '1'], ['A n A^C', '0']],
    sets: 'Every point is either inside A or outside it, never both and '
        + 'never neither. So A ∪ Aᶜ is always everything, and A ∩ Aᶜ is '
        + 'always empty.',
    logic: 'A is either true or false, never both and never neither. So '
         + 'A ∨ ¬A is always True, and A ∧ ¬A is always False.',
  },
  Idempotent: {
    layout: 'single',
    demos: [['A u A', 'A'], ['A n A', 'A']],
    sets: 'Any operation applied to the same set twice returns that set '
        + 'unchanged.',
    logic: 'Any operation applied to the same variable returns the '
         + 'original variable.',
    gloss: 'idempotent: describes an action which can be repeated '
         + 'multiple times without changing the result.',
  },
  Identity: {
    layout: 'single',
    demos: [['0 u A', 'A'], ['1 n A', 'A']],
    sets: '∅ and U can be do-nothing partners: adding nothing, or '
        + 'cutting down to everything, leaves a set exactly as it was.',
    logic: 'F and T can be do-nothing partners: or-ing with F, or '
         + 'and-ing with T, leaves a claim exactly as it was.',
  },
  Domination: {
    layout: 'single',
    demos: [['1 u A', '1'], ['0 n A', '0']],
    sets: 'The extreme swallows whatever it meets: a union with U is U, '
        + 'an intersection with ∅ is ∅. The other side never gets a say.',
    logic: 'The extreme swallows whatever it meets: anything ∨ T is T, '
         + 'anything ∧ F is F. The other side never gets a say.',
  },
  Definition: {
    layout: 'pair',
    demos: [['A - B', 'A n B^C']],
    sets: 'Not really a law, but some operations (set difference, '
        + 'symmetric difference) are not easily manipulated '
        + 'algebraically. Applying their definition breaks one of these '
        + 'operators into its pieces, which are more malleable. It '
        + 'also settles a complemented constant: ∅ᶜ is U.',
    logic: 'Not really a law, but some operations (difference, '
         + 'exclusive or) are not easily manipulated algebraically. '
         + 'Applying their definition breaks one of these operators '
         + 'into its pieces, which are more malleable. It also '
         + 'settles a negated constant: ¬F is T.',
    more: {
      sets: ['A Δ B = (A − B) ∪ (B − A)', '∅ᶜ = U', 'Uᶜ = ∅'],
      logic: ['A ⊕ B = (A − B) ∨ (B − A)', '¬F = T', '¬T = F'],
    },
  },
};

/* Law demonstrations always read in A, B, C. They are about the shape
   of an identity, not about whatever the student happens to have
   loaded, and borrowing the student's letters left a three-variable law
   rendering its third as "?" whenever the working expression had two. */
const LAW_LETTERS = PRESETS.ABC;

/* One panel of a demonstration: an expression, and what it picks out.
   Clicking a part re-points the diagram at that part, which is the same
   gesture the main expression pane uses.

   A part that the table already has a column for is highlighted where
   it stands rather than being drawn again -- asking about A when A is
   the first column should answer with that column. */
function lawSide(e, i, nv, work = false, suffix = null) {
  const box = el('div', { class: 'side' });
  const tbox = el('div', { class: 't' });
  const dia = el('div', { class: 'dia' + (S.mode === 'sets' ? ' minivenn' : '') });
  const cap = el('div', { class: 'sidecap' });
  const base = work ? TT.gateNodes(e).slice(0, -1) : [];
  const drawn = (n) => n.k === 'var' || key(n) === key(e) ||
                       base.some((c) => key(c) === key(n));
  let sel = null;

  const draw = () => {
    clear(tbox);
    tbox.appendChild(nodeDom(e, [], null, LAW_LETTERS));
    // The statement is the heading, so the panel shows all of it: the
    // left side stays clickable, the right side is just what it equals.
    if (suffix) tbox.appendChild(txt(` = ${suffix}`));
    if (sel) nodeAtPath(tbox, sel)?.classList.add('sel');
    const node = sel ? at(e, sel) : null;
    clear(dia);
    if (S.mode === 'sets') {
      Venn.render(dia, { nv, on: mask(e, nv), letters: LAW_LETTERS,
        mode: notn(), idp: `d${i}`,
        sel: node ? mask(node, nv) : null });
    } else {
      TT.render(dia, { expr: e, nv, letters: LAW_LETTERS, mode: notn(),
        mask: mask(e, nv), compact: true, selNode: node,
        workCols: node && !drawn(node) ? [...base, node] : base });
    }
    cap.textContent = node
      ? `showing ${toText(node, notn(), LAW_LETTERS)}` : '';
  };

  tbox.addEventListener('click', (ev) => {
    const nd = ev.target.closest?.('.nd');
    if (!nd || !tbox.contains(nd)) return;
    sel = JSON.stringify(sel) === nd.dataset.path
      ? null : JSON.parse(nd.dataset.path);
    draw();
  });

  draw();
  box.appendChild(tbox);
  box.appendChild(dia);
  box.appendChild(cap);
  return box;
}

/* One demonstration, headed by the rule it demonstrates.

   'pair' sets the two sides against an equals sign, and needs no
   heading -- the sides are the statement. 'single' and 'solo' show one
   panel, so the rule goes above it in full; in logic 'single' puts the
   working in the table's columns, which a Venn has no room for, so in
   sets the two behave alike. */
function lawDemo(law, idx, nv) {
  const [ls, rs] = law.demos[idx];
  const L = parse(ls).expr;
  const one = law.layout !== 'pair';
  const box = el('div', { class: 'lawdemo' });

  if (one) {
    const R = parse(rs).expr;
    const work = law.layout === 'single' && S.mode !== 'sets';
    // Associative is the one law whose statement cannot be read off its
    // demo -- both bracketings flatten to the same node -- so it heads
    // the panel with the bracketed form and shows the chain beneath.
    if (law.rules) {
      box.appendChild(el('div', { class: 'lawrule',
        text: law.rules[notn()][idx] }));
      box.appendChild(el('div', { class: 'lawgrid one' },
        [lawSide(L, idx, nv, work)]));
    } else {
      box.appendChild(el('div', { class: 'lawgrid one' },
        [lawSide(L, idx, nv, work, toText(R, notn(), LAW_LETTERS))]));
    }
    return box;
  }

  const R = parse(rs).expr;
  box.appendChild(el('div', { class: 'lawgrid' }, [
    lawSide(L, idx * 2, nv), el('div', { class: 'mid', text: '=' }),
    lawSide(R, idx * 2 + 1, nv)]));
  return box;
}

function showLaw(group) {
  const law = LAWS[group];
  const need = Math.max(1, ...law.demos.flat()
    .map((src) => maxVar(parse(src).expr) + 1));
  const nv = need;

  // A law whose two sides disagree is a broken rule table, not a
  // teaching point -- say so rather than drawing it as fact.
  const broken = law.demos.some(([l, r]) =>
    mask(parse(l).expr, nv) !== mask(parse(r).expr, nv));

  const canApply = (available().get(group) || []).length > 0;
  openCard(el('div', { class: 'card' }, [
    el('h3', { text: label(group) + ' Law' }),
    el('p', { class: 'lawwhy', text: law[notn()] }),
    law.gloss ? el('p', { class: 'lawgloss', text: law.gloss }) : null,
    broken ? el('p', { class: 'err', text: 'these two sides disagree — '
                                         + 'that is a bug in the rule table' })
           : null,
    el('div', { class: 'lawdemos' },
      law.demos.map((_, i) => lawDemo(law, i, nv))),
    law.more ? el('ul', { class: 'lawmore' },
      law.more[notn()].map((t) => el('li', { text: t }))) : null,
    law.warn ? el('p', { class: 'lawwarn', text: law.warn[notn()] }) : null,
    el('div', { class: 'cardfoot' }, [
      canApply ? el('button', { class: 'primary',
        text: 'try it on my expression',
        onclick: () => { closeCard(); applyRule(group, available().get(group)); },
      }) : null,
      el('button', { class: 'ghost', text: 'dismiss', onclick: closeCard }),
    ]),
  ]));
}

/* ---- examples (SPEC.md section 3.1) ------------------------------- */

/* Three difficulties, each with a catalogue and a maker. See
   examples.js for what puts a problem in a band. */
function showExamples() {
  const row = ([src, mode, why]) =>
    el('button', { onclick: () => { closeCard(); load(src, mode); } }, [
      el('div', { class: 'ex-e',
        text: toText(parse(src).expr, mode, PRESETS.ABC) }),
      el('div', { class: 'ex-d', text: why }),
    ]);

  const section = (level) => {
    const list = el('div', { class: 'exlist' },
      CATALOGUE[level].map(row));
    const make = el('button', {
      class: 'makeup', type: 'button', text: 'make one up',
      onclick: () => {
        const g = makeOne(level, notn());
        if (!g) return toast('the dice were unkind — try that again');
        closeCard();
        load(g.src, S.mode);
        toast(`a fresh ${level} one: ${g.steps} step` +
              `${g.steps === 1 ? '' : 's'} to the minimum`);
      },
    });
    return el('div', { class: 'exgroup' }, [
      el('div', { class: 'exhead' }, [
        el('span', { class: `extag ${level}`, text: level }),
        el('span', { class: 'exwhy', text: BLURB[level] }),
        make,
      ]),
      list,
    ]);
  };

  openCard(el('div', { class: 'card wide' }, [
    el('h3', { text: 'Examples' }),
    el('p', { text: 'Each one loads an expression and gets out of the '
                  + 'way. Difficulty is the number of steps between it '
                  + 'and its simplest form.' }),
    ...LEVELS.map(section),
    el('div', { class: 'cardfoot' }, [
      el('button', { class: 'ghost', text: 'start empty',
        onclick: () => { closeCard(); S.lines = []; S.sel = null; render(); } }),
      el('button', { class: 'ghost', text: 'dismiss', onclick: closeCard }),
    ]),
  ]));
}

/* The Venn draws at most three circles, so an expression needing four
   variables can only be shown as a table. Move there and say so, rather
   than dropping a variable behind the reader's back. */
function fitMode(need) {
  if (need > 3 && S.mode === 'sets') {
    S.mode = 'logic';
    toast('four variables — the Venn only draws three, so this is logic');
  }
}

/* Whether any line of the derivation uses the fourth variable, which
   is what puts the sets view out of reach. Toggling views keeps the
   derivation (SPEC.md section 4.1) and the Venn cannot draw a fourth
   variable (section 12), so the honest answer to the sets tab here is
   to decline it and say why. Narrowing to three instead would re-seed
   from a mask read at the wrong width -- the reader's expression
   replaced by an unrelated one, which is what it looks like from the
   outside too. */
const needsFour = () => S.lines.some((ln) => maxVar(ln.expr) > 2);

function load(src, mode) {
  const { expr, letters } = parse(src);
  if (mode) S.mode = mode;
  fitMode(letters.length);
  S.nv = Math.max(1, Math.min(maxVars(), letters.length));
  setExpr(expr, letters);
  document.getElementById('src').value = toText(expr, notn(), S.letters);
  render();
}

/* ---- overlays ----------------------------------------------------- */

function openCard(card) {
  const o = document.getElementById('overlay');
  clear(o);
  o.appendChild(card);
  o.hidden = false;
  o.onclick = (ev) => { if (ev.target === o) closeCard(); };
}
function closeCard() { document.getElementById('overlay').hidden = true; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCard(); S.sel = null; render(); }
});

let toastT = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---- URL state ---------------------------------------------------- */

function toUrl() {
  const p = new URLSearchParams();
  p.set('mode', S.mode);
  p.set('n', S.nv);
  if (cur()) p.set('e', toText(S.lines[0].expr, 'logic', S.letters));
  return location.origin + location.pathname + '?' + p.toString();
}
function fromUrl() {
  const p = new URLSearchParams(location.search);
  if (MODES.includes(p.get('mode'))) S.mode = p.get('mode');
  const n = +p.get('n');
  if (n >= 2 && n <= 4) S.nv = n;
  const e = p.get('e');
  if (e) { try { load(e, S.mode); } catch (_) { /* ignore a bad link */ } }
  // Instructor deep links: open with the derivation already worked, or
  // with one truth-table row traced (SPEC.md section 16.3).
  if (p.get('solve') === '1' && cur()) runAll();
  const row = p.get('row');
  if (row != null && row !== '' && !Number.isNaN(+row)) S.hoverRow = +row;
}

/* ---- render ------------------------------------------------------- */

function render() {
  const four = needsFour();
  for (const b of document.querySelectorAll('#modeToggle button')) {
    b.setAttribute('aria-selected', String(b.dataset.mode === S.mode));
    if (b.dataset.mode !== 'sets') continue;
    // aria-disabled, not disabled: a tab that looks unavailable but
    // still answers a click can say what makes it unavailable.
    b.setAttribute('aria-disabled', String(four));
    if (four) b.title = 'the Venn only draws three variables';
    else b.removeAttribute('title');
  }
  renderViewer();
  renderLines();
  renderRules();
  renderOpPad();
  renderExprBar();
  const p = cur() ? plan() : null;
  document.getElementById('simplify').disabled = !cur() || !!p?.done;
  document.getElementById('simplify').textContent =
    p?.done ? 'already minimal' : 'Simplify';
}

/* Widen or narrow the variable count. An expression whose variables
   all still fit is kept as it is -- the extra variable is simply
   unused. Only a narrowing that would orphan a variable has to
   re-seed, since a mask computed at one width means nothing at
   another. */
function reseed() {
  padLetters();
  const e = cur();
  if (!e) return;
  if (maxVar(e) < S.nv) {
    S.lines = S.lines.filter((ln) => maxVar(ln.expr) < S.nv);
    if (!S.lines.length) S.lines = [{ expr: e, rule: null, sel: null }];
    S.selectedLine = Math.min(S.selectedLine, S.lines.length - 1);
    S.sel = null;
    return;
  }
  setExpr(minimalFor(mask(e, S.nv) & ((1 << (1 << S.nv)) - 1)));
}

function maxVar(n) {
  switch (n.k) {
    case 'var': return n.i;
    case 'const': return -1;
    case 'not': return maxVar(n.a);
    case 'diff': case 'sym': return Math.max(maxVar(n.l), maxVar(n.r));
    default: return Math.max(...n.ts.map(maxVar));
  }
}

/* Keep at least nv letters, borrowing from whichever preset the
   existing ones came from. */
function padLetters() {
  if (S.letters.length >= S.nv) return;
  const src = Object.values(PRESETS)
    .find((p) => p[0] === S.letters[0]) || PRESETS.ABC;
  const out = S.letters.slice();
  for (const L of src) if (!out.includes(L) && out.length < S.nv) out.push(L);
  while (out.length < S.nv) out.push(PRESETS.ABC[out.length]);
  S.letters = out;
}

/* ---- operator pad -------------------------------------------------- */

/* Insert at the caret rather than appending, so the pad can be used
   part-way through an expression. */
function insertAtCaret(inp, s) {
  const a = inp.selectionStart ?? inp.value.length;
  const b = inp.selectionEnd ?? a;
  inp.value = inp.value.slice(0, a) + s + inp.value.slice(b);
  const c = a + s.length;
  inp.focus();
  inp.setSelectionRange(c, c);
}

/* Complement is postfix in sets and prefix in logic, so the pad has to
   follow the notation rather than name one glyph for both. */
function padKeys() {
  const g = GLYPH[notn()];
  const not = g.notPre ? { label: g.notPre, ins: g.notPre }
                       : { label: 'x' + g.notPost, ins: g.notPost };
  return [
    { label: g.and, ins: ` ${g.and} `, title: 'and / intersection' },
    { label: g.or, ins: ` ${g.or} `, title: 'or / union' },
    { ...not, title: 'not / complement' },
    null,
    { label: g.diff, ins: ` ${g.diff} `, title: 'difference' },
    { label: g.sym, ins: ` ${g.sym} `, title: 'symmetric difference' },
    null,
    { label: '( )', ins: '()', back: 1, title: 'brackets' },
    { label: g.T, ins: g.T, title: 'everything' },
    { label: g.F, ins: g.F, title: 'nothing' },
  ];
}

function renderOpPad() {
  const host = document.getElementById('opPad');
  if (!host) return;
  clear(host);
  const inp = document.getElementById('src');
  for (const k of padKeys()) {
    if (!k) { host.appendChild(el('span', { class: 'gap' })); continue; }
    host.appendChild(el('button', {
      class: 'op', text: k.label, title: k.title, type: 'button',
      onclick: () => {
        insertAtCaret(inp, k.ins);
        if (k.back) inp.setSelectionRange(inp.selectionStart - k.back,
                                          inp.selectionStart - k.back);
      },
    }));
  }
}

/* ---- boot --------------------------------------------------------- */

function boot() {
  for (const b of document.querySelectorAll('#modeToggle button')) {
    b.onclick = () => {
      if (b.dataset.mode === 'sets' && needsFour()) {
        toast('four variables — the Venn only draws three, so this '
              + 'expression has no diagram');
        return;
      }
      S.mode = b.dataset.mode;
      if (S.nv > maxVars()) { S.nv = maxVars(); reseed(); }
      const inp = document.getElementById('src');
      if (cur()) inp.value = toText(S.lines[0].expr, notn(), S.letters);
      render();
    };
  }
  document.getElementById('examplesBtn').onclick = showExamples;
  document.getElementById('simplify').onclick = runAll;
  document.getElementById('reset').onclick = () => {
    if (S.lines.length) { S.lines = [S.lines[0]]; S.selectedLine = 0; }
    S.sel = null; S.hint = 0; S.note = ''; render();
  };
  document.getElementById('share').onclick = async () => {
    const u = toUrl();
    history.replaceState(null, '', u);
    try { await navigator.clipboard.writeText(u); toast('link copied'); }
    catch (_) { toast('link is in the address bar'); }
  };

  const inp = document.getElementById('src');
  const err = document.getElementById('srcErr');
  const tryParse = () => {
    const v = inp.value.trim();
    if (!v) { err.textContent = ''; return; }
    try {
      const { expr, letters } = parse(v);
      err.textContent = '';
      fitMode(letters.length);
      S.nv = Math.max(1, Math.min(maxVars(), letters.length));
      setExpr(expr, letters);
      render();
      // Echo back what was understood: someone who typed \cup sees the
      // real glyph, and a typo shows up as the wrong shape immediately.
      inp.value = toText(expr, notn(), S.letters);
    } catch (e) {
      err.textContent = e instanceof PErr
        ? `${e.message}${e.at != null ? ` at position ${e.at + 1}` : ''}`
        : e.message;
    }
  };
  inp.addEventListener('change', tryParse);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryParse(); });

  fromUrl();
  render();
}

/* Exposed so the interaction tests can drive the app, and so a
   confused instructor can poke at it from the console. */
window.BAE = { S, render, load, unify, applyRule, available, plan,
               doHint, applyNext, runAll, toggleRegion, minimalFor,
               setExpr, reseed, undoLast, stepMarks };

boot();
