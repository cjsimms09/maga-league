"""THE SHARED-STATE AUDIT — the metric that predicted every severity-1.

Every severity-1 this project has had came from ONE shared fact derived in more
than one place:

  * ROUNDS      — `roster_size - keeper_count` in one path, config in another.
                  The board said 12 rounds, the draft had 15.
  * SEAT        — `league.my_draft_slot` in one place, the mock rebuild's own
                  slot in another. Two live identities; picks landed on a
                  stranger's roster and the engine read the wrong need.
  * KEEPER SEAT — `kept_players.team_slot` is a LEAGUE seat; the lookup used the
                  ROOM seat. Every rehearsal started with an empty roster.
  * PICK        — `my_picks[0]` when sync was absent, picks-observed when it was
                  present. Manual mode froze at pick 34 forever.
  * OPPONENT    — profiles indexed by league `draft_slot`, read against a room
                  seat, with an order-fallback inventing names when neither
                  existed.

None was a hard bug to fix. Each was invisible because the second derivation
looked reasonable in isolation. So the count of independent derivations is not a
style metric — it is the leading indicator, and this test is it.

THE RULE: a canonical fact has ONE derivation. A second requires a cited
exemption naming why, so the exception is a decision on the record instead of an
accident nobody noticed.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
CLIENT = ROOT / "public" / "js" / "draft"

# A canonical fact: the pattern that DERIVES it, the accessor that owns the
# derivation, and any cited exemptions. An exemption must name a reason.
FACTS = {
    "seat": {
        "owner": "mySlot() / DraftSeat.resolve",
        "derivation": re.compile(r"\.my_draft_slot\b"),
        "files": ["app.js"],
        # Every surviving occurrence is a WRITE or the single derivation.
        # Four readers were converted to mySlot() to get here; the budget is
        # what remains, not what was convenient.
        "exempt": {
            "app.js:overrides": "WRITE — config override applied at load",
            "app.js:applySlot": "boot-time pick_order derivation, before state.seat exists",
            "app.js:refreshSeat x2": "THE derivation — feeds DraftSeat.resolve (2 lines)",
            "app.js:mySlot": "the accessor's own last-resort fallback",
            "app.js:applyDraftShape x3": "WRITE — commits the room seat with the rebuilt picks",
            "app.js:realSlot capture": "WRITE — preserves the league seat before the room seat lands",
            "app.js:setSlot": "WRITE — the one mutation point",
            # Cited 2026-08-10. These two read the LEAGUE seat deliberately, and
            # mySlot() is the wrong accessor for them BY DESIGN: it returns the
            # ROOM seat, and in a mock the room seat is a stranger's chair while
            # kept_players.team_slot is stamped in league seats. Routing them
            # through mySlot() would look tidier and would attribute my keepers to
            # whoever happens to sit in that mock slot — the exact seat-identity
            # confusion this audit was created after. The two-identity split is the
            # point; see the "Two live seat identities" comment at the use site.
            "app.js:myLeagueSeat": "READ of the LEAGUE seat — keepers are stamped in league seats, "
                                   "so the room seat would mis-attribute them in a mock",
            "app.js:keepersByTeam": "READ of the LEAGUE seat — keys my keepers for forfeit at the "
                                    "seat they were stamped against",
        },
        "max": 12,
    },
    "current_pick": {
        "owner": "pickState() / currentPick()",
        "derivation": re.compile(r"my_picks\[0\]|recentPicks\s*\|\|\s*\[\]\)\.length"),
        "files": ["app.js"],
        "exempt": {"app.js:pickState": "the one derivation"},
        "max": 2,
    },
    "rounds": {
        "owner": "config_schema.draft_rounds",
        "derivation": re.compile(r"roster_size\s*-\s*keeper|roster_size\s*-\s*\w*count"),
        "files": ["app.js", "keepers.js", "engine.js"],
        "exempt": {},
        "max": 0,          # the bug that started this; zero is the budget
    },
}


def _client_files():
    return {p.name: p.read_text() for p in CLIENT.glob("*.js")}


def _hits(text: str, pattern: re.Pattern) -> list[tuple[int, str]]:
    out = []
    for i, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        # Comments explain derivations; they do not create them.
        if stripped.startswith(("*", "//", "/*")):
            continue
        if pattern.search(line):
            out.append((i, stripped[:100]))
    return out


@pytest.mark.parametrize("fact", sorted(FACTS))
def test_each_canonical_fact_has_one_derivation(fact):
    spec = FACTS[fact]
    files = _client_files()
    found = []
    for fname in spec["files"]:
        if fname not in files:
            continue
        for lineno, line in _hits(files[fname], spec["derivation"]):
            found.append(f"{fname}:{lineno}: {line}")
    assert len(found) <= spec["max"], (
        f"'{fact}' is derived {len(found)} times (budget {spec['max']}, owner "
        f"{spec['owner']}). Every severity-1 in this project came from a shared "
        f"fact derived in more than one place. Route new readers through the "
        f"owner, or add a cited exemption saying why this one is different.\n  "
        + "\n  ".join(found)
    )


def test_the_rounds_bug_cannot_come_back():
    """`roster_size - keeper_count` is the exact expression that shipped a
    12-round board for a 15-round draft. Budget zero, forever."""
    files = _client_files()
    for name, text in files.items():
        hits = _hits(text, FACTS["rounds"]["derivation"])
        assert not hits, f"{name}: rounds re-derived from roster_size - keepers: {hits}"


def test_the_audit_itself_is_not_vacuous():
    """A guard that matches nothing passes forever. Each pattern must actually
    fire on the code shape it polices."""
    seat = FACTS["seat"]["derivation"]
    assert seat.search("const s = league.my_draft_slot;")
    assert not seat.search("mySlot()")

    pick = FACTS["current_pick"]["derivation"]
    assert pick.search("return state.data.pick_order.my_picks[0] || 1;")

    rounds = FACTS["rounds"]["derivation"]
    assert rounds.search("const r = roster_size - keeper_count;")
    assert not rounds.search("cfg.draft_rounds")


def test_seat_bearing_artifact_fields_are_enumerated():
    """The structural half: every artifact field carrying a seat is LEAGUE-seat
    data, so any consumer comparing one to a room seat is wrong by construction.
    Enumerated here so a NEW seat-bearing field cannot be added silently."""
    import json
    art = ROOT / "public" / "draft_data.json"
    if not art.exists():
        pytest.skip("board not built")
    data = json.loads(art.read_text())
    teams = (data.get("league") or {}).get("teams") or 10
    seat_fields = {
        "kept_players[].team_slot": [k.get("team_slot") for k in data.get("kept_players") or []],
        "pick_order.forfeited[].team_slot":
            [f.get("team_slot") for f in (data.get("pick_order") or {}).get("forfeited") or []],
    }
    for name, vals in seat_fields.items():
        bad = [v for v in vals if v is not None and not (1 <= int(v) <= teams)]
        assert not bad, f"{name} holds out-of-range seats: {bad}"


def test_the_three_invariants_are_stated_where_they_are_enforced():
    """Three invariants over THREE POPULATIONS, and the populations are the
    whole difficulty. `drafted == picks` is false on a correct board because
    keepers are off the board without being pick events; and in a REHEARSAL the
    predicted opponent keepers are neither events nor placements, just absent.

    An assertion that fires on correct state gets deleted, so each term names
    the population it counts, in a comment, for a future session with no memory
    of the conversation that produced it."""
    app = (CLIENT / "app.js").read_text()
    assert "function assertPickState" in app
    assert "went BACKWARDS" in app                       # monotonicity
    assert "INVARIANT 1" in app and "INVARIANT 2" in app and "INVARIANT 3" in app
    # The three populations must be NAMED, not merely used.
    for term in ("pickEvents", "keeperPlacements", "removedFromBoard", "rehearsalRemovals"):
        assert term in app, f"population term '{term}' missing"
    assert "WHICH POPULATION EACH TERM COUNTS" in app
    # Invariant 3 is delegated, not re-implemented.
    assert "DraftReconcile.placementErrors" in app


def test_the_placement_law_exists_once_on_the_js_side():
    """Invariant 3 is `top_picks_flat`: a team keeping N forfeits rounds 1..N,
    so its keepers must occupy those rounds. One implementation, two callers —
    the commissioner reconcile and the pick-state invariant."""
    rec = (CLIENT / "reconcile.js").read_text()
    assert "function placementErrors" in rec
    assert "placementErrors: placementErrors" in rec     # exported
    app = (CLIENT / "app.js").read_text()
    assert "function placementErrors" not in app, "re-implemented in app.js"


def test_keeper_placement_law_holds_on_the_real_slate():
    """The Python half of the pair. Same law, same field (`cost_round`), so the
    two cannot diverge in MEANING even though the languages differ."""
    import json
    art = ROOT / "public" / "draft_data.json"
    if not art.exists():
        pytest.skip("board not built")
    forfeited = (json.loads(art.read_text()).get("pick_order") or {}).get("forfeited") or []
    by_team: dict[int, list] = {}
    for f in forfeited:
        by_team.setdefault(int(f["team_slot"]), []).append(f)
    for seat, ks in by_team.items():
        n = len(ks)
        rounds = sorted(int(k["cost_round"]) for k in ks)
        assert rounds == list(range(1, n + 1)), (
            f"seat {seat} keeps {n} but its keeper costs are {rounds} — "
            f"top_picks_flat forfeits rounds 1..{n}"
        )


# ── THE POPULATION-LABEL REQUIREMENT ─────────────────────────────────────────
#
# Cory, 2026-08-08: any pick number, seat, or count must carry WHICH COORDINATE
# SYSTEM it is in, at its definition site.
#
# THREE DEFECTS IN ONE DAY came from a value being correct in one system and
# read in another — not from a wrong value:
#
#   1. `kept_players.team_slot` is a [league-seat]; the lookup used a
#      [room-seat]. Every rehearsal started with an empty roster.
#   2. `drafted.size` counts [board-removals]; the invariant compared it to
#      [pick-events]. Correct on both sides, false as an equation.
#   3. Cory's 34/41/54 are [live-sequence] (post-keeper-forfeit); a test fed
#      them to snake arithmetic expecting [absolute-pick]. Pick 34 is seat 4
#      live and seat 7 absolute — both right, in different systems.
#
# A wrong value gets caught by a test. A right value in the wrong system does
# not, because every individual step looks correct. The label is the only thing
# that makes the mismatch visible at the point of use.

COORDINATE_VOCAB = {
    "[league-seat]",     # my seat in the real league
    "[room-seat]",       # my seat in the room being drafted now
    "[live-sequence]",   # pick numbers AFTER keeper forfeits
    "[absolute-pick]",   # position in an unforfeited snake
    "[pick-events]",     # picks observed this draft
    "[placements]",      # kept, never drafted
    "[board-removals]",  # absent for any reason (superset)
}

# Values that carry a coordinate system, and the file that DEFINES each. Adding
# a new such value means adding a row — which is the point: the registry is the
# list of things a future session must not conflate.
LABELLED_VALUES = [
    ("seat.js", "roomSlot:", "[room-seat]"),
    ("seat.js", "realSlot:", "[league-seat]"),
    ("seat.js", "function slotOfPick", "[absolute-pick]"),
    ("app.js", "const pickEvents", "[pick-events]"),
    ("app.js", "const keeperPlacements", "[placements]"),
    ("app.js", "const removedFromBoard", "[board-removals]"),
    ("app.js", "currentPick: pickEvents + 1", "[live-sequence]"),
    ("app.js", "const keeperSeat", "[league-seat]"),
]

LABEL_WINDOW = 4          # lines above the definition the label may sit in


@pytest.mark.parametrize("fname,anchor,label", LABELLED_VALUES)
def test_every_coordinate_bearing_value_is_labelled(fname, anchor, label):
    text = (CLIENT / fname).read_text()
    lines = text.splitlines()
    idx = next((i for i, l in enumerate(lines) if anchor in l), None)
    assert idx is not None, f"{fname}: definition site '{anchor}' not found — registry is stale"
    window = "\n".join(lines[max(0, idx - LABEL_WINDOW):idx + 1])
    assert label in window, (
        f"{fname}: '{anchor}' defines a coordinate-bearing value but does not name "
        f"its system within {LABEL_WINDOW} lines. Expected {label}. Three defects "
        f"in one day came from a value being correct in one system and read in "
        f"another; the label is what makes that visible at the point of use."
    )


def test_the_vocabulary_is_closed_and_actually_used():
    """Anti-overreach + non-vacuity. Labels must come from the controlled set —
    an invented one is drift — and each one must appear somewhere, or the
    registry is describing a system nobody uses."""
    text = "".join((CLIENT / f).read_text() for f in ("seat.js", "app.js"))
    used = set(re.findall(r"\[[a-z-]+\]", text))
    # Only labels that look like coordinate systems are policed; markdown links
    # and array literals are not vocabulary.
    coordinate_shaped = {u for u in used if u.endswith(("-seat]", "-pick]", "-events]",
                                                       "placements]", "-removals]", "-sequence]"))}
    unknown = coordinate_shaped - COORDINATE_VOCAB
    assert not unknown, f"coordinate labels outside the vocabulary: {sorted(unknown)}"
    for label in COORDINATE_VOCAB:
        assert label in text, f"{label} is in the vocabulary but used nowhere"


def test_the_two_seat_systems_are_never_silently_equated():
    """The keeper-seat bug in one assertion: a [league-seat] and a [room-seat]
    must not be compared without the difference being named."""
    app = (CLIENT / "app.js").read_text()
    assert "state.realSlot) ? Number(state.realSlot) : seatSlot" in app
    i = app.index("const keeperSeat")
    assert "[league-seat]" in app[max(0, i - 400):i]
