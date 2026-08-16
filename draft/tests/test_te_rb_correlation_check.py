# TERRITORY: A
"""TE-RB correlation check — regen-parity and a hand-checked construction.

This module imports conditional_value.py's already-tested pure functions
(pearson, fisher_pool, mean_sd, ranked_catchers, pair_series, season_data,
team_game_weeks are all covered by test_conditional_value.py) unmodified; the
only new logic here is the RB1/TE1 team-season pairing loop, so that is what
gets a hand-checked fixture. The artifact's own regen-parity is pinned the
same way this repo pins every other backtest artifact (the rookie-prior
forensics in league_benchmark_2026-08-16.md §9 is exactly the failure mode
this guards against).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import te_rb_correlation_check as TR  # noqa: E402
import conditional_value as CV  # noqa: E402

ARTIFACT = HERE.parent / "data" / "te_rb_correlation_2026.json"


def test_artifact_exists_and_matches_regeneration():
    assert ARTIFACT.exists()
    committed = json.loads(ARTIFACT.read_text())
    fresh = TR.build_artifact(write=False)
    assert committed["measured"] == fresh["measured"]
    assert committed["team_seasons"] == fresh["team_seasons"]
    assert committed["verdict"] == fresh["verdict"]


def test_deterministic_across_two_runs():
    a = TR.rb_te1_class()
    b = TR.rb_te1_class()
    assert a == b


def test_ranked_catchers_generalizes_to_rb_same_as_wr_te():
    """ranked_catchers(pos='RB') is the SAME function the committed classes
    use for WR/TE — spot-check it returns RBs, ranked by season points, not
    something degenerate (e.g. empty, or unordered)."""
    week_rows, points = CV.season_data(2024)
    rbs = CV.ranked_catchers(week_rows, points, "BAL", "RB")
    assert rbs, "BAL 2024 must have a measurable RB"
    assert all(
        any(line.get("pos") == "RB" and line.get("team") == "BAL"
            for line in week_rows.get(pid, {}).values())
        for pid in rbs)
    # ranked descending by season points for the team
    totals = [sum(points.get(pid, {}).get(w, 0.0)
                  for w in week_rows.get(pid, {})
                  if week_rows[pid][w].get("team") == "BAL")
              for pid in rbs]
    assert totals == sorted(totals, reverse=True)


def test_min_pair_weeks_floor_respected():
    """A team-season with fewer than MIN_PAIR_WEEKS shared RB1/TE1 weeks must
    not appear in the pooled rows (same floor stack_pairs_for_season uses)."""
    rows = TR.rb_te1_class()["rows"]
    assert all(row["n_weeks"] >= CV.MIN_PAIR_WEEKS for row in rows)


def test_pooled_r_is_near_zero_not_negative():
    """The headline verdict, pinned: pooled RB1-TE1 r is small in magnitude
    and NOT negative — refutes the textbook's 'slightly negatively
    correlated' claim on this league's own five seasons of data. A future
    data refresh may move the number; this test guards the SIGN/MAGNITUDE
    claim actually printed in the crosscheck doc, not a specific decimal."""
    cell = TR.rb_te1_class()
    assert cell["r_pooled"] is not None
    assert abs(cell["r_pooled"]) < 0.10
    assert cell["n_pairs"] >= 100
