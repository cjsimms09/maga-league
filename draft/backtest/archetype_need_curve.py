#!/usr/bin/env python3
# TERRITORY: A
"""P170 — is the pooled need curve describing a roster nobody builds?

Prereg: draft/FLEX-AND-SCARCITY-PREREG-2026-08-19.md addendum (P170),
committed before this ran.

P167 came back TRUE at sd 0.272 with the full range 0.000-1.000: the league is
two flex archetypes, not one average. The measured need curve is pooled across
both. This recounts it WITHIN each archetype.

REPORT ONLY. Writes no board field, changes no curve.

Run: python3 draft/backtest/archetype_need_curve.py [--json <path>]
"""
from __future__ import annotations
import json, sys, collections, statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
DATA = DRAFT / "data"

POS_OF = json.loads((DATA / "player_positions.json").read_text())["positions"]
HIST = json.loads((DATA / "league_history.json").read_text())
BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
POOLED = json.loads((DATA / "measured_need_curve.json").read_text())
if not POOLED.get("controls_all_passed"):
    raise SystemExit("measured_need_curve failed its controls — REFUSING")

POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
EXPECTED_STARTERS = 9
STARTERS = (BOARD.get("league") or {}).get("starters") or {}
BASE = {p: int(STARTERS.get(p, 0)) for p in POSITIONS}
FLEX_SLOTS = int(STARTERS.get("FLEX", 0))


def pos_of(pid):
    v = POS_OF.get(str(pid))
    return v.get("position") if isinstance(v, dict) else v


def main() -> int:
    # ---- pass 1: classify each team-season by who fills its flex ----
    flex_ct = collections.defaultdict(collections.Counter)
    flex_wk = collections.Counter()
    # ---- and collect the raw lineups so pass 2 does not re-read ----
    lineups = []          # (yr, roster_id, starters, players, season_pts_key)
    season_pts = collections.defaultdict(float)
    bad = 0

    for season in HIST["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        yr = str(season["season"])
        for wk, rows in weeks.items():
            for r in rows:
                for pid, pts in (r.get("players_points") or {}).items():
                    season_pts[(yr, r["roster_id"], str(pid))] += float(pts or 0)
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
                over = {p: counts[p] - BASE.get(p, 0) for p in ("RB", "WR", "TE")}
                if sum(max(0, v) for v in over.values()) != FLEX_SLOTS:
                    bad += 1
                    continue
                key = (yr, r["roster_id"])
                flex_wk[key] += 1
                for p, v in over.items():
                    if v > 0:
                        flex_ct[key][p] += v
                lineups.append((yr, r["roster_id"], stt, plr))

    keys = [k for k in sorted(flex_wk) if flex_wk[k] >= 5]
    wr_share = {k: flex_ct[k]["WR"] / flex_wk[k] for k in keys}
    GROUP = {k: ("WR_FLEX" if wr_share[k] > 0.5 else "RB_FLEX") for k in keys}
    sizes = collections.Counter(GROUP.values())

    # ---- pass 2: recount the need curve inside each group ----
    started = collections.defaultdict(collections.Counter)   # grp -> (pos,n)
    rostered = collections.defaultdict(collections.Counter)
    for yr, rid, stt, plr in lineups:
        key = (yr, rid)
        grp = GROUP.get(key)
        if grp is None:
            continue
        by_pos = collections.defaultdict(list)
        for pid in plr:
            p = pos_of(pid)
            if p in POSITIONS:
                by_pos[p].append(pid)
        for p, ids in by_pos.items():
            ids.sort(key=lambda i: -season_pts[(yr, rid, i)])
            for n, pid in enumerate(ids, start=1):
                rostered[grp][(p, n)] += 1
                if pid in stt:
                    started[grp][(p, n)] += 1

    def curve(grp, p, depth=6):
        out = []
        for n in range(1, depth + 1):
            d = rostered[grp][(p, n)]
            out.append(round(started[grp][(p, n)] / d, 3) if d >= 30 else None)
        return out

    curves = {g: {p: curve(g, p) for p in POSITIONS} for g in ("WR_FLEX", "RB_FLEX")}
    pooled = POOLED["curve"]

    # ---- controls ----
    ctl = {}
    ctl["C1_both_groups_have_ten"] = {
        "ok": sizes["WR_FLEX"] >= 10 and sizes["RB_FLEX"] >= 10,
        "sizes": dict(sizes),
        "why": "a 27/3 split is not two archetypes; the result would be unusable"}

    # KNOWN POSITIVE (rule 3e): recombining the two groups must reproduce the
    # POOLED curve this file did not compute. If the re-count disagrees with
    # measured_need_curve.json, the classification pass corrupted the join.
    recomb = {}
    ok_recomb = True
    for p in POSITIONS:
        for n in range(1, 5):
            st = sum(started[g][(p, n)] for g in ("WR_FLEX", "RB_FLEX"))
            ro = sum(rostered[g][(p, n)] for g in ("WR_FLEX", "RB_FLEX"))
            if ro < 30:
                continue
            got = st / ro
            want = (pooled.get(p) or [None] * 6)[n - 1]
            if want is None:
                continue
            good = abs(got - want) < 0.03
            ok_recomb = ok_recomb and good
            recomb[f"{p}{n}"] = {"recombined": round(got, 3), "pooled": want,
                                 "ok": good}
    ctl["C2_known_positive_recombines_to_pooled"] = {
        "ok": ok_recomb, "detail": recomb,
        "why": "rule 3e -- the union of the two groups must reproduce the pooled "
               "curve computed by a different file. If it does not, this file's "
               "classification pass broke the join and every split number is noise"}

    ctl["C3_excluded_counted"] = {"ok": True, "team_weeks": len(lineups),
                                  "excluded": bad}

    all_ok = all(c["ok"] for c in ctl.values())
    if not all_ok:
        print("⛔ CONTROLS FAILED — refusing to report numbers")
        for k, v in ctl.items():
            if not v["ok"]:
                print("  FAIL", k, json.dumps(v)[:600])
        return 1

    wr3_wrflex = curves["WR_FLEX"]["WR"][2]
    rb3_rbflex = curves["RB_FLEX"]["RB"][2]
    wr3_pool, rb3_pool = pooled["WR"][2], pooled["RB"][2]
    p170 = (wr3_wrflex is not None and rb3_rbflex is not None
            and wr3_wrflex - wr3_pool >= 0.05 and rb3_rbflex - rb3_pool >= 0.05)

    print("P170 — THE NEED CURVE INSIDE EACH FLEX ARCHETYPE\n")
    for k, v in ctl.items():
        print(f"  OK  {k}")
    print(f"\n  team-seasons: WR_FLEX {sizes['WR_FLEX']}  RB_FLEX {sizes['RB_FLEX']}")
    for p in ("RB", "WR", "TE", "QB"):
        print(f"\n  {p}")
        print(f"    {'':<10}" + "".join(f"{i:>9}" for i in range(1, 7)))
        print(f"    {'pooled':<10}" + "".join(
            f"{(pooled[p][i] if pooled[p][i] is not None else '—'):>9}" for i in range(6)))
        for g in ("WR_FLEX", "RB_FLEX"):
            print(f"    {g:<10}" + "".join(
                f"{(curves[g][p][i] if curves[g][p][i] is not None else '—'):>9}"
                for i in range(6)))
    print(f"\n  P170 (WR3 in WR-flex teams and RB3 in RB-flex teams each beat the "
          f"pooled figure by >= 0.05)")
    print(f"    WR 3rd body: pooled {wr3_pool}  ->  WR-flex teams {wr3_wrflex}")
    print(f"    RB 3rd body: pooled {rb3_pool}  ->  RB-flex teams {rb3_rbflex}")
    print(f"    P170: {'TRUE' if p170 else 'FALSE'}")

    out = {"_territory": "TERRITORY: A — draft/backtest/archetype_need_curve.py",
           "_prereg": "draft/FLEX-AND-SCARCITY-PREREG-2026-08-19.md (P170)",
           "_note": "REPORT ONLY.",
           "controls": ctl, "controls_all_passed": all_ok,
           "group_sizes": dict(sizes),
           "wr_flex_share_by_team_season": {f"{k[0]}:{k[1]}": round(v, 3)
                                            for k, v in sorted(wr_share.items())},
           "pooled_curve": pooled, "archetype_curves": curves,
           "grades": {"P170_pooled_curve_wrong_for_both": p170}}
    if "--json" in sys.argv:
        p = Path(sys.argv[sys.argv.index("--json") + 1])
        p.write_text(json.dumps(out, indent=1))
        print(f"\n  wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
