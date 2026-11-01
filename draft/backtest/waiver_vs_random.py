#!/usr/bin/env python3
# TERRITORY: A
"""DECISION-NULL GRADING, SECOND DECISION TYPE: WAIVER / FREE-AGENT CLAIMS.

`GRADING-POLICY.md`. Same shape as start/sit, different decision:

    THE DECISION  an owner adds player X off the wire in week W.
    THE NULL      a random AVAILABLE player at X's position in week W --
                  available meaning on nobody's roster at that moment.
    THE MARGIN    rest-of-season points the add actually delivered, against
                  what the random alternative would have delivered.

WHY AVAILABILITY MUST BE RECONSTRUCTED, NOT ASSUMED. "Who was on the wire in
week 7 of 2024" is not stored anywhere. It is derived: every player on any
roster that week is unavailable, everyone else with points that season is
available. Getting this wrong in the generous direction (treating rostered
players as available) would let the null draft studs nobody could have had and
make every real claim look brilliant by comparison -- so the roster union is
taken from the SAME week's entries, never from a season-end snapshot.

WHAT IS GRADED. Only `status == "complete"` adds; failed waiver bids are not
decisions that happened. Both `waiver` and `free_agent` types count -- they are
the same decision under different contention. Trades are excluded: a trade is
not a draw from an available pool and needs its own null.

VALUE = points from the week of the add THROUGH the end of that season. A
waiver add is a bet on rest-of-season usefulness, so grading it on one week
would mistake a good process for a bad one whenever the player broke out late.

CONTROLS (GRADING-POLICY §3 -- both run every time and gate the exit code):
  known-negative  an agent adding a RANDOM available player must land at the
                  null's centre (~0.5). Drawn INDEPENDENTLY of the null sample,
                  never sampled from it -- the start/sit version made exactly
                  that mistake and the auditor caught it.
  known-positive  an agent adding the BEST available player must land at ~1.0.

Run: python3 draft/backtest/waiver_vs_random.py
"""
from __future__ import annotations
import json, random, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
POSN = ROOT / "draft" / "data" / "player_positions.json"
OUT  = ROOT / "draft" / "backtest" / "waiver_vs_random.json"

N_DRAWS = 300
SEED    = 20260821
MIN_POOL = 5          # below this the "pool" is not a pool; refuse rather than pretend

# ⛔ THE KNOWN-NEGATIVE CONTROL WAS A COIN FLIP, AND IT REDDENED THE WHOLE
# WEEKLY LEARNING LOOP FOR FIVE DAYS OVER NOISE (found 2026-11-01).
#
# The control asks "what does a RANDOM available player score on this same
# null?" and must land at 0.5. It used ONE random draw per claim. Measured
# across 8 seeds it sits at 0.5025 — UNBIASED, exactly as its construction
# implies, since r and the draws it is ranked against are i.i.d. from one pool
# — but with an sd of the mean of 0.0137 against a gate of ±0.0190. That is a
# nominal-95% gate failing 2 of 8 seeds, and on 2026-10-27 the shipped seed was
# one of them: `⛔ REFUSING: a control failed`, exit 1, and weekly-grade.yml
# red from week 7 onward. The headline it was guarding never moved — 0.7159
# with an sd of 0.0008 across those same seeds.
#
# TWO CAUSES, both fixed here:
#  1. ONE DRAW IS AN OPINION, NOT AN ESTIMATE. CTL_REPS averages R draws per
#     claim, dividing r's own variance — the dominant term — by R.
#  2. THE BAND ASSUMED A UNIFORM CONTROL. It used sd=sqrt(1/12)=0.2887 when the
#     measured per-claim sd is 0.2630, because ROS values are discrete with a
#     large atom at zero (most waiver adds never score again) so the mid-rank
#     piles up at 0.5. The band is now the control's OWN dispersion.
#
# ⚠️ AND A HYPOTHESIS THAT DIED ON MEASUREMENT, recorded so nobody re-runs it:
# the obvious story was clustering — 883 claims but only 58 (season, week)
# cells, so the i.i.d. SE should understate. A cluster-robust SE is SMALLER
# still (0.0075 vs 0.0089 i.i.d. vs 0.0097 assumed), i.e. the wrong direction.
# Every WITHIN-RUN estimator understates the true Monte-Carlo SE of 0.0137,
# which is why the band is now validated against a seed sweep rather than
# trusted from a formula. `test_decision_null_controls_are_calibrated.py`.
CTL_REPS = 25         # control draws averaged per claim; 1 was the defect


def season_points(season):
    """player_id -> {week:int -> points}, from the weekly entries themselves so
    the scoring is this league's own, not a re-derivation."""
    pts = {}
    for wk, entries in (season.get("weeks") or {}).items():
        w = int(wk)
        for e in entries:
            for pid, v in (e.get("players_points") or {}).items():
                pts.setdefault(pid, {})[w] = float(v)
    return pts


def rostered_in_week(season, week):
    """Everyone on ANY roster that week -- the unavailable set."""
    out = set()
    for e in (season.get("weeks") or {}).get(str(week), []):
        out.update(e.get("players") or [])
    return out


def ros_value(pts_by_week, pid, from_week, last_week):
    """Points the player actually produced from the add week to season end."""
    wk = pts_by_week.get(pid) or {}
    return round(sum(v for w, v in wk.items() if from_week <= w <= last_week), 2)


def run():
    hist = json.loads(HIST.read_text())
    pos = json.loads(POSN.read_text())["positions"]
    rng = random.Random(SEED)
    rows, skipped = [], 0
    ctl_rand, ctl_best = [], []
    pool_sizes = []

    for season in hist["seasons"]:
        weeks = season.get("weeks") or {}
        if not weeks:
            continue
        last_week = max(int(w) for w in weeks)
        pts = season_points(season)
        owners = {}
        for rid, o in (season.get("owners") or {}).items():
            try: rid_i = int(rid)
            except Exception: rid_i = rid
            owners[rid_i] = (o or {}).get("display_name") or ("roster_%s" % rid)

        for wk, txns in (season.get("transactions") or {}).items():
            week = int(wk)
            if str(week) not in weeks:
                skipped += len(txns); continue
            taken = rostered_in_week(season, week)
            for t in txns:
                if t.get("status") != "complete":
                    continue
                if t.get("type") not in ("waiver", "free_agent"):
                    continue
                for pid, rid in (t.get("adds") or {}).items():
                    p = pos.get(pid)
                    if p is None:
                        skipped += 1; continue
                    # the pool: same position, had a pulse this season, and NOT
                    # on anyone's roster in the week of the claim
                    pool = sorted(q for q, wkmap in pts.items()
                                  if q not in taken and pos.get(q) == p and wkmap)
                    if len(pool) < MIN_POOL:
                        skipped += 1; continue
                    pool_sizes.append(len(pool))
                    actual = ros_value(pts, pid, week, last_week)
                    draws = [ros_value(pts, rng.choice(pool), week, last_week)
                             for _ in range(N_DRAWS)]
                    below = sum(1 for d in draws if d < actual)
                    ties = sum(1 for d in draws if d == actual)
                    pct = (below + 0.5 * ties) / len(draws)
                    best = max(ros_value(pts, q, week, last_week) for q in pool)
                    rows.append({
                        "season": season["season"], "week": week,
                        "owner": owners.get(rid, "roster_%s" % rid),
                        "pos": p, "pid": pid, "pool": len(pool),
                        "actual_ros": actual, "pct": round(pct, 4),
                        "best_available_ros": best,
                        "left": round(best - actual, 2),
                    })
                    # CONTROLS — drawn independently of `draws`. CTL_REPS draws
                    # averaged, not one: see the note at CTL_REPS for why one
                    # was a coin flip that failed a nominal-95% gate 2 times in 8.
                    reps = []
                    for _ in range(CTL_REPS):
                        r = ros_value(pts, rng.choice(pool), week, last_week)
                        b2 = sum(1 for d in draws if d < r)
                        t2 = sum(1 for d in draws if d == r)
                        reps.append((b2 + 0.5 * t2) / len(draws))
                    ctl_rand.append(statistics.fmean(reps))
                    b3 = sum(1 for d in draws if d < best); t3 = sum(1 for d in draws if d == best)
                    ctl_best.append((b3 + 0.5 * t3) / len(draws))
    return rows, ctl_rand, ctl_best, skipped, pool_sizes


def main():
    rows, ctl_rand, ctl_best, skipped, pool_sizes = run()
    if not rows:
        print("NO USABLE CLAIMS — refusing to print a statistic. skipped=%d" % skipped)
        return 2
    n = len(rows)
    mean_pct = statistics.fmean(r["pct"] for r in rows)
    half = 1.96 * (1.0 / 12.0) ** 0.5 / (n ** 0.5)
    cr = statistics.fmean(ctl_rand)
    cb = statistics.fmean(ctl_best)
    # SAME DEFECT, 3.89x here (n=755): a hardcoded ±0.08 against a derived
    # half-width of 0.0206. See start_sit_vs_random.py's note. Derived from the
    # control's own sample size so it tightens with evidence.
    # The control's OWN measured dispersion, not a uniform assumption, and
    # widened by MC_ALLOWANCE because every within-run estimator was measured
    # to understate the true Monte-Carlo SE (see the CTL_REPS note).
    MC_ALLOWANCE = 1.5
    ctl_half = (1.96 * MC_ALLOWANCE * statistics.stdev(ctl_rand) / (len(ctl_rand) ** 0.5)
                ) if len(ctl_rand) > 1 else 1.0
    neg_ok = abs(cr - 0.5) <= ctl_half
    pos_ok = cb > 0.90

    print("\n  WAIVER / FREE-AGENT CLAIMS vs A RANDOM AVAILABLE PLAYER")
    print("  value = points the add produced from that week to season end\n")
    print("  CONTROLS (GRADING-POLICY §3 — both must pass)")
    print("    known-negative  random available   %.3f   (band ±%.4f, derived from n=%d)   %s"
          % (cr, ctl_half, len(ctl_rand), "ok" if neg_ok else "⛔ FAILED"))
    print("    known-positive  best available     %.3f   %s" % (cb, "ok" if pos_ok else "⛔ FAILED"))
    print("\n  claims graded: %d   (skipped %d)   median pool size: %d"
          % (n, skipped, statistics.median(pool_sizes)))
    print("  MEAN PERCENTILE vs random: %.4f    null 95%%: [%.4f, %.4f]"
          % (mean_pct, 0.5 - half, 0.5 + half))
    print("  verdict: %s" % ("SKILL — above the null band" if mean_pct > 0.5 + half
                             else ("BELOW the band — worse than random" if mean_pct < 0.5 - half
                                   else "inside the null band — not distinguishable from chance")))
    per, left = {}, {}
    for r in rows:
        per.setdefault(r["owner"], []).append(r["pct"])
        left.setdefault(r["owner"], []).append(r["left"])
    print("\n    owner                    n   mean pct  ±SE     ROS pts left on the wire")
    for o, v in sorted(per.items(), key=lambda kv: -statistics.fmean(kv[1])):
        se = (statistics.pstdev(v) / (len(v) ** 0.5)) if len(v) > 1 else float("nan")
        print("    %-22s %4d   %.3f  %.3f   %10.1f"
              % (o, len(v), statistics.fmean(v), se, statistics.fmean(left[o])))
    print("\n  ⚠️ ranks are NOT findings — adjacent owners sit inside one SE (policy rule 1)")
    OUT.write_text(json.dumps({
        "_territory": "TERRITORY: A — draft/backtest/waiver_vs_random.py",
        "_what": "Decision-null grading of waiver/FA claims: rest-of-season value vs a random AVAILABLE player at the same position that week.",
        "n_claims": n, "mean_percentile": round(mean_pct, 4),
        "null_95": [round(0.5 - half, 4), round(0.5 + half, 4)],
        "controls": {"random_available": round(cr, 4), "best_available": round(cb, 4),
                     "known_negative_band_half_width": round(ctl_half, 4),
                     "band_derived_from_n": len(ctl_rand)},
        "median_pool_size": statistics.median(pool_sizes),
        "n_draws": N_DRAWS, "seed": SEED, "skipped": skipped,
        "by_owner": {o: {"n": len(v), "mean_pct": round(statistics.fmean(v), 4),
                         "ros_pts_left": round(statistics.fmean(left[o]), 2)}
                     for o, v in per.items()},
    }, indent=1) + "\n")
    print("  wrote %s" % OUT.relative_to(ROOT))
    if not (neg_ok and pos_ok):
        print("\n  ⛔ REFUSING: a control failed, so the number above is not evidence.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
