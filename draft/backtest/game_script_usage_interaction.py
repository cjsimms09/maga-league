#!/usr/bin/env python3
# TERRITORY: D
"""USAGE-CONDITIONED GAME SCRIPT — grading the interaction ROUTES asked for.

CORY, DIRECT (ROUTES.md, 2026-08-20): "we're taking into account game script
for our weekly projections (ie games with higher over under probably equate
to more fantasy points, so depending on that players average touches or other
stats we could maybe predict points in that game)." HALF of this already
ships: `weekly_own_projection.py`'s live `v1` arm tilts every player by his
TEAM's Vegas implied total, scaled by a POSITION-level constant `vg[pos]`.
What is NOT built, and what this file grades: does a bell-cow RB or a
25%-target-share WR benefit MORE from his team's implied total moving up than
a committee back or a 10%-share WR3 does, holding position constant?

PREREGISTERED, BEFORE ANY RUN, in `draft/GAME-SCRIPT-USAGE-PREREG-2026-08-20
.md` — the formula, the population, the correlation gate and the minimum
effect-size bar below are copied from that file, not invented here. Read it
first; this module's job is to compute exactly what it specifies.

REUSE, NOT REIMPLEMENTATION (Rule 11) — every piece below is imported or is a
thin call-site adapter, never a re-derivation of graded logic:
  * `weekly_own_projection.implied_from_vegas_store` — the EXACT team-implied-
    total arithmetic the live v1 arm uses (implied_home = total/2 + spread/2).
  * `weekly_own_projection.VG` — the graded per-position Vegas sensitivity,
    imported from `own_model_v5.V5_CONFIG`, never retyped.
  * `nflverse_usage.usage_shares` — the graded, tested prior-season
    target_share/opportunity_share computation, leak-guarded by its own
    `before_season` argument.
  * The `share = max(target_share, opportunity_share)` convention is
    `projections.player_variance`'s own bell-cow/committee definition,
    reused exactly rather than invented fresh for this study.

WHAT THIS FILE ADDS (the one genuinely new piece, per the prereg): the
`usage_multiplier` term, its population-relative normalization, and the
three-arm grading harness (no_tilt / v1_tilt / interaction) with its
correlation gate and pooled+per-fold MAE comparison.

THE ONE SUBSTITUTION, STATED PLAINLY (prereg S2, matching p151's own
precedent for stating a substitution loudly rather than burying it): no
historical `proj_ownmodel` (season-total own-model) snapshot exists for any
season 2021-2025 anywhere in this repo, so `v1`'s `proj_ownmodel/17` cannot be
literally reconstructed for a backtest. Every arm below uses the SAME
substitute baseline, `baseline_pg` = the player's own realized per-game
points in the PRIOR season (Y-1) — a genuinely non-leaky, preseason-available
number — so the comparison between arms stays apples-to-apples even though no
arm here claims to reproduce `own_v6`'s absolute numbers.

Zero-network: reads only committed files (component stats, weekly points,
the Vegas store).

Run: python3 draft/backtest/game_script_usage_interaction.py
     [--out draft/backtest/game_script_usage_interaction.json]
Test: python3 -m pytest draft/tests/test_game_script_usage_interaction.py -q
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

import nflverse_usage as U  # noqa: E402 — TERRITORY: C, imported not modified
from weekly_own_projection import implied_from_vegas_store, VG  # noqa: E402

POSITIONS = ("RB", "WR", "TE")  # QB scoped out — see prereg S1: no meaningful
                                 # within-position workload spectrum at QB.
TARGET_SEASONS = (2022, 2023, 2024, 2025)  # 2021 has no prior season on disk.
MIN_GAMES = 4          # reused from own_model_v5.MU_MIN_GAMES, not invented.
USAGE_MULT_CLIP = (0.0, 3.0)
TILT_SCALE = 1.0        # the champion v1 arm's own value.
MAE_BAR = 0.10           # prereg S4 — a stated minimum effect size.
CORR_GATE = 0.98         # prereg S4 — same discipline as every other arm.
FOLD_CONSISTENCY_MIN = 3  # of 4 folds must show a positive ΔMAE_vs_v1.

COMPONENT_PATH = ROOT / "backtest" / "component_stats_{season}.json"
POINTS_PATH = ROOT / "backtest" / "nflverse_weekly_points_{season}.json"
VEGAS_PATH = ROOT / "backtest" / "vegas_lines_2021_2026.json"


# ── loaders (thin, no computation) ──────────────────────────────────────────

def _load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def load_component(season: int) -> dict:
    return _load_json(Path(str(COMPONENT_PATH).format(season=season)))


def load_points(season: int) -> dict:
    return _load_json(Path(str(POINTS_PATH).format(season=season)))


def load_vegas() -> dict:
    return _load_json(VEGAS_PATH)


# ── prior-season inputs (share, baseline_pg), leak-guarded ─────────────────

def build_prior_weekly_rows(component_doc: dict, season: int) -> tuple[list, dict, dict]:
    """RB/WR/TE weekly rows in `nflverse_usage.usage_shares`'s vocabulary,
    plus per-pid position and games-played counted along the way (one pass,
    no re-reading the store). Column names are RENAMED at this call site
    (tgt->targets, rush_att->carries) — a translation, not a change to the
    component store or to nflverse_usage.py, the same class of call-site
    adapter `grade.py`'s `_WEEKLY_MAP` already uses for scoring keys."""
    rows: list = []
    pos_by_pid: dict = {}
    games_by_pid: dict = {}
    for wk in component_doc.get("weeks", []):
        for pid, r in wk.get("players", {}).items():
            pos = r.get("pos")
            if pos not in POSITIONS:
                continue
            rows.append({
                "player_id": pid, "season": season, "team": r.get("team"),
                "targets": r.get("tgt", 0), "carries": r.get("rush_att", 0),
            })
            pos_by_pid[pid] = pos
            games_by_pid[pid] = games_by_pid.get(pid, 0) + 1
    return rows, pos_by_pid, games_by_pid


def identity_crosswalk(rows: list) -> dict:
    """component_stats is already Sleeper-id-keyed at fetch time
    (fetch_component_stats.build_season's own gsis->sleeper join, upstream
    of this file) — so THIS call site's crosswalk is the identity map, not a
    shortcut. See prereg S1 for why that is correct rather than incomplete."""
    ids = {r["player_id"] for r in rows}
    return {i: i for i in ids}


def prior_season_ppg(points_doc: dict) -> dict:
    """{pid: mean weekly points} over weeks the player has a recorded row.
    Absence (bye/inactive/not on the store) is excluded from both the sum
    and the count, never scored as zero — the same convention every store
    in this repo uses."""
    totals: dict = {}
    counts: dict = {}
    for wk in points_doc.get("weeks", []):
        for pid, pts in wk.get("points", {}).items():
            totals[pid] = totals.get(pid, 0.0) + float(pts)
            counts[pid] = counts.get(pid, 0) + 1
    return {pid: totals[pid] / counts[pid] for pid in totals if counts[pid] >= MIN_GAMES}


def eligible_population(target_season: int) -> dict:
    """{pid: {"pos", "share", "baseline_pg"}} — the fold's Y-1-only inputs.
    A player must clear MIN_GAMES in Y-1 AND have a usage_shares() entry AND
    have a prior-season PPG. Every filter is Y-1-only; before_season=Y makes
    the leak guard an assertion, not a convention."""
    prior = target_season - 1
    comp_prior = load_component(prior)
    rows, pos_by_pid, games_by_pid = build_prior_weekly_rows(comp_prior, prior)
    cw = identity_crosswalk(rows)
    shares, usage_report = U.usage_shares(rows, prior, cw, before_season=target_season)
    ppg = prior_season_ppg(load_points(prior))

    pop: dict = {}
    for pid, g in games_by_pid.items():
        if g < MIN_GAMES or pid not in shares or pid not in ppg:
            continue
        pop[pid] = {
            "pos": pos_by_pid[pid],
            "share": max(shares[pid]["target_share"], shares[pid]["opportunity_share"]),
            "baseline_pg": ppg[pid],
        }
    return pop, usage_report


# ── delta(team, week) — the same reduction price_week() uses ───────────────

def week_deltas(vegas_doc: dict, season: int, week: int) -> tuple[dict, float | None]:
    implied = implied_from_vegas_store(vegas_doc, season, week)
    if not implied:
        return {}, None
    mean_imp = sum(implied.values()) / len(implied)
    deltas = {team: (v - mean_imp) / mean_imp for team, v in implied.items()}
    return deltas, mean_imp


# ── the three arms ───────────────────────────────────────────────────────

def usage_multiplier(share: float, pos_mean_share: float) -> float:
    if not pos_mean_share:
        return 1.0
    lo, hi = USAGE_MULT_CLIP
    return max(lo, min(hi, share / pos_mean_share))


def arm_predictions(baseline_pg: float, vg_pos: float, delta: float, mult: float) -> dict:
    return {
        "no_tilt": baseline_pg,
        "v1_tilt": baseline_pg * (1.0 + TILT_SCALE * vg_pos * delta),
        "interaction": baseline_pg * (1.0 + TILT_SCALE * vg_pos * delta * mult),
    }


# ── the fold-level grade ────────────────────────────────────────────────

def grade_fold(target_season: int) -> dict:
    pop, usage_report = eligible_population(target_season)
    if not pop:
        return {"season": target_season, "usable": False, "why": "no eligible population",
                "usage_report": usage_report}

    pos_shares: dict = {}
    for info in pop.values():
        pos_shares.setdefault(info["pos"], []).append(info["share"])
    pos_mean_share = {pos: mean(vs) for pos, vs in pos_shares.items()}

    comp_target = load_component(target_season)
    team_by_pid: dict = {}
    for wk in comp_target.get("weeks", []):
        for pid, r in wk.get("players", {}).items():
            team_by_pid.setdefault(pid, r.get("team"))  # first-seen team that season

    vegas_doc = load_vegas()
    pts_target = load_points(target_season)

    rows: list = []  # one row per graded player-week
    no_line_pw = 0
    total_pw = 0
    for wk in pts_target.get("weeks", []):
        week = wk.get("week")
        deltas, mean_imp = week_deltas(vegas_doc, target_season, week)
        for pid, actual in wk.get("points", {}).items():
            if pid not in pop:
                continue
            total_pw += 1
            team = team_by_pid.get(pid)
            if mean_imp is None or team not in deltas:
                no_line_pw += 1
                continue
            info = pop[pid]
            mult = usage_multiplier(info["share"], pos_mean_share[info["pos"]])
            preds = arm_predictions(info["baseline_pg"], VG[info["pos"]],
                                    deltas[team], mult)
            rows.append({
                "pid": pid, "pos": info["pos"], "week": week,
                "actual": float(actual), "usage_multiplier": mult,
                **{f"pred_{k}": v for k, v in preds.items()},
            })

    def mae(key: str) -> float:
        return mean(abs(r[key] - r["actual"]) for r in rows) if rows else float("nan")

    mae_no_tilt = mae("pred_no_tilt")
    mae_v1 = mae("pred_v1_tilt")
    mae_interaction = mae("pred_interaction")

    return {
        "season": target_season, "usable": True,
        "population": len(pop), "player_weeks_total": total_pw,
        "player_weeks_graded": len(rows), "player_weeks_no_line": no_line_pw,
        "pos_mean_share": pos_mean_share,
        "mae": {"no_tilt": mae_no_tilt, "v1_tilt": mae_v1, "interaction": mae_interaction},
        "delta_mae_vs_notilt": mae_no_tilt - mae_interaction,
        "delta_mae_vs_v1": mae_v1 - mae_interaction,
        "rows": rows,
        "usage_report": usage_report,
    }


def spearman(xs: list, ys: list) -> float:
    """Pure, dependency-free Spearman rank correlation (no scipy in this
    repo's runtime — every backtest module in draft/backtest computes its own
    the same way)."""
    n = len(xs)
    if n < 2:
        return float("nan")

    def ranks(vals):
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        r = [0.0] * len(vals)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg_rank = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg_rank
            i = j + 1
        return r

    rx, ry = ranks(xs), ranks(ys)
    mx, my = mean(rx), mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    denx = sum((a - mx) ** 2 for a in rx) ** 0.5
    deny = sum((b - my) ** 2 for b in ry) ** 0.5
    if denx == 0 or deny == 0:
        return float("nan")
    return num / (denx * deny)


def pooled_grade(fold_results: list) -> dict:
    usable = [f for f in fold_results if f["usable"]]
    all_rows = [r for f in usable for r in f["rows"]]
    n = len(all_rows)

    def pooled_mae(key: str) -> float:
        return mean(abs(r[key] - r["actual"]) for r in all_rows) if n else float("nan")

    mae_no_tilt = pooled_mae("pred_no_tilt")
    mae_v1 = pooled_mae("pred_v1_tilt")
    mae_interaction = pooled_mae("pred_interaction")

    corr_vs_v1 = spearman([r["pred_interaction"] for r in all_rows],
                          [r["pred_v1_tilt"] for r in all_rows])
    corr_vs_notilt = spearman([r["pred_interaction"] for r in all_rows],
                              [r["pred_no_tilt"] for r in all_rows])

    delta_vs_v1 = mae_v1 - mae_interaction
    delta_vs_notilt = mae_no_tilt - mae_interaction
    folds_positive_vs_v1 = sum(1 for f in usable if f["delta_mae_vs_v1"] > 0)

    gate_clears = (corr_vs_v1 < CORR_GATE) and (corr_vs_notilt < CORR_GATE)
    bar_clears = (
        delta_vs_v1 >= MAE_BAR
        and delta_vs_notilt >= MAE_BAR
        and folds_positive_vs_v1 >= FOLD_CONSISTENCY_MIN
        and gate_clears
    )

    return {
        "n_player_weeks": n,
        "n_folds_usable": len(usable),
        "mae": {"no_tilt": mae_no_tilt, "v1_tilt": mae_v1, "interaction": mae_interaction},
        "delta_mae_vs_v1": delta_vs_v1,
        "delta_mae_vs_notilt": delta_vs_notilt,
        "folds_positive_vs_v1": folds_positive_vs_v1,
        "folds_total": len(usable),
        "correlation_vs_v1_tilt": corr_vs_v1,
        "correlation_vs_no_tilt": corr_vs_notilt,
        "correlation_gate": CORR_GATE,
        "gate_clears": gate_clears,
        "mae_bar": MAE_BAR,
        "fold_consistency_min": FOLD_CONSISTENCY_MIN,
        "clears": bar_clears,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "game_script_usage_interaction.json"))
    args = ap.parse_args()

    fold_results = [grade_fold(y) for y in TARGET_SEASONS]
    pooled = pooled_grade(fold_results)

    # Rows are bulky (one per graded player-week) — keep them in the fold
    # detail but do not print them; the artifact carries the full population
    # for anyone who wants to re-slice it.
    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/"
                      "game_script_usage_interaction.py",
        "_note": ("Grades the usage-share x implied-team-delta interaction "
                  "arm preregistered in draft/GAME-SCRIPT-USAGE-PREREG-"
                  "2026-08-20.md against the live v1 position-only tilt and "
                  "an own_v6/no-tilt stand-in. RB/WR/TE only. baseline_pg "
                  "substitutes for proj_ownmodel/17 (no historical season-"
                  "total snapshot exists for 2021-2025 — stated in the "
                  "prereg, not hidden here)."),
        "prereg": "draft/GAME-SCRIPT-USAGE-PREREG-2026-08-20.md",
        "target_seasons": list(TARGET_SEASONS),
        "min_games": MIN_GAMES,
        "usage_mult_clip": list(USAGE_MULT_CLIP),
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
        print(f"  {f['season']}: MAE no_tilt={f['mae']['no_tilt']:.4f} "
             f"v1={f['mae']['v1_tilt']:.4f} interaction={f['mae']['interaction']:.4f} "
             f"dMAE_vs_v1={f['delta_mae_vs_v1']:+.4f} "
             f"dMAE_vs_notilt={f['delta_mae_vs_notilt']:+.4f} "
             f"(n={f['player_weeks_graded']}, no_line={f['player_weeks_no_line']})")
    print(f"  pooled: MAE no_tilt={pooled['mae']['no_tilt']:.4f} "
         f"v1={pooled['mae']['v1_tilt']:.4f} "
         f"interaction={pooled['mae']['interaction']:.4f}")
    print(f"  pooled dMAE_vs_v1={pooled['delta_mae_vs_v1']:+.4f} "
         f"(bar {MAE_BAR}, folds positive {pooled['folds_positive_vs_v1']}/"
         f"{pooled['folds_total']}, need >= {FOLD_CONSISTENCY_MIN})")
    print(f"  pooled dMAE_vs_notilt={pooled['delta_mae_vs_notilt']:+.4f} "
         f"(bar {MAE_BAR})")
    print(f"  correlation vs v1_tilt={pooled['correlation_vs_v1_tilt']:.4f}  "
         f"vs no_tilt={pooled['correlation_vs_no_tilt']:.4f}  "
         f"(gate < {CORR_GATE}, clears={pooled['gate_clears']})")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
