# TERRITORY: C
"""PROJECTION-VS-ACTUAL, MEASURED — where a real proj_sd and proj_ceiling come from.

Items 1 and 3 of A's ingest brief, and they are the same instrument. `build_bundle`
writes `proj_sd = 0.25 * proj_mean` and `proj_ceiling = 1.35 * proj_mean`. Both are
constants, so spread is a fixed multiple of the mean, `proj_ceiling` is
RANK-IDENTICAL to `proj_mean`, and `ceiling: 0` in MEASURED_WEIGHTS is an experiment
that could not have returned anything else. Risk is PARTIAL for the same reason.

**CORRECTED 2026-08-17: `build_bundle.py` NO LONGER WRITES THOSE CONSTANTS.** The paragraph above describes the state this module was written into and is kept because it is the reason the module exists. Dispersion on a bundle is now the measured p90/p10/sd per (position, band), fitted leave-one-season-out, and absent off an unmeasured cell rather than filled in. The collinearity is REDUCED, NOT REMOVED — the measured spread is still `proj_mean x a per-CELL` constant, varying between bands and not within them — so `ceiling: 0` remains UNMEASURED rather than refuted, and the experiment is runnable for the first time. See draft/backtest/HARNESS-DISPERSION-PREREG.md.

WHY THIS AND NOT WEEKLY VARIANCE — they are different risks and only one is the
drafter's. `nflverse_variance` measures IN-SEASON VOLATILITY: how much a player
bounces week to week, given how his season went. This measures ESTIMATION ERROR: how
wrong the preseason number was. A player projected 200 who finishes 120 cost his
drafter 80 points whether he got there smoothly or not, and for a season-long hold
that error dominates. Nothing in the pipeline measures it. Both belong on the board;
neither substitutes for the other.

THE BAND HAS TO BE KNOWABLE BEFORE THE DRAFT. A's brief says "by ADP band". We hold
no archived ADP before 2026-08-09 and a retroactive fetch leaks (exp33), so there is
no historical ADP to fit on. Realized draft pick would fit but could never be
APPLIED — a 2026 player has no pick number until he is picked. PROJECTION RANK WITHIN
POSITION both fits historically and applies prospectively, so that is the band, and
it is called `proj_rank_band` rather than `adp_band` because it is not ADP.

THE BIAS THIS CANNOT REMOVE, ONLY PUBLISH. `rest_of_season_points` omits a player
with no weekly rows rather than zeroing him — correctly, because absent is not zero.
But that means a player whose season ended in AUGUST leaves no row and drops out,
while one whose season ended in WEEK 1 leaves a row near zero and is kept. Every band
is therefore fitted on players who at least reached the field, and every band's
spread is OPTIMISTIC by an amount this instrument cannot measure from inside. So the
excluded count travels with the calibration and the caveat is written into the
output, because a bias you can name is a different object from one you cannot see.

A RATIO, NOT POINTS. An sd fitted on 300-point QBs cannot be applied to a 90-point
TE2. The ratio `actual / projected` is scale-free and transfers; `proj_sd` is then
`proj_mean * sd_ratio` at application time.

AND A THIN BAND REPORTS A STATUS, NOT A NUMBER — the same rule as `nflverse_variance`
and for the same reason. An sd off two players is noise wearing a measurement's
clothes, and a consumer pricing off it proceeds confidently.
"""
from __future__ import annotations

import os

from pathlib import Path
from statistics import pstdev

import field_population as FP

#: Rank edges WITHIN a position, declared rather than tuned. They are round numbers
#: chosen to match how a roster is actually filled — the starter, the flex-worthy
#: second, the bench, the dart — not fitted to make any band look tight.
BAND_EDGES = (3, 8, 16, 32)

# ── OVERRIDABLE SO THE BAND SPLIT CAN BE MEASURED WITHOUT EDITING THIS FILE ──
#
# Added 2026-08-17 (relay, register 4q). Measured: these four edges put
# **935 of 1,304 graded players into a single `33+` cell per position** while
# ranks 1-32 get four bands (36 / 59 / 94 / 180). Ranks 33 to 300+ therefore
# share one number — which is every player Cory drafts from round 4 on — and
# inside a cell `proj_ceiling` is a constant multiple of `proj_mean`. That is
# the mechanism behind the board telling him a round-12 flier has
# proportionally LESS upside than a first-rounder (median ceiling/mean by ADP
# band: 1.640 -> 1.506 -> 1.434 -> 1.434 -> 1.434 -> 1.317).
#
# THE OVERRIDE EXISTS SO THE FIX CAN BE MEASURED BEFORE IT IS BELIEVED. The
# refit has to run where Sleeper is reachable (Actions; the sandbox gets a 403),
# and a workflow cannot vary a module constant. Rather than edit this file for
# an experiment, `PROJECTION_BAND_EDGES=3,8,16,32,48,72,100,150` sets it for one
# run, into a SIDE artifact, so the live calibration is untouched until someone
# has seen both slopes side by side.
#
# DEFAULT IS COMPLETELY UNCHANGED. Absent or unparseable env var -> the four
# edges above, exactly as before. Same reversibility pattern as
# DRAFT_PICK_LOG_PATH and PRE_DRAFT_FREEZE_PATH: it makes the experiment
# possible, not the change easy.
#
# MIN_N below still governs. A split that over-reaches degrades a thin cell to
# `unmeasurable` rather than to a confident wrong number — which is why finer
# edges are safe to TRY even though shipping them is Cory's call.
_edges_env = os.environ.get("PROJECTION_BAND_EDGES", "").strip()
if _edges_env:
    try:
        _parsed = tuple(int(x) for x in _edges_env.split(",") if x.strip())
        if _parsed and list(_parsed) == sorted(set(_parsed)) and _parsed[0] > 0:
            BAND_EDGES = _parsed
    except ValueError:
        pass  # keep the declared edges; a typo must never silently reband the model

#: Below this many graded players a band reports `unmeasurable` rather than a number.
MIN_N = 8

#: The only positions this league rosters and scores. The calibration is a claim
#: about how OUR projections miss for OUR players; a punter in the population is
#: not a small impurity, it is a different question being answered.
ROSTERED_POSITIONS = ("QB", "RB", "WR", "TE")

#: C's name for the same tuple (their only_positions API, merged 2026-08-18) —
#: one definition, two names, both fixes kept as defense in depth.
CALIBRATION_POSITIONS = ROSTERED_POSITIONS

#: Register 4q, 2026-08-17: `BAND_EDGES` puts 935 of 1,304 graded players — 72%,
#: every player Cory drafts from round 4 on — into ONE band per position, "33+".
#: Inside that cell `proj_ceiling` is a constant multiple of `proj_mean` by
#: construction, which is the mechanism behind both register 4j and 4p. This is
#: the relay's specified split of that one band, for a SIDE refit only —
#: `BAND_EDGES` itself is UNCHANGED and stays what `regenerate()`/`main()` fit and
#: ship by default. Whether the refit ships is Cory's call: it moves ceiling,
#: floor, the bench branch, `champodds` and the money proxy four days before his
#: draft. See `regenerate_refit_v2()`, `slope_comparison()`, DEFECT-REGISTER.md
#: row 4q.
BAND_EDGES_REFIT_V2 = (3, 8, 16, 32, 48, 72, 100, 150)

CALIBRATION_VERSION = "projection-error/v1"

SURVIVOR_CAVEAT = (
    "OPTIMISTIC BY AN UNMEASURED AMOUNT. Players with no weekly rows at all are "
    "excluded (a season that ended before week 1 leaves nothing to grade), while a "
    "player who broke down in week 1 is kept near zero. Every band here is therefore "
    "fitted on players who reached the field — survivorship, and it biases the spread "
    "tighter than reality. `ungraded` is the size of the excluded set.")


def band_of(rank, band_edges=BAND_EDGES) -> str:
    """The band label for a within-position projection rank."""
    if rank is None:
        return "unranked"
    # Callers thread band_edges as an explicit None (regenerate(band_edges=None)
    # → calibrate → error_rows), which BYPASSES the parameter default — this
    # killed calibration run #4 in CI with a NoneType iteration.
    if not band_edges:
        band_edges = BAND_EDGES
    r = int(rank)
    lo = 1
    for hi in band_edges:
        if r <= hi:
            return "%d-%d" % (lo, hi)
        lo = hi + 1
    return "%d+" % lo


def _players_of(bundle):
    if isinstance(bundle, dict):
        return list(bundle.get("players") or [])
    return list(bundle or [])


def error_rows(bundle, actual: dict, *, positions=None, band_edges=BAND_EDGES, only_positions=None) -> list:
    """One row per player carrying BOTH a projection and a realized total.

    A player the projection covered but the season did not grade is EXCLUDED here and
    COUNTED in `report()` — see the module docstring; the exclusion is the bias, and
    hiding it is what would make the calibration wrong rather than merely limited.
    """
    rows = []
    players = _players_of(bundle)
    # C's INPUT-population filter (only_positions), kept beside the parallel
    # session's _rostered_only bundle wrapper: either alone stops the punter
    # contamination; together a forgetful caller on either path is still safe.
    # `positions=` remains what it always was — a fallback MAP for rows missing
    # a position — and is deliberately NOT overloaded (that misread shipped two
    # inert fixes; see _rostered_only's docstring).
    if only_positions:
        allowed = {str(x).upper() for x in only_positions}
        players = [p for p in players
                   if (p.get("position") or (positions or {}).get(str(p.get("player_id")), "")).upper() in allowed]

    # Rank within position, from the board's own ordering where it has one. A
    # recomputed rank would silently disagree with the one the engine consumed the
    # moment its ordering changes, and the calibration would be fitted on a band
    # nothing uses.
    by_pos = {}
    for pl in players:
        pos = pl.get("position") or (positions or {}).get(str(pl.get("player_id")))
        by_pos.setdefault(pos, []).append(pl)
    computed = {}
    for pos, group in by_pos.items():
        ordered = sorted(group, key=lambda x: -(float(x.get("proj_mean") or 0.0)))
        for i, pl in enumerate(ordered):
            computed[id(pl)] = i + 1

    for pl in players:
        pid = str(pl.get("player_id"))
        if pid not in actual:
            continue
        pos = pl.get("position") or (positions or {}).get(pid)
        mean = float(pl.get("proj_mean") or 0.0)
        act = float(actual[pid])
        rank = pl.get("proj_rank")
        rank = int(rank) if rank is not None else computed.get(id(pl))
        # NO DENOMINATOR, NO RATIO. Returning 0.0 here would read as a total bust and
        # drag the whole band down; raising would take out the calibration over one
        # unprojected player. The absolute error is still a fact and is kept.
        ratio = round(act / mean, 6) if mean else None
        rows.append({"player_id": pid, "position": pos, "proj_mean": mean,
                     "actual": act, "error": round(act - mean, 4), "ratio": ratio,
                     "proj_rank": rank, "band": band_of(rank, band_edges)})
    return rows


def report(bundle, actual: dict, *, positions=None, only_positions=None) -> dict:
    """Coverage of one season's grade, with the excluded set named rather than lost."""
    players = _players_of(bundle)
    if only_positions:
        allowed = {str(x).upper() for x in only_positions}
        players = [pl for pl in players
                   if (pl.get("position") or (positions or {}).get(str(pl.get("player_id")), "")).upper() in allowed]
    rows = error_rows(bundle, actual, positions=positions, only_positions=only_positions)
    graded = len(rows)
    total = len(players)
    return {"season": bundle.get("season") if isinstance(bundle, dict) else None,
            "on_board": total, "graded": graded, "ungraded": total - graded,
            "no_ratio": sum(1 for r in rows if r["ratio"] is None),
            "caveat": SURVIVOR_CAVEAT}


def _q(sorted_vals, p):
    """Linear-interpolated quantile. Small samples are the normal case here, so the
    method is stated rather than inherited from whatever numpy is installed."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    i = p * (len(sorted_vals) - 1)
    lo = int(i)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = i - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def calibrate(bundles, actuals, *, min_n=MIN_N, exclude_season=None, band_edges=BAND_EDGES,
              positions=None, only_positions=None) -> dict:
    """Fit the error distribution per (position, band) across seasons.

    `exclude_season` REFUSES a bundle from that season. A spread fitted on the season
    being graded is the same leak `usage_shares` and `weekly_variance` already refuse:
    the backtest would report a calibration it could not have held on draft day.
    """
    bundles = list(bundles or [])
    actuals = list(actuals or [])
    if len(bundles) != len(actuals):
        raise ValueError("calibrate needs one actual map per bundle: %d vs %d"
                         % (len(bundles), len(actuals)))

    if exclude_season is not None:
        for b in bundles:
            s = b.get("season") if isinstance(b, dict) else None
            if s is not None and str(s) == str(exclude_season):
                raise ValueError(
                    "calibrate was handed season %s, which is the excluded season. A "
                    "spread fitted on the season being graded is foreknowledge the "
                    "drafter did not have." % exclude_season)

    buckets, seasons_used, ungraded = {}, [], 0
    for b, act in zip(bundles, actuals):
        s = b.get("season") if isinstance(b, dict) else None
        if s is not None:
            seasons_used.append(s)
        rep = report(b, act, positions=positions, only_positions=only_positions)
        ungraded += rep["ungraded"]
        for r in error_rows(b, act, only_positions=only_positions, positions=positions, band_edges=band_edges):
            if r["ratio"] is None:
                continue
            buckets.setdefault((r["position"], r["band"]), []).append(r["ratio"])

    cells = {}
    for key, vals in buckets.items():
        vs = sorted(vals)
        n = len(vs)
        if n < int(min_n):
            # A NUMBER HERE WOULD BE A CLAIM WE CANNOT MAKE. Two players who happen to
            # agree report sd 0.01, and their whole band reads as the safest on the
            # board — the exact shape of the 0.0-variance failure.
            cells[key] = {"n": n, "status": "unmeasurable",
                          "sd_ratio": None, "mean_ratio": None, "p10_ratio": None,
                          "p50_ratio": None, "p90_ratio": None,
                          "basis": "only %d graded player(s); min_n is %d" % (n, min_n)}
            continue
        cells[key] = {"n": n, "status": "measured",
                      "sd_ratio": round(float(pstdev(vs)), 6),
                      "mean_ratio": round(sum(vs) / n, 6),
                      "p10_ratio": round(_q(vs, 0.10), 6),
                      "p50_ratio": round(_q(vs, 0.50), 6),
                      "p90_ratio": round(_q(vs, 0.90), 6),
                      "basis": "%d graded players" % n}

    measured = sum(1 for c in cells.values() if c["status"] == "measured")
    return {"version": CALIBRATION_VERSION, "cells": cells,
            "seasons": seasons_used, "min_n": int(min_n),
            "cells_measured": measured, "cells_unmeasurable": len(cells) - measured,
            "graded": sum(len(v) for v in buckets.values()), "ungraded": ungraded,
            "caveat": SURVIVOR_CAVEAT,
            "band_note": "Bands are PROJECTION RANK WITHIN POSITION, not ADP. We hold "
                         "no archived ADP before 2026-08-09 and a retroactive fetch "
                         "leaks (exp33); a realized pick number cannot be known before "
                         "the draft it comes from."}


#: Lives in draft/backtest/, NOT draft/data/ — draft/data is A's (config and seed
#: data) and this is a measurement produced in this lane. Same home as the August
#: unprojected snapshot, for the same reason.
CALIBRATION = Path(__file__).resolve().parent / "projection_error_calibration.json"

#: What a cell is SUPPOSED to carry, declared rather than derived — the same reason
#: D3 declares SNAPSHOT_FIELDS. A statistic that stops being written must show up as
#: empty rather than simply ceasing to exist.
CELL_FIELDS = ["position", "band", "n", "status", "sd_ratio", "mean_ratio",
               "p10_ratio", "p50_ratio", "p90_ratio", "basis"]

#: The on-disk key separator. Cells are keyed by a TUPLE and JSON has no tuple, so
#: the key is flattened explicitly rather than left to `json.dumps` — which would
#: write `"('QB', '1-3')"` and silently match nothing on the way back in. Every band
#: would then read `unmeasurable` and the board would fall back without a word.
KEY_SEP = "|"


def document(cal: dict) -> dict:
    """The ON-DISK shape, as a dict — PURE, and the single definition of it.

    ⚠ EXTRACTED FROM `save()` SO THE FRESHNESS REGISTRY HAS SOMETHING TO CALL.
    `check_artifact_freshness.py` runs `regenerate_command`, expects it to
    PRINT the fresh document as JSON, and diffs that print against the
    COMMITTED file — not against whatever `calibrate()` returns internally.
    `calibrate()`'s cells are keyed by TUPLE (JSON has no tuple key) and carry
    no `_territory`/`_note`/`population` envelope; the committed file's cells
    are `KEY_SEP`-joined strings inside that envelope. Registering
    `regenerate()`'s raw return as the check would diff two different shapes
    forever and report this artifact stale on every run regardless of whether
    it actually is — a false alarm is the same bug class as a suppressed one.
    `save()` and the registry entry now both call this, so there is one
    definition of the shape rather than two that could drift (rule 11).
    """
    rows = [dict(v, position=k[0], band=k[1]) for k, v in (cal.get("cells") or {}).items()]
    rows.sort(key=lambda r: (str(r["position"]), str(r["band"])))
    return {
        "_territory": "TERRITORY: C — produced by draft/backtest/projection_error.py",
        "_note": "Measured projection error by position and PROJECTION RANK BAND. "
                 "Apply with projection_error.proj_sd_for / proj_ceiling_for — a band "
                 "with status `unmeasurable` returns None, and None must stay None: a "
                 "fallback constant is how 0.25 * proj_mean reached the board.",
        "version": cal.get("version", CALIBRATION_VERSION),
        "seasons": cal.get("seasons"), "min_n": cal.get("min_n"),
        "graded": cal.get("graded"), "ungraded": cal.get("ungraded"),
        "cells_measured": cal.get("cells_measured"),
        "cells_unmeasurable": cal.get("cells_unmeasurable"),
        "caveat": cal.get("caveat"), "band_note": cal.get("band_note"),
        "cells": {KEY_SEP.join((str(k[0]), str(k[1]))): v
                  for k, v in (cal.get("cells") or {}).items()},
        "population": FP.of_records(rows, fields=CELL_FIELDS),
    }


def save(cal: dict, path=None) -> None:
    """Write the calibration where another lane and another run can read it.

    WITH ITS FIELD POPULATION, per Cory's standing rule: a `sd_ratio` column at 0%
    sitting in the manifest is what makes a reader ask why before concluding the
    method produces nothing.
    """
    import json

    p = Path(path or CALIBRATION)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(document(cal), indent=2) + "\n")


#: Seasons with a real, complete draft on record — the population `calibrate`
#: fits on. Matches `league_history.json` exactly (checked 2026-08-17): 2023,
#: 2024, 2025 each carry a 150-pick complete draft; 2026 is the season being
#: drafted and has no realized outcomes yet, so it cannot be a fitting season.
CALIBRATION_SEASONS = (2023, 2024, 2025)


def _rostered_only(bundle):
    """Drop every player at a position this league does not roster.

    ⚠️ THIS IS THE REAL FIX, AND MY FIRST TWO WERE NOT FIXES AT ALL.
    I passed `positions=("QB","RB","WR","TE")` to `calibrate()` twice — once
    here and once in cli.py — and shipped a guard asserting that string appeared
    in the source. Both were inert. **`positions` is a player_id -> position
    MAP**, a fallback for rows that carry no `position` field
    (`pl.get("position") or (positions or {}).get(pid)`), so for real rows the
    `or` short-circuits and the argument is never read. The regeneration
    dispatched at 00:37Z came back byte-identical: 910 graded, punters intact.

    A test that asserts a string exists in a file is not a test of behaviour.
    That is the defect class this repo is full of, committed by the person
    cataloguing it.

    So the filter is applied to the POPULATION, where it cannot be misread: a
    row whose position is not rostered never reaches the fit.
    """
    players = [p for p in (bundle.get("players") or [])
               if (p.get("position") or "").upper() in ROSTERED_POSITIONS]
    out = dict(bundle)
    out["players"] = players
    return out


def regenerate(band_edges=None) -> dict:  # pragma: no cover  (egress; CI only)
    """The no-args entry point `artifact_registry.json` calls. Assembles real
    bundles + actuals for `CALIBRATION_SEASONS` and fits `calibrate()` on all
    of them, `exclude_season=None` — this is the PRODUCTION calibration
    applied to 2026, not a leave-one-out skill test, so nothing is held out.

    ⚠ REUSES `cli.py`'s SEASON-ASSEMBLY MACHINERY RATHER THAN RE-DERIVING IT.
    `cli.py` already builds exactly this shape of bundle+actual pair, per
    season, with leak-free `AsOfDataStore` semantics, era-appropriate ADP
    (`adp.build_adp_table` through the AsOf adapter, not today's board), and
    the weekly-stats-with-pbp-fallback recovery for seasons `import_weekly_
    data` 404s on. Rebuilding that from scratch here would be a second
    definition of "how do you get a leak-free historical bundle" — exactly
    the two-places-that-drift shape rule 11 warns about — so this imports and
    calls the same functions `cli.py` calls, in the same order, rather than
    inventing a parallel path. Nothing in `cli.py`, `asof.py`, `build_bundle
    .py`, `adp.py`, `sleeper_import.py` or `grade.py` is edited to make this
    work — all of them are TERRITORY: A or shared/core, called read-only.

    ⚠ NOT RUN AS PART OF THIS COMMIT, DELIBERATELY. Registering the artifact
    is what makes its staleness visible; regenerating it moves every
    `proj_ceiling` and `proj_floor` on the board, and the no-change-before-
    08-22 rule holds regardless of what unblocks it. `main()` below is the
    entry point CI (or a human, after the 22nd) invokes.
    """
    import sys as _sys
    from pathlib import Path as _Path
    root = _Path(__file__).resolve().parent.parent
    for p in (str(root), str(root / "backtest")):
        if p not in _sys.path:
            _sys.path.insert(0, p)

    import pandas as pd
    import nfl_data_py as nfl
    import adp as ADP
    import sleeper_import as SL
    from backtest.asof import AsOfDataStore
    from backtest import build_bundle as BB
    from backtest import grade as GR

    history = __import__("json").loads(
        (root / "data" / "league_history.json").read_text())

    # ⚠ `SL.fetch_players()` RAISES ON FAILURE, NOT A FALSY RETURN — verified
    # live against the real (blocked-here) network before this guard existed:
    # it crashed with an uncaught RuntimeError instead of ever reaching a VOID
    # return. Same finding, same fix, as external_source_projections.py
    # earlier this session — two separate modules made the same wrong
    # assumption about the same function, which is exactly why this is
    # checked again here rather than trusted from having been checked once.
    try:
        players_raw = SL.fetch_players()
    except Exception as exc:                                # noqa: BLE001
        return {"status": "VOID", "reason": "Sleeper player index unreachable "
                                            "— a fact about the runner, not "
                                            "about any historical season",
               "error": "%s: %s" % (type(exc).__name__, exc)}
    if not players_raw:
        return {"status": "VOID", "reason": "Sleeper player index unreachable "
                                            "— a fact about the runner, not "
                                            "about any historical season"}
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"),
                     "position": p.get("position"), "team": p.get("team"),
                     "age": p.get("age"), "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception:                                       # noqa: BLE001
        ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)

    need = sorted({y for s in CALIBRATION_SEASONS for y in (s - 2, s - 1, s)}
                 & set(range(2018, 2027)))
    frames, missing = [], []
    for y in need:
        try:
            frames.append(nfl.import_weekly_data([y]))
        except Exception:                                   # noqa: BLE001
            missing.append(y)
    if not frames:
        return {"status": "VOID", "reason": "no nflverse weekly data reachable "
                                            "for any needed season"}
    weekly = pd.concat(frames, ignore_index=True)

    # SAME PBP-RECOVERY GATE cli.py USES: rebuild only what the library 404s
    # on, and only after a same-mechanism season agrees within rounding.
    if missing:
        have = sorted(set(need) - set(missing))
        control = have[-1] if have else None
        if control is not None:
            try:
                pbp = nfl.import_pbp_data(
                    sorted(set(missing) | {control}), downcast=True)
            except Exception:                                # noqa: BLE001
                pbp = None
            if pbp is not None:
                scoring_for_xval = __import__("json").loads(
                    (root / "config" / "league_config.json").read_text())["scoring"]
                xval = GR.cross_validate(pbp, weekly, control, scoring_for_xval, crosswalk)
                if xval.get("agrees"):
                    rebuilt = GR.weekly_from_pbp(pbp, missing)
                    if rebuilt:
                        weekly = pd.concat([weekly, pd.DataFrame(rebuilt)],
                                           ignore_index=True)

    def _adp(fmt, teams, year):
        table = ADP.build_adp_table(players_raw, fmt=fmt, teams=teams,
                                    year=year, strict_top_n=10 ** 9)
        return {"players": [{"sleeper_id": pid, "adp": r["adp"]}
                            for pid, r in table["adp"].items()]}

    bundles, actual, skipped = [], [], []
    for season in CALIBRATION_SEASONS:
        store = AsOfDataStore(season, history, adp_loader=_adp)
        try:
            bundle, _notes = BB.build(store, players_meta=players_meta,
                                      weekly_df=weekly, crosswalk=crosswalk,
                                      prior_seasons=[season - 2, season - 1])
        # ⚠ `SystemExit` TOO, NOT JUST `Exception` — `_adp` above calls
        # `ADP.build_adp_table`, which `raise SystemExit`s on a broken
        # accounting identity (confirmed this session: SystemExit is a
        # BaseException, `except Exception` does not catch it). A bare
        # `except Exception` here would let one season's ADP defect kill the
        # whole regeneration instead of skipping that season and continuing.
        except (Exception, SystemExit) as exc:              # noqa: BLE001
            skipped.append({"season": season, "reason":
                           "%s: %s" % (type(exc).__name__, exc)})
            continue
        cfg = store.league_config()
        act = GR.rest_of_season_points(weekly, season, cfg["scoring"], crosswalk)
        if not act:
            # ── 4s: WE HOLD THIS SEASON — DO NOT THROW IT AWAY ──────────────
            # The live nfl.import_weekly_data fetch failed silently for a
            # season whose graded points ALREADY SIT COMMITTED in
            # nflverse_weekly_points_<season>.json (the store every other
            # study grades against). 2025 was dropped exactly this way and
            # the artifact reported success with the most relevant season
            # missing. The store carries {week -> {points: {pid: pts}}} under
            # OUR scoring; summing weeks IS the season-total actual this loop
            # wants. The store's known zero-point-row drop (884 player-weeks
            # in 2025) is harmless HERE: a dropped zero contributes zero to a
            # sum. A season with neither a live fetch NOR a committed store
            # still skips — loudly, and persisted (part 2 below).
            store_path = _Path(__file__).resolve().parent / (
                "nflverse_weekly_points_%d.json" % season)
            if store_path.exists():
                doc = __import__("json").loads(store_path.read_text())
                totals = {}
                for wk in doc.get("weeks") or []:
                    for pid, pts in (wk.get("points") or {}).items():
                        totals[str(pid)] = totals.get(str(pid), 0.0) + float(pts)
                if totals:
                    act = totals
                    skipped.append({"season": season, "reason":
                                   "live weekly fetch empty — graded from the "
                                   "COMMITTED points store instead (4s)",
                                   "recovered": True})
        if not act:
            skipped.append({"season": season, "reason": "nothing gradeable"})
            continue
        bundles.append(_rostered_only(bundle))
        actual.append(act)

    if not bundles:
        return {"status": "VOID", "reason": "no season produced both a "
                                            "bundle and a gradeable actual "
                                            "set", "skipped": skipped}

    # ⚠️ THIS IS THE CALL THAT PRODUCED THE CONTAMINATED ARTIFACT.
    #
    # `calibrate()` -> `error_rows(..., positions=None)` means NO FILTER, and
    # `projection-error-calibration.yml` runs THIS module directly (not cli.py).
    # The 2026-08-17 22:11 regeneration therefore fitted the artifact behind
    # every proj_ceiling / proj_floor / proj_sd on P (punters) 9, DB 4, LB 1,
    # T 1 and FB 20 — none of which this league rosters — while the skill
    # positions lost ~30% of their graded players (QB 186->134, RB 335->215,
    # WR 497->336, TE 286->190; graded 1,304->910) and 15 of 32 cells stopped
    # being measurable.
    #
    # The relay fixed cli.py first and MISSED THIS ONE, which is the path the
    # workflow actually takes — a filter on the wrong call site is a fix that
    # feels done and changes nothing. Register 4r.
    cal = calibrate(bundles, actual, exclude_season=None, band_edges=band_edges,
                    only_positions=CALIBRATION_POSITIONS)
    # ── 4s: A DROPPED SEASON MUST LEAVE A TRACE. calibrate()'s dict is what
    # gets serialised, so the skip record is attached HERE, before save() —
    # the previous code assigned it to a variable the artifact never saw. An
    # entry with "recovered": True documents a live-fetch failure that the
    # committed store absorbed; one without it is a season genuinely absent.
    cal["skipped_seasons"] = skipped
    return cal


def main() -> int:  # pragma: no cover  (egress; CI only)
    cal = regenerate()
    if cal.get("status") == "VOID":
        print("VOID — %s" % cal.get("reason"))
        return 1
    save(cal)
    print("measured %d/%d cells over seasons %s; wrote %s"
         % (cal.get("cells_measured", 0),
            cal.get("cells_measured", 0) + cal.get("cells_unmeasurable", 0),
            cal.get("seasons"), CALIBRATION.name))
    return 0


def load(path=None) -> dict:
    """Read a saved calibration back into the shape `proj_sd_for` consumes."""
    import json

    p = Path(path or CALIBRATION)
    if not p.exists():
        return {"version": CALIBRATION_VERSION, "cells": {}}
    d = json.loads(p.read_text())
    cells = {}
    for k, v in (d.get("cells") or {}).items():
        pos, _, band = str(k).partition(KEY_SEP)
        cells[(pos, band)] = v
    return dict(d, cells=cells)


def _cell(cal, position, rank):
    return (cal.get("cells") or {}).get((position, band_of(rank)))


def proj_sd_for(cal, position, rank, proj_mean):
    """`(sd, status)` for one player — the applier, shipped with the calibration.

    Returns `(None, "unmeasurable")` off a band we never measured. NO FALLBACK TO A
    GLOBAL CONSTANT: a fallback is exactly how `0.25 * proj_mean` reached the board,
    and a consumer cannot tell a fitted number from a filled-in one.
    """
    c = _cell(cal, position, rank)
    if not c or c["status"] != "measured" or c["sd_ratio"] is None:
        return None, "unmeasurable"
    return round(float(proj_mean or 0.0) * c["sd_ratio"], 3), "measured"


def proj_floor_for(cal, position, rank, proj_mean):
    """`(floor, status)` from the MEASURED p10 of the realized ratio.

    EXACT SIBLING of proj_ceiling_for, added 2026-08-17 (TERRITORY A addition to
    a TERRITORY C module, mirroring an existing function rather than inventing a
    shape). It existed for the ceiling and not the floor, so the floor went on
    being `mean - 0.674*sd` — a symmetric Gaussian over a distribution this same
    calibration measures as violently ASYMMETRIC.

    The error is larger than the ceiling's and runs the same direction: measured
    against the 20 cells, the Gaussian floor is off by more than 0.15 of the
    projection in SIXTEEN of them, and the deep bands are not close. A WR ranked
    33+ is told his floor is 0.656 x projection; the measured 10th percentile is
    0.049 — essentially zero. QB|33+ is told 0.584 against a measured -0.001.

    That is what made late-round fliers look SAFE. The same formula inflated
    their ceilings, so the board flattered deep players on BOTH tails at once.
    """
    c = _cell(cal, position, rank)
    if not c or c["status"] != "measured" or c.get("p10_ratio") is None:
        return None, "unmeasurable"
    return round(float(proj_mean or 0.0) * c["p10_ratio"], 3), "measured"


def proj_ceiling_for(cal, position, rank, proj_mean):
    """`(ceiling, status)` from the MEASURED p90 of the realized ratio.

    `1.35 * proj_mean` made the ceiling a monotone function of the mean, so ordering
    by ceiling and ordering by value were the same list and the ceiling weight could
    never have been measured. A p90 that differs by band breaks that tie for real.
    """
    c = _cell(cal, position, rank)
    if not c or c["status"] != "measured" or c["p90_ratio"] is None:
        return None, "unmeasurable"
    return round(float(proj_mean or 0.0) * c["p90_ratio"], 3), "measured"




#: Side artifacts only — NEVER the production `CALIBRATION` path `save()`
#: defaults to. Register 4q.
REFIT_V2_CALIBRATION = Path(__file__).resolve().parent / "projection_error_calibration_refit_v2.json"
REFIT_V2_COMPARISON = Path(__file__).resolve().parent / "projection_error_refit_v2_comparison.json"


def regenerate_refit_v2() -> dict:  # pragma: no cover  (egress; CI only)
    """Register 4q's refit. Calls `regenerate()` wholesale with the split-band
    edges rather than a second season-assembly path — the same
    two-places-that-drift shape this file already warns about (rule 11)."""
    return regenerate(band_edges=BAND_EDGES_REFIT_V2)

def slope_comparison(current_cal: dict, refit_cal: dict) -> dict:
    """PURE. Places the SHIPPED ceiling/floor ratio for each `BAND_EDGES` band
    beside the REFIT's finer bands that split it, so register 4q's question —
    is the ratio actually flat inside `33+`, or does the one cell hide a real
    slope — has a number instead of an argument.

    Both `current_cal` and `refit_cal` are the tuple-keyed shape `calibrate()`
    /`load()` return, not `document()`'s on-disk envelope. A band absent from
    either calibration reports as `unmeasurable, n=0` rather than being
    dropped, so a thin new band cannot silently disappear from the
    comparison — the same rule `calibrate()` itself applies to a thin cell.
    """
    def _band_labels(edges):
        labels, lo = [], 1
        for hi in edges:
            labels.append("%d-%d" % (lo, hi))
            lo = hi + 1
        labels.append("%d+" % lo)
        return labels

    def _rows(cal, edges):
        cells = cal.get("cells") or {}
        positions = sorted({k[0] for k in cells})
        out = []
        for pos in positions:
            for band in _band_labels(edges):
                c = cells.get((pos, band)) or {
                    "n": 0, "status": "unmeasurable", "sd_ratio": None,
                    "mean_ratio": None, "p10_ratio": None, "p90_ratio": None,
                    "basis": "band absent from this calibration"}
                out.append(dict(c, position=pos, band=band))
        return out

    return {
        "_note": "Register 4q. `current` bands are the SHIPPED BAND_EDGES; "
                 "`refit_v2` bands are BAND_EDGES_REFIT_V2 (the shipped `33+` "
                 "split into 33-48/49-72/73-100/101-150/151+). Neither "
                 "calibration is changed by producing this — it is the "
                 "comparison the relay asked for before anyone ships the "
                 "refit. THE POPULATION QUESTION IS DELIBERATELY UNRESOLVED "
                 "HERE: both calibrations' p90/p10 are unconditional over "
                 "every graded player, survivorship-biased per SURVIVOR_"
                 "CAVEAT, and neither conditions on the player having "
                 "actually held a role. That is a design call for Cory/A, "
                 "not a constant this refit changes.",
        "current_band_edges": list(BAND_EDGES),
        "refit_band_edges": list(BAND_EDGES_REFIT_V2),
        "current": _rows(current_cal, BAND_EDGES),
        "refit_v2": _rows(refit_cal, BAND_EDGES_REFIT_V2),
    }


def main_refit_v2() -> int:  # pragma: no cover  (egress; CI only)
    """Register 4q's dispatch entry point — separate from `main()` on
    purpose. Writes ONLY the two side artifacts above; the production
    `CALIBRATION` file (`projection_error_calibration.json`, what the board
    build actually reads) is never opened for writing by this function.
    Whether the refit ships is Cory's call, made from the comparison this
    writes, not by this script.
    """
    import json as _json

    current = load()
    refit = regenerate_refit_v2()
    if refit.get("status") == "VOID":
        print("VOID — %s" % refit.get("reason"))
        return 1

    doc = document(refit)
    doc["_side_artifact"] = True
    doc["_defect"] = ("register 4q — BAND_EDGES_REFIT_V2 splits the shipped "
                      "33+ band. NOT applied to the board. Compare against "
                      "projection_error_calibration.json (BAND_EDGES) via "
                      "projection_error_refit_v2_comparison.json.")
    REFIT_V2_CALIBRATION.parent.mkdir(parents=True, exist_ok=True)
    REFIT_V2_CALIBRATION.write_text(_json.dumps(doc, indent=2) + "\n")

    comparison = slope_comparison(current, refit)
    REFIT_V2_COMPARISON.write_text(_json.dumps(comparison, indent=2) + "\n")

    print("register 4q refit: measured %d/%d cells; wrote %s and %s"
         % (refit.get("cells_measured", 0),
            refit.get("cells_measured", 0) + refit.get("cells_unmeasurable", 0),
            REFIT_V2_CALIBRATION.name, REFIT_V2_COMPARISON.name))
    return 0



if __name__ == "__main__":
    raise SystemExit(main())
