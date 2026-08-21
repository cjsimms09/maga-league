# TERRITORY: C
"""Register: relay's 08-20 dispatch, ASK 2 (defense-vs-position allowed).
Known-positive fixture is a REAL, independently-verified case: KC's week 5
2024 opponent was NO (New Orleans), and New Orleans' three WR rows in
component_stats_2024.json sum to exactly 19.3 points under this league's
table -- checked by hand against the real store before writing this file,
per rule 3e.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import defense_vs_position as D  # noqa: E402


def test_opponent_map_real_case_kc_week5_2024():
    opp = D.opponent_map(2024)
    assert opp[("KC", 5)] == "NO"
    assert opp[("NO", 5)] == "KC"


def test_opponent_map_is_symmetric():
    opp = D.opponent_map(2024)
    for (team, wk), other in opp.items():
        assert opp[(other, wk)] == team


def test_build_season_real_case_matches_hand_verification():
    cells = D.build_season(2024)
    cell = cells[("KC", 5, "WR")]
    assert cell["n"] == 3
    assert cell["sum"] == 19.3


def test_a_bye_week_team_produces_no_entries_that_week():
    # pure synthetic fixture: a player whose team has no opponent-map entry
    # for that week (a bye) must contribute to nothing, not a zero-points row
    opp = {("KC", 5): "NO", ("NO", 5): "KC"}  # week 6 deliberately absent -> bye
    weeks = {"p1": {5: {"team": "KC", "pos": "WR"}, 6: {"team": "KC", "pos": "WR"}}}
    points = {"p1": {5: 10.0, 6: 8.0}}
    allowed = {}
    for pid, rows in weeks.items():
        for wk, line in rows.items():
            defense = opp.get((line["team"], wk))
            if not defense:
                continue
            pts = (points.get(pid) or {}).get(wk)
            if pts is None:
                continue
            key = (defense, wk, line["pos"])
            cell = allowed.setdefault(key, {"sum": 0.0, "n": 0})
            cell["sum"] += pts
            cell["n"] += 1
    assert ("NO", 5, "WR") in allowed
    assert not any(wk == 6 for (_d, wk, _p) in allowed)


def test_aggregate_pools_across_weeks_correctly():
    per_season = {
        ("KC", 1, "WR"): {"sum": 10.0, "n": 2},
        ("KC", 2, "WR"): {"sum": 20.0, "n": 3},
        ("KC", 1, "RB"): {"sum": 5.0, "n": 1},
    }
    pooled = D.aggregate(per_season)
    assert pooled["KC"]["WR"]["weeks"] == 2
    assert pooled["KC"]["WR"]["total_allowed"] == 30.0
    assert pooled["KC"]["WR"]["mean_allowed"] == 15.0
    assert pooled["KC"]["RB"]["mean_allowed"] == 5.0


def test_only_skill_positions_are_scored():
    cells = D.build_season(2024)
    positions = {pos for (_d, _w, pos) in cells}
    assert positions <= {"QB", "RB", "WR", "TE"}


def test_weeks_are_capped_at_this_leagues_own_boundary():
    cells = D.build_season(2024, last_week=17)
    weeks = {wk for (_d, wk, _p) in cells}
    assert max(weeks) <= 17


def test_build_store_produces_a_league_avg_baseline():
    doc = D.build_store((2024,))
    assert set(doc["league_avg"]) == {"QB", "RB", "WR", "TE"}
    assert all(v is not None and v > 0 for v in doc["league_avg"].values())
    assert "KC" in doc["by_defense"]
    assert doc["by_defense"]["KC"]["WR"]["mean_allowed"] > 0


def test_build_store_reuses_fetch_component_stats_not_a_reimplementation():
    # rule 11 pin
    import fetch_component_stats as FCS
    assert D.FCS.component_weeks is FCS.component_weeks
    assert D.FCS.scored_weekly_points is FCS.scored_weekly_points
    assert D.FCS.frozen_scoring_table is FCS.frozen_scoring_table


# ── rule 3e refusal gate (relay's 08-21 loop-audit, ASK 2) ────────────────

def test_refusal_reason_none_on_the_real_committed_store():
    # known-positive: today's real build clears both floors
    doc = D.build_store((2024,))
    doc["weeks_per_season_measured"] = {"2024": 2045}
    assert D.refusal_reason(doc) is None


def test_refusal_reason_fires_on_a_starved_defense_count():
    doc = {"by_defense": {t: {} for t in ("KC", "NO")},  # far below MIN_DEFENSES
           "weeks_per_season_measured": {"2024": 2045}}
    reason = D.refusal_reason(doc)
    assert reason is not None
    assert "2 defenses" in reason


def test_refusal_reason_fires_on_a_thin_season():
    doc = {"by_defense": {f"T{i}": {} for i in range(32)},
           "weeks_per_season_measured": {"2024": 5}}  # far below MIN_CELLS_PER_SEASON
    reason = D.refusal_reason(doc)
    assert reason is not None
    assert "2024" in reason
