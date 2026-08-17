#!/usr/bin/env python3
"""CEILING REPLICATION — does the interior positive at w≈1.0 hold across fresh seeds?

The participation curve found ceiling separably positive at w≈1.0-1.5 (+$23-26 over the
mask+value core) on ONE seed. It's the live lead (37.5% of the pot pays weekly-high, the
mechanism ceiling targets) and it would move a number in the config Cory drafts on (0.65 → 1.0),
so before acting it needs replication — a single-seed peak is exactly the kind of small effect
that wanders. This re-runs core vs core+ceiling at w∈{0.65,1.0,1.5} across THREE fresh,
independent seeds (paired MC each), and reports whether the sign+separability hold. Reuses
exp_participation (score/enrich/board_stats/_CORE) + cory_conditional rooms. Cheap.
"""
from __future__ import annotations
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402
import exp_participation as P          # noqa: E402
import exp_keeper_b0 as B0             # noqa: E402

# fresh seeds, disjoint from CC.SEED (the participation run's seed) so this is a real replication
SEEDS = [CC.SEED + 7919, CC.SEED + 104729, CC.SEED + 1299709]
WEIGHTS = [0.65, 1.0, 1.5]


def _chooser(w, st):
    ww = dict(P._CORE); ww["ceiling"] = w
    return lambda b, i, r: [max(B0.startable_cap_filter(b, r), key=lambda p: P.score(p, r, ww, st))]


def race(n_rooms, seed):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    P.enrich(pool)
    st = P.board_stats(pool)
    arms = {"core": _chooser(0.0, st)}
    for w in WEIGHTS:
        arms[f"c{w}"] = _chooser(w, st)
    totals = {k: [] for k in arms}
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, ch in arms.items():
            r = random.Random(); r.setstate(opp_state)
            rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, ch, r)
            g = random.Random(); g.setstate(grade_state)
            totals[k].append(CC.grade_room(rosters, g)["total"])
    return totals


def _paired(totals, arm, seed):
    d = [a - b for a, b in zip(totals[arm], totals["core"])]
    lo, hi = CC.bootstrap_ci(d, random.Random(seed + 3))
    return {"edge": round(sum(d) / len(d), 2), "ci95": [round(lo, 2), round(hi, 2)],
            "separable": bool(lo > 0 or hi < 0)}


LIVE_CEILING_WEIGHT = 0.0                           # MEASURED_WEIGHTS.ceiling, engine.js


def summarise(per_seed, weights=None):
    """Score every weight column against the PREREGISTERED bar and phrase it.

    Returns (verdict, cols). Split out of main() 2026-08-17 for the same reason
    `attach_dispersion_loso` was split out of the harness CLI: the judgement was
    reachable only by a 3.5-minute simulation, so the branch that decides whether
    a result ships had never been executed against a case it should REFUSE. A
    verdict function that has only ever seen one outcome is not a verdict
    function, it is a caption.
    """
    # THE VERDICT USED TO READ ONE COLUMN AND CITE A WEIGHT THE TOOL DOES NOT SHIP.
    # Corrected 2026-08-17, AFTER the re-derivation run (CEILING-REDERIVATION-PREREG.md),
    # which is why the prereg says the instrument is left untouched *before* it.
    #
    # Two defects, and the run is what exposed them. (1) It judged the whole
    # experiment on `w=1.0` alone, so a weight that replicated in a DIFFERENT
    # column could not be reported however clean it was — and on the fixed board
    # the replicating column is w=0.65, which this logic would have summarised as
    # "leans positive, separable in only 1/3". (2) Every branch spoke of "the live
    # ceiling weight 0.65", but MEASURED_WEIGHTS.ceiling is 0.0 and has been since
    # the -4.8 [-26,+17] measurement. "Keep 0.65" named a setting that does not
    # exist, which turns a null result into a false reassurance.
    #
    # A summariser that can only see one arm is the same defect class as a board
    # field that can only take one value: it cannot report what it cannot look at.
    WEIGHTS_ = list(weights or WEIGHTS)
    n_seeds = len(per_seed)
    cols = {}
    for w in WEIGHTS_:
        xs = [s[f"w{w}"] for s in per_seed]
        cols[w] = {"mean": round(sum(x["edge"] for x in xs) / len(xs), 1),
                   "n_pos": sum(1 for x in xs if x["edge"] > 0),
                   "n_sep": sum(1 for x in xs if x["separable"])}
    # PREREGISTERED BAR: sign holds in ALL seeds AND separable in at least two.
    repl = [w for w in WEIGHTS_ if cols[w]["n_pos"] == n_seeds and cols[w]["n_sep"] >= 2]
    if repl:
        best = max(repl, key=lambda w: cols[w]["mean"])
        c = cols[best]
        edge_of_grid = (best == min(WEIGHTS_) or best == max(WEIGHTS_))
        verdict = (f"REPLICATES at w={best} — positive in all {n_seeds} fresh seeds "
                   f"(mean +${c['mean']}), separable in {c['n_sep']}/{n_seeds}, against a "
                   f"CORE arm whose ceiling weight is the shipped {LIVE_CEILING_WEIGHT}. A non-zero "
                   f"ceiling weight beats the shipped zero.")
        if edge_of_grid:
            verdict += (f" THE GRID DOES NOT BRACKET THE OPTIMUM: w={best} is the "
                        f"{'smallest' if best == min(WEIGHTS_) else 'largest'} weight tested, so the "
                        f"peak lies at or beyond the edge and this run cannot locate it.")
    else:
        pos_all = [w for w in WEIGHTS_ if cols[w]["n_pos"] == n_seeds]
        if pos_all:
            best = max(pos_all, key=lambda w: cols[w]["mean"])
            verdict = (f"LEANS positive — w={best} positive in all seeds (mean "
                       f"+${cols[best]['mean']}) but separable in only {cols[best]['n_sep']}/"
                       f"{n_seeds}. Directional only; the shipped {LIVE_CEILING_WEIGHT} stands.")
        else:
            # `+${mean}` glued a plus onto negatives and printed "+$-3.3". The
            # branch that reports a FAILURE is the one nobody proofreads.
            verdict = (f"UNSIGNABLE — no weight held its sign across all {n_seeds} seeds "
                       f"(means: " + ", ".join(
                           f"w{w} {'+' if cols[w]['mean'] >= 0 else '-'}${abs(cols[w]['mean'])}"
                           for w in WEIGHTS_)
                       + f"). The shipped {LIVE_CEILING_WEIGHT} stands.")
    return verdict, cols


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 400
    per_seed = []
    for seed in SEEDS:
        totals = race(n, seed)
        per_seed.append({"seed": seed, **{f"w{w}": _paired(totals, f"c{w}", seed) for w in WEIGHTS}})
    verdict, cols = summarise(per_seed)
    mean_w1 = cols[1.0]["mean"]                     # kept: consumers read mean_w1_0
    # STAMP THE BOARD THIS RAN AGAINST. Until 2026-08-17 every player's ceiling
    # was proj_mean x one constant, so the ceiling term was rank-identical to the
    # value term and this experiment could not have separated them. A future
    # reader must be able to tell a real-ceiling run from a degenerate one from
    # the artifact alone, without dating it — 1 distinct ratio means the run is
    # void whatever its verdict says.
    _pool = CC.load_world()[0]
    ratios = {round(p["proj_ceiling"] / p["proj_mean"], 6)
              for p in _pool if (p.get("proj_mean") or 0) > 0}
    out = {"experiment": "ceiling replication across fresh seeds", "rooms": n, "seeds": SEEDS,
           "per_seed": per_seed, "columns": {str(w): cols[w] for w in WEIGHTS},
           "board_distinct_ceiling_ratios": len(ratios),
           "live_ceiling_weight": LIVE_CEILING_WEIGHT,
           "mean_w1_0": mean_w1, "verdict": verdict}
    (HERE / "exp_ceiling_replicate.json").write_text(json.dumps(out, indent=2))
    (HERE / "EXP-CEILING-REPLICATE.md").write_text(
        "# CEILING WEIGHT vs THE SHIPPED ZERO — does it hold across fresh seeds?\n\n"
        f"_{n} paired rooms × {len(SEEDS)} fresh seeds · core = mask + value anchor, "
        f"ceiling weight {LIVE_CEILING_WEIGHT} (the shipped setting)_\n\n"
        f"_Board: **{len(ratios)}** distinct `proj_ceiling/proj_mean` ratios over the pool. "
        "**1 would VOID this experiment** — a constant-multiple ceiling is rank-identical to "
        "`proj_mean`, so no run against one can separate the ceiling weight from the value "
        "weight, whatever the table below says._\n\n"
        "| seed | w=0.65 | w=1.0 | w=1.5 |\n|---|---|---|---|\n"
        + "".join(f"| {s['seed']} | {s['w0.65']['edge']:+.0f}{'*' if s['w0.65']['separable'] else ''} "
                 f"| {s['w1.0']['edge']:+.0f}{'*' if s['w1.0']['separable'] else ''} "
                 f"| {s['w1.5']['edge']:+.0f}{'*' if s['w1.5']['separable'] else ''} |\n" for s in per_seed)
        + "| **mean** | "
        + " | ".join(f"**{cols[w]['mean']:+.1f}** ({cols[w]['n_sep']}/{len(SEEDS)} sep)"
                     for w in WEIGHTS) + " |\n"
        + f"\n_* = CI excludes 0._\n\n**Verdict:** {verdict}\n")
    for s in per_seed:
        print(f"seed {s['seed']}: " + "  ".join(
            f"w{w} {s[f'w{w}']['edge']:+.0f}{'*' if s[f'w{w}']['separable'] else ''}" for w in WEIGHTS))
    print("VERDICT:", verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
