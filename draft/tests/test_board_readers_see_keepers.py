# TERRITORY: A
"""REGISTER 476's GUARD — the keeper split has now caught TEN consumers.

The board keeps its 23 keepers in `kept_players`, not `players` (register
80). Ten readers walked `players` alone: the eighth was the site's weekly
emitter (register 437), the ninth the graded weekly champion, the tenth the
member matchup odds — which REFUSED for Cory's own lineup ("starter 7564 is
not on the board") every week. Each was found by accident, late.

This is the mechanical form: every IN-SEASON module that reads the board to
PROJECT or GRADE players must mention `kept_players` (i.e. index both lists),
or be listed below with the reason it legitimately does not. The draft-era
labs are out of scope on purpose — keepers are not draftable, and most of
those tools exclude them deliberately.

A known positive rides beside the static check: the committed board's
keepers resolve through the two Python readers this file can call.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

#: In-season readers of public/draft_data.json that project or grade players.
MUST_SEE_KEEPERS = [
    "draft/weekly_own_projection.py",              # the graded weekly champion (ninth consumer)
    "draft/tools/fetch_free_props.py",             # the props file's board crosswalk
    "draft/tools/props_second_opinion.py",         # reads the board through weekly_own_projection
    "netlify/functions/player-projection-cron.js", # the site's weekly emitter (eighth consumer, register 437)
    "src/routes/memberweek.js",                    # member matchup odds (tenth consumer)
    "src/routes/waivers.js",
    "src/routes/history-data.js",
]
#: In-season readers that do NOT need keepers, each with the reason.
EXEMPT = {
    "src/waiver_reco.js": "rosters come from Sleeper's playersDb; the board is read for FREE AGENTS, who are never keepers",
    "netlify/functions/waiver-reco-cron.js": "same computation as waiver_reco.js",
    "src/routes/member.js": "the waiver page, same as waiver_reco.js",
    "src/routes/admin.js": "the war-room shell and draft order; no in-season projection",
    "src/proj_feed.js": "buildFeed() has no caller in src/ or netlify/ — the header names the board, the code never reads it",
}


def test_every_in_season_board_reader_indexes_kept_players():
    missing = []
    for rel in MUST_SEE_KEEPERS:
        text = (ROOT / rel).read_text()
        assert "draft_data.json" in text or "_board_players" in text or "weekly_own_projection" in text, rel
        if "kept_players" not in text and "_board_players" not in text:
            missing.append(rel)
    assert not missing, f"in-season board readers that never index kept_players (register 476): {missing}"


def test_no_in_season_reader_is_unclassified():
    """Every in-season module that reads the board is either required or exempt
    with a reason — a new reader lands as a red test, not as the eleventh."""
    live_dirs = [ROOT / "src", ROOT / "netlify" / "functions"]
    readers = set()
    for d in live_dirs:
        for f in d.rglob("*.js"):
            if "node_modules" in f.parts or f.name.endswith(".test.js"):
                continue
            if "draft_data.json" in f.read_text():
                readers.add(str(f.relative_to(ROOT)))
    classified = set(MUST_SEE_KEEPERS) | set(EXEMPT)
    unclassified = sorted(readers - classified)
    assert not unclassified, f"live modules reading the board with no keeper classification: {unclassified}"
    for rel, why in EXEMPT.items():
        assert why and len(why) > 20, rel


def test_committed_board_keepers_resolve_through_the_python_readers():
    board = ROOT / "public" / "draft_data.json"
    doc = json.loads(board.read_text())
    kept = {str(k["player_id"]) for k in doc.get("kept_players") or []}
    if not kept:
        return
    import weekly_own_projection as WP
    ids = {str(p.get("player_id")) for p in WP._board_players(board)}
    assert kept <= ids, sorted(kept - ids)
    sys.path.insert(0, str(ROOT / "draft" / "tools"))
    from fetch_weekly_props import board_index
    idx = board_index(WP._board_players(board))
    hit = sum(1 for cands in idx.values() for c in cands if c[0] in kept)
    assert hit == len(kept), (hit, len(kept))
