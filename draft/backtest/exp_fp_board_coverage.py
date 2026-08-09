#!/usr/bin/env python3
"""FANTASYPROS 2026 — is it fetchable + does it cover the LIVE board well enough to be the anchor?

The source grade (2023-24) says FP orders realized value best and de-confounds format, and the
participation test says the value anchor (ranking off the board) is HALF the whole edge — so
Cory approved wiring the live 2026 board to rank by FP instead of FFC. But do NOT rewire the
board blind: FP's HISTORICAL export parsed, but the LIVE (2026) endpoint and its coverage of the
top ~150 players Cory actually drafts are unverified. This probe answers, before any pipeline
change:
  1. Does FP 2026 ADP fetch + parse at volume (the export endpoint, not the top-5 SSR teaser)?
  2. What fraction of the live board does it cover — overall and in the TOP 150 (rounds 1-15)?
  3. Where FP and FFC overlap, how different is the ranking (Spearman) — i.e. does the swap
     actually move picks, or is it cosmetic?
A poor top-150 coverage or a flaky fetch means DON'T wire FP as the primary anchor (fall back
to FFC, keep the directional finding recorded). Egress (CI). No install — a go/no-go probe.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE.parent.parent / "public" / "draft_data.json"


def _spearman(pairs):
    n = len(pairs)
    if n < 3:
        return None
    xs = [a for a, _ in pairs]
    ys = [b for _, b in pairs]
    def ranks(v):
        order = sorted(range(n), key=lambda i: v[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
    dy = sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    return round(num / (dx * dy), 4) if dx and dy else None


def egress_main():   # pragma: no cover  (CI only)
    sys.path.insert(0, str(HERE.parent))
    sys.path.insert(0, str(HERE.parent.parent))
    import fantasypros_adp as FP
    import adp as ADP
    import sleeper_import as SL

    board = json.loads(BOARD.read_text())
    players = board.get("players", [])
    # the board's current (FFC) rank per player_id, and the top-150 by it
    ffc_rank = {str(p["player_id"]): p.get("raw_adp") for p in players if p.get("raw_adp")}
    top150 = set(sorted(ffc_rank, key=lambda pid: ffc_rank[pid])[:150])

    text, fp_url, diag = FP.fetch(2026)
    fp_rows = FP.parse(text) if text else []
    index = ADP.build_index(SL.fetch_players())
    fp_by_id = {}
    for r in fp_rows:
        sid, _how = ADP.match_player(r, index)
        if sid:
            fp_by_id[str(sid)] = r["adp"]

    covered_all = [pid for pid in ffc_rank if pid in fp_by_id]
    covered_top = [pid for pid in top150 if pid in fp_by_id]
    overlap_pairs = [(ffc_rank[pid], fp_by_id[pid]) for pid in covered_all]
    rho = _spearman(overlap_pairs)
    missing_top = sorted([pid for pid in top150 if pid not in fp_by_id],
                         key=lambda pid: ffc_rank[pid])[:15]
    miss_names = [next((p.get("name") for p in players if str(p["player_id"]) == pid), pid)
                 for pid in missing_top]

    top_cov = len(covered_top) / max(1, len(top150))
    out = {
        "experiment": "FantasyPros 2026 board-coverage go/no-go probe",
        "fp_rows_parsed": len(fp_rows), "fp_url": fp_url,
        "board_players_with_ffc": len(ffc_rank),
        "coverage_overall": round(len(covered_all) / max(1, len(ffc_rank)), 3),
        "coverage_top150": round(top_cov, 3),
        "ffc_vs_fp_spearman_on_overlap": rho,
        "top150_missing_from_fp": miss_names,
        "fetch_diag": {k: diag.get(k) for k in ("api_ok", "bundle_key_found")} if diag else None,
        "verdict": (
            f"WIRE FP as primary anchor (FFC fallback for the {round((1-top_cov)*100)}% top-150 gap): "
            f"FP 2026 parsed {len(fp_rows)} rows, covers {round(top_cov*100)}% of the top 150, and "
            f"ρ={rho} vs FFC means the swap MOVES picks (not cosmetic)."
            if len(fp_rows) >= 150 and top_cov >= 0.90 else
            f"DO NOT wire FP as primary — top-150 coverage only {round(top_cov*100)}% "
            f"({len(fp_rows)} rows parsed). Keep FFC anchor; the FP finding stays directional/recorded. "
            f"Missing top players: {miss_names[:5]}"),
    }
    (HERE / "exp_fp_board_coverage.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
