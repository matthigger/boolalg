# Prototype findings

`boolmin.py` and `run_experiment.py` implement SPEC.md section 7's two
stages in Python, to test the one claim in the spec that was an
assumption rather than a derivation: that a bounded search over the
handout rules can actually *reach* the minimum that the dynamic program
proves exists.

Run it with `python3 run_experiment.py` from this directory.

## The question

Stage 1 (exact DP over all 2^n masks) is uncontroversial. Stage 2 asks
for a *derivation* — a path of handout-rule applications from the
student's expression down to a minimal one. The handout laws are
complete, so a path exists in principle. Whether best-first search finds
it inside a browser-sized budget is empirical, and if it usually fails
then students see "minimal form found, derivation not found" often
enough to make the feature worthless.

## Result: the design works, cheaply

Over the thirteen simplification problems in `CS1800/problem_repo` and
200 random expressions at `n = 3`:

| rule set | course problems | random | mean steps | nodes expanded |
|---|---|---|---|---|
| contracting only | 10 / 13 | 188 / 200 | 2.5 | 6 |
| + expanding Distributive | **13 / 13** | **200 / 200** | 2.8 | 5 |
| + expanding Distributive, binary DeMorgan | 13 / 13 | 200 / 200 | 2.8 | 7 |

Under a millisecond per expression. The spec's caps — 20 000 nodes, 40
steps, 2 s — are three orders of magnitude above anything observed.

Three conclusions, all folded back into SPEC.md section 7:

1. **Expanding Distributive is required.** Contracting rules alone miss
   3 of 13 course problems, including `circuit04`, where the expression
   has to grow before it collapses. The other expanding directions are
   not needed and only widen the branching factor.
2. **DeMorgan can stay binary.** Restricting it to two terms at a time,
   faithful to the handout and to one-law-per-line, costs two extra
   expanded nodes and no reachability.
3. **Stage 1 is instant at `n = 3`** (256 masks, 23 ms of unoptimised
   Python) and infeasible at runtime for `n = 4` (~65 000x the pair
   work). If `n = 4` ever needs provable minimality, ship a precomputed
   cost table rather than a faster search.

The derivation found for `circuit04` is step-for-step the same shape as
the posted solution — Distributive, Complement, Identity, Distributive,
Complement, Identity.

## The mask assertion found two real bugs

SPEC.md section 9.4 requires every rewrite to preserve the mask, and
section 11 makes that a property test. Run against this prototype's rule
table it failed twice, both on the first random expression to reach the
case:

- **`Identity` dropped a sibling.** `and[T, b, rest]` rewrote to
  `and[rest]`, losing `b`.
- **`Distributive` built an empty chain.** Factoring
  `(x ∧ C) ∨ (C ∧ C)` on `C` removes every term of the second operand.
  The fix is a definition: an emptied chain is the operator's identity,
  `T` for `∧` and `F` for `∨`.

After the fixes, 42 705 rewrites over 6 000 random expressions preserve
the mask exactly.

## Two errors in the course materials

Both found by running the prototype against the posted solutions.

### 1. `circuit04.tex` — wrong variable in a solution step

The `\sol{}` derivation reads:

    = B \lor (A \land \lnot B)              (Identity)
    = (A \lor B) \land (C \lor \lnot C)     (Distributive)

Distributing `B ∨ (A ∧ ¬B)` gives `(B ∨ A) ∧ (B ∨ ¬B)`. The printed step
has `C ∨ ¬C`, where a `C` appears from nowhere.

The final answer is unaffected, which is why this survived proofreading:
`C ∨ ¬C` and `B ∨ ¬B` are both `T`, so the printed line has the same
truth table as the correct one. A mask check does not catch it. Only
checking that the *named rule* justifies the step does.

### 2. `boolean_formula_derivation_vip.tex` — a mislabelled step

The file has two steps labelled `(Associative)`. They are not alike:

- the **first** turns `((¬p ∨ ¬q) ∨ p) ∧ ((¬p ∨ ¬q) ∨ q)` into
  `(¬p ∨ ¬q ∨ p) ∧ (¬p ∨ (¬q ∨ q))`, only re-bracketing. Correctly
  labelled.
- the **second** turns `¬p ∨ ¬q ∨ p` into `(¬p ∨ p) ∨ ¬q`, moving `p`
  past `¬q`. That is commutativity, not associativity.

The same file also labels the complement law `(Negation)`, where the
handout calls it `Complement`.

Patches for both files are in `../patches/`. They are not applied — the
course repo is left untouched.
