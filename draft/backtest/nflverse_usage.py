# TERRITORY: C
"""PRIOR-SEASON USAGE SHARES — the missing variance input, from data already in hand.

WHY THIS EXISTS. `draft/projections.py:player_variance` takes five inputs and the
backtest board carries at most `age`, so the bell-cow/committee multiplier never
fires and `proj_sd` collapses to `0.25 x proj_mean`. With variance a constant
multiple of the mean, `proj_ceiling` is rank-identical to `proj_mean` and the
ceiling term cannot be measured at all — which is why `ceiling: 0` in
MEASURED_WEIGHTS is marked UNMEASURED rather than measured (A, 2026-08-13).

**CORRECTED 2026-08-17: `build_bundle.py` NO LONGER WRITES THOSE CONSTANTS.** The paragraph above describes the state this module was written into and is kept because it is the reason the module exists. Dispersion on a bundle is now the measured p90/p10/sd per (position, band), fitted leave-one-season-out, and absent off an unmeasured cell rather than filled in. The collinearity is REDUCED, NOT REMOVED — the measured spread is still `proj_mean x a per-CELL` constant, varying between bands and not within them — so `ceiling: 0` remains UNMEASURED rather than refuted, and the experiment is runnable for the first time. See draft/backtest/HARNESS-DISPERSION-PREREG.md.

AND IT NEEDS NO NEW INGEST. `build_bundle.build()` is already handed `weekly_df`
and already iterates it in `weekly_points_by_season`. The share the variance model
wants is computable from the frame that is already there.

WHAT THIS DELIBERATELY DOES NOT SUPPLY. Of the five inputs, `depth_chart_order` and
`injury_status` are CURRENT STATE ONLY. Today's depth chart reflects how the season
turned out, so applying it to a 2023 draft credits variance for information that did
not exist when the pick was made — a look-ahead leak, and a nasty one because it
would make the backtest look better. `age` and `years_exp` are exactly
back-computable by the caller and need no data from here. This module supplies the
one remaining input, which is also the heaviest.

THE FAILURE MODE THIS FILE IS SHAPED AROUND. A share of 0.0 is NOT neutral:
`player_variance` reads `0 < share < VAR_WORKLOAD_LOW` as committee usage and RAISES
variance. So a frame with no `targets` column, handled carelessly, does not lose the
signal — it inverts it for every player at once. Absent and zero are kept apart here
by refusing to emit anything when the columns are missing, and saying so.
"""
from __future__ import annotations

#: Both loaders, because they disagree and the disagreement has already cost a run.
#: `nflverse_weekly_to_scoring` carries the same scar: nfl_data_py's
#: `interceptions` became nflreadpy's `passing_interceptions`, and mapping one name
#: silently zeroed every 2025 row for a scored term.
TEAM_COLS = ("recent_team", "team")
ID_COLS = ("player_id", "gsis_id")
TARGET_COL = "targets"
CARRY_COL = "carries"


def _rows(frame):
    """Accept a DataFrame or a list of dicts; the tests use the latter."""
    if frame is None:
        return []
    if hasattr(frame, "to_dict"):
        return frame.to_dict("records")
    return list(frame)


def _first_present(row, names):
    for n in names:
        if n in row and row[n] is not None:
            return n
    return None


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f          # NaN is absent, not zero


def usage_shares(weekly_df, season, crosswalk, before_season=None) -> tuple:
    """Prior-season usage share per player. Returns `(shares, report)`.

    `shares` is {our_id: {"target_share": float, "opportunity_share": float}}.
    Shares are TEAM-RELATIVE and SEASON-TOTAL — a player's whole-season targets over
    his team's whole-season targets, not the mean of his weekly shares. Averaging
    weekly shares would let a player who missed ten games read as a bell-cow off two
    big weeks, which is exactly inverted.

    `before_season`, when given, REFUSES a season that is not strictly before it. A
    share computed from the season under replay is the outcome, not a prior, and it
    would hand the backtest the single most valuable thing a drafter could know.
    """
    if before_season is not None and int(season) >= int(before_season):
        raise ValueError(
            "usage_shares(%s) is not strictly BEFORE the drafted season %s — a share "
            "taken from the season being replayed is an outcome, not a prior"
            % (season, before_season))

    rows = [r for r in _rows(weekly_df)
            if "season" not in r or str(r.get("season")) == str(season)]
    if not rows:
        return {}, {"usable": False, "why": "no rows for season %s" % season,
                    "seasons_used": [], "unmatched_ids": 0, "team_column": None}

    probe = rows[0]
    team_col = _first_present(probe, TEAM_COLS) or next(
        (c for r in rows for c in TEAM_COLS if c in r), None)
    id_col = _first_present(probe, ID_COLS) or "player_id"
    has_t = any(TARGET_COL in r for r in rows)
    has_c = any(CARRY_COL in r for r in rows)

    # ABSENT IS NOT ZERO. Emitting 0.0 shares here would read as committee usage for
    # the entire league and raise every variance at once — the signal inverted, not
    # lost. Refuse, and name which columns were missing.
    if not (has_t or has_c):
        missing = "%s and %s" % (TARGET_COL, CARRY_COL)
        return {}, {"usable": False,
                    "why": "the frame carries neither %s — no share can be computed, "
                           "and a zero share would read as committee usage for every "
                           "player rather than as missing data" % missing,
                    "seasons_used": [], "unmatched_ids": 0, "team_column": team_col}

    team_t, team_o = {}, {}
    p_t, p_o = {}, {}
    unmatched = 0
    for r in rows:
        tm = r.get(team_col) if team_col else None
        t = _num(r.get(TARGET_COL)) or 0.0
        c = _num(r.get(CARRY_COL)) or 0.0
        # THE DENOMINATOR COUNTS EVERYONE, matched or not. Dropping an unmatched
        # player from the team total understates every surviving team-mate's share
        # and nothing would say why.
        team_t[tm] = team_t.get(tm, 0.0) + t
        team_o[tm] = team_o.get(tm, 0.0) + t + c
        sid = crosswalk.get(str(r.get(id_col)))
        if not sid:
            unmatched += 1
            continue
        p_t[(sid, tm)] = p_t.get((sid, tm), 0.0) + t
        p_o[(sid, tm)] = p_o.get((sid, tm), 0.0) + t + c

    out = {}
    for (sid, tm), tot in p_t.items():
        dt, do = team_t.get(tm) or 0.0, team_o.get(tm) or 0.0
        cur = out.setdefault(sid, {"target_share": 0.0, "opportunity_share": 0.0})
        if dt:
            cur["target_share"] += tot / dt
        if do:
            cur["opportunity_share"] += (p_o.get((sid, tm), 0.0)) / do

    return out, {"usable": True, "seasons_used": [season],
                 "players": len(out), "unmatched_ids": unmatched,
                 "team_column": team_col, "has_targets": has_t, "has_carries": has_c}
