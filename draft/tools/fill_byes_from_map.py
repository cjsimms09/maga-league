#!/usr/bin/env python3
"""A TEAM'S BYE IS A FIXED FACT OF THE SEASON. STOP ASKING THE FEED FOR IT NIGHTLY.

── WHAT HAPPENED ──────────────────────────────────────────────────────────────

The board's per-player `bye` comes from whatever the nightly projection feed
publishes. On the published 2026-09-10 board that was all 32 teams. On the
candidate board of 2026-09-27 it was **24**, and the acceptance gate refused to
publish — correctly, by its own lights:

    test_actionable_board: only 24 teams have a bye on this board — the gap is
    now a source problem rather than a fill that did not happen, which is a
    different and worse finding
    test_byes: ['all 32 teams resolve a bye', 'every player on a real team
    resolves a bye', 'every defense resolves a bye']
    test_roster_robustness (x6): TypeError: int() argument must be ... not
    'NoneType'

Those six TypeErrors are a missing bye reaching `int()`. One upstream omission,
eight blocking failures, and the board has not published for eighteen days.

── WHY A BACKFILL IS THE RIGHT FIX AND NOT A PAPER-OVER ───────────────────────

The 2026 byes were settled before a ball was thrown and cannot change. We
already hold them, complete and committed, in `src/nfl_byes.json` — all 32
teams, weeks 5-14, derived by `gen_byes.py` from a board that had full coverage.
Re-asking a projection feed every night for a constant is how a constant goes
missing; a frozen map is strictly better evidence mid-season than a live source,
because the live source can only degrade.

⚠️ NOT CIRCULAR, THOUGH IT LOOKS IT. `gen_byes.py` derives the map FROM the
board and this fills the board FROM the map. That is a fixpoint, not a loop: the
map is already seeded with 32 correct teams, this tool only ever fills a value
that is MISSING, and it never overwrites one the feed supplied. If the feed and
the map disagree the feed wins and the tool says so on stdout — so a genuine
schedule correction still propagates, and a silent omission no longer does.

⚠️ AND IT CANNOT INVENT A SEASON. If the map has no entry for the board's
season it fills nothing and exits 0 with a loud line. A WRONG bye false-zeros a
playing player, which `src/nfl_byes.json`'s own note calls worse than a dormant
guard — so absent beats guessed, here as there.

Run: python3 draft/tools/fill_byes_from_map.py [--board PATH] [--check]
     --check reports and exits 1 if anything is still missing, without writing.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
BYES = ROOT / "src" / "nfl_byes.json"

#: Not a real NFL team — free agents have no schedule and so no bye. Excluded
#: from every count here, exactly as `gen_byes.py` excludes it when deriving.
NOT_A_TEAM = {"FA", "", None}


def season_of(board: dict) -> str:
    return str(int((board.get("built_at") or "2026")[:4]))


def fill(board: dict, byes: dict) -> dict:
    """Fill missing per-player `bye` from the frozen map. Returns a report."""
    season = season_of(board)
    table = byes.get(season) or {}
    players = board.get("players") or []

    report = {"season": season, "map_teams": len(table), "filled": 0,
              "already": 0, "no_map_entry": set(), "disagreements": [],
              "unfillable": 0}
    if not table:
        report["no_map_for_season"] = True
        return report

    for p in players:
        team = p.get("team")
        if team in NOT_A_TEAM:
            continue
        want = table.get(team)
        have = p.get("bye")
        if have:
            report["already"] += 1
            if want and int(have) != int(want):
                # The feed disagrees with the frozen map. The FEED WINS — a real
                # schedule correction has to be able to land — but it is printed,
                # because the other explanation is that the map is stale and
                # nobody would otherwise find out.
                report["disagreements"].append(
                    {"player": p.get("name"), "team": team, "board": have, "map": want})
            continue
        if want:
            p["bye"] = int(want)
            report["filled"] += 1
        else:
            report["no_map_entry"].add(team)
            report["unfillable"] += 1
    report["no_map_entry"] = sorted(report["no_map_entry"])
    return report


def teams_without_a_bye(board: dict) -> list:
    players = board.get("players") or []
    teams = {p.get("team") for p in players if p.get("team") not in NOT_A_TEAM}
    have = {p.get("team") for p in players
            if p.get("team") not in NOT_A_TEAM and p.get("bye")}
    return sorted(teams - have)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default=str(BOARD))
    ap.add_argument("--byes", default=str(BYES))
    ap.add_argument("--check", action="store_true",
                    help="report only; exit 1 if any real team still lacks a bye")
    a = ap.parse_args(argv)

    board = json.loads(Path(a.board).read_text())
    byes = json.loads(Path(a.byes).read_text())

    before = teams_without_a_bye(board)

    # ⚠️ --check MUST NOT FILL. The first version called fill() and then counted
    # what was missing, which is counting after you have fixed it: check mode
    # reported a clean board every time, including on a fixture deliberately
    # stripped of eight teams. Caught by the test that demanded BOTH verdicts
    # from it (rule 3e — a checker that has only ever returned "fine" has not
    # been tested, only run).
    if a.check:
        print(f"fill_byes --check: season {season_of(board)}, "
              f"{len(before)} team(s) without a bye {before or ''}")
        return 1 if before else 0

    rep = fill(board, byes)
    after = teams_without_a_bye(board)

    if rep.get("no_map_for_season"):
        print(f"fill_byes: NO MAP for season {rep['season']} — filled nothing. "
              "A wrong bye false-zeros a playing player, so absent beats guessed.")
        return 0

    print(f"fill_byes: season {rep['season']}, map has {rep['map_teams']} teams")
    print(f"  teams lacking a bye BEFORE: {len(before)} {before or ''}")
    print(f"  filled {rep['filled']} player row(s); {rep['already']} already had one")
    print(f"  teams lacking a bye AFTER:  {len(after)} {after or ''}")
    for d in rep["disagreements"][:10]:
        print(f"  ⚠️ feed disagrees with the map (feed wins): {d}")
    if rep["disagreements"]:
        print(f"  ⚠️ {len(rep['disagreements'])} disagreement(s) — if these are not a real "
              "schedule change, src/nfl_byes.json is stale; re-derive with gen_byes.py")
    if rep["no_map_entry"]:
        print(f"  🔴 no map entry for: {rep['no_map_entry']} — these cannot be filled")

    if rep["filled"]:
        Path(a.board).write_text(json.dumps(board, separators=(",", ":")))
        print(f"  wrote {a.board}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
