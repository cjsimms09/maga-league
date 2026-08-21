# TERRITORY: C
"""Bovada lines capture — pins `walk()` after hoisting it from a nested
closure inside main() to module level (rule 11, so
bovada_event_props_probe.py can reuse it verbatim against a per-event
response). Fixture matches the real shape captured live in
draft/data/bovada_lines_2026.jsonl (a real committed row), not invented.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import bovada_lines_capture as BLC  # noqa: E402


def test_walk_extracts_an_event_shaped_dict_anywhere_in_the_tree():
    doc = {"a": {"b": [{"description": "Team A @ Team B", "startTime": 123,
                       "link": "/football/nfl/team-a-team-b-1",
                       "displayGroups": [{"description": "Game Lines", "markets": [
                           {"description": "Point Spread", "outcomes": [
                               {"description": "Team A",
                               "price": {"handicap": "-3.5", "american": "-110"}}]}
                       ]}]}]}}
    rows = BLC.walk(doc, ts="2026-01-01T00:00:00Z")
    assert len(rows) == 1
    assert rows[0]["game"] == "Team A @ Team B"
    assert rows[0]["markets"]["Point Spread"] == [{"o": "Team A", "h": "-3.5", "p": "-110"}]


def test_walk_prefixes_non_game_lines_groups_with_the_group_name():
    doc = {"description": "X @ Y", "startTime": 1, "link": "/l",
          "displayGroups": [{"description": "Alternate Lines", "markets": [
              {"description": "Spread/Total", "outcomes": [
                  {"description": "X +1.5", "price": {"handicap": "1.5", "american": "-260"}}]}
          ]}]}
    rows = BLC.walk(doc, ts="2026-01-01T00:00:00Z")
    assert "Alternate Lines|Spread/Total" in rows[0]["markets"]


def test_walk_returns_empty_on_a_response_with_no_event_shaped_dict():
    assert BLC.walk({"error": "not found"}) == []
    assert BLC.walk([]) == []
    assert BLC.walk("a 404 body, not json structure") == []


def test_walk_skips_an_event_dict_with_no_extractable_markets():
    doc = {"description": "X @ Y", "startTime": 1, "link": "/l", "displayGroups": []}
    assert BLC.walk(doc) == []


def test_walk_stamps_every_row_with_the_same_passed_timestamp():
    doc = [{"description": "A @ B", "startTime": 1, "link": "/1",
           "displayGroups": [{"description": "Game Lines", "markets": [
               {"description": "Total", "outcomes": [
                   {"description": "Over", "price": {"handicap": "44.5", "american": "-110"}}]}
           ]}]},
          {"description": "C @ D", "startTime": 2, "link": "/2",
           "displayGroups": [{"description": "Game Lines", "markets": [
               {"description": "Total", "outcomes": [
                   {"description": "Over", "price": {"handicap": "40.5", "american": "-110"}}]}
           ]}]}]
    rows = BLC.walk(doc, ts="2026-08-21T12:00:00Z")
    assert len(rows) == 2
    assert all(r["ts"] == "2026-08-21T12:00:00Z" for r in rows)
