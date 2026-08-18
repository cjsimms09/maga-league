# TERRITORY: C
"""REAL WEEKLY VARIANCE — measured, not 0.25 x proj_mean.

`build_bundle.py` wrote `proj_sd = 0.25 * proj_mean`, so every player's spread was a
constant multiple of his mean and `proj_ceiling` was rank-identical to `proj_mean`.
Two of eight weights are dead for want of this one field (A, 2026-08-13).

CORRECTED 2026-08-17 — past tense above is now literal. `build_bundle.py` no
longer writes those constants; a bundle carries the measured p90/p10/sd per
(position, band), fitted leave-one-season-out, and NOTHING off an unmeasured
cell. What this module measures is still wanted, because the fix does not reach
far enough: the measured spread remains `proj_mean x a per-CELL constant`,
varying between bands and not within them, so there is still NO PER-PLAYER
dispersion signal on any board. That is the gap this file's weekly variance —
and, since 2026-08-17, snap-share volatility — would actually close.

Production derives the wrong way round — `weekly_sd = season_sd / sqrt(games)` — where
`season_sd` is itself `mean x a heuristic`. This inverts it: measure the weekly spread
from realized scoring, then `season_sd = weekly_sd * sqrt(games_expected)`.

AND IT CARRIES STATUS PER FIELD, because a variance of 0.0 is the most dangerous
possible wrong answer: it means PERFECTLY CERTAIN. A player with one game has no
measurable spread, and writing 0.0 would make him read as the safest pick on the board.

Run: python3 -m pytest draft/tests/test_nflverse_variance.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_variance as V  # noqa: E402

CW = {"g1": "s1", "g2": "s2", "g3": "s3"}
SCORING = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0}


def wk(gsis, season, week, rec_yd=0.0, pos="WR"):
    return {"player_id": gsis, "season": season, "week": week,
            "receiving_yards": rec_yd, "position": pos}


# ── the measurement itself ──────────────────────────────────────────────────
def test_weekly_sd_is_MEASURED_from_realized_scoring():
    """Two players, same season total, different week-to-week spread. MUTATION:
    return a constant multiple of the mean — the two become identical, which is
    exactly the state that makes the ceiling term unmeasurable."""
    rows = ([wk("g1", 2024, w, rec_yd=100) for w in range(1, 9)] +      # steady
            [wk("g2", 2024, w, rec_yd=(200 if w % 2 else 0)) for w in range(1, 9)])
    out, rep = V.weekly_variance(rows, [2024], SCORING, CW, before_season=2025)
    assert out["s1"]["status"] == "measured" and out["s2"]["status"] == "measured"
    assert out["s1"]["weekly_sd"] == 0.0 or out["s1"]["weekly_sd"] < 1e-9
    assert out["s2"]["weekly_sd"] > 5, out["s2"]
    assert out["s1"]["mean_points"] == out["s2"]["mean_points"], (
        "the point of the fixture: identical means, different spread")


def test_season_sd_scales_the_weekly_sd_BY_ROOT_GAMES():
    """The bridge production uses in reverse (`weekly_sd = season_sd / sqrt(games)`).
    MUTATION: multiply by games rather than its root — the spread inflates by ~4x and
    every ceiling runs away."""
    rows = [wk("g1", 2024, w, rec_yd=(200 if w % 2 else 0)) for w in range(1, 17)]
    out, _ = V.weekly_variance(rows, [2024], SCORING, CW, before_season=2025,
                               games_expected={"WR": 16.0})
    p = out["s1"]
    assert abs(p["season_sd"] - p["weekly_sd"] * (16.0 ** 0.5)) < 1e-6


# ── absent is not zero, and here zero means PERFECTLY CERTAIN ───────────────
def test_ONE_GAME_is_UNMEASURABLE_not_zero_variance():
    """THE DANGEROUS ONE. A single game has no spread, and writing 0.0 would make the
    player read as the most certain on the board — a ceiling equal to his mean and a
    risk term of nothing. MUTATION: emit sd 0.0 with status measured."""
    rows = [wk("g1", 2024, 1, rec_yd=100)]
    out, rep = V.weekly_variance(rows, [2024], SCORING, CW, before_season=2025)
    assert out["s1"]["status"] != "measured"
    assert out["s1"]["weekly_sd"] is None, "a number here is a claim we cannot make"
    assert out["s1"]["games"] == 1


def test_too_few_games_falls_back_to_a_POSITION_PRIOR_and_SAYS_SO():
    """An imputed number is legitimate; an imputed number wearing a measurement's
    clothes is not. MUTATION: label it `measured`."""
    rows = [wk("g1", 2024, w, rec_yd=100) for w in range(1, 3)]
    out, _ = V.weekly_variance(rows, [2024], SCORING, CW, before_season=2025,
                               min_games=4, position_prior={"WR": 7.5})
    assert out["s1"]["status"] == "imputed"
    assert out["s1"]["weekly_sd"] == 7.5
    assert "WR" in out["s1"]["basis"]


def test_a_player_with_NO_ROWS_is_ABSENT_and_carries_no_number():
    """MUTATION: default him to the position prior silently. Every player we have
    never seen becomes indistinguishable from one we measured, which is the whole
    defect this module exists to end."""
    out, rep = V.weekly_variance([], [2024], SCORING, CW, before_season=2025)
    assert out == {}
    assert rep["usable"] is False


# ── the leak guard, same rule as usage ──────────────────────────────────────
def test_THE_DRAFTED_SEASON_IS_REFUSED():
    """Variance measured on the season being replayed is an outcome, not a prior."""
    rows = [wk("g1", 2024, w, rec_yd=100) for w in range(1, 9)]
    try:
        V.weekly_variance(rows, [2024], SCORING, CW, before_season=2024)
    except ValueError as e:
        assert "before" in str(e).lower() or "prior" in str(e).lower()
    else:
        raise AssertionError("the drafted season must be refused")


def test_status_is_reported_PER_PLAYER_and_counted_in_the_report():
    """Item 4 of A's brief: the board must carry a status per field, and the report
    must say how many of each — a coverage figure nobody has to recompute."""
    rows = ([wk("g1", 2024, w, rec_yd=100) for w in range(1, 9)] +
            [wk("g2", 2024, 1, rec_yd=100)])
    out, rep = V.weekly_variance(rows, [2024], SCORING, CW, before_season=2025,
                                 min_games=4, position_prior={"WR": 7.5})
    assert rep["measured"] == 1
    assert rep["imputed"] + rep["unmeasurable"] == 1
    assert set(rep["status_counts"]) <= {"measured", "imputed", "unmeasurable"}


def test_it_scores_with_OUR_table_not_the_providers_points():
    """`weekly_points_by_season` already refuses a provider's own points because they
    encode another league's rules. MUTATION: read a `fantasy_points` column if present
    — a 6-point passing league silently grades on someone else's 4."""
    rows = [dict(wk("g1", 2024, w, rec_yd=0), receptions=10, fantasy_points=999)
            for w in range(1, 9)]
    out, _ = V.weekly_variance(rows, [2024], SCORING, CW, before_season=2025)
    # 10 receptions x 0.5 = 5.0 every week: real spread is zero, not 999-driven.
    assert out["s1"]["mean_points"] == 5.0, out["s1"]
