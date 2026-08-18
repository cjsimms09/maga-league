# TERRITORY: A
"""V7 candidate C2 — Ridge vs the OLS base, measured walk-forward.

The algorithm chart's implied upgrade at our N. Honest prior stated before
the run: v2's fit has only FOUR parameters (blend, trend, games, intercept),
so coefficient instability is milder than the N≈150-features framing
suggested — Ridge may well measure a null here, and that is a publishable
answer that closes C2 either way.

Discipline: alpha is chosen ONLY on the transition strictly before the one
being evaluated (nested walk-forward — the validation dump's rule, baked).
Same rows, same features, same degradation population as v2's own fit; the
only change is +alpha*I on the normal equations (intercept unpenalized).

Run: python3 draft/backtest/ridge_arm_fit.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import own_model_v2 as V2  # noqa: E402
from recency_weight_fit import spearman  # noqa: E402  (same helper, one derivation)

ALPHAS = [0.0, 0.1, 1.0, 10.0, 100.0, 1000.0]
SEASONS = (2021, 2022, 2023, 2024, 2025)


def rows_for(target, priors, positions, ages, outcome):
    feats = V2.features_for(target, priors, positions, ages)
    X, y, pids = [], [], []
    for pid, f in feats.items():
        out = outcome.get(pid)
        if f["x"] <= 0 or out is None:
            continue
        X.append([f["x"], f["t"], f["g"], 1.0])
        y.append(float(out))
        pids.append((pid, f["pos"]))
    return np.array(X), np.array(y), pids


def ridge_fit(X, y, alpha):
    A = X.T @ X
    P = np.eye(X.shape[1]) * alpha
    P[-1, -1] = 0.0  # never penalize the intercept
    return np.linalg.solve(A + P, X.T @ y)


def eval_transition(fit_target, eval_target, positions, ages, totals):
    """Fit on fit_target's transition, evaluate orderings on eval_target."""
    Xf, yf, pf = rows_for(fit_target, (fit_target - 1,), positions, ages,
                          totals[fit_target])
    Xe, ye, pe = rows_for(eval_target, (eval_target - 1,), positions, ages,
                          totals[eval_target])
    out = {}
    for pos in ("QB", "RB", "WR", "TE"):
        mf = np.array([p == pos for _, p in pf])
        me = np.array([p == pos for _, p in pe])
        if mf.sum() < 20 or me.sum() < 20:
            continue
        res = {}
        for a in ALPHAS:
            beta = ridge_fit(Xf[mf], yf[mf], a)
            pred = Xe[me] @ beta
            res[a] = round(spearman(list(pred), list(ye[me])), 4)
        out[pos] = res
    return out


def build():
    positions = V2.board_positions() if hasattr(V2, "board_positions") else None
    ages = V2.board_ages()
    if positions is None:
        idx = json.loads((HERE / "sleeper_name_index.json").read_text())["index"]
        positions = {str(v["player_id"]): (v.get("position") or "").upper()
                     for v in idx.values()}
    totals = {y: V2.season_totals(y)[0] for y in SEASONS}

    # nested walk-forward: alpha chosen on transition t-1, scored on t.
    # transitions: fit t uses (t-1 -> t). Evaluable pairs: choose on 2023, score 2024; choose on 2024, score 2025.
    picks, scores = {}, {}
    for choose_t, score_t in ((2023, 2024), (2024, 2025)):
        chosen = eval_transition(choose_t - 1, choose_t, positions, ages, totals)
        scored = eval_transition(score_t - 1, score_t, positions, ages, totals)
        for pos in scored:
            if pos not in chosen:
                continue
            best_a = max(chosen[pos], key=chosen[pos].get)
            scores.setdefault(pos, []).append({
                "scored_on": score_t, "alpha_chosen_on_prior": best_a,
                "rho_ridge": scored[pos][best_a], "rho_ols": scored[pos][0.0],
                "gap": round(scored[pos][best_a] - scored[pos][0.0], 4)})
            picks.setdefault(pos, []).append(best_a)

    doc = {"_territory": "TERRITORY: A — written by ridge_arm_fit.py",
           "_what": ("V7 C2: Ridge vs OLS on v2's own 4-parameter fit, alpha "
                     "chosen nested-walk-forward (never on the scored season). "
                     "Prior stated in the module docstring: a null is likely "
                     "at 4 parameters and would CLOSE C2 honestly."),
           "alphas_swept": ALPHAS, "results": scores}
    (HERE / "ridge_arm_fit.json").write_text(json.dumps(doc, indent=1))
    return doc


if __name__ == "__main__":
    d = build()
    for pos, runs in d["results"].items():
        gaps = [r["gap"] for r in runs]
        print(f"{pos}: gaps {gaps} (ridge minus ols, + favors ridge), "
              f"alphas {[r['alpha_chosen_on_prior'] for r in runs]}")
