# TERRITORY: C
"""A per-player empirical ceiling/floor, from data already on disk.

Run: python3 -m pytest draft/tests/test_nflverse_player_ceiling.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_player_ceiling as PC  # noqa: E402


# ── _percentile: absent is not zero ─────────────────────────────────────────

def test_percentile_ON_EMPTY_IS_NONE_NOT_ZERO():
    """MUTATION: return 0.0 on empty — a player with no weekly history would
    read as GUARANTEED TO SCORE ZERO instead of unmeasured, the exact
    'absent is not zero' failure this whole repo refuses everywhere else."""
    assert PC._percentile([], 0.5) is None


def test_percentile_INTERPOLATES_BETWEEN_TWO_POINTS():
    """MUTATION: nearest-rank instead of interpolation (the `lab_stats.
    percentile` shape this file deliberately does NOT reuse) — the median of
    [0, 10] would snap to one endpoint instead of reporting 5.0."""
    assert PC._percentile([0.0, 10.0], 0.5) == 5.0


def test_percentile_ON_A_SINGLE_VALUE_RETURNS_THAT_VALUE():
    assert PC._percentile([7.0], 0.9) == 7.0


# ── player_ceiling_floor: MIN_N refuses a thin series ───────────────────────

def test_player_ceiling_floor_BELOW_MIN_N_IS_UNMEASURABLE():
    """MUTATION: no threshold — a 3-game series (one hot week, two duds)
    reports a confident p90 off noise, the same failure
    `projection_error.calibrate`'s thin-cell refusal exists to prevent."""
    r = PC.player_ceiling_floor([1.0, 2.0, 30.0], min_n=8)
    assert r["status"] == "unmeasurable"
    assert r["p10"] is None and r["p90"] is None
    assert r["n"] == 3


def test_player_ceiling_floor_AT_MIN_N_IS_MEASURED():
    series = [4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0]
    r = PC.player_ceiling_floor(series, min_n=8)
    assert r["status"] == "measured" and r["n"] == 8
    assert r["p10"] < r["p50"] < r["p90"]


def test_player_ceiling_floor_p50_IS_THE_MEDIAN_not_the_mean():
    """A boom week must not drag the CENTRAL estimate up — p50 is the
    player's TYPICAL week, p90 is his ceiling. MUTATION: report the mean for
    p50 — a single 40-point outlier week would inflate what should read as
    'a normal week for this guy'."""
    series = [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 40.0]   # one huge outlier
    r = PC.player_ceiling_floor(series, min_n=8)
    assert r["p50"] < 10, "the outlier must not pull the median toward it"
    assert r["p90"] > r["p50"], "but it should still show up in the ceiling"


# ── load_player_weeks: reuses the store's own reader, honors exclude_season ─

def test_load_player_weeks_READS_THE_REAL_COMMITTED_STORES():
    """Not a fixture — the actual files this repo ships, the same way
    `test_CALIBRATION_SEASONS_MATCHES_THE_REAL_COMMITTED_DRAFTS` in
    test_projection_error.py pins against real data rather than a mock."""
    weeks = PC.load_player_weeks()
    assert len(weeks) > 500, "five real seasons should carry hundreds of players"
    assert all(isinstance(v, list) and v for v in weeks.values())


def test_load_player_weeks_exclude_season_DROPS_ONLY_THAT_SEASONS_WEEKS():
    """MUTATION: ignore `exclude_season` — a leave-one-out backtest of this
    module would silently include the season it is being validated against,
    the same leak `projection_error.calibrate`'s `exclude_season` refuses."""
    full = PC.load_player_weeks()
    without_2025 = PC.load_player_weeks(exclude_season=2025)
    total_full = sum(len(v) for v in full.values())
    total_without = sum(len(v) for v in without_2025.values())
    assert total_without < total_full, (
        "excluding a real season must remove real weeks")


# ── all_players_ceiling_floor / summarize: coverage travels with the number ─

def test_all_players_ceiling_floor_PROCESSES_EVERY_PLAYER():
    weeks = {"a": [1.0] * 8, "b": [1.0, 2.0]}
    out = PC.all_players_ceiling_floor(weeks, min_n=8)
    assert out["a"]["status"] == "measured"
    assert out["b"]["status"] == "unmeasurable"


def test_summarize_REPORTS_THE_MEASURED_FRACTION_not_just_a_count():
    """MUTATION: report only the raw count — a reader cannot tell 765
    measured out of 1,156 (66%) from 765 out of 10,000 (7.6%) without the
    denominator, the same 'coverage travels with the answer' rule
    `projection_error.report` already follows."""
    results = {"a": {"status": "measured"}, "b": {"status": "measured"},
              "c": {"status": "unmeasurable"}}
    s = PC.summarize(results)
    assert s == {"players": 3, "measured": 2, "unmeasurable": 1,
                "measured_fraction": round(2 / 3, 4)}


def test_summarize_ON_EMPTY_DOES_NOT_DIVIDE_BY_ZERO():
    assert PC.summarize({}) == {"players": 0, "measured": 0,
                                "unmeasurable": 0, "measured_fraction": None}


# ── the actual finding this module exists to demonstrate ───────────────────

def test_TWO_REAL_PLAYERS_WITH_THE_SAME_MEDIAN_HAVE_DIFFERENT_CEILINGS():
    """⚠ THE WHOLE POINT. Register 4q's defect is that a pooled band assigns
    identical ceilings to players who differ. This proves — on the real,
    committed data, not a synthetic fixture — that two real players with
    p50 within half a point of each other can have p90s roughly TWO TIMES
    apart, which a (position, rank-band) calibration cannot see because it
    never looks at any one player's own week-to-week shape.

    MUTATION: this is a characterization test — if it starts failing, the
    real data changed shape (a store was rebuilt) or the percentile method
    broke; either way it is worth a human looking rather than silently
    deleting the assertion."""
    weeks = PC.load_player_weeks()
    results = PC.all_players_ceiling_floor(weeks)
    measured = [(pid, r) for pid, r in results.items()
               if r["status"] == "measured" and r["p50"] and 6.0 <= r["p50"] <= 6.5]
    assert len(measured) >= 5, (
        "need a real rosterable-tier cluster to demonstrate the spread")
    boom_ratios = sorted(r["p90"] / r["p50"] for _pid, r in measured)
    assert boom_ratios[-1] / boom_ratios[0] >= 1.5, (
        "players with nearly identical medians should show a real spread "
        "in ceiling-to-median ratio: %r" % boom_ratios)
