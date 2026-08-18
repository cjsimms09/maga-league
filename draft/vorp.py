"""Module 4 — replacement level, VORP, and tier detection.

Replacement level is the last-starter baseline: the worst player at a position
who still starts somewhere in the league every week. FLEX makes the COUNTS
interdependent — how many RBs start depends on how good the WRs are — and each
flex slot is assigned to whichever eligible position offers the best next-man-up
projection.

⚠️ THIS IS A ONE-PASS GREEDY, NOT A FIXED-POINT ITERATION, and this docstring
used to claim the latter ("solved iteratively until it stops moving"). MEASURED
2026-08-14: instrumenting `_replacement_from_counts` across a full build shows
FOUR calls producing exactly TWO distinct count-vectors — the dedicated-only
start, then the greedy result, repeated until the convergence test passes.

The loop cannot do anything else, because the allocation never reads
`replacement`: it ranks on `by_pos[pos][idx]["proj_mean"]`, and `counts` is
reset to dedicated-only at the top of every pass. So pass N always recomputes
pass N-1's answer. That is not a defect — greedy IS the correct solution to
"assign each slot to the best available next man up", and it is exact in one
pass — but a reader was being told a circularity is being resolved when none is
present, and could reasonably have concluded the counts were a converged
equilibrium rather than a sort.

⚠️ THE OUTPUT IS A STEP FUNCTION, WHICH MATTERS MORE THAN THE LOOP.
Replacement moves discontinuously when a flex slot flips. Measured on the 2026
board (10 teams, 1 FLEX, so 10 slots split RB+1/WR+9/TE+0): a +2% shift in RB
projections — well inside real projection error — flips one slot and moves RB
replacement by 15.8 points, about 8%, IN THE OPPOSITE DIRECTION to the nudge.
The margins that decide the slots run 0.77 to 18.43 points, so the split is not
knife-edge, but neither is it smooth.

What that costs the board is measured, not assumed, in
draft/tests/test_replacement_sensitivity.py: the composite absorbs it entirely
at pick 33, partially at 70, and at pick 110 it changes the top recommendation.
NOTHING IS CHANGED ON THE STRENGTH OF THAT — it is characterised so that a
future change making the board more VORP-dependent makes the fragility visible
instead of silently amplifying it.
"""
from __future__ import annotations
from statistics import mean

from config_schema import FLEX_ELIGIBILITY, flex_slots, starters_at

MAX_FLEX_PASSES = 5   # converges in 2-3 in practice; cap guards a pathological config
CONVERGE_EPS = 0.01   # replacement points move less than this -> stable


#: Positions whose cross-position VORP is not a draft signal: only 32 and 44
#: options exist, they cluster tightly, and they are streamable all season.
#: Ranked among themselves, demoted below the skill positions. See apply_vorp.
ONESIE_POSITIONS = ("K", "DEF")


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
    # K AND DEF ARE DEMOTED OUT OF THE CROSS-POSITION ORDER (Cory's ruling,
    # 2026-08-17: "Remove 1, 3"). VORP is only comparable across positions when
    # the distributions are. Measured on the live board:
    #
    #   pos   n    VORP@1   depth20   <- points lost by waiting 20 more picks
    #   WR   238   124.6      32.7       deep: waiting is nearly free
    #   DEF   32    29.0      30.0       waiting costs the whole position's VORP
    #   K     44    10.0      35.0       waiting costs MORE than it is worth
    #
    # A defence's VORP of 29 says "29 better than DEF10" — but you can still get
    # a defence 30 points below replacement twenty picks later, so those 29
    # points were never purchasable. They are an artifact of measuring against a
    # floor you would never actually be forced down to. That put the LA Rams at
    # overall 35 against an ADP of 127 — the engine recommending a 4th-round
    # defence.
    #
    # public/js/draft/app.js already demoted them IN THE BOARD VIEW
    # (`demoteOnesies`, on by default) with the note "streamable all season, so
    # their cross-position rank is not a draft signal". This moves that truth
    # into the ARTIFACT so every consumer inherits it — keeperui.js sorts on
    # overall_rank with no such guard, and any future reader would have had to
    # rediscover this.
    #
    # NOT dropped, NOT unranked: they keep a real vorp and a real pos_rank, and
    # they sort among themselves by VORP. Only their position in the
    # CROSS-position order changes, which is the only place the comparison was
    # invalid.
    players.sort(key=lambda p: (p.get("position") in ONESIE_POSITIONS,
                                -(p.get("vorp") or 0.0)))
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
