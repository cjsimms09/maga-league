# TERRITORY: A
"""Tests for draft/tools/board_preflight.py.

The preflight exists because reading `projection_provenance` (a key that does
not exist; the real one is `provenance.projections`) returned {} and produced
a false alarm that Cory's board might be running on last season's actuals six
days before his draft. It was not. These tests pin the two things that made
that failure possible: reading the right key, and making the fallback state
impossible to miss.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import board_preflight as BP  # noqa: E402


def _board(source="sleeper_projections", season="2026", nonzero=633,
           warning=None, players=None, gap=True):
    prov = {"source": source, "season": season, "rows": 9412, "nonzero": nonzero}
    if warning:
        prov["warning"] = warning
    if gap:
        prov["scoring_gap_vs_adp_market"] = {
            "measured": True,
            "market_overrides": {"pass_td": 4, "pass_int": -1},
            "positions": {"QB": {"mean_gap_points": 5.5},
                          "RB": {"mean_gap_points": 0.0}},
            "top12_qb": {"mean_gap_points": 43.67},
        }
    return {"built_at": "2026-08-16T14:10:12Z",
            "provenance": {"projections": prov},
            "players": players if players is not None else [
                {"name": "A", "position": "RB", "proj_mean": 300.0,
                 "proj_sleeper": 290.0, "proj_fantasypros": 310.0,
                 "proj_ownmodel": 280.0}]}


def test_reads_the_key_that_actually_exists():
    # The whole reason this tool was written.
    f = BP.check(_board())["facts"]
    assert f["source"] == "sleeper_projections"
    assert f["season"] == "2026"
    assert f["nonzero"] == 633


def test_healthy_board_is_clean_of_reds():
    assert BP.check(_board())["reds"] == []


def test_the_fallback_cannot_be_silent():
    # build.py switches to the PRIOR season's actuals when projections are
    # missing. That is a real board with a real cost and it must shout.
    r = BP.check(_board(source="sleeper_stats_2025",
                        warning="No 2026 projections published yet"))
    assert any("FALLBACK ACTIVE" in x for x in r["reds"])


def test_being_at_the_fallback_threshold_is_a_red():
    r = BP.check(_board(nonzero=42))
    assert any("fallback trigger" in x for x in r["reds"])


def test_threshold_matches_build_py_so_they_cannot_drift():
    build = (Path(__file__).resolve().parents[1] / "build.py").read_text()
    assert f"PROJECTION_MIN_NONZERO = {BP.PROJECTION_MIN_NONZERO}" in build


def test_missing_source_is_a_red_not_a_shrug():
    r = BP.check(_board(source=None))
    assert any("cannot tell what this board is built on" in x for x in r["reds"])


def test_separates_the_value_side_from_the_display_columns():
    # "Is our board an aggregate of ours and FantasyPros?" was hard to answer
    # because the displayed consensus and the ranking number are different
    # things. The preflight must state which is which.
    f = BP.check(_board())["facts"]
    assert f["proj_mean_composition"] == "sleeper_projections"
    assert set(f["display_only_sources"]) == {"proj_fantasypros", "proj_ownmodel"}


def test_skill_rows_without_a_source_number_are_amber_not_red():
    players = [
        {"name": "Keenan Allen", "position": "WR", "proj_mean": 86.34,
         "proj_ownmodel": 135.26},                      # no proj_sleeper
        {"name": "Rams", "position": "DEF", "proj_mean": 132.0},  # expected
    ]
    r = BP.check(_board(players=players))
    assert r["reds"] == []
    assert any("skill-position rows" in a for a in r["ambers"])
    # K/DEF are Sleeper-only by design and must not inflate the skill count.
    assert r["facts"]["skill_rows_missing_source_number"] == 1
    assert r["facts"]["rows_missing_source_number"] == 2


def test_surfaces_the_qb_scoring_edge_rather_than_burying_it():
    f = BP.check(_board())["facts"]
    assert f["market_overrides"] == {"pass_td": 4, "pass_int": -1}
    assert f["top12_qb_edge_points"] == 43.67


def test_unmeasured_scoring_gap_is_flagged():
    r = BP.check(_board(gap=False))
    assert any("Scoring gap" in a for a in r["ambers"])


def test_render_names_the_value_source_in_plain_text():
    out = BP.render(BP.check(_board()))
    assert "sleeper_projections" in out and "VALUE SIDE" in out
    assert "NOT in the value" in out
