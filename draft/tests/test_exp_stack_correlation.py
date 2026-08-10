"""Stack-correlation pure core — no egress. Run:
python -m pytest draft/tests/test_exp_stack_correlation.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_stack_correlation as S  # noqa: E402


def test_pearson_perfect_and_none():
    assert abs(S.pearson([(1, 2), (2, 4), (3, 6)]) - 1.0) < 1e-9
    assert abs(S.pearson([(1, 6), (2, 4), (3, 2)]) + 1.0) < 1e-9   # perfect negative
    assert S.pearson([(1, 1), (2, 1), (3, 1)]) is None             # no spread on y
    assert S.pearson([(1, 2)]) is None                             # too few


def test_ceiling_premium_is_zero_at_no_correlation_and_grows_with_rho():
    z = S.ceiling_premium(10.0, 10.0, 0.0)
    lo = S.ceiling_premium(10.0, 10.0, 0.3)
    hi = S.ceiling_premium(10.0, 10.0, 0.7)
    assert abs(z) < 1e-9            # no covariance -> no ceiling premium
    assert 0 < lo < hi             # more correlation -> more ceiling
    # negative correlation must not manufacture a premium
    assert S.ceiling_premium(10.0, 10.0, -0.5) < 0


def test_size_stack_bonus_is_concave():
    b = S.size_stack_bonus(10.0)
    assert b["partner_1"] == 10.0 and b["partner_2"] == 5.0 and b["partner_3plus"] == 0.0


def test_team_pairs_picks_primary_qb_and_ranks_receivers():
    # primary QB = most points AND >= MIN_QB_WEEKS; backup QB ignored
    series = {
        "qb_starter": {w: 20.0 + (w % 3) for w in range(1, 13)},          # 12 wks, big total
        "qb_backup":  {w: 15.0 for w in range(1, 4)},                     # 3 wks -> ignored
        "wr1": {w: 15.0 + (w % 3) for w in range(1, 13)},                 # moves WITH qb
        "wr2": {w: 8.0 + (w % 4) for w in range(1, 10)},                  # varies, lower total
        "te1": {w: 6.0 + (w % 2) for w in range(1, 11)},
    }
    positions = {"qb_starter": "QB", "qb_backup": "QB", "wr1": "WR", "wr2": "WR", "te1": "TE"}
    pairs = S.team_pairs(series, positions)
    qbs = {p["qb"] for p in pairs}
    assert qbs == {"qb_starter"}                              # backup never chosen
    wr1 = next(p for p in pairs if p["receiver"] == "wr1")
    wr2 = next(p for p in pairs if p["receiver"] == "wr2")
    assert wr1["receiver_rank"] == 1 and wr2["receiver_rank"] == 2   # ranked by total pts
    assert wr1["rho"] > 0.5                                    # wr1 co-moves with the QB
    assert wr1["ceiling_premium_pts"] > 0


def test_team_pairs_respects_min_shared_weeks():
    series = {
        "qb": {w: 20.0 + (w % 3) for w in range(1, 13)},
        "wr_short": {1: 10.0, 2: 12.0, 3: 9.0},               # only 3 shared -> dropped
    }
    positions = {"qb": "QB", "wr_short": "WR"}
    assert S.team_pairs(series, positions) == []


def test_aggregate_slices_wr1_and_computes_dose():
    pairs = [
        {"position": "WR", "receiver_rank": 1, "rho": 0.5, "ceiling_premium_pts": 4.0, "n_weeks": 12},
        {"position": "WR", "receiver_rank": 2, "rho": 0.1, "ceiling_premium_pts": 1.0, "n_weeks": 10},
        {"position": "TE", "receiver_rank": 1, "rho": 0.3, "ceiling_premium_pts": 2.0, "n_weeks": 11},
    ]
    agg = S.aggregate_pairs(pairs)
    assert agg["qb_wr1"]["n"] == 1 and agg["qb_wr1"]["mean_rho"] == 0.5
    assert agg["qb_wr_all"]["n"] == 2                          # both WR ranks
    # implied dose vs the sweep's 0.35 assumption
    assert abs(agg["implied_dose_vs_sweep"] - (0.5 / 0.35)) < 1e-3
    assert agg["provisional_bonus_wr1_pts"]["partner_1"] == 4.0
