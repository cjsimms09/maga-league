# TERRITORY: A
"""THE REAL FFC-vs-FP COMPARISON — register 19/19b's re-run, on genuinely
different sources this time.

THE DEFECT THIS REPLACES: exp_fp_board_coverage.py named a map `ffc_rank`
that was built from the board's raw_adp — 334 of 338 sourced players were
`adp_source: fantasypros` at that commit, so "FFC vs FP" was FP against a
copy of itself, rho printed exactly 1.0000, and the verdict string read
any rho as "the swap MOVES picks". Same class as the ceiling constant: a
field correlated with its own copy, reported as a finding.

THE REAL SOURCES HERE, verified different by construction AND by control:
  FFC   external_source_prices.json, latest `source: "ffc"` row — a per-day
        capture of fantasyfootballcalculator's half-PPR 10-team ADP (OUR
        format), per-player, keyed by sleeper pid, before any merge.
  FP    the live board's raw_adp restricted to players whose adp_source is
        fantasypros — the anchor actually wired today.

CONTROLS (rule 3f — the exact signature of the old defect is a REFUSAL):
  * the two maps must DISAGREE somewhere (identical rank vectors on the
    shared population -> exit 1, "you are comparing a copy again");
  * Spearman rho == 1.0 to 4 decimals -> exit 1, same reason;
  * shared population under MIN_SHARED -> refuse, never a thin verdict.

Output: rho on the shared population, rho in Cory's pick window (ADP
27-160), the divergence profile (players moved >= ONE ROUND = 10 picks
between sources), and coverage counts — the inputs the anchor decision
actually needs. Decision itself recorded in the register/ROUTES, not
auto-made here.

Run: python3 draft/backtest/exp_real_ffc_vs_fp.py
Writes exp_real_ffc_vs_fp.json next to this file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MIN_SHARED = 100


def spearman(pairs):
    def rank(vals):
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        r = [0.0] * len(vals)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    xs = rank([a for a, b in pairs])
    ys = rank([b for a, b in pairs])
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = (sum((x - mx) ** 2 for x in xs)) ** 0.5
    dy = (sum((y - my) ** 2 for y in ys)) ** 0.5
    return num / (dx * dy) if dx and dy else None


def main() -> int:
    prices = json.loads((ROOT / "draft" / "data" / "external_source_prices.json").read_text())
    ffc_rows = [r for r in prices["series"] if r.get("source") == "ffc"]
    if not ffc_rows:
        print("REFUSED: no ffc capture rows exist")
        return 1
    ffc_row = max(ffc_rows, key=lambda r: r["observed_at"])
    ffc = {str(k): float(v) for k, v in ffc_row["rows"].items()}

    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    fp = {str(p["player_id"]): float(p["raw_adp"])
          for p in board["players"]
          if p.get("adp_source") == "fantasypros" and p.get("raw_adp")}

    names = {str(p["player_id"]): p.get("name") for p in board["players"]}
    shared = sorted(set(ffc) & set(fp), key=lambda p: ffc[p])
    if len(shared) < MIN_SHARED:
        print(f"REFUSED: shared population {len(shared)} < {MIN_SHARED}")
        return 1

    pairs = [(ffc[p], fp[p]) for p in shared]
    if [a for a, b in pairs] == [b for a, b in pairs]:
        print("REFUSED: the two maps are IDENTICAL on the shared population — "
              "this is the exp_fp_board_coverage defect again; check sources")
        return 1
    rho = spearman(pairs)
    if rho is not None and round(rho, 4) >= 1.0:
        print("REFUSED: rho == 1.0000 — the old defect's exact signature; a "
              "perfect correlation between independent ADP sources is not a "
              "finding, it is a copied input")
        return 1

    window = [p for p in shared if 27 <= fp[p] <= 160]
    rho_window = spearman([(ffc[p], fp[p]) for p in window]) if len(window) >= 30 else None

    movers = sorted(
        ({"pid": p, "name": names.get(p), "ffc": ffc[p], "fp": fp[p],
          "delta": round(fp[p] - ffc[p], 1)} for p in shared
         if abs(fp[p] - ffc[p]) >= 10),
        key=lambda m: -abs(m["delta"]))

    doc = {
        "_territory": "TERRITORY: A — exp_real_ffc_vs_fp.py (register 19/19b re-run)",
        "ffc_observed_at": ffc_row["observed_at"],
        "ffc_params": {k: ffc_row["params"].get(k) for k in ("format", "teams", "total_drafts")},
        "coverage": {"ffc": len(ffc), "fp": len(fp), "shared": len(shared)},
        "rho_shared": round(rho, 4),
        "rho_cory_window_27_160": round(rho_window, 4) if rho_window is not None else None,
        "n_window": len(window),
        "movers_ge_one_round": len(movers),
        "top_movers": movers[:20],
    }
    (HERE / "exp_real_ffc_vs_fp.json").write_text(json.dumps(doc, indent=1))
    print(f"rho shared({len(shared)}): {doc['rho_shared']}  "
          f"window({len(window)}): {doc['rho_cory_window_27_160']}  "
          f"movers>=1 round: {len(movers)}")
    for m in movers[:8]:
        print(f"  {m['name']}: FFC {m['ffc']} vs FP {m['fp']} ({m['delta']:+})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
