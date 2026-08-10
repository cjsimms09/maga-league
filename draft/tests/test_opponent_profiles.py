"""Opponent tendency profiles — pure core (no egress).
Run: python -m pytest draft/tests/test_opponent_profiles.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import opponent_profiles as OP  # noqa: E402


def _pick(season, owner, pick_no, rnd, pos, keeper=False):
    return {"season": season, "owner": owner, "pick_no": pick_no, "round": rnd,
            "position": pos, "is_keeper": keeper}


def test_keepers_excluded_from_decisions():
    rows = [_pick(2023, "A", 1, 1, "RB", keeper=True), _pick(2023, "A", 12, 2, "WR")]
    prof = OP.build_profiles(rows)["A"]
    assert prof["n_decisions"] == 1                      # the keeper is not a decision
    assert "WR" in prof["position_share"] and "RB" not in prof["position_share"]


def test_first_round_by_position_and_qb_late_vs_early():
    # A waits on QB (round 10); B takes QB round 3.
    rows = [_pick(2023, "A", 1, 1, "RB"), _pick(2023, "A", 100, 10, "QB"),
            _pick(2023, "B", 2, 1, "RB"), _pick(2023, "B", 25, 3, "QB")]
    prof = OP.build_profiles(rows)
    assert prof["A"]["first_round_by_position"]["QB"] == 10
    assert prof["B"]["first_round_by_position"]["QB"] == 3
    assert "QB-late" in OP._signature(prof["A"])
    assert "QB-early" in OP._signature(prof["B"])


def test_position_share_vs_field_flags_a_lean():
    # A is RB-heavy vs a WR-heavy field.
    rows = ([_pick(2023, "A", i, i, "RB") for i in range(1, 6)]
            + [_pick(2023, "B", 10 + i, i, "WR") for i in range(1, 6)]
            + [_pick(2023, "C", 20 + i, i, "WR") for i in range(1, 6)])
    prof = OP.build_profiles(rows)
    assert prof["A"]["position_share_vs_field"]["RB"] > 0.3     # well above field
    assert "RB-heavy" in OP._signature(prof["A"])


def test_matchup_read_summarizes_upcoming_owners():
    rows = [_pick(2023, "A", 1, 1, "RB"), _pick(2023, "A", 100, 10, "QB"),
            _pick(2023, "B", 2, 2, "WR"), _pick(2023, "B", 25, 3, "QB")]
    prof = OP.build_profiles(rows)
    read = OP.matchup_read(prof, ["A", "B", "ZZ_absent"])
    assert [r["owner"] for r in read] == ["A", "B"]            # absent owner skipped
    assert read[0]["qb_first_round"] == 10


def test_single_season_lean_is_visible_but_seasons_tracked():
    rows = [_pick(2023, "A", 1, 1, "RB"), _pick(2024, "A", 1, 1, "WR")]
    prof = OP.build_profiles(rows)["A"]
    assert prof["seasons"] == [2023, 2024]


def test_timing_spread_hard_vs_loose():
    # A takes QB in round 9 every season (hard); B ranges 4/8/12 (loose).
    rows = ([_pick(s, "A", 90, 9, "QB") for s in (2023, 2024, 2025)]
            + [_pick(2023, "B", 40, 4, "QB"), _pick(2024, "B", 80, 8, "QB"), _pick(2025, "B", 120, 12, "QB")])
    prof = OP.build_profiles(rows)
    ta, tb = prof["A"]["timing_by_position"]["QB"], prof["B"]["timing_by_position"]["QB"]
    assert ta["sd"] == 0.0 and ta["confidence"] == "hard"      # same round every year
    assert tb["mean"] == 8.0 and tb["sd"] > 2.5 and tb["confidence"] == "loose"


def test_single_season_timing_is_thin_not_a_pattern():
    rows = [_pick(2023, "A", 90, 9, "QB")]
    t = OP.build_profiles(rows)["A"]["timing_by_position"]["QB"]
    assert t["sd"] is None and t["n_seasons"] == 1 and t["confidence"] == "thin"


def test_matchup_read_exposes_hard_reads_and_predictability():
    rows = ([_pick(s, "A", 90, 9, "QB") for s in (2023, 2024, 2025)]
            + [_pick(s, "A", i, i, "RB") for s in (2023, 2024, 2025) for i in (1, 2, 3, 4)])
    read = OP.matchup_read(OP.build_profiles(rows), ["A"])[0]
    assert "QB" in read["hard_reads"] and read["hard_reads"]["QB"]["confidence"] == "hard"
    assert read["predictability"] in ("high", "medium")        # enough picks + a hard read
