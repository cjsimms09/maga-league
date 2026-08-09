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


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 400
    per_seed = []
    for seed in SEEDS:
        totals = race(n, seed)
        per_seed.append({"seed": seed, **{f"w{w}": _paired(totals, f"c{w}", seed) for w in WEIGHTS}})
    # replication verdict: does w=1.0 stay POSITIVE (and mostly separable) across all seeds?
    w1 = [s["w1.0"] for s in per_seed]
    all_pos = all(x["edge"] > 0 for x in w1)
    n_sep = sum(1 for x in w1 if x["separable"])
    mean_w1 = round(sum(x["edge"] for x in w1) / len(w1), 1)
    if all_pos and n_sep >= 2:
        verdict = (f"REPLICATES — ceiling w=1.0 positive in all {len(SEEDS)} fresh seeds "
                   f"(mean +${mean_w1}, separable in {n_sep}/{len(SEEDS)}). The interior positive is "
                   f"real, not a single-seed artifact → raise the live ceiling weight 0.65 → 1.0.")
    elif all_pos:
        verdict = (f"LEANS positive — w=1.0 positive in all seeds (mean +${mean_w1}) but separable "
                   f"in only {n_sep}/{len(SEEDS)}. Directional; keep 0.65, treat 1.0 as favored-but-thin.")
    else:
        verdict = (f"DID NOT REPLICATE — ceiling w=1.0 changed sign across seeds (mean +${mean_w1}). "
                   f"The single-seed +$23 was noise; keep ceiling at 0.65, drop the 1.0 idea.")
    out = {"experiment": "ceiling replication across fresh seeds", "rooms": n, "seeds": SEEDS,
           "per_seed": per_seed, "mean_w1_0": mean_w1, "verdict": verdict}
    (HERE / "exp_ceiling_replicate.json").write_text(json.dumps(out, indent=2))
    (HERE / "EXP-CEILING-REPLICATE.md").write_text(
        "# CEILING REPLICATION — does the w≈1.0 positive hold across fresh seeds?\n\n"
        f"_{n} paired rooms × {len(SEEDS)} fresh seeds · core = mask + value anchor_\n\n"
        "| seed | w=0.65 | w=1.0 | w=1.5 |\n|---|---|---|---|\n"
        + "".join(f"| {s['seed']} | {s['w0.65']['edge']:+.0f}{'*' if s['w0.65']['separable'] else ''} "
                 f"| {s['w1.0']['edge']:+.0f}{'*' if s['w1.0']['separable'] else ''} "
                 f"| {s['w1.5']['edge']:+.0f}{'*' if s['w1.5']['separable'] else ''} |\n" for s in per_seed)
        + f"\n_* = CI excludes 0._\n\n**Verdict:** {verdict}\n")
    for s in per_seed:
        print(f"seed {s['seed']}: " + "  ".join(
            f"w{w} {s[f'w{w}']['edge']:+.0f}{'*' if s[f'w{w}']['separable'] else ''}" for w in WEIGHTS))
    print("VERDICT:", verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
