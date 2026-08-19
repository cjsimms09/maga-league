#!/usr/bin/env python3
"""B0 DECOMPOSITION — is "follow the market" one edge or two? (task #6, pre-draft)

B0-within-need is the installed draft policy and the only one that clears a real
null. But "follow ADP" bundles two different disagreements with the tool's own
board, and they have different draft-day consequences:

  * the board systematically ranks a set of RBs far below the market (rows
    2c/2d, re-scoped 08-18: the disagreement is RB-led), and E32 found the
    mechanism — one source lever (proj_mean == Sleeper; the under-market
    outliers are exactly where FantasyPros prices higher);
  * everywhere else, ADP and the board mostly agree, and following the market
    is a mild tie-break.

If B0's edge is mostly its RB half, the 8-seconds-a-pick instruction sharpens
from "trust ADP" to "trust ADP OVER THE BOARD SPECIFICALLY AT RB" — and it
converges with E32 from an entirely independent instrument (money-graded rooms
vs projection-source analysis). If the halves contribute evenly, the broad rule
stands and no sharper instruction is honest.

THE DECOMPOSITION, at the pick level (same certified room as exp_keeper_b0 —
paired seeds, shared weekly luck, bootstrap null, no new money function):

  balanced       VORP-greedy control (the harness's standard)
  b0_need        the installed policy: min ADP within unfilled starter need
  hyb_rb         b0_need's pick IF that pick is an RB, else balanced's pick
                 -> isolates B0's RB behaviour
  hyb_nonrb      b0_need's pick IF that pick is NOT an RB, else balanced's pick
                 -> isolates B0's everything-else behaviour

edge(b0_need) ~= edge(hyb_rb) + edge(hyb_nonrb) + interaction, all vs balanced
on the same rooms. The interaction term is reported, not assumed zero.

PREREGISTERED BLIND PREDICTIONS — committed before the first run, graded by the
run in this same file (ledger rows filed at commit time):

  P-dec1: hyb_rb carries the MAJORITY of b0_need's edge
          (mean_vs_balanced(hyb_rb) > 0.5 * mean_vs_balanced(b0_need)).
          Grounds: 2c/2d's RB-led disagreement + E32's one-lever mechanism.
  P-dec2: hyb_nonrb alone does NOT separate from balanced past the bootstrap
          null (its 95% CI includes 0).

DECISION RULE, fixed now: the sharper RB instruction reaches the draft-day
brief ONLY if P-dec1 grades TRUE with hyb_rb's own CI excluding 0. A miss on
either leaves the broad B0-within-need instruction unchanged. Nothing installs
into the engine either way — this is a briefing-sentence question.

Run: python3 draft/backtest/exp_b0_decomposition.py [n_rooms]
Writes exp_b0_decomposition.json next to this file.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402  certified seat+keeper+grader
from exp_keeper_b0 import _adp, need_filter, _counts  # noqa: E402  same masks, no re-derivation

SEED = CC.SEED


def _b0_pick(board, roster):
    return min(need_filter(board, roster), key=_adp)


def candidates():
    """Each non-control chooser returns a SINGLETON so draft_room's max(vorp)
    yields exactly the intended pick; `balanced` returns the whole board and
    lets VORP choose — identical to exp_keeper_b0's control."""
    def hyb_rb(b, i, r):
        p = _b0_pick(b, r)
        return [p] if p["position"] == "RB" else b

    def hyb_nonrb(b, i, r):
        p = _b0_pick(b, r)
        return b if p["position"] == "RB" else [p]

    return {
        "balanced":  lambda b, i, r: b,
        "b0_need":   lambda b, i, r: [_b0_pick(b, r)],
        "hyb_rb":    hyb_rb,
        "hyb_nonrb": hyb_nonrb,
    }


def race(n_rooms=200, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    cand = candidates()
    per_seed = {k: [] for k in cand}
    rb_taken = {k: [] for k in cand}
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        rosters_by = {}
        for k, chooser in cand.items():
            r = random.Random(); r.setstate(opp_state)     # SAME room per candidate
            rosters_by[k] = CC.draft_room(pool, my_keepers, opp_keepers, my_picks,
                                          chooser, r, heterogeneous=True)
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, rosters in rosters_by.items():
            g = random.Random(); g.setstate(grade_state)   # SAME weekly luck per candidate
            per_seed[k].append(CC.grade_room(rosters, g)["total"])
            rb_taken[k].append(sum(1 for p in rosters[0] if p["position"] == "RB"))
    return per_seed, rb_taken


def summarize(per_seed, rb_taken):
    rng = random.Random(SEED)
    ctrl = per_seed["balanced"]
    out = {}
    for k in per_seed:
        deltas = [a - b for a, b in zip(per_seed[k], ctrl)]
        mean = sum(deltas) / len(deltas)
        lo, hi = CC.bootstrap_ci(deltas, rng) if k != "balanced" else (0.0, 0.0)
        out[k] = {"mean_vs_balanced": round(mean, 2), "ci95": [round(lo, 2), round(hi, 2)],
                  "avg_RB_on_my_roster": round(sum(rb_taken[k]) / len(rb_taken[k]), 2)}
    b0 = out["b0_need"]["mean_vs_balanced"]
    rb = out["hyb_rb"]["mean_vs_balanced"]
    nrb = out["hyb_nonrb"]["mean_vs_balanced"]
    interaction = round(b0 - rb - nrb, 2)
    p_dec1 = bool(rb > 0.5 * b0)
    p_dec2 = bool(out["hyb_nonrb"]["ci95"][0] <= 0 <= out["hyb_nonrb"]["ci95"][1])
    rb_ci_excludes_zero = bool(out["hyb_rb"]["ci95"][0] > 0)
    return {
        "per_policy_vs_balanced": out,
        "decomposition": {"b0_need": b0, "rb_component": rb,
                          "nonrb_component": nrb, "interaction": interaction},
        "preregistered": {
            "P-dec1_rb_carries_majority": {"predicted": True, "graded": p_dec1},
            "P-dec2_nonrb_alone_is_null": {"predicted": True, "graded": p_dec2},
        },
        "decision_rule_fires": bool(p_dec1 and rb_ci_excludes_zero),
        "decision_rule": ("The sharper 'trust ADP over the board AT RB' briefing sentence "
                          "ships ONLY if P-dec1 is TRUE and hyb_rb's CI excludes 0; "
                          "otherwise the broad B0-within-need instruction stands unchanged."),
    }


def run(n_rooms=200):
    per_seed, rb_taken = race(n_rooms=n_rooms)
    doc = {"experiment": "B0 decomposition — market-follow vs RB-fade, Cory's seat",
           "n_rooms": n_rooms,
           "reuses": "cory_conditional load_world/draft_room/grade_room + exp_keeper_b0 masks",
           **summarize(per_seed, rb_taken)}
    return doc


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    doc = run(n)
    out = HERE / "exp_b0_decomposition.json"
    out.write_text(json.dumps(doc, indent=1))
    print(json.dumps(doc["decomposition"], indent=1))
    print(json.dumps(doc["preregistered"], indent=1))
    print("decision_rule_fires:", doc["decision_rule_fires"])
    print(f"wrote {out.name}")


if __name__ == "__main__":
    main()
