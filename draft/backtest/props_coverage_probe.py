#!/usr/bin/env python3
"""TERRITORY: D. What fraction of our owners' STARTED slots could the props
arm have priced? Report-only; it reads nothing about outcomes.

Written for the P347 prereg, and it exists as a committed tool because the
first two numbers I got were wrong in the same way: I resolved player names
against ONE source (the 2026 board) and reported 21.2% joinable, then 22.7% of
started slots unnamed. The disk carries SIX id->name sources totalling 4,267
pairs; against their union the unresolvable share is 5 slots in 4,860. A
coverage number is only as good as the population behind it (Rule 3i), so this
prints the population, the sources it used, and the per-position split rather
than a headline.

CONTROLS gate the exit code:
  C1  the union must resolve materially more than the board alone -- if it does
      not, the union built wrong and the whole measurement is the old one.
  C2  K and DEF must come back at ZERO coverage. Props do not quote them; a
      non-zero there means the name join is matching the wrong people.
  C3  a KNOWN-POSITIVE: at least one season-week must have >0 covered slots,
      or the join produced a clean-looking null (Rule 3e).
"""
import collections
import glob
import json
import os
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[2]
SEASONS = ("2023", "2024", "2025")
OFFENSE = ("QB", "RB", "WR", "TE")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = s.lower().replace(".", "").replace("'", "").replace("-", " ")
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def id_to_name():
    """Every id->name pair on disk, and which files supplied them."""
    name, srcs = {}, []
    pats = ["draft/data/*.json", "draft/backtest/*.json", "public/*.json"]
    for pat in pats:
        for f in sorted(glob.glob(str(ROOT / pat))):
            try:
                if os.path.getsize(f) > 40_000_000:
                    continue
                d = json.load(open(f))
            except Exception:
                continue
            found = [0]

            def walk(o):
                if isinstance(o, dict):
                    pid = o.get("player_id") or o.get("sleeper_id") or o.get("id")
                    n = o.get("name") or o.get("full_name") or o.get("player_name")
                    if pid and isinstance(n, str) and n and str(pid) not in name:
                        name[str(pid)] = n
                        found[0] += 1
                    for v in o.values():
                        walk(v)
                elif isinstance(o, list):
                    for v in o:
                        walk(v)

            walk(d)
            if found[0]:
                srcs.append((found[0], os.path.relpath(f, ROOT)))
    return name, sorted(srcs, reverse=True)


def props_by_week():
    out = {}
    for f in sorted(glob.glob(str(ROOT / "draft/backtest/historical_props_20*.json"))):
        d = json.load(open(f))
        s = str(d["season"])
        for w in d["weeks"]:
            out[(s, int(w["week"]))] = {norm(k): v for k, v in (w.get("players") or {}).items()}
    return out


def main():
    name, srcs = id_to_name()
    board_only = {}
    try:
        b = json.load(open(ROOT / "public/draft_data.json"))
        for p in (b.get("players") or []):
            n = p.get("name") or p.get("full_name")
            if n:
                board_only[str(p.get("player_id"))] = n
    except Exception:
        pass
    props = props_by_week()
    posmap = json.load(open(ROOT / "draft/data/player_positions.json"))
    posmap = posmap.get("positions") or posmap
    hist = json.load(open(ROOT / "draft/data/league_history.json"))

    def measure(namemap):
        tot = cov = unnamed = 0
        by, cv = collections.Counter(), collections.Counter()
        perweek = collections.Counter()
        for v in hist["seasons"]:
            s = str(v.get("season"))
            if s not in SEASONS:
                continue
            for wnum, entries in (v.get("weeks") or {}).items():
                pw = props.get((s, int(wnum)), {})
                for m in (entries or []):
                    for pid in (m.get("starters") or []):
                        if not pid:
                            continue
                        tot += 1
                        p = posmap.get(str(pid))
                        p = p if isinstance(p, str) else None
                        by[p] += 1
                        n = namemap.get(str(pid))
                        if not n:
                            unnamed += 1
                            continue
                        if norm(n) in pw:
                            cov += 1
                            cv[p] += 1
                            perweek[(s, int(wnum))] += 1
        return tot, cov, unnamed, by, cv, perweek

    tot, cov, unnamed, by, cv, perweek = measure(name)
    btot, bcov, bunnamed, _, _, _ = measure(board_only)

    print("id->name sources used (%d pairs):" % len(name))
    for n, f in srcs[:6]:
        print("   +%-6d %s" % (n, f))
    print()
    print("started slots %s: %d" % ("/".join(SEASONS), tot))
    print("  id with no name anywhere on disk: %d (%.1f%%)" % (unnamed, 100 * unnamed / tot))
    print("  covered by a props row that week: %d (%.1f%%)" % (cov, 100 * cov / tot))
    off = sum(c for p, c in by.items() if p in OFFENSE)
    offcov = sum(c for p, c in cv.items() if p in OFFENSE)
    print("  OFFENSIVE (QB/RB/WR/TE): %d started, %d covered (%.1f%%)"
          % (off, offcov, 100 * offcov / off))
    for p in ("QB", "RB", "WR", "TE", "K", "DEF"):
        if by.get(p):
            print("     %-4s %5d started  %5d covered  (%.0f%%)"
                  % (p, by[p], cv.get(p, 0), 100 * cv.get(p, 0) / by[p]))

    ctl = {}
    ctl["C1_union_beats_board_alone"] = {
        "ok": cov > bcov, "union": cov, "board_only": bcov,
        "why": "the board is the 2026 pool; using it alone is how 21.2%% and 22.7%% happened"}
    ctl["C2_K_and_DEF_are_zero"] = {
        "ok": cv.get("K", 0) == 0 and cv.get("DEF", 0) == 0,
        "K": cv.get("K", 0), "DEF": cv.get("DEF", 0),
        "why": "props do not quote kickers or defences; non-zero means the join matched the wrong people"}
    ctl["C3_known_positive_some_week_is_covered"] = {
        "ok": max(perweek.values(), default=0) > 0, "best_week": max(perweek.values(), default=0),
        "why": "a join that covers nothing looks identical to a join that is broken (Rule 3e)"}
    print("\ncontrols:")
    bad = [k for k, v in ctl.items() if not v["ok"]]
    for k, v in ctl.items():
        print("  %s %s %s" % ("OK " if v["ok"] else "!! ", k, json.dumps({x: y for x, y in v.items() if x != "why"})))
    if bad:
        print("\n⛔ CONTROLS FAILED — refusing to report this as a measurement.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
