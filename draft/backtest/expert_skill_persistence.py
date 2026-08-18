#!/usr/bin/env python3
# TERRITORY: relay — the GATE on Cory's arm, per EXPERT-SPREAD-CEILING-PREREG.md §9.
"""DOES EXPERT SKILL PERSIST? IF NOT, CORY'S ARM IS DEAD AND NOTHING ELSE MATTERS.

> **Cory, 2026-08-18:** *"Should we see which experts drafted better in 2025 then use
> those experts to apply to model for 2026"*

**THIS FILE IS THE GATE, NOT THE ARM.** It deliberately does not build a
skill-weighted consensus. Building one first and checking persistence afterwards is
how you end up defending a number instead of testing it.

── THE HAZARD THIS EXISTS TO CATCH ────────────────────────────────────────────

There are 207–239 experts per season. **The best-scoring one is almost certainly
lucky.** Rank 200 people on a noisy outcome and someone tops the list every time,
whether or not anybody has skill. Select 2025's leaders, apply them to 2026, and the
backtest looks superb because selection and evaluation shared a season.

The only honest question is whether the SAME experts score well again in a season
they were not selected on. So: score every expert separately in 2023, 2024 and 2025,
then correlate expert skill **across** seasons.

  * **persistence ≈ 0** → last year's leaders are last year's coin flips.
    **Cory's arm is dead**, and no amount of in-sample separation revives it.
  * **persistence > 0** → skill is real and selectable, and §9's rule applies:
    select on seasons strictly earlier than the season you evaluate on.

── WHY THE COMMON SET, AND WHY IT IS NOT OPTIONAL ─────────────────────────────

An expert who ranks 300 players and one who ranks 100 are not comparable on a raw
correlation: the deep ranker is scored on a longer, noisier tail and looks worse for
reasons that have nothing to do with judgement. §9 names this as the second null. So
every expert is scored on the SAME player set — those ranked by at least
`COMMON_FRACTION` of experts — and each expert's coverage is reported beside their
score so a reader can see who was scored on what.

── ZERO IS AN OUTCOME, NOT A MISSING VALUE ────────────────────────────────────

A ranked player with no realized points did not "fail to be graded" — for almost all
of them he played and scored nothing, which is precisely the bust an upside study is
about. Dropping them would score every expert only on the players who worked out,
which flatters everyone and erases the whole downside half of judgement. So a ranked
player absent from the realized store is scored **0**, and the count of such players
is reported.
"""
from __future__ import annotations

import json
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent

#: Fantasy regular season. Weeks 18+ in the realized store are NFL week 18 and the
#: playoffs, which no fantasy season counts.
FANTASY_WEEKS = range(1, 18)

#: An expert must have ranked at least this fraction of the common set to be scored.
MIN_EXPERT_COVERAGE = 0.80

#: A player must have been ranked by at least this fraction of experts to be IN the
#: common set.
COMMON_FRACTION = 0.80

#: Below this, a season's persistence number is noise and is reported as such.
MIN_SHARED_EXPERTS = 25


def spearman(a, b):
    """Rank correlation. Ties broken by order, which is fine at these n."""
    n = len(a)
    if n < 3:
        return None

    def rk(x):
        order = sorted(range(len(x)), key=lambda i: x[i])
        r = [0] * len(x)
        for j, i in enumerate(order):
            r[i] = j
        return r

    ra, rb = rk(a), rk(b)
    ma, mb = st.mean(ra), st.mean(rb)
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    den = (sum((v - ma) ** 2 for v in ra) * sum((v - mb) ** 2 for v in rb)) ** 0.5
    return round(num / den, 4) if den else None


def season_points(weekly_store: dict, weeks=FANTASY_WEEKS) -> dict:
    """`{sleeper_id: total points}` over the fantasy weeks only."""
    keep = set(weeks)
    out = {}
    for w in (weekly_store.get("weeks") or []):
        if int(w.get("week", 0)) not in keep:
            continue
        for pid, pts in (w.get("points") or {}).items():
            out[str(pid)] = out.get(str(pid), 0.0) + float(pts or 0.0)
    return out


def common_set(players, fraction=COMMON_FRACTION):
    """Players ranked by at least `fraction` of the experts present.

    Comparability, not tidiness: without it a deep ranker is scored on a longer,
    noisier tail than a shallow one and looks worse for no reason of judgement.
    """
    experts = set()
    for p in players:
        experts |= set(p.get("expert_ranks") or {})
    if not experts:
        return [], 0
    need = len(experts) * fraction
    return [p for p in players
            if len(p.get("expert_ranks") or {}) >= need], len(experts)


def score_experts(players, realized, name_to_pid, *, fraction=COMMON_FRACTION,
                  min_cov=MIN_EXPERT_COVERAGE) -> dict:
    """`{expert_id: {skill, n, ...}}` for one season.

    `skill` = Spearman(expert's rank, realized points), sign-flipped so that HIGHER
    IS BETTER: rank 1 should pair with the biggest score, and a raw correlation
    between "low rank number" and "high points" is negative.
    """
    pool, n_experts = common_set(players, fraction)
    # Resolve once, so a name that will not join is excluded from every expert
    # identically rather than shrinking a different set for each of them.
    joined, unjoined, zero_scored = [], 0, 0
    for p in pool:
        pid = name_to_pid(p["name"])
        if not pid:
            unjoined += 1
            continue
        pts = realized.get(pid)
        if pts is None:
            # Scored 0 on purpose — see the module docstring. A ranked player with no
            # realized points is a bust, not a missing measurement.
            pts = 0.0
            zero_scored += 1
        joined.append((p, float(pts)))

    by_expert = {}
    for p, pts in joined:
        for eid, rank in (p.get("expert_ranks") or {}).items():
            by_expert.setdefault(eid, []).append((rank, pts))

    need = len(joined) * min_cov
    out = {}
    for eid, pairs in by_expert.items():
        if len(pairs) < need or len(pairs) < 10:
            continue
        rho = spearman([r for r, _ in pairs], [pt for _, pt in pairs])
        if rho is None:
            continue
        out[eid] = {"skill": round(-rho, 4), "n": len(pairs)}
    return {
        "experts": out,
        "population": {
            "experts_present": n_experts,
            "experts_scored": len(out),
            "common_set": len(pool),
            "joined": len(joined),
            "unjoined_names": unjoined,
            "scored_zero_no_realized_points": zero_scored,
        },
    }


def persistence(scored_by_season: dict) -> list:
    """Correlate expert skill between CONSECUTIVE seasons. The gate."""
    out = []
    years = sorted(scored_by_season)
    for a, b in zip(years, years[1:]):
        ea, eb = scored_by_season[a]["experts"], scored_by_season[b]["experts"]
        shared = sorted(set(ea) & set(eb))
        rho = (spearman([ea[e]["skill"] for e in shared],
                        [eb[e]["skill"] for e in shared]) if len(shared) >= 3 else None)
        out.append({
            "from": a, "to": b, "shared_experts": len(shared), "rho": rho,
            "underpowered": len(shared) < MIN_SHARED_EXPERTS,
            "reading": _read(rho, len(shared)),
        })
    return out


def _read(rho, n):
    if rho is None:
        return "NOT MEASURABLE — too few shared experts."
    if n < MIN_SHARED_EXPERTS:
        return f"UNDERPOWERED at {n} shared experts; do not act on this number."
    if rho >= 0.30:
        return ("SKILL PERSISTS. Selecting experts on earlier seasons is defensible — "
                "§9's rule applies: select strictly before the season you evaluate.")
    if rho >= 0.10:
        return ("WEAK PERSISTENCE. Real but small; any selected subset must still beat "
                "the plain all-experts consensus and the random-subset null.")
    if rho > -0.10:
        return ("NO PERSISTENCE — this season's leaders do not repeat. Cory's arm is "
                "DEAD as specified: 'use the good experts' would mean 'use last "
                "year's lucky experts'.")
    return ("NEGATIVE PERSISTENCE — last season's leaders systematically underperform "
            "next season. That is mean reversion, not skill.")


def verdict(rows) -> str:
    usable = [r for r in rows if r["rho"] is not None and not r["underpowered"]]
    if not usable:
        return "NO USABLE MEASUREMENT — every transition is underpowered."
    m = st.mean([r["rho"] for r in usable])
    if m >= 0.30:
        return f"GATE PASSED — mean cross-season skill correlation {m:.3f}. Build the arm."
    if m >= 0.10:
        return (f"GATE MARGINAL — mean {m:.3f}. Skill is real but weak; the arm may be "
                f"built ONLY with §9's two nulls reported beside it.")
    return (f"GATE FAILED — mean cross-season skill correlation {m:.3f}. Expert skill "
            f"does not persist, so selecting 'the experts who drafted better' selects "
            f"noise. **CORY'S ARM DOES NOT SHIP.**")
