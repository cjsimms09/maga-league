# TERRITORY: A
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
    print(json.dumps(fetch_vegas(workdir, force=args.force)))


if __name__ == "__main__":
    main()
