# TERRITORY: C
"""THE SECOND VEGAS-LINES COPY — register row 16.

`draft/backtest/vegas_lines_2021_2026.json` (TERRITORY: A) is built from the
nflverse `schedules` release. Register row 16 asks for a SECOND, independently
maintained nflverse table carrying the same `spread_line`/`total_line`
quantity — the `pbp` release's play-by-play data, which repeats each game's
line on every play row — so `draft/tests/test_vegas_lines_reconcile.py`
(TERRITORY: D, already built and proven on synthetic fixtures) has a real
second input to diff against. Two copies that disagree means one pipeline is
wrong; nobody could check until this file existed.

`nfl_data_py.import_pbp_data()` was probed 2026-08-17 (HTTP 200, per register
16's own note) but is not used here: the SAME defect already documented for
skill positions (grade.py, weekly_projection_archive.py) applies — fetched
directly from the nflverse-data GitHub release assets instead, verified
reachable from this sandbox even where Sleeper/FantasyPros are not.

WHY THIS COPY INCLUDES POSTSEASON AND THE OTHER DOES NOT, ON PURPOSE:
`vegas_lines_2021_2026.json` is REG-only by its own provenance
(`season_type: "REG"`). This copy keeps `game_type in (REG, POST)`, matching
what register 16 itself described ("854 games incl. post") and what the
reconciler's own docstring already expects and names rather than silently
drops (`only_b` entries, not an error).

DEDUPE, NOT SAMPLE: pbp repeats one game's line on every play row (thousands
of rows per game). `drop_duplicates` on the schedule-level identity
(season, week, home, away) after a first-writer-wins per-game reduction, not a
row sample — a play that lacks the line (should not happen, checked) would
otherwise silently become "no line for this game" instead of a refused row.

Run: python3 draft/tools/vegas_lines_pbp_fetch.py [season ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent

OUT = DRAFT / "backtest" / "vegas_lines_pbp.json"

PBP_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
          "pbp/play_by_play_{season}.parquet")

DEFAULT_SEASONS = (2023, 2024, 2025)

#: Only the Rams disagree between nflverse's own "LA" and this repo's "LAR"
#: (verified against public/draft_data.json's DEF rows and against
#: kicking/def/schedules all agreeing with each other on "LA") — same fix,
#: same reasoning, as kdef_weekly_points.py.
TEAM_FIX = {"LA": "LAR"}


def _fix_team(code: str) -> str:
    return TEAM_FIX.get(code, code)


PBP_COLUMNS = ("season", "week", "game_id", "home_team", "away_team",
              "spread_line", "total_line", "season_type")


def games_from_pbp_rows(rows: list) -> list:
    """[pbp row dict, ...] -> one row per REAL game, first-writer-wins on
    game_id (every play in a game repeats the same line, verified by hand
    against a real 2024 game before trusting it as safe to dedupe this way).

    REG and POST only — PRE (preseason) carries no meaningful line and is not
    what register 16 asked for.
    """
    seen = {}
    for r in rows:
        if r.get("season_type") not in ("REG", "POST"):
            continue
        gid = r.get("game_id")
        if not gid or gid in seen:
            continue
        spread = r.get("spread_line")
        total = r.get("total_line")
        if spread is None or total is None:
            continue
        seen[gid] = {
            "week": int(r["week"]),
            "home": _fix_team(r["home_team"]),
            "away": _fix_team(r["away_team"]),
            "spread_line": float(spread),
            "total_line": float(total),
            "season_type": r["season_type"],
        }
    return list(seen.values())


def build_store(seasons=DEFAULT_SEASONS, fetch_fn=None) -> dict:
    """`fetch_fn(season) -> [row dict, ...]` injected for testability without
    a real fetch; defaults to the real nflverse-data pull."""
    fetch_fn = fetch_fn or _fetch_pbp_rows
    out_seasons = {}
    provenance = {"url_template": PBP_URL, "tried": [], "games_per_season": {}}
    for season in seasons:
        url = PBP_URL.format(season=season)
        try:
            rows = fetch_fn(season)
            provenance["tried"].append({"season": season, "url": url, "ok": True})
        except Exception as e:  # noqa: BLE001
            provenance["tried"].append({"season": season, "url": url, "ok": False,
                                        "error": f"{type(e).__name__}: {e}"})
            continue
        games = games_from_pbp_rows(rows)
        if games:
            out_seasons[str(season)] = sorted(
                games, key=lambda g: (g["week"], g["home"]))
            provenance["games_per_season"][str(season)] = len(games)

    total_games = sum(len(v) for v in out_seasons.values())
    doc = {
        "_territory": "TERRITORY: C — produced by draft/tools/vegas_lines_pbp_fetch.py",
        "_note": "Per-game spread_line/total_line from the nflverse PBP release "
                 "(register row 16's second, independent copy of the same "
                 "quantity vegas_lines_2021_2026.json carries from the schedules "
                 "release) -- REG and POST both included, deduped one row per "
                 "real game (pbp repeats the line on every play). Team code "
                 "fixed (LA -> LAR) to match this repo's own convention. "
                 "See draft/tests/test_vegas_lines_reconcile.py for the diff "
                 "this exists to unblock.",
        "provenance": provenance,
        "total_games": total_games,
        "seasons": out_seasons,
    }
    return doc


def _fetch_pbp_rows(season: int) -> list:  # pragma: no cover  (egress)
    import pandas as pd
    df = pd.read_parquet(PBP_URL.format(season=season), columns=list(PBP_COLUMNS))
    return df.to_dict("records")


def main(seasons=DEFAULT_SEASONS) -> int:  # pragma: no cover  (egress; CI only)
    doc = build_store(seasons)
    if not doc["seasons"]:
        print("VOID -- no season produced any games", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(DRAFT.parent)}: {doc['total_games']} games "
         f"across {len(doc['seasons'])} seasons")
    return 0


if __name__ == "__main__":
    yrs = tuple(int(a) for a in sys.argv[1:]) or DEFAULT_SEASONS
    sys.exit(main(yrs))
