#!/usr/bin/env python3
"""MFL LIVE PROBE — is CURRENT-SEASON (2026) MFL ADP retrievable at our format, and
what would change on the board if we ranked by it instead of FFC?

The source grade proved MFL orders realized value better than FFC in both graded
seasons. But the live board still ranks by FFC, and the sandbox proxy blocks
myfantasyleague.com, so 2026 retrievability could only be answered in CI. Cory:
"if current MFL ADP is not available for 2026, tell me immediately — a finding we
cannot follow is worth nothing."

This runs in CI (open egress). It:
  1. fetches 2026 MFL adp + players (mfl_adp params: PPR, 12-team),
  2. crosswalks to OUR board's sleeper ids via adp.build_index / match_player,
  3. reports: MFL players returned, how many crosswalked, coverage of our draftable
     pool, and the biggest FFC-vs-MFL rank DISAGREEMENTS (what would move if we swap).
Writes mfl_live_probe.json. Does NOT change the live board — that's the follow-on
wiring once Cory sees the diff. Read-only, reversible, honest about coverage.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def probe(year=2026, board_path=None):   # pragma: no cover  (egress, CI only)
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(HERE.parent))          # draft/ — adp.py, sleeper_import.py
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import exp_source_grade as SG
    import mfl_adp as MFL
    import adp as ADP
    import sleeper_import as SL

    board_path = board_path or (HERE.parent.parent / "public" / "draft_data.json")
    board = json.loads(Path(board_path).read_text())
    pool = [p for p in board.get("players", []) if (p.get("proj_mean") or 0) > 0]

    def ffc_adp(p):
        return p.get("adjusted_adp") or p.get("raw_adp") or p.get("adp") or 9999.0
    ffc_by_id = {str(p["player_id"]): ffc_adp(p) for p in pool}
    name_by_id = {str(p["player_id"]): p.get("name") for p in pool}

    adp_json, players_json = SG._fetch_mfl(year)
    out = {"year": year, "retrievable": False, "mfl_rows": 0, "crosswalked": 0,
           "pool_size": len(pool), "pool_coverage": 0.0, "top_disagreements": [],
           "note": ""}
    if not adp_json or not players_json:
        out["note"] = (f"MFL {year} ADP NOT retrievable from CI (fetch returned nothing). "
                       "The historical archive worked for 2023/24; if current-season is blocked "
                       "we CANNOT follow the source-grade finding live — say so now, not on the 21st.")
        (HERE / "mfl_live_probe.json").write_text(json.dumps(out, indent=2))
        print(json.dumps({k: out[k] for k in ("year", "retrievable", "note")}, indent=2))
        return 0

    rows = MFL.parse(adp_json, players_json)
    out["mfl_rows"] = len(rows)
    index = ADP.build_index(SL.fetch_players())
    mfl_by_id = {}
    for r in rows:
        sid, _how = ADP.match_player(r, index)
        if sid:
            mfl_by_id[str(sid)] = r["adp"]
    out["retrievable"] = len(rows) > 50
    out["crosswalked"] = len(mfl_by_id)

    # coverage of OUR draftable pool + rank disagreements (what would move on a swap)
    common = [pid for pid in ffc_by_id if pid in mfl_by_id]
    out["pool_coverage"] = round(len(common) / max(1, len(pool)), 3)
    ffc_rank = {pid: i + 1 for i, pid in enumerate(sorted(common, key=lambda p: ffc_by_id[p]))}
    mfl_rank = {pid: i + 1 for i, pid in enumerate(sorted(common, key=lambda p: mfl_by_id[p]))}
    diffs = sorted(common, key=lambda p: -abs(ffc_rank[p] - mfl_rank[p]))[:25]
    out["top_disagreements"] = [
        {"player": name_by_id.get(pid), "ffc_adp": round(ffc_by_id[pid], 1),
         "mfl_adp": round(mfl_by_id[pid], 1), "ffc_rank": ffc_rank[pid], "mfl_rank": mfl_rank[pid],
         "rank_move": mfl_rank[pid] - ffc_rank[pid]}      # negative = MFL ranks him HIGHER
        for pid in diffs]

    # #2 + #4 (Cory): the edge only matters where Cory DRAFTS. Movement + coverage by
    # rank-band, computed over the FULL FFC ordering (not just crosswalked), so the
    # uncovered 28% shows up as a coverage hole in its band rather than vanishing.
    all_ffc_rank = {pid: i + 1 for i, pid in enumerate(sorted(ffc_by_id, key=lambda p: ffc_by_id[p]))}
    bands = [("top50", 1, 50), ("r51_100", 51, 100), ("r101_130", 101, 130),
             ("r131_200", 131, 200), ("deep200plus", 201, 10 ** 9)]
    band_stats = {}
    for name, lo, hi in bands:
        ids = [pid for pid in ffc_by_id if lo <= all_ffc_rank[pid] <= hi]
        covered = [pid for pid in ids if pid in mfl_by_id]
        moves = [abs(ffc_rank[pid] - mfl_rank[pid]) for pid in covered]
        band_stats[name] = {
            "players": len(ids), "mfl_covered": len(covered),
            "coverage": round(len(covered) / max(1, len(ids)), 2),
            "mean_abs_rank_move": round(sum(moves) / len(moves), 1) if moves else None,
            "median_abs_rank_move": round(sorted(moves)[len(moves) // 2], 1) if moves else None,
        }
    out["movement_by_band"] = band_stats
    # the exact picks Cory owns first (34/41/54): what sits at those FFC ranks and where MFL puts it
    at_picks = {}
    for pk in (34, 41, 54):
        pid = next((p for p, r in all_ffc_rank.items() if r == pk), None)
        if pid:
            at_picks[str(pk)] = {"player": name_by_id.get(pid), "ffc_rank": pk,
                                 "mfl_rank": mfl_rank.get(pid), "has_mfl": pid in mfl_by_id,
                                 "rank_move": (mfl_rank[pid] - pk) if pid in mfl_by_id else None}
    out["at_my_picks"] = at_picks
    # #4 fallback: uncovered players keep their FFC adp (the anchor never leaves a hole);
    # count how many uncovered sit inside the draftable top-200.
    uncovered_top200 = [pid for pid in ffc_by_id if pid not in mfl_by_id and all_ffc_rank[pid] <= 200]
    out["uncovered_in_top200"] = len(uncovered_top200)
    out["fallback_rule"] = ("uncovered players (no MFL number) KEEP their FFC adp — a swap blends "
                            "MFL where present, FFC elsewhere; nobody is dropped or mis-priced to a "
                            "guess. Report counts so a coverage hole in the draftable range is visible.")
    out["note"] = ("RETRIEVABLE — 2026 MFL ADP is live at our format. Coverage + the biggest "
                   "FFC-vs-MFL disagreements are the preview of what swapping the anchor moves. "
                   "Wiring MFL as the live anchor is the follow-on (build.py adp seam).") \
        if out["retrievable"] else \
        (f"MFL {year} returned only {len(rows)} rows / {len(mfl_by_id)} crosswalked — too thin to "
         "trust as the live anchor; treat as NOT usable and report it.")
    (HERE / "mfl_live_probe.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"year": year, "retrievable": out["retrievable"], "mfl_rows": out["mfl_rows"],
                      "crosswalked": out["crosswalked"], "pool_coverage": out["pool_coverage"],
                      "note": out["note"]}, indent=2))
    print("\nTop FFC-vs-MFL disagreements (rank_move<0 = MFL ranks him higher):")
    for d in out["top_disagreements"][:12]:
        print(f"  {(d['player'] or '?'):22s} FFC r{d['ffc_rank']:>3} (adp {d['ffc_adp']:>5}) "
              f"MFL r{d['mfl_rank']:>3} (adp {d['mfl_adp']:>5})  move {d['rank_move']:+d}")
    return 0


if __name__ == "__main__":   # pragma: no cover
    yr = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else 2026
    raise SystemExit(probe(yr))
