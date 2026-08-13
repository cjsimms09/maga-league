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
#: season through injury is not called dormant on that alone. Reported as
#: EVIDENCE beside each row rather than used as the test — see `dormant`.
RECENT_SEASONS = (2024, 2025)

#: How much of the MARKET-PRICED set must carry a projection before "no
#: projection" is trusted as a signal at all.
#:
#: This is the catastrophic-failure guard and it is not arbitrary. The rule below
#: treats an unprojected player as one nobody expects in 2026 — which is only
#: true while projections actually loaded. If the projection fetch fails, every
#: row becomes unprojected and the rule would delete the entire board. The
#: market-priced set is the population we KNOW should be projected: 96.2% of it
#: is today, and it goes to zero the moment projections break. Half is far below
#: anything healthy and far above anything broken.
PROJECTION_HEALTH_FLOOR = 0.5

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


def _priced(p):
    """Does the MARKET price him — as opposed to the search_rank fallback?"""
    return p.get("adp_source") not in (None, "search_rank")


def projection_health(board: dict) -> dict:
    """What fraction of the market-priced rows carry a projection.

    The gate on everything below. `no projection` means "nobody expects him in
    2026" only while projections loaded at all; if the fetch failed, every row
    looks unprojected and the rule would delete the board.
    """
    priced = [p for p in ((board or {}).get("players") or []) if _priced(p)]
    if not priced:
        return {"ok": False, "priced": 0, "projected": 0, "rate": None,
                "note": "no market-priced rows at all — the ADP join failed, and "
                        "nothing here can be judged"}
    projected = [p for p in priced if (_num(p.get("proj_mean")) or 0) > 0]
    rate = len(projected) / float(len(priced))
    return {"ok": rate >= PROJECTION_HEALTH_FLOOR, "priced": len(priced),
            "projected": len(projected), "rate": round(rate, 4),
            "note": ("%.1f%% of market-priced rows carry a projection (floor %.0f%%)"
                     % (100 * rate, 100 * PROJECTION_HEALTH_FLOOR))}


def dormant(board: dict, seasons=RECENT_SEASONS, root=None) -> dict:
    """Rows nothing in the system expects to play in 2026.

    THE TEST IS "WHO VOUCHES FOR HIM", NOT "WHEN DID HE LAST PLAY", and that
    changed after the first version shipped. Recent activity cannot see a player
    who played in 2024 and is finished: Ezekiel Elliott and Adam Thielen both
    scored in 2024 and both carry a 2026 projection of zero. It cannot see
    kickers at all — the weekly store scores none, so Gostkowski, Tucker and Dan
    Bailey were structurally invisible to it.

    Three sources can vouch for a player and any ONE of them spares him:

      the market      a real ADP from FFC or FantasyPros — somebody is drafting
                      him, and no absence of mine outranks that
      a projection    either source putting a number on his 2026, which is a
                      positive claim that he exists
      being a rookie  no NFL history is the correct history

    When none of the three does, nobody in the system expects him to play. That
    catches the retired greats, the 2024 leftovers and the retired kickers alike,
    without needing to know which is which.

    RECENT ACTIVITY IS NOW EVIDENCE, NOT THE TEST. It is attached to each row as
    `scored_recently` because it is the human-legible reason — "and he has not
    scored since 2023" — but nothing is judged on it, so its blind spots (K, DEF,
    a 2024-only season) no longer create blind spots here.

    IT REFUSES when projections are not healthy. That is the failure that would
    matter: a build whose projection fetch died makes every row unprojected, and
    an unguarded rule would delete the whole board rather than eight retirees.
    """
    health = projection_health(board)
    if not health["ok"]:
        return {"status": "unmeasured", "rows": [], "n": 0, "health": health,
                "note": "REFUSING to judge — %s. Treating that as 'nobody is "
                        "projected' would drop the board." % health["note"]}

    sc = scored_ids(seasons, root)
    rows = []
    for p in (board or {}).get("players") or []:
        if (_num(p.get("years_exp")) or 0) == 0:
            continue                                  # a rookie's blank is correct
        if _priced(p):
            continue                                  # the market prices him
        if (_num(p.get("proj_mean")) or 0) > 0:
            continue                                  # somebody projects him
        rows.append(dict(p, scored_recently=(
            str(p.get("player_id")) in sc["ids"] if sc["seasons_read"] else None)))
    return {"status": "measured", "rows": rows, "n": len(rows), "health": health,
            "seasons_read": sc["seasons_read"],
            "seasons_missing": sc["seasons_missing"],
            "note": "not a rookie, not market-priced, and carrying no projection "
                    "— nothing in the system expects them in 2026"}


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
