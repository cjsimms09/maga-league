# TERRITORY: A
"""The trending capture, tested without egress — including its refusals.

Every failure here is one that would produce a series that LOOKS captured while
being hollow, which is worse than no series: the standing check would report it
quiet and growing, and nobody would find out until somebody asked it a question.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import sleeper_trending as ST                                  # noqa: E402


def _payload(pairs):
    return [{"player_id": p, "count": c} for p, c in pairs]


def test_a_snapshot_records_both_directions():
    s = ST.append_snapshot([], "2026-09-01", {"1": 500}, {"2": 300})
    assert s[0]["adds"] == {"1": 500}
    assert s[0]["drops"] == {"2": 300}
    assert s[0]["lookback_hours"] == ST.LOOKBACK_HOURS


def test_a_same_day_rerun_replaces_rather_than_doubles():
    s = ST.append_snapshot([], "2026-09-01", {"1": 500}, {})
    s = ST.append_snapshot(s, "2026-09-01", {"1": 900}, {})
    assert len(s) == 1
    assert s[0]["adds"]["1"] == 900


def test_the_series_stays_ordered_and_bounded():
    s = []
    for d in range(5):
        s = ST.append_snapshot(s, f"2026-09-0{d + 1}", {"1": d}, {}, max_days=3)
    assert len(s) == 3
    assert [x["date"] for x in s] == ["2026-09-03", "2026-09-04", "2026-09-05"]


# ── THE REFUSALS ────────────────────────────────────────────────────────────

def test_a_changed_payload_shape_raises_rather_than_writing_an_empty_day():
    with pytest.raises(ValueError, match="expected a list"):
        ST._parse({"players": []})
    with pytest.raises(ValueError, match="missing player_id/count"):
        ST._parse([{"pid": "1", "n": 5}])


def test_two_empty_responses_refuse_to_write_a_captured_day():
    """A day that captured nothing must not look like a day that captured zero
    interest. The first is a broken fetch; the second is a fact about the world,
    and Sleeper does not produce the second in September."""
    with pytest.raises(ValueError, match="refusing to write an empty snapshot"):
        ST.fetch_and_append([], "2026-09-01", get_json=lambda url: [])


# ── THE READER EXISTS FROM DAY ONE (rule 14) ────────────────────────────────

def test_movers_reports_the_change_not_the_level():
    """A player at 900 adds who was at 880 yesterday is not news. A player at
    400 who was at 20 is. The series is only worth having if it is read as a
    difference, so the reader ships with the writer."""
    s = ST.append_snapshot([], "2026-09-01", {"steady": 880, "spike": 20}, {})
    s = ST.append_snapshot(s, "2026-09-02", {"steady": 900, "spike": 400}, {})
    top = ST.movers(s, "adds", days=1, top=2)
    assert top[0][0] == "spike"
    assert top[0][2] == 380
    assert top[1][2] == 20


def test_movers_is_empty_before_there_are_two_days():
    s = ST.append_snapshot([], "2026-09-01", {"a": 1}, {})
    assert ST.movers(s) == []


def test_the_fetch_path_is_exercised_without_egress():
    calls = []

    def fake(url):
        calls.append(url)
        return _payload([("9", 120)]) if "/add" in url else _payload([("4", 60)])

    s = ST.fetch_and_append([], "2026-09-01", get_json=fake)
    assert len(calls) == 2
    assert "lookback_hours=24" in calls[0] and "limit=50" in calls[0]
    assert s[0]["adds"] == {"9": 120} and s[0]["drops"] == {"4": 60}
