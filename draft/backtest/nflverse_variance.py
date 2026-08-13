# TERRITORY: C
"""REAL WEEKLY VARIANCE, MEASURED — the field two dead weights are waiting on.

`build_bundle.py` writes `proj_sd = 0.25 * proj_mean` and `proj_ceiling = 1.35 *
proj_mean`. Both synthetic, so spread is a constant multiple of the mean, ceiling is
rank-identical to value, and `ceiling: 0` in MEASURED_WEIGHTS is an experiment that
could not have returned anything else. Risk is PARTIAL for the same reason.

WHY IT IS NOT COSMETIC, IN ONE LINE: **a starting lineup is a MAX over startable
players**, so variance changes the answer even when means are identical. With a
synthetic sd the model is not estimating its own objective.

PRODUCTION DERIVES THIS BACKWARDS. `projections.py` computes `weekly_sd = season_sd /
sqrt(games)` where `season_sd = mean x a heuristic`. This module inverts it: measure
the weekly spread from realized scoring, then `season_sd = weekly_sd * sqrt(games)`.

SCORED WITH OUR TABLE, NEVER THE PROVIDER'S POINTS. `weekly_points_by_season` already
refuses a provider's `fantasy_points` because they encode a different league's rules,
and this reuses the same two functions rather than deriving a second time.

AND IT CARRIES A STATUS PER PLAYER, because **a variance of 0.0 is the most dangerous
possible wrong answer: it means PERFECTLY CERTAIN.** A player with one game has no
measurable spread; writing 0.0 would give him a ceiling equal to his mean and a risk
term of nothing, and he would read as the safest pick on the board. So:

    measured      enough games to compute a real spread
    imputed       too few games; a POSITION PRIOR, and it says so
    unmeasurable  no basis at all, and the number is None rather than a guess

`None` is deliberate. A consumer pricing off `None` gets a TypeError and notices; one
pricing off a plausible constant proceeds confidently. That is A's invariant: a number
means a number, null means the input does not exist, status says why.
"""
from __future__ import annotations

from statistics import pstdev

#: Below this many games a spread is noise rather than a measurement. Declared, not
#: tuned: four is the smallest count where a standard deviation is worth reporting at
#: all, and the caller can raise it.
MIN_GAMES = 4

#: nflverse weekly carries the season under either loader's spelling.
SEASON_COLS = ("season",)
ID_COLS = ("player_id", "gsis_id")
POS_COLS = ("position", "pos")


def _rows(frame):
    if frame is None:
        return []
    if hasattr(frame, "to_dict"):
        return frame.to_dict("records")
    return list(frame)


def _first(row, names, default=None):
    for n in names:
        if n in row and row[n] is not None:
            return row[n]
    return default


def weekly_variance(weekly_df, seasons, scoring_cfg, crosswalk, *, before_season=None,
                    min_games=MIN_GAMES, position_prior=None,
                    games_expected=None) -> tuple:
    """Measured weekly spread per player. Returns `(out, report)`.

    `out[our_id]` is
    `{weekly_sd, season_sd, mean_points, games, status, basis}` where `weekly_sd` and
    `season_sd` are `None` whenever the status is not `measured` or `imputed`.

    `before_season` REFUSES any season not strictly before it — a spread measured on
    the season under replay is an outcome, not a prior.
    """
    import grade as GR
    import scoring as SC

    seasons = [int(s) for s in (seasons or [])]
    if before_season is not None:
        bad = [s for s in seasons if s >= int(before_season)]
        if bad:
            raise ValueError(
                "weekly_variance was given season(s) %s which are not strictly BEFORE "
                "the drafted season %s — a spread taken from the season being replayed "
                "is an outcome, not a prior" % (bad, before_season))

    rows = _rows(weekly_df)
    if not rows:
        return {}, {"usable": False, "why": "no weekly rows", "measured": 0,
                    "imputed": 0, "unmeasurable": 0, "status_counts": {}}

    prior = {} if position_prior is None else dict(position_prior)
    games_expected = games_expected or {}

    # points per player per week, scored by OUR table
    pts, pos_of = {}, {}
    for r in rows:
        season = _first(r, SEASON_COLS)
        if season is not None and int(season) not in seasons:
            continue
        sid = crosswalk.get(str(_first(r, ID_COLS)))
        if not sid:
            continue
        line = GR.nflverse_weekly_to_scoring(r)
        pts.setdefault(sid, []).append(float(SC.score_stat_line(line, scoring_cfg)))
        p = _first(r, POS_COLS)
        if p:
            pos_of.setdefault(sid, p)

    out, counts = {}, {"measured": 0, "imputed": 0, "unmeasurable": 0}
    for sid, vals in pts.items():
        n = len(vals)
        mean_pts = round(sum(vals) / n, 4) if n else None
        pos = pos_of.get(sid)
        if n >= max(2, int(min_games)):
            wsd = float(pstdev(vals))
            status, basis = "measured", "%d games" % n
        elif pos in prior:
            wsd = float(prior[pos])
            status, basis = "imputed", "position prior for %s (only %d game(s))" % (pos, n)
        else:
            # NO NUMBER. A zero here would read as perfect certainty, which is the
            # opposite of what one game tells us.
            out[sid] = {"weekly_sd": None, "season_sd": None, "mean_points": mean_pts,
                        "games": n, "status": "unmeasurable",
                        "basis": "only %d game(s) and no position prior" % n}
            counts["unmeasurable"] += 1
            continue
        g = float(games_expected.get(pos, 15.0))
        out[sid] = {"weekly_sd": round(wsd, 4), "season_sd": round(wsd * (g ** 0.5), 4),
                    "mean_points": mean_pts, "games": n, "status": status, "basis": basis}
        counts[status] += 1

    return out, {"usable": True, "seasons": seasons, "players": len(out),
                 "min_games": int(min_games), "status_counts": counts,
                 "measured": counts["measured"], "imputed": counts["imputed"],
                 "unmeasurable": counts["unmeasurable"]}
