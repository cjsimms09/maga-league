"""THE KEEPER ARITHMETIC — the check Cory can do by eye, made into a guard.

WHY THIS EXISTS. The keeper slate is not known until 20 August and the draft is
the 22nd. Every pick number on the board until then is provisional, and the
failure mode is the seat bug's: a board built on a PARTIAL keeper slate looks
entirely normal, because a filter over a real board always returns something
plausible. There is no error, no missing field, no red anything — just a
schedule that is wrong by as many picks as there are keepers nobody applied.

The eyeball check is one line of arithmetic, and on 2026-08-13 Cory did it and
the model was wrong. Under `top_picks_flat` keeping N forfeits rounds 1..N, so my
first pick is in round N+1 at my own slot — and SLEEPER DOES NOT RENUMBER:

    my_first_pick == (N)*teams + (my_slot if N+1 is odd else teams+1-my_slot)
    board_picks   == teams*rounds                    (keepers change NOTHING)
    live_picks    == teams*rounds - total_keepers

MY PICK NUMBERS DO NOT DEPEND ON WHAT ANYBODY ELSE KEEPS. That is the whole
correction. The identity used to carry `- total_keepers` on both lines, because
`build_true_pick_order` deleted forfeited picks and renumbered the survivors
1..N. Sleeper's own log for this league says otherwise, three seasons running:
150 picks and round 4 beginning at overall 31 in 2023 (0 keepers), 2024 (23) and
2025 (20) alike. A keeper OCCUPIES his pick slot; the pick is not removed.

For a 10-team snake at slot 4 keeping three: round 4 is EVEN so the snake
reverses, slot 10 goes first, slot 4 is the 7th pick of the round, `first == 37`
— and it stays 37 however many keepers the rest of the league declares.

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
def test_first_pick_depends_on_MY_keepers_and_NOTHING_ELSE(slot, opponents):
    """first == 3*teams + (teams+1-slot), whatever anybody else keeps.

    THE INDEPENDENCE IS THE POINT AND IT USED TO BE DENIED. This test previously
    subtracted `total` and asserted that the whole league's keeper count moved my
    seat. It does not: Sleeper leaves a forfeited pick in place, occupied. I do
    not merely not need to know WHICH opponent sits where — I do not need to know
    HOW MANY they keep either.
    """
    cfg = _cfg(slot=slot)
    counts = {s: n for s, n in opponents.items() if s != slot}
    counts[slot] = 3
    order, total = _order(cfg, counts)
    teams = cfg["teams"]
    # Round 4 is EVEN, so the snake reverses and slot `slot` is the
    # (teams+1-slot)-th pick of that round.
    expected = 3 * teams + (teams + 1 - slot)
    assert order.my_picks[0] == expected, (
        "first pick %d != %d for slot %d with %d keepers in the league"
        % (order.my_picks[0], expected, slot, total))
    # THE BOARD IS THE SAME DEPTH EVERY TIME. Keepers change who selects, never
    # how many players leave the pool.
    assert len(order.board) == teams * cfg["rounds"]
    # LIVE selections are the other quantity, and it DOES move with the total.
    assert len(order.picks) == teams * cfg["rounds"] - total
    # And every one of my picks keeps its true board number.
    assert all(p["keeper_slot"] is False for p in order.board
               if p["overall"] in set(order.my_picks))


def test_the_identity_GENERALISES_now_that_nothing_renumbers():
    """THE NEGATIVE RESULT THAT INVERTED, and it inverted for a reason.

    This test used to assert the opposite — that keeping 2 puts my first pick in
    round 3 where keepers at higher slots fall AFTER me, so the same total gave
    different answers and the identity had to be conditioned on keeping exactly
    three. That was true of the COMPRESSED model and of nothing else: it was an
    artefact of renumbering, and the old docstring said in as many words that if
    it ever passed the condition could be dropped.

    It passes. WHERE the other keepers sit is irrelevant, and so is how many
    there are. My first pick is my slot in round N+1, full stop.
    """
    cfg = _cfg(slot=4)
    teams = cfg["teams"]
    low, _ = _order(cfg, {4: 2, 1: 3, 2: 3})     # keepers "ahead" of me in round 3
    high, _ = _order(cfg, {4: 2, 9: 3, 10: 3})   # keepers "behind" me in round 3
    assert low.my_picks[0] == high.my_picks[0]
    # Keeping TWO forfeits rounds 1-2, so my first pick is round 3 — ODD, so the
    # snake runs forward and slot 4 is the 4th pick of the round.
    assert low.my_picks[0] == 2 * teams + 4 == 24
    # CONTROL: the two arrangements really are different drafts, or the equality
    # above is two names for one object.
    assert low.forfeited != high.forfeited
    assert {f["team_slot"] for f in low.forfeited} != {f["team_slot"] for f in high.forfeited}


def test_a_keeper_slot_is_OCCUPIED_not_removed():
    """The structural fact the whole correction rests on, asserted directly.

    Sleeper's log for this league: 150 picks in 2023 (0 keepers), 2024 (23) and
    2025 (20). If a forfeited pick were removed those would be 150, 127 and 130.
    """
    cfg = _cfg(slot=4)
    teams, rounds = cfg["teams"], cfg["rounds"]
    for counts in ({}, {1: 3}, {s: 3 for s in range(1, 11)}):
        order, total = _order(cfg, counts)
        assert len(order.board) == teams * rounds, (
            "the board must be the same size whatever the keeper count")
        assert sum(1 for p in order.board if p["keeper_slot"]) == total
        assert len(order.picks) == teams * rounds - total
        # Round 4 begins at the same overall every time — the invariant checked
        # against three real Sleeper drafts.
        r4 = sorted(p["overall"] for p in order.board if p["round"] == 4)
        assert r4[0] == 3 * teams + 1


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
    po = art["pick_order"]
    picks = po["picks"]
    forfeited = po["forfeited"]
    teams, rounds = int(lg["teams"]), int(lg["rounds"])

    # THE BOARD IS ALWAYS teams x rounds. This asserted `- len(forfeited)` until
    # 2026-08-13, which is the compressed model: it required the artifact to
    # DELETE a forfeited pick. Sleeper occupies it instead — 150 picks in 2023
    # (0 keepers), 2024 (23) and 2025 (20) alike, per this league's own log.
    assert len(picks) == teams * rounds, (
        "the board has %d rows against %d x %d — a forfeited pick is OCCUPIED, "
        "not deleted" % (len(picks), teams, rounds))

    # The subtraction still exists; it just belongs to the OTHER quantity. Two
    # named fields rather than one overloaded count is the whole repair.
    assert po["live_picks"] == teams * rounds - len(forfeited), (
        "live_picks %s does not reconcile with %d forfeits on a %d-row board"
        % (po.get("live_picks"), len(forfeited), len(picks)))
    flagged = [p for p in picks if p.get("keeper_slot")]
    assert len(flagged) == len(forfeited), (
        "%d keeper-flagged slots against %d forfeits — a PARTIAL application, "
        "which is exactly what this guard exists to catch"
        % (len(flagged), len(forfeited)))
    # And each flagged slot must sit in a round somebody actually forfeited.
    lost = {(int(f["team_slot"]), int(f["cost_round"])) for f in forfeited}
    assert {(int(p["slot"]), int(p["round"])) for p in flagged} == lost

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


# ── THE GATE: PARTIAL SLATES STAY OFF THE LIVE BOARD ─────────────────────────
# Cory's ruling, 2026-08-11. He gave it for PREDICTIONS; it applies with equal
# force to a partial set of REAL designations, and that is the harder case
# because it looks more legitimate. A board on 34/147 is known-provisional. A
# board on 31 because four of ten owners have declared is authoritative-looking,
# wrong, and has ALREADY MOVED ONCE — so the move that matters carries no signal.
def _build_mod():
    sys.path.insert(0, os.path.join(ROOT, "draft"))
    import build as B
    return B


def test_partial_designations_are_withheld_from_the_live_board():
    B = _build_mod()
    full = {4: [{"player_id": "1"}, {"player_id": "2"}, {"player_id": "3"}],
            1: [{"player_id": "9"}, {"player_id": "8"}, {"player_id": "7"}],
            2: [{"player_id": "6"}]}
    cfg = {"my_draft_slot": 4, "teams": 10}
    got, held = B._keeper_map_for_board(full, {"status": "predicted"}, cfg)
    assert list(got) == [4], "an opponent's designation reached an unconfirmed board"
    assert len(got[4]) == 3
    assert held["withheld"] is True and held["teams"] == 2 and held["keepers"] == 4
    assert held["reason"], "withholding without a reason is indistinguishable from a bug"


def test_a_confirmed_slate_applies_every_designation():
    B = _build_mod()
    full = {4: [{"player_id": "1"}], 1: [{"player_id": "9"}], 2: [{"player_id": "6"}]}
    cfg = {"my_draft_slot": 4, "teams": 10}
    got, held = B._keeper_map_for_board(full, {"status": "confirmed"}, cfg)
    assert got == full, "confirmation is the switch; nothing may be held back after it"
    assert held["withheld"] is False and held["keepers"] == 0


def test_withheld_is_not_the_same_state_as_dropped():
    """Both leave the board short. Only one is a fault, and the artifact must say which.

    THIS TEST ASSERTED THE BUG FOR ONE COMMIT. It checked
    `designations_not_applied == 1` while the gate was withholding exactly that
    one team — so it read as a passing distinction test while the two states were
    in fact fused. The live board then rendered both messages at once, with the
    fix line blaming a generator that had done its job. A test can name the right
    property and assert the value produced by the defect; the name is not the
    check. It now pins the SEPARATION explicitly: withheld > 0 and dropped == 0.
    """
    B = _build_mod()
    cfg = {"my_draft_slot": 4, "teams": 10}
    full = {4: [{"player_id": "1"}], 7: [{"player_id": "5"}]}
    post, held = B._keeper_map_for_board(full, {"status": "predicted"}, cfg)
    slate = B._keeper_slate_reconciled(
        {"teams_designated": 2}, post, _FakeOrder([34]), cfg, held, full)
    assert slate["withheld_from_board"]["withheld"] is True
    assert slate["withheld_from_board"]["keepers"] == 1
    assert slate["designations_not_applied"] == 0, (
        "the gate's deliberate withholding is being counted as a generator failure")


def test_a_real_generator_drop_still_counts_even_while_the_gate_withholds():
    """The other side of the same seam: withholding must not MASK a real drop.

    Fixing the double-count by measuring against the full map would be worthless
    if it also swallowed genuine losses. Sleeper says three teams designated; the
    generator placed two; the gate then withholds the one opponent it did place.
    Exactly one drop must survive that.
    """
    B = _build_mod()
    cfg = {"my_draft_slot": 4, "teams": 10}
    full = {4: [{"player_id": "1"}], 7: [{"player_id": "5"}]}   # generator placed 2 of 3
    post, held = B._keeper_map_for_board(full, {"status": "predicted"}, cfg)
    slate = B._keeper_slate_reconciled(
        {"teams_designated": 3}, post, _FakeOrder([34]), cfg, held, full)
    assert slate["designations_not_applied"] == 1, "a real drop was masked by the gate"
    assert slate["withheld_from_board"]["withheld"] is True


class _FakeOrder:
    """A stand-in for TruePickOrder — and it must carry EVERY field the real one
    does, or it tests a shape the code never sees.

    `my_original_picks` was missing and `build.py` grew a reader for it (the
    first-pick-by-keeper-count map). The stub raised AttributeError, which is the
    GOOD failure — but it is luck: had the code used `getattr(..., None)` the
    stub would have gone green while emitting a map with nothing in it. A partial
    stub is a silent-divergence risk, not a convenience."""

    def __init__(self, my_picks, my_original_picks=None):
        self.my_picks = my_picks
        # The full pre-keeper snake. Defaults to `my_picks` so existing callers
        # keep working, and callers that care pass a real one.
        self.my_original_picks = list(my_original_picks if my_original_picks
                                      is not None else my_picks)
        self.picks = []
        self.forfeited = []
        self.board = []
