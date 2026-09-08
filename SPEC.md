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

Single page: a header, a **viewer band** across the top, the expression
pane beneath it, and the algebra pane as a right rail beside both. No
whole-page scrolling on a laptop; panes scroll internally.

The viewer is on top because it is the thing the whole tool exists to
hold still (§2): it belongs where it can stay put while the work happens
below it. The derivation grows downward toward the input that seeded it,
and can grow long without pushing the picture off the screen.

The rail spans both rows but is **not stretched to them**: it is as tall
as the rules and the buttons under them, rather than trailing an empty
card to the foot of the page. On a window too short for that, the rule
list scrolls and the actions do not — the primary action of the pane is
not something to go looking for.

The viewer band is held to a little under half the window. It is the
tallest thing on the page and the least dense, so it is where vertical
space is worth reclaiming for the derivation below it.

    ┌──────────────────────────────────────────────────────────────┐
    │  Boolean Algebra Explorer  [ SETS | LOGIC | CIRCUIT ]         │
    ├─────────────────────┬──────────────────┬─────────────────────┤
    │  TRUTH TABLE        │  CIRCUIT  PNG CSV│  ALGEBRA            │
    │  A B C │ ¬C │ out   │                  │  Associative     ⓘ  │
    │  0 0 0 │  1 │  0    │    ─┤&  ┐        │  Double Negation ⓘ  │
    │  0 0 1 │  0 │  1  ←─┼──── └── │≥1──    │  DeMorgan's   [x2]ⓘ │
    │  0 1 0 │  1 │  0    │         │        │  Distributive [x2]ⓘ │
    │  ...                │                  │  Absorption   [x2]ⓘ │
    │                     │                  │  Complement   [x2]ⓘ │
    ├─────────────────────┴──────────────────┤  Idempotent   [x2]ⓘ │
    │  start from: [ (A ^ B) v ~C          ] │  Identity     [x2]ⓘ │
    │  ∧ ∨ ¬ − ⊕ ( ) T F  [get example]      │  Domination   [x2]ⓘ │
    │             STEP MARKS[on|off] PNG TEX │  Commutative  [x2]ⓘ │
    │  ────────────────────────────────────  │                     │
    │    (A ∧ B) ∨ ¬C                        │  [ Simplify ]       │
    │  = ¬(A ∧ B) ∧ C       DeMorgan's   ×   │                     │
    │  = ...                                 │  [ Reset ] [ Share ] │
    └────────────────────────────────────────┴─────────────────────┘

**Sets mode uses the same skeleton**, with the Venn diagram occupying
the whole viewer band in place of the truth-table/circuit pair. Toggling
mode therefore never reflows the page — only the band's contents and the
glyphs change, which is what makes the toggle read as a change of costume
rather than a change of tool (§2).

The `[ SETS | LOGIC | CIRCUIT ]` toggle is the only view control and
sits beside the title, where it names what the viewer band is currently
showing. There is no variable-count control: the expression says how
many variables it has (§12).

The expression pane opens with the input that starts a derivation, and
the derivation grows downward from it. Under the input sits one row of
controls: the operator keys, `get example` (§3.1), and at the right a
step-marks toggle and the export controls (§16). Step marks are
deliberately a segment in the view toggle's idiom rather than a third
pill beside PNG and TEX — they change how the derivation is drawn, they
do not produce a file.

Every operator glyph has a key in that row. None of them are on a
keyboard, and the LaTeX spellings that are (§5.4) are only known to
students who already write LaTeX.

`ⓘ` opens the law's own demonstration (§6.3). It is a separate hit
target from the rule row itself, so a demo can never be triggered by a
misplaced click meant to apply a rule.

`*` marks a rule not on the handout — only `Definition` (§8.3).

### 3.1 First load

With no link parameters the tool opens **empty**: an unshaded Venn in
sets mode, an all-zero output column in logic mode, and no derivation.
The prompt is to click. A student's first action is therefore shading a
region and watching an expression appear, which teaches the mask idea
(§2) before any algebra shows up.

Alongside the empty state sits an **examples menu**, at the top of the
expression pane. It is sorted into three bands — mild, medium, spicy —
where difficulty is the number of steps between an expression and its
minimum. That number is what the minimiser already computes (§7), so
the filing is measured rather than asserted, and a test enforces it;
three entries filed as spicy by eye turned out to be one, two and three
steps. A mild example may need no steps at all: DeMorgan on a Venn is
already as short as it goes, and is worth loading for what the diagram
does while the rule is applied.

Each band also has a **make one up** button. It generates candidates and
keeps the first whose derivation lands in the band asked for, which is
what stops a long expression that collapses in one step from being
served as spicy.

The catalogue is chosen so that clicking through it exercises every mode
of the system:

| example | mode | what it demonstrates |
|---|---|---|
| `(A ∪ B)^C` | sets | shading, selection, and a DeMorgan step that leaves the diagram unchanged |
| `A ∩ (A ∪ B)` | sets | one Absorption step collapsing a big expression to nothing |
| `(A ∪ B) − C` | sets | difference sugar and the Definition step that unlocks it (§8.3) |
| `¬((A ∧ B) ∨ ¬C)` | logic | truth table, circuit, and row-hover wire tracing |
| `(C∧B) ∨ (¬C∧B) ∨ (A∧¬B)` | logic | the hint ladder, and the circuit shrinking to `A ∨ B` |
| — | sets | the empty state itself: build an expression by shading |

The last four are lifted from `circuit01.tex`, `circuit04.tex`, and
`operations_venn_color01.tex`, so a student who has met them on a
problem set meets them again here.

The menu is a launcher, not a tutorial: each entry loads the expression
and gets out of the way. It stays reachable from the header afterwards.

---

## 4. Data model

```ts
type Op = 'and' | 'or' | 'not';

type Node =
  | { kind: 'var';   index: number }            // 0-based, < n
  | { kind: 'const'; value: boolean }           // T/F  ==  U/∅
  | { kind: 'not';   arg: Node }
  // a flat chain, >= 2 terms; A ∨ B ∨ C is one node, not two
  | { kind: 'and' | 'or'; terms: Node[] }
  // display sugar, §8.3: kept in the AST so it renders as written,
  // desugared for mask and cost, and inert to every handout rule
  | { kind: 'diff' | 'symdiff'; left: Node; right: Node };

// a selection is a subtree, or a contiguous run of one chain's terms
type Sel =
  | { path: Path }
  | { path: Path; from: number; to: number };   // to exclusive

interface Line {
  expr: Node;
  mask: number;          // 2^n bits; invariant: same for every line
  rule: string | null;   // label shown at right; null for line 0
  span: Sel | null;      // what this step rewrote, for highlighting
}

interface State {
  mode: 'sets' | 'logic';
  n: 2 | 3 | 4;
  lines: Line[];
  selection: Path | null;  // path from root of the *selected* line
  selectedLine: number;    // which line the viewer/circuit reflects
}
```

**`and`/`or` are n-ary chains**, not binary nodes: `A ∨ B ∨ C` is a
single `or` with three terms and no internal grouping. Every worked
solution in `problem_repo` writes chains flat, so the AST matches what
the student reads (§5.1), and associativity is absorbed into the
notation rather than tracked as bookkeeping (§5.2.1).

Circuits still use 2-input gates — `circuit04.png` draws its 3-way `∨`
as two OR gates — so the circuit renderer binarises left-associatively
at draw time (§9.2). Grouping is a property of the *picture*, not of the
expression.

A `Path` is a list of steps from the root, each `'arg'` (into a `not`),
`'left' | 'right'` (into sugar), or a term index (into a chain). Paths
and term ranges, not character offsets, are the unit of selection.

Internally the simplifier also uses a flattened n-ary form and the mask;
that is an implementation detail of §7 and never surfaces in the AST the
student sees.

`mask` for `n = 4` needs 16 bits, so a plain JS `number` suffices
throughout; no BigInt.

A chain of `k` terms costs `k - 1` operators, so cost matches the
course's counting whether or not the student writes the parentheses.

Mask and cost are always computed on the **desugared** form, so a
`diff` node costs 2 (`∩`, `^C`) and a `symdiff` node costs 5. Nothing
else in the system sees sugar: the matcher (§6) refuses to match inside
it and Simplify (§7) desugars first.

### 4.1 What resets what

Every action falls into one of three buckets. Getting this table wrong
is the most likely source of a confusing tool, because two of the
buckets look similar on screen.

| action | mask | derivation | selection |
|---|---|---|---|
| toggle SETS/LOGIC | keep | keep | keep |
| change notation | keep | keep | keep |
| select a subtree | keep | keep | set |
| open/close a law demo (§6.3) | keep | keep | keep |
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

Rendered from the AST into nested `<span>` elements, one per node and
one per chain term, each carrying its address. **Not** KaTeX/MathJax: we
need per-term hit targets, drag affordances, and three simultaneous
highlight states, and custom spans give that directly. Unicode glyphs
(`∪ ∩ ¬ ∅ ⊆`) plus `<sup>C</sup>` are sufficient; no math typesetting is
required.

Parenthesisation: `¬` binds tightest and takes no parens around a
variable or constant. A chain nested inside a *different* operator is
parenthesised. A chain's own terms are **not** grouped, because there is
nothing to group — the node is n-ary (§4):

    AST:      or[ and[C,B], and[not C, B], and[A, not B] ]
    rendered: (C ∧ B) ∨ (¬C ∧ B) ∨ (A ∧ ¬B)

This follows the problem sets rather than the handout. The handout
writes `(P ∨ Q) ∨ R` because it is stating the associative law, where
the grouping is the point; every worked solution flattens
(`¬p ∨ ¬q ∨ p`, `(C ∧ B) ∨ (¬C ∧ B) ∨ (A ∧ ¬B)`). Students should see
the form they are asked to write.

A step's `span` is highlighted on its line rather than parenthesised, so
the reader can see what moved without the notation changing shape.

### 5.2 Selection

Selection is by **drag**, with click and keyboard as shortcuts. A
**selectable unit** is either:

1. any subtree, or
2. any **contiguous run of two or more terms of one chain** — any 2 or
   3 adjacent terms of `t1 ∨ t2 ∨ t3 ∨ t4`.

Snapping, applied to whatever the raw drag covers:

- a drag starting or ending mid-term **expands** to whole terms;
- a drag spanning two different chains, or crossing out of one, snaps
  **up** to the smallest enclosing subtree;
- a drag inside a single term resolves to the smallest subtree covering
  it;
- a zero-length drag is a click: the smallest subtree at that point.
  Clicking an operator glyph selects the whole chain.

So `B) ∨ (¬C` is not representable — it widens to whole terms. Keyboard:
arrows walk the tree, shift+left/right grows the selection along a
chain, `Esc` clears.

### 5.2.1 A run is a first-class operand

Because a chain is n-ary and its operator is associative, **any
contiguous run of its terms is itself a valid operand**, and a rule
applies to that run directly. No regrouping step is generated, and none
is needed: there are no parentheses in the rendering to move.

This is the whole reason to go n-ary. Worked through the case that
motivates it — applying Complement to `¬p ∨ ¬q ∨ p`, where the two terms
are not adjacent:

      ¬p ∨ ¬q ∨ p
    = ¬p ∨ p ∨ ¬q        Commutative      ← select `¬q ∨ p`, swap
    = T ∨ ¬q             Complement       ← select `¬p ∨ p`
    = T                  Domination

Two steps, one law each, and every selection along the way is a
contiguous drag. Commutative on a run permutes that run in place, so
adjacent swaps reach any order and **non-contiguous selection is never
required** — an earlier draft of this spec had it as a feature; it is
simply unnecessary.

Note what this says about the course materials.
`boolean_formula_derivation_vip` performs this exact move and labels it
`(Associative)`. That file has two such lines, and they are not alike:
the first only re-brackets (`(¬p ∨ ¬q) ∨ p` to `¬p ∨ ¬q ∨ p`) and is
correctly labelled, while the second reorders terms
(`¬p ∨ ¬q ∨ p` to `(¬p ∨ p) ∨ ¬q`) and is commutativity wearing the
wrong name. In flat notation the first vanishes entirely and the second
is the single `Commutative` step above.

### 5.2.2 What is left for Associative

With flat chains, the associative law has nothing to rewrite: both sides
of `(P ∨ Q) ∨ R = P ∨ (Q ∨ R)` render as `P ∨ Q ∨ R`. It stays in the
algebra pane, since it is on the handout and students must know it, but
it is permanently annotated rather than clickable:

    Associative — already built into how chains are written here.
    That A ∨ B ∨ C needs no parentheses *is* this law.

Clicking it opens that explainer instead of appending a line. This is
the honest presentation: the law is not absent, it is assumed, and
saying so teaches more than a no-op step would.

Selection feedback, on every selection:

- **sets mode** — the Venn shades the *selection's* mask in the primary
  fill; the full line's mask is drawn as a thin outline behind it, with a
  caption naming which is which.
- **logic mode** — the truth table highlights the column for the
  selection (§9.1) and the circuit highlights the corresponding
  sub-network.

With nothing selected, the whole line is the implicit selection.
Selection lives on one line at a time (`selectedLine`); selecting inside
an earlier line is allowed and the viewer follows.

### 5.3 Adding lines

Lines are produced **only** by the tool, from a rule click (§6) or
Simplify (§7). Students do not type derivation steps: every line the
tool shows is a correct application of a named law, so the derivation on
screen is always self-consistent and always safe to imitate.

Lines are never edited in place. The last line carries a `×` that drops
that step. Only the last one does: removing a line from the middle would
leave every line below it labelled with a rule that no longer connects
it to the line above.

A consequence worth being explicit about: the tool does not check
student work and has no notion of a wrong step. It demonstrates, and
that is the whole remit.

### 5.4 Setting the starting expression

A text input above the derivation sets the expression the derivation
starts from. This is the starting *problem*, not a derivation step —
§5.3's constraint is about steps, and something has to be able to load
`(A ∪ (A^C ∪ B^C)^C) ∩ B` off a homework sheet. The other two ways in
are clicking the viewer (§8.2) and an instructor deep link (§16.3).

Parsing is tolerant of every notation in use across the course
materials: `&`, `*`, `and`, `∧`, `∩` all parse to `and`; `|`, `+`,
`or`, `∨`, `∪` to `or`; `!`, `~`, `¬`, `'`, `^C`, `^c`, `^{cc}`, and a
trailing `c` to `not`; `1`/`T`/`True`/`U` and `0`/`F`/`False`/`∅` to
constants; `-` and `\` to difference and `Δ`/`^` to symmetric
difference (§8.3).

Three further ways of saying the same things, because a student who
cannot type a glyph cannot start:

- **words** — `and`, `or`, `not`, `union`, `intersection` (or `int`),
  `complement` (or `comp`), `minus`, `without`, `xor`;
- **LaTeX** — `\cap`, `\cup`, `\neg`, `\land`, `\lor`, `\setminus`,
  `\oplus`, `\emptyset`, `\top`, `\bot`, and `\overline{...}` /
  `\bar{...}`, with `{ }` grouping so a bar covers what it is written
  over. A bare `\` is still difference: the command table is consulted
  only when letters follow.
- **the operator keys** below the input, which insert at the caret.

On Enter the input echoes back what was understood, in the tool's own
glyphs. That is the confirmation step: `\cup` becoming `∪` says the
expression was read as intended, and a typo shows up as the wrong shape
rather than as a silent reinterpretation.

Variables are **any name**: `A`, `p`, `sunny`, `x1`. A name is a letter
followed by letters, digits or underscores, and anything that is not a
reserved word above is one. The letters `A..D`, `P..S`, `p..s` are still
normalised per §10; other names are used as written and label the Venn
circles and table columns directly. Reserved words are the cost of this
— naming a set `int` is not possible.

Parse errors show a caret under the offending character with a one-line
message. A successful parse **replaces** the derivation with a single
line.


---

## 6. Algebra pane (the rules)

One entry per handout group, in handout order (Appendix A). Each group
holds one or two directed rewrites; DeMorgan's, for instance, holds the
`∨` form and the `∧` form.

Each rewrite is a pattern pair. Matching is structural, with pattern
variables binding whole subtrees, **modulo commutativity of `∧` and
`∨`**: within a chain the matcher tries the terms in either order. This
is required even to use the handout as written — the handout gives
Identity as `∅ ∪ A = A`, and a student's expression will just as often
read `A ∪ ∅`.

Patterns match a **selection**, so a two-term pattern like
`or($1, not($1))` matches a two-term run of a longer chain (§5.2.1), and
the rewrite replaces just that run, leaving the chain's other terms in
place. A chain rule that consumes a run of `k` terms out of `m` leaves a
chain of `m - k + 1`; if that reaches one term the chain node collapses
to it.

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

1. rewrites the selected subtree or run in a copy of the selected line's
   AST;
2. appends a line with `rule` = the handout group name and `span` = the
   rewritten selection;
3. re-highlights: the new line's rewritten part is flashed, then left
   subtly marked;
4. asserts the mask is unchanged (§9.4);
5. moves `selectedLine` to the new line and keeps the selection on the
   result, so rules can be chained without re-clicking.

The viewer does not move. That is the point.

Rule clicks and Simplify are the only sources of derivation lines
(§5.3), so every line on screen is a correct, singly-labelled
application of a named law.

### 6.3 Demonstrating a law on its own

Each rule row carries an `ⓘ` affordance that shows the law by itself,
independent of whatever the student is working on: both sides of the
identity, in generic variables, rendered in the current mode.

    DeMorgan's Law

      (A ∪ B)^C        =        A^C ∩ B^C
      ┌────────┐                ┌────────┐
      │▓▓▓▓▓▓▓▓│                │▓▓▓▓▓▓▓▓│
      │▓▓◯──◯▓▓│                │▓▓◯──◯▓▓│
      │▓▓▓▓▓▓▓▓│                │▓▓▓▓▓▓▓▓│
      └────────┘                └────────┘
              the same 5 regions

    [ try it on my expression ]        [ dismiss ]

In logic mode the two Venns become two truth tables, which are visibly
identical row for row and which must sit **side by side**: a comparison
stacked vertically stops reading as one. Those tables are therefore
sized to their content rather than reserving the constant working block
that keeps a stepping derivation from drifting (§9.1) — nothing here
steps, so nothing needs holding still.

Either way the demonstration *is* the mask equality (§2) — the same
machinery, shown directly instead of applied. The card does not also
claim in words that the two sides agree: two diagrams either side of an
equals sign are the demonstration, and a sentence asserting it is one
the reader has to take on trust instead of checking.

What the card does carry in words is **why the law is true**, written
once per notation. "Every point is inside A or outside it" and "A is
either true or false" are the same fact, but only one of them reads as
an explanation to a student looking at a truth table.

The forms of a law sit **beside** each other, not stacked: they are two
instances of one statement, and stacking them reads as two separate
facts. Each is headed by the rule in full, so a panel showing one side
still says what it is demonstrating. Associative is the only law whose
heading cannot be read off its demo -- both bracketings flatten to the
same node -- so its heading is written out and the flattened chain sits
below it.

Not every law reads best as a pair. Where the point is that a column
comes out constant, or matches one already present, the card shows **one
table carrying the whole statement** instead of two to compare: Double
Negation as `A, ¬A, ¬¬A`, Identity as `A, F ∨ A`. Laws with two forms
show both, one demonstration under the other. In sets, where a diagram
has no columns to set against each other, the single-table layout falls
back to the pair.

Associative is the exception in the other direction. Its two sides
render identically — chains are n-ary, which is the law (§5.2.2) — so it
shows the unbracketed chain that licenses, for each operator, with a
warning that the two operations have to match.

Demonstrations always read in `A, B, C`, never the letters the student
happens to have loaded: a law is a claim about the shape of an identity,
and borrowing left a three-variable law rendering its third as `?`.

Both sides are clickable, in the same gesture as the derivation (§5.2):
clicking any part re-points that side at the part, adding its column to
the table or shading its region on the Venn. The law is a claim about
whole expressions, and being able to ask what each piece contributes is
how a reader checks it rather than believing it.

**The demo cannot cost a student their work.** It is strictly
non-destructive:

- it opens as an overlay with **its own** miniature viewers on generic
  variables; it never reads or writes `lines`, `selection`, or the mask;
- `ⓘ` is a separate hit target from the rule row, so a click aimed at
  applying a rule can never trigger a demo, and vice versa;
- `Esc`, click-away, or `dismiss` restores the screen exactly;
- the one action inside it that does touch state,
  `try it on my expression`, is an explicit labelled button, is only
  enabled when the law actually applies to the current selection, and
  appends a normal undoable line.

This generalises to an invariant worth holding to: **no click in the
algebra pane is destructive.** Rules only ever append, appends are
undoable, and demos change nothing. The only actions that can discard a
derivation are the four in §4.1, each of which warns on first use. A
student mid-problem can click anything in the right rail to find out
what it does.

---

## 7. Simplify

`Simplify` rewrites the selected line down to a cost-minimal equivalent
and shows every intermediate step, labelled with the handout rule used.

**Cost** = number of operator nodes in the AST (`∧`, `∨`, and each `¬`
count 1 apiece). Tie-break: fewer literal occurrences, then shallower
tree.

This is the course's own definition, not an invention: every simplify
problem in `problem_repo` reads "your simplified expression should have
the least possible number of set operators (`∪`, `∩`, `^c`)", and the
circuit problems read "a simplified statement uses as few logical
operators as possible". Complement counts as an operator in that
phrasing, so it counts here.

This is a *formula* cost, not a sum-of-products cost, so factored
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

**Stage 2 — a derivation.** Best-first (A*) search over Appendix B
rewrites from the current AST, cost-so-far = steps, heuristic =
`ops(current) − targetCost`. Caps: 20 000 expanded nodes, 40 steps, 2 s
wall clock.

**Expanding Distributive must be enabled.** An expression often has to
grow before it can shrink, and this is the one expanding direction that
matters. Contracting rules alone are not enough — see §7.2. The other
expanding directions in Appendix B (introducing a double negation or an
idempotent duplicate) are offered to students but excluded from the
search, where they only inflate the branching factor.

Outcomes:
- **target reached** — append every step, each labelled.
- **capped out** — append the best path found, then a final line showing
  the stage-1 witness marked `minimal form (derivation not found)`. Never
  silently present a non-minimal result as minimal.

### 7.1 Hints, not answers

Dumping a finished derivation answers the question the student was
supposed to answer. Simplify is therefore a **graduated reveal**, with
each level exposing one more piece of the step the search already found:

| level | reveals |
|---|---|
| 1 | highlights the subtree or run the next step acts on, in the expression pane. Nothing is appended. |
| 2 | additionally highlights the rule to use, in the algebra pane. Nothing is appended. |
| apply | performs that one step, appending its line. |
| run to end | applies every remaining step. |

So a student can ask "where should I be looking?", try it themselves,
and only then ask "which law?". The circuit shrinks a gate at a time
rather than all at once (§9.2).

**The ladder currently has no buttons.** The rail carries Simplify (which
runs to the end), Reset and Share, and nothing else; the levels above are
reachable only through the console driver, and are exercised by the
tests. The machinery is kept because the rail was cut for room, not
because the graduated reveal was decided against.

Hints re-plan. The search (stage 2) runs from the *current* expression
every time a hint is requested, so if the student applies a different
legal rule than the one hinted, the next hint is computed for where they
actually are, not where the tool expected them to be. There is no stored
plan to go stale, and no "you were supposed to..." — any legal route is
as good as the tool's own.

If the student applies the hinted rule themselves rather than pressing
`apply`, the hint simply advances. The tool never comments on this; it
has no notion of a wrong step (§5.3).

---

### 7.2 What the prototype measured

`proto/` implements both stages and runs them over the thirteen
simplification problems in `problem_repo` plus 200 random expressions,
to test the assumption above rather than trust it. Full write-up in
`proto/FINDINGS.md`; the results that shaped this section:

| rule set | course problems | random |
|---|---|---|
| contracting only | 10 / 13 | 188 / 200 |
| + expanding Distributive | **13 / 13** | **200 / 200** |
| the same, DeMorgan restricted to 2 terms | 13 / 13 | 200 / 200 |

(That last row is why the restriction was adopted, and the bullet below
is why it was later dropped.)

So the design works, and it works cheaply: a mean of 2.8 steps and
**5 to 7 expanded nodes** per expression, under a millisecond each. The
caps above are three orders of magnitude larger than anything measured;
they exist to bound pathological input, not to be approached. The
`capped out` branch should be considered close to unreachable at
`n ≤ 3`, which is where sets mode lives (§12).

Two further findings carried into this spec:

- **DeMorgan cannot stay binary**, though the measurement above says it
  can. What was measured is reachability of the *minimum* by the search,
  and that is genuinely unaffected: a binary DeMorgan costs only a couple
  of extra expanded nodes. What it does not measure is whether the law is
  **applicable** where a student expects it, and there the binary form
  fails outright. A negation wraps a chain as a whole, and chains are
  n-ary (§5.2.2), so no regrouping step exists that could cut
  `¬(¬C ∧ B ∧ ¬A)` down to a pair. Restricted to two terms, DeMorgan is
  offered on no negated chain longer than two, and the rule sits greyed
  out with nothing to explain why. The binary restriction and the n-ary
  chain representation are simply inconsistent: having made Associative
  implicit, the tool has to distribute a negation over every term at
  once. It is still one law per line (§6.2). The collecting direction is
  k-ary to match, so three negations come together in one step as well
  as pairwise.
- **Stage 1 is instant at `n = 3`** — 256 masks in 23 ms of unoptimised
  Python, so trivial in the browser. At `n = 4` the same DP is ~65 000x
  the pair work, which is minutes rather than milliseconds and rules it
  out at runtime. If `n = 4` ever needs provable minimality, the answer
  is a precomputed 65 536-entry cost table shipped as data, not a
  faster search.

Simplify is disabled when the line is already at target cost, with the
button captioned `already minimal`.

### 7.3 The mask assertion earns its keep

Running §11's property test against the prototype's rule table found two
real bugs before any of it reached a browser: an `Identity` rewrite that
dropped a sibling term, and a `Distributive` factoring that produced an
empty chain when every term of one operand was the common factor
(`(x ∧ C) ∨ (C ∧ C)` factored on `C`). Both were caught the first time a
random expression hit them, by exactly the check §9.4 specifies.

The second one also fixed a definition: an emptied chain is the
operator's identity, `T` for `∧` and `F` for `∨`, not a malformed node.


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

### 8.3 Difference and symmetric difference

`−` and `Δ` are everywhere in the set problems — `A ∪ (B − C)`,
`(A ∪ B) − C`, `(C − A) ∪ (A − B) ∪ (B − C)`,
`(A^C ∪ B ∪ C) Δ A` — but `set_algebra01` tells students "do not use the
set difference operator at all", because the identity handout has no
rules for it. The tool takes the same position.

They are **input and viewer sugar, not algebra**:

- both parse (§5.4) and both render as written, `A − B` and `A Δ B`;
- both shade correctly in the Venn, since the mask is computed from the
  desugared form;
- the algebra pane offers **no** rules on a node containing them,
  except one:

      A − B  =  A ∩ B^C            Definition of difference
      A Δ B  =  (A − B) ∪ (B − A)  Definition of symmetric difference

  labelled `Definition` and marked `*` as off-handout (§18, item 1),
  the only starred rule.

So a student can load `(A ∪ B) − C` off a problem sheet, see it shaded,
and must apply the definition before any handout law becomes available —
which is exactly the move the course wants and the reason difference is
banned from algebra problems in the first place.

Symmetric difference desugars in two steps rather than straight to
`(A ∩ B^C) ∪ (B ∩ A^C)`, so no line ever uses two laws at once (§6.2).

Logic mode renders the same nodes as `P ∧ ¬Q` and `P ⊕ Q`; `⊕` is a
display form of the desugared expression only, and is not offered as a
gate (§9.2) since no CS1800 circuit uses one.

---

## 9. Logic mode

### 9.1 Truth table

`2^n` rows, all of them, counting upward in binary from `000` (§2.1).

Columns, left to right: one per variable, then **one per operator node
of the selected line's AST in evaluation order**, then the output
column. Each header shows the subexpression that column evaluates.

This mirrors `problem_repo/problems/logic/circuit04.tex`, whose
solution table is exactly that: `A B C | ¬C | C∧B | ¬C∧B | A∧¬B |
(C∧B) ∨ (¬C∧B) ∨ (A∧¬B)`. The intermediate columns are the working the
course asks for.

The n-ary chain (§4) is what makes this line up. A binary AST would
insert a column for the partial `(C∧B) ∨ (¬C∧B)`, which the course's
table does not have; with a chain node there is no such intermediate to
report. The remaining difference is that the course inlines the trivial
`¬B`, so a `hide negation columns` option matches its table exactly.

Columns still correspond to gates (§9.2) and to the wire labels on hover
(§9.3), with the caveat that the chain's own column is the output of the
*last* of its OR gates.

Intermediate columns are collapsible to a single output column
(`show working` toggle, on by default for `n ≤ 3`), since a wide AST at
`n = 4` will not fit. The selected subexpression's column, if any, is
highlighted rather than added — it is already present. Highlighting
matches by value, not by node identity, so a clicked `A` finds the `A`
column the header was built from, and covers the whole column rather
than its header alone.

**Column widths.** Applying a law adds and removes working columns, and
if the table were free to resize and centre itself, the `A`, `B`, `C`
columns would slide sideways under the reader's eye at every step. So a
wrapper of constant width is what gets centred, the table is
left-aligned inside it, and the variable columns are pinned; the
variables therefore start at the same x for the life of a derivation.

Only the variable columns are pinned. A working column is as wide as the
expression heading it, because a header is the one thing in the column
that has to be read, and dividing a fixed block between however many
columns there happen to be broke those headers over two and three lines.
The table takes its natural width and may run past the wrapper's right
edge; its left edge, which is what the reader is tracking, does not
move. (A table left to size itself inside the fixed wrapper is squeezed
to fit instead, which compresses the variable columns — the one thing
the wrapper exists to prevent.)

Clicking an output cell flips that bit, with the same reset semantics as
§8.2 — the two viewers are the same editor on the same mask.
Intermediate columns are **not** clickable: only the output column
defines the mask.

### 9.2 Circuit

The circuit is a direct rendering of the **selected line's** AST: one
gate per operator node, standard distinctive-shape symbols (AND, OR,
inverter bubble for `¬`), variable inputs on the left, single output on
the right. Layered layout by longest path from the inputs; wires as
orthogonal polylines with junction dots where a variable fans out.

Gates are **2-input**, so an n-ary chain (§4) is binarised at draw time,
left-associatively: a 3-term `∨` becomes two OR gates, the first
combining terms 1 and 2. This is what `circuit04.png` draws, so the
tool's output matches the course's existing figures. The grouping is
invented by the renderer and has no counterpart in the expression —
which is the point of §5.2.2.

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
| variables | see below | `A, B, C, D` |
| viewer | truth table + circuit | Venn diagram |

Variable letters **follow the input**: whatever letters the starting
expression was written with are kept, so a problem pasted from a sheet
reads back the way it was written. `A, B, C, D` / `P, Q, R, S` /
`p, q, r, s` are available as presets, and only an explicit preset
choice renames anything.

Toggling modes never renames variables — a derivation should not appear
to change subject, and the course's own materials are not consistent
enough to make a rename meaningful (`boolean_simplify_04..06` are
`A ∨ (A ∧ B) ∨ (¬A ∧ B)`, in logic, with set-operator instructions).
Venn circles are labelled with whatever letters are in play. Where there
is no input to follow — a mask synthesised by clicking the viewer
(§8.2) — the current letter set carries over, defaulting to `A, B, C`.

The handout writes complement as a superscript `C` and notes bar
notation means the same; it also mixes `T`/`F` with `True`/`False`. The
tool offers a notation setting — `¬P` / `P̄` / `P'` for complement,
`T,F` / `1,0` for constants, and `=` / `≡` for the relation —
defaulting to the handout's superscript-C and `T`/`F`, and normalises
`True`/`False` to `T`/`F` throughout.

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
  the snapped selection is always a selectable unit (§5.2) whose
  rendered extent covers the range — never a partial term, never a span
  crossing out of one chain.
- **Chain runs.** For a random chain and a random contiguous run, any
  rule that matches the run rewrites only that run, leaves the other
  terms in order, and preserves the mask. A chain reduced to one term
  collapses to that term.
- **Commutative reaches every order.** For a random chain and a random
  target permutation, a sequence of two-term-run swaps reaches it — the
  property that makes non-contiguous selection unnecessary (§5.2.1).
- **Hints are consistent.** After any legal rule application, the next
  `hint: expression` and `hint: algebra` name a rule that is applicable
  to the selection they name, and following hints to the end reaches
  target cost (§7.1).
- **Sugar is inert.** No rule except `Definition*` matches any node
  containing a `diff`/`symdiff`, and desugaring preserves the mask.
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

- **LaTeX emission.** Emitted `align*` bodies compile (a `latexmk` run
  in CI over a generated file), and every emitted line carries exactly
  one `\text{}` label.

Both suites run in a headless browser (`chromium --headless --dump-dom`
over a local static server) and print a machine-readable `RESULT
pass=N fail=N` line, so they need no test runner and no Node.

**Test that the page can be clicked at all.** Driving the app by
calling its functions cannot detect that something is covering the
page. This was not hypothetical: a `.overlay { display: flex }` rule
beat the UA stylesheet's `[hidden] { display: none }`, so the modal
backdrop sat over the whole viewport at `z-index: 20`, tinting
everything grey and swallowing every click, while every test still
passed. So the suite also:

- hit-tests each key control with `document.elementFromPoint` at its
  centre and asserts the element found is that control or a descendant
  — nothing may cover a rule button, the mode toggle, the expression
  input, the viewer, or a term of the expression;
- dispatches **genuine** clicks on a rule button, the mode toggle, a law
  info button and a Venn region, and asserts the state moved;
- asserts every overlay is `display: none` while hidden, and that a
  visible toast is `pointer-events: none`.

That last one was added because the first version of these tests found
a second instance of the same class: the toast sat over the expression
input and blocked it for as long as it showed.

The interaction page is generated from `index.html` rather than
hand-written, so the suite always exercises the markup that ships; its
results go in a `text/plain` script element so the page under test keeps
its real layout.

Interaction tests otherwise drive the app through `window.BAE`,
covering the five loops that are easy to break: toggle mode
mid-derivation, click a region and confirm the
derivation resets, apply DeMorgan's and confirm the shading is
unchanged, hover a row and confirm every gate is labelled, and select a
run of chain terms then apply a rule and confirm it rewrites only that
run.

---

## 12. Variable count

`n` is not a control. The expression says how many variables it has, and
`n` follows it; the empty state opens at `n = 3`. A picker would only
let a reader put the tool into a state its own expression contradicts.

`n = 4` is **logic and circuit only**: a 16-row truth table and a deeper
circuit cost nothing, but a faithful 4-set Venn needs four ellipses,
which is hard to read and fiddly to click. **The four-ellipse Venn is
not built, at any phase.** Loading a four-variable expression while in
sets mode moves the view to logic and says why — the alternative is
dropping a variable behind the reader's back. Narrowing the other way,
where an expression no longer needs a variable the derivation used,
re-seeds from the truncated mask with the same notice as §8.2.

`n = 4` is also a hard ceiling, not a chosen one. A row mask is a
bitfield of `2^n` bits held in a JavaScript number and manipulated with
bitwise operators, which are 32-bit; `n = 5` needs 32 bits and overflows
the shift that builds it. Asking for a fifth variable is refused by
name at parse time.

One consequence: minimality is provable only for `n ≤ 3` (§7), and sets
mode never exceeds `n = 3`, so every claim the tool makes about a
diagram being minimal is a proved one. Only `n = 4` logic mode falls
back to "minimal form found".

---

## 13. Phasing

Target: usable by students for the next term's logic and sets unit
(spring 2027, so roughly January). That is comfortable for P0 and P1 and
rules out nothing below, but it does set the order — P0 must be
independently useful, since it is what ships if the rest slips.

**P0 — the core loop.** n-ary AST, tolerant parser, flat renderer, mask,
drag selection with snapping over subtrees and chain runs (§5.2), Venn
viewer with clickable regions (`n = 2, 3`), truth table with clickable
outputs and gate columns, mode toggle with glyph swap, the Appendix B
rule table with applicability dimming, derivation lines with rule
labels, mask assertion, and the empty landing state (§3.1). This alone
is a usable teaching tool.

**P1 — the reasons to come back.** Circuit rendering with left-assoc
binarisation, row-hover wire tracing, Simplify with graduated hints
(§7.1), difference/symmetric-difference sugar (§8.3), URL state and deep
links (§16.3), undo/redo, figure export (§16.1), the law demos and the
examples menu they populate (§6.3, §3.1), keyboard navigation,
`start from sum of minterms`.

**P2 — polish and reach.** LaTeX emission (§16.2), animated gate
removal, `view=viewer` embed mode, printable derivation, `hide negation
columns`.

Circuit and hover tracing are P1 rather than P0 only because the Venn/
truth-table loop is what makes the tool teach; they are the second thing
built, not the last.

Three notes on ordering. Drag selection is P0, not P1, because it is the
primary interaction and the snapping rules (§5.2) shape the renderer —
retrofitting it would mean rewriting §5.1. The hint ladder is bundled
with Simplify rather than deferred, because a Simplify that only dumps
the answer is the version students would learn least from, and the
search that powers it is the same either way. LaTeX emission is P2 while
figure export is P1 because the figures replace an existing manual
workflow (`venn_abc.odp`) and the `.tex` emission only saves typing.

---

## 14. Stack and architecture

**Entirely client-side static.** No backend, no database, no accounts.
Every computation here is microseconds on tiny inputs (`2^n <= 16`),
and hover-to-trace has to feel instant, so a server round-trip would only
add latency and hosting cost. This also makes the tool free to host and
impossible to break during a semester.

- **Vanilla ES modules, no build step.** The implementation in `docs/`
  is plain JavaScript loaded as native modules: no bundler, no
  dependencies, no `node_modules`. Deploying is copying the folder.

  This departs from an earlier draft of this section, which specified
  TypeScript, React and Vite. Two reasons. The machine this was built on
  has no Node toolchain, so a build step would have been unbuildable
  where it is maintained. More durably: a course tool has to still work
  in five semesters, and the thing most likely to break first is a
  toolchain nobody has run since. The app is one page with a reducer and
  two SVG viewers, which is not enough complexity to earn a framework.

  What is given up is type checking, and JSX. If either becomes worth
  it, the `core/` modules are plain functions and port unchanged.
- **SVG, hand-rolled, for both viewers.** No charting or diagram
  library: the Venn needs per-region paths and hit-testing and the
  circuit needs per-wire labelling, which is most of what such a library
  would do anyway.
- **No math typesetting library** (§5.1).
- **No state-management library** — a single reducer over `State` (§4),
  since every mutation is one of a dozen named actions.

Module layout, as built:

    docs/
      index.html
      style.css       # every colour defined once, at the top
      js/
        core.js       # AST, masks, cost, paths, selections
        text.js       # glyph table (§10), parser (§5.4), rendering
        rules.js      # Appendix B as data + matcher (§6)
        minimize.js   # stage 1 DP + stage 2 search (§7)
        venn.js       # clip-path regions, analytic hit testing (§8)
        truthtable.js # gate columns (§9.1)
        circuit.js    # binarised layout + wire labels (§9.2, §9.3)
        dom.js        # el() and svg() helpers
        app.js        # state, expression pane, algebra rail
        tests.js      # core suite      -> test.html
        uitests.js    # interaction suite -> uitest.html

`core.js`, `text.js`, `rules.js` and `minimize.js` touch no DOM and are
tested directly. The glyph table lives in exactly one file so that
adding a notation option cannot half-land.

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

## 16. Authoring (instructor features)

The tool is also a figure and problem factory. Venn figures for
`operations_venn_color*.tex` are currently hand-maintained as
`venn_abc01..10.png` exported from `venn_abc.odp`; the tool computes
those shadings exactly and can emit them directly. Everything here is
additive — a student never needs to see it — and lives behind an
`Export` disclosure in the header.

### 16.1 Figure export

**Built:** the truth table exports as PNG, CSV or a LaTeX `tabular`; the
derivation as PNG or an `align*` (§16.2); the circuit and the Venn as
PNG. Each
control sits in the heading of the thing it exports, and every file is
named after the expression. Rasters are drawn on a canvas rather than
lifted from the DOM — going through a `foreignObject` would mean
carrying the whole stylesheet along to arrive at the same grid of short
strings — except the circuit, which is already SVG and is serialised
with its computed styles inlined.

The step marks (§5.3) are drawn in the exports exactly when they are
shown on screen, the toggle driving both.

**Not built:** SVG output, the blank/filled and plain/traced variants
below, and the `problem_repo` file-naming convention.

Export the current viewer as **SVG** (vector, for LaTeX via
`\includegraphics`) and **PNG** at 2x (for slides and Sphinx).

- **Venn** — the shaded diagram, with a `blank` variant (no shading)
  for the problem statement and a shaded variant for the solution. File
  naming follows the existing convention, so an export can drop
  straight into `problem_repo/problems/set/`: `venn_abc.png` for blank,
  `venn_abc<NN>.png` for shaded.
- **Truth table** — blank (headers only, empty rows) and filled
  variants, matching how `circuit04.tex` gives students an empty grid
  and the solution a filled one.
- **Circuit** — plain, and with a hovered row's wire values baked in.
  Naming follows `circuit<NN>.png` / `circuit<NN>_sol.png`.

Export must be chrome-free: no selection outlines, hover states, or
tooltips in the output.

### 16.2 LaTeX emission

**Built:** the derivation as a bare `align*`, one line per step, each
tagged with `\text{<law>}`. Where step marks are on, the changed
subtree is wrapped in a `\bastep{<colour>}{...}` macro emitted with the
colours it names and defined by `\providecommand`, so a reader can box
it, recolour it, or define it away without touching the body of the
derivation. Truth tables emit as `tabular` with the variables ruled off
from the working. Verified by compiling the output.

**Not built:** the `\stud{}` / `\sol{}` house-style wrapper, problem
text, and the `\venn` table layout below.

Emit a `.tex` fragment in `problem_repo` house style — problem text,
`\stud{\vfill}`, then `\sol{}` wrapping the derivation as an `align*`:

```latex
Simplify the expression below.
Your simplified expression should have the least possible number of set
operators ($\cup$, $\cap$, $^c$).
Show each step by applying and labelling the identity used.

\begin{equation*}
	(A \cap (A \cup B^c))^c
\end{equation*}

\stud{\vfill}

\sol{
	\begin{align*}
		(A \cap (A \cup B^c))^c
		 & = A^c \cup (A \cup B^c)^c \quad \text{(DeMorgan's Law)} \\
		 & = (A^c \cup (A^c \cap B^{cc})) \quad \text{(DeMorgan's Law)} \\
		 & = (A^c \cup (A^c \cap B)) \quad \text{(Double Negation)} \\
		 & = A^c \quad \text{(Absorption)}
	\end{align*}
}
```

Because every line came from a single rule click (§5.3), an emitted
solution is one law per line by construction and cannot contain a
misapplied step — it satisfies the rubric the course grades against
before it is written.

Also emitted, per mode:

- **truth tables** as the `\begin{array}{|c|c|...}` form with `\hline`
  used in `circuit04.tex`, including the intermediate gate columns
  (§9.1);
- **Venn problems** as the `\providecommand{\venn}` /
  `\vennsol{<NN>}` table layout of `operations_venn_color01.tex`, given
  a list of expressions.

Operator glyphs follow the target column: `\cup \cap ^c` for sets,
`\lor \land \lnot` for logic. A `\rub{}` block is **not** generated —
point values are the instructor's call.

### 16.3 Deep links and embedding

All state lives in the URL: mode, `n`, notation, the starting
expression, the mask, and the derivation. So a link can preset an exact
example for a slide, the Sphinx site, or a problem statement.

    ?mode=sets&n=3&expr=(A%20u%20(B%20-%20C))
    ?mode=logic&n=3&mask=0xE8&sol=1

Two extra flags for embedding:

- `view=viewer` renders the viewer alone, no panes — for an `<iframe>`
  in a slide or on the course site;
- `steps=locked` shows a completed derivation read-only, for walking
  through a worked example in lecture without stray clicks.

Links are plain query strings with no server component, so they keep
working from `file://` and from the course's static hosting (§17).

---

## 17. Deployment

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

## 18. Decisions and their evidence

Settled by the course materials or by explicit instruction. Recorded
here with the evidence, so a future reader can tell a decision from a
guess.

1. **Commutative was added to the handout; only `Definition` is
   starred.** The tool cannot work without commutativity — the matcher
   could not otherwise apply the handout's own `∅ ∪ A = A` to a
   student's `A ∪ ∅`, and bringing two non-adjacent terms of a chain
   together is a commutative move (§5.2.1). Rather than have the tool
   cite a law the course had not given, `Commutative Laws` was added to
   `logic_set_identities.odt` beside Associative, in both columns.
   The two `Definition` rules for `−` and `Δ` (§8.3) remain off-handout
   and keep their trailing `*`, so a student still never cites a law the
   course did not give them.

2. **Flat rendering and an n-ary AST.** `¬p ∨ ¬q ∨ p`, not
   `(¬p ∨ ¬q) ∨ p` (§5.1). Evidence: every worked solution in
   `problem_repo` flattens; the handout parenthesises only because it is
   stating the associative law. Per instruction, if the parentheses are
   dropped then the associative step is not needed either — so chains
   are n-ary, any contiguous run of terms is a valid operand, and
   Associative becomes an explainer rather than a rewrite (§5.2.2).
   Non-contiguous selection, which an earlier draft needed, drops out.
   Circuits stay 2-input by binarising at draw time (§9.2), matching
   `circuit04.png`.

3. **Cost = operator count, complement included** (§7). Evidence: the
   problems say "the least possible number of set operators (`∪`, `∩`,
   `^c`)" verbatim. Factored forms therefore beat minimal SOP, which is
   what the course rewards.

4. **One law per line** (§6.2). Evidence: `set_algebra01` — "Please do
   not use multiple laws in a single step" — and a `-1 per ... multiple
   steps in a single line` rubric line. This is why a chain regrouping
   emits its own `Associative` step rather than folding into the
   following rule.

5. **Students do not type derivation steps** (§5.3). Per instruction:
   the tool is exploratory and should only ever produce correct,
   self-consistent derivations. It has no notion of a wrong step and
   does not grade. Typed input sets the *starting* expression only
   (§5.4), confirmed, so a student can still load a problem off their
   homework sheet.

6. **Simplify reveals gradually** (§7.1): `hint: expression`, then
   `hint: algebra`, then `apply`, then `run to end`. Per instruction.
   Hints re-plan from the current expression, so any legal route the
   student takes is followed rather than corrected.

7. **Variable letters follow the input** (§10), renamed only by an
   explicit preset, never by the mode toggle. Per instruction.

8. **`−` and `Δ` are input and viewer sugar, inert to algebra** (§8.3).
   Per instruction, and consistent with `set_algebra01` banning
   difference from algebra problems while the Venn problems use it
   freely.

9. **One layout for both modes** (§3): a viewer band on top, expression
   beneath, algebra as a right rail. In logic mode the band splits into
   truth table and circuit, which must be visible together because row
   hover drives the wire labels (§9.3) — so they cannot be tabs. Sets
   mode gives the whole band to the Venn, so toggling never reflows the
   page.

10. **Laws can be demonstrated on their own** (§6.3), triggered by a
    hit target separate from the rule row, in a non-destructive overlay
    with its own viewers. Per instruction, with the constraint that an
    errant click must not be able to cost a student their work — which
    generalised to the invariant that nothing in the algebra pane is
    destructive.

11. **Empty on first load, with an examples menu** (§3.1). Per
    instruction: the student's first act is clicking a region and
    watching an expression appear, and the menu's entries are chosen to
    exercise every mode of the system rather than to teach a syllabus.

12. **`n = 4` is logic-mode only** (§12), per instruction. No
    four-ellipse Venn is built. Minimality is consequently provable only
    for `n ≤ 3` (§7), which is where sets mode lives anyway.

13. **The tool is also an authoring aid** (§16): figure export, LaTeX
   emission, and instructor deep links, per instruction.

17. **Two errors in the course materials are being corrected rather
    than accommodated**, per instruction: the mislabelled `Associative`
    step in `boolean_formula_derivation_vip` and a typo in
    `circuit04.tex`'s solution (§7.2, `proto/FINDINGS.md`). The tool
    therefore names the law that actually applies and stays silent about
    the discrepancy. Patches are prepared in `patches/`.

14. **Truth tables show intermediate gate columns** (§9.1). Evidence:
   `circuit04.tex`'s solution table has one column per gate.

15. **Gates are `∧ ∨ ¬` only** (§9.2). Evidence: every `circuit*.tex`
   asks for `Y` in terms of `∧, ∨, ¬`; no NAND, NOR, or XOR appears.

16. **Row order is `000, 001, 010, ...` with the first variable as MSB**
    (§2.1). Evidence: `circuit04.tex`'s solution table.

Settled since:

- **`=` vs `≡`.** Logic problems use both; `=` is used throughout, per
  instruction. Nothing else is open.

---

## Appendix A — the CS1800 handout, transcribed

From `reference/logic_set_identities.pdf` (source `.odt` alongside).
The Commutative row was added to the master handout as part of this
work; see §18, item 1.
Boolean algebra on the left (`P, Q, R` Boolean variables), set algebra on
the right (`A, B, C` subsets of a universal set `U`). The handout uses
the `C` superscript rather than bar notation for complement; they mean
the same thing.

| law | logic | sets |
|---|---|---|
| Associative | `(P ∨ Q) ∨ R = P ∨ (Q ∨ R)` | `(A ∪ B) ∪ C = A ∪ (B ∪ C)` |
| | `(P ∧ Q) ∧ R = P ∧ (Q ∧ R)` | `(A ∩ B) ∩ C = A ∩ (B ∩ C)` |
| Commutative | `P ∨ Q = Q ∨ P` | `A ∪ B = B ∪ A` |
| | `P ∧ Q = Q ∧ P` | `A ∩ B = B ∩ A` |
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
  // Associative has no entry: chains are n-ary, so both sides of the
  // law render identically and there is nothing to rewrite (§5.2.2).
  // It appears in the pane as an explainer, not a rewrite.

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

  // Applied to a two-term run of a chain it swaps those terms in place,
  // which is how a student brings non-adjacent terms together (§5.2.1).
  { group: 'Commutative',     lhs: 'or($1,$2)',         rhs: 'or($2,$1)' },
  { group: 'Commutative',     lhs: 'and($1,$2)',        rhs: 'and($2,$1)' },

  // sets mode only; the sole rules that may touch a sugar node (§8.3)
  { group: 'Definition*',     lhs: 'diff($1,$2)',       rhs: 'and($1,not($2))' },
  { group: 'Definition*',     lhs: 'symdiff($1,$2)',    rhs: 'or(diff($1,$2),diff($2,$1))' },
  { group: 'Definition*',     lhs: 'not(F)',            rhs: 'T' },
  { group: 'Definition*',     lhs: 'not(T)',            rhs: 'F' },
];
```

Patterns are written binary. Against an n-ary chain a two-term pattern
matches any adjacent pair, a three-term pattern any adjacent triple, and
the rewrite substitutes in place (§6). Matching is modulo commutativity
of `∧`/`∨`, so the mirrored forms of Absorption, Complement, Identity,
and Domination (`or(not($1),$1)`, `and($1,T)`, ...) need no separate
entries.

Rules are written once, in logic operators. Sets mode is a rendering of
the same table (§10) — there is no second rule table, and the group
names are shared, so a derivation is valid in both costumes.

Expanding Absorption directions are deliberately absent: `$1` matches
everything, so offering `A → A ∩ (A ∪ B)` would need a `$2` the student
has not named. Reverse Absorption is reachable via Distributive +
Idempotent + Complement if anyone wants it.
