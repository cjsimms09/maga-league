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


# ── SLEEPER'S OWN ORDERING vs THE MARKET'S PRICE ─────────────────────────────
#
# Cory's hypothesis: our room drafts on Sleeper and leans on Sleeper's default
# list, which would be an exploitable edge. `sleeper_rank` is on every board row,
# so the comparison is offline — but I ran it once as a shell one-liner and two
# of the four position numbers I reported were artifacts of my own arithmetic.
# Both are fail arms below.

def _sl(pid, pos, adp, sleeper_rank):
    return {"player_id": pid, "position": pos, "adp": adp,
            "sleeper_rank": sleeper_rank, "name": pid}


def test_a_SENTINEL_RANK_IS_NOT_A_RANK():
    """MEASURED, NOT SUPPOSED: five players inside the top 150 sit at
    `sleeper_rank` 400.0 and every one of them is a team DEFENCE — Rams, Texans,
    Seahawks, Eagles, Broncos. Sleeper does not rank defences in its search
    ordering, it parks them at 400. Another 301 players sit at exactly 999.0.

    My first pass counted those as ranks and duly reported `DEF +17 slots later`,
    which is not a finding about Sleeper — it is a filler value being read as an
    opinion. Null-as-absence, in the measurement built to check somebody else's.

    THE TEST IS STRUCTURAL, not a list of magic numbers: a value shared by three
    or more players AND larger than the population being ranked cannot be a
    position within that population.

    MUTATION: rank the sentinels with everyone else — the parked positions land at
    the bottom of the Sleeper ordering, every one of them reads as a player the
    market likes and Sleeper does not, and a whole position's median is invented."""
    rows = [_sl("a", "WR", 10.0, 5.0), _sl("b", "WR", 20.0, 8.0),
            _sl("c", "WR", 30.0, 12.0),
            _sl("d", "DEF", 40.0, 400.0), _sl("e", "DEF", 45.0, 400.0),
            _sl("f", "DEF", 50.0, 400.0)]
    r = BM.sleeper_divergence(rows, top_n=150)
    assert r["unranked"] == 3
    assert "DEF" not in r["by_position"], r["by_position"]
    assert r["ranked"] == 3


def test_TIES_GET_THE_AVERAGE_RANK_not_the_order_they_arrived_in():
    """88 of the 146 players inside the top 150 SHARE a `sleeper_rank` with
    somebody — 93 distinct values over 146 players. `sorted()` breaks those by
    input order, so a player's divergence depended on where they happened to sit
    in the JSON. The competition-rank treatment is to give tied players the mean
    of the positions they span.

    MUTATION: sort and enumerate — every tie contributes an arbitrary offset, and
    with 88 players tied that noise is a large fraction of the effect being
    measured."""
    rows = [_sl("a", "WR", 10.0, 5.0), _sl("b", "WR", 20.0, 5.0),
            _sl("c", "WR", 30.0, 5.0), _sl("d", "WR", 40.0, 9.0)]
    r = BM.sleeper_divergence(rows, top_n=150)
    # all three tied at sleeper 5 span positions 1,2,3 -> average 2.0 each
    d = {x["player_id"]: x["delta"] for x in r["rows"]}
    assert d["a"] == 1.0 and d["b"] == 0.0 and d["c"] == -1.0, d
    assert d["d"] == 0.0


def test_BOTH_SIDES_ARE_RANKED_OVER_THE_SAME_POPULATION():
    """The depth-normalisation defect this project has already paid for once: rank
    one side over the draftable 146 and the other over all 1,841 and the two
    numbers are not comparable at all, while every intermediate value looks fine.

    MUTATION: rank Sleeper over the whole board — a player 30th of 146 by market
    price and 30th of 1841 by Sleeper reads as a colossal divergence, and the
    deeper the board grows the larger the invented effect."""
    inside = [_sl("a", "QB", 10.0, 50.0), _sl("b", "QB", 20.0, 60.0)]
    outside = [_sl("z%d" % i, "WR", 300.0 + i, 1.0 + i) for i in range(40)]
    r = BM.sleeper_divergence(inside + outside, top_n=150)
    assert r["ranked"] == 2
    assert [x["delta"] for x in r["rows"]] == [0.0, 0.0], r["rows"]


def test_A_COLLAPSED_ORDERING_IS_REPORTED_not_averaged():
    """`search_rank` was once the single constant 916.0 for 1,419 players — this
    file's own docstring records it. An ordering with almost no distinct values
    produces a tidy median that means nothing.

    MUTATION: report the median regardless — a Sleeper field that stops being
    populated reads as perfect agreement with the market."""
    rows = [_sl(str(i), "WR", float(i + 1), 7.0) for i in range(10)]
    r = BM.sleeper_divergence(rows, top_n=150)
    assert r["status"] == "collapsed", r
    assert r["by_position"] == {}


def test_THE_DIVERGENCE_IS_REPORTED_PER_POSITION():
    """The effect is position-shaped — Sleeper puts quarterbacks far earlier than
    the market and pushes tight ends later — and a whole-board median is exactly
    zero by construction, because the ranks are a permutation of each other.

    MUTATION: report the overall median only — the deltas SUM to zero because the
    two rankings are a permutation, so the overall figure sits near nothing while
    quarterbacks are 36 slots early underneath it."""
    rows = [_sl("q1", "QB", 17.0, 3.0), _sl("q2", "QB", 33.0, 13.0),
            _sl("w1", "WR", 5.0, 20.0), _sl("w2", "WR", 8.0, 25.0),
            _sl("r1", "RB", 12.0, 12.0), _sl("r2", "RB", 25.0, 26.0)]
    r = BM.sleeper_divergence(rows, top_n=150)
    assert r["status"] == "measured"
    assert r["by_position"]["QB"]["median"] < 0     # Sleeper earlier
    assert r["by_position"]["WR"]["median"] > 0     # Sleeper later
    assert r["overall_median"] == 0.0               # symmetric fixture; the MEAN
    #                                                  is what a permutation forces
