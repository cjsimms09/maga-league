#!/usr/bin/env python3
# TERRITORY: D
"""RED-ZONE/END-ZONE TARGET-QUALITY TILT — grading the arm ROUTES' ASK 2 asked for.

Relay, ROUTES.md 2026-08-20: "C's `target_quality.json` (red-zone/end-zone
usage 2021-25) is a genuinely new axis. Prereg a weekly arm (correlation
gate ≤0.98 vs own_v6 as always) before touching the data."

PREREGISTERED, BEFORE ANY RUN, in `draft/TARGET-QUALITY-PREREG-2026-08-21
.md` — the formula, the population, the correlation gate and the minimum
effect-size bar below are copied from that file, not invented here.

REUSE, NOT REIMPLEMENTATION (Rule 11):
  * `game_script_usage_interaction.load_component/load_points/prior_season_ppg`
    — the exact baseline_pg construction the sibling study already built and
    P286-graded; imported, not re-derived.
  * `game_script_usage_interaction.grade_fold` — called directly (not
    re-run's output re-parsed) to get the ALREADY-GRADED `interaction` arm's
    per-player-week predictions in memory, for the correlation gate this
    study's own prereg (S4) requires against that sibling arm. Its JSON
    artifact does not persist per-row predictions (a pre-existing gap in
    that file's own header comment, noted, not fixed here — out of scope).
  * `game_script_usage_interaction.spearman` — the same dependency-free rank
    correlation, not reimplemented a second time.

Zero-network: reads only committed files.

Run: python3 draft/backtest/target_quality_tilt.py
     [--out draft/backtest/target_quality_tilt.json]
Test: python3 -m pytest draft/tests/test_target_quality_tilt.py -q
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import game_script_usage_interaction as GSI  # noqa: E402 — TERRITORY: D, imported not modified

POSITIONS = ("RB", "WR", "TE")
TARGET_SEASONS = (2022, 2023, 2024, 2025)  # baseline_pg needs a Y-1 season.
MIN_GAMES = 4              # reused from own_model_v5.MU_MIN_GAMES via GSI.
MIN_PRIOR_WEEKS = 3        # prereg S2 — floor for a stable within-season rz_rate.
RZ_MULT_CLIP = (0.0, 3.0)
TILT_SCALE = 1.0
MAE_BAR = 0.10
CORR_GATE = 0.98
FOLD_CONSISTENCY_MIN = 3

TQ_PATH = ROOT / "backtest" / "target_quality.json"


def load_target_quality() -> dict:
    return json.loads(TQ_PATH.read_text())


def eligible_population(target_season: int) -> dict:
    """{pid: {"pos", "baseline_pg"}} — reuses GSI's own component/points
    loaders and prior_season_ppg exactly (Rule 11)."""
    prior = target_season - 1
    comp_prior = GSI.load_component(prior)
    pos_by_pid: dict = {}
    games_by_pid: dict = {}
    for wk in comp_prior.get("weeks", []):
        for pid, r in wk.get("players", {}).items():
            pos = r.get("pos")
            if pos not in POSITIONS:
                continue
            pos_by_pid[pid] = pos
            games_by_pid[pid] = games_by_pid.get(pid, 0) + 1

    ppg = GSI.prior_season_ppg(GSI.load_points(prior))

    pop: dict = {}
    for pid, g in games_by_pid.items():
        if g < MIN_GAMES or pid not in ppg:
            continue
        pop[pid] = {"pos": pos_by_pid[pid], "baseline_pg": ppg[pid]}
    return pop


def rz_opps_by_pid_week(tq_season_doc: dict, week: int) -> dict:
    """{pid: inside_10_carries + inside_10_targets} for one week. A pid
    absent from this week's dict (prereg S0) means 0, not missing — callers
    must default to 0 rather than skip, which this helper enforces by only
    ever returning entries that exist (the caller's own .get(pid, 0) below
    completes the contract)."""
    week_doc = tq_season_doc.get(str(week), {})
    return {pid: (rec.get("inside_10_carries", 0) or 0)
                + (rec.get("inside_10_targets", 0) or 0)
            for pid, rec in week_doc.items()}


def rz_rate_series(tq_season_doc: dict, pids: set, n_weeks: int = 18) -> dict:
    """{pid: {week: leak-free trailing mean of rz_opps over strictly-prior
    weeks this season}} — same 'update AFTER this week' rule
    lineup_edge_backtest.js uses, ported here rather than reinvented."""
    running_sum: dict = {}
    running_n: dict = {}
    out: dict = {pid: {} for pid in pids}
    for week in range(1, n_weeks + 1):
        week_opps = rz_opps_by_pid_week(tq_season_doc, week)
        for pid in pids:
            n = running_n.get(pid, 0)
            if n >= MIN_PRIOR_WEEKS:
                out[pid][week] = running_sum[pid] / n
            opp = week_opps.get(pid, 0)
            running_sum[pid] = running_sum.get(pid, 0) + opp
            running_n[pid] = n + 1
    return out


def rz_multiplier(rate: float, pos_mean_rate: float) -> float:
    if not pos_mean_rate:
        return 1.0
    lo, hi = RZ_MULT_CLIP
    return max(lo, min(hi, rate / pos_mean_rate))


def grade_fold(target_season: int) -> dict:
    pop = eligible_population(target_season)
    if not pop:
        return {"season": target_season, "usable": False, "why": "no eligible population"}

    tq = load_target_quality()
    tq_season_doc = tq.get("by_season", {}).get(str(target_season), {})
    rz_series = rz_rate_series(tq_season_doc, set(pop.keys()))

    pts_target = GSI.load_points(target_season)

    # GSI's own already-graded interaction predictions for THIS fold, keyed
    # (pid, week), for the correlation-gate cross-check against a sibling
    # arm the prereg requires (S4) — computed via the real graded code, not
    # re-derived.
    gsi_fold = GSI.grade_fold(target_season)
    gsi_pred_by_pid_week = {}
    if gsi_fold.get("usable"):
        for r in gsi_fold["rows"]:
            gsi_pred_by_pid_week[(r["pid"], r["week"])] = r["pred_interaction"]

    # position-mean rz_rate per week, computed from the population's own
    # trailing series (only weeks each player is actually eligible for).
    weekly_rates_by_pos: dict = {}
    for pid, info in pop.items():
        for week, rate in rz_series[pid].items():
            weekly_rates_by_pos.setdefault((info["pos"], week), []).append(rate)
    pos_mean_by_week = {k: mean(v) for k, v in weekly_rates_by_pos.items()}

    rows: list = []
    total_pw = 0
    no_rate_pw = 0
    for wk in pts_target.get("weeks", []):
        week = wk.get("week")
        for pid, actual in wk.get("points", {}).items():
            if pid not in pop:
                continue
            total_pw += 1
            rate = rz_series[pid].get(week)
            if rate is None:
                no_rate_pw += 1
                continue
            info = pop[pid]
            pos_mean = pos_mean_by_week.get((info["pos"], week), 0.0)
            mult = rz_multiplier(rate, pos_mean)
            pred_baseline = info["baseline_pg"]
            pred_rz_tilt = pred_baseline * (1.0 + TILT_SCALE * (mult - 1.0))
            rows.append({
                "pid": pid, "pos": info["pos"], "week": week,
                "actual": float(actual), "rz_rate": rate, "rz_multiplier": mult,
                "pred_baseline_pg": pred_baseline, "pred_rz_tilt": pred_rz_tilt,
                "pred_gsi_interaction": gsi_pred_by_pid_week.get((pid, week)),
            })

    def mae(key: str) -> float:
        return mean(abs(r[key] - r["actual"]) for r in rows) if rows else float("nan")

    mae_baseline = mae("pred_baseline_pg")
    mae_rz = mae("pred_rz_tilt")

    return {
        "season": target_season, "usable": True,
        "population": len(pop), "player_weeks_total": total_pw,
        "player_weeks_graded": len(rows), "player_weeks_no_rate": no_rate_pw,
        "mae": {"baseline_pg": mae_baseline, "rz_tilt": mae_rz},
        "delta_mae": mae_baseline - mae_rz,
        "rows": rows,
    }


def pooled_grade(fold_results: list) -> dict:
    usable = [f for f in fold_results if f["usable"]]
    all_rows = [r for f in usable for r in f["rows"]]
    n = len(all_rows)

    def pooled_mae(key: str) -> float:
        return mean(abs(r[key] - r["actual"]) for r in all_rows) if n else float("nan")

    mae_baseline = pooled_mae("pred_baseline_pg")
    mae_rz = pooled_mae("pred_rz_tilt")

    corr_vs_baseline = GSI.spearman([r["pred_rz_tilt"] for r in all_rows],
                                    [r["pred_baseline_pg"] for r in all_rows])
    gsi_rows = [r for r in all_rows if r["pred_gsi_interaction"] is not None]
    corr_vs_gsi = (
        GSI.spearman([r["pred_rz_tilt"] for r in gsi_rows],
                     [r["pred_gsi_interaction"] for r in gsi_rows])
        if gsi_rows else float("nan")
    )

    delta = mae_baseline - mae_rz
    folds_positive = sum(1 for f in usable if f["delta_mae"] > 0)

    gate_clears = (corr_vs_baseline < CORR_GATE) and (
        (corr_vs_gsi < CORR_GATE) if gsi_rows else True)
    bar_clears = (
        delta >= MAE_BAR
        and folds_positive >= FOLD_CONSISTENCY_MIN
        and gate_clears
    )

    return {
        "n_player_weeks": n,
        "n_folds_usable": len(usable),
        "mae": {"baseline_pg": mae_baseline, "rz_tilt": mae_rz},
        "delta_mae": delta,
        "folds_positive": folds_positive,
        "folds_total": len(usable),
        "correlation_vs_baseline": corr_vs_baseline,
        "correlation_vs_gsi_interaction": corr_vs_gsi,
        "gsi_overlap_player_weeks": len(gsi_rows),
        "correlation_gate": CORR_GATE,
        "gate_clears": gate_clears,
        "mae_bar": MAE_BAR,
        "fold_consistency_min": FOLD_CONSISTENCY_MIN,
        "clears": bar_clears,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "target_quality_tilt.json"))
    args = ap.parse_args()

    fold_results = [grade_fold(y) for y in TARGET_SEASONS]
    pooled = pooled_grade(fold_results)

    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/target_quality_tilt.py",
        "_note": ("Grades the red-zone/end-zone opportunity tilt preregistered "
                  "in draft/TARGET-QUALITY-PREREG-2026-08-21.md against a "
                  "baseline_pg-only stand-in and cross-checks correlation "
                  "against the already-graded P286 usage-interaction arm. "
                  "RB/WR/TE only."),
        "prereg": "draft/TARGET-QUALITY-PREREG-2026-08-21.md",
        "target_seasons": list(TARGET_SEASONS),
        "min_games": MIN_GAMES,
        "min_prior_weeks": MIN_PRIOR_WEEKS,
        "rz_mult_clip": list(RZ_MULT_CLIP),
        "tilt_scale": TILT_SCALE,
        "folds": [{k: v for k, v in f.items() if k != "rows"} for f in fold_results],
        "pooled": pooled,
    }
    Path(args.out).write_text(json.dumps(doc, indent=2, sort_keys=False))

    print(f"CLEARS: {pooled['clears']}")
    print(f"  n player-weeks: {pooled['n_player_weeks']}  folds usable: "
         f"{pooled['n_folds_usable']}/{len(TARGET_SEASONS)}")
    for f in fold_results:
        if not f["usable"]:
            print(f"  {f['season']}: UNUSABLE — {f.get('why')}")
            continue
        print(f"  {f['season']}: MAE baseline={f['mae']['baseline_pg']:.4f} "
             f"rz_tilt={f['mae']['rz_tilt']:.4f} dMAE={f['delta_mae']:+.4f} "
             f"(n={f['player_weeks_graded']}, no_rate={f['player_weeks_no_rate']})")
    print(f"  pooled: MAE baseline={pooled['mae']['baseline_pg']:.4f} "
         f"rz_tilt={pooled['mae']['rz_tilt']:.4f}")
    print(f"  pooled dMAE={pooled['delta_mae']:+.4f} (bar {MAE_BAR}, folds "
         f"positive {pooled['folds_positive']}/{pooled['folds_total']}, "
         f"need >= {FOLD_CONSISTENCY_MIN})")
    print(f"  corr vs baseline_pg={pooled['correlation_vs_baseline']:.4f}, "
         f"corr vs GSI interaction={pooled['correlation_vs_gsi_interaction']:.4f} "
         f"(n_overlap={pooled['gsi_overlap_player_weeks']}, gate < {CORR_GATE})")


if __name__ == "__main__":
    main()
