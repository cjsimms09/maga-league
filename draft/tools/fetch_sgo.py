# TERRITORY: A
"""LIVE NFL LINES CAPTURE — SportsGameOdds v2, free tier, budget-aware.

Why this exists next to fetch_odds.py: the key-probe run (2026-08-16) proved
the stored ODDS_API_KEY opens NO provider (401 at the-odds-api, sportsgameodds
AND balldontlie), while Cory's SPORTSGAME_ODDS_API answers 200. This fetcher
uses the door that actually opens. fetch_odds.py stays for the day a real
The Odds API key lands — the workflow runs both and succeeds if either does.

BUDGET: Cory's words — "free tier, 2.5k objects per month, pulling 10 nfl
games = 10 objects (regardless of how many bets get pulled for that game)".
Cost is per EVENT returned. A full NFL week is ~16 events; two captures a
week is ~150 objects/month against 2,500 — comfortable. LIMIT below caps a
single run's worst case.

PARSING DISCIPLINE: the odds dict is keyed by oddID strings (e.g.
"points-home-game-sp-home"). Only game-level lines are kept — player props
are dropped by pattern, not by trusting a market list. Every extraction is
defensive: a missing key yields an absent field, never a crash and never a
zero ("absent, not zero"). The RAW game-level odd objects are kept per game
so a parse gap loses nothing.

Pure parsing (parse_snapshot_sgo) is separated from I/O (fetch) so tests
never touch the network; the sandbox can't reach api.sportsgameodds.com —
this runs in GitHub Actions (odds-capture.yml), dry-run verified first.

Snapshots land in draft/data/odds/ as sgo_<UTCdate>.json plus
sgo_latest.json (stable path for consumers).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent / "data" / "odds"

BASE = "https://api.sportsgameodds.com/v2"
LEAGUE = "NFL"
LIMIT = 30  # hard cap on events (= objects) a single run can spend


def _num(x):
    """SGO ships numbers as strings ('+3.5', '47.5', '-110'). None on junk."""
    if x is None:
        return None
    try:
        return float(str(x).replace("+", ""))
    except ValueError:
        return None


def _first(d: dict, *keys):
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


def _team_name(t: dict) -> str | None:
    names = t.get("names") or {}
    return _first(names, "long", "medium", "short") or t.get("teamID")


def parse_snapshot_sgo(events: list, *, fetched_at: str) -> dict:
    """Trim SGO events to what consumers read: kickoff, teams, and the
    game-level lines (spread / total / moneylines), preferring the book
    consensus number over the fair/model number where both exist."""
    out_games = []
    for ev in events:
        teams = ev.get("teams") or {}
        home_t, away_t = teams.get("home") or {}, teams.get("away") or {}
        status = ev.get("status") or {}
        game = {
            "event_id": ev.get("eventID"),
            "kickoff": _first(status, "startsAt") or ev.get("startsAt"),
            "home": _team_name(home_t), "away": _team_name(away_t),
        }
        odds = ev.get("odds") or {}
        game_lines = {oid: o for oid, o in odds.items()
                      if isinstance(o, dict) and "-game-" in oid
                      and oid.startswith("points-")}
        spread_o = game_lines.get("points-home-game-sp-home") or {}
        total_o = game_lines.get("points-all-game-ou-over") or {}
        ml_home_o = game_lines.get("points-home-game-ml-home") or {}
        ml_away_o = game_lines.get("points-away-game-ml-away") or {}

        spread = _num(_first(spread_o, "bookSpread", "fairSpread", "spread"))
        total = _num(_first(total_o, "bookOverUnder", "fairOverUnder", "overUnder"))
        ml_home = _num(_first(ml_home_o, "bookOdds", "fairOdds", "odds"))
        ml_away = _num(_first(ml_away_o, "bookOdds", "fairOdds", "odds"))

        if spread is not None:
            game["home_spread"] = spread
        if total is not None:
            game["total"] = total
        if ml_home is not None:
            game["ml_home"] = ml_home
        if ml_away is not None:
            game["ml_away"] = ml_away
        # Implied team totals — the projector-facing number — exist only when
        # BOTH inputs do ("absent, not zero").
        if spread is not None and total is not None:
            game["implied_home"] = round((total - spread) / 2, 2)
            game["implied_away"] = round((total + spread) / 2, 2)
        # Raw game-level odd objects ride along so a parse gap loses nothing;
        # player props are already filtered out above.
        game["raw_game_lines"] = game_lines
        # PLAYER PROPS, kept not dropped (Cory 2026-08-16: "Are we using
        # weekly prop bets for weekly projections? We should look at that").
        # The 2026-08-16 census saw zero props on an August event; this
        # retention exists so that the WEEK the market starts posting them,
        # the Thursday capture banks them without a code change — props have
        # no free history anywhere, so the archive IS the capture. Trimmed to
        # the line fields only to bound snapshot size.
        props = {}
        for oid, o in odds.items():
            if not isinstance(o, dict) or "-game-" not in oid or oid.startswith("points-"):
                continue
            keep = {k: o[k] for k in ("bookOverUnder", "fairOverUnder",
                                      "bookOdds", "fairOdds") if o.get(k) is not None}
            if keep:
                props[oid] = keep
        if props:
            game["props"] = props
        out_games.append(game)

    return {
        "_territory": "TERRITORY: A — produced by draft/tools/fetch_sgo.py",
        "provenance": {
            "source": "sportsgameodds.com /v2 (free tier)",
            "league": LEAGUE,
            "fetched_at": fetched_at,
            "objects_spent": len(out_games),
            "budget_note": ("2500 objects/mo free tier; cost = events returned "
                            f"(this run: {len(out_games)}, hard cap {LIMIT})"),
        },
        "games": out_games,
    }


def fetch(api_key: str) -> tuple[dict, str]:
    """One events call -> (snapshot dict, UTC date string). Raises on HTTP
    failure — the workflow decides whether that is fatal."""
    url = (f"{BASE}/events?leagueID={LEAGUE}&oddsAvailable=true"
           f"&limit={LIMIT}")
    req = urllib.request.Request(url, headers={
        "X-Api-Key": api_key, "User-Agent": "maga-league-odds-capture"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.load(r)
    events = body.get("data") or []
    now = datetime.now(timezone.utc)
    snap = parse_snapshot_sgo(events, fetched_at=now.isoformat(timespec="seconds"))
    return snap, now.strftime("%Y-%m-%d")


def main() -> int:
    key = os.environ.get("SPORTSGAME_ODDS_API", "")
    if not key:
        print("SPORTSGAME_ODDS_API is not set — nothing fetched", file=sys.stderr)
        return 1
    out_dir = Path(os.environ.get("ODDS_OUT_DIR", str(OUT_DIR)))
    snap, day = fetch(key)
    out_dir.mkdir(parents=True, exist_ok=True)
    dated = out_dir / f"sgo_{day}.json"
    dated.write_text(json.dumps(snap, indent=1))
    (out_dir / "sgo_latest.json").write_text(json.dumps(snap, indent=1))
    n_lines = sum(1 for g in snap["games"] if "total" in g or "home_spread" in g)
    print(f"captured {len(snap['games'])} NFL events ({n_lines} with game lines) "
          f"-> {dated.name}; objects spent this run: {len(snap['games'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
