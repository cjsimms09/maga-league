# TERRITORY: A
"""Weekly roster state — the capture that ends today's worst refusal.

VAR_BACKUP and VAR_INJURED were not measured-and-found-small. They were
UNMEASURABLE: depth charts and injury designations are live Sleeper state, 2026
only, so a 2021-2025 fit had nothing to fit on. Nothing recovers those seasons.
Every season from here is recoverable only if the capture starts before the
state moves.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import proj_series as PS  # noqa: E402
import roster_state as RS  # noqa: E402


def _p(pid, **kw):
    return dict({"player_id": pid, "position": "WR"}, **kw)


def test_it_captures_exactly_the_fields_the_fit_could_not_measure():
    assert "depth_chart_order" in RS.SITUATION_FIELDS
    assert "injury_status" in RS.SITUATION_FIELDS


def test_it_shares_one_vocabulary_with_the_projection_freeze():
    """Two captures of the same idea must not drift into two field lists."""
    assert RS.SITUATION_FIELDS is PS.SITUATION_FIELDS


def test_absent_stays_absent():
    snap = RS.snapshot([_p("1", depth_chart_order=2),
                        {"player_id": "3"}], "2026-08-17")
    assert snap["state"]["1"]["depth_chart_order"] == 2
    assert "injury_status" not in snap["state"]["1"], (
        "a healthy player must not acquire a null designation — 'Sleeper "
        "reported nothing' and 'we did not fetch it' are different facts")
    assert "3" not in snap["state"], (
        "a row with NO captured field at all is not stored; an empty dict "
        "would read as 'we looked and he had no state', which is not what "
        "happened")


def test_a_same_week_rerun_replaces_rather_than_doubling():
    s = RS.append([], RS.snapshot([_p("1", depth_chart_order=2)], "2026-08-17", 1))
    s = RS.append(s, RS.snapshot([_p("1", depth_chart_order=1)], "2026-08-17", 1))
    assert len(s) == 1
    assert s[0]["state"]["1"]["depth_chart_order"] == 1


def test_the_transitions_are_what_it_exists_for():
    """THE REASON IT IS WEEKLY. A season snapshot records the end state and
    loses every move; the moves are the part that predicts anything."""
    s = RS.append([], RS.snapshot([_p("1", depth_chart_order=3)], "2026-08-17", 1))
    s = RS.append(s, RS.snapshot([_p("1", depth_chart_order=3)], "2026-08-24", 2))
    s = RS.append(s, RS.snapshot([_p("1", depth_chart_order=1)], "2026-08-31", 3))
    ch = RS.changes(s)
    assert ch["1"] == [("2026-08-31", 3, 1)], (
        "a WR3 becoming WR1 is the single most useful thing this store can say")


def test_a_player_who_never_moves_produces_no_noise():
    s = RS.append([], RS.snapshot([_p("1", depth_chart_order=1)], "2026-08-17", 1))
    s = RS.append(s, RS.snapshot([_p("1", depth_chart_order=1)], "2026-08-24", 2))
    assert RS.changes(s) == {}


def test_injury_transitions_are_tracked_too():
    s = RS.append([], RS.snapshot([_p("1", injury_status="Q")], "2026-08-17", 1))
    s = RS.append(s, RS.snapshot([_p("1", injury_status="Out")], "2026-08-24", 2))
    assert RS.changes(s, "injury_status")["1"] == [("2026-08-24", "Q", "Out")]


def test_round_trips_through_disk(tmp_path):
    t = tmp_path / "rs.json"
    RS.capture([_p("1", depth_chart_order=2)], "2026-08-17", 1, path=t)
    got = RS.capture([_p("1", depth_chart_order=1)], "2026-08-24", 2, path=t)
    assert got["snapshots"] == 2
    assert RS.changes(RS.load(t))["1"] == [("2026-08-24", 2, 1)]


def test_the_build_actually_calls_it():
    """A capture nobody calls leaves the hole open while looking fixed."""
    src = (Path(__file__).resolve().parents[1] / "build.py").read_text()
    assert "roster_state_mod.capture(" in src


def test_the_store_says_it_is_context_and_never_scored(tmp_path):
    import json
    t = tmp_path / "rs.json"
    RS.capture([_p("1", depth_chart_order=1)], "2026-08-17", path=t)
    note = json.loads(t.read_text())["_note"]
    assert "never scored" in note and "unmeasurable" in note
