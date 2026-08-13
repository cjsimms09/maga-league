# TERRITORY: C
"""PRIOR-SEASON USAGE SHARES — the variance input the backtest board never had.

`projections.player_variance` takes five inputs; a backtest board carries at most
`age`, so the bell-cow/committee multiplier — the largest single term — never fires
and `proj_sd` collapses to a constant multiple of the mean. That is why `ceiling: 0`
in MEASURED_WEIGHTS is UNMEASURED rather than measured (A, 2026-08-13).

This supplies the one input that needs no new ingest: `build_bundle.build()` is
already handed `weekly_df`, so the share is computable from data in hand.

Run: python3 -m pytest draft/tests/test_nflverse_usage.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_usage as U  # noqa: E402


def frame(rows):
    """A list-of-dicts stand-in; the real caller passes a DataFrame."""
    return rows


CW = {"g1": "s1", "g2": "s2", "g3": "s3"}


def wk(gsis, season, team, targets=None, carries=None, week=1):
    r = {"player_id": gsis, "season": season, "week": week, "recent_team": team}
    if targets is not None:
        r["targets"] = targets
    if carries is not None:
        r["carries"] = carries
    return r


# ── the share itself ────────────────────────────────────────────────────────
def test_target_share_is_the_players_targets_over_HIS_TEAMS_targets():
    """MUTATION: divide by the LEAGUE's targets. Every share collapses toward zero,
    every pass-catcher reads as committee usage, and the multiplier fires backwards
    on exactly the bell-cows it exists to identify."""
    rows = frame([wk("g1", 2024, "BUF", targets=100),
                  wk("g2", 2024, "BUF", targets=100),
                  wk("g3", 2024, "KC", targets=10)])
    out, rep = U.usage_shares(rows, 2024, CW)
    assert abs(out["s1"]["target_share"] - 0.5) < 1e-9, out["s1"]
    assert abs(out["s3"]["target_share"] - 1.0) < 1e-9, "KC's only target-getter is 100%"
    assert rep["seasons_used"] == [2024]


def test_opportunity_share_counts_CARRIES_AND_TARGETS_together():
    """A running back's workload is not his targets. MUTATION: use targets only —
    every RB reads as a committee back and the bell-cow term never fires for the
    position it matters most for."""
    rows = frame([wk("g1", 2024, "BUF", targets=20, carries=280),
                  wk("g2", 2024, "BUF", targets=80, carries=20)])
    out, _ = U.usage_shares(rows, 2024, CW)
    assert abs(out["s1"]["opportunity_share"] - 0.75) < 1e-9, out["s1"]
    assert abs(out["s1"]["target_share"] - 0.2) < 1e-9


def test_a_season_is_SUMMED_ACROSS_WEEKS_not_averaged():
    """MUTATION: take the mean of weekly shares. A player who misses ten games
    reads as a bell-cow off two big weeks, which is precisely inverted."""
    rows = frame([wk("g1", 2024, "BUF", targets=10, week=1),
                  wk("g1", 2024, "BUF", targets=10, week=2),
                  wk("g2", 2024, "BUF", targets=80, week=1)])
    out, _ = U.usage_shares(rows, 2024, CW)
    assert abs(out["s1"]["target_share"] - 0.2) < 1e-9


# ── absent is not zero, which is the whole risk here ────────────────────────
def test_a_FRAME_WITH_NO_TARGETS_COLUMN_reports_UNAVAILABLE_not_zero():
    """THE DEFECT THIS GUARDS, and it is the reason to be careful rather than
    convenient. A frame missing `targets` yields share 0.0 for everyone, and 0.0 is
    not neutral — `player_variance` reads `0 < share < VAR_WORKLOAD_LOW` as COMMITTEE
    USAGE and raises variance for the entire league. A silent zero here does not lose
    the signal, it INVERTS it. MUTATION: return zeros and carry on."""
    rows = frame([{"player_id": "g1", "season": 2024, "recent_team": "BUF", "week": 1}])
    out, rep = U.usage_shares(rows, 2024, CW)
    assert out == {}, "no usage columns must yield NO shares, not zero shares"
    assert rep["usable"] is False
    assert "targets" in rep["why"] and "carries" in rep["why"]


def test_a_player_with_a_row_but_GENUINELY_ZERO_targets_is_kept_as_zero():
    """The other side of the same line. A player who really drew no targets IS a
    zero, and must not be confused with a missing column. MUTATION: drop him — a
    blocking tight end becomes indistinguishable from a player nobody measured."""
    rows = frame([wk("g1", 2024, "BUF", targets=0, carries=0),
                  wk("g2", 2024, "BUF", targets=100, carries=0)])
    out, rep = U.usage_shares(rows, 2024, CW)
    assert out["s1"]["target_share"] == 0.0
    assert rep["usable"] is True


# ── the leak guard ──────────────────────────────────────────────────────────
def test_THE_SEASON_BEING_DRAFTED_IS_REFUSED():
    """A share computed from the season under replay is the outcome, not a prior.
    MUTATION: allow it. Every backtest silently gains perfect foreknowledge of
    workload — the single most valuable thing a drafter could know."""
    rows = frame([wk("g1", 2024, "BUF", targets=100)])
    try:
        U.usage_shares(rows, 2024, CW, before_season=2024)
    except ValueError as e:
        assert "before" in str(e).lower() or "prior" in str(e).lower()
    else:
        raise AssertionError("the drafted season must be refused, not used")


def test_it_accepts_EITHER_LOADERS_VOCABULARY():
    """`nflverse_weekly_to_scoring` already carries this scar: nfl_data_py and
    nflreadpy disagree on column names, and mapping only one silently zeroed every
    2025 row. MUTATION: read `recent_team` only — every nflreadpy frame yields no
    team, so every share divides by that player's own total and reads 1.0."""
    rows = frame([{"player_id": "g1", "season": 2024, "team": "BUF", "targets": 25},
                  {"player_id": "g2", "season": 2024, "team": "BUF", "targets": 75}])
    out, rep = U.usage_shares(rows, 2024, CW)
    assert abs(out["s1"]["target_share"] - 0.25) < 1e-9
    assert rep["team_column"] == "team"


def test_ids_that_do_not_CROSSWALK_are_counted_not_silently_dropped():
    """A share is only as good as the join. MUTATION: skip them quietly — the
    denominator still counts their targets while the numerator loses them, so every
    surviving share is understated and nothing says why."""
    rows = frame([wk("g1", 2024, "BUF", targets=50),
                  wk("zz", 2024, "BUF", targets=50)])
    out, rep = U.usage_shares(rows, 2024, CW)
    assert rep["unmatched_ids"] == 1
    assert abs(out["s1"]["target_share"] - 0.5) < 1e-9, (
        "the team denominator must still include the unmatched player's targets")
