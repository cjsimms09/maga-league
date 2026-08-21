# TERRITORY: C
"""SCHEDULE-CONTEXT STORE — relay's 08-20 pull-list item 3, `ROUTES.md` TO: C.

`team × week: {opponent, home_away, rest_days, short_week}` — a classic
weekly-context axis nothing in this repo captures today. Pure derivation
from the already-committed `nfl_schedule_2026.json` (272 real games, real
ISO dates). No egress, no new fetch.

RUN, NOT ASSUMED (rule 3f): pulled BUF's real 2026 slate before choosing a
threshold. BUF plays Sunday 09-13 (week 1), then a Friday game 09-18 (week
2) — 5 real days of rest — then Sunday 09-27 (week 3) after that Friday
game, 9 days. `SHORT_WEEK_THRESHOLD = 6` catches the real 5-day case and
any Thursday-after-Sunday 3-4 day case without flagging an ordinary 7-day
gap, and does not flag the 9-day recovery week that follows a short one.

WEEK 1 HAS NO PRIOR GAME, BY CONSTRUCTION: `rest_days`/`short_week` are
absent for a team's first game of the season, never a fabricated 7 or a
guessed "not short." Absent means "no prior game to measure from," not
"unmeasured" — the two are different facts and this module does not
conflate them.

BYES ARE WHERE THIS EARNS ITS PLACE: a team coming off a bye shows real
rest_days of 13-14 rather than the usual 7, and that is a genuine signal
this module makes visible for the first time — nothing computes it today.

Run: python3 draft/backtest/schedule_context.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent

SCHEDULE = DRAFT / "data" / "nfl_schedule_2026.json"
OUT = HERE / "schedule_context_2026.json"

#: verified against BUF's real 2026 slate before choosing it (rule 3f) --
#: catches a real 5-day case, does not flag a real 9-day recovery week.
SHORT_WEEK_THRESHOLD = 6

#: RULE 3e refusal floor (relay's 08-21 loop-audit, ASK 2 -- this module
#: only checked the input FILE exists, not that it actually parsed into
#: real rows). A real run 08-21 produced 32 teams / 544 team-weeks (32
#: NFL teams x 17 games); either floor sits well below that real number,
#: not guessed, to catch a truncated/empty/reshaped schedule file loudly.
MIN_TEAMS = 30
MIN_TEAM_WEEKS = 450


def parse_date(date_str: str) -> datetime:
    return datetime.fromisoformat(date_str.replace("Z", "+00:00"))


def opponent_of(game_row: dict, team: str) -> str | None:
    if game_row.get("home") == team:
        return game_row.get("away")
    if game_row.get("away") == team:
        return game_row.get("home")
    return None


def games_by_team(rows: list) -> dict:
    """{team: [game rows, sorted by date]} -- every real game a team plays,
    home or away, chronological."""
    out: dict[str, list] = {}
    for row in rows:
        for team in (row.get("home"), row.get("away")):
            if team:
                out.setdefault(team, []).append(row)
    for team in out:
        out[team].sort(key=lambda r: r["date"])
    return out


def build_team_context(games: list) -> dict:
    """{week:int -> {opponent, home_away, rest_days, short_week}} for one
    team's chronological game list. The first game of the list carries no
    rest_days/short_week -- there is no prior game to measure from."""
    out: dict[int, dict] = {}
    prev_date = None
    for row in games:
        wk = int(row["week"])
        this_date = parse_date(row["date"])
        entry = {
            "opponent": None,  # filled by the caller, which knows the team
            "home_away": None,
        }
        if prev_date is not None:
            rest = (this_date.date() - prev_date.date()).days
            entry["rest_days"] = rest
            entry["short_week"] = rest < SHORT_WEEK_THRESHOLD
        out[wk] = entry
        prev_date = this_date
    return out


def build_store(schedule_doc: dict) -> dict:
    rows = schedule_doc.get("rows") or []
    by_team = games_by_team(rows)

    context_by_team: dict = {}
    for team, games in by_team.items():
        team_ctx = build_team_context(games)
        for row in games:
            wk = int(row["week"])
            team_ctx[wk]["opponent"] = opponent_of(row, team)
            team_ctx[wk]["home_away"] = "home" if row.get("home") == team else "away"
        context_by_team[team] = {str(wk): v for wk, v in team_ctx.items()}

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/schedule_context.py",
        "_note": ("team x week: opponent, home/away, rest_days (calendar "
                 "days since that team's PREVIOUS real game, not since the "
                 "previous week number -- a bye shows as 13-14 days, not a "
                 "gap), short_week (rest_days < "
                 f"{SHORT_WEEK_THRESHOLD}). A team's first game of the "
                 "season carries no rest_days/short_week -- there is no "
                 "prior game, and that is a different fact from zero."),
        "season": schedule_doc.get("season"),
        "short_week_threshold_days": SHORT_WEEK_THRESHOLD,
        "by_team": context_by_team,
    }
    return doc


def refusal_reason(doc: dict) -> str | None:
    """None if `doc` clears the rule-3e floors, else the reason it doesn't.
    Pure, so the fail arm is testable without a real upstream failure."""
    n_teams = len(doc["by_team"])
    n_weeks = sum(len(w) for w in doc["by_team"].values())
    if n_teams < MIN_TEAMS or n_weeks < MIN_TEAM_WEEKS:
        return (f"only {n_teams} teams / {n_weeks} team-weeks (floor "
               f"{MIN_TEAMS}/{MIN_TEAM_WEEKS}, real runs see 32/544) -- "
               "nfl_schedule_2026.json empty or reshaped")
    return None


def main() -> int:
    if not SCHEDULE.exists():
        print("VOID -- nfl_schedule_2026.json not found", file=sys.stderr)
        return 1
    schedule_doc = json.loads(SCHEDULE.read_text())
    doc = build_store(schedule_doc)
    doc["captured_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    reason = refusal_reason(doc)
    if reason:
        print(f"REFUSING TO WRITE: {reason}. Nothing written.", file=sys.stderr)
        return 1
    n_teams = len(doc["by_team"])
    n_weeks = sum(len(w) for w in doc["by_team"].values())
    OUT.write_text(json.dumps(doc, indent=1))
    n_short = sum(1 for w in doc["by_team"].values()
                 for e in w.values() if e.get("short_week"))
    print(f"wrote {OUT.relative_to(ROOT)}: {n_teams} teams, {n_weeks} team-weeks, "
         f"{n_short} short weeks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
