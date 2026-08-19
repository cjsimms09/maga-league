#!/usr/bin/env python3
# TERRITORY: A
"""WHERE DOES THE AUTO ADJUSTER LOSE ITS ROSTER POINTS? — grading P128

Prereg: **P128**, filed 2026-08-19 and **amended before this ran** — the
amendment is an admission that its stated reasoning contradicted its stated
prediction. `autoWeights` sets `need` to **0.35 (Anchor, rounds 1-2), 0.9
(Build, 3-6), 1.45 (Fill, 7-10)**, and Anchor's own comment reads *"every slot
is empty, so 'need' is noise"* — so auto is LEAST roster-aware early, and the
mechanism argues for a LATE loss. **The row is graded on what it SAYS (early);
my corrected pre-run expectation (late) is timestamped in the ledger.**

── WHY THIS MATTERS MORE THAN A DIAGNOSTIC NORMALLY WOULD ──────────────────
**`auto` is the DEFAULT.** If Cory rules nothing on A13 by Friday 6pm he drafts
behind the war room's Auto adjuster. P127 measured it converting BEST of six
arms (+0.054 / +0.035 / −0.022) while gaining the FEWEST points (+16.9) — it
sheds ~157 roster points per seat-season, the largest acquisition loss of any
arm, and nobody has asked where.

REPORT ONLY. Two arms compared on a metric fixed in advance; nothing selected.
Engine-on-bundles, handed strictly less than the live board.

Run: python3 draft/backtest/auto_phase_cost_lab.py [--json <path>]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R                          # noqa: E402
from model_accuracy_backtest import positions_record   # noqa: E402

SEATS = tuple(range(1, 11))
# The phase boundaries are READ FROM THE ENGINE'S OWN CONSTANTS, not retyped
# here — a second copy would drift from the thing under test.
PHASES = [("Anchor", 1, 2, 0.35), ("Build", 3, 6, 0.9),
          ("Fill", 7, 10, 1.45), ("Tight", 11, 99, None)]


def phase_of(rnd: int) -> str:
    for name, lo, hi, _w in PHASES:
        if lo <= rnd <= hi:
            return name
    return "Tight"


def arm_by_round(path: Path, positions, totals_by_season):
    """Realized points of each CHOSEN player, bucketed by draft round.

    Uses the choice file's own `records`, which carry `round` and `chosen` per
    pick — so the attribution is the harness's, not a reconstruction of it.
    """
    choices = json.loads(path.read_text())
    out = {}
    for s in sorted(choices["seasons"]):
        season = int(s)
        totals = totals_by_season[season]
        by_round, by_phase, n_by_round = {}, {}, {}
        for seat in SEATS:
            for rec in choices["seasons"][s]["seats"][str(seat)]["records"]:
                rnd = int(rec.get("round") or 0)
                pid = str(rec.get("chosen") or "")
                if not rnd or not pid:
                    continue
                pts = float(totals.get(pid, 0.0))
                by_round[rnd] = by_round.get(rnd, 0.0) + pts
                n_by_round[rnd] = n_by_round.get(rnd, 0) + 1
                ph = phase_of(rnd)
                by_phase[ph] = by_phase.get(ph, 0.0) + pts
        out[season] = {"by_round": by_round, "by_phase": by_phase,
                       "picks_by_round": n_by_round}
    return out


def main() -> int:
    positions = positions_record()
    seasons = (2023, 2024, 2025)
    totals_by_season = {}
    for season in seasons:
        weekly = R.weekly_points_of(season)
        totals_by_season[season] = {pid: sum(r.values())
                                    for pid, r in weekly.items()}

    shipped = arm_by_round(HERE / "engine_seat_choices.json", positions,
                           totals_by_season)
    auto = arm_by_round(HERE / "engine_seat_choices_auto.json", positions,
                        totals_by_season)

    ctl = {}
    # CONTROL 1 — both arms must draft the SAME NUMBER of picks per round, or a
    # points difference is a count difference wearing a phase label.
    same_counts = all(
        shipped[s]["picks_by_round"] == auto[s]["picks_by_round"] for s in seasons)
    ctl["identical_pick_counts_per_round"] = {
        "ok": same_counts,
        "why": "a per-round points gap is only interpretable if both arms made "
               "the same number of picks in that round"}

    # CONTROL 2 — the per-round deltas must sum to the pooled roster delta P127
    # already reported (~-157/seat-season). If the parts do not add to the whole
    # this lab is bucketing something other than what P127 measured.
    per_season_total = {s: sum(auto[s]["by_round"].values())
                        - sum(shipped[s]["by_round"].values()) for s in seasons}
    mean_delta = sum(per_season_total.values()) / len(seasons) / 10.0
    ctl["reconciles_with_P127_pooled_delta"] = {
        "got_mean_per_seat_season": round(mean_delta, 1),
        "ok": -220.0 < mean_delta < -90.0,
        "why": "P127 measured auto shedding ~157 roster pts/seat-season; the "
               "per-round parts must add back to roughly that whole"}

    all_ok = all(c["ok"] for c in ctl.values())

    rounds = sorted({r for s in seasons for r in shipped[s]["by_round"]})
    table = []
    for rnd in rounds:
        d = sum(auto[s]["by_round"].get(rnd, 0.0)
                - shipped[s]["by_round"].get(rnd, 0.0) for s in seasons) / 30.0
        table.append({"round": rnd, "phase": phase_of(rnd),
                      "auto_minus_shipped_per_seat_season": round(d, 1)})

    phase_tot = {}
    for name, _lo, _hi, _w in PHASES:
        d = sum(auto[s]["by_phase"].get(name, 0.0)
                - shipped[s]["by_phase"].get(name, 0.0) for s in seasons) / 30.0
        phase_tot[name] = round(d, 1)

    early = phase_tot.get("Anchor", 0.0) + phase_tot.get("Build", 0.0)
    late = phase_tot.get("Fill", 0.0) + phase_tot.get("Tight", 0.0)

    report = {
        "_territory": "TERRITORY: A — draft/backtest/auto_phase_cost_lab.py",
        "_prereg": "P128 (PREDICTION-LEDGER.md), amended pre-run",
        "_note": "REPORT ONLY. Two arms, metric fixed in advance, nothing "
                 "selected. Engine-on-bundles.",
        "need_by_phase": {n: w for n, _l, _h, w in PHASES},
        "controls": ctl, "controls_all_passed": all_ok,
        "by_round": table, "by_phase": phase_tot,
        "early_rounds_1_6": round(early, 1), "late_rounds_7_plus": round(late, 1),
    }

    print("AUTO vs SHIPPED — where the roster points go (P128)\n")
    for k, c in ctl.items():
        print("  %s %s %s" % ("✅" if c["ok"] else "⛔", k,
                              c.get("got_mean_per_seat_season", "")))
    if not all_ok:
        print("\n  ⛔ A CONTROL FAILED. Nothing below is a measurement.\n")
    print("\n  round  phase    auto − shipped roster pts / seat-season")
    for row in table:
        print("   %4d  %-7s %+10.1f" % (row["round"], row["phase"],
                                        row["auto_minus_shipped_per_seat_season"]))
    print("\n  by phase (need weight):")
    for name, _l, _h, w in PHASES:
        print("   %-7s need=%-5s %+10.1f" % (name, w, phase_tot.get(name, 0.0)))
    print("\n  EARLY (rounds 1-6): %+.1f    LATE (rounds 7+): %+.1f"
          % (early, late))

    i = sys.argv.index("--json") if "--json" in sys.argv else -1
    if i >= 0:
        Path(sys.argv[i + 1]).write_text(json.dumps(report, indent=1))
        print("\n  wrote " + sys.argv[i + 1])
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
