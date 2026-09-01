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
import json
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


# ── register 440: `season_type == 'regular'` is not the same as the week existing
def _import_module():
    import importlib
    import sys as _sys
    from pathlib import Path as _P
    root = _P(__file__).resolve().parents[2]
    if str(root) not in _sys.path:
        _sys.path.insert(0, str(root))
    if str(root / "draft") not in _sys.path:
        _sys.path.insert(0, str(root / "draft"))
    return importlib.import_module("weekly_proj_snapshot")


def test_KNOWN_POSITIVE_a_week_whose_games_are_far_away_is_a_CLEAN_skip(monkeypatch, capsys):
    """THE INCIDENT, from run 33324693382 on 2026-08-30: Sleeper had flipped
    `season_type` to 'regular' eleven days before week 1's first game, so this
    job asked for week-1 projections nobody had published, got `7627 rows, 0
    with stats`, correctly refused to write an empty snapshot, and exited 1 —
    and would have done so every day until kickoff.

    The guard above it already says why that is wrong ("a job that is red by
    design for a month is a job nobody reads"); it was keyed on the wrong field.
    """
    W = _import_module()
    monkeypatch.setattr(W, "nfl_state", lambda: {"season": "2026", "season_type": "regular", "week": 1})
    monkeypatch.setattr(W.sys, "argv", ["prog"])
    monkeypatch.setenv("PROJ_SNAPSHOT_NOW", "2026-08-30T17:14:00Z")
    monkeypatch.setenv("SEASON", "2026")
    rc = W.main()
    out = capsys.readouterr().out
    assert rc == 0, out
    assert "not live yet" in out, out
    assert "goes red" in out, "the message must say the skip STOPS being clean"


def test_CONTROL_inside_the_window_it_does_NOT_skip(monkeypatch, capsys):
    """The other arm, or the fix would just be a switch that turns the job off.
    Week 1's real Sunday is inside the window, so main() must fall through past
    the skip and reach the provider — which is unreachable in this sandbox, so
    it lands on a LATER, DIFFERENT refusal. That distinction is the assertion."""
    W = _import_module()
    monkeypatch.setattr(W, "nfl_state", lambda: {"season": "2026", "season_type": "regular", "week": 1})
    monkeypatch.setattr(W.sys, "argv", ["prog"])
    monkeypatch.setenv("PROJ_SNAPSHOT_NOW", "2026-09-13T12:50:00Z")
    monkeypatch.setenv("SEASON", "2026")
    W.main()
    out = capsys.readouterr().out
    assert "not live yet" not in out, out
    assert "snapshotting week 1 of 2026" in out, out


def test_CANNOT_SAY_never_skips(monkeypatch, capsys):
    """A season the schedule does not cover is CANNOT SAY, and cannot-say must
    fall through — a missing or stale schedule must never silently switch off
    the one input with a real deadline (rule 3e)."""
    W = _import_module()
    monkeypatch.setattr(W, "nfl_state", lambda: {"season": "2099", "season_type": "regular", "week": 1})
    monkeypatch.setattr(W.sys, "argv", ["prog"])
    monkeypatch.setenv("PROJ_SNAPSHOT_NOW", "2099-01-01T00:00:00Z")
    monkeypatch.setenv("SEASON", "2099")
    W.main()
    out = capsys.readouterr().out
    assert "not live yet" not in out, out
    assert "snapshotting week 1 of 2099" in out, out


def test_KNOWN_POSITIVE_inside_the_window_it_ACTUALLY_WRITES_A_SNAPSHOT(monkeypatch, tmp_path):
    """⚠️ THE ARM THAT WAS MISSING (register 458's follow-up, register 459).

    The control above proves main() gets PAST the skip — and then lands on the
    provider being unreachable in this sandbox, which is "a LATER, DIFFERENT
    refusal" in its own words. So every existing arm of this file ends in a
    refusal or a skip, and the branch that WRITES the row nobody can backfill
    had never been executed. That is the same hole the two reco crons had, found
    the same day and fixed there first (register 458): the wiring was proven and
    the write was not.

    This is the one input with a real deadline — providers overwrite weekly
    numbers in place, so a week missed in September cannot be recovered in
    January. It is worth a test that goes all the way to the file.

    ⚠️ WRITES TO A TEMP PATH, NEVER THE TRACKED ARTIFACT (registers 58/65/109 —
    never mutate-and-restore a committed store).
    """
    W = _import_module()
    out = tmp_path / "proj_series.json"
    monkeypatch.setattr(W, "OUT", out)
    monkeypatch.setattr(W, "nfl_state",
                        lambda: {"season": "2026", "season_type": "regular", "week": 1})
    monkeypatch.setattr(W.sys, "argv", ["prog"])
    monkeypatch.setenv("PROJ_SNAPSHOT_NOW", "2026-09-13T12:50:00Z")
    monkeypatch.setenv("SEASON", "2026")

    #: A provider response in the real shape: {player_id: {"stats": {...}}}.
    #: Two players so "it wrote something" cannot pass on a single row that the
    #: scorer happened to keep.
    monkeypatch.setattr(W.SI, "fetch_projections", lambda season, week=None: {
        "4046": {"stats": {"rec": 5.0, "rec_yd": 62.0, "rec_td": 0.5}},
        "9509": {"stats": {"rush_att": 14.0, "rush_yd": 71.0, "rush_td": 0.6}},
    })

    rc = W.main()
    assert rc == 0, "inside the window with a responding provider, main() must SUCCEED"
    assert out.exists(), "no snapshot file was written at all"

    doc = json.loads(out.read_text())
    weekly = [s for s in doc["series"] if s.get("week") is not None]
    assert len(weekly) == 1, weekly
    snap = weekly[0]
    assert snap["week"] == 1 and snap["source"] == "sleeper_weekly", snap
    assert set(snap["proj"]) == {"4046", "9509"}, snap["proj"]
    assert all(v > 0 for v in snap["proj"].values()), snap["proj"]

    #: THE RAW STAT LINE MUST TRAVEL WITH THE POINTS (TERRITORY-GRANT: C).
    #: The scoring table is versioned; a stored total alone cannot be re-scored
    #: under a corrected table later, and re-scoring is the whole reason the raw
    #: line is archived.
    #: ⚠️ THE FIELD IS `raw`, NOT `raw_by_id` — `raw_by_id` is the PARAMETER name
    #: on append_snapshot, and asserting it here failed on my first run. The
    #: code was right and the test was wrong; recorded because the next person
    #: reading append_snapshot's signature will reach for the same wrong name.
    assert snap.get("raw"), "the raw stat lines were dropped — a point total alone cannot be un-scored"
    assert set(snap["raw"]) == {"4046", "9509"}, snap["raw"]
    assert snap["raw"]["4046"]["rec_yd"] == 62.0, snap["raw"]


def test_FAIL_ARM_an_empty_provider_response_inside_the_window_REFUSES(monkeypatch, tmp_path):
    """CONTROL on the arm above: it must be the PROVIDER's rows that produced
    the snapshot, not the mere fact of being inside the window. An empty
    response must still refuse and write nothing — an empty week reads as "the
    projections were empty", which is a claim; a missing week reads as "we did
    not get one"."""
    W = _import_module()
    out = tmp_path / "proj_series.json"
    monkeypatch.setattr(W, "OUT", out)
    monkeypatch.setattr(W, "nfl_state",
                        lambda: {"season": "2026", "season_type": "regular", "week": 1})
    monkeypatch.setattr(W.sys, "argv", ["prog"])
    monkeypatch.setenv("PROJ_SNAPSHOT_NOW", "2026-09-13T12:50:00Z")
    monkeypatch.setenv("SEASON", "2026")
    monkeypatch.setattr(W.SI, "fetch_projections", lambda season, week=None: {})

    assert W.main() == 1, "an empty provider response inside the window must REFUSE"
    assert not out.exists(), "nothing may be written when the provider returned nothing"
