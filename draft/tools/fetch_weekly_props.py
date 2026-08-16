#!/usr/bin/env python3
# TERRITORY: A
"""WEEKLY PLAYER-PROP LINES -> IMPLIED FANTASY POINTS, ONE WEEK AT A TIME.

Cory, 2026-08-16, on splitting the props work in two: "sounds like we need to
study different things. One for season projections for draft and another for
weekly projections specific to that week?" This is the SECOND half. A sibling
agent owns the SEASON-TOTAL props arm for the draft board (summed weekly props
-> one number per player per season, in draft/tools/fetch_historical_props.py
and draft/backtest/props_season_projection.py — NOT this file). This module
prices ONE WEEK directly from that week's O/U lines: no summing, no season
shape, gradable on every player-week a market existed for, which is a much
richer sample than one row per player per season. Full framing, the
preregistration, and the fixture-tested proof:
draft/audit/weekly_props_study_2026-08-16.md.

THE CONFIRMED DOOR (key-probe run 31967817943 on main, 2026-08-16, job
95215556739 — see the study doc for the transcript). Under Cory's upgraded
ODDS_API_KEY (The Odds API, paid tier):

    GET https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl
        /events/{event_id}/odds?apiKey=...&regions=us&markets=player_pass_yds
        &date=2024-09-08T17:00:00Z
    -> HTTP 200, 6 bookmakers, market key `player_pass_yds` PRESENT.
    x-requests-remaining: 99988 (of what is very likely a 100,000-credit/mo
    plan — nearly untouched).

Only `player_pass_yds` was independently re-confirmed present on THIS event
by that probe (CONFIRMED_MARKETS below). The other NFL player-prop market
keys used here (player_pass_tds, player_rush_yds, player_receptions, ...)
are the-odds-api.com's own DOCUMENTED market-key naming convention for the
same historical-odds endpoint and the same paid plan tier — a reasonable,
conservative assumption, but NOT independently re-verified market by market.
Same honesty rule for the response SHAPE: the probe printed only a bookmaker
count and a market-key boolean, never the outcome list, so the per-outcome
fields this module reads (`name`, `description`, `point`) are the-odds-api's
DOCUMENTED historical single-event-odds shape, not literally re-printed by
our own probe. `extract_event_props` is defensive throughout — a missing key
yields an absent field, never a crash and never a guessed value — exactly so
a real fetch that hits an unconfirmed corner degrades to "fewer players
matched," never a wrong number silently written.

THE CONVERSION. An Over/Under `point` IS the market's implied value for that
stat that week (e.g. `player_pass_yds` point=275.5 means the market's implied
275.5 passing yards). Markets combine ADDITIVELY into ONE implied stat line
per player (same shape fetch_component_stats.py already uses for team implied
totals, applied per-player per-week instead), then that stat line is scored
under the league's OWN frozen scoring table via `scoring.score_stat_line` —
never a hand-typed points-per-yard rate. A player with zero quoted markets
that week is ABSENT from the output, never a zero (the house rule, at every
layer here too).

CREDIT COST, the-odds-api.com's own documented pricing (confirmed model,
applied to the confirmed-live endpoint above): 10 credits x (markets
requested) x (regions requested) PER EVENT CALL, regardless of how many
players' lines that call returns. See estimate_credits() below and the
workflow's budget comment for the exact per-week and full-backtest numbers.

Zero-network by default: only the pure parse/convert/match functions and the
CLI's fixture-injection path (`PROPS_WEEKLY_EVENTS`) run in this sandbox. The
real network calls (`fetch_week_events`, `fetch_event_odds`) run in CI only,
dispatched by a human — see .github/workflows/weekly-props-fetch.yml. Nobody
in this pass has dispatched a real fetch; draft/data/props/ is empty on this
branch and stays that way until a human fires the workflow for real.

Run: python3 draft/tools/fetch_weekly_props.py --season 2026 --week 1 \
     --date 2026-09-08T17:00:00Z [--markets player_pass_yds,player_rush_yds]
     [--limit N] [--dry-run]
Writes draft/data/props/weekly_props_<season>_w<week>.json.
Env overrides (tests + dry-run, no network): PROPS_WEEKLY_BOARD,
PROPS_WEEKLY_OUT_DIR, PROPS_WEEKLY_EVENTS (path to a JSON doc
{"events": [{"event_id","home_team","away_team","kickoff","odds": <raw
the-odds-api per-event response>}, ...]} — the exact shape fetch_week()
returns, so tests and a workflow dry-run exercise the identical code path a
real fetch would).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/tools
DRAFT = HERE.parent                              # draft/
BT = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BT))
sys.path.insert(0, str(DRAFT))

from adp import normalize_name  # noqa: E402 — the repo's one name matcher, not retyped
from weekly_own_projection import TEAM_NAME_TO_CODE  # noqa: E402 — one team-name map, not retyped

FORMULA_VERSION = "props_weekly_v1"

#: NFL player-prop market keys this module knows how to price, mapped to the
#: scoring-engine stat key each market's implied value fills. Only the keys
#: present on a given event's response are ever priced — an unrequested or
#: unconfirmed market is simply never asked for.
MARKET_TO_STAT = {
    "player_pass_yds": "pass_yd",
    "player_pass_tds": "pass_td",
    "player_pass_interceptions": "pass_int",
    "player_rush_yds": "rush_yd",
    "player_rush_tds": "rush_td",
    "player_receptions": "rec",
    "player_reception_yds": "rec_yd",
    "player_reception_tds": "rec_td",
}
DEFAULT_MARKETS = tuple(MARKET_TO_STAT)
#: independently re-verified live on the confirmed door (see module docstring)
CONFIRMED_MARKETS = frozenset({"player_pass_yds"})

#: the-odds-api.com's documented historical-odds pricing model.
CREDITS_PER_MARKET_REGION = 10
DEFAULT_REGIONS = "us"

HIST_BASE = "https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl"
SPORT = "americanfootball_nfl"


def props_snapshot_path(out_dir: Path, season: int, week: int) -> Path:
    return out_dir / f"weekly_props_{season}_w{week}.json"


# ── credit budget (pure) ─────────────────────────────────────────────────────

def estimate_credits(n_events: int, markets=DEFAULT_MARKETS,
                     regions: str = DEFAULT_REGIONS) -> dict:
    """The exact the-odds-api.com cost for fetching n_events games at the
    given market set: 10 credits x markets x regions PER EVENT CALL. Pure —
    no fetch, so a workflow (or a human) can price a dispatch before making it."""
    n_regions = len([r for r in regions.split(",") if r])
    per_event = len(markets) * n_regions * CREDITS_PER_MARKET_REGION
    return {"events": n_events, "markets": len(markets), "regions": n_regions,
            "credits_per_event": per_event, "credits_total": per_event * n_events}


# ── parsing (pure) ───────────────────────────────────────────────────────────

def _median(xs: list) -> float:
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else round((xs[n // 2 - 1] + xs[n // 2]) / 2, 3)


def extract_event_props(odds_doc: dict, markets=DEFAULT_MARKETS) -> dict:
    """{player_name: {market_key: point}} from ONE event's historical-odds
    response. Accepts the confirmed historical wrapper shape
    ({"data": {"bookmakers": [...]}}) and the bare live-endpoint shape
    ({"bookmakers": [...]}) alike. Takes the MEDIAN point across bookmakers
    quoting that (player, market) — one book's quirk is not the market's
    number, the same discipline fetch_odds.py already applies to game lines.
    A market not in `markets`, an outcome missing `point` or `description`,
    or an unparseable point contributes nothing — absent, never guessed."""
    if not isinstance(odds_doc, dict):
        return {}
    data = odds_doc.get("data")
    data = data if isinstance(data, dict) else odds_doc
    books = data.get("bookmakers") or []
    seen: dict = {}
    for bk in books:
        if not isinstance(bk, dict):
            continue
        for m in bk.get("markets") or []:
            mk = m.get("key")
            if mk not in markets:
                continue
            # ONE point per (bookmaker, market, player): Over and Under quote
            # the SAME point, so counting both outcomes would double-weight
            # any book that lists both sides against a book that lists one —
            # first-outcome-wins within this book+market keeps the later
            # cross-book median a true median of BOOKS, not of outcome rows.
            book_points: dict = {}
            for o in m.get("outcomes") or []:
                name = o.get("description")
                pt = o.get("point")
                if not name or pt is None:
                    continue
                try:
                    pt = float(pt)
                except (TypeError, ValueError):
                    continue
                book_points.setdefault(str(name), pt)
            for name, pt in book_points.items():
                seen.setdefault(name, {}).setdefault(mk, []).append(pt)
    return {name: {mk: _median(vals) for mk, vals in per_mk.items()}
            for name, per_mk in seen.items()}


def implied_points(market_points: dict, scoring_table: dict):
    """(points, stat_line) for ONE player from their {market_key: point} dict
    — markets combine ADDITIVELY into one stat line, scored under the
    league's own table. (None, {}) when no requested market maps to a
    scoring key (never a zero)."""
    import scoring as scoring_mod
    stat_line: dict = {}
    for mk, val in market_points.items():
        key = MARKET_TO_STAT.get(mk)
        if key is None:
            continue
        stat_line[key] = round(stat_line.get(key, 0.0) + val, 3)
    if not stat_line:
        return None, {}
    pts = scoring_mod.score_stat_line(stat_line, scoring_table)
    return pts, stat_line


# ── name -> board player_id (pure) ───────────────────────────────────────────

def board_index(players: list) -> dict:
    """normalize_name(board name) -> [(player_id, team, pos, board_name), ...]
    — a list because two board players can normalize to the same key; team
    disambiguates them at match time, never a guess."""
    idx: dict = {}
    for p in players:
        name = p.get("name")
        pid = p.get("player_id")
        if not name or not pid:
            continue
        key = normalize_name(name)
        idx.setdefault(key, []).append(
            (str(pid), p.get("team"), p.get("position"), name))
    return idx


def match_player(name: str, home_code, away_code, idx: dict):
    """(match-or-None, reason). match is (pid, team, pos, board_name).
    Candidates are filtered to the event's two teams when both are known
    (the common, precise case); ambiguity (more than one candidate on those
    teams sharing a normalized name) is named, never guessed through."""
    cands = idx.get(normalize_name(name)) or []
    if not cands:
        return None, "no board player normalizes to this name"
    teams = {t for t in (home_code, away_code) if t}
    if teams:
        filtered = [c for c in cands if c[1] in teams]
    else:
        filtered = cands
    if len(filtered) == 1:
        return filtered[0], None
    if not filtered:
        return None, "board candidate(s) exist but none on this event's two teams"
    return None, "ambiguous — multiple board candidates on this event's teams"


# ── one event, one week (pure) ───────────────────────────────────────────────

def build_event_player_rows(odds_doc: dict, home_team: str, away_team: str,
                            idx: dict, scoring_table: dict,
                            markets=DEFAULT_MARKETS):
    """(rows {pid: {...}}, unmatched [{"name","reason"}...]) for one event."""
    home_code = TEAM_NAME_TO_CODE.get(str(home_team or ""))
    away_code = TEAM_NAME_TO_CODE.get(str(away_team or ""))
    props = extract_event_props(odds_doc, markets)
    rows: dict = {}
    unmatched: list = []
    for name, market_points in sorted(props.items()):
        match, reason = match_player(name, home_code, away_code, idx)
        if not match:
            unmatched.append({"name": name, "reason": reason})
            continue
        pid, team, pos, board_name = match
        pts, stat_line = implied_points(market_points, scoring_table)
        if pts is None:
            unmatched.append({"name": name,
                              "reason": "no requested market mapped to a scoring key"})
            continue
        rows[pid] = {"name": board_name, "team": team, "pos": pos,
                    "points": pts, "stat_line": stat_line,
                    "markets_used": sorted(market_points)}
    return rows, unmatched


def build_week_props(events: list, board_players: list, scoring_table: dict,
                     markets=DEFAULT_MARKETS) -> dict:
    """{players: {pid: {...}}, unmatched: [...], events: [{...meta...}]} for
    every event handed in. Two events naming the same player (should not
    happen within one week; a mid-week trade could) — the later event in the
    list wins, matching fetch_component_stats.py's own-and-say-so precedent
    for the rare double-row case rather than silently summing across games."""
    idx = board_index(board_players)
    players: dict = {}
    unmatched: list = []
    events_meta: list = []
    for ev in events:
        odds_doc = ev.get("odds")
        eid = ev.get("event_id") or ev.get("id")
        if odds_doc is None:
            events_meta.append({"event_id": eid, "status": ev.get("status", "no_odds"),
                                "players_matched": 0})
            continue
        rows, um = build_event_player_rows(
            odds_doc, ev.get("home_team"), ev.get("away_team"), idx,
            scoring_table, markets)
        players.update(rows)
        for u in um:
            unmatched.append({**u, "event_id": eid})
        events_meta.append({
            "event_id": eid, "home": ev.get("home_team"), "away": ev.get("away_team"),
            "kickoff": ev.get("kickoff"), "status": "ok",
            "players_matched": len(rows), "unmatched": len(um),
        })
    return {"players": players, "unmatched": unmatched, "events": events_meta}


def build_snapshot(result: dict, season: int, week: int, date: str,
                   markets=DEFAULT_MARKETS) -> dict:
    """The committed doc: the graded contract weekly_props_arm.py reads
    (`players[pid].points`), full unmatched log (never a silent drop), and
    provenance stating exactly which markets were CONFIRMED vs assumed."""
    n_events = len(result["events"])
    return {
        "_territory": "TERRITORY: A — produced by draft/tools/fetch_weekly_props.py",
        "_note": ("OUR weekly player-prop-implied points for ONE week, priced "
                  "directly from that week's O/U lines under the league's own "
                  "scoring table — the weekly counterpart to the season-total "
                  "props arm (a separate study). A player with NO quoted market "
                  "that week is ABSENT from `players`, never a zero. Consumed "
                  "by draft/weekly_props_arm.py, graded by weekly_own_grade.py "
                  "as the props_weekly_v1 STUDY arm — contract: "
                  "draft/audit/weekly_props_study_2026-08-16.md."),
        "season": season,
        "week": week,
        "date": date,
        "formula": FORMULA_VERSION,
        "provenance": {
            "source": "the-odds-api.com /v4 historical player-props",
            "markets_requested": list(markets),
            "markets_confirmed_live": sorted(CONFIRMED_MARKETS & set(markets)),
            "markets_assumed": sorted(set(markets) - CONFIRMED_MARKETS),
            "regions": DEFAULT_REGIONS,
            "events_processed": n_events,
            "players_priced": len(result["players"]),
            "unmatched_count": len(result["unmatched"]),
            "credits": estimate_credits(n_events, markets),
        },
        "players": result["players"],
        "unmatched": result["unmatched"],
        "events": result["events"],
    }


# ── network I/O (CI only — the sandbox cannot reach api.the-odds-api.com) ────

def _get_json(url: str, timeout: int = 30):
    """(json body or None, headers dict). None on ANY transport/HTTP failure —
    a 404/429 body must never be parsed as odds data."""
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "maga-league-props-fetch"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.load(r)
            headers = dict(r.headers)
        return body, headers
    except Exception:
        return None, {}


def fetch_week_events(api_key: str, date: str) -> list:
    """The historical events list at `date` — cheap (not a markets call)."""
    url = f"{HIST_BASE}/events?apiKey={api_key}&date={date}"
    body, _ = _get_json(url)
    if body is None:
        return []
    data = body.get("data") if isinstance(body, dict) else body
    return data or []


def fetch_event_odds(event_id: str, api_key: str, date: str,
                     markets=DEFAULT_MARKETS, regions: str = DEFAULT_REGIONS):
    """ONE credit-spending call: 10 x len(markets) x regions credits."""
    mk = ",".join(markets)
    url = (f"{HIST_BASE}/events/{event_id}/odds?apiKey={api_key}"
          f"&regions={regions}&markets={mk}&date={date}")
    return _get_json(url)


def fetch_week(api_key: str, date: str, markets=DEFAULT_MARKETS,
              limit: int | None = None) -> tuple:
    """[{"event_id","home_team","away_team","kickoff","odds","status"}, ...],
    the SAME shape PROPS_WEEKLY_EVENTS injects, plus a fetch-meta dict."""
    stubs = fetch_week_events(api_key, date)
    if limit is not None:
        stubs = stubs[:limit]
    out = []
    remaining = None
    for ev in stubs:
        body, headers = fetch_event_odds(ev.get("id"), api_key, date, markets)
        if headers and headers.get("x-requests-remaining"):
            remaining = headers["x-requests-remaining"]
        out.append({
            "event_id": ev.get("id"), "home_team": ev.get("home_team"),
            "away_team": ev.get("away_team"), "kickoff": ev.get("commence_time"),
            "odds": body, "status": "ok" if body is not None else "unreachable",
        })
    return out, {"events_seen": len(stubs), "events_fetched": len(out),
                "credits_remaining": remaining}


# ── CLI ──────────────────────────────────────────────────────────────────────

def _board_players(path: Path) -> list:
    doc = json.loads(path.read_text())
    return doc.get("players") if isinstance(doc, dict) else doc


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--week", type=int, required=True)
    ap.add_argument("--date", type=str, default=None,
                    help="ISO8601 snapshot timestamp for the historical query "
                         "(required for a real fetch; the vegas store carries "
                         "no game dates so this cannot be derived for free — "
                         "see the module docstring)")
    ap.add_argument("--markets", type=str, default=",".join(DEFAULT_MARKETS))
    ap.add_argument("--limit", type=int, default=None,
                    help="cap the number of events fetched — a bounded-cost "
                         "smoke test before spending a full week's credits")
    ap.add_argument("--dry-run", action="store_true",
                    help="fetch/parse but write nothing")
    args = ap.parse_args(list(sys.argv[1:] if argv is None else argv))
    markets = tuple(m for m in args.markets.split(",") if m)

    board_path = Path(os.environ.get("PROPS_WEEKLY_BOARD")
                      or HERE.parent.parent / "public" / "draft_data.json")
    out_dir = Path(os.environ.get("PROPS_WEEKLY_OUT_DIR")
                  or HERE.parent / "data" / "props")
    events_env = os.environ.get("PROPS_WEEKLY_EVENTS")

    if not board_path.exists():
        print(f"! board not found at {board_path}; refusing")
        return 1
    board_players = _board_players(board_path)

    from fetch_component_stats import frozen_scoring_table
    scoring_table = frozen_scoring_table()

    if events_env:
        doc = json.loads(Path(events_env).read_text())
        events = doc.get("events") if isinstance(doc, dict) else doc
        print(f"PROPS_WEEKLY_EVENTS set — {len(events)} injected event(s), "
              "no network call made")
    else:
        api_key = os.environ.get("PROPS_WEEKLY_API_KEY") or os.environ.get("ODDS_API_KEY", "")
        if not api_key:
            print("! no PROPS_WEEKLY_EVENTS injected and no ODDS_API_KEY/"
                  "PROPS_WEEKLY_API_KEY set — nothing to fetch")
            return 1
        if not args.date:
            print("! --date is required for a real historical fetch (see "
                  "module docstring — the vegas store has no game dates)")
            return 1
        events, fetch_meta = fetch_week(api_key, args.date, markets, args.limit)
        print(f"fetched {fetch_meta['events_fetched']} of "
              f"{fetch_meta['events_seen']} events; credits_remaining="
              f"{fetch_meta['credits_remaining']}")

    result = build_week_props(events, board_players, scoring_table, markets)
    doc = build_snapshot(result, args.season, args.week,
                         args.date or _dt.date.today().isoformat(), markets)
    d = doc["provenance"]
    print(f"week {args.week} of {args.season}: {d['players_priced']} players "
         f"priced from {d['events_processed']} events "
         f"({d['unmatched_count']} unmatched names), markets "
         f"{d['markets_confirmed_live']} confirmed-live / "
         f"{d['markets_assumed']} assumed; estimated cost "
         f"{d['credits']['credits_total']} credits")

    if args.dry_run:
        print("DRY RUN — nothing written")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = props_snapshot_path(out_dir, args.season, args.week)
    out_path.write_text(json.dumps(doc, indent=1))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
