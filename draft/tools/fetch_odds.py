# TERRITORY: A
"""LIVE NFL LINES CAPTURE — The Odds API, free tier, budget-aware.

Cory's ruling trail: historical bet data is NOT worth buying (EXP-WEEKLY-ENV:
even perfect-foresight game totals bought only ~+0.23 weekly MAE, tail-shaped);
CURRENT lines are worth capturing for the in-season loop — weekly team-total
context for the player projector's Vegas arm (Cory 2026-08-16: "betting market
may really help in season week to week") and pricing context for the side-bet
edge advisor. He supplied the key (ODDS_API_KEY, verified by config-check).

BUDGET DISCIPLINE, stated up front: the free tier is 500 credits/month, and a
call costs (markets x regions) credits — this fetch (3 markets x 1 region)
costs 3 per run. The workflow runs twice a week in season (~26/month). The
API's own x-requests-remaining header is recorded in every snapshot's
provenance so drift toward the cap is visible in the artifact, not a surprise.

Pure parsing is separated from fetching so tests never touch the network:
`parse_snapshot()` is the tested surface; `fetch()` is I/O glue. The sandbox
cannot reach api.the-odds-api.com — this runs in GitHub Actions
(odds-capture.yml), verified there via its dry-run mode first.

Snapshots land in draft/data/odds/ as odds_<UTCdate>.json plus latest.json
(same content, stable path for consumers). Absent market rows stay absent —
"absent, not zero", the house discipline.
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

SPORT = "americanfootball_nfl"
REGIONS = "us"
MARKETS = "h2h,spreads,totals"   # 3 markets x 1 region = 3 credits/run
BASE = "https://api.the-odds-api.com/v4/sports"


def parse_snapshot(games: list, *, fetched_at: str, remaining: str | None,
                   used: str | None) -> dict:
    """Trim the API's verbose shape to what consumers read: per game, the
    kickoff, teams, and the MEDIAN book line per market (a single book's quirk
    should not be the league's number). Books' raw spread/total values are
    kept per-game under `books` for anyone who wants the spread of spreads."""
    def median(xs):
        xs = sorted(xs)
        n = len(xs)
        if not n:
            return None
        return xs[n // 2] if n % 2 else round((xs[n // 2 - 1] + xs[n // 2]) / 2, 2)

    out_games = []
    for g in games:
        totals, spreads_home = [], []
        books = []
        home, away = g.get("home_team"), g.get("away_team")
        for bk in g.get("bookmakers", []):
            row = {"book": bk.get("key")}
            for m in bk.get("markets", []):
                if m.get("key") == "totals":
                    pts = [o.get("point") for o in m.get("outcomes", [])
                           if o.get("point") is not None]
                    if pts:
                        row["total"] = pts[0]
                        totals.append(pts[0])
                if m.get("key") == "spreads":
                    for o in m.get("outcomes", []):
                        if o.get("name") == home and o.get("point") is not None:
                            row["home_spread"] = o["point"]
                            spreads_home.append(o["point"])
            books.append(row)
        med_total = median(totals)
        med_spread = median(spreads_home)
        game = {
            "kickoff": g.get("commence_time"),
            "home": home, "away": away,
            "books_n": len(g.get("bookmakers", [])),
            "books": books,
        }
        # Implied team totals — the projector-facing number — derive from the
        # median line pair and exist only when BOTH inputs do.
        if med_total is not None:
            game["total_median"] = med_total
        if med_spread is not None:
            game["home_spread_median"] = med_spread
        if med_total is not None and med_spread is not None:
            game["implied_home"] = round((med_total - med_spread) / 2, 2)
            game["implied_away"] = round((med_total + med_spread) / 2, 2)
        out_games.append(game)

    return {
        "_territory": "TERRITORY: A — produced by draft/tools/fetch_odds.py",
        "provenance": {
            "source": "the-odds-api.com /v4 (free tier)",
            "sport": SPORT, "regions": REGIONS, "markets": MARKETS,
            "fetched_at": fetched_at,
            "credits_remaining": remaining, "credits_used": used,
            "budget_note": "500/mo free tier; this fetch costs 3 credits",
        },
        "games": out_games,
    }


def fetch(api_key: str) -> tuple[dict, str]:
    """One API call -> (snapshot dict, UTC date string). Raises on HTTP
    failure — the workflow decides whether that is fatal."""
    url = (f"{BASE}/{SPORT}/odds?regions={REGIONS}&markets={MARKETS}"
           f"&oddsFormat=american&apiKey={api_key}")
    req = urllib.request.Request(url, headers={"User-Agent": "maga-league-odds-capture"})
    with urllib.request.urlopen(req, timeout=30) as r:
        games = json.load(r)
        remaining = r.headers.get("x-requests-remaining")
        used = r.headers.get("x-requests-used")
    now = datetime.now(timezone.utc)
    snap = parse_snapshot(games, fetched_at=now.isoformat(timespec="seconds"),
                          remaining=remaining, used=used)
    return snap, now.strftime("%Y-%m-%d")


def main() -> int:
    key = os.environ.get("ODDS_API_KEY", "")
    if not key:
        print("ODDS_API_KEY is not set — nothing fetched", file=sys.stderr)
        return 1
    out_dir = Path(os.environ.get("ODDS_OUT_DIR", str(OUT_DIR)))
    snap, day = fetch(key)
    out_dir.mkdir(parents=True, exist_ok=True)
    dated = out_dir / f"odds_{day}.json"
    dated.write_text(json.dumps(snap, indent=1))
    (out_dir / "latest.json").write_text(json.dumps(snap, indent=1))
    prov = snap["provenance"]
    print(f"captured {len(snap['games'])} games -> {dated.name}; "
          f"credits remaining {prov['credits_remaining']} (used {prov['credits_used']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
