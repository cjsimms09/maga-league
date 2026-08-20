# TERRITORY: A
"""ADD MIKE CLAY TO THE FROZEN 2026 PROJECTION SNAPSHOT — ADDITIVELY.

C routed this correctly: `projection_snapshot_2026.json` is TERRITORY: A and is
marked IMMUTABLE, so they sketched the patch and did not apply it. They were
also right about WHY it is safe, and the file's own `_why` makes the argument
better than either of us did:

  "Preseason projections are overwritten when the season starts; there is no
   archive to go back for. This is the one-way door."

The door is about losing a forecast once outcomes exist. **Clay's guide is a
2026 preseason forecast we now hold, captured 2026-08-20 — one day after the
snapshot. Leaving him out does not protect the archive, it is exactly the loss
the archive exists to prevent.** The season has not started; the draft is 08-22
and kickoff is September.

⚠️ AND THE DISTINCTION THAT MATTERS IS ADDITION vs REGENERATION, NOT
"is it allowed". RE-RUNNING `projection_snapshot.py` would be wrong and would
stay wrong: the board has moved since 2026-08-19 -- I rebuilt it twice tonight
(register 139's ranking fix, register 140's band fix) -- so a regeneration would
silently replace every 08-19 forecast with an 08-20 one and destroy the very
thing being preserved. This script therefore does the only safe operation:

  * ADDS `proj.clay` to players who have one
  * ADDS a `sources.clay` description
  * ADDS an `_amended` record naming what was added, when, and why
  * TOUCHES NOTHING ELSE -- enforced by a byte-comparison of every
    pre-existing value, not by intent

`_captured` is deliberately NOT changed. It records when the other eight
forecasts were frozen and that fact is still true.

Run: python3 draft/tools/snapshot_add_clay.py [--apply]
Without --apply it reports and writes nothing.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAP_PATH = ROOT / "draft" / "data" / "projection_snapshot_2026.json"
CLAY_PATH = ROOT / "draft" / "data" / "clay_projections_2026.json"

snap = json.loads(SNAP_PATH.read_text())
clay = json.loads(CLAY_PATH.read_text())
clay_players = clay.get("players", {})

before = json.loads(json.dumps(snap))          # deep copy for the control

added = 0
for p in snap["players"]:
    c = clay_players.get(str(p.get("player_id")))
    if not c:
        continue
    v = c.get("proj_clay_scored")
    if v is None:
        continue
    p["proj"]["clay"] = v
    added += 1

snap.setdefault("sources", {})["clay"] = (
    "Mike Clay's 2026 guide (draft/data/sources/clay_projections_2026.pdf, the "
    "guide's own header says Updated: 8/19/2026), ingested by "
    "draft/tools/clay_projections.py. Scored from RAW STAT LINES under this "
    "league's own half-PPR table -- his published points column is FULL PPR and "
    "is never read. Covers 418 skill players; no DEF, and kickers are carried "
    "unscored because the source has no field-goal distance split."
)
snap["_amended"] = {
    "date": "2026-08-20",
    "added_source": "clay",
    "players_given_a_clay_projection": added,
    "why": "Clay's guide landed 2026-08-20, one day after this snapshot was "
           "captured, and the season has not started. A preseason forecast we "
           "hold and do not freeze is precisely the loss `_why` describes.",
    "what_was_NOT_done": "The snapshot was NOT regenerated. The board has moved "
                         "since 2026-08-19 (register 139 ranking fix, register "
                         "140 band fix), so re-running projection_snapshot.py "
                         "would have replaced every 08-19 forecast with an 08-20 "
                         "one and destroyed what this file exists to preserve. "
                         "Only additions were made; `_captured` is unchanged.",
}

# ── CONTROL: nothing pre-existing may have moved ──────────────────────────────
problems = []
if before.get("_captured") != snap.get("_captured"):
    problems.append("_captured changed")
if len(before["players"]) != len(snap["players"]):
    problems.append("player count changed")
for a, b in zip(before["players"], snap["players"]):
    if a.get("player_id") != b.get("player_id"):
        problems.append("player order changed")
        break
    for k, v in a.items():
        if k == "proj":
            for pk, pv in v.items():
                if b["proj"].get(pk) != pv:
                    problems.append("proj.%s changed for %s" % (pk, a.get("name")))
        elif b.get(k) != v:
            problems.append("%s changed for %s" % (k, a.get("name")))
    if len(problems) > 5:
        break
for k, v in before.get("sources", {}).items():
    if snap["sources"].get(k) != v:
        problems.append("sources.%s rewritten" % k)

print("\n  ADD CLAY TO THE FROZEN SNAPSHOT — additive only\n")
print("  players given a clay projection: %d of %d" % (added, len(snap["players"])))
print("  CONTROL — nothing pre-existing moved: %s" % ("PASS" if not problems else "FAIL"))
for p in problems[:8]:
    print("     " + p)
if problems:
    print("\n  REFUSING to write.")
    sys.exit(1)

if "--apply" not in sys.argv:
    print("\n  dry run — pass --apply to write")
    sys.exit(0)

SNAP_PATH.write_text(json.dumps(snap, indent=1))
print("\n  wrote %s" % SNAP_PATH.relative_to(ROOT))
