#!/usr/bin/env python3
# TERRITORY: A
"""DID THE LINEUP WE WOULD HAVE SET BEAT THE ONE CORY PLAYED? — live, weekly.

Cory, 2026-09-16: *"we need to make sure we are trying to improve. Goal is to
build a better model."*

⚠️ THE GAP THIS FILLS, STATED PRECISELY. The weekly loop grades PROJECTIONS —
`weekly_own_grade.py` scores MAE and rank correlation per player. Nothing grades
the DECISION. `league_history.json` carries every week's starters, bench,
per-player points and the opponent's score, and until now nothing joined it back
to what our model said. So we could tell you our MAE and not tell you whether
following the model would have won you a game.

    week 1, measured: Cory scored 135.76 and lost by 11.24. He left 18.30 on
    the bench, so a perfect lineup WOULD have won. Our champion's lineup was
    IDENTICAL to the one he played — it agreed with him, and neither saw it.

That is the number that was missing, and it is the only one that answers
"are we improving" in units anybody cares about.

⚠️ THIS IS REPORT-ONLY AND WRITES NOTHING BY DEFAULT. It promotes no arm and
changes no weight. Pass --write to commit the artifact (registers 489/499: a
tool that writes as a side effect of being run is how a stale number reaches
`main` inside somebody else's commit).

── THE ARMS ───────────────────────────────────────────────────────────────────

    ACTUAL     the starters Cory really set        INSTRUMENT CHECK, not an arm
    CEILING    optimal in hindsight                INSTRUMENT CHECK, not an arm
    CHAMPION   our published weekly projection     the thing under test
    PROPS      the props-implied number            the challenger

⚠️ ACTUAL AND CEILING ARE CONTROLS, and the standard is `replay_lineup.py`'s
own §13: if ACTUAL does not reproduce Sleeper's recorded weekly `points` TO THE
CENT, then the slot assignment or the scoring here is wrong and every other
number this file prints is worthless. It refuses rather than reporting. CEILING
below ACTUAL is the same class of impossibility and refuses too.

⚠️ THE SLOT LOGIC IS IMPORTED, NOT REWRITTEN. `replay_lineup.assign()` is exact
for this league's shape and says why in its own docstring (one flex, filled
last). Two definitions of one thing is how the board and the capture drifted
apart in register 503, so this file defines none of it.

Run:  python3 draft/tools/weekly_decision_grade.py
      python3 draft/tools/weekly_decision_grade.py --write
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import money_grade as MG          # noqa: E402
import replay_lineup as RL        # noqa: E402

SEASON = "2026"
OWNER = "coryjsimms"
OUT = ROOT / "draft" / "data" / "weekly_own" / "decision_grades_2026.json"
SNAP = ROOT / "draft" / "data" / "weekly_own" / "own_weekly_{s}_w{w}.json"
SECOND = ROOT / "draft" / "data" / "weekly_own" / "second_opinion_{s}_w{w}.json"


def seat_of(season: dict, display_name: str) -> int:
    """Cory's roster_id, READ from the owners map rather than assumed to be 1.

    A hardcoded seat is the shape that made three sessions misstate his roster
    (CLAUDE.md's ROSTER RULE), so it is looked up and refused if absent.
    """
    for rid, o in (season.get("owners") or {}).items():
        if str(o.get("display_name", "")).lower() == display_name.lower():
            return int(rid)
    raise SystemExit(
        f"REFUSING: no owner named {display_name!r} in season {season.get('season')}. "
        "Do not guess a roster_id — the seat is the premise of every number below.")


def opponent_points(season: dict, week: int, rid: int):
    """(opponent display name, their score) or (None, None) if unpaired."""
    row = RL.seat_row(season, week, rid)
    if not row or row.get("matchup_id") is None:
        return None, None
    for other in RL.week_rows(season, week):
        if other is row or other.get("matchup_id") != row.get("matchup_id"):
            continue
        name = (season.get("owners") or {}).get(str(other["roster_id"]), {})
        return name.get("display_name", f"roster {other['roster_id']}"), \
            float(other.get("points") or 0.0)
    return None, None


def champion_values(week: int) -> dict:
    p = pathlib.Path(str(SNAP).format(s=SEASON, w=week))
    if not p.exists():
        return {}
    return {pid: float(r["mean"])
            for pid, r in json.loads(p.read_text())["projections"].items()}


def props_values(week: int) -> dict:
    """The props-implied points for this week, keyed by player_id.

    Read from the second-opinion artifact, which is the only place the props
    column is joined to player ids. Absent is absent — a week with no props
    file reports PROPS as null rather than silently falling back to champion,
    because a fallback would make the challenger look like it agreed.
    """
    p = pathlib.Path(str(SECOND).format(s=SEASON, w=week))
    if not p.exists():
        return {}
    doc = json.loads(p.read_text())
    out = {}
    for row in (doc.get("table") or []):
        pid, val = row.get("player_id"), row.get("props")
        if pid is not None and val is not None:
            out[str(pid)] = float(val)
    return out


def grade_week(season: dict, rid: int, week: int, slots: list, pos_of: dict) -> dict | None:
    row = RL.seat_row(season, week, rid)
    if not row or row.get("points") is None:
        return None
    pts = {k: float(v) for k, v in (row.get("players_points") or {}).items()}
    roster = list(row.get("players") or [])
    if not roster or not any(pts.values()):
        return None

    actual_ids = list(row.get("starters") or [])
    actual = round(sum(pts.get(p, 0.0) for p in actual_ids), 2)
    recorded = round(float(row["points"]), 2)

    # ── CONTROL 1 (replay_lineup §13): ACTUAL must reproduce Sleeper's own total.
    if abs(actual - recorded) > 0.011:
        raise SystemExit(
            f"REFUSING week {week}: summing the recorded starters gives {actual} "
            f"but Sleeper's own weekly total is {recorded}. The scoring or the "
            "roster join here is wrong, so every arm below would be wrong too.")

    ceiling_ids = RL.assign(slots, roster, pts, pos_of)
    ceiling = round(sum(pts.get(p, 0.0) for p in ceiling_ids), 2)

    # ── CONTROL 2: a ceiling below what actually happened is impossible.
    if ceiling < actual - 0.011:
        raise SystemExit(
            f"REFUSING week {week}: hindsight-optimal ({ceiling}) is BELOW what "
            f"was actually scored ({actual}). The optimizer is broken.")

    out = {
        "week": week,
        "actual": actual,
        "ceiling": ceiling,
        "left_on_bench": round(ceiling - actual, 2),
        "starters_actual": [RL_name(pos_of, p) for p in actual_ids],
    }
    opp_name, opp = opponent_points(season, week, rid)
    out["opponent"] = opp_name
    out["opponent_points"] = opp
    if opp is not None:
        out["result"] = "W" if actual > opp else ("L" if actual < opp else "T")
        out["margin"] = round(actual - opp, 2)
        out["ceiling_would_flip"] = bool(actual <= opp < ceiling)

    for arm, values in (("champion", champion_values(week)),
                        ("props", props_values(week))):
        if not values:
            out[arm] = None
            out[f"{arm}_note"] = "no artifact for this week — absent, not zero"
            continue
        # A player our projection never priced cannot be started BY it; he is
        # ranked last rather than dropped, so the arm still fills nine slots.
        v = {p: values.get(p, float("-inf")) for p in roster}
        ids = RL.assign(slots, roster, v, pos_of)
        got = round(sum(pts.get(p, 0.0) for p in ids), 2)
        out[arm] = got
        out[f"{arm}_vs_actual"] = round(got - actual, 2)
        out[f"{arm}_priced"] = sum(1 for p in roster if p in values)
        if opp is not None:
            out[f"{arm}_would_flip"] = bool(actual <= opp < got)
    return out


def RL_name(pos_of: dict, pid: str) -> str:
    return f"{pos_of.get(pid, '?')}:{pid}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="commit the artifact (default: print only)")
    args = ap.parse_args(argv if argv is not None else sys.argv[1:])

    hist = MG.load_history()
    season = MG.season_of(hist, SEASON)
    if season is None:
        raise SystemExit(f"REFUSING: season {SEASON} is not in league_history.json")
    rid = seat_of(season, OWNER)
    slots = RL.starting_slots(season)
    pos_of = RL.positions_map(hist)

    weeks = []
    for w in MG.regular_season_weeks(season):
        g = grade_week(season, rid, w, slots, pos_of)
        if g:
            weeks.append(g)

    if not weeks:
        print("no completed week carries scores yet — nothing to grade")
        return 0

    print(f"DECISION GRADE — {OWNER} (roster {rid}), season {SEASON}")
    print(f"  slots: {slots}")
    print(f"\n  {'wk':>2} {'actual':>7} {'ceiling':>8} {'bench':>6} "
          f"{'champ':>7} {'props':>7} {'opp':>7}  result")
    def num(x):
        return f"{x:.2f}" if x is not None else "--"

    for g in weeks:
        flags = "".join([
            "   CEILING WOULD HAVE FLIPPED IT" if g.get("ceiling_would_flip") else "",
            "   CHAMPION WOULD HAVE FLIPPED IT" if g.get("champion_would_flip") else "",
            "   PROPS WOULD HAVE FLIPPED IT" if g.get("props_would_flip") else "",
        ])
        print(f"  {g['week']:>2} {g['actual']:>7.2f} {g['ceiling']:>8.2f} "
              f"{g['left_on_bench']:>6.2f} "
              f"{num(g.get('champion')):>7} {num(g.get('props')):>7} "
              f"{num(g.get('opponent_points')):>7}"
              f"  {g.get('result', '-')}{flags}")

    n = len(weeks)
    bench = sum(g["left_on_bench"] for g in weeks) / n
    champ = [g["champion_vs_actual"] for g in weeks if g.get("champion") is not None]
    props = [g["props_vs_actual"] for g in weeks if g.get("props") is not None]
    print(f"\n  weeks graded: {n}")
    print(f"  points left on the bench, per week: {bench:.2f}")
    if champ:
        print(f"  champion lineup vs the one played: {sum(champ)/len(champ):+.2f} pts/wk "
              f"over {len(champ)} week(s)")
    if props:
        print(f"  props lineup vs the one played:    {sum(props)/len(props):+.2f} pts/wk "
              f"over {len(props)} week(s)")
    print("\n  ⚠️ one or two weeks is an anecdote, not a finding. This file exists "
          "so that by week 6 it is neither.")

    doc = {
        "_territory": "TERRITORY: A — produced by draft/tools/weekly_decision_grade.py",
        "_what": "Did our lineup beat the one Cory played? ACTUAL/CEILING are "
                 "instrument checks; CHAMPION/PROPS are the arms under test.",
        "_report_only": "promotes nothing, changes no weight",
        "season": SEASON, "roster_id": rid, "owner": OWNER,
        "weeks": weeks,
        "summary": {
            "weeks_graded": n,
            "left_on_bench_per_week": round(bench, 2),
            "champion_vs_actual_per_week": round(sum(champ) / len(champ), 2) if champ else None,
            "props_vs_actual_per_week": round(sum(props) / len(props), 2) if props else None,
        },
    }
    if args.write:
        OUT.write_text(json.dumps(doc, indent=1) + "\n")
        print(f"\n  wrote {OUT.relative_to(ROOT)}")
    else:
        print(f"\n  (not written — pass --write to commit {OUT.name})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
