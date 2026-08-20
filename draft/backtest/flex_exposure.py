#!/usr/bin/env python3
# TERRITORY: A
"""P175 — what fraction of the Nth body's starts are FLEX starts?

Prereg: draft/FLEX-REPLACEMENT-PREREG-2026-08-19.md addendum (P175),
committed before this ran.

P172 failed because slots were assigned by DRAFT ORDER: the 3rd RB was charged
a flex replacement and the 4th escaped it at a LOWER one, so the model dodged
the penalty by drafting more backs. A lineup is assigned by QUALITY every week,
so the replacement has to be a property of the BODY, measured, not an order
index.

    R(q, n) = f(q,n) * flex_wire + (1 - f(q,n)) * waiver(q)

This measures f. REPORT ONLY -- it fits nothing and selects nothing.

Run: python3 draft/backtest/flex_exposure.py [--json <path>]
"""
from __future__ import annotations
import json, sys, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
DATA = DRAFT / "data"

POS_OF = json.loads((DATA / "player_positions.json").read_text())["positions"]
HIST = json.loads((DATA / "league_history.json").read_text())
BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
FLEX_ELIGIBLE = ("RB", "WR", "TE")
EXPECTED_STARTERS = 9
STARTERS = (BOARD.get("league") or {}).get("starters") or {}
BASE = {p: int(STARTERS.get(p, 0)) for p in POSITIONS}
FLEX_SLOTS = int(STARTERS.get("FLEX", 0))


def pos_of(pid):
    v = POS_OF.get(str(pid))
    return v.get("position") if isinstance(v, dict) else v


def main() -> int:
    # starts[(pos,n)] = weeks the nth-best body started
    # flexed[(pos,n)] = of those, how many were FLEX starts
    starts = collections.Counter()
    flexed = collections.Counter()
    flex_per_week = collections.Counter()
    good, bad = 0, 0

    for season in HIST["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        yr = str(season["season"])
        season_pts = collections.defaultdict(float)
        for wk, rows in weeks.items():
            for r in rows:
                for pid, pts in (r.get("players_points") or {}).items():
                    season_pts[(r["roster_id"], str(pid))] += float(pts or 0)

        for wk, rows in weeks.items():
            for r in rows:
                stt = [str(x) for x in (r.get("starters") or [])]
                plr = [str(x) for x in (r.get("players") or [])]
                if len(stt) != EXPECTED_STARTERS or not plr:
                    bad += 1
                    continue
                counts = collections.Counter()
                for pid in stt:
                    p = pos_of(pid)
                    if p in POSITIONS:
                        counts[p] += 1
                over = {p: counts[p] - BASE.get(p, 0) for p in FLEX_ELIGIBLE}
                if sum(max(0, v) for v in over.values()) != FLEX_SLOTS:
                    bad += 1
                    continue
                good += 1

                # roster rank of each body, by season points on THIS roster
                rank_of = {}
                by_pos = collections.defaultdict(list)
                for pid in plr:
                    p = pos_of(pid)
                    if p in POSITIONS:
                        by_pos[p].append(pid)
                for p, ids in by_pos.items():
                    ids.sort(key=lambda i: -season_pts[(r["roster_id"], i)])
                    for n, pid in enumerate(ids, start=1):
                        rank_of[pid] = (p, n)

                # WHICH started body is the flex one? The position running a
                # surplus this week supplies it, and within that position the
                # flex body is the WEAKEST of its started bodies -- the
                # dedicated slots are filled by the stronger ones first.
                flex_pos = next((p for p, v in over.items() if v > 0), None)
                started_in = collections.defaultdict(list)
                for pid in stt:
                    rp = rank_of.get(pid)
                    if rp:
                        started_in[rp[0]].append((rp[1], pid))
                for p, lst in started_in.items():
                    lst.sort()
                    for n, pid in lst:
                        starts[(p, n)] += 1
                if flex_pos and started_in.get(flex_pos):
                    n_flex = started_in[flex_pos][-1][0]     # weakest started body
                    flexed[(flex_pos, n_flex)] += 1
                    flex_per_week[flex_pos] += 1

    # ---- controls ----
    ctl = {}
    tot_flex = sum(flex_per_week.values())
    per_week = tot_flex / max(1, good)
    ctl["C1_flex_starts_total_one_slot"] = {
        "ok": abs(per_week - FLEX_SLOTS) <= 0.02,
        "flex_starts_per_team_week": round(per_week, 4), "expected": FLEX_SLOTS,
        "why": "a flex-start classifier that does not total exactly one slot per "
               "team-week is misclassifying somebody"}

    recon = {}
    ok_recon = True
    for p in FLEX_ELIGIBLE:
        s = sum(flexed[(p, n)] for n in range(1, 12))
        good_p = s == flex_per_week[p]
        ok_recon = ok_recon and good_p
        recon[p] = {"summed_over_bodies": s, "position_total": flex_per_week[p],
                    "ok": good_p}
    ctl["C2_f_sums_back_to_position_total"] = {
        "ok": ok_recon, "detail": recon,
        "why": "f must be a fraction of that body's OWN starts, so f x starts "
               "summed over n reproduces the position's flex starts"}

    ctl["C3_excluded_counted"] = {"ok": True, "team_weeks": good, "excluded": bad}

    all_ok = all(c["ok"] for c in ctl.values())
    if not all_ok:
        print("⛔ CONTROLS FAILED — refusing to report numbers")
        for k, v in ctl.items():
            if not v["ok"]:
                print("  FAIL", k, json.dumps(v)[:500])
        return 1

    def f(p, n):
        s = starts[(p, n)]
        return (flexed[(p, n)] / s) if s >= 30 else None

    table = {p: [f(p, n) for n in range(1, 7)] for p in FLEX_ELIGIBLE}

    p175 = all(
        (table[p][2] is not None and table[p][2] >= 0.30)
        and (table[p][3] is not None and table[p][3] >= 0.10)
        for p in ("RB", "WR"))

    print("P175 — FLEX EXPOSURE OF THE Nth BODY\n")
    for k in ctl:
        print(f"  OK  {k}")
    print(f"\n  f(q,n) = share of the nth body's STARTS that are flex starts")
    print(f"  {'pos':<5}" + "".join(f"{i:>10}" for i in range(1, 7)))
    for p in FLEX_ELIGIBLE:
        print(f"  {p:<5}" + "".join(
            f"{(round(x,3) if x is not None else '—'):>10}" for x in table[p]))
    print(f"\n  (starts at each body, the denominator)")
    for p in FLEX_ELIGIBLE:
        print(f"  {p:<5}" + "".join(f"{starts[(p,n)]:>10}" for n in range(1, 7)))

    W = {"QB": 322.9, "RB": 78.4, "WR": 124.8, "TE": 130.4, "K": 128.6, "DEF": 100.0}
    flex_wire = max(W[q] for q in FLEX_ELIGIBLE)
    print(f"\n  the blended replacement it implies (flex wire {flex_wire}):")
    print(f"  {'pos':<5}" + "".join(f"{i:>10}" for i in range(1, 7)))
    blend = {}
    for p in FLEX_ELIGIBLE:
        row = []
        for n in range(1, 7):
            x = table[p][n - 1]
            row.append(round(x * flex_wire + (1 - x) * W[p], 1) if x is not None else None)
        blend[p] = row
        print(f"  {p:<5}" + "".join(
            f"{(v if v is not None else '—'):>10}" for v in row))
    print(f"\n  P175 (RB and WR: f(3) >= 0.30 and f(4) >= 0.10): "
          f"{'TRUE' if p175 else 'FALSE'}")

    out = {"_territory": "TERRITORY: A — draft/backtest/flex_exposure.py",
           "_prereg": "draft/FLEX-REPLACEMENT-PREREG-2026-08-19.md (P175)",
           "_note": "REPORT ONLY.", "controls": ctl, "controls_all_passed": all_ok,
           "f": table, "starts": {p: [starts[(p, n)] for n in range(1, 7)]
                                  for p in FLEX_ELIGIBLE},
           "flex_wire": flex_wire, "blended_replacement": blend,
           "grades": {"P175_flex_exposure_persists_past_the_third": p175}}
    if "--json" in sys.argv:
        pth = Path(sys.argv[sys.argv.index("--json") + 1])
        pth.write_text(json.dumps(out, indent=1))
        print(f"\n  wrote {pth}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
