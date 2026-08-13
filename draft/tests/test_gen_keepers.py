"""gen_keepers_json: every designation is accounted for, or named with a reason.

THE DEFECT THESE LOCK DOWN. The generator placed only owners whose draft slot it
knew — mine — and `continue`d past the rest into an `_unplaced` counter nothing
read. Because `keepers.json` feeds BOTH the pick order and the draftable pool,
four designations became one: 147 picks instead of 133, my first pick 34 instead
of 20, and fourteen kept players left in the pool at ADP 1.1-22.1. Nothing was
red. A filter over a real board always returns something plausible.

Two rules are asserted here, and they are the same rule twice:

  ABSENT IS NOT ZERO. A designation we cannot place is not a team keeping
  nobody. It is placed provisionally and labelled.

  A DISCARD IS REPORTED WITH A REASON. A count tells you something went missing.
  It does not tell you what, or why, and it cannot be acted on.
"""
import json
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import gen_keepers_json as G  # noqa: E402

MINE = G.MY_OWNER


def _art():
    return {"players": [{"player_id": str(i), "name": "P%d" % i, "position": "RB"}
                        for i in range(1, 40)],
            "kept_players": []}


def _cfg(teams=10, slot=4):
    return {"teams": teams, "my_draft_slot": slot}


def _hist(rosters):
    return {"seasons": [{"season": "2025", "final_rosters": rosters}]}


def _roster(owner, keepers):
    return {"owner_id": owner, "keepers": keepers}


def test_a_designation_with_no_known_slot_is_placed_not_discarded():
    """The whole defect, in one assertion."""
    rosters = [_roster(MINE, ["1", "2", "3"]),
               _roster("opp-a", ["4", "5", "6"]),
               _roster("opp-b", ["7", "8"])]
    out = G.build(_cfg(), _art(), _hist([]), rosters=rosters)
    assert out["_designating_teams"] == 3
    assert out["_placed_teams"] == 3, "an unplaceable designation was dropped again"
    assert out["_total_keepers"] == 8
    assert out["_problems"] == []


def test_the_provisional_slots_are_labelled_and_mine_is_not():
    rosters = [_roster(MINE, ["1"]), _roster("opp-a", ["2"])]
    out = G.build(_cfg(slot=4), _art(), _hist([]), rosters=rosters)
    by_slot = {t["draft_slot"]: t for t in out["teams"]}
    assert by_slot[4]["owner_id"] == MINE
    assert by_slot[4]["slot_provisional"] is False, "my own seat is known, not a guess"
    other = [t for t in out["teams"] if t["owner_id"] != MINE][0]
    assert other["slot_provisional"] is True, (
        "an assigned seat that is not labelled provisional reads as a known seat")
    assert out["_provisional_slots"] == 1


def test_placement_is_deterministic_across_runs():
    """A nightly re-run must not churn the board by reshuffling seats."""
    rosters = [_roster("opp-c", ["9"]), _roster(MINE, ["1"]), _roster("opp-a", ["2"])]
    a = G.build(_cfg(), _art(), _hist([]), rosters=rosters)
    b = G.build(_cfg(), _art(), _hist([]), rosters=list(reversed(rosters)))
    assert a["teams"] == b["teams"], "seat assignment depends on input order"


def test_more_designations_than_seats_is_reported_with_a_reason():
    """The one case that still cannot be represented — named, never silent."""
    rosters = [_roster(MINE, ["1"])] + [_roster("opp-%d" % i, ["2"]) for i in range(12)]
    out = G.build(_cfg(teams=10), _art(), _hist([]), rosters=rosters)
    assert out["_designating_teams"] == 13
    assert out["_placed_teams"] == 10, "cannot place more teams than there are seats"
    probs = [p for p in out["_problems"] if p["kind"] == "no_free_slot"]
    assert len(probs) == 3
    for p in probs:
        assert p["reason"], "a discard without a reason is a count, not a report"
        assert p["keepers"], "the reason must carry WHAT was lost, not just that something was"
    # ACCOUNTING: nothing vanishes between the input and the output.
    assert out["_placed_teams"] + len(probs) == out["_designating_teams"]


def test_a_keeper_missing_from_the_artifact_is_kept_and_named():
    """It still costs a round and still leaves the pool — so it must not be dropped."""
    rosters = [_roster(MINE, ["1", "99999"])]
    out = G.build(_cfg(), _art(), _hist([]), rosters=rosters)
    assert out["_total_keepers"] == 2, "the unknown player was dropped from the slate"
    probs = [p for p in out["_problems"] if p["kind"] == "player_not_in_artifact"]
    assert len(probs) == 1 and probs[0]["player_id"] == "99999"
    assert "forfeit is still charged" in probs[0]["reason"]


def test_no_designations_produces_an_empty_slate_not_a_crash():
    out = G.build(_cfg(), _art(), _hist([]), rosters=[_roster("opp-a", [])])
    assert out["teams"] == [] and out["_designating_teams"] == 0
    assert out["_problems"] == []


# ── THE SOURCE, WHICH WAS THE OTHER HALF OF THE SAME DEFECT ──────────────────
def test_the_source_of_the_designations_is_recorded():
    """A stale cache and a live read are different claims and must not read alike.

    The generator read league_history.json while the board's slate stamp read
    live Sleeper, and the history export sits behind a manual workflow_dispatch
    flag the nightly never sets — so the two saw 2 teams and 4 teams and the
    disagreement was structural, not a race.
    """
    # Injected rosters are labelled "injected", NOT "sleeper". A source field
    # that can claim a live read it never made is worth less than none at all.
    out = G.build(_cfg(), _art(), _hist([]), rosters=[_roster(MINE, ["1"])])
    assert out["_designations_source"] == "injected"

    hist = _hist([_roster(MINE, ["1"]), _roster("opp-a", ["2"])])
    found, src = G.designations(hist, rosters=hist["seasons"][0]["final_rosters"])
    assert len(found) == 2 and src == "injected"


def test_sleeper_metadata_keepers_are_read_too():
    """Sleeper puts keepers on the roster OR under metadata; both are designations."""
    rosters = [{"owner_id": MINE, "keepers": None, "metadata": {"keepers": ["1", "2"]}}]
    out = G.build(_cfg(), _art(), _hist([]), rosters=rosters)
    assert out["_total_keepers"] == 2


# ── AND THE BOARD IT PRODUCES MUST SATISFY THE ARITHMETIC ────────────────────
def test_the_generated_slate_drives_the_expected_pick_numbers():
    """End to end: designations -> keepers.json shape -> pick order -> my first pick.

    This is the link the old code broke silently. It is asserted against the same
    identity Cory checks by eye — and the identity itself was wrong until
    2026-08-13: at slot 4 keeping three, `first_pick == 37`, FULL STOP. It used
    to read `first_pick + total_keepers == 37`, which is the compressed model.
    Sleeper leaves a forfeited pick in place, occupied, so nothing another team
    keeps can move my seat.
    """
    import keepers as KP
    rosters = ([_roster(MINE, ["1", "2", "3"])]
               + [_roster("opp-%d" % i, ["%d" % (10 + i * 3 + j) for j in range(3)])
                  for i in range(4)]
               + [_roster("opp-x", ["30", "31"])])
    out = G.build(_cfg(), _art(), _hist([]), rosters=rosters)
    total = out["_total_keepers"]
    assert total == 17

    cfg = {"teams": 10, "rounds": 15, "draft_type": "snake", "my_draft_slot": 4,
           "keepers": {"cost_model": "top_picks_flat", "count": 3}}
    by_team = {t["draft_slot"]: t["keepers"] for t in out["teams"]}
    order = KP.build_true_pick_order(cfg, by_team)
    # LIVE selections drop with the keeper count; the BOARD does not.
    assert len(order.picks) == 150 - total == 133
    assert len(order.board) == 150
    assert order.my_picks[0] == 37, (
        "the generated slate does not produce the pick numbers the arithmetic predicts")
    # CONTROL — a slate this large genuinely would have moved the old number, so
    # the assertion above is not passing because `total` happens to be small.
    assert total >= 10
