# Patches for CS1800 course materials

Two errors the prototype found in `CS1800/problem_repo` while checking
SPEC.md section 7 against the posted solutions. Details and how they
were found: `../proto/FINDINGS.md`.

**Not applied.** The course repo is untouched. To apply:

    cd ~/Dropbox/teach/CS1800/problem_repo/problems
    patch -p1 < ~/Dropbox/teach/tools/boolalg/patches/<file>.patch

Both files exist only in `problem_repo` (not in `problem_repo_oak` or
`problem_repo_old`), so there is one copy of each to fix.

## `circuit04-fix-distributive-typo.patch` — safe to apply

The solution distributes `B ∨ (A ∧ ¬B)` and prints
`(A ∨ B) ∧ (C ∨ ¬C)`. It should be `(A ∨ B) ∧ (B ∨ ¬B)`; the `C` comes
from nowhere.

The printed answer is still right, because `C ∨ ¬C` and `B ∨ ¬B` are
both `T` — which is why it survived proofreading, and why comparing
truth tables would not have caught it. Unambiguous fix, no dependencies.

## `vip-fix-associative-label.patch` — now safe to apply

`boolean_formula_derivation_vip.tex` labels two steps `(Associative)`.
The first is correct (pure re-bracketing). The second turns
`¬p ∨ ¬q ∨ p` into `(¬p ∨ p) ∨ ¬q`, moving `p` past `¬q` — commutativity,
not associativity. The patch relabels it `(Commutative)`.

This originally depended on a decision, because the handout had no
commutative law and the patch would have cited a law students were never
given. **That is resolved:** `Commutative Laws` has been added to
`materials/logic_set_identities.odt` (and its PDF regenerated), beside
Associative, in both the logic and set columns. So the label this patch
introduces is now one students have on their sheet, and the tool no
longer stars it.

Also worth noting while in this file: it labels the complement law
`(Negation)` in three places, where the handout says `Complement`.
Not patched, since it is a naming preference rather than an error.
