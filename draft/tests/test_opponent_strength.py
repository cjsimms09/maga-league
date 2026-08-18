"""Tests for the P56 gate.

**EVERY ONE OF THESE IS A CHECK THAT CAN FAIL.** The defect class this project keeps
finding is the opposite — a check that cannot fail, reported as a check that passed —
so the two bugs found while building this module (the postseason week collision and the
three-way team-code disagreement) are pinned here as KNOWN-POSITIVE controls: the test
first proves the bug is detectable, then proves the fix detects it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import opponent_strength as O  # noqa: E402


# ── the postseason collision ───────────────────────────────────────────────────

def _sched(rows):
    return {"rows": rows}


def test_postseason_rows_do_not_overwrite_the_regular_season_opponent():
    """The bug that would have silently mis-rated all 14 playoff teams.

    BDL numbers the playoffs 1..5, not 19..22, so a wild-card game IS week 1 as far as
    a `(team, week)` map is concerned. A `1 <= week <= 17` filter cannot catch this
    because the collision happens inside that range.
    """
    s = _sched([
        {"week": 1, "home": "KC", "away": "BAL", "postseason": False},
        # The wild-card round, which BDL also calls week 1:
        {"week": 1, "home": "KC", "away": "HOU", "postseason": True},
    ])
    opp = O.opponent_by_team_week(s)
    assert opp[("KC", 1)] == "BAL", "the playoff game overwrote the regular-season one"
    assert ("HOU", 1) not in opp


def test_the_collision_is_real_if_postseason_is_not_filtered():
    """KNOWN-POSITIVE: without the guard the fixture above genuinely corrupts.

    Without this, the test above could pass for the wrong reason — e.g. if the fixture
    never actually produced a collision — and we would be reporting a check that cannot
    fail. Here the same rows are folded WITHOUT the filter and the corruption appears.
    """
    naive = {}
    for g in _sched([
        {"week": 1, "home": "KC", "away": "BAL", "postseason": False},
        {"week": 1, "home": "KC", "away": "HOU", "postseason": True},
    ])["rows"]:
        naive[(g["home"], g["week"])] = g["away"]
    assert naive[("KC", 1)] == "HOU", "fixture does not reproduce the bug it guards"


def test_real_schedules_actually_contain_the_trap():
    """And the trap is not hypothetical — it is in the committed 2025 artifact."""
    p = ROOT / "draft" / "data" / "nfl_schedule_2025.json"
    if not p.exists():
        pytest.skip("2025 schedule not captured in this checkout")
    rows = json.loads(p.read_text())["rows"]
    ps_weeks = {r["week"] for r in rows if r.get("postseason")}
    assert ps_weeks and min(ps_weeks) <= 17, (
        "BDL changed its postseason numbering — re-read opponent_by_team_week's docstring"
    )


# ── the three-way team-code disagreement ──────────────────────────────────────

def test_team_crosswalk_is_adp_pys_and_not_a_private_fourth_copy():
    from adp import TEAM_ALIASES as CANON
    assert O.TEAM_ALIASES is CANON, "a private crosswalk has been reintroduced"


@pytest.mark.parametrize("raw", ["WAS", "WSH", "LA", "LAR"])
def test_both_spellings_of_the_two_disputed_teams_land_on_one_code(raw):
    assert O._norm_team(raw) in O.NFL_TEAMS


def test_component_and_schedule_sides_meet_after_normalisation():
    """The regression for 614 dropped player-games across 2024-25."""
    sched = ROOT / "draft" / "data" / "nfl_schedule_2025.json"
    comp = ROOT / "draft" / "backtest" / "component_stats_2025.json"
    if not (sched.exists() and comp.exists()):
        pytest.skip("2025 inputs not present in this checkout")
    opp = O.opponent_by_team_week(json.loads(sched.read_text()))
    sched_teams = {t for (t, _w) in opp}
    comp_teams = {O._norm_team((m or {}).get("team"))
                  for wk in json.loads(comp.read_text())["weeks"]
                  for m in (wk.get("players") or {}).values()
                  if m and m.get("team")}
    assert not (comp_teams - sched_teams), f"unmatched offences: {comp_teams - sched_teams}"


# ── the join ──────────────────────────────────────────────────────────────────

_OPP = {("BUF", 1): "NYJ", ("NYJ", 1): "BUF"}


def _comp(players_by_week):
    return {"weeks": [{"week": w, "players": p} for w, p in players_by_week.items()]}


def _pts(points_by_week):
    return {"weeks": [{"week": w, "points": p} for w, p in points_by_week.items()]}


def test_missing_opponent_and_missing_points_are_counted_separately():
    """Lumping them into one number is what hid the team-code break."""
    rows, lost = O.player_games(
        _comp({1: {"1": {"pos": "WR", "team": "BUF"},     # fine
                   "2": {"pos": "WR", "team": "XXX"},     # no opponent
                   "3": {"pos": "WR", "team": "NYJ"}}}),  # no points
        _pts({1: {"1": 10.0, "2": 9.0}}),
        _OPP,
    )
    assert [r["pid"] for r in rows] == ["1"]
    assert lost["no_opponent"] == 1 and lost["no_points"] == 1
    assert lost["teams_unmatched"] == {"XXX": 1}


def test_a_missing_score_is_dropped_not_scored_as_zero():
    rows, _ = O.player_games(
        _comp({1: {"9": {"pos": "RB", "team": "BUF"}}}), _pts({1: {}}), _OPP)
    assert rows == []


def test_the_weeks_window_is_honoured_on_both_sides():
    comp = _comp({1: {"1": {"pos": "WR", "team": "BUF"}},
                  9: {"1": {"pos": "WR", "team": "BUF"}}})
    pts = _pts({1: {"1": 10.0}, 9: {"1": 20.0}})
    opp = dict(_OPP); opp[("BUF", 9)] = "NYJ"
    rows, _ = O.player_games(comp, pts, opp, weeks=range(9, 18))
    assert [r["week"] for r in rows] == [9]


# ── the rating ────────────────────────────────────────────────────────────────

def _row(pid, week, defense, points, pos="WR"):
    return {"pid": pid, "week": week, "pos": pos, "team": "X",
            "defense": defense, "points": points}


def test_a_defence_that_suppresses_scoring_rates_negative():
    """KNOWN-POSITIVE: signal injected on purpose must come out with the right sign."""
    rows = []
    for pid in "abcdefgh":
        rows += [_row(pid, 1, "STOUT", 5.0)] + [_row(pid, w, f"D{w}", 15.0)
                                                for w in range(2, 6)]
    r = O.allowed_vs_expected(rows, min_games=6)
    assert r[("STOUT", "WR")]["vs_expected"] < -5
    assert r[("STOUT", "WR")]["n"] == 8


def test_schedule_quality_is_cancelled_not_measured():
    """The whole reason for the vs-expected form rather than raw points allowed.

    `HARD` faces only 30-point players and `EASY` only 5-point players, and NEITHER
    changes anyone's output. A raw points-allowed table would call HARD the worst
    defence in the league; this one must call both of them neutral.
    """
    rows = []
    for pid in "abcdefgh":                       # elite players, all face HARD in wk 1
        rows += [_row(pid, 1, "HARD", 30.0)] + [_row(pid, w, f"D{w}", 30.0)
                                                for w in range(2, 6)]
    for pid in "ijklmnop":                       # replacement players, all face EASY
        rows += [_row(pid, 1, "EASY", 5.0)] + [_row(pid, w, f"D{w}", 5.0)
                                               for w in range(2, 6)]
    r = O.allowed_vs_expected(rows, min_games=6)
    assert abs(r[("HARD", "WR")]["vs_expected"]) < 0.01
    assert abs(r[("EASY", "WR")]["vs_expected"]) < 0.01


def test_a_player_with_no_baseline_cannot_rate_a_defence():
    rows = [_row("solo", 1, "D", 40.0), _row("solo", 2, "E", 0.0)]
    assert O.allowed_vs_expected(rows, min_games=1) == {}


def test_min_games_suppresses_a_defence_rated_by_too_few_player_games():
    rows = []
    for pid in "abc":
        rows += [_row(pid, 1, "THIN", 5.0)] + [_row(pid, w, f"D{w}", 15.0)
                                               for w in range(2, 6)]
    assert ("THIN", "WR") not in O.allowed_vs_expected(rows, min_games=6)
    assert ("THIN", "WR") in O.allowed_vs_expected(rows, min_games=3)


# ── the gate itself ───────────────────────────────────────────────────────────

def _ratings(vals, pos="RB"):
    return {(f"D{i:02d}", pos): {"n": 10, "vs_expected": v} for i, v in enumerate(vals)}


def test_identical_ratings_persist_perfectly():
    v = [i * 0.5 for i in range(16)]
    assert O.persistence(_ratings(v), _ratings(v))["RB"]["rho"] == 1.0


def test_reversed_ratings_read_as_mean_reversion():
    v = [i * 0.5 for i in range(16)]
    out = O.persistence(_ratings(v), _ratings(list(reversed(v))))["RB"]
    assert out["rho"] == -1.0 and out["reading"].startswith("NEGATIVE")


def test_too_few_shared_defences_reports_not_measurable_rather_than_a_number():
    out = O.persistence(_ratings([1, 2, 3]), _ratings([1, 2, 3]))["RB"]
    assert out["rho"] is None and "too few" in out["reading"]


def test_the_reading_thresholds_are_the_ones_the_verdict_relies_on():
    assert O._read(0.31).startswith("PERSISTS")
    assert O._read(0.15).startswith("WEAK")
    assert O._read(0.0).startswith("NO PERSISTENCE")
    assert O._read(-0.4).startswith("NEGATIVE")


def test_shuffle_null_rejects_a_perfect_signal_and_accepts_noise():
    """Both directions, because a null that always fires is no null at all."""
    v = [i * 0.5 for i in range(32)]
    real = O.shuffle_null(_ratings(v), _ratings(v), "RB", k=200)
    assert real["beats_null"] is True and real["p_value"] < 0.05

    import random
    rng = random.Random(7)
    noise = [rng.random() for _ in range(32)]
    flat = O.shuffle_null(_ratings(v), _ratings(noise), "RB", k=200)
    assert flat["beats_null"] is False


def test_shuffle_null_is_deterministic():
    v = [i * 0.5 for i in range(32)]
    a = O.shuffle_null(_ratings(v), _ratings(list(reversed(v))), "RB", k=50)
    b = O.shuffle_null(_ratings(v), _ratings(list(reversed(v))), "RB", k=50)
    assert a == b


# ── the verdict wiring ────────────────────────────────────────────────────────

def _res(draft_med, in_med):
    pooled = lambda m: {p: {"pairs": 1, "rhos": [m], "median": m, "reading": ""}
                        for p in O.POSITIONS}
    return {"draft_day": {"pooled": pooled(draft_med)},
            "in_season": {"pooled": pooled(in_med)}}


def test_verdict_separates_the_two_bars():
    assert O._verdict(_res(0.5, 0.5)).startswith("PERSISTS AT BOTH BARS")
    assert O._verdict(_res(0.05, 0.25)).startswith("IN-SEASON ONLY")
    assert O._verdict(_res(0.05, 0.02)).startswith("DOES NOT PERSIST")


def test_a_draft_day_pass_alone_cannot_claim_the_in_season_bar():
    """Guards the asymmetry: in-season is the EASIER bar, so clearing only the harder
    one would mean the ratings are unstable within a season and stable across them —
    an implausible result that must not be reported as a pass (rule 3d)."""
    assert O._verdict(_res(0.6, 0.0)).startswith("DOES NOT PERSIST")


def test_missing_inputs_report_not_measurable_rather_than_a_false_negative():
    empty = {p: {"pairs": 0, "rhos": [], "median": None, "reading": ""}
             for p in O.POSITIONS}
    res = {"draft_day": {"pooled": empty}, "in_season": {"pooled": empty}}
    assert O._verdict(res).startswith("NOT MEASURABLE")
