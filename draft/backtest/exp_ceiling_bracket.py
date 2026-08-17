#!/usr/bin/env python3
"""CEILING BRACKET — where is the optimum, given that 0.65 was the grid's edge?

Prereg: draft/backtest/CEILING-BRACKET-PREREG.md, committed BEFORE any result.

WHY THIS EXISTS. The re-derivation (EXP-CEILING-REDERIVATION.md) found a ceiling
weight of 0.65 beating the shipped zero in 3/3 seeds, separably in 3/3 — and
0.65 was the SMALLEST weight on that grid. The effect fell monotonically as the
weight rose (0.65 > 1.0 > 1.5), so the peak sits at or below the edge and that
run could not locate it. This is a resolution problem, not a new hypothesis: the
same question, asked at a scale that can answer it.

THE CONTROL IS BUILT IN, AND IT IS THE POINT. w=0.65 is carried over from the
previous grid and MUST reproduce its numbers exactly (+27.56 / +52.50 / +26.56).
`race()` derives every room's RNG state from (seed, room) alone, never from
which arms are present, so a changed grid cannot move an existing arm. If 0.65
does not reproduce, something other than the grid changed and this run is void —
that check runs FIRST and refuses before any new number is reported.

Run:  python3 draft/backtest/exp_ceiling_bracket.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC                    # noqa: E402
import exp_ceiling_replicate as R                # noqa: E402

# Declared in the prereg before the run. 0.65 is the anchor carried over.
WEIGHTS = [0.15, 0.3, 0.45, 0.65]
SEEDS = R.SEEDS                                  # same three, so it is like-for-like

# The published w=0.65 per-seed edges, from EXP-CEILING-REDERIVATION.md. Quoted
# as data rather than re-read from the JSON on purpose: the JSON is overwritten
# by any re-run of that script, and a control that can be silently rewritten by
# the thing it controls is not a control.
ANCHOR_EDGES = {20268727: 27.56, 20365537: 52.5, 21560517: 26.56}
ANCHOR_TOL = 0.005


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 400
    per_seed = []
    for seed in SEEDS:
        totals = R.race(n, seed, weights=WEIGHTS)
        per_seed.append({"seed": seed,
                         **{f"w{w}": R._paired(totals, f"c{w}", seed) for w in WEIGHTS}})

    # ── REFUSE BEFORE REPORTING ────────────────────────────────────────────
    # Only meaningful at the preregistered room count; a --rooms smoke test is
    # a different experiment and is not entitled to the anchor's numbers.
    drift = []
    if n == 400:
        for s in per_seed:
            got = s["w0.65"]["edge"]
            want = ANCHOR_EDGES[s["seed"]]
            if abs(got - want) > ANCHOR_TOL:
                drift.append({"seed": s["seed"], "expected": want, "got": got})
    if drift:
        print("REFUSED — the carried-over w=0.65 arm did not reproduce:")
        for d in drift:
            print(f"  seed {d['seed']}: expected {d['expected']:+.2f}, got {d['got']:+.2f}")
        print("Something other than the grid changed (the board, the proxy, or the "
              "RNG wiring). Every number in this run would be measuring that "
              "instead of the ceiling weight, so none of them are reported.")
        return 1

    verdict, cols = R.summarise(per_seed, weights=WEIGHTS)
    pool = CC.load_world()[0]
    ratios = {round(p["proj_ceiling"] / p["proj_mean"], 6)
              for p in pool if (p.get("proj_mean") or 0) > 0}
    out = {"experiment": "ceiling weight bracket — is the optimum below 0.65?",
           "prereg": "draft/backtest/CEILING-BRACKET-PREREG.md",
           "rooms": n, "seeds": SEEDS, "weights": WEIGHTS,
           "anchor_control": {"weight": 0.65, "expected": ANCHOR_EDGES,
                              "reproduced": not drift and n == 400},
           "board_distinct_ceiling_ratios": len(ratios),
           "live_ceiling_weight": R.LIVE_CEILING_WEIGHT,
           "per_seed": per_seed, "columns": {str(w): cols[w] for w in WEIGHTS},
           "verdict": verdict}
    (HERE / "exp_ceiling_bracket.json").write_text(json.dumps(out, indent=2))

    head = "| seed | " + " | ".join(f"w={w}" for w in WEIGHTS) + " |\n"
    head += "|---" * (len(WEIGHTS) + 1) + "|\n"
    rows = "".join(
        f"| {s['seed']} | " + " | ".join(
            f"{s[f'w{w}']['edge']:+.0f}{'*' if s[f'w{w}']['separable'] else ''}"
            for w in WEIGHTS) + " |\n" for s in per_seed)
    mean = "| **mean** | " + " | ".join(
        f"**{cols[w]['mean']:+.1f}** ({cols[w]['n_sep']}/{len(SEEDS)} sep)"
        for w in WEIGHTS) + " |\n"
    (HERE / "EXP-CEILING-BRACKET.md").write_text(
        "# CEILING BRACKET — is the optimum below 0.65?\n\n"
        f"_{n} paired rooms × {len(SEEDS)} fixed seeds · core = the shipped "
        f"ceiling weight {R.LIVE_CEILING_WEIGHT} · prereg "
        "`CEILING-BRACKET-PREREG.md`_\n\n"
        f"_Board: **{len(ratios)}** distinct `proj_ceiling/proj_mean` ratios. "
        "**1 would VOID this run.**_\n\n"
        "_Control: w=0.65 is carried over from `EXP-CEILING-REDERIVATION.md` and "
        "reproduced its published edges exactly, so the finer grid did not "
        "disturb the arms it shares._\n\n"
        + head + rows + mean
        + f"\n_* = CI excludes 0._\n\n**Verdict:** {verdict}\n")

    for s in per_seed:
        print(f"seed {s['seed']}: " + "  ".join(
            f"w{w} {s[f'w{w}']['edge']:+.0f}{'*' if s[f'w{w}']['separable'] else ''}"
            for w in WEIGHTS))
    print("ANCHOR CONTROL: w=0.65 reproduced" if n == 400 else
          "ANCHOR CONTROL: skipped (not the preregistered room count)")
    print("VERDICT:", verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
