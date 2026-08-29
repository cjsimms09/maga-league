#!/usr/bin/env python3
# TERRITORY: relay
"""FANTASYNERDS API CENSUS — what does Cory's key actually unlock?

Cory added FFNERD_API_KEY on 2026-08-26 ("Ff nerds API is added!") after the
A16 ask. The same hour, reading the ffanalytics package source showed its
FantasyFootballNerd scrape is an EMPTY STUB ("not implemented yet--we are
working on it", ffanalytics/R/source_scrapes.R:1426), so the key can never
make the nightly ffanalytics probe return FFNerd rows. This is the direct
replacement: fantasynerds.com's own REST API is plain GET
(`/v1/nfl/<endpoint>?apikey=KEY`), no package needed.

Cory's standing order, verbatim (2026-08-26): "Make sure we are looking at
free sources for props. If we need more info than they give you need to let
me know, don't ignore! That is the edge we need in season." So this census
asks EVERY documented endpoint — including `odds` — and records exactly what
comes back at our tier, so a gap is a named fact rather than a silent zero.

RULE 3e: a census that has never returned a positive has only been run, not
tested. The probe exits NONZERO unless at least one endpoint yields >= 50
rows carrying a player name — so "the key unlocks nothing" and "the probe is
broken" can never read the same. The key itself is never printed: only
presence and length.

Run (CI only — the sandbox proxy refuses this host at CONNECT):
    python3 draft/tools/ffnerd_probe.py            # census -> draft/data/ffnerd_census.json
    FFNERD_API_KEY=TEST python3 ...                # shape-only run on their demo key
"""
import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

BASE = "https://api.fantasynerds.com/v1/nfl"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "ffnerd_census.json")

# The documented endpoint battery. `odds` is the one Cory's props order cares
# about most; the rest establish what projection/news product the tier carries.
ENDPOINTS = [
    "draft-projections", "weekly-projections", "ros", "draft-rankings",
    "weekly-rankings", "odds", "injuries", "depth", "players", "schedule",
    "auction", "dfs", "news", "standings", "leaders", "add-drops",
]

NAME_KEYS = ("name", "player_name", "displayName", "playerName", "player")


def _player_rows(payload):
    """Count rows that look like players (dict carrying a name-ish key),
    walking one level of list/dict nesting — the API wraps rows differently
    per endpoint and guessing one shape is how probes return false nulls."""
    rows = 0
    fields = set()

    def looks_player(d):
        return isinstance(d, dict) and any(k in d for k in NAME_KEYS)

    def walk(node, depth=0):
        nonlocal rows
        if depth > 3:
            return
        if isinstance(node, list):
            for x in node[:5000]:
                walk(x, depth + 1)
        elif isinstance(node, dict):
            if looks_player(node):
                rows += 1
                fields.update(list(node.keys())[:40])
            else:
                for v in node.values():
                    walk(v, depth + 1)

    walk(payload)
    return rows, sorted(fields)[:40]


def main():
    key = os.environ.get("FFNERD_API_KEY", "").strip()
    if not key:
        print("FFNERD_API_KEY is not set — refusing to run a census that can only say 401.")
        return 2
    print(f"key present, length {len(key)} (never printed)")

    census = {
        "_territory": "TERRITORY: relay — written by draft/tools/ffnerd_probe.py",
        "_question": ("Cory 2026-08-26: key added after A16; what does it unlock, "
                      "and does anything here carry odds/props?"),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "key_len": len(key),
        "endpoints": {},
    }
    best_rows = 0
    for ep in ENDPOINTS:
        url = f"{BASE}/{ep}?apikey={key}"
        entry = {"status": None, "bytes": 0, "player_rows": 0, "fields": [],
                 "top_keys": [], "error": None}
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "maga-league-census"})
            with urllib.request.urlopen(req, timeout=25) as r:
                body = r.read()
                entry["status"] = r.status
                entry["bytes"] = len(body)
                try:
                    payload = json.loads(body)
                    if isinstance(payload, dict):
                        entry["top_keys"] = list(payload.keys())[:15]
                    n, fields = _player_rows(payload)
                    entry["player_rows"] = n
                    entry["fields"] = fields
                    best_rows = max(best_rows, n)
                except json.JSONDecodeError:
                    entry["error"] = "non-JSON body: " + body[:80].decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            entry["status"] = e.code
            entry["error"] = e.read()[:120].decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — a census records failures, it does not die on them
            entry["error"] = f"{type(e).__name__}: {e}"[:160]
        census["endpoints"][ep] = entry
        print(f"{ep:20} status={entry['status']} bytes={entry['bytes']:>8} "
              f"player_rows={entry['player_rows']:>5} err={entry['error'] or '-'}")
        time.sleep(0.4)  # polite pacing; their docs rate-limit free tiers

    census["verdict"] = {
        "any_endpoint_with_players": best_rows >= 50,
        "best_player_rows": best_rows,
        "odds_endpoint": {
            "status": census["endpoints"]["odds"]["status"],
            "bytes": census["endpoints"]["odds"]["bytes"],
            "note": ("odds returned content — read the committed fields to see if "
                     "player props or only game lines" if census["endpoints"]["odds"]["bytes"]
                     else "odds returned nothing at this tier — a named gap, per Cory's order"),
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(census, f, indent=1)
    print(f"wrote {OUT}")

    if best_rows < 50:
        print("RULE 3e: no endpoint returned >=50 player rows — the census is UNPROVEN "
              "(broken probe and empty product are indistinguishable). Exiting nonzero.")
        return 1
    print(f"control satisfied: best endpoint carries {best_rows} player rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
