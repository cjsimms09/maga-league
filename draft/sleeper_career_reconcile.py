"""Reconcile the SEEDED career records against Sleeper's own history.

THE DEFECT (B, 2026-08-11). `src/seed-data.js` OWNERS carries career
regular-season W-L-T "from the master sheet". It does not close:

    W = 425, L = 424, T = 2  ->  851 game-slots

Every game contributes exactly TWO slots, so the total must be even. 851 is odd,
so exactly one record is off by one. Narrowing further before touching anything:
ties aside W must equal L, and W-L = +1 — one surplus win or one missing loss.
And nine owners have 85 games while ONE has 86. Two independent arguments point
at the same cell.

WHY THIS SCRIPT INSTEAD OF EDITING THAT CELL. An inference that lands on the
right answer is still an inference, and the seeded numbers were transcribed from
a spreadsheet by hand — the same class of value the seat and keeper bugs came
from. Sleeper holds every one of these games. So the fix is to READ them:
walk `previous_league_id` backward from the current league, sum
`roster.settings.{wins,losses,ties}` per owner per season, and diff against the
seed.

WHAT IT DOES NOT DO: it does not write. It reports the per-owner, per-season
diff so the correction is made against evidence rather than against a guess about
which transcription slipped.

RUN FROM CI — Sleeper egress is denied at the gateway from the dev sandbox.
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEAGUE_ID = os.environ.get("SLEEPER_LEAGUE_ID") or "1374848328470102016"
OUT = os.path.join(ROOT, "draft", "data", "career_reconcile.json")


def get(path):
    req = urllib.request.Request("https://api.sleeper.app/v1" + path,
                                 headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def seeded():
    """Parse OWNERS out of seed-data.js without a JS runtime."""
    import re
    src = open(os.path.join(ROOT, "src", "seed-data.js")).read()
    out = {}
    for m in re.finditer(r"\{\s*name:\s*'([^']+)'.*?wins:\s*(\d+),\s*losses:\s*(\d+),\s*ties:\s*(\d+)", src):
        out[m.group(1)] = {"wins": int(m.group(2)), "losses": int(m.group(3)), "ties": int(m.group(4))}
    return out


def main():
    seed = seeded()
    if not seed:
        print("::error::could not parse OWNERS out of seed-data.js"); return 1
    sw = sum(v["wins"] for v in seed.values())
    sl = sum(v["losses"] for v in seed.values())
    st = sum(v["ties"] for v in seed.values())
    print("SEEDED: W=%d L=%d T=%d  slots=%d (%s)"
          % (sw, sl, st, sw + sl + st, "EVEN" if (sw + sl + st) % 2 == 0 else "ODD — does not close"))

    # Walk backward. Every league Sleeper still holds for this chain.
    chain, lid, seen = [], LEAGUE_ID, set()
    while lid and lid not in seen:
        seen.add(lid)
        try:
            lg = get("/league/%s" % lid)
        except Exception as exc:                                # noqa: BLE001
            print("  ! stopped at %s: %s" % (lid, exc)); break
        chain.append(lg)
        lid = lg.get("previous_league_id")
    print("chain: %d league-seasons -> %s"
          % (len(chain), ", ".join("%s(%s)" % (l.get("season"), l.get("status")) for l in chain)))

    # user_id -> display name, from every season (owners change handles).
    names, totals, per_season = {}, {}, []
    for lg in chain:
        s = lg.get("season")
        if lg.get("status") != "complete":
            print("  skip %s — status %r, not a completed season" % (s, lg.get("status")))
            continue
        for u in (get("/league/%s/users" % lg["league_id"]) or []):
            names.setdefault(str(u.get("user_id")), u.get("display_name"))
        row = {}
        for r in (get("/league/%s/rosters" % lg["league_id"]) or []):
            st_ = r.get("settings") or {}
            oid = str(r.get("owner_id"))
            w, l, t = int(st_.get("wins") or 0), int(st_.get("losses") or 0), int(st_.get("ties") or 0)
            tot = totals.setdefault(oid, {"wins": 0, "losses": 0, "ties": 0})
            tot["wins"] += w; tot["losses"] += l; tot["ties"] += t
            row[oid] = {"wins": w, "losses": l, "ties": t}
        per_season.append({"season": s, "league_id": lg["league_id"], "rows": row})
        sub = sum(v["wins"] + v["losses"] + v["ties"] for v in row.values())
        print("  %s: %d teams, %d slots (%s)" % (s, len(row), sub, "even" if sub % 2 == 0 else "ODD"))

    aw = sum(v["wins"] for v in totals.values())
    al = sum(v["losses"] for v in totals.values())
    at = sum(v["ties"] for v in totals.values())
    print()
    print("SLEEPER: W=%d L=%d T=%d  slots=%d (%s)"
          % (aw, al, at, aw + al + at, "EVEN" if (aw + al + at) % 2 == 0 else "ODD"))
    print()
    print("== PER OWNER: seeded vs Sleeper ==")
    print("  %-12s %-14s %-14s %s" % ("owner", "seeded", "sleeper", "delta"))
    by_name = {}
    for oid, v in totals.items():
        by_name[names.get(oid) or oid] = v
    for nm in sorted(seed):
        s_ = seed[nm]
        # Sleeper display names will not match our short names; report both and
        # let the diff be made by eye rather than by a fuzzy match nobody audited.
        print("  %-12s %-14s %s" % (nm, "%d-%d-%d" % (s_["wins"], s_["losses"], s_["ties"]), "(match by hand below)"))
    print()
    print("== SLEEPER TOTALS BY DISPLAY NAME ==")
    for nm in sorted(by_name):
        v = by_name[nm]
        print("  %-24s %d-%d-%d  (%d games)" % (nm, v["wins"], v["losses"], v["ties"],
                                                v["wins"] + v["losses"] + v["ties"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"seeded": seed, "seeded_totals": {"wins": sw, "losses": sl, "ties": st},
               "sleeper_by_display_name": by_name,
               "sleeper_totals": {"wins": aw, "losses": al, "ties": at},
               "chain": [{"season": l.get("season"), "league_id": l.get("league_id"),
                          "status": l.get("status")} for l in chain],
               "per_season": per_season},
              open(OUT, "w"), indent=2, sort_keys=True)
    print("\nwrote %s" % OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
