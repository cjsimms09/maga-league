"""All-terms participation test — pure adjuster signals.
Run: python -m pytest draft/tests/test_participation.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_participation as P  # noqa: E402


def _pool():
    # a tiny board with a clear ceiling/risk/tier spread for z-scoring
    return [
        {"player_id": "1", "position": "WR", "team": "MIN", "vorp": 50, "proj_mean": 250,
         "proj_ceiling": 340, "weekly_sd": 12, "tier_drop": 40, "bye": 6},
        {"player_id": "2", "position": "RB", "team": "DET", "vorp": 40, "proj_mean": 230,
         "proj_ceiling": 250, "weekly_sd": 5, "tier_drop": 5, "bye": 9},
        {"player_id": "3", "position": "QB", "team": "MIN", "vorp": 20, "proj_mean": 300,
         "proj_ceiling": 330, "weekly_sd": 8, "tier_drop": 10, "bye": 6},
    ]


def test_ceiling_sig_rewards_upside_gap():
    st = P.board_stats(_pool())
    hi = P.ceiling_sig(_pool()[0], st)   # 90-pt gap
    lo = P.ceiling_sig(_pool()[1], st)   # 20-pt gap
    assert hi > lo


def test_risk_sig_prefers_lower_variance():
    st = P.board_stats(_pool())
    safe = P.risk_sig(_pool()[1], st)    # weekly_sd 5
    swing = P.risk_sig(_pool()[0], st)   # weekly_sd 12
    assert safe > swing                  # floor preference: lower sd scores higher


def test_tier_sig_rewards_bigger_cliff():
    st = P.board_stats(_pool())
    assert P.tier_sig(_pool()[0], st) > P.tier_sig(_pool()[1], st)   # tier_drop 40 vs 5


def test_bye_sig_penalizes_collisions_only():
    p = _pool()[0]                       # bye 6
    assert P.bye_sig(p, []) == 0.0
    assert P.bye_sig(p, [{"bye": 6}, {"bye": 6}]) == -30.0   # 2 collisions × -15
    assert P.bye_sig(p, [{"bye": 9}]) == 0.0                 # different bye, no penalty


def test_stack_sig_fires_on_qb_pass_catcher_same_team():
    wr, qb = _pool()[0], _pool()[2]      # both MIN
    assert P.stack_sig(wr, [qb]) == P.NUDGE          # WR stacks a rostered MIN QB
    assert P.stack_sig(qb, [wr]) == P.NUDGE          # QB stacks a rostered MIN WR
    assert P.stack_sig(wr, [_pool()[1]]) == 0.0      # DET RB — no stack


def test_score_value_off_drops_the_anchor():
    st = P.board_stats(_pool())
    p = _pool()[0]
    with_anchor = P.score(p, [], P._wset(), st)
    no_anchor = P.score(p, [], P._wset(value=0.0), st)
    assert with_anchor - no_anchor == p["vorp"]      # exactly the anchor removed
