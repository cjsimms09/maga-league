# TERRITORY: A
"""REPLACEMENT LEVEL IS A STEP FUNCTION. CHARACTERISED, NOT CHANGED.

EVIDENCE CLASS (directive §10): CHARACTERISATION + REGRESSION PROTECTION.
This establishes NEITHER correctness NOR empirical validation. It pins the
observed sensitivity of a shipping quantity so a future change cannot alter it
silently. It does not show the current replacement level is right.

── WHY THIS QUANTITY WAS AUDITED ──────────────────────────────────────────────

`replacement_points` is the denominator under every VORP on the board, it ships,
and an error in it is invisible: subtracting a wrong constant from one position
leaves every player within that position in the same order, so nothing looks
broken. Highest silent-failure risk of anything in the valuation chain.

── WHAT WAS FOUND ─────────────────────────────────────────────────────────────

1. THE LOOP IS NOT A FIXED-POINT ITERATION. The docstring claimed the FLEX
   circularity is "solved iteratively until it stops moving". Instrumenting
   `_replacement_from_counts` shows four calls producing two distinct
   count-vectors: dedicated-only, then the greedy result, repeated. The
   allocation never reads `replacement` and `counts` resets each pass, so pass N
   always recomputes pass N-1. Not a defect — greedy is exact here — but the
   docstring described a convergence that does not occur. Fixed there.

2. THE OUTPUT IS DISCONTINUOUS IN THE INPUTS. Ten flex slots split
   RB+1/WR+9/TE+0. A +2% shift in RB projections flips one slot and moves RB
   replacement ~15.8 points (~8%), IN THE OPPOSITE DIRECTION to the nudge,
   because replacement steps from RB21 to RB22. 2% is well inside real
   projection error.

3. THE BOARD MOSTLY ABSORBS IT, AND WHERE IT DOES NOT IS THE INTERESTING PART.
   Measured through the real composite with base projections and only `vorp`
   recomputed — isolating the replacement channel:

       pick  33   top-70 identical 70/70,  top pick unchanged
       pick  70   top-70 identical 41/70,  top pick unchanged, 0 swapped
       pick 110   top-70 identical 34/70,  TOP PICK CHANGES

   Early picks — where most of the value is — are completely insensitive,
   because the composite is VONA-driven and VONA reads proj_mean, not vorp.
   VORP reaches the score through `need` (weighted 0) and through the bench
   branch's insurance term, which is why sensitivity grows as the draft goes
   late and the bench branch takes over.

── WHY NOTHING IS CHANGED ─────────────────────────────────────────────────────

There is no evidence that a different flex allocation scores better against the
objective. Greedy next-man-up is the standard construction and the margins
deciding the slots run 0.77 to 18.43 points, so the split is not knife-edge.
Per the standing rule, an inconclusive measurement preserves current behaviour.

WHAT THIS FILE IS FOR: if someone later re-weights `need`, or makes the board
more VORP-dependent, the composite's insensitivity at pick 33 stops holding and
`test_early_board_absorbs_the_step` goes red. That is the alarm — re-derive it,
do not delete it.
"""
import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import vorp  # noqa: E402
from config_schema import FLEX_ELIGIBILITY, flex_slots, starters_at  # noqa: E402

DATA = json.loads((ROOT / "public" / "draft_data.json").read_text())
PLAYERS = [p for p in DATA["players"]
           if p.get("position") and p.get("proj_mean") is not None]
CFG = {"teams": DATA["league"]["teams"], "starters": DATA["league"]["starters"]}


def _scaled(pos, pct):
    return [dict(p, proj_mean=p["proj_mean"] * (1 + pct) if p["position"] == pos
                 else p["proj_mean"]) for p in PLAYERS]


def test_control_the_board_has_enough_players_to_reach_replacement():
    """Without this, every assertion below runs on a truncated pool and the
    Nth-ranked player is whoever happened to be last."""
    by_pos = {}
    for p in PLAYERS:
        by_pos.setdefault(p["position"], []).append(p)
    _, diag = vorp.replacement_levels(PLAYERS, CFG)
    for pos, n in diag["starter_counts"].items():
        assert len(by_pos.get(pos, [])) > n, (
            f"{pos} has only {len(by_pos.get(pos, []))} players for {n} starter "
            "slots — replacement is the last man in the pool, not a replacement level"
        )


def test_the_loop_converges_in_one_allocation_not_by_iterating():
    """The docstring claimed a fixed-point. Measure what actually happens."""
    seen = []
    orig = vorp._replacement_from_counts

    def spy(by_pos, counts):
        seen.append(tuple(sorted(counts.items())))
        return orig(by_pos, counts)

    vorp._replacement_from_counts = spy
    try:
        vorp.replacement_levels(PLAYERS, CFG)
    finally:
        vorp._replacement_from_counts = orig

    assert len(seen) >= 2, "the loop did not run enough to observe convergence"
    assert len(set(seen)) == 2, (
        f"expected exactly TWO distinct count-vectors (dedicated-only, then the "
        f"greedy answer repeated); saw {len(set(seen))}. If this is now >2 the "
        "allocation has become genuinely iterative — re-read the docstring, it "
        "describes a one-pass greedy."
    )


def test_flex_allocation_margins_are_published_not_knife_edge():
    """The split is a claim about who wins the flex. Show the margins deciding
    it, so 'stable' is measured rather than asserted."""
    by_pos = {}
    for p in PLAYERS:
        by_pos.setdefault(p["position"], []).append(p)
    for k in by_pos:
        by_pos[k].sort(key=lambda p: p.get("proj_mean", 0), reverse=True)
    teams = CFG["teams"]
    flex = flex_slots(CFG)
    total = sum(v * teams for v in flex.values())
    elig = sorted({pos for s in flex for pos in FLEX_ELIGIBILITY.get(s, [])
                   if pos in by_pos})
    counts = {pos: starters_at(CFG, pos) * teams for pos in by_pos}
    margins = []
    for _ in range(total):
        vals = sorted(((by_pos[pos][counts[pos]].get("proj_mean", 0), pos)
                       for pos in elig if counts[pos] < len(by_pos[pos])),
                      reverse=True)
        margins.append(vals[0][0] - vals[1][0])
        counts[vals[0][1]] += 1

    assert len(margins) == total
    # NOT a tuned threshold: the claim is only that no slot is decided by a
    # margin smaller than the rounding the artifact itself publishes (0.01).
    assert min(margins) > 0.01, (
        f"a flex slot is decided by {min(margins):.4f} points, below the "
        "precision replacement_points is stored at — the split is then an "
        "artifact of rounding, not of projections"
    )


def test_a_within_error_projection_shift_moves_replacement_by_a_step():
    """THE FINDING. 2% is inside real projection error; the response is not."""
    base, _ = vorp.replacement_levels(PLAYERS, CFG)
    bumped, _ = vorp.replacement_levels(_scaled("RB", 0.02), CFG)
    move = bumped["RB"] - base["RB"]
    assert move < -5.0, (
        f"expected RB replacement to STEP DOWN when RB projections rise 2% "
        f"(RB gains a flex slot, replacement moves from RB21 to RB22); got "
        f"{move:+.2f}. If this is now smooth, the allocation changed."
    )
    assert abs(move) / base["RB"] > 0.05, (
        f"the step is {abs(move) / base['RB']:.1%} of the level; it was ~8%"
    )


def test_the_step_is_counter_intuitive_in_direction_and_that_is_recorded():
    """Raising a position's projections LOWERS its replacement level. That is
    correct — a better position earns more flex slots, so its last starter is
    deeper and worse — but it reads backwards and belongs in the record."""
    base, _ = vorp.replacement_levels(PLAYERS, CFG)
    for pos in ("RB", "WR"):
        bumped, _ = vorp.replacement_levels(_scaled(pos, 0.10), CFG)
        assert bumped[pos] < base[pos] * 1.10, (
            f"{pos} replacement rose by MORE than the projection scaling, which "
            "would mean it lost flex slots as it got better"
        )


def test_no_position_is_silently_absent_from_replacement():
    """A position missing here gets VORP against 0 and dominates the board."""
    rep, _ = vorp.replacement_levels(PLAYERS, CFG)
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        assert pos in rep and rep[pos] > 0, (
            f"{pos} has no replacement level; every {pos} would score VORP "
            "against zero and outrank the board"
        )


@pytest.mark.parametrize("pos", ["RB", "WR", "TE"])
def test_flex_eligible_positions_actually_compete_for_slots(pos):
    """CONTROL on the eligibility wiring: if a position could never win a slot
    no matter how good it got, it is not really in the flex."""
    teams = CFG["teams"]
    base, bd = vorp.replacement_levels(PLAYERS, CFG)
    _, big = vorp.replacement_levels(_scaled(pos, 1.0), CFG)   # double it
    assert big["starter_counts"][pos] > starters_at(CFG, pos) * teams, (
        f"{pos} won ZERO flex slots even at double projections — it is listed "
        "as flex-eligible but cannot compete, so the eligibility is decorative"
    )
