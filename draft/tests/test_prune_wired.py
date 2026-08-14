# TERRITORY: A
"""THE PRUNE EXISTED FOR A DAY WITH ZERO CALL SITES.

`board_activity.dormant` was written, documented, tested, imported by
`build.py` — and never called. Every test passed. The board kept shipping 1,158
players who have not taken an NFL snap since 2023, including Tom Brady.

That is this repo's own named failure class: **intention with no trigger**. A
function that is correct, guarded, covered by its own unit tests, and wired to
nothing looks exactly like a function that is working.

── WHY A TEST AND NOT A COMMENT ─────────────────────────────────────────────

The held block carried a careful explanation of why it was held and what would
un-hold it. That explanation is what a reader trusts, and it cannot tell you
whether the code beside it runs. The same shape has hit this repo four times in
a week: a pre-draft anchor whose comment promised behaviour the body had
stopped having, a header claiming one scoring rule differed when two did, a
bye fallback whose comment said "all 564 gaps fill" while zero did, and this.

So the wiring is asserted, not described.

── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────

It does not run the build — Sleeper is unreachable from here, and C said the
same when handing this over. It asserts the CALL SITE and re-measures the
SAFETY PROPERTY against the shipped artifact, which is the exact input the
prune receives. The one thing still unverified end to end is the wiring
executing inside a real build, and that happens at the next 08:00 rebuild.

Run: python -m pytest draft/tests/test_prune_wired.py -q
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

BUILD = (ROOT / "draft" / "build.py").read_text()
BOARD_PATH = ROOT / "public" / "draft_data.json"


# ── 1. IT IS CALLED. THAT IS THE WHOLE POINT OF THIS FILE. ──────────────────
def test_the_prune_has_a_call_site_at_all():
    """The assertion that would have failed for the entire day it was held."""
    assert "board_activity.dormant(" in BUILD, (
        "board_activity.dormant is imported but never called — the prune is "
        "inert and the board still ships retired players"
    )


def test_it_is_imported_rather_than_reimplemented():
    """One definition of dormant, not two that drift — the defect this repo has
    paid for repeatedly. If build.py ever grows its own conditions, the module's
    exemptions stop protecting the board while its tests keep passing."""
    assert re.search(r"^import board_activity", BUILD, re.M)
    # the conditions themselves must not be restated here
    assert "scored_recently" not in BUILD
    assert "search_rank" not in BUILD.split("board_activity.dormant(")[1][:2000]


def test_it_runs_AFTER_projections_attach():
    """WHERE IT RUNS IS THE DESIGN, not a detail. Before projections exist there
    is no market ADP and no projection to exempt anybody with, and running it in
    `load_players` — the obvious place — takes 7 rows FFC actually prices."""
    call = BUILD.index("board_activity.dormant(")
    proj = BUILD.index("FantasyPros projections skipped")
    assert proj < call, (
        "the prune runs before projections attach, so the two exemptions that "
        "stop it deleting a real player are not populated yet"
    )


def test_a_failure_can_never_break_the_build():
    """Hygiene is never a build dependency. A prune that can fail the nightly
    rebuild is worse than the eight retired players it removes."""
    tail = BUILD[BUILD.index("board_activity.dormant(") - 400:]
    assert "try:" in BUILD[:BUILD.index("board_activity.dormant(")][-400:]
    assert "except Exception" in tail[:1500]
    assert "the board keeps every row it had" in tail[:1500]


def test_it_REFUSES_rather_than_pruning_when_the_stores_are_unreadable():
    """An absence of evidence must never read as evidence of absence. If the
    weekly points stores cannot be read, `dormant` cannot know who played, and
    dropping the board on that basis would be catastrophic and silent."""
    tail = BUILD[BUILD.index("board_activity.dormant("):][:1200]
    assert '_act["status"] == "measured"' in tail, "prunes without checking status"
    assert "NOT APPLIED" in tail, "a refusal must announce itself in the build log"


# ── 2. THE SAFETY PROPERTY, RE-MEASURED RATHER THAN REMEMBERED ──────────────
def _split():
    if not BOARD_PATH.exists():
        pytest.skip("no built board in this checkout")
    import board_activity  # noqa: PLC0415

    board = json.loads(BOARD_PATH.read_text())
    rows = board.get("players") or []
    act = board_activity.dormant({"players": rows})
    if act["status"] != "measured":
        pytest.skip(f"dormant could not measure: {act.get('note')}")
    drop = {str(p.get("player_id")) for p in act["rows"]}
    return rows, [p for p in rows if str(p.get("player_id")) not in drop], drop


def test_NOTHING_DRAFTABLE_IS_LOST_at_any_position():
    """Each exemption asserted separately rather than as one count. A single
    number passes while any one of them has quietly stopped applying, and each
    is a different way to delete somebody who is genuinely being drafted."""
    rows, kept, drop = _split()
    lost = [p for p in rows if str(p.get("player_id")) in drop]
    assert not [p for p in lost if (p.get("adp") or 999) <= 225], "market-priced inside the relevant board"
    assert not [p for p in lost if (p.get("vorp") or 0) > 0], "positive VORP"
    assert not [p for p in lost if (p.get("proj_mean") or 0) > 0], "carries a projection"
    assert not [p for p in lost if p.get("rookie")], "a rookie"
    assert len(kept) < len(rows), "CONTROL — the prune actually removes something"


def test_the_defences_survive_intact():
    """DEF is the position the weekly store cannot see, so it is the one most
    at risk of being mistaken for dormant."""
    rows, kept, _ = _split()
    before = [p for p in rows if p.get("position") == "DEF"]
    after = [p for p in kept if p.get("position") == "DEF"]
    assert len(after) == len(before), {"before": len(before), "after": len(after)}


def test_real_kickers_survive_and_only_the_sentinel_ones_go():
    """Kickers are the thinnest real position on the board and the easiest to
    delete by accident."""
    _, kept, _ = _split()
    ks = [p for p in kept if p.get("position") == "K" and (p.get("adp") or 999) < 900]
    assert len(ks) >= 20, len(ks)


# ── 3. THE CLAIM I PUT IN THE COMMENT, CHECKED ──────────────────────────────
# The restored block asserts in prose that this fixes a name-collision hazard
# and cuts search noise. Prose beside data is exactly what this repo keeps
# getting wrong, so the checkable half is checked.
def test_it_removes_the_boards_only_name_collision():
    """`Frank Gore` appears twice at RB. Two rows with the same name and the
    same position are indistinguishable on a search result and in a crosswalk,
    and Cory reported a duplicate on screen as a defect."""
    rows, kept, _ = _split()
    def collisions(rs):
        seen, dup = set(), set()
        for p in rs:
            k = (p.get("name"), p.get("position"))
            if k in seen:
                dup.add(k)
            seen.add(k)
        return dup
    assert collisions(rows), "CONTROL — the collision exists before the prune"
    assert not collisions(kept), collisions(kept)


def test_it_removes_the_duplicate_NAMES_too():
    """Same name at DIFFERENT positions still reads as a duplicate to a human
    typing on the clock."""
    rows, kept, _ = _split()
    def dupe_names(rs):
        seen, dup = set(), set()
        for p in rs:
            n = p.get("name")
            if n in seen:
                dup.add(n)
            seen.add(n)
        return dup
    assert dupe_names(rows), "CONTROL — duplicates exist before the prune"
    assert not dupe_names(kept), dupe_names(kept)


def test_it_cuts_real_search_noise_not_just_row_count():
    """Cory: "The search for player tool is not working and not convenient."
    A row only costs him anything if it can SURFACE in a search for somebody he
    can actually take, which means sharing a surname with a draftable player.
    Row count alone would be a number without a consequence."""
    rows, _, drop = _split()
    def surname(p):
        parts = str(p.get("name") or "").split()
        return parts[-1].lower() if parts else ""
    draftable = {surname(p) for p in rows
                 if str(p.get("player_id")) not in drop and (p.get("adp") or 999) <= 150}
    noisy = [p for p in rows if str(p.get("player_id")) in drop and surname(p) in draftable]
    assert len(noisy) >= 50, (
        f"only {len(noisy)} dropped rows collide with a draftable surname — the "
        "search-noise claim in build.py's comment no longer holds and should be "
        "corrected rather than left standing"
    )
