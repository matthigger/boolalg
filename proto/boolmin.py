"""Validate the two-stage minimiser design of SPEC.md section 7.

Section 7 claims that Simplify can (stage 1) find the provably minimal
operator count for an expression by dynamic programming over all 2^n
masks, and then (stage 2) find a derivation reaching that minimum using
only the handout rules of Appendix B, via bounded best-first search.

Stage 1 is straightforward. Stage 2 is the assumption worth testing: the
handout laws are complete, so a path exists in principle, but whether
best-first search finds one within a browser-sized budget is empirical.
This module measures that, on the thirteen simplification problems in
CS1800's problem_repo plus random expressions.

Expressions are immutable nested tuples so they hash and compare
cheaply:

    ('var', i) | ('const', b) | ('not', node) | ('and'|'or', terms)

Chains ('and'/'or') are n-ary with at least two terms, held sorted, so
that two expressions differing only in the order of a chain's terms are
the same object. That matches SPEC.md section 6, where rule matching is
modulo commutativity, and it keeps the search from exploring
permutations.
"""

import argparse
import heapq
import itertools
import random
from typing import Callable, Iterator, Optional

Node = tuple
Rule = tuple[str, Node]

N_VARS = 3
FULL = (1 << (1 << N_VARS)) - 1
LETTERS = "ABCD"


# ---------------------------------------------------------------- build

def var(i: int) -> Node:
    return ('var', i)


def const(b: bool) -> Node:
    return ('const', b)


def not_(x: Node) -> Node:
    return ('not', x)


def chain(op: str, terms) -> Node:
    """Build a flat chain node, absorbing nested chains of the same op.

    A one-term chain collapses to that term, which is what happens when
    a rule consumes all but one term of a chain (SPEC.md section 6). An
    emptied chain becomes the operator's identity, T for and and F for
    or -- reached when factoring removes every term, as in
    (x ∧ C) ∨ (C ∧ C) factored on C.

    Args:
        op: 'and' or 'or'
        terms: iterable of Node

    Returns:
        Node: the chain, the single surviving term, or the identity
    """
    flat = []
    for t in terms:
        if t[0] == op:
            flat.extend(t[1])
        else:
            flat.append(t)
    if not flat:
        return const(op == 'and')
    if len(flat) == 1:
        return flat[0]
    return (op, tuple(sorted(flat)))


def and_(*terms) -> Node:
    return chain('and', terms)


def or_(*terms) -> Node:
    return chain('or', terms)


# -------------------------------------------------------------- semantics

def mask(node: Node, n: int = N_VARS) -> int:
    """Compute the 2^n-bit mask of an expression (SPEC.md section 2).

    Bit r is set iff the expression is true on case r, where variable i
    is true iff bit (n - 1 - i) of r is set.
    """
    kind = node[0]
    if kind == 'var':
        i = node[1]
        m = 0
        for r in range(1 << n):
            if (r >> (n - 1 - i)) & 1:
                m |= 1 << r
        return m
    if kind == 'const':
        return ((1 << (1 << n)) - 1) if node[1] else 0
    if kind == 'not':
        return ((1 << (1 << n)) - 1) & ~mask(node[1], n)
    acc = None
    for t in node[1]:
        m = mask(t, n)
        acc = m if acc is None else (acc & m if kind == 'and' else acc | m)
    return acc


def cost(node: Node) -> int:
    """Count operator nodes: each not is 1, a k-term chain is k - 1.

    This is the course's own measure -- "the least possible number of
    set operators" -- per SPEC.md section 7.
    """
    kind = node[0]
    if kind in ('var', 'const'):
        return 0
    if kind == 'not':
        return 1 + cost(node[1])
    return len(node[1]) - 1 + sum(cost(t) for t in node[1])


def render(node: Node) -> str:
    """Render an expression in logic notation, chains flat."""
    kind = node[0]
    if kind == 'var':
        return LETTERS[node[1]]
    if kind == 'const':
        return 'T' if node[1] else 'F'
    if kind == 'not':
        inner = node[1]
        if inner[0] in ('var', 'const'):
            return '¬' + render(inner)
        return '¬(' + render(inner) + ')'
    glyph = ' ∧ ' if kind == 'and' else ' ∨ '
    parts = []
    for t in node[1]:
        s = render(t)
        if t[0] in ('and', 'or') and t[0] != kind:
            s = '(' + s + ')'
        parts.append(s)
    return glyph.join(parts)


# --------------------------------------------------------- stage 1: DP

def min_cost_table(n: int = N_VARS) -> dict[int, tuple[int, Node]]:
    """Find the minimum-cost formula for every mask, exhaustively.

    Works outward in increasing cost, so the first formula found for a
    mask is optimal. For n <= 3 this is 256 masks and runs instantly;
    SPEC.md section 7 uses it as the provable target for the search.

    Returns:
        dict: mask -> (cost, witness node)
    """
    full = (1 << (1 << n)) - 1
    best: dict[int, tuple[int, Node]] = {}
    by_cost: dict[int, list[int]] = {}

    def offer(m: int, c: int, node: Node) -> None:
        if m not in best:
            best[m] = (c, node)
            by_cost.setdefault(c, []).append(m)

    for b in (False, True):
        offer(mask(const(b), n), 0, const(b))
    for i in range(n):
        offer(mask(var(i), n), 0, var(i))

    c = 1
    while len(best) < (1 << (1 << n)) and c < 40:
        for m in list(by_cost.get(c - 1, [])):
            offer(full & ~m, c, not_(best[m][1]))
        for i in range(c):
            j = c - 1 - i
            if j < i:
                break
            for a in by_cost.get(i, []):
                for b in by_cost.get(j, []):
                    offer(a & b, c, and_(best[a][1], best[b][1]))
                    offer(a | b, c, or_(best[a][1], best[b][1]))
        c += 1
    return best


# ------------------------------------------------------ stage 2: rules

def _subsets(terms: tuple, k: int) -> Iterator[tuple]:
    """Yield (chosen indices, rest) for every k-subset of a chain.

    Chains are held sorted (order is meaningless), so a rule may act on
    any k terms, not only adjacent ones -- this is what SPEC.md section
    6's "modulo commutativity" buys, and it is why the search needs no
    explicit Commutative move.
    """
    idx = range(len(terms))
    for pick in itertools.combinations(idx, k):
        rest = tuple(terms[i] for i in idx if i not in pick)
        yield tuple(terms[i] for i in pick), rest


def local_rewrites(node: Node, nary_demorgan: bool,
                   expand: bool) -> Iterator[Rule]:
    """Yield (rule name, result) for every rule applying at this node.

    Args:
        node: the subtree to rewrite at its root
        nary_demorgan: if True, DeMorgan may act on a whole k-term chain
            in one step; if False, only on two terms at a time
        expand: if True, include directions that increase cost
    """
    kind = node[0]

    if kind == 'not':
        inner = node[1]
        if inner[0] == 'not':
            yield 'Double Negation', inner[1]
        if inner[0] in ('and', 'or'):
            dual = 'or' if inner[0] == 'and' else 'and'
            terms = inner[1]
            if nary_demorgan or len(terms) == 2:
                yield "DeMorgan's", chain(dual, [not_(t) for t in terms])
            elif len(terms) > 2:
                # Binary DeMorgan on a longer chain: split one term off,
                # ¬(a ∨ b ∨ c) = ¬a ∧ ¬(b ∨ c). Regrouping cannot be
                # expressed instead, since chains reassociate freely.
                for pick, rest in _subsets(terms, 1):
                    yield "DeMorgan's", chain(
                        dual, (not_(pick[0]), not_(chain(inner[0], rest))))

    if kind in ('and', 'or'):
        terms = node[1]
        dual = 'or' if kind == 'and' else 'and'
        unit = const(kind == 'and')
        zero = const(kind != 'and')

        for pick, rest in _subsets(terms, 2):
            a, b = pick
            if a == b:
                yield 'Idempotent', chain(kind, (a,) + rest)
            if b == not_(a) or a == not_(b):
                yield 'Complement', chain(kind, (zero,) + rest)
            # Chains are sorted, so a constant term is not necessarily
            # first; every asymmetric rule is tried both ways round.
            for x, y in ((a, b), (b, a)):
                if x == unit:
                    yield 'Identity', chain(kind, (y,) + rest)
                if x == zero:
                    yield 'Domination', chain(kind, (zero,) + rest)
                # Absorption: a ∧ (a ∨ b) = a
                if y[0] == dual and x in y[1]:
                    yield 'Absorption', chain(kind, (x,) + rest)
            # Distributive, factoring: (a∧x) ∨ (a∧y) = a ∧ (x∨y)
            if a[0] == dual and b[0] == dual:
                common = set(a[1]) & set(b[1])
                for f in common:
                    ra = chain(dual, [t for t in a[1] if t != f])
                    rb = chain(dual, [t for t in b[1] if t != f])
                    inner = chain(dual, (f, chain(kind, (ra, rb))))
                    yield 'Distributive', chain(kind, (inner,) + rest)
            # DeMorgan, collecting: ¬a ∧ ¬b = ¬(a ∨ b)
            if a[0] == 'not' and b[0] == 'not':
                col = not_(chain(dual, (a[1], b[1])))
                yield "DeMorgan's", chain(kind, (col,) + rest)

        if expand:
            for pick, rest in _subsets(terms, 2):
                a, b = pick
                # Distributive, expanding: a ∧ (x∨y) = (a∧x) ∨ (a∧y)
                if b[0] == dual:
                    exp = chain(dual, [chain(kind, (a, t)) for t in b[1]])
                    yield 'Distributive', chain(kind, (exp,) + rest)
                if a[0] == dual:
                    exp = chain(dual, [chain(kind, (b, t)) for t in a[1]])
                    yield 'Distributive', chain(kind, (exp,) + rest)


def all_rewrites(node: Node, nary_demorgan: bool,
                 expand: bool) -> Iterator[Rule]:
    """Yield every single-rule rewrite of the whole expression."""
    for name, sub in local_rewrites(node, nary_demorgan, expand):
        yield name, sub
    kind = node[0]
    if kind == 'not':
        for name, sub in all_rewrites(node[1], nary_demorgan, expand):
            yield name, not_(sub)
    elif kind in ('and', 'or'):
        terms = node[1]
        for i, t in enumerate(terms):
            for name, sub in all_rewrites(t, nary_demorgan, expand):
                yield name, chain(kind, terms[:i] + (sub,) + terms[i + 1:])


# ----------------------------------------------------- stage 2: search

def find_derivation(start: Node, target: int, max_nodes: int = 20000,
                    max_steps: int = 40, nary_demorgan: bool = True,
                    expand: bool = True) -> tuple[Optional[list], int]:
    """Search for a rule path from start down to the target cost.

    Best-first over single-rule rewrites, f = steps + (cost - target),
    which is SPEC.md section 7's stage 2.

    Returns:
        (path, nodes): path is a list of (rule name, node) ending at a
            minimal-cost expression, or None if the caps were hit first.
            nodes is how many states were expanded.
    """
    m0 = mask(start)
    if cost(start) == target:
        return [], 0
    seen = {start: 0}
    heap = [(cost(start) - target, 0, 0, start, [])]
    tie = 1
    nodes = 0
    while heap and nodes < max_nodes:
        _, g, _, node, path = heapq.heappop(heap)
        nodes += 1
        if g >= max_steps:
            continue
        for name, nxt in all_rewrites(node, nary_demorgan, expand):
            assert mask(nxt) == m0, f"{name} changed the mask"
            c = cost(nxt)
            if c == target:
                return path + [(name, nxt)], nodes
            if seen.get(nxt, 1 << 30) <= g + 1:
                continue
            seen[nxt] = g + 1
            heapq.heappush(
                heap, (g + 1 + c - target, g + 1, tie, nxt,
                       path + [(name, nxt)]))
            tie += 1
    return None, nodes
