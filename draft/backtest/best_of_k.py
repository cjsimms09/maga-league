# TERRITORY: D
"""BEST-OF-K — how big a winning margin do K arms with NO skill produce?

BLEND-SEARCH-DESIGN.md §3: "BEST-OF-K is the one this program does not yet have
and needs most. With five arms today it barely matters; with fifteen arms and
blends it is the difference between a finding and a coin flip. The champion's
margin must be compared against the spread of margins you would see from K arms
with no skill at all." Step 2, due 09-10. It existed nowhere in the repo.

THE STATISTIC — and the first version of this file got it WRONG, which the
calibration table caught before it shipped. I used
	margin = MAE(runner-up) - MAE(winner)
and that quantity SHRINKS as K grows: add arms and the top two bunch together.
It is a real test, but it is the opposite of the risk BLEND-SEARCH-DESIGN
describes. The statistic that grows with K -- the one that turns "with fifteen
arms it is the difference between a finding and a coin flip" into a number -- is
the winner's margin over the FIELD:
	field_margin = mean(MAE of all arms) - MAE(winner)
Both are reported. `field_margin` is the headline; the runner-up gap is kept
because a champion that barely beats second place is a different worry.
Under the null that arm identity carries no information, the per-row errors are
exchangeable ACROSS arms. So: permute the arm labels WITHIN each row, which
preserves how hard each row was and destroys arm skill, recompute every arm's
MAE, and take the resulting margin. Repeating that gives the distribution of
winning margins you would see from K arms that are all equally good.

WHY IT MATTERS MORE AS K GROWS: the null margin RISES with K. Picking the best
of fifteen arms buys a margin for free that picking the best of two does not,
and a program adding arms all season will drift into reporting that free margin
as a finding. `expected_margin` is the calibration table, so a study can be
sized BEFORE it runs rather than explained afterwards.

⚠️ THE LIMITATION, FOUND BY RUNNING IT ON MY OWN WORK AND WORTH READING BEFORE
YOU USE IT. best-of-K compares the winner to THE FIELD, not to doing nothing.
If the field contains arms you already know are bad, the field margin is
inflated and the p-value flatters the winner. Applied to opponent_arm's 8-point
lambda grid, TE's "winner" is lambda=0.00 -- i.e. DO NOTHING -- and it survives
at p=0.0033, which is true and says only that the tilts hurt TE.

So: field_margin is meaningful when the K arms are all SERIOUS CANDIDATES. A
parameter sweep that includes values known to be bad is not that, and for those
the runner-up margin and a comparison against an explicit baseline arm are the
honest reads. BLEND-SEARCH-DESIGN's fifteen-arm future is exactly the case
where a few weak arms could inflate the field.

USE IT LIKE collinearity_check: one call, before you believe a winner.

	from best_of_k import best_of_k
	best_of_k({"v1": errs_v1, "v1_tilt150": errs_2, ...})

Run: python3 draft/backtest/best_of_k.py     (prints the calibration table)
"""
from __future__ import annotations

import json
import random
import statistics as st
from pathlib import Path

OUT = Path(__file__).with_suffix(".json")

PERMUTATIONS = 2000
SEED = 20260818

#: Calibration grid. K is the arm count; n is the number of scored rows.
CAL_K = (2, 3, 5, 8, 10, 15, 20)
CAL_N = (200, 500, 1000, 2000)
CAL_DRAWS = 400


def _mae(errs) -> float:
    return sum(errs) / len(errs)


def best_of_k(errors_by_arm: dict, permutations: int = PERMUTATIONS,
              seed: int = SEED) -> dict:
    """errors_by_arm: {arm_name: [absolute error per row]}, all the same length
    and in the same row order. Returns the winner, its margin, and the p-value
    of that margin against the no-skill distribution."""
    names = sorted(errors_by_arm)
    if len(names) < 2:
        raise ValueError("best-of-K needs at least two arms")
    n = len(errors_by_arm[names[0]])
    if any(len(errors_by_arm[a]) != n for a in names):
        raise ValueError("arms are scored on different row counts — best-of-K "
                         "compares arms on the SAME rows or it compares nothing")

    maes = {a: _mae(errors_by_arm[a]) for a in names}
    order = sorted(names, key=lambda a: maes[a])
    winner, runner_up = order[0], order[1]
    margin = maes[runner_up] - maes[winner]
    field_margin = st.mean(maes.values()) - maes[winner]

    rows = [[errors_by_arm[a][i] for a in names] for i in range(n)]
    rng = random.Random(seed)
    draws = []
    for _ in range(permutations):
        totals = [0.0] * len(names)
        for row in rows:
            shuffled = list(row)
            rng.shuffle(shuffled)
            for j, v in enumerate(shuffled):
                totals[j] += v
        m = sorted(t / n for t in totals)
        draws.append((m[1] - m[0], st.mean(m) - m[0]))
    runner = sorted(d[0] for d in draws)
    field = sorted(d[1] for d in draws)
    p = (sum(1 for d in runner if d >= margin) + 1) / (permutations + 1)
    p_field = (sum(1 for d in field if d >= field_margin) + 1) / (permutations + 1)
    return {
        "k": len(names),
        "n_rows": n,
        "winner": winner,
        "runner_up": runner_up,
        "mae": {a: round(maes[a], 4) for a in names},
        # HEADLINE — grows with K, which is the risk the design doc names.
        "field_margin": round(field_margin, 4),
        "null_field_margin_mean": round(st.mean(field), 4),
        "null_field_margin_p95": round(field[int(0.95 * len(field))], 4),
        "field_p_value": round(p_field, 4),
        "survives": p_field < 0.05,
        "field_margin_net_of_null": round(field_margin - st.mean(field), 4),
        # Secondary — shrinks with K; a champion barely ahead of second place
        # is a different worry and worth seeing.
        "runner_up_margin": round(margin, 4),
        "null_runner_up_margin_mean": round(st.mean(runner), 4),
        "runner_up_p_value": round(p, 4),
    }


def expected_margin(k: int, n: int, sd: float = 1.0, draws: int = CAL_DRAWS,
                    seed: int = SEED, over: str = "field") -> float:
    """Mean best-of-K winning margin, in MAE units, for K NO-SKILL arms scored
    on n rows whose per-row errors have the given sd. Scales linearly in sd.

    over="field"     margin over the mean of all K arms — GROWS with K
    over="runner_up" margin over second place — SHRINKS with K
    """
    rng = random.Random(seed)
    out = []
    for _ in range(draws):
        maes = sorted(st.mean(rng.gauss(0.0, sd) for _ in range(n)) for _ in range(k))
        out.append(st.mean(maes) - maes[0] if over == "field" else maes[1] - maes[0])
    return st.mean(out)


def calibration(over: str = "field") -> dict:
    return {f"k={k}": {f"n={n}": round(expected_margin(k, n, over=over), 5)
                       for n in CAL_N}
            for k in CAL_K}


def main() -> dict:
    doc = {
        "_territory": "TERRITORY: D — produced by draft/backtest/best_of_k.py",
        "_what": "BLEND-SEARCH-DESIGN.md §3's owed null. Expected winning "
                 "margin for K no-skill arms, per unit of per-row error sd.",
        "_read": "multiply by the study's own per-row error sd to get the "
                 "free margin in points. A winner inside this is not a winner.",
        "permutations": PERMUTATIONS,
        "calibration_field_sd1": calibration("field"),
        "calibration_runner_up_sd1": calibration("runner_up"),
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    return doc


if __name__ == "__main__":
    d = main()
    for label, key in (("OVER THE FIELD — grows with K (headline)", "calibration_field_sd1"),
                       ("over the runner-up — shrinks with K", "calibration_runner_up_sd1")):
        print(f"\nFREE MARGIN, {label}, per unit of per-row error sd\n")
        print(f"{'':8s}" + "".join(f"{n:>12s}" for n in ("n=200", "n=500", "n=1000", "n=2000")))
        for k, row in d[key].items():
            print(f"{k:8s}" + "".join(f"{v:>12.5f}" for v in row.values()))
    f = d["calibration_field_sd1"]
    print(f"\nRead: on 500 rows, the best of 5 no-skill arms beats the field mean by "
          f"{f['k=5']['n=500']:.4f} x sd for free; the best of 20 by {f['k=20']['n=500']:.4f} — "
          f"{f['k=20']['n=500'] / f['k=5']['n=500']:.1f}x more.")
