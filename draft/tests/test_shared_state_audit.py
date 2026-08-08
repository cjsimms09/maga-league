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
        },
        "max": 10,
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
