# TERRITORY: C
"""DO OWNER TENDENCIES PERSIST ACROSS SEASONS — the frozen method, `persistence/v1`.

THE QUESTION IT DECIDES. If tendencies do NOT persist, the room layer's 1.4% was the
ceiling, the negative was evidential, and no architecture fixes it. If they DO, the
negative was architectural and the room layer is a design problem with a payoff behind
it. Nothing had distinguished those worlds and the winter was being planned as though
the second were true.

WHY NOT PAIRWISE CORRELATION, which was this analysis's first cut. Six tendencies x three
season pairs = 18 Spearman correlations at n=10, needing |rho| >= 0.648 for p<0.05. Zero
crossed and the exercise answered nothing — the instrument had power only for persistence
so strong it would not have needed measuring.

THE DEPENDENCE STRUCTURE, which is why the effective n is neither 3 nor 30:
  30 owner-seasons, 10 owners x 3 seasons.
  But only TWO INDEPENDENT TRANSITIONS per owner — 23v25 is implied by 23v24 and 24v25.
  So ~20 independent owner-transitions per tendency.
  And six tendencies are NOT six independent tests: tendencies correlate within an owner.

SO THE INSTRUMENT IS A VARIANCE DECOMPOSITION. Persistence IS between-owner variance
exceeding within-owner-across-season variance. The statistic is the intraclass
correlation: the share of total variance lying between owners.

AND THE NULL IS A PERMUTATION, not a distribution. Shuffling values across owners
preserves the real structure and assumes nothing about shape. The seed is FIXED, because
a permutation p-value that changes between runs is not a result.

THE POOLED TEST USES ONE PERMUTATION PER REPLICATE ACROSS ALL SIX TENDENCIES. Permuting
each tendency independently would break the within-owner correlation that the dependence
structure says exists, and would understate the null.
"""
import collections
import random

SEED = 20260812
METRICS = ("QB1", "TE1", "K1", "DEF1", "RB_share5", "WR_share5")
VERSION = "persistence/v1"


def tendencies(picks, positions, exclude_keepers=True) -> dict:
    """{roster_id: {metric: value}} for one season's picks.

    Round-of-first-X is a TIMING habit; share-of-early-rounds is a STRATEGY. Both are
    computed from picks alone with no hindsight — nothing here reads realized points.

    KEEPERS ARE EXCLUDED BY DEFAULT, and C-001 is the reason.
    ---------------------------------------------------------
    The first cut of this counted every pick, and the result it produced was an
    artifact. In this league **every keeper lands in rounds 1-3, and keepers are 40.6%
    of all picks in rounds 1-5** — precisely the window `RB_share5` and `WR_share5`
    measure. **A kept player repeats BY CONSTRUCTION**: keeping the same running back
    two years running makes a manager's early-RB share similar across seasons for a
    reason that has nothing to do with how they draft.

    So including keepers does not add noise — it manufactures the very persistence the
    metric exists to detect, in the direction of the finding. Measured:

        RB_share5   ICC 0.672 (p=0.0032)  ->  0.390 (p=0.2501)
        POOLED      ICC 0.486 (p=0.0005)  ->  0.367 (p=0.1698)

    `K1` and `DEF1` are unchanged, which is the check that this is the mechanism and
    not a coincidence: kickers and defences are never kept.

    `exp_divergence.py` already encoded this rule — *"a keeper isn't a market
    decision"* — and this module did not. Pass `exclude_keepers=False` for the
    different question *"how much of your early ROSTER is RB"*, which is legitimate
    and is not what C-001 asked.
    """
    per = collections.defaultdict(lambda: {"first": {}, "n5": 0, "rb5": 0, "wr5": 0})
    for p in picks:
        r = p.get("roster_id")
        if r is None:
            continue
        if exclude_keepers and p.get("is_keeper"):
            continue
        d = per[r]
        pos = positions.get(str(p.get("player_id")))
        rd = p.get("round") or 0
        if pos and pos not in d["first"]:
            d["first"][pos] = rd
        if rd <= 5:
            d["n5"] += 1
            if pos == "RB":
                d["rb5"] += 1
            if pos == "WR":
                d["wr5"] += 1
    return {r: {"QB1": d["first"].get("QB"), "TE1": d["first"].get("TE"),
                "K1": d["first"].get("K"), "DEF1": d["first"].get("DEF"),
                "RB_share5": d["rb5"] / d["n5"] if d["n5"] else None,
                "WR_share5": d["wr5"] / d["n5"] if d["n5"] else None}
            for r, d in per.items()}


def icc(vals):
    """Between-owner share of total variance. `vals` is {owner: [value per season]}.

    Returns None rather than 0.0 when it cannot be computed — a degenerate set where
    every value is identical has NO between-owner signal to measure, and reporting 0.0
    would enter a mean as though it were a measurement.
    """
    flat = [v for vs in (vals or {}).values() for v in vs]
    if len(flat) < 4:
        return None
    gm = sum(flat) / len(flat)
    tot = sum((v - gm) ** 2 for v in flat)
    if tot == 0:
        return None
    return sum(len(vs) * ((sum(vs) / len(vs)) - gm) ** 2 for vs in vals.values()) / tot


def _reshuffle(vals, rng):
    """Redeal every value across owners, keeping each owner's count."""
    flat = [v for vs in vals.values() for v in vs]
    rng.shuffle(flat)
    out, i = {}, 0
    for k, vs in vals.items():
        out[k] = flat[i:i + len(vs)]
        i += len(vs)
    return out


def permutation_p(vals, reps=20000, seed=SEED):
    """(observed ICC, p). +1 in numerator and denominator: a permutation p is never 0."""
    obs = icc(vals)
    if obs is None:
        return None, None
    rng = random.Random(seed)
    hits = sum(1 for _ in range(reps) if (icc(_reshuffle(vals, rng)) or 0) >= obs)
    return obs, (hits + 1) / (reps + 1)


def pooled_p(by_metric, reps=20000, seed=SEED):
    """Mean ICC across tendencies, against ONE permutation per replicate.

    THE JOINT NULL IS THE POINT. Permuting each tendency independently breaks the
    within-owner correlation the dependence structure says exists, which makes the null
    tighter than reality and the result look stronger than it is.
    """
    obs = [icc(v) for v in by_metric.values()]
    obs = [c for c in obs if c is not None]
    if not obs:
        return None, None
    obs_mean = sum(obs) / len(obs)
    rng = random.Random(seed)
    hits = 0
    for _ in range(reps):
        ms = [icc(_reshuffle(v, rng)) for v in by_metric.values()]
        ms = [c for c in ms if c is not None]
        if ms and sum(ms) / len(ms) >= obs_mean:
            hits += 1
    return obs_mean, (hits + 1) / (reps + 1)
