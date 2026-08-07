"""The keep-0/1/2/3 optimizer: keeping FEWER can be optimal.

The whole point over 'rank the best 3': a keeper that costs more than the pick
it forfeits has negative surplus, so keeping it is worse than not. The optimizer
must be able to recommend a smaller number.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import keepers as K

CFG = {"teams": 10, "rounds": 15, "my_draft_slot": 4, "draft_type": "snake",
       "keepers": {"count": 3, "cost_model": "original_round", "undrafted_round": 10}}
POOL = {"RB": [{"adjusted_adp": 30, "vorp": 90}], "WR": [{"adjusted_adp": 50, "vorp": 70}],
        "TE": [{"adjusted_adp": 40, "vorp": 60}]}
REP = {"RB": 50, "WR": 40, "TE": 30}


def test_keeping_fewer_wins_when_the_marginal_keeper_costs_too_much():
    elig = [
        {"name": "Stud", "position": "RB", "vorp": 150, "original_round": 5},
        {"name": "Good", "position": "WR", "vorp": 110, "original_round": 6},
        {"name": "Trap", "position": "TE", "vorp": 20, "original_round": 1},  # round-1 cost, low vorp
    ]
    out = K.optimize_keeper_count(elig, CFG, replacement_by_pos=REP, pool_by_pos=POOL)
    assert out["recommended_keep"] == 2, out
    assert "Trap" not in out["recommended_players"]
    sizes = {r["keep"]: r["total_surplus"] for r in out["by_size"]}
    assert sizes[0] == 0.0
    assert sizes[2] > sizes[3], "the 3rd keeper has negative surplus, so keep-2 must beat keep-3"


def test_keep_zero_is_always_offered_as_the_baseline():
    out = K.optimize_keeper_count([], CFG, replacement_by_pos=REP, pool_by_pos=POOL)
    assert out["recommended_keep"] == 0
    assert out["by_size"][0]["keep"] == 0 and out["by_size"][0]["total_surplus"] == 0.0


def test_every_size_up_to_count_is_reported():
    elig = [{"name": "A", "position": "RB", "vorp": 100, "original_round": 6},
            {"name": "B", "position": "WR", "vorp": 90, "original_round": 7},
            {"name": "C", "position": "TE", "vorp": 80, "original_round": 8}]
    out = K.optimize_keeper_count(elig, CFG, replacement_by_pos=REP, pool_by_pos=POOL)
    assert [r["keep"] for r in out["by_size"]] == [0, 1, 2, 3]
