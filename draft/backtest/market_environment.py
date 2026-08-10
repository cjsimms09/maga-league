#!/usr/bin/env python3
"""SIGNAL B — the environment gap. The first independent market experiment.

Not the cheap fallback: the CLEANEST mapping to the model. Game total and spread
give implied team totals directly, so this needs NO player props, no stat-to-fantasy
conversion, and therefore has no coverage artifact. It is a complete, self-contained
measurement:

    ENVIRONMENT GAP = MODEL TEAM POINTS - MARKET IMPLIED TEAM POINTS

READ-ONLY. Nothing here touches projection, VORP, survival, tiers, scores or any
live recommendation. It observes; it never rewrites.

THE NAMING RULE IS ENFORCED IN CODE, not just observed. Nothing in this module
produces a quantity called "market-implied fantasy points" — that term is reserved
for a value whose every component is actually priced by a market. Team points ARE
fully priced by the total and the spread, which is exactly why Signal B is clean
and why the props path has to speak of a COMPONENT EXPECTATION instead.
"""
from __future__ import annotations


def implied_team_totals(total, spread) -> dict:
    """Market-implied points for both sides.

    `spread` is the FAVOURITE'S margin as a positive number — the amount by which
    the market expects them to win. The split is:

        favourite = total/2 + spread/2
        underdog  = total/2 - spread/2

    Worked: a 48.5 total with a 4.5-point favourite implies 26.5 and 22.0.
        48.5/2 = 24.25;  24.25 + 2.25 = 26.5;  24.25 - 2.25 = 22.0

    A NEGATIVE spread is REJECTED rather than silently flipped. "Favourite by
    -4.5" is not a statement about the game, it is a sign convention someone got
    wrong, and quietly reinterpreting it would swap which team the gap is measured
    against — a sign error that produces two plausible numbers and no error.
    """
    if total is None or spread is None:
        return {"ok": False, "why": "total or spread absent"}
    t, s = float(total), float(spread)
    if t <= 0:
        return {"ok": False, "why": f"non-positive game total {t}"}
    if s < 0:
        return {"ok": False, "why": (f"negative spread {s} — pass the favourite's margin as "
                                     "a positive number; the sign convention is not guessed")}
    return {"ok": True, "favourite": round(t / 2 + s / 2, 2),
            "underdog": round(t / 2 - s / 2, 2), "total": t, "spread": s}


def environment_gap(model_team_points, market_team_points) -> dict:
    """MODEL minus MARKET, per the brief's stated direction.

    Sign matters and is fixed here so no caller re-derives it: POSITIVE means our
    model expects MORE scoring than the market does. Under-weighting an offence —
    the case the brief names — shows as a NEGATIVE gap.
    """
    if model_team_points is None or market_team_points is None:
        return {"ok": False, "why": "model or market team points absent"}
    m, k = float(model_team_points), float(market_team_points)
    gap = round(m - k, 2)
    return {
        "ok": True, "model_team_points": m, "market_team_points": k,
        "gap_points": gap,
        # Guarded: a zero market total makes a percentage meaningless, not infinite.
        "gap_pct": (round(gap / k * 100, 1) if k else None),
        "direction": ("model_higher" if gap > 0 else "model_lower" if gap < 0 else "level"),
    }


def observation(*, team, opponent, total, spread, is_favourite,
                model_team_points, captured_at, source, home=None) -> dict:
    """One Signal-B record, stamped so it can be graded and re-found later.

    CAPTURED_AT IS REQUIRED, not optional. Signal C is meaningless without it, and
    a Signal-B observation with no capture time cannot later become the first of a
    movement pair. The brief is explicit: state the capture time, always.
    """
    if not captured_at:
        raise ValueError("captured_at is required — an undated market observation "
                         "cannot be compared to a later one, and movement measured "
                         "against an unknown time is an artifact of our schedule")
    split = implied_team_totals(total, spread)
    if not split["ok"]:
        return {"ok": False, "why": split["why"], "team": team, "captured_at": captured_at}
    market_pts = split["favourite"] if is_favourite else split["underdog"]
    gap = environment_gap(model_team_points, market_pts)
    return {
        "ok": gap["ok"], "signal": "B_environment_gap",
        "team": team, "opponent": opponent, "home": home,
        "game_total": split["total"], "spread": split["spread"],
        "is_favourite": bool(is_favourite),
        "market_team_points": market_pts,
        "model_team_points": gap.get("model_team_points"),
        "gap_points": gap.get("gap_points"), "gap_pct": gap.get("gap_pct"),
        "direction": gap.get("direction"),
        # Provenance. `source` names WHICH book/provider — a line is not a fact
        # about the world, it is a quote from somewhere.
        "captured_at": captured_at, "source": source,
        # Labelling, at the record level: this never enters a live path.
        "read_only": True, "visibility": "post_draft_only",
    }


def conserves(split: dict) -> bool:
    """The two implied totals must sum to the game total. Arithmetic, checkable."""
    if not split.get("ok"):
        return False
    return abs((split["favourite"] + split["underdog"]) - split["total"]) < 1e-9
