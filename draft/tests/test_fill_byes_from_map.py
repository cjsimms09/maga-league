"""THE BYE BACKFILL — tested against a DEGRADED board, because the healthy one proves nothing.

The 2026-09-27 candidate board carried byes for 24 of 32 teams and the gate
refused it; the published 09-10 board carries all 32. So a test that only ever
runs against what is committed would pass on the day the defect shipped. The
fixtures here are built by REMOVING byes from the real board — the degradation
is synthesised, the board is not.
"""
from __future__ import annotations
import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import fill_byes_from_map as FB  # noqa: E402

BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
BYES = json.loads((ROOT / "src" / "nfl_byes.json").read_text())
SEASON = FB.season_of(BOARD)


def _degrade(board, teams):
    """A copy of the real board with `bye` stripped from the named teams."""
    b = copy.deepcopy(board)
    for p in b.get("players", []):
        if p.get("team") in teams:
            p["bye"] = None
    return b


def test_CONTROL_the_map_and_the_board_are_both_healthy_to_start_with():
    """Rule 3e — if the fixture is already broken, every verdict below is void."""
    assert BYES.get(SEASON), f"no bye map for season {SEASON}"
    assert len(BYES[SEASON]) == 32, f"the map has {len(BYES[SEASON])} teams, not 32"
    assert FB.teams_without_a_bye(BOARD) == [], \
        "the committed board is already missing byes — fix that before trusting this file"


def test_it_RESTORES_a_board_degraded_exactly_as_the_refused_one_was():
    """Eight teams stripped, which is the 32 -> 24 the gate reported."""
    victims = sorted(BYES[SEASON])[:8]
    bad = _degrade(BOARD, set(victims))
    assert sorted(FB.teams_without_a_bye(bad)) == victims, "the fixture did not degrade"

    rep = FB.fill(bad, BYES)
    assert FB.teams_without_a_bye(bad) == [], \
        f"still missing after the fill: {FB.teams_without_a_bye(bad)}"
    assert rep["filled"] > 0
    # and the restored values are the map's, not invented
    for p in bad["players"]:
        if p.get("team") in victims:
            assert p["bye"] == BYES[SEASON][p["team"]]


def test_it_NEVER_OVERWRITES_a_bye_the_feed_supplied():
    """The feed has to be able to land a real schedule correction."""
    bad = copy.deepcopy(BOARD)
    target = next(p for p in bad["players"] if p.get("team") not in FB.NOT_A_TEAM)
    target["bye"] = 99
    rep = FB.fill(bad, BYES)
    assert target["bye"] == 99, "the backfill overwrote a value the feed provided"
    assert any(d["board"] == 99 for d in rep["disagreements"]), \
        "a disagreement with the map must be REPORTED, or a stale map is invisible"


def test_FREE_AGENTS_are_left_alone_and_never_counted_as_missing():
    """FA has no schedule, so it has no bye; counting it would make the board
    permanently unfixable — which is the failure mode this tool exists to end."""
    assert "FA" not in FB.teams_without_a_bye(BOARD)
    bad = copy.deepcopy(BOARD)
    fa = [p for p in bad["players"] if p.get("team") == "FA"]
    if fa:
        FB.fill(bad, BYES)
        assert all(p.get("bye") in (None, 0) or not p.get("bye") for p in fa), \
            "a free agent was given a bye week"


def test_A_SEASON_WITH_NO_MAP_FILLS_NOTHING_RATHER_THAN_GUESSING():
    """`src/nfl_byes.json` says a wrong bye false-zeros a playing player and is
    worse than a dormant guard. Absent must beat guessed here too."""
    bad = _degrade(BOARD, set(BYES[SEASON]))
    rep = FB.fill(bad, {"1999": {}})
    assert rep.get("no_map_for_season") is True
    assert rep["filled"] == 0
    assert FB.teams_without_a_bye(bad), "it filled something from a map that does not exist"


def test_a_team_MISSING_FROM_THE_MAP_is_named_not_silently_skipped():
    bad = _degrade(BOARD, {"KC"})
    trimmed = {SEASON: {k: v for k, v in BYES[SEASON].items() if k != "KC"}}
    rep = FB.fill(bad, trimmed)
    assert "KC" in rep["no_map_entry"]
    assert rep["unfillable"] > 0


def test_CHECK_MODE_fails_on_a_degraded_board_and_passes_on_a_whole_one(tmp_path):
    """The --check arm is what a workflow would gate on, so it needs both verdicts."""
    good = tmp_path / "good.json"
    good.write_text(json.dumps(BOARD))
    assert FB.main(["--board", str(good), "--check"]) == 0

    bad_path = tmp_path / "bad.json"
    bad_path.write_text(json.dumps(_degrade(BOARD, set(sorted(BYES[SEASON])[:8]))))
    assert FB.main(["--board", str(bad_path), "--check"]) == 1, \
        "check mode passed a board missing eight teams' byes"


def test_WRITING_is_idempotent_and_leaves_a_healthy_board_untouched(tmp_path):
    p = tmp_path / "b.json"
    original = json.dumps(BOARD, separators=(",", ":"), sort_keys=True)
    p.write_text(json.dumps(BOARD))
    FB.main(["--board", str(p)])
    once = json.dumps(json.loads(p.read_text()), separators=(",", ":"), sort_keys=True)
    assert once == original, "a healthy board was modified by the backfill"
