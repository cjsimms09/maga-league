"""Keeper-placement mechanics — the heterogeneous fixture (draft-critical).

Spec: docs/queued/keeper-placement-verification.md §5. The league lets each team
keep 0–3 players; keeping N forfeits THAT team's rounds 1..N. Teams keeping fewer
than 3 have LIVE picks inside rounds 1–3, and keep-0 is legal. Nothing may assume
rounds 1–3 are uniformly keepers.

This fixture drives four teams keeping 3, 2, 1, and 0 through the real pick-order
builder and asserts the per-team round-1–3 classification, my live-pick numbering,
and that survival math spans my early live picks. The commissioner placement-
mismatch alarm itself is a client concern, covered in draft/tests/reconcile.test.js.
"""
from __future__ import annotations

import keepers as K


# 10-team snake, 15 rounds, top_picks_flat (keep-N forfeits rounds 1..N).
# I sit in slot 4 and keep 2 — so I own a LIVE pick inside rounds 1–3 (round 3),
# which is exactly the case the numbering + survival math must get right.
CFG = {
    "teams": 10,
    "rounds": 15,
    "draft_type": "snake",
    "my_draft_slot": 4,
    "adp_blend_weight": 0.7,
    "keepers": {"cost_model": "top_picks_flat", "count": 3},
}

# team_slot -> keeper list. Counts span 3 / 2 / 1 / 0 across four teams.
KEEPERS = {
    1: [{"player_id": "t1a"}, {"player_id": "t1b"}, {"player_id": "t1c"}],  # keep 3
    4: [{"player_id": "mea"}, {"player_id": "meb"}],                        # ME, keep 2
    7: [{"player_id": "t7a"}],                                              # keep 1
    9: [],                                                                  # keep 0 (legal)
}


def _order():
    return K.build_true_pick_order(CFG, KEEPERS)


def _early_slots_by_team(order):
    """{team_slot: {round: 'keeper'|'live'}} for rounds 1–3, from the real order."""
    forfeited = {(f["team_slot"], f["cost_round"]) for f in order.forfeited}
    out = {}
    for team in range(1, CFG["teams"] + 1):
        out[team] = {}
        for rnd in (1, 2, 3):
            out[team][rnd] = "keeper" if (team, rnd) in forfeited else "live"
    return out


def test_keepn_forfeits_rounds_one_through_n_per_team():
    order = _order()
    got = sorted((f["team_slot"], f["cost_round"]) for f in order.forfeited)
    # keep-3 team burns rounds 1,2,3; keep-2 (me) burns 1,2; keep-1 burns 1; keep-0 burns nothing.
    assert got == [(1, 1), (1, 2), (1, 3), (4, 1), (4, 2), (7, 1)]


def test_no_uniform_rounds_1_3_are_keepers_assumption():
    cls = _early_slots_by_team(_order())
    # keep-3 team: all three early rounds are keeper-consumed.
    assert cls[1] == {1: "keeper", 2: "keeper", 3: "keeper"}
    # keep-2 (me): round 3 is LIVE.
    assert cls[4] == {1: "keeper", 2: "keeper", 3: "live"}
    # keep-1 team: rounds 2 AND 3 are LIVE — the earliest snipes on the board.
    assert cls[7] == {1: "keeper", 2: "live", 3: "live"}
    # keep-0 team: every early round is LIVE. The blanket assumption would be wrong here.
    assert cls[9] == {1: "live", 2: "live", 3: "live"}
    # A team we never mentioned keeps nobody — also fully live early.
    assert cls[5] == {1: "live", 2: "live", 3: "live"}


def test_teams_with_fewer_keepers_have_live_early_picks_in_the_order():
    order = _order()
    # Every surviving pick is a real live pick. Collect the (team, round) of all
    # survivors in rounds 1–3 and confirm the fewer-keeper teams actually appear.
    early_live = {(p["team_slot"], p["round"]) for p in order.picks if p["round"] <= 3}
    assert (7, 2) in early_live and (7, 3) in early_live   # keep-1 team, live r2/r3
    assert (9, 1) in early_live                            # keep-0 team, live r1
    assert (4, 3) in early_live                            # ME, live r3
    # ...and the keep-3 team has NO live pick in rounds 1–3.
    assert not any(t == 1 for (t, r) in early_live)


def test_my_live_picks_are_numbered_correctly():
    order = _order()
    total_picks = CFG["teams"] * CFG["rounds"]           # 150 slots
    forfeited_n = len(order.forfeited)                    # 3 + 2 + 1 = 6
    assert len(order.picks) == total_picks - forfeited_n  # renumbered survivors
    # I keep 2, so I have 15 − 2 = 13 live picks.
    assert len(order.my_picks) == CFG["rounds"] - 2 == 13
    # Renumbered pick numbers are strictly increasing and within range.
    assert order.my_picks == sorted(order.my_picks)
    assert order.my_picks[0] >= 1 and order.my_picks[-1] <= len(order.picks)
    # My FIRST live pick is a round-3 pick (rounds 1–2 forfeited). Confirm the
    # survivor at that overall really is mine and in round 3.
    first = order.my_picks[0]
    p = next(p for p in order.picks if p["overall"] == first)
    assert p["team_slot"] == CFG["my_draft_slot"] and p["round"] == 3


def test_my_original_picks_span_all_rounds_but_live_ones_skip_the_forfeits():
    order = _order()
    # My ORIGINAL picks (pre-keeper) run one per round, all 15.
    assert len(order.my_original_picks) == CFG["rounds"] == 15
    # Live picks are original minus the two I forfeited — never a shortened draft.
    assert len(order.my_picks) == len(order.my_original_picks) - 2


def test_survival_math_spans_my_early_live_picks():
    order = _order()
    # A player with a mid-first-round ADP: his survival must fall monotonically
    # as we look further down the (renumbered) board, and be computable at each
    # of my early live picks — the numbers the war room prices against.
    adp = 8.0
    probs = [K.survival_probability(adp, pick) for pick in order.my_picks[:4]]
    assert all(0.0 <= p <= 1.0 for p in probs)
    assert probs == sorted(probs, reverse=True)       # later pick => lower survival
    assert probs[0] < 0.5                              # already unlikely by my first (late) live pick


def test_keep_zero_is_legal_and_forfeits_nothing():
    # A dict that includes an explicit empty keeper list must not crash or forfeit.
    order = K.build_true_pick_order(CFG, {9: []})
    assert order.forfeited == []
    assert len(order.picks) == CFG["teams"] * CFG["rounds"]
