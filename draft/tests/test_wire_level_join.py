# TERRITORY: A
"""The wire level reaches the engine in the shape the engine reads.

Register 60 (3) said the feature was "a build.py change plus a config flip".
It was not: `engine.js`'s `wireBenchValue` reads `ctx.wireWeekly[position]`,
`app.js` passes `state.data.wire_level` verbatim, and the artifact's top level
is `{per_week, n, statistic, ...}` — not positions. Joining it unwrapped would
have produced `undefined` for every player, and `wireBenchValue` returns null on
exactly that, falling back to the vorp rule **indistinguishably from the flag
being off**.

So the contract that matters is not "is the key present" but "are its keys
POSITIONS". That is what this file pins, on both sides.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
SOURCE = ROOT / "draft" / "data" / "wire_level.json"
ENGINE = ROOT / "public" / "js" / "draft" / "engine.js"
APP = ROOT / "public" / "js" / "draft" / "app.js"

POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}


def test_the_source_artifact_wraps_its_map_which_is_the_whole_problem():
    """The known-positive control for everything below: if the source artifact
    were already flat, this test file would be guarding nothing."""
    src = json.loads(SOURCE.read_text())
    assert "per_week" in src
    assert not (set(src) & POSITIONS), (
        "the source artifact is now flat — the mismatch this file exists for is "
        "gone, and the join in build.py should be revisited rather than left "
        "unwrapping a key that no longer wraps anything")
    assert set(src["per_week"]) & POSITIONS


def test_engine_reads_wireWeekly_by_position():
    """Pins the consumer's contract from the consumer, not from a comment."""
    js = ENGINE.read_text()
    assert "wireWeekly[player.position]" in js, (
        "wireBenchValue no longer indexes by position — the shape this join "
        "targets has changed and build.py must change with it")


def test_app_passes_wire_level_straight_through_unwrapped():
    """If app.js starts reading `.per_week` itself, build.py must stop
    unwrapping or the engine gets undefined again — from the other direction."""
    js = APP.read_text()
    m = re.search(r"wireWeekly:\s*\(state\.data \|\| \{\}\)\.wire_level([^,\n]*)", js)
    assert m, "app.js no longer threads state.data.wire_level into wireWeekly"
    assert ".per_week" not in m.group(1), (
        "app.js now unwraps per_week itself — build.py's join would double-"
        "unwrap and hand the engine undefined")


def test_the_board_carries_a_flat_position_keyed_map():
    if not BOARD.exists():
        return
    board = json.loads(BOARD.read_text())
    if "wire_level" not in board:
        return       # a board built before this join; not a failure of the join
    wl = board["wire_level"]
    assert wl is None or (set(wl) and set(wl) <= POSITIONS), (
        f"board wire_level keys are {sorted(wl)} — the engine indexes this by "
        "position and would read undefined for every player, then fall back "
        "SILENTLY exactly as if the feature were off")
    if wl:
        for pos, v in wl.items():
            assert isinstance(v, (int, float)) and v > 0, (pos, v)


def test_the_provenance_travels_with_it():
    """Register 62 is about artifacts on the board that carry no stamp. The flat
    map alone is four numbers with no way to date them to the run that made
    them, so the full source rides alongside."""
    if not BOARD.exists():
        return
    board = json.loads(BOARD.read_text())
    if "wire_level" not in board:
        return
    src = board.get("wire_level_source")
    if board["wire_level"] is None:
        assert src is None
        return
    assert src and src.get("statistic") and src.get("scored"), (
        "the flat map shipped without its provenance")
    assert src.get("per_week") == board["wire_level"], (
        "the flat map and the artifact it was unwrapped from disagree")
