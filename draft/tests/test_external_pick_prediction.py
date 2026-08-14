# TERRITORY: C
"""WHICH SOURCE PREDICTED **OUR ROOM'S** PICKS — not which source ordered value.

Cory's question, and the existing `exp_source_grade` does not answer it: that
computes `Spearman(-adp, REALIZED POINTS)`, i.e. which source orders VALUE best.
This grades against `pick_no` — where our ten managers actually took people.
Same inputs, same crosswalk, same seasons, different outcome variable.

The data is on disk: `league_history.json` carries 450 real picks across 2023,
2024 and 2025, and all three sources' historical ADP has already been fetched
successfully by A's own experiment.

These assertions are about the three ways this comparison lies: keeper picks that
are not market decisions, sources graded over populations of different sizes, and
an accumulated season ADP presented as though it were a pre-draft board.

Run: python3 -m pytest draft/tests/test_external_pick_prediction.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_pick_prediction as PP  # noqa: E402

HISTORY = {"seasons": [
    {"season": "2025", "drafts": [{"draft_id": "d1", "picks": [
        {"round": 1, "pick_no": 1, "player_id": "a", "is_keeper": True},
        {"round": 1, "pick_no": 2, "player_id": "b", "is_keeper": None},
        {"round": 1, "pick_no": 3, "player_id": "c", "is_keeper": False},
        {"round": 2, "pick_no": 11, "player_id": "d", "is_keeper": None},
    ]}]},
    {"season": "2024", "drafts": [{"draft_id": "d0", "picks": [
        {"round": 1, "pick_no": 1, "player_id": "z", "is_keeper": None},
    ]}]},
]}


def test_A_KEEPER_IS_NOT_A_MARKET_DECISION():
    """THE FIRST WAY THIS LIES. A keeper occupies a pick without anybody choosing
    from the pool — 2024 had 23 of them, 2025 had 20. Grading a source on a keeper
    is grading it on a decision made a year earlier under different rules, and it
    silently rewards whichever source happens to rank keepers near their forfeit
    round.

    MUTATION: keep them — roughly one pick in seven across our three drafts is a
    non-decision scored as a prediction, and every source's apparent accuracy
    moves for a reason that has nothing to do with ADP."""
    p = PP.picks_of(HISTORY, "2025")
    assert [x["player_id"] for x in p] == ["b", "c", "d"]
    assert PP.picks_of(HISTORY, "2025", include_keepers=True)[0]["player_id"] == "a"


def test_A_MISSING_SEASON_IS_NAMED_not_returned_empty():
    """MUTATION: return [] for a season we do not hold — a typo in the year reads
    as a draft where nobody picked anybody, and the grade runs on nothing."""
    try:
        PP.picks_of(HISTORY, "2019")
    except ValueError as e:
        assert "2019" in str(e) and "2024" in str(e)
    else:
        raise AssertionError("a season we do not hold must be refused by name")


def test_SOURCES_ARE_GRADED_ON_THE_SAME_PLAYERS():
    """THE SECOND WAY THIS LIES, and this project has already paid for it once on
    ADP depth. FantasyPros crosswalked 126 players in 2023 and MFL far more.
    Comparing rho computed over 126 players with rho over 200 is not a comparison
    — it is two different questions with one label.

    MUTATION: grade each source over whatever it happens to cover — the source
    with the THINNEST coverage looks best or worst for a reason that is about its
    crosswalk, and nothing in the output says the populations differed."""
    picks = [{"player_id": c, "pick_no": i + 1} for i, c in enumerate("abcd")]
    srcs = {"wide": {"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0},
            "thin": {"a": 1.0, "b": 2.0}}
    r = PP.compare(picks, srcs)
    assert r["shared_n"] == 2
    assert sorted(r["shared_players"]) == ["a", "b"]
    for s in r["sources"].values():
        assert s["n"] == 2


def test_A_SHARED_POPULATION_TOO_THIN_IS_REFUSED():
    """MUTATION: report a coefficient anyway — two players in common produce a
    rho of exactly 1.0 or -1.0, which reads as a perfect source."""
    picks = [{"player_id": c, "pick_no": i + 1} for i, c in enumerate("abcd")]
    r = PP.compare(picks, {"a1": {"a": 1.0}, "a2": {"a": 2.0}})
    assert r["status"] == "unmeasured"
    assert "shared" in r["note"]


# ⚠ EIGHT PLAYERS, NOT FOUR. `MIN_SHARED` is 8 and it is the right bar — a rank
# correlation over two or three points is exactly +/-1 and reads as a perfect
# source. My first fixtures had four and these three tests failed by hitting the
# refusal rather than the behaviour they were written for, which is the test
# being wrong, not the threshold.
EIGHT = [{"player_id": p, "pick_no": n} for p, n in
         [("q1", 10), ("q2", 12), ("r1", 20), ("r2", 22),
          ("w1", 30), ("w2", 32), ("t1", 40), ("t2", 42)]]
POS = {"q1": "QB", "q2": "QB", "r1": "RB", "r2": "RB",
       "w1": "WR", "w2": "WR", "t1": "TE", "t2": "TE"}
#: The room reaches 15 picks for quarterbacks and tight ends, is level on running
#: backs and a touch late on receivers — the shape A measured on the real drafts.
SRC = {"q1": 25.0, "q2": 27.0, "r1": 21.0, "r2": 23.0,
       "w1": 29.0, "w2": 31.0, "t1": 55.0, "t2": 57.0}


def test_THE_ACCUMULATION_DEPTH_TRAVELS_WITH_THE_COEFFICIENT():
    """THE THIRD WAY THIS LIES, and it is the one nobody can see afterwards. A
    year-scoped ADP is the ACCUMULATED season average — it contains drafts that
    happened after ours. D3 measures the effect directly: 2025 complete reports
    844 drafts against 2026 in progress at 112. That inflates every source, and
    NOT equally — MFL alone moves 5011 drafts in 2023 to 4485 in 2024, so
    whichever crowd drafts latest gets the most hindsight.

    MUTATION: drop `total_drafts` — the asymmetry becomes invisible and the
    comparison silently prefers the source with the longest accumulation
    window."""
    r = PP.compare(EIGHT, {"m": SRC}, depth={"m": 5011})
    assert r["sources"]["m"]["total_drafts"] == 5011
    assert r["contaminated"] is True
    assert "after ours" in r["caveat"]


def test_AN_UNDECLARED_DEPTH_IS_NOT_ZERO():
    """MUTATION: default a missing depth to 0 — a source that does not publish a
    draft count reads as the shallowest one in the table."""
    r = PP.compare(EIGHT, {"m": SRC})
    assert r["sources"]["m"]["total_drafts"] is None
    assert r["depth_spread"] is None


def test_THE_ERROR_IS_REPORTED_PER_POSITION_not_only_as_one_number():
    """The whole reason this is being run: the room's reach is position-shaped —
    A measured QB1 5.7 picks early and TE1 13.0 early with RB and WR at zero — and
    a single rank correlation over 150 picks averages that away.

    MUTATION: report rho alone — a source that misprices exactly the two positions
    our room reaches for scores identically to one that does not."""
    r = PP.compare(EIGHT, {"m": SRC}, positions=POS)
    by = r["sources"]["m"]["by_position"]
    assert by["QB"]["median_room_earlier_by"] == 15.0
    assert by["TE"]["median_room_earlier_by"] == 15.0
    assert by["RB"]["median_room_earlier_by"] == 1.0
    assert by["WR"]["median_room_earlier_by"] == -1.0
    # AND rho IS STILL THERE — the two answer different questions and the
    # per-position split is an addition, not a replacement. It is 0.81 rather
    # than 1.0 for the RIGHT reason: the source orders the running backs ahead of
    # the quarterbacks and our room does the opposite, which IS the reach. One
    # number says "mostly agrees"; the split says where it does not.
    assert 0.8 <= r["sources"]["m"]["rho"] < 1.0


def test_THE_SIGN_IS_NOT_THE_SIBLING_EXPERIMENTS_SIGN():
    """`exp_source_grade` computes `Spearman(-adp, realized)` and negates ADP
    because its outcome is POINTS: low ADP should mean high points, so the flip
    is what makes "higher is better" true there. This grades against a PICK
    NUMBER, where a good source has low ADP at low pick — the two already run the
    same way. I copied the `-adp` across and this fixture returned **-0.81 for a
    source that predicts almost perfectly**.

    Same expression, different quantity: the defect this project keeps finding,
    reproduced inside the file written to check for it.

    MUTATION: negate ADP as the sibling does — the best source scores worst, the
    ordering of the whole table inverts, and every number in it is still a
    perfectly valid Spearman coefficient."""
    perfect = {p["player_id"]: p["pick_no"] for p in EIGHT}
    r = PP.compare(EIGHT, {"same": perfect})
    assert r["sources"]["same"]["rho"] == 1.0, r["sources"]["same"]["rho"]
    inverted = {p["player_id"]: -p["pick_no"] for p in EIGHT}
    assert PP.compare(EIGHT, {"back": inverted})["sources"]["back"]["rho"] == -1.0
