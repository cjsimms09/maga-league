# TERRITORY: A
"""DIAGNOSE A REFUSED CANDIDATE BOARD, IN THE ONLY PLACE IT EXISTS.

The failures that historically blocked the nightly auto-publish (a retired
player unflagged by board_activity.dormant, the replacement-sensitivity
step) reproduce ONLY against the fresh candidate board built from live
fetches. That board exists for the lifetime of one CI runner. Downloading
it for offline diagnosis turned out to be blocked from the relay sandbox
(the GitHub artifact redirect lands on Azure blob storage, which the
egress proxy 403s at CONNECT) — so the diagnosis ships TO the board
instead: the nightly workflow's failure path runs this script and the
analysis lands in the run log, which IS retrievable.

[2026-08-16] BOTH HISTORIC BLOCKERS NOW MEASURE CLEAN and this script's
old replacement-sensitivity section was itself the last place still
preaching the retired +2% coordinate pin: run 31926152660 printed
"move: +3.78 (the pinned expectation is a STEP DOWN < -5.0)" on a board
where the characterization test PASSED — the +2% probe sat 0.0036
projection points on the smooth side of the flex boundary (break-even
+2.0021%), so +3.78 was correct smooth-scaling arithmetic, not a failure.
That run's real refusals were artifact-parity / field-purpose tests (see
draft/audit/rebuild_refusal_diagnosis_2026-08-16.md). Section 2 below now
runs the same scan as the test and NAMES THE ARM the arithmetic took
(SMOOTH vs STEP) instead of asserting one arm's sign as an expectation.

MEASURES, NEVER REIMPLEMENTS: every verdict below is produced by calling
board_activity's own predicates and vorp's own replacement_levels on the
candidate board, so what this prints is what the failing tests actually
saw — not a second implementation that can drift from the first.

Run: python3 draft/tools/diagnose_refused_board.py   (from the repo root,
against whatever public/draft_data.json is on disk — in CI, the candidate)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft"))

import board_activity as BA   # noqa: E402
import vorp                   # noqa: E402

RETIRED = ("Tom Brady", "Drew Brees", "Rob Gronkowski", "Julian Edelman",
           "Antonio Brown", "Larry Fitzgerald", "Todd Gurley", "Marshawn Lynch")


def main() -> int:
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    players = board.get("players") or []
    print("== DIAGNOSIS: board built_at %s, %d players ==" % (
        board.get("built_at"), len(players)))

    # ── 1. THE RETIRED SET: which exemption spares each one present ─────────
    d = BA.dormant(board)
    flagged = {p.get("name") for p in d.get("rows", [])}
    keep_ids = BA.keeper_ids().get("ids", frozenset())
    print("\n-- dormant(): status=%s n=%s health=%s" % (
        d.get("status"), d.get("n"), (d.get("health") or {}).get("note")))
    for who in RETIRED:
        row = next((p for p in players if p.get("name") == who), None)
        if row is None:
            print("  %-18s ABSENT from the board (pruned upstream — fine)" % who)
            continue
        if who in flagged:
            print("  %-18s present and FLAGGED dormant (fine)" % who)
            continue
        # Present and unflagged — name the exemption that spared him, in
        # dormant()'s own order, using its own predicates.
        spared_by = []
        if (BA._num(row.get("years_exp")) or 0) == 0:
            spared_by.append("rookie (years_exp=0)")
        if BA._priced(row):
            spared_by.append("market-priced (adp_source=%r, adp=%r)"
                             % (row.get("adp_source"), row.get("adp")))
        if (BA._num(row.get("proj_mean")) or 0) > 0:
            spared_by.append("projected (proj_mean=%r, sleeper=%r, fp=%r)"
                             % (row.get("proj_mean"), row.get("proj_sleeper"),
                                row.get("proj_fantasypros")))
        if str(row.get("player_id")) in keep_ids:
            spared_by.append("KEPT")
        print("  %-18s PRESENT AND UNFLAGGED — spared by: %s" % (
            who, "; ".join(spared_by) or "NOTHING (detector bug, not data)"))
        print("      full row keys of interest: years_exp=%r adp_source=%r "
              "raw_adp=%r proj_mean=%r vorp=%r overall_rank=%r" % (
                  row.get("years_exp"), row.get("adp_source"), row.get("raw_adp"),
                  row.get("proj_mean"), row.get("vorp"), row.get("overall_rank")))

    # ── 2. REPLACEMENT SENSITIVITY on this exact board ──────────────────────
    # Mirrors test_replacement_sensitivity.py's scan and NAMES THE ARM.
    # Replacement is by construction the count-th ranked player scaled, so
    # both arms are derivable from the allocation:
    #   SMOOTH (allocation holds): move = base x pct, exactly.
    #   STEP  (a flex slot flips): step = RB[new] x (1+pct) - RB[old] x (1+pct-0.005).
    # The old message here hardcoded the STEP arm's sign as "the pinned
    # expectation" and misdiagnosed a correct SMOOTH board (run 31926152660).
    def scaled(pct):
        return [dict(p, proj_mean=p["proj_mean"] * (1 + pct))
                if p.get("position") == "RB" else p for p in pool]

    pool = [p for p in players if p.get("position") and p.get("proj_mean") is not None]
    cfg = {"teams": board["league"]["teams"], "starters": board["league"]["starters"]}
    base, base_diag = vorp.replacement_levels(pool, cfg)
    base_counts = base_diag["starter_counts"]
    base_rb = base_counts["RB"]
    rb_ranked = sorted((p["proj_mean"] for p in pool if p["position"] == "RB"),
                       reverse=True)

    print("\n-- replacement sensitivity (same scan as the characterization test):")
    print("   base RB replacement:   %.4f   (allocation: %r, flex slots: %r)" % (
        base["RB"], base_counts, base_diag["flex_slots_allocated"]))

    # The legacy +2% probe, kept so this log stays comparable with earlier
    # runs — but its arm is now NAMED instead of judged against one sign.
    bumped, bumped_diag = vorp.replacement_levels(scaled(0.02), cfg)
    move = bumped["RB"] - base["RB"]
    if bumped_diag["starter_counts"]["RB"] == base_rb:
        print("   +2%% probe: %.4f, move %+0.2f — ARM: SMOOTH. Allocation held "
              "(%d RB starters), so the move IS base x 0.02 = %+0.2f by "
              "construction: correct arithmetic, NOT a failure."
              % (bumped["RB"], move, base_rb, base["RB"] * 0.02))
        if base_rb < len(rb_ranked):
            next_rb = rb_ranked[base_rb] * 1.02
            print("   +2%% boundary check: next RB up scaled = %.4f — the flex "
                  "boundary was not crossed at this coordinate." % next_rb)
    else:
        print("   +2%% probe: %.4f, move %+0.2f — ARM: STEP. Allocation moved "
              "%d -> %d RB starters at or below +2%%."
              % (bumped["RB"], move, base_rb, bumped_diag["starter_counts"]["RB"]))

    # Locate the flip the way the test does, and show both arms' derivations.
    flip = None
    prev_rep = base["RB"]
    for i in range(1, 21):                       # +0.5% .. +10.0%
        pct = i * 0.005
        rep, diag = vorp.replacement_levels(scaled(pct), cfg)
        if diag["starter_counts"]["RB"] != base_rb:
            flip = (pct, rep["RB"], diag["starter_counts"]["RB"], prev_rep)
            break
        prev_rep = rep["RB"]

    if flip is None:
        print("   scan +0.5%%..+10%%: NO FLIP — replacement is smooth in the "
              "inputs on this board. The characterization test "
              "(test_a_within_error_projection_shift_moves_replacement_by_a_step) "
              "FAILS here by design: the step regime it records has vanished.")
    else:
        pct, flip_rep, flip_rb, rep_before = flip
        gap = rb_ranked[base_rb - 1] - rb_ranked[flip_rb - 1]
        smooth_inc = rb_ranked[base_rb - 1] * 0.005
        derived_step = -gap * (1 + pct) + smooth_inc
        print("   scan +0.5%%..+10%%: FLIP at +%.1f%% — allocation %d -> %d RB "
              "starters; measured step %+0.2f (from %.2f to %.2f)"
              % (pct * 100, base_rb, flip_rb, flip_rep - rep_before,
                 rep_before, flip_rep))
        print("   derived from the allocation: -gap x (1+pct) + smooth_inc = "
              "-%.2f x %.3f + %.2f = %+0.2f  (gap RB%d->RB%d; smooth "
              "increment %.2f/0.5%%)"
              % (gap, 1 + pct, smooth_inc, derived_step, base_rb, flip_rb,
                 smooth_inc))
        down = flip_rep - rep_before < 0
        discontinuous = abs(flip_rep - rep_before) > smooth_inc
        print("   verdict: flip exists, direction %s, %s — the "
              "characterization test's properties %s on this board."
              % ("DOWN (RB gained slots)" if down else "UP (INVERTED)",
                 "discontinuous" if discontinuous else "within smooth drift",
                 "HOLD" if (down and discontinuous and flip_rb > base_rb)
                 else "DO NOT HOLD"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
