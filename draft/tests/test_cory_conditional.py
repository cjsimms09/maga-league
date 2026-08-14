"""EXPERIMENT 19b — smoke-lock the Cory-conditional race machinery."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import cory_conditional as CC  # noqa: E402


def test_race_is_deterministic_and_paired():
    a, da, ca = CC.race(n_rooms=4, seed=123)
    b, db, cb = CC.race(n_rooms=4, seed=123)
    assert a == b and da == db and ca == cb       # same seed, same rooms, same grades
    # Every archetype graded in every room, incl. the control.
    assert set(a.keys()) == set(CC.make_archetypes().keys())
    assert all(len(v) == 4 for v in a.values())


def test_zero_divergence_means_zero_edge():
    # An archetype whose constraint never binds drafts the control's exact
    # roster — paired grading MUST give it exactly the control's dollars.
    per_seed, diverg, _ = CC.race(n_rooms=4, seed=123)
    for k in per_seed:
        if k == "balanced":
            continue
        if all(d == 0 for d in diverg[k]):
            assert per_seed[k] == per_seed["balanced"], k


def test_constraints_bind_from_my_keeper_base():
    # At least one archetype must actually diverge from the control at my picks
    # on the predicted board — otherwise the race is vacuous.
    _, diverg, _ = CC.race(n_rooms=4, seed=123)
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


# --- THE CONTROL-VALIDITY GATE ------------------------------------------------
#
# THIS IS THE ONE THAT MATTERED. `early_qb` was the ENROLLED PLAN, shipped to the
# war-room banner as "Early-QB Strike +$353 season edge", and it reached Cory as
# advice to take a quarterback early. The margin was not a sequencing result.
#
# My seat picks `max(allowed, key=vorp)`; the grader scores `proj_mean` of the
# best startable lineup. Two currencies. QB VORP is LOW precisely because
# quarterbacks are replaceable (Allen 63.8 against Gibbs 156.0), so a VORP-greedy
# control never spends a pick on one — and then the grader docks it the ~350
# points of an empty QB slot. Measured: the control could not field the mandatory
# lineup in 198 of 200 rooms (QB unfilled in 182, TE in 130).
#
# `early_qb` is the archetype FORCED to buy a quarterback. It differs from the
# control by exactly ONE player and "wins" by +$352.75 — the price of a starter
# the control never bought. `elite_te` (+$64.38) is the same artifact at TE.

def test_unfilled_starters_reports_the_gap_not_a_boolean():
    one = [{"position": "QB"}, {"position": "RB"}, {"position": "RB"},
           {"position": "WR"}, {"position": "WR"}, {"position": "TE"},
           {"position": "K"}, {"position": "DEF"}]
    assert CC.unfilled_starters(one) == {}, "a legal roster must report no gap"
    assert CC.unfilled_starters([p for p in one if p["position"] != "QB"]) == {"QB": 1}
    # The SIZE of the gap matters: two RB slots with one back is short by one.
    assert CC.unfilled_starters([p for p in one if p["position"] != "RB"])["RB"] == 2


def test_control_validity_counts_rooms_and_names_the_slot():
    v = CC.control_validity([{}, {}, {"QB": 1}, {"QB": 1, "TE": 1}])
    assert v["rooms"] == 4 and v["illegal"] == 2 and v["rate"] == 0.5
    assert v["by_slot"] == {"QB": 2, "TE": 1}
    # CONTROL — an all-legal set must read as zero, or the gate would fire on
    # every race and "the race is void" would carry no information at all.
    clean = CC.control_validity([{}, {}, {}])
    assert clean["illegal"] == 0 and clean["rate"] == 0.0 and clean["by_slot"] == {}


def test_the_control_really_cannot_field_a_lineup_on_the_live_board():
    """The defect reproduced from the data, not remembered from a write-up.

    If this ever goes green on its own, the currency mismatch was fixed and the
    gate below should stop firing — which is exactly the signal we want.
    """
    _, _, control_short = CC.race(n_rooms=8, seed=123)
    v = CC.control_validity(control_short)
    assert v["rate"] > 0.5, (
        f"expected a mostly-illegal control, got {v}")
    assert "QB" in v["by_slot"], f"QB was the slot that drove the enrollment: {v}"


def test_a_race_with_an_invalid_control_enrolls_NOTHING(tmp_path):
    res = _run_main(tmp_path, rooms=8)
    assert res["void_reason"], "an unfillable control must void the race"
    assert res["control_validity"]["rate"] > 0.5
    # The enrolled key must not name an archetype — `build.py` looks it up in the
    # leaderboard and yields None, so the banner runs the control and says so.
    assert res["enrolled"] == "balanced"
    assert not any(r["archetype"] == res["enrolled"] for r in res["leaderboard"])


def test_a_void_race_leaves_no_row_claiming_a_win(tmp_path):
    """`enrolled: balanced` beside a row reading 'WINNER — enroll as THE PLAN'
    is a contradiction, and the appealing way to resolve it is the wrong one."""
    res = _run_main(tmp_path, rooms=8)
    assert res["void_reason"]
    assert all(r["verdict"].startswith("VOID") for r in res["leaderboard"]), \
        [r["verdict"] for r in res["leaderboard"]]
    assert res["head_to_head"] is None


def test_the_verdict_label_matches_the_interval():
    """THE BUG: `parked: CI includes $0` was chosen on `lo <= 0`, which is true of
    ANY negative lower bound. `late_qb` at [-71.00, -23.38] — an interval lying
    ENTIRELY below zero — was therefore reported as inconclusive. Zero is inside
    [lo, hi] only when lo <= 0 <= hi."""
    def verdict(lo, hi):
        # The expression under test, restated so the three cases are visible.
        return ("LOSER" if hi < 0 else
                "includes" if lo <= 0 <= hi else "band")
    assert verdict(-71.0, -23.38) == "LOSER"     # the row that was mislabelled
    assert verdict(-6.25, 9.88) == "includes"    # genuinely inconclusive
    assert verdict(0.0, 0.0) == "includes"       # a degenerate CI still contains 0
    assert verdict(1.0, 3.0) == "band"           # positive but under even-money

    src = (Path(CC.__file__)).read_text()
    assert "lo <= 0 <= hi" in src, "the interval test must be two-sided"
    assert "if lo <= 0 else" not in src, "the one-sided test is back"
