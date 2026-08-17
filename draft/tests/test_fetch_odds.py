# TERRITORY: A
"""fetch_odds.parse_snapshot — the pure surface, tested without a network.

The claims: median-of-books per market (one book's quirk is not the league's
number, even count -> midpoint average), implied team totals derive only when
BOTH median inputs exist ("absent, not zero"), provenance carries the budget
headers, and _territory leads the document.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from fetch_odds import parse_snapshot  # noqa: E402


def _game(books):
    return {"home_team": "Kansas City Chiefs", "away_team": "Buffalo Bills",
            "commence_time": "2026-09-10T00:15:00Z", "bookmakers": books}


def _book(key, total=None, home_spread=None):
    markets = []
    if total is not None:
        markets.append({"key": "totals", "outcomes": [
            {"name": "Over", "point": total}, {"name": "Under", "point": total}]})
    if home_spread is not None:
        markets.append({"key": "spreads", "outcomes": [
            {"name": "Kansas City Chiefs", "point": home_spread},
            {"name": "Buffalo Bills", "point": -home_spread}]})
    return {"key": key, "markets": markets}


def _snap(games):
    return parse_snapshot(games, fetched_at="2026-09-10T12:00:00+00:00",
                          remaining="497", used="3")


def test_median_of_books_odd_and_even():
    g = _snap([_game([_book("a", total=47.5, home_spread=-2.5),
                      _book("b", total=48.5, home_spread=-3.0),
                      _book("c", total=51.0, home_spread=-3.5)])])["games"][0]
    assert g["total_median"] == 48.5           # odd count -> middle
    assert g["home_spread_median"] == -3.0
    g2 = _snap([_game([_book("a", total=47.0), _book("b", total=48.0)])])["games"][0]
    assert g2["total_median"] == 47.5          # even count -> midpoint


def test_implied_totals_need_both_inputs():
    both = _snap([_game([_book("a", total=48.0, home_spread=-4.0)])])["games"][0]
    # home implied = (total - home_spread)/2 = (48 - (-4))/2 = 26; away = 22.
    assert both["implied_home"] == 26.0 and both["implied_away"] == 22.0
    only_total = _snap([_game([_book("a", total=48.0)])])["games"][0]
    assert "implied_home" not in only_total and "home_spread_median" not in only_total
    empty = _snap([_game([])])["games"][0]
    assert "total_median" not in empty and "implied_home" not in empty


def test_provenance_and_territory():
    s = _snap([])
    assert next(iter(s)) == "_territory"
    p = s["provenance"]
    assert p["credits_remaining"] == "497" and p["credits_used"] == "3"
    assert "3 credits" in p["budget_note"]


def test_import_is_network_free():
    # Importing the module must never fetch — the sandbox cannot reach the
    # API, so a network-touching import would fail this suite everywhere.
    import fetch_odds  # noqa: F401  (already imported; re-import is a no-op)
    assert callable(fetch_odds.fetch)
