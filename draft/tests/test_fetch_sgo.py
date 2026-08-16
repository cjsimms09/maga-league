# TERRITORY: A
"""fetch_sgo.parse_snapshot_sgo — the pure surface, tested without a network.

The claims: game-level lines extracted from SGO's oddID-keyed dict with book
numbers preferred over fair, player props dropped by pattern, implied team
totals only when BOTH inputs exist, string numbers coerced, raw game-level
odd objects preserved, _territory leads the document, and cost accounting
(objects = events) recorded in provenance.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from fetch_sgo import parse_snapshot_sgo  # noqa: E402


def _event(odds, home="Kansas City Chiefs", away="Buffalo Bills"):
    return {"eventID": "e1", "status": {"startsAt": "2026-09-10T00:15:00Z"},
            "teams": {"home": {"names": {"long": home}},
                      "away": {"names": {"long": away}}},
            "odds": odds}


FULL_ODDS = {
    "points-home-game-sp-home": {"bookSpread": "-3.5", "fairSpread": "-4"},
    "points-all-game-ou-over": {"bookOverUnder": "47.5", "fairOverUnder": "48"},
    "points-home-game-ml-home": {"bookOdds": "-180", "fairOdds": "-195"},
    "points-away-game-ml-away": {"bookOdds": "+155"},
    # A player prop that must be filtered out (no "-game-" segment pattern
    # match on points-…-game- with entity, but pattern-real: SGO prop keys
    # carry the player entity in the oddID).
    "passing_yards-PATRICK_MAHOMES_1_NFL-game-ou-over": {"bookOverUnder": "285.5"},
    "points-home-1q-sp-home": {"bookSpread": "-1"},  # quarter line, not game
}


def _snap(events):
    return parse_snapshot_sgo(events, fetched_at="2026-09-10T12:00:00+00:00")


def test_game_lines_extracted_book_over_fair():
    g = _snap([_event(FULL_ODDS)])["games"][0]
    assert g["home_spread"] == -3.5      # bookSpread wins over fairSpread
    assert g["total"] == 47.5
    assert g["ml_home"] == -180.0
    assert g["ml_away"] == 155.0         # "+155" string coerced
    assert g["home"] == "Kansas City Chiefs" and g["away"] == "Buffalo Bills"


def test_implied_totals_need_both_inputs():
    g = _snap([_event(FULL_ODDS)])["games"][0]
    # home implied = (47.5 - (-3.5))/2 = 25.5; away = 22.
    assert g["implied_home"] == 25.5 and g["implied_away"] == 22.0
    only_total = _snap([_event({"points-all-game-ou-over":
                                {"bookOverUnder": "44"}})])["games"][0]
    assert "implied_home" not in only_total and "home_spread" not in only_total
    empty = _snap([_event({})])["games"][0]
    assert "total" not in empty and "implied_home" not in empty


def test_props_and_quarter_lines_dropped_raw_game_lines_kept():
    g = _snap([_event(FULL_ODDS)])["games"][0]
    kept = g["raw_game_lines"]
    assert "passing_yards-PATRICK_MAHOMES_1_NFL-game-ou-over" not in kept
    assert "points-home-1q-sp-home" not in kept
    assert "points-home-game-sp-home" in kept
    # fair number still recoverable from the raw ride-along
    assert kept["points-home-game-sp-home"]["fairSpread"] == "-4"


def test_provenance_territory_and_cost():
    s = _snap([_event(FULL_ODDS), _event({}, home="Detroit Lions",
                                         away="Green Bay Packers")])
    assert next(iter(s)) == "_territory"
    p = s["provenance"]
    assert p["objects_spent"] == 2
    assert "2500 objects/mo" in p["budget_note"]


def test_import_is_network_free():
    import fetch_sgo  # noqa: F401  (already imported; re-import is a no-op)
    assert callable(fetch_sgo.fetch)
