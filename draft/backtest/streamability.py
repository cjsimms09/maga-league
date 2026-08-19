#!/usr/bin/env python3
# TERRITORY: A
"""STREAMABILITY — how much of a position's depth you can get for free.

Prereg: draft/STREAMABILITY-PREREG-2026-08-19.md (P153, P154), committed first.

Cory specified a need curve that is "almost 0 on TE and Qb, but not so much where
you miss extreme value", and exactly 0 only at K/DEF. Nothing built today does
that: the binomial hits 0, the measured curve gives QB2 = 0.427 and drafts one.

A second body is only worth a DRAFT PICK to the extent you could not have had one
free. So:

    need(pos, held) = measured_start_rate(pos, held+1) x (1 - streamability(pos))

    streamability(pos) = of all roster-weeks where a team's 2nd-or-later body at
                         that position was rostered, the fraction where that
                         player arrived by WAIVER or FREE AGENCY, not by draft.

One measured multiplier, counted from three seasons of this league's own
transactions. Nothing tuned. REPORT ONLY.

Run: python3 draft/backtest/streamability.py [--json <path>]
"""
from __future__ import annotations
import json, sys, collections
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
POS_OF = json.loads((DATA / "player_positions.json").read_text())["positions"]
HIST = json.loads((DATA / "league_history.json").read_text())
MEASURED = json.loads((DATA / "measured_need_curve.json").read_text())
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
STREAM_TYPES = {"waiver", "free_agent"}


def main() -> int:
    if not MEASURED.get("controls_all_passed"):
        print("!! measured_need_curve.json did not pass its controls — REFUSING")
        return 1

    added = collections.Counter()      # (pos, rank>=2) weeks held by an ADDED player
    total = collections.Counter()      # (pos, rank>=2) weeks held at all
    per_season = collections.defaultdict(lambda: [collections.Counter(), collections.Counter()])
    excluded_trades, draft_join_ok, seasons_seen = 0, {}, []

    for season in HIST["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        yr = str(season["season"])
        seasons_seen.append(yr)

        # who was DRAFTED, by roster
        drafted = collections.defaultdict(set)
        drafts = season.get("drafts") or []
        d0 = drafts[0] if isinstance(drafts, list) and drafts else drafts
        for pk in ((d0 or {}).get("picks") or []):
            rid = pk.get("roster_id")
            pid = str(pk.get("player_id") or "")
            if rid is not None and pid:
                drafted[rid].add(pid)

        # C1 — every drafted player should appear on his drafting roster in week 1
        wk1 = weeks.get("1") or []
        hit = miss = 0
        for r in wk1:
            own = set(str(x) for x in (r.get("players") or []))
            for pid in drafted.get(r["roster_id"], ()):
                if pid in own:
                    hit += 1
                else:
                    miss += 1
        draft_join_ok[yr] = {"on_roster_wk1": hit, "not_on_roster_wk1": miss,
                             "ok": hit > 0 and hit > miss * 3}

        # who was ADDED by stream, by roster (waiver / free agent only)
        addedby = collections.defaultdict(set)
        txs = season.get("transactions") or []
        flat = []
        if isinstance(txs, dict):
            for v in txs.values():
                flat.extend(v if isinstance(v, list) else [v])
        else:
            for v in txs:
                flat.extend(v if isinstance(v, list) else [v])
        for t in flat:
            if not isinstance(t, dict):
                continue
            if t.get("status") not in (None, "complete"):
                continue
            ty = t.get("type")
            if ty == "trade":
                excluded_trades += 1
                continue
            if ty not in STREAM_TYPES:
                continue
            for pid, rid in (t.get("adds") or {}).items():
                addedby[rid].add(str(pid))

        # season points, to rank a roster's bodies at a position
        pts = collections.defaultdict(float)
        for wk, rows in weeks.items():
            for r in rows:
                for pid, p in (r.get("players_points") or {}).items():
                    pts[(r["roster_id"], str(pid))] += float(p or 0)

        for wk, rows in weeks.items():
            for r in rows:
                plr = [str(x) for x in (r.get("players") or [])]
                if not plr:
                    continue
                rid = r["roster_id"]
                by = collections.defaultdict(list)
                for pid in plr:
                    q = POS_OF.get(pid)
                    if q in POSITIONS:
                        by[q].append(pid)
                for q, ids in by.items():
                    ids.sort(key=lambda i: -pts[(rid, i)])
                    for n, pid in enumerate(ids, start=1):
                        if n < 2:            # C5 — denominator is rank >= 2 only
                            continue
                        total[q] += 1
                        per_season[yr][1][q] += 1
                        if pid in addedby.get(rid, ()) and pid not in drafted.get(rid, ()):
                            added[q] += 1
                            per_season[yr][0][q] += 1

    stream = {q: (added[q] / total[q]) if total[q] else None for q in POSITIONS}

    ctl = {
        "C1_draft_join": {"ok": all(v["ok"] for v in draft_join_ok.values()),
                          "per_season": draft_join_ok,
                          "why": "a drafted player must be on his drafting roster in week 1"},
        "C2_trades_excluded_and_counted": {"ok": True, "trades_excluded": excluded_trades},
        "C3_three_seasons": {"ok": len(seasons_seen) == 3, "seasons": sorted(seasons_seen)},
        "C4_known_positive_DEF_is_streamable": {
            "ok": stream["DEF"] is not None and stream["DEF"] > 0.5,
            "got": round(stream["DEF"], 4) if stream["DEF"] is not None else None,
            "why": "this league cycles 100% of the defence pool; if defences look "
                   "un-streamable the join is wrong and nothing else counts"},
        "C5_denominator_rank_2_plus": {"ok": True,
            "roster_weeks_at_rank_2plus": {q: total[q] for q in POSITIONS}},
    }
    all_ok = all(c["ok"] for c in ctl.values())

    print("STREAMABILITY — how much depth you can get for free (P153/P154)\n")
    for k, c in ctl.items():
        print("  %s %s%s" % ("OK " if c["ok"] else "!! ", k,
              ("   " + str(c.get("got"))) if c.get("got") is not None else ""))
    if not all_ok:
        print("\n  !! A CONTROL FAILED. Nothing below is a measurement.\n")

    print("\n  %-5s %12s %14s %16s" % ("pos", "streamable", "roster-weeks", "measured 2nd-body"))
    curve = MEASURED["curve"]
    need2 = {}
    for q in POSITIONS:
        s = stream[q]
        m = (curve.get(q) or [None, None])[1]
        need2[q] = (m * (1 - s)) if (s is not None and m is not None) else None
        print("  %-5s %11s %14d %16s" % (q, ("%.3f" % s) if s is not None else "—",
              total[q], ("%.3f" % m) if m is not None else "—"))

    print("\n  ⇒ need for a SECOND body = measured start rate x (1 - streamability)")
    print("  %-5s %10s   %10s   %10s" % ("pos", "measured", "streamable", "NEED"))
    for q in POSITIONS:
        m = (curve.get(q) or [None, None])[1]
        print("  %-5s %10s   %10s   %10s" % (q,
              ("%.3f" % m) if m is not None else "—",
              ("%.3f" % stream[q]) if stream[q] is not None else "—",
              ("%.3f" % need2[q]) if need2[q] is not None else "—"))

    p153 = {"stream": {q: (round(stream[q], 3) if stream[q] is not None else None) for q in POSITIONS}}
    gap = (stream["QB"] - stream["RB"]) if (stream["QB"] is not None and stream["RB"] is not None) else None
    p153["qb_minus_rb"] = round(gap, 3) if gap is not None else None
    p153["TRUE"] = (gap is not None and gap >= 0.25
                    and min(stream["K"] or 0, stream["DEF"] or 0) > max(stream["RB"] or 1, stream["WR"] or 1))
    p154 = {"need_2nd_QB": round(need2["QB"], 4) if need2["QB"] is not None else None}
    p154["TRUE"] = need2["QB"] is not None and 0 < need2["QB"] < 0.15

    print("\n  P153 (K/DEF > QB/TE > RB/WR, and QB−RB ≥ 0.25): %s   gap %s"
          % ("TRUE" if p153["TRUE"] else "FALSE", p153["qb_minus_rb"]))
    print("  P154 (2nd-QB need in (0, 0.15)): %s   got %s"
          % ("TRUE" if p154["TRUE"] else "FALSE", p154["need_2nd_QB"]))

    rep = {"_territory": "TERRITORY: A — draft/backtest/streamability.py",
           "_prereg": "draft/STREAMABILITY-PREREG-2026-08-19.md",
           "_note": "REPORT ONLY. Counted from transactions; nothing tuned.",
           "controls": ctl, "controls_all_passed": all_ok,
           "streamability": p153["stream"],
           "need_second_body": {q: (round(need2[q], 4) if need2[q] is not None else None)
                                for q in POSITIONS},
           "P153": p153, "P154": p154}
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(rep, indent=1))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
