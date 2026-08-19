# TERRITORY: A
# TERRITORY-GRANT: C fetch_kicker_season build_kicker_season kicker_store_path KICKER_URL KICKER_COLUMN_MAP KICKER_FGM50P_COLS KICKER_FGMISS_COLS KICKER_XPMISS_COLS KICKER_STAT_KEYS KICKER_SCORING_KEYS KICKER_META_KEYS load_kicker_store kicker_weeks kicker_season_totals scored_kicker_weekly_points component_stats_kicker register fgm_50p position stats_player_week fetch_def_season build_def_season def_store_path DEF_URL DEF_COLUMN_MAP DEF_BLK_KICK_COLS DEF_STAT_KEYS DEF_SCORING_KEYS DEF_META_KEYS PTS_ALLOW_BANDS pts_allow_band load_def_store def_weeks def_season_totals scored_def_weekly_points component_stats_def stats_team_week fumble_recovery_opp fumble_recovery_tds special_teams_tds def_tds norm_team TEAM_ALIASES games.csv points allowed team code board Sleeper crosswalk kicker defense 2021 2022 2023 2024 2025 2026-08-19 K DEF store season weekly the a and of for with this to is are not never register2e 60_ fg_made fg_missed fg_blocked pat_made pat_missed pat_blocked def_sacks def_interceptions def_safeties def_fumbles_forced def_punt_blocks def_pat_blocks def_fg_blocks opponent_team _team_score_lookup _accumulate
"""PER-PLAYER WEEKLY COMPONENT STATS, 2021-2025 — the v5 input stores.

WHY THIS EXISTS. Every projector before v5 read POINTS-ONLY stores
(nflverse_weekly_points_{2023,2024,2025}.json), and every autopsy since v2 has
named the same absences: per-week usage (pass attempts / carries / targets),
TD counts (so TD luck can be regressed separately from volume), team
assignment history, and any season before 2023 (the one-year training
transition was the binding limit of the whole program). Cory's 2026-08-16
directive ("really dig into player projection and different data that has been
proven to work") and his live catch on v4's blind spot — injury-shortened
elite QBs rank below full-season mid-tier QBs because points-only data cannot
see per-game rate or the rushing floor — un-gated the component-stats ask
(ROUTES.md, TO:C item, 2026-08-16). These stores close every one of those
named absences at once:

    usage          pass_att / rush_att / tgt (+ rec) per player-week
    TD/INT counts  pass_td, pass_int, rush_td, rec_td — efficiency separable
                   from volume, so TD luck can regress
    team history   `team` per player-week — team volume and position shares
                   are computable, season by season
    pre-2023       seasons 2021 and 2022 — TWO more training transitions
                   (2021+2022 → 2023, 2022+2023 → 2024) before the held-out
                   2025 arm is ever touched

SOURCE. nflverse player-stats releases on GitHub (the one egress path this
sandbox has): primary URL per season

    https://github.com/nflverse/nflverse-data/releases/download/player_stats/
        player_stats_<year>.parquet          (2021-2024 live here)

with the newer release as fallback where the primary 404s (2025 lives ONLY
here — nflverse restructured the releases):

    https://github.com/nflverse/nflverse-data/releases/download/stats_player/
        stats_player_week_<year>.parquet

Both schemas are handled; every URL actually tried is recorded in provenance.
IDs are crosswalked gsis → sleeper via nfl_data_py.import_ids() (the same
source grade.crosswalk_gsis_to_sleeper uses); a player the crosswalk cannot
map keeps a "gsis:<id>" key rather than being dropped — team-volume sums must
see the whole depth chart, and dropping unmapped rows would silently shrink
them. Measured at first fetch: the crosswalked population COVERS the committed
weekly-points stores' population exactly (2024: 582 of 582 store players
present here), and component rows scored under the stores' own frozen scoring
table reproduce the stores' points (2024 week 1: 310/310 players, zero diffs
> 0.05) — the parity test pins this.

THE MISSING-vs-ZERO RULE (pinned by test, same rule as every store before it):
a player-week ABSENT from a week's `players` map means the player recorded no
offensive stat row that week — MISSING DATA, never a zero. Inside a present
row, an absent stat key IS a zero of that stat (a WR's row simply carries no
pass_att key) — zero-valued keys are stripped at build time, and readers must
treat row-presence as "was on a field" exactly as the points stores do.

WHAT IS DELIBERATELY NOT HERE. No fantasy points (scoring belongs to the
consumer, under a fingerprinted table — see scored_weekly_points below); no
EPA/air-yards/CPOE analytics columns (unused by v5 — trimmed for size); no
postseason weeks; no kicking or defense rows (grade._WEEKLY_MAP is
offense-only and so is this store).

THE VEGAS LINES STORE (Cory's 2026-08-16 scope addendum: "we need to look at
integrating betting ... let's find an edge here"). The nflverse schedules
dataset on the same release host carries per-game CLOSING `spread_line` and
`total_line` back past 2021 — fetched alongside the components into ONE small
store, `vegas_lines_2021_2025.json` (regular season, lines + teams + week
only). Sign convention, verified on 2021 week 1 (TB home -10 vs DAL stored as
spread_line 10.0): spread_line is the expected HOME margin, so
implied_home = total_line/2 + spread_line/2 and implied_away is the rest.
Leakage note for consumers: week-k closing lines are set before week-k games,
so a season-total projector may read season-Y WEEK 1 lines only (no season-Y
game has been played when they close); anything deeper into season Y is
in-season information. The EXP-WEEKLY-ENV ceiling (+0.23 weekly MAE under
PERFECT-FORESIGHT team game totals) is the standing context any Vegas feature
result must be read against.

IDEMPOTENT RE-RUNS. Deterministic serialization (sorted keys, fixed rounding);
if a season's rebuilt `weeks` content is byte-identical to the committed
store's and the same URL served it, the file is left untouched — original
fetch date preserved. `--force` refetches unconditionally.

Run: python draft/backtest/fetch_component_stats.py [--seasons 2021..2025] [--force]
Writes draft/backtest/component_stats_<year>.json (one file per season) and
draft/backtest/vegas_lines_2021_2025.json.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

# 2026 appended 2026-08-16 for the v6 deployment (Cory: "YES on V6") — the
# program doc §7 named the vegas store's week-1 lines for the deployment
# season as a prerequisite. The 2026 COMPONENT store cannot exist yet (no
# games played); only the vegas arm of the fetch gains a season.
SEASONS = (2021, 2022, 2023, 2024, 2025, 2026)
FIRST_WEEK, LAST_WEEK = 1, 18          # regular season only; consumers trim to 17
POSITION_GROUPS = ("QB", "RB", "WR", "TE")

URL_PRIMARY = ("https://github.com/nflverse/nflverse-data/releases/download/"
               "player_stats/player_stats_{year}.parquet")
URL_FALLBACK = ("https://github.com/nflverse/nflverse-data/releases/download/"
                "stats_player/stats_player_week_{year}.parquet")
URL_SCHEDULES = ("https://github.com/nflverse/nflverse-data/releases/download/"
                 "schedules/games.csv")

#: source column -> store key. Two source schemas exist; aliases map to ONE
#: store key and the first present column wins (grade.py's put-vs-add lesson:
#: aliases must never accumulate).
COLUMN_MAP = {
    "attempts": "pass_att",
    "passing_yards": "pass_yd",
    "passing_tds": "pass_td",
    "interceptions": "pass_int",             # player_stats_<year> schema
    "passing_interceptions": "pass_int",     # stats_player_week_<year> schema
    "passing_2pt_conversions": "pass_2pt",
    "carries": "rush_att",
    "rushing_yards": "rush_yd",
    "rushing_tds": "rush_td",
    "rushing_2pt_conversions": "rush_2pt",
    "targets": "tgt",
    "receptions": "rec",
    "receiving_yards": "rec_yd",
    "receiving_tds": "rec_td",
    "receiving_2pt_conversions": "rec_2pt",
    "target_share": "tgt_share",
}
#: components of ONE key — these ACCUMULATE (grade._FUM_LOST_COLS, same rule).
FUM_LOST_COLS = ("rushing_fumbles_lost", "receiving_fumbles_lost",
                 "sack_fumbles_lost")
#: every stat key a stored player line may carry (metadata keys aside).
STAT_KEYS = tuple(sorted(set(COLUMN_MAP.values()) | {"fum_lost"}))
META_KEYS = ("pos", "team")
#: store stat key -> our scoring-engine key (identity for the scored subset;
#: volume/usage keys carry no scoring key on purpose).
SCORING_KEYS = ("pass_yd", "pass_td", "pass_int", "pass_2pt", "rush_yd",
                "rush_td", "rush_2pt", "rec", "rec_yd", "rec_td", "rec_2pt",
                "fum_lost")

MISSING_VS_ZERO = (
    "a player-week ABSENT from a week's players map is MISSING DATA (no "
    "offensive stat row that week), never a zero; inside a present row an "
    "absent stat key is a zero of that stat (zero-valued keys are stripped "
    "at build time); row-presence means 'was on a field', exactly as the "
    "weekly points stores encode it")


def store_path(season: int) -> Path:
    return HERE / f"component_stats_{season}.json"


# ── fetch ────────────────────────────────────────────────────────────────────

def _download(url: str, dest: Path) -> bool:
    """Fetch url to dest. False on any HTTP/transport failure (the caller
    records the miss and tries the next URL — a 404 body must never be parsed
    as a parquet)."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "maga-league-backtest"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            if resp.status != 200:
                return False
            dest.write_bytes(resp.read())
        return dest.stat().st_size > 1000
    except Exception:
        return False


def _crosswalk() -> dict:
    """gsis_id -> sleeper_id via nfl_data_py.import_ids() — the same two-source
    logic grade.crosswalk_gsis_to_sleeper uses, minus the Sleeper players dump
    (api.sleeper.app is unreachable from this sandbox; measured 2026-08-16 the
    ids table alone covers the committed stores' population completely)."""
    import nfl_data_py as nfl
    ids = nfl.import_ids()
    cw = {}
    for g, s in zip(ids["gsis_id"], ids["sleeper_id"]):
        if g == g and s == s and g is not None and s is not None:
            gs, ss = str(g), str(s)
            if gs and gs != "nan" and ss and ss != "nan":
                cw[gs] = str(int(float(ss))) if ss.replace(".", "").isdigit() else ss
    return cw


def _clean(v):
    """A stored number: ints stay ints, floats round to 4, NaN/zero -> None
    (caller strips)."""
    if v is None or v != v:
        return None
    f = float(v)
    if f == 0.0:
        return None
    if f == int(f):
        return int(f)
    return round(f, 4)


def build_season(df, crosswalk: dict) -> tuple[list, dict]:
    """(weeks, counts) from a raw parquet frame, either schema. Deterministic:
    weeks ascending, players sorted by key, stat keys sorted."""
    cols = set(df.columns)
    team_col = "recent_team" if "recent_team" in cols else "team"
    if "season_type" in cols:
        df = df[df["season_type"] == "REG"]
    df = df[(df["week"] >= FIRST_WEEK) & (df["week"] <= LAST_WEEK)]
    df = df[df["position_group"].isin(POSITION_GROUPS)]

    by_week: dict[int, dict] = {}
    unmapped = set()
    for row in df.to_dict("records"):
        gsis = str(row.get("player_id"))
        sid = crosswalk.get(gsis)
        key = sid if sid else f"gsis:{gsis}"
        if not sid:
            unmapped.add(gsis)
        line: dict = {}
        for src, dst in COLUMN_MAP.items():
            if src in row and dst not in line:
                v = _clean(row.get(src))
                if v is not None:
                    line[dst] = v
        fl = 0.0
        for c in FUM_LOST_COLS:
            v = row.get(c)
            if isinstance(v, (int, float)) and v == v:
                fl += v
        if fl:
            line["fum_lost"] = int(fl) if fl == int(fl) else round(fl, 4)
        pos = row.get("position_group")
        team = row.get(team_col)
        line["pos"] = str(pos)
        if isinstance(team, str) and team:
            line["team"] = team
        wk = int(row["week"])
        players = by_week.setdefault(wk, {})
        if key in players:
            # two rows for one player-week (mid-week trade artifacts): stats
            # accumulate, metadata keeps the first row's values.
            prev = players[key]
            for k in STAT_KEYS:
                if k in line:
                    a, b = prev.get(k, 0), line[k]
                    s = a + b
                    prev[k] = int(s) if float(s) == int(s) else round(float(s), 4)
        else:
            players[key] = line

    weeks = [{"week": w, "players": {k: {kk: by_week[w][k][kk]
                                         for kk in sorted(by_week[w][k])}
                                     for k in sorted(by_week[w])}}
             for w in sorted(by_week)]
    n_rows = sum(len(w["players"]) for w in weeks)
    pids = {k for w in weeks for k in w["players"]}
    counts = {"raw_rows": int(len(df)), "kept_player_weeks": n_rows,
              "players": len(pids),
              "sleeper_mapped_players": len([p for p in pids if not p.startswith("gsis:")]),
              "unmapped_gsis_players": len(unmapped)}
    return weeks, counts


def fetch_season(season: int, crosswalk: dict, workdir: Path,
                 force: bool = False) -> dict:
    """Fetch + build + write one season's store. Returns a status record."""
    import pandas as pd
    tried = []
    raw = workdir / f"component_raw_{season}.parquet"
    df = None
    for url in (URL_PRIMARY.format(year=season), URL_FALLBACK.format(year=season)):
        ok = _download(url, raw)
        tried.append({"url": url, "ok": ok})
        if ok:
            try:
                df = pd.read_parquet(raw, engine="fastparquet")
            except Exception:
                tried[-1]["ok"] = False
                df = None
                continue
            break
    if df is None:
        return {"season": season, "status": "unreachable", "tried": tried}

    weeks, counts = build_season(df, crosswalk)
    if counts["kept_player_weeks"] < 3000:
        return {"season": season, "status": "refused_too_small",
                "why": "a season with <3000 offensive player-weeks is a bad "
                       "fetch, not a season — refused rather than committed",
                "counts": counts, "tried": tried}

    src_url = next(t["url"] for t in tried if t["ok"])
    path = store_path(season)
    if path.exists() and not force:
        try:
            old = json.loads(path.read_text())
        except ValueError:
            old = {}
        if (old.get("weeks") == weeks
                and old.get("provenance", {}).get("url") == src_url):
            return {"season": season, "status": "unchanged", "path": path.name,
                    "counts": counts}

    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/fetch_component_stats.py",
        "_note": ("Per-player weekly COMPONENT stats (usage volume + scoring "
                  "components), regular season, offense only, trimmed to the "
                  "columns v5 consumes. Missing-vs-zero rule: " + MISSING_VS_ZERO),
        "season": season,
        "provenance": {
            "url": src_url,
            "tried": tried,
            "fetched": _dt.date.today().isoformat(),
            "weeks_span": [FIRST_WEEK, LAST_WEEK],
            "season_type": "REG",
            "position_groups": list(POSITION_GROUPS),
            "columns_kept": list(STAT_KEYS) + list(META_KEYS),
            "crosswalk": "nfl_data_py.import_ids() gsis_id -> sleeper_id; "
                         "unmapped players keyed gsis:<id>, never dropped",
            **counts,
        },
        "weeks": weeks,
    }
    path.write_text(json.dumps(doc, indent=1))
    return {"season": season, "status": "written", "path": path.name,
            "counts": counts}


# ── the Vegas lines store ────────────────────────────────────────────────────

def vegas_path() -> Path:
    return HERE / f"vegas_lines_{SEASONS[0]}_{SEASONS[-1]}.json"


def fetch_vegas(workdir: Path, force: bool = False) -> dict:
    """Fetch + trim + write the closing-lines store for SEASONS. One file —
    ~272 regular-season games per season, six fields per game."""
    import pandas as pd
    raw = workdir / "games.csv"
    tried = [{"url": URL_SCHEDULES, "ok": _download(URL_SCHEDULES, raw)}]
    if not tried[0]["ok"]:
        return {"store": "vegas", "status": "unreachable", "tried": tried}
    df = pd.read_csv(raw)
    sub = df[(df["season"] >= SEASONS[0]) & (df["season"] <= SEASONS[-1])
             & (df["game_type"] == "REG")]
    seasons: dict[str, list] = {}
    dropped = 0
    for row in sub.sort_values(["season", "week", "home_team"]).to_dict("records"):
        sp, tl = row.get("spread_line"), row.get("total_line")
        if sp is None or sp != sp or tl is None or tl != tl:
            dropped += 1          # a game with no line is MISSING, never 0-0
            continue
        seasons.setdefault(str(int(row["season"])), []).append({
            "week": int(row["week"]),
            "home": str(row["home_team"]), "away": str(row["away_team"]),
            "spread_line": round(float(sp), 1), "total_line": round(float(tl), 1),
        })
    counts = {s: len(g) for s, g in seasons.items()}
    path = vegas_path()
    if path.exists() and not force:
        try:
            old = json.loads(path.read_text())
        except ValueError:
            old = {}
        if old.get("seasons") == seasons:
            return {"store": "vegas", "status": "unchanged", "path": path.name,
                    "counts": counts}
    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/fetch_component_stats.py",
        "_note": ("Per-game CLOSING spread_line/total_line, regular season, "
                  f"{SEASONS[0]}-{SEASONS[-1]}, trimmed from the nflverse schedules dataset. "
                  "spread_line is the expected HOME margin (verified: 2021 wk1 "
                  "TB -10 home vs DAL stored as +10.0), so implied_home = "
                  "total_line/2 + spread_line/2. A game with no line is "
                  "ABSENT, never stored as zeros. Leakage rule for season-Y "
                  "season-total features: WEEK 1 lines only — they close "
                  "before any season-Y game; deeper weeks are in-season "
                  "information. Context every Vegas feature must be read "
                  "against: EXP-WEEKLY-ENV's perfect-foresight team game-total "
                  "ceiling was +0.23 weekly MAE."),
        "provenance": {"url": URL_SCHEDULES, "tried": tried,
                       "fetched": _dt.date.today().isoformat(),
                       "season_type": "REG", "games_per_season": counts,
                       "games_without_lines_dropped": dropped},
        "seasons": seasons,
    }
    path.write_text(json.dumps(doc, indent=1))
    return {"store": "vegas", "status": "written", "path": path.name,
            "counts": counts}


def load_vegas() -> dict:
    return json.loads(vegas_path().read_text())


def implied_team_totals(season: int, first_week: int = 1,
                        last_week: int = 1) -> dict:
    """{team: mean implied points/game over the window}. Default window is
    WEEK 1 ONLY — the only slice a season-total projector of season Y may
    read (closes before any Y game). Teams without a game in the window are
    ABSENT, never zeroed."""
    doc = load_vegas()
    acc: dict[str, list] = {}
    for g in doc["seasons"].get(str(season), []):
        if not (first_week <= g["week"] <= last_week):
            continue
        home = g["total_line"] / 2.0 + g["spread_line"] / 2.0
        away = g["total_line"] - home
        acc.setdefault(g["home"], []).append(home)
        acc.setdefault(g["away"], []).append(away)
    return {t: round(sum(v) / len(v), 3) for t, v in sorted(acc.items())}


# ── readers (the store's own access path — consumers import, never re-parse) ─

def load_store(season: int) -> dict:
    return json.loads(store_path(season).read_text())


def component_weeks(season: int, first_week: int = 1, last_week: int = 17) -> dict:
    """{pid: {week: {stat: value}}} — row-presence means 'was on a field';
    absence is missing data, per the store's rule."""
    doc = load_store(season)
    out: dict[str, dict[int, dict]] = {}
    for w in doc["weeks"]:
        if not (first_week <= w["week"] <= last_week):
            continue
        for pid, line in w["players"].items():
            out.setdefault(str(pid), {})[int(w["week"])] = line
    return out


def season_components(season: int, last_week: int = 17) -> dict:
    """{pid: {stat: season sum, 'games': row count, 'pos': ..., 'team': last}}
    over weeks 1..last_week. Sums cover STAT_KEYS only."""
    out: dict[str, dict] = {}
    for pid, rows in component_weeks(season, 1, last_week).items():
        agg: dict = {"games": 0}
        team = None
        pos = None
        for wk in sorted(rows):
            line = rows[wk]
            agg["games"] += 1
            for k in STAT_KEYS:
                if k in line:
                    agg[k] = round(agg.get(k, 0) + line[k], 4)
            team = line.get("team", team)
            pos = line.get("pos", pos)
        if pos:
            agg["pos"] = pos
        if team:
            agg["team"] = team
        out[pid] = agg
    return out


def scored_weekly_points(season: int, scoring_cfg: dict,
                         last_week: int = 17) -> dict:
    """{pid: {week: points}} — component lines scored under a caller-supplied
    table (the consumer passes the frozen table from the committed weekly
    points stores, fingerprint and all). This is how 2021/2022 get points
    parity with 2023-25: same engine, same table, same rounding."""
    import scoring as scoring_mod
    out: dict[str, dict[int, float]] = {}
    for pid, rows in component_weeks(season, 1, last_week).items():
        for wk, line in rows.items():
            stat_line = {k: line[k] for k in SCORING_KEYS if k in line}
            out.setdefault(pid, {})[wk] = round(
                scoring_mod.score_stat_line(stat_line, scoring_cfg), 2)
    return out


def frozen_scoring_table() -> dict:
    """The scoring table every committed weekly-points store was written under
    — read from the 2023 store's first week (one fingerprint across all three
    stores; asserted by the parity test)."""
    doc = json.loads((HERE / "nflverse_weekly_points_2023.json").read_text())
    return doc["weeks"][0]["scoring"]


# ── K (KICKER) STORE — additive, does NOT touch POSITION_GROUPS ────────────
#
# register 2e (DEFECT-REGISTER.md): K/DEF carry gaussian_z calibration
# ceilings on the live board because fetch_season's POSITION_GROUPS =
# (QB, RB, WR, TE) above never fetches a kicker row — kickers are
# position_group "SPEC". THAT CONSTANT IS DELIBERATELY UNTOUCHED (roughly
# two dozen v5/v6 consumers assume the store it feeds is offense-only skill
# positions; widening it would silently feed K rows into every one of
# them — projection_error's CALIBRATION_POSITIONS/ROSTERED_POSITIONS is
# untouched for the identical reason, see that module). This section is a
# SEPARATE, additively-scoped store instead: component_stats_kicker_
# <season>.json, built by its own functions below, read by nothing that
# assumes an offense-only population.
#
# ⚠ THE SCHEMA GOTCHA THIS SECTION EXISTS TO NAME. URL_PRIMARY
# (player_stats_<year>.parquet) is not merely SLOWER or less current for
# kickers — VERIFIED 2026-08-19 by downloading and inspecting it directly
# (season 2024: 5,597 rows, 53 columns, position_group counts QB 697 / RB
# 1480 / WR 2238 / TE 1137 / DB 18 / SPEC 14 [all punters, position=="P",
# zero "K" rows] / OL 9 / LB 3 / DL 1) — it carries NO fg_made / pat_made
# columns and NO position=="K" rows AT ALL, for this or (by construction,
# same release schema) any other season. This is a SCHEMA difference, not a
# URL-availability fallback: URL_FALLBACK (stats_player_week_<year>.parquet,
# nflverse's restructured "stats_player" release) is the ONLY schema of the
# two that carries kicking columns at all, and it is confirmed present,
# non-empty, and carrying real 43-kicker/569-row 2024 data (matching
# register 2e's own probe exactly) for every season 2021-2025 (each
# downloaded and parsed live, 2026-08-19). So the kicker fetch below always
# goes straight to URL_FALLBACK rather than trying URL_PRIMARY first the way
# fetch_season does — trying URL_PRIMARY first would silently "succeed"
# (HTTP 200, valid parquet) and hand back a frame with zero kicker rows,
# which is exactly the false-negative-that-looks-clean shape Rule 3e warns
# about (CLAUDE.md), not a real absence.
#
# ⚠ THE fgm_50p GOTCHA, NAMED IN REGISTER 2e AND VERIFIED HERE AGAINST REAL
# 2024 DATA. The league scoring table prices ONE key, fgm_50p, for every
# 50-plus-yard field goal, but the source splits it across TWO columns,
# fg_made_50_59 and fg_made_60_. Mapping only fg_made_50_59 silently drops
# every 60+ yard kick — verified against real rows this would have broken:
# Brandon Aubrey's 65-yarder (DAL wk3 2024), Joey Slye's 63-yarder (NE wk4),
# Aubrey's 60-yarder (DAL wk4), Tyler Bass's 61-yarder (BUF wk9) — 4 of 569
# 2024 rows, each a real 60+ yard field goal a single-column map would have
# zeroed. KICKER_FGM50P_COLS accumulates both — the same COMPONENTS-of-ONE-
# key pattern FUM_LOST_COLS above already uses for fumbles.
#
# fgmiss/xpmiss: the league scoring table carries ONE flat key each (fgmiss
# 0.0, xpmiss -1.0), not banded by distance, so a missed OR blocked kick of
# any distance accumulates into the one key. VERIFIED against real 2024
# data: fg_att == fg_made + fg_missed + fg_blocked and pat_att == pat_made +
# pat_missed + pat_blocked hold EXACTLY, 0 mismatches across all 569 rows —
# a blocked kick is a distinct event from an ordinary miss upstream, but the
# league does not price it separately, so it is folded into the same miss
# key (fg_blocked -> fgmiss, pat_blocked -> xpmiss) rather than silently
# discarded, the same accumulate-don't-drop discipline as fgm_50p.
KICKER_URL = URL_FALLBACK  # the ONLY schema with kicking columns — see above

#: source column -> store key, first-writer-wins (no aliasing collisions here;
#: unlike COLUMN_MAP, every kicker source column maps to exactly one key).
KICKER_COLUMN_MAP = {
    "fg_made_0_19": "fgm_0_19",
    "fg_made_20_29": "fgm_20_29",
    "fg_made_30_39": "fgm_30_39",
    "fg_made_40_49": "fgm_40_49",
    "pat_made": "xpm",
}
KICKER_FGM50P_COLS = ("fg_made_50_59", "fg_made_60_")   # ACCUMULATE -> fgm_50p
KICKER_FGMISS_COLS = ("fg_missed", "fg_blocked")        # ACCUMULATE -> fgmiss
KICKER_XPMISS_COLS = ("pat_missed", "pat_blocked")      # ACCUMULATE -> xpmiss
KICKER_STAT_KEYS = tuple(sorted(
    set(KICKER_COLUMN_MAP.values()) | {"fgm_50p", "fgmiss", "xpmiss"}))
#: every kicker stat key IS a scoring key (register 2e: "1:1 map to all eight
#: kicker scoring keys") — unlike offense there is no volume/usage subset
#: that never gets priced.
KICKER_SCORING_KEYS = KICKER_STAT_KEYS
KICKER_META_KEYS = ("pos", "team")


def kicker_store_path(season: int) -> Path:
    return HERE / f"component_stats_kicker_{season}.json"


def build_kicker_season(df, crosswalk: dict) -> tuple[list, dict]:
    """(weeks, counts) from a raw stats_player_week frame — PURE, mirrors
    build_season's shape and its missing-vs-zero convention exactly.
    Filtered to `position == "K"` (NOT `position_group == "SPEC"`, which
    also carries punters `"P"` and long-snappers `"LS"` — verified 2024:
    SPEC-equivalent rows split K 569 / P 559 / LS 66 by `position`, so
    gating on position_group alone would triple-count the store)."""
    cols = set(df.columns)
    team_col = "team" if "team" in cols else "recent_team"
    if "season_type" in cols:
        df = df[df["season_type"] == "REG"]
    df = df[(df["week"] >= FIRST_WEEK) & (df["week"] <= LAST_WEEK)]
    df = df[df["position"] == "K"]

    by_week: dict[int, dict] = {}
    unmapped = set()
    for row in df.to_dict("records"):
        gsis = str(row.get("player_id"))
        sid = crosswalk.get(gsis)
        key = sid if sid else f"gsis:{gsis}"
        if not sid:
            unmapped.add(gsis)
        line: dict = {}
        for src, dst in KICKER_COLUMN_MAP.items():
            if src in row:
                v = _clean(row.get(src))
                if v is not None:
                    line[dst] = v

        def _accumulate(cols_):
            total = 0.0
            for c in cols_:
                v = row.get(c)
                if isinstance(v, (int, float)) and v == v:
                    total += v
            return total

        fgm50 = _accumulate(KICKER_FGM50P_COLS)
        if fgm50:
            line["fgm_50p"] = int(fgm50) if fgm50 == int(fgm50) else round(fgm50, 4)
        fgmiss = _accumulate(KICKER_FGMISS_COLS)
        if fgmiss:
            line["fgmiss"] = int(fgmiss) if fgmiss == int(fgmiss) else round(fgmiss, 4)
        xpmiss = _accumulate(KICKER_XPMISS_COLS)
        if xpmiss:
            line["xpmiss"] = int(xpmiss) if xpmiss == int(xpmiss) else round(xpmiss, 4)

        line["pos"] = "K"
        team = row.get(team_col)
        if isinstance(team, str) and team:
            line["team"] = team
        wk = int(row["week"])
        players = by_week.setdefault(wk, {})
        if key in players:
            # two rows for one player-week (mid-week trade artifacts): stats
            # accumulate, metadata keeps the first row's values — same rule
            # build_season uses above.
            prev = players[key]
            for k in KICKER_STAT_KEYS:
                if k in line:
                    a, b = prev.get(k, 0), line[k]
                    s = a + b
                    prev[k] = int(s) if float(s) == int(s) else round(float(s), 4)
        else:
            players[key] = line

    weeks = [{"week": w, "players": {k: {kk: by_week[w][k][kk]
                                         for kk in sorted(by_week[w][k])}
                                     for k in sorted(by_week[w])}}
             for w in sorted(by_week)]
    n_rows = sum(len(w["players"]) for w in weeks)
    pids = {k for w in weeks for k in w["players"]}
    counts = {"raw_rows": int(len(df)), "kept_player_weeks": n_rows,
              "players": len(pids),
              "sleeper_mapped_players": len([p for p in pids if not p.startswith("gsis:")]),
              "unmapped_gsis_players": len(unmapped)}
    return weeks, counts


def fetch_kicker_season(season: int, crosswalk: dict, workdir: Path,
                        force: bool = False) -> dict:
    """Fetch + build + write one season's KICKER store. Always URL_FALLBACK
    (KICKER_URL) — see the module note above for why URL_PRIMARY is never
    tried for kickers."""
    import pandas as pd
    raw = workdir / f"kicker_raw_{season}.parquet"
    url = KICKER_URL.format(year=season)
    ok = _download(url, raw)
    tried = [{"url": url, "ok": ok}]
    if not ok:
        return {"season": season, "status": "unreachable", "tried": tried}
    try:
        df = pd.read_parquet(raw, engine="fastparquet")
    except Exception:
        return {"season": season, "status": "unreachable",
                "tried": [{"url": url, "ok": False}]}

    weeks, counts = build_kicker_season(df, crosswalk)
    if counts["kept_player_weeks"] < 400:
        return {"season": season, "status": "refused_too_small",
                "why": "a season with <400 kicker player-weeks is a bad "
                       "fetch, not a season — refused rather than committed",
                "counts": counts, "tried": tried}

    path = kicker_store_path(season)
    if path.exists() and not force:
        try:
            old = json.loads(path.read_text())
        except ValueError:
            old = {}
        if old.get("weeks") == weeks and old.get("provenance", {}).get("url") == url:
            return {"season": season, "status": "unchanged", "path": path.name,
                    "counts": counts}

    doc = {
        "_territory": "TERRITORY: A — written by draft/backtest/fetch_component_stats.py "
                      "(TERRITORY-GRANT: C, register 2e, 2026-08-19)",
        "_note": ("Per-KICKER weekly component stats (all 8 kicker scoring "
                  "keys), regular season, trimmed to the columns the kicker "
                  "scoring table consumes. SEPARATE from component_stats_"
                  "<season>.json on purpose — POSITION_GROUPS above is "
                  "untouched and this store is read by nothing that assumes "
                  "an offense-only population. Missing-vs-zero rule: "
                  + MISSING_VS_ZERO),
        "season": season,
        "provenance": {
            "url": url, "tried": tried,
            "fetched": _dt.date.today().isoformat(),
            "weeks_span": [FIRST_WEEK, LAST_WEEK], "season_type": "REG",
            "position_filter": "K (stats_player_week's `position` column, "
                               "NOT position_group == 'SPEC', which also "
                               "carries P and LS)",
            "columns_kept": list(KICKER_STAT_KEYS) + list(KICKER_META_KEYS),
            "crosswalk": "nfl_data_py.import_ids() gsis_id -> sleeper_id; "
                        "unmapped players keyed gsis:<id>, never dropped",
            **counts,
        },
        "weeks": weeks,
    }
    path.write_text(json.dumps(doc, indent=1))
    return {"season": season, "status": "written", "path": path.name,
            "counts": counts}


def load_kicker_store(season: int) -> dict:
    return json.loads(kicker_store_path(season).read_text())


def kicker_weeks(season: int, first_week: int = 1, last_week: int = 17) -> dict:
    """{pid: {week: {stat: value}}} for the kicker store — same shape and
    missing-vs-zero rule as component_weeks."""
    doc = load_kicker_store(season)
    out: dict[str, dict[int, dict]] = {}
    for w in doc["weeks"]:
        if not (first_week <= w["week"] <= last_week):
            continue
        for pid, line in w["players"].items():
            out.setdefault(str(pid), {})[int(w["week"])] = line
    return out


def kicker_season_totals(season: int, last_week: int = 17) -> dict:
    """{pid: {stat: season sum, 'games': row count, 'pos', 'team'}} — the
    kicker sibling of season_components."""
    out: dict[str, dict] = {}
    for pid, rows in kicker_weeks(season, 1, last_week).items():
        agg: dict = {"games": 0}
        team = None
        for wk in sorted(rows):
            line = rows[wk]
            agg["games"] += 1
            for k in KICKER_STAT_KEYS:
                if k in line:
                    agg[k] = round(agg.get(k, 0) + line[k], 4)
            team = line.get("team", team)
        agg["pos"] = "K"
        if team:
            agg["team"] = team
        out[pid] = agg
    return out


def scored_kicker_weekly_points(season: int, scoring_cfg: dict,
                                last_week: int = 17) -> dict:
    """{pid: {week: points}} — kicker component lines scored under a
    caller-supplied table, the kicker sibling of scored_weekly_points."""
    import scoring as scoring_mod
    out: dict[str, dict[int, float]] = {}
    for pid, rows in kicker_weeks(season, 1, last_week).items():
        for wk, line in rows.items():
            stat_line = {k: line[k] for k in KICKER_SCORING_KEYS if k in line}
            out.setdefault(pid, {})[wk] = round(
                scoring_mod.score_stat_line(stat_line, scoring_cfg), 2)
    return out


# ── DEF (TEAM DEFENSE) STORE — additive, does NOT touch POSITION_GROUPS ────
#
# register 2e: "No team-defence rows exist in the nflverse player file at
# all — it carries individual defenders (DB/DL/LB), not units." TRUE of the
# PLAYER-level releases (player_stats / stats_player_week, both probed for
# this repo already) — but nflverse also publishes a TEAM-level release,
# stats_team/stats_team_week_<year>.parquet, discovered 2026-08-19 by
# reading nflreadr's own R source (`load_team_stats()`, `R/load_stats.R`)
# rather than guessing a URL: `.stat_type = "team"` produces
# `stats_team_<summary_level>_<season>.parquet` on the exact same release
# host as everything else this file fetches. VERIFIED LIVE for all five
# seasons 2021-2025: 570 team-week rows each (32 teams x ~18 weeks incl. a
# handful of playoff weeks), with real defensive AND kicking columns —
# def_sacks, def_interceptions, def_tds, fumble_recovery_opp/tds,
# special_teams_tds, def_safeties, def_*_blocks, fg_made_*, pat_made, and
# 138 columns total. Register 2e's own deferral ("A team-week defence
# construction from stats_team_week or pbp... NOT attempted before the
# 2026-08-20 keeper lock") named this exact file as the path and did not
# yet have it fetched; this section is that construction.
#
# ⚠ THE TD-CATEGORY QUESTION, AND WHY IT DOES NOT MATTER FOR POINTS. Three
# columns can carry a defensive/ST touchdown: def_tds, fumble_recovery_tds,
# special_teams_tds. VERIFIED against every 2024 team-week with any of the
# three nonzero (55 rows): AT MOST ONE of the three is nonzero on any given
# team-week (sum 31 + 21 + 19 = 71 non-offensive TDs all season, a plausible
# league-wide total, with zero rows carrying two nonzero categories) — so
# they are mutually exclusive events, not overlapping counts of the same
# play. That matters less than it sounds: this league's scoring table prices
# def_td, fum_rec_td AND def_st_td identically at 6.0 (draft/config/
# league_config.json), so even a mis-attributed row (say, a scoop-and-score
# nflverse books as def_tds that this mapping calls fum_rec_td) still scores
# the same 6 points — the category question is a documentation question
# here, not a points-integrity risk.
#
# ⚠ fum_rec IS ADDITIVE WITH fum_rec_td, NOT NET OF IT — VERIFIED, NOT
# ASSUMED. Every 2024 row with fumble_recovery_tds > 0 also has
# fumble_recovery_opp >= fumble_recovery_tds (typically 1 and 1) — the
# recovery COUNT already includes the one that was returned for a score, it
# is not a separate "non-scoring recoveries" tally. So a fumble returned for
# a touchdown correctly pays BOTH fum_rec (2.0, recovering it) AND
# fum_rec_td (6.0, scoring with it) — the standard fantasy convention, and
# the reason this file does NOT subtract fumble_recovery_tds from
# fumble_recovery_opp before storing fum_rec.
#
# ⚠ THE TEAM-CODE GOTCHA. nflverse spells the Rams "LA"; the board (Sleeper,
# and every DST a drafter actually rosters) spells them "LAR" — an EXISTING,
# already-shared table names this exact pair (`adp.TEAM_ALIASES = {"LA":
# "LAR", ...}`, `adp.NFL_TEAMS` for "the 32 codes Sleeper actually emits").
# Every team code this section stores (the defense's own key, and the
# opponent code used for the points-allowed join) is normalized through
# `adp._norm_team` — imported READ-ONLY, nothing in adp.py edited, the same
# reuse-not-reinvent discipline the kicker/K section above uses for
# `lab_projections.walk_forward`. Skipping this would silently key the Rams'
# DST "LA" forever and never match a single consumer that reads Sleeper's
# "LAR" — a clean-looking, fully-populated, wrong store: exactly the
# false-negative shape Rule 3e names.
#
# POINTS ALLOWED comes from nowhere in stats_team_week (no such column) —
# it is the OPPONENT's own final score that game, joined from the same
# schedules release `fetch_vegas` above already reads (games.csv), by
# (season, week, opponent_team) -> that team's score. A team on a bye has NO
# row in stats_team_week at all (no game, no stats), so it never reaches
# this join and never gets a fabricated points-allowed band — ABSENT, not
# zero, the same rule `implied_team_totals` states for a bye week above.
DEF_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
          "stats_team/stats_team_week_{year}.parquet")

#: source column -> store key, first-writer-wins (each source column maps to
#: exactly one key; no aliasing collisions in this schema).
DEF_COLUMN_MAP = {
    "def_sacks": "sack",
    "def_interceptions": "int",
    "def_safeties": "safe",
    "fumble_recovery_opp": "fum_rec",
    "fumble_recovery_tds": "fum_rec_td",
    "def_tds": "def_td",
    "special_teams_tds": "def_st_td",
    "def_fumbles_forced": "ff",
}
#: components of ONE key — ACCUMULATE (same FUM_LOST_COLS/KICKER_FGM50P_COLS
#: pattern). The league prices blk_kick at 0.0 today, but a kick blocked by
#: this team's defense/special-teams is one event regardless of which of the
#: three kick types it blocked, so all three fold into the one key rather
#: than being silently dropped if the table is ever repriced.
DEF_BLK_KICK_COLS = ("def_punt_blocks", "def_pat_blocks", "def_fg_blocks")

#: Points-allowed bands, in the league's own key vocabulary, LOW to HIGH.
#: Encoded the same way Sleeper's own realized DST rows encode them: ONE
#: band key present with value 1 for the band that applies that week, the
#: rest simply absent (a banded categorical stat, not seven numeric fields).
PTS_ALLOW_BANDS = (
    (0, 0, "pts_allow_0"), (1, 6, "pts_allow_1_6"), (7, 13, "pts_allow_7_13"),
    (14, 20, "pts_allow_14_20"), (21, 27, "pts_allow_21_27"),
    (28, 34, "pts_allow_28_34"), (35, None, "pts_allow_35p"),
)


def pts_allow_band(points_allowed) -> str:
    """The league's points-allowed band key for one team-week's realized
    points allowed. PURE, and the single definition — the bands above are
    declared once, not re-derived at each call site."""
    p = int(points_allowed)
    for lo, hi, key in PTS_ALLOW_BANDS:
        if hi is None:
            if p >= lo:
                return key
        elif lo <= p <= hi:
            return key
    raise ValueError(f"points_allowed {p} matched no band")  # unreachable: bands are exhaustive


DEF_STAT_KEYS = tuple(sorted(
    set(DEF_COLUMN_MAP.values()) | {"blk_kick"} | {k for _, _, k in PTS_ALLOW_BANDS}))
DEF_SCORING_KEYS = DEF_STAT_KEYS
DEF_META_KEYS = ("pos", "team")


def def_store_path(season: int) -> Path:
    return HERE / f"component_stats_def_{season}.json"


def _team_score_lookup(games_df) -> dict:
    """{(season, week, board_team_code): points that team scored} — REG
    season only, from the schedules frame `fetch_vegas` also reads. PURE.
    Codes are normalized through adp._norm_team so a lookup by a
    stats_team_week opponent code (already normalized by the caller) always
    hits."""
    import sys as _sys
    if str(HERE.parent) not in _sys.path:
        _sys.path.insert(0, str(HERE.parent))
    import adp as ADP

    out = {}
    reg = games_df[games_df["game_type"] == "REG"]
    for row in reg.to_dict("records"):
        season, week = row.get("season"), row.get("week")
        if season is None or week is None:
            continue
        hs, aws = row.get("home_score"), row.get("away_score")
        if hs is None or hs != hs or aws is None or aws != aws:
            continue  # an unplayed/unscored game is ABSENT, never a 0-0 fabrication
        out[(int(season), int(week), ADP._norm_team(row.get("home_team")))] = float(hs)
        out[(int(season), int(week), ADP._norm_team(row.get("away_team")))] = float(aws)
    return out


def build_def_season(df, games_df) -> tuple[list, dict]:
    """(weeks, counts) from a raw stats_team_week frame plus the schedules
    frame (for points allowed) — PURE. Keyed by BOARD team code (normalized
    via adp._norm_team), never a crosswalked player id — a team defense has
    no gsis/sleeper player id to cross."""
    import sys as _sys
    if str(HERE.parent) not in _sys.path:
        _sys.path.insert(0, str(HERE.parent))
    import adp as ADP

    scores = _team_score_lookup(games_df)

    cols = set(df.columns)
    if "season_type" in cols:
        df = df[df["season_type"] == "REG"]
    df = df[(df["week"] >= FIRST_WEEK) & (df["week"] <= LAST_WEEK)]

    by_week: dict[int, dict] = {}
    unknown_team_codes = set()
    missing_points_allowed = 0
    for row in df.to_dict("records"):
        team = ADP._norm_team(row.get("team"))
        opp = ADP._norm_team(row.get("opponent_team"))
        if team not in ADP.NFL_TEAMS:
            unknown_team_codes.add(str(row.get("team")))
            continue
        line: dict = {}
        for src, dst in DEF_COLUMN_MAP.items():
            if src in row:
                v = _clean(row.get(src))
                if v is not None:
                    line[dst] = v
        blk = 0.0
        for c in DEF_BLK_KICK_COLS:
            v = row.get(c)
            if isinstance(v, (int, float)) and v == v:
                blk += v
        if blk:
            line["blk_kick"] = int(blk) if blk == int(blk) else round(blk, 4)

        season = row.get("season")
        wk = int(row["week"])
        allowed = scores.get((int(season), wk, opp)) if season is not None else None
        if allowed is None:
            missing_points_allowed += 1
        else:
            line[pts_allow_band(allowed)] = 1

        line["pos"] = "DEF"
        line["team"] = team
        players = by_week.setdefault(wk, {})
        if team in players:
            # two rows for one team-week should not happen for a team-level
            # release, but accumulate rather than overwrite if it ever does
            # — same discipline as build_season/build_kicker_season.
            prev = players[team]
            for k in DEF_STAT_KEYS:
                if k in line:
                    a, b = prev.get(k, 0), line[k]
                    s = a + b
                    prev[k] = int(s) if float(s) == int(s) else round(float(s), 4)
        else:
            players[team] = line

    weeks = [{"week": w, "players": {k: {kk: by_week[w][k][kk]
                                         for kk in sorted(by_week[w][k])}
                                     for k in sorted(by_week[w])}}
             for w in sorted(by_week)]
    n_rows = sum(len(w["players"]) for w in weeks)
    teams = {k for w in weeks for k in w["players"]}
    counts = {"raw_rows": int(len(df)), "kept_team_weeks": n_rows,
              "teams": len(teams), "unknown_team_codes": len(unknown_team_codes),
              "missing_points_allowed": missing_points_allowed}
    return weeks, counts


def fetch_def_season(season: int, games_df, workdir: Path,
                     force: bool = False) -> dict:
    """Fetch + build + write one season's TEAM DEFENSE store. `games_df` is
    fetched ONCE by the caller (main()) and shared across seasons — the
    schedules release carries every season in one file, the same shape
    fetch_vegas already relies on."""
    import pandas as pd
    raw = workdir / f"def_raw_{season}.parquet"
    url = DEF_URL.format(year=season)
    ok = _download(url, raw)
    tried = [{"url": url, "ok": ok}]
    if not ok:
        return {"season": season, "status": "unreachable", "tried": tried}
    try:
        df = pd.read_parquet(raw, engine="fastparquet")
    except Exception:
        return {"season": season, "status": "unreachable",
                "tried": [{"url": url, "ok": False}]}
    if games_df is None:
        return {"season": season, "status": "unreachable",
                "tried": tried + [{"url": URL_SCHEDULES, "ok": False}],
                "why": "team-week fetch succeeded but the schedules fetch "
                       "(for points allowed) did not"}

    weeks, counts = build_def_season(df, games_df)
    if counts["kept_team_weeks"] < 400:
        return {"season": season, "status": "refused_too_small",
                "why": "a season with <400 team-weeks is a bad fetch, not "
                       "a season — refused rather than committed",
                "counts": counts, "tried": tried}

    path = def_store_path(season)
    if path.exists() and not force:
        try:
            old = json.loads(path.read_text())
        except ValueError:
            old = {}
        if old.get("weeks") == weeks and old.get("provenance", {}).get("url") == url:
            return {"season": season, "status": "unchanged", "path": path.name,
                    "counts": counts}

    doc = {
        "_territory": "TERRITORY: A — written by draft/backtest/fetch_component_stats.py "
                      "(TERRITORY-GRANT: C, register 2e, 2026-08-19)",
        "_note": ("Per-TEAM-DEFENSE weekly component stats, regular season, "
                  "keyed by BOARD team code (adp._norm_team-normalized — "
                  "nflverse's 'LA' becomes the board's 'LAR', etc). SEPARATE "
                  "from component_stats_<season>.json on purpose — "
                  "POSITION_GROUPS above is untouched and this store is "
                  "read by nothing that assumes an offense-only, "
                  "player-keyed population. Points-allowed bands are "
                  "ONE-HOT (the applicable pts_allow_* key is present with "
                  "value 1; every other band is absent, never a stored 0). "
                  "Missing-vs-zero rule: " + MISSING_VS_ZERO),
        "season": season,
        "provenance": {
            "url": url, "tried": tried,
            "schedules_url": URL_SCHEDULES,
            "fetched": _dt.date.today().isoformat(),
            "weeks_span": [FIRST_WEEK, LAST_WEEK], "season_type": "REG",
            "columns_kept": list(DEF_STAT_KEYS) + list(DEF_META_KEYS),
            "team_code_normalization": "adp._norm_team / adp.TEAM_ALIASES "
                                       "(nflverse -> board vocabulary, e.g. "
                                       "'LA' -> 'LAR')",
            "points_allowed_source": "games.csv (schedules release), "
                                     "opponent's own final score that game",
            **counts,
        },
        "weeks": weeks,
    }
    path.write_text(json.dumps(doc, indent=1))
    return {"season": season, "status": "written", "path": path.name,
            "counts": counts}


def load_def_store(season: int) -> dict:
    return json.loads(def_store_path(season).read_text())


def def_weeks(season: int, first_week: int = 1, last_week: int = 17) -> dict:
    """{team: {week: {stat: value}}} for the DEF store — same shape and
    missing-vs-zero rule as component_weeks/kicker_weeks."""
    doc = load_def_store(season)
    out: dict[str, dict[int, dict]] = {}
    for w in doc["weeks"]:
        if not (first_week <= w["week"] <= last_week):
            continue
        for team, line in w["players"].items():
            out.setdefault(str(team), {})[int(w["week"])] = line
    return out


def def_season_totals(season: int, last_week: int = 17) -> dict:
    """{team: {stat: season sum, 'games': row count, 'pos', 'team'}} — the
    DEF sibling of season_components/kicker_season_totals."""
    out: dict[str, dict] = {}
    for team, rows in def_weeks(season, 1, last_week).items():
        agg: dict = {"games": 0}
        for wk in sorted(rows):
            line = rows[wk]
            agg["games"] += 1
            for k in DEF_STAT_KEYS:
                if k in line:
                    agg[k] = round(agg.get(k, 0) + line[k], 4)
        agg["pos"] = "DEF"
        agg["team"] = team
        out[team] = agg
    return out


def scored_def_weekly_points(season: int, scoring_cfg: dict,
                             last_week: int = 17) -> dict:
    """{team: {week: points}} — DEF component lines scored under a
    caller-supplied table, the DEF sibling of scored_weekly_points."""
    import scoring as scoring_mod
    out: dict[str, dict[int, float]] = {}
    for team, rows in def_weeks(season, 1, last_week).items():
        for wk, line in rows.items():
            stat_line = {k: line[k] for k in DEF_SCORING_KEYS if k in line}
            out.setdefault(team, {})[wk] = round(
                scoring_mod.score_stat_line(stat_line, scoring_cfg), 2)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int, default=list(SEASONS))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    import tempfile
    workdir = Path(tempfile.mkdtemp(prefix="component_stats_"))
    cw = _crosswalk()
    print(f"crosswalk: {len(cw)} gsis->sleeper pairs")
    for season in args.seasons:
        res = fetch_season(season, cw, workdir, force=args.force)
        print(json.dumps(res))
    for season in args.seasons:
        res = fetch_kicker_season(season, cw, workdir, force=args.force)
        print(json.dumps({"kicker": res}))
    import pandas as _pd
    games_raw = workdir / "def_games.csv"
    games_df = _pd.read_csv(games_raw) if _download(URL_SCHEDULES, games_raw) else None
    for season in args.seasons:
        res = fetch_def_season(season, games_df, workdir, force=args.force)
        print(json.dumps({"def": res}))
    print(json.dumps(fetch_vegas(workdir, force=args.force)))


if __name__ == "__main__":
    main()
