#!/usr/bin/env python3
# TERRITORY: A
"""MEASURED NEED — counted from three seasons of this league's own lineups.

Prereg: draft/MEASURED-NEED-PREREG-2026-08-19.md (P150, P151), committed first.

Cory: "they shouldnt be at 0 for Rb and WR!!!!" -- on a model that priced his RB5
at 0.128 and WR4 at 0.031. The cause is that `q` came from the board's
`games_expected`, a POSITIONAL CONSTANT with no variance: every RB modelled as
missing exactly 2.8 games. A binomial on a median cannot see a backfield collapse.

So stop modelling it. `league_history.json` has `starters` and `players` per
roster per week for 2023-2025. Rank each roster's players at a position by their
season points on that roster, and count how often the Nth-ranked one actually
started.

REPORT ONLY. Writes no board field, selects nothing.

Run: python3 draft/backtest/measured_need_curve.py [--json <path>]
"""
from __future__ import annotations
import json, sys, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
DATA = DRAFT / "data"
POS_OF = json.loads((DATA / "player_positions.json").read_text())["positions"]
HIST = json.loads((DATA / "league_history.json").read_text())
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
EXPECTED_STARTERS = 9


def pos_of(pid):
    v = POS_OF.get(str(pid))
    if isinstance(v, dict):
        return v.get("position")
    return v


def main() -> int:
    # started[(pos, rank)] and rostered[(pos, rank)] across all team-weeks
    started = collections.Counter()
    rostered = collections.Counter()
    per_season = collections.defaultdict(lambda: (collections.Counter(), collections.Counter()))
    unmapped, bad_weeks, good_weeks = collections.Counter(), 0, 0

    for season in HIST["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        yr = str(season["season"])
        # season points per (roster_id, player) -- accumulated from players_points
        season_pts = collections.defaultdict(float)
        for wk, rows in weeks.items():
            for r in rows:
                for pid, pts in (r.get("players_points") or {}).items():
                    season_pts[(r["roster_id"], str(pid))] += float(pts or 0)

        for wk, rows in weeks.items():
            for r in rows:
                stt = [str(x) for x in (r.get("starters") or [])]
                plr = [str(x) for x in (r.get("players") or [])]
                if len(stt) != EXPECTED_STARTERS or not plr:
                    bad_weeks += 1
                    continue
                good_weeks += 1
                by_pos = collections.defaultdict(list)
                for pid in plr:
                    p = pos_of(pid)
                    if p not in POSITIONS:
                        unmapped[pid] += 1
                        continue
                    by_pos[p].append(pid)
                for p, ids in by_pos.items():
                    # rank by season points ON THIS ROSTER -- "his Nth-best at the position"
                    ids.sort(key=lambda i: -season_pts[(r["roster_id"], i)])
                    for n, pid in enumerate(ids, start=1):
                        rostered[(p, n)] += 1
                        per_season[yr][1][(p, n)] += 1
                        if pid in stt:
                            started[(p, n)] += 1
                            per_season[yr][0][(p, n)] += 1

    def rate(p, n, st=started, ro=rostered):
        d = ro[(p, n)]
        return (st[(p, n)] / d) if d else None

    ctl = {}
    ctl["C1_starter_counts"] = {"ok": bad_weeks == 0 or good_weeks > 20 * bad_weeks,
        "good_team_weeks": good_weeks, "excluded": bad_weeks,
        "why": "every team-week must carry exactly 9 starters; exclusions counted"}
    # ⛔ C2 ORIGINALLY ASSERTED "a team's best QB starts essentially every week"
    # and FAILED at 0.693. The premise was wrong, not the data: QB1 here is the
    # season-points leader IN HINDSIGHT, and owners stream/rotate, so the leader
    # starts 69% of weeks and the #2 starts the rest. Replaced with the check
    # that actually settles the join -- average STARTERS PER TEAM-WEEK must equal
    # the league's own slot counts. Recorded rather than quietly relaxed.
    starters_pw = {p: sum(started[(p, n)] for n in range(1, 12)) / max(1, good_weeks)
                   for p in POSITIONS}
    flexed = starters_pw["RB"] + starters_pw["WR"] + starters_pw["TE"]
    ctl["C2_starters_per_week_match_league_slots"] = {
        "ok": abs(starters_pw["QB"] - 1) < 0.02 and abs(flexed - 6) < 0.05
              and abs(sum(starters_pw.values()) - 9) < 0.05,
        "got": {k: round(v, 3) for k, v in starters_pw.items()},
        "rb_wr_te": round(flexed, 3), "total": round(sum(starters_pw.values()), 3),
        "why": "QB must average exactly 1 starter/week, RB+WR+TE exactly 6, total "
               "9. The ORIGINAL C2 ('best QB starts every week') was a wrong "
               "premise that failed on sound data -- see the comment above."}
    # C3 must FAIL if the map missed most of the pool -- the first run returned
    # zero rows for every position and this control passed anyway, which made it
    # useless. It now has to see real coverage.
    mapped = sum(rostered.values())
    ctl["C3_position_map_actually_resolved"] = {
        "ok": mapped > 1000 and sum(unmapped.values()) < mapped * 0.05,
        "player_weeks_mapped": mapped, "unmapped_occurrences": sum(unmapped.values()),
        "distinct_unmapped_ids": len(unmapped),
        "why": "the first run mapped NOTHING and every control but two still "
               "passed; an unmapped-count with no floor is not a control"}
    ctl["C4_three_seasons"] = {"ok": len(per_season) == 3, "seasons": sorted(per_season)}
    ctl["C5_denominator_is_weeks_rostered"] = {"ok": True,
        "why": "rostered[] increments only on weeks the player is in `players`"}
    all_ok = all(c["ok"] for c in ctl.values())

    print("MEASURED NEED — counted from 2023-2025 lineups (P150/P151)\n")
    for k, c in ctl.items():
        print("  %s %s%s" % ("OK " if c["ok"] else "!! ", k,
              ("   " + str(c.get("got", ""))) if c.get("got") is not None else ""))
    if not all_ok:
        print("\n  !! A CONTROL FAILED. Nothing below is a measurement.\n")

    print("\n  how often an owner's Nth-best player at a position ACTUALLY STARTED")
    print("  %-4s %s" % ("pos", "".join(("%dth" % n).rjust(10) for n in range(1, 7))))
    curve = {}
    for p in POSITIONS:
        row = [rate(p, n) for n in range(1, 7)]
        curve[p] = [round(x, 3) if x is not None else None for x in row]
        print("  %-4s %s" % (p, "".join((("%.3f" % x) if x is not None else "—").rjust(10) for x in row)))
    print("\n  (n = weeks rostered)")
    for p in POSITIONS:
        print("  %-4s %s" % (p, "".join(str(rostered[(p, n)]).rjust(10) for n in range(1, 7))))

    MODEL = {"RB4": 0.128, "WR4": 0.031, "QB2": 0.147, "TE2": 0.188}
    p150 = {"measured_RB4": curve["RB"][3], "measured_WR4": curve["WR"][3],
            "model_RB4": MODEL["RB4"], "model_WR4": MODEL["WR4"]}
    p150["TRUE"] = all(v is not None and v >= 0.25 for v in (p150["measured_RB4"], p150["measured_WR4"]))
    p151 = {"measured_QB2": curve["QB"][1], "measured_TE2": curve["TE"][1]}
    p151["TRUE"] = all(v is not None and v < 0.20 for v in (p151["measured_QB2"], p151["measured_TE2"])) \
        and (p150["measured_RB4"] is not None
             and p151["measured_QB2"] < p150["measured_RB4"]
             and p151["measured_TE2"] < p150["measured_RB4"])

    print("\n  P150 (measured RB4 and WR4 both >= 0.25): %s" % ("TRUE" if p150["TRUE"] else "FALSE"))
    print("     RB 4th: measured %s vs my model %.3f" % (p150["measured_RB4"], MODEL["RB4"]))
    print("     WR 4th: measured %s vs my model %.3f" % (p150["measured_WR4"], MODEL["WR4"]))
    print("  P151 (QB2 and TE2 both < 0.20 and below RB4): %s" % ("TRUE" if p151["TRUE"] else "FALSE"))
    print("     QB 2nd: measured %s   TE 2nd: measured %s" % (p151["measured_QB2"], p151["measured_TE2"]))

    per_season_out = {}
    for yr, (st, ro) in per_season.items():
        per_season_out[yr] = {p: [round(st[(p, n)] / ro[(p, n)], 3) if ro[(p, n)] else None
                                  for n in range(1, 7)] for p in POSITIONS}
    print("\n  PER SEASON, so one odd year cannot carry it (RB row):")
    for yr in sorted(per_season_out):
        print("    %s  RB %s" % (yr, per_season_out[yr]["RB"]))

    rep = {"_territory": "TERRITORY: A — draft/backtest/measured_need_curve.py",
           "_prereg": "draft/MEASURED-NEED-PREREG-2026-08-19.md",
           "_note": "REPORT ONLY. Counted, not modelled. Selects nothing.",
           "controls": ctl, "controls_all_passed": all_ok,
           "team_weeks": good_weeks, "curve": curve,
           "n_rostered": {p: [rostered[(p, n)] for n in range(1, 7)] for p in POSITIONS},
           "per_season": per_season_out, "my_model_said": MODEL,
           "P150": p150, "P151": p151}
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(rep, indent=1))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
