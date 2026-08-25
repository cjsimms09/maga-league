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
    to notice rather than to keep quietly maintaining.

    ⚠️ THIS CONTROL FIRED FALSELY ON 2026-08-25, AND THE THING THAT BROKE IT WAS
    THE FIX FOR THE DEFECT IT GUARDS. It read `d.get("slot_to_roster_id")` and
    called a populated field proof that Sleeper had served one. Once
    `history_export.py` started PERSISTING ITS OWN DERIVATION into that same
    field, every stored draft looked served — while the field directly beside it,
    `slot_to_roster_id_basis`, said in words: *"derived: round-1 pick order
    (Sleeper served none for this draft)"*. Five of five drafts, all derived, all
    reported as provider-served. Register 337.

    So the control reads the BASIS, which is the field that actually answers the
    question, and the presence of a map is no longer evidence of anything.
    """
    drafts = _stored_drafts()
    assert len(drafts) >= 3, "no stored drafts to check"
    served = [season for season, d in drafts
              if str(d.get("slot_to_roster_id_basis") or "").startswith("sleeper")]
    assert not served, (
        "Sleeper now serves slot_to_roster_id for completed drafts (%s) — read it "
        "and retire the derivation deliberately" % served)
    # and the control must be able to SEE a served map, or it is checking nothing
    assert HE._slot_map({"1": 7}, [])[1] == "sleeper", (
        "the basis this control looks for is not the one the export emits")


def test_THE_SERVED_PER_PICK_SEAT_CORROBORATES_THE_DERIVED_MAP():
    """THE STRONGER ROUTE, AND IT EXISTS NOW WHERE THE DOCSTRING SAYS IT CANNOT.

    This file states that the seat "never had to be derived at all; the projection
    threw it away", and that the derivation must stay "because a completed draft
    cannot be re-captured and these four are all the history there is".
    MEASURED 2026-08-25: `draft_slot` is present on 150 of 150 picks of EVERY
    stored draft, 2023 included. The store was re-fetched after the export was
    fixed, so the provider's own per-pick seat is available for all of history and
    the derivation can be checked against it rather than trusted. Register 337.

    Checked by MAJORITY, not by equality, because a traded pick is made by a
    roster that does not own the seat — and 2023-main contains eleven of them.
    A seat whose picks split evenly would mean the map is genuinely wrong; a seat
    with a 13-of-15 owner and two visitors means picks changed hands.
    """
    checked = 0
    for season, d in _stored_drafts():
        picks = [p for p in d["picks"] if p.get("draft_slot")]
        assert len(picks) == len(d["picks"]), (
            "%s: %d of %d picks carry no draft_slot — the provider's seat is "
            "being dropped again" % (season, len(d["picks"]) - len(picks),
                                     len(d["picks"])))
        mapping, _ = HE._slot_map(None, d["picks"])
        for seat, roster in mapping.items():
            at_seat = [p for p in picks if str(p["draft_slot"]) == str(seat)]
            owner = [p for p in at_seat if p.get("roster_id") == roster]
            assert len(owner) * 2 > len(at_seat), (
                "%s seat %s: the derived owner (roster %s) made only %d of %d "
                "picks from that seat — that is not a traded pick, that is a "
                "wrong map" % (season, seat, roster, len(owner), len(at_seat)))
        checked += 1
    assert checked >= 4, "corroborated only %d draft(s)" % checked


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
    with a field we did not ask for at the time.

    ⚠️ THE SECOND SENTENCE IS NO LONGER TRUE AND IS LEFT STANDING AS THE RECORD.
    The store WAS re-fetched, and `draft_slot` is on 150 of 150 picks of every
    stored draft including 2023. The source check below is kept because it names
    the regression precisely, but it is no longer the only evidence available —
    `test_THE_SERVED_PER_PICK_SEAT_CORROBORATES_THE_DERIVED_MAP` now checks the
    data itself, which is the stronger arm this docstring said we could not have.
    Register 337."""
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


#: C's four seats, KEYED BY DRAFT ID rather than by position in the store.
#: Register 337. This pin used to be `parametrize("season_idx", range(4))` reading
#: `_stored_drafts()[idx]`, which meant "the four drafts C measured" only for as
#: long as those were the only four in the store. The 2026 draft landed at the
#: FRONT of it, index 0 became a draft C never saw, and the pin refused a correct
#: map (roster 1 at seat 8) as an unexplained answer. Same defect as register 336
#: in a different file, one day apart: a SUBJECT selected by position while the
#: MEASUREMENT it is compared against was fixed to a name.
C_VERIFIED_SEATS = {
    "1001232801791856640": ("2023 main", 5),
    "990840142107619329": ("2023 keeper", 5),
    "1117672595379277825": ("2024", 6),
    "1248121522766217216": ("2025", 4),
}


def _seat_of_roster_1(d):
    mapping, _ = HE._slot_map(None, d["picks"])
    seats = [int(k) for k, v in mapping.items() if v == 1]
    assert len(seats) == 1, (d.get("draft_id"), seats)
    return seats[0]


@pytest.mark.parametrize("draft_id", sorted(C_VERIFIED_SEATS))
def test_the_RECOVERED_MAPS_are_the_ones_C_verified_independently(draft_id):
    """PINNED AGAINST C'S NUMBERS. They reported roster 1 at seat 5 / 6 / 5 / 4
    for 2023-main / 2024 / 2023-keeper / 2025, derived on their side without
    seeing this code. Two people reaching the same four seats from the same picks
    is weak on its own; two ROUTES agreeing (round 1 and round 2, above) plus two
    people is what makes it worth pinning.

    Each of C's drafts is now pinned to ITS OWN seat rather than to a range that
    covered all four — a range is what let an unmeasured draft slip in and be
    graded against someone else's answer.
    """
    d = next((d for _, d in _stored_drafts() if str(d.get("draft_id")) == draft_id),
             None)
    if d is None:
        pytest.skip("draft %s not in the stored history" % draft_id)
    label, expected = C_VERIFIED_SEATS[draft_id]
    got = _seat_of_roster_1(d)
    assert got == expected, (
        "%s: roster 1 at seat %s — C measured %s, so this is a different answer "
        "and needs explaining before it is trusted" % (label, got, expected))


def test_EVERY_STORED_DRAFT_IS_EITHER_C_VERIFIED_OR_KNOWINGLY_NOT():
    """The gap the index-keyed pin hid. A draft that neither C measured nor anyone
    has looked at should be VISIBLE as such, not silently graded against another
    season's number or silently skipped. 2026 is the first of these — corroborated
    by the two routes above and by the provider's own per-pick seat, but not by a
    second person, and that distinction is worth keeping on the record."""
    unverified = [(season, d.get("draft_id"), _seat_of_roster_1(d))
                  for season, d in _stored_drafts()
                  if str(d.get("draft_id")) not in C_VERIFIED_SEATS]
    assert len(unverified) <= 1, (
        "more than one stored draft has no independent seat check: %s" % unverified)
    for season, did, seat in unverified:
        assert str(season) == "2026" and seat == 8, (
            "%s (%s) puts roster 1 at seat %s and nobody has checked it "
            "independently — measure it before it binds a manager profile"
            % (season, did, seat))
