#!/usr/bin/env python3
# TERRITORY: A
"""FLEX OWNERSHIP AND WHICH POSITION IS ACTUALLY SCARCE.

Prereg: draft/FLEX-AND-SCARCITY-PREREG-2026-08-19.md (P167, P168, P169),
committed first.

Cory: "each team uses 1 RB on average but 2-3 WRs that get real points" and
"why you normally dont have RB in flex. almost always a WR".

The corrected-wire run drafts RB 3.94 / WR 3.55. Cory says receivers are the
scarcer resource. The model says backs are, because the RB wire sits 46 points
below the WR wire. That gap is only scarcity if the RB curve is STEEPER -- if
receivers simply score more in this scoring system, the model is reading a level
offset as a shortage.

REPORT ONLY. Changes no weight, curve or wire level.

Run: python3 draft/backtest/flex_and_scarcity.py [--json <path>]
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
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
EXPECTED_STARTERS = 9

# base (non-flex) slots, read from the league rather than assumed
STARTERS = (BOARD.get("league") or {}).get("starters") or {}
BASE = {p: int(STARTERS.get(p, 0)) for p in POSITIONS}
FLEX_SLOTS = int(STARTERS.get("FLEX", 0))

# the published wire levels this run must reproduce (known-positive control)
PUBLISHED = {"QB": (17, 322.9), "RB": (48, 78.4), "WR": (53, 124.8),
             "TE": (15, 130.4), "K": (11, 128.6), "DEF": (11, 100.0)}


def pos_of(pid):
    v = POS_OF.get(str(pid))
    return v.get("position") if isinstance(v, dict) else v


def ranked(q):
    """proj_mean, descending -- the SAME pool and field model_diagnostics prices."""
    v = [(float(p["proj_mean"]), p.get("name") or p.get("player_name") or "?")
         for p in BOARD["players"]
         if p.get("position") == q and p.get("proj_mean") is not None]
    v.sort(key=lambda t: -t[0])
    return v


def main() -> int:
    # ---------- flex ownership, counted from real lineups ----------
    # per team-season: how often each position filled the flex slot
    per_ts = collections.defaultdict(lambda: collections.Counter())  # (yr,roster) -> pos counts
    per_ts_weeks = collections.Counter()
    pooled = collections.Counter()
    pooled_weeks = 0
    bad_weeks = 0

    for season in HIST["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        yr = str(season["season"])
        for wk, rows in weeks.items():
            for r in rows:
                stt = [str(x) for x in (r.get("starters") or [])]
                if len(stt) != EXPECTED_STARTERS:
                    bad_weeks += 1
                    continue
                counts = collections.Counter()
                for pid in stt:
                    p = pos_of(pid)
                    if p in POSITIONS:
                        counts[p] += 1
                # the flex is whatever exceeds the base allocation
                over = {p: counts[p] - BASE.get(p, 0) for p in ("RB", "WR", "TE")}
                if sum(max(0, v) for v in over.values()) != FLEX_SLOTS:
                    bad_weeks += 1
                    continue
                key = (yr, r["roster_id"])
                pooled_weeks += 1
                per_ts_weeks[key] += 1
                for p, v in over.items():
                    if v > 0:
                        pooled[p] += v
                        per_ts[key][p] += v

    pooled_share = {p: pooled[p] / max(1, pooled_weeks) for p in ("RB", "WR", "TE")}
    ts_wr_share = [per_ts[k]["WR"] / per_ts_weeks[k] for k in sorted(per_ts)
                   if per_ts_weeks[k] >= 5]
    sd_wr = statistics.pstdev(ts_wr_share) if len(ts_wr_share) > 1 else 0.0

    # ---------- the projection curves ----------
    curves = {q: ranked(q) for q in POSITIONS}

    def at(q, rank):
        v = curves[q]
        return v[rank - 1] if 0 < rank <= len(v) else (None, None)

    # demand rank = 10 teams x measured starters/week (from measured_need_curve C2)
    STARTERS_PW = {"QB": 1.000, "RB": 2.417, "WR": 2.556, "TE": 1.017,
                   "K": 0.996, "DEF": 0.996}
    demand = {q: max(1, round(10 * STARTERS_PW[q])) for q in POSITIONS}

    drops = {}
    for q in POSITIONS:
        dr, wr_rank = demand[q], PUBLISHED[q][0]
        hi, _ = at(q, dr)
        lo, _ = at(q, wr_rank)
        drops[q] = {"demand_rank": dr, "proj_at_demand": round(hi, 1) if hi else None,
                    "wire_rank": wr_rank, "proj_at_wire": round(lo, 1) if lo else None,
                    "drop": round(hi - lo, 1) if (hi and lo) else None,
                    "drop_per_rank": round((hi - lo) / (wr_rank - dr), 2)
                                     if (hi and lo and wr_rank > dr) else None}

    # level offset: median of the top 36 at RB vs WR
    med36 = {q: round(statistics.median([x[0] for x in curves[q][:36]]), 1)
             for q in ("RB", "WR")}
    offset = round(med36["WR"] - med36["RB"], 1)

    # ---------- controls ----------
    ctl = {}
    repro = {}
    ok_repro = True
    for q, (rank, want) in PUBLISHED.items():
        got, name = at(q, rank)
        good = got is not None and abs(got - want) < 0.05
        ok_repro = ok_repro and good
        repro[q] = {"rank": rank, "published": want,
                    "got": round(got, 1) if got is not None else None,
                    "player": name, "ok": good}
    ctl["C1_known_positive_reproduces_published_wire"] = {
        "ok": ok_repro, "detail": repro,
        "why": "rule 3e -- if this probe cannot reproduce the six wire levels the "
               "model actually prices, it is reading a different pool and nothing "
               "else it prints counts"}

    tot = sum(pooled_share.values())
    ctl["C2_flex_shares_sum_to_one"] = {
        "ok": abs(tot - 1.0) <= 0.02, "sum": round(tot, 4),
        "shares": {p: round(v, 4) for p, v in pooled_share.items()},
        "why": "there is exactly one flex slot; a lineup join that is wrong prints "
               "a plausible split that does not sum to one"}

    ctl["C3_thirty_team_seasons"] = {
        "ok": len(ts_wr_share) == 30, "got": len(ts_wr_share),
        "why": "ten owners, three completed seasons"}

    ctl["C4_pool_matches_the_model"] = {
        "ok": all(len(curves[q]) > 0 for q in POSITIONS),
        "pool_sizes": {q: len(curves[q]) for q in POSITIONS},
        "field": "proj_mean", "why": "same field and filter as model_diagnostics.js"}

    ctl["C5_weeks_used"] = {"ok": pooled_weeks > 400, "team_weeks": pooled_weeks,
                            "excluded": bad_weeks,
                            "why": "exclusions counted, not silently dropped"}

    all_ok = all(c["ok"] for c in ctl.values())

    # ---------- grades ----------
    p167 = sd_wr >= 0.20
    p168 = (drops["RB"]["drop"] or 0) > (drops["WR"]["drop"] or 0)
    p169 = offset >= 25

    out = {
        "_territory": "TERRITORY: A — draft/backtest/flex_and_scarcity.py",
        "_prereg": "draft/FLEX-AND-SCARCITY-PREREG-2026-08-19.md",
        "_note": "REPORT ONLY.",
        "league_base_slots": BASE, "flex_slots": FLEX_SLOTS,
        "controls": ctl, "controls_all_passed": all_ok,
        "flex_share_pooled": {p: round(v, 4) for p, v in pooled_share.items()},
        "flex_wr_share_by_team_season": {
            "n": len(ts_wr_share), "mean": round(statistics.mean(ts_wr_share), 4)
                if ts_wr_share else None,
            "sd": round(sd_wr, 4),
            "min": round(min(ts_wr_share), 4) if ts_wr_share else None,
            "max": round(max(ts_wr_share), 4) if ts_wr_share else None,
            "sorted": [round(x, 3) for x in sorted(ts_wr_share)]},
        "curve_drops": drops,
        "median_top36": med36, "wr_minus_rb_level_offset": offset,
        "grades": {"P167_flex_is_bimodal": p167,
                   "P168_rb_curve_is_steeper": p168,
                   "P169_level_offset_at_least_25": p169},
    }

    if not all_ok:
        print("⛔ CONTROLS FAILED — refusing to report numbers")
        for k, v in ctl.items():
            if not v["ok"]:
                print("  FAIL", k, json.dumps(v)[:400])
        return 1

    print("FLEX OWNERSHIP AND SCARCITY (P167/P168/P169)\n")
    for k, v in ctl.items():
        print(f"  OK  {k}")
    print(f"\n  who fills the flex, {pooled_weeks} team-weeks, 2023-2025")
    for p in ("WR", "RB", "TE"):
        print(f"    {p:<4} {pooled_share[p]*100:5.1f}%")
    print(f"\n  P167 — is that a league average or a roster archetype?")
    print(f"    per-team-season WR-flex share: n={len(ts_wr_share)} "
          f"mean {statistics.mean(ts_wr_share):.3f} sd {sd_wr:.3f} "
          f"min {min(ts_wr_share):.3f} max {max(ts_wr_share):.3f}")
    print(f"    P167 (sd >= 0.20): {'TRUE' if p167 else 'FALSE'}")
    print(f"\n  P168 — which curve is steeper between demand and the wire?")
    print(f"    {'pos':<5}{'demand':>8}{'proj':>9}{'wire':>7}{'proj':>9}{'drop':>9}{'per rank':>10}")
    for q in POSITIONS:
        d = drops[q]
        print(f"    {q:<5}{d['demand_rank']:>8}{d['proj_at_demand']:>9}"
              f"{d['wire_rank']:>7}{d['proj_at_wire']:>9}{d['drop']:>9}"
              f"{d['drop_per_rank']:>10}")
    print(f"    P168 (RB drop > WR drop): {'TRUE' if p168 else 'FALSE'}")
    print(f"\n  P169 — the level offset that has to cancel")
    print(f"    median of top 36:  RB {med36['RB']}   WR {med36['WR']}   "
          f"WR-RB = {offset}")
    print(f"    P169 (offset >= 25): {'TRUE' if p169 else 'FALSE'}")

    if "--json" in sys.argv:
        p = Path(sys.argv[sys.argv.index("--json") + 1])
        p.write_text(json.dumps(out, indent=1))
        print(f"\n  wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
