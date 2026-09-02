#!/usr/bin/env python3
# TERRITORY: relay (C owns the candidate table once it has run twice)
"""FREE-SOURCE DISCOVERY — the standing monthly census FUTURE-PROOF-2027 §6.3
asked for: for EVERY data class in the source registry, probe the free
candidate doors we know of (and the ones lanes add here as they learn of
them), record which answer and with what shape, and write a dated report a
human can turn into a registry fallback. Cory, 09-02: *"continually looks
for free sources of info it could get that might help."*

It is a CENSUS, not a capture: nothing here is written to a data store, and
a door that answers enters the registry as a FALLBACK first and a primary
only after it grades (§6.3). Money never enters: every candidate is keyless
and free by construction; a candidate that needs a key is listed as such
and never fetched (Cory's standing ruling, 09-01).

RULE 3e — a probe that has never returned a positive has not been tested:
  CONTROL: `api.sleeper.app/v1/state/nfl` must answer with a `week` field.
  If the control fails the whole report is REFUSED (exit 1, nothing
  written) — "every door is dark" and "the runner has no network" must
  never look the same. The sandbox gateway 403s these hosts, so this runs
  in CI (free-source-discovery.yml); locally only the shape checks and the
  refusal arm can be exercised (test_free_source_discovery.py).

Run:  python3 draft/tools/free_source_discovery.py [--write] [--json] [--only CLASS]
"""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "draft" / "data" / "source_registry.json"
OUT_DIR = ROOT / "draft" / "backtest"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "application/json, text/html;q=0.8, */*;q=0.5"}

CONTROL = {"name": "sleeper_state", "url": "https://api.sleeper.app/v1/state/nfl", "shape": r'"week"\s*:\s*\d+'}

# One row per candidate: class · name · url · a SHAPE regex the body must
# match to count as "answers with data" (a 200 with a login page or an
# error envelope is NOT a door) · notes. `key: True` = needs a key, never
# fetched, listed so nobody re-discovers it as free.
CANDIDATES = [
    # season / weekly projections
    {"class": "season_projections", "name": "sleeper_projections_season", "url": "https://api.sleeper.app/projections/nfl/2026?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE", "shape": r'"pts_half_ppr"|"pts_ppr"|"pts_std"'},
    {"class": "weekly_projections", "name": "sleeper_projections_week", "url": "https://api.sleeper.app/projections/nfl/2026/1?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE", "shape": r'"pts_half_ppr"|"pts_ppr"|"pts_std"'},
    {"class": "weekly_projections", "name": "espn_fantasy_projections", "url": "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info", "shape": r'"appliedTotal"|"projectedPoints"|"players"'},
    # player props (the census tool covers the six live doors weekly; these are the NEW candidates)
    {"class": "player_props", "name": "kalshi_player_markets", "url": "https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&series_ticker=KXNFLPLAYER", "shape": r'"markets"\s*:\s*\['},
    {"class": "player_props", "name": "sleeper_picks_lines", "url": "https://api.sleeper.app/lines/available?sport=nfl", "shape": r'"subject_id"|"wager_type"|"options"'},
    {"class": "player_props", "name": "prizepicks_projections", "url": "https://api.prizepicks.com/projections?league_id=9&per_page=250", "shape": r'"stat_type"|"line_score"'},
    # game lines
    {"class": "game_lines", "name": "espn_scoreboard_odds", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", "shape": r'"odds"|"overUnder"|"spread"'},
    {"class": "game_lines", "name": "actionnetwork_scoreboard", "url": "https://api.actionnetwork.com/web/v1/scoreboard/nfl", "shape": r'"odds"|"spread"|"total"'},
    {"class": "game_lines", "name": "polymarket_nfl", "url": "https://gamma-api.polymarket.com/events?tag=nfl&active=true&limit=50", "shape": r'"markets"|"outcomePrices"'},
    # adp
    {"class": "adp", "name": "ffc_adp", "url": "https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=10&year=2026", "shape": r'"adp"\s*:\s*[\d.]+'},
    {"class": "adp", "name": "sleeper_trending_adds", "url": "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=168&limit=100", "shape": r'"player_id"'},
    # injuries / practice
    {"class": "injuries_practice", "name": "espn_injuries", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries", "shape": r'"injuries"|"status"'},
    {"class": "injuries_practice", "name": "sleeper_players_injury", "url": "https://api.sleeper.app/v1/players/nfl", "shape": r'"injury_status"'},
    # snaps / usage
    {"class": "snaps_usage", "name": "nflverse_snap_counts_release", "url": "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2025.csv", "shape": r'offense_snaps|offense_pct'},
    {"class": "snaps_usage", "name": "nflverse_pbp_participation", "url": "https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2024.csv", "shape": r'offense_players|players_on_play'},
    {"class": "snaps_usage", "name": "espn_boxscore_sample", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401671716", "shape": r'"boxscore"|"players"'},
    # rosters / transactions
    {"class": "rosters_transactions", "name": "sleeper_league_rosters", "url": "https://api.sleeper.app/v1/league/1374848328470102016/rosters", "shape": r'"roster_id"'},
    {"class": "rosters_transactions", "name": "espn_teams_roster", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12/roster", "shape": r'"athletes"'},
    # schedule / kickoffs
    {"class": "schedule_kickoffs", "name": "espn_scoreboard_week", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=1&dates=2026", "shape": r'"events"\s*:\s*\['},
    {"class": "schedule_kickoffs", "name": "nflverse_schedules", "url": "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv", "shape": r'game_id,season|gameday'},
    # weather
    {"class": "weather", "name": "open_meteo_forecast", "url": "https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=-75.17&hourly=temperature_2m,wind_speed_10m,precipitation_probability&forecast_days=7", "shape": r'"hourly"'},
    {"class": "weather", "name": "nws_forecast_points", "url": "https://api.weather.gov/points/39.9008,-75.1675", "shape": r'"forecastHourly"'},
    {"class": "weather", "name": "nflverse_stadiums", "url": "https://raw.githubusercontent.com/nflverse/nfldata/main/data/stadiums.csv", "shape": r'stadium_id|roof', "note": "the master branch path 404ed on 09-02; trying main"},
    # depth charts / team context (the coaching half is C's open gap)
    {"class": "depth_charts_team_context", "name": "espn_depth_chart", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12/depthcharts", "shape": r'"depthchart"|"positions"'},
    {"class": "depth_charts_team_context", "name": "nflverse_depth_charts", "url": "https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_2025.csv", "shape": r'club_code|depth_team|pos_abb|pos_grp|position|gsis_id', "note": "200 on 09-02 but the old shape missed; widened to the 2025 column names"},
    {"class": "depth_charts_team_context", "name": "espn_team_info", "url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12", "shape": r'"team"'},
    # expert ranks
    {"class": "expert_ranks", "name": "fantasypros_ecr_page", "url": "https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php", "shape": r'ecrData|rank_ecr|"player_name"'},
    # realized points
    {"class": "realized_points", "name": "sleeper_stats_week", "url": "https://api.sleeper.app/v1/stats/nfl/regular/2025/1", "shape": r'"pts_half_ppr"|"pts_ppr"'},
    {"class": "realized_points", "name": "nflverse_player_stats", "url": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv", "shape": r'fantasy_points|passing_yards', "note": "renamed upstream from player_stats_2025.csv (404 on 09-02); the repo's own loader uses stats_player_week_2025"},
    # player bio / capital
    {"class": "player_bio_capital", "name": "nflverse_draft_picks", "url": "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv", "shape": r'pick,|round,|pfr_player_id'},
    {"class": "player_bio_capital", "name": "nflverse_rosters", "url": "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2025.csv", "shape": r'birth_date|years_exp|draft_number'},
    # listed, never fetched: needs a key (the standing ruling)
    {"class": "player_props", "name": "the_odds_api", "url": "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds", "shape": r"", "key": True, "note": "PAID — retired by Cory's 09-01 ruling; listed so nobody re-discovers it as free"},
    {"class": "realized_points", "name": "balldontlie_nfl", "url": "https://api.balldontlie.io/nfl/v1/stats", "shape": r"", "key": True, "note": "key required (401 measured 08-21)"},
]


def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(400000).decode("utf-8", "ignore")
            return r.status, body, None
    except urllib.error.HTTPError as e:
        return e.code, "", f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, "", type(e).__name__ + ": " + str(e)[:120]


def shape_ok(body: str, shape: str) -> bool:
    return bool(shape) and bool(body) and re.search(shape, body) is not None


def verdict(status, body, shape):
    """'answers' — 2xx and the body matches the shape · 'reachable_no_shape' —
    2xx but not the expected data (a login page, an error envelope) ·
    'blocked' — 401/403/407 · 'error' — anything else. The distinction is the
    point: a 200 is not a door until the body proves it."""
    if status is None:
        return "error"
    if status in (401, 403, 407):
        return "blocked"
    if 200 <= status < 300:
        return "answers" if shape_ok(body, shape) else "reachable_no_shape"
    return "error"


def run(only=None, fetch=get):
    reg = json.loads(REGISTRY.read_text())
    classes = [c["class"] for c in reg["classes"]]
    today = dt.date.today().isoformat()
    st, body, err = fetch(CONTROL["url"])
    control_ok = verdict(st, body, CONTROL["shape"]) == "answers"
    rows = []
    for c in CANDIDATES:
        if only and c["class"] != only:
            continue
        if c.get("key"):
            rows.append({**c, "verdict": "needs_key_not_fetched", "status": None, "bytes": 0, "error": None})
            continue
        st, body, err = fetch(c["url"])
        rows.append({"class": c["class"], "name": c["name"], "url": c["url"], "shape": c["shape"],
                     "status": st, "bytes": len(body), "error": err, "verdict": verdict(st, body, c["shape"]),
                     "note": c.get("note")})
    per_class = {}
    for cls in classes:
        mine = [r for r in rows if r["class"] == cls]
        per_class[cls] = {"candidates": len(mine), "answers": sorted(r["name"] for r in mine if r["verdict"] == "answers"),
                          "blocked": sorted(r["name"] for r in mine if r["verdict"] == "blocked"),
                          "no_shape": sorted(r["name"] for r in mine if r["verdict"] == "reachable_no_shape")}
    uncovered = [cls for cls in classes if not any(r["class"] == cls for r in CANDIDATES)]
    return {
        "_territory": "TERRITORY: relay — produced by draft/tools/free_source_discovery.py (FUTURE-PROOF-2027 §6.3, monthly)",
        "_what": "A CENSUS of free candidate doors per registry data class: which answer with data, which are blocked, which are reachable but not data. Nothing here is captured; a door that answers becomes a registry FALLBACK first (§6.3).",
        "date": today, "control": {"name": CONTROL["name"], "ok": control_ok, "status": st if not control_ok else 200, "error": err},
        "classes_in_registry": classes, "classes_without_a_candidate": uncovered,
        "per_class": per_class, "candidates": rows,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--only", default=None)
    a = ap.parse_args()
    doc = run(only=a.only)
    if a.json:
        print(json.dumps(doc, indent=1))
    else:
        print(f"FREE-SOURCE DISCOVERY {doc['date']} — control {'✅' if doc['control']['ok'] else '🔴'} ({CONTROL['name']})")
        for cls, v in doc["per_class"].items():
            print(f"  {cls:26s} answers {len(v['answers']):2d}/{v['candidates']:2d}  {', '.join(v['answers'])}"
                  + (f"  | blocked: {', '.join(v['blocked'])}" if v["blocked"] else "")
                  + (f"  | 200-but-not-data: {', '.join(v['no_shape'])}" if v["no_shape"] else ""))
        if doc["classes_without_a_candidate"]:
            print("  ⚠ no candidate listed for:", ", ".join(doc["classes_without_a_candidate"]))
    if not doc["control"]["ok"]:
        print("🔴 CONTROL FAILED — the known-positive door did not answer, so every null above is untrusted; nothing written")
        return 1
    if a.write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        dated = OUT_DIR / f"free_source_discovery_{doc['date']}.json"
        dated.write_text(json.dumps(doc, indent=1) + "\n")
        (OUT_DIR / "free_source_discovery_latest.json").write_text(json.dumps(doc, indent=1) + "\n")
        print(f"wrote {dated.relative_to(ROOT)} (+ _latest)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
