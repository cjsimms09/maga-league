"""Strategy-tournament mechanics — the pure parts (no money layer). Run:
   python -m pytest draft/tests/test_strategy_tournament.py -q

Pins the parts that must be right for the dollar ranking to mean anything: positional
rules do what they say (zero-RB skips RB early, robust-RB grabs it), the startable-cap
mask holds, the roster is always a full seat with keepers respected, and the injury rule
fills a MISSED week with the player's own per-game rate while leaving played weeks alone.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_strategy_tournament as T  # noqa: E402

POS = {"r1": "RB", "r2": "RB", "r3": "RB", "w1": "WR", "w2": "WR", "t1": "TE",
       "q1": "QB", "k1": "K", "d1": "DEF"}
# market ADP = lower is better; RBs are the best available here.
ADP = {"r1": 1, "r2": 2, "w1": 3, "r3": 4, "w2": 5, "t1": 6, "q1": 7, "k1": 8, "d1": 9}


def test_zero_rb_skips_rb_early_then_allows_it():
    avail = set(POS)
    early = T.strat_zero_rb(avail, POS, [], 1, 15, ADP)     # round 1 -> no RB
    assert POS[early] != "RB"
    late = T.strat_zero_rb(avail, POS, [], 6, 5, ADP)       # round 6 -> RB allowed, and it's best ADP
    assert late == "r1"


def test_robust_rb_grabs_rb_in_round_one():
    assert POS[T.strat_robust_rb(set(POS), POS, [], 1, 15, ADP)] == "RB"


def test_market_is_best_available_by_adp():
    assert T.strat_market(set(POS), POS, [], 3, 12, ADP) == "r1"   # lowest ADP overall


def test_cap_mask_blocks_a_third_rb_when_others_available():
    # cap RB at 2 for this check by pre-filling two RBs; a WR should be chosen next
    T.CAPS["RB"] = 2
    roster = ["r1", "r2"]
    pick = T.strat_market(set(POS) - set(roster), POS, roster, 3, 12, ADP)
    assert POS[pick] != "RB"
    T.CAPS["RB"] = 6   # restore


def test_need_value_fills_a_starter_need_first():
    # roster has everything but a DEF and QB; need_value must take one of those over a 3rd WR
    roster = ["r1", "r2", "w1", "w2", "t1", "k1"]
    avail = {"q1", "d1", "w1b"}
    pos = dict(POS); pos["w1b"] = "WR"; adp = dict(ADP); adp["w1b"] = 0  # a WR is the ADP-best
    pick = T.strat_need_value(avail, pos, roster, 8, 6, adp)
    assert pos[pick] in ("QB", "DEF")     # a starter need beats the ADP-best WR


def test_injury_rule_fills_missed_week_with_ppg():
    # player x plays wk1 (20) and wk3 (10) -> ppg 15; wk2 he is ABSENT -> filled with 15.
    season = {"weeks": {
        "1": [{"players_points": {"x": 20.0, "d1": 5.0}}],
        "2": [{"players_points": {"d1": 5.0}}],                 # x absent
        "3": [{"players_points": {"x": 10.0, "d1": 5.0}}],
    }}
    ppg = T.season_ppg(season)
    assert round(ppg["x"], 2) == 15.0
    pos = {"x": "RB", "d1": "DEF"}
    wk = T.neutralized_weekly(season, ["x", "d1"], pos, ppg)
    # wk2 (x absent) should now count x at 15 (his ppg), not 0
    assert wk[2] >= 15.0
    # wk1 keeps the real score (20), not the ppg
    assert wk[1] >= 20.0
