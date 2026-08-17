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

   [2026-08-15] WHERE the step sits is BOARD-SPECIFIC, and pinning it at
   exactly +2% was a knife edge: the first fresh candidate board CI ever
   built (run 31897110098) did not flip at 2% — allocation held RB21/WR29
   and the "move" was +3.78, exactly the smooth 1.02x scaling of the same
   replacement player. The step test now scans +0.5%..+10% to find the flip
   on whatever board is present and asserts existence, direction, and
   discontinuity — the properties, not the coordinate.

   [2026-08-16] THE STEP MAGNITUDE IS NOW DERIVED, NOT PINNED, and the
   smooth arm is asserted too. Run 31926152660 (the 04:18Z nightly on the
   relay ref) re-measured the knife edge to its exact width: the fresh
   candidate (677 players, RB21=189.02, RB22=169.82, WR29=173.22) sat
   0.0036 projection points on the SMOOTH side of the flex boundary at the
   old +2% coordinate — RB22 x 1.02 = 173.2164 vs WR29 = 173.2200, so the
   allocation held and the probe moved +3.78 = 189.02 x 0.02, pure scaling;
   break-even on that board is +2.0021%, the flip lands at the +2.5% scan
   point with step -18.73. THIS TEST PASSED on that board (the run's 16
   refusals were artifact-parity/field-purpose tests, unrelated) — but the
   in-run diagnosis tool still preached the retired coordinate pin ("the
   pinned expectation is a STEP DOWN < -5.0") and misread the smooth arm
   as the blocker. Two fixes: the diagnosis tool now names the arm it
   measured, and this file's remaining hardcode (the -5.0 step floor,
   itself borrowed from the 08-14 board's gap) is replaced by deriving the
   expected step FROM THE ALLOCATION — replacement is by construction the
   count-th ranked player scaled, so the step across the flip equals
   RB[new_count] x (1+pct) - RB[old_count] x (1+pct-0.005), i.e.
   -gap x (1+pct) + smooth_increment, negative exactly when the
   inter-player gap the flip crosses exceeds one increment of smooth
   drift. The test asserts that identity and its corollaries (sign,
   discontinuity vs the smooth arm) rather than any remembered number.

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
    """THE FINDING, RE-DERIVED 2026-08-15. The original version pinned the
    step at EXACTLY +2% — the scale that happened to flip the COMMITTED
    board's flex allocation. The first fresh board CI ever built against this
    test (run 31897110098's in-run diagnosis) did not flip at 2%: allocation
    stayed RB21/WR29 and the move was +3.78 = 189.02 x 0.02, i.e. pure smooth
    scaling of the unchanged replacement player. The finding was never "the
    step is at 2%"; it was "the step EXISTS within real projection error, and
    it is discontinuous and backwards". So the test now LOCATES the step by
    scanning scales on whatever board is present, then asserts those three
    properties — the characterisation survives a rebuild, a genuinely smooth
    allocation still fails."""
    base, base_diag = vorp.replacement_levels(PLAYERS, CFG)
    base_rb = base_diag["starter_counts"]["RB"]

    flip = None
    prev_rep = base["RB"]
    for i in range(1, 21):                       # +0.5% .. +10.0%
        pct = i * 0.005
        rep, diag = vorp.replacement_levels(_scaled("RB", pct), CFG)
        if diag["starter_counts"]["RB"] != base_rb:
            flip = (pct, rep["RB"], diag["starter_counts"]["RB"], prev_rep)
            break
        prev_rep = rep["RB"]

    assert flip is not None, (
        "no RB projection scale up to +10% moved the flex allocation at all — "
        "replacement is now SMOOTH in the inputs on this board. That is a "
        "different regime from the characterised one entirely: re-read the "
        "file docstring and re-derive, the allocation code has changed."
    )
    pct, flip_rep, flip_rb, rep_before = flip

    # Property 1: the step sits within real projection error. Season-long RB
    # projection error is well above 10%, so any flip found by this scan
    # qualifies; record where it landed for the log.
    assert pct <= 0.10, f"flip found at +{pct:.1%}"

    # Property 2: counter-intuitive direction. Raising RB projections makes
    # RB WIN a slot (never lose one), and winning a slot pushes replacement
    # DEEPER — so the level steps DOWN as the position gets better.
    assert flip_rb > base_rb, (
        f"RB LOST a flex slot ({base_rb} -> {flip_rb}) as its projections "
        f"rose +{pct:.1%} — the allocation is inverted"
    )

    # Property 3, RE-DERIVED 2026-08-16: the step is DERIVED FROM THE
    # ALLOCATION, not pinned. (The old floor here, `step < -5.0`, was the
    # 2026-08-14 board's inter-player gap wearing a tolerance — a coordinate
    # pin in magnitude clothing, the same defect the +2% coordinate pin had
    # in location. Run 31926152660's diagnosis quoted it as "the pinned
    # expectation" while this test passed, which is what exposed it.)
    #
    # By construction (`_replacement_from_counts`), replacement IS the
    # count-th ranked player at the position, so both arms are computable
    # straight from the sorted pool and the allocation counts:
    #     before the flip: RB[old_count] x (1 + pct - 0.005)
    #     at the flip:     RB[new_count] x (1 + pct)
    # and the step across the boundary is their difference:
    #     step = -gap x (1+pct) + smooth_increment
    # where gap = RB[old_count] - RB[new_count] (the inter-player gap the
    # flip crosses) and smooth_increment = RB[old_count] x 0.005 (what one
    # scan increment moves the level WITHOUT a flip).
    rb_ranked = sorted((p["proj_mean"] for p in PLAYERS if p["position"] == "RB"),
                       reverse=True)
    prev_pct = pct - 0.005
    derived_before = rb_ranked[base_rb - 1] * (1 + prev_pct)
    derived_flip = rb_ranked[flip_rb - 1] * (1 + pct)
    gap = rb_ranked[base_rb - 1] - rb_ranked[flip_rb - 1]
    smooth_increment = rb_ranked[base_rb - 1] * 0.005

    assert rep_before == pytest.approx(derived_before), (
        f"pre-flip replacement {rep_before:.4f} is not the old count's "
        f"({base_rb}) ranked player scaled ({derived_before:.4f}) — "
        "replacement is no longer the count-th man and this derivation "
        "(and _replacement_from_counts) needs re-reading"
    )
    assert flip_rep == pytest.approx(derived_flip), (
        f"post-flip replacement {flip_rep:.4f} is not the new count's "
        f"({flip_rb}) ranked player scaled ({derived_flip:.4f}) — the step "
        "did not come from the allocation moving, something else moved it"
    )

    step = flip_rep - rep_before
    derived_step = -gap * (1 + pct) + smooth_increment
    assert step == pytest.approx(derived_step), (
        f"measured step {step:+.4f} disagrees with the allocation-derived "
        f"step {derived_step:+.4f} (-gap x (1+pct) + smooth_increment)"
    )

    # Corollary A — sign, with its reason attached: the step is DOWN exactly
    # because the crossed gap outweighs one increment of smooth drift. Both
    # sides are measured quantities of THIS board, no remembered constant.
    assert gap * (1 + pct) > smooth_increment, (
        f"the crossed gap ({gap:.2f} x {1 + pct:.3f}) does not exceed one "
        f"smooth increment ({smooth_increment:.2f}) — the arithmetic then "
        "implies a step UP, and the direction claim below is void"
    )
    assert step < 0, (
        f"crossing +{pct:.1%} moved RB replacement {step:+.2f} UP despite "
        "the gap dominating — the derivation above is inconsistent"
    )

    # Corollary B — discontinuity: the flip moves the level by more than the
    # whole smooth motion of the increment that contains it. This is the
    # step/smooth distinction itself, not a magnitude opinion.
    assert -step > smooth_increment, (
        f"crossing +{pct:.1%} moved RB replacement by only {step:+.2f} "
        f"(from {rep_before:.2f} to {flip_rep:.2f}), within one smooth "
        f"increment ({smooth_increment:.2f}) — that is not a step, "
        "the discontinuity this file exists to record has vanished"
    )


def test_below_the_flip_the_move_is_pure_smooth_scaling_the_arm_ci_measured():
    """THE OTHER ARM, asserted — added 2026-08-16 after run 31926152660's
    in-run diagnosis printed `move: +3.78` at +2% against "the pinned
    expectation is a STEP DOWN < -5.0" and made a correct board look broken.
    +3.78 IS the correct arithmetic on a board whose flex boundary sits past
    the probe: while the allocation holds, replacement is the SAME ranked
    player scaled, so the move must equal base x pct exactly (189.02 x 0.02
    = 3.7804 on that board, which held the boundary by 0.0036 points —
    break-even +2.0021%). Every scan point below the flip must sit on this
    arm; the flip test above owns everything from the boundary on."""
    base, base_diag = vorp.replacement_levels(PLAYERS, CFG)
    base_rb = base_diag["starter_counts"]["RB"]

    checked = 0
    for i in range(1, 21):                       # +0.5% .. +10.0%
        pct = i * 0.005
        rep, diag = vorp.replacement_levels(_scaled("RB", pct), CFG)
        if diag["starter_counts"]["RB"] != base_rb:
            break                                # the step arm begins here
        assert rep["RB"] == pytest.approx(base["RB"] * (1 + pct)), (
            f"allocation held at +{pct:.1%} ({base_rb} RB starters) but the "
            f"level moved to {rep['RB']:.4f}, not the smooth "
            f"{base['RB'] * (1 + pct):.4f} — with no flip there is nothing "
            "else that can legally move it"
        )
        checked += 1

    # If the very first scan point already flips, the smooth arm is empty on
    # this board — that is legitimate, and the step test covers it. But a
    # board with NO flip anywhere is the step test's alarm, not a silent pass
    # here.
    assert checked > 0 or diag["starter_counts"]["RB"] != base_rb


def test_the_step_is_counter_intuitive_in_direction_and_that_is_recorded():
    """Raising a position's projections LOWERS its replacement level. That is
    correct — a better position earns more flex slots, so its last starter is
    deeper and worse — but it reads backwards and belongs in the record."""
    base, _ = vorp.replacement_levels(PLAYERS, CFG)
    for pos in ("RB", "WR"):
        bumped, _ = vorp.replacement_levels(_scaled(pos, 0.10), CFG)
        # <= with a float tolerance, not strict <: EXACT equality is the
        # legitimate boundary where the +10% bump moved no flex slots, so the
        # replacement player is the same man scaled by exactly 1.10. The
        # first board built under the 2026-08-17 rulings landed there for WR
        # (178.86 == 162.60 x 1.10 to the cent, run 32043426901) and the
        # strict < read a no-allocation-change board as having LOST slots.
        # Only rising MORE than the scaling violates the recorded principle.
        assert bumped[pos] <= base[pos] * 1.10 + 1e-6, (
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
