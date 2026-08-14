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
    assert by["r2"]["sources"] == 1
    # AND NEITHER IS RANKABLE HERE, which is the honest answer: the two sources
    # share exactly ONE player, and one point cannot define a scale to measure
    # anything against. Reporting a rank off a one-point ruler would be the
    # derived-from-a-different-thing error in its purest form.
    assert by["r1"]["ranking_sources"] == 0, by["r1"]
    assert by["r1"]["consensus"] is None
    assert by["r2"]["disagreement"] is None, (
        "a single source cannot disagree with anything, and reporting 0 would "
        "read as perfect agreement")
    cov = X.coverage(order)["RB"]
    assert cov["corroborated"] == 0 and cov["single_source"] == 2, (
        "a one-player overlap is being counted as corroboration: %s" % cov)

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


def test_TWO_SOURCES_OF_DIFFERENT_DEPTH_AGREEING_read_as_AGREEMENT():
    """THE BUG CORY CAUGHT, AND MY FIRST TEST FOR IT PROVED NOTHING.

    FantasyPros lists 44 tight ends (a curated consensus); MFL lists 69 (everyone
    drafted in 125 drafts). Ranking each player as a fraction of HIS OWN SOURCE'S
    depth compares two different quantities, and a player BOTH rank #30 came out
    at 0.674 against 0.426 — an apparent disagreement of 0.248 manufactured
    entirely by list length, growing with rank, and systematically making the
    deeper source look optimistic about everybody.

    ⚠ MY ORIGINAL FIXTURE PUT THE PLAYER LAST IN BOTH LISTS. Fractions always
    agree at the endpoints — 1.0 either way — and diverge maximally in the MIDDLE.
    I tested the two points where the defect is invisible, and it passed. So this
    asserts the middle, at the real depths, and asserts the divergence would have
    been large enough to see.

    MUTATION: score each player against his own source's depth — #10, #20 and #30
    report disagreements of 0.077, 0.162 and 0.248 while the sources agree
    perfectly."""
    pos = {("p%d" % i): "TE" for i in range(80)}
    shallow = {("p%d" % i): float(i + 1) for i in range(44)}     # FantasyPros depth
    deep = {("p%d" % i): float(i + 1) for i in range(69)}        # MFL depth, SAME order
    order = X.consensus_order({"fp": shallow, "mfl": deep}, pos)
    by = {r["player_id"]: r for r in order["TE"]}
    for k in (10, 20, 30):
        r = by["p%d" % (k - 1)]
        assert r["ranks"] == {"fp": k, "mfl": k}, r
        assert r["disagreement"] == 0.0, (
            "sources that rank him identically at #%d read as disagreeing by %s — "
            "the scale is derived from each source's own depth, which is not the "
            "same quantity" % (k, r["disagreement"]))
    # AND THE DEPTHS REALLY DO DIFFER, or the assertion above is satisfied by a
    # fixture with nothing to normalise.
    assert by["p9"]["depths"] == {"fp": 44, "mfl": 69}, by["p9"]["depths"]


def test_the_SHARED_POPULATION_IS_THE_RULER_and_a_clustered_source_still_maps():
    """The endpoints alone are not enough, and this fixture is built to prove it.

    If one source's shared players are UNEVENLY spaced in its list, interpolating
    between only the first and last shared player misplaces everything between
    them — and the error reads as disagreement.

    ⚠ MY FIRST FIXTURE SPACED THE SHARED PLAYERS EVENLY IN BOTH SOURCES, where the
    endpoint map and the piecewise map give the SAME answer. The mutation survived
    and the gate said so. Here `a` puts five shared players first and the sixth
    last, so the two maps diverge by 0.4 on the middle rows.

    MUTATION: interpolate between the shared endpoints only — s4 maps to 0.4 in
    `a` and 0.8 in `b`, and two sources that agree perfectly on order report a
    disagreement that is an artifact of where the shared players sit."""
    pos = {("s%d" % i): "WR" for i in range(6)}
    pos.update({("x%d" % i): "WR" for i in range(5)})
    # `a`: s0..s4, then all five extras, then s5 -> shared at indices 0,1,2,3,4,10
    a = {}
    for i in range(5):
        a["s%d" % i] = float(i + 1)
    for i in range(5):
        a["x%d" % i] = float(6 + i)
    a["s5"] = 11.0
    # `b`: only the shared players, in the same order -> indices 0..5
    b = {("s%d" % i): float(i + 1) for i in range(6)}

    order = X.consensus_order({"a": a, "b": b}, pos)
    by = {r["player_id"]: r for r in order["WR"]}
    for i in range(6):
        r = by["s%d" % i]
        assert r["disagreement"] == 0.0, (
            "s%d is in the same ORDER in both sources but reads as a disagreement "
            "of %s — the shared players are not being used as a piecewise ruler "
            "(ranks %s)" % (i, r["disagreement"], r["ranks"]))
    # THE SPACING REALLY IS UNEVEN, or the assertion above tests nothing.
    assert by["s5"]["ranks"] == {"a": 11, "b": 6}, by["s5"]["ranks"]


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


# ── AND SOMETHING HAS TO CHOOSE THE DAY ──────────────────────────────────────
#
# `consensus_order` was built, tested thirteen ways, and called by NOTHING. Found
# by sweeping my own lane for functions with no production caller — the same
# rule-14 gap that had `marginal_adp` sitting inert this morning, and the failure
# class this repo has already paid for four times: correct code wired to nothing
# looks exactly like correct code that is working.
#
# The step between the archive and the aggregate is CHOOSING WHICH DAY, and it is
# not a detail. The per-source archive holds one row per (source, day), the
# sources are captured in one run but fail independently, and `consensus_order`
# will happily aggregate a single source — returning `ranking_sources: 1` on every
# row and an EMPTY disagreement list. An empty disagreement list means "the
# sources agree" or "there was only one of them", and those are opposite readings
# of the same blank table.

def _row(source, day, rows, year="2026"):
    return {"source": source, "year": year, "observed_at": day,
            "rows": {str(k): float(v) for k, v in rows.items()}}


_POS = {"1": "RB", "2": "RB", "3": "RB", "4": "WR", "5": "WR", "6": "WR"}


def test_IT_PICKS_THE_LATEST_DAY_TWO_SOURCES_BOTH_REACHED():
    """08-15 has FFC only — the FantasyPros fetch failed that morning, which is
    exactly what `apply_results` records by writing nothing for it.

    MUTATION: take the most recent day — 08-15 wins, every row comes back
    `ranking_sources: 1`, and the disagreement table is empty. A reader sees a
    consensus with nothing to argue about on the morning one source went dark."""
    ser = [_row("ffc", "2026-08-14", {"1": 10, "2": 20, "4": 30, "5": 40}),
           _row("fantasypros", "2026-08-14", {"1": 12, "2": 18, "4": 33, "5": 36}),
           _row("ffc", "2026-08-15", {"1": 11, "2": 21, "4": 31, "5": 41})]
    r = X.latest_consensus(ser, _POS, "2026")
    assert r["status"] == "measured", r
    assert r["day"] == "2026-08-14"
    assert sorted(r["sources"]) == ["fantasypros", "ffc"]


def test_IT_STAYS_INSIDE_THE_YEAR_IT_WAS_ASKED_FOR():
    """MUTATION: drop the year filter — a 2025 question is answered with 2026's
    board, because the archive sorts newest last and 2026 rows are always newest.
    Two seasons aggregated as one is not a consensus about either."""
    ser = [_row("ffc", "2025-08-20", {"1": 10, "2": 20}, year="2025"),
           _row("fantasypros", "2025-08-20", {"1": 12, "2": 18}, year="2025"),
           _row("ffc", "2026-08-14", {"1": 11, "2": 21}),
           _row("fantasypros", "2026-08-14", {"1": 13, "2": 19})]
    r = X.latest_consensus(ser, _POS, "2025")
    assert r["day"] == "2025-08-20", r


def test_NO_DAY_WITH_TWO_SOURCES_IS_UNMEASURED_and_counts_the_lonely_days():
    """Before tonight's capture the per-source archive is EMPTY, and the first
    days after it may well carry one source while the other's fetch settles.

    MUTATION: aggregate the single source anyway — the report shows a full
    consensus order with an empty disagreement table, which is the most
    reassuring possible rendering of a source going dark."""
    ser = [_row("ffc", "2026-08-14", {"1": 10, "2": 20}),
           _row("ffc", "2026-08-15", {"1": 11, "2": 21})]
    r = X.latest_consensus(ser, _POS, "2026")
    assert r["status"] == "unmeasured"
    assert r["single_source_days"] == 2
    assert "one source" in r["note"] or "1 source" in r["note"]


def test_THE_REPORT_CARRIES_CORROBORATION_so_an_empty_table_is_readable():
    """`disagreements` returning [] is ambiguous on its own. Beside a
    corroborated count it is not: 4 of 4 corroborated and no disagreements means
    the sources agree; 0 of 4 corroborated means nobody was compared.

    MUTATION: report only the disagreements — the one rendering where "they
    agree" and "nothing was compared" look identical."""
    ser = [_row("ffc", "2026-08-14", {"1": 10, "2": 20, "3": 30}),
           _row("fantasypros", "2026-08-14", {"1": 12, "2": 18, "3": 33})]
    r = X.latest_consensus(ser, _POS, "2026")
    assert r["coverage"]["RB"]["corroborated"] == 3
    assert r["coverage"]["RB"]["single_source"] == 0
    # AND THE DISAGREEMENT IS REAL: the two sources swap RB1 and RB2.
    ids = [d["player_id"] for d in r["disagreements"]]
    assert "1" in ids and "2" in ids, r["disagreements"]


def test_WITH_SEVERAL_QUALIFYING_DAYS_IT_TAKES_THE_LATEST():
    """Written because `day = usable[0]` SURVIVED the gate. Every fixture above
    had exactly one qualifying day, so first and last were the same row and the
    claim in the function's name — the LATEST day two sources reached — was never
    asserted at all. A survived mutation is a missing assertion, not a spare one.

    It is not hypothetical either: the archive gains a day every morning, so
    `usable[0]` would pin the report to the FIRST day ever captured and hold it
    there for the rest of the season, growing more wrong and more stable-looking
    every day.

    MUTATION: `usable[0]` — the report answers with 08-13 for ever."""
    ser = [_row("ffc", "2026-08-13", {"1": 10, "2": 20}),
           _row("fantasypros", "2026-08-13", {"1": 12, "2": 18}),
           _row("ffc", "2026-08-14", {"1": 11, "2": 21}),
           _row("fantasypros", "2026-08-14", {"1": 13, "2": 19})]
    r = X.latest_consensus(ser, _POS, "2026")
    assert r["day"] == "2026-08-14", r


def test_THE_ARGUMENT_IS_SCOPED_TO_PLAYERS_THE_DRAFT_CAN_REACH():
    """FOUND BY REHEARSING THE WORKFLOW STEP, exactly as the marginal day's
    version of this was. Run against the real board, the disagreement table led
    with TE39 and TE40 — a 10x15 draft takes about a dozen tight ends, so the two
    players the sources argued about hardest were two nobody can draft.

    `disagreements` is right to be general: it ranks by how far apart the sources
    are, and depth is not its business. Reachability is a fact about OUR league,
    so it is applied here, from the board's own prices, and it is applied to the
    REPORT rather than to the aggregate — the consensus order is unchanged and
    the excluded rows are counted, never silently dropped.

    ⚠ THE BOARD PRICE IS USED ONLY TO ASK "CAN HE BE DRAFTED", NEVER TO ORDER
    ANYTHING. That distinction is the whole module: pick numbers are contaminated
    across formats and within-position order is not, so a price may gate a row's
    RELEVANCE but must never touch its RANK.

    MUTATION 1: drop the filter — the report leads with players outside the draft
    every morning, and the rows that matter sit below them.
    MUTATION 2: treat an unpriced player as reachable — every unpriced deep player
    returns, which is the same table with an extra step."""
    dis = [{"position": "TE", "player_id": "deep", "consensus_rank": 39,
            "disagreement": 0.9, "ranks": {"a": 42, "b": 37}},
           {"position": "RB", "player_id": "near", "consensus_rank": 13,
            "disagreement": 0.4, "ranks": {"a": 11, "b": 16}},
           {"position": "WR", "player_id": "nopriceatall", "consensus_rank": 20,
            "disagreement": 0.5, "ranks": {"a": 18, "b": 22}}]
    board = {"deep": 260.0, "near": 44.0, "nopriceatall": None}
    kept, dropped = X.in_draft_range(dis, board, limit=150)
    assert [d["player_id"] for d in kept] == ["near"]
    assert dropped == 2


# ── THE CROSS-POSITION SORT IS ON A SCALE THAT IS NOT CROSS-POSITION ─────────
#
# `consensus_order` fixed a REAL depth defect: ranking each player as a fraction
# of his own source's list length compared two different quantities, so the scale
# became the SHARED players every source prices. That makes the fraction
# comparable ACROSS SOURCES for one player. It does not make it comparable ACROSS
# POSITIONS — the intersection is 25 quarterbacks and 76 receivers on the live
# 2026-08-14 archive, so one rank step is 0.040 at QB and 0.013 at WR.
#
# `disagreements()` then sorts every position into ONE list on that fraction. On
# real data the effect is not subtle: by fraction the table reads QB 0.083 vs WR
# 0.040 and looks like quarterbacks are where the sources argue. Converted to rank
# steps it is WR 3.0, QB 2.1, RB 2.0, TE 0.0 — receivers, and the loudest single
# row goes from Dallas Goedert to Alec Pierce, ten receivers apart.
#
# I nearly routed "the sources disagree most about quarterbacks". It was the
# denominator.

def test_A_DISAGREEMENT_CARRIES_RANK_STEPS_so_positions_can_be_compared():
    """Two positions, deliberately different depths, with the SAME two-place
    disagreement in each. By fraction the shallow position looks worse; in rank
    steps they are equal, which is the truth.

    MUTATION: report only the fraction — every cross-position table this module
    produces is ordered partly by how many players the position has, and the
    shallowest position leads whatever the sources actually did."""
    pos = {}
    a, b = {}, {}
    for i in range(1, 5):                       # 4 shared QBs
        pos["q%d" % i] = "QB"
        a["q%d" % i] = float(i)
        b["q%d" % i] = float(i)
    for i in range(1, 21):                      # 20 shared WRs
        pos["w%d" % i] = "WR"
        a["w%d" % i] = float(i)
        b["w%d" % i] = float(i)
    # one two-place swap in each position
    a["q1"], a["q3"] = 3.0, 1.0
    a["w1"], a["w3"] = 3.0, 1.0
    order = X.consensus_order({"one": a, "two": b}, pos)
    dis = {d["player_id"]: d for d in X.disagreements(order)}
    q, w = dis["q1"], dis["w1"]
    assert q["disagreement"] > w["disagreement"], "fraction should favour the shallow one"
    # TOLERANCE 0.01 BECAUSE `disagreement` IS STORED ROUNDED TO 4dp and
    # `rank_steps` inherits that: at a 76-deep position the rounding is worth
    # 76e-4 = 0.008 steps. Tightening this to 1e-6 asserts a precision the stored
    # value does not carry, which is a test that fails on arithmetic rather than
    # on behaviour — it did, at 6e-4, before this line said so.
    assert abs(q["rank_steps"] - w["rank_steps"]) < 0.01, (q, w)


def test_THE_RANK_STEPS_ARE_THE_FRACTION_TIMES_THE_SHARED_DEPTH():
    """Stated as arithmetic so it cannot drift into a second definition.

    MUTATION: divide by the position's FULL list rather than the shared set — the
    two scales part company exactly where the module's own docstring says they
    do, and the number stops being the one the coverage table reports."""
    pos = {"a": "RB", "b": "RB", "c": "RB", "d": "RB"}
    s1 = {"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0}
    s2 = {"a": 3.0, "b": 2.0, "c": 1.0, "d": 4.0}
    order = X.consensus_order({"one": s1, "two": s2}, pos)
    cov = X.coverage(order)["RB"]
    for d in X.disagreements(order):
        # (corroborated - 1): the fraction spans the GAPS between shared players.
        assert abs(d["rank_steps"]
                   - d["disagreement"] * max(cov["corroborated"] - 1, 1)) < 1e-6, d


def test_THE_CROSS_POSITION_TABLE_IS_SORTED_ON_RANK_STEPS_not_the_fraction():
    """A four-deep position with a TWO-place disagreement against a twenty-deep one
    with a FIVE-place disagreement. By fraction the shallow one leads (0.667 vs
    0.263); by rank steps the deep one does (2 vs 5), and the deep one is the
    bigger disagreement by any reading a drafter cares about.

    MUTATION: sort on `disagreement` — the table leads with the shallowest
    position's smallest real disagreement, every morning, and on the live archive
    that put Dallas Goedert above Alec Pierce when the sources are six tight ends
    apart on one and ten receivers apart on the other."""
    pos, a, b = {}, {}, {}
    for i in range(1, 5):
        pos["q%d" % i] = "QB"; a["q%d" % i] = float(i); b["q%d" % i] = float(i)
    for i in range(1, 21):
        pos["w%d" % i] = "WR"; a["w%d" % i] = float(i); b["w%d" % i] = float(i)
    a["q1"], a["q3"] = 3.0, 1.0          # two places apart at a 4-deep position
    a["w1"], a["w6"] = 6.0, 1.0          # five places apart at a 20-deep position
    dis = X.disagreements(X.consensus_order({"one": a, "two": b}, pos))
    by = {d["player_id"]: d for d in dis}
    assert by["q1"]["disagreement"] > by["w1"]["disagreement"]
    assert by["w1"]["rank_steps"] > by["q1"]["rank_steps"]
    assert dis[0]["player_id"] == "w1", [d["player_id"] for d in dis[:3]]
