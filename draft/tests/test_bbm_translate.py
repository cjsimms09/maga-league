"""BBM translation layer — pure core, verified WITHOUT egress.

Proves the re-scoring is right against a known case (the spec's gate: verify before
trusting), and pins the spike-week instrument, the winning-roster shape, and the
source-tier / caveat-wall machinery that keeps a foreign number from surfacing raw.

Run: python -m pytest draft/tests/test_bbm_translate.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import bbm_translate as B  # noqa: E402

# Our scoring config (half-PPR, 6-pt passing TD) for the verification.
CFG = {"pass_yd": 0.04, "pass_td": 6.0, "pass_int": -2.0, "rush_yd": 0.1, "rush_td": 6.0,
       "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0}


def test_rescoring_verified_against_a_known_case():
    # A hand-computed line: 300 pass yd (12) + 2 pass TD (12) + 1 INT (-2) = 22.0;
    # + 50 rush yd (5) = 27.0; + 5 rec (2.5) + 60 rec yd (6) + 1 rec TD (6) = 41.5.
    line = {"pass_yd": 300, "pass_td": 2, "pass_int": 1, "rush_yd": 50,
            "rec": 5, "rec_yd": 60, "rec_td": 1}
    assert B.rescore(line, CFG) == 41.5
    report = B.verify_rescoring([{"name": "qb-wr line", "stat_line": line, "expected": 41.5}], CFG)
    assert report["ok"] is True and report["worst_diff"] <= 0.01


def test_verification_catches_a_wrong_expectation():
    line = {"rec": 4, "rec_yd": 40}   # 2.0 + 4.0 = 6.0 under half-PPR
    report = B.verify_rescoring([{"name": "off", "stat_line": line, "expected": 9.9}], CFG)
    assert report["ok"] is False and report["failures"][0]["got"] == 6.0


def test_spike_weeks_counts_ceiling_not_mean():
    # Two players, SAME total (say ~130): one steady, one spiky. Spiky wins weekly-highs.
    steady = [13.0] * 10          # never clears a 25-pt bar
    spiky = [40.0, 42.0, 38.0] + [1.0] * 7
    assert B.spike_weeks(steady, 25.0) == 0
    assert B.spike_weeks(spiky, 25.0) == 3
    roster = {"a": steady, "b": spiky}
    assert B.roster_spike_count(roster, 25.0) == 3


def test_winning_shape_reports_the_delta():
    pos = {"1": "RB", "2": "RB", "3": "WR", "4": "WR", "5": "WR", "6": "QB", "7": "TE"}
    # winners load WR; the field is balanced
    rosters = [
        {"ids": ["3", "4", "5", "6"], "outcome": 0.9},   # WR-heavy, best outcome
        {"ids": ["3", "4", "6", "7"], "outcome": 0.8},
        {"ids": ["1", "2", "6", "7"], "outcome": 0.2},   # RB-heavy, worst
        {"ids": ["1", "2", "6", "7"], "outcome": 0.1},
    ]
    ws = B.winning_shape(rosters, pos, top_frac=0.5)
    assert ws["n"] == 4 and ws["n_winners"] == 2
    assert ws["winner_minus_field"].get("WR", 0) > 0    # winners are WR-heavier than the field


def test_bbm_finding_labels_and_blocks_untranslatable():
    ok = B.bbm_finding(0.42, "WR allocation in winners", depends_on=["team_size"])
    assert ok["source_tier"] == B.SOURCE_TIER_BBM and ok["crosses_wall"] is True
    assert "BBM-derived" in ok["label"]
    # a finding that leans on the no-lineup dimension does NOT cross the wall
    blocked = B.bbm_finding(1.0, "weekly-high efficiency from BBM", depends_on=["no_lineup_setting"])
    assert blocked["crosses_wall"] is False


def test_combine_tiers_is_now_DERIVED_not_a_fixed_primary():
    # direction-only (no intervals) -> the weight is UNDETERMINED, flagged, NOT the old
    # static tier standing in as finished.
    bare = B.combine_tiers({"direction": 1}, {"direction": -1})
    assert "DISAGREE" in bare["state"]
    assert "warning" in bare and "UNDETERMINED" in bare["warning"]
    # WITH intervals, the weight is computed from precision x transferability. A rich league
    # (tight se) dominates a well-transferring but coarser external source.
    rich = B.combine_tiers(
        {"direction": 1, "estimate": 0.2, "se": 0.05, "n": 500},
        {"direction": 1, "estimate": 0.2, "se": 0.2, "n": 1_000_000}, transferability=0.9)
    assert "AGREE" in rich["state"]
    assert rich["weights"]["league"] > rich["weights"]["external"]
    assert rich["dominant"] == "league"
