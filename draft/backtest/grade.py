"""Actual rest-of-season points — the only place outcome data is allowed.

This module exists on the far side of the wall. The replay never imports it and
never holds a GradingStore; its numbers are joined to the replay's choices only
after those choices have already been made and written down.

Points are computed by OUR scoring engine under the REPLAYED season's config.
Never a provider's fantasy points: those encode a different league's rules, and
grading a half-PPR league's decisions with standard-scoring outcomes would
quietly punish every receiver the composite recommended.
"""
from __future__ import annotations
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import scoring


def crosswalk_gsis_to_sleeper(players_meta, ids_df=None) -> dict:
    """gsis id -> sleeper id, from Sleeper's own field plus nfl_data_py's map.

    Two sources because neither is complete: the 2026 build translated 739 of
    761 opportunity ids and left 22 unmapped even with both.
    """
    cw = {}
    if ids_df is not None and len(ids_df):
        cols = set(ids_df.columns)
        if {"gsis_id", "sleeper_id"} <= cols:
            for g, s in zip(ids_df["gsis_id"], ids_df["sleeper_id"]):
                if g and s and str(g) != "nan" and str(s) != "nan":
                    cw[str(g)] = str(int(float(s))) if str(s).replace('.', '').isdigit() else str(s)
    for p in players_meta:
        g = p.get("gsis_id")
        if g:
            cw.setdefault(str(g), str(p["player_id"]))
    return cw


def rest_of_season_points(weekly_df, season: int, scoring_cfg: dict,
                          crosswalk: dict, from_week: int = 1) -> dict:
    """{sleeper_id: points} for `season`, weeks >= from_week.

    A player with no weekly rows returns NOTHING rather than 0.0. That
    distinction decides whether the backtest is honest: a player who was never
    on an NFL field is missing data, and scoring him as zero would punish
    whichever policy recommended him. replay.grade() drops ungradeable picks
    from N for exactly this reason.
    """
    out = {}
    if weekly_df is None or len(weekly_df) == 0:
        return out
    cols = set(weekly_df.columns)
    id_col = "player_id" if "player_id" in cols else "gsis_id"
    df = weekly_df
    if "season" in cols:
        df = df[df["season"] == season]
    if "week" in cols:
        df = df[df["week"] >= from_week]
    for row in df.to_dict("records"):
        sid = crosswalk.get(str(row.get(id_col)))
        if not sid:
            continue
        line = {k: v for k, v in row.items()
                if isinstance(v, (int, float)) and v == v}
        out[sid] = out.get(sid, 0.0) + scoring.score_stat_line(line, scoring_cfg)
    return {k: round(v, 2) for k, v in out.items()}


def survived(pick_no: int, next_pick: int, player_id: str, picks: list) -> bool | None:
    """Did this player last from `pick_no` to the seat's next pick?

    None when the draft ended before next_pick — unknowable, not a survival.
    """
    last = max((p.get("pick_no") or 0) for p in picks) if picks else 0
    if next_pick > last:
        return None
    for p in picks:
        n = p.get("pick_no") or 0
        if pick_no < n < next_pick and str(p.get("player_id")) == str(player_id):
            return False
    return True
