# TERRITORY: A
"""PER-PLAYER WEEKLY ADVANCED STATS, 2021-2025 — EPA, air yards, CPOE,
RACR/WOPR. A NEW SIBLING STORE to fetch_component_stats.py; that file and its
committed `component_stats_*.json` bytes are NOT touched here (other agents'
parity tests depend on them during draft week — the blast radius of editing
that file was explicitly out of scope).

CORY'S DIRECTIVE, VERBATIM (relayed 2026-08-16): "we need to add those to the
loop and close them, fix this" — referring to EPA/air-yards/CPOE, which the
research relay found already live inside the SAME nflverse release host this
sandbox already fetches from, but which fetch_component_stats.py's own
docstring names as deliberately trimmed for size ("no EPA/air-yards/CPOE
analytics columns (unused by v5 — trimmed for size)"). This store closes that
gap: no new key, no new cost, same egress path already in use.

SCHEMA CHOICE — MEASURED, NOT ASSUMED. fetch_component_stats.py prefers the
`player_stats/player_stats_<year>.parquet` release and falls back to
`stats_player/stats_player_week_<year>.parquet` only for 2025 (the year the
primary release 404s). Probed here 2026-08-16 by downloading and inspecting
BOTH schemas for all five seasons:

    player_stats_<year>.parquet (2021-2024; the primary that store prefers)
        HAS: passing_epa, rushing_epa, receiving_epa, passing_air_yards,
             receiving_air_yards, racr, wopr, air_yards_share, pacr, dakota
        DOES NOT HAVE: any cpoe column, in any of the four years checked.

    stats_player_week_<year>.parquet (the fallback; VERIFIED reachable for
    ALL FIVE seasons 2021-2025, not only 2025 — fetch_component_stats.py
    only ever tries it for 2025 because that is the only year its PRIMARY
    404s, not because the fallback is unavailable in other years)
        HAS: passing_epa, rushing_epa, receiving_epa, passing_air_yards,
             receiving_air_yards, racr, wopr, air_yards_share, pacr, AND
             passing_cpoe — present and populated for every attempt-bearing
             QB row, in every one of the five seasons checked.
        DOES NOT HAVE: dakota (present in the other schema; not requested by
             the build brief and not extracted here).

Since CPOE is the whole point of the "add those to the loop" directive and
only the `stats_player_week` release schema carries it, AND that release is
reachable for every season 2021-2025 (not just 2025), this store fetches
EXCLUSIVELY from `stats_player/stats_player_week_<year>.parquet` for all five
seasons — a single, uniform schema, not the two-schema primary/fallback dance
fetch_component_stats.py needs. This is a deliberate, measured departure from
that file's URL preference, made possible because this store's population
does not need to match component_stats' row-for-row (a different release of
the same underlying nflverse pipeline, same player-week grain, joined to
component_stats downstream by (sleeper_id, week) — see advanced_efficiency.py
— not by row identity).

EPA GRAIN — CHECKED, NOT ASSUMED. EPA is fundamentally a per-PLAY stat; this
store extracts it at the grain nflverse's player_stats-family tables actually
provide, which is ALREADY AGGREGATED to one player-week total: `passing_epa`
sums EPA over the QB's own pass attempts that week, `rushing_epa` over his
carries, `receiving_epa` over a receiver's targets. This is verified from the
data itself, not merely asserted: `rushing_epa` is NaN for every row with
`carries == 0`, `receiving_epa` is NaN for every row with `targets == 0`, and
`passing_epa` is NaN for every row with `attempts == 0` (checked exhaustively
against 2024, weeks 1-17: 0 counter-examples in any of the three pairs) —
i.e. the column IS the play-level EPA summed over exactly the plays the
volume column counts, not some other aggregation. A true per-play grain (one
row per play, joinable to game context) would require the separate
play-by-play (pbp) release, a much larger, different data source; that fetch
is explicitly OUT OF SCOPE here per the build brief and is NOT attempted.

WHAT IS EXTRACTED, per QB/RB/WR/TE player-week (REG season, weeks 1-18):

    pass_epa    passing_epa   — summed EPA over the player's pass attempts
    rush_epa    rushing_epa   — summed EPA over the player's carries
    rec_epa     receiving_epa — summed EPA over the player's targets
    pass_air_yd passing_air_yards   — air yards thrown (QB)
    rec_air_yd  receiving_air_yards — air yards targeted (RB/WR/TE)
    cpoe        passing_cpoe  — completion % over expected, QB-only,
                                 populated exactly when attempts > 0
    racr        racr          — receiving air conversion ratio (yards / air
                                 yards); present whenever the player had
                                 nonzero air yards targeted
    wopr        wopr          — weighted opportunity rating (1.5*tgt_share +
                                 0.7*air_yards_share); ALWAYS defined
                                 (0.0 for zero-target players), same as the
                                 source column
    ay_share    air_yards_share — the player's share of his team's total air
                                 yards that week; same always-defined shape

THE MISSING-vs-ZERO RULE, adapted for TWO stat families (unlike
component_stats' single rule, because these columns are continuous and a
real, measured zero is a different fact than "no data"):

  · pass_air_yd / rec_air_yd / wopr / ay_share — INTEGER-OR-SHARE stats,
    same convention as every store before this one: a zero value IS the
    absent case (a WR with zero targets simply carries no rec_air_yd, wopr,
    or ay_share key) and is stripped at build time.
  · pass_epa / rush_epa / rec_epa / cpoe / racr — CONTINUOUS PERFORMANCE
    metrics where an exact 0.0 is itself a measured, meaningful value (a
    scrambled kneel-down, a dead-even expected-points play) and is KEPT; the
    key is absent only when the source column itself is NaN (verified above:
    NaN means the player recorded zero volume in that category this week —
    still "was not on the field for this play type", never "we don't know").

Row-presence in a week's `players` map still means "recorded an offensive
stat row that week" — a player-week absent from the map is MISSING DATA,
never a zero, exactly as every prior store encodes it. No duplicate
player_id+week rows were found in ANY of the five seasons checked (0 of
5897-6108 offensive player-weeks per season, all five years) — unlike
fetch_component_stats.py's primary schema, this release does not carry the
mid-week-trade duplicate-row artifact that store accumulates; this file
still guards against it defensively (see `build_season`) and would sum the
additive fields (epa/air-yards) and keep the last row's ratio fields
(cpoe/racr/wopr/ay_share) if one is ever found, logging the count in
provenance rather than raising.

WHAT IS DELIBERATELY NOT HERE. No fantasy points (that is
fetch_component_stats.py's job and stays there); no `dakota` or `pacr`
(present in the schema, observed, not requested by the build brief — named
here rather than silently extracted or silently ignored); no postseason
weeks; no kicking/defense/special-teams rows (offense-only, same as every
store before this one); no play-by-play join (a different, much bigger data
source, explicitly out of scope).

IDEMPOTENT RE-RUNS: same discipline as fetch_component_stats.py — a
byte-identical rebuild from the same URL leaves the committed file untouched
(original fetch date preserved); `--force` refetches unconditionally.

Run: python draft/backtest/fetch_advanced_stats.py [--seasons 2021..2025] [--force]
Writes draft/backtest/advanced_stats_<year>.json (one file per season).
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

# read-only reuse of the existing fetch's download + crosswalk logic — this
# file never imports anything that would let it write component_stats' own
# output, and never calls anything from fetch_component_stats that mutates
# state on disk.
import fetch_component_stats as FCS  # noqa: E402

SEASONS = (2021, 2022, 2023, 2024, 2025)
FIRST_WEEK, LAST_WEEK = 1, 18          # regular season only; consumers trim to 17
POSITION_GROUPS = ("QB", "RB", "WR", "TE")

# this store fetches ONLY the stats_player_week release — see docstring
# "SCHEMA CHOICE" section for the measured reason (it is the only schema
# that carries passing_cpoe, and it is reachable for all five seasons, not
# only 2025).
URL_ADVANCED = ("https://github.com/nflverse/nflverse-data/releases/download/"
                "stats_player/stats_player_week_{year}.parquet")

#: source column -> store key, continuous metrics (NaN -> absent, 0.0 kept).
EPA_COLUMN_MAP = {
    "passing_epa": "pass_epa",
    "rushing_epa": "rush_epa",
    "receiving_epa": "rec_epa",
    "passing_cpoe": "cpoe",
    "racr": "racr",
}
#: source column -> store key, integer/share metrics (0 -> absent, same rule
#: as every stat in fetch_component_stats.py).
SHARE_COLUMN_MAP = {
    "passing_air_yards": "pass_air_yd",
    "receiving_air_yards": "rec_air_yd",
    "wopr": "wopr",
    "air_yards_share": "ay_share",
}
STAT_KEYS = tuple(sorted(set(EPA_COLUMN_MAP.values()) | set(SHARE_COLUMN_MAP.values())))
META_KEYS = ("pos",)


def store_path(season: int) -> Path:
    return HERE / f"advanced_stats_{season}.json"


def _clean_epa(v):
    """NaN -> None (absent); a real 0.0 is KEPT (a measured value, not a
    missing one) — the opposite zero-handling from _clean_share."""
    if v is None or v != v:
        return None
    f = float(v)
    return int(f) if f == int(f) else round(f, 4)


def _clean_share(v):
    """0 or NaN -> None (absent); same rule as fetch_component_stats._clean."""
    if v is None or v != v:
        return None
    f = float(v)
    if f == 0.0:
        return None
    return int(f) if f == int(f) else round(f, 4)


def build_season(df, crosswalk: dict) -> tuple[list, dict]:
    """(weeks, counts) from the raw stats_player_week frame. Deterministic:
    weeks ascending, players sorted by key, stat keys sorted."""
    if "season_type" in df.columns:
        df = df[df["season_type"] == "REG"]
    df = df[(df["week"] >= FIRST_WEEK) & (df["week"] <= LAST_WEEK)]
    df = df[df["position_group"].isin(POSITION_GROUPS)]

    by_week: dict[int, dict] = {}
    unmapped = set()
    dupes = 0
    for row in df.to_dict("records"):
        gsis = str(row.get("player_id"))
        sid = crosswalk.get(gsis)
        key = sid if sid else f"gsis:{gsis}"
        if not sid:
            unmapped.add(gsis)
        line: dict = {}
        for src, dst in EPA_COLUMN_MAP.items():
            v = _clean_epa(row.get(src))
            if v is not None:
                line[dst] = v
        for src, dst in SHARE_COLUMN_MAP.items():
            v = _clean_share(row.get(src))
            if v is not None:
                line[dst] = v
        line["pos"] = str(row.get("position_group"))
        wk = int(row["week"])
        players = by_week.setdefault(wk, {})
        if key in players:
            # never observed in any of the five seasons at fetch time (see
            # docstring); handled defensively rather than silently dropped.
            dupes += 1
            prev = players[key]
            for k in ("pass_epa", "rush_epa", "rec_epa", "pass_air_yd", "rec_air_yd"):
                if k in line:
                    a, b = prev.get(k, 0), line[k]
                    s = a + b
                    prev[k] = int(s) if float(s) == int(s) else round(float(s), 4)
            for k in ("cpoe", "racr", "wopr", "ay_share"):
                if k in line:
                    prev[k] = line[k]          # last row's ratio wins
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
              "unmapped_gsis_players": len(unmapped),
              "duplicate_player_weeks_collapsed": dupes}
    return weeks, counts


def fetch_season(season: int, crosswalk: dict, workdir: Path,
                 force: bool = False) -> dict:
    """Fetch + build + write one season's advanced-stats store."""
    import pandas as pd
    raw = workdir / f"advanced_raw_{season}.parquet"
    url = URL_ADVANCED.format(year=season)
    ok = FCS._download(url, raw)          # read-only reuse, see module docstring
    tried = [{"url": url, "ok": ok}]
    df = None
    if ok:
        try:
            df = pd.read_parquet(raw, engine="fastparquet")
        except Exception:
            tried[-1]["ok"] = False
    if df is None:
        return {"season": season, "status": "unreachable", "tried": tried}

    weeks, counts = build_season(df, crosswalk)
    if counts["kept_player_weeks"] < 3000:
        return {"season": season, "status": "refused_too_small",
                "why": "a season with <3000 offensive player-weeks is a bad "
                       "fetch, not a season — refused rather than committed",
                "counts": counts, "tried": tried}

    path = store_path(season)
    if path.exists() and not force:
        try:
            old = json.loads(path.read_text())
        except ValueError:
            old = {}
        if (old.get("weeks") == weeks
                and old.get("provenance", {}).get("url") == url):
            return {"season": season, "status": "unchanged", "path": path.name,
                    "counts": counts}

    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/fetch_advanced_stats.py",
        "_note": ("Per-player weekly ADVANCED stats (EPA, air yards, CPOE, "
                  "RACR/WOPR), regular season, offense only. Sibling store to "
                  "component_stats — same crosswalk, same player-week grain, "
                  "joined downstream by (pid, week), not by row identity. "
                  "Missing-vs-zero: continuous metrics (pass_epa/rush_epa/"
                  "rec_epa/cpoe/racr) keep a real 0.0 and drop only NaN; "
                  "integer/share metrics (pass_air_yd/rec_air_yd/wopr/"
                  "ay_share) drop a real 0 same as every prior store. "
                  "Row-presence still means 'recorded an offensive stat row "
                  "that week' — absence is missing data, never a zero."),
        "season": season,
        "provenance": {
            "url": url,
            "tried": tried,
            "fetched": _dt.date.today().isoformat(),
            "weeks_span": [FIRST_WEEK, LAST_WEEK],
            "season_type": "REG",
            "position_groups": list(POSITION_GROUPS),
            "columns_kept": list(STAT_KEYS) + list(META_KEYS),
            "schema": "stats_player_week (measured to be the only schema of "
                      "the two nflverse releases checked that carries "
                      "passing_cpoe; see module docstring)",
            "crosswalk": "nfl_data_py.import_ids() gsis_id -> sleeper_id; "
                         "unmapped players keyed gsis:<id>, never dropped",
            **counts,
        },
        "weeks": weeks,
    }
    path.write_text(json.dumps(doc, indent=1))
    return {"season": season, "status": "written", "path": path.name,
            "counts": counts}


# ── readers (this store's own access path — consumers import, never re-parse) ─

def load_store(season: int) -> dict:
    return json.loads(store_path(season).read_text())


def advanced_weeks(season: int, first_week: int = 1, last_week: int = 17) -> dict:
    """{pid: {week: {stat: value}}} — same shape as
    fetch_component_stats.component_weeks."""
    doc = load_store(season)
    out: dict[str, dict[int, dict]] = {}
    for w in doc["weeks"]:
        if not (first_week <= w["week"] <= last_week):
            continue
        for pid, line in w["players"].items():
            out.setdefault(str(pid), {})[int(w["week"])] = line
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int, default=list(SEASONS))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    import tempfile
    workdir = Path(tempfile.mkdtemp(prefix="advanced_stats_"))
    cw = FCS._crosswalk()
    print(f"crosswalk: {len(cw)} gsis->sleeper pairs")
    for season in args.seasons:
        res = fetch_season(season, cw, workdir, force=args.force)
        print(json.dumps(res))


if __name__ == "__main__":
    main()
