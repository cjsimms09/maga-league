# TERRITORY: D
"""RANDOM-WEIGHT — does the stacker beat the champion, or does AVERAGING?

BLEND-SEARCH-DESIGN.md §3: "a stacker that beats the champion only because
averaging reduces variance -- draw random non-negative weights, rebuild,
compare." The second of the three owed nulls; BEST-OF-K was the first
(best_of_k.py, register DS9). This one existed nowhere either.

THE TRAP, stated plainly because it is not obvious: blending K arms reduces the
variance of the blend's error even when the weights carry NO information. So a
fitted stacker that beats the best single arm may have bought that entirely
with averaging, and its WEIGHTS -- the thing anyone would write up -- may be
worth nothing.

Two questions, and they are different:
    1. does the blend beat the best single arm?      (averaging + weights)
    2. do the FITTED weights beat RANDOM weights?    (weights alone)
Only (2) is evidence the fit learned anything. This module answers both and
reports the split.

THE FREE LUNCH DEPENDS ON ARM CORRELATION, which is why the calibration is
indexed by rho rather than by n. Arms that make the same mistakes gain almost
nothing from averaging; arms with independent errors gain a lot. A blend
program whose arms are near-copies is buying less than it thinks, and one whose
arms are genuinely different must clear a HIGHER bar before its weights mean
anything.

Run: python3 draft/backtest/random_weight_null.py   (prints the calibration)
"""
from __future__ import annotations

import json
import math
import random
import statistics as st
from pathlib import Path

OUT = Path(__file__).with_suffix(".json")

DRAWS = 2000
SEED = 20260818

CAL_K = (2, 3, 5, 8, 15)
CAL_RHO = (0.0, 0.3, 0.6, 0.9, 0.99)
CAL_N = 1000
CAL_DRAWS = 300


def _mae(pred, actual) -> float:
    return sum(abs(p - a) for p, a in zip(pred, actual)) / len(actual)


def _blend(preds: list, weights: list) -> list:
    return [sum(w * p[i] for w, p in zip(weights, preds))
            for i in range(len(preds[0]))]


def _random_weights(k: int, rng: random.Random) -> list:
    """Non-negative, summing to 1 — uniform on the simplex."""
    e = [-math.log(rng.random() or 1e-12) for _ in range(k)]
    tot = sum(e)
    return [x / tot for x in e]


def random_weight_null(predictions_by_arm: dict, actual: list,
                       fitted: list | None = None,
                       fitted_weights: dict | None = None,
                       draws: int = DRAWS, seed: int = SEED) -> dict:
    """predictions_by_arm: {arm: [prediction per row]}, same rows and order as
    `actual`. Supply the stacker either as `fitted` predictions or as
    `fitted_weights` {arm: weight}."""
    names = sorted(predictions_by_arm)
    if len(names) < 2:
        raise ValueError("a blend needs at least two arms")
    n = len(actual)
    if any(len(predictions_by_arm[a]) != n for a in names):
        raise ValueError("arms are scored on different rows — a blend null "
                         "compares arms on the SAME rows or it compares nothing")
    preds = [predictions_by_arm[a] for a in names]

    if fitted is None:
        if not fitted_weights:
            raise ValueError("supply fitted predictions or fitted_weights")
        fitted = _blend(preds, [fitted_weights.get(a, 0.0) for a in names])

    singles = {a: _mae(predictions_by_arm[a], actual) for a in names}
    champion = min(singles, key=lambda a: singles[a])
    champ_mae = singles[champion]
    fitted_mae = _mae(fitted, actual)

    rng = random.Random(seed)
    rand_maes = sorted(_mae(_blend(preds, _random_weights(len(names), rng)), actual)
                       for _ in range(draws))
    # An EQUAL-weight blend is the cheapest possible "averaging with no
    # information", and is reported because it is what a reader would try next.
    equal_mae = _mae(_blend(preds, [1.0 / len(names)] * len(names)), actual)

    p = (sum(1 for m in rand_maes if m <= fitted_mae) + 1) / (draws + 1)
    return {
        "k": len(names),
        "n_rows": n,
        "champion_arm": champion,
        "champion_mae": round(champ_mae, 4),
        "fitted_mae": round(fitted_mae, 4),
        "equal_weight_mae": round(equal_mae, 4),
        "random_weight_mae_mean": round(st.mean(rand_maes), 4),
        "random_weight_mae_p05": round(rand_maes[int(0.05 * len(rand_maes))], 4),
        # (1) the headline a blend author would report...
        "gain_over_champion": round(champ_mae - fitted_mae, 4),
        # ...(2) split into the part ANY blend gets, and the part the fit earned.
        "gain_from_averaging_alone": round(champ_mae - st.mean(rand_maes), 4),
        "gain_from_the_FITTED_weights": round(st.mean(rand_maes) - fitted_mae, 4),
        "p_value_vs_random_weights": round(p, 4),
        "weights_beat_random": p < 0.05,
        "beats_champion": fitted_mae < champ_mae,
    }


def expected_averaging_gain(k: int, rho: float, n: int = CAL_N,
                            draws: int = CAL_DRAWS, seed: int = SEED) -> float:
    """MAE the best single arm loses to a RANDOM-weight blend of k arms whose
    per-row errors have correlation rho. Per unit of error sd."""
    rng = random.Random(seed)
    out = []
    for _ in range(draws):
        common = [rng.gauss(0.0, 1.0) for _ in range(n)]
        arms = [[math.sqrt(rho) * c + math.sqrt(1 - rho) * rng.gauss(0.0, 1.0)
                 for c in common] for _ in range(k)]
        actual = [0.0] * n
        champ = min(_mae(a, actual) for a in arms)
        blend = _mae(_blend(arms, _random_weights(k, rng)), actual)
        out.append(champ - blend)
    return st.mean(out)


def calibration() -> dict:
    return {f"k={k}": {f"rho={r}": round(expected_averaging_gain(k, r), 4)
                       for r in CAL_RHO}
            for k in CAL_K}


def main() -> dict:
    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/random_weight_null.py",
        "_what": "BLEND-SEARCH-DESIGN.md §3's second owed null. How much MAE a "
                 "RANDOM-weight blend takes off the best single arm, purely "
                 "from averaging, per unit of per-row error sd.",
        "_read": "a fitted stacker must beat this before its WEIGHTS mean "
                 "anything. Beating the champion is not the same claim.",
        "draws": DRAWS,
        "calibration_sd1": calibration(),
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    return doc


if __name__ == "__main__":
    d = main()
    print("FREE MAE GAIN a RANDOM-weight blend takes off the best single arm")
    print("(per unit of per-row error sd; rho = correlation between arms' errors)\n")
    print(f"{'':8s}" + "".join(f"{r:>11s}" for r in ("rho=0.0", "rho=0.3", "rho=0.6", "rho=0.9", "rho=0.99")))
    for k, row in d["calibration_sd1"].items():
        print(f"{k:8s}" + "".join(f"{v:>11.4f}" for v in row.values()))
    c = d["calibration_sd1"]
    print(f"\nRead: 5 arms with INDEPENDENT errors hand a random blend "
          f"{c['k=5']['rho=0.0']:.4f} x sd for free; 5 near-identical arms (rho=0.99) "
          f"hand it {c['k=5']['rho=0.99']:.4f}.")
    print("So a blend of near-copies cannot buy much — and a blend of genuinely")
    print("different arms must clear a HIGHER bar before its weights mean anything.")
