# TERRITORY: C
"""K and DEF realized weekly points — register 67 (relay, 2026-08-20, routed off
Cory's own priority: "get better projections... try all things til we find a
blend that works"). No realized K or DEF score has ever been stored, any
season, so both whole positions have been ungradeable no matter what a
projection source claimed about them.

Same shape and convention as nflverse_weekly_points_<season>.json (skill
positions, C, 2026-08-13): one store per season, weeks 1-17 (this league's own
`last_scored_leg`, matched rather than re-derived), scored under THIS league's
own table via `scoring.score_stat_line`, written through
`nflverse_weekly_store.append_week`/`save` — both already position-agnostic
and already C's own, reused rather than re-derived (rule 11).

A SEPARATE FILE PER SEASON, not merged into the existing skill-position store:
`append_week` refuses two populations sharing one (season, week) row only by
scoring-table fingerprint, not by population, but merging would still mean
touching `nflverse_weekly_points_<season>.json`'s `points` dict directly — a
file every existing consumer already pins the population of. Additive and
separate is the same discipline the source-per-file convention already uses.

THREE SOURCES, NONE OF THEM A PROVIDER'S OWN FANTASY POINTS:
  kicking          nflverse-data release `player_stats`, asset
                   player_stats_kicking_<season>.parquet — FG/XP by distance
                   band, per player per week.
  defense          nflverse-data release `player_stats`, asset
                   player_stats_def_<season>.parquet — INDIVIDUAL defender
                   rows (tackles, sacks, INTs, fumble recoveries, defensive
                   TDs, safeties). Aggregated here BY TEAM+WEEK — that
                   aggregate is not a stat nflverse ships; it is built here.
  points allowed   nflverse-data release `schedules`, asset games.parquet —
                   the opponent's final score, banded into this league's own
                   `pts_allow_*` keys.

nfl_data_py's own `import_weekly_data`/`import_schedules` hit stale or dead
URLs (the same defect grade.py's own comment already documents for skill
positions: import_weekly_data 404s for 2025). Fetched directly from the
nflverse-data GitHub release assets instead — verified reachable from this
sandbox (2026-08-20) even though Sleeper and FantasyPros are proxy-blocked.

TEAM CODE: kicking, defense and schedules all agree with each other (every
source here uses "LA" for the Rams); only this league's own board uses "LAR"
(verified against public/draft_data.json's own DEF rows). ONE substitution,
named in `TEAM_FIX`, not a general normalizer.

KNOWN GAP, NOT SILENT: kick/punt-return TDs (this league's `def_st_td`, 6.0 —
the same weight as `def_td`) are a SPECIAL-TEAMS-UNIT stat that lives on the
RETURNER's row (frequently a WR/RB/CB, not a "defensive" player), in a
different nflverse table this module does not fetch. INT-return and
fumble-return TDs (`def_td`, also 6.0) ARE captured, from `def_tds` on the
individual defender who scored. `blk_kick` (0.0) and every return-TD-TYPE
breakdown (`def_pr_td`/`def_kr_td`/`def_st_fum_rec`/`st_fum_rec`/`ff`/
`def_st_ff`, all 0.0) are weighted zero in this league's own scoring table
(`sleeper_league_settings.json`) and are correctly never scored, not silently
dropped — verified against that table before writing this, not assumed.

KICKER CROSSWALK: name-matched against Sleeper's full player pool (CI-only
egress, same as every other Sleeper-dependent fetch in this repo — verified
blocked from this sandbox, 403 through the proxy tunnel), reusing
`sleeper_name_index.normalize_name` (a pure string function, zero behavior
risk) — deliberately NOT `sleeper_name_index.build_index`/`ROSTERED`, which
excludes K on purpose for its own FantasyPros-join use (register 4t) and two
other studies already depend on that exclusion staying as-is. A second,
K-only, LOCAL index here avoids touching a shared file for a use it was never
scoped for.

DEF NEEDS NO CROSSWALK: this league's own `player_id` for a team defense IS
the team code (verified: `public/draft_data.json`'s "HOU" row, position DEF).

Run (CI only — needs Sleeper egress for the kicker crosswalk):
  python3 draft/backtest/kdef_weekly_points.py [season ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))

import scoring  # noqa: E402  (rule 11 — draft/scoring.py, score_stat_line)
import nflverse_weekly_store as STORE  # noqa: E402  (rule 11 — C's own, position-agnostic)
import sleeper_name_index as NI  # noqa: E402  (rule 11 — normalize_name only, pure)

#: Every source here agrees with itself; only this league's own board differs,
#: and only for the Rams.
TEAM_FIX = {"LA": "LAR"}

KICKING_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
              "player_stats/player_stats_kicking_{season}.parquet")
DEF_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
          "player_stats/player_stats_def_{season}.parquet")
GAMES_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "schedules/games.parquet")

#: Matches the sibling skill-position stores' own cutoff (league_history.json
#: last_scored_leg) — this league's fantasy season, not the NFL's 18-week one.
LAST_SCORED_WEEK = 17

OUT_TMPL = str(HERE / "nflverse_weekly_points_kdef_{season}.json")


def _fix_team(code: str) -> str:
    return TEAM_FIX.get(code, code)


def _num(row: dict, key: str) -> float:
    v = row.get(key)
    return float(v) if isinstance(v, (int, float)) and v == v else 0.0


def kicker_stat_line(row: dict) -> dict:
    """One nflverse kicking row -> this league's scoring keys.

    fg_made_50_59 and fg_made_60_ both price at this league's fgm_50p (5.0) —
    there is no separate 60+ bonus in sleeper_league_settings.json, checked
    before combining them rather than assumed. gwfg_* (game-winning-FG) is
    NOT summed in: verified by hand against a real row with gwfg_att>0 that
    fg_made already equals the distance-bucket sum -- gwfg is informational,
    not an additional made kick.
    """
    return {
        "fgm_0_19": _num(row, "fg_made_0_19"),
        "fgm_20_29": _num(row, "fg_made_20_29"),
        "fgm_30_39": _num(row, "fg_made_30_39"),
        "fgm_40_49": _num(row, "fg_made_40_49"),
        "fgm_50p": _num(row, "fg_made_50_59") + _num(row, "fg_made_60_"),
        "fgmiss": _num(row, "fg_missed"),  # weighted 0.0 in this league; kept for the record
        "xpm": _num(row, "pat_made"),
        "xpmiss": _num(row, "pat_missed") + _num(row, "pat_blocked"),
    }


def band_points_allowed(points: float) -> str:
    """This league's own DST points-allowed bands, read from
    sleeper_league_settings.json's scoring_settings, not invented here."""
    if points <= 0:
        return "pts_allow_0"
    if points <= 6:
        return "pts_allow_1_6"
    if points <= 13:
        return "pts_allow_7_13"
    if points <= 20:
        return "pts_allow_14_20"
    if points <= 27:
        return "pts_allow_21_27"
    if points <= 34:
        return "pts_allow_28_34"
    return "pts_allow_35p"


def def_team_week_line(def_rows: list, points_allowed: float) -> dict:
    """Individual-defender rows for ONE team's ONE week -> this league's DST
    scoring keys, plus the game's points-allowed band as a 0/1 indicator (the
    league prices a BAND, not a linear rate — score_stat_line is a dot
    product, so the indicator IS the mechanism, not a shortcut around it)."""
    line = {"sack": 0.0, "int": 0.0, "fum_rec": 0.0, "def_td": 0.0, "safe": 0.0}
    for r in def_rows:
        line["sack"] += _num(r, "def_sacks")
        line["int"] += _num(r, "def_interceptions")
        line["fum_rec"] += _num(r, "def_fumble_recovery_opp")
        line["def_td"] += _num(r, "def_tds")
        line["safe"] += _num(r, "def_safety")
    line[band_points_allowed(points_allowed)] = 1.0
    return line


def kicker_name_index(players_raw: dict) -> dict:
    """K-only normalized name -> sleeper_id, LOCAL to this module.

    Collisions (two kickers who ever shared a normalized name) are excluded
    from the index rather than guessed — same discipline as
    sleeper_name_index.build_index, applied by hand here since that function's
    own ROSTERED tuple deliberately excludes K.
    """
    by_name: dict = {}
    for pid, p in (players_raw or {}).items():
        if not isinstance(p, dict) or (p.get("position") or "").upper() != "K":
            continue
        full = p.get("full_name") or " ".join(
            x for x in (p.get("first_name"), p.get("last_name")) if x)
        key = NI.normalize_name(full)
        if not key:
            continue
        by_name.setdefault(key, []).append(str(pid))
    return {k: v[0] for k, v in by_name.items() if len(v) == 1}


def build_kicker_weeks(kicking_rows: list, name_idx: dict) -> dict:
    """[nflverse kicking row, ...] -> {week: {sleeper_id: points}}.

    A row the crosswalk cannot resolve is dropped from THIS position's store,
    not scored as zero — a kicker with no Sleeper match is missing data, and
    scoring him at zero would understate the position's own realized points.
    """
    out: dict = {}
    for row in kicking_rows:
        if row.get("season_type") != "REG":
            continue
        week = int(row["week"])
        if week > LAST_SCORED_WEEK:
            continue
        name = row.get("player_display_name") or row.get("player_name") or ""
        sid = name_idx.get(NI.normalize_name(name))
        if not sid:
            continue
        pts = scoring.score_stat_line(kicker_stat_line(row), SCORING_CFG())
        wk = out.setdefault(week, {})
        wk[sid] = wk.get(sid, 0.0) + pts
    return out


def build_def_weeks(def_rows: list, game_rows: list, season: int) -> dict:
    """[nflverse def row, ...], [games row, ...] -> {week: {team: points}}.

    Iterates from the SCHEDULE (the authoritative record of which games were
    played), not from the defender rows — a team-week with a played game but
    (hypothetically) zero qualifying defender rows must still be scored on
    its points-allowed band, not silently dropped.
    """
    allowed: dict = {}
    for r in game_rows:
        if int(r.get("season", -1)) != int(season) or r.get("game_type") != "REG":
            continue
        week = int(r["week"])
        if week > LAST_SCORED_WEEK:
            continue
        allowed[(_fix_team(r["home_team"]), week)] = float(r["away_score"])
        allowed[(_fix_team(r["away_team"]), week)] = float(r["home_score"])

    grouped: dict = {}
    for row in def_rows:
        if row.get("season_type") != "REG":
            continue
        week = int(row["week"])
        if week > LAST_SCORED_WEEK:
            continue
        team = _fix_team(row.get("team"))
        grouped.setdefault((team, week), []).append(row)

    out: dict = {}
    for (team, week), pa in allowed.items():
        line = def_team_week_line(grouped.get((team, week), []), pa)
        pts = scoring.score_stat_line(line, SCORING_CFG())
        out.setdefault(week, {})[team] = pts
    return out


_SCORING_CFG_CACHE = None


def SCORING_CFG() -> dict:
    """This league's own scoring table — league_config.json, never a
    provider's points. Cached; the table does not change mid-run."""
    global _SCORING_CFG_CACHE
    if _SCORING_CFG_CACHE is None:
        cfg_path = DRAFT / "config" / "league_config.json"
        _SCORING_CFG_CACHE = (json.loads(cfg_path.read_text()) or {}).get("scoring") or {}
    return _SCORING_CFG_CACHE


def build_store(season: int, kicking_rows: list, def_rows: list, game_rows: list,
                players_raw: dict) -> list:
    """All four inputs already fetched -- pure assembly, testable without egress."""
    name_idx = kicker_name_index(players_raw)
    kicker_weeks = build_kicker_weeks(kicking_rows, name_idx)
    def_weeks = build_def_weeks(def_rows, game_rows, season)

    series: list = []
    for week in sorted(set(kicker_weeks) | set(def_weeks)):
        points = {}
        points.update(kicker_weeks.get(week, {}))
        points.update(def_weeks.get(week, {}))
        if not points:
            continue
        series = STORE.append_week(series, season, week, points, SCORING_CFG())
    return series


def run(seasons=(2023, 2024, 2025)):  # pragma: no cover  (egress; CI only)
    import sleeper_import as SL

    players_raw = SL.fetch_players()
    for season in seasons:
        import pandas as pd
        kicking = pd.read_parquet(KICKING_URL.format(season=season)).to_dict("records")
        defense = pd.read_parquet(DEF_URL.format(season=season)).to_dict("records")
        games = pd.read_parquet(GAMES_URL).to_dict("records")
        series = build_store(season, kicking, defense, games, players_raw)
        STORE.save(series, OUT_TMPL.format(season=season))
        print(f"  {season}: {len(series)} weeks written -> "
             f"{OUT_TMPL.format(season=season)}")


if __name__ == "__main__":
    import sys as _sys
    yrs = tuple(int(a) for a in _sys.argv[1:]) or (2023, 2024, 2025)
    run(yrs)
