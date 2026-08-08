"""EXPERIMENT 19b — smoke-lock the Cory-conditional race machinery."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import cory_conditional as CC  # noqa: E402


def test_race_is_deterministic_and_paired():
    a, da = CC.race(n_rooms=4, seed=123)
    b, db = CC.race(n_rooms=4, seed=123)
    assert a == b and da == db                    # same seed, same rooms, same grades
    # Every archetype graded in every room, incl. the control.
    assert set(a.keys()) == set(CC.make_archetypes().keys())
    assert all(len(v) == 4 for v in a.values())


def test_zero_divergence_means_zero_edge():
    # An archetype whose constraint never binds drafts the control's exact
    # roster — paired grading MUST give it exactly the control's dollars.
    per_seed, diverg = CC.race(n_rooms=4, seed=123)
    for k in per_seed:
        if k == "balanced":
            continue
        if all(d == 0 for d in diverg[k]):
            assert per_seed[k] == per_seed["balanced"], k


def test_constraints_bind_from_my_keeper_base():
    # At least one archetype must actually diverge from the control at my picks
    # on the predicted board — otherwise the race is vacuous.
    _, diverg = CC.race(n_rooms=4, seed=123)
    assert any(sum(diverg[k]) > 0 for k in diverg if k != "balanced")


# --- the money function is now COMPLETE (playoff $ included) ------------------

def test_grade_room_pays_the_bracket_from_the_payout_table():
    """Playoff $ is 53% of the pot. It must come from payouts.json, not from
    numbers typed into the simulator."""
    import json
    pay = json.loads((Path(CC.HERE).parent / "config" / "payouts.json").read_text())
    truth = (pay["by_season"]["2026"]["playoffs"])
    assert CC.PLAYOFF_PAY == {int(k): float(v) for k, v in truth.items() if str(k).isdigit()}
    assert CC.PLAYOFF_TEAMS == 4


def test_a_graded_room_decomposes_and_sums():
    import random
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    arch = CC.make_archetypes()
    r = random.Random(7)
    rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, arch["balanced"], r)
    g = CC.grade_room(rosters, random.Random(11))
    assert set(g) >= {"weekly_high", "rs", "playoff", "place", "total"}
    assert g["total"] == g["weekly_high"] + g["rs"] + g["playoff"]
    # A place implies the prize for that place, and no place implies no money.
    if g["place"] is None:
        assert g["playoff"] == 0
    else:
        assert g["place"] in (1, 2, 3, 4)
        assert g["playoff"] == CC.PLAYOFF_PAY[g["place"]]


def test_playoff_money_actually_reaches_some_rooms():
    """Non-vacuous: if the bracket never paid, the 'complete money function'
    would be a comment rather than a change."""
    import random
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    arch = CC.make_archetypes()
    paid = 0
    for s in range(12):
        r = random.Random(1000 + s)
        rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, arch["balanced"], r)
        if CC.grade_room(rosters, random.Random(2000 + s))["playoff"] > 0:
            paid += 1
    assert paid > 0, "no room ever paid playoff dollars — the bracket is not wired"


# --- the head-to-head tie-break gate -----------------------------------------
#
# Clearing the control is necessary, not sufficient. Adding playoff dollars put
# two archetypes within $13 of each other on overlapping CIs, and ranking by raw
# mean would have flipped the enrolled plan on a coin flip. These lock the gate
# that stopped it.

def _run_main(tmp_path, rooms=60, incumbent=None):
    import json
    out = tmp_path / "cc.json"
    if incumbent:
        out.write_text(json.dumps({"enrolled": incumbent}))
    argv = sys.argv
    sys.argv = ["cory_conditional", "--rooms", str(rooms), "--out", str(out),
                "--report", str(tmp_path / "cc.md")]
    try:
        CC.main()
    finally:
        sys.argv = argv
    return json.loads(out.read_text())


def test_inseparable_co_leaders_retain_the_incumbent(tmp_path):
    res = _run_main(tmp_path, incumbent="wr_anchor")
    h = res["head_to_head"]
    if h is None:
        return                       # only one archetype cleared; nothing to break
    if not h["separable"]:
        assert res["enrolled"] == "wr_anchor", (
            "inseparable co-leaders must not churn the plan")
        assert "CO-LEADERS" in h["resolution"]


def test_the_head_to_head_is_a_paired_test_not_a_mean_comparison(tmp_path):
    """A CI straddling $0 is the whole point: the leader's mean edge can be
    larger while the paired difference is indistinguishable from noise."""
    res = _run_main(tmp_path, incumbent="wr_anchor")
    h = res["head_to_head"]
    if h is None:
        return
    lead = next(r for r in res["leaderboard"] if r["archetype"] == h["leader"])
    runner = next(r for r in res["leaderboard"] if r["archetype"] == h["runner_up"])
    assert lead["mean_edge"] >= runner["mean_edge"]
    assert h["ci95"][0] <= h["paired_mean"] <= h["ci95"][1]
    # separable is exactly "CI clear of zero AND beyond the even-money band"
    assert h["separable"] == (h["ci95"][0] > 0 and h["paired_mean"] > CC.EVEN_MONEY_BAND)


def test_a_separable_leader_is_still_enrolled_over_the_incumbent(tmp_path):
    """The gate must not be a ratchet that freezes the incumbent forever."""
    res = _run_main(tmp_path, incumbent="late_qb")   # an incumbent that cannot win
    h = res["head_to_head"]
    if h is None or h["separable"]:
        assert res["enrolled"] != "late_qb"
    else:
        # incumbent is not among the co-leaders -> the leader takes it
        assert res["enrolled"] == h["leader"]
