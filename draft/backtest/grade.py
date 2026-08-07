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


# nflverse weekly/pbp column names -> our scoring keys.
#
# THE BUG THIS FIXES, caught by the sanity gate: nflverse calls them
# receptions / receiving_yards / passing_tds; our scoring engine (and league
# config) call them rec / rec_yd / pass_td. Passing raw nflverse columns to
# score_stat_line matched almost nothing, so every prior-season total scored
# near zero, the walk-forward projection collapsed to positional baselines, and
# ranked UNCORRELATED with ADP (spearman -0.004). weekly_from_pbp already maps
# by hand for the pbp path; this is the same translation for the library path,
# in one place both call sites share.
_WEEKLY_MAP = {
    "passing_yards": "pass_yd", "passing_tds": "pass_td", "interceptions": "pass_int",
    "passing_2pt_conversions": "pass_2pt",
    "rushing_yards": "rush_yd", "rushing_tds": "rush_td",
    "rushing_2pt_conversions": "rush_2pt",
    "receptions": "rec", "receiving_yards": "rec_yd", "receiving_tds": "rec_td",
    "receiving_2pt_conversions": "rec_2pt",
}
# Fumbles lost arrive split across three columns; our engine has one key.
_FUM_LOST_COLS = ("rushing_fumbles_lost", "receiving_fumbles_lost", "sack_fumbles_lost")


# Our own keys, so a row that is ALREADY in our vocabulary (the pbp rebuild
# emits these) passes straight through instead of scoring zero.
_OUR_KEYS = set(_WEEKLY_MAP.values()) | {"fum_lost"}


def nflverse_weekly_to_scoring(row: dict) -> dict:
    """One weekly/pbp row -> our scoring keys, accepting EITHER vocabulary.

    Two producers feed this: import_weekly_data uses nflverse column names, and
    weekly_from_pbp (the 2025 recovery path) already emits our keys. A mapper
    that only translated nflverse names would silently zero every rebuilt row —
    the same class of bug, one layer over. So our-key values pass through and
    nflverse names translate, and a row carrying both is summed once per target.
    """
    line = {}

    def add(dst, v):
        if isinstance(v, (int, float)) and v == v:
            line[dst] = line.get(dst, 0) + v

    for k in _OUR_KEYS:
        if k in row:
            add(k, row.get(k))
    for src, dst in _WEEKLY_MAP.items():
        if src in row:
            add(dst, row.get(src))
    for c in _FUM_LOST_COLS:
        if c in row:
            add("fum_lost", row.get(c))
    return line


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
        line = nflverse_weekly_to_scoring(row)
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


# ---------------------------------------------------------------------------
# Weekly stats rebuilt from play-by-play.
#
# WHY THIS EXISTS. nfl_data_py's import_weekly_data 404s for 2025 while
# import_pbp_data serves it fine — a stale URL in the library, not missing data.
# Losing 2025 would not merely shrink N from 3 to 2; it would drop the season
# CLOSEST to the board we actually draft on, and re-weight the whole verdict
# toward 2023 conditions.
#
# Weekly stats ARE play-by-play aggregated to player-weeks, so rebuilding them
# from the source we already pull is one fewer dependency on a library whose
# URLs go stale. It is arguably the better path even where both work.
#
# THE GUARD THAT MAKES IT TRUSTWORTHY: cross_validate() rebuilds a season where
# BOTH paths work and requires agreement within rounding on graded points. A
# rebuilt stat line that quietly disagrees with the real one would corrupt every
# grade downstream while looking entirely normal — so the rebuild is not trusted
# until it has reproduced a season we can check it against.
# ---------------------------------------------------------------------------

# nflfastR column -> our scoring key, by the role the player had on the play.
_REC = {"receiving_yards": "rec_yd"}
_RUSH = {"rushing_yards": "rush_yd"}
_PASS = {"passing_yards": "pass_yd"}


def weekly_from_pbp(pbp, seasons):
    """Aggregate play-by-play into {(sleeper-less gsis id, season, week): stats}.

    Returns rows shaped like import_weekly_data's: one dict per player-week with
    gsis `player_id`, `season`, `week`, and the counting stats our scoring engine
    consumes. Ids stay GSIS here; the caller crosswalks, exactly as it does for
    the library path.
    """
    if pbp is None or len(pbp) == 0:
        return []
    cols = set(pbp.columns)
    need = {"season", "week"}
    if not need <= cols:
        return []
    acc = {}

    def bump(pid, season, week, key, val):
        if not pid or pid != pid or not val or val != val:
            return
        k = (str(pid), int(season), int(week))
        row = acc.setdefault(k, {"player_id": str(pid), "season": int(season),
                                 "week": int(week)})
        row[key] = row.get(key, 0) + float(val)

    df = pbp[pbp["season"].isin([int(s) for s in seasons])] if "season" in cols else pbp
    for r in df.to_dict("records"):
        s, w = r.get("season"), r.get("week")
        if s is None or w is None or s != s or w != w:
            continue
        # Receiving. complete_pass guards against crediting incompletions.
        rid = r.get("receiver_player_id")
        if rid and r.get("complete_pass") == 1:
            bump(rid, s, w, "rec", 1)
            bump(rid, s, w, "rec_yd", r.get("receiving_yards"))
            if r.get("pass_touchdown") == 1 and r.get("td_player_id") == rid:
                bump(rid, s, w, "rec_td", 1)
        # Rushing.
        rus = r.get("rusher_player_id")
        if rus:
            bump(rus, s, w, "rush_yd", r.get("rushing_yards"))
            if r.get("rush_touchdown") == 1 and r.get("td_player_id") == rus:
                bump(rus, s, w, "rush_td", 1)
        # Passing.
        p = r.get("passer_player_id")
        if p:
            bump(p, s, w, "pass_yd", r.get("passing_yards"))
            if r.get("pass_touchdown") == 1:
                bump(p, s, w, "pass_td", 1)
            if r.get("interception") == 1:
                bump(p, s, w, "pass_int", 1)
        # Fumbles lost, charged to whoever lost it.
        if r.get("fumble_lost") == 1:
            bump(r.get("fumbled_1_player_id"), s, w, "fum_lost", 1)
    return list(acc.values())


def cross_validate(pbp, weekly_df, season, scoring_cfg, crosswalk, tolerance=0.5):
    """Rebuild `season` from pbp and compare graded points to the library path.

    Returns a verdict dict. The caller decides — but the intended use is: do not
    trust the rebuilt path for a season the library cannot serve until it has
    reproduced one the library CAN.
    """
    import pandas as pd
    rebuilt_rows = weekly_from_pbp(pbp, [season])
    if not rebuilt_rows:
        return {"season": season, "agrees": False, "reason": "pbp produced no rows"}
    rebuilt = rest_of_season_points(pd.DataFrame(rebuilt_rows), season,
                                    scoring_cfg, crosswalk)
    official = rest_of_season_points(weekly_df, season, scoring_cfg, crosswalk)
    common = sorted(set(rebuilt) & set(official))
    if not common:
        return {"season": season, "agrees": False, "reason": "no players in common"}
    diffs = [abs(rebuilt[p] - official[p]) for p in common]
    worst = max(diffs)
    mean_abs = sum(diffs) / len(diffs)
    # Compare on the part of the board that gets drafted, not the long tail of
    # players with three snaps whose rounding noise means nothing.
    top = sorted(official, key=lambda p: -official[p])[:200]
    top_common = [p for p in top if p in rebuilt]
    top_worst = max((abs(rebuilt[p] - official[p]) for p in top_common), default=0.0)
    return {
        "season": season,
        "players_compared": len(common),
        "official_only": len(set(official) - set(rebuilt)),
        "rebuilt_only": len(set(rebuilt) - set(official)),
        "mean_abs_diff": round(mean_abs, 3),
        "worst_diff": round(worst, 3),
        "worst_diff_top200": round(top_worst, 3),
        "tolerance": tolerance,
        "agrees": bool(top_worst <= tolerance),
    }
