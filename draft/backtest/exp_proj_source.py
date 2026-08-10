#!/usr/bin/env python3
"""PROJECTION SOURCE — freeze FantasyPros 2026 projections + measure Sleeper-vs-FP divergence.

Cory's Q2: we grade ADP from three sources but have NEVER graded projections, and the Sleeper
number we lean on is leaked (in-season endpoint). This probe (CI/egress):
  1. fetches FP 2026 season projections, converts them with OUR scoring (score_stat_line — the
     SAME conversion Sleeper's baseline uses, so any gap is the source, not the math),
  2. crosswalks to Sleeper ids and freezes them into proj_series.json (source=fantasypros) —
     the clean preseason snapshot a retroactive fetch could never give,
  3. reports how differently Sleeper (the board's proj_baseline) and FP rank the SAME players,
     overall and at the top where Cory drafts — so "does the projection source even MOVE picks"
     is a number before the draft. The winner is graded against realized AFTER the season; this
     pre-draft half only answers agreement/divergence, never which is better.
Egress (CI). Installs nothing.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE.parent.parent / "public" / "draft_data.json"
PROJ_SERIES = HERE.parent / "data" / "proj_series.json"


def egress_main():   # pragma: no cover  (CI only)
    sys.path.insert(0, str(HERE.parent))
    sys.path.insert(0, str(HERE.parent.parent))
    import fantasypros_adp as FP
    import adp as ADP
    import sleeper_import as SL
    import proj_series as PS
    from scoring import score_stat_line
    import config_schema

    board = json.loads(BOARD.read_text())
    cfg = config_schema.load(HERE.parent / "config" / "league_config.json")
    scoring = cfg["scoring"]
    year = int(board.get("league", {}).get("season") or 2026)
    players = board.get("players", [])
    name_by_id = {str(p["player_id"]): p.get("name") for p in players}
    my_picks = set((board.get("pick_order") or {}).get("my_picks") or [])

    # Sleeper preseason projection = the board's proj_baseline (consensus -> our scoring, pre-adj)
    sleeper = {str(p["player_id"]): p["proj_baseline"] for p in players if p.get("proj_baseline")}

    # FantasyPros projections -> our scoring -> Sleeper ids
    text, url, diag = FP.fetch_projections(year)
    rows = FP.parse_projections(text) if text else []
    index = ADP.build_index(SL.fetch_players())
    fp = {}
    for r in rows:
        sid, _how = ADP.match_player(r, index)
        if not sid:
            continue
        pts = score_stat_line(r["stats"], scoring) if r.get("stats") else r.get("fp_fpts")
        if pts:
            fp[str(sid)] = round(float(pts), 2)

    # freeze FP into the snapshot archive (dedup by date+source)
    today = (board.get("built_at") or "")[:10] or "unknown"
    series = []
    if PROJ_SERIES.exists():
        try:
            series = (json.loads(PROJ_SERIES.read_text()).get("series") or [])
        except (ValueError, OSError):
            series = []
    if fp:
        series = PS.append_snapshot(series, today, "fantasypros", fp)
        PROJ_SERIES.write_text(json.dumps(
            {"_note": "Preseason projection snapshots (append-only, deduped by date+source). "
                      "Frozen for a CLEAN post-season grade. See draft/proj_series.py.",
             "series": series}, separators=(",", ":")))

    # divergence: how differently the two sources rank the shared players
    top150 = set(sorted(sleeper, key=lambda p: -sleeper[p])[:150])
    div_all = PS.divergence(sleeper, fp)
    div_top = PS.divergence({p: sleeper[p] for p in top150 if p in sleeper},
                            {p: fp[p] for p in top150 if p in fp})
    # name the biggest disagreements, flag which sit at Cory's picks
    board_pickno = {str(p["player_id"]): p.get("raw_adp") for p in players}
    named = [{"player": name_by_id.get(d["id"], d["id"]),
              "sleeper_rank": d["rank_a"], "fp_rank": d["rank_b"],
              "sleeper_pts": d["proj_a"], "fp_pts": d["proj_b"]}
             for d in (div_top.get("top_disagreements") or [])]

    out = {
        "experiment": "projection source — Sleeper vs FantasyPros divergence (pre-draft) + FP freeze",
        "year": year,
        "fp_rows_parsed": len(rows), "fp_matched": len(fp), "fp_url": url,
        "sleeper_players": len(sleeper),
        "divergence_overall": {"n": div_all["n"], "rank_corr": div_all["rank_corr"]},
        "divergence_top150": {"n": div_top["n"], "rank_corr": div_top["rank_corr"]},
        "biggest_disagreements_top150": named[:12],
        "fetch_diag": {k: diag.get(k) for k in ("api_ok", "bundle_key_found")} if diag else None,
        "verdict": (
            f"FP 2026 projections parsed {len(rows)}, matched {len(fp)} to the board. Sleeper-vs-FP "
            f"rank agreement: overall ρ={div_all['rank_corr']}, top-150 ρ={div_top['rank_corr']}. "
            + ("HIGH agreement -> the projection source barely moves picks; the board is settled on "
               "either. " if (div_top['rank_corr'] or 0) >= 0.9 else
               "MATERIAL divergence -> the source choice MOVES picks; worth grading after the season "
               "(both frozen now). ")
            + "Which source is BETTER is graded against realized AFTER 2026 — this is agreement only."
            if len(fp) >= 100 else
            f"FP projections NOT usable this run ({len(fp)} matched, {len(rows)} parsed) — "
            f"see fetch_diag/api_tried; iterate the endpoint. Sleeper freeze stands regardless."),
    }
    (HERE / "exp_proj_source.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
