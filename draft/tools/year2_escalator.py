# TERRITORY: A
"""YEAR-2 ESCALATOR — candidate layer B of the league benchmark
(draft/audit/league_benchmark_2026-08-16.md). Built 2026-08-16.

WHY. The draft replay's mechanism list (§5 of
draft/audit/draft_replay_2025_vs_actual.md) named "the walk-forward
projections under-rank ascending WRs" — Olave, Pickens, London, JSN,
Chase Brown — as a place Cory's real picks repeatedly beat the model: a
recency-blended stats board prices last season, not trajectory. A year-2
player's projection is built from exactly one NFL season, so the model
cannot see the standard sophomore progression. This layer measures that
progression from the committed stores and tests the obvious correction.

THE FORM IS PREREGISTERED (audit doc committed before any replay grade):

  · cohort of transition S→S+1: NFL draft class S (committed store
    draft/backtest/nflverse_draft_picks.json, sleeper-mapped) with year-1
    scored total ≥ 50.0 points (below that, ratios are noise on a near-zero
    base). Undrafted rookies are not in the store and are therefore not in
    the fit — named, not hidden;
  · outcome: scored season totals (weeks 1-17) from the committed stores —
    weekly stores for seasons ≥ 2023, component stores under the frozen
    table for 2021/2022 (draft_replay_2025.season_totals_of, the
    parity-pinned substrate); a year-2 season with no scored rows is 0.0
    (busts and injuries count — that IS the progression base rate);
  · the DISTRIBUTION is reported per position per transition (n, mean and
    median individual ratio, ratio of sums) — the measurement Cory's
    question asked for, whatever the escalator's grade;
  · escalator for replay season Y pools transitions with S+1 ≤ Y−1
    (2023: 2021→22 only; 2024: adds 2022→23; 2025: adds 2023→24):
        m(pos) = clip( Σ year2 / Σ year1 , 1.00, 1.30 )
    over the pooled cohort; a position with pooled n < 5 keeps m = 1.0.
    The clip floor 1.00 means the layer only ever ESCALATES — it tests the
    "ascending year-2" hypothesis and nothing else; the ceiling 1.30 caps
    small-n blowups. Ratio of sums, not mean of ratios: one 5→80 season
    must not dominate the cell;
  · application in replay Y: every player on the walk-forward board whose
    NFL draft class is Y−1 gets projection × m(pos). Replacement levels
    are recomputed. Nothing else changes.

Walk-forward guard: fit uses only seasons ≤ Y−1; asserted here, traced by
the leakage test.

Run: python3 draft/tools/year2_escalator.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

from rookie_prior import SKILL, class_rows, load_store  # noqa: E402

# ── preregistered constants (mirrored verbatim in the audit doc) ─────────────
YEAR1_MIN_PTS = 50.0
CLIP_LO, CLIP_HI = 1.00, 1.30
MIN_POOL_N = 5


def _median(xs: list) -> float:
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def transition_distribution(s_class: int, store: dict | None = None) -> dict:
    """Year-1 (season S) → year-2 (season S+1) progression of NFL draft
    class S, per position. Pure measurement — reported whatever the grade."""
    import draft_replay_2025 as R

    store = store or load_store()
    y1_totals = R.season_totals_of(s_class)[0]
    y2_totals = R.season_totals_of(s_class + 1)[0]
    per_pos: dict[str, list] = {p: [] for p in SKILL}
    for r in class_rows(store, s_class):
        pid = r["sleeper_id"]
        if not pid:
            continue
        y1 = float(y1_totals.get(pid, 0.0))
        if y1 < YEAR1_MIN_PTS:
            continue
        per_pos[r["position"]].append(
            (pid, y1, float(y2_totals.get(pid, 0.0))))
    out = {}
    for pos in SKILL:
        rows = per_pos[pos]
        if not rows:
            out[pos] = {"n": 0}
            continue
        ratios = [y2 / y1 for _pid, y1, y2 in rows]
        out[pos] = {
            "n": len(rows),
            "sum_year1": round(sum(y1 for _p, y1, _y2 in rows), 2),
            "sum_year2": round(sum(y2 for _p, _y1, y2 in rows), 2),
            "ratio_of_sums": round(sum(y2 for _p, _y1, y2 in rows)
                                   / sum(y1 for _p, y1, _y2 in rows), 3),
            "mean_ratio": round(sum(ratios) / len(ratios), 3),
            "median_ratio": round(_median(ratios), 3),
        }
    return {"transition": f"{s_class}->{s_class + 1}", "per_pos": out}


def fit_escalator(replay_season: int, store: dict | None = None) -> dict:
    """m(pos) for replay season Y, pooled over transitions with S+1 ≤ Y−1."""
    import draft_replay_2025 as R

    store = store or load_store()
    s_classes = [s for s in (2021, 2022, 2023, 2024)
                 if s + 1 <= replay_season - 1]
    assert s_classes and all(s + 1 < replay_season for s in s_classes), (
        "walk-forward violation: a fit transition touches the replay season")

    pooled: dict[str, list] = {p: [] for p in SKILL}
    for s in s_classes:
        y1_totals = R.season_totals_of(s)[0]
        y2_totals = R.season_totals_of(s + 1)[0]
        for r in class_rows(store, s):
            pid = r["sleeper_id"]
            if not pid:
                continue
            y1 = float(y1_totals.get(pid, 0.0))
            if y1 < YEAR1_MIN_PTS:
                continue
            pooled[r["position"]].append((y1, float(y2_totals.get(pid, 0.0))))

    factors = {}
    for pos in SKILL:
        rows = pooled[pos]
        if len(rows) < MIN_POOL_N:
            factors[pos] = {"m": 1.0, "n": len(rows), "reason": "n<5"}
            continue
        raw = sum(y2 for _y1, y2 in rows) / sum(y1 for y1, _y2 in rows)
        factors[pos] = {"m": round(min(max(raw, CLIP_LO), CLIP_HI), 3),
                        "raw_ratio_of_sums": round(raw, 3), "n": len(rows)}
    return {"replay_season": replay_season,
            "fit_transitions": [f"{s}->{s + 1}" for s in s_classes],
            "factors": factors}


def year2_overlay(replay_season: int, baseline_proj: dict,
                  positions: dict, store: dict | None = None,
                  fit: dict | None = None) -> dict:
    """{pid: escalated_proj} for board players whose NFL draft class is
    Y−1. Only pids already on the walk-forward board are touched."""
    store = store or load_store()
    fit = fit or fit_escalator(replay_season, store)
    out = {}
    for r in class_rows(store, replay_season - 1):
        pid = r["sleeper_id"]
        if not pid or pid not in baseline_proj:
            continue
        pos = positions.get(pid, r["position"])
        m = fit["factors"].get(pos, {"m": 1.0})["m"]
        if m != 1.0:
            out[pid] = round(baseline_proj[pid] * m, 4)
    return out


def main() -> None:
    store = load_store()
    for s in (2021, 2022, 2023, 2024):
        d = transition_distribution(s, store)
        print(d["transition"])
        for pos, v in d["per_pos"].items():
            if v["n"]:
                print(f"  {pos}: n={v['n']} ratio_of_sums="
                      f"{v['ratio_of_sums']} median={v['median_ratio']}")
    for y in (2023, 2024, 2025):
        fit = fit_escalator(y, store)
        print(f"replay {y} ({fit['fit_transitions']}): "
              + " ".join(f"{p}={v['m']}" for p, v in fit["factors"].items()))


if __name__ == "__main__":
    main()
