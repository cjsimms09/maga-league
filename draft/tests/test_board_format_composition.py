# TERRITORY: C
"""IS THE MARKET DENOMINATED IN OUR LEAGUE'S FORMAT? — the guards on the answer.

`board_vs_market` has treated MFL as "an independent market" since it was written.
MFL is not A market: it is EVERY draft on its platform pooled — superflex, 2QB,
dynasty, keeper, and room sizes from eight to sixteen in one average. That was a
caveat in a docstring for two days. Measured, it is the largest effect in the
module: quarterbacks sit a median 49.8 rank slots earlier on the market than on
our board, and among non-quarterbacks the shift tracks AGE at rho +0.425.

Each test below states the mutation that motivates it, and each mutation was
applied to the module and observed to fail these assertions before the assertion
was written down.

Run: python3 -m pytest draft/tests/test_board_format_composition.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import board_vs_market as B  # noqa: E402
import external_adp_capture as C  # noqa: E402


def _archive(rows, dispersion=None, players=None, year="2026",
             observed_at="2026-08-14"):
    return {"players": players or {},
            "series": [{"year": year, "observed_at": observed_at, "rows": rows,
                        "dispersion": dispersion, "row_count": len(rows),
                        "total_drafts": 120}]}


def _board(players):
    return {"players": players}


def _p(pid, name, pos, adp, *, age=None, sd=None, sd_src="ffc-published"):
    return {"player_id": pid, "name": name, "position": pos, "adp": adp,
            "age": age, "adp_sd": sd, "adp_sd_source": sd_src}


# A decode key whose names match the board exactly, so the crosswalk is not the
# thing under test in any case below.
def _fixture(specs):
    """specs: [(pid, name, pos, board_adp, market_adp, age, board_sd, mfl_disp)]"""
    board, key, rows, disp = [], {}, {}, {}
    for i, (name, pos, badp, madp, age, bsd, d) in enumerate(specs):
        pid, mid = "S%d" % i, "M%d" % i
        board.append(_p(pid, name, pos, badp, age=age, sd=bsd))
        key[mid] = {"name": name, "position": pos, "team": "FA"}
        rows[mid] = madp
        if d:
            disp[mid] = d
    return _archive(rows, disp or None, key), _board(board)



# ── FIXTURES AT THE SCALE THAT ACTUALLY RUNS ────────────────────────────────
#
# ⚠ THE FIRST CUT OF THESE TESTS USED EIGHTEEN PLAYERS AND IT WAS TESTING A
# DIFFERENT REGIME. The verdict threshold is a FRACTION of the ranked pool, so a
# thin fixture sets a bar of one slot and any nudge clears it — a fixture that
# passes for a reason the live 145-player population would never reproduce. These
# build the real shape: 150 picks, our positional mix, and the knobs are the two
# contaminants under test.
#: ⚠ SPREAD THROUGH THE RANGE, NOT BLOCKED AT THE FRONT. Listing the twenty
#: quarterbacks first put them all at board picks 1-20, where a 60-pick shift
#: leaves the board at pick 0 and every one of them tied — the fixture destroyed
#: the effect it was built to carry. Interleaving by a stride is what the live
#: board looks like and is what makes the shift measurable.
def _pos_mix():
    counts = {"QB": 20, "RB": 45, "WR": 55, "TE": 17, "DEF": 5, "K": 3}
    total = sum(counts.values())
    slots, taken = [None] * total, {k: 0 for k in counts}
    i = 0
    while len(counts) and any(taken[k] < counts[k] for k in counts):
        for pos in ("WR", "RB", "QB", "WR", "RB", "TE", "WR", "RB", "DEF", "K"):
            if taken[pos] >= counts[pos]:
                continue
            while i < total and slots[i] is not None:
                i += 1
            if i >= total:
                break
            slots[i], taken[pos] = pos, taken[pos] + 1
    return [s for s in slots if s]


POS_MIX = _pos_mix()


def _draft_range(qb_shift=0.0, age_slope=0.0, ages=True, scale=1.0):
    """A full draft range where the market agrees with the board EXCEPT for the
    two effects being measured. `qb_shift` moves quarterbacks (negative = the
    market takes them earlier); `age_slope` moves older players later per year of
    age; `scale` multiplies every market pick, which must change nothing."""
    specs = []
    for i, pos in enumerate(POS_MIX):
        badp = 1.0 + i                                  # 1..150, no ties
        age = 22 + (i % 11) if ages else None
        madp = badp
        if pos == "QB":
            madp += qb_shift
        if age is not None:
            madp += age_slope * (age - 27)
        specs.append(("P%03d" % i, pos, badp, max(0.5, madp * scale), age, None, None))
    return _fixture(specs)


# ── THE FORMAT SIGNATURE ────────────────────────────────────────────────────

def test_A_QUARTERBACK_ONLY_SHIFT_IS_REPORTED_AS_SUPERFLEX_not_as_a_mispricing():
    """A full draft range, and only the quarterbacks move. That is not two crowds
    disagreeing about players — a crowd that thought our QBs were underpriced would
    move the good ones and leave the backups, and here even the replacement
    starters come up. It is the pool containing rooms that start two.

    MUTATION: report the overall median instead of the per-position one. The two
    rankings are a permutation of each other so every delta SUMS TO ZERO — the
    single largest finding in the comparison reports as no finding at all, which
    is the defect `sleeper_divergence` already carries a comment about."""
    out = B.format_composition(*_draft_range(qb_shift=-60.0))
    assert out["status"] == "measured", out
    assert out["superflex"]["detected"] is True
    # ⚠ AGAINST THE NULL, NOT THE RETIRED LINE. See the Step 2 block below: the
    # old bar was cleared by 56.9% of structureless draws.
    assert out["superflex"]["qb_median_slots"] < out["superflex"]["null"]["p_lo"]
    assert out["superflex"]["ranked_over"] == out["n"]
    # AND THE OVERALL FIGURE IS NOT WHAT IS BEING REPORTED — the deltas cancel.
    assert abs(sum(r["delta"] for r in out["rows"])) < 1e-6
    # NOTHING ELSE MOVED, so a per-position read is what makes the QBs visible.
    for pos in ("RB", "WR", "TE"):
        assert abs(out["by_position"][pos]["median"]) < 9.0, (pos, out["by_position"])


def test_QUARTERBACKS_GOING_LATER_IS_NOT_SUPERFLEX_the_sign_is_the_claim():
    """A magnitude test would confirm superflex on data that refutes it. A pool
    that takes quarterbacks LATER than our single-QB board is evidence of the
    opposite composition, and calling it superflex would invert the reading.

    MUTATION: threshold on `abs(median) >= thresh` — the fixture below is the
    superflex one with its sign flipped and it comes back `detected: true`, telling
    a reader not to blend a market that likes quarterbacks LESS than we do.

    ⚠ THE FULL-SCALE FIXTURE IS LOAD-BEARING HERE, and the thin one hid the
    mutation. At eighteen players the population floor already forces
    `detected: false`, so this test passed under the mutant for a reason that had
    nothing to do with the sign — a green test standing in front of a defect."""
    out = B.format_composition(*_draft_range(qb_shift=+60.0))
    assert out["status"] == "measured", out["status"]
    assert out["superflex"]["qb_median_slots"] > 0
    # THE SHIFT IS OUTSIDE THE NULL ON THE HIGH SIDE, so only the SIGN refuses it.
    assert out["superflex"]["qb_median_slots"] > out["superflex"]["null"]["p_hi"]
    assert out["superflex"]["detected"] is False
    assert "superflex" not in out["note"]


def test_AN_AGE_GRADIENT_IS_MEASURED_WITH_QUARTERBACKS_REMOVED():
    """Superflex and dynasty both move quarterbacks, so an age correlation taken
    over everybody can be a QB effect wearing a disguise: the market's early
    quarterbacks skew whatever age they happen to be, and rho picks it up as youth
    or as experience depending on the year's rookie class.

    MUTATION: correlate over all positions — a PURE superflex fixture with a
    deliberate age structure among the quarterbacks reports a dynasty pool too,
    because the QBs are the only players that moved and they carry ages."""
    arc, brd = _draft_range(qb_shift=-60.0)
    # THE QUARTERBACKS ARE MADE THE OLDEST PLAYERS ON THE BOARD, so an
    # all-positions correlation would read a strong NEGATIVE age gradient off a
    # fixture with no age effect in it whatsoever.
    for p in brd["players"]:
        if p["position"] == "QB":
            p["age"] = 36
    out = B.format_composition(arc, brd)
    assert out["superflex"]["detected"] is True
    assert out["dynasty"]["n"] == len([p for p in brd["players"]
                                       if p["position"] != "QB"])
    assert out["dynasty"]["detected"] is False, out["dynasty"]
    assert abs(out["dynasty"]["age_rho_non_qb"]) < B.DYNASTY_AGE_RHO, out["dynasty"]


def test_AN_AGE_GRADIENT_AMONG_NON_QUARTERBACKS_IS_REPORTED_AS_DYNASTY():
    """The other arm, so `detected: False` above is a discrimination rather than a
    check that never fires (rule 13f). Old players going later everywhere, with the
    quarterbacks left exactly where our board has them.

    MUTATION: drop the dynasty arm entirely — the old-running-back shift gets
    explained with superflex by whoever reads the QB number, and the wrong set of
    players is treated as contaminated."""
    out = B.format_composition(*_draft_range(age_slope=6.0))
    assert out["status"] == "measured"
    assert out["dynasty"]["detected"] is True
    assert out["dynasty"]["age_rho_non_qb"] >= B.DYNASTY_AGE_RHO
    assert out["superflex"]["detected"] is False, out["superflex"]
    assert "dynasty" in out["note"] and "superflex" not in out["note"]


def test_A_THIN_CROSSWALK_WITHHOLDS_THE_VERDICT_but_still_shows_the_shift():
    """The threshold is a fraction of the ranked pool, which is right — and which
    means a crosswalk decayed to twenty players sets a bar of 1.3 slots that any
    nudge clears. A format called off that population is a statement about who
    happened to match, not about the market.

    MUTATION: keep the fraction and drop the floor — a broken decode key produces a
    confident "THE MARKET IS NOT DRAFTING OUR FORMAT" from twenty players, and the
    louder the alarm the less anybody re-checks the crosswalk under it."""
    specs = [("P%02d" % i, "QB" if i % 5 == 0 else "WR",
              1.0 + i, 1.0 + i - (12.0 if i % 5 == 0 else 0.0), 26, None, None)
             for i in range(20)]
    out = B.format_composition(*_fixture(specs))
    assert out["status"] == "thin", out["status"]
    assert out["n"] == 20
    assert out["superflex"]["detected"] is False
    assert out["superflex"]["qb_median_slots"] < 0        # the shift is still shown
    assert "crosswalked" in out["note"] and "75" in out["note"]


def test_A_MISSING_AGE_IS_EXCLUDED_AND_COUNTED_never_read_as_zero():
    """A row with no age is a rookie our board has not stamped, not a newborn. Read
    as 0 he becomes the youngest player in the population, and the gradient this
    function looks for is exactly the one a floor of zeros manufactures.

    MUTATION: `float(r.get("age") or 0)` — the ageless rows pile up at the young
    end, and whichever way the market happens to have moved them sets the sign of
    a dynasty verdict computed mostly from absence."""
    specs = [("Old %d" % i, "RB", 10.0 + i * 10, 10.0 + i * 10, 31, None, None)
             for i in range(6)]
    # AGELESS ROWS, MOVED HARD LATE. Read as age 0 they would drag rho negative.
    specs += [("Ageless %d" % i, "WR", 70.0 + i * 10, 200.0 + i * 10, None, None, None)
              for i in range(6)]
    arc, brd = _fixture(specs)
    out = B.format_composition(arc, brd)
    assert out["no_age"] == 6 and out["aged"] == 6
    assert out["dynasty"]["n"] == 6
    for r in out["rows"]:
        if r["name"].startswith("Ageless"):
            assert r["age"] is None


def test_BOTH_SIDES_ARE_RANKED_SO_A_PURE_SCALE_DIFFERENCE_IS_NOT_A_FINDING():
    """A ten-team room reaches pick 100 a round and a half before a fourteen-team
    one. Compared as raw pick numbers that is a market-wide "everyone goes later"
    of the exact size this function is built to detect, and it means nothing about
    anybody's opinion.

    MUTATION: subtract raw adp instead of rank — the same ordering at a 1.4x pick
    scale reports every position shifted, and `detected` fires on arithmetic."""
    out = B.format_composition(*_draft_range(scale=1.4))
    assert out["status"] == "measured" and out["n"] == len(POS_MIX)
    for pos, v in out["by_position"].items():
        assert v["median"] == 0.0, (pos, v)
    assert out["superflex"]["detected"] is False
    assert out["dynasty"]["detected"] is False


def test_THE_POPULATION_IS_OUR_DRAFT_RANGE_not_the_markets():
    """`report` selects on the market's adp because it asks what the market reaches
    that we bury. This asks whether the market's numbers mean what ours mean, so it
    must select on OUR board — otherwise the population is chosen by the very
    quantity under test, and a market that prices our whole bench inside 150 sets
    the sample for a verdict about itself.

    MUTATION: filter on `market_adp <= top_n` — the six deep players below enter
    the ranking and every delta shifts, including for players nobody will reach."""
    specs = [("Real %d" % i, "WR", 10.0 + i * 10, 10.0 + i * 10, 26, None, None)
             for i in range(10)]
    # OUTSIDE OUR RANGE, INSIDE THEIRS. The market prices them at pick 20-70.
    specs += [("Deep %d" % i, "RB", 400.0 + i, 20.0 + i * 10, 26, None, None)
              for i in range(6)]
    arc, brd = _fixture(specs)
    out = B.format_composition(arc, brd)
    assert out["n"] == 10
    assert not [r for r in out["rows"] if r["name"].startswith("Deep")]


# ── THE SPREAD IS NOT THE SAME QUANTITY AS `adp_sd` ─────────────────────────

def _disp(lo, hi, drafts, sel=100.0):
    return {"min_pick": lo, "max_pick": hi, "drafts": drafts, "sel_pct": sel}


def test_THE_BOARD_SIDE_IS_THE_PUBLISHERS_OWN_SD_never_our_fallback_clamp():
    """`fallback-clamped` is 30.0 for every player carrying it by construction, and
    `clamped-linear` is fitted from the mean. Comparing the market against either
    measures OUR clamp and reports the answer as a fact about the market.

    MUTATION: accept any non-null `adp_sd` — the clamped rows below drag the board
    coefficient toward our own constant and the ratio becomes a statement about a
    number we invented."""
    specs = [("Pub %d" % i, "WR", 10.0 + i * 10, 10.0 + i * 10, 26,
              1.0 + i, _disp(1.0, 20.0 + i, 50)) for i in range(6)]
    arc, brd = _fixture(specs)
    for p in brd["players"][3:]:                      # half the board is clamped
        p["adp_sd_source"] = "fallback-clamped"
        p["adp_sd"] = 30.0
    out = B.spread_composition(arc, brd)
    assert out["n"] == 3, out


def test_A_MARKET_TIGHTER_THAN_THE_BOARD_REPORTS_ZERO_EXCESS_not_a_root_of_a_negative():
    """The excess is a quadrature subtraction, so a market narrower than the board
    puts a negative under the root. Python raises on that for a real power only by
    accident of the exponent; a complex result would propagate into JSON as a
    crash, and clamping silently at some floor would report a nonzero excess where
    there is none.

    MUTATION: drop the guard — `(m**2 - b**2) ** 0.5` on a tighter market returns a
    COMPLEX number, and `round()` on it raises inside the daily workflow rather
    than in anything that names the cause."""
    specs = [("Tight %d" % i, "WR", 10.0 + i * 10, 10.0 + i * 10, 26,
              40.0, _disp(9.0 + i * 10, 11.0 + i * 10, 50)) for i in range(6)]
    arc, brd = _fixture(specs)
    out = B.spread_composition(arc, brd)
    assert out["status"] == "measured"
    assert out["market_cv"] < out["board_cv"]
    assert out["excess_cv"] == 0.0
    assert out["excess_share_of_variance"] == 0.0


def test_THE_COEFFICIENT_IS_PER_PICK_so_a_wider_pool_alone_is_not_a_finding():
    """Both markets' spreads are proportional to the pick number. Comparing raw sds
    across two pools whose pick scales differ would report the scale as a
    disagreement — the same trap as the mean, one layer down.

    MUTATION: compare raw sd instead of sd/adp — the fixture below is the SAME
    market at a 2x pick scale, and it reports the market twice as uncertain as
    itself."""
    a_specs = [("Guy %d" % i, "WR", 10.0 + i * 10, 10.0 + i * 10, 26,
                1.0 + i, _disp(5.0 + i * 10, 15.0 + i * 10, 50)) for i in range(6)]
    b_specs = [("Guy %d" % i, "WR", 10.0 + i * 10, 20.0 + i * 20, 26,
                1.0 + i, _disp(10.0 + i * 20, 30.0 + i * 20, 50)) for i in range(6)]
    a = B.spread_composition(*_fixture(a_specs))
    b = B.spread_composition(*_fixture(b_specs))
    assert a["market_cv"] == b["market_cv"], (a["market_cv"], b["market_cv"])


def test_THE_ESTIMATOR_CARRIES_ITS_OWN_DENOMINATION_on_every_measured_row():
    """A consumer that reads `["sd"]` and nothing else is how this class of defect
    has landed every previous time. The refusal rides on the dict so that copying
    the row copies the warning, rather than living in a docstring the consumer's
    author never opened.

    MUTATION: put the marker only in the module docstring — `spread_from_dispersion`
    returns a bare float under a key called `sd`, indistinguishable at the call site
    from the `adp_sd` that drives `normalCdf(currentPick, adp, adp_sd)`."""
    for row in (_disp(1.0, 40.0, 50), {}, _disp(1.0, 40.0, 1)):
        got = C.spread_from_dispersion(row)
        assert got["comparable_to_board_adp_sd"] is False, got
        assert "provider-internal" in got["scale"], got


def test_AN_ARCHIVE_WITH_NO_SPREAD_YET_SAYS_UNMEASURED_not_a_ratio_of_one():
    """The three days captured before the dispersion parser landed carry no spread
    at all. A ratio computed from nothing would come back 1.0 — "the two markets
    agree exactly" — which is the strongest possible claim resting on no data.

    MUTATION: default a missing dispersion to `{}` and let the estimator's `absent`
    rows through as zeros — every one of them divides out to a coefficient of 0 and
    the market reports as perfectly certain."""
    specs = [("Guy %d" % i, "WR", 10.0 + i * 10, 10.0 + i * 10, 26, 2.0, None)
             for i in range(8)]
    arc, brd = _fixture(specs)
    out = B.spread_composition(arc, brd)
    assert out["status"] == "unmeasured"
    assert out["ratio"] is None and out["market_cv"] is None
    assert "three players" in out["note"]


def test_A_YEAR_THE_ARCHIVE_DOES_NOT_HOLD_IS_UNMEASURED_not_empty_agreement():
    """Asking for 2025 against a 2026-only archive must not silently answer about
    nothing. Both functions share `_paired`, so both inherit this.

    MUTATION: fall through to the newest snapshot whatever its year — a replay of
    an old season would be graded against today's market and every delta would be
    a fact about the calendar."""
    specs = [("Guy %d" % i, "WR", 10.0 + i * 10, 10.0 + i * 10, 26, 2.0, None)
             for i in range(8)]
    arc, brd = _fixture(specs)
    for fn in (B.format_composition, B.spread_composition):
        out = fn(arc, brd, year="2025")
        assert out["status"] == "unmeasured", (fn.__name__, out)
        assert "2025" in out["note"], (fn.__name__, out["note"])


def test_A_CONSTANT_COLUMN_CORRELATES_TO_NONE_never_to_zero():
    """Every non-QB the same age is no evidence about a dynasty pool. Reported as
    rho 0.0 it reads as "measured, and there is no age effect" — a finding — when
    the truth is that the question was unanswerable on this population.

    MUTATION: return 0.0 on a zero denominator — `detected: false` becomes a
    positive statement of homogeneity built from a column with no variance."""
    assert B._spearman([1.0, 1.0, 1.0, 1.0], [1.0, 2.0, 3.0, 4.0]) is None
    assert B._spearman([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == 1.0
    specs = [("Same %d" % i, "RB", 10.0 + i * 10, 10.0 + i * 10, 27, None, None)
             for i in range(8)]
    arc, brd = _fixture(specs)
    out = B.format_composition(arc, brd)
    assert out["dynasty"]["age_rho_non_qb"] is None
    assert out["dynasty"]["detected"] is False


# ── THE DAILY CHECK IS A MECHANISM ONLY IF SOMETHING DIFFS IT ───────────────

def _multi_day(days):
    """days: {observed_at: qb_shift}. One board, many market days."""
    arc, brd = _draft_range(qb_shift=0.0)
    series = []
    for d, shift in sorted(days.items()):
        rows = {}
        for i, pos in enumerate(POS_MIX):
            rows["M%d" % i] = max(0.5, 1.0 + i + (shift if pos == "QB" else 0.0))
        series.append({"year": "2026", "observed_at": d, "rows": rows,
                       "dispersion": None, "row_count": len(rows)})
    return {"players": arc["players"], "series": series}, brd


def test_ONE_DAY_IS_NOT_A_TREND_and_it_says_so_rather_than_reporting_steady():
    """A drift computed from a single day is 0.0 by construction, and "steady"
    read off it is the strongest possible claim resting on no comparison. This is
    rule 13f pointed at my own newest check: a state that can only ever say
    "nothing yet" has not looked.

    MUTATION: return `moving: False` whenever fewer than two days exist — the
    first morning after this lands reports a stable market, and the reader who
    needed to know the pool was drifting gets told it was not."""
    arc, brd = _multi_day({"2026-08-14": -60.0})
    tr = B.format_trend(arc, brd)
    assert tr["status"] == "unmeasured"
    assert tr["moving"] is None and tr["drift"] is None
    assert tr["measured_days"] == 1
    assert "nothing to compare" in tr["note"]


def test_A_MARKET_THAT_BECOMES_OUR_FORMAT_IS_REPORTED_AS_MOVING():
    """The case that matters before the 22nd. MFL's mid-August pool is not its
    draft-week pool — best-ball and dynasty startups run early, single-QB redraft
    rooms fill in late — so the contamination genuinely thins as the season nears.
    A market that stopped being contaminated would become usable, and finding that
    out on the 23rd is finding it out too late.

    MUTATION: compare the last day against the second-to-last instead of the
    first — a composition that walks steadily from -60 to 0 over a fortnight moves
    only a few slots a night, clears no threshold on any single day, and arrives
    unremarked."""
    # ⚠ A GRADUAL WALK, AND THAT IS THE WHOLE TEST. The first fixture here jumped
    # -60 to -40 to -20 to 0 and the mutation SURVIVED it: with steps that large,
    # the last two days alone clear the threshold, so comparing the wrong pair
    # still fires. A real composition drift is four picks a night — under any
    # single-night bar, and sixty picks by draft day.
    days = {"2026-08-%02d" % (1 + i): -60.0 + 4.0 * i for i in range(16)}
    tr = B.format_trend(*_multi_day(days))
    assert tr["status"] == "measured" and tr["measured_days"] == 16
    # NO SINGLE NIGHT CLEARS THE BAR ...
    fr = [d["qb_median_fraction"] for d in tr["days"]]
    assert max(abs(b - a) for a, b in zip(fr, fr[1:])) < tr["drift_threshold"], fr
    # ... AND THE FORTNIGHT DOES.
    assert tr["moving"] is True, tr
    assert "superflex" in tr["flipped"], tr["flipped"]
    assert tr["days"][0]["superflex"] is True and tr["days"][-1]["superflex"] is False
    assert "COMPOSITION IS MOVING" in tr["note"]


def test_A_STEADY_POOL_IS_NOT_REPORTED_AS_MOVING_so_the_alarm_can_be_believed():
    """The other arm. The live archive's four days sit within 0.003 of each other,
    and an alarm that fires on that is one nobody reads by the 22nd.

    MUTATION: drop the threshold to zero — every day's rounding makes the market
    'move', and the one morning it genuinely does is indistinguishable."""
    arc, brd = _multi_day({"2026-08-11": -60.0, "2026-08-12": -60.0,
                           "2026-08-13": -61.0, "2026-08-14": -60.0})
    tr = B.format_trend(arc, brd)
    assert tr["status"] == "measured"
    assert tr["moving"] is False and tr["flipped"] == []
    assert abs(tr["drift"]) < tr["drift_threshold"]
    # ⚠ AND THE QUIET ANSWER MUST NOT CLAIM STABILITY. Four days at drift 0.003
    # is three consecutive mid-August intervals; it supports "has not moved yet"
    # and nothing stronger, and the mechanism proposed for the contamination
    # predicts the flat part comes FIRST. Asserted on the claim rather than on a
    # word, because the first version of this pinned the literal "steady" and
    # broke the moment the wording was corrected.
    assert "HAS NOT MOVED" in tr["note"]
    assert "NOT 'STRUCTURAL'" in tr["note"]
    assert "draft day against the first day" in tr["note"], \
        "the note must name the observation that would settle it"


def test_A_FLIP_IS_REPORTED_EVEN_WHEN_THE_DRIFT_IS_UNDER_THRESHOLD():
    """A verdict that changes is news whatever the magnitude that moved it: the
    market crossing from "do not blend this" to "this is our format" is the whole
    decision, and it can happen on a shift of one slot if it was sitting on the
    line.

    MUTATION: gate the note on the drift alone — the crossing happens, the verdict
    in every consumer flips, and the trend line says the pool held steady."""
    # STRADDLING THE NULL BY A ROUNDING'S WORTH: -0.241 of the board on the 13th,
    # -0.217 on the 14th, against a null p_lo near -0.23. The verdict crosses; the
    # drift is 0.024, under the 0.033 that would call the pool changed.
    #
    # ⚠ RECALIBRATED. The first version of this fixture straddled the RETIRED
    # fraction line, which 56.9% of structureless draws already cleared — so it
    # was testing a boundary that meant nothing.
    arc, brd = _multi_day({"2026-08-13": -40.0, "2026-08-14": -36.0})
    tr = B.format_trend(arc, brd)
    assert tr["days"][0]["superflex"] is True, tr["days"]
    assert tr["days"][-1]["superflex"] is False, tr["days"]
    assert abs(tr["drift"]) < tr["drift_threshold"], tr["drift"]
    assert tr["flipped"] == ["superflex"]
    assert tr["moving"] is False
    assert "flipped" in tr["note"] and "MOVING" in tr["note"]


def test_EVERY_DAY_IS_RANKED_AGAINST_TODAYS_BOARD_not_that_days():
    """The question is how the MARKET moved. Ranking each day's market against
    that day's board would fold our own rebuilds in — a board edit on the 13th
    would read as the market changing composition overnight, and this board is
    rebuilt most mornings.

    MUTATION: none available in the module, because the board is a parameter — so
    this pins the property instead: an unchanging market across four days must
    report an unchanging composition regardless of what the board did, and the
    only board it ever sees is the one passed in."""
    arc, brd = _multi_day({"2026-08-11": -60.0, "2026-08-12": -60.0,
                           "2026-08-13": -60.0, "2026-08-14": -60.0})
    tr = B.format_trend(arc, brd)
    fracs = {d["qb_median_fraction"] for d in tr["days"]}
    assert len(fracs) == 1, fracs
    assert tr["drift"] == 0.0


# ── THE VERDICT IS "OUTSIDE THE NULL", AND THE NULL IS NOT ZERO ─────────────
#
# STEP 2, AND IT COST ME THREE OF MY OWN REPORTED NUMBERS. The declared bar was
# one full round of our fifteen. Stress-tested against a PERMUTATION NULL — market
# values shuffled across the same players, destroying position structure and
# keeping both marginals — **56.9% of structureless draws already cleared it at
# quarterback.** The cause is this lane's own recurring defect turned inward: our
# board prices QBs LATE (mean rank 84.3 of 145 against a uniform 73.0), so a
# market that ranked them at random still returns a median delta of -11.8.
#
# The QB finding SURVIVED (-49.8 against a null p05 of -33.5) and so did the age
# gradient (+0.425 against a null p95 of -0.041, itself not zero because age
# correlates with board rank at +0.204). RB +16.5, WR +7.0 and TE -5.0 did NOT —
# all three sit inside their own nulls, and all three had been reported to A.


def test_THE_NULL_IS_NOT_CENTRED_ON_ZERO_when_a_position_sits_late_on_our_board():
    """The whole reason the old threshold measured nothing. A market with NO
    position structure still produces a negative delta for any position our board
    prices late, because the delta is `market_rank - board_rank` and the board
    rank is not uniform.

    MUTATION: judge against 0 (or against any fixed line) — a board that happens
    to price a position late reports that position as format-shifted every single
    morning, and the number being reported is the board's own shape."""
    # QUARTERBACKS ALL LATE ON OUR BOARD, market identical to it: zero real effect.
    specs = []
    for i, pos in enumerate(POS_MIX):
        p = "QB" if i >= len(POS_MIX) - 20 else ("WR" if i % 2 else "RB")
        specs.append(("P%03d" % i, p, 1.0 + i, 1.0 + i, 26, None, None))
    out = B.format_composition(*_fixture(specs))
    nb = out["superflex"]["null"]
    assert nb is not None
    assert nb["median"] < -1.0, ("a late-priced position must have a negative "
                                 "null, not zero", nb)
    # AND WITH NO REAL EFFECT THE VERDICT MUST BE FALSE ANYWAY.
    assert out["superflex"]["detected"] is False, out["superflex"]


def test_A_NULL_BAND_WIDER_THAN_HALF_THE_BOARD_YIELDS_NO_VERDICT():
    """With three kickers the null spans -108 to -5 on a 145-player board. A
    median of +4.0 is technically outside that, and the statement is worthless: a
    band covering most of the board cannot place an effect anywhere in it.

    MUTATION: drop the width guard — DEF (n=5) and K (n=3) come back `REAL` on the
    live board every morning, and two positions nobody drafts before pick 130
    appear beside the quarterback finding as equals."""
    out = B.format_composition(*_draft_range(qb_shift=-60.0))
    thin_pos = [k for k, v in out["by_position"].items() if v["n"] <= 5]
    assert thin_pos, "the fixture must contain a thin position for this to test"
    for k in thin_pos:
        v = out["by_position"][k]
        assert v["null_too_wide"] is True, (k, v)
        assert v["outside_null"] is False, (k, v)


def test_A_REAL_EFFECT_IS_STILL_DETECTED_against_its_null():
    """The other arm, so the null is a discrimination and not a blanket refusal.
    A 60-pick quarterback shift must clear its own null comfortably.

    MUTATION: widen the band to 0.001/0.999 — nothing is ever outside it and the
    instrument reports a clean market every day, which is the quiet failure the
    old threshold had in the other direction."""
    out = B.format_composition(*_draft_range(qb_shift=-60.0))
    sfx = out["superflex"]
    assert sfx["detected"] is True
    assert sfx["qb_median_slots"] < sfx["null"]["p_lo"]
    assert out["by_position"]["QB"]["outside_null"] is True


def test_THE_NULL_IS_DETERMINISTIC_so_two_runs_on_one_day_agree():
    """A permutation null reseeded per call would move the band between the
    summary and the escalation reading it, and a verdict that flips on rerun is
    not a verdict.

    MUTATION: seed from the clock — the same archive gives two answers and the
    drift alarm fires on its own noise."""
    a = B.format_composition(*_draft_range(qb_shift=-60.0))
    b = B.format_composition(*_draft_range(qb_shift=-60.0))
    assert a["superflex"]["null"] == b["superflex"]["null"]
    assert a["dynasty"]["null"] == b["dynasty"]["null"]


def test_ONLY_THE_LOW_TAIL_COUNTS_FOR_SUPERFLEX():
    """Quarterbacks going LATER than our board is the opposite composition. A
    two-sided test on this arm would call a single-QB market that likes QBs less
    than we do a superflex pool.

    MUTATION: use `outside the band` instead of `below p_lo` — the sign-flipped
    fixture reports superflex, and the note tells a reader not to blend a market
    that agrees with them more than they do."""
    out = B.format_composition(*_draft_range(qb_shift=+60.0))
    sfx = out["superflex"]
    assert sfx["qb_median_slots"] > sfx["null"]["p_hi"], "must be outside, high"
    assert sfx["detected"] is False
    assert "superflex" not in out["note"]


def test_THE_RETIRED_LINE_IS_REPORTED_but_is_not_the_verdict():
    """The old bar is kept so the change is visible to whoever reads the summary,
    and it must be impossible to mistake it for the decision.

    MUTATION: restore it as the verdict — 56.9% of structureless quarterback
    draws clear it, so the instrument goes back to reporting the board's own
    shape as the market's format."""
    out = B.format_composition(*_draft_range(qb_shift=-60.0))
    sfx = out["superflex"]
    assert "reference_line_slots" in sfx and "reference_line_retired" in sfx
    assert "threshold_slots" not in sfx, "the old key must not survive as a verdict"
    # THE VERDICT MUST TRACK THE NULL, NOT THE LINE: a shift that clears the old
    # line but sits inside the null is NOT detected.
    n = len(POS_MIX)
    small = B.format_composition(*_draft_range(qb_shift=-(B.FORMAT_SHIFT_FRACTION * n + 2)))
    s2 = small["superflex"]
    assert abs(s2["qb_median_slots"]) > s2["reference_line_slots"], "clears the old line"
    assert s2["detected"] is False, "and is still inside the null"


# ── RECEPTION SCORING: THE DIVERGENCE THE CENSUS SAYS DOMINATES ─────────────
#
# `format_composition` tested superflex and dynasty and nothing else. The MFL
# format census (114 readable leagues) says only 6.1% are half-PPR like us and
# 55.3% are FULL PPR, against superflex at 21.1% — so the LARGEST divergence
# between that market and our board was the one this module did not look for.

def _tgt_rows(pairs):
    """pairs: [(target_share, market_adp)] — board adp is the index order."""
    rows = [{"player_id": str(i), "name": "P%d" % i, "position": "WR",
             "adp": float(i + 1), "adp_source": "fantasypros",
             "adp_sd": 1.0, "adp_sd_source": "ffc-published",
             "age": 25.0, "target_share": ts}
            for i, (ts, _m) in enumerate(pairs)]
    key = {str(i): {"name": "P%d" % i, "position": "WR", "team": "NYJ"}
           for i in range(len(pairs))}
    arch = {"players": key,
            "series": [{"year": "2026", "observed_at": "2026-08-14",
                        "rows": {str(i): float(m) for i, (_t, m) in enumerate(pairs)},
                        "row_count": len(pairs)}]}
    return arch, {"players": rows}


def test_a_MORE_RECEPTION_HEAVY_market_shows_as_a_NEGATIVE_rho():
    """The sign IS the claim, and it was predicted before the number was computed.
    A market that values a reception more than our board prices high-target
    players EARLIER; `delta` is market_rank - board_rank, so earlier is NEGATIVE.

    MUTATION: score the HIGH tail — a market MORE reception-heavy than ours reads
    as undetected, and one LESS reception-heavy reads as the finding."""
    # THE FIRST VERSION OF THIS FIXTURE EXPRESSED THE OPPOSITE HYPOTHESIS and
    # returned rho +1.0, which is the detector working: I had built a market that
    # prices high-target players LATER. Board rank is i+1; target share alternates
    # independently of it, and the market moves HIGH-target players 10 slots
    # EARLIER and low-target players 10 slots later. So delta is negative exactly
    # where target share is high, which is the claim.
    n = 40
    pairs = []
    for i in range(n):
        high = (i % 2 == 0)
        ts = 0.25 if high else 0.05
        mkt = float(max(1, (i + 1) - 10 if high else (i + 1) + 10))
        pairs.append((ts, mkt))
    arch, board = _tgt_rows(pairs)
    f = B.format_composition(arch, board, "2026", n)
    rcp = f.get("reception")
    assert rcp is not None, f
    assert rcp["target_share_rho_non_qb"] < 0, rcp
    assert "EARLIER" in rcp["reads"]
    # ⚠ THE ARM MUST NOT CLAIM A CAUSE IT DOES NOT HAVE. I shipped this saying
    # the gradient was reception scoring, then refuted it with my own control:
    # FFC is half-PPR at our league size and shows rho -0.321 against MFL's
    # -0.301, and a format cause predicts the effect VANISHES there.
    #
    # MUTATION: restore the original `reads` — the module asserts a mechanism
    # that its own control has already killed, and a reader acts on a format
    # correction that is not what this measures.
    assert "cause" in rcp and "NOT ESTABLISHED" in rcp["cause"], rcp
    assert "REFUTED" in rcp["cause"], rcp
    assert "reception-heavy market" not in rcp["reads"], rcp["reads"]
    # ⚠ AND THE VERDICT, NOT ONLY THE SIGN. Asserting `rho < 0` leaves the TAIL
    # unguarded: flipping `_verdict(..., "low")` to `"high"` changes nothing about
    # rho or the `reads` string, and the gate proved that mutation SURVIVED. The
    # tail is the half of the claim that decides whether a finding is reported.
    assert rcp["detected"] is True, rcp

    # THE OPPOSITE COMPOSITION MUST NOT READ AS A WEAKER VERSION OF THIS ONE. A
    # market LESS reception-heavy than ours prices high-target players LATER, and
    # a two-sided test would call that the same finding.
    flip = [(ts, float(max(1, (i + 1) + 10 if ts > 0.1 else (i + 1) - 10)))
            for i, (ts, _m) in enumerate(pairs)]
    arch2, board2 = _tgt_rows(flip)
    r2 = B.format_composition(arch2, board2, "2026", n)["reception"]
    assert r2["target_share_rho_non_qb"] > 0, r2
    assert r2["detected"] is False, r2


def test_a_MISSING_target_share_is_excluded_not_read_as_zero():
    """A player with no target share would sit at the bottom of the gradient this
    is looking for and manufacture it — the same reason a missing age is not a
    rookie aged 0.

    MUTATION: `float(targets[i] or 0)` — every unrecorded player becomes a
    zero-target anchor and the correlation is built out of absent data."""
    n = 30
    pairs = [(0.25 - 0.006 * i, float(n - i)) for i in range(n)]
    arch, board = _tgt_rows(pairs)
    for r in board["players"][:12]:
        del r["target_share"]
    f = B.format_composition(arch, board, "2026", n)
    rcp = f.get("reception")
    assert rcp["n"] == n - 12, rcp


def test_QUARTERBACKS_are_excluded_from_the_reception_gradient():
    """QBs catch nothing; their target share is 0 or absent by construction, so
    leaving them in puts a large block at one end of the x-axis whose position
    says nothing about reception scoring.

    MUTATION: drop the position filter — the QB block drives the correlation."""
    n = 30
    pairs = [(0.25 - 0.006 * i, float(n - i)) for i in range(n)]
    arch, board = _tgt_rows(pairs)
    for r in board["players"][:10]:
        r["position"] = "QB"
        r["target_share"] = 0.0
    f = B.format_composition(arch, board, "2026", n)
    assert f["reception"]["n"] == n - 10, f["reception"]


def test_the_THIRD_ARM_is_tracked_by_the_trend_the_day_it_is_written():
    """rule 14 — a detector added to `format_composition` and not to the series
    that watches it flip is measured once a day and never compared across days.

    MUTATION: leave ("superflex", "dynasty") in the flip list — the market's
    LARGEST divergence can switch on or off and `flipped` stays silent."""
    import inspect
    src = inspect.getsource(B.format_trend)
    assert '"reception"' in src, "format_trend does not carry the reception arm"
    assert 'for k in ("superflex", "dynasty", "reception")' in src, \
        "the flip list does not include reception"


def test_the_TWO_ARMS_carry_their_controls_and_they_disagree():
    """The dynasty arm PASSES the control the reception arm FAILS, and the pair
    is only meaningful together. Against FFC — half-PPR, 10 teams, REDRAFT:

        age    MFL +0.425   FFC -0.200   sign FLIPS  -> format-specific
        target MFL -0.301   FFC -0.321   same sign   -> not format

    MUTATION: drop either control field — the module reports two findings of
    apparently equal standing when one has survived a falsification test and the
    other has failed one."""
    import json as _json
    arch = _json.loads(open("draft/data/external_adp_series.json").read())
    board = _json.load(open("public/draft_data.json"))
    f = B.format_composition(arch, board, "2026", 150)
    dyn, rcp = f["dynasty"], f["reception"]
    assert "PASSES" in dyn["control"], dyn
    assert dyn["control_ffc_rho"] < 0 < dyn["age_rho_non_qb"], (dyn, "sign must flip")
    assert "REFUTED" in rcp["cause"], rcp
    # same sign is the refutation, and it must stay visible
    assert rcp["control_ffc_rho"] < 0 and rcp["target_share_rho_non_qb"] < 0, rcp
    # AND THE SPECIFICITY, which is why the measurement is kept at all
    sp = rcp["specificity"]
    assert abs(sp["wopr"]) > abs(sp["target_share"]) > abs(sp["proj_mean"]), sp
    assert abs(sp["proj_mean"]) < 0.05 and abs(sp["vorp"]) < 0.05, sp
    assert "no null on these" in sp["note"], sp
