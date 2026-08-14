# TERRITORY: C
"""THE AGGREGATE MUST NOT AVERAGE THINGS THAT ARE NOT THE SAME QUANTITY.

Cory asked for a multi-source ADP mean: "the more data aggregated the better the
info. But needs to be done methodically and accurately." The accuracy is the whole
job — the obvious aggregate is wrong and wrong in a way that looks fine.

MEASURED, MFL against FantasyPros on the 314 players both price, draftable only:

    QB  median MFL/FP ratio 0.494   spread 0.13 .. 1.02
    RB                      1.388          0.87 .. 5.17
    WR                      1.189          0.75 .. 1.86
    TE                      0.993          0.66 .. 1.27

One mechanism: MFL's pool includes SUPERFLEX leagues, quarterbacks go twice as
early there, and everyone else is displaced later. Our league is half-PPR, ten
teams, single-QB.

AND THE SAME PAIR, COMPARED ON ORDER WITHIN A POSITION:

    QB rho 0.980   RB rho 0.974   WR rho 0.960   TE rho 0.939

The format decides WHERE A POSITION SITS. It barely touches WHO IS BETTER inside
it. Every test here defends that one distinction.

Run: python3 -m pytest draft/tests/test_external_adp_consensus.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_adp_consensus as X  # noqa: E402

POS = {"q1": "QB", "q2": "QB", "q3": "QB",
       "r1": "RB", "r2": "RB", "r3": "RB", "r4": "RB"}


def test_a_SUPERFLEX_SOURCE_CANNOT_MOVE_WHEN_A_POSITION_GOES():
    """THE ASSERTION THIS MODULE EXISTS FOR.

    Two sources that AGREE PERFECTLY on order and disagree wildly on pick number —
    which is exactly MFL against FantasyPros at quarterback, ratio 0.494 — must
    produce the format-matched source's pick numbers, untouched.

    MUTATION: average the two sources' ADPs — the quarterbacks move up the board
    by roughly half, priced off a superflex format this league does not play, and
    every survival curve and VONA that reads them is wrong in the same direction."""
    anchor = {"q1": 40.0, "q2": 60.0, "q3": 90.0}          # our format
    superflex = {"q1": 8.0, "q2": 14.0, "q3": 22.0}        # same order, half the pick
    order = X.consensus_order({"fp": anchor, "mfl": superflex}, POS)
    got = X.to_pick_scale(order, anchor, POS)["QB"]
    assert got["status"] == "anchored"
    assert [r["adp"] for r in got["rows"]] == [40.0, 60.0, 90.0], (
        "the contaminated source moved the pick scale: %s"
        % [r["adp"] for r in got["rows"]])
    assert [r["player_id"] for r in got["rows"]] == ["q1", "q2", "q3"]


def test_the_CONTAMINATED_SOURCE_STILL_GETS_A_VOTE_ON_ORDER():
    """The other half, and the reason this is an aggregate rather than a filter.
    MFL is 433 crosswalked players against FantasyPros's 337 — throwing it away
    would cost real coverage and real corroboration.

    MUTATION: use the anchor's order alone — the aggregate becomes a rename of one
    source and every extra draft MFL observed is discarded."""
    anchor = {"r1": 10.0, "r2": 20.0, "r3": 30.0}
    other = {"r1": 99.0, "r2": 11.0, "r3": 12.0}       # says r2 and r3 beat r1
    order = X.consensus_order({"fp": anchor, "mfl": other}, POS)
    ids = [r["player_id"] for r in order["RB"]]
    assert ids != ["r1", "r2", "r3"], (
        "the second source changed nothing — it is not being aggregated: %s" % ids)


def test_ONE_SOURCE_IS_NOT_A_CONSENSUS_and_says_so():
    """A player nobody else priced is real coverage and must not wear the word
    consensus. 36 of 73 quarterbacks in the live aggregate are single-source.

    MUTATION: drop the count — single-source coverage inflates the apparent
    evidence, which is the same defect as a total that mixes measured and fitted
    values."""
    order = X.consensus_order({"fp": {"r1": 1.0}, "mfl": {"r1": 2.0, "r2": 3.0}}, POS)
    by = {r["player_id"]: r for r in order["RB"]}
    # PRICED BY TWO, RANKED BY ONE — and those are different facts. `fp` lists a
    # single running back, so it priced r1 and ranked nothing: one item has no
    # position within a list.
    assert by["r1"]["sources"] == 2
    assert by["r1"]["ranking_sources"] == 1
    assert by["r2"]["sources"] == 1
    assert by["r2"]["disagreement"] is None, (
        "a single source cannot disagree with anything, and reporting 0 would "
        "read as perfect agreement")
    cov = X.coverage(order)["RB"]
    assert cov["corroborated"] == 0 and cov["single_source"] == 2, (
        "a depth-1 source is being counted as corroboration: %s" % cov)

    # AND THE CONTROL, because a `corroborated` that is always zero would satisfy
    # the line above perfectly.
    real = X.consensus_order({"fp": {"r1": 1.0, "r2": 2.0},
                              "mfl": {"r1": 3.0, "r2": 4.0}}, POS)
    assert X.coverage(real)["RB"]["corroborated"] == 2, X.coverage(real)["RB"]


def test_the_STATISTIC_IS_A_MEDIAN_so_an_OUTLIER_does_not_move_the_answer():
    """Two sources agree, one is far away. The answer must be where the two are —
    a mean returns a rank NO SOURCE HOLDS and no reader can defend.

    MUTATION: use the mean — the odd source drags every consensus toward itself in
    proportion to how wrong it is, which is backwards."""
    a = {"r1": 1.0, "r2": 2.0, "r3": 3.0, "r4": 4.0}
    b = {"r1": 1.0, "r2": 2.0, "r3": 3.0, "r4": 4.0}
    c = {"r4": 1.0, "r1": 2.0, "r2": 3.0, "r3": 4.0}      # r4 first, alone
    order = X.consensus_order({"a": a, "b": b, "c": c}, POS)
    ids = [r["player_id"] for r in order["RB"]]
    assert ids[0] == "r1", "the outlier moved the top of the board: %s" % ids
    assert ids[-1] == "r4", "r4 is last in two of three sources: %s" % ids


def test_the_OUTLIER_IS_PRESERVED_rather_than_blended_away():
    """The point of an aggregate is not a smoother number — it is knowing which
    players the market ARGUES about. A player two sources rank 30 apart is a
    different decision from one they agree on.

    MUTATION: report the consensus only — the disagreement disappears into the
    average and the reader cannot tell a settled price from a contested one."""
    order = X.consensus_order(
        {"a": {"r1": 1.0, "r2": 2.0, "r3": 3.0},
         "b": {"r3": 1.0, "r2": 2.0, "r1": 3.0}}, POS)
    by = {r["player_id"]: r for r in order["RB"]}
    assert by["r1"]["ranks"] == {"a": 1, "b": 3}, by["r1"]
    assert by["r1"]["disagreement"] == 1.0
    assert by["r2"]["disagreement"] == 0.0, "r2 is second in both"
    d = X.disagreements(order)
    assert d and d[0]["disagreement"] == 1.0


def test_RANK_IS_A_FRACTION_OF_THE_SOURCES_OWN_DEPTH():
    """One source listing 40 running backs and another listing 90 do not mean the
    same thing by "RB30". Comparing raw indices makes the deeper source look
    systematically more pessimistic about everyone.

    MUTATION: compare raw ranks — a source with a longer list drags every shared
    player down, and the effect grows with how much MORE data it has, which is the
    exact opposite of what aggregating more sources should do."""
    shallow = {"r1": 1.0, "r2": 2.0}                        # depth 2
    deep = {"r1": 1.0, "x1": 2.0, "x2": 3.0, "r2": 4.0}     # depth 4, same order
    pos = dict(POS, x1="RB", x2="RB")
    order = X.consensus_order({"a": shallow, "b": deep}, pos)
    by = {r["player_id"]: r for r in order["RB"]}
    # r2 is LAST in both sources — fraction 1.0 either way — so the sources agree.
    assert by["r2"]["disagreement"] == 0.0, (
        "depth is not being normalised: r2 is last in both lists and reads as a "
        "disagreement (%s)" % by["r2"])


def test_a_POSITION_THE_ANCHOR_CANNOT_PRICE_is_UNANCHORED_not_invented():
    """Inventing a pick scale from the contaminated source is the failure this
    module exists to avoid. Doing it silently on one position would be worse than
    doing it openly on all four.

    MUTATION: fall back to the other source's ADPs — superflex pricing reaches the
    board through the one position nobody was watching."""
    order = X.consensus_order({"mfl": {"q1": 8.0, "q2": 14.0}}, POS)
    got = X.to_pick_scale(order, {"r1": 10.0}, POS)      # anchor prices no QB
    assert got["QB"]["status"] == "unanchored", got["QB"]
    assert all("adp" not in r for r in got["QB"]["rows"])


def test_BEYOND_THE_ANCHORS_DEPTH_the_row_keeps_its_order_and_gets_NO_pick():
    """Extrapolating past the last real observation manufactures a number.

    MUTATION: extend the scale by extrapolation — the deep pool acquires confident
    pick numbers derived from nothing, which is how `raw_adp` came to take exactly
    one distinct value across 603 rows."""
    order = X.consensus_order({"a": {"r1": 1.0, "r2": 2.0, "r3": 3.0}}, POS)
    got = X.to_pick_scale(order, {"r1": 10.0, "r2": 20.0}, POS)["RB"]
    assert [r.get("adp") for r in got["rows"]] == [10.0, 20.0, None]
    assert got["rows"][-1]["adp_basis"] == "beyond the anchor's depth"


def test_a_PLAYER_WITH_NO_POSITION_is_dropped_rather_than_bucketed():
    """An unknown-position bucket is not a position, and ranking inside it means
    nothing. MUTATION: bucket them as "UNK" — a pile of unresolved ids acquires an
    order and a consensus rank."""
    # ASSERTED AT THE DROP, NOT DOWNSTREAM. My first version checked
    # `consensus_order`, which only ever iterates POSITIONS — so it passed whether
    # or not the row was dropped, and the gate said so: the mutation that buckets
    # unknowns as "UNK" SURVIVED. The drop happens in `within_position_ranks` and
    # that is where it has to be asserted.
    ranks = X.within_position_ranks({"r1": 1.0, "ghost": 2.0}, POS)
    assert ranks == {"RB": ["r1"]}, (
        "a player with no position was bucketed rather than dropped: %s" % ranks)
    order = X.consensus_order({"a": {"r1": 1.0, "ghost": 2.0}}, POS)
    assert all("ghost" not in [r["player_id"] for r in rows]
               for rows in order.values())


# ── AGAINST THE REAL SOURCES, because fixtures cannot show a format clash ──

def _live():
    import external_adp_capture as C
    arch = HERE.parent / "data" / "external_adp_series.json"
    bp = HERE.parent.parent / "public" / "draft_data.json"
    if not arch.exists() or not bp.exists():
        pytest.skip("UNCHECKED: archive or board absent")
    a = json.loads(arch.read_text())
    board = json.loads(bp.read_text())
    players = board["players"] + (board.get("kept_players") or [])
    cw, _ = C.crosswalk_map(a.get("players") or {}, players)
    pos = {str(p["player_id"]): p.get("position") for p in players}
    mfl = {}
    for mid, adp in (a["series"][-1].get("rows") or {}).items():
        ours = cw.get(str(mid))
        if ours:
            mfl[str(ours)] = float(adp)
    anchor = {str(p["player_id"]): float(p["adp"]) for p in players
              if p.get("adp") is not None
              and p.get("adp_source") in ("fantasypros", "ffc")}
    return mfl, anchor, pos, players


def test_THE_LIVE_AGGREGATE_ADDS_REAL_COVERAGE_over_the_anchor_alone():
    """The reason to do this at all. If MFL added nothing the honest answer would
    be to keep one source and say so.

    MUTATION: intersect instead of union — the aggregate shrinks to the anchor and
    every player only MFL prices is lost."""
    mfl, anchor, pos, _ = _live()
    order = X.consensus_order({"anchor": anchor, "mfl": mfl}, pos)
    total = sum(len(v) for v in order.values())
    assert len(mfl) > 300 and len(anchor) > 300, (len(mfl), len(anchor))
    assert total > len(anchor), (
        "the aggregate (%d) is no larger than the anchor alone (%d)"
        % (total, len(anchor)))


def test_THE_LIVE_PICK_SCALE_IS_THE_ANCHORS_and_the_superflex_QBs_do_not_leak():
    """The measured failure, asserted on the real data. MFL prices quarterbacks at
    a median 0.494 of FantasyPros; if any of that reached the pick scale the QB
    ADPs would collapse toward the top of the board.

    MUTATION: build the scale from the union of both sources — QB pick numbers
    move toward the superflex pool and nothing on the board says why."""
    mfl, anchor, pos, _ = _live()
    order = X.consensus_order({"anchor": anchor, "mfl": mfl}, pos)
    got = X.to_pick_scale(order, anchor, pos)
    anchor_qb = sorted(a for pid, a in anchor.items() if pos.get(pid) == "QB")
    if not anchor_qb:
        pytest.skip("UNCHECKED: the anchor prices no quarterbacks")
    placed = [r["adp"] for r in got["QB"]["rows"] if r.get("adp") is not None]
    assert placed == anchor_qb[:len(placed)], (
        "the QB pick scale is not the anchor's: first five %s vs anchor %s"
        % (placed[:5], anchor_qb[:5]))
