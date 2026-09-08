/* Core test suite, mostly properties. Run by opening test.html; the
   summary line is machine-readable so CI or a headless browser can
   grep it. Mirrors SPEC.md section 11. */

import { vr, cn, nt, df, sy, and, or, ch, eq, key, mask, cost, evalAt,
         desugar, selections, focus, replaceSel, at } from './core.js';
import { parse, toText, toTeX, toTextSpans, PRESETS } from './text.js';
import { tableData, tableCSV, tableTeX, derivationTeX, slug }
  from './export.js';
import { rewritesOf, searchRewrites, label } from './rules.js';
import { minTable, target, derive, steps } from './minimize.js';
import { CATALOGUE, LEVELS, makeOne } from './examples.js';

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
  ['A and B', 'A ∧ B'],
  ['A or B', 'A ∨ B'],
  ['not A', '¬A'],
  ['A union B', 'A ∨ B'],
  ['A intersection B', 'A ∧ B'],
  ['A int B', 'A ∧ B'],
  ['complement A', '¬A'],
  ['comp (A or B)', '¬(A ∨ B)'],
  ['A minus B', 'A − B'],
  ['rain and wet', 'A ∧ B'],
  ['sunny or rain', 'B ∨ A'],
  ['not raining', '¬A'],
  ['x1 & x2', 'A ∧ B'],
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

eqv('named variables keep their names',
    parse('sunny and warm').letters.join(','), 'sunny,warm');
eqv('and sort into a stable order',
    parse('warm and sunny').letters.join(','), 'sunny,warm');
eqv('a word operator is not a variable',
    parse('rain and snow').letters.length, 2);

let toomany = false;
try { parse('a & b & c & d & e'); } catch (e) { toomany = true; }
ok('more than four variables is refused', toomany);

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
/* ---- 12. exports (SPEC.md section 13) ------------------------------ */
{
  // The span map only means anything if it describes the same string
  // toText produces, so check that on the round-trip corpus.
  let spanOK = true, sliceOK = true;
  {
    let sd = 999;
    const r = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 200; i++) {
      const n = rnd(3, r);
      for (const mode of ['logic', 'sets']) {
        const { text, at: spans } = toTextSpans(n, mode, PRESETS.ABC);
        if (text !== toText(n, mode, PRESETS.ABC)) spanOK = false;
        for (const [k, [a, b]] of spans) {
          const sub = at(n, JSON.parse(k));
          const want = toText(sub, mode, PRESETS.ABC);
          const got = text.slice(a, b);
          // A span may carry brackets its subtree does not print alone.
          if (got !== want && got !== `(${want})`) sliceOK = false;
        }
      }
    }
  }
  ok('span text matches toText', spanOK);
  ok('and every span covers its own subtree', sliceOK);

  const T = (src, mode) => toTeX(parse(src).expr, mode, PRESETS.ABC);
  eqv('tex: sets complement is an overline',
      T('(A u B)^C', 'sets'), '\\overline{A \\cup B}');
  eqv('tex: logic negation is a prefix',
      T('~(A & B)', 'logic'), '\\lnot \\left(A \\land B\\right)');
  eqv('tex: difference', T('A - B', 'sets'), 'A \\setminus B');
  eqv('tex: constants', T('1 & 0', 'logic'),
      '\\mathrm{T} \\land \\mathrm{F}');
  eqv('tex: no brackets inside a chain', T('A u B u C', 'sets'),
      'A \\cup B \\cup C');

  const e = parse('A & B').expr;
  const d = tableData({ expr: e, nv: 2, letters: PRESETS.ABC,
                        mode: 'logic', mask: mask(e, 2), showWork: false });
  eqv('csv has a header and every row',
      tableCSV(d).trim().split('\n').length, 5);
  eqv('csv header names the columns',
      tableCSV(d).split('\n')[0], 'A,B,A \u2227 B');
  eqv('csv last row is the only 1',
      tableCSV(d).trim().split('\n').at(-1), '1,1,1');

  const tex = tableTeX(d, 'cap');
  ok('tex table is a tabular', tex.includes('\\begin{tabular}{cc|c}'));
  ok('tex table rules off the variables', tex.includes('\\hline'));
  ok('tex table closes', tex.trim().endsWith('\\end{tabular}'));

  const dv = derivationTeX(
    [{ expr: parse('~(A & B)').expr },
     { expr: parse('~A | ~B').expr, rule: "DeMorgan's" }], 'logic',
    PRESETS.ABC);
  ok('derivation is an align*', dv.includes('\\begin{align*}'));
  ok('and tags the step with its law', dv.includes("\\text{DeMorgan's}"));
  ok('the first line carries no relation', dv.includes('     & \\lnot'));
  ok('and the relation is spaced off the term', dv.includes(' ={} & '));

  eqv('slug is filesystem-safe', slug('(A \u222a B)\u1d9c'), 'a-b');
  eqv('slug never comes back empty', slug('\u2229\u222a'), 'expression');
}

/* ---- 13. examples (SPEC.md section 3.1) ---------------------------- */
{
  // The band an example is filed under is a claim about how much work
  // it takes; check the claim rather than trusting the filing.
  // A mild example may be minimal already; the harder bands may not be.
  const BOUND = { mild: [0, 2], medium: [3, 5], spicy: [6, 40] };
  const misfiled = [];
  let parsed = 0;
  for (const level of LEVELS) {
    for (const [src, mode] of CATALOGUE[level]) {
      let e;
      try { e = parse(src).expr; parsed++; }
      catch (err) { misfiled.push(`${src}: ${err.message}`); continue; }
      const nv = mode === 'sets' ? 3 : 3;
      const t = target(e, nv);
      const d = derive(desugar(e), t.cost, nv,
                       { maxNodes: 8000, maxSteps: 24 });
      if (!d.ok) { misfiled.push(`${src}: no derivation found`); continue; }
      const [lo, hi] = BOUND[level];
      if (d.path.length < lo || d.path.length > hi) {
        misfiled.push(`${src} is ${d.path.length} steps, not ${level}`);
      }
    }
  }
  eqv('every example parses', parsed,
      LEVELS.reduce((a, l) => a + CATALOGUE[l].length, 0));
  ok('and is filed under the right difficulty', misfiled.length === 0,
     misfiled.join(' | '));

  // The maker has to land in its own band, or the button lies.
  let sd = 4242;
  const r = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const level of LEVELS) {
    let found = 0, wrong = '';
    for (let i = 0; i < 3; i++) {
      const g = makeOne(level, 'logic', r);
      if (!g) continue;
      found++;
      const [lo, hi] = BOUND[level];
      if (g.steps < lo || g.steps > hi) wrong = `${g.src} = ${g.steps} steps`;
    }
    ok(`make one up produces a ${level} problem`, found > 0);
    ok(`and it lands in the ${level} band`, !wrong, wrong);
  }
}

const summary = `RESULT pass=${pass} fail=${fail}`;
const el = document.getElementById('out');
el.textContent = summary + '\n\n' + log.join('\n') + '\n\nDERIVATIONS\n' +
  derivations.map(([n, s, tg, r]) =>
    `\n${n}\n  ${s}   (cost ${cost(parse(s).expr)})\n  minimum ` +
    `${toText(tg.node)} (cost ${tg.cost})\n` +
    r.path.map((st) => `  = ${toText(st.node).padEnd(34)} ${label(st.group)}`)
      .join('\n')).join('\n');
document.title = summary;
