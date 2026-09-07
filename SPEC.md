# Boolean Algebra Explorer — Specification

A browser tool for CS1800 (Discrete Structures) that lets students see an
algebraic identity act on a picture. The same expression is shown three
ways at once — as symbols, as a derivation, and as a semantic picture (Venn
diagram or truth table + circuit) — so that applying DeMorgan's law is
visibly a rewrite that *does not change the picture*.

Source of truth for the rule set is the course handout
`reference/logic_set_identities.pdf` (transcribed in Appendix A).

Status: specification. Nothing implemented yet.

---

## 1. Goals

1. A student reads an expression like `(A ∪ B)^C` and sees which Venn
   regions it denotes, without evaluating it in their head.
2. A student applies a named identity to a *selected part* of an
   expression and watches the symbols change while the picture holds
   still. The invariance is the lesson.
3. A student toggles the picture (shade a region / flip a truth-table
   output) and gets an expression back, closing the loop in the other
   direction.
4. A student sees that logic and set algebra are one algebra in two
   costumes, by flipping a switch and watching every symbol swap.
5. A student can ask for a minimal form and read the rule-by-rule
   derivation that gets there, rather than just the answer.

Non-goals: proofs beyond propositional/set identities, quantifiers,
predicate logic, circuit timing or gate-delay, more than 4 variables,
user accounts, saved work beyond a shareable URL.

---

## 2. The core idea: one model, two costumes

With `n` variables there are exactly `2^n` atomic cases. In logic these
are the truth-table rows; in set algebra they are the Venn regions. They
are the same `2^n` things.

So every expression is fully described, semantically, by a **mask**: a
`2^n`-bit integer where bit `r` is 1 iff the expression is true on case
`r` (equivalently: contains region `r`).

This single representation drives everything:

| feature | implementation |
|---|---|
| Venn shading | fill region `r` iff bit `r` of mask is set |
| truth-table output column | row `r` shows bit `r` of mask |
| mode toggle | re-render the same mask and AST; no re-derivation |
| click region / flip output cell | flip bit `r`, then synthesize an expression |
| rule application is meaning-preserving | mask before == mask after |
| "is the student's step legal?" | compare masks |
| simplify | search for a cheaper AST with the *same* mask |

Consequence worth stating plainly, because it is the pedagogy: **the
viewer is a function of the mask, and every rule in Appendix A preserves
the mask.** Applying rules therefore never changes the picture. The tool
asserts this on every rewrite (§9.4), so a shading that jumps is a bug in
the tool, not a subtlety in the math.

### 2.1 Case indexing (fixed convention)

Variables are ordered `v_0 .. v_{n-1}` — `A, B, C, D` in sets mode,
`P, Q, R, S` in logic mode. For case index `r`:

    v_i is true  iff  (r >> (n - 1 - i)) & 1

So `v_0` is the most significant bit and the table counts upward in
binary: for `n = 3` the rows are `000, 001, 010, 011, 100, 101, 110,
111`, as required. Row `000` is first.

In sets mode the same `r` names a Venn region by membership pattern.
Region `0` is **outside every circle** — a real, clickable, shadeable
region, not background. It is needed for `A^C ∩ B^C`, and `U` shades it
along with the rest.

---

## 3. Screen layout

Single page, three panes plus a header. No scrolling of the whole page on
a laptop screen; panes scroll internally.

    ┌──────────────────────────────────────────────────────────────┐
    │  Boolean Algebra Explorer      [ SETS | LOGIC ]   vars: 2 3 4│
    ├────────────────────────────────────┬─────────────────────────┤
    │  VIEWER                            │  ALGEBRA                │
    │                                    │                         │
    │  sets:  Venn diagram, per-region   │  Associative            │
    │         shading, regions clickable │  Double Negation        │
    │                                    │  DeMorgan's        [x2] │
    │  logic: truth table (all 2^n rows) │  Distributive      [x2] │
    │         + circuit for current line │  Absorption        [x2] │
    │         row hover traces the wires │  Complement        [x2] │
    │                                    │  Idempotent        [x2] │
    ├────────────────────────────────────┤  Identity          [x2] │
    │  EXPRESSION                        │  Domination        [x2] │
    │                                    │  Commutative*      [x2] │
    │    (A ∪ B)^C                       │                         │
    │  = A^C ∩ B^C     DeMorgan's        │  [ Simplify ]           │
    │  = ...                             │  [ Reset ] [ Share ]    │
    └────────────────────────────────────┴─────────────────────────┘

The `[ SETS | LOGIC ]` toggle is the only mode control and sits top
centre. Variable count is a small segmented control beside it.

`*` Commutative is not on the handout; see §8.2.

---

## 4. Data model

```ts
type Op = 'and' | 'or' | 'not';

type Node =
  | { kind: 'var';   index: number }            // 0-based, < n
  | { kind: 'const'; value: boolean }           // T/F  ==  U/∅
  | { kind: 'not';   arg: Node }
  | { kind: 'and' | 'or'; left: Node; right: Node };

interface Line {
  expr: Node;
  mask: number;          // 2^n bits; invariant: same for every line
  rule: string | null;   // label shown at right; null for line 0
  span: Path | null;     // subtree rewritten, for highlighting
}

interface State {
  mode: 'sets' | 'logic';
  n: 2 | 3 | 4;
  lines: Line[];
  selection: Path | null;  // path from root of the *selected* line
  selectedLine: number;    // which line the viewer/circuit reflects
}
```

Binary operators only — `and`/`or` take exactly two arguments. This
matches the handout (which writes `(P ∨ Q) ∨ R`, never `P ∨ Q ∨ R`) and
matches 2-input gates in the circuit. Associativity is therefore a rule
the student applies, not something the renderer hides.

A `Path` is a list of `'left' | 'right' | 'arg'` steps from the root.
Paths, not character offsets, are the unit of selection.

Internally the simplifier also uses a flattened n-ary form and the mask;
that is an implementation detail of §7 and never surfaces in the AST the
student sees.

`mask` for `n = 4` needs 16 bits, so a plain JS `number` suffices
throughout; no BigInt.

### 4.1 What resets what

Every action falls into one of three buckets. Getting this table wrong
is the most likely source of a confusing tool, because two of the
buckets look similar on screen.

| action | mask | derivation | selection |
|---|---|---|---|
| toggle SETS/LOGIC | keep | keep | keep |
| change notation | keep | keep | keep |
| select a subtree | keep | keep | set |
| apply a rule | keep | append a line | follow the rewrite |
| Simplify | keep | append steps | clear |
| undo / redo | per history | per history | per history |
| delete last line | keep | drop a line | clamp to last line |
| click a Venn region | **flip a bit** | **reset to one line** | clear |
| flip a truth-table cell | **flip a bit** | **reset to one line** | clear |
| type a new expression | recompute | **reset to one line** | clear |
| change `n` | re-seed | **reset to one line** | clear |
| Reset button | **back to seed** | **reset to seed** | clear |

Rule of thumb: the derivation survives exactly when the mask cannot
change. The bolded rows are the ones that can change it, and they
therefore discard the derivation — a derivation is a chain of
equalities, so a line whose mask differs from its predecessor's is not a
derivation at all. Every unbolded action preserves the mask, which is
why the viewer can be treated as stable while rules are applied.

---

## 5. Expression pane

### 5.1 Rendering

Each line renders the whole expression, with `=` and the rule label on
continuation lines:

        (A ∪ B)^C
      = A^C ∩ B^C          DeMorgan's
      = ...

Rendered from the AST into nested `<span>` elements, one per node, each
carrying its `Path`. **Not** KaTeX/MathJax: we need per-node hit
targets, hover affordances, and three simultaneous highlight states, and
custom spans give that directly. Unicode glyphs (`∪ ∩ ¬ ∅ ⊆`) plus
`<sup>C</sup>` are sufficient; no math typesetting is required.

Parenthesisation: a binary node nested inside another binary node is
always parenthesised, including same-operator nesting. Top level is
unparenthesised. `¬` binds tightest and takes no parens around a
variable or constant. This reproduces the handout exactly and makes
subtree boundaries unambiguous on screen — which matters because
subtrees are what students click.

### 5.2 Selection

Clicking any rendered node selects that subtree. Drag-selecting a
character range **snaps to the smallest subtree that fully covers the
range**, so a drag can never yield a non-expression like `A ∪`.
Clicking the operator glyph of a binary node selects that whole node.
Keyboard: arrow keys walk the tree (up = parent, left/right = sibling,
down = first child); `Esc` clears.

The selected subtree is outlined. On selection:

- **sets mode** — the Venn shades the *selection's* mask in the primary
  fill; the full line's mask is drawn as a thin outline behind it, with a
  caption naming which is which.
- **logic mode** — the truth table gains a column for the selection,
  placed left of the full-expression output column and headed by the
  selected subexpression; the circuit highlights the corresponding
  sub-network.

With nothing selected, the whole line is the implicit selection.

Selection lives on one line at a time (`selectedLine`). Selecting inside
an earlier line is allowed and is how a student inspects their own
derivation: the viewer follows.

### 5.3 Adding lines

A rule click (§6) appends one line. Lines are never edited in place. The
last line has a delete affordance (undo one step); full history is
undo/redo via `Ctrl-Z` / `Ctrl-Shift-Z`.

### 5.4 Entering an expression

A text input under the derivation accepts typed expressions in either
notation, tolerantly: `&`, `*`, `and`, `∧`, `∩` all parse to `and`;
`|`, `+`, `or`, `∨`, `∪` to `or`; `!`, `~`, `¬`, `'`, `^C`, and a
trailing `c` to `not`; `1`/`T`/`True`/`U` and `0`/`F`/`False`/`empty`/`∅`
to constants. Parse errors show a caret under the offending character
with a one-line message. A successful parse **replaces** the derivation
with a single line.

---

## 6. Algebra pane (the rules)

One entry per handout group, in handout order (Appendix A). Each group
holds one or two directed rewrites; DeMorgan's, for instance, holds the
`∨` form and the `∧` form.

Each rewrite is a pattern pair. Matching is structural, with pattern
variables binding whole subtrees, **modulo commutativity of `∧` and
`∨`**: the matcher tries both argument orders at every commutative node.
This is required even to use the handout as written — the handout gives
Identity as `∅ ∪ A = A`, and a student's expression will just as often
read `A ∪ ∅`.

### 6.1 Applicability

Whenever the selection changes, every rewrite is tested against the
selected subtree. Applicable rewrites are enabled; the rest are dimmed,
not hidden — a student should see that DeMorgan's exists and does not
apply here. Hovering an enabled rewrite previews the resulting line
ghosted at the bottom of the derivation.

Both directions are offered where the handout identity is useful in both
(e.g. Distributive expand *and* factor; Idempotent `P ∨ P → P` and its
reverse). Direction is chosen by which side matches the selection; when
both match, the pane shows two entries with explicit arrows. Expanding
directions are available to students but are not used by Simplify (§7).

### 6.2 Applying

Clicking an enabled rewrite:

1. rewrites the selected subtree in a copy of the selected line's AST;
2. appends a line with `rule` = the handout group name and `span` = the
   rewritten path;
3. re-highlights: the new line's rewritten part is flashed, then left
   subtly marked;
4. asserts the mask is unchanged (§9.4);
5. moves `selectedLine` to the new line and keeps the selection on the
   corresponding subtree, so rules can be chained without re-clicking.

The viewer does not move. That is the point.

---

## 7. Simplify

`Simplify` rewrites the selected line down to a cost-minimal equivalent
and shows every intermediate step, labelled with the handout rule used.

**Cost** = number of operator nodes in the AST (`∧`, `∨`, and each `¬`
count 1 apiece). Tie-break: fewer literal occurrences, then shallower
tree. This is a *formula* cost, not a sum-of-products cost, so factored
answers are allowed to win: `A ∧ (B ∨ C)` (cost 2) beats
`(A ∧ B) ∨ (A ∧ C)` (cost 3). Stating this matters because the usual
minimisation algorithms (Quine–McCluskey, Espresso) minimise minimal-SOP
term/literal count and will not always agree with it.

Two-stage, so the tool always knows the true target before it starts
searching for a pretty path to it:

**Stage 1 — target cost.**
- `n ≤ 3` (256 masks): exact dynamic program over all masks. For each
  mask, minimum cost is the cheapest of: a literal or constant if it is
  one; `1 + cost(¬m)`; `1 + cost(a) + cost(b)` over mask pairs combining
  to `m` under `∧` or `∨`. 256² splits is trivial to run in the browser
  and gives a provably minimal cost and witness.
- `n = 4` (65536 masks): the exact DP is too large for the browser, so
  take the best of minimal SOP and minimal POS via Quine–McCluskey plus
  a greedy factoring pass. Report the result as "minimal form found",
  not "provably minimal".

**Stage 2 — a derivation.** Best-first (A*) search over Appendix A
rewrites from the current AST, cost-so-far = steps, heuristic =
`ops(current) − targetCost`, with contracting rewrites preferred and
expanding rewrites allowed (distribution often has to go up before it
comes down). Caps: 20 000 expanded nodes, 40 steps, 2 s wall clock.

Outcomes:
- **target reached** — append every step, each labelled.
- **capped out** — append the best path found, then a final line showing
  the stage-1 witness marked `minimal form (derivation not found)`. Never
  silently present a non-minimal result as minimal.

Simplify is disabled when the line is already at target cost, with the
button captioned `already minimal`.

---

## 8. Sets mode

### 8.1 Venn viewer

Three circles of equal radius, centres on an equilateral triangle at
distance ≈ 0.55·r from the figure centre (the standard symmetric
3-Venn); two circles for `n = 2`; for `n = 4`, see §12.

Each of the `2^n` regions is an **independent SVG path**, precomputed
from circle–circle arc intersections, so regions fill and hit-test
individually. Region `0` is the enclosing rectangle with the circle
union subtracted (even-odd fill).

- Regions in the current mask are filled; others are unfilled.
- Hovering a region shows its minterm as a tooltip, e.g.
  `A ∩ B^C ∩ C`, and lifts its fill slightly.
- Circle labels `A`, `B`, `C` sit outside the circles at their edges.
- Fills use a single hue at varying opacity with a distinct outline for
  the selection-vs-line distinction of §5.2, chosen colourblind-safe and
  defined in one place in the stylesheet (no per-component colours).

### 8.2 Clicking regions

Clicking a region flips its bit. Because that changes the expression's
meaning, the derivation cannot be kept: the tool **synthesises a fresh
expression from the new mask and resets the derivation to a single
line**, exactly as the request specifies. A first click pops a small
inline notice ("editing the diagram replaces the derivation") with a
"don't show again" checkbox; subsequent clicks are immediate and undoable
via `Ctrl-Z`.

Synthesis uses the stage-1 minimal witness (§7), so clicking gives back a
tidy expression rather than a full 5-term sum of minterms. Special cases:
empty mask → `∅` (`F` in logic mode); full mask → `U` (`T`).

A `start from sum of minterms` option (off by default) instead seeds the
raw disjunction of the selected regions, which is the useful setting for
practising simplification. See §13, P1.

---

## 9. Logic mode

### 9.1 Truth table

`2^n` rows, all of them, counting upward in binary from `000` (§2.1).
Columns: one per variable, then the selection column if any (§5.2), then
the output column for the selected line. Header cells show the
subexpression they evaluate.

Clicking an output cell flips that bit, with the same reset semantics as
§8.2 — the two viewers are the same editor on the same mask.

### 9.2 Circuit

The circuit is a direct rendering of the **selected line's** AST: one
gate per operator node, standard distinctive-shape symbols (AND, OR,
inverter bubble for `¬`), variable inputs on the left, single output on
the right. Layered layout by longest path from the inputs; wires as
orthogonal polylines with junction dots where a variable fans out.

Because it tracks the selected line, the circuit visibly shrinks as the
student simplifies. That is the payoff of logic mode and should be
smooth: animate gate/wire removal rather than swapping the SVG.

### 9.3 Row hover → wire values

Hovering a truth-table row evaluates the AST under that row's
assignment, memoised per node, and labels **every wire** — each input,
each gate output, and the final output — with its `0` or `1`. Wires
carrying 1 are drawn in the active colour and slightly thicker; wires
carrying 0 stay neutral. The hovered row highlights simultaneously.

This is the audit path the request asks for: a student picks the row
where the circuit and their expectation disagree and reads the gate where
the values diverge. Hover is also reachable by keyboard (arrow keys move
a row cursor) and by click-to-pin, so the annotation can be held still
while looking at the circuit.

### 9.4 Mask assertion

After every rewrite, rule application, and simplify step, the tool
recomputes the mask from the new AST and compares it to the line's mask.
A mismatch is a rule-table bug. In development it throws; in production
it appends a visible `⚠ this step changed the meaning` marker rather than
lying to the student. This assertion is also the basis of the
property-based tests (§11).

---

## 10. Mode toggle and notation

Toggling `SETS`/`LOGIC` swaps glyphs and viewers only. The AST, mask,
every derivation line and every rule label are untouched — a derivation
started in sets mode reads correctly in logic mode.

| concept | logic | sets |
|---|---|---|
| conjunction | `∧` | `∩` |
| disjunction | `∨` | `∪` |
| complement | `¬P` | `A^C` |
| true / universe | `T` | `U` |
| false / empty | `F` | `∅` |
| variables | `P, Q, R, S` | `A, B, C, D` |
| viewer | truth table + circuit | Venn diagram |

The handout writes complement as a superscript `C` and notes bar
notation means the same; it also mixes `T`/`F` with `True`/`False`. The
tool offers a notation setting — `¬P` / `P̄` / `P'` for complement and
`T,F` / `1,0` for constants — defaulting to the handout's superscript-C
and `T`/`F`, and normalises `True`/`False` to `T`/`F` throughout.

---

## 11. Correctness and testing

The mask gives a cheap oracle for nearly everything, so the test suite
should be mostly properties rather than examples.

- **Every rule preserves meaning.** For each rewrite in Appendix B, over
  randomly generated ASTs and random matching subtrees: mask before ==
  mask after. This is the test that keeps the rule table honest.
- **Parse/render round-trip.** `parse(render(ast)) == ast` for random
  ASTs, in both notations and both modes.
- **Selection snapping.** For random ASTs and random character ranges,
  the snapped selection is a well-formed subtree whose rendered extent
  covers the range.
- **Simplify.** Result mask == input mask; result cost <= input cost;
  every emitted step is a legal application of the named rule; for
  `n <= 3`, result cost == the DP's provable minimum.
- **Minimisation cross-check.** For all 256 masks at `n = 3`, the DP
  witness evaluates back to its mask, and its cost is <= the
  Quine–McCluskey SOP cost.
- **Indexing.** Row `r`'s variable assignment matches §2.1 for all
  `n`; row 0 is all-false; the table counts upward.
- **Venn regions.** The `2^n` region paths are pairwise non-overlapping
  and together cover the figure (sampled-point test, since exact path
  algebra is not worth testing analytically).

Example-based tests: each handout identity as written, in both columns,
applied to its own left-hand side, yielding its right-hand side.

Interaction smoke tests (Playwright) for the four loops that are easy to
break: toggle mode mid-derivation, click a region and confirm the
derivation resets, apply DeMorgan's and confirm the shading is
unchanged, hover a row and confirm every gate is labelled.

---

## 12. Variable count

`n = 2` and `n = 3` are supported in both modes and are the default
(`n = 3`). `n = 4` is supported in **logic mode only** in P0: the truth
table is 16 rows and the circuit is unaffected, but a faithful 4-set
Venn needs four ellipses, which is hard to read and hard to click.

Switching to sets mode while `n = 4` either offers the 4-ellipse Venn
(if P2 has landed) or prompts to drop to `n = 3`. Changing `n` discards
the derivation and re-seeds from the truncated/extended mask, with the
same notice as §8.2.

---

## 13. Phasing

**P0 — the core loop.** AST, parser, renderer, mask, subtree selection,
Venn viewer with clickable regions (`n = 2, 3`), truth table with
clickable outputs, mode toggle with glyph swap, the full Appendix B rule
table with applicability dimming, derivation lines with rule labels,
mask assertion. This alone is a usable teaching tool.

**P1 — the reasons to come back.** Circuit rendering, row-hover wire
tracing, Simplify with derivation, URL state sharing, undo/redo,
`start from sum of minterms`, rule-hover preview, keyboard navigation.

**P2 — polish and reach.** 4-set Venn (four ellipses), animated gate
removal, exercise mode (given a target expression or shading, reach it
in `k` steps), instructor deep links with a preset expression,
`XOR`/implication as optional extra operators, printable derivation
export.

Circuit and hover tracing are P1 rather than P0 only because the Venn/
truth-table loop is what makes the tool teach; they are the second thing
built, not the last.

---

## 14. Stack and architecture

**Entirely client-side static.** No backend, no database, no accounts.
Every computation here is microseconds on tiny inputs (`2^n <= 16`),
and hover-to-trace has to feel instant, so a server round-trip would only
add latency and hosting cost. This also makes the tool free to host and
impossible to break during a semester.

- **TypeScript + React + Vite.** React for the pane state, Vite for the
  static build.
- **SVG, hand-rolled, for both viewers.** No charting or diagram
  library: the Venn needs per-region paths and hit-testing and the
  circuit needs per-wire labelling, which is most of what such a library
  would do anyway.
- **No math typesetting library** (§5.1).
- **No state-management library** — a single reducer over `State` (§4),
  since every mutation is one of a dozen named actions.

Module layout:

    src/
      core/           # no DOM, fully unit-testable
        ast.ts        # Node, paths, subtree get/replace, cost
        parse.ts      # tolerant parser (§5.4)
        render.ts     # AST -> token tree with paths (§5.1)
        mask.ts       # eval to mask, per-node eval for tracing
        rules.ts      # Appendix B as data + matcher (§6)
        minimize.ts   # DP / Quine-McCluskey + A* search (§7)
        synth.ts      # mask -> expression (§8.2)
      view/
        Venn.tsx      # region paths, shading, clicks
        TruthTable.tsx
        Circuit.tsx   # layout + wire labels
        Expression.tsx
        RulePane.tsx
      state/          # reducer, URL encode/decode
      notation.ts     # the §10 glyph table, single source

`core/` must not import from `view/`. The glyph table lives in exactly
one file so that adding a notation option cannot half-land.

A note on language, since the rest of this toolbox is Python: doing this
in Python would mean either a Flask backend (wrong — adds latency to
hover) or Pyodide (wrong — multi-MB download for a tool students open
once for ten minutes). TypeScript is the right call here specifically
because the tool is all interaction and no computation.

---

## 15. Non-functional requirements

- **Load** under 1 s on campus wifi; bundle target < 200 KB gzipped.
- **Interaction** — rule application, mode toggle, and hover tracing
  render in under 16 ms. Simplify is the only operation allowed to take
  time, capped at 2 s (§7) with a spinner past 200 ms.
- **Browsers** — current Chrome, Firefox, Safari, Edge. Works on an
  iPad in landscape (regions and rows are tap targets ≥ 44 px); phones
  are not a target.
- **Accessibility** — every region, row, and rule is keyboard reachable
  and labelled for screen readers with its expression; shading is never
  the only channel (regions also carry an outline state and a tooltip);
  contrast meets WCAG AA; respects `prefers-reduced-motion`.
- **No tracking, no cookies, no network requests after load.** State
  lives in the URL only.
- **Offline** — works from a `file://` copy so it can be handed out.

---

## 16. Deployment

The build output is a static bundle, so hosting is a solved problem.

**Primary: GitHub Pages.** `vite build` in a GitHub Action on push to
`main`, published to Pages. Gives a stable public URL students can visit
without a login, which is the requirement. Build with a relative base
path (`base: './'`) so the same bundle works from any subdirectory or
from `file://`.

**Secondary: the course site.** The CS1800 site is Sphinx, deployed by
`rsync` to `/course/cs1800f24/.www` (`CS1800/web/make_upload.sh`), so
the bundle can also be dropped into `web/source/_static/boolalg/` and
shipped with the site. Worth doing so the tool is available beside the
handout it implements.

Because the course path is semester-versioned (`cs1800f24`), the GitHub
Pages URL should be the canonical, citable one and the course site
should link to it rather than the reverse.

Repository: this directory (`teach/tools/boolalg`) as its own git repo,
matching the layout of the other tools in `teach/tools/`.

---

## 17. Decisions to confirm

Answered here with a default so implementation is not blocked; flag any
you want changed.

1. **Commutativity.** The handout has no commutative law, but the tool
   needs it — both to match handout identities against student-ordered
   expressions (§6) and because students will want to reorder. Default:
   the matcher is always commutativity-aware, *and* `Commutative` is
   offered as an explicit rule marked `*` as not being on the handout.
   Alternative: keep it implicit and offer no such button.
2. **Always-parenthesise.** Following the handout, `(P ∨ Q) ∨ R` is
   never shown as `P ∨ Q ∨ R` (§5.1). If CS1800 teaches precedence and
   drops parens, this changes.
3. **`n = 4` in sets mode.** Deferred to P2 (§12).
4. **Provable minimality at `n = 4`.** Not claimed (§7); the tool says
   "minimal form found" rather than "minimal".
5. **Cost = operator count**, so factored forms can beat minimal SOP
   (§7). If the course grades simplification as minimal SOP, the cost
   function should change to match what students are marked against.
6. **Notation default** — superscript `C` and `T`/`F`, per the handout,
   with bar and prime available as settings (§10).
7. **Toggling the viewer resets the derivation** (§8.2), as specified.
   The alternative — keeping the derivation and marking it stale — was
   not chosen because a derivation whose lines have different masks is
   exactly the misconception the tool exists to prevent.

---

## Appendix A — the CS1800 handout, transcribed

From `reference/logic_set_identities.pdf` (source `.odt` alongside).
Boolean algebra on the left (`P, Q, R` Boolean variables), set algebra on
the right (`A, B, C` subsets of a universal set `U`). The handout uses
the `C` superscript rather than bar notation for complement; they mean
the same thing.

| law | logic | sets |
|---|---|---|
| Associative | `(P ∨ Q) ∨ R = P ∨ (Q ∨ R)` | `(A ∪ B) ∪ C = A ∪ (B ∪ C)` |
| | `(P ∧ Q) ∧ R = P ∧ (Q ∧ R)` | `(A ∩ B) ∩ C = A ∩ (B ∩ C)` |
| Double Negation | `¬¬P = P` | `(A^C)^C = A` |
| DeMorgan's | `¬(P ∨ Q) = ¬P ∧ ¬Q` | `(A ∪ B)^C = A^C ∩ B^C` |
| | `¬(P ∧ Q) = ¬P ∨ ¬Q` | `(A ∩ B)^C = A^C ∪ B^C` |
| Distributive | `P ∧ (Q ∨ R) = (P ∧ Q) ∨ (P ∧ R)` | `A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)` |
| | `P ∨ (Q ∧ R) = (P ∨ Q) ∧ (P ∨ R)` | `A ∪ (B ∩ C) = (A ∪ B) ∩ (A ∪ C)` |
| Absorption | `P ∧ (P ∨ Q) = P` | `A ∩ (A ∪ B) = A` |
| | `P ∨ (P ∧ Q) = P` | `A ∪ (A ∩ B) = A` |
| Complement | `P ∨ ¬P = T` | `A ∪ A^C = U` |
| | `P ∧ ¬P = F` | `A ∩ A^C = ∅` |
| Idempotent | `P ∨ P = P` | `A ∪ A = A` |
| | `P ∧ P = P` | `A ∩ A = A` |
| Identity | `F ∨ P = P` | `∅ ∪ A = A` |
| | `T ∧ P = P` | `U ∩ A = A` |
| Domination | `T ∨ P = T` | `U ∪ A = U` |
| | `F ∧ P = F` | `∅ ∩ A = ∅` |

The handout writes Identity and Domination with `True`/`False` spelled
out and Complement with `T`/`F`; normalised to `T`/`F` above and in the
tool (§10).

---

## Appendix B — machine-readable rule table

The implementation reads this shape, not the prose above. `$1`, `$2`,
`$3` are pattern variables binding whole subtrees. One entry per
direction; `expands: true` marks directions Simplify may use but never
prefers.

```ts
const RULES = [
  { group: 'Associative',     lhs: 'or(or($1,$2),$3)',  rhs: 'or($1,or($2,$3))' },
  { group: 'Associative',     lhs: 'or($1,or($2,$3))',  rhs: 'or(or($1,$2),$3)' },
  { group: 'Associative',     lhs: 'and(and($1,$2),$3)', rhs: 'and($1,and($2,$3))' },
  { group: 'Associative',     lhs: 'and($1,and($2,$3))', rhs: 'and(and($1,$2),$3)' },

  { group: 'Double Negation', lhs: 'not(not($1))',      rhs: '$1' },
  { group: 'Double Negation', lhs: '$1',                rhs: 'not(not($1))', expands: true },

  { group: "DeMorgan's",      lhs: 'not(or($1,$2))',    rhs: 'and(not($1),not($2))' },
  { group: "DeMorgan's",      lhs: 'and(not($1),not($2))', rhs: 'not(or($1,$2))' },
  { group: "DeMorgan's",      lhs: 'not(and($1,$2))',   rhs: 'or(not($1),not($2))' },
  { group: "DeMorgan's",      lhs: 'or(not($1),not($2))',  rhs: 'not(and($1,$2))' },

  { group: 'Distributive',    lhs: 'and($1,or($2,$3))', rhs: 'or(and($1,$2),and($1,$3))', expands: true },
  { group: 'Distributive',    lhs: 'or(and($1,$2),and($1,$3))', rhs: 'and($1,or($2,$3))' },
  { group: 'Distributive',    lhs: 'or($1,and($2,$3))', rhs: 'and(or($1,$2),or($1,$3))', expands: true },
  { group: 'Distributive',    lhs: 'and(or($1,$2),or($1,$3))', rhs: 'or($1,and($2,$3))' },

  { group: 'Absorption',      lhs: 'and($1,or($1,$2))', rhs: '$1' },
  { group: 'Absorption',      lhs: 'or($1,and($1,$2))', rhs: '$1' },

  { group: 'Complement',      lhs: 'or($1,not($1))',    rhs: 'T' },
  { group: 'Complement',      lhs: 'and($1,not($1))',   rhs: 'F' },

  { group: 'Idempotent',      lhs: 'or($1,$1)',         rhs: '$1' },
  { group: 'Idempotent',      lhs: 'and($1,$1)',        rhs: '$1' },
  { group: 'Idempotent',      lhs: '$1',                rhs: 'or($1,$1)',  expands: true },
  { group: 'Idempotent',      lhs: '$1',                rhs: 'and($1,$1)', expands: true },

  { group: 'Identity',        lhs: 'or(F,$1)',          rhs: '$1' },
  { group: 'Identity',        lhs: 'and(T,$1)',         rhs: '$1' },

  { group: 'Domination',      lhs: 'or(T,$1)',          rhs: 'T' },
  { group: 'Domination',      lhs: 'and(F,$1)',         rhs: 'F' },

  // not on the handout; see §17.1
  { group: 'Commutative*',    lhs: 'or($1,$2)',         rhs: 'or($2,$1)' },
  { group: 'Commutative*',    lhs: 'and($1,$2)',        rhs: 'and($2,$1)' },
];
```

Matching is modulo commutativity of `∧`/`∨` (§6), so the mirrored forms
of Absorption, Complement, Identity, and Domination
(`or(not($1),$1)`, `and($1,T)`, ...) need no separate entries.

Rules are written once, in logic operators. Sets mode is a rendering of
the same table (§10) — there is no second rule table, and the group
names are shared, so a derivation is valid in both costumes.

Expanding Absorption directions are deliberately absent: `$1` matches
everything, so offering `A → A ∩ (A ∪ B)` would need a `$2` the student
has not named. Reverse Absorption is reachable via Distributive +
Idempotent + Complement if anyone wants it.
