# TERRITORY: C
"""WHAT OUR 6-POINT PASSING TD IS ACTUALLY WORTH — against a market built on 4.

THE QUESTION, AND THE ONE IT IS NOT. Our league pays 6 per passing TD. Every public
ADP list — FantasyPros included, which is our anchor — is built for 4. So our board is
priced against a market playing a different game at quarterback.

THE NUMBER THAT WOULD BE AN ANSWER IS NOT "QBs SCORE MORE". They do, by about two
points per touchdown, and if the whole position rises together that is arithmetic and
changes nothing about what to do at a pick. Two things WOULD be exploitable:

  THE TIER CLIFF MOVES.  If at 4 points the gap from QB3 to QB8 is small enough that
                         waiting is free, and at 6 it widens materially, the position
                         acquires urgency the market's model does not show.
  THE CROSSOVER MOVES.   The pick at which the best available QB is worth more than
                         the best available RB or WR. If that sits at pick 60 in the
                         market's model and pick 40 in ours, there is a twenty-pick
                         window where an elite QB is correct for us and looks like a
                         reach to everyone else.

THE SECOND IS THE WHOLE QUESTION IN ONE FIGURE, expressed as a pick number rather than
as points, and it is what this module exists to produce.

THREE THINGS IT REFUSES TO DO.

  1. REPLACEMENT LEVEL IS RECOMPUTED UNDER EACH RULE, never held fixed. Raising every
     QB's score raises the replacement QB's score too, and most of the naive version
     of this measurement is that omission: it hands back the raw scoring difference
     wearing a VORP label. `vorp.apply_vorp` is called separately for each table and
     it solves the FLEX allocation iteratively, which is exactly why it is REUSED
     rather than reimplemented here.
  2. RB, WR AND TE ARE SCORED ONCE AND LEFT ALONE. Their scoring does not differ
     between the two worlds, so any movement in the comparison has to come from the
     QB side. Rescoring them under both would introduce a difference that does not
     exist and then measure it.
  3. IT DOES NOT COMPARE OUR VORP TO THEIR ADP AND CALL THE GAP AN EDGE. ADP is what
     a player COSTS, not what he is worth, and the market's QB ADP may already partly
     reflect leagues like ours. Like is compared with like — our valuation against a
     valuation built under their scoring — and `market_check` treats ADP as a separate
     question about whether the market has priced any of it.

WHAT IT IS MEASURED ON. A COMPLETED season's realized stat lines, not projections:
this asks what the two rules were worth in a season that actually happened, so the
answer is not a function of whose projections we trust. Realized totals are a
retrospective analogue of `proj_mean`, which is what `apply_vorp` consumes, and that
substitution is stated here rather than hidden in a variable name.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for _p in (str(HERE), str(HERE.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

PASS_TD_KEY = "pass_td"
MARKET_PASS_TD = 4.0
GRADED_POSITIONS = ("QB", "RB", "WR", "TE")


def scoring_variant(table: dict, pass_td_points: float) -> dict:
    """Our scoring table with ONE term changed. Everything else is identical.

    A copy, not a mutation: the caller's table is the shipped one and a function
    that quietly rewrote it would leave the second measurement scoring under the
    first's rule — which would look like "the two rules agree".
    """
    out = dict(table or {})
    out[PASS_TD_KEY] = float(pass_td_points)
    return out


def season_totals(rows, table, positions=GRADED_POSITIONS) -> list:
    """Realized weekly rows -> [{player_id, name, position, proj_mean}] for a season.

    Scored through `grade.nflverse_weekly_to_scoring` and `scoring.score_stat_line` —
    the SHIPPED converter and the SHIPPED scorer. A private re-implementation of
    either is how a measurement comes to disagree with the tool it is about.

    `proj_mean` carries a season TOTAL rather than a projection. `apply_vorp` reads
    that key and does not care what produced it; the substitution is named here so
    nobody reads the output as a forecast.
    """
    import grade as GR
    import scoring as SC
    want = {p.upper() for p in positions}
    by_player: dict = {}
    for r in rows or []:
        pos = str(r.get("position") or r.get("position_group") or "").upper()
        if pos not in want:
            continue
        pid = r.get("player_id") or r.get("gsis_id")
        if not pid:
            continue
        e = by_player.setdefault(str(pid), {
            "player_id": str(pid),
            "name": r.get("player_display_name") or r.get("player_name") or str(pid),
            "position": pos, "proj_mean": 0.0, "weeks": 0})
        e["proj_mean"] += float(SC.score_stat_line(GR.nflverse_weekly_to_scoring(r), table))
        e["weeks"] += 1
    return sorted(by_player.values(), key=lambda p: p["proj_mean"], reverse=True)


def valuation(rows, table, cfg) -> dict:
    """One scoring table -> the whole board's VORP, with replacement RECOMPUTED.

    `vorp.apply_vorp` is the shipped path and is called here rather than copied. It
    returns players sorted by VORP with `overall_rank` assigned, which is what makes
    the crossover answerable at all: under a VORP-ordered board, "the best available
    player at pick k" is the player at rank k.
    """
    from vorp import apply_vorp
    players = season_totals(rows, table)
    ranked, diag = apply_vorp(players, cfg)
    return {"players": ranked, "diagnostics": diag,
            "replacement": {p: ranked[0].get("replacement") for p in ()} or
                           {pos: next((x["replacement"] for x in ranked
                                       if x["position"] == pos), None)
                            for pos in GRADED_POSITIONS}}


def crossover_pick(ranked) -> dict:
    """The pick at which the best available QB is worth more than the best RB or WR.

    UNDER A VORP-ORDERED BOARD THIS IS THE OVERALL RANK OF THE TOP QB, and saying so
    plainly matters more than the number: at pick k the best available player is rank
    k, so the first pick at which a QB is the best available is the rank the best QB
    holds. Anything more elaborate would be a draft simulation with assumptions of its
    own, and those assumptions — not the scoring rule — would drive the answer.
    """
    top_qb = next((p for p in ranked if p["position"] == "QB"), None)
    if not top_qb:
        return {"pick": None, "why": "no QB in the ranked board — nothing to cross over"}
    ahead = [p for p in ranked if p.get("overall_rank", 0) < top_qb["overall_rank"]]
    return {"pick": top_qb["overall_rank"], "player": top_qb["name"],
            "qb_vorp": top_qb["vorp"],
            "taken_first": [{"name": p["name"], "position": p["position"], "vorp": p["vorp"]}
                            for p in ahead[:8]],
            "n_ahead_by_position": {
                pos: sum(1 for p in ahead if p["position"] == pos)
                for pos in GRADED_POSITIONS}}


def tier_gaps(ranked, top=12) -> dict:
    """QB VORP by positional rank, and the QB3->QB8 gap the question named.

    Reported as the whole curve rather than one number, because "the gap widened" is
    only interesting if it widened WHERE a drafter has a decision, and a single
    summary statistic cannot show that.
    """
    qbs = [p for p in ranked if p["position"] == "QB"][:top]
    curve = [{"qb_rank": i, "name": p["name"], "vorp": p["vorp"],
              "overall_rank": p.get("overall_rank")} for i, p in enumerate(qbs, 1)]
    def at(n):
        return curve[n - 1]["vorp"] if len(curve) >= n else None
    g38 = (at(3) - at(8)) if (at(3) is not None and at(8) is not None) else None
    g14 = (at(1) - at(4)) if (at(1) is not None and at(4) is not None) else None
    return {"curve": curve, "gap_qb3_to_qb8": g38, "gap_qb1_to_qb4": g14}


def compare(rows, table, cfg, market_pass_td=MARKET_PASS_TD) -> dict:
    """The whole measurement: our rule against the market's, like against like."""
    ours = scoring_variant(table, float(table.get(PASS_TD_KEY, 6.0)))
    theirs = scoring_variant(table, market_pass_td)
    a = valuation(rows, ours, cfg)
    b = valuation(rows, theirs, cfg)
    ca, cb = crossover_pick(a["players"]), crossover_pick(b["players"])
    ta, tb = tier_gaps(a["players"]), tier_gaps(b["players"])
    move = (cb["pick"] - ca["pick"]) if (ca["pick"] and cb["pick"]) else None
    return {
        "pass_td_ours": ours[PASS_TD_KEY], "pass_td_theirs": theirs[PASS_TD_KEY],
        "crossover_ours": ca, "crossover_theirs": cb,
        "crossover_moves_by": move,
        "tiers_ours": ta, "tiers_theirs": tb,
        "replacement_ours": a["replacement"], "replacement_theirs": b["replacement"],
        "verdict": _verdict(move, ta, tb, ca, cb),
    }


def _verdict(move, ta, tb, ca, cb) -> str:
    if move is None:
        return ("NO CROSSOVER COMPUTED — one of the two boards had no QB, which is a "
                "statement about the stat rows, not about the scoring rules")
    g_ours, g_theirs = ta.get("gap_qb3_to_qb8"), tb.get("gap_qb3_to_qb8")
    cliff = ""
    if g_ours is not None and g_theirs is not None:
        cliff = ("; the QB3->QB8 gap is %.1f under ours against %.1f under theirs (%+.1f)"
                 % (g_ours, g_theirs, g_ours - g_theirs))
    if abs(move) < 5:
        return ("DEAD ON THIS EVIDENCE: the crossover moves %d pick(s) — QB1 is rank %s "
                "under our rule and %s under the market's. The whole position rises "
                "together, which is arithmetic and not an edge%s"
                % (move, ca["pick"], cb["pick"], cliff))
    return ("THE CROSSOVER MOVES %d PICKS: QB1 is worth taking at rank %s under our "
            "scoring and at rank %s under the market's. That is a window where an "
            "elite QB is correct for us and reads as a reach to a room using market "
            "ADP%s. NOT YET AN EDGE: this is our valuation against a valuation built "
            "under their scoring, and whether the MARKET has already priced any of it "
            "is a separate question its ADP has to answer"
            % (move, ca["pick"], cb["pick"], cliff))
