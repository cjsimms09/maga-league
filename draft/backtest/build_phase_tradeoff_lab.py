#!/usr/bin/env python3
# TERRITORY: A
"""IS THE BUILD-PHASE COST A DELIBERATE TRADE OR PARTLY WASTE? — grading P131

Prereg: **P131**, filed 2026-08-19 before this existed. P130 found that rounds
3-6 cost **every** roster-aware arm about the same — auto −175.7, `need: 1.0`
−161.6, slot-aware −162.8 per seat-season, a 14-point spread across arms that
differ by 39 in the late rounds. **A cost invariant to the arm is usually
structural rather than a defect**, and P131 predicts it is: a roster-aware arm
in Build must decline the best available player to fill a slot, and what it
declines is expensive precisely because the board is still good.

**The FALSE condition, stated in the prereg:** if a meaningful part of the Build
loss comes from an arm taking a player who was **not better on roster fit
either** — same position as shipped, just worse — that is waste rather than a
trade, and it is attackable.

── THE TEST ────────────────────────────────────────────────────────────────
Pick slots align exactly across arms (verified: identical `pick_no` sequences),
so each Build pick can be compared like for like against shipped:

  SAME PLAYER      — the arm agreed; contributes nothing.
  POSITION TRADE   — different position from shipped. This is roster-awareness
                     doing the thing it exists to do, and its cost is the price
                     of the trade.
  SAME-POSITION    — same position, different player. Roster fit cannot explain
                     this one, so any loss here is WASTE.

REPORT ONLY. Nothing selected. Engine-on-bundles.

Run: python3 draft/backtest/build_phase_tradeoff_lab.py [--json <path>]
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

SEATS = tuple(range(1, 11))
SEASONS = (2023, 2024, 2025)
BUILD = range(3, 7)          # rounds 3-6, the phase P130 isolated
ARMS = {"auto": "engine_seat_choices_auto.json",
        "need1": "engine_seat_choices_need1.json",
        "slot_s1": "engine_seat_choices_slot_s1.json"}


def records(path: Path):
    """(season, seat) -> {pick_no: record}."""
    doc = json.loads(path.read_text())
    out = {}
    for s in doc["seasons"]:
        for seat in SEATS:
            recs = doc["seasons"][s]["seats"][str(seat)]["records"]
            out[(int(s), seat)] = {int(r["pick_no"]): r for r in recs}
    return out


def main() -> int:
    totals = {}
    for season in SEASONS:
        weekly = R.weekly_points_of(season)
        totals[season] = {pid: sum(r.values()) for pid, r in weekly.items()}

    shipped = records(HERE / "engine_seat_choices.json")
    ctl, result = {}, {}

    slots_ok = True
    for name, fn in ARMS.items():
        arm = records(HERE / fn)
        buckets = {"same_player": [0, 0.0], "position_trade": [0, 0.0],
                   "same_position": [0, 0.0]}
        for key, srecs in shipped.items():
            season = key[0]
            arecs = arm.get(key) or {}
            if set(arecs) != set(srecs):
                slots_ok = False
            for pick, sr in srecs.items():
                if int(sr.get("round") or 0) not in BUILD:
                    continue
                ar = arecs.get(pick)
                if not ar:
                    continue
                sp, ap = str(sr.get("chosen")), str(ar.get("chosen"))
                d = float(totals[season].get(ap, 0.0)) - float(totals[season].get(sp, 0.0))
                if sp == ap:
                    k = "same_player"
                elif (sr.get("chosen_pos") or "") != (ar.get("chosen_pos") or ""):
                    k = "position_trade"
                else:
                    k = "same_position"
                buckets[k][0] += 1
                buckets[k][1] += d
        n_seat_seasons = len(shipped)
        result[name] = {k: {"picks": v[0],
                           "pts_per_seat_season": round(v[1] / n_seat_seasons, 1)}
                        for k, v in buckets.items()}
        result[name]["build_total_pts_per_seat_season"] = round(
            sum(v[1] for v in buckets.values()) / n_seat_seasons, 1)

    ctl["pick_slots_identical_across_arms"] = {
        "ok": slots_ok,
        "why": "a same-slot comparison is only valid if both arms picked at the "
               "same pick numbers"}

    # RECONCILIATION — the three buckets must add back to P130's Build figure
    # (auto -175.7, need1 -161.6, slot_s1 -162.8). If they do not, this lab is
    # classifying something other than what P130 measured.
    EXPECT = {"auto": -175.7, "need1": -161.6, "slot_s1": -162.8}
    recon = {n: (result[n]["build_total_pts_per_seat_season"], EXPECT[n])
             for n in result}
    ctl["reconciles_with_P130_build_totals"] = {
        "got": recon,
        "ok": all(abs(g - e) < 2.0 for g, e in recon.values()),
        "why": "the classified parts must add back to the Build total P130 "
               "reported from a different aggregation"}

    # SAME-PLAYER PICKS MUST CONTRIBUTE EXACTLY ZERO. If they do not, the
    # comparison is misaligned and every other number here is noise.
    ctl["same_player_picks_contribute_zero"] = {
        "got": {n: result[n]["same_player"]["pts_per_seat_season"] for n in result},
        "ok": all(abs(result[n]["same_player"]["pts_per_seat_season"]) < 0.05
                  for n in result)}

    all_ok = all(c["ok"] for c in ctl.values())

    print("BUILD PHASE (rounds 3-6) — trade or waste? (P131)\n")
    for k, c in ctl.items():
        print("  %s %s" % ("✅" if c["ok"] else "⛔", k))
    if not all_ok:
        print("\n  ⛔ A CONTROL FAILED. Nothing below is a measurement.\n")
    print("\n  %-9s %26s %26s %24s" % ("arm", "position TRADE", "SAME-position (waste?)",
                                       "Build total"))
    for n, r in result.items():
        print("  %-9s  %5d picks %+9.1f pts   %5d picks %+9.1f pts   %+9.1f"
              % (n, r["position_trade"]["picks"], r["position_trade"]["pts_per_seat_season"],
                 r["same_position"]["picks"], r["same_position"]["pts_per_seat_season"],
                 r["build_total_pts_per_seat_season"]))
    print("\n  (same-player picks: %s — must be zero)"
          % {n: result[n]["same_player"]["picks"] for n in result})

    report = {"_territory": "TERRITORY: A — draft/backtest/build_phase_tradeoff_lab.py",
              "_prereg": "P131", "_note": "REPORT ONLY. Engine-on-bundles.",
              "controls": ctl, "controls_all_passed": all_ok, "arms": result}
    i = sys.argv.index("--json") if "--json" in sys.argv else -1
    if i >= 0:
        Path(sys.argv[i + 1]).write_text(json.dumps(report, indent=1))
        print("\n  wrote " + sys.argv[i + 1])
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
