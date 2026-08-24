# TERRITORY: D
"""P340 — do ACQUISITION skill and CONVERSION skill come apart across owners?

The relay asked for a per-owner lineup-cost study as "the trade scanner's
targeting input -- an owner who ACQUIRES well but CONVERTS badly is holding
value they can't use, which is exactly who you trade with".

BOTH HALVES ALREADY EXIST and neither has ever been consumed:
  * draft_pick_vs_random.json  -> by_owner.mean_pct       (ACQUISITION)
  * start_sit_vs_random.json   -> by_owner.pts_left_per_week (CONVERSION)
Each is already a Getty Test 3 measurement against a constructed null (random
legal picks; random legal lineups), so this adds NO new estimator. It computes
the relationship, which is the only thing left that the repo cannot answer.

CONTROLS (Rule 3e/3f) -- a "no correlation" result is exactly what a broken join
would print, so the join is proven before the number is believed:
  C1 OWNER-SET AGREEMENT. Both tables must cover the SAME ten owners. A silent
     partial join would drop owners and shrink an already tiny n.
  C2 SPEARMAN ON A KNOWN INPUT. The estimator must return exactly +1.0 on a
     perfectly monotone pair and -1.0 on its reverse. A hand-rolled rank
     correlation that is subtly wrong would otherwise read as "no relationship".
  C3 THE QUADRANT RULE MUST BE ABLE TO FIND NOBODY. Run it on a fabricated
     population where acquisition and conversion are perfectly aligned; the
     acquires-well/converts-badly quadrant must come back EMPTY.
Each exits non-zero on failure.

STATED LIMIT, before any number: n = 10. This cannot distinguish a moderate
correlation from zero, and the row says so.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent


def _ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def spearman(xs, ys):
    rx, ry = _ranks(xs), _ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5
    dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else None


def quadrant(owners, acq, conv):
    """acquires-well (acq above median) AND converts-badly (pts_left above median)."""
    ma = sorted(acq)[len(acq) // 2]
    mc = sorted(conv)[len(conv) // 2]
    return [o for o, a, c in zip(owners, acq, conv) if a > ma and c > mc]


def main() -> dict:
    A = json.loads((HERE / "draft_pick_vs_random.json").read_text())["by_owner"]
    C = json.loads((HERE / "start_sit_vs_random.json").read_text())["by_owner"]

    # ── C1 ──────────────────────────────────────────────────────────────────
    if set(A) != set(C):
        print(f"CONTROL C1 FAILED — owner sets differ: acq-only {sorted(set(A)-set(C))}, "
              f"conv-only {sorted(set(C)-set(A))}", file=sys.stderr)
        sys.exit(2)
    # ── C2 ──────────────────────────────────────────────────────────────────
    if abs(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]) - 1.0) > 1e-12 or \
       abs(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]) + 1.0) > 1e-12:
        print("CONTROL C2 FAILED — spearman does not return +/-1 on monotone input",
              file=sys.stderr)
        sys.exit(2)
    # ── C3 ──────────────────────────────────────────────────────────────────
    aligned = quadrant(list("abcd"), [0.9, 0.8, 0.7, 0.6], [10.0, 11.0, 12.0, 13.0])
    if aligned:
        print(f"CONTROL C3 FAILED — quadrant found {aligned} in a perfectly aligned "
              "population; the rule cannot report an empty quadrant", file=sys.stderr)
        sys.exit(2)

    owners = sorted(A)
    acq = [A[o]["mean_pct"] for o in owners]
    conv = [C[o]["pts_left_per_week"] for o in owners]
    rho = spearman(acq, conv)
    targets = quadrant(owners, acq, conv)
    rows = sorted(
        ({"owner": o, "acquisition_pct": A[o]["mean_pct"],
          "pts_left_per_week": C[o]["pts_left_per_week"],
          "conversion_pct": C[o]["mean_pct"],
          "trade_target": o in targets} for o in owners),
        key=lambda r: (-r["acquisition_pct"], -r["pts_left_per_week"]))
    return {
        "_territory": "TERRITORY: D",
        "_note": ("P340 -- acquisition (draft_pick_vs_random) crossed with conversion "
                  "(start_sit_vs_random). No new estimator; both inputs are existing "
                  "Getty Test 3 scores. Written by owner_acquire_convert_cross.py."),
        "n_owners": len(owners),
        "spearman_acquisition_vs_points_left": round(rho, 4),
        "primary_bar": "abs(rho) < 0.5 -> skills are separable",
        "separable_by_the_bar_alone": abs(rho) < 0.5,
        # THE BOUNDARY CLAUSE, applied rather than left in prose. P340's own
        # power note says a result near the bar is "could not tell, never
        # separability" -- with n=10 the CI is ~1.2 wide, so anything inside
        # 0.15 of the bar is inside the noise and must not be read as a pass.
        "verdict": ("SEPARABLE" if abs(rho) < 0.35 else
                    ("NOT SEPARABLE" if abs(rho) > 0.65 else
                     "COULD NOT TELL -- rho is within noise of the 0.5 bar at n=10")),
        "trade_targets": targets,
        "controls": {"C1_owner_sets_match": True,
                     "C2_spearman_monotone_check": True,
                     "C3_quadrant_can_be_empty": True},
        "power_limit": ("n=10; a Spearman CI here is roughly 1.2 wide, so this cannot "
                        "distinguish a moderate correlation from zero. A boundary "
                        "result is 'could not tell', not separability."),
        "table": rows,
    }


if __name__ == "__main__":
    out = main()
    (HERE / "owner_acquire_convert_cross.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
