# TERRITORY: A
"""THE DECISION GRADE'S CONTROLS MUST BE ABLE TO FIRE.

`weekly_decision_grade.py` refuses rather than reports when its instrument
checks fail — ACTUAL must reproduce Sleeper's own weekly total to the cent, and
a hindsight ceiling below what actually happened is impossible. A refusal path
that has never been made to fire is not a control, it is a comment (rule 3e).

⚠️ WHAT IS PINNED HERE AND WHAT IS DELIBERATELY NOT. Week 1 of 2026 is a
COMPLETED week: those points are history and cannot move, so pinning them is
safe in a way that pinning a projection is not. That distinction is the whole
lesson of register 503, where a test asserted a live board against a frozen
provider capture and refused the board when the provider moved. A completed
game is frozen by nature; a projection is frozen only by assumption.

Run: python -m pytest draft/tests/test_weekly_decision_grade.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import money_grade as MG            # noqa: E402
import replay_lineup as RL          # noqa: E402
import weekly_decision_grade as W   # noqa: E402


@pytest.fixture(scope="module")
def season():
    s = MG.season_of(MG.load_history(), W.SEASON)
    assert s is not None, f"season {W.SEASON} missing from league_history.json"
    return s


@pytest.fixture(scope="module")
def ctx(season):
    rid = W.seat_of(season, W.OWNER)
    return rid, RL.starting_slots(season), RL.positions_map(MG.load_history())


def test_the_seat_is_READ_from_the_owners_map(season):
    """Not hardcoded. A wrong seat makes every number below describe somebody
    else's team, which is the failure CLAUDE.md's ROSTER RULE exists to stop."""
    rid = W.seat_of(season, W.OWNER)
    assert str(season["owners"][str(rid)]["display_name"]).lower() == W.OWNER.lower()


def test_an_unknown_owner_REFUSES_rather_than_guessing(season):
    with pytest.raises(SystemExit) as e:
        W.seat_of(season, "nobody-by-this-name")
    assert "REFUSING" in str(e.value)


def test_CONTROL_actual_reproduces_sleepers_own_weekly_total(season, ctx):
    """replay_lineup's §13 instrument check, on the live season.

    If summing the recorded starters does not equal Sleeper's own `points`, the
    slot assignment or the scoring join is wrong and every arm is worthless.
    """
    rid, slots, pos_of = ctx
    checked = 0
    for w in MG.regular_season_weeks(season):
        row = RL.seat_row(season, w, rid)
        if not row or row.get("points") is None:
            continue
        pts = {k: float(v) for k, v in (row.get("players_points") or {}).items()}
        if not any(pts.values()):
            continue
        got = round(sum(pts.get(p, 0.0) for p in (row.get("starters") or [])), 2)
        assert got == pytest.approx(float(row["points"]), abs=0.011), (w, got, row["points"])
        checked += 1
    assert checked >= 1, "no completed week was checked — this test passed vacuously"


def test_FAIL_ARM_a_mismatched_actual_is_REFUSED(season, ctx):
    """The known positive: perturb one starter's points and the grader must
    refuse, not report. Uses the real week and the real roster, not a fixture.
    """
    rid, slots, pos_of = ctx
    week = next(w for w in MG.regular_season_weeks(season)
                if (RL.seat_row(season, w, rid) or {}).get("points"))
    hurt = json.loads(json.dumps(season))            # deep copy, season untouched
    row = RL.seat_row(hurt, week, rid)
    victim = (row.get("starters") or [])[0]
    row["players_points"][victim] = float(row["players_points"].get(victim, 0)) + 7.0
    with pytest.raises(SystemExit) as e:
        W.grade_week(hurt, rid, week, slots, pos_of)
    assert "REFUSING" in str(e.value) and "Sleeper's own weekly total" in str(e.value)


def test_FAIL_ARM_a_ceiling_below_actual_is_REFUSED(season, ctx, monkeypatch):
    """The second impossibility. Forced by making `assign` return a deliberately
    poor lineup, which is what a broken optimizer would do."""
    rid, slots, pos_of = ctx
    week = next(w for w in MG.regular_season_weeks(season)
                if (RL.seat_row(season, w, rid) or {}).get("points"))
    row = RL.seat_row(season, week, rid)
    pts = {k: float(v) for k, v in (row.get("players_points") or {}).items()}
    worst = sorted(row["players"], key=lambda p: pts.get(p, 0.0))[:len(slots)]
    monkeypatch.setattr(W.RL, "assign", lambda *a, **k: worst)
    with pytest.raises(SystemExit) as e:
        W.grade_week(season, rid, week, slots, pos_of)
    assert "REFUSING" in str(e.value) and "BELOW" in str(e.value)


def test_the_ceiling_is_never_worse_than_what_was_played(season, ctx):
    rid, slots, pos_of = ctx
    for w in MG.regular_season_weeks(season):
        g = W.grade_week(season, rid, w, slots, pos_of)
        if g:
            assert g["ceiling"] >= g["actual"] - 0.011, g


def test_an_absent_props_week_reports_NULL_not_a_champion_fallback(season, ctx, monkeypatch):
    """Absent is absent. Falling back to the champion would make the challenger
    look like it agreed with us, which is the most expensive possible bug in a
    file whose whole job is to tell two arms apart."""
    rid, slots, pos_of = ctx
    week = next(w for w in MG.regular_season_weeks(season)
                if (RL.seat_row(season, w, rid) or {}).get("points"))
    monkeypatch.setattr(W, "props_values", lambda _w: {})
    g = W.grade_week(season, rid, week, slots, pos_of)
    assert g["props"] is None and "absent, not zero" in g["props_note"]


def test_week1_2026_is_the_loss_it_was__a_COMPLETED_week_cannot_move(season, ctx):
    """Cory scored 135.76, lost by 11.24, and left 18.30 on the bench — a
    perfect lineup would have won. These are finished games, not projections.
    """
    rid, slots, pos_of = ctx
    g = W.grade_week(season, rid, 1, slots, pos_of)
    assert g is not None, "week 1 has no scores — the history capture regressed"
    assert g["actual"] == pytest.approx(135.76, abs=0.011)
    assert g["opponent_points"] == pytest.approx(147.00, abs=0.011)
    assert g["result"] == "L"
    assert g["left_on_bench"] == pytest.approx(18.30, abs=0.011)
    assert g["ceiling_would_flip"] is True
    #: and the finding that actually matters — our champion set the SAME lineup
    #: he did, so the model added nothing on the one decision that was live.
    assert g["champion"] == pytest.approx(g["actual"], abs=0.011)
    assert g["champion_would_flip"] is False
