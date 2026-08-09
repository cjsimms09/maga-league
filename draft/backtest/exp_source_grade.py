#!/usr/bin/env python3
"""SOURCE GRADE — which ADP board does the keeper-need rule follow? (Cory's #3)

The rule (EXP-KEEPER-B0) recommends the best-ADP player within need — so the BOARD it
ranks by is the load-bearing input. B0 was graded on FFC. Now that MFL (5,011 drafts)
and FantasyPros are reachable (adp_sources_probe.json), grade each source the way
exp36 graded FFC — Spearman(-adp, realized) per (round-band x position) — and test
whether a COMPOSITE (mean rank across sources) beats its best single member. Prove
the winner beats its best member or use the single best source and say so.

PURE core here (compare_sources): given each source's adp-by-player and the shared
realized outcomes, it returns per-region which source orders value best and whether
the composite wins. The egress that FETCHES the boards (FFC via adp.py, MFL via
mfl_adp.py, FantasyPros via its CSV) runs in CI. Unit-tested in test_source_grade.py.

Reads in POINTS-reliability (Spearman), exactly like exp36 — the robust quantity;
per-player dollars aren't clean. The money arm is B0-per-source through the bridge
(a follow-on CI step). No install; a reliability surface that picks the board.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from lab_projections import spearman   # noqa: E402  reused, unit-tested

ROUND_BANDS = [("r1-3", 1, 3), ("r4-7", 4, 7), ("r8-11", 8, 11), ("r12+", 12, 99)]
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
CELL_FLOOR = 8


def _band(rnd):
    for name, lo, hi in ROUND_BANDS:
        if rnd is not None and lo <= rnd <= hi:
            return name
    return None


def _cell_rho(rows):
    """Spearman(-adp, realized) for a cell; None if thin. Higher = orders value better."""
    r = [x for x in rows if x.get("adp") is not None and x.get("realized") is not None]
    if len(r) < CELL_FLOOR:
        return None, len(r)
    return round(spearman([-x["adp"] for x in r], [x["realized"] for x in r]), 4), len(r)


def _rows_for(source_pids, adp_of_source, realized, meta):
    """Build gradeable rows for one source: {position, round, adp, realized} per pid."""
    out = []
    for pid in source_pids:
        if pid not in realized or pid not in meta:
            continue
        out.append({"player_id": pid, "position": meta[pid]["position"],
                    "round": meta[pid]["round"], "adp": adp_of_source[pid],
                    "realized": realized[pid]})
    return out


def _composite_adp(adp_by_source):
    """Composite = mean of a player's ADP RANK across the sources that carry him
    (rank so scales/lengths differ harmlessly). Only pids in >=2 sources."""
    ranks = {}
    for src, adp in adp_by_source.items():
        ordered = sorted(adp, key=lambda p: adp[p])
        for i, pid in enumerate(ordered):
            ranks.setdefault(pid, []).append(i + 1)
    return {pid: sum(rs) / len(rs) for pid, rs in ranks.items() if len(rs) >= 2}


def _surface(rows):
    """Per (band x position) Spearman + n. Also the n-weighted mean rho over ranked cells."""
    cells, num, den = {}, 0.0, 0
    for name, _lo, _hi in ROUND_BANDS:
        cells[name] = {}
        for pos in POSITIONS:
            sub = [r for r in rows if _band(r["round"]) == name and r["position"] == pos]
            rho, n = _cell_rho(sub)
            cells[name][pos] = {"rho": rho, "n": n}
            if rho is not None:
                num += rho * n
                den += n
    return {"cells": cells, "weighted_rho": (round(num / den, 4) if den else None),
            "ranked_n": den}


def compare_sources(realized, meta, adp_by_source):
    """realized: {pid: value}; meta: {pid: {position, round}}; adp_by_source: {src: {pid: adp}}.
    Returns per-source surfaces, the composite surface, per-region winner, and whether
    the composite beats its best single member (n-weighted)."""
    surfaces = {}
    for src, adp in adp_by_source.items():
        surfaces[src] = _surface(_rows_for(list(adp.keys()), adp, realized, meta))
    comp_adp = _composite_adp(adp_by_source)
    surfaces["composite"] = _surface(_rows_for(list(comp_adp.keys()), comp_adp, realized, meta))

    members = [s for s in adp_by_source]
    # per-region winner among single members (highest rho, ranked cells only)
    per_region = {}
    for name, _lo, _hi in ROUND_BANDS:
        for pos in POSITIONS:
            best_src, best_rho = None, None
            for s in members:
                rho = surfaces[s]["cells"][name][pos]["rho"]
                if rho is not None and (best_rho is None or rho > best_rho):
                    best_src, best_rho = s, rho
            if best_src is not None:
                per_region[name + "|" + pos] = {"winner": best_src, "rho": best_rho}
    best_member = max(members, key=lambda s: (surfaces[s]["weighted_rho"] or -1))
    comp_rho = surfaces["composite"]["weighted_rho"]
    best_rho = surfaces[best_member]["weighted_rho"]
    return {
        "surfaces": surfaces,
        "best_single_source": best_member,
        "best_single_weighted_rho": best_rho,
        "composite_weighted_rho": comp_rho,
        "composite_beats_best_member": bool(comp_rho is not None and best_rho is not None
                                            and comp_rho > best_rho),
        "per_region_winner": per_region,
        "verdict": ("use the composite" if (comp_rho is not None and best_rho is not None
                    and comp_rho > best_rho) else "use " + best_member + " alone"),
    }


if __name__ == "__main__":   # pragma: no cover
    # Egress main (CI): build realized + meta from exp36's spine, adp per source from
    # FFC (adp.py) + MFL (mfl_adp.py) [+ FantasyPros when its CSV parser lands], then
    # compare. Kept thin; the heavy joins live in exp36 which this imports.
    print("exp_source_grade: pure core. Egress main runs in CI (fetches FFC+MFL+FP).")
