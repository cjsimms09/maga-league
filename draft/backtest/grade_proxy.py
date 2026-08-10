"""THE CONTINUOUS GRADING PROXY — standard across all money grading (E1, 2026-08-10).

WHY THIS IS STANDARD, NOT ONE-OFF. Dollars are the objective, and the payout table
already prices wins, playoff entry and the championship correctly — so there is no
separate wins/playoff objective to add (that would double-count). But the dollar
grade is THRESHOLD-LUMPY, and on our data that is not a caveat, it is the default
condition: our seat missed the playoffs all three seasons, so the $2,125 playoff
pool and the $375 regular-season pool NEVER ACTIVATED for any policy in any year.
Only the weekly-high channel (~37% of the pot) could move. A roster that finished
fifth and one that finished tenth graded IDENTICALLY at $0 in the dead channels.

Which means some retired "nulls" may be threshold artifacts — decisions made on
evidence that did not exist — rather than findings. This proxy is the higher-power
instrument that sees roster quality even when the seat never cashes:

  * exp_weekly_high_wins  — the $100/week smoothed into a WIN PROBABILITY by
    integrating over week-to-week noise, so losing the high by 0.5 pts reads ~0.45,
    not 0 (the ceiling/boom thesis lives here).
  * mean_weekly_rank      — consistency a boom-or-bust roster never shows in dollars
    (the floor thesis lives here).
  * playoff_window_points — weeks 15-17 lineup points, the playoff channel made
    CONTINUOUS so it fires without the seat making the bracket.

TWO CAVEATS THAT TRAVEL WITH IT, ALWAYS (Cory, 2026-08-10):
  1. It is a SENSITIVITY, not a second currency. Report "changed roster quality
     without cashing", NEVER "earns $X". The proxy->dollars link (weekly-high
     PROBABILITY -> weekly-high WINS) is itself unclosed — the SAME open question
     as the stack weight and the correlated-variance gap. Three items rest on one
     link; the stack conversion test (D3) closes it for all three.
  2. It squeezes more signal from the SAME data; it does not fix the binding
     constraint. The real fix is more data (the external-sample ingest).

Pure over dicts, deterministic (numeric integration, no RNG/scipy), unit-tested.
This is the ONE definition; exp_construction_objective and money_grade both import
it — never a second copy (the two-places disease the graduation gate exists to kill).
"""
from __future__ import annotations

import math


def normal_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def residual_weekly_sigma(field: dict, weeks: list) -> float | None:
    """The typical week-to-week SWING: pooled SD of (a team's weekly score minus its
    own mean over these weeks) — the scale at which a weekly-high could have gone the
    other way. Pre-registered as the smoothing scale (data-set, not tuned to answer)."""
    by_team: dict = {}
    for w in weeks:
        for rid, sc in (field.get(w) or {}).items():
            by_team.setdefault(rid, []).append(float(sc))
    resid: list = []
    for scores in by_team.values():
        if len(scores) < 2:
            continue
        m = sum(scores) / len(scores)
        resid.extend(s - m for s in scores)
    if len(resid) < 2:
        return None
    return math.sqrt(sum(r * r for r in resid) / len(resid))


def week_win_prob(my: float, others: list, sigma: float | None,
                  lo: float = -5.0, hi: float = 5.0, step: float = 0.05) -> float:
    """P(my seat posts the strict weekly high) with every score carrying iid N(0,sigma)
    noise — numeric integration over my seat's noise, deterministic. sigma None/<=0
    falls back to the hard indicator (ties shared)."""
    if not others:
        return 1.0
    top = max(others)
    if sigma is None or sigma <= 0:
        if my > top:
            return 1.0
        if my < top:
            return 0.0
        return 1.0 / (1 + sum(1 for o in others if o == my))
    total = dens = 0.0
    z = lo
    while z <= hi + 1e-9:
        phi = math.exp(-0.5 * z * z)
        x = my + z * sigma
        prod = 1.0
        for o in others:
            prod *= normal_cdf((x - o) / sigma)
        total += phi * prod
        dens += phi
        z += step
    return total / dens if dens else 0.0


def grade_policy_proxies(field: dict, my_weekly: dict, roster_id, rs_weeks: list,
                         po_weeks: list, sigma: float | None) -> dict:
    """The three finer metrics for one roster against the real field (my seat
    substituted). Pure over dicts; unit-tested with synthetic fields."""
    sub = {w: dict(scores) for w, scores in field.items()}
    for w, pts in my_weekly.items():
        if int(w) in sub and roster_id in sub[int(w)]:
            sub[int(w)][roster_id] = float(pts)
    exp_wins = exact_wins = 0.0
    ranks: list = []
    for w in rs_weeks:
        scores = sub.get(w) or {}
        if roster_id not in scores:
            continue
        my = scores[roster_id]
        others = [sc for rid, sc in scores.items() if rid != roster_id]
        exp_wins += week_win_prob(my, others, sigma)
        exact_wins += 1.0 if (others and my > max(others)) else 0.0
        ranks.append(1 + sum(1 for o in others if o > my))
    playoff_pts = sum(float(my_weekly.get(w, 0.0)) for w in po_weeks)
    return {"exp_weekly_high_wins": round(exp_wins, 4),
            "exact_weekly_high_wins": round(exact_wins, 1),
            "mean_weekly_rank": round(sum(ranks) / len(ranks), 3) if ranks else None,
            "playoff_window_points": round(playoff_pts, 2)}


# The metric keys, so callers report a consistent set (and deltas over the same set).
PROXY_METRICS = ("exp_weekly_high_wins", "mean_weekly_rank", "playoff_window_points")
