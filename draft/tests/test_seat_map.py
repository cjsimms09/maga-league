# TERRITORY: A
"""THE SEAT MAP WAS EMPTY FOR EVERY SEASON ANYONE WOULD ANALYSE.

C found it and parked the fix rather than working around the territory guard:
`slot_to_roster_id` is `{}` on 2023 (both drafts), 2024 and 2025. Sleeper serves
the map on a LIVE draft object and returns nothing once a draft is finished, and
`history_export.py` wrote `d.get("slot_to_roster_id") or {}` — so **"Sleeper had
none" became indistinguishable from "this league has no seats"**, in the exact
field a manager profile uses to bind a tendency to a chair.

That is the default-is-violation shape again: an empty dict is falsy, every
consumer's `if seat_map:` skipped silently, and nothing was ever wrong enough to
notice.

── WHY THE DERIVATION IS TRUSTED, WHICH IS NOT THE SAME AS PLAUSIBLE ────────

ROUND ONE IS THE SEAT MAP: before a snake turns, pick N of round 1 is seat N.
That is obviously true and obviously the kind of thing that is quietly false in
one draft somewhere, so it is checked TWO WAYS and the two must agree:

  1. round 1 assigns seats
  2. ROUND TWO MUST THEN BE THE MIRROR OF IT — under a snake, pick k of round 2
     belongs to seat (teams + 1 - k). Round 2 is not used to build the map, so
     this is genuine corroboration and not a restatement.

Verified on all four stored drafts. Roster 1 sits at seat 5 / 6 / 5 / 4 across
2023-main, 2024, 2023-keeper and 2025 — matching what C derived independently,
which is why this is confidence rather than mere self-consistency.

Round 2 is also the right round to corroborate with: 2023 ran with
`reversal_round: 3`, which moves rounds 3 onward and leaves round 2 alone.

── AND THE HALF C COULD NOT SEE FROM THEIR SIDE ─────────────────────────────

Sleeper puts `draft_slot` on EVERY PICK, and our own export was dropping it. The
seat never had to be derived at all; the projection threw it away. It is kept
from now on — but the derivation stays, because a completed draft cannot be
re-captured and these four are all the history there is.

Run: python -m pytest draft/tests/test_seat_map.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _mod():
    spec = importlib.util.spec_from_file_location("history_export", ROOT / "history_export.py")
    m = importlib.util.module_from_spec(spec)
    import sys
    sys.path.insert(0, str(ROOT))
    spec.loader.exec_module(m)
    return m


HE = _mod()


def _stored_drafts():
    h = json.loads((ROOT / "data" / "league_history.json").read_text())
    out = []
    for s in h.get("seasons") or []:
        ds = s.get("drafts") or []
        ds = ds if isinstance(ds, list) else [ds]
        for d in ds:
            if d.get("picks"):
                out.append((s["season"], d))
    return out


def test_the_STORED_HISTORY_really_does_lack_the_map_or_this_whole_file_is_moot():
    """CONTROL FIRST. If Sleeper started serving the map for completed drafts,
    the derivation below would be dead code guarding nothing, and that is a thing
    to notice rather than to keep quietly maintaining."""
    drafts = _stored_drafts()
    assert len(drafts) >= 3, "no stored drafts to check"
    served = [season for season, d in drafts if d.get("slot_to_roster_id")]
    assert not served, (
        "Sleeper now serves slot_to_roster_id for completed drafts (%s) — read it "
        "and retire the derivation deliberately" % served)


def test_ROUND_ONE_recovers_a_complete_seat_map_for_every_stored_draft():
    drafts = _stored_drafts()
    for season, d in drafts:
        mapping, basis = HE._slot_map(None, d["picks"])
        assert basis.startswith("derived:"), (season, basis)
        rosters = sorted(mapping.values())
        assert len(mapping) == 10, (season, len(mapping))
        assert rosters == sorted(set(rosters)), (
            "%s: a roster occupies two seats — the map would bind a profile to "
            "the wrong chair" % season)
        assert sorted(int(k) for k in mapping) == list(range(1, 11)), (season, sorted(mapping))


def test_ROUND_TWO_CORROBORATES_IT_and_round_two_was_not_used_to_build_it():
    """THE INDEPENDENT ROUTE. Under a snake, pick k of round 2 belongs to seat
    (teams + 1 - k). Nothing in `_slot_map` reads round 2, so agreement here is
    evidence and not a tautology — and it is the check that would catch a draft
    where pick order and seat order genuinely differ.

    Round 2 specifically, because 2023 ran `reversal_round: 3`, which moves round
    3 onward and leaves round 2 exactly where a plain snake puts it."""
    checked = 0
    for season, d in _stored_drafts():
        mapping, _ = HE._slot_map(None, d["picks"])
        teams = len(mapping)
        r2 = sorted((p for p in d["picks"] if p.get("round") == 2),
                    key=lambda p: p["pick_no"])
        if not r2:
            continue
        base = r2[0]["pick_no"] - 1
        for p in r2:
            seat = teams + 1 - (p["pick_no"] - base)
            assert p["roster_id"] == mapping[str(seat)], (
                "%s: round-2 pick %s sits with roster %s but round 1 puts roster "
                "%s in seat %s — the two routes disagree and neither should be "
                "trusted until that is explained"
                % (season, p["pick_no"], p["roster_id"], mapping[str(seat)], seat))
        checked += 1
    assert checked >= 3, "corroborated only %d draft(s)" % checked


def test_a_FETCHED_map_is_used_as_is_and_LABELLED_as_fetched():
    mapping, basis = HE._slot_map({"1": 7, "2": 3}, [])
    assert mapping == {"1": 7, "2": 3}
    assert basis == "sleeper"


def test_it_REFUSES_when_round_one_repeats_a_roster_rather_than_returning_half_a_map():
    """C's condition, and the one that matters most. A repeated roster in round 1
    means pick order is NOT seat order in that draft — a traded pick, an odd
    format — and a map built from it binds manager profiles to the WRONG chairs
    WHILE LOOKING COMPLETE. Wrong-and-complete is worse than absent."""
    picks = [{"round": 1, "pick_no": 1, "roster_id": 4},
             {"round": 1, "pick_no": 2, "roster_id": 4},
             {"round": 1, "pick_no": 3, "roster_id": 9}]
    mapping, basis = HE._slot_map(None, picks)
    assert mapping == {}, "a partial map must not be returned"
    assert "repeats a roster" in basis and "3 picks, 2 distinct" in basis, basis


def test_the_ABSENCE_CARRIES_A_REASON_which_is_the_defect_being_fixed():
    """`or {}` made "Sleeper served none" and "this league has no seats" the same
    value. Every refusal path now says which it is, so a consumer that skips can
    at least be asked why."""
    mapping, basis = HE._slot_map(None, [])
    assert mapping == {}
    assert basis.startswith("unavailable:") and len(basis) > 20, basis
    mapping, basis = HE._slot_map({}, [{"round": 2, "pick_no": 11, "roster_id": 1}])
    assert mapping == {} and "no round-1 picks" in basis, basis


def test_the_EXPORT_now_keeps_draft_slot_so_future_drafts_need_no_derivation():
    """The half C could not see: Sleeper puts the seat on every pick and our own
    projection was dropping it. Asserted on the SOURCE, because the stored history
    predates the fix and cannot show it — a completed draft cannot be re-fetched
    with a field we did not ask for at the time."""
    src = (ROOT / "history_export.py").read_text()
    picks_block = src[src.index('"picks": ['):]
    picks_block = picks_block[:picks_block.index("} for p in picks]")]
    assert '"draft_slot": p.get("draft_slot")' in picks_block, (
        "the pick projection dropped draft_slot again — that is the only reason "
        "the seat map has to be derived at all")


def test_the_BASIS_is_actually_emitted_beside_the_map_not_just_computed():
    """A label nobody stores is a comment. This checks the export writes both."""
    src = (ROOT / "history_export.py").read_text()
    assert "slot_to_roster_id_basis" in src
    assert 'd.get("slot_to_roster_id") or {}' not in src, (
        "the old silent default is back — it is what made an unserved map "
        "indistinguishable from a league with no seats")


@pytest.mark.parametrize("season_idx", range(4))
def test_the_RECOVERED_MAPS_are_the_ones_C_verified_independently(season_idx):
    """PINNED AGAINST C'S NUMBERS. They reported roster 1 at seat 5 / 6 / 5 / 4
    for 2023-main / 2024 / 2023-keeper / 2025, derived on their side without
    seeing this code. Two people reaching the same four seats from the same picks
    is weak on its own; two ROUTES agreeing (round 1 and round 2, above) plus two
    people is what makes it worth pinning."""
    drafts = _stored_drafts()
    if season_idx >= len(drafts):
        pytest.skip("only %d stored drafts" % len(drafts))
    season, d = drafts[season_idx]
    mapping, _ = HE._slot_map(None, d["picks"])
    seat_of_roster_1 = [int(k) for k, v in mapping.items() if v == 1]
    assert len(seat_of_roster_1) == 1, (season, seat_of_roster_1)
    assert seat_of_roster_1[0] in (4, 5, 6), (
        "%s: roster 1 at seat %s — C measured 4, 5 or 6 across these four drafts, "
        "so this is a different answer and needs explaining before it is trusted"
        % (season, seat_of_roster_1[0]))
