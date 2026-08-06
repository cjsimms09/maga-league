"""Module 4 — replacement level, VORP, and tier detection.

Replacement level is the last-starter baseline: the worst player at a position
who still starts somewhere in the league every week. FLEX makes that circular —
how many RBs start depends on how good the WRs are — so the allocation is
solved iteratively until it stops moving.
"""
from __future__ import annotations
from statistics import mean

from config_schema import FLEX_ELIGIBILITY, flex_slots, starters_at

MAX_FLEX_PASSES = 5   # converges in 2-3 in practice; cap guards a pathological config
CONVERGE_EPS = 0.01   # replacement points move less than this -> stable


def replacement_levels(players: list[dict], cfg: dict) -> tuple[dict, dict]:
    """Compute replacement projection per position.

    Returns (replacement_points, diagnostics) where diagnostics records how many
    starters each position ended up with, including its share of FLEX.
    """
    teams = cfg["teams"]
    by_pos: dict[str, list[dict]] = {}
    for p in players:
        by_pos.setdefault(p["position"], []).append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=lambda p: p.get("proj_mean", 0), reverse=True)

    # Start with dedicated slots only.
    counts = {pos: starters_at(cfg, pos) * teams for pos in by_pos}
    flex = flex_slots(cfg)
    total_flex = sum(v * teams for v in flex.values())

    prev_replacement: dict[str, float] = {}
    for _ in range(MAX_FLEX_PASSES):
        replacement = _replacement_from_counts(by_pos, counts)
        if prev_replacement and all(
            abs(replacement.get(k, 0) - prev_replacement.get(k, 0)) < CONVERGE_EPS
            for k in replacement
        ):
            break
        prev_replacement = replacement

        # Re-allocate every flex slot to whichever eligible position offers the
        # best next-man-up projection, one slot at a time.
        counts = {pos: starters_at(cfg, pos) * teams for pos in by_pos}
        eligible_positions = sorted({
            pos for slot in flex for pos in FLEX_ELIGIBILITY.get(slot, [])
            if pos in by_pos
        })
        for _slot in range(total_flex):
            best_pos, best_val = None, float("-inf")
            for pos in eligible_positions:
                idx = counts.get(pos, 0)
                if idx < len(by_pos[pos]):
                    val = by_pos[pos][idx].get("proj_mean", 0)
                    if val > best_val:
                        best_pos, best_val = pos, val
            if best_pos is None:
                break
            counts[best_pos] = counts.get(best_pos, 0) + 1

    replacement = _replacement_from_counts(by_pos, counts)
    diagnostics = {
        "starter_counts": counts,
        "flex_slots_allocated": total_flex,
        "replacement_points": {k: round(v, 2) for k, v in replacement.items()},
    }
    return replacement, diagnostics


def _replacement_from_counts(by_pos: dict, counts: dict) -> dict:
    """The Nth-ranked player at each position is replacement level."""
    out = {}
    for pos, ranked in by_pos.items():
        n = max(1, int(counts.get(pos, 1)))
        if not ranked:
            out[pos] = 0.0
        elif n <= len(ranked):
            out[pos] = float(ranked[n - 1].get("proj_mean", 0))
        else:
            # Fewer players than starting slots: extrapolate off the tail rather
            # than pinning replacement to the worst known player.
            out[pos] = float(ranked[-1].get("proj_mean", 0)) * 0.9
    return out


def apply_vorp(players: list[dict], cfg: dict) -> tuple[list[dict], dict]:
    replacement, diag = replacement_levels(players, cfg)
    for p in players:
        base = replacement.get(p["position"], 0.0)
        p["replacement"] = round(base, 2)
        p["vorp"] = round(float(p.get("proj_mean", 0)) - base, 2)
    players.sort(key=lambda p: p.get("vorp", 0), reverse=True)
    for i, p in enumerate(players, start=1):
        p["overall_rank"] = i
    return players, diag


# --- tiers --------------------------------------------------------------------

def assign_tiers(players: list[dict], *, gap_multiple: float = 1.5,
                 min_tier_size: int = 2) -> list[dict]:
    """Break each position into tiers where the projection gap spikes.

    A tier break is a gap larger than `gap_multiple` times the rolling mean gap
    at that position — the point where "one of these guys" stops being true.
    """
    by_pos: dict[str, list[dict]] = {}
    for p in players:
        by_pos.setdefault(p["position"], []).append(p)

    for pos, ranked in by_pos.items():
        ranked.sort(key=lambda p: p.get("proj_mean", 0), reverse=True)
        gaps = [
            (ranked[i].get("proj_mean", 0) - ranked[i + 1].get("proj_mean", 0))
            for i in range(len(ranked) - 1)
        ]
        avg_gap = mean(gaps) if gaps else 0.0
        tier, since_break = 1, 0
        for i, p in enumerate(ranked):
            p["tier"] = tier
            p["pos_rank"] = i + 1
            since_break += 1
            if i < len(gaps):
                gap = gaps[i]
                if avg_gap > 0 and gap > gap_multiple * avg_gap and since_break >= min_tier_size:
                    tier += 1
                    since_break = 0

        # Tier metadata: how far the cliff falls and how many are left in it.
        sizes: dict[int, int] = {}
        for p in ranked:
            sizes[p["tier"]] = sizes.get(p["tier"], 0) + 1
        tier_floor: dict[int, float] = {}
        for p in ranked:
            t = p["tier"]
            tier_floor[t] = min(tier_floor.get(t, 1e9), p.get("proj_mean", 0))
        tier_ceiling: dict[int, float] = {}
        for p in ranked:
            t = p["tier"]
            tier_ceiling[t] = max(tier_ceiling.get(t, -1e9), p.get("proj_mean", 0))
        for p in ranked:
            t = p["tier"]
            nxt = tier_ceiling.get(t + 1)
            p["tier_size"] = sizes[t]
            p["tier_drop"] = round(tier_floor[t] - nxt, 2) if nxt is not None else 0.0
            p["tier_rank"] = sum(1 for q in ranked if q["tier"] == t and
                                 q.get("proj_mean", 0) >= p.get("proj_mean", 0))
    return players
