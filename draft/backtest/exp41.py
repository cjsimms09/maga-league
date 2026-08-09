#!/usr/bin/env python3
"""EXPERIMENT 41 — THE CALIBRATION-WEIGHTED ENSEMBLE (the combiner core).

The most robust finding in forecasting is that AGGREGATING diverse models beats
SELECTING the best one. We have 8 strategy profiles and a Lab that grades them, so
combine them with weights earned by MEASURED calibration — not preference, not
equal. Its point aims straight at our actual problem (a 74% deviation rate on
100%-LEAN evidence): **an ensemble deviates only where its members AGREE;
disagreement collapses the recommendation toward market.** That is an anchor that
emerges from STRUCTURE rather than an imposed threshold — it may do what the inert
T=4.0 cap could not, and member disagreement may be a better contested-decision
detector than any hand-tuned number (possibly free).

WHAT THIS FILE IS. The pure, unit-tested COMBINER: given, at one pick, each
profile's ranking of the available board and each profile's Lab-measured accuracy
weight, it produces
  1. the ensemble recommendation (calibration-weighted Borda aggregation);
  2. the AGREEMENT level = the confidence number the surface has been missing;
  3. the structural deviate-or-collapse decision (deviate from the market consensus
     ONLY when a weighted MAJORITY of the profiles agree on the same non-consensus
     player — a principled majority, not a tuned threshold);
  4. the ensemble's INTERVENTION RATE across a draft, to compare against the
     composite's 74%.

WHAT IS DEFERRED (the egress increment, wired to the existing JS harness). Producing
each profile's per-pick RANKING requires scoring the board under each weight profile
through `draft/backtest/strategies.js`'s replay path (Node + nflverse/FFC egress),
and the paired-room money-graded race of ensemble-vs-composite runs behind the green
bridge gate with the same null + leave-one-season-out gates as the tournament. This
core is the piece that decides HOW to combine; the harness that FEEDS it the eight
rankings and money-grades the outcome is the next unit, and it reuses machinery that
already exists (strategies.js PROFILES + the bridge). Marked, not smuggled.

THE WEIGHTS come from measurement, per the registry: each profile's accuracy is its
Lab-measured historical performance (the tournament's paired dollar edge, and/or the
per-(round×position) efficiency exp 36 produced). This module takes the weights as
input so the SOURCE of accuracy is a wiring choice, not baked into the combiner.

PRE-REGISTERED (registry): expect the ensemble deviates LESS often and more
accurately than the single composite. If it deviates just as often, the profiles are
not diverse enough to be an ensemble — and THAT is the finding. Ships nothing to the
surface until measured past the gates.

Pure core unit-tested in draft/tests/test_exp41.py (no egress).
"""
from __future__ import annotations

# The eight profiles (mirrors strategies.js PROFILES keys; 'default' is the market-
# tracking baseline / consensus proxy when no external ADP consensus is supplied).
PROFILE_KEYS = ["default", "value_anchor", "tier_hunter", "need_filler",
                "upside_late", "scarcity", "keeper_builder", "slider_defaults"]

# A weighted MAJORITY of profile weight must back the same non-consensus player for
# the ensemble to DEVIATE. 0.5 is a majority — principled, not a tuned dial. The
# whole design goal is an anchor that is not a hand-set threshold, so the only
# number here is the definition of "most of them agree".
MAJORITY = 0.5


def normalize_weights(weights: dict) -> dict:
    """Non-negative profile weights, renormalized to sum 1. A missing/negative
    weight is treated as 0 (a profile the Lab could not credit gets no vote)."""
    clean = {k: max(0.0, float(v)) for k, v in weights.items()}
    total = sum(clean.values())
    if total <= 0:
        # no measured credit anywhere -> equal vote, stated by the caller's report
        n = len(clean) or 1
        return {k: 1.0 / n for k in clean}
    return {k: v / total for k, v in clean.items()}


def borda_scores(rankings: dict, candidates: list[str]) -> dict:
    """Per-profile Borda score in [0,1] for each candidate: (N-1-rank)/(N-1), best
    rank 0 -> 1.0. A candidate a profile did not rank gets 0 from that profile.
    `rankings`: {profile: [pid, ...] best-first}. Returns {profile: {pid: score}}."""
    n = len(candidates)
    out: dict[str, dict[str, float]] = {}
    for prof, order in rankings.items():
        pos = {pid: i for i, pid in enumerate(order)}
        out[prof] = {pid: (1.0 - pos[pid] / (n - 1)) if (pid in pos and n > 1) else
                     (1.0 if (pid in pos and n == 1) else 0.0)
                     for pid in candidates}
    return out


def ensemble_pick(rankings: dict, weights: dict, candidates: list[str],
                  consensus: str | None = None) -> dict:
    """Combine the profiles' rankings into one recommendation, with confidence.

    Returns:
      recommend        — the calibration-weighted Borda argmax (the ensemble's
                         preferred player before the collapse rule).
      agreement        — weighted share of profile weight whose TOP-1 pick is the
                         ensemble recommendation: the confidence number [0,1].
      final            — the recommendation IF a weighted majority agrees on a
                         non-consensus player, else the consensus (collapse to
                         market). When consensus is None, final == recommend.
      deviates         — final != consensus (only meaningful with a consensus).
      scores           — weighted Borda score per candidate.
      top1_weight      — {pid: weight backing it at rank 1}, the vote distribution.
    """
    w = normalize_weights({k: weights.get(k, 0.0) for k in rankings})
    bs = borda_scores(rankings, candidates)
    scores = {pid: round(sum(w[p] * bs[p].get(pid, 0.0) for p in rankings), 4)
              for pid in candidates}
    recommend = max(candidates, key=lambda pid: scores[pid]) if candidates else None

    # top-1 weighted vote distribution (each profile's own #1 among candidates)
    top1_weight: dict[str, float] = {}
    for p in rankings:
        first = next((pid for pid in rankings[p] if pid in set(candidates)), None)
        if first is not None:
            top1_weight[first] = round(top1_weight.get(first, 0.0) + w[p], 4)
    agreement = round(top1_weight.get(recommend, 0.0), 4)

    # structural collapse rule: deviate from consensus ONLY on a weighted majority.
    if consensus is None:
        final = recommend
    else:
        winner_share = top1_weight.get(recommend, 0.0)
        if recommend != consensus and winner_share >= MAJORITY:
            final = recommend          # the members agree enough to earn the deviation
        else:
            final = consensus          # disagreement -> collapse to market
    return {"recommend": recommend, "agreement": agreement, "final": final,
            "deviates": (consensus is not None and final != consensus),
            "consensus": consensus, "scores": scores, "top1_weight": top1_weight}


def intervention_rate(picks: list[dict]) -> dict:
    """Across a draft's picks, how often the ensemble deviated from consensus, and
    the mean agreement (confidence). `picks`: list of ensemble_pick() results that
    carried a consensus. Compares against the composite's 74% deviation rate."""
    graded = [p for p in picks if p.get("consensus") is not None]
    n = len(graded)
    dev = sum(1 for p in graded if p["deviates"])
    mean_agree = round(sum(p["agreement"] for p in graded) / n, 4) if n else None
    return {"n": n, "deviations": dev,
            "intervention_rate": round(dev / n, 4) if n else None,
            "mean_agreement": mean_agree,
            "composite_rate": 0.737,
            "less_than_composite": (dev / n < 0.737) if n else None,
            "pre_registered": "ensemble expected to deviate LESS often than the composite's 73.7%; "
                              "if it deviates just as often, the profiles are not diverse enough "
                              "to be an ensemble — and THAT is the finding."}


def confidence_band(agreement: float) -> str:
    """The surface's missing confidence, from structure not a slider: near-unanimous
    -> strong; split -> collapse-to-consensus. Named plainly, no ceremony."""
    if agreement >= 0.75:
        return "strong agreement — confident, may deviate"
    if agreement >= MAJORITY:
        return "majority agreement — deviate only if it clears the consensus"
    return "split — collapse to consensus and say so"
