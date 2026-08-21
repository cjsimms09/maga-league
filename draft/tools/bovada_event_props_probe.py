#!/usr/bin/env python3
# TERRITORY: capture (C's family; same file group as bovada_lines_capture.py).
"""BOVADA PER-EVENT PROPS PROBE — the follow-up `free_odds_probe.json` (run
`e7b81242`) named: the general coupon endpoint returned zero player props,
but "props usually live" one level deeper, at a per-EVENT detail path. This
is a PROBE, not a capture — Rule 3e: measure first, build ongoing capture
only if positive, same discipline `bovada_lines_capture.py` itself followed
(it exists because `free_odds_probe.py` found Bovada positive for game
lines first).

REUSE, NOT REBUILD (rule 11): the per-event response is expected to share
the SAME shape the general coupon endpoint already has (an event dict with
`description`/`displayGroups`/`startTime`, `displayGroups` holding named
market groups) — if so, `bovada_lines_capture.py`'s own `walk()` extracts
whatever markets are there with zero changes, and any NEW group names
(e.g. "Passing Props", "Player Props") are simply groups that endpoint
didn't carry before. This probe reuses that exact function rather than
writing a second parser for the same shape.

⚠️ THE EVENT-DETAIL URL IS UNCONFIRMED, STATED PLAINLY: this session cannot
reach bovada.lv at all (proxy-403, same as every non-nflverse host), so
this module has never seen a real response from either endpoint. The URL
below follows the general endpoint's own documented path convention (its
event `link` field's slug appended as a path segment) — that pattern is a
reasonable guess from the reachable endpoint's own shape, not a verified
fact. If it 404s or reshapes, this probe reports that plainly; it does not
retry a second guessed pattern silently.

Run: python3 draft/tools/bovada_event_props_probe.py [--limit N]
"""
from __future__ import annotations

import json
import sys
import datetime
import urllib.request

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bovada_lines_capture import URL as COUPON_URL, UA, walk  # noqa: E402 (rule 11)

OUT = "draft/backtest/bovada_event_props_probe.json"

#: Group-name substrings that would indicate a real player-prop market, not
#: a game-line/score-prop group already captured. Checked case-insensitively
#: against `displayGroups[*].description` and the flattened market keys
#: `walk()` produces — a real positive names an actual player stat, not just
#: the word "prop" (Score Props/Game Props are already captured and are not
#: player-level).
PLAYER_PROP_HINTS = ("passing", "rushing", "receiving", "player prop",
                     "touchdown scorer", "anytime td")


def event_url(link: str) -> str:
    """The general coupon endpoint's own `link` field is a site-relative
    path like '/football/nfl/team-a-team-b-202609271625'; the guessed
    per-event API convention appends its final slug to the same API base
    the coupon endpoint uses."""
    slug = link.rsplit("/", 1)[-1]
    return f"{COUPON_URL}/{slug}"


def classify_markets(market_keys: list) -> dict:
    """Pure: which of a game's extracted market keys look like real player
    props vs already-known group names. No I/O."""
    player_like = [k for k in market_keys
                  if any(h in k.lower() for h in PLAYER_PROP_HINTS)]
    return {"total_markets": len(market_keys), "player_like": player_like,
           "has_player_props": len(player_like) > 0}


def _fetch(url: str) -> dict:  # pragma: no cover  (egress)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def run(limit: int = 5) -> dict:  # pragma: no cover  (egress)
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    try:
        coupon = _fetch(COUPON_URL)
    except Exception as exc:  # noqa: BLE001
        return {"ts": ts, "status": "COUPON_FETCH_FAILED",
               "error": f"{type(exc).__name__}: {exc}"}
    games = walk(coupon)
    if not games:
        return {"ts": ts, "status": "COUPON_EMPTY",
               "detail": "the general endpoint itself returned no games — "
                        "cannot probe per-event without a real link"}

    results = []
    for g in games[:limit]:
        link = g.get("link")
        if not link:
            results.append({"game": g["game"], "status": "NO_LINK"})
            continue
        url = event_url(link)
        try:
            doc = _fetch(url)
        except Exception as exc:  # noqa: BLE001
            results.append({"game": g["game"], "url": url, "status": "FETCH_FAILED",
                            "error": f"{type(exc).__name__}: {exc}"})
            continue
        event_games = walk(doc)
        if not event_games:
            results.append({"game": g["game"], "url": url, "status": "EMPTY_OR_RESHAPED",
                            "detail": "walk() extracted nothing — either a 404 "
                                     "body, or the per-event shape does not "
                                     "match the coupon endpoint's own shape"})
            continue
        market_keys = sorted({k for eg in event_games for k in eg["markets"]})
        classification = classify_markets(market_keys)
        results.append({"game": g["game"], "url": url, "status": "OK",
                        **classification})

    any_positive = any(r.get("has_player_props") for r in results)
    doc = {
        "_territory": "TERRITORY: capture (C's family) — "
                     "draft/tools/bovada_event_props_probe.py",
        "_note": ("Answers whether Bovada's per-event detail path carries "
                 "player props, where the general coupon endpoint showed "
                 "zero (free_odds_probe run e7b81242). The event URL "
                 "pattern is a guess from the coupon endpoint's own link "
                 "shape, unverified until this run's own status field "
                 "confirms it (never 'assumed reachable')."),
        "ts": ts, "status": "PROBED", "n_events_checked": len(results),
        "any_player_props_found": any_positive, "results": results,
    }
    return doc


def main() -> int:  # pragma: no cover  (egress)
    limit = 5
    if len(sys.argv) > 2 and sys.argv[1] == "--limit":
        limit = int(sys.argv[2])
    doc = run(limit)
    with open(OUT, "w") as f:
        json.dump(doc, f, indent=1)
    if doc.get("status") != "PROBED":
        print(f"PROBE COULD NOT RUN: {doc}")
        return 1
    print(f"probed {doc['n_events_checked']} events; "
         f"any_player_props_found={doc['any_player_props_found']}")
    for r in doc["results"]:
        print(f"  [{r['status']:^16}] {r['game']}"
             + (f" -- {r.get('player_like')}" if r.get("player_like") else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
