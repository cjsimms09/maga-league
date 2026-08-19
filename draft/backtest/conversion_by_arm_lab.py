#!/usr/bin/env python3
# TERRITORY: A
"""DOES ANY ARM ACTUALLY CLOSE THE CONVERSION GAP? — grading P127 early

Prereg: **P127**, filed 2026-08-19 in `PREDICTION-LEDGER.md` with its metric
fixed in advance: *"graded on conversion (lineup points / roster points) per
season, engine vs engine, not on the season total — because the season total
pools the two failures P126 separated and would let a projection change
masquerade as a shape fix."* **That metric is not renegotiated here.**

── WHY THIS IS BEING GRADED ON 08-19 AND NOT ON ITS 09-05 DATE ──────────────
Register 87 measured that in 2023 and 2025 the shipped engine acquires MORE
points than the owners (+2.1%, +5.1%) and loses entirely on conversion — 0.740
and 0.771 against the owners' 0.828 and 0.834. **Cory must rule A13 by Friday
08-21 6pm**, and A13 is exactly "points or roster shape". Sizing the prize told
him the shape side is worth 131–180 pts/seat-season against the +68.6 that
`need: 1.0` buys — but **the size of a prize is not an offer, and nothing had
shown any arm CAPTURES it.** That is the gap this closes, before he rules
rather than three weeks after.

**It needs no network and no new capture.** All seven alternative arms were
recorded into `engine_seat_choices_*.json` by the backtest workflow. Grading
them is a pure re-read of committed stores.

── WHAT THIS CANNOT DO ─────────────────────────────────────────────────────
**It cannot select an arm.** `no_fit_guard`: several arms are graded, the
metric was fixed in advance, and the output is a measurement routed to the
person whose decision it is. If an arm closes the gap that is evidence FOR a
decision Cory makes, not a weight this file ships.

**And it is engine-on-BUNDLES**, which hands the engine strictly less than the
live board — risk age-only, injury/depth/opportunity declared absent,
walk-forward projections rather than the shipped multi-source mean.

Run: python3 draft/backtest/conversion_by_arm_lab.py [--json <path>]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R                      # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402

SEATS = tuple(range(1, 11))
PRIMARY = "optimal"          # the preregistered estimand, per the seat replay

# The arms as the workflow recorded them. `slot_s0` is the shipped
# configuration re-run under the slot-aware harness, which makes it a free
# IDENTITY CONTROL: it must reproduce `shipped` exactly, and if it does not,
# this lab is not grading what it thinks it is.
ARMS = {
    "shipped":    "engine_seat_choices.json",
    "need1":      "engine_seat_choices_need1.json",
    "slot_s1":    "engine_seat_choices_slot_s1.json",
    "auto":       "engine_seat_choices_auto.json",
    "bye1":       "engine_seat_choices_bye1.json",
    "slot_s0":    "engine_seat_choices_slot_s0.json",
}


def _skill(pids, positions):
    return sorted(p for p in pids if positions.get(p) in ("QB", "RB", "WR", "TE"))


def grade_arm(path: Path, positions, ages):
    """Per season: roster points held, lineup points started, and the ratio.

    Mirrors `replay_seats_grade.py`'s machinery deliberately — same
    `build_projections`, same `season_series`, same skill filter — so these
    conversions are comparable to the ones register 87 reports rather than a
    second, subtly different construction of the same idea (rule 11).
    """
    choices = json.loads(path.read_text())
    out = {}
    for s in sorted(choices["seasons"]):
        season = int(s)
        weekly = R.weekly_points_of(season)
        totals = {pid: sum(rows.values()) for pid, rows in weekly.items()}
        proj = R.build_projections(season, positions, ages)
        picks, _ = R.season_draft(R.season_record(season))

        eng_roster = eng_line = own_roster = own_line = 0.0
        for seat in SEATS:
            ch = choices["seasons"][s]["seats"][str(seat)]
            skill = _skill(ch["roster"], positions)
            eng_roster += sum(totals.get(p, 0.0) for p in skill)
            eng_line += sum(R.season_series(skill, positions, weekly, proj, PRIMARY))

            own = _skill([str(p["player_id"]) for p in picks
                          if p["roster_id"] == seat], positions)
            own_roster += sum(totals.get(p, 0.0) for p in own)
            own_line += sum(R.season_series(own, positions, weekly, proj, PRIMARY))

        out[season] = {
            "engine_roster_points": round(eng_roster, 1),
            "engine_lineup_points": round(eng_line, 1),
            "engine_conversion": round(eng_line / eng_roster, 4) if eng_roster else None,
            "owner_conversion": round(own_line / own_roster, 4) if own_roster else None,
        }
        out[season]["conversion_gap"] = (
            round(out[season]["engine_conversion"] - out[season]["owner_conversion"], 4)
            if out[season]["engine_conversion"] is not None else None)
    return out


def main() -> int:
    positions = positions_record()
    from own_model_v2 import board_ages
    ages = board_ages()

    graded = {}
    for name, fn in ARMS.items():
        p = HERE / fn
        if not p.exists():
            print("  ! missing arm file, NOT silently skipped: " + fn)
            continue
        graded[name] = grade_arm(p, positions, ages)

    seasons = sorted(graded["shipped"])
    ctl = {}

    # CONTROL 1 — the identity arm. slot_s0 IS the shipped configuration.
    if "slot_s0" in graded:
        same = all(abs((graded["slot_s0"][s]["engine_conversion"] or 0)
                       - (graded["shipped"][s]["engine_conversion"] or 0)) < 1e-9
                   for s in seasons)
        ctl["slot_s0_reproduces_shipped"] = {
            "ok": same,
            "why": "slot_s0 is the shipped configuration re-run under the "
                   "slot-aware harness; if its conversion differs, this lab is "
                   "not grading what it thinks it is"}

    # CONTROL 2 — the owner baseline cannot depend on which engine arm ran.
    owner_stable = True
    for s in seasons:
        vals = {round(graded[a][s]["owner_conversion"], 6) for a in graded}
        if len(vals) != 1:
            owner_stable = False
    ctl["owner_conversion_identical_across_arms"] = {
        "ok": owner_stable,
        "why": "the owners' rosters are the same in every arm; a drifting owner "
               "baseline would mean the denominator is being recomputed wrong"}

    # CONTROL 3 — a lineup cannot outscore the roster that fields it.
    ctl["conversion_in_unit_interval"] = {
        "ok": all(0.0 < (graded[a][s]["engine_conversion"] or 0) <= 1.0
                  for a in graded for s in seasons)}

    all_ok = all(c["ok"] for c in ctl.values())

    report = {
        "_territory": "TERRITORY: A — draft/backtest/conversion_by_arm_lab.py",
        "_prereg": "P127 (PREDICTION-LEDGER.md), metric fixed before this ran",
        "_estimand": PRIMARY,
        "_note": "REPORT ONLY. Several arms graded on a metric fixed in advance; "
                 "nothing selected. Engine-on-bundles, which is handed strictly "
                 "less than the live board.",
        "controls": ctl, "controls_all_passed": all_ok,
        "arms": graded,
    }

    print("CONVERSION BY ARM — does anything close the gap? (P127, %s arm)\n" % PRIMARY)
    for k, c in ctl.items():
        print("  %s %s" % ("✅" if c["ok"] else "⛔", k))
    if not all_ok:
        print("\n  ⛔ A CONTROL FAILED. Nothing below is a measurement.\n")

    print("\n  %-10s %s" % ("arm", "  ".join("%8d" % s for s in seasons)))
    print("  %-10s %s" % ("owners",
          "  ".join("%8.3f" % graded["shipped"][s]["owner_conversion"] for s in seasons)))
    for a in graded:
        print("  %-10s %s   gap %s" % (
            a,
            "  ".join("%8.3f" % graded[a][s]["engine_conversion"] for s in seasons),
            "  ".join("%+.3f" % graded[a][s]["conversion_gap"] for s in seasons)))

    i = sys.argv.index("--json") if "--json" in sys.argv else -1
    if i >= 0:
        Path(sys.argv[i + 1]).write_text(json.dumps(report, indent=1))
        print("\n  wrote " + sys.argv[i + 1])
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
