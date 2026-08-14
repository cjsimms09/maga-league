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


# ── 2023 RECORDS ITS KEEPERS AS A SECOND DRAFT, AND THE EXCLUSION MISSED THEM ─
#
# Found by reading the file before running anything against it. `league_history`
# holds FOUR drafts across three seasons, not three:
#
#   2025  1 draft, 150 picks, 20 keepers flagged INLINE
#   2024  1 draft, 150 picks, 23 keepers flagged INLINE
#   2023  TWO drafts — a 150-pick main draft with `is_keeper: None` on every row,
#         and a 30-pick record (`draft_id 990840142107619329`) that is ALL
#         keepers and whose 30 player_ids are ALL ALSO IN THE MAIN DRAFT.
#
# So the 30-pick record is a keeper ROSTER, not a draft, and 2023's real draft
# positions live only in the main one. `picks_of` concatenated both, which meant:
#
#   * `include_keepers=True` returned 180 rows for a 150-pick draft, 30 of them
#     the same players twice at two different pick numbers;
#   * `include_keepers=False` dropped the 30 flagged rows and KEPT the same 30
#     players via the main draft, where nothing marks them — so it reported
#     `keepers_excluded: 30` while excluding none of them.
#
# THE SECOND IS THE ONE THAT MATTERS. 2024 and 2025 would be graded on
# keeper-free populations and 2023 on a population with 30 keepers in it, then
# read side by side as one comparison. That is criterion 1: the three seasons
# were not denominated in the same thing, and the guard SAID it had fixed that.

_TWO_DRAFT_SEASON = {"seasons": [{"season": "2023", "drafts": [
    {"draft_id": "main", "picks": [
        {"round": 1, "pick_no": 1, "player_id": "kept1", "is_keeper": None},
        {"round": 1, "pick_no": 2, "player_id": "kept2", "is_keeper": None},
        {"round": 1, "pick_no": 3, "player_id": "free1", "is_keeper": None},
        {"round": 2, "pick_no": 4, "player_id": "free2", "is_keeper": None}]},
    {"draft_id": "keeper-roster", "picks": [
        {"round": 1, "pick_no": 1, "player_id": "kept1", "is_keeper": True},
        {"round": 1, "pick_no": 2, "player_id": "kept2", "is_keeper": True}]}]}]}


def test_A_KEEPER_FLAGGED_ON_ANOTHER_DRAFT_OF_THE_SAME_SEASON_STILL_COUNTS():
    """MUTATION: resolve `is_keeper` from the row alone — 2023's main draft flags
    nobody, so all 30 keepers stay in the graded population while
    `keepers_excluded` reports 30. A guard that reports success and does nothing
    is worse than no guard: it is the reason nobody looks again."""
    picks = PP.picks_of(_TWO_DRAFT_SEASON, "2023")
    assert [p["player_id"] for p in picks] == ["free1", "free2"], picks
    both = PP.picks_of(_TWO_DRAFT_SEASON, "2023", include_keepers=True)
    assert [p["player_id"] for p in both] == ["kept1", "kept2", "free1", "free2"]
    assert [p["is_keeper"] for p in both] == [True, True, False, False]


def test_A_PLAYER_IN_TWO_DRAFTS_OF_ONE_SEASON_IS_RETURNED_ONCE():
    """MUTATION: concatenate the drafts — `kept1` comes back twice at two
    different pick numbers, and `compare`'s {player_id: pick_no} keeps whichever
    survives the sort. The outcome variable would then be a mix of draft slots
    and keeper-roster slots with nothing saying which is which."""
    both = PP.picks_of(_TWO_DRAFT_SEASON, "2023", include_keepers=True)
    assert len({p["player_id"] for p in both}) == len(both)
    # AND THE PICK NUMBER COMES FROM THE REAL DRAFT, not the keeper roster.
    assert [p["pick_no"] for p in both] == [1.0, 2.0, 3.0, 4.0]


def test_A_SECONDARY_DRAFT_WITH_A_PLAYER_THE_MAIN_ONE_LACKS_IS_REFUSED():
    """The whole treatment rests on the secondary record being keeper METADATA
    about players the main draft already contains. A secondary draft holding
    somebody the main one does not is a REAL supplemental draft, and silently
    keeping only the main one would delete real picks.

    MUTATION: take the largest draft and ignore the rest — a genuine supplemental
    draft vanishes with no error, and the season is graded on part of itself."""
    import pytest
    h = {"seasons": [{"season": "2023", "drafts": [
        {"draft_id": "main", "picks": [
            {"round": 1, "pick_no": 1, "player_id": "a", "is_keeper": None},
            {"round": 1, "pick_no": 2, "player_id": "b", "is_keeper": None}]},
        {"draft_id": "supplemental", "picks": [
            {"round": 1, "pick_no": 1, "player_id": "zzz", "is_keeper": None}]}]}]}
    with pytest.raises(ValueError, match="supplemental|not in"):
        PP.picks_of(h, "2023")


def test_THE_REAL_FILE_2023_IS_150_PICKS_WITH_30_KEEPERS_ACTUALLY_REMOVED():
    """A ratchet on the shipped data, because the fixtures above cannot catch the
    file changing shape. 450 real picks across the three seasons — 150 each — and
    377 gradeable once every season's keepers are genuinely out. Before this,
    2023 reported 150 gradeable with all 30 keepers still in them."""
    import json
    h = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    got = {}
    for y in ("2023", "2024", "2025"):
        allp = PP.picks_of(h, y, include_keepers=True)
        free = PP.picks_of(h, y)
        assert len({p["player_id"] for p in allp}) == len(allp), y
        got[y] = (len(allp), len(free), len(allp) - len(free))
    assert got == {"2023": (150, 120, 30), "2024": (150, 127, 23),
                   "2025": (150, 130, 20)}, got
    assert sum(v[0] for v in got.values()) == 450
    assert sum(v[1] for v in got.values()) == 377


def test_TWO_DRAFTS_OF_EQUAL_SIZE_ARE_REFUSED_rather_than_arbitrated():
    """Choosing the primary by pick count works because 150 and 30 are not close.
    On a tie there is nothing here that can tell which record carries the real
    draft positions, and picking either writes a guess into the outcome variable
    every coefficient is computed against.

    MUTATION: take the first — a coin flip decides where our room drafted, and
    the result looks exactly as confident either way."""
    import pytest
    h = {"seasons": [{"season": "2023", "drafts": [
        {"draft_id": "one", "picks": [
            {"round": 1, "pick_no": 1, "player_id": "a", "is_keeper": None}]},
        {"draft_id": "two", "picks": [
            {"round": 1, "pick_no": 9, "player_id": "a", "is_keeper": None}]}]}]}
    with pytest.raises(ValueError, match="two drafts"):
        PP.picks_of(h, "2023")
