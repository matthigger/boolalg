/* Interaction tests: drives the real app through window.BAE and checks
   what a click would do, since the behaviours that matter here (rule
   application, region toggling, hints, the reset rules of SPEC.md
   section 4.1) cannot be covered by testing pure functions. */

import { mask, cost, key, focus } from './core.js';
import { parse, toText } from './text.js';

const log = [];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => c ? (pass++, log.push(`  ok   ${n}`))
                               : (fail++, log.push(`  FAIL ${n} ${d}`));
const eqv = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

setTimeout(() => {
  const B = window.BAE;
  if (!B) { document.getElementById('out').textContent =
    'RESULT pass=0 fail=1\nno window.BAE'; return; }
  const S = B.S;

  /* -- drag snapping (SPEC.md 5.2) -- */
  B.load('(C & B) | (~C & B) | (A & ~B)', 'logic');
  const e = S.lines[0].expr;
  eqv('three terms', e.ts.length, 3);
  {
    const s1 = B.unify(e, [1], [2]);
    eqv('adjacent run', `${s1.from}-${s1.to}`, '1-3');
    eqv('run renders', toText(focus(e, s1)), '(¬C ∧ B) ∨ (A ∧ ¬B)');
    const s2 = B.unify(e, [0], [2]);
    ok('a full-width drag is the whole chain', s2.from === null);
    const s3 = B.unify(e, [0, 0], [0, 1]);
    eqv('a drag inside one term stays there', s3.path.join(), '0');
    // Inside term 0 to inside term 2 spans every term, so the answer
    // is the whole chain rather than a partial run.
    const s4 = B.unify(e, [0, 0], [2, 1]);
    ok('a drag spanning all terms is the whole chain',
       s4.path.length === 0 && s4.from === null);
    const s6 = B.unify(e, [0, 0], [1, 1]);
    ok('a drag spanning two of three terms is that run',
       s6.from === 0 && s6.to === 2);
    const s5 = B.unify(e, [1], [1]);
    ok('a click is one subtree', s5.from === null && s5.path.join() === '1');
  }

  /* -- the user's worked example: Commutative then Complement -- */
  B.load('~A | ~B | A', 'logic');
  {
    const m0 = mask(S.lines[0].expr, S.nv);
    S.sel = { path: [], from: 1, to: 3 };            // ¬B ∨ A
    eqv('selected the run', toText(focus(S.lines[0].expr, S.sel)), '¬B ∨ A');
    B.applyRule('Commutative', B.available().get('Commutative'));
    eqv('commuted in place', toText(S.lines[1].expr), '¬A ∨ A ∨ ¬B');
    eqv('labelled Commutative', S.lines[1].rule, 'Commutative');
    S.sel = { path: [], from: 0, to: 2 };            // ¬A ∨ A
    B.applyRule('Complement', B.available().get('Complement'));
    eqv('complement fired', toText(S.lines[2].expr), 'T ∨ ¬B');
    B.S.sel = null;
    B.applyRule('Domination', B.available().get('Domination'));
    eqv('dominated to T', toText(S.lines[3].expr), 'T');
    ok('every line has the same mask',
       S.lines.every((l) => mask(l.expr, S.nv) === m0));
    ok('no Associative step was needed',
       !S.lines.some((l) => l.rule === 'Associative'));
  }

  /* -- Associative is inert (SPEC.md 5.2.2) -- */
  B.load('A | B | C', 'logic');
  ok('Associative offers nothing', !B.available().has('Associative'));

  /* -- rule application never changes the picture -- */
  B.load('(A u B)^C', 'sets');
  {
    const before = mask(S.lines[0].expr, S.nv);
    B.applyRule("DeMorgan's", B.available().get("DeMorgan's"));
    eqv('DeMorgan applied', toText(S.lines[1].expr, 'sets', S.letters),
        'Aᶜ ∩ Bᶜ');
    eqv('shading unchanged', mask(S.lines[1].expr, S.nv), before);
    eqv('a line was appended', S.lines.length, 2);
  }

  /* -- toggling the viewer replaces the derivation (SPEC.md 4.1) -- */
  {
    const n = S.lines.length;
    const before = mask(S.lines.at(-1).expr, S.nv);
    B.toggleRegion(0);
    eqv('derivation reset to one line', S.lines.length, 1);
    ok('mask changed by exactly one region',
       (mask(S.lines[0].expr, S.nv) ^ before) === 1);
    ok('selection cleared', S.sel === null);
  }

  /* -- hints and simplify (SPEC.md 7.1) -- */
  B.load('(C & B) | (~C & B) | (A & ~B)', 'logic');
  {
    const p = B.plan();
    ok('a plan exists', !!p && p.ok);
    eqv('target is A or B', toText(p.t.node), 'A ∨ B');
    B.doHint(1);
    ok('hint selects something', S.sel !== null);
    ok('hint note is about the expression', /highlighted/.test(S.note));
    B.doHint(2);
    ok('second hint names a rule', /use /.test(S.note));
    const before = S.lines.length;
    B.applyNext();
    eqv('apply adds one line', S.lines.length, before + 1);
    B.runAll();
    // Term order is whatever the rules produced. Normalising it would
    // be an unlabelled Commutative step, so it is left alone.
    ok('run to end reaches a minimal form',
       ['A ∨ B', 'B ∨ A'].includes(toText(S.lines.at(-1).expr)),
       toText(S.lines.at(-1).expr));
    ok('every step is labelled', S.lines.slice(1).every((l) => !!l.rule));
    const m0 = mask(S.lines[0].expr, S.nv);
    ok('every step preserves meaning',
       S.lines.every((l) => mask(l.expr, S.nv) === m0));
    ok('cost strictly falls to the minimum',
       cost(S.lines.at(-1).expr) === 1);
    // A finished derivation must not also claim the search failed.
    ok('no stray "no derivation found" once minimal',
       !/no derivation found/.test(S.note), S.note);
    ok('plan reports done, not failed', B.plan().done === true &&
       B.plan().ok === true);
  }

  /* -- difference is inert until defined (SPEC.md 8.3) -- */
  B.load('(A u B) - C', 'sets');
  {
    const av = B.available();
    ok('only Definition applies to a difference',
       [...av.keys()].join() === 'Definition');
    B.applyRule('Definition', av.get('Definition'));
    ok('difference expanded to intersection with a complement',
       /∩/.test(toText(S.lines[1].expr, 'sets', S.letters)));
    ok('now the handout laws are live', B.available().size > 1);
  }

  /* -- mode toggle keeps the derivation (SPEC.md 4.1) -- */
  B.load('(A u B)^C', 'sets');
  {
    B.applyRule("DeMorgan's", B.available().get("DeMorgan's"));
    const before = S.lines.map((l) => key(l.expr));
    S.mode = 'logic';
    B.render();
    ok('lines survive a mode toggle',
       S.lines.map((l) => key(l.expr)).join() === before.join());
    eqv('and read in the other notation', toText(S.lines[1].expr, 'logic'),
        '¬A ∧ ¬B');
  }

  /* -- the DOM actually rendered -- */
  B.load('(A & B) | ~C', 'logic');
  ok('expression spans carry paths',
     document.querySelectorAll('#lines .nd[data-path]').length > 3);
  ok('a truth table was drawn',
     document.querySelectorAll('#viewer table.tt tbody tr').length === 8);
  ok('a circuit was drawn',
     document.querySelectorAll('#viewer svg.circuit .gate').length >= 3);
  B.S.mode = 'sets'; B.render();
  ok('a venn was drawn',
     document.querySelectorAll('#viewer svg.venn .vregion').length === 8);
  ok('rule rows rendered',
     document.querySelectorAll('#rules .rule-row').length === 11);

  /* -- the page is actually clickable ------------------------------
     These exist because a `.overlay { display: flex }` rule once beat
     the UA's `[hidden] { display: none }`, leaving the modal backdrop
     permanently over the page. Every test above still passed, because
     they call functions rather than click. Hit-test the real page. */

  function covering(node) {
    if (!node) return 'missing';
    node.scrollIntoView({ block: 'center' });
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return 'zero-size';
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return 'offscreen';
    const top = document.elementFromPoint(x, y);
    if (!top) return 'nothing there';
    if (top === node || node.contains(top) || top.contains(node)) return null;
    return top.id || top.className || top.tagName;
  }

  B.load('(A u B)^C', 'sets');
  const ov = document.getElementById('overlay');
  eqv('backdrop is display:none while hidden',
      getComputedStyle(ov).display, 'none');
  const tst = document.getElementById('toast');
  tst.hidden = true;              // an earlier test may have raised it
  eqv('toast is display:none while hidden',
      getComputedStyle(tst).display, 'none');
  tst.hidden = false;
  eqv('a visible toast never eats clicks',
      getComputedStyle(tst).pointerEvents, 'none');
  tst.hidden = true;

  for (const [name, q] of [
    ['a rule button', '#rules .rule-row button.r'],
    ['a law info button', '#rules .rule-row button.info'],
    ['the mode toggle', '#modeToggle button'],
    ['the Simplify button', '#simplify'],
    ['the expression input', '#src'],
    ['the viewer', '#viewer svg'],
    ['an expression term', '#lines .nd'],
  ]) {
    const node = document.querySelector(q);
    const c = covering(node);
    ok(`${name} is reachable by a click`, c === null, `covered by ${c}`);
  }

  /* -- real clicks, dispatched through the DOM -- */
  {
    const n0 = S.lines.length;
    const btn = [...document.querySelectorAll('#rules .rule-row button.r')]
      .find((b) => b.textContent.trim().startsWith('DeMorgan'));
    ok('the DeMorgan button is enabled', !!btn && !btn.disabled);
    btn.click();
    eqv('a real click applies the rule', S.lines.length, n0 + 1);
  }
  {
    document.querySelector('#modeToggle button[data-mode="logic"]').click();
    eqv('a real click switches mode', S.mode, 'logic');
    document.querySelector('#modeToggle button[data-mode="sets"]').click();
    eqv('and switches back', S.mode, 'sets');
  }
  {
    document.querySelector('#rules .rule-row button.info').click();
    ok('a real click opens the law card',
       !ov.hidden && getComputedStyle(ov).display === 'flex');
    ok('the card rendered', !!document.querySelector('#overlay .card'));
    const dismiss = [...document.querySelectorAll('#overlay .cardfoot button')]
      .find((b) => b.textContent === 'dismiss');
    dismiss.click();
    ok('dismiss closes it',
       ov.hidden && getComputedStyle(ov).display === 'none');
    ok('and the page is clickable again',
       covering(document.getElementById('simplify')) === null);
  }
  {
    const n0 = S.lines.length;
    document.querySelector('#viewer svg.venn').dispatchEvent(
      new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));
    ok('a real click on the diagram replaces the derivation',
       S.lines.length === 1 || S.lines.length !== n0);
  }

  document.getElementById('out').textContent =
    `RESULT pass=${pass} fail=${fail}\n\n` + log.join('\n');
  document.title = `pass=${pass} fail=${fail}`;
}, 120);
