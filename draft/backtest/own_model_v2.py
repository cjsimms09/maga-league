# TERRITORY: A
"""OWN MODEL v2 — a projector that has to EARN it, graded exactly the way Cory
proposed. Built 2026-08-15 (learning-loop closure, Mission 2).

Cory, verbatim, on the honest negative that v1 (walk_forward) loses to a naive
0.7/0.3 recency blend at all four positions: "Should we use same projector for
2025 then compare how close. If we're lacking something or not taking something
into account, if we can make better." This module is that comparison, run under
model_accuracy_backtest.py's exact protocol: 2025 graded from strictly
2023+2024 committed stores, shared population, MAE + Spearman, same baselines.

════════════════════════════════════════════════════════════════════════════════
PREREGISTRATION — feature set, fitting rule and evaluation FIXED IN THIS FILE
BEFORE ANY RESULT WAS COMPUTED. The commit that adds this file carries no
results artifact; the artifact lands in a later commit. Commit order is the
proof.
════════════════════════════════════════════════════════════════════════════════

── FEATURE AVAILABILITY, AUDITED HONESTLY (what is on committed disk) ─────────

AVAILABLE and used:
  · weekly stores 2023/24/25 (nflverse_weekly_points_*.json): per-player
    per-week POINTS under our scoring — season totals, games played, and
    WITHIN-SEASON TREND (late-season per-game rate) are computable.
  · player_positions.json — the position record (not the live board).
  · public/draft_data.json age/years_exp — as of 2026, for the 677 current
    board players. Age is time-invariant arithmetic (age_Y = age_2026 − (2026−Y)),
    so no leak; COVERAGE IS PARTIAL over the backtest population and the
    uncovered share is counted in the artifact. Unknown age ⇒ multiplier 1.0.

NOT AVAILABLE — named, not skipped silently:
  · per-week targets/carries/shares: the weekly stores carry POINTS ONLY, so
    usage/opportunity-trend features are NOT computable from committed data.
  · TD counts: not in the stores — TD-rate regression to the mean is NOT
    computable (points conflate TD luck with everything else).
  · team assignment history: not on committed disk — team-change flags are
    NOT derivable.
  · any season before 2023: the stores start at 2023, so the 2024 arm has NO
    strictly-prior transition to fit on (see THE 2024 ARM below), and the
    prior-two-season blend weights CANNOT be refit leak-free for 2025 either
    (fitting them needs a 2022+2023→2024 transition). The 0.7/0.3 weights stay
    DECLARED — the naive blend's own knob, deliberately not tuned on the season
    being graded.

── v2, DEFINED (2025 arm — fitted mode) ──────────────────────────────────────

Per player, features strictly from seasons ≤ 2024 (Y−1 = 2024, Y−2 = 2023):

    total_1     season total, weeks 1-17 of Y−1
    games_1     weeks with a store row in Y−1 (presence = played)
    rate_1      total_1 / games_1
    late_rate   mean per-game points over the player's rows in weeks
                LATE_FROM..17 of Y−1 (LATE_FROM = 10); fewer than
                LATE_MIN_GAMES = 3 rows in the window ⇒ rate_1 (no claim of a
                trend off two games)
    blend       0.7·total_1 + 0.3·total_2  (DECLARED; missing Y−2 ⇒ total_1)
    age_mult    v1's declared aging curve (lab_projections CFG AGE_PEAK /
                AGE_DECAY_PER_YEAR) at age_Y; unknown age ⇒ 1.0

    x = age_mult · blend                       (level, regression-carrier)
    t = age_mult · late_rate · EXPECTED_GAMES[pos]   (trajectory)
    g = games_1                                (durability)

    EXPECTED_GAMES: QB 15.5, RB 14.2, WR 15.0, TE 14.8 — v1's declared table.

FITTING RULE (leak-free by construction): per position, ordinary least squares
with intercept on [x, t, g] over the strictly-prior transition — features from
2023 → realized 2024 totals (where blend degenerates to total_2023, late_rate
comes from 2023 weeks 10-17). Population: players with x > 0 and a 2024
outcome. Degradation, declared: n < 30 ⇒ drop g; n < 10 ⇒ identity (pred = x).
Prediction: pred = max(0, a + b·x + c·t + d·g) on 2024-based features. The
2025 arm may touch NOTHING later than 2024 week 18 — enforced by
`_assert_no_leak`, whose fail arm is a test, not a comment.

── THE 2024 ARM (declared-skeleton mode, so the verdict is not one season) ───

No transition strictly before 2024 exists on the stores, so FITTED v2 cannot
run for 2024. What runs instead, labelled `own_v2_declared`: the declared
skeleton with NO fitted parameters —

    pred = max(0, age_mult · (0.5·total_1 + 0.5·late_rate·EXPECTED_GAMES[pos]))

(0.5 DECLARED, not fitted). For 2024 the recency blend degenerates to
naive_prev (no 2022 store), and the artifact says so. This arm measures whether
the trend+age skeleton adds anything over last-season-total alone; it is NOT a
second sample of fitted v2 and the artifact labels it accordingly.

── EVALUATION (identical to model_accuracy_backtest.py, stated again) ────────

    graded seasons   2025 (fitted arm) and 2024 (declared arm), weeks 1-17
    population       per position (QB/RB/WR/TE per player_positions.json),
                     players with ≥1 weekly row in the graded season AND a
                     forecast; MIN_N = 10 else unmeasurable
    metrics          MAE, mean signed bias, Spearman within position
    baselines        naive_prev, recency_blend (same construction as the 2025
                     backtest), plus v1 walk_forward — all four models
                     head-to-head on the SHARED population
    survivorship     forecast-but-no-row players excluded and counted

── THE PROMOTION BAR (Cory's "until it earns it" — REC-3) ────────────────────

v2 clears the bar iff, on the 2025 arm's shared population, at ALL FOUR
positions: MAE(v2) < min(MAE(naive_prev), MAE(recency_blend)) AND
Spearman(v2) > max(Spearman(naive_prev), Spearman(recency_blend)). The
artifact carries the verdict; NOTHING is promoted automatically — clearing the
bar produces a written promotion decision for Cory, and proj_ownmodel stays
display-only regardless of this run's outcome.

Run: python draft/backtest/own_model_v2.py
Writes draft/backtest/model_accuracy_v2.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import CFG as V1_CFG, walk_forward, spearman  # noqa: E402
from model_accuracy_backtest import season_totals, positions_record  # noqa: E402

LAST_SCORED_WEEK = 17
LATE_FROM = 10
LATE_MIN_GAMES = 3
MIN_N = 10
FIT_MIN_FULL = 30      # below this, drop the games feature
FIT_MIN_AFFINE = 10    # below this, identity
POSITIONS = ("QB", "RB", "WR", "TE")
RECENCY_WEIGHTS = (0.7, 0.3)   # DECLARED — see prereg: cannot be refit leak-free
EXPECTED_GAMES = {"QB": 15.5, "RB": 14.2, "WR": 15.0, "TE": 14.8}
DECLARED_SKELETON_MIX = 0.5    # 2024 arm only; declared, not fitted

OUT = HERE / "model_accuracy_v2.json"


# ── data access, leak-guarded ────────────────────────────────────────────────

def _assert_no_leak(seasons_touched, graded_season: int) -> None:
    """The 2025 arm may touch nothing later than 2024; the 2024 arm nothing
    later than 2023. Raises — the guard is construction, not convention."""
    late = sorted(int(s) for s in seasons_touched if int(s) >= int(graded_season))
    if late:
        raise ValueError(
            f"LEAK: building features for graded season {graded_season} touched "
            f"season(s) {late}. A forecast that has seen the season it grades is "
            "the exact defect exp33 documented.")


def late_rates(season: int, last_week: int = LAST_SCORED_WEEK) -> dict:
    """Per-game rate over weeks LATE_FROM..last_week, per player — the trend
    window. Fewer than LATE_MIN_GAMES rows in the window ⇒ absent here (caller
    falls back to the full-season rate, per prereg)."""
    store = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    tot: dict[str, float] = {}
    g: dict[str, int] = {}
    for w in store["weeks"]:
        if not (LATE_FROM <= w["week"] <= last_week):
            continue
        for pid, v in w["points"].items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
            g[pid] = g.get(pid, 0) + 1
    return {pid: tot[pid] / g[pid] for pid in tot if g[pid] >= LATE_MIN_GAMES}


def board_ages() -> dict:
    """age as of 2026 per player_id from the committed board — partial coverage,
    counted by the caller. Absent board ⇒ empty (age_mult 1.0 everywhere)."""
    try:
        board = json.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
    except (OSError, ValueError):
        return {}
    return {str(p["player_id"]): p["age"] for p in board.get("players", [])
            if p.get("age") is not None}


def _age_mult(pos: str | None, age) -> float:
    if age is None or pos is None:
        return 1.0
    peak = V1_CFG["AGE_PEAK"].get(pos)
    decay = V1_CFG["AGE_DECAY_PER_YEAR"].get(pos)
    if peak is None or decay is None:
        return 1.0
    return max(0.55, 1.0 - decay * max(0.0, float(age) - peak))


def features_for(target_season: int, prior_seasons: tuple[int, int] | tuple[int],
                 positions: dict, ages_2026: dict) -> dict:
    """{pid: {x, t, g, pos}} strictly from `prior_seasons` (< target_season)."""
    _assert_no_leak(prior_seasons, target_season)
    y1 = max(prior_seasons)
    y2 = min(prior_seasons) if len(prior_seasons) > 1 else None
    tot1, games1 = season_totals(y1)
    tot2 = season_totals(y2)[0] if y2 is not None else {}
    late = late_rates(y1)
    w1, w2 = RECENCY_WEIGHTS

    out = {}
    for pid, t1 in tot1.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        g1 = games1.get(pid, 0)
        if g1 <= 0:
            continue
        rate1 = t1 / g1
        lr = late.get(pid, rate1)
        t2 = tot2.get(pid)
        blend = (w1 * t1 + w2 * t2) if t2 is not None else t1
        age_2026 = ages_2026.get(pid)
        age_y = (float(age_2026) - (2026 - target_season)) if age_2026 is not None else None
        am = _age_mult(pos, age_y)
        out[pid] = {
            "pos": pos,
            "x": am * blend,
            "t": am * lr * EXPECTED_GAMES[pos],
            "g": float(g1),
            "age_known": age_2026 is not None,
        }
    return out


# ── fitting: per-position OLS with declared degradation ─────────────────────

def _ols(rows: list) -> list | None:
    """Least squares via normal equations with Gaussian elimination — no numpy
    dependency. rows = [(features..., y)]. Returns coefficients [a, b, ...]
    (intercept first) or None if singular."""
    if not rows:
        return None
    k = len(rows[0]) - 1
    n = k + 1
    ata = [[0.0] * n for _ in range(n)]
    aty = [0.0] * n
    for r in rows:
        v = [1.0] + list(r[:k])
        y = r[k]
        for i in range(n):
            aty[i] += v[i] * y
            for j in range(n):
                ata[i][j] += v[i] * v[j]
    # solve ata · beta = aty
    m = [row[:] + [aty[i]] for i, row in enumerate(ata)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r2: abs(m[r2][col]))
        if abs(m[piv][col]) < 1e-9:
            return None
        m[col], m[piv] = m[piv], m[col]
        for r2 in range(n):
            if r2 == col:
                continue
            f = m[r2][col] / m[col][col]
            for c2 in range(col, n + 1):
                m[r2][c2] -= f * m[col][c2]
    return [m[i][n] / m[i][i] for i in range(n)]


def fit_transition(feat_prior: dict, outcome: dict) -> dict:
    """Per-position coefficients from ONE strictly-prior transition, with the
    declared degradation ladder (full → no-games → identity)."""
    fits = {}
    for pos in POSITIONS:
        rows_full, rows_aff = [], []
        for pid, f in feat_prior.items():
            if f["pos"] != pos or f["x"] <= 0:
                continue
            y = outcome.get(pid)
            if y is None:
                continue
            rows_full.append((f["x"], f["t"], f["g"], float(y)))
            rows_aff.append((f["x"], f["t"], float(y)))
        n = len(rows_full)
        if n >= FIT_MIN_FULL:
            beta = _ols(rows_full)
            if beta is not None:
                fits[pos] = {"mode": "full", "n": n,
                             "coef": {"a": round(beta[0], 4), "b": round(beta[1], 4),
                                      "c": round(beta[2], 4), "d": round(beta[3], 4)}}
                continue
        if n >= FIT_MIN_AFFINE:
            beta = _ols(rows_aff)
            if beta is not None:
                fits[pos] = {"mode": "no-games", "n": n,
                             "coef": {"a": round(beta[0], 4), "b": round(beta[1], 4),
                                      "c": round(beta[2], 4)}}
                continue
        fits[pos] = {"mode": "identity", "n": n, "coef": None}
    return fits


def predict(feats: dict, fits: dict) -> dict:
    out = {}
    for pid, f in feats.items():
        fit = fits.get(f["pos"]) or {"mode": "identity", "coef": None}
        c = fit.get("coef")
        if fit["mode"] == "full":
            v = c["a"] + c["b"] * f["x"] + c["c"] * f["t"] + c["d"] * f["g"]
        elif fit["mode"] == "no-games":
            v = c["a"] + c["b"] * f["x"] + c["c"] * f["t"]
        else:
            v = f["x"]
        out[pid] = round(max(0.0, v), 2)
    return out


def declared_skeleton(feats: dict) -> dict:
    """The 2024 arm: NO fitted parameters exist strictly before 2024, so the
    skeleton runs with the declared 0.5 mix. Labelled, never conflated with
    fitted v2."""
    m = DECLARED_SKELETON_MIX
    return {pid: round(max(0.0, (1 - m) * f["x"] + m * f["t"]), 2)
            for pid, f in feats.items()}


# ── evaluation: the 2025 backtest's protocol, applied to all four models ────

def _grade_models(models: dict, graded_season: int, positions: dict) -> dict:
    actual, _ = season_totals(graded_season)
    cells_by_model = {}
    for name, proj in models.items():
        cells = {}
        skipped = 0
        for pos in POSITIONS:
            pairs = []
            for pid, f in proj.items():
                if positions.get(pid) != pos:
                    continue
                a = actual.get(pid)
                if a is None:
                    skipped += 1
                    continue
                pairs.append((float(f), float(a)))
            if len(pairs) < MIN_N:
                cells[pos] = {"n": len(pairs), "status": "unmeasurable"}
                continue
            errs = [f - a for f, a in pairs]
            cells[pos] = {"n": len(pairs), "status": "measured",
                          "mae": round(sum(abs(e) for e in errs) / len(errs), 2),
                          "bias": round(sum(errs) / len(errs), 2),
                          "spearman": round(spearman([f for f, _ in pairs],
                                                     [a for _, a in pairs]), 4)}
        cells_by_model[name] = {"cells": cells, "forecasts": len(proj),
                                "excluded_no_weekly_row": skipped}

    shared = set.intersection(*(set(m) for m in models.values()))
    h2h = {}
    for pos in POSITIONS:
        pids = [pid for pid in shared
                if positions.get(pid) == pos and actual.get(pid) is not None]
        if len(pids) < MIN_N:
            h2h[pos] = {"n": len(pids), "status": "unmeasurable"}
            continue
        row = {"n": len(pids), "status": "measured"}
        for name, proj in models.items():
            errs = [proj[pid] - actual[pid] for pid in pids]
            row[name] = {"mae": round(sum(abs(e) for e in errs) / len(errs), 2),
                         "spearman": round(spearman([proj[pid] for pid in pids],
                                                    [actual[pid] for pid in pids]), 4)}
        h2h[pos] = row
    return {"models": cells_by_model, "head_to_head_shared_population": h2h}


def _baselines(graded_season: int, prior: tuple) -> dict:
    y1 = max(prior)
    tot1 = season_totals(y1)[0]
    naive = dict(tot1)
    if len(prior) > 1:
        y2 = min(prior)
        tot2 = season_totals(y2)[0]
        w1, w2 = RECENCY_WEIGHTS
        blend = {pid: (w1 * v + w2 * tot2[pid]) if pid in tot2 else v
                 for pid, v in tot1.items()}
        degenerate = False
    else:
        blend = dict(naive)
        degenerate = True
    return {"naive_prev": naive, "recency_blend": blend, "_degenerate": degenerate}


def promotion_verdict(h2h_2025: dict) -> dict:
    """Cory's bar, computed once here and cited elsewhere: beat BOTH baselines
    at ALL four positions on BOTH metrics, on the shared population."""
    per_pos = {}
    clears = True
    for pos in POSITIONS:
        row = h2h_2025.get(pos) or {}
        if row.get("status") != "measured":
            per_pos[pos] = {"status": "unmeasurable"}
            clears = False
            continue
        v2 = row["own_v2"]
        base_mae = min(row["naive_prev"]["mae"], row["recency_blend"]["mae"])
        base_sp = max(row["naive_prev"]["spearman"], row["recency_blend"]["spearman"])
        mae_ok = v2["mae"] < base_mae
        sp_ok = v2["spearman"] > base_sp
        per_pos[pos] = {"mae_beats_both": mae_ok, "spearman_beats_both": sp_ok,
                        "v2_mae": v2["mae"], "best_baseline_mae": base_mae,
                        "v2_spearman": v2["spearman"], "best_baseline_spearman": base_sp}
        clears = clears and mae_ok and sp_ok
    return {
        "bar": ("beat BOTH naive baselines at ALL four positions on BOTH metrics "
                "(MAE and Spearman), shared population, leak-free walk-forward"),
        "clears": clears,
        "per_position": per_pos,
        "consequence": ("clears=false → proj_ownmodel and v2 stay display-only. "
                        "clears=true → a written promotion decision goes to Cory; "
                        "NOTHING flips automatically either way."),
    }


def run() -> dict:
    positions = positions_record()
    ages = board_ages()

    # ── 2025 arm: fitted v2 from strictly 2023+2024 ─────────────────────────
    feat_fit = features_for(2024, (2023,), positions, ages)      # fit transition
    outcome_2024 = season_totals(2024)[0]
    fits = fit_transition(feat_fit, outcome_2024)
    feat_2025 = features_for(2025, (2023, 2024), positions, ages)
    v2_2025 = predict(feat_2025, fits)

    prior_pts, prior_games = {}, {}
    for y in (2023, 2024):
        prior_pts[y], prior_games[y] = season_totals(y)
    v1_2025 = walk_forward(2025, prior_pts, prior_games, positions, ages={})
    base_2025 = _baselines(2025, (2023, 2024))
    models_2025 = {"own_v2": v2_2025, "walk_forward_v1": v1_2025,
                   "naive_prev": base_2025["naive_prev"],
                   "recency_blend": base_2025["recency_blend"]}
    arm_2025 = _grade_models(models_2025, 2025, positions)

    # ── 2024 arm: declared skeleton (no strictly-prior transition exists) ───
    feat_2024 = features_for(2024, (2023,), positions, ages)
    skel_2024 = declared_skeleton(feat_2024)
    v1_2024 = walk_forward(2024, {2023: prior_pts[2023]},
                           {2023: prior_games[2023]}, positions, ages={})
    base_2024 = _baselines(2024, (2023,))
    models_2024 = {"own_v2_declared": skel_2024, "walk_forward_v1": v1_2024,
                   "naive_prev": base_2024["naive_prev"],
                   "recency_blend": base_2024["recency_blend"]}
    arm_2024 = _grade_models(models_2024, 2024, positions)

    age_cov = sum(1 for f in feat_2025.values() if f["age_known"])
    verdict = promotion_verdict(arm_2025["head_to_head_shared_population"])

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v2.py",
        "_note": ("Own-model v2 vs v1 vs both naive baselines, leak-free, under "
                  "model_accuracy_backtest.py's exact protocol. Feature set, fitting "
                  "rule and evaluation were PREREGISTERED in own_model_v2.py and "
                  "committed before this artifact existed — commit order is the proof. "
                  "Promotion stays gated regardless of the verdict."),
        "preregistration": "own_model_v2.py module docstring (committed first)",
        "features_unavailable_named": {
            "usage_trends": "weekly stores carry points only — no targets/carries/shares",
            "td_rate_regression": "no TD counts in the stores",
            "team_change_flags": "no team assignment history on committed disk",
            "blend_weight_refit": "needs a 2022+2023→2024 transition; stores start 2023 "
                                  "— 0.7/0.3 stays declared",
        },
        "fits_2023_to_2024": fits,
        "age_coverage_2025_arm": {"known": age_cov, "of": len(feat_2025),
                                  "note": "unknown age ⇒ multiplier 1.0, per prereg"},
        "arm_2025": dict(arm_2025, graded_season=2025, prior_seasons=[2023, 2024],
                         mode="fitted", recency_blend_degenerate=False),
        "arm_2024": dict(arm_2024, graded_season=2024, prior_seasons=[2023],
                         mode="declared-skeleton (no strictly-prior transition on "
                              "the stores; 0.5 mix declared, not fitted)",
                         recency_blend_degenerate=True),
        "promotion_bar": verdict,
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    h = doc["arm_2025"]["head_to_head_shared_population"]
    print("2025 arm, shared population (MAE / Spearman):")
    for pos in POSITIONS:
        row = h.get(pos) or {}
        if row.get("status") != "measured":
            print(f"  {pos}: unmeasurable")
            continue
        cells = "  ".join(
            f"{m}={row[m]['mae']}/{row[m]['spearman']}"
            for m in ("own_v2", "walk_forward_v1", "naive_prev", "recency_blend"))
        print(f"  {pos} (n={row['n']}): {cells}")
    print(f"promotion bar clears: {doc['promotion_bar']['clears']}")


if __name__ == "__main__":
    main()
