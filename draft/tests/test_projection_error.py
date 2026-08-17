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
sys.path.insert(0, str(HERE.parent))

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
def test_the_calibration_SURVIVES_A_ROUND_TRIP_with_its_own_population(tmp_path):
    """A calibration that only exists in a process is a report. A's board build is in
    another lane and another run, so the number has to land on disk — WITH its field
    population beside it (Cory's standing rule) and its band keys intact.

    THE TRAP THIS CLOSES: the cells are keyed by a TUPLE, and JSON has no tuple. A
    naive dump stringifies the key and the reader gets `"('QB', '1-3')"`, which
    silently matches nothing on lookup — every band reads unmeasurable and the board
    quietly falls back. MUTATION: round-trip through plain json.dumps."""
    bundles, actuals = seven_seasons_of_top_three_qbs(lambda s, k: 180.0 + 10 * s + k)
    cal = PE.calibrate(bundles, actuals, min_n=5)
    p = tmp_path / "cal.json"
    PE.save(cal, path=str(p))

    import json
    d = json.loads(p.read_text())
    assert set(d) >= {"cells", "population", "version"}
    assert d["population"]["fields"]["sd_ratio"]["present"] >= 1

    back = PE.load(str(p))
    sd_a, st_a = PE.proj_sd_for(cal, "QB", 1, 300.0)
    sd_b, st_b = PE.proj_sd_for(back, "QB", 1, 300.0)
    assert (sd_a, st_a) == (sd_b, st_b) == (sd_b, "measured")


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


# ── THE DECLARED CONSTANTS, WHICH NOTHING PINNED ───────────────────────────
#
# Found by pointing the mutation gate at this module because A is weighing the
# 1.28x proj_sd finding RIGHT NOW, and that finding is organised entirely by
# these constants: "17 of 20 cells", "QB33+ 0.617 against a board 0.268". Every
# one of those numbers is a statement about a BAND.
#
# `BAND_EDGES` could be changed to anything and no test noticed — the band test
# above checks `proj_rank` (1, 2, 1, 2) and never calls `band_of`. And the
# thin-cell test passes `min_n=10` explicitly, so the DEFAULT `MIN_N = 8` was
# equally unguarded. Both mutations I aimed at these constants survived, and both
# were mis-aimed at tests that were fine — the gap was that nothing aimed at the
# constants at all.

def test_BAND_EDGES_produce_the_boundaries_the_calibration_is_reported_in():
    """Every cell label in projection_error_calibration.json — and every number I
    routed to A — is a claim about one of these boundaries. MUTATION: move an edge;
    the artifact's cells silently re-partition and 'QB33+' means something else
    while reading identically."""
    assert PE.BAND_EDGES == (3, 8, 16, 32)
    assert [PE.band_of(r) for r in (1, 3)] == ["1-3", "1-3"]
    assert [PE.band_of(r) for r in (4, 8)] == ["4-8", "4-8"]
    assert [PE.band_of(r) for r in (9, 16)] == ["9-16", "9-16"]
    assert [PE.band_of(r) for r in (17, 32)] == ["17-32", "17-32"]
    assert [PE.band_of(r) for r in (33, 400)] == ["33+", "33+"]


def test_the_BOUNDARY_RANKS_land_on_the_side_the_labels_claim():
    """Off-by-one at an edge moves a player between cells and changes both. The
    labels say 1-3 and 4-8, so 3 and 4 must straddle. MUTATION: use `<` where the
    label says inclusive — rank 3 becomes a 4-8 player and every reader trusts the
    label."""
    assert PE.band_of(3) != PE.band_of(4)
    assert PE.band_of(8) != PE.band_of(9)
    assert PE.band_of(16) != PE.band_of(17)
    assert PE.band_of(32) != PE.band_of(33)


def test_an_UNRANKED_player_is_not_quietly_filed_in_the_deepest_band():
    """`33+` is a measurement about deep players; an unknown rank is not one of
    them. MUTATION: return '33+' for None — unranked players silently join the
    band whose calibration is already the least reliable."""
    assert PE.band_of(None) == "unranked"


def test_the_DEFAULT_min_n_is_the_declared_one_and_actually_bites():
    """The thin-cell test above passes min_n=10 explicitly, so the default was
    never exercised. A default of 1 would let `calibrate` emit a one-player cell as
    a measurement, and the artifact A is reading would gain cells that are noise.

    MUTATION: MIN_N = 1 — six players in a band become six measured cells."""
    assert PE.MIN_N == 8
    b = board(*[p("q%d" % i, "QB", 200.0) for i in range(6)])
    cal = PE.calibrate([b], [{"q%d" % i: 100.0 + i for i in range(6)}])
    cell = cal["cells"][("QB", "1-3")]
    assert cell["status"] == "unmeasurable", (
        "three players in the 1-3 band passed the DEFAULT min_n — the default does "
        "not bite and thin cells reach the artifact as measurements")


# ── regenerate()'s no-args entry point: main() must not report success on VOID ──

def test_main_REPORTS_FAILURE_AND_DOES_NOT_SAVE_ON_A_VOID_REGENERATE(monkeypatch, tmp_path):
    """`regenerate()` reaches the network and cannot be exercised for real here
    (egress-blocked in this sandbox, same as every other CI-only fetch this
    session). What IS testable without network: `main()` must not call `save()`
    or report success when `regenerate()` comes back VOID — the same VOID
    discipline every other fetch module in this repo follows.

    MUTATION: drop the `status == "VOID"` check and `main()` calls `save()`
    on a VOID document, writing a calibration artifact that looks measured
    but carries none of the caveats a real VOID would explain."""
    saved = []
    monkeypatch.setattr(PE, "regenerate",
                        lambda: {"status": "VOID", "reason": "no nflverse weekly "
                                                             "data reachable"})
    monkeypatch.setattr(PE, "save", lambda cal, path=None: saved.append(cal))
    rc = PE.main()
    assert rc == 1
    assert saved == [], "a VOID regeneration must never be saved as a calibration"


def test_main_SAVES_AND_SUCCEEDS_on_a_real_regenerate(monkeypatch):
    saved = []
    fake_cal = {"status": "measured", "cells_measured": 5, "cells_unmeasurable": 2,
               "seasons": [2023, 2024, 2025]}
    monkeypatch.setattr(PE, "regenerate", lambda: dict(fake_cal))
    monkeypatch.setattr(PE, "save", lambda cal, path=None: saved.append(cal))
    rc = PE.main()
    assert rc == 0
    assert len(saved) == 1 and saved[0]["seasons"] == [2023, 2024, 2025]


def test_CALIBRATION_SEASONS_MATCHES_THE_REAL_COMMITTED_DRAFTS():
    """Pinned against `league_history.json` directly rather than restated as a
    literal — the three seasons with a real, complete draft on record, checked
    2026-08-17. 2026 is the season being drafted and has no realized outcomes
    yet, so it cannot be a fitting season; asserting that explicitly here is
    what would catch a 2026 entry sneaking into the fit."""
    import json
    from pathlib import Path
    history = json.loads((Path(PE.__file__).resolve().parent.parent
                          / "data" / "league_history.json").read_text())
    complete = sorted(
        int(s["season"]) for s in history.get("seasons", [])
        if any(len(d.get("picks") or []) >= 100 for d in (s.get("drafts") or [])))
    # Every declared calibration season must actually have a complete draft
    # on record, and 2026 (pre_draft, no realized outcomes) must never be one.
    assert set(PE.CALIBRATION_SEASONS).issubset(set(complete))
    assert 2026 not in PE.CALIBRATION_SEASONS


# ── document(): the shape check_artifact_freshness.py's regenerate_command
# must print, extracted so save() and the registry entry share ONE definition
# rather than two that could drift ─────────────────────────────────────────

def test_document_IS_EXACTLY_WHAT_save_WRITES_TO_DISK(tmp_path):
    """⚠ THE WHOLE POINT OF THE REFACTOR. `check_artifact_freshness.py` diffs
    `regenerate_command`'s printed JSON against the COMMITTED FILE — if the
    registry called `regenerate()` directly, it would print calibrate()'s raw
    tuple-keyed cells with no envelope, compare that against save()'s
    string-keyed, enveloped output, and report this artifact stale on every
    single run forever, whether or not it actually is.

    MUTATION: have `save()` build its own dict again instead of calling
    `document()`, and a future edit to one could drift from the other with
    nothing to catch it."""
    import json
    cal = {"cells": {("QB", "1-3"): {"n": 10, "status": "measured",
                                     "sd_ratio": 0.2, "mean_ratio": 1.0,
                                     "p10_ratio": 0.8, "p50_ratio": 1.0,
                                     "p90_ratio": 1.3, "basis": "10 graded"}},
          "seasons": [2023, 2024, 2025], "min_n": 8, "graded": 10, "ungraded": 2,
          "cells_measured": 1, "cells_unmeasurable": 0,
          "caveat": "x", "band_note": "y"}
    path = tmp_path / "cal.json"
    PE.save(cal, path=path)
    on_disk = json.loads(path.read_text())
    assert on_disk == PE.document(cal)


def test_document_KEYS_CELLS_AS_JOINED_STRINGS_not_python_tuples():
    """A tuple key silently serialises to `"('QB', '1-3')"` and `load()`'s
    `partition(KEY_SEP)` would then match nothing on the way back in — every
    band would read `unmeasurable` and nothing would say why."""
    cal = {"cells": {("QB", "1-3"): {"status": "measured"}}}
    doc = PE.document(cal)
    assert list(doc["cells"].keys()) == ["QB" + PE.KEY_SEP + "1-3"]


# ── regenerate()'s fetch guard: a RAISED exception is VOID, never a crash ───

def test_regenerate_CATCHES_A_RAISING_fetch_players_not_a_crash(monkeypatch):
    """⚠ FOUND BY RUNNING THE REAL COMMAND, NOT BY READING THE CODE — twice
    this session now. `sleeper_import.fetch_players()` raises `RuntimeError`
    on failure rather than returning falsy; `regenerate()`'s first version
    called it unguarded and crashed with an uncaught traceback the moment it
    was actually run against the (blocked-here) network, exactly the same
    shape `external_source_projections.py` hit earlier today.

    MUTATION: drop the try/except around `SL.fetch_players()` and this test's
    RuntimeError propagates uncaught instead of a clean VOID."""
    import sleeper_import as SL
    orig = SL.fetch_players
    SL.fetch_players = lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    try:
        cal = PE.regenerate()
    finally:
        SL.fetch_players = orig
    assert cal["status"] == "VOID", cal
    assert "Sleeper player index unreachable" in cal["reason"]
    assert "RuntimeError" in cal["error"]


def test_regenerate_ON_AN_EMPTY_PLAYER_INDEX_IS_ALSO_VOID(monkeypatch):
    import sleeper_import as SL
    orig = SL.fetch_players
    SL.fetch_players = lambda: {}
    try:
        cal = PE.regenerate()
    finally:
        SL.fetch_players = orig
    assert cal["status"] == "VOID"
    assert "unreachable" in cal["reason"]


# ── register 4q: splitting the shipped `33+` band into a SIDE refit ────────

def test_BAND_EDGES_REFIT_V2_SPLITS_the_shipped_33plus_band():
    """The whole point of register 4q. MUTATION: leave BAND_EDGES_REFIT_V2 ==
    BAND_EDGES — the refit would measure the identical cells as production and
    the comparison would show nothing, silently answering "no slope" by
    construction rather than by measurement."""
    assert PE.BAND_EDGES_REFIT_V2 == (3, 8, 16, 32, 48, 72, 100, 150)
    assert PE.BAND_EDGES_REFIT_V2[:4] == PE.BAND_EDGES, (
        "the refit must not also move the 1-3/4-8/9-16/17-32 boundaries — "
        "only 33+ was measured as one band")


def test_band_of_WITH_REFIT_EDGES_splits_33plus_into_five_bands():
    """MUTATION: keep band_of ignoring its `edges` argument — every refit rank
    would still land in '33+' and the split would exist only in the constant,
    never in a single fitted cell."""
    labels = [PE.band_of(r, PE.BAND_EDGES_REFIT_V2)
             for r in (32, 33, 48, 49, 72, 73, 100, 101, 150, 151, 9999)]
    assert labels == ["17-32", "33-48", "33-48", "49-72", "49-72",
                      "73-100", "73-100", "101-150", "101-150",
                      "151+", "151+"]


def test_band_of_with_NO_edges_argument_is_UNCHANGED_from_before_4q():
    """The production path (`regenerate()`'s default call, every existing
    caller) must band exactly as it did before this file grew a second set of
    edges. MUTATION: default `edges` to BAND_EDGES_REFIT_V2 — every existing
    calibration silently re-partitions on its next regeneration."""
    assert [PE.band_of(r) for r in (32, 33, 400)] == ["17-32", "33+", "33+"]


def test_calibrate_WITH_band_edges_PRODUCES_FINER_CELLS_THAN_THE_DEFAULT():
    """Confirms `band_edges` actually reaches `calibrate()` through
    `error_rows()`, not just `band_of()` in isolation. MUTATION: drop the
    `band_edges` plumbing in either function — the refit calibration comes
    back keyed identically to the shipped one and the comparison is a no-op."""
    players = [p("q%d" % i, "QB", 200.0, rank=33 + i) for i in range(20)]
    b = board(*players)
    actual = {"q%d" % i: 100.0 + i for i in range(20)}

    default_cal = PE.calibrate([b], [actual], min_n=5)
    refit_cal = PE.calibrate([b], [actual], min_n=5,
                            band_edges=PE.BAND_EDGES_REFIT_V2)

    assert set(k[1] for k in default_cal["cells"]) == {"33+"}
    refit_bands = set(k[1] for k in refit_cal["cells"])
    assert refit_bands and refit_bands != {"33+"}, refit_bands
    assert refit_bands <= {"33-48", "49-72", "73-100", "101-150", "151+"}


def test_regenerate_refit_v2_CALLS_regenerate_WITH_THE_REFIT_EDGES(monkeypatch):
    """MUTATION: `regenerate_refit_v2` calls `regenerate()` with no arguments
    — it would silently refit on the SAME bands as production and the side
    artifact would be a byte-for-byte duplicate wearing a different filename."""
    seen = {}

    def fake_regenerate(*, band_edges=PE.BAND_EDGES):
        seen["band_edges"] = band_edges
        return {"status": "measured", "cells": {}}

    monkeypatch.setattr(PE, "regenerate", fake_regenerate)
    PE.regenerate_refit_v2()
    assert seen["band_edges"] == PE.BAND_EDGES_REFIT_V2


def test_slope_comparison_REPORTS_EVERY_BAND_EVEN_ONES_ABSENT_FROM_A_SIDE():
    """The comparison must not silently drop a band neither calibration
    measured — a thin new cell has to read as unmeasurable, not vanish from
    the report the way a real gap would if the row were skipped.
    MUTATION: skip a band with no cell instead of emitting an unmeasurable
    placeholder — a genuinely-thin refit band disappears from the comparison
    instead of being shown as evidence for MIN_N doing its job."""
    current = {"cells": {("QB", "33+"): {
        "n": 200, "status": "measured", "sd_ratio": 0.5, "mean_ratio": 1.0,
        "p10_ratio": 0.05, "p90_ratio": 1.317, "basis": "200 graded"}}}
    # Only ONE of the five refit bands is populated — the other four must
    # still appear, reporting unmeasurable rather than being dropped.
    refit = {"cells": {("QB", "33-48"): {
        "n": 50, "status": "measured", "sd_ratio": 0.4, "mean_ratio": 1.0,
        "p10_ratio": 0.1, "p90_ratio": 1.6, "basis": "50 graded"}}}

    cmp = PE.slope_comparison(current, refit)
    assert cmp["current_band_edges"] == list(PE.BAND_EDGES)
    assert cmp["refit_band_edges"] == list(PE.BAND_EDGES_REFIT_V2)

    cur_by_band = {r["band"]: r for r in cmp["current"]}
    assert cur_by_band["33+"]["p90_ratio"] == 1.317
    assert cur_by_band["33+"]["status"] == "measured"
    # The bands ABOVE 33+ that the shipped calibration never had (this
    # position never had, say, a "1-3" entry in this fixture) still appear.
    assert set(cur_by_band) == {"1-3", "4-8", "9-16", "17-32", "33+"}

    # BAND_EDGES_REFIT_V2 covers the FULL rank range (it reuses 3/8/16/32
    # unchanged, per test_BAND_EDGES_REFIT_V2_SPLITS_the_shipped_33plus_band),
    # so all nine of its labels appear — not just the five late ones.
    refit_by_band = {r["band"]: r for r in cmp["refit_v2"]}
    assert set(refit_by_band) == {"1-3", "4-8", "9-16", "17-32",
                                  "33-48", "49-72", "73-100", "101-150", "151+"}
    assert refit_by_band["33-48"]["p90_ratio"] == 1.6
    assert refit_by_band["33-48"]["status"] == "measured"
    for absent_band in ("1-3", "4-8", "9-16", "17-32",
                       "49-72", "73-100", "101-150", "151+"):
        assert refit_by_band[absent_band]["status"] == "unmeasurable"
        assert refit_by_band[absent_band]["n"] == 0


def test_slope_comparison_DOES_NOT_MUTATE_EITHER_INPUT_CALIBRATION():
    """PURE, per its own docstring. MUTATION: sort or annotate `cal["cells"]`
    in place — a caller that reuses `current_cal`/`refit_cal` after this call
    (main_refit_v2 does, feeding both to two different writers) would see a
    different object than it started with."""
    import copy
    current = {"cells": {("QB", "33+"): {"n": 200, "status": "measured",
                                         "sd_ratio": 0.5, "mean_ratio": 1.0,
                                         "p10_ratio": 0.05, "p90_ratio": 1.317,
                                         "basis": "x"}}}
    refit = {"cells": {("QB", "33-48"): {"n": 50, "status": "measured",
                                         "sd_ratio": 0.4, "mean_ratio": 1.0,
                                         "p10_ratio": 0.1, "p90_ratio": 1.6,
                                         "basis": "x"}}}
    before_current, before_refit = copy.deepcopy(current), copy.deepcopy(refit)
    PE.slope_comparison(current, refit)
    assert current == before_current
    assert refit == before_refit


def test_main_refit_v2_NEVER_WRITES_THE_PRODUCTION_CALIBRATION_PATH(monkeypatch, tmp_path):
    """⚠ THE ONE THING THIS MUST NEVER DO. The relay's ask was explicit: "DO NOT
    overwrite the live calibration." MUTATION: have `main_refit_v2` call
    `save(refit)` with no path (or a path equal to `PE.CALIBRATION`) — the
    side refit would silently become the board's production floors/ceilings
    without anyone dispatching the real regeneration workflow."""
    side_cal = tmp_path / "refit.json"
    side_cmp = tmp_path / "cmp.json"
    monkeypatch.setattr(PE, "REFIT_V2_CALIBRATION", side_cal)
    monkeypatch.setattr(PE, "REFIT_V2_COMPARISON", side_cmp)
    monkeypatch.setattr(PE, "load", lambda path=None: {"cells": {}})
    fake_refit = {"status": "measured", "cells": {
        ("QB", "33-48"): {"n": 50, "status": "measured", "sd_ratio": 0.4,
                          "mean_ratio": 1.0, "p10_ratio": 0.1,
                          "p90_ratio": 1.6, "basis": "50 graded"}},
        "seasons": [2023, 2024, 2025], "min_n": 8, "graded": 50, "ungraded": 5,
        "cells_measured": 1, "cells_unmeasurable": 0, "caveat": "x",
        "band_note": "y"}
    monkeypatch.setattr(PE, "regenerate_refit_v2", lambda: dict(fake_refit))

    production_before = PE.CALIBRATION.read_text() if PE.CALIBRATION.exists() else None
    rc = PE.main_refit_v2()
    production_after = PE.CALIBRATION.read_text() if PE.CALIBRATION.exists() else None

    assert rc == 0
    assert production_before == production_after, (
        "main_refit_v2 must never touch the production CALIBRATION file")
    assert side_cal.exists() and side_cmp.exists()
    import json
    assert json.loads(side_cal.read_text())["_side_artifact"] is True


def test_main_refit_v2_REPORTS_FAILURE_ON_A_VOID_REFIT(monkeypatch, tmp_path):
    """Same VOID discipline as `main()` — a failed refit must not write a
    side artifact that looks measured. MUTATION: drop the status check — a
    VOID refit writes an empty-looking-valid comparison file instead of
    failing loudly."""
    side_cal = tmp_path / "refit.json"
    side_cmp = tmp_path / "cmp.json"
    monkeypatch.setattr(PE, "REFIT_V2_CALIBRATION", side_cal)
    monkeypatch.setattr(PE, "REFIT_V2_COMPARISON", side_cmp)
    monkeypatch.setattr(PE, "load", lambda path=None: {"cells": {}})
    monkeypatch.setattr(PE, "regenerate_refit_v2",
                        lambda: {"status": "VOID", "reason": "no egress"})
    rc = PE.main_refit_v2()
    assert rc == 1
    assert not side_cal.exists()
    assert not side_cmp.exists()
