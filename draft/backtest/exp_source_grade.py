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


def _fetch_mfl(year, teams=12, timeout=30):   # pragma: no cover  (egress, CI only)
    """MFL adp + players export for one year (JSON). Returns (adp_json, players_json)
    or (None, None) on failure — a season that 404s is skipped, not fatal."""
    import urllib.request
    ua = {"User-Agent": "Mozilla/5.0 mfga-source-grade"}
    def get(url):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "ignore"))
        except Exception as e:
            print(f"  MFL {year} fetch skip: {type(e).__name__}"); return None
    base = f"https://api.myfantasyleague.com/{year}/export"
    adp = get(base + f"?TYPE=adp&PERIOD=DRAFT&IS_PPR=1&IS_KEEPER=N&IS_MOCK=-1&INJURED=-1"
              f"&CUTOFF=5&FCOUNT={teams}&JSON=1")
    players = get(base + "?TYPE=players&DETAILS=1&JSON=1")
    return adp, players


def egress_main():   # pragma: no cover  (CI only)
    """Consume exp36_picks.json (FFC adp + realized + meta, per season) and add MFL via
    the SAME crosswalk exp36 uses, then compare per season. FantasyPros joins once its
    CSV parser lands. Writes exp_source_grade.json."""
    sys.path.insert(0, str(HERE.parent))          # draft/ — where adp.py + sleeper_import.py live
    sys.path.insert(0, str(HERE.parent.parent))   # repo root (matches exp36's resolution)
    import mfl_adp as MFL
    import adp as ADP
    import sleeper_import as SL
    picks_path = HERE / "exp36_picks.json"
    if not picks_path.exists():
        print("exp36_picks.json missing — run exp36 first (same job)"); return 0
    picks = (json.loads(picks_path.read_text()).get("picks")) or []
    index = ADP.build_index(SL.fetch_players())

    per_season, seasons = {}, sorted({p["season"] for p in picks if p.get("season")})
    for yr in seasons:
        rows = [p for p in picks if p.get("season") == yr]
        realized = {p["player_id"]: p["realized"] for p in rows if p.get("realized") is not None}
        meta = {p["player_id"]: {"position": p["position"], "round": p["round"]} for p in rows}
        adp_ffc = {p["player_id"]: p["adp"] for p in rows if p.get("adp") is not None}
        adp_json, players_json = _fetch_mfl(yr)
        adp_mfl = {}
        if adp_json and players_json:
            for r in MFL.parse(adp_json, players_json):
                sid, _how = ADP.match_player(r, index)
                if sid and str(sid) in realized:
                    adp_mfl[str(sid)] = r["adp"]
        sources = {"FFC": adp_ffc}
        if len(adp_mfl) >= 20:
            sources["MFL"] = adp_mfl
        else:
            print(f"  {yr}: MFL matched only {len(adp_mfl)} — excluded (thin/unreachable)")
        per_season[yr] = {"n_matched_mfl": len(adp_mfl),
                          **compare_sources(realized, meta, sources)}

    # pooled headline: across seasons, how often does each source win a region, and
    # does the composite beat its best member in most seasons?
    wins = {}
    comp_beats = 0
    for yr, res in per_season.items():
        for _region, w in res["per_region_winner"].items():
            wins[w["winner"]] = wins.get(w["winner"], 0) + 1
        comp_beats += 1 if res.get("composite_beats_best_member") else 0
    out = {"experiment": "source grade — FFC vs MFL (+FantasyPros pending), per season",
           "seasons": seasons, "per_season": per_season,
           "pooled_region_wins": wins,
           "composite_beat_best_in_n_seasons": comp_beats,
           "caveat": "points-reliability (Spearman) like exp36; MFL is full-PPR/12-team, "
                     "compared by RANK so scale/format offset cancels in the head-to-head. "
                     "FantasyPros joins when its CSV parser lands. B0-per-source dollars is "
                     "the bridge follow-on. No install — picks the board the keeper-need rule ranks by."}
    (HERE / "exp_source_grade.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"seasons": seasons, "pooled_region_wins": wins,
                      "composite_beat_best_in_n_seasons": comp_beats}, indent=2))
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
