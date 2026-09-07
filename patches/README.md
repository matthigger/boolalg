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

## `vip-fix-associative-label.patch` — needs a decision first

`boolean_formula_derivation_vip.tex` labels two steps `(Associative)`.
The first is correct (pure re-bracketing). The second turns
`¬p ∨ ¬q ∨ p` into `(¬p ∨ p) ∨ ¬q`, moving `p` past `¬q` — commutativity,
not associativity. The patch relabels it `(Commutative)`.

**The catch: `logic_set_identities.pdf` has no commutative law.** So
applying this patch cites a law the handout does not give students.
There are three ways out, in rough order of preference:

1. **Add Commutative to the handout.** It belongs there — every other
   presentation of these identities has it, and the step genuinely needs
   it. Then this patch is correct as written. This also lets the tool
   drop the `*` it currently uses to mark Commutative as off-handout
   (SPEC.md section 18, item 1).
2. **Rewrite the derivation** to avoid the reorder. There is no way to
   reach `T` from `(¬p ∨ ¬q) ∨ p` by re-bracketing alone, so this means
   restructuring earlier steps, not editing this line.
3. **Leave it.** The step is doing real work and students follow it; the
   label is just wrong. The tool will name commutativity regardless, so
   a student comparing the two will see the mismatch.

Also worth noting while in this file: it labels the complement law
`(Negation)` in three places, where the handout says `Complement`.
Not patched, since it is a naming preference rather than an error.
