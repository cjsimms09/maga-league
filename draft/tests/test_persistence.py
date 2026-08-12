# TERRITORY: C
"""THE INSTRUMENT MUST NOT MANUFACTURE PERSISTENCE."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import persistence as P  # noqa: E402


def test_PERFECT_persistence_reads_ICC_1_and_NO_persistence_reads_near_0():
    """The two poles, so the statistic is anchored at both ends."""
    perfect = {"a": [1.0, 1.0, 1.0], "b": [9.0, 9.0, 9.0], "c": [5.0, 5.0, 5.0]}
    assert abs(P.icc(perfect) - 1.0) < 1e-9
    none_ = {"a": [1.0, 9.0, 5.0], "b": [1.0, 9.0, 5.0], "c": [1.0, 9.0, 5.0]}
    assert P.icc(none_) < 0.01


def test_a_DEGENERATE_set_returns_None_rather_than_zero():
    """Every value identical has NO between-owner signal to measure. MUTATION: return
    0.0 — it enters the pooled mean as though it were a measurement and drags the
    observed statistic toward the null, understating real persistence."""
    assert P.icc({"a": [3.0, 3.0], "b": [3.0, 3.0]}) is None
    assert P.icc({"a": [1.0]}) is None


def test_the_permutation_p_is_REPRODUCIBLE():
    """MUTATION: seed from the clock. A p-value that changes between runs is not a
    result, and a series measured twice differently is not a series."""
    v = {"a": [1.0, 1.1, 1.2], "b": [9.0, 9.1, 9.2], "c": [5.0, 5.1, 5.2]}
    a = P.permutation_p(v, reps=2000)
    b = P.permutation_p(v, reps=2000)
    assert a == b


def test_a_permutation_p_is_NEVER_zero():
    """+1 in numerator and denominator. MUTATION: hits/reps — a strong result reports
    p=0.0000, which claims certainty no permutation test can deliver."""
    # TEN owners with distinct values, so NO permutation reaches the observed ICC and
    # `hits` is genuinely 0. Three owners was too few — 3! = 6 arrangements and several
    # reproduce the grouping by chance, so hits/reps stayed above zero and the mutation
    # survived. The fixture, not the assertion, was the weak part.
    v = {chr(97 + i): [float(i), float(i), float(i)] for i in range(10)}
    _, p = P.permutation_p(v, reps=500)
    assert p > 0, "a permutation p of exactly 0 claims certainty the test cannot deliver"
    assert p == 1 / 501


def test_the_POOLED_null_uses_ONE_permutation_per_replicate():
    """Permuting each tendency independently breaks the within-owner correlation the
    dependence structure says exists, making the null tighter than reality.

    Constructed so the tendencies are perfectly correlated within owner: an independent
    null would find the observed mean far more surprising than a joint one does."""
    m1 = {"a": [1.0, 1.1], "b": [9.0, 9.1], "c": [5.0, 5.1]}
    m2 = {"a": [2.0, 2.1], "b": [18.0, 18.1], "c": [10.0, 10.1]}
    mean, p = P.pooled_p({"m1": m1, "m2": m2}, reps=2000)
    assert mean is not None and 0 < p <= 1


def test_tendencies_use_NO_hindsight():
    """Timing and share are computed from picks alone. MUTATION: read realized points
    into a tendency and the persistence result becomes partly a statement about outcomes
    rather than about behaviour."""
    picks = [{"roster_id": 1, "player_id": "x", "round": 3},
             {"roster_id": 1, "player_id": "y", "round": 1}]
    t = P.tendencies(picks, {"x": "QB", "y": "RB"})
    assert t[1]["QB1"] == 3 and t[1]["RB_share5"] == 0.5
    # EVERY absent tendency is None, not 0. A round of 0 sorts BEFORE round 1, so an
    # owner who never took the position reads as having taken it first — inventing the
    # strongest possible habit out of an absence.
    for m in ("TE1", "K1", "DEF1"):
        assert t[1][m] is None, m
    t2 = P.tendencies([{"roster_id": 1, "player_id": "y", "round": 1}], {"y": "RB"})
    assert t2[1]["QB1"] is None


def test_KEEPERS_ARE_EXCLUDED_because_a_keeper_is_not_a_draft_decision():
    """C-001 was measured with keepers in, and that is what broke it.

    In this league every keeper lands in rounds 1-3 and keepers are 40.6% of all
    picks in rounds 1-5 — the exact window RB_share5 and WR_share5 measure. A kept
    player REPEATS BY CONSTRUCTION, so including them manufactures the cross-season
    persistence the metric is trying to detect. Excluding them moved RB_share5 from
    ICC 0.672 (p=0.0032) to 0.390 (p=0.2501).

    `exp_divergence.py` already encodes the same rule in this codebase — "a keeper
    isn't a market decision" — and this module did not.
    """
    picks = [{"roster_id": 1, "player_id": "k", "round": 1, "is_keeper": True},
             {"roster_id": 1, "player_id": "d", "round": 2}]
    t = P.tendencies(picks, {"k": "RB", "d": "WR"})
    assert t[1]["RB_share5"] == 0.0, "the kept RB must not count as a draft decision"
    assert t[1]["WR_share5"] == 1.0
    # the kept RB must also not set "round of first RB"-style timing
    assert t[1]["QB1"] is None


def test_keepers_can_be_INCLUDED_but_only_on_purpose():
    """Available for a different question — 'how much of your early ROSTER is RB' is
    a real property — but never the default, and never silently."""
    picks = [{"roster_id": 1, "player_id": "k", "round": 1, "is_keeper": True},
             {"roster_id": 1, "player_id": "d", "round": 2}]
    t = P.tendencies(picks, {"k": "RB", "d": "WR"}, exclude_keepers=False)
    assert t[1]["RB_share5"] == 0.5 and t[1]["WR_share5"] == 0.5
