# TERRITORY: A
"""DIAGNOSE A REFUSED CANDIDATE BOARD, IN THE ONLY PLACE IT EXISTS.

The two failures still blocking the nightly auto-publish (a retired player
unflagged by board_activity.dormant, the replacement-sensitivity sign flip)
reproduce ONLY against the fresh candidate board built from live fetches.
That board exists for the lifetime of one CI runner. Downloading it for
offline diagnosis turned out to be blocked from the relay sandbox (the
GitHub artifact redirect lands on Azure blob storage, which the egress
proxy 403s at CONNECT) — so the diagnosis ships TO the board instead: the
nightly workflow's failure path runs this script and the analysis lands in
the run log, which IS retrievable.

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
    pool = [p for p in players if p.get("position") and p.get("proj_mean") is not None]
    cfg = {"teams": board["league"]["teams"], "starters": board["league"]["starters"]}
    base, base_alloc = vorp.replacement_levels(pool, cfg)
    bumped_pool = [dict(p, proj_mean=p["proj_mean"] * (1.02 if p.get("position") == "RB" else 1))
                   for p in pool]
    bumped, bumped_alloc = vorp.replacement_levels(bumped_pool, cfg)
    print("\n-- replacement sensitivity (the characterization test's own probe):")
    print("   base RB replacement:   %r   (allocation: %r)" % (base.get("RB"), base_alloc))
    print("   +2%%-RB replacement:    %r   (allocation: %r)" % (bumped.get("RB"), bumped_alloc))
    print("   move: %+0.2f   (the pinned expectation is a STEP DOWN < -5.0; "
          "+ means the flex allocation behaved differently on this board)"
          % (bumped["RB"] - base["RB"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
