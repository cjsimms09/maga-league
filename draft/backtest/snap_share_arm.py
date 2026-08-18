# TERRITORY: D
"""SNAP-SHARE — does prior-season snap share predict next-season points beyond
prior-season points?

Preregistered in SNAP-SHARE-PREREG.md, committed first. Result:
snap_share_arm.json. Register 13.

RESEARCH ONLY. Reads committed stores, writes its own result. Nothing installs.

TWO THINGS THE LAST TWO STUDIES TAUGHT, BUILT IN RATHER THAN REMEMBERED:
  · the arm must beat naive_prev (carry-forward), not merely clear a null — the
    week-1 props arm beat own_v6 and lost to carry-forward;
  · collinearity with volume is the likely killer, so rho(snap_share, prior
    points) is measured and reported BEFORE the verdict is read. That is exactly
    how TPRR died (0.74-0.82 against targets).

Run: python3 draft/backtest/snap_share_arm.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
import sys                                        # noqa: E402
sys.path.insert(0, str(HERE))
from routes_tprr_study import (                   # noqa: E402
    spearman, partial_spearman, permutation_p95,
)

SEASONS = (2021, 2022, 2023, 2024, 2025)
TRANSITIONS = ((2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025))
MIN_WEEKS = 8
PERMUTATIONS = 400
SEED = 20260817


def snap_share(season: int) -> dict[str, float]:
    """{pid: mean weekly pct} over players with >= MIN_WEEKS rows. Absent stays
    absent — a player with too few weeks is excluded, never imputed."""
    doc = json.loads((HERE / f"snap_counts_{season}.json").read_text())
    acc: dict[str, list] = {}
    for wk in doc["weeks"].values():
        for pid, row in wk.items():
            if isinstance(row, dict) and row.get("pct") is not None:
                acc.setdefault(str(pid), []).append(float(row["pct"]))
    return {pid: sum(v) / len(v) for pid, v in acc.items() if len(v) >= MIN_WEEKS}


def season_points(season: int) -> dict[str, float]:
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    tot: dict[str, float] = {}
    for wk in doc["weeks"]:
        for pid, pts in wk["points"].items():
            tot[str(pid)] = tot.get(str(pid), 0.0) + float(pts)
    return tot


def main() -> dict:
    rng = random.Random(SEED)
    folds = {}
    for y0, y1 in TRANSITIONS:
        share0, pts0, pts1 = snap_share(y0), season_points(y0), season_points(y1)
        eligible = sorted(share0.keys() & pts0.keys())
        pids = [p for p in eligible if p in pts1]

        s0 = [share0[p] for p in pids]
        p0 = [pts0[p] for p in pids]
        p1 = [pts1[p] for p in pids]

        partial = partial_spearman(p1, s0, p0)
        p95 = permutation_p95(
            lambda idx: partial_spearman([p1[i] for i in idx], s0, p0),
            len(pids), rng)
        folds[f"{y0}->{y1}"] = {
            "population": {"snap_and_points_y0": len(eligible),
                           "also_in_points_y1": len(pids),
                           "lost_at_join": len(eligible) - len(pids)},
            # reported BEFORE the verdict, per the prereg: this is how TPRR died
            "collinearity_snapshare_vs_prior_points": round(spearman(s0, p0), 4),
            "partial_rho_snapshare_given_prior_points": round(partial, 4) if partial else None,
            "control_rho_next_points_vs_prior_points": round(spearman(p1, p0), 4),
            "raw_rho_next_points_vs_snapshare": round(spearman(p1, s0), 4),
            "null_p95": round(p95, 4) if p95 is not None else None,
            "beats_null_p95": (partial is not None and p95 is not None and partial > p95),
        }

    clears = all(f["partial_rho_snapshare_given_prior_points"] is not None
                 and f["partial_rho_snapshare_given_prior_points"] > 0
                 and f["beats_null_p95"] for f in folds.values())
    result = {
        "_territory": "TERRITORY: D — produced by draft/backtest/snap_share_arm.py",
        "preregistration": "draft/backtest/SNAP-SHARE-PREREG.md",
        "status": "graded",
        "min_weeks": MIN_WEEKS, "permutations": PERMUTATIONS, "seed": SEED,
        "folds": folds,
        "ship_rule": "partial rho > 0 AND beats null p95 in ALL FOUR folds",
        "clears": clears,
        "note": "control_rho_next_points_vs_prior_points IS naive_prev's ranking "
                "performance on the same population — the bar the prereg says a "
                "signal must clear, not just the permutation null.",
    }
    (HERE / "snap_share_arm.json").write_text(json.dumps(result, indent=1) + "\n")
    print(f"wrote {HERE / 'snap_share_arm.json'}")
    for k, f in folds.items():
        print(f"{k}  n={f['population']['also_in_points_y1']:4d} "
              f"lost={f['population']['lost_at_join']:3d}  "
              f"collinearity {f['collinearity_snapshare_vs_prior_points']:+.4f}  "
              f"partial {f['partial_rho_snapshare_given_prior_points']:+.4f}  "
              f"null {f['null_p95']:+.4f}  beats={f['beats_null_p95']}")
    print(f"CLEARS: {clears}")
    return result


if __name__ == "__main__":
    main()
