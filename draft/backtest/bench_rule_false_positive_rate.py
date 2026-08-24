# TERRITORY: D
"""How often would ADAPTATION-POLICY.md rule 1 bench an arm that is NOT worse?

Rule 1 as written: "any published arm grading below the champion for 3
consecutive graded weeks is BENCHED, automatically". One condition, no null
gate -- against promotion's FOUR conditions plus a best-of-K gate.

This measures the asymmetry in the unit that matters: the probability of
benching an arm that is genuinely EQUAL to the champion, over a real season.
It is a pure combinatorial/simulation question -- no league data needed, which
is why it can be answered today rather than after week 1.

CONTROLS (Rule 3e/3f) -- a rate this small could equally be a broken simulator:
  C1 ANALYTIC ANCHOR. For a single 3-week window and a coin-flip arm the
     answer is exactly 0.5**3 = 0.125. The simulator must reproduce that to
     within Monte Carlo error, or it is not simulating the rule.
  C2 KNOWN-POSITIVE AT THE EXTREME. An arm that loses every week must be
     benched with probability 1.0.
  C3 KNOWN-NEGATIVE AT THE OTHER EXTREME. An arm that wins every week must
     never be benched.
Each exits non-zero on failure.
"""
import json
import random
import sys
from pathlib import Path

SEED = 20260824
WEEKS = 17          # a full regular season of graded weeks
CONSECUTIVE = 3     # the rule as written
REPS = 200_000


def benched(losses: list, run: int) -> bool:
    """True if `run` consecutive losses ever occur."""
    streak = 0
    for lost in losses:
        streak = streak + 1 if lost else 0
        if streak >= run:
            return True
    return False


def rate(p_loss: float, weeks: int, run: int, reps: int, rng: random.Random) -> float:
    hit = 0
    for _ in range(reps):
        if benched([rng.random() < p_loss for _ in range(weeks)], run):
            hit += 1
    return hit / reps


def main() -> dict:
    rng = random.Random(SEED)
    # C1 -- single window, coin-flip arm, must be ~0.125
    c1 = rate(0.5, CONSECUTIVE, CONSECUTIVE, 40_000, rng)
    if abs(c1 - 0.125) > 0.01:
        print(f"CONTROL C1 FAILED: single-window rate {c1:.4f} != 0.125", file=sys.stderr)
        sys.exit(2)
    # C2 / C3 -- the extremes
    c2 = rate(1.0, WEEKS, CONSECUTIVE, 200, rng)
    c3 = rate(0.0, WEEKS, CONSECUTIVE, 200, rng)
    if c2 != 1.0 or c3 != 0.0:
        print(f"CONTROL C2/C3 FAILED: always-lose {c2}, always-win {c3}", file=sys.stderr)
        sys.exit(2)

    curve = {}
    for label, p in (("equal_to_champion", 0.50),
                     ("slightly_worse", 0.55),
                     ("clearly_worse", 0.70),
                     ("slightly_better", 0.45),
                     ("clearly_better", 0.30)):
        curve[label] = {
            "p_week_loss": p,
            "benched_at_3_consecutive_over_17_weeks": round(rate(p, WEEKS, 3, REPS, rng), 4),
            "benched_at_4_consecutive_over_17_weeks": round(rate(p, WEEKS, 4, REPS, rng), 4),
            "benched_at_5_consecutive_over_17_weeks": round(rate(p, WEEKS, 5, REPS, rng), 4),
        }
    return {
        "_territory": "TERRITORY: D",
        "_note": ("False-bench rate for ADAPTATION-POLICY.md rule 1. Written by "
                  "draft/backtest/bench_rule_false_positive_rate.py for A's open "
                  "ruling on rule 1 (implement it, or say benching is manual)."),
        "rule_as_written": f"{CONSECUTIVE} consecutive weekly losses to the champion",
        "season_weeks_assumed": WEEKS,
        "controls": {"single_window_coinflip": round(c1, 4),
                     "analytic_expectation": 0.125,
                     "always_loses_benched": c2,
                     "always_wins_benched": c3},
        "by_arm_quality": curve,
    }


if __name__ == "__main__":
    out = main()
    Path(__file__).with_suffix(".json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
