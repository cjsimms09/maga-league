# TERRITORY: C
"""THE PRE-DECLARED BOARD-VS-MARKET COMPARISON.

Written break-first: each mutation below was applied and the suite watched before the
assertion was written. The mutations matter here because every one of them produces a
report that LOOKS like a finding — a count, a list of names, a verdict sentence — while
measuring something other than what was registered.

Run: python3 -m pytest draft/tests/test_board_vs_market.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import board_vs_market as BM  # noqa: E402


def board(n=4):
    """A tiny board: two priced, two in the fallback tail."""
    return [
        {"player_id": "S1", "name": "Ja'Marr Chase", "position": "WR", "team": "CIN",
         "adp": 2.5, "adp_source": "fantasypros", "proj_mean": 250.0},
        {"player_id": "S2", "name": "Bijan Robinson", "position": "RB", "team": "ATL",
         "adp": 3.8, "adp_source": "fantasypros", "proj_mean": 240.0},
        {"player_id": "S3", "name": "David Njoku", "position": "TE", "team": "CLE",
         "adp": 916.0, "adp_source": "search_rank", "proj_mean": 140.0},
        {"player_id": "S4", "name": "Dalton Schultz", "position": "TE", "team": "HOU",
         "adp": 916.0, "adp_source": "search_rank", "proj_mean": 120.0},
    ][:n]


def archive(rows=None, key=None, year="2026"):
    rows = rows or {"M1": 2.4, "M2": 3.9, "M3": 88.0, "M4": 140.0}
    key = key or {
        "M1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
        "M2": {"name": "Bijan Robinson", "position": "RB", "team": "ATL"},
        "M3": {"name": "David Njoku", "position": "TE", "team": "CLE"},
        "M4": {"name": "Dalton Schultz", "position": "TE", "team": "HOU"},
    }
    return {"series": [{"year": year, "observed_at": "2026-08-13",
                        "rows": rows, "row_count": len(rows)}],
            "players": key}


# ── the headline the pre-declaration registered ────────────────────────────
def test_the_HEADLINE_counts_market_picks_our_board_leaves_in_the_FALLBACK_TAIL():
    """THE REGISTERED NUMBER. Njoku at market pick 88 and Schultz at 140 are both
    inside 150, and our board has both at the 916 constant. MUTATION: count every
    matched player instead of only the unpriced ones — the number stops being about
    invisibility and becomes a coverage rate, which is a different question with a
    much friendlier answer."""
    r = BM.report(archive(), board(), top_n=150)
    assert r["inside_range"]["matched"] == 4
    assert r["inside_range"]["our_board_prices_them"] == 2
    assert r["inside_range"]["our_board_has_them_in_the_FALLBACK_TAIL"] == 2
    named = [x["name"] for x in r["inside_range"]["fallback_named"]]
    assert named == ["David Njoku", "Dalton Schultz"]


def test_the_RANGE_is_the_registered_one_and_actually_BOUNDS_the_comparison():
    """MUTATION: ignore `top_n` and compare the whole market board. Every deep-tail
    player the market never really drafts joins the count, and the headline inflates
    on players nobody in a 10-team league can reach."""
    r = BM.report(archive(), board(), top_n=100)
    assert r["market"]["inside_range"] == 3          # Schultz at 140 is outside
    assert r["inside_range"]["our_board_has_them_in_the_FALLBACK_TAIL"] == 1


def test_a_player_the_CROSSWALK_CANNOT_PLACE_is_not_counted_as_a_pricing_failure():
    """The two failures are different and conflating them lets a broken matcher read
    as a bad board. MUTATION: bucket unmatched rows with the fallback tail — the
    headline then rises whenever the crosswalk degrades, which is exactly backwards."""
    a = archive(rows={"M1": 2.4, "M9": 40.0},
                key={"M1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
                     "M9": {"name": "Nobody At All", "position": "WR", "team": "FA"}})
    r = BM.report(a, board(), top_n=150)
    assert r["inside_range"]["not_crosswalkable"] == 1
    assert r["inside_range"]["our_board_has_them_in_the_FALLBACK_TAIL"] == 0
    assert r["inside_range"]["matched"] == 1


# ── the market side is the LATEST snapshot, not a blend ────────────────────
def test_the_market_ordering_comes_from_the_LATEST_DAY_not_an_average():
    """MUTATION: merge every snapshot. A curve averaged over a fortnight is nobody's
    board on any day, and the question is what the market thinks NOW against what we
    charge NOW — the same reasoning F5 already applies to the replay."""
    a = archive()
    a["series"].append({"year": "2026", "observed_at": "2026-08-14",
                        "rows": {"M4": 1.0}, "row_count": 1})
    assert BM.market_ranks(a, "2026") == [("M4", 1.0)]


def test_a_season_with_NO_snapshot_returns_nothing_rather_than_another_years_board():
    """MUTATION: fall through to whatever snapshots exist. The comparison would run
    against 2025's market and report a 2026 finding."""
    assert BM.market_ranks(archive(year="2025"), "2026") == []


# ── the instrument diagnoses itself before it reports ──────────────────────
def test_a_BROKEN_CROSSWALK_VOIDS_the_verdict_rather_than_reporting_a_clean_board():
    """THE FAILURE THIS PROBE IS MOST LIKELY TO HIT. If the matcher stops matching,
    every market row becomes 'not crosswalkable', the fallback count is 0, and the
    verdict reads THE BOARD'S PRICING IS SOUND — a clean bill of health produced by a
    dead instrument. MUTATION: report the verdict without consulting the controls."""
    rows = [{"player_id": "S1", "name": None, "position": None, "team": None}]
    r = BM.report(archive(), rows, top_n=150)
    v = BM.verdict(r)
    assert v.startswith("INSTRUMENT FAILED")
    assert "SOUND" not in v          # the finding must be GONE, not adjacent


def test_a_HEALTHY_run_says_so_and_still_carries_the_control_line():
    r = BM.report(archive(), board(), top_n=150)
    v = BM.verdict(r)
    assert v.startswith("controls: 2/2 passed")
    assert "FALLBACK TAIL" in v


def test_the_DECLARED_FALSIFICATION_is_reported_plainly_when_it_happens():
    """If the tail holds nobody the market takes, the pre-declaration says to report
    that plainly and stop. MUTATION: reach for the shoulder, or for a smaller effect."""
    r = BM.report(archive(rows={"M1": 2.4, "M2": 3.9},
                          key={"M1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
                               "M2": {"name": "Bijan Robinson", "position": "RB", "team": "ATL"}}),
                  board(), top_n=150)
    assert r["inside_range"]["our_board_has_them_in_the_FALLBACK_TAIL"] == 0
    assert "PRICING IS SOUND" in BM.verdict(r)


def test_an_archive_with_NO_DECODE_KEY_cannot_report_a_clean_board():
    """The two days captured before the key existed. MUTATION: treat a missing key as
    'nothing to compare' and return zeros — which reads identically to agreement."""
    a = archive()
    a.pop("players")
    v = BM.verdict(BM.report(a, board(), top_n=150))
    assert "INSTRUMENT FAILED" in v or "NO MARKET ROW INSIDE THE RANGE CROSSWALKED" in v
    assert "PRICING IS SOUND" not in v
