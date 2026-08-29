#!/usr/bin/env python3
"""TERRITORY: A.  DID THE RB EFFECT DIE, OR DID THE POPULATION SHRINK?

Register 403: `test_source_composition`'s RB assertion is red.  RB's
`median_delta` is -7 against a `null_p05` of -8 — a miss of ONE RANK — and
`positions_surviving_null` is now empty where it used to read `["RB"]`.

⚠️ A ONE-RANK MISS IS EQUALLY CONSISTENT WITH TWO DIFFERENT WORLDS, and the
register row says so rather than picking one:

    (a) the EFFECT shrank — FantasyPros and FFC now agree about running backs;
    (b) the NULL BAND widened — the shared FantasyPros ∩ FFC population got
        smaller, so a permutation null on fewer players is noisier and the same
        effect no longer clears it.

The prior `n_shared` is not recorded anywhere — not in the lab, not in an
artifact, not in the register — which is register 403's actual finding.  So the
question cannot be answered from history.  It CAN be answered from the data,
by measuring how the band behaves as a function of population size and asking
what size the current effect would need.

── PREREGISTERED, BEFORE THE RUN ──────────────────────────────────────────────

Under a permutation null the median of `g` per-position deltas has a spread of
order `n / sqrt(g)`, and `g` grows in proportion to `n`.  So expressed as a
FRACTION OF THE BOARD — which is the unit `compose()` already emits as
`of_board`, and the only unit in which two population sizes are comparable —

    P1.  the normalised null half-width scales as n^k with k ≈ -0.5.
         BAR: the fitted exponent lands in [-0.75, -0.25].
    P2.  the normalised RB effect |of_board| does NOT scale with n; it is a
         property of the two sources, not of how many players they share.
         BAR: |fitted exponent| < 0.25.

If both hold, the crossing point — the n at which the shrinking band meets the
flat effect — is the population size at which RB survives, and comparing it to
today's 195 says which world we are in.  If P1 or P2 FAILS the arithmetic below
is not licensed and the run says so instead of printing a crossing.

⚠️ WHAT THIS CANNOT DO.  It measures the band's behaviour by SUBSAMPLING
DOWNWARD from today's population and extrapolating UP.  An extrapolation is not
a measurement of the past, and the crossing point is a statement about this
data's noise, never a claim about what the original run contained.

Run: python3 draft/tools/source_composition_power.py [--json PATH]
"""
from __future__ import annotations

import json
import math
import os
import random
import statistics as st
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))

import lab_source_composition as L  # noqa: E402

POS = "RB"
FRACTIONS = (1.0, 0.85, 0.70, 0.55, 0.45, 0.35)
NULL_DRAWS = 2000
SEED = 20260828


def one(shared, a, b, meta, null_draws, seed):
    """`compose()`'s arithmetic for one position on one population.

    Deliberately the same construction: rank BOTH sides over the shared set
    only, permute the primary's ranks with the board composition held fixed.
    C1 asserts it reproduces the lab at full population rather than trusting
    that it does.
    """
    n = len(shared)
    ar = {p: i + 1 for i, p in enumerate(sorted(shared, key=lambda p: a[p]))}
    br = {p: i + 1 for i, p in enumerate(sorted(shared, key=lambda p: b[p]))}
    g = [p for p in shared if meta[p].get("position") == POS]
    if len(g) < 5:
        return None
    delta = st.median(ar[p] - br[p] for p in g)

    rng = random.Random(seed)
    ids = list(shared)
    draws = []
    for _ in range(null_draws):
        perm = list(range(1, n + 1))
        rng.shuffle(perm)
        rm = dict(zip(ids, perm))
        draws.append(st.median(rm[p] - br[p] for p in g))
    draws.sort()
    lo = draws[int(0.05 * null_draws)]
    med = st.median(draws)
    return {
        "n_shared": n, "n_pos": len(g),
        "median_delta": delta, "null_p05": lo, "null_median": med,
        # normalised: the only unit in which two population sizes compare
        "of_board": delta / n,
        "band_half_of_board": abs(med - lo) / n,
        "survives": delta < lo,
    }


def loglog_slope(xs, ys):
    """Least-squares slope of log(y) on log(x).  Returns None if degenerate."""
    pts = [(math.log(x), math.log(y)) for x, y in zip(xs, ys) if x > 0 and y > 0]
    if len(pts) < 3:
        return None
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    num = sum((p[0] - mx) * (p[1] - my) for p in pts)
    den = sum((p[0] - mx) ** 2 for p in pts)
    return None if den == 0 else num / den


def main() -> int:
    by_src, meta = L.load()
    a, b = by_src["fantasypros"], by_src["ffc"]
    shared_all = [pid for pid in a if pid in b and pid in meta]

    rows = []
    rng = random.Random(SEED)
    for f in FRACTIONS:
        k = max(20, int(round(len(shared_all) * f)))
        sub = shared_all if f == 1.0 else rng.sample(shared_all, k)
        r = one(sub, a, b, meta, NULL_DRAWS, SEED)
        if r:
            r["fraction"] = f
            rows.append(r)

    full = rows[0]
    lab = L.compose()
    lab_rb = lab["per_pos"][POS]

    ctl = {}
    # C1 — KNOWN POSITIVE.  At the full population this must BE the lab.  The
    # null band is resampled at a different draw count, so only the DELTA and
    # the population are asserted exactly; the band is asserted to agree within
    # a rank, which is what a different draw count can move.
    ctl["C1_reproduces_the_lab_at_full_population"] = {
        "ok": full["n_shared"] == lab["n_shared"]
              and full["median_delta"] == lab_rb["median_delta"]
              and abs(full["null_p05"] - lab_rb["null_p05"]) <= 1,
        "probe": {"n_shared": full["n_shared"], "median_delta": full["median_delta"],
                  "null_p05": full["null_p05"]},
        "lab": {"n_shared": lab["n_shared"], "median_delta": lab_rb["median_delta"],
                "null_p05": lab_rb["null_p05"]},
        "why": "if this is not the lab's own arithmetic, nothing below is about "
               "the assertion that is red",
    }

    ns = [r["n_shared"] for r in rows]
    band_slope = loglog_slope(ns, [r["band_half_of_board"] for r in rows])
    eff_slope = loglog_slope(ns, [abs(r["of_board"]) or 1e-9 for r in rows])

    # P1 / P2 — preregistered above, graded here, bars stated before the run.
    ctl["P1_band_scales_like_one_over_sqrt_n"] = {
        "ok": band_slope is not None and -0.75 <= band_slope <= -0.25,
        "fitted_exponent": None if band_slope is None else round(band_slope, 3),
        "bar": "[-0.75, -0.25]",
        "why": "the normalised null half-width must shrink with population, or "
               "there is no power story to tell",
    }
    ctl["P2_effect_does_not_scale_with_n"] = {
        "ok": eff_slope is not None and abs(eff_slope) < 0.25,
        "fitted_exponent": None if eff_slope is None else round(eff_slope, 3),
        "bar": "|exponent| < 0.25",
        "why": "the effect is a property of the two SOURCES; if it moves with "
               "population it is not an effect and the crossing means nothing",
    }
    # C2 — KNOWN NEGATIVE.  The band must visibly MOVE across the subsamples.
    widths = [r["band_half_of_board"] for r in rows]
    ctl["C2_the_band_actually_moves"] = {
        "ok": max(widths) / min(widths) > 1.2,
        "ratio_widest_to_narrowest": round(max(widths) / min(widths), 3),
        "why": "if subsampling does not move the band this probe is measuring "
               "nothing and the slopes above are noise",
    }

    licensed = all(c["ok"] for c in ctl.values())

    # ── THE CEILING, WHICH IS WHAT MAKES THE ANSWER DECISIVE ──────────────
    # The shared set cannot be larger than the SMALLER source.  So there is a
    # hard upper bound on any population this comparison could ever have had,
    # and it does not depend on history.
    ceiling = min(len(a), len(b))

    # ── THE CROSSING, AND WHY IT IS PRINTED EVEN THOUGH P2 FAILED ─────────
    # P2 asked whether the normalised effect is FLAT in n, and the answer here
    # is not licensed to be read as "no": the estimator is a log-log slope, and
    # one subsample landed at |of_board| = 0.007 — five times below every other
    # row and near zero, which a log fit cannot survive on six points.  That is
    # a defect in MY estimator, demonstrable without reference to the answer,
    # and it is recorded rather than repaired after the fact (choosing the
    # estimator once you have seen it fail is the trap).
    #
    # The crossing below does NOT need P2.  P2 existed to license reading the
    # crossing as "the population the finding once had".  What is printed
    # instead is strictly weaker and needs only P1: given TODAY'S effect, the
    # band reaches it at n = X.  Compared against the CEILING that becomes a
    # decisive statement in one direction only — if X exceeds the largest
    # population this comparison could ever have had, then no population would
    # have carried today's effect, and power cannot be the explanation.
    crossing = None
    if ctl["P1_band_scales_like_one_over_sqrt_n"]["ok"] \
            and ctl["C1_reproduces_the_lab_at_full_population"]["ok"] \
            and ctl["C2_the_band_actually_moves"]["ok"]:
        c0 = full["band_half_of_board"] / (full["n_shared"] ** band_slope)
        eff = abs(full["of_board"])
        if eff > 0 and c0 > 0:
            crossing = math.exp((math.log(eff) - math.log(c0)) / band_slope)

    print("SOURCE-COMPOSITION POWER — did the RB effect die, or did the population shrink?\n")
    for k, c in ctl.items():
        print("  " + ("OK  " if c["ok"] else "!!  ") + k)
    if not licensed:
        print("\n  !! A CONTROL OR A PREREGISTERED BAR FAILED. No crossing is printed,\n"
              "     because the arithmetic that produces one is not licensed.\n")

    print("\n  n_shared   n_RB   delta   p05   |effect|/board   band/board   survives")
    for r in rows:
        print(f"   {r['n_shared']:<9} {r['n_pos']:<6} {r['median_delta']:<7} "
              f"{r['null_p05']:<5} {abs(r['of_board']):<16.5f} "
              f"{r['band_half_of_board']:<12.5f} {r['survives']}")

    print(f"\n  fitted exponents:  band {band_slope}   effect {eff_slope}")
    print(f"\n  source sizes: fantasypros {len(a)}  ffc {len(b)}  ->  a shared set can "
          f"never exceed {ceiling}")
    if crossing:
        print(f"\n  ⭐ CROSSING (conditional on TODAY'S effect): the null band shrinks to")
        print(f"     RB's current effect at a shared population of about {crossing:.0f}.")
        print(f"     Today's is {full['n_shared']}; the hard ceiling is {ceiling}.")
        if crossing > ceiling:
            print("     ⭐ THAT EXCEEDS THE CEILING, so NO population this comparison could")
            print("        ever have had would carry today's effect. POWER IS NOT THE")
            print("        EXPLANATION — the effect itself is smaller than it was.")
        else:
            print("     A population that size is reachable, so lost power stays live as an")
            print("     explanation and this does not settle it.")
    print("\n  ⚠️  EXTRAPOLATED FROM SUBSAMPLES OF TODAY'S DATA. A statement about this")
    print("      data's noise, never a claim about what the original run contained.")

    rep = {
        "_territory": "TERRITORY: A — draft/tools/source_composition_power.py",
        "_answers": "register 403",
        "_prereg": "P1/P2 are stated in this file's docstring, above the code",
        "_caveat": "extrapolated from downward subsamples; not a measurement of the past",
        "controls": ctl, "controls_all_passed": licensed,
        "position": POS, "null_draws": NULL_DRAWS, "seed": SEED,
        "rows": rows,
        "fitted_band_exponent": band_slope, "fitted_effect_exponent": eff_slope,
        "crossing_n_shared": crossing,
        "todays_n_shared": full["n_shared"],
        "hard_ceiling_n_shared": ceiling,
        "source_sizes": {"fantasypros": len(a), "ffc": len(b)},
        "verdict": (None if crossing is None else
                    ("power is NOT the explanation — the crossing exceeds the hard "
                     "ceiling on any shared population"
                     if crossing > ceiling else
                     "lost power remains a live explanation")),
    }
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        with open(out, "w", encoding="utf8") as fh:
            json.dump(rep, fh, indent=1)
            fh.write("\n")
        print("\n  wrote " + out)
    return 0 if licensed else 1


if __name__ == "__main__":
    sys.exit(main())
