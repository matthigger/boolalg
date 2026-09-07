"""Measure whether the handout rules can reach the proved minimum.

Runs the thirteen simplification problems from CS1800's problem_repo,
plus random expressions, through boolmin's two stages and reports how
often stage 2 finds a derivation to the cost stage 1 proved optimal.

Three rule configurations are compared, because the answer decides what
SPEC.md section 7 can promise:

    contract     contracting directions only
    +expand      plus expanding Distributive
    +expand,bin  the same, but DeMorgan restricted to two terms at a
                 time rather than a whole chain at once
"""

import random
import time

from boolmin import (all_rewrites, and_, const, cost, find_derivation,
                     mask, min_cost_table, not_, or_, render, var)

A, B, C = var(0), var(1), var(2)
T, F = const(True), const(False)

# The course's own simplification problems, logic and set columns alike;
# set problems are transcribed with the same operators since the algebra
# is identical (SPEC.md section 2).
PROBLEMS = [
    ("boolean_simplify_01/02", not_(and_(A, or_(A, not_(B))))),
    ("boolean_simplify_03", and_(or_(A, not_(or_(not_(A), not_(B)))), B)),
    ("boolean_simplify_04", or_(A, and_(A, B), and_(not_(A), B))),
    ("boolean_simplify_05", or_(and_(A, or_(A, C)),
                                not_(and_(not_(B), B)))),
    ("boolean_simplify_06", or_(not_(not_(A)),
                                and_(not_(B), or_(B, and_(B, C))))),
    ("set_algebra01 i", not_(or_(and_(not_(A), B), and_(not_(A),
                                                        not_(B))))),
    ("set_algebra01 ii", and_(not_(and_(not_(A), not_(B))), T)),
    ("set_algebra01 iii", and_(or_(A, A), or_(B, not_(A)))),
    ("set_algebra_logic_too i",
     not_(or_(and_(A, not_(A)), and_(A, or_(A, B))))),
    ("set_algebra_logic_too ii", not_(and_(or_(not_(A), not_(B)), B))),
    ("circuit01", not_(or_(and_(A, B), not_(C)))),
    ("circuit04", or_(and_(C, B), and_(not_(C), B), and_(A, not_(B)))),
    ("formula_derivation_vip", or_(not_(A), not_(B), and_(A, B))),
]

CONFIGS = [
    ("contract", dict(expand=False, nary_demorgan=True)),
    ("+expand", dict(expand=True, nary_demorgan=True)),
    ("+expand,bin", dict(expand=True, nary_demorgan=False)),
]


def random_expr(depth: int, rng: random.Random):
    """Build a random expression, biased toward the messy middle."""
    if depth <= 0 or rng.random() < 0.25:
        leaf = rng.choice([A, B, C])
        return not_(leaf) if rng.random() < 0.3 else leaf
    kind = rng.random()
    if kind < 0.2:
        return not_(random_expr(depth - 1, rng))
    k = rng.choice([2, 2, 3])
    terms = [random_expr(depth - 1, rng) for _ in range(k)]
    return (or_ if kind < 0.6 else and_)(*terms)


def main() -> None:
    table = min_cost_table()

    print("=" * 74)
    print("COURSE PROBLEMS")
    print("=" * 74)
    hits = {name: 0 for name, _ in CONFIGS}
    for label, expr in PROBLEMS:
        m = mask(expr)
        target, witness = table[m]
        print(f"\n{label}")
        print(f"  start   {render(expr)}   (cost {cost(expr)})")
        print(f"  minimum {render(witness)}   (cost {target})")
        for name, kw in CONFIGS:
            t0 = time.time()
            path, nodes = find_derivation(expr, target, **kw)
            dt = time.time() - t0
            if path is None:
                print(f"    {name:<12} MISS   nodes={nodes:<6} {dt:.2f}s")
            else:
                hits[name] += 1
                print(f"    {name:<12} {len(path)} steps  "
                      f"nodes={nodes:<6} {dt:.2f}s")
    print(f"\n  hit rate: " + "  ".join(
        f"{n}={hits[n]}/{len(PROBLEMS)}" for n, _ in CONFIGS))

    print()
    print("=" * 74)
    print("RANDOM EXPRESSIONS (200, depth 3)")
    print("=" * 74)
    rng = random.Random(0)
    exprs = [random_expr(3, rng) for _ in range(200)]
    for name, kw in CONFIGS:
        ok = steps = nodes_tot = 0
        t0 = time.time()
        for e in exprs:
            target, _ = table[mask(e)]
            path, nodes = find_derivation(e, target, **kw)
            nodes_tot += nodes
            if path is not None:
                ok += 1
                steps += len(path)
        dt = time.time() - t0
        avg = steps / ok if ok else 0
        print(f"  {name:<12} {ok:>3}/200 reached   "
              f"avg {avg:.1f} steps   {nodes_tot // 200} nodes/expr   "
              f"{dt / 200 * 1000:.0f} ms/expr")

    print()
    print("=" * 74)
    print("WORKED DERIVATION (circuit04, +expand)")
    print("=" * 74)
    expr = dict(PROBLEMS)["circuit04"]
    target, _ = table[mask(expr)]
    path, _ = find_derivation(expr, target, expand=True)
    print(f"    {render(expr)}")
    for name, node in path:
        print(f"  = {render(node):<40} {name}")


if __name__ == "__main__":
    main()
