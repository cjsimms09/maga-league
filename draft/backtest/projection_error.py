# TERRITORY: C
"""PROJECTION-VS-ACTUAL, MEASURED — where a real proj_sd and proj_ceiling come from.

Items 1 and 3 of A's ingest brief, and they are the same instrument. `build_bundle`
writes `proj_sd = 0.25 * proj_mean` and `proj_ceiling = 1.35 * proj_mean`. Both are
constants, so spread is a fixed multiple of the mean, `proj_ceiling` is
RANK-IDENTICAL to `proj_mean`, and `ceiling: 0` in MEASURED_WEIGHTS is an experiment
that could not have returned anything else. Risk is PARTIAL for the same reason.

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

from pathlib import Path
from statistics import pstdev

import field_population as FP

#: Rank edges WITHIN a position, declared rather than tuned. They are round numbers
#: chosen to match how a roster is actually filled — the starter, the flex-worthy
#: second, the bench, the dart — not fitted to make any band look tight.
BAND_EDGES = (3, 8, 16, 32)

#: Below this many graded players a band reports `unmeasurable` rather than a number.
MIN_N = 8

CALIBRATION_VERSION = "projection-error/v1"

SURVIVOR_CAVEAT = (
    "OPTIMISTIC BY AN UNMEASURED AMOUNT. Players with no weekly rows at all are "
    "excluded (a season that ended before week 1 leaves nothing to grade), while a "
    "player who broke down in week 1 is kept near zero. Every band here is therefore "
    "fitted on players who reached the field — survivorship, and it biases the spread "
    "tighter than reality. `ungraded` is the size of the excluded set.")


def band_of(rank) -> str:
    """The band label for a within-position projection rank."""
    if rank is None:
        return "unranked"
    r = int(rank)
    lo = 1
    for hi in BAND_EDGES:
        if r <= hi:
            return "%d-%d" % (lo, hi)
        lo = hi + 1
    return "%d+" % lo


def _players_of(bundle):
    if isinstance(bundle, dict):
        return list(bundle.get("players") or [])
    return list(bundle or [])


def error_rows(bundle, actual: dict, *, positions=None) -> list:
    """One row per player carrying BOTH a projection and a realized total.

    A player the projection covered but the season did not grade is EXCLUDED here and
    COUNTED in `report()` — see the module docstring; the exclusion is the bias, and
    hiding it is what would make the calibration wrong rather than merely limited.
    """
    rows = []
    players = _players_of(bundle)

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
                     "proj_rank": rank, "band": band_of(rank)})
    return rows


def report(bundle, actual: dict, *, positions=None) -> dict:
    """Coverage of one season's grade, with the excluded set named rather than lost."""
    players = _players_of(bundle)
    rows = error_rows(bundle, actual, positions=positions)
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


def calibrate(bundles, actuals, *, min_n=MIN_N, exclude_season=None,
              positions=None) -> dict:
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
        rep = report(b, act, positions=positions)
        ungraded += rep["ungraded"]
        for r in error_rows(b, act, positions=positions):
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


def save(cal: dict, path=None) -> None:
    """Write the calibration where another lane and another run can read it.

    WITH ITS FIELD POPULATION, per Cory's standing rule: a `sd_ratio` column at 0%
    sitting in the manifest is what makes a reader ask why before concluding the
    method produces nothing.
    """
    import json

    p = Path(path or CALIBRATION)
    p.parent.mkdir(parents=True, exist_ok=True)
    rows = [dict(v, position=k[0], band=k[1]) for k, v in (cal.get("cells") or {}).items()]
    rows.sort(key=lambda r: (str(r["position"]), str(r["band"])))
    p.write_text(json.dumps({
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
    }, indent=2) + "\n")


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
