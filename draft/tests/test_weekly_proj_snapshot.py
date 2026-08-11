# TERRITORY: A
"""THE WEEKLY PROJECTION SNAPSHOT — the only shadow-strategy input with a deadline.

WHY IT EXISTS AND THE LAYER DOES NOT. Measured from 540 team-weeks: the shadow
comparison is PAIRED, so the noise is the 11.44-point SD of the slot two
strategies disagree about. Even disagreeing EVERY week, the smallest detectable
edge is 7.8 points — 64% of an average starter's output. Seventeen weeks cannot
separate two strategies, so no field is built.

But a shadow strategy's choice is f(roster, projections). Sleeper returns the
roster retroactively; providers OVERWRITE weekly projections in place. So the
projections are the one input that disappears, and archiving them converts a
closing window into an open one — every strategy becomes replayable in January,
not the two or three we would guess at in August.

Run: python3 -m pytest draft/tests/test_weekly_proj_snapshot.py
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import proj_series as PS  # noqa: E402


def test_a_weekly_snapshot_carries_its_week():
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0}, week=1)
    assert s[0]["week"] == 1


def test_the_preseason_shape_is_unchanged():
    """Five preseason snapshots already exist and every reader must keep working.

    A `week: null` on those rows would be a field that is present-and-empty on
    five and meaningful on eighty — read wrong exactly once, in January.
    """
    s = PS.append_snapshot([], "2026-08-11", "fantasypros", {"1": 20.0})
    assert "week" not in s[0]


def test_week_is_part_of_the_dedupe_key_not_a_label():
    """THE POINT OF THE WHOLE FILE. Two weeks snapshotted on the same date by the
    same source are DIFFERENT OBJECTS. If week were only a label, the second would
    overwrite the first and a week of inputs would be silently gone — which is
    exactly the loss the snapshot exists to prevent, reproduced inside it."""
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0}, week=1)
    s = PS.append_snapshot(s, "2026-09-06", "sleeper_weekly", {"1": 30.0}, week=2)
    assert len(s) == 2, [x.get("week") for x in s]
    assert {x["week"] for x in s} == {1, 2}


def test_a_rerun_of_the_same_week_overwrites_rather_than_doubling():
    """The workflow may run twice (a retry, a manual dispatch). Two snapshots of
    the same week would double-count that week in any January replay."""
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0}, week=1)
    s = PS.append_snapshot(s, "2026-09-06", "sleeper_weekly", {"1": 25.0}, week=1)
    assert len(s) == 1
    assert s[0]["proj"]["1"] == 25.0


def test_preseason_and_weekly_coexist_and_sort():
    """Sorting must not compare None to int — preseason rows carry no week."""
    s = PS.append_snapshot([], "2026-08-11", "fantasypros", {"1": 10.0})
    s = PS.append_snapshot(s, "2026-09-06", "sleeper_weekly", {"1": 20.0}, week=1)
    s = PS.append_snapshot(s, "2026-09-13", "sleeper_weekly", {"1": 21.0}, week=2)
    assert [x.get("week") for x in s] == [None, 1, 2]


def test_the_reader_refuses_a_nearby_week_rather_than_falling_back():
    """A silent fallback to the adjacent week would grade a strategy against
    inputs it never saw — the exp33 leak that disqualified Sleeper, one level
    down. Asking for a week we never snapshotted returns {}."""
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0}, week=1)
    assert PS.week_snapshot(s, 1) == {"1": 20.0}
    assert PS.week_snapshot(s, 2) == {}


def test_the_reader_takes_the_LATEST_snapshot_for_a_week():
    """If a week was snapshotted twice on different dates, the later one is the
    one closer to kickoff and therefore the one a lineup was set from."""
    s = PS.append_snapshot([], "2026-09-04", "sleeper_weekly", {"1": 20.0}, week=1)
    s = PS.append_snapshot(s, "2026-09-06", "sleeper_weekly", {"1": 26.0}, week=1)
    assert PS.week_snapshot(s, 1) == {"1": 26.0}


def test_the_live_series_still_parses_and_its_preseason_rows_are_intact():
    """Against the real committed file, not a fixture."""
    import json
    p = os.path.join(ROOT, "draft", "data", "proj_series.json")
    if not os.path.exists(p):
        return
    with open(p, encoding="utf-8") as fh:
        doc = json.load(fh)
    series = doc.get("series") or []
    assert series, "the series is empty"
    pre = [s for s in series if s.get("week") is None]
    assert pre, "every preseason snapshot vanished"
    assert all("proj" in s and s["proj"] for s in pre)


# ── THE SCHEDULER'S FAILURE MODE, WHICH THE FIRST VERSION SHIPPED ───────────

def _load_snapshot_module():
    import importlib
    sys.path.insert(0, os.path.join(ROOT, "draft"))
    return importlib.import_module("weekly_proj_snapshot")


def test_preseason_is_a_clean_skip_not_a_failure(monkeypatch, capsys):
    """The cron fires from the day it lands and the season starts weeks later.

    The first version exited 1 whenever the week was unknown, which would have
    made this job RED BY DESIGN every Sunday until week 1 — and a job expected to
    be red is a job nobody reads, so the first genuine failure would look like
    the twentieth expected one. That is the deploy-verify failure mode this repo
    already names, shipped fresh.
    """
    M = _load_snapshot_module()
    monkeypatch.setattr(M, "nfl_state", lambda: {"season": "2026", "season_type": "pre", "week": 0})
    monkeypatch.setattr(sys, "argv", ["weekly_proj_snapshot.py"])
    assert M.main() == 0
    assert "nothing to snapshot yet" in capsys.readouterr().out


def test_but_an_unknown_week_DURING_the_regular_season_still_refuses(monkeypatch, capsys):
    """The case where a guess would mislabel real data keeps refusing. A snapshot
    filed under the wrong week grades a strategy against inputs it never saw."""
    M = _load_snapshot_module()
    monkeypatch.setattr(M, "nfl_state", lambda: {"season": "2026", "season_type": "regular", "week": None})
    monkeypatch.setattr(sys, "argv", ["weekly_proj_snapshot.py"])
    assert M.main() == 1
    assert "REFUSING" in capsys.readouterr().out


def test_an_explicit_week_overrides_the_preseason_skip(monkeypatch):
    """A manual dispatch with --week must not be silently skipped; the operator
    asking for a specific week has more information than the state endpoint."""
    M = _load_snapshot_module()
    monkeypatch.setattr(M, "nfl_state", lambda: {"season": "2026", "season_type": "pre", "week": 0})
    monkeypatch.setattr(sys, "argv", ["weekly_proj_snapshot.py", "--week", "1"])
    monkeypatch.setattr(M.SI, "fetch_projections", lambda season, week=None: {})
    # Reaches the fetch (and refuses on empty rows) rather than skipping at the gate.
    assert M.main() == 1
