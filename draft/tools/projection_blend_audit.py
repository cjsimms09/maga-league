"""IS THE BLENDED PROJECTION INSIDE ITS OWN SOURCES — AND IS IT EVEN-HANDED?

Cory's normalisation hunt: "ANYWHERE A QUANTITY IS COMPARED, RANKED, SUBTRACTED
OR THRESHOLDED AGAINST ANOTHER — ARE THEY THE SAME UNIT, THE SAME SCALE, THE
SAME HORIZON, AND THE SAME POPULATION?"

`proj_mean` is ranked ACROSS positions by everything downstream — VONA,
replacement, the composite. So it has to be built the same way for every
position. It is not.

A blend of two numbers should lie between them. 49% of them do not, and the
split is not random: QB is 0% outside, every skill position is 57-65%. The
difference is `opportunity_adj`, which is derived from target share and WOPR —
receiving metrics that DO NOT EXIST FOR QUARTERBACKS. 0 of 67 QBs carry one;
132 of 153 WRs do.

So skill players are blend-plus-adjustment and quarterbacks are blend, and the
two are then ranked against each other as if commensurable. THIS FILE DOES NOT
CLAIM THE ADJUSTMENT IS WRONG — it may well improve the projections it touches.
It claims the adjustment is applied to a SUBSET OF THE POPULATION and the
results are compared across the whole of it, with nothing normalising the gap.

Run: python draft/tools/projection_blend_audit.py
"""
from __future__ import annotations
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent


def main() -> int:
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    ps = [p for p in board["players"]
          if p.get("proj_sleeper") and p.get("proj_fantasypros") and p.get("proj_mean")]
    print(f"players carrying both sources and a blend: {len(ps)}\n")

    by_pos: dict[str, dict] = {}
    inside_adj, outside_adj = [], []
    for p in ps:
        s, f, m = float(p["proj_sleeper"]), float(p["proj_fantasypros"]), float(p["proj_mean"])
        lo, hi = min(s, f), max(s, f)
        oa = float(p.get("opportunity_adj") or 0)
        d = by_pos.setdefault(p["position"], {"n": 0, "out": 0, "above": 0, "ex": [], "adj": 0})
        d["n"] += 1
        if oa != 0:
            d["adj"] += 1
        if m > hi + 1e-6 or m < lo - 1e-6:
            d["out"] += 1
            outside_adj.append(oa)
            if m > hi:
                d["above"] += 1
                d["ex"].append(m - hi)
            else:
                d["ex"].append(lo - m)
        else:
            inside_adj.append(oa)

    total_out = sum(d["out"] for d in by_pos.values())
    print(f"blends OUTSIDE the range of their own two sources: {total_out} "
          f"({100 * total_out / len(ps):.1f}%)\n")
    print("  pos     n   outside      above both   carries opportunity_adj   median excess")
    for k in sorted(by_pos):
        d = by_pos[k]
        ex = statistics.median(d["ex"]) if d["ex"] else 0.0
        print(f"  {k:5}{d['n']:5}{d['out']:9} ({100 * d['out'] / d['n']:4.0f}%){d['above']:11}"
              f"{d['adj']:14}/{d['n']:<8}{ex:12.1f}")

    print(f"\n  median opportunity_adj, blends INSIDE their sources : "
          f"{statistics.median(inside_adj) if inside_adj else 0:.3f}")
    print(f"  median opportunity_adj, blends OUTSIDE their sources: "
          f"{statistics.median(outside_adj) if outside_adj else 0:.3f}")

    # RULE 10d: the check must be able to fail. If every blend were inside its
    # sources this prints nothing interesting and says so, rather than passing
    # silently and reading as a clean bill of health.
    if total_out == 0:
        print("\n  ::note:: every blend is inside its sources — this probe found nothing, "
              "which is a real null only if the sources above are genuinely populated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
