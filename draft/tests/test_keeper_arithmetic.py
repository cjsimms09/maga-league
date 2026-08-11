"""THE KEEPER ARITHMETIC — the check Cory can do by eye, made into a guard.

WHY THIS EXISTS. The keeper slate is not known until 20 August and the draft is
the 22nd. Every pick number on the board until then is provisional, and the
failure mode is the seat bug's: a board built on a PARTIAL keeper slate looks
entirely normal, because a filter over a real board always returns something
plausible. There is no error, no missing field, no red anything — just a
schedule that is wrong by as many picks as there are keepers nobody applied.

The eyeball check is one line of arithmetic. Under `top_picks_flat` every keeper
forfeits a round in 1..3, so if I keep three my first pick is in round 4 and
EVERY keeper in the league sits ahead of it:

    my_first_pick == 3*teams + (teams+1-my_slot) - total_keepers
    total_picks   == teams*rounds - total_keepers

For a 10-team snake at slot 4 that is `first_pick + total_keepers == 37`.

A check that only a human performs is a check that gets skipped on the one
morning it matters, so it is here as well. Rule 11's requirement: the value and
its consumer arrive in the same unit of work.

WHAT THIS DOES NOT DO — stated because the gap is the whole risk. It cannot tell
whether the slate is COMPLETE. It asserts the board is internally consistent with
the keeper set it was handed, and it asserts the artifact SAYS how much of the
known slate reached it. Completeness is `designations_not_applied`, which is
reported, not enforced: on 11 August a partial slate is correct and expected.
"""
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE)) if os.path.basename(HERE) == "tests" else HERE
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import keepers as KP  # noqa: E402


def _cfg(teams=10, rounds=15, slot=4):
    return {"teams": teams, "rounds": rounds, "draft_type": "snake",
            "my_draft_slot": slot,
            "keepers": {"cost_model": "top_picks_flat", "count": 3, "max_years": 3,
                        "undrafted_round": 10, "undrafted_rule": "assigned_round"}}


def _mk(n, slot):
    return [{"player_id": "x%s_%d" % (slot, i), "name": "K%s%d" % (slot, i)} for i in range(n)]


def _order(cfg, counts):
    by_team = {s: _mk(n, s) for s, n in counts.items() if n > 0}
    return KP.build_true_pick_order(cfg, by_team), sum(counts.values())


# ── THE RULE ITSELF: up to three, not exactly three ──────────────────────────
def test_forfeiture_is_top_down_and_per_team():
    """Keep 3 -> lose rounds 1,2,3. Keep 2 -> lose 1,2 and STILL PICK IN ROUND 3."""
    cfg = _cfg()
    order, _ = _order(cfg, {1: 3, 2: 2, 3: 1, 4: 0})
    lost = {}
    for f in order.forfeited:
        lost.setdefault(f["team_slot"], []).append(f["cost_round"])
    assert lost == {1: [1, 2, 3], 2: [1, 2], 3: [1]}

    def slots(rnd):
        return [p["team_slot"] for p in order.picks if p["round"] == rnd]

    # Rounds 1-3 are SPARSE and stop only at teams that kept fewer than the round.
    assert 1 not in slots(1) and 2 not in slots(1) and 3 not in slots(1)
    assert 4 in slots(1), "a team that kept nobody picks in round 1"
    assert 3 in slots(2), "keeping ONE costs round 1 only"
    assert 2 in slots(3), "keeping TWO still picks in round 3 — the rule most likely to be lost"
    assert 1 not in slots(3), "keeping THREE forfeits round 3"
    # From round 4 every team picks in every round.
    assert sorted(slots(4)) == list(range(1, 11))


def test_no_team_count_is_assumed():
    """A team keeping 0,1,2,3 each forfeits exactly that many rounds — no fixed N."""
    cfg = _cfg()
    for n in (0, 1, 2, 3):
        order, _ = _order(cfg, {7: n})
        assert len(order.forfeited) == n
        assert len(order.picks) == 150 - n


# ── THE ARITHMETIC, WHICH IS THE EYEBALL CHECK ───────────────────────────────
@pytest.mark.parametrize("slot", [1, 4, 7, 10])
@pytest.mark.parametrize("opponents", [
    {},
    {1: 3, 2: 3},
    {2: 1, 3: 1, 5: 1, 6: 1},
    {1: 3, 2: 3, 3: 3, 5: 3, 6: 2},
    {1: 3, 2: 3, 3: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3},
])
def test_first_pick_is_determined_by_the_TOTAL_alone(slot, opponents):
    """first == 3*teams + (teams+1-slot) - total, whatever the distribution.

    The distribution independence is the useful half: I do not need to know which
    opponent sits in which seat to know my own schedule. Only the COUNT moves it.
    """
    cfg = _cfg(slot=slot)
    counts = {s: n for s, n in opponents.items() if s != slot}
    counts[slot] = 3
    order, total = _order(cfg, counts)
    teams = cfg["teams"]
    expected = 3 * teams + (teams + 1 - slot) - total
    assert order.my_picks[0] == expected, (
        "first pick %d != %d for slot %d with %d keepers"
        % (order.my_picks[0], expected, slot, total))
    assert len(order.picks) == teams * cfg["rounds"] - total


def test_the_identity_is_conditioned_on_keeping_three_and_says_so():
    """NEGATIVE RESULT, recorded so the check is not trusted past its range.

    Keeping 2 puts my first pick in ROUND 3, where keepers at higher slots fall
    AFTER me — so the same total gives different answers and the identity fails.
    This is asserted rather than mentioned: a caveat in a docstring is not a
    caveat anyone meets.
    """
    cfg = _cfg(slot=4)
    low, _ = _order(cfg, {4: 2, 1: 3, 2: 3})     # keepers ahead of me in round 3
    high, _ = _order(cfg, {4: 2, 9: 3, 10: 3})   # keepers behind me in round 3
    assert low.my_picks[0] != high.my_picks[0], (
        "if this ever passes, the identity generalises past 3 keepers and the "
        "condition on the eyeball check can be dropped")


# ── THE SHIPPED BOARD MUST AGREE WITH ITS OWN KEEPER SET ─────────────────────
def _artifact():
    path = os.path.join(ROOT, "public", "draft_data.json")
    if not os.path.exists(path):
        pytest.skip("no built board")
    with open(path) as fh:
        return json.load(fh)


def test_shipped_board_is_internally_consistent():
    """The board's pick order must match the keeper count the board itself carries.

    This is the guard that catches a PARTIAL application: keepers removed from the
    pool but not from the pick order, or applied to some teams and not others,
    would break this while leaving every surface looking ordinary.
    """
    art = _artifact()
    lg = art["league"]
    picks = art["pick_order"]["picks"]
    forfeited = art["pick_order"]["forfeited"]
    teams, rounds = int(lg["teams"]), int(lg["rounds"])
    assert len(picks) == teams * rounds - len(forfeited), (
        "the board has %d picks and %d forfeits — those cannot both be true"
        % (len(picks), len(forfeited)))

    kept = art.get("kept_player_ids") or []
    assert len(forfeited) == len(kept), (
        "%d forfeited rounds against %d kept players — the pick order and the "
        "pool disagree about who is kept" % (len(forfeited), len(kept)))


def test_a_kept_player_is_never_also_in_the_draftable_pool():
    """The pool half of the same question, asserted directly rather than inferred."""
    art = _artifact()
    kept = {str(x) for x in (art.get("kept_player_ids") or [])}
    pool = {str(p["player_id"]) for p in art["players"]}
    overlap = kept & pool
    assert not overlap, "kept players still draftable: %s" % sorted(overlap)


def test_the_board_says_how_much_of_the_known_slate_reached_it():
    """REPORTED, NOT ENFORCED — and the distinction is the point.

    A partial slate is CORRECT today: designations are still landing and draft
    slots are not assigned. What is not acceptable is the board being unable to
    say so. Sleeper's designation count and the keeper set the board was built
    from lived in two files that disagreed (4 teams designated, 1 in the pick
    order) with nothing comparing them.
    """
    art = _artifact()
    slate = art.get("keeper_slate")
    assert slate, "the board carries no keeper_slate stamp"
    for field in ("teams_in_pick_order", "keepers_in_pick_order",
                  "designations_not_applied", "board_built_on_full_slate"):
        assert field in slate, (
            "keeper_slate does not report '%s' — the board cannot say how much of "
            "the slate it knows about actually reached its pick order" % field)
    assert slate["keepers_in_pick_order"] == len(art.get("kept_player_ids") or [])
    if slate.get("arithmetic_check"):
        assert slate["arithmetic_check"]["holds"], (
            "the board's own arithmetic check fails: %r" % (slate["arithmetic_check"],))
