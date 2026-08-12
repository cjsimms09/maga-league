# TERRITORY: C
"""A REVISIT TRIGGER THAT CANNOT FIRE IS A DELETED HYPOTHESIS WEARING A LABEL."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import candidate_ledger as L  # noqa: E402

HIST = {"seasons": [{"owners": {str(i): {} for i in range(10)}} for _ in range(3)]}


def test_counters_are_DERIVED_from_the_archives_not_written_down():
    """MUTATION: store the counter as a literal. It drifts from the thing it counts the
    first time a season is added, and the trigger fires late or never."""
    n = L.counters(HIST, {"series": [{"qb_decision_slots": 2}, {"qb_decision_slots": 3}]})
    assert n["owner_seasons"] == 30      # 3 seasons x 10 owners, from the data
    assert n["oracle_capture_qb_slots"] == 5


def test_nothing_is_due_at_todays_sample():
    """The state as of 2026-08-12: 30 owner-seasons against 43, 5 QB slots against 15."""
    r = L.report(HIST, {"series": [{"qb_decision_slots": 5}]})
    assert r["due"] == []
    assert "owner_seasons 30/43" in r["verdict"]


def test_a_candidate_becomes_DUE_when_the_sample_CROSSES():
    """The whole mechanism. MUTATION: compare with > instead of >=, and a candidate
    whose sample lands exactly on its threshold never fires."""
    # 5 seasons x 10 owners = 50 owner-seasons, which crosses C-001's 43 AS WELL.
    # My first version of this assertion expected only C-002 and was simply wrong
    # about its own fixture's arithmetic — the code was right and the test was not.
    big = {"seasons": [{"owners": {str(i): {} for i in range(10)}} for _ in range(5)]}
    r = L.report(big, {"series": [{"qb_decision_slots": 15}]})
    assert {x["id"] for x in r["due"]} == {"C-001", "C-002"}, r["due"]
    assert "testable now" in r["verdict"]
    # and the message names the numbers, so a reader need not go and look them up
    assert "owner_seasons reached 50" in r["verdict"]


def test_EXACTLY_at_the_threshold_counts_as_crossed():
    r = L.report(HIST, {"series": [{"qb_decision_slots": 15}]})
    assert {x["id"] for x in r["due"]} == {"C-002"}


def test_an_UNCOUNTABLE_candidate_is_reported_not_silently_dropped():
    """"No trigger" and "not yet" are different states. MUTATION: omit candidates with
    no counter. F7 and Route 1 vanish from the ledger entirely and are retired
    permanently by accident, which is the thing a revisit condition exists to prevent."""
    u = {x["id"] for x in L.untriggerable()}
    assert u == {"R-F7", "R-ROUTE1"}
    for c in L.CANDIDATES:
        if c["id"] in u:
            assert c["revisit_when"], "an untriggerable candidate must still say WHEN"
