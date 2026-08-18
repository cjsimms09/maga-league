# TERRITORY: D
"""SHUFFLE — is this one arm's signal real, or is it a rank/scale proxy?

BLEND-SEARCH-DESIGN.md §3, the third and last of the three owed nulls (after
BEST-OF-K, register DS9, and RANDOM-WEIGHT, register DS10): "a signal that is
really a proxy for rank/scale -- permute the arm's values across players
within position." It existed nowhere as a reusable tool -- four separate
studies this session (asymmetric_env_arm.py, opponent_arm.py, and the trend
test inside emergent_coverage.py) each hand-rolled their own version of this
exact idea, so the fourth build is this one, extracted once and made callable
in one line by the next arm.

THE FAILURE MODE THIS CATCHES: an arm can look predictive purely because its
values happen to track a player's SCALE or RANK -- a bigger name gets a bigger
number -- without the arm containing any information about WHICH specific
player within that scale will actually outperform. Evaluated naively against
real outcomes, such an arm looks skilled, because scale/rank alone is already
predictive (a $60 RB1 outscores a $4 RB50 whatever the arm says). The test:
permute the arm's per-player VALUES among players of the SAME POSITION --
preserving the position's value distribution exactly, destroying which value
landed on which player -- and ask whether the arm's apparent skill survives.

TWO FORMS, because arms in this project take two shapes:

  signal_rank_null()   the arm IS a rating/ranking (e.g. a rookie evaluator
                        score, an opponent strength index). Tests raw Spearman
                        correlation with the outcome against the shuffled null.

  mae_arm_null()        the arm is a MULTIPLIER on a baseline prediction (the
                        shape every weekly arm in this project actually takes:
                        proj * (1 + lambda*(m-1))). Fits the best lambda on a
                        preregistered grid and compares its delta-MAE against
                        the same fit-and-score procedure run on shuffled m --
                        which is exactly what asymmetric_env_arm.py and
                        opponent_arm.py each built by hand.

Both shuffle WITHIN POSITION, never across it -- a QB's value landing on a
kicker is not the null this project means.

Run: python3 draft/backtest/shuffle_null.py   (prints calibration)
"""
from __future__ import annotations

import json
import random
import statistics as st
from pathlib import Path

OUT = Path(__file__).with_suffix(".json")

PERMUTATIONS = 2000
SEED = 20260818

CAL_N = (50, 100, 200, 500, 1000)
CAL_DRAWS = 500


def _rank(values: list) -> list:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        shared = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = shared
        i = j + 1
    return ranks


def _spearman(a: list, b: list) -> float:
    ra, rb = _rank(a), _rank(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return 0.0 if den == 0 else num / den


def _by_position(pids: list, position: dict) -> dict:
    out: dict[str, list] = {}
    for i, pid in enumerate(pids):
        out.setdefault(position[pid], []).append(i)
    return out


def _shuffle_within_position(values: list, groups: dict, rng: random.Random) -> list:
    out = list(values)
    for idxs in groups.values():
        vals = [out[i] for i in idxs]
        rng.shuffle(vals)
        for i, v in zip(idxs, vals):
            out[i] = v
    return out


def signal_rank_null(signal: dict, actual: dict, position: dict,
                     permutations: int = PERMUTATIONS, seed: int = SEED) -> dict:
    """Is `signal`'s raw Spearman correlation with `actual` real, or does a
    within-position reshuffle of signal's own values produce as much?

    signal, actual, position: {pid: value}, same pids required in all three.
    """
    pids = sorted(set(signal) & set(actual) & set(position))
    if len(pids) < 10:
        raise ValueError("shuffle null needs at least 10 shared rows to mean anything")
    groups = _by_position(pids, position)
    if any(len(idxs) < 2 for idxs in groups.values()):
        raise ValueError("every position group needs at least 2 players or it "
                         "cannot be shuffled at all")

    sig = [signal[p] for p in pids]
    act = [actual[p] for p in pids]
    observed = _spearman(sig, act)

    rng = random.Random(seed)
    draws = sorted(_spearman(_shuffle_within_position(sig, groups, rng), act)
                   for _ in range(permutations))
    p = (sum(1 for d in draws if abs(d) >= abs(observed)) + 1) / (permutations + 1)
    return {
        "n": len(pids),
        "positions": {pos: len(idxs) for pos, idxs in groups.items()},
        "observed_rho": round(observed, 4),
        "null_p95_abs_rho": round(sorted(abs(d) for d in draws)[int(0.95 * permutations)], 4),
        "p_value": round(p, 4),
        "survives": p < 0.05,
    }


def _mae(pairs) -> float:
    return sum(abs(p - a) for p, a in pairs) / len(pairs)


def mae_arm_null(baseline: dict, actual: dict, multiplier: dict, position: dict,
                 grid: tuple = (0.0, 0.25, 0.5, 0.75, 1.0),
                 permutations: int = PERMUTATIONS, seed: int = SEED) -> dict:
    """Does the best-fit lambda on `multiplier` beat the same fit procedure run
    on a within-position shuffle of multiplier's own values?

    baseline, actual, multiplier, position: {pid: value}. `multiplier` is m in
    proj = baseline * (1 + lambda*(m-1)); grid is fit IN-SAMPLE here (the
    arm's own leak protocol, e.g. leave-one-season-out, is the caller's job --
    this null answers only "is m real", not "did the fit leak").
    """
    pids = sorted(set(baseline) & set(actual) & set(multiplier) & set(position))
    if len(pids) < 10:
        raise ValueError("shuffle null needs at least 10 shared rows to mean anything")
    groups = _by_position(pids, position)
    if any(len(idxs) < 2 for idxs in groups.values()):
        raise ValueError("every position group needs at least 2 players or it "
                         "cannot be shuffled at all")

    base = [baseline[p] for p in pids]
    act = [actual[p] for p in pids]
    mult = [multiplier[p] for p in pids]
    base_mae = _mae(list(zip(base, act)))

    def best_delta(m: list) -> float:
        best = None
        for lam in grid:
            arm_mae = _mae([(b * (1.0 + lam * (v - 1.0)), a)
                            for b, v, a in zip(base, m, act)])
            gain = base_mae - arm_mae
            if best is None or gain > best:
                best = gain
        return best

    observed = best_delta(mult)
    rng = random.Random(seed)
    draws = sorted(best_delta(_shuffle_within_position(mult, groups, rng))
                   for _ in range(permutations))
    p = (sum(1 for d in draws if d >= observed) + 1) / (permutations + 1)
    return {
        "n": len(pids),
        "positions": {pos: len(idxs) for pos, idxs in groups.items()},
        "baseline_mae": round(base_mae, 4),
        "observed_delta_mae": round(observed, 4),
        "null_delta_mae_mean": round(st.mean(draws), 4),
        "null_delta_mae_p95": round(draws[int(0.95 * permutations)], 4),
        "p_value": round(p, 4),
        "survives": p < 0.05,
        "gain_net_of_null": round(observed - st.mean(draws), 4),
    }


# ── calibration: the noise floor for signal_rank_null, by n ────────────────

def expected_p95_rho(n: int, draws: int = CAL_DRAWS, seed: int = SEED) -> float:
    """The |rho| a genuinely random signal produces at its own 95th percentile,
    for a signal with NO real position structure (one flat group of size n) --
    the worst case, since real position grouping only shrinks each shuffle
    pool and tightens the null further."""
    rng = random.Random(seed)
    out = []
    for _ in range(draws):
        a = [rng.gauss(0.0, 1.0) for _ in range(n)]
        b = [rng.gauss(0.0, 1.0) for _ in range(n)]
        out.append(abs(_spearman(a, b)))
    out.sort()
    return out[int(0.95 * len(out))]


def calibration() -> dict:
    return {f"n={n}": round(expected_p95_rho(n), 4) for n in CAL_N}


def main() -> dict:
    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/shuffle_null.py",
        "_what": "BLEND-SEARCH-DESIGN.md §3's third owed null. The |rho| a "
                 "signal with ZERO real information produces at its own p95, "
                 "by sample size -- the floor signal_rank_null's p95 should "
                 "roughly match on a single flat position group.",
        "permutations": PERMUTATIONS,
        "calibration_p95_rho_by_n": calibration(),
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    return doc


if __name__ == "__main__":
    d = main()
    print("NOISE FLOOR: |rho| a ZERO-INFORMATION signal reaches at its own p95, by n\n")
    for k, v in d["calibration_p95_rho_by_n"].items():
        print(f"  {k:8s} {v:.4f}")
