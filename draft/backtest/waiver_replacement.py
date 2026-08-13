# TERRITORY: C
"""EMPIRICAL WAIVER REPLACEMENT — the bench term, from 1,091 real transactions.

Item 3 of A's ingest brief. The bench equation currently prices a slot against the
"best undrafted player". A named that an UPPER bound and was right: nobody gets the
best undrafted player, because ten managers are bidding and the good ones are gone by
Wednesday.

WHAT THIS IS, STATED BEFORE ANY NUMBER. This is the REALIZED-ACQUISITION level —
what a manager in this league actually added, and what that player then scored in
that same week.

IT IS NOT A BOUND ON best-undrafted, AND I CLAIMED IT WAS. The reasoning looked
airtight: the best available player is at least as good as the one somebody chose, so
realized must sit below. A measured it on 2026-08-13 and two positions go the other
way — QB 1.17x and WR 1.40x as predicted, but RB 0.61x and TE 0.72x inverted.

The reason is that they are not two estimates of one quantity. Best-undrafted prices
a STATIC leftover set fixed at the draft; this prices a set that REFRESHES every week.
A back who emerges in week 6 was never in the undrafted pool to be counted, and at RB
and TE that churn is large enough to reverse the comparison outright.

So the direction claim is deleted rather than softened, and what remains is what was
measured. Pairing the two numbers is still the right instinct — they are just not a
bracket.

THE DATA. `league_history.seasons[].transactions` is a DICT KEYED BY WEEK, not a
list — iterating it yields week strings, which is the same shape trap `_series_of`
exists for. 1,091 rows across 2023-2025, of which:

    ~26% are `status: "failed"`   a claim somebody LOST
    ~40% are `type: "free_agent"` no bid, but genuinely gettable
    6 are  `type: "trade"`        never on waivers at all

Only complete waiver/free-agent adds count. Counting a failed claim would put players
nobody could get into the pool of what was gettable — precisely the overstatement this
module exists to replace, reintroduced one layer down.

AND `adds` IS A MAP {player_id: roster_id}, not a single id, so a multi-add
transaction yields several acquisitions. Defences arrive as TEAM CODES (`{"GB": 6}`)
where every other row carries a numeric id; requiring a numeric id would silently
delete the position with the busiest waiver churn.
"""
from __future__ import annotations

from statistics import median

#: Below this many acquisitions a cell reports a status rather than a number. A
#: median of one reads exactly like a median of forty to anything consuming it.
MIN_N = 5

#: The rows that represent a player actually arriving on a roster off the wire.
ACQUIRING_TYPES = ("waiver", "free_agent")


def _def_position(pid):
    """Sleeper keys a defence by TEAM ABBREVIATION where every other add is a
    numeric id, so a non-numeric id in `adds` is a defence and nothing else."""
    return "DEF" if pid and not str(pid).isdigit() else None


def _ceil_idx(q, n):
    """Index of the nearest-rank q-quantile in a sorted list of length n."""
    import math
    return max(0, min(n - 1, math.ceil(q * (n - 1))))


def _season_node(history, season):
    for s in (history or {}).get("seasons") or []:
        if str(s.get("season")) == str(season):
            return s
    return None


def acquisitions(history, season) -> list:
    """Every completed waiver / free-agent add for one season.

    Returns `[{week, player_id, roster_id, type, bid}]`. A failed claim is not an
    acquisition and a trade is not a waiver; both are excluded here and counted in
    `report()` so the exclusion is visible rather than silent.
    """
    node = _season_node(history, season)
    tx_by_week = (node or {}).get("transactions") or {}
    out = []
    for wk, rows in (tx_by_week or {}).items():
        try:
            week = int(wk)
        except (TypeError, ValueError):
            continue
        for r in (rows or []):
            if r.get("type") not in ACQUIRING_TYPES:
                continue
            if r.get("status") != "complete":
                continue
            # `adds` is a MAP. One transaction can bring in more than one player,
            # and reading a single key loses the rest without a trace.
            for pid, roster in (r.get("adds") or {}).items():
                out.append({"week": week, "player_id": str(pid),
                            "roster_id": roster, "type": r.get("type"),
                            "bid": r.get("waiver_bid")})
    out.sort(key=lambda a: (a["week"], a["player_id"]))
    return out


def report(history, season) -> dict:
    """What the season's transaction log contains, with every exclusion counted."""
    node = _season_node(history, season)
    tx_by_week = (node or {}).get("transactions") or {}
    rows = [r for v in (tx_by_week or {}).values() for r in (v or [])]
    acq = acquisitions(history, season)
    return {
        "season": str(season), "rows": len(rows),
        "complete": sum(1 for r in rows
                        if r.get("status") == "complete"
                        and r.get("type") in ACQUIRING_TYPES),
        "failed": sum(1 for r in rows if r.get("status") == "failed"),
        "trades": sum(1 for r in rows if r.get("type") == "trade"),
        "acquisitions": len(acq),
        "weeks": sorted({a["week"] for a in acq}),
    }


def replacement(history, season, weekly_points: dict, positions: dict, *,
                min_n=MIN_N) -> tuple:
    """`(cells, report)` — the realized-acquisition shelf per (position, week).

    `weekly_points` is `{week: {player_id: points}}` — the shape
    `grade.weekly_points_table` already returns, and what
    `nflverse_weekly_store.append_week` stores.

    THE JOIN IS TO THE SAME WEEK THE PLAYER WAS ADDED. A week-3 claim is made to
    start him in week 3; joining to week 2 would report the score that MOTIVATED the
    add rather than the one it delivered, which is the most flattering error
    available here and would look like a great waiver wire every time.

    A player with NO ROW that week is ABSENT and counted, never scored 0.0 — a
    stashed rookie or an IR add would otherwise drag the shelf down with players
    nobody started. A player who PLAYED and scored 0.0 is kept, because that is
    most of the shelf and the honest waiver add is often a dud.
    """
    acq = acquisitions(history, season)
    buckets, unscored, unpositioned, def_adds, def_unscorable = {}, 0, 0, 0, 0

    for a in acq:
        pos = positions.get(a["player_id"]) or _def_position(a["player_id"])
        if pos == "DEF":
            # A DEFENCE, NAMED RATHER THAN LOST. Measured 2026-08-13: 207 of 764
            # acquisitions fail the nflverse position join and ALL 207 are team
            # codes — not one numeric id fails. Leaving them in `unpositioned`
            # makes 27% of the sample read as a broken crosswalk instead of what
            # it is: nflverse weekly is player-level OFFENCE and carries no
            # defensive scoring, so these are unscorable from this source.
            def_adds += 1
            row = (weekly_points or {}).get(a["week"]) or {}
            if a["player_id"] not in row:
                def_unscorable += 1
                continue
        elif not pos:
            unpositioned += 1
            continue
        row = (weekly_points or {}).get(a["week"]) or {}
        if a["player_id"] not in row:
            unscored += 1
            continue
        buckets.setdefault((pos, a["week"]), []).append(float(row[a["player_id"]]))

    cells = {}
    for key, pts in buckets.items():
        vals = sorted(pts)
        n = len(vals)
        if n < int(min_n):
            cells[key] = {"n": n, "status": "unmeasurable", "points": vals,
                          "median": None, "p75": None, "best": None,
                          "basis_kind": "realized_acquisition",
                          "basis": "only %d acquisition(s); min_n is %d" % (n, min_n)}
            continue
        cells[key] = {
            "n": n, "status": "measured", "points": vals,
            "median": round(float(median(vals)), 3),
            # Nearest-rank p75, stated rather than inherited: the smallest observed
            # value at or above three quarters of the way through the sorted list.
            # Samples here are small (a position-week may hold five adds), so the
            # interpolation method is a real choice and is written down.
            "p75": round(float(vals[_ceil_idx(0.75, n)]), 3),
            "best": round(float(vals[-1]), 3),
            # THE LABEL STATES WHAT THIS IS, NOT HOW IT COMPARES.
            #
            # It said `bound: "lower"` until A measured the comparison on
            # 2026-08-13: realized-acquisition against best-undrafted is QB 1.17x
            # and WR 1.40x — the direction I claimed — but RB 0.61x and TE 0.72x,
            # the opposite. They do not bracket, because they are not two estimates
            # of one quantity: best-undrafted is a preseason projection of a STATIC
            # leftover set, and this is a realized pick from a set that REFRESHES
            # every week of the season. A back who emerges in week 6 was never in
            # the undrafted pool at all.
            #
            # So the direction claim is gone rather than relabelled. What survives
            # is what was actually measured: this is the realized-acquisition level.
            "basis_kind": "realized_acquisition",
            "basis": "%d realized acquisitions" % n,
        }

    rep = dict(report(history, season))
    rep.update({
        "unscored": unscored, "unpositioned": unpositioned,
        "def_adds": def_adds, "def_unscorable": def_unscorable,
        "cells": len(cells),
        "cells_measured": sum(1 for c in cells.values() if c["status"] == "measured"),
        "min_n": int(min_n),
        "basis_note": "REALIZED-ACQUISITION LEVEL: what managers actually took off "
                      "the wire, and what that player then scored that week. It is "
                      "NOT a bound on best-undrafted in either direction — measured "
                      "2026-08-13, QB and WR run below it (1.17x, 1.40x) while RB "
                      "and TE run above (0.61x, 0.72x). The two are not estimates of "
                      "one quantity: best-undrafted prices a STATIC leftover set "
                      "before the season, this prices a set that REFRESHES weekly, "
                      "and a back who emerges in week 6 was never in the undrafted "
                      "pool at all.",
    })
    return cells, rep
