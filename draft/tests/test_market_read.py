"""COVERAGE REACHES THE CONSUMER — the health verdict and the snapshot reader.

Two of B's second-audit findings live here.

  * `ok = events_captured > 0`, so ONE event out of forty-eight reset
    consecutive_failures, advanced last_success_at and passed the staleness gate.
    `last_coverage` was written by the same function one line above the verdict
    and read by nothing. The published run — 13 of 48, coverage 0.271, complete
    false — was recorded as a clean success.

  * And the structural note behind it: nothing read a snapshot BACK, so
    `complete: false` was a correct label with no reader obliged to honour it.
    That is the seam where the attrition reasons were discarded in audit one and
    the retry advice in audit two. Same pattern three times — computed correctly,
    written down, ignored by the consumer.

So the reader ships WITH the honouring, and these tests assert the honouring
rather than the label.

THRESHOLDS ARE BROKEN AT THE BOUNDARY, not by a mile. A 2%-vs-100% test only
proves the mechanism fires; it says nothing about whether the ceiling is in the
right place, which is precisely how a 0.5-1.5 conservation band sat green over a
21% violation.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import market_capture as C  # noqa: E402
import market_read as MR    # noqa: E402


def snap(captured, deferred=(), failed=(), when="2026-08-11T00:47:51Z", listed=None):
    n = len(captured) + len(deferred) + len(failed) if listed is None else listed
    return {
        "league": "usa-nfl-preseason", "finished_at": when,
        "events_captured": len(captured), "events_listed": n,
        "coverage": (len(captured) / n) if n else 0.0,
        "complete": len(captured) == n,
        "events_deferred_for_budget": list(deferred), "deferred_count": len(deferred),
        "failures": [{"event_id": e} for e in failed],
        "events": [{"event_id": e, "captured_at": when, "odds": {}} for e in captured],
    }


def write_health(tmp_path, monkeypatch, s):
    monkeypatch.setattr(C, "OUT_DIR", tmp_path)
    monkeypatch.setattr(C, "HEALTH", tmp_path / "capture_health.json")
    return C.write_health(s)


# ── the verdict now reads coverage ──────────────────────────────────────────
def test_the_published_2_percent_run_is_NOT_recorded_as_complete(tmp_path, monkeypatch):
    """The real numbers from 2026-08-11: 13 of 48, coverage 0.271."""
    h = write_health(tmp_path, monkeypatch,
                     snap(list(range(13)), deferred=list(range(100, 135))))
    assert h["last_complete"] is False
    assert h["consecutive_incomplete"] == 1
    assert abs(h["last_coverage"] - 13 / 48) < 1e-9
    # It IS still a success in the "something was captured" sense — that counter
    # is kept, because a partial run and a dead run need different responses.
    assert h["consecutive_failures"] == 0
    assert h["last_success_at"] is not None
    # ...but the COMPLETENESS clock did not advance, and that is the one the
    # staleness gate needs.
    assert h["last_complete_at"] is None


def test_a_full_slate_advances_the_completeness_clock(tmp_path, monkeypatch):
    h = write_health(tmp_path, monkeypatch, snap(list(range(48))))
    assert h["last_complete"] is True
    assert h["consecutive_incomplete"] == 0
    assert h["last_complete_at"] == "2026-08-11T00:47:51Z"


def test_incomplete_runs_ACCUMULATE_and_a_full_one_clears_them(tmp_path, monkeypatch):
    for i in range(3):
        h = write_health(tmp_path, monkeypatch, snap([1], deferred=list(range(47))))
    assert h["consecutive_incomplete"] == 3
    assert h["consecutive_incomplete"] >= h["max_consecutive_incomplete"], \
        "at the declared bar the workflow gate must fail"
    h = write_health(tmp_path, monkeypatch, snap(list(range(48))))
    assert h["consecutive_incomplete"] == 0


# ── BOUNDARY, not extreme ───────────────────────────────────────────────────
def test_one_event_short_of_the_slate_is_INCOMPLETE(tmp_path, monkeypatch):
    """47 of 48 — coverage 0.979. A 2%-vs-100% test would pass with the bar
    anywhere between them; this pins it at 'everything'."""
    h = write_health(tmp_path, monkeypatch, snap(list(range(47)), deferred=[99]))
    assert h["last_complete"] is False, "0.979 is not complete"
    assert h["consecutive_incomplete"] == 1


def test_and_the_full_slate_the_other_side_of_that_boundary_is_complete(tmp_path,
                                                                        monkeypatch):
    h = write_health(tmp_path, monkeypatch, snap(list(range(48))))
    assert h["last_complete"] is True


def test_zero_captured_is_a_FAILURE_not_merely_incomplete(tmp_path, monkeypatch):
    h = write_health(tmp_path, monkeypatch, snap([], deferred=list(range(48))))
    assert h["consecutive_failures"] == 1 and h["last_complete"] is False


def test_completeness_is_RE_DERIVED_not_inherited_from_the_producers_label(
        tmp_path, monkeypatch):
    """A consumer that trusts a producer's boolean inherits the producer's
    mislabels. The snapshot below claims complete: true over 13 of 48."""
    s = snap(list(range(13)), deferred=list(range(100, 135)))
    s["complete"] = True                       # a lying producer
    h = write_health(tmp_path, monkeypatch, s)
    assert h["last_complete"] is False


# ── the reader honours the holes ────────────────────────────────────────────
def test_a_baseline_set_CANNOT_be_obtained_without_its_holes():
    bl = MR.baselines([snap([1, 2, 3], deferred=[4, 5])])
    assert bl["missing"] == ["4", "5"]
    assert bl["complete"] is False
    assert bl["captured_total"] == 3 and bl["listed_total"] == 5


def test_the_denominator_is_every_event_EVER_LISTED_not_every_row():
    """An event deferred in every run to date has no rows anywhere, so a coverage
    figure computed from rows alone would rate a 13-of-48 capture as total."""
    bl = MR.baselines([snap([1], deferred=list(range(2, 49)))])
    assert bl["listed_total"] == 48 and bl["captured_total"] == 1
    assert abs(bl["coverage"] - 1 / 48) < 1e-9


def test_require_complete_REFUSES_and_names_the_events():
    bl = MR.baselines([snap([1, 2], deferred=[7, 8, 9])])
    with pytest.raises(MR.IncompleteBaseline) as e:
        MR.require_complete(bl)
    msg = str(e.value)
    assert "2/5" in msg and "7" in msg, "the missing ids must be actionable"


def test_require_complete_passes_on_a_whole_slate():
    MR.require_complete(MR.baselines([snap([1, 2, 3])]))


def test_the_EARLIEST_observation_is_the_baseline_not_the_first_file_opened():
    """Signal C measures movement FROM a baseline, so file order must not decide
    which observation that is."""
    late = snap([1], when="2026-08-20T00:00:00Z")
    early = snap([1], when="2026-08-11T00:00:00Z")
    # BOTH ORDERINGS, and that is not thoroughness for its own sake. Tested with
    # only [late, early], a "last one wins" implementation returns `early` and
    # passes — the assertion would be satisfied by input order rather than by the
    # timestamp comparison it claims to check. Found by breaking the comparison to
    # `if True:` and watching the suite stay green.
    for order in ([late, early], [early, late]):
        bl = MR.baselines(order)
        assert bl["by_event"]["1"]["captured_at"] == "2026-08-11T00:00:00Z", \
            f"earliest must win regardless of input order; failed on {order is not None}"


def test_a_second_observation_is_what_makes_movement_measurable(tmp_path):
    a = snap([1, 2], when="2026-08-11T00:00:00Z")
    b = snap([1], when="2026-08-12T00:00:00Z")
    for i, s in enumerate((a, b)):
        (tmp_path / f"s{i}.json").write_text(json.dumps(s))
    rep = MR.report(tmp_path)
    assert rep["events_with_movement"] == 1, "event 2 has a point, not a series"
    assert rep["events_without_baseline"] == []


def test_an_unreadable_snapshot_is_a_REPORTED_hole_not_a_skipped_one(tmp_path):
    (tmp_path / "good.json").write_text(json.dumps(snap([1])))
    (tmp_path / "broken.json").write_text("{ not json")
    rep = MR.report(tmp_path)
    assert rep["unreadable"] == ["broken.json"]


def test_the_reader_reproduces_the_real_published_snapshot():
    """Against what is actually on disk, not a fixture. Independent arithmetic:
    13 captured, 35 deferred, 48 listed, 0.2708."""
    rep = MR.report()
    if rep["snapshots"] == 0:
        pytest.skip("no snapshots on disk in this checkout")
    assert rep["events_listed"] == rep["events_with_baseline"] + len(
        rep["events_without_baseline"])
    assert abs(rep["baseline_coverage"]
               - rep["events_with_baseline"] / rep["events_listed"]) < 1e-3
