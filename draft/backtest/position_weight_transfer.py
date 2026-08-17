# TERRITORY: A
"""DOES A PER-POSITION FORECAST WEIGHT TRANSFER TO A SEASON IT WAS NOT FIT ON?

Preregistration: draft/backtest/POSITION-WEIGHT-TRANSFER-PREREG.md, committed
BEFORE this file existed (commit order is the proof).

Cory, 2026-08-17: "Let's test position weighted idea then."

READ §0 OF THE PREREG BEFORE READING ANY NUMBER HERE. This does NOT answer
"should proj_mean weight Sleeper against FantasyPros per position" — that stays
blocked, because no per-player Sleeper or FP series exists for any gradeable
season. It answers the MECHANISM question underneath it: does a per-position
weight carry information that survives to a season it was not fitted on?

The comparison is PER-POSITION vs GLOBAL, not weighted vs unweighted. A global
weight is already free to be non-equal, so position-weighting only earns credit
from the positions differing FROM EACH OTHER.

Run:
    python3 draft/backtest/position_weight_transfer.py            # writes .json
    python3 draft/backtest/position_weight_transfer.py --verify   # licence only
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

POSITIONS = ("QB", "RB", "WR", "TE")
MIN_N = 25                      # same constant proj_mean_blend uses; prereg §2
GRADED = 2025                   # prereg §2
FIT_SEASONS = (2023, 2024)      # prereg §2
BOOTSTRAP = 2000
SEED = 20260817                 # fixed so the CI is reproducible, not reshopped

#: Prereg §4's shuffled-position control. A 4-cycle, chosen because it has NO
#: fixed point — every position is graded under some OTHER position's weight, so
#: the control cannot accidentally agree with the real arm on any cell.
SHUFFLE = {"QB": "RB", "RB": "WR", "WR": "TE", "TE": "QB"}

#: Prereg §2. Declared in the prereg before the run to stop pair-shopping.
HEADLINE_PAIR = ("own_v6", "recency_blend")


# ── the arms, per season ────────────────────────────────────────────────────

def season_models(graded: int, priors: tuple[int, int]) -> tuple[dict, dict, dict]:
    """Rebuild every offline-constructible arm for one season.

    This is proj_mean_blend._probe_models() with the season un-hardcoded, and
    NOTHING ELSE. That claim is not asserted, it is CHECKED: verify_parity()
    reproduces _probe_models() exactly for 2025 and is the licence to trust any
    2023 or 2024 number this produces. own_model_v* is read-only here — every
    constant still comes from its own committed prereg.
    """
    import fetch_component_stats as FCS
    import own_model_v5 as V5
    from lab_projections import walk_forward
    from model_accuracy_backtest import positions_record, season_totals
    from own_model_v2 import features_for, fit_transition, predict
    from own_model_v3 import build_v3, market_ranks, rank_curve
    from own_model_v4 import (build_v4, league_draft_picks, qb_active_games,
                              qb_availability_correction, weekly_points)
    from own_model_v6 import _baselines, board_ages, build_v6

    # LIMITATION 4, declared in the prereg: board_ages() is as-of-2026 for every
    # season, so the age feature is offset by (2026 - graded) years in the fit
    # seasons. A constant per-season shift, not outcome data — it cannot leak the
    # answer, but it IS a misspecification that is worse for the fit seasons than
    # for the graded one, which is why the prereg names it rather than this
    # comment discovering it.
    positions, ages = positions_record(), board_ages()
    older, newer = min(priors), max(priors)

    fits = fit_transition(features_for(newer, (older,), positions, ages),
                          season_totals(newer)[0])
    v2 = predict(features_for(graded, priors, positions, ages), fits)
    base = _baselines(graded, priors)
    blend = base["recency_blend"]

    picks = league_draft_picks(graded)
    curve = rank_curve(newer, positions)
    mrank = market_ranks(picks, positions)
    v3 = build_v3(v2, blend, mrank, curve, positions)
    corr, _mu = qb_availability_correction(
        qb_active_games(weekly_points(newer), positions))
    v4 = build_v4(v3, blend, corr, positions)
    v5 = V5.build_v5(v3, V5.comp_opinion(graded, priors, positions, ages,
                                         FCS.implied_team_totals(graded, 1, 1)),
                     blend, corr, mrank, curve, positions)
    v6 = build_v6(v4, v5, positions)

    prior_pts, prior_games = {}, {}
    for y in priors:
        prior_pts[y], prior_games[y] = season_totals(y)
    v1 = walk_forward(graded, prior_pts, prior_games, positions, ages={})

    models = {"own_v6": v6, "own_v5": v5, "own_v4": v4, "own_v3": v3, "own_v2": v2,
              "walk_forward_v1": v1, "recency_blend": blend,
              "naive_prev": base["naive_prev"]}
    return models, positions, season_totals(graded)[0]


def diff_models(want: dict, got: dict,
                wactual: dict, gactual: dict) -> dict:
    """The licence's arithmetic, split out so it can be tested against a rigged
    mismatch as well as a match. A checker that has only ever seen agreement is
    not a checker."""
    diffs, compared = [], 0
    for name in sorted(set(want) | set(got)):
        a, b = want.get(name), got.get(name)
        if a is None or b is None:
            diffs.append({"model": name, "why": "present in only one side"})
            continue
        if set(a) != set(b):
            diffs.append({"model": name, "why": "different player population",
                          "only_committed": len(set(a) - set(b)),
                          "only_rebuilt": len(set(b) - set(a))})
            continue
        for pid in a:
            compared += 1
            if abs(float(a[pid]) - float(b[pid])) > 1e-9:
                diffs.append({"model": name, "player_id": pid,
                              "committed": a[pid], "rebuilt": b[pid]})
    if set(wactual) != set(gactual):
        diffs.append({"model": "<actual>", "why": "different graded population"})
    return {"models_compared": len(want), "values_compared": compared,
            "disagreements": len(diffs), "exact": not diffs, "sample": diffs[:5]}


def verify_parity() -> dict:
    """THE LICENCE. season_models(2025, (2023, 2024)) must equal the committed
    _probe_models() exactly, or the parameterisation changed something and every
    2023/2024 arm built here is a different model wearing the same name."""
    import proj_mean_blend as PMB
    want, _wpos, wactual = PMB._probe_models()
    got, _gpos, gactual = season_models(GRADED, FIT_SEASONS)
    return diff_models(want, got, wactual, gactual)


# ── weighting ───────────────────────────────────────────────────────────────

def inverse_mse_weight(rows: list[tuple[float, float, float]]) -> float | None:
    """Weight on arm A from paired (pred_a, pred_b, actual) rows, w ∝ 1/MSE.

    Returns None on an empty or degenerate fit rather than a number — a zero MSE
    means one arm reproduced the answer exactly, which is a data defect, not a
    weight of 1.0.
    """
    if not rows:
        return None
    mse_a = statistics.fmean((a - y) ** 2 for a, _b, y in rows)
    mse_b = statistics.fmean((b - y) ** 2 for _a, b, y in rows)
    if mse_a <= 0 or mse_b <= 0:
        return None
    return (1 / mse_a) / ((1 / mse_a) + (1 / mse_b))


def fit_rows(seasons: dict, name_a: str, name_b: str,
             position: str | None) -> list[tuple[float, float, float]]:
    """Paired rows for a fit, pooled across the fit seasons. `position=None`
    pools every position, which is exactly what the GLOBAL arm is."""
    out = []
    for models, positions, actual in seasons.values():
        pa, pb = models.get(name_a) or {}, models.get(name_b) or {}
        for pid, y in actual.items():
            if position is not None and positions.get(pid) != position:
                continue
            if pid in pa and pid in pb:
                out.append((float(pa[pid]), float(pb[pid]), float(y)))
    return out


def graded_cells(models: dict, positions: dict, actual: dict,
                 name_a: str, name_b: str) -> dict:
    """{position -> (pids, pred_a, pred_b, truth)} on the graded season, using
    only players both arms priced. Absent != zero: a player either arm misses is
    dropped from the cell, never imputed."""
    pa, pb = models.get(name_a) or {}, models.get(name_b) or {}
    cells = {}
    for pos in POSITIONS:
        pids = sorted(pid for pid in actual
                      if positions.get(pid) == pos and pid in pa and pid in pb)
        if len(pids) >= MIN_N:
            cells[pos] = (pids, [float(pa[p]) for p in pids],
                          [float(pb[p]) for p in pids],
                          [float(actual[p]) for p in pids])
    return cells


def _rho(pred: list[float], truth: list[float]) -> float:
    from lab_projections import spearman
    return spearman(pred, truth)


def _blend(a: list[float], b: list[float], w: float) -> list[float]:
    return [w * a[i] + (1 - w) * b[i] for i in range(len(a))]


# ── bootstrap ───────────────────────────────────────────────────────────────

def paired_bootstrap(cells: dict, weights_x: dict, weights_y: dict,
                     rng: random.Random) -> dict:
    """Pooled, n-weighted mean rho difference between two weighting schemes,
    with a stratified paired bootstrap.

    Resampling is WITHIN position (stratified) because rho is a within-position
    quantity — resampling across positions would mostly reshuffle how many QBs
    are in the sample, which is not the uncertainty being estimated. Paired
    because both arms are recomputed on the SAME resample, so the shared
    season-shock variance cancels instead of swamping the difference.
    """
    def pooled(sel: dict) -> float:
        num = den = 0.0
        for pos, (idx, a, b, y) in sel.items():
            wx, wy = weights_x.get(pos), weights_y.get(pos)
            if wx is None or wy is None:
                continue
            aa = [a[i] for i in idx]
            bb = [b[i] for i in idx]
            yy = [y[i] for i in idx]
            num += len(idx) * (_rho(_blend(aa, bb, wx), yy)
                               - _rho(_blend(aa, bb, wy), yy))
            den += len(idx)
        return num / den if den else 0.0

    full = {pos: (list(range(len(c[0]))), c[1], c[2], c[3])
            for pos, c in cells.items()}
    point = pooled(full)

    draws = []
    for _ in range(BOOTSTRAP):
        sel = {}
        for pos, (idx, a, b, y) in full.items():
            sel[pos] = ([rng.randrange(len(idx)) for _ in idx], a, b, y)
        draws.append(pooled(sel))
    draws.sort()
    lo = draws[int(0.025 * len(draws))]
    hi = draws[int(0.975 * len(draws)) - 1]
    # Two-sided bootstrap p: how often the resampled difference lands on the
    # other side of zero from the point estimate.
    side = (sum(1 for d in draws if d <= 0) if point > 0
            else sum(1 for d in draws if d >= 0))
    p = min(1.0, 2.0 * side / len(draws))
    return {"delta": round(point, 4), "ci95": [round(lo, 4), round(hi, 4)],
            "p": round(p, 4), "excludes_zero": bool(lo > 0 or hi < 0)}


def benjamini_hochberg(pvals: list[float], q: float = 0.10) -> list[bool]:
    """Prereg §2: secondary pairs are FDR-controlled at q=0.10."""
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    m, keep, thresh = len(pvals), [False] * len(pvals), -1
    for rank, i in enumerate(order, start=1):
        if pvals[i] <= q * rank / m:
            thresh = rank
    for rank, i in enumerate(order, start=1):
        if rank <= thresh:
            keep[i] = True
    return keep


# ── the study ───────────────────────────────────────────────────────────────

def evaluate_pair(seasons: dict, graded: tuple, name_a: str, name_b: str,
                  rng: random.Random) -> dict:
    """Every arm the prereg names, for one pair of forecasters."""
    models, positions, actual = graded
    cells = graded_cells(models, positions, actual, name_a, name_b)
    if len(cells) < 2:
        return {"pair": [name_a, name_b], "verdict": "SKIPPED",
                "why": f"only {len(cells)} position cells cleared MIN_N={MIN_N}"}

    # THE TWO ARMS UNDER TEST — both fitted on 2023+2024 only.
    w_global = inverse_mse_weight(fit_rows(seasons, name_a, name_b, None))
    w_pos = {pos: inverse_mse_weight(fit_rows(seasons, name_a, name_b, pos))
             for pos in cells}
    if w_global is None or any(v is None for v in w_pos.values()):
        return {"pair": [name_a, name_b], "verdict": "SKIPPED",
                "why": "degenerate fit (a zero MSE is a data defect, not a weight)"}

    arms = {
        "per_position": dict(w_pos),
        "global": {pos: w_global for pos in cells},
        "equal": {pos: 0.5 for pos in cells},
        # CONTROL (prereg §4): each position graded under ANOTHER position's
        # weight. If this does as well, "position-specific" meant nothing.
        "shuffled_control": {pos: w_pos.get(SHUFFLE[pos], w_global) for pos in cells},
    }
    # CEILING, LEAKING BY CONSTRUCTION (prereg §4). Never compared as evidence.
    leak = {}
    for pos, (pids, a, b, y) in cells.items():
        leak[pos] = inverse_mse_weight(list(zip(a, b, y))) or w_global
    arms["answer_key_LEAKS"] = leak

    per_cell = {}
    for pos, (pids, a, b, y) in cells.items():
        row = {"n": len(pids),
               "parent_a": round(_rho(a, y), 4), "parent_b": round(_rho(b, y), 4)}
        for arm, w in arms.items():
            row[arm] = round(_rho(_blend(a, b, w[pos]), y), 4)
            row[arm + "_w"] = round(w[pos], 4)
        row["better_parent"] = max(row["parent_a"], row["parent_b"])
        row["per_position_beats_global"] = row["per_position"] > row["global"]
        per_cell[pos] = row

    wins = sum(1 for r in per_cell.values() if r["per_position_beats_global"])
    boot = paired_bootstrap(cells, arms["per_position"], arms["global"], rng)
    ctrl_wins = sum(1 for pos, r in per_cell.items()
                    if r["shuffled_control"] > r["global"])

    # PREREG §3, all three clauses. Written as one expression so no clause can
    # be quietly dropped when the numbers are in front of us.
    supported = (wins >= 3 and boot["excludes_zero"] and boot["delta"] > 0
                 and ctrl_wins < 3)
    return {
        "pair": [name_a, name_b], "cells": per_cell,
        "weights": {"global": round(w_global, 4),
                    "per_position": {k: round(v, 4) for k, v in w_pos.items()}},
        "per_position_wins": wins, "of_cells": len(per_cell),
        "shuffled_control_wins": ctrl_wins,
        "bootstrap_vs_global": boot,
        "verdict": "SUPPORTED" if supported else "NULL",
        "clauses": {"wins_ge_3": wins >= 3,
                    "ci_excludes_zero_positive": bool(boot["excludes_zero"]
                                                      and boot["delta"] > 0),
                    "control_does_not_also_clear": ctrl_wins < 3},
    }


def run() -> dict:
    rng = random.Random(SEED)
    licence = verify_parity()
    if not licence["exact"]:
        return {"status": "VOID", "licence": licence,
                "why": ("season_models() no longer reproduces the committed "
                        "_probe_models() for 2025, so the seasons it builds for "
                        "2023/2024 are a different model wearing the same name. "
                        "Refusing to report any number.")}

    seasons = {y: season_models(y, (y - 2, y - 1)) for y in FIT_SEASONS}
    graded = season_models(GRADED, FIT_SEASONS)
    names = sorted(graded[0])

    pairs, headline = [], None
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            res = evaluate_pair(seasons, graded, a, b, rng)
            res["is_headline"] = sorted([a, b]) == sorted(HEADLINE_PAIR)
            if res["is_headline"]:
                headline = res
            pairs.append(res)

    scored = [p for p in pairs if p["verdict"] != "SKIPPED" and not p["is_headline"]]
    keep = benjamini_hochberg([p["bootstrap_vs_global"]["p"] for p in scored])
    for p, k in zip(scored, keep):
        p["fdr_survives_q10"] = bool(k and p["bootstrap_vs_global"]["delta"] > 0)

    secondary_hits = [p["pair"] for p in scored if p.get("fdr_survives_q10")]
    ship = {
        "position_weighting_supported": bool(headline
                                             and headline["verdict"] == "SUPPORTED"),
        "changes_proj_mean": False,
        "why_no_ship": ("Prereg §0, declared before the run: no outcome here may "
                        "change proj_mean. These arms are not Sleeper and not "
                        "FantasyPros, and the per-player series that would make "
                        "the shipped question answerable still does not exist."),
    }
    return {
        "_territory": "TERRITORY: A",
        "prereg": "draft/backtest/POSITION-WEIGHT-TRANSFER-PREREG.md",
        "status": "OK",
        "licence": licence,
        "design": {"graded": GRADED, "fit_seasons": list(FIT_SEASONS),
                   "holdout": "SEASON — no graded-season player informs any weight",
                   "comparison": "per-position weight vs GLOBAL weight",
                   "headline_pair": list(HEADLINE_PAIR),
                   "shuffle": SHUFFLE, "bootstrap": BOOTSTRAP, "seed": SEED,
                   "min_n": MIN_N},
        "headline": headline,
        "secondary_pairs": scored,
        "secondary_fdr_survivors": secondary_hits,
        "skipped_pairs": [p for p in pairs if p["verdict"] == "SKIPPED"],
        "ship": ship,
        "limitations": [
            "NOT the shipped Sleeper/FP question — no per-player series exists.",
            "Parents are ~0.94 error-correlated (hostile case for blending): a "
            "positive is stronger than it looks, a null weaker evidence than it "
            "looks.",
            "Two fit seasons is the design minimum — zero degrees of freedom "
            "left to check the fit's stability.",
            "board_ages() is as-of-2026 for every season, so the age feature is "
            "misspecified worse in the fit seasons than in the graded one.",
            "2021/2022 weekly stores are REBUILT offline, licensed by an exact "
            "2023 reproduction (0 disagreements over 5,371 player-weeks).",
            "One graded season: n=1 for the transfer claim itself.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true",
                    help="run the parity licence alone and stop")
    args = ap.parse_args()

    if args.verify:
        lic = verify_parity()
        print(f"PARITY vs proj_mean_blend._probe_models() on {GRADED}: "
              f"{lic['models_compared']} models, {lic['values_compared']} values, "
              f"disagreements {lic['disagreements']}, exact={lic['exact']}")
        for s in lic["sample"]:
            print("   ", s)
        return 0 if lic["exact"] else 1

    doc = run()
    (HERE / "position_weight_transfer.json").write_text(json.dumps(doc, indent=1))
    if doc["status"] != "OK":
        print("VOID —", doc["why"])
        return 1
    h = doc["headline"]
    print(f"HEADLINE {h['pair']}: {h['verdict']}  "
          f"per-position beat global in {h['per_position_wins']}/{h['of_cells']}, "
          f"control in {h['shuffled_control_wins']}/{h['of_cells']}, "
          f"delta {h['bootstrap_vs_global']['delta']} "
          f"CI {h['bootstrap_vs_global']['ci95']}")
    print(f"secondary pairs surviving FDR q=0.10: {len(doc['secondary_fdr_survivors'])}"
          f" of {len(doc['secondary_pairs'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
