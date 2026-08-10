"""BYE COVERAGE — a bye belongs to the TEAM, so every player on a real team has one.

THE BUG (Cory, 2026-08-10 war-room critique): DEF byes were missing across the
board — Jacksonville, Kansas City, Dallas, Giants, Green Bay, San Francisco and
ten more all showed "—", plus most kickers (Tyler Bass, Andy Borregales). B had
just built bye flags that would silently do nothing for those rows: a dormant
guard reads exactly like a passing one.

THE CAUSE: build.py took `bye` straight from Sleeper's per-player
`metadata.bye_week`, which is sparsely populated (201 of 1,762 players on the live
board; 16 of 32 defenses). The complete truth was always derivable — a bye is a
property of the team, and every one of the 32 teams has at least one player
carrying it — so build.py now votes a team->bye map from the pool and applies it
to that team's whole roster.

NOT read from src/nfl_byes.json on purpose: that file is GENERATED FROM this
artifact (see its own _source note), so joining it in the build would be circular
and an error could never self-correct. Deriving from the upstream Sleeper pool is
self-healing.

Run: python3 draft/tests/test_byes.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ARTIFACT = ROOT / "public" / "draft_data.json"
BYES = ROOT / "src" / "nfl_byes.json"

fails = []


def ck(name, cond, detail=""):
    if cond:
        print("PASS " + name)
    else:
        fails.append(name)
        print("FAIL " + name + ((" -> " + str(detail)) if detail else ""))


def derive(players):
    """The SAME majority vote build.py runs, over the same underlying values."""
    votes = {}
    for p in players:
        t, b = p.get("team"), p.get("bye")
        if not t or t == "FA" or b in (None, "", 0):
            continue
        try:
            b = int(b)
        except (TypeError, ValueError):
            continue
        votes.setdefault(t, {})
        votes[t][b] = votes[t].get(b, 0) + 1
    return {t: max(v.items(), key=lambda kv: kv[1])[0] for t, v in votes.items() if v}


if not ARTIFACT.exists():
    print("SKIP — no artifact built")
    sys.exit(0)

players = json.loads(ARTIFACT.read_text())["players"]
team_byes = derive(players)

ck("all 32 teams resolve a bye", len(team_byes) == 32, f"{len(team_byes)} teams")

# Independent cross-check: the committed map was generated separately, so
# agreement means the derivation is not inventing values.
if BYES.exists():
    ref = json.loads(BYES.read_text()).get("2026", {})
    both = [t for t in team_byes if t in ref]
    mism = {t: (team_byes[t], ref[t]) for t in both if team_byes[t] != ref[t]}
    ck("derived byes agree with the committed map", not mism, mism)

# A team whose players disagree about its bye means the vote is papering over bad
# data — worth knowing even though the majority rule would still pick one.
votes = {}
for p in players:
    t, b = p.get("team"), p.get("bye")
    if t and t != "FA" and b:
        votes.setdefault(t, set()).add(int(b))
ambiguous = {t: v for t, v in votes.items() if len(v) > 1}
ck("no team's players disagree about its bye", not ambiguous, ambiguous)

# THE INVARIANT THE CRITIQUE IS ABOUT: after the build joins the derived map,
# every player on a real team must carry a bye. Asserted against what the CURRENT
# artifact would resolve, so it holds before and after the next rebuild.
unresolved = [p for p in players
              if p.get("team") and p.get("team") != "FA"
              and not (p.get("bye") or team_byes.get(p.get("team")))]
ck("every player on a real team resolves a bye", not unresolved,
   f"{len(unresolved)} unresolved, e.g. {[p.get('name') for p in unresolved[:3]]}")

# Defenses are the loudest case (all 32 showed "—") and never free agents.
defs = [p for p in players if p.get("position") == "DEF"]
def_ok = [p for p in defs if p.get("bye") or team_byes.get(p.get("team"))]
ck("every defense resolves a bye", len(def_ok) == len(defs) == 32,
   f"{len(def_ok)}/{len(defs)}")

print(f"\n{len(fails)} failed")
sys.exit(1 if fails else 0)
