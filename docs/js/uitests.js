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

  /* -- a real drag, through the DOM. The handlers paint the spans as
     the mouse moves and then call render(), which rebuilds them, so
     these check the highlight is still there afterwards -- and that
     nothing invisible is sitting on top eating the events. -- */
  B.load('(C & B) | (~C & B) | (A & ~B)', 'logic');
  {
    const span = (p) => [...document.querySelectorAll('#lines .dline.active .nd')]
      .find((n) => n.dataset.path === JSON.stringify(p));
    const fire = (n, t) => n.dispatchEvent(
      new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    const lit = () => [...document.querySelectorAll('#lines .nd.sel')]
      .map((n) => n.textContent).join(' | ');

    fire(span([0]), 'mousedown');
    fire(span([1]), 'mousemove');
    fire(span([1]), 'mouseup');
    ok('a drag records the run', S.sel && S.sel.from === 0 && S.sel.to === 2,
       JSON.stringify(S.sel));
    eqv('and the highlight survives the render', lit(),
        '(C ∧ B) | (¬C ∧ B)');
    ok('the rail narrowed to the selection',
       !B.available().has('Absorption'));

    // Overshooting the expression is the common case, not an error.
    fire(span([1]), 'mousedown');
    fire(span([2]), 'mousemove');
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    ok('a release off the expression still commits',
       S.sel && S.sel.from === 1 && S.sel.to === 3, JSON.stringify(S.sel));
    eqv('with the run it was dragged over', lit(), '(¬C ∧ B) | (A ∧ ¬B)');

    const o = document.getElementById('overlay');
    eqv('a hidden overlay is really gone', getComputedStyle(o).display, 'none');
    const r = span([0]).getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    ok('the expression is what the mouse hits',
       !!(hit && hit.closest('.nd')), hit ? `hit ${hit.id || hit.className}` : 'hit nothing');
  }

  /* -- a notice must not eat the control it covers (SPEC.md 11) -- */
  {
    const t = document.getElementById('toast');
    t.textContent = 'editing the diagram replaces the derivation';
    t.hidden = false;
    eqv('a visible toast lets clicks through',
        getComputedStyle(t).pointerEvents, 'none');
    const inp = document.getElementById('src');
    const r = inp.getBoundingClientRect();
    const under = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    eqv('so the input under it is still what the mouse hits',
        under && under.id, 'src');
    t.hidden = true;
  }

  /* -- each view draws its own things, and only its own -- */
  B.load('(A & B) | ~C', 'logic');
  ok('expression spans carry paths',
     document.querySelectorAll('#lines .nd[data-path]').length > 3);
  ok('logic draws a truth table',
     document.querySelectorAll('#viewer table.tt tbody tr').length === 8);
  ok('logic draws no circuit',
     document.querySelectorAll('#viewer svg.circuit').length === 0);
  B.S.mode = 'circuit'; B.render();
  ok('circuit keeps the truth table',
     document.querySelectorAll('#viewer table.tt tbody tr').length === 8);
  ok('circuit adds the circuit',
     document.querySelectorAll('#viewer svg.circuit .gate').length >= 3);
  B.S.mode = 'sets'; B.render();
  ok('sets draws a venn',
     document.querySelectorAll('#viewer svg.venn .vregion').length === 8);
  ok('sets draws no truth table',
     document.querySelectorAll('#viewer table.tt').length === 0);
  ok('rule rows rendered',
     document.querySelectorAll('#rules .rule-row').length === 11);

  /* -- the view picks the notation: circuit reads as logic, not sets -- */
  B.load('(A u B)^C', 'sets');
  {
    const shown = () => document.querySelector('#lines .expr').textContent;
    const four = () => [...document.querySelectorAll('#varPick button')]
      .find((b) => b.textContent === '4');
    ok('sets reads in set symbols', /∪/.test(shown()), shown());
    ok('four sets is refused', four().disabled);
    B.S.mode = 'circuit'; B.render();
    ok('circuit reads in logic symbols', /∨/.test(shown()), shown());
    ok('four variables is allowed', !four().disabled);
  }

  /* -- leaving the table stops tracing. The circuit used to stay stuck
     on whichever row the pointer last touched. -- */
  B.load('(A & B) | ~C', 'circuit');
  {
    const head = () => document.querySelectorAll('#viewer .pane h2')[1].textContent;
    const marked = () => document.querySelectorAll('#viewer tr.hov').length;
    const rows = document.querySelectorAll('#viewer table.tt tbody tr');
    rows[3].dispatchEvent(new MouseEvent('mouseenter'));
    eqv('hovering a row traces it', S.hoverRow, 3);
    eqv('exactly one row is marked', marked(), 1);
    ok('the circuit names that row', /row /.test(head()), head());

    document.querySelector('#viewer .ttwrap')
      .dispatchEvent(new MouseEvent('mouseleave'));
    ok('leaving the table clears the trace', S.hoverRow === null);
    eqv('no row stays marked', marked(), 0);
    ok('and the circuit drops the row', !/row /.test(head()), head());
  }

  /* -- a law may add and drop working columns, but A, B, C must not
     slide sideways while the reader is looking at them -- */
  B.load('(C & B) | (~C & B) | (A & ~B)', 'logic');
  {
    const varXs = () => [...document.querySelectorAll('#viewer thead th.var')]
      .map((th) => Math.round(th.getBoundingClientRect().x)).join();
    const wrapBox = () => {
      const b = document.querySelector('#viewer .ttwrap').getBoundingClientRect();
      return `${Math.round(b.x)}+${Math.round(b.width)}`;
    };
    const cols = () => document.querySelectorAll('#viewer thead th.sub').length;

    // Walk the whole derivation, not one step: the column count rises
    // and falls along the way, and the variables have to sit still for
    // all of it. The table itself is meant to narrow as columns go --
    // it is the wrapper that is pinned, and the wrapper that keeps the
    // variables where they were.
    const places = new Set(), wraps = new Set(), counts = new Set();
    for (let i = 0; i < 12; i++) {
      places.add(varXs()); wraps.add(wrapBox()); counts.add(cols());
      const p = B.plan();
      if (!p || p.done || !p.ok) break;
      B.applyNext();
    }
    ok('the derivation ran several steps', S.lines.length > 3,
       `${S.lines.length} lines`);
    ok('and varied the working columns', counts.size > 1, [...counts].join());
    ok('right down to none at all', counts.has(0), [...counts].join());
    eqv('A, B, C never moved', places.size, 1);
    eqv('and the wrapper never moved or resized', wraps.size, 1);
  }

  document.getElementById('out').textContent =
    `RESULT pass=${pass} fail=${fail}\n\n` + log.join('\n');
  document.title = `pass=${pass} fail=${fail}`;
}, 120);
