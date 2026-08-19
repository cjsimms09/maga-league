# TERRITORY: A
"""V7 candidates C4 (RB offseason context) and C6 (QB-context repricing for
receivers), graded one-at-a-time on top of own_v6 through the SHARED
two-fold harness — V7-CANDIDATE-PREREG §4 + the C6 routing order executed.
This is V7 RUN THREE: run one was source-delta residuals, run two was
prior-usage/efficiency (replicated null, 0/3 folds); this run grades the
two committed STRUCTURED stores C built, on the harness P64/P81 name.

THE RECIPE IS C1's, DELIBERATELY — transition-ratio bucket factors, not a
new fitting frame: for y->y+1 transitions ending at or before max(priors),
each RB/receiver with >= MIN_GAMES games in BOTH seasons and > 20 pts in
year one contributes ratio pts_{y+1}/pts_y to the bucket its OFFSEASON
feature (as-of week 1 of y+1, from the committed store) places it in.
Median per bucket, MIN_N floor, MEAN-NORMALIZED per position over the
players actually adjusted — the arm adds the feature's SHAPE, never a
level shift; v6's level is already graded. Every fit excludes transitions
touching the graded season (C1's leak rule verbatim).

  C4 buckets (RB only, rb_offseason_features.json):
    rank      player_depth_rank: 1 / 2 / 3+
    change    team_change: stayed / moved (null -> unadjusted, factor 1.0)
    arrivals  notable_arrivals: 0 / 1+ (null -> unadjusted)
    The SHIPPED arm is the product of the three normalized factors; each
    table is ALSO applied alone (Amendment 3's one-at-a-time ablation) so
    a package result is attributable.
  C6 buckets (WR+TE, qb_context_receiver_features.json):
    attached_qb_ppg_prior terciles WITHIN position, edges computed from
    FIT-transition data only and reused unchanged on the graded season
    (edges from the graded year would be a peek). Null QB context (rookie
    or first-year starter, per the store's own definition) -> factor 1.0.

BLIND-PREDICTION BARS, declared here before the first number (both P-rows
filed 08-18, before the stores' first graded numbers existed):

  P64 — "C4 improves RB mid-board (ranks 13-36) more than RB top-12."
    TRUE iff on BOTH folds, C4's MAE improvement over base (base MAE minus
    arm MAE, positive = better) within RB board ranks 13-36 BY BASE v6
    ORDERING strictly exceeds its improvement within ranks 1-12.
  P81 — "C6 improves TE more than WR."
    FALSE if C6's improvement over base is NOT strictly larger at TE than
    at WR on BOTH Spearman and MAE, on BOTH folds (the row's own wording).
  D-NULL OBLIGATION (the C6 routing order): per-position Pearson
    correlation of per-player errors, arm vs base — an arm > 0.98
    correlated with the champion is a costume, reported beside any result.

SHIPS-IF: unchanged — §3's bar via the shared verdict(): >= 1 position
improves on BOTH families, none degrades beyond noise, on the primary
fold, replicated on the secondary. Cory's A11 pre-authorization applies
to that bar and no other.

Folds: primary graded 2025 (C4 fit 2021->22/22->23/23->24; C6 fit
2022->23/23->24 — the QB store starts at 2022); secondary graded 2024
(C4 fit 2021->22/22->23; C6 fit 2022->23 ONLY, a one-transition fit,
declared here rather than discovered).

Display-safe: writes v7_candidate_grade_c4c6.json, touches nothing Cory
drafts from. Run: python3 draft/backtest/v7_candidate_grade_c4c6.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from model_accuracy_backtest import season_totals, positions_record  # noqa: E402
from model_accuracy_grade import grade  # noqa: E402
from own_model_v2 import board_ages  # noqa: E402
from v7_candidate_grade import (  # noqa: E402
    GRADED_SEASON, MIN_GAMES, MIN_N, POSITIONS, PRIOR_SEASONS,
    RECENCY_WEIGHTS, _weekly_totals_games, build_stack, make_blend, verdict)

OUT = HERE / "v7_candidate_grade_c4c6.json"
RB_STORE = HERE / "rb_offseason_features.json"
QB_STORE = HERE / "qb_context_receiver_features.json"

C4_FIT = {2025: ((2021, 2022), (2022, 2023), (2023, 2024)),
          2024: ((2021, 2022), (2022, 2023))}
C6_FIT = {2025: ((2022, 2023), (2023, 2024)),
          2024: ((2022, 2023),)}
RECEIVERS = ("WR", "TE")
MIN_PTS_Y1 = 20


def _store_by_season(path):
    rows = json.loads(path.read_text())["rows"]
    by = {}
    for r in rows:
        by.setdefault(int(r["season"]), {})[str(r["player_id"])] = r
    return by


def _c4_bucket(row, table):
    if table == "rank":
        r = row.get("player_depth_rank")
        return None if r is None else ("1" if r == 1 else "2" if r == 2 else "3+")
    if table == "change":
        c = row.get("team_change")
        return None if c is None else ("moved" if c else "stayed")
    if table == "arrivals":
        a = row.get("notable_arrivals")
        return None if a is None else ("0" if a == 0 else "1+")
    raise ValueError(table)


def _ratio_pairs(transitions):
    """[(pid, y2, ratio)] over players clearing C1's participation floors."""
    out = []
    for y1, y2 in transitions:
        t1, g1 = _weekly_totals_games(y1)
        t2, g2 = _weekly_totals_games(y2)
        for pid, v1 in t1.items():
            if (g1.get(pid, 0) >= MIN_GAMES and g2.get(pid, 0) >= MIN_GAMES
                    and v1 > MIN_PTS_Y1 and pid in t2):
                out.append((pid, y2, t2[pid] / v1))
    return out


def c4_fit_tables(transitions, positions):
    store = _store_by_season(RB_STORE)
    cells = {t: {} for t in ("rank", "change", "arrivals")}
    for pid, y2, ratio in _ratio_pairs(transitions):
        if positions.get(pid) != "RB":
            continue
        row = store.get(y2, {}).get(pid)
        if row is None:
            continue
        for t in cells:
            b = _c4_bucket(row, t)
            if b is not None:
                cells[t].setdefault(b, []).append(ratio)
    tables, ns = {}, {}
    for t, by in cells.items():
        tables[t] = {b: round(median(v), 4) for b, v in by.items()
                     if len(v) >= MIN_N}
        ns[t] = {b: len(v) for b, v in by.items()}
    return tables, ns


def c6_fit_tables(transitions, positions):
    """Per-position tercile edges from FIT data + median ratio per tercile."""
    store = _store_by_season(QB_STORE)
    vals, cells = {}, {}
    pairs = []
    for pid, y2, ratio in _ratio_pairs(transitions):
        pos = positions.get(pid)
        if pos not in RECEIVERS:
            continue
        row = store.get(y2, {}).get(pid)
        ppg = row.get("attached_qb_ppg_prior") if row else None
        if ppg is None:
            continue
        vals.setdefault(pos, []).append(float(ppg))
        pairs.append((pos, float(ppg), ratio))
    edges = {}
    for pos, v in vals.items():
        s = sorted(v)
        edges[pos] = (s[len(s) // 3], s[(2 * len(s)) // 3])
    for pos, ppg, ratio in pairs:
        lo, hi = edges[pos]
        b = "low" if ppg <= lo else "high" if ppg > hi else "mid"
        cells.setdefault(pos, {}).setdefault(b, []).append(ratio)
    tables = {pos: {b: round(median(v), 4) for b, v in by.items()
                    if len(v) >= MIN_N}
              for pos, by in cells.items()}
    ns = {pos: {b: len(v) for b, v in by.items()} for pos, by in cells.items()}
    return tables, edges, ns


def _apply_factors(base_map, raw_factor, positions, arm_positions):
    """C1's normalization verbatim: mean of applied factors per position is
    divided out, so unadjusted players (factor 1.0) sit at the cohort mean
    and the arm cannot shift a position's level."""
    means, out = {}, {}
    for pos in arm_positions:
        vals = [f for pid, f in raw_factor.items()
                if positions.get(pid) == pos and pid in base_map]
        means[pos] = (sum(vals) / len(vals)) if vals else 1.0
    applied = 0
    for pid, v in base_map.items():
        pos = positions.get(pid)
        f = 1.0
        if pos in arm_positions and pid in raw_factor and means[pos] > 0:
            f = raw_factor[pid] / means[pos]
            applied += 1
        out[pid] = v * f
    return out, applied, {k: round(v, 4) for k, v in means.items()}


def c4_raw_factors(tables, feats, positions, only_table=None):
    raw = {}
    for pid, row in feats.items():
        if positions.get(pid) != "RB":
            continue
        f, hit = 1.0, False
        for t in (("rank", "change", "arrivals") if only_table is None
                  else (only_table,)):
            b = _c4_bucket(row, t)
            r = tables[t].get(b) if b is not None else None
            if r is not None:
                f *= r
                hit = True
        if hit:
            raw[pid] = f
    return raw


def c6_raw_factors(tables, edges, feats, positions):
    raw = {}
    for pid, row in feats.items():
        pos = positions.get(pid)
        if pos not in RECEIVERS or pos not in edges:
            continue
        ppg = row.get("attached_qb_ppg_prior")
        if ppg is None:
            continue
        lo, hi = edges[pos]
        b = "low" if ppg <= lo else "high" if float(ppg) > hi else "mid"
        r = tables.get(pos, {}).get(b)
        if r is not None:
            raw[pid] = r
    return raw


def segment_mae(pred_map, base_map, actual, positions, lo, hi):
    """MAE over RB base-rank segment [lo, hi], 1-indexed BY BASE ORDERING —
    the segment membership never moves with the arm, or the comparison
    grades reshuffling, not accuracy. Missing actual is a real 0.0 season."""
    rbs = sorted((p for p in base_map if positions.get(p) == "RB"),
                 key=lambda p: -base_map[p])
    seg = rbs[lo - 1:hi]
    if not seg:
        return None
    return round(sum(abs(pred_map[p] - actual.get(p, 0.0)) for p in seg)
                 / len(seg), 3)


def error_correlation(arm_map, base_map, actual, positions, pos):
    pids = [p for p in base_map if positions.get(p) == pos and p in arm_map]
    if len(pids) < 8:
        return None
    ea = [arm_map[p] - actual.get(p, 0.0) for p in pids]
    eb = [base_map[p] - actual.get(p, 0.0) for p in pids]
    ma, mb = sum(ea) / len(ea), sum(eb) / len(eb)
    sa = (sum((x - ma) ** 2 for x in ea)) ** 0.5
    sb = (sum((x - mb) ** 2 for x in eb)) ** 0.5
    if not sa or not sb:
        return None
    cov = sum((x - ma) * (y - mb) for x, y in zip(ea, eb))
    return round(cov / (sa * sb), 4)


def run_fold(graded, priors):
    positions = positions_record()
    ages = board_ages()
    actual = season_totals(graded)[0]
    hand_blend = make_blend({p: RECENCY_WEIGHTS[0] for p in POSITIONS},
                            positions, priors=priors)
    base = build_stack(hand_blend, positions, ages, graded=graded,
                       priors=priors)

    rb_feats = _store_by_season(RB_STORE).get(graded, {})
    qb_feats = _store_by_season(QB_STORE).get(graded, {})

    c4_tables, c4_ns = c4_fit_tables(C4_FIT[graded], positions)
    c6_tables, c6_edges, c6_ns = c6_fit_tables(C6_FIT[graded], positions)

    c4_map, c4_applied, c4_means = _apply_factors(
        base, c4_raw_factors(c4_tables, rb_feats, positions),
        positions, ("RB",))
    c6_map, c6_applied, c6_means = _apply_factors(
        base, c6_raw_factors(c6_tables, c6_edges, qb_feats, positions),
        positions, RECEIVERS)

    g_base, g_c4, g_c6 = (grade(m, actual, positions)
                          for m in (base, c4_map, c6_map))

    ablation = {}
    for t in ("rank", "change", "arrivals"):
        m, n_applied, _ = _apply_factors(
            base, c4_raw_factors(c4_tables, rb_feats, positions,
                                 only_table=t),
            positions, ("RB",))
        ablation[t] = {"n_applied": n_applied,
                       "verdict": verdict(g_base, grade(m, actual, positions))}

    p64 = {
        "top12": {"base": segment_mae(base, base, actual, positions, 1, 12),
                  "c4": segment_mae(c4_map, base, actual, positions, 1, 12)},
        "mid_13_36": {"base": segment_mae(base, base, actual, positions, 13, 36),
                      "c4": segment_mae(c4_map, base, actual, positions, 13, 36)},
    }
    for seg in p64.values():
        seg["improvement"] = (round(seg["base"] - seg["c4"], 3)
                              if None not in (seg["base"], seg["c4"]) else None)
    p64["mid_beats_top"] = (
        p64["mid_13_36"]["improvement"] is not None
        and p64["top12"]["improvement"] is not None
        and p64["mid_13_36"]["improvement"] > p64["top12"]["improvement"])

    return {
        "graded_season": graded,
        "prior_seasons": list(priors),
        "information_set": {
            "c4_fit_transitions": [f"{a}->{b}" for a, b in C4_FIT[graded]],
            "c4_tables": c4_tables, "c4_bucket_ns": c4_ns,
            "c4_players_adjusted": c4_applied,
            "c4_means_normalized_out": c4_means,
            "c6_fit_transitions": [f"{a}->{b}" for a, b in C6_FIT[graded]],
            "c6_tables": c6_tables, "c6_bucket_ns": c6_ns,
            "c6_tercile_edges": {k: [round(x, 2) for x in v]
                                 for k, v in c6_edges.items()},
            "c6_players_adjusted": c6_applied,
            "c6_means_normalized_out": c6_means,
            "leak_note": f"every fit excludes transitions touching {graded}; "
                         f"features are the store's own offseason as-of rows",
        },
        "grades": {"base_v6": g_base, "c4_rb_offseason": g_c4,
                   "c6_qb_context": g_c6},
        "verdicts": {"c4_rb_offseason": verdict(g_base, g_c4),
                     "c6_qb_context": verdict(g_base, g_c6)},
        "c4_ablation_one_at_a_time": ablation,
        "p64_segments": p64,
        "error_correlation_vs_base": {
            "c4": {"RB": error_correlation(c4_map, base, actual, positions, "RB")},
            "c6": {pos: error_correlation(c6_map, base, actual, positions, pos)
                   for pos in RECEIVERS},
        },
    }


def _improvement(fold, arm, pos, metric):
    b = fold["grades"]["base_v6"]["cells"][pos]
    a = fold["grades"][arm]["cells"][pos]
    if b.get("status") != "measured" or a.get("status") != "measured":
        return None
    if metric == "spearman":
        return round(a["spearman"] - b["spearman"], 4)
    return round(b["mae"] - a["mae"], 3)


def grade_predictions(primary, secondary):
    p64_true = (primary["p64_segments"]["mid_beats_top"]
                and secondary["p64_segments"]["mid_beats_top"])
    p81_cells = {}
    p81_true = True
    for fold in (primary, secondary):
        y = fold["graded_season"]
        for metric in ("spearman", "mae"):
            te = _improvement(fold, "c6_qb_context", "TE", metric)
            wr = _improvement(fold, "c6_qb_context", "WR", metric)
            p81_cells[f"{y}_{metric}"] = {"TE": te, "WR": wr}
            if te is None or wr is None or not te > wr:
                p81_true = False
    return {
        "P64": {"verdict": "TRUE" if p64_true else "FALSE",
                "bar": "mid-board MAE improvement > top-12 improvement, both folds",
                "per_fold_mid_beats_top": {
                    str(primary["graded_season"]): primary["p64_segments"]["mid_beats_top"],
                    str(secondary["graded_season"]): secondary["p64_segments"]["mid_beats_top"]}},
        "P81": {"verdict": "TRUE" if p81_true else "FALSE",
                "bar": "TE improvement strictly > WR on Spearman AND MAE, both folds",
                "cells": p81_cells},
    }


def run() -> dict:
    primary = run_fold(GRADED_SEASON, PRIOR_SEASONS)
    secondary = run_fold(2024, (2022, 2023))
    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/v7_candidate_grade_c4c6.py",
        "_prereg": "V7-CANDIDATE-PREREG §4 + C6 routing order; P64/P81 bars in "
                   "this module's docstring, committed before the first run",
        "primary_fold_2025": primary,
        "secondary_fold_2024": secondary,
        "prediction_grades": grade_predictions(primary, secondary),
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    for arm in ("c4_rb_offseason", "c6_qb_context"):
        for fold in ("primary_fold_2025", "secondary_fold_2024"):
            v = doc[fold]["verdicts"][arm]
            print(f"{fold} {arm}: ships={v['ships_under_section_3']} "
                  f"improving={v['positions_improving_both']} "
                  f"degrading={v['positions_degrading']}")
    for pid, g in doc["prediction_grades"].items():
        print(f"{pid}: {g['verdict']}")


if __name__ == "__main__":
    main()
