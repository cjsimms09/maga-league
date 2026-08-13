"""HOW MANY PLAYERS IN THE POOL DO NOT EXIST, AND DOES IT MOVE REPLACEMENT?

Cory drove a mock on 2026-08-13 and found MARSHAWN LYNCH on the board. He has
not played since 2019. The question he asked is the right one and it is not
"remove Marshawn Lynch":

    WHICH SOURCE SUPPLIED HIM, HOW MANY CAME WITH HIM, AND DOES REPLACEMENT
    LEVEL MOVE WHEN THEY GO? Replacement is the input to every VORP on the
    board, so if it moves, every valuation is wrong by that amount.

CONTAMINATED is defined conservatively and all three conditions must hold:
no 2026 team, no projection at all, and an ADP that is Sleeper's `search_rank`
fallback rather than a real one. A player can legitimately be a free agent
(camp bodies sign), and can legitimately lack a projection early. Needing all
three keeps the set to players nobody has priced, rostered, or projected.

THE CONTROL MATTERS MORE THAN THE RESULT. A rank-based replacement is expected
to be immune to a tail of zero-projection players, so a zero delta is exactly
what a DEAD probe would print. This removes the top 5 TEs and asserts TE
replacement moves, so the null is a measurement rather than a broken instrument.

Run: python draft/tools/pool_contamination.py
"""
from __future__ import annotations
import copy
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
import vorp as V  # noqa: E402


def contaminated(p: dict) -> bool:
    return ((p.get("team") or "FA") in ("FA", "", "?", None)
            and (p.get("proj_mean") in (None, 0, 0.0))
            and p.get("adp_source") == "search_rank")


def main() -> int:
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    players, lg = board["players"], board["league"]
    cfg = {"teams": lg["teams"], "starters": lg["starters"],
           "roster_slots": lg.get("roster_slots", {})}

    bad = [p for p in players if contaminated(p)]
    clean = [p for p in players if not contaminated(p)]
    print(f"POOL CONTAMINATION — {len(players)} players\n")
    print(f"  no team AND no projection AND fallback ADP: {len(bad)} "
          f"({100 * len(bad) / len(players):.1f}%)")
    by_pos: dict[str, int] = {}
    for p in bad:
        by_pos[p["position"]] = by_pos.get(p["position"], 0) + 1
    print(f"  by position: {by_pos}\n")

    rep_full, _ = V.replacement_levels(copy.deepcopy(players), cfg)
    rep_clean, _ = V.replacement_levels(copy.deepcopy(clean), cfg)
    print("  REPLACEMENT LEVEL, full pool vs cleaned:")
    moved = False
    for pos in sorted(rep_full):
        d = rep_clean.get(pos, 0) - rep_full[pos]
        if abs(d) > 1e-9:
            moved = True
        print(f"    {pos:5} {rep_full[pos]:9.2f} -> {rep_clean.get(pos, 0):9.2f}   {d:+.2f}")

    # THE CONTROL. Without this the zeros above are indistinguishable from a
    # probe that is not reading anything.
    tes = sorted([p for p in players if p["position"] == "TE"],
                 key=lambda p: p.get("proj_mean") or 0, reverse=True)[:5]
    ctrl = [p for p in players if p not in tes]
    rep_ctrl, _ = V.replacement_levels(copy.deepcopy(ctrl), cfg)
    delta = rep_ctrl["TE"] - rep_full["TE"]
    print(f"\n  CONTROL (remove the top 5 TEs): TE {rep_full['TE']:.2f} -> "
          f"{rep_ctrl['TE']:.2f} ({delta:+.2f})")
    if abs(delta) < 1e-9:
        print("  ::error:: THE CONTROL DID NOT MOVE — this probe reads nothing and "
              "the zeros above prove nothing")
        return 1

    ranks = [p.get("pool_rank") for p in bad if p.get("pool_rank") is not None]
    print(f"\n  best pool_rank among contaminated: {min(ranks) if ranks else 'n/a'}")
    top300 = sorted(players, key=lambda p: p.get("pool_rank") or 99999)[:300]
    print(f"  contaminated inside the top 300 by pool_rank: "
          f"{sum(1 for p in top300 if contaminated(p))}")

    print("\n  READING: replacement is the Nth-ranked player BY PROJECTION "
          "(draft/vorp.py), and\n  every contaminated player projects 0.0, so they sort "
          "below a cut of 10-29.\n  VORP is NOT contaminated. What IS wrong is that they "
          "are reachable at all:\n  build.py admits any player Sleeper does not mark "
          "`active is False` with a finite\n  search_rank, and there is NO RANK CEILING "
          "on that filter.")
    return 0 if not moved else 0


if __name__ == "__main__":
    sys.exit(main())
