#!/usr/bin/env python3
"""CEILING — THE INDEPENDENT REPLICATION. This is the promotion bar.

Prereg: draft/backtest/CEILING-FRESH-SEED-PREREG.md, committed BEFORE any result.

WHY IT EXISTS. The re-derivation (EXP-CEILING-REDERIVATION.md) and the bracket
(EXP-CEILING-BRACKET-RESULT.md) both ran on the SAME three seeds. That makes them
one experiment measured twice, however clean each looked. This run shares no seed
with either.

THE SEEDS ARE DERIVED, NOT PICKED. The prior runs used cory_conditional.SEED plus
the 1,000th / 10,000th / 100,000th primes. This uses the next rungs of the same
ladder — the 1,000,000th / 2,000,000th / 3,000,000th — so "these are the seeds it
worked on" was never an available outcome.

ONE WEIGHT, AND NOT THE BEST-SCORING ONE. w=0.45 is the positional MIDDLE of the
plateau the bracket found indistinguishable (0.30 / 0.45 / 0.65, means within
$0.6). The best-scoring point was 0.30; choosing it would be selection on exactly
the noise the bracket said not to read.

NO ANCHOR CONTROL HERE, deliberately. There is no shared arm to reproduce,
because sharing nothing is what makes this independent — see the prereg §4.

Run:  python3 draft/backtest/exp_ceiling_freshseed.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC                    # noqa: E402
import exp_ceiling_replicate as R                # noqa: E402

# The 1,000,000th / 2,000,000th / 3,000,000th primes, offset from CC.SEED.
PRIME_OFFSETS = (15485863, 32452843, 49979687)
SEEDS = [CC.SEED + p for p in PRIME_OFFSETS]
WEIGHTS = [0.45]


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 400

    # REFUSE IF THE INDEPENDENCE CLAIM IS FALSE. The entire value of this run is
    # that it shares no seed with the two that motivated it; if that ever stops
    # being true it is a third correlated measurement wearing the word
    # "replication", which is worse than not running it.
    overlap = sorted(set(SEEDS) & set(R.SEEDS))
    if overlap:
        print(f"REFUSED — seeds {overlap} were already used by "
              f"exp_ceiling_replicate. This would not be an independent "
              f"replication, and reporting it as one would be the error the "
              f"whole prereg sequence exists to prevent.")
        return 1

    per_seed = []
    for seed in SEEDS:
        totals = R.race(n, seed, weights=WEIGHTS)
        per_seed.append({"seed": seed,
                         **{f"w{w}": R._paired(totals, f"c{w}", seed) for w in WEIGHTS}})

    verdict, cols = R.summarise(per_seed, weights=WEIGHTS)
    pool = CC.load_world()[0]
    ratios = {round(p["proj_ceiling"] / p["proj_mean"], 6)
              for p in pool if (p.get("proj_mean") or 0) > 0}

    # The bar is the prereg's, stated as data so the write-up cannot soften it.
    c = cols[WEIGHTS[0]]
    cleared = c["n_pos"] == len(SEEDS) and c["n_sep"] >= 2

    out = {"experiment": "ceiling weight — independent fresh-seed replication",
           "prereg": "draft/backtest/CEILING-FRESH-SEED-PREREG.md",
           "rooms": n, "seeds": SEEDS, "prime_offsets": list(PRIME_OFFSETS),
           "weights": WEIGHTS,
           "seeds_shared_with_prior_runs": [],
           "board_distinct_ceiling_ratios": len(ratios),
           "live_ceiling_weight": R.LIVE_CEILING_WEIGHT,
           "per_seed": per_seed, "columns": {str(WEIGHTS[0]): c},
           "promotion_bar_cleared": cleared,
           "verdict": verdict}
    (HERE / "exp_ceiling_freshseed.json").write_text(json.dumps(out, indent=2))

    rows = "".join(f"| {s['seed']} | {s[f'w{WEIGHTS[0]}']['edge']:+.2f} | "
                   f"[{s[f'w{WEIGHTS[0]}']['ci95'][0]:+.2f}, "
                   f"{s[f'w{WEIGHTS[0]}']['ci95'][1]:+.2f}] | "
                   f"{'yes' if s[f'w{WEIGHTS[0]}']['separable'] else 'no'} |\n"
                   for s in per_seed)
    (HERE / "EXP-CEILING-FRESHSEED.md").write_text(
        "# CEILING — INDEPENDENT FRESH-SEED REPLICATION (the promotion bar)\n\n"
        f"_{n} paired rooms · w={WEIGHTS[0]} vs the shipped "
        f"{R.LIVE_CEILING_WEIGHT} · prereg `CEILING-FRESH-SEED-PREREG.md`_\n\n"
        f"_Seeds share NOTHING with the two prior runs: CC.SEED + the "
        f"1,000,000th / 2,000,000th / 3,000,000th primes. Board: "
        f"**{len(ratios)}** distinct ceiling/mean ratios._\n\n"
        "| seed | edge vs shipped 0.0 | 95% CI | CI excludes 0 |\n|---|---|---|---|\n"
        + rows
        + f"\n**Mean +${c['mean']}** · positive {c['n_pos']}/{len(SEEDS)} · "
          f"separable {c['n_sep']}/{len(SEEDS)}\n\n"
        + ("**PROMOTION BAR CLEARED.** The evidence chain for moving "
           "`MEASURED_WEIGHTS.ceiling` off zero is complete. The decision is "
           "Cory's, after 2026-08-22 — a cleared bar makes the change available, "
           "it does not make it.\n" if cleared else
           "**PROMOTION BAR NOT CLEARED.** The weight does not move, and the two "
           "earlier runs are reported as NOT REPLICATED — not as 'two out of "
           "three agreed'. No fourth seed set: the prereg forbids it.\n")
        + f"\n**Verdict:** {verdict}\n")

    for s in per_seed:
        e = s[f"w{WEIGHTS[0]}"]
        print(f"seed {s['seed']}: {e['edge']:+.2f} "
              f"[{e['ci95'][0]:+.2f}, {e['ci95'][1]:+.2f}]"
              f"{'*' if e['separable'] else ''}")
    print("PROMOTION BAR:", "CLEARED" if cleared else "NOT CLEARED")
    print("VERDICT:", verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
