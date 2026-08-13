# TERRITORY: A
"""Rewrite ONLY `pick_order` in the shipped board, with the corrected numbering.

WHY THIS EXISTS RATHER THAN A REBUILD. `build.py` needs `api.sleeper.app` for the
player pool and this environment's network policy denies it (403 on CONNECT).
`--offline` substitutes a 233-player FIXTURE pool and withholds the keeper slate,
which would replace a 1,759-player board with a test double — I ran it once and
had to restore from git. So the one block that the numbering fix changes is
recomputed here, by the same `keepers.build_true_pick_order` a real build would
call, and everything else is asserted byte-identical.

THIS IS A PATCH, NOT A BUILD, AND IT SAYS SO. The next real `python3 build.py`
supersedes it and must produce the same `pick_order`; if it does not, this script
was wrong and `pick_schedule.test.js` goes red. It is a script rather than a hand
edit precisely so that claim is checkable.

WHAT CHANGES
    picks       147 renumbered survivor rows  ->  150 board rows, keeper slots
                flagged. Sleeper leaves a forfeited pick in place, occupied.
    my_picks    [30, 45, 50, ...]  ->  [33, 48, 53, ...]
    live_picks  NEW — how many SELECTIONS happen, which is the OTHER quantity
                and the one 147 actually was.

WHAT MUST NOT CHANGE
    Everything else, including `forfeited` and `my_picks_before_keepers`. The
    pre-keeper list was right all along; it is the artifact's own uncompressed
    snake and this script REFUSES if the rebuild disagrees with it.

Run: python3 draft/tools/repair_pick_order.py [--write]
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import keepers as K  # noqa: E402

BOARD = os.path.join(ROOT, "public", "draft_data.json")


def rebuild(artifact: dict) -> dict:
    league = artifact.get("league") or {}
    po = artifact.get("pick_order") or {}
    cfg = {
        "teams": league["teams"],
        "rounds": league["rounds"],
        "draft_type": league.get("draft_type", "snake"),
        "my_draft_slot": league["my_draft_slot"],
        "keepers": league.get("keeper_rules") or {},
    }
    # THE KEEPERS COME FROM THE ARTIFACT'S OWN `forfeited` LIST, so this cannot
    # invent a slate. Each entry already carries the team and the round it cost;
    # feeding them back through the builder must reproduce the same forfeits, and
    # the caller asserts exactly that.
    by_team: dict[int, list[dict]] = {}
    for f in po.get("forfeited") or []:
        by_team.setdefault(int(f["team_slot"]), []).append(dict(f))
    return K.build_true_pick_order(cfg, by_team), cfg


def main(write: bool) -> int:
    with open(BOARD) as fh:
        art = json.load(fh)
    po = art.get("pick_order") or {}
    order, cfg = rebuild(art)

    # ── CONTROL 1: the same forfeits come back out ──────────────────────────
    was = sorted((int(f["team_slot"]), int(f["cost_round"]))
                 for f in (po.get("forfeited") or []))
    now = sorted((int(f["team_slot"]), int(f["cost_round"])) for f in order.forfeited)
    if was != now:
        print("REFUSING: rebuilding from the artifact's own forfeited list did not "
              "reproduce it.\n  was %s\n  now %s" % (was, now))
        return 2

    # ── CONTROL 2: the pre-keeper snake is unchanged ────────────────────────
    # It was right all along — my picks are its tail. If this moves, the two
    # implementations disagree about the room and neither should be trusted.
    before = list(po.get("my_picks_before_keepers") or [])
    if before and before != order.my_original_picks:
        print("REFUSING: my_picks_before_keepers changed.\n  was %s\n  now %s"
              % (before, order.my_original_picks))
        return 2

    # ── CONTROL 3: the answer is the arithmetic Cory did by hand ────────────
    teams, slot = cfg["teams"], cfg["my_draft_slot"]
    first_round = len(order.forfeited) + 1
    nth = slot if first_round % 2 == 1 else teams + 1 - slot
    expect = (first_round - 1) * teams + nth
    if not order.my_picks or order.my_picks[0] != expect:
        print("REFUSING: first pick %s != round %d at slot %d = %d"
              % (order.my_picks[:1], first_round, slot, expect))
        return 2

    new_po = dict(po)
    new_po.update({
        "numbering": "sleeper_uncompressed",
        "numbering_note": (
            "A keeper occupies his pick slot; the pick is not removed and nothing "
            "after it shifts up. Verified against seasons 2023/2024/2025 in "
            "league_history: 150 picks and round 4 at overall 31 every year, with "
            "0, 23 and 20 keepers respectively. `picks` is the BOARD (depth: how "
            "many players leave the pool). `live_picks` is how many SELECTIONS "
            "happen. They differ by the keeper count."),
        "picks": order.board,
        "live_picks": len(order.picks),
        "my_picks": order.my_picks,
        "repaired_by": "draft/tools/repair_pick_order.py — Sleeper was unreachable "
                       "for a full rebuild; the next build.py supersedes this and "
                       "must produce the same block.",
    })

    print("pick_order, before -> after")
    print("  picks rows      %-6s -> %s" % (len(po.get("picks") or []), len(new_po["picks"])))
    print("  live_picks      %-6s -> %s" % (po.get("live_picks", "—"), new_po["live_picks"]))
    print("  my_picks        %s" % (po.get("my_picks"),))
    print("               -> %s" % (new_po["my_picks"],))
    print("  round %d at slot %d is pick %d of the round (snake %s)"
          % (first_round, slot, nth, "forward" if first_round % 2 == 1 else "REVERSED"))
    keeper_rows = sum(1 for p in new_po["picks"] if p["keeper_slot"])
    print("  keeper-occupied slots on the board: %d" % keeper_rows)

    if not write:
        print("\ndry run — pass --write to apply")
        return 0

    # ── CONTROL 4: nothing else in the artifact moves ──────────────────────
    after = dict(art)
    after["pick_order"] = new_po
    moved = [k for k in set(list(art) + list(after))
             if k != "pick_order" and json.dumps(art.get(k), sort_keys=True)
             != json.dumps(after.get(k), sort_keys=True)]
    if moved:
        print("REFUSING: this would also change %s" % moved)
        return 2
    # THE SAME SERIALISATION build.py USES (`separators=(",", ":")`, no trailing
    # newline). Reformatting the file would produce a 166 KB diff for a 150-row
    # change and bury the thing being reviewed — and a patch nobody can read is a
    # patch nobody checks.
    with open(BOARD, "w") as fh:
        fh.write(json.dumps(after, separators=(",", ":")))
    print("\nwrote %s — pick_order only" % BOARD)
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--write" in sys.argv))
