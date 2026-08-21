# TERRITORY: C
"""2026 SCHEDULE-STRENGTH JOIN — relay's 08-20 dispatch, ASK 2 ("two more,
both feeding P(player starts)"), `ROUTES.md` TO: C.

`team × week × position: opponent points-allowed rank` for all 18 weeks —
the one join the lineup and waiver tools would otherwise each derive
separately (the two-tables defect class this project already has a register
pattern for).

REUSED, NOT REBUILT (rule 11): the points-allowed-by-position numbers are
`defense_vs_position.json` (this session's own build, 2021-2025 pooled,
QB/RB/WR/TE) — not re-derived. The schedule is the already-committed
`nfl_schedule_2026.json` (272 real games, home/away team codes, weeks
1-18). Nothing new is fetched; this is a pure join.

TEAM CODE MISMATCH, VERIFIED BEFORE BUILDING (rule 3f) — the two sources
disagree on two of 32 codes: `defense_vs_position.json` carries `LA` and
`WAS`; `nfl_schedule_2026.json` carries `LAR` and `WSH`. `TEAM_FIX` below
normalizes the defense side to the schedule's convention, same pattern as
every other team-code fix this session.

RANK CONVENTION, STATED EXPLICITLY SO IT IS NEVER AMBIGUOUS: rank 1 = the
STINGIEST defense at that position (fewest points allowed — the HARDEST
matchup); rank 32 = the most generous (most points allowed — the EASIEST
matchup, the good start). This is the standard fantasy-analysis direction,
not assumed silently.

STATIC BY CONSTRUCTION, exactly as the ask specifies: the points-allowed
numbers are a multi-season pool, not week-specific, so every week of a
team's schedule reads the SAME opponent rank until defenses actually play
2026 games and the store is regenerated. `captured_at` and
`defense_source_seasons` are stamped so staleness is visible, not silent.

Run: python3 draft/backtest/schedule_strength.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent

DEFENSE_VS_POSITION = HERE / "defense_vs_position.json"
SCHEDULE = DRAFT / "data" / "nfl_schedule_2026.json"
OUT = HERE / "schedule_strength_2026.json"

POSITIONS = ("QB", "RB", "WR", "TE")

#: defense_vs_position's codes -> nfl_schedule_2026's codes, verified by a
#: real set-difference before writing this module (rule 3f): {'LA','WAS'}
#: vs {'LAR','WSH'}, nothing else differs across the 32 teams.
TEAM_FIX = {"LA": "LAR", "WAS": "WSH"}

#: RULE 3e refusal floor (relay's 08-21 loop-audit, ASK 2 -- this module
#: only checked its two input FILES exist, not that either parsed into
#: real rows). A real run 08-21 produced 32 teams / 544 team-weeks; either
#: floor sits well below that real number, not guessed, to catch an empty
#: or reshaped upstream (either defense_vs_position.json or the schedule)
#: loudly instead of a silent thin "OK".
MIN_TEAMS = 30
MIN_TEAM_WEEKS = 450


def rank_defenses_by_position(by_defense: dict) -> dict:
    """{position: {team: rank}} -- rank 1 = fewest points allowed (hardest
    matchup), rank 32 = most allowed (easiest matchup). Team codes
    normalized to the schedule's convention via TEAM_FIX."""
    out: dict = {pos: {} for pos in POSITIONS}
    for pos in POSITIONS:
        rows = []
        for team, rec in by_defense.items():
            posrec = rec.get(pos)
            if not posrec or posrec.get("mean_allowed") is None:
                continue
            fixed = TEAM_FIX.get(team, team)
            rows.append((fixed, posrec["mean_allowed"]))
        rows.sort(key=lambda r: r[1])  # ascending: fewest allowed first
        for i, (team, _mean) in enumerate(rows, start=1):
            out[pos][team] = i
    return out


def opponent_of(game_row: dict, team: str) -> str | None:
    if game_row.get("home") == team:
        return game_row.get("away")
    if game_row.get("away") == team:
        return game_row.get("home")
    return None


def build_team_schedule(schedule_rows: list) -> dict:
    """{team: {week: opponent}} -- a bye week has no entry, never a
    fabricated opponent."""
    out: dict = {}
    for row in schedule_rows:
        for team in (row.get("home"), row.get("away")):
            if not team:
                continue
            opp = opponent_of(row, team)
            if opp is None:
                continue
            out.setdefault(team, {})[int(row["week"])] = opp
    return out


def refusal_reason(doc: dict) -> str | None:
    """None if `doc` clears the rule-3e floors, else the reason it doesn't.
    Pure, so the fail arm is testable without a real upstream failure."""
    n_teams = len(doc["by_team"])
    n_weeks = sum(len(w) for w in doc["by_team"].values())
    if n_teams < MIN_TEAMS or n_weeks < MIN_TEAM_WEEKS:
        return (f"only {n_teams} teams / {n_weeks} team-weeks (floor "
               f"{MIN_TEAMS}/{MIN_TEAM_WEEKS}, real runs see 32/544) -- "
               "defense_vs_position.json or nfl_schedule_2026.json empty "
               "or reshaped")
    return None


def build_store(defense_doc: dict, schedule_doc: dict) -> dict:
    ranks = rank_defenses_by_position(defense_doc.get("by_defense") or {})
    team_schedule = build_team_schedule(schedule_doc.get("rows") or [])

    by_team: dict = {}
    for team, weeks in team_schedule.items():
        team_out = {}
        for wk, opp in weeks.items():
            team_out[str(wk)] = {
                "opponent": opp,
                "opponent_points_allowed_rank": {
                    pos: ranks[pos].get(opp) for pos in POSITIONS
                },
            }
        by_team[team] = team_out

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/schedule_strength.py",
        "_note": ("team x week x position: opponent points-allowed rank "
                 "(1 = stingiest/hardest matchup, 32 = most generous/"
                 "easiest), joined from defense_vs_position.json (2021-2025 "
                 "pooled, rule 11) and nfl_schedule_2026.json. STATIC until "
                 "2026 defenses actually play; regenerate weekly in-season."),
        "captured_at": None,   # filled by the caller with a real timestamp
        "defense_source_seasons": defense_doc.get("seasons"),
        "season": schedule_doc.get("season"),
        "positions": list(POSITIONS),
        "by_team": by_team,
    }
    return doc


def main() -> int:
    if not DEFENSE_VS_POSITION.exists():
        print("VOID -- defense_vs_position.json not found", file=sys.stderr)
        return 1
    if not SCHEDULE.exists():
        print("VOID -- nfl_schedule_2026.json not found", file=sys.stderr)
        return 1
    defense_doc = json.loads(DEFENSE_VS_POSITION.read_text())
    schedule_doc = json.loads(SCHEDULE.read_text())

    doc = build_store(defense_doc, schedule_doc)
    doc["captured_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    reason = refusal_reason(doc)
    if reason:
        print(f"REFUSING TO WRITE: {reason}. Nothing written.", file=sys.stderr)
        return 1
    n_teams = len(doc["by_team"])
    n_weeks = sum(len(w) for w in doc["by_team"].values())
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {n_teams} teams, {n_weeks} team-weeks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
