/* Interaction tests: drives the real app through window.BAE and checks
   what a click would do, since the behaviours that matter here (rule
   application, region toggling, hints, the reset rules of SPEC.md
   section 4.1) cannot be covered by testing pure functions. */

import { mask, cost, key, focus } from './core.js';
import { parse, toText } from './text.js';
import { GROUPS } from './rules.js';
import * as Ex from './export.js';

const log = [];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => c ? (pass++, log.push(`  ok   ${n}`))
                               : (fail++, log.push(`  FAIL ${n} ${d}`));
const eqv = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
const notnOf = (m) => (m === 'sets' ? 'sets' : 'logic');

setTimeout(async () => {
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
    ok('sets reads in set symbols', /∪/.test(shown()), shown());
    B.S.mode = 'circuit'; B.render();
    ok('circuit reads in logic symbols', /∨/.test(shown()), shown());

    // The variable count follows the expression now that there is no
    // picker; a fourth variable is more than the Venn can draw, so it
    // moves the view rather than dropping the variable.
    B.load('A u B u C', 'sets');
    eqv('three sets stay in sets', B.S.mode, 'sets');
    eqv('and the count follows the expression', B.S.nv, 3);
    B.load('A u B u C u D', 'sets');
    eqv('a fourth variable leaves sets', B.S.mode, 'logic');
    eqv('keeping all four', B.S.nv, 4);
    B.load('A u B', 'sets');
    eqv('and a smaller one narrows again', B.S.nv, 2);
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

  /* -- the example catalogue (SPEC.md 3.1) -- */
  {
    const card = () => document.querySelector('#overlay .card');
    const shut = () => [...card().querySelectorAll('.cardfoot button')]
      .find((b) => b.textContent === 'dismiss').click();

    B.load('A u B', 'sets');
    document.getElementById('examplesBtn').click();
    eqv('three difficulties',
        [...card().querySelectorAll('.extag')].map((n) => n.textContent).join(),
        'mild,medium,spicy');
    eqv('each can make one up',
        card().querySelectorAll('button.makeup').length, 3);
    ok('and each lists some',
       [...card().querySelectorAll('.exlist')]
         .every((l) => l.children.length >= 4));

    const first = card().querySelector('.exlist button');
    const wanted = first.querySelector('.ex-e').textContent;
    first.click();
    ok('clicking one loads it', !!B.S.lines.length);
    eqv('the one that was clicked',
        toText(B.S.lines[0].expr, notnOf(B.S.mode), B.S.letters), wanted);
    ok('and the card gets out of the way',
       document.getElementById('overlay').hidden);

    document.getElementById('examplesBtn').click();
    const before = toText(B.S.lines[0].expr, 'logic', B.S.letters);
    [...card().querySelectorAll('button.makeup')]
      .find((b) => b.closest('.exgroup').querySelector('.extag')
        .textContent === 'mild').click();
    ok('make one up loads a fresh problem', !!B.S.lines.length);
    ok('and there is something to do with it',
       B.plan() && !B.plan().done);
    if (!document.getElementById('overlay').hidden) shut();
  }

  /* -- law cards (SPEC.md 6.3) -- */
  {
    const info = (name) => [...document.querySelectorAll('.rule-row')]
      .find((r) => r.querySelector('button.r').textContent.startsWith(name))
      .querySelector('.info');
    const card = () => document.querySelector('#overlay .card');
    const shut = () => [...card().querySelectorAll('.cardfoot button')]
      .find((b) => b.textContent === 'dismiss').click();

    B.load('(A u B)^C', 'logic');
    info("DeMorgan").click();
    const sides = [...card().querySelectorAll('.lawgrid .side')];
    eqv('a law card shows two sides', sides.length, 2);
    const [r0, r1] = sides.map((n) => n.getBoundingClientRect());
    ok('side by side, not stacked', r1.left >= r0.right - 1,
       `${r0.right} then ${r1.left}`);
    eqv('and level with each other', Math.round(r0.top), Math.round(r1.top));
    ok('no essay on both sides agreeing',
       !card().textContent.includes('pick out exactly the same'));
    ok('an intuition is offered',
       card().querySelector('.lawwhy').textContent.length > 40);

    // Clicking a part re-points that side's table at the part.
    const side0 = sides[0];
    const cols = () => side0.querySelectorAll('table.tt thead th').length;
    const before = cols();
    // Re-query each time: drawing rebuilds the spans, so a reference
    // taken before a click is detached by the time of the next one.
    const part = () => [...side0.querySelectorAll('.t .nd')]
      .find((n) => n.dataset.path !== '[]');
    const path = part().dataset.path;
    part().click();
    ok('clicking a part adds its column', cols() > before,
       `${before} then ${cols()}`);
    ok('and says what it is showing',
       side0.querySelector('.sidecap').textContent.startsWith('showing'));
    const again = [...side0.querySelectorAll('.t .nd')]
      .find((n) => n.dataset.path === path);
    again.click();
    eqv('clicking it again clears', cols(), before);
    shut();

    B.load('(A u B)^C', 'sets');
    info("DeMorgan").click();
    const venns = card().querySelectorAll('.lawgrid .side svg.venn');
    eqv('sets mode draws two Venns', venns.length, 2);
    const nd = [...card().querySelectorAll('.side .t .nd')]
      .find((n) => n.dataset.path !== '[]');
    nd.click();
    ok('clicking a part shades what it picks out',
       card().querySelectorAll('.side .vregion.sel').length > 0);
    shut();

    // Every law has to speak both notations.
    for (const g of GROUPS.flat()) {
      info(g).click();
      ok(`${g} explains itself`,
         card().querySelector('.lawwhy').textContent.length > 30);
      shut();
    }
  }

  /* -- undoing the last step -- */
  {
    B.load('(C & B) | (~C & B) | (A & ~B)', 'logic');
    const undos = () => [...document.querySelectorAll('#lines .undo')];
    eqv('a lone starting line offers no undo', undos().length, 0);

    B.applyNext();
    B.applyNext();
    ok('two steps ran', S.lines.length === 3, `${S.lines.length} lines`);
    eqv('and only the last carries an undo', undos().length, 1);
    const lastRow = document.querySelectorAll('#lines .dline')[2];
    ok('which sits on the last line', lastRow.contains(undos()[0]));

    const before = toText(S.lines[1].expr, 'logic');
    undos()[0].click();
    eqv('clicking it drops that step', S.lines.length, 2);
    eqv('leaving the line above untouched',
        toText(S.lines.at(-1).expr, 'logic'), before);
    eqv('and the undo moves up with it', undos().length, 1);

    undos()[0].click();
    eqv('undoing back to the start', S.lines.length, 1);
    eqv('leaves nothing to undo', undos().length, 0);
  }

  /* -- the operator pad and LaTeX entry (SPEC.md 5.4) -- */
  {
    const inp = document.getElementById('src');
    const pad = () => [...document.querySelectorAll('#opPad button')];

    B.load('A u B', 'sets');
    eqv('the pad offers intersection in sets', pad()[0].textContent, '∩');
    eqv('and postfix complement', pad()[2].textContent, 'xᶜ');
    B.load('A u B', 'logic');
    eqv('the pad follows the notation', pad()[0].textContent, '∧');
    eqv('and prefix negation', pad()[2].textContent, '¬');

    inp.value = 'A';
    inp.setSelectionRange(1, 1);
    pad()[1].click();
    eqv('a pad key inserts at the caret', inp.value, 'A ∨ ');

    inp.value = 'A';
    inp.setSelectionRange(0, 0);
    pad()[1].click();
    eqv('at the caret, not the end', inp.value, ' ∨ A');

    inp.value = 'A \\cup B \\cap \\overline{C}';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    eqv('LaTeX parses', toText(B.S.lines[0].expr, 'logic'), 'A ∨ (B ∧ ¬C)');
    eqv('and echoes back as glyphs', inp.value, 'A ∨ (B ∧ ¬C)');
  }

  /* -- exports (SPEC.md 13) -- */
  {
    const bar = (sel) => [...document.querySelectorAll(sel + ' button.exp')]
      .map((b) => b.textContent);

    B.load('(C & B) | (~C & B)', 'logic');
    eqv('the table offers three formats',
        bar('.tt-pane h2 .exports').join(), 'png,csv,tex');
    eqv('the derivation offers both a picture and LaTeX',
        bar('#exprExport .exports').join(), 'png,tex');

    B.S.mode = 'circuit'; B.render();
    const panes = [...document.querySelectorAll('#viewer .pane')];
    eqv('the circuit offers a png',
        [...panes.at(-1).querySelectorAll('h2 .exports button.exp')]
          .map((b) => b.textContent).join(), 'png');
    ok('and the table keeps its own three',
       bar('.tt-pane h2 .exports').join() === 'png,csv,tex');

    const d = Ex.tableData({ expr: B.S.lines[0].expr, nv: 3,
      letters: B.S.letters, mode: 'logic',
      mask: mask(B.S.lines[0].expr, 3), showWork: false });
    const c = Ex.tablePNG(d, 1);
    ok('the table renders to a canvas', c.width > 80 && c.height > 80,
       `${c.width}x${c.height}`);
    eqv('one row per assignment, plus a header',
        c.height, 34 + 8 * 30);

    B.applyNext();
    const dc = Ex.derivationPNG(B.S.lines, 'logic', B.S.letters, null, 1);
    ok('the derivation renders to a canvas', dc.width > 100,
       `${dc.width}x${dc.height}`);
    eqv('one row per line', dc.height, 18 * 2 + B.S.lines.length * 34);

    // Step marks: the toggle drives the pane and both exports together.
    const seg = (v) => [...document.querySelectorAll('#markToggle button')]
      .find((b) => b.textContent === v);
    ok('the marks are on to begin with', B.S.annotate);
    eqv('and the segment shows it',
        seg('on').getAttribute('aria-selected'), 'true');
    eqv('with the other side unselected',
        seg('off').getAttribute('aria-selected'), 'false');
    ok('the pane paints them',
       document.querySelectorAll('#lines .nd.after').length > 0);
    ok('the marks reach the exports', B.stepMarks().some((m) => m.length));

    const texOn = Ex.derivationTeX(B.S.lines, 'logic', B.S.letters,
                                   B.stepMarks());
    ok('annotated tex defines the macro', texOn.includes('\\providecommand{\\bastep}'));
    ok('and marks a subtree with it', texOn.includes('\\bastep{bastep1}{'));
    ok('and defines the colour it names', texOn.includes('\\definecolor{bastep1}'));
    ok('still an align*', texOn.includes('\\begin{align*}'));

    seg('off').click();
    ok('toggling off clears the state', !B.S.annotate);
    eqv('the pane stops painting them',
        document.querySelectorAll('#lines .nd.after').length, 0);
    ok('and nothing is marked for export',
       B.stepMarks().every((m) => m.length === 0));
    const texOff = Ex.derivationTeX(B.S.lines, 'logic', B.S.letters,
                                    B.stepMarks());
    ok('unannotated tex needs no macro', !texOff.includes('\\bastep'));
    ok('but still names the laws', texOff.includes('\\text{'));
    seg('on').click();
    ok('and it toggles back on', B.S.annotate);

    const g = document.querySelector('#viewer svg.circuit');
    ok('the circuit is on the page', !!g);
    const cc = await Ex.svgPNG(g, 1);
    ok('and rasterises', cc.width > 20 && cc.height > 20,
       `${cc.width}x${cc.height}`);
    // A blank raster is the failure mode that looks like success.
    const px = cc.getContext('2d')
      .getImageData(0, 0, cc.width, cc.height).data;
    let ink = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] < 240 || px[i + 1] < 240 || px[i + 2] < 240) ink++;
    }
    ok('with something actually drawn on it', ink > 100, `${ink} dark px`);

    B.S.mode = 'logic'; B.render();
  }

  document.getElementById('out').textContent =
    `RESULT pass=${pass} fail=${fail}\n\n` + log.join('\n');
  document.title = `pass=${pass} fail=${fail}`;
}, 120);
