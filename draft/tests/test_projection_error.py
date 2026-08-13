# TERRITORY: C
"""HISTORICAL PROJECTION-VS-ACTUAL — the empirical source of proj_sd and proj_ceiling.

Item 3 of A's ingest brief, and the thing item 1 actually needs. `build_bundle.py`
writes `proj_sd = 0.25 * proj_mean` and `proj_ceiling = 1.35 * proj_mean`: two
constants, so spread is a fixed multiple of the mean, ceiling is rank-identical to
value, and `ceiling: 0` in MEASURED_WEIGHTS is an experiment that could not have
returned anything else.

WHY THIS INSTRUMENT AND NOT WEEKLY VARIANCE. They measure different risks and only
one of them is the drafter's. `nflverse_variance` measures IN-SEASON VOLATILITY — how
much a player bounces week to week, given how his season went. This measures
ESTIMATION ERROR — how wrong our preseason number was. A player projected 200 who
finishes 120 cost his drafter 80 points whether he got there smoothly or not. For a
season-long hold, estimation error dominates, and NOTHING in the pipeline measures it.

THE BAND HAS TO BE KNOWABLE BEFORE THE DRAFT. A's brief says "by ADP band"; we hold
no archived ADP before 2026-08-09 and a retroactive fetch leaks (exp33), so there is
no historical ADP to fit on. Banding by realized draft pick would fit but could never
be APPLIED — a 2026 player has no pick number until he is picked. Projection rank
within position both fits historically and applies prospectively, so that is the band,
and it is named `proj_rank_band` rather than `adp_band` because it is not ADP.

Run: python3 -m pytest draft/tests/test_projection_error.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import projection_error as PE  # noqa: E402


def board(*players):
    return {"season": 2024, "players": list(players)}


def p(pid, pos, mean, rank=None):
    r = {"player_id": pid, "position": pos, "proj_mean": mean}
    if rank is not None:
        r["proj_rank"] = rank
    return r


# ── the measurement ─────────────────────────────────────────────────────────
def test_error_is_measured_as_a_RATIO_so_it_transfers_across_scale():
    """An absolute sd fitted on 300-point QBs cannot be applied to a 90-point TE2.
    MUTATION: keep points only — every band's number becomes unusable at any other
    scale and the TE that inherits a QB's spread reads as wildly uncertain."""
    rows = PE.error_rows(board(p("a", "QB", 200.0), p("b", "TE", 100.0)),
                         {"a": 100.0, "b": 50.0})
    assert {r["player_id"]: r["ratio"] for r in rows} == {"a": 0.5, "b": 0.5}
    assert {r["player_id"]: r["error"] for r in rows} == {"a": -100.0, "b": -50.0}


def test_a_projection_of_ZERO_yields_NO_RATIO_rather_than_a_division():
    """MUTATION: divide anyway. One ZeroDivisionError takes down the calibration, or
    — worse, with a guard that returns 0.0 — the player reads as a perfect bust and
    drags his whole band down."""
    rows = PE.error_rows(board(p("a", "QB", 0.0)), {"a": 40.0})
    assert len(rows) == 1
    assert rows[0]["ratio"] is None, "no denominator, no ratio"
    assert rows[0]["error"] == 40.0, "the absolute error is still a fact"


# ── absent is not zero, and here it is SURVIVORSHIP ─────────────────────────
def test_a_player_with_NO_REALIZED_TOTAL_is_excluded_AND_COUNTED():
    """`rest_of_season_points` omits a player with no weekly rows rather than zeroing
    him, so a preseason-ending injury leaves NO row — while a week-1 injury leaves a
    row of ~0 and is kept. Excluding the first while keeping the second BIASES EVERY
    BAND OPTIMISTIC, and the bias is invisible unless the count is published.
    MUTATION: drop them silently — the calibration looks tighter than reality and
    nothing in the output says how many disappeared."""
    rows = PE.error_rows(board(p("a", "QB", 200.0), p("b", "QB", 180.0)), {"a": 100.0})
    assert [r["player_id"] for r in rows] == ["a"]
    rep = PE.report(board(p("a", "QB", 200.0), p("b", "QB", 180.0)), {"a": 100.0})
    assert rep["ungraded"] == 1, rep
    assert "survivor" in rep["caveat"].lower() or "ungraded" in rep["caveat"].lower()


def test_a_player_who_GENUINELY_SCORED_ZERO_is_kept():
    """The other side of the same line, and it is the downside the whole exercise is
    trying to price. MUTATION: treat 0.0 as missing — every bust drops out and the
    measured spread describes only the players who worked out."""
    rows = PE.error_rows(board(p("a", "QB", 200.0)), {"a": 0.0})
    assert len(rows) == 1 and rows[0]["ratio"] == 0.0


# ── the band ────────────────────────────────────────────────────────────────
def test_the_band_is_PROJECTION_RANK_WITHIN_POSITION_not_overall():
    """A band that is knowable before the draft, and comparable across positions:
    QB3 and RB3 are both 'the third one at his position'. MUTATION: rank overall —
    every TE lands in the same late band as every K and the position term does the
    work the band was supposed to do."""
    b = board(p("a", "QB", 300.0), p("b", "QB", 200.0),
              p("c", "RB", 250.0), p("d", "RB", 150.0))
    rows = PE.error_rows(b, {"a": 1.0, "b": 1.0, "c": 1.0, "d": 1.0})
    ranks = {r["player_id"]: r["proj_rank"] for r in rows}
    assert ranks == {"a": 1, "b": 2, "c": 1, "d": 2}


def test_a_supplied_proj_rank_is_TRUSTED_over_a_recomputed_one():
    """The board may already carry the rank the engine actually used. Recomputing it
    here would silently disagree the moment the engine's ordering changes.
    MUTATION: always recompute — the calibration is fitted on ranks nothing consumed."""
    b = board(p("a", "QB", 100.0, rank=7), p("b", "QB", 300.0, rank=2))
    rows = PE.error_rows(b, {"a": 1.0, "b": 1.0})
    assert {r["player_id"]: r["proj_rank"] for r in rows} == {"a": 7, "b": 2}


# ── the calibration, and its refusal to invent ──────────────────────────────
def test_a_band_with_TOO_FEW_PLAYERS_reports_a_STATUS_not_a_number():
    """THE DANGEROUS ONE, and the same rule as `nflverse_variance`. An sd off two
    players is noise wearing a measurement's clothes, and a consumer pricing off it
    proceeds confidently. MUTATION: emit the number anyway — a two-player band with a
    freak agreement reports sd 0.01 and its players read as the safest on the board."""
    b = board(p("a", "QB", 200.0), p("b", "QB", 180.0))
    cal = PE.calibrate([b], [{"a": 100.0, "b": 90.0}], min_n=10)
    cell = cal["cells"][("QB", PE.band_of(1))]
    assert cell["status"] == "unmeasurable"
    assert cell["sd_ratio"] is None and cell["p90_ratio"] is None


def seven_seasons_of_top_three_qbs(actual_for):
    """Seven bundles x the top three QBs = 21 players in ONE band.

    Deliberately not twenty players in one bundle: ranks 1..20 spread across four
    bands, so the top band held three and nothing was measurable. Stacking seasons
    is also what `calibrate` is actually for.
    """
    bundles, actuals = [], []
    for s in range(7):
        ids = ["s%dq%d" % (s, k) for k in range(3)]
        bundles.append({"season": 2018 + s,
                        "players": [p(pid, "QB", 200.0) for pid in ids]})
        actuals.append({pid: actual_for(s, k) for k, pid in enumerate(ids)})
    return bundles, actuals


def test_the_ceiling_comes_from_a_MEASURED_QUANTILE_not_a_multiplier():
    """`1.35 * proj_mean` makes ceiling rank-identical to value, which is why the
    ceiling weight could never be measured. A p90 of the realized ratio is a real
    upside and it DIFFERS BY BAND. MUTATION: return mean * a constant — the ordering
    collapses back onto proj_mean and the experiment is vacuous again."""
    # twenty at 1.0x, one at 3.0x: the median must not move, the p90 must exist.
    bundles, actuals = seven_seasons_of_top_three_qbs(
        lambda s, k: 600.0 if (s, k) == (6, 2) else 200.0)
    cal = PE.calibrate(bundles, actuals, min_n=5)
    cell = cal["cells"][("QB", PE.band_of(1))]
    assert cell["status"] == "measured" and cell["n"] == 21
    assert cell["p50_ratio"] == 1.0
    assert cell["p90_ratio"] >= 1.0
    assert cell["sd_ratio"] > 0


def test_the_ceiling_BREAKS_RANK_IDENTITY_with_the_mean():
    """THE ASSERTION THAT ACTUALLY BITES, and its absence let a `1.35 * proj_mean`
    mutation survive the p90 test above — that test inspected the CELL and never
    called the applier.

    The defect is not that 1.35 is the wrong constant. It is that ANY constant makes
    `proj_ceiling` a monotone function of `proj_mean`, so ordering by ceiling and
    ordering by value are the same list and `ceiling: 0` in MEASURED_WEIGHTS could
    not have come back any other way. A measured p90 that differs by band must be
    able to INVERT the pair: the lower projection with the fatter tail outranks the
    higher projection with the thin one. MUTATION: any `mean * k` — the inversion
    disappears and the weight goes unmeasurable again."""
    tight, wide = [], []
    for s in range(7):
        tight_ids = ["t%dq%d" % (s, k) for k in range(3)]
        wide_ids = ["w%dq%d" % (s, k) for k in range(5)]
        tight.append({"season": 2018 + s,
                      "players": [p(pid, "QB", 200.0, rank=1 + k)
                                  for k, pid in enumerate(tight_ids)]})
        wide.append({"season": 2018 + s,
                     "players": [p(pid, "QB", 200.0, rank=4 + k)
                                 for k, pid in enumerate(wide_ids)]})
    bundles = tight + wide
    actuals = [{pl["player_id"]: 200.0 for pl in b["players"]} for b in tight]
    for b in wide:
        # a fat upper tail: most at 1.0x, the last one at 2.0x
        actuals.append({pl["player_id"]: (400.0 if i == 4 else 200.0)
                        for i, pl in enumerate(b["players"])})

    cal = PE.calibrate(bundles, actuals, min_n=5)
    top = cal["cells"][("QB", PE.band_of(1))]
    late = cal["cells"][("QB", PE.band_of(5))]
    assert top["status"] == "measured" and late["status"] == "measured"
    assert late["p90_ratio"] > top["p90_ratio"], (top, late)

    # The higher projection sits in the THIN band, the lower one in the FAT band.
    hi_ceiling, st1 = PE.proj_ceiling_for(cal, "QB", 1, 220.0)
    lo_ceiling, st2 = PE.proj_ceiling_for(cal, "QB", 5, 200.0)
    assert st1 == "measured" and st2 == "measured"
    assert 220.0 > 200.0, "the fixture's premise: the thin-band player projects higher"
    assert lo_ceiling > hi_ceiling, (
        "a measured ceiling must be able to invert the mean's ordering; %r vs %r "
        "means it is still a monotone function of proj_mean" % (hi_ceiling, lo_ceiling))


def test_calibrating_ON_a_season_and_applying_it_TO_that_season_is_REFUSED():
    """Fitting the spread on the season being graded is the same leak `usage_shares`
    and `weekly_variance` already refuse. MUTATION: allow it — every backtest reports
    a calibration it could not have had."""
    b = board(p("a", "QB", 200.0))
    try:
        PE.calibrate([b], [{"a": 100.0}], exclude_season=2024)
    except ValueError as e:
        assert "2024" in str(e) and ("exclude" in str(e).lower() or "season" in str(e).lower())
    else:
        raise AssertionError("a calibration must not be fitted on the excluded season")


# ── rule 14: the consumer ships with the producer ──────────────────────────
def test_the_APPLIER_ships_with_the_calibration_and_returns_None_off_a_gap():
    """A calibration nothing applies is a table. And a band we never measured must
    yield None, not a fallback constant — a fallback is how `0.25 * proj_mean` got
    into the board in the first place. MUTATION: fall back to the global sd — every
    unmeasured band silently reads as measured."""
    bundles, actuals = seven_seasons_of_top_three_qbs(lambda s, k: 180.0 + 10 * s + k)
    cal = PE.calibrate(bundles, actuals, min_n=5)
    sd, status = PE.proj_sd_for(cal, "QB", 1, 300.0)
    assert status == "measured" and sd > 0
    sd2, status2 = PE.proj_sd_for(cal, "K", 1, 100.0)
    assert sd2 is None and status2 == "unmeasurable"
