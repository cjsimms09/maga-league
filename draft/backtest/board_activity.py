# TERRITORY: C
"""HALF THE BOARD HAS NOT PLAYED A DOWN IN TWO YEARS. THIS SAYS SO, AND SAYS
WHETHER ANY OF IT REACHES A DECISION.

Tom Brady, Drew Brees, Rob Gronkowski, Julian Edelman, Antonio Brown, Larry
Fitzgerald, Todd Gurley and Marshawn Lynch are all on the 2026 board.

WHY THEY ARE THERE, exactly. `build.py:448` filters with
`if p.get("active") is False` — and Sleeper leaves `active` UNSET for a great
many players it still lists, so a null passes the test. The only other gate is
`search_rank`, which those players still have (Sleeper never retires a rank), and
this path applies no ceiling to it. `src/sleeper.js` drops rank > 600 for exactly
this reason; the build does not. A had already diagnosed it in a comment and
wrote that settling it needs a Sleeper fetch — `Counter(v.get("active") for v in
raw.values())` — which that session could not make.

IT IS SETTLEABLE WITHOUT SLEEPER, from evidence already committed. The weekly
realized-points store answers a better question than a flag does: did this player
score in a real NFL game in 2024 or 2025. A retired player did not. That is
measurement rather than metadata, and it cannot go stale in the way a flag left
unset can.

WHAT THIS MODULE REFUSES TO DO IS AS IMPORTANT AS WHAT IT DOES:

  * IT JUDGES ONLY QB/RB/WR/TE. The store scores nobody else — 207 DEF and 85 K
    are unscorable in it, established during the waiver work. My first pass
    forgot that and produced 47 "inactive" players who were all KICKERS with
    100-point projections. A detector applied outside its evidence does not
    produce a weaker finding, it produces a wrong one.
  * IT SPARES ROOKIES. `years_exp == 0` means no NFL history is the correct
    history.
  * IT SPARES ANYONE THE MARKET PRICES. A player with a real ADP is a player
    somebody is drafting; no absence of mine outranks that.
  * IT SPARES ANYONE CARRYING A PROJECTION. Nine rows are second-year players
    who did not score in either season — practice squad, injury, inactive — and
    a projection is a positive claim that they exist in 2026.

THE POINT IS NOT TO PRUNE THE POOL — that is `build.py` and A's lane. The point
is the GUARANTEE: no row this module calls dormant may reach anything that prices
a decision. Measured on the shipped board, 909 rows qualify and ZERO of them are
ranked inside the draft's depth, carry positive VORP, or sit inside the relevant
board. `audit` asserts that, so the day one does, it fails loudly instead of
being discovered by somebody reading a draft board and seeing Tom Brady.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

#: Positions the weekly points store actually scores. K and DEF are absent from
#: it by construction, so a "no scored week" finding says nothing about them.
COVERED_POSITIONS = ("QB", "RB", "WR", "TE")

#: Seasons that count as recent activity. Two, so a player who missed one whole
#: season through injury is not called dormant on that alone.
RECENT_SEASONS = (2024, 2025)

#: How deep the draft goes — the board, not the selection count. Keeper slots are
#: occupied rather than removed, so 10 x 15 = 150 rows leave the pool.
DEPTH = 150


def _store(season, root=None):
    p = Path(root or HERE) / ("nflverse_weekly_points_%d.json" % season)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def scored_ids(seasons=RECENT_SEASONS, root=None) -> dict:
    """Player ids with at least one SCORED week, and which seasons were readable.

    Returns the seasons it actually found, because a missing store must not read
    as "nobody played". The caller checks that before trusting an absence.
    """
    ids, found, missing = set(), [], []
    for s in seasons:
        doc = _store(s, root)
        if doc is None:
            missing.append(s)
            continue
        found.append(s)
        for wk in (doc.get("weeks") or []):
            ids |= {str(p) for p in (wk.get("points") or {})}
    return {"ids": ids, "seasons_read": found, "seasons_missing": missing}


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def dormant(board: dict, seasons=RECENT_SEASONS, root=None) -> dict:
    """Rows with no recent NFL activity that nothing else vouches for.

    Every exemption below exists because it is a way this could accuse a player
    who is genuinely on a 2026 roster. Being wrong in that direction is worse
    than missing a retiree: it would delete somebody real from a draft board.
    """
    sc = scored_ids(seasons, root)
    if not sc["seasons_read"]:
        return {"status": "unmeasured", "rows": [], "n": 0,
                "note": "no weekly points store for %s — an absence of evidence "
                        "here is not evidence of absence" % list(seasons)}

    rows = []
    for p in (board or {}).get("players") or []:
        if p.get("position") not in COVERED_POSITIONS:
            continue                                  # outside the store's reach
        if (_num(p.get("years_exp")) or 0) == 0:
            continue                                  # a rookie's blank is correct
        if str(p.get("player_id")) in sc["ids"]:
            continue                                  # played recently
        if p.get("adp_source") not in (None, "search_rank"):
            continue                                  # the market prices him
        if (_num(p.get("proj_mean")) or 0) > 0:
            continue                                  # somebody projects him
        rows.append(p)
    return {"status": "measured", "rows": rows, "n": len(rows),
            "seasons_read": sc["seasons_read"],
            "seasons_missing": sc["seasons_missing"],
            "note": "no scored week in %s; not a rookie; no market ADP; no "
                    "projection" % sc["seasons_read"]}


#: The surfaces a dormant row must never reach. Each is a place a number becomes
#: advice: a draftable rank, a positive surplus over replacement, or a position
#: inside the part of the board the tools treat as live.
def _reaches(p, relevant_board):
    hit = []
    if (_num(p.get("overall_rank")) or 10 ** 9) <= DEPTH:
        hit.append("overall_rank <= %d" % DEPTH)
    if (_num(p.get("vorp")) or 0) > 0:
        hit.append("vorp > 0")
    if relevant_board and (_num(p.get("adp")) or 10 ** 9) <= relevant_board:
        hit.append("adp <= %d (relevant board)" % relevant_board)
    return hit


def audit(board: dict, seasons=RECENT_SEASONS, root=None) -> dict:
    """Does anything with no recent NFL activity price a decision on this board?

    `ok` is three-state on purpose. False means a dormant row reached a decision
    surface. None means the stores could not be read, which is NOT a pass — the
    whole failure mode here is a check that could not look reporting clean.
    """
    d = dormant(board, seasons, root)
    prov = (((board or {}).get("provenance") or {}).get("adp") or {})
    relevant = _num(prov.get("relevant_board"))
    if d["status"] != "measured":
        return {"ok": None, "dormant": 0, "offenders": [], "status": d["status"],
                "note": d["note"]}

    offenders = []
    for p in d["rows"]:
        hit = _reaches(p, relevant)
        if hit:
            offenders.append({"player_id": p.get("player_id"), "name": p.get("name"),
                              "position": p.get("position"), "reaches": hit,
                              "overall_rank": p.get("overall_rank"),
                              "vorp": p.get("vorp"), "adp": p.get("adp")})
    return {"ok": not offenders, "dormant": d["n"], "offenders": offenders,
            "status": "measured", "relevant_board": relevant,
            "seasons_read": d["seasons_read"],
            "note": ("%d rows have not scored since %s and nothing else vouches "
                     "for them; %d reach a decision surface"
                     % (d["n"], d["seasons_read"], len(offenders)))}
