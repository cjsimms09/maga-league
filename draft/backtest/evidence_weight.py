#!/usr/bin/env python3
"""DERIVED EVIDENCE WEIGHTING — weight is a FUNCTION, not a hand-assigned tier.

The static rule "external supporting, league primary" was a declared constant standing
in for a measurement — the exact anti-pattern PREFER-DERIVED-OVER-DECLARED forbids. This
replaces it with a weight COMPUTED from precision and measured transferability, that
recomputes on its own as evidence arrives.

THE PRINCIPLE, in code:
  * LEAGUE evidence gains weight as n grows — weight = its own PRECISION (inverse
    variance). 27 decisions and 200 decisions do not carry the same authority, and the
    scaling is automatic: a tighter interval simply weighs more. Nobody updates a constant.
  * EXTERNAL evidence is weighted by MEASURED TRANSFERABILITY, not assumption. Where an
    external finding predicts a direction our league data can check, we CHECK it; the
    weight follows the result. A source that keeps predicting our outcomes keeps its
    weight; one that diverges loses it. Its precision is discounted by t² (t in [0,1]).
  * THE CROSSOVER IS COMPUTED, per question. Opponent tendencies: our data already wins.
    Roster-construction shape: external wins today and may for years. `combine` reports
    which source DOMINATES for THIS question rather than applying one policy to all.
  * TRAJECTORY is recordable — `record` carries n and se for each source so a cited
    finding can show what weighted it and how that moved ("our weight on this doubled
    since 2026"). The Annual is the natural recompute point.

Until an external source has been checked against our outcomes, its transferability is a
flagged PLACEHOLDER (a low, explicit prior), never silent full weight — a placeholder
carries the measurement that would replace it, so it cannot calcify into an assumption.

Pure; unit-tested in draft/tests/test_evidence_weight.py.
"""
from __future__ import annotations
import math

# PLACEHOLDER (not a constant): the transferability of an external source we have NOT yet
# checked against our outcomes. Low on purpose — an unverified foreign source does not get
# to speak loudly. REPLACED by `measured_transferability(...)` the first time the source
# makes a prediction our league data checks.
PLACEHOLDER_TRANSFER = 0.25


def precision(se: float | None) -> float:
    """Inverse-variance precision. More decisions/seasons → tighter se → more weight,
    automatically as the data arrives. se<=0 or None → 0 (no usable precision)."""
    if se is None or se <= 0:
        return 0.0
    return 1.0 / (se * se)


def se_from_ci(lo: float | None, hi: float | None) -> float | None:
    """Standard error from a 95% CI: (hi-lo)/(2·1.96). Lets any bootstrap CI in the Lab
    feed the weighting directly, so precision is READ from the interval, not declared."""
    if lo is None or hi is None:
        return None
    return abs(hi - lo) / 3.92


def measured_transferability(checks: list[dict]) -> float | None:
    """Transferability = how often the external source's DIRECTION matched our league
    data's, over the questions we could check. `checks`: [{predicted_dir, our_dir}] with
    dir in {+1,-1,0}. Returns [0,1], or None (→ placeholder) when nothing is checked yet.
    This is the whole discipline: measured, not assumed."""
    graded = [c for c in checks if c.get("our_dir") not in (None, 0)]
    if not graded:
        return None
    agree = sum(1 for c in graded
                if (c["predicted_dir"] > 0) == (c["our_dir"] > 0))
    return round(agree / len(graded), 3)


def combine(league: dict, external: dict, transferability: float | None = None) -> dict:
    """Inverse-variance combination of a league finding and an external one, external
    precision discounted by transferability². Each finding: {estimate, se, n}.

    Returns the posterior estimate, each source's WEIGHT SHARE, which source DOMINATES
    (the computed crossover for this question), whether transferability is a placeholder,
    and a `record` for the trajectory log."""
    wl = precision(league.get("se"))
    placeholder = transferability is None
    t = PLACEHOLDER_TRANSFER if placeholder else max(0.0, min(1.0, transferability))
    we = (t * t) * precision(external.get("se"))
    tot = wl + we
    if tot <= 0:
        return {"posterior": league.get("estimate"), "weights": {"league": 0.0, "external": 0.0},
                "dominant": "none", "transferability": (None if placeholder else t),
                "transferability_is_placeholder": placeholder}
    share_l, share_e = wl / tot, we / tot
    le, ee = league.get("estimate"), external.get("estimate")
    if le is not None and ee is not None:
        post = round(share_l * le + share_e * ee, 4)
    else:
        post = le if le is not None else ee
    return {
        "posterior": post,
        "weights": {"league": round(share_l, 3), "external": round(share_e, 3)},
        "dominant": "league" if wl >= we else "external",
        "transferability": (None if placeholder else round(t, 3)),
        "transferability_is_placeholder": placeholder,
        "record": {"n_league": league.get("n"), "se_league": league.get("se"),
                   "n_external": external.get("n"), "se_external": external.get("se"),
                   "t": t, "w_league": round(share_l, 3), "w_external": round(share_e, 3)},
    }


def crossover_se(external: dict, transferability: float | None = None) -> float:
    """The league standard error at which LEAGUE overtakes EXTERNAL for this question —
    how tight our interval must get to win. Makes 'when does our own data become better'
    computable per question instead of decided by hand. league wins when
    1/se_l² > t²·precision(se_ext) → se_l < 1/sqrt(that)."""
    t = PLACEHOLDER_TRANSFER if transferability is None else transferability
    we = (t * t) * precision(external.get("se"))
    return round(1.0 / math.sqrt(we), 4) if we > 0 else float("inf")


def append_trajectory(log: list[dict], stamp: str, combined: dict) -> list[dict]:
    """Append this recompute to a finding's weight trajectory so a citation can show the
    movement. `stamp` is passed in (no clock here — deterministic). The Annual appends one
    row a year; that IS the mechanism by which the weight structure evolves on its own."""
    row = {"stamp": stamp, "weights": combined.get("weights"),
           "dominant": combined.get("dominant"), "transferability": combined.get("transferability"),
           "n_league": (combined.get("record") or {}).get("n_league")}
    return list(log) + [row]
