#!/usr/bin/env python3
"""Regenerate src/nfl_byes.json — the per-season team→bye map the lineup optimizer's
bye guard reads. DERIVED from public/draft_data.json (which carries per-player bye+team for the
current season), so it's a measurement of the board, not a hand-typed table that can drift.

Team byes are fixed per season; the optimizer joins on a player's CURRENT team, so a mid-season
trade resolves to the new team's bye. Historical seasons are intentionally absent — the live
optimizer only needs the current season, and a WRONG bye false-zeros a playing player (the
opposite, equally costly error), so a season is added only from an authoritative source.

Run: python draft/tools/gen_byes.py   (merges the current board's season into the existing file)
"""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
OUT = ROOT / "src" / "nfl_byes.json"


def derive(board):
    season = str(int((board.get("built_at") or "2026")[:4]))
    by = collections.defaultdict(collections.Counter)
    for p in board.get("players", []):
        t, b = p.get("team"), p.get("bye")
        if t and t != "FA" and b:
            by[t][int(b)] += 1
    # one bye per team (all its players share it); take the mode, flag any split
    return season, {t: c.most_common(1)[0][0] for t, c in by.items()}


def main():
    board = json.loads(BOARD.read_text())
    season, m = derive(board)
    existing = json.loads(OUT.read_text()) if OUT.exists() else {}
    existing["_source"] = ("DERIVED from public/draft_data.json by draft/tools/gen_byes.py. Team "
                           "byes are fixed per season; join on a player's CURRENT team so trades "
                           "resolve. Read by src/sleeper.js rosterView.")
    existing["_note"] = ("Historical seasons intentionally absent: the live optimizer only needs "
                         "the current season, and a WRONG bye false-zeros a playing player (worse "
                         "than a dormant guard). Add a season only from an authoritative source.")
    existing[season] = m
    OUT.write_text(json.dumps(existing, indent=1, sort_keys=True))
    print(f"nfl_byes.json: season {season} → {len(m)} teams "
          f"(bye weeks {sorted(set(m.values()))})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
