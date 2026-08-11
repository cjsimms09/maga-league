"""THE 6-POINT PASSING TD, AND THE WAY THIS MEASUREMENT GOES WRONG.

The naive version of this hands back the raw scoring difference wearing a VORP
label, because it forgets that raising every QB's score raises the REPLACEMENT QB's
score too. Every mutation below produces a bigger, more exciting number than the
truth, which is the direction that gets a finding believed.

Run: python3 -m pytest draft/tests/test_nflverse_qb_scoring.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for _p in (str(HERE.parent / "backtest"), str(HERE.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import nflverse_qb_scoring as Q  # noqa: E402

CFG = {"teams": 10, "starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1}}
TABLE = {"pass_td": 6.0, "pass_yd": 0.04, "rec": 0.5, "rush_yd": 0.1, "rec_yd": 0.1}


def rows():
    """Weekly rows in nflverse's own column names, one week each."""
    out = []
    for i in range(14):                       # enough QBs to have a replacement
        out.append({"player_id": "QB%02d" % i, "player_display_name": "Passer %02d" % i,
                    "position": "QB", "passing_tds": 30 - i, "passing_yards": 4000 - 50 * i})
    for i in range(40):
        out.append({"player_id": "RB%02d" % i, "player_display_name": "Runner %02d" % i,
                    "position": "RB", "rushing_yards": 1500 - 30 * i, "receptions": 40 - i})
    for i in range(40):
        out.append({"player_id": "WR%02d" % i, "player_display_name": "Catcher %02d" % i,
                    "position": "WR", "receiving_yards": 1400 - 30 * i, "receptions": 90 - 2 * i})
    return out


def test_REPLACEMENT_IS_RECOMPUTED_UNDER_EACH_RULE_never_held_fixed():
    """THE DEFECT THIS MEASUREMENT IS SHAPED AROUND. Raising every QB's score raises
    the replacement QB's score too, and most of the naive version of this question is
    that omission — it reports the raw scoring difference as though it were value
    above replacement.

    MUTATION: compute replacement once and reuse it. Every QB gains the full scoring
    difference, the crossover leaps, and the number looks like an edge."""
    r = rows()
    a = Q.valuation(r, Q.scoring_variant(TABLE, 6.0), CFG)
    b = Q.valuation(r, Q.scoring_variant(TABLE, 4.0), CFG)
    assert a["replacement"]["QB"] > b["replacement"]["QB"], \
        "the replacement QB must rise with the rule, or VORP is measuring the wrong thing"


def test_RB_AND_WR_ARE_UNTOUCHED_between_the_two_worlds():
    """Their scoring does not differ, so any movement has to come from the QB side.
    MUTATION: rescore them under both. A difference that does not exist is introduced
    and then measured."""
    r = rows()
    a = Q.valuation(r, Q.scoring_variant(TABLE, 6.0), CFG)
    b = Q.valuation(r, Q.scoring_variant(TABLE, 4.0), CFG)
    assert a["replacement"]["RB"] == b["replacement"]["RB"]
    assert a["replacement"]["WR"] == b["replacement"]["WR"]
    pa = {p["player_id"]: p["vorp"] for p in a["players"] if p["position"] == "RB"}
    pb = {p["player_id"]: p["vorp"] for p in b["players"] if p["position"] == "RB"}
    assert pa == pb, "an RB's value must be identical under both rules"


def test_the_SHIPPED_TABLE_IS_NOT_MUTATED():
    """MUTATION: rewrite the caller's table in place. The second measurement then
    scores under the first's rule and the two worlds agree perfectly — a null that
    looks like a finding about football."""
    t = dict(TABLE)
    Q.scoring_variant(t, 4.0)
    assert t["pass_td"] == 6.0


def test_THE_REPLACEMENT_PLAYER_HAS_VORP_ZERO():
    """The internal check that says the whole chain is wired to the real config: a
    10-team league starting one QB makes the 10th-best QB the replacement, and his
    value above replacement is zero by construction. If this drifts, `cfg` is not
    reaching `apply_vorp` and every number here is about a different league."""
    a = Q.valuation(rows(), Q.scoring_variant(TABLE, 6.0), CFG)
    qbs = [p for p in a["players"] if p["position"] == "QB"]
    assert abs(qbs[9]["vorp"]) < 0.01, [q["vorp"] for q in qbs[:12]]


def test_the_crossover_is_the_TOP_QBs_OVERALL_RANK_and_says_so():
    """Under a VORP-ordered board the best available player at pick k IS rank k, so
    the first pick at which a QB is best available is the rank the best QB holds.
    Anything more elaborate is a draft simulation whose assumptions, not the scoring
    rule, would drive the answer."""
    a = Q.valuation(rows(), Q.scoring_variant(TABLE, 6.0), CFG)
    c = Q.crossover_pick(a["players"])
    top_qb = next(p for p in a["players"] if p["position"] == "QB")
    assert c["pick"] == top_qb["overall_rank"]
    assert sum(c["n_ahead_by_position"].values()) == c["pick"] - 1


def test_a_board_with_NO_QB_says_so_rather_than_returning_a_pick():
    c = Q.crossover_pick([{"position": "RB", "overall_rank": 1, "vorp": 10, "name": "x"}])
    assert c["pick"] is None and "nothing to cross over" in c["why"]


def test_a_SMALL_MOVE_IS_REPORTED_AS_DEAD_not_dressed_up():
    """The whole position rising together is arithmetic. MUTATION: report any
    non-zero move as an edge — the finding survives review because nobody checks
    whether one pick is a lot."""
    # Tested on the VERDICT directly, because this fixture happens to produce a
    # ten-pick move — so an `if move < 5` guard around a live call never fires and
    # the assertion is vacuous. That is how the mutation survived the first battery.
    v = Q._verdict(1, {"gap_qb3_to_qb8": 79}, {"gap_qb3_to_qb8": 95}, {"pick": 4}, {"pick": 5})
    assert "DEAD ON THIS EVIDENCE" in v and "not an edge" in v
    assert "arithmetic" in v


def test_THE_TWO_RULES_MUST_PRODUCE_DIFFERENT_BOARDS():
    """MUTATION: value both worlds under OUR table. The two crossovers coincide, the
    move is 0, and the verdict reports DEAD — a null that is an artifact of scoring
    the same rule twice rather than a fact about football. This is the most dangerous
    mutation in the file because its output is the answer we expect."""
    out = Q.compare(rows(), TABLE, CFG, market_pass_td=4.0)
    assert out["pass_td_ours"] == 6.0 and out["pass_td_theirs"] == 4.0
    assert out["crossover_ours"]["pick"] != out["crossover_theirs"]["pick"], \
        "identical crossovers on this fixture means both worlds scored the same rule"
    a = {p["player_id"]: p["vorp"] for p in
         Q.valuation(rows(), Q.scoring_variant(TABLE, 6.0), CFG)["players"]
         if p["position"] == "QB"}
    b = {p["player_id"]: p["vorp"] for p in
         Q.valuation(rows(), Q.scoring_variant(TABLE, 4.0), CFG)["players"]
         if p["position"] == "QB"}
    assert a != b, "QB values identical under 4 and 6 — the tables are not distinct"


def test_the_verdict_REFUSES_to_call_it_an_edge_without_the_ADP_check():
    """ADP is what a player COSTS, not what he is worth, and the market's QB ADP may
    already partly reflect leagues like ours. Even a large move is 'our valuation
    against theirs', never an edge, until the market's pricing is checked."""
    v = Q._verdict(20, {"gap_qb3_to_qb8": 50}, {"gap_qb3_to_qb8": 20},
                   {"pick": 20}, {"pick": 40})
    assert "MOVES 20 PICKS" in v
    assert "NOT YET AN EDGE" in v and "separate question" in v
