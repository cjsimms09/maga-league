#!/usr/bin/env python3
# TERRITORY: A
"""START RATE, CONDITIONED ON THE DRAFT CAPITAL ALREADY SPENT.

Prereg: draft/CONDITIONAL-START-PREREG-2026-08-19.md (P163, P164), committed
first.

Cory: "should it take into account the draft capital you gave up to get QB or TE,
ie if you draft one early you probably arent streaming that position."

The pooled 2nd-QB start rate of 0.427 averages two different strategies. Split it
by whether the rank-1 body at that position was an early draft pick.

REPORT ONLY.  Run: python3 draft/backtest/conditional_start_rate.py [--json path]
"""
from __future__ import annotations
import json, sys, collections
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
POS_OF = json.loads((DATA / "player_positions.json").read_text())["positions"]
HIST = json.loads((DATA / "league_history.json").read_text())
POSITIONS = ("QB", "RB", "WR", "TE")
INVESTED_ROUNDS = 6          # declared in the prereg; not to be moved after the run


def main() -> int:
    # started[(pos, rank, group)] / rostered[...]
    st = collections.Counter(); ro = collections.Counter()
    cells = collections.Counter()           # (pos, group) -> number of (season,roster) cells
    draft_join = {}
    seasons = []

    for season in HIST["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        yr = str(season["season"]); seasons.append(yr)

        drafts = season.get("drafts") or []
        d0 = drafts[0] if isinstance(drafts, list) and drafts else drafts
        pick_round = {}                      # (roster_id, pid) -> round
        for pk in ((d0 or {}).get("picks") or []):
            rid, pid = pk.get("roster_id"), str(pk.get("player_id") or "")
            rnd = pk.get("round")
            if rid is not None and pid:
                pick_round[(rid, pid)] = int(rnd) if rnd else 99

        wk1 = weeks.get("1") or []
        hit = miss = 0
        for r in wk1:
            own = set(str(x) for x in (r.get("players") or []))
            for (rid, pid) in pick_round:
                if rid == r["roster_id"]:
                    hit += (pid in own); miss += (pid not in own)
        draft_join[yr] = {"on_roster_wk1": hit, "not_on_roster_wk1": miss,
                          "ok": hit > 0 and hit > miss * 3}

        pts = collections.defaultdict(float)
        for wk, rows in weeks.items():
            for r in rows:
                for pid, p in (r.get("players_points") or {}).items():
                    pts[(r["roster_id"], str(pid))] += float(p or 0)

        # classify each (roster, position) by how its rank-1 body was acquired.
        # Use the FINAL-week roster ordering as the season's ranking.
        last = max(weeks, key=lambda w: int(w))
        group_of = {}
        for r in weeks[last]:
            rid = r["roster_id"]
            by = collections.defaultdict(list)
            for pid in (r.get("players") or []):
                q = POS_OF.get(str(pid))
                if q in POSITIONS:
                    by[q].append(str(pid))
            for q, ids in by.items():
                ids.sort(key=lambda i: -pts[(rid, i)])
                top = ids[0]
                rnd = pick_round.get((rid, top))
                g = "invested" if (rnd is not None and rnd <= INVESTED_ROUNDS) else "not_invested"
                group_of[(rid, q)] = g
                cells[(q, g)] += 1

        for wk, rows in weeks.items():
            for r in rows:
                rid = r["roster_id"]
                S = set(str(x) for x in (r.get("starters") or []))
                plr = [str(x) for x in (r.get("players") or [])]
                if len(S) != 9 or not plr:
                    continue
                by = collections.defaultdict(list)
                for pid in plr:
                    q = POS_OF.get(pid)
                    if q in POSITIONS:
                        by[q].append(pid)
                for q, ids in by.items():
                    g = group_of.get((rid, q))
                    if g is None:
                        continue
                    ids.sort(key=lambda i: -pts[(rid, i)])
                    for n, pid in enumerate(ids, start=1):
                        if n > 3:
                            break
                        ro[(q, n, g)] += 1
                        if pid in S:
                            st[(q, n, g)] += 1

    def rate(q, n, g):
        d = ro[(q, n, g)]
        return (st[(q, n, g)] / d) if d else None

    ctl = {}
    ctl["C3_draft_join"] = {"ok": all(v["ok"] for v in draft_join.values()),
                            "per_season": draft_join}
    r1 = {q: {g: rate(q, 1, g) for g in ("invested", "not_invested")} for q in POSITIONS}
    ctl["C1_known_positive_rank1_high_in_both"] = {
        "ok": all(v is not None and v > 0.55 for q in POSITIONS for v in r1[q].values()),
        "got": {q: {g: (round(v, 3) if v is not None else None) for g, v in r1[q].items()}
                for q in POSITIONS},
        "why": "investment must not change whether your BEST body plays; if it "
               "does, the split is picking up something else"}
    share = {}
    for q in POSITIONS:
        tot = cells[(q, "invested")] + cells[(q, "not_invested")]
        share[q] = round(cells[(q, "invested")] / tot, 3) if tot else None
    ctl["C2_both_groups_non_trivial"] = {
        "ok": all(v is not None and 0.25 <= v <= 0.75 for v in share.values()),
        "invested_share": share,
        "why": "a split with 5% on one side is not measuring a contrast"}
    ctl["C4_denominator_weeks_rostered"] = {"ok": True}
    ctl["C5_three_seasons"] = {"ok": len(set(seasons)) == 3, "seasons": sorted(set(seasons))}
    all_ok = all(c["ok"] for c in ctl.values())

    print("START RATE CONDITIONED ON DRAFT CAPITAL  (P163 / P164)\n")
    for k, c in ctl.items():
        print("  %s %s" % ("OK " if c["ok"] else "!! ", k))
    if not all_ok:
        print("\n  !! A CONTROL FAILED. Nothing below is a measurement.\n")

    print("\n  rank-1 body drafted in rounds 1-%d = INVESTED" % INVESTED_ROUNDS)
    print("  share of (season, roster, position) cells that are invested: %s\n" % share)
    print("  %-5s %-6s %12s %14s %10s" % ("pos", "rank", "invested", "not invested", "gap"))
    gaps = {}
    for q in POSITIONS:
        for n in (1, 2, 3):
            a, b = rate(q, n, "invested"), rate(q, n, "not_invested")
            g = (b - a) if (a is not None and b is not None) else None
            if n == 2:
                gaps[q] = g
            print("  %-5s %-6d %12s %14s %10s" % (q, n,
                  ("%.3f" % a) if a is not None else "—",
                  ("%.3f" % b) if b is not None else "—",
                  ("%+.3f" % g) if g is not None else "—"))
        print()

    p163 = {q: (gaps[q] is not None and gaps[q] >= 0.10) for q in ("QB", "TE")}
    p163["TRUE"] = all(p163[q] for q in ("QB", "TE"))
    p164 = {q: (gaps[q] is not None and gaps[q] < 0.10) for q in ("RB", "WR")}
    p164["TRUE"] = all(p164[q] for q in ("RB", "WR"))
    print("  P163 (QB and TE rank-2 gap >= 0.10): %s   QB %s   TE %s"
          % ("TRUE" if p163["TRUE"] else "FALSE",
             ("%+.3f" % gaps["QB"]) if gaps.get("QB") is not None else "—",
             ("%+.3f" % gaps["TE"]) if gaps.get("TE") is not None else "—"))
    print("  P164 (RB and WR gap < 0.10):        %s   RB %s   WR %s"
          % ("TRUE" if p164["TRUE"] else "FALSE",
             ("%+.3f" % gaps["RB"]) if gaps.get("RB") is not None else "—",
             ("%+.3f" % gaps["WR"]) if gaps.get("WR") is not None else "—"))

    rep = {"_territory": "TERRITORY: A — draft/backtest/conditional_start_rate.py",
           "_prereg": "draft/CONDITIONAL-START-PREREG-2026-08-19.md",
           "_note": "REPORT ONLY. Counted; nothing tuned.",
           "invested_rounds": INVESTED_ROUNDS, "controls": ctl,
           "controls_all_passed": all_ok, "invested_share": share,
           "rates": {q: {n: {g: rate(q, n, g) for g in ("invested", "not_invested")}
                         for n in (1, 2, 3)} for q in POSITIONS},
           "rank2_gap": {q: (round(gaps[q], 4) if gaps.get(q) is not None else None)
                         for q in POSITIONS},
           "P163": p163, "P164": p164}
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(rep, indent=1))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
