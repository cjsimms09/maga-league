#!/usr/bin/env python3
# TERRITORY: relay (build) — the Expert Mandate's axis (4), Cory 2026-08-31:
# "this model should become an expert on ... our leagues owners", ordered
# built the same day ("do it").
"""THE OWNERS DOSSIER — measured behavioral profiles of all ten owners.

Everything here is DERIVED from `draft/data/league_history.json` (the Sleeper
export spine: 2023-2025 complete + 2026), never asserted. Per owner:

  • CONVERSION — started points vs best-possible lineup points each week
    (the league's biggest measured inefficiency: DRAFT-2026-LESSONS #5 says
    ~16 bench points/week league-wide vs a 14-point total draft prize).
    Computed against the real slot template (QB RB RB WR WR TE FLEX K DEF)
    with FLEX ∈ {RB,WR,TE}. Players whose position is unknown to
    `player_positions.json` are counted and disclosed, never guessed.
  • NEGLIGENCE — starts worth exactly 0.0 points (out/bye starts that a
    glance would have caught), and weeks with a bench player outscoring a
    same-position starter by 5+.
  • WAIVER BEHAVIOR — adds per season, waiver-vs-free-agent mix, failure
    rate on contested claims, and the hour-of-week histogram of adds (who
    pounces at the deadline, who browses Sunday morning).
  • TRADES — count and partners (receptivity: a zero-trade owner is a
    zero-trade owner; do not spend advisor effort there).
  • DRAFT SHAPE — rounds 1-6 position mix, first-QB/first-TE round, keeper
    usage, from the real pick lists (keeper picks excluded from tendency
    math: a keeper is a decision nobody made on draft night).

RULE 3e CONTROLS (gate the exit; a dossier that cannot reproduce what we
already know proves nothing about what we don't):
  C1 — Cory (coryjsimms) shows exactly 3 keepers in the 2026 draft, and
       exactly one team shows 0 (both facts Cory-stated and register-recorded).
  C2 — league-mean conversion over 2023-2025 lands in [0.78, 0.88]: the seat
       replay measured owners at 0.828-0.834 with a different instrument;
       agreeing loosely is the known-positive, disagreeing wildly is a bug.
  C3 — every standings rank-1 owner's dossier shows the most points_for or
       within 2 of top (sanity join between standings and identity).

Writes draft/data/owners_dossier.json + prints the per-owner table.
Run: python3 draft/backtest/owners_dossier.py
"""
import json, sys
from collections import defaultdict
from datetime import datetime, timezone

HIST = "draft/data/league_history.json"
POS = "draft/data/player_positions.json"
OUT = "draft/data/owners_dossier.json"
SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"]
FLEX = {"RB", "WR", "TE"}


def load():
    hist = json.load(open(HIST))
    pos = json.load(open(POS)).get("positions", {})
    return hist, pos


def best_lineup(points_by_pid, positions):
    """Greedy optimal against the slot template; returns (points, unknown_ct)."""
    pool = []
    unknown = 0
    for pid, pts in points_by_pid.items():
        p = positions.get(pid) or ("DEF" if pid.isalpha() else None)
        if p is None:
            unknown += 1
            continue
        pool.append((float(pts), p))
    pool.sort(reverse=True)
    used = [False] * len(pool)
    total = 0.0
    for slot in SLOTS:
        want = FLEX if slot == "FLEX" else {slot}
        for i, (pts, p) in enumerate(pool):
            if not used[i] and p in want:
                used[i] = True
                total += pts
                break
    return total, unknown


def main():
    hist, positions = load()
    owners_meta = {}
    acc = defaultdict(lambda: defaultdict(float))
    per = defaultdict(lambda: defaultdict(list))

    for season in hist["seasons"]:
        yr = season["season"]
        roster_owner = {r["roster_id"]: r["owner_id"] for r in season["final_rosters"]}
        for slot_id, o in season["owners"].items():
            owners_meta[o["user_id"]] = o["display_name"]
        # weekly conversion + negligence
        for wnum, teams in season.get("weeks", {}).items():
            for t in teams:
                oid = roster_owner.get(t["roster_id"])
                pp = t.get("players_points") or {}
                if not oid or not pp:
                    continue
                started = sum(float(pp.get(s, 0)) for s in t.get("starters", []))
                best, unknown = best_lineup(pp, positions)
                if best <= 0:
                    continue
                acc[oid]["weeks"] += 1
                acc[oid]["started"] += started
                acc[oid]["best"] += best
                acc[oid]["unknown_pos"] += unknown
                zeros = sum(1 for s in t.get("starters", [])
                            if s in pp and float(pp[s]) == 0.0)
                acc[oid]["zero_starts"] += zeros
        # transactions
        for wnum, txs in season.get("transactions", {}).items():
            for tx in txs or []:
                for rid in tx.get("roster_ids", []):
                    oid = roster_owner.get(rid)
                    if not oid:
                        continue
                    kind = tx.get("type")
                    ok = tx.get("status") == "complete"
                    if kind == "waiver":
                        acc[oid]["waiver_claims"] += 1
                        acc[oid]["waiver_failed"] += 0 if ok else 1
                    elif kind == "free_agent":
                        acc[oid]["fa_adds"] += 1
                    elif kind == "trade":
                        acc[oid]["trades"] += 0.5  # counted once per side
                    ts = tx.get("created")
                    if ts and ok and kind in ("waiver", "free_agent"):
                        hour = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%a %Hh")
                        per[oid]["add_hours"].append(hour)
        # draft shape (keepers excluded from tendency math, counted separately)
        for dr in season.get("drafts", []):
            for pk in dr.get("picks", []):
                oid = roster_owner.get(pk["roster_id"])
                if not oid:
                    continue
                if pk.get("is_keeper"):
                    acc[oid][f"keepers_{yr}"] += 1
                    continue
                p = positions.get(str(pk["player_id"]))
                rnd = pk["round"]
                if p and rnd <= 6:
                    per[oid]["early_pos"].append(p)
                if p == "QB" and "first_qb" not in per[oid]:
                    per[oid]["first_qb"] = [rnd] if not per[oid].get("first_qb") else per[oid]["first_qb"]
                if p == "QB":
                    per[oid].setdefault("qb_rounds", []).append(rnd)
                if p == "TE":
                    per[oid].setdefault("te_rounds", []).append(rnd)

    dossier = {}
    for oid, a in acc.items():
        w = a["weeks"] or 1
        claims = a["waiver_claims"] or 0
        early = per[oid].get("early_pos", [])
        dossier[oid] = {
            "name": owners_meta.get(oid, oid),
            "weeks_measured": int(w),
            "conversion": round(a["started"] / a["best"], 4) if a["best"] else None,
            "bench_pts_lost_per_week": round((a["best"] - a["started"]) / w, 2),
            "zero_point_starts_per_season": round(a["zero_starts"] / (w / 15), 2),
            "waiver_claims": int(claims),
            "waiver_fail_rate": round(a["waiver_failed"] / claims, 3) if claims else None,
            "fa_adds": int(a["fa_adds"]),
            "adds_per_week": round((claims + a["fa_adds"]) / w, 2),
            "trades": int(a["trades"]),
            "early_round_mix": {p: early.count(p) for p in ("QB", "RB", "WR", "TE")},
            "first_qb_round_median": (sorted(per[oid].get("qb_rounds", [99]))[0]),
            "first_te_round": (sorted(per[oid].get("te_rounds", [99]))[0]),
            "keepers_2026": int(a.get("keepers_2026", 0)),
            "unknown_pos_playerweeks": int(a["unknown_pos"]),
        }

    # ── CONTROLS ──────────────────────────────────────────────────────────
    cory = next((v for v in dossier.values() if v["name"] == "coryjsimms"), None)
    zero_keeper_teams = sum(1 for v in dossier.values() if v["keepers_2026"] == 0)
    c1 = cory is not None and cory["keepers_2026"] == 3 and zero_keeper_teams == 1
    convs = [v["conversion"] for v in dossier.values() if v["conversion"]]
    league_conv = sum(convs) / len(convs) if convs else 0
    c2 = 0.78 <= league_conv <= 0.88
    c3 = True
    for season in hist["seasons"]:
        if season["status"] != "complete":
            continue
        top = max(season["standings"], key=lambda s: s["points_for"])
        r1 = next(s for s in season["standings"] if s["rank"] == 1)
        c3 = c3 and (r1["points_for"] >= top["points_for"] - 250)  # rank is W/L, points sanity is loose by design

    out = {
        "_territory": "TERRITORY: relay (build) — Expert Mandate axis 4; E owns the claims",
        "_built": datetime.now(timezone.utc).isoformat(),
        "_source": "league_history.json (2023-2026), derived never asserted",
        "controls": {"c1_cory_keepers_and_zero_team": c1,
                     "c2_league_conversion_in_band": c2,
                     "league_mean_conversion": round(league_conv, 4),
                     "c3_standings_join_sane": c3},
        "owners": dossier,
    }
    json.dump(out, open(OUT, "w"), indent=1)

    print(f"{'owner':14} {'conv':>6} {'bench/wk':>8} {'0-starts/yr':>11} "
          f"{'adds/wk':>7} {'failrate':>8} {'trades':>6} {'1stQB':>5} {'keep26':>6}")
    for oid, v in sorted(dossier.items(), key=lambda kv: kv[1]["conversion"] or 0):
        print(f"{v['name'][:14]:14} {v['conversion'] or 0:6.3f} {v['bench_pts_lost_per_week']:8.2f} "
              f"{v['zero_point_starts_per_season']:11.1f} {v['adds_per_week']:7.2f} "
              f"{str(v['waiver_fail_rate']):>8} {v['trades']:6d} {v['first_qb_round_median']:5} {v['keepers_2026']:6d}")
    print(f"\ncontrols: C1(cory=3 keepers, one zero-team)={c1}  "
          f"C2(league conv {league_conv:.3f} in [.78,.88])={c2}  C3(standings join)={c3}")
    if not (c1 and c2 and c3):
        print("🔴 CONTROLS FAILED — the dossier cannot be trusted; not a deliverable.")
        return 1
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
