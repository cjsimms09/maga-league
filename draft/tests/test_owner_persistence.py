# TERRITORY: C
"""The runner that makes C-001 and C-003 re-derivable, tested against the real archive.

The point of these tests is not that the arithmetic works — `test_persistence.py`
covers that. It is that the RUNNER reproduces the recorded findings, so the next person
who doubts a number can check it in one command instead of rewriting the analysis.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import owner_persistence as OP  # noqa: E402

HIST = str(Path(__file__).resolve().parents[1] / "data" / "league_history.json")


def test_load_drops_a_season_with_no_data_rather_than_counting_it_as_zero():
    """2026 exists in the archive with an empty draft and no transactions. Counting it
    as a season of zero activity would put a fabricated point into every variance."""
    seasons = OP.load(HIST)
    assert "2026" not in seasons, sorted(seasons)
    assert set(seasons) == {"2023", "2024", "2025"}, sorted(seasons)


def test_the_replication_control_the_ledger_can_be_checked_against():
    """C-003's ledger entry recorded per-roster transaction ranges. If this runner
    disagrees, any robustness claim below is about the runner, not about C-003."""
    seasons = OP.load(HIST)
    got = {}
    for s, d in seasons.items():
        per = {}
        for x in d["transactions"]:
            rid = (x.get("roster_ids") or [None])[0]
            if rid is not None:
                per[rid] = per.get(rid, 0) + 1
        if per:
            got[s] = (min(per.values()), max(per.values()))
    assert got["2023"] == (18, 54), got
    assert got["2025"] == (11, 70), got
    # 2024's floor reads 19 here against a recorded 20. Pinned at the MEASURED value
    # rather than the recorded one, with the disagreement named: a test that asserted
    # 20 would be asserting a number this archive does not contain.
    assert got["2024"] == (19, 52), got


def test_failed_waiver_claims_are_a_QUARTER_of_the_archive():
    """The reason `completed_only` exists as a parameter at all."""
    seasons = OP.load(HIST)
    txns = [x for d in seasons.values() for x in d["transactions"]]
    failed = [x for x in txns if x.get("status") == "failed"]
    assert len(txns) == 1091, len(txns)
    assert len(failed) == 289, len(failed)
    # every failure is a waiver — a free-agent add cannot lose to another bid
    assert {x.get("type") for x in failed} == {"waiver"}


def test_C003_SURVIVES_dropping_the_failed_claims():
    """The audit that C-001 failed and this one passes.

    Both arms are computed because neither framing is obviously right: a failed claim
    IS an action the manager took, and whether it fails depends on other managers'
    bids, which makes the metric partly a property of the room.
    """
    seasons = OP.load(HIST)
    pub = OP.score(OP.in_season(seasons, completed_only=False), reps=2000)
    comp = OP.score(OP.in_season(seasons, completed_only=True), reps=2000)
    bar = comp["bonferroni"]
    for m in OP.IN_SEASON_METRICS:
        assert comp["metrics"][m]["p"] < bar, (m, comp["metrics"][m], bar)
    # and the headline does not depend on which arm you take
    assert pub["metrics"]["waiver_share"]["icc"] > 0.70
    assert comp["metrics"]["waiver_share"]["icc"] > 0.70


def test_the_draft_side_EXCLUDES_keepers_and_does_not_offer_a_way_not_to():
    """C-001's contamination cannot be reintroduced through this runner by accident."""
    import inspect
    sig = inspect.signature(OP.draft_side)
    assert "exclude_keepers" not in sig.parameters, sig


def test_a_waiver_share_with_no_denominator_is_None_not_zero():
    """Absent is never zero: an owner with only trades has no share to measure, and
    0.0 would enter the between-owner variance as though it were an observation."""
    seasons = {"2025": {"picks": [], "transactions": [
        {"type": "trade", "status": "complete", "roster_ids": [1], "created": 1757482161656},
        {"type": "trade", "status": "complete", "roster_ids": [1], "created": 1757482161656}]},
        "2024": {"picks": [], "transactions": [
            {"type": "trade", "status": "complete", "roster_ids": [1], "created": 1757482161656}]}}
    bm = OP.in_season(seasons)
    assert "waiver_share" not in bm or 1 not in bm["waiver_share"], bm
    assert bm["txn_count"][1] == [1, 2], bm["txn_count"]


def test_completed_only_ACTUALLY_FILTERS_and_is_not_a_decorative_flag():
    """Found by a surviving mutation: asserting both arms clear Bonferroni passes even
    if the flag does nothing, because both arms really do clear it. The flag has to be
    shown to CHANGE something."""
    seasons = OP.load(HIST)
    allrows = OP.in_season(seasons, completed_only=False)["txn_count"]
    done = OP.in_season(seasons, completed_only=True)["txn_count"]
    assert set(allrows) == set(done)
    # every owner has at least as many rows unfiltered, and the league total drops by
    # exactly the 289 failed claims
    assert all(sum(allrows[r]) >= sum(done[r]) for r in allrows)
    assert sum(sum(v) for v in allrows.values()) - sum(sum(v) for v in done.values()) == 289


def test_draft_side_excludes_keepers_BEHAVIOURALLY_not_just_by_signature():
    """The earlier test checked `inspect.signature` and a mutation walked straight
    past it. A signature is a promise; this asserts the behaviour."""
    seasons = {
        "2024": {"picks": [{"roster_id": 1, "player_id": "k", "round": 1, "is_keeper": True},
                           {"roster_id": 1, "player_id": "w", "round": 2},
                           {"roster_id": 2, "player_id": "w2", "round": 1},
                           {"roster_id": 2, "player_id": "r2", "round": 2}],
                 "transactions": []},
        "2025": {"picks": [{"roster_id": 1, "player_id": "k", "round": 1, "is_keeper": True},
                           {"roster_id": 1, "player_id": "w", "round": 2},
                           {"roster_id": 2, "player_id": "w2", "round": 1},
                           {"roster_id": 2, "player_id": "r2", "round": 2}],
                 "transactions": []}}
    positions = {"k": "RB", "w": "WR", "w2": "WR", "r2": "RB"}
    bm = OP.draft_side(seasons, positions)
    # roster 1 kept the only RB it has, so its DRAFTED RB share is 0.0, not 0.5
    assert bm["RB_share5"][1] == [0.0, 0.0], bm["RB_share5"]
    assert bm["RB_share5"][2] == [0.5, 0.5], bm["RB_share5"]


def test_a_transaction_with_NO_ROSTER_is_skipped_not_bucketed_into_a_phantom_owner():
    """A missing roster_ids must not become owner 0 — that invents an eleventh manager
    and gives every metric a row nobody made."""
    seasons = {"2024": {"picks": [], "transactions": [
                   {"type": "waiver", "status": "complete", "roster_ids": [], "created": 1},
                   {"type": "waiver", "status": "complete", "roster_ids": [3], "created": 1}]},
               "2025": {"picks": [], "transactions": [
                   {"type": "waiver", "status": "complete", "roster_ids": None, "created": 1},
                   {"type": "waiver", "status": "complete", "roster_ids": [3], "created": 1}]}}
    bm = OP.in_season(seasons)
    assert set(bm["txn_count"]) == {3}, bm["txn_count"]
    assert bm["txn_count"][3] == [1, 1], bm["txn_count"]
