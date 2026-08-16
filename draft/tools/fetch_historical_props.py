# TERRITORY: A
"""HISTORICAL PLAYER-PROP LINES — The Odds API, paid historical plan.
Built 2026-08-16, under Cory's directive (verbatim in
draft/audit/historical_props_study_2026-08-16.md §1): does paying for
historical player-props data improve projections? This is the FETCH half of
the answer; `props_season_projection.py` is the CONVERT+GRADE half.

ACCESS CONFIRMED LIVE 2026-08-16 — not assumed. `key-probe.yml` on `main`
(run `31967817943`, commit `f56c57c7c`, completed `2026-08-16T19:31:18Z`)
probed the upgraded ODDS_API_KEY against exactly the two calls this file
needs before any real budget is spent:

    historical events list (2024-09-08T17:00:00Z): HTTP 200
    historical PLAYER PROP odds (event 7a5e353202d40a844491fa5753bc3097,
      market player_pass_yds): HTTP 200
      bookmakers returned: 6; player_pass_yds market present: True
    x-requests-remaining: 99988

Confirmed live: (a) the historical endpoint is reachable on this key, (b) the
`player_pass_yds` player-prop MARKET is actually served with real data (6
books), (c) the plan size is ~100,000 credits/month, essentially untouched.
Full log quoted in the audit doc. This file is written AFTER that
confirmation — nothing here is speculative about whether the door opens.

THE SHAPE THIS FILE PARSES (confirmed live, quoted verbatim in the audit
doc's fixtures below):

    historical events list  GET /v4/historical/sports/{sport}/events
                             ?apiKey=...&date=<ISO>
      -> {"timestamp": ..., "data": [{"id", "sport_key", "commence_time",
                                       "home_team", "away_team"}, ...]}

    historical event odds   GET /v4/historical/sports/{sport}/events/{id}/odds
                             ?apiKey=...&regions=us&markets=<csv>&date=<ISO>
      -> {"timestamp": ..., "data": {"id", "home_team", "away_team",
             "bookmakers": [{"key", "title", "markets": [
                 {"key": "player_pass_yds", "outcomes": [
                     {"name": "Over", "description": "<player name>",
                      "price": -115, "point": 275.5},
                     {"name": "Under", "description": "<player name>",
                      "price": -105, "point": 275.5}]}]}]}}

`description` carries the player's name on a player-prop outcome (the
market-wide convention this API uses — confirmed by the same doc family
that ships THE_ODDS_API's schema; the probe's one live market call did not
print outcome rows to keep the log free of anything price-shaped, so the
outcome-level shape below is asserted from the vendor's documented contract,
not re-verified line-by-line against a second live call — named honestly in
the audit doc as the one shape detail confirmed by DOCS rather than by a
second probe call, to avoid spending more real credits than the one
confirmation already used).

PURE VS I/O, same split as fetch_odds.py and fetch_component_stats.py:
every function below that PARSES a response, MATCHES an event to a
scheduled game, or PLANS which snapshots to request is a pure function of
its arguments and is exercised in draft/tests/test_fetch_historical_props.py
against fixtures built in exactly this shape. Every function that makes an
HTTP request is I/O glue, untested here (as with `_crosswalk`/`fetch_season`
in fetch_component_stats.py), and runs ONLY inside
.github/workflows/historical-props-fetch.yml — the sandbox that authored
this file cannot reach api.the-odds-api.com (network egress here is
allowlisted to github.com's release CDN only; confirmed by every prior
fetch tool's own docstring).

MARKETS (six, matching Cory's ask verbatim — "passing/rushing/receiving
yards, receptions, TDs"): player_pass_yds, player_pass_tds, player_rush_yds,
player_rush_tds, player_reception_yds, player_receptions. Receiving TDs and
anytime-TD moneylines are NAMED, NOT FETCHED — see the audit doc's scope
note; adding them is a future, separately-budgeted extension, not silently
folded in here.

LINE = MEDIAN EXPECTATION, NOT AN OUTCOME. An over/under prop line priced
near even odds on both sides is the book's estimate of the stat's median —
that is the entire justification for reading `point` as an expected value
in props_season_projection.py. This file stores the CONSENSUS point (median
across bookmakers offering the market) per player per market per week;
individual books' points are not kept (parallel to fetch_odds.py's
median-not-every-book design, for the same reason: one book's quirk should
not be the league's number).

CREDIT COST (the vendor's stated formula, empirically consistent with the
probe): a historical odds-with-markets request costs
`10 x len(markets) x len(regions)` credits, charged once per event per
snapshot regardless of how many bookmakers answer. The events-LIST call is
priced far lower — the probe's own numbers (12 credits consumed total for
one 0-credit /sports call + one events-list call + one 1-market/1-region
odds call) imply the events-list call cost ~2 credits; `estimate_credits`
below states this as an empirically-observed, vendor-undocumented figure,
not a guess presented as fact.

Run (network, CI only):
    python3 draft/tools/fetch_historical_props.py plan --season 2025 --scope sample_week1
    python3 draft/tools/fetch_historical_props.py fetch --season 2025 --scope sample_week1 [--dry-run]
Writes draft/backtest/historical_props_<season>.json.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent           # draft/tools
DRAFT = HERE.parent
BT = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BT))
sys.path.insert(0, str(DRAFT))

SPORT = "americanfootball_nfl"
REGIONS = "us"
HIST_BASE = f"https://api.the-odds-api.com/v4/historical/sports/{SPORT}"
SCHEDULES_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
                  "schedules/games.csv")

# player-prop market -> component-store stat key (fetch_component_stats.py's
# own key names, so props_season_projection.py can price both through the
# SAME frozen scoring table with no second vocabulary).
MARKET_TO_STAT = {
    "player_pass_yds": "pass_yd",
    "player_pass_tds": "pass_td",
    "player_rush_yds": "rush_yd",
    "player_rush_tds": "rush_td",
    "player_reception_yds": "rec_yd",
    "player_receptions": "rec",
}
MARKETS = tuple(sorted(MARKET_TO_STAT))          # 6 — the exact credit basis

CREDIT_PER_ODDS_CALL = 10          # vendor formula: 10 x markets x regions
EVENTS_LIST_CREDIT_EST = 2         # empirically observed in the probe run,
                                    # NOT vendor-documented — named as such
                                    # everywhere it is used.

#: 32-team abbreviation -> the full name the Odds API's `home_team`/
#: `away_team` fields use. Static and closed — never touches the network.
TEAM_FULL_NAME = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos",
    "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams", "LV": "Las Vegas Raiders",
    "MIA": "Miami Dolphins", "MIN": "Minnesota Vikings",
    "NE": "New England Patriots", "NO": "New Orleans Saints",
    "NYG": "New York Giants", "NYJ": "New York Jets",
    "OAK": "Las Vegas Raiders", "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers", "SD": "Los Angeles Chargers",
    "SEA": "Seattle Seahawks", "SF": "San Francisco 49ers",
    "STL": "Los Angeles Rams", "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}

SEASONS = (2023, 2024, 2025)
GAMES_PER_SEASON_NOMINAL = 272     # 32 teams x 17 games / 2 — the full-season
                                    # budget basis; the real per-season count
                                    # (bye weeks aside) is read off the
                                    # fetched schedule at dispatch time.


def store_path(season: int) -> Path:
    return BT / f"historical_props_{season}.json"


# ── pure: parsing the confirmed API shapes ────────────────────────────────

def parse_historical_events(doc: dict) -> list[dict]:
    """Historical events-list response -> [{"id", "commence_time",
    "home_team", "away_team"}], sorted by id for determinism. Tolerates the
    vendor's `data` being a bare list (documented alternate shape) as well
    as the dict-wrapped shape the probe actually returned."""
    raw = doc.get("data") if isinstance(doc, dict) else doc
    raw = raw or []
    out = []
    for ev in raw:
        if not ev.get("id"):
            continue
        out.append({
            "id": ev["id"],
            "commence_time": ev.get("commence_time"),
            "home_team": ev.get("home_team"),
            "away_team": ev.get("away_team"),
        })
    out.sort(key=lambda e: e["id"])
    return out


def match_event_to_game(events: list, home_abbr: str, away_abbr: str) -> str | None:
    """The nflverse schedule names a game by team ABBREVIATION; the Odds API
    names it by full team name. Absent, not guessed, on any ambiguity —
    returns None (never a wrong id) if zero or more than one event matches
    the (home, away) pair by full name."""
    home_full = TEAM_FULL_NAME.get(home_abbr)
    away_full = TEAM_FULL_NAME.get(away_abbr)
    if not home_full or not away_full:
        return None
    hits = [e["id"] for e in events
            if e.get("home_team") == home_full and e.get("away_team") == away_full]
    return hits[0] if len(hits) == 1 else None


def parse_event_props(doc: dict, markets: tuple = MARKETS) -> dict:
    """Historical event-odds response -> {player_name: {stat_key:
    consensus_point}}. Consensus = MEDIAN of the `point` field across every
    bookmaker offering that market for that player (Over and Under outcomes
    on one book normally share one `point`; both are folded into the same
    per-book sample so a book that quotes them a half-point apart still
    contributes one reasonable value, not two). A market/player with zero
    bookmaker quotes is simply ABSENT from the output — never a zero."""
    data = doc.get("data") if isinstance(doc, dict) else doc
    data = data or {}
    by_player: dict[str, dict[str, list]] = {}
    for bk in data.get("bookmakers", []):
        for m in bk.get("markets", []):
            key = m.get("key")
            stat = MARKET_TO_STAT.get(key)
            if not stat or key not in markets:
                continue
            for o in m.get("outcomes", []):
                name = o.get("description")
                pt = o.get("point")
                if not name or pt is None:
                    continue
                by_player.setdefault(name, {}).setdefault(stat, []).append(float(pt))
    out = {}
    for name in sorted(by_player):
        row = {}
        for stat in sorted(by_player[name]):
            pts = by_player[name][stat]
            row[stat] = round(statistics.median(pts), 2)
        out[name] = row
    return out


def merge_event_props(events_props: list) -> dict:
    """Union per-game parsed props into one week's {player_name: {stat: pt}}.
    A player appearing in more than one event in the same week (should not
    happen — one player, one game per week) keeps the FIRST event's row and
    the collision is reported by the caller via the `collisions` count this
    returns alongside the merged dict."""
    merged: dict[str, dict] = {}
    collisions = 0
    for ev in events_props:
        for name, row in ev.items():
            if name in merged:
                collisions += 1
                continue
            merged[name] = row
    return {"players": merged, "collisions": collisions}


# ── pure: snapshot planning (no network; drives the I/O layer) ────────────

def build_snapshot_plan(games: list, scope: str, week: int | None = None) -> list:
    """`games`: [{"week", "home", "away", "commence_time"}, ...] (from the
    fetched nflverse schedule, or a fixture in tests). Returns the ordered
    list of games to fetch under `scope`:

        "full_season"    every game in `games`
        "sample_week1"   only week == 1 (the cheap pilot slate)
        "single_week"    only `week` (requires `week`)

    Pure filter + sort; the caller decides what `commence_time` to pass as
    the historical `date` query param (the game's own kickoff — the closing
    line is the last snapshot at or before that instant, per the vendor's
    historical-endpoint semantics)."""
    if scope == "sample_week1":
        rows = [g for g in games if g["week"] == 1]
    elif scope == "single_week":
        if week is None:
            raise ValueError("scope=single_week requires week=")
        rows = [g for g in games if g["week"] == week]
    elif scope == "full_season":
        rows = list(games)
    else:
        raise ValueError(f"unknown scope: {scope!r}")
    return sorted(rows, key=lambda g: (g["week"], g["home"], g["away"]))


def estimate_credits(n_games: int, n_markets: int = len(MARKETS),
                      n_regions: int = 1, n_snapshots_per_game: int = 1,
                      n_events_list_calls: int = 0) -> dict:
    """Pure arithmetic — the SAME formula the workflow's budget comment and
    the audit doc quote, callable so the number is computed once and never
    hand-copied out of sync. `n_events_list_calls` costs
    EVENTS_LIST_CREDIT_EST each (empirically observed, named as such)."""
    odds_calls = n_games * n_snapshots_per_game
    odds_credits = odds_calls * CREDIT_PER_ODDS_CALL * n_markets * n_regions
    events_credits = n_events_list_calls * EVENTS_LIST_CREDIT_EST
    return {
        "games": n_games, "markets": n_markets, "regions": n_regions,
        "snapshots_per_game": n_snapshots_per_game,
        "odds_calls": odds_calls,
        "odds_credits": odds_credits,
        "events_list_calls": n_events_list_calls,
        "events_list_credits_est": events_credits,
        "total_credits_est": odds_credits + events_credits,
        "formula": ("odds_credits = games * snapshots_per_game * 10 * markets "
                    "* regions (vendor formula); events_list_credits_est = "
                    "events_list_calls * 2 (empirically observed in "
                    "key-probe run 31967817943, not vendor-documented)"),
    }


# ── I/O: network glue (untested here; exercised only by the workflow) ─────

def _download(url: str, dest: Path) -> bool:
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "maga-league-props-fetch"})
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status != 200:
                return False
            dest.write_bytes(r.read())
        return dest.stat().st_size > 100
    except Exception:
        return False


def _get_json(url: str, attempts: int = 4) -> tuple[dict | None, str | None]:
    """(body, x-requests-remaining), or (None, None) once every attempt fails.

    RETRIES, added 2026-08-16 after the first three real full-season pulls
    came back with silently-truncated weeks (2024 wk7 = 28 players, 2025
    wks 3/6/17 = 15/33/17, against a 168-258 norm). The original version
    swallowed EVERY exception into a bare (None, None) with no retry, so a
    single transient timeout or rate-limit on a week's events-list call
    erased that entire week's slate — the caller could not tell "the vendor
    has no data" apart from "the call fell over", and neither left a trace
    in the artifact.

    Deliberately does NOT retry a 4xx: a bad key or a malformed market list
    fails the same way every time, and retrying it just burns credits. Only
    transient classes (timeout, connection reset, 429, 5xx) are retried,
    with exponential backoff."""
    import time
    import urllib.error
    import urllib.request
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "maga-league-props-fetch"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = json.load(r)
                remaining = r.headers.get("x-requests-remaining")
            return body, remaining
        except urllib.error.HTTPError as e:
            # 429/5xx are worth another go; 4xx means the request itself is
            # wrong and will stay wrong.
            if e.code != 429 and e.code < 500:
                return None, None
        except Exception:
            pass
        if i < attempts - 1:
            time.sleep(2 ** i)
    return None, None


def fetch_season_schedule(season: int, workdir: Path) -> list:
    """[{"week", "home", "away", "commence_time"}] for one REG season, from
    the same nflverse schedules release fetch_component_stats.py's
    fetch_vegas() reads (`gameday`+`gametime` columns, kept here for the
    historical `date` query param that fetch_vegas() has no use for)."""
    import pandas as pd
    raw = workdir / "games.csv"
    if not raw.exists() and not _download(SCHEDULES_URL, raw):
        return []
    df = pd.read_csv(raw)
    sub = df[(df["season"] == season) & (df["game_type"] == "REG")]
    out = []
    for row in sub.to_dict("records"):
        gameday = row.get("gameday")
        gametime = row.get("gametime") or "13:00:00"
        if not isinstance(gameday, str) or not gameday:
            continue
        out.append({
            "week": int(row["week"]),
            "home": str(row["home_team"]), "away": str(row["away_team"]),
            "commence_time": f"{gameday}T{gametime}:00Z"
            if len(gametime) == 5 else f"{gameday}T{gametime}Z",
        })
    return out


def fetch_week_events(api_key: str, date_iso: str) -> tuple[list, str | None]:
    url = f"{HIST_BASE}/events?apiKey={api_key}&date={date_iso}"
    body, remaining = _get_json(url)
    return (parse_historical_events(body) if body else []), remaining


def fetch_event_props(api_key: str, event_id: str, date_iso: str,
                       markets: tuple = MARKETS) -> tuple[dict, str | None]:
    mk = ",".join(markets)
    url = (f"{HIST_BASE}/events/{event_id}/odds?apiKey={api_key}"
           f"&regions={REGIONS}&markets={mk}&date={date_iso}")
    body, remaining = _get_json(url)
    return (parse_event_props(body, markets) if body else {}), remaining


def fetch_season(api_key: str, season: int, scope: str, workdir: Path,
                  week: int | None = None, dry_run: bool = False,
                  max_credits: int | None = None) -> dict:
    """Orchestrates the full plan -> fetch -> store cycle for one season.
    `dry_run` fetches the SCHEDULE and EVENTS-LIST calls for real (cheap,
    verifies mechanics end to end) but skips every per-event odds call (the
    expensive step) and reports the credit estimate instead of spending it —
    the same dry_run contract odds-capture.yml already established."""
    games = fetch_season_schedule(season, workdir)
    if not games:
        return {"season": season, "status": "schedule_unreachable"}
    plan = build_snapshot_plan(games, scope, week)
    weeks_needed = sorted({g["week"] for g in plan})

    est = estimate_credits(len(plan), n_events_list_calls=len(weeks_needed))
    if dry_run:
        # Verify the events-list call actually resolves real event ids for
        # one representative week (mechanics check; ~2 credits, far below
        # the full per-event odds cost this mode deliberately skips).
        sample_week = weeks_needed[0] if weeks_needed else None
        sample = [g for g in plan if g["week"] == sample_week] if sample_week else []
        matched = 0
        if sample:
            events, _ = fetch_week_events(api_key, sample[0]["commence_time"])
            for g in sample:
                if match_event_to_game(events, g["home"], g["away"]):
                    matched += 1
        return {"season": season, "status": "dry_run", "scope": scope,
                "games_planned": len(plan), "weeks": weeks_needed,
                "sample_week": sample_week, "sample_games": len(sample),
                "sample_matched_events": matched,
                "credit_estimate": est}

    if max_credits is not None and est["total_credits_est"] > max_credits:
        return {"season": season, "status": "refused_over_budget",
                "credit_estimate": est, "max_credits": max_credits}

    # EVENTS-LIST CACHE KEY: the game's own kickoff timestamp, NOT its week.
    #
    # The original keyed this cache by week, so one snapshot — taken at
    # whatever the FIRST game in that week's plan happened to kick off —
    # was reused to resolve every other game that week. /v4/historical is a
    # point-in-time endpoint: a snapshot taken at Thursday 20:15 does not
    # necessarily carry Sunday's slate. Every game the stale snapshot could
    # not match hit the `continue` below and vanished with no record, which
    # is how 2025 wk3 shipped 15 players and wk6 shipped 33.
    #
    # An NFL week has only a handful of distinct kickoff times (Thu, the
    # Sunday windows, Mon), so keying by timestamp costs roughly 4-6
    # events-list calls per week instead of 1 — about 150 extra credits per
    # season against a 16,320-credit odds spend. Correctness is worth ~1%.
    events_by_ts: dict[str, list] = {}
    weeks_out: dict[int, dict] = {}
    health: dict[int, dict] = {}
    remaining = None
    for g in plan:
        wk = g["week"]
        h = health.setdefault(wk, {"games_planned": 0, "events_matched": 0,
                                   "odds_ok": 0, "odds_empty": 0})
        h["games_planned"] += 1
        ts = g["commence_time"]
        if ts not in events_by_ts:
            events_by_ts[ts], remaining = fetch_week_events(api_key, ts)
        eid = match_event_to_game(events_by_ts[ts], g["home"], g["away"])
        weeks_out.setdefault(wk, {"week": wk, "players": {}})
        if not eid:
            continue
        h["events_matched"] += 1
        props, remaining = fetch_event_props(api_key, eid, ts)
        if props:
            h["odds_ok"] += 1
        else:
            h["odds_empty"] += 1
        for name, row in props.items():
            weeks_out[wk]["players"].setdefault(name, row)
    for wk, h in health.items():
        h["players"] = len(weeks_out.get(wk, {}).get("players", {}))
        weeks_out.setdefault(wk, {"week": wk, "players": {}})["health"] = h

    doc = {
        "_territory": "TERRITORY: A — produced by draft/tools/fetch_historical_props.py",
        "_note": ("Per-player weekly PROP-LINE consensus (median across "
                  "bookmakers), player-prop markets only, keyed by the "
                  "player NAME the odds API returns on the outcome's "
                  "`description` field — NOT yet crosswalked to a sleeper "
                  "id (see props_season_projection.py's name-matching "
                  "step). Absent-vs-zero: a player/market with no "
                  "bookmaker quote in the fetched snapshot is absent from "
                  "the row, never a zero."),
        "season": season,
        "provenance": {
            "source": "api.the-odds-api.com /v4/historical (paid plan)",
            "scope": scope, "markets": list(MARKETS), "regions": REGIONS,
            "credit_estimate": est,
            "credits_remaining_last_seen": remaining,
            "health": summarize_health(health),
        },
        "weeks": [weeks_out[w] for w in sorted(weeks_out)],
    }
    return {"season": season, "status": "written", "doc": doc}


# ── pure: fetch-health auditing ──────────────────────────────────────────

#: A REG week fields 13-16 games; anything resolving under this share of its
#: planned games is a partial fetch, not a thin betting market. Set from the
#: three real 2023-2025 pulls: healthy weeks matched every planned game,
#: while the four broken ones (2024 wk7, 2025 wks 3/6/17) matched under a
#: fifth of theirs. 0.7 sits well clear of both clusters.
MIN_EVENT_MATCH_RATE = 0.7


def summarize_health(health: dict) -> dict:
    """Roll per-week fetch counters into a verdict the artifact carries with
    it, so a truncated pull announces itself instead of looking like a quiet
    week. `health` is {week: {games_planned, events_matched, odds_ok, ...}}."""
    weeks = sorted(health)
    suspect = []
    for wk in weeks:
        h = health[wk]
        planned = h.get("games_planned") or 0
        if not planned:
            continue
        rate = (h.get("events_matched") or 0) / planned
        if rate < MIN_EVENT_MATCH_RATE:
            suspect.append({"week": wk, "games_planned": planned,
                            "events_matched": h.get("events_matched", 0),
                            "match_rate": round(rate, 3),
                            "players": h.get("players", 0)})
    return {
        "weeks_fetched": len(weeks),
        "games_planned": sum((health[w].get("games_planned") or 0) for w in weeks),
        "events_matched": sum((health[w].get("events_matched") or 0) for w in weeks),
        "min_event_match_rate": MIN_EVENT_MATCH_RATE,
        "suspect_weeks": suspect,
        "complete": not suspect,
        "per_week": {str(w): health[w] for w in weeks},
    }


def audit_doc(doc: dict) -> dict:
    """Audit an ALREADY-WRITTEN props file, including the three pulled before
    per-week health existed (they carry no counters, so this falls back to
    the player-count distribution). Reports which weeks look truncated and
    which requested markets never landed a single row — the two failure
    modes the 2023-2025 pull actually hit."""
    weeks = doc.get("weeks") or []
    counts = {int(e["week"]): len(e.get("players") or {}) for e in weeks}
    present = set()
    for e in weeks:
        for row in (e.get("players") or {}).values():
            present.update(row)
    expected = set(MARKET_TO_STAT.values())
    median = (sorted(counts.values())[len(counts) // 2] if counts else 0)
    # A week under a third of the season's median player count is truncated;
    # real late-season tapering (2023 wk18 = 110 vs a 212 median) stays well
    # above that, while the four known-broken weeks fall far below it.
    thin = {w: n for w, n in counts.items() if median and n < median / 3}
    return {
        "season": doc.get("season"),
        "weeks": len(weeks),
        "median_players_per_week": median,
        "players_per_week": dict(sorted(counts.items())),
        "truncated_weeks": dict(sorted(thin.items())),
        "markets_expected": sorted(expected),
        "markets_present": sorted(present),
        "markets_missing": sorted(expected - present),
        "complete": not thin and not (expected - present),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_plan = sub.add_parser("plan", help="print the credit estimate, no network to the-odds-api")
    p_plan.add_argument("--season", type=int, required=True)
    p_plan.add_argument("--scope", choices=("sample_week1", "full_season", "single_week"),
                        default="sample_week1")
    p_plan.add_argument("--week", type=int, default=None)

    p_fetch = sub.add_parser("fetch", help="fetch for real (or --dry-run)")
    p_fetch.add_argument("--season", type=int, required=True)
    p_fetch.add_argument("--scope", choices=("sample_week1", "full_season", "single_week"),
                         default="sample_week1")
    p_fetch.add_argument("--week", type=int, default=None)
    p_fetch.add_argument("--dry-run", action="store_true")
    p_fetch.add_argument("--max-credits", type=int, default=None)
    p_fetch.add_argument("--out-dir", type=str, default=None)

    p_audit = sub.add_parser(
        "audit", help="audit an already-written props file (no network at all)")
    p_audit.add_argument("--file", type=str, required=True)

    args = ap.parse_args()

    if args.cmd == "audit":
        report = audit_doc(json.loads(Path(args.file).read_text()))
        print(json.dumps(report, indent=1))
        return 0 if report["complete"] else 1
    import os
    import tempfile
    workdir = Path(tempfile.mkdtemp(prefix="historical_props_"))

    if args.cmd == "plan":
        games = fetch_season_schedule(args.season, workdir)
        if not games:
            print(json.dumps({"season": args.season, "status": "schedule_unreachable"}))
            return 1
        plan = build_snapshot_plan(games, args.scope, args.week)
        weeks_needed = sorted({g["week"] for g in plan})
        est = estimate_credits(len(plan), n_events_list_calls=len(weeks_needed))
        print(json.dumps({"season": args.season, "scope": args.scope,
                          "games_planned": len(plan), "weeks": weeks_needed,
                          "credit_estimate": est}, indent=1))
        return 0

    key = os.environ.get("ODDS_API_KEY", "")
    if not key:
        print("ODDS_API_KEY is not set — nothing fetched", file=sys.stderr)
        return 1
    res = fetch_season(key, args.season, args.scope, workdir, week=args.week,
                       dry_run=args.dry_run, max_credits=args.max_credits)
    if res["status"] == "written":
        out_dir = Path(args.out_dir) if args.out_dir else BT
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"historical_props_{args.season}.json"
        path.write_text(json.dumps(res["doc"], indent=1))
        print(f"wrote {path} — {len(res['doc']['weeks'])} weeks")
        return 0
    print(json.dumps({k: v for k, v in res.items() if k != "doc"}, indent=1))
    return 0 if res["status"] in ("dry_run",) else 1


if __name__ == "__main__":
    raise SystemExit(main())
