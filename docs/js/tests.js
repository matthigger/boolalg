/* Core test suite, mostly properties. Run by opening test.html; the
   summary line is machine-readable so CI or a headless browser can
   grep it. Mirrors SPEC.md section 11. */

import { vr, cn, nt, df, sy, and, or, ch, eq, key, mask, cost, evalAt,
         desugar, selections, focus, replaceSel, at } from './core.js';
import { parse, toText, PRESETS } from './text.js';
import { rewritesOf, searchRewrites, label } from './rules.js';
import { minTable, target, derive, steps } from './minimize.js';

const log = [];
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; log.push(`  ok   ${name}`); }
  else { fail++; log.push(`  FAIL ${name} ${detail}`); }
}
function eqv(name, got, want) {
  ok(name, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

const A = vr(0), B = vr(1), C = vr(2), T = cn(true), F = cn(false);
const NV = 3;

/* ---- 1. indexing (SPEC.md 2.1) ------------------------------------ */
eqv('mask A', mask(A, 3), 0xF0);
eqv('mask B', mask(B, 3), 0xCC);
eqv('mask C', mask(C, 3), 0xAA);
eqv('mask T', mask(T, 3), 0xFF);
eqv('mask F', mask(F, 3), 0x00);
ok('row 0 is all-false',
   !evalAt(A, 0, 3) && !evalAt(B, 0, 3) && !evalAt(C, 0, 3));
ok('row 1 is 001', !evalAt(A, 1, 3) && !evalAt(B, 1, 3) && evalAt(C, 1, 3));
ok('row 4 is 100', evalAt(A, 4, 3) && !evalAt(B, 4, 3) && !evalAt(C, 4, 3));

/* ---- 2. cost ------------------------------------------------------ */
eqv('cost var', cost(A), 0);
eqv('cost not', cost(nt(A)), 1);
eqv('cost 2-chain', cost(or(A, B)), 1);
eqv('cost 3-chain', cost(or(A, B, C)), 2);
eqv('cost nested', cost(and(A, or(B, C))), 2);
eqv('cost diff', cost(df(A, B)), 2);
eqv('cost sym', cost(sy(A, B)), 5);

/* ---- 3. chain algebra --------------------------------------------- */
eqv('chain flattens', key(or(or(A, B), C)), key(or(A, B, C)));
eqv('one term collapses', key(ch('or', [A])), key(A));
eqv('empty and is T', key(ch('and', [])), key(T));
eqv('empty or is F', key(ch('or', [])), key(F));
ok('order is preserved', key(or(B, A)) !== key(or(A, B)));

/* ---- 4. parse and render ------------------------------------------ */
const P = [
  ['(A u B)^C', '¬(A ∨ B)'],
  ['A & B | C', '(A ∧ B) ∨ C'],
  ['~~A', '¬¬A'],
  ['A^{cc}', '¬¬A'],
  ["A'", '¬A'],
  ['not (A and B)', '¬(A ∧ B)'],
  ['A - B', 'A − B'],
  ['A ^ B', 'A ⊕ B'],
  ['1 & 0', 'T ∧ F'],
  ['A v B', 'A ∨ B'],
  ['A n B', 'A ∧ B'],
  ['p | q | r', 'A ∨ B ∨ C'],
  ['A \\cap B', 'A ∧ B'],
  ['A \\cup B', 'A ∨ B'],
  ['\\neg A', '¬A'],
  ['\\overline{A \\cup B}', '¬(A ∨ B)'],
  ['\\bar{A}', '¬A'],
  ['A \\setminus B', 'A − B'],
  ['A \\oplus B', 'A ⊕ B'],
  ['\\emptyset \\cup A', 'F ∨ A'],
  ['\\top \\cap A', 'T ∧ A'],
  ['A \\ B', 'A − B'],
];
for (const [src, want] of P) {
  let got;
  try { got = toText(parse(src).expr, 'logic'); }
  catch (e) { got = 'ERR ' + e.message; }
  eqv(`parse ${src}`, got, want);
}
eqv('sets render', toText(parse('(A u B)^C').expr, 'sets'), '(A ∪ B)ᶜ');
eqv('letters follow input', parse('p | q').letters.join(''), 'pq');

let perr = false;
try { parse('A & '); } catch (e) { perr = true; }
ok('parse error reported', perr);

let cerr = false;
try { parse('A \\frobnicate B'); } catch (e) { cerr = true; }
ok('unknown latex command reported', cerr);

/* ---- 5. round-trip ------------------------------------------------ */
function rnd(depth, r) {
  if (depth <= 0 || r() < 0.25) {
    const leaf = [A, B, C][Math.floor(r() * 3)];
    return r() < 0.3 ? nt(leaf) : leaf;
  }
  const kind = r();
  if (kind < 0.2) return nt(rnd(depth - 1, r));
  const k = r() < 0.5 ? 2 : 3;
  const ts = [];
  for (let i = 0; i < k; i++) ts.push(rnd(depth - 1, r));
  return kind < 0.6 ? ch('or', ts) : ch('and', ts);
}
let seed = 12345;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/* Compare rendered text, not node keys: an expression using only B and
   C re-parses to indices 0,1 with letters ['B','C'], which is the
   intended "letters follow input" behaviour, not a round-trip failure. */
let rtBad = 0, rtN = 0, rtEx = '';
for (const mode of ['logic', 'sets']) {
  for (let i = 0; i < 250; i++) {
    const e = rnd(3, rng);
    rtN++;
    const src = toText(e, mode, PRESETS.ABC);
    try {
      const { expr, letters } = parse(src);
      const back = toText(expr, mode, letters);
      if (back !== src) { rtBad++; if (!rtEx) rtEx = `${src} -> ${back}`; }
    } catch (err) {
      rtBad++; if (!rtEx) rtEx = `${src} -> ${err.message}`;
    }
  }
}
ok(`render/parse round-trip (${rtN}, both modes)`, rtBad === 0,
   `${rtBad} mismatches, e.g. ${rtEx}`);

/* ---- 6. every rule preserves the mask (SPEC.md 9.4) --------------- */
let checked = 0, bad = 0, badEx = '';
for (let i = 0; i < 1200; i++) {
  const e = rnd(3, rng);
  const m0 = mask(e, NV);
  for (const sel of selections(e)) {
    const f = focus(e, sel);
    for (const r of rewritesOf(f)) {
      checked++;
      const next = replaceSel(e, sel, r.next);
      if (mask(next, NV) !== m0) {
        bad++;
        if (!badEx) badEx = `${label(r.group)}: ${toText(e)} -> ${toText(next)}`;
      }
    }
  }
}
ok(`all rules preserve mask (${checked} rewrites)`, bad === 0,
   `${bad} bad, e.g. ${badEx}`);

/* ---- 7. sugar ----------------------------------------------------- */
eqv('diff mask', mask(df(A, B), 3), mask(and(A, nt(B)), 3));
eqv('sym mask', mask(sy(A, B), 3),
    mask(or(and(A, nt(B)), and(B, nt(A))), 3));
{
  const rs = rewritesOf(df(A, B)).filter((r) => !r.expands);
  ok('difference offers only Definition',
     rs.length === 1 && rs[0].group === 'Definition');
  eqv('Definition marks off-handout', label('Definition'), 'Definition*');
  eqv('handout rules unmarked', label("DeMorgan's"), "DeMorgan's");
}

/* ---- 8. selections ------------------------------------------------ */
{
  const e = or(and(C, B), and(nt(C), B), and(A, nt(B)));
  const sels = [...selections(e)];
  ok('runs are selectable', sels.some((s) => s.from === 1 && s.to === 3));
  const run = sels.find((s) => s.from === 1 && s.to === 3);
  eqv('run focus renders', toText(focus(e, run)), '(¬C ∧ B) ∨ (A ∧ ¬B)');
  const back = replaceSel(e, run, focus(e, run));
  eqv('run splices back unchanged', key(back), key(e));
}

/* ---- 9. stage 1 dynamic program ----------------------------------- */
{
  const tb = minTable(3);
  eqv('all masks solved', tb.size, 256);
  eqv('max minimal cost', Math.max(...[...tb.values()].map((e) => e.cost)), 12);
  eqv('majority is cost 4', tb.get(0xE8).cost, 4);
  eqv('3-way xor is cost 11', tb.get(0x96).cost, 11);
  let wrong = 0;
  for (const [m, e] of tb) if (mask(e.node, 3) !== m) wrong++;
  eqv('every witness matches its mask', wrong, 0);
}

/* ---- 10. stage 2 on the course's own problems --------------------- */
const COURSE = [
  ['boolean_simplify_01/02', '¬(A ∧ (A ∨ ¬B))'],
  ['boolean_simplify_03', '(A ∨ ¬(¬A ∨ ¬B)) ∧ B'],
  ['boolean_simplify_04', 'A ∨ (A ∧ B) ∨ (¬A ∧ B)'],
  ['boolean_simplify_05', '(A ∧ (A ∨ C)) ∨ ¬(¬B ∧ B)'],
  ['boolean_simplify_06', '¬¬A ∨ (¬B ∧ (B ∨ (B ∧ C)))'],
  ['set_algebra01 i', '¬((¬A ∧ B) ∨ (¬A ∧ ¬B))'],
  ['set_algebra01 ii', '¬(¬A ∧ ¬B) ∧ T'],
  ['set_algebra01 iii', '(A ∨ A) ∧ (B ∨ ¬A)'],
  ['set_algebra_logic_too i', '¬((A ∧ ¬A) ∨ (A ∧ (A ∨ B)))'],
  ['set_algebra_logic_too ii', '¬((¬A ∨ ¬B) ∧ B)'],
  ['circuit01', '¬((A ∧ B) ∨ ¬C)'],
  ['circuit04', '(C ∧ B) ∨ (¬C ∧ B) ∨ (A ∧ ¬B)'],
  ['formula_derivation_vip', '(¬A ∨ ¬B) ∨ (A ∧ B)'],
];
let reached = 0, worst = 0, worstNodes = 0;
const derivations = [];
for (const [name, src] of COURSE) {
  const e = parse(src).expr;
  const tg = target(e, 3);
  const res = derive(e, tg.cost, 3);
  if (res.ok) {
    reached++;
    worst = Math.max(worst, res.path.length);
    worstNodes = Math.max(worstNodes, res.nodes);
    derivations.push([name, src, tg, res]);
  } else {
    log.push(`  MISS ${name}`);
  }
  // every emitted step must preserve the mask
  if (res.ok) {
    const m0 = mask(e, 3);
    for (const st of res.path) {
      if (mask(st.node, 3) !== m0) fail++;
    }
  }
}
eqv('course problems reached', reached, COURSE.length);
ok(`derivations are short (max ${worst} steps, ${worstNodes} nodes)`,
   worst <= 10 && worstNodes <= 200);

/* ---- 11. simplify never inflates ---------------------------------- */
{
  let bad2 = 0;
  for (let i = 0; i < 60; i++) {
    const e = rnd(2, rng);
    const tg = target(e, 3);
    const res = derive(e, tg.cost, 3);
    if (res.ok && cost(res.path.length ? res.path.at(-1).node : e) > cost(e)) {
      bad2++;
    }
    if (res.ok && mask(res.path.length ? res.path.at(-1).node : e, 3)
        !== mask(e, 3)) bad2++;
  }
  eqv('simplify results are equivalent and no worse', bad2, 0);
}

/* ---- report ------------------------------------------------------- */
const summary = `RESULT pass=${pass} fail=${fail}`;
const el = document.getElementById('out');
el.textContent = summary + '\n\n' + log.join('\n') + '\n\nDERIVATIONS\n' +
  derivations.map(([n, s, tg, r]) =>
    `\n${n}\n  ${s}   (cost ${cost(parse(s).expr)})\n  minimum ` +
    `${toText(tg.node)} (cost ${tg.cost})\n` +
    r.path.map((st) => `  = ${toText(st.node).padEnd(34)} ${label(st.group)}`)
      .join('\n')).join('\n');
document.title = summary;
