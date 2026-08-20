#!/usr/bin/env python3
"""LIVE PLAYER-PROPS CAPTURE — the Odds API per-EVENT route, snapshots
committed. Built by A for D's open item ("no API credential in this
environment"): the credential lives in CI, so the capture runs there.

THE PROVEN CALL (free-market-census v2, 2026-08-18, our stored key):
`/v4/sports/americanfootball_nfl/events/{id}/odds?regions=us&markets=
player_pass_yds,...` returned 200 with DraftKings player props for the
real week-1 game — correcting the recorded "401s at every provider"
limit (P66; the relay's 💰 item to D). League-route calls 422 for props;
the per-event route is the only door.

BUDGET, stated because it is the binding constraint: the events LIST is
free; each event's odds call costs (markets x regions) credits against
the 500/month free tier. 4 markets x 1 region x ~16 games = ~64 credits
per full-slate run; weekly Thursday capture ~256/month, sharing the tier
with odds-capture.yml's ~26. MAX_EVENTS caps a run so a fluke listing
cannot drain the tier. Every response's x-requests-remaining header is
stored in the snapshot so drift is visible where the data lands.

RULE 3e: a run that finds events and gets ZERO priced player markets
across all of them exits 1 — "no props" and "asked wrong" are
indistinguishable from a quiet empty file, and this endpoint has already
produced five false negatives for this project. No events inside the
window is a stated no-op (exit 0, says so, fetches nothing, costs 0).

Run (CI): ODDS_API_KEY=... python3 draft/tools/fetch_event_props.py
Writes draft/data/odds/event_props_<UTC-date>.json (ODDS_OUT_DIR
overrides the directory — the dry-run hook, same as fetch_odds.py).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl"
MARKETS = "player_pass_yds,player_rush_yds,player_reception_yds,player_anytime_td"
WINDOW_DAYS = 8
MAX_EVENTS = 20


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "maga-league-lab"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode(), dict(r.headers)


def main() -> int:
    key = os.environ.get("ODDS_API_KEY") or ""
    if not key:
        print("fetch_event_props: no ODDS_API_KEY in the environment")
        return 1
    out_dir = Path(os.environ.get("ODDS_OUT_DIR") or (ROOT / "draft" / "data" / "odds"))
    out_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    code, body, _ = get(f"{BASE}/events?apiKey={key}")
    if code != 200:
        print(f"fetch_event_props: events list -> HTTP {code}")
        return 1
    events = json.loads(body)
    horizon = now + timedelta(days=WINDOW_DAYS)
    window = [e for e in events
              if e.get("commence_time")
              and now <= datetime.fromisoformat(
                  e["commence_time"].replace("Z", "+00:00")) <= horizon]
    if not window:
        print(f"fetch_event_props: {len(events)} NFL events listed, NONE inside "
              f"{WINDOW_DAYS} days — nothing to capture, no credits spent")
        return 0
    window = window[:MAX_EVENTS]

    snap = {"_territory": "TERRITORY: A — fetch_event_props.py (built for D's weekly lab)",
            "captured_at": now.isoformat(timespec="seconds"),
            "markets_requested": MARKETS.split(","),
            "window_days": WINDOW_DAYS,
            "events_listed": len(events), "events_fetched": len(window),
            "events": [], "credits_remaining_last": None}
    priced_events = 0
    for e in window:
        code, body, hdrs = get(f"{BASE}/events/{e['id']}/odds?regions=us"
                               f"&markets={MARKETS}&apiKey={key}")
        rec = {"event_id": e["id"], "commence_time": e.get("commence_time"),
               "home": e.get("home_team"), "away": e.get("away_team"),
               "status": code}
        remaining = hdrs.get("x-requests-remaining")
        if remaining is not None:
            snap["credits_remaining_last"] = remaining
        if code == 200:
            payload = json.loads(body)
            books = payload.get("bookmakers") or []
            n_outcomes = sum(len(m.get("outcomes") or [])
                             for b in books for m in (b.get("markets") or []))
            rec["bookmakers"] = books
            rec["n_priced_outcomes"] = n_outcomes
            if n_outcomes:
                priced_events += 1
        else:
            rec["body_head"] = body[:200]
        snap["events"].append(rec)

    if priced_events == 0:
        print(f"fetch_event_props: {len(window)} events fetched, ZERO priced "
              "player outcomes anywhere — refusing to write a silent empty "
              "snapshot (rule 3e: this shape is how five false negatives "
              "happened; check markets/regions/key before trusting a 'no')")
        return 1

    name = f"event_props_{now:%Y-%m-%d}.json"
    (out_dir / name).write_text(json.dumps(snap, indent=1))
    print(f"fetch_event_props: wrote {name} — {priced_events}/{len(window)} "
          f"events priced, credits remaining {snap['credits_remaining_last']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
