#!/usr/bin/env python3
# TERRITORY: A
"""DECISION-NULL GRADING, FOURTH DECISION TYPE: THE DROP.

`GRADING-POLICY.md`. Every add off the wire has a matching cut, and until now
we graded only half of that transaction:

    THE DECISION  an owner drops player X from his own roster in week W to
                  make room for a claim.
    THE NULL      a random OTHER player he actually held that week — the legal
                  alternatives he really had, not the league-wide pool.
    THE MARGIN    rest-of-season points he handed away, against what the
                  median alternative cut would have cost him.

WHY THIS EXISTS, AND WHY IT IS NOT OPTIONAL. `waiver_vs_random.py` grades
1,085 adds and says nothing about the cut that paid for them; 1,026 of those
transactions carry a drop and NONE of them was graded. It is not a small half
either — three days ago the live wire told Cory to **drop Ja'Marr Chase**
(register 277: keepers priced at proj_mean null, so the best player he owned
was always the cheapest). A tool that advises on a decision nobody grades is
exactly the shape that defect lived in.

⚠️ THE DIRECTION IS INVERTED RELATIVE TO EVERY OTHER GRADER, AND GETTING IT
BACKWARDS WOULD SILENTLY REPORT THE OPPOSITE CONCLUSION. For an add, MORE
rest-of-season value is better. For a drop, LESS is better — you want to have
cut the man who went on to score least. So the percentile here is the fraction
of alternatives that would have cost you MORE, and a score near 1.0 means "you
cut the right guy". The controls below are what stop that sign from flipping
unnoticed.

WHAT IS GRADED. Only `status == "complete"` transactions of type `waiver` or
`free_agent` that carry a `drops` entry. The dropped player must have been on
that roster in that week and must carry points somewhere in the season, or the
comparison has no currency.

VALUE = points from the week of the drop THROUGH the end of that season, the
same window `waiver_vs_random.py` uses, so the two halves of one transaction
are measured on one clock.

CONTROLS (GRADING-POLICY §3 — both run every time and gate the exit code):
  known-negative  an owner dropping a RANDOM man off his own bench must land
                  at the null's centre (~0.5). Drawn INDEPENDENTLY of the null
                  sample, never resampled from it — the start/sit grader made
                  exactly that mistake and the external auditor caught it.
  known-positive  an owner dropping the man who went on to score LEAST must
                  land near 1.0. If that agent does not score high, the sign is
                  backwards and every number below means its own opposite.

Run: python3 draft/backtest/drop_vs_random.py
"""
from __future__ import annotations
import json, random, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
POSN = ROOT / "draft" / "data" / "player_positions.json"
OUT = ROOT / "draft" / "backtest" / "drop_vs_random.json"

N_DRAWS = 300
SEED = 20260824
MIN_POOL = 5      # below this a roster is not a set of alternatives; refuse


def season_points(season):
    """player_id -> {week -> points}, from the league's own weekly entries."""
    pts = {}
    for wk, entries in (season.get("weeks") or {}).items():
        w = int(wk)
        for e in entries:
            for pid, v in (e.get("players_points") or {}).items():
                pts.setdefault(pid, {})[w] = float(v)
    return pts


def _entry(season, week, roster_id):
    for e in (season.get("weeks") or {}).get(str(week), []):
        if str(e.get("roster_id")) == str(roster_id):
            return list(e.get("players") or [])
    return []


def roster_before_drop(season, week, roster_id, dropped_pid):
    """The players THIS owner held WHEN HE DECIDED — the real alternative set.

    ⚠️ THE WEEKLY SNAPSHOT IS TAKEN AFTER TRANSACTIONS SETTLE, and the first
    version of this grader did not know that. Looking the dropped player up in
    week W's own roster failed for 437 of 752 drops, because by the time that
    snapshot was written he had already been cut. The grader skipped them.

    THAT IS NOT A RANDOM LOSS, which is the whole reason it had to be chased:
    it silently kept only the drops where the snapshot happened to lag, and it
    showed up exactly the way GRADING-POLICY rule 4 says it does — a ragged n
    column, Cory on 25 against another owner's 52.

    The alternatives a man had are the roster as it stood BEFORE the cut, so
    week W-1 is the authority and week W is the fallback for a week-1 drop.
    Recovers 676 of 752 (was 315). Reconstructed per-week rather than from a
    season-end snapshot: a roster he had not built yet cannot be an alternative
    he declined."""
    prev = _entry(season, week - 1, roster_id)
    if dropped_pid in prev:
        return prev
    cur = _entry(season, week, roster_id)
    if dropped_pid in cur:
        return cur
    # He is on neither, so we cannot say what he was chosen over. Refused, and
    # counted — never quietly folded into the graded set.
    return []


def ros_value(pts_by_week, pid, from_week, last_week):
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
            try:
                rid_i = int(rid)
            except Exception:
                rid_i = rid
            owners[rid_i] = (o or {}).get("display_name") or ("roster_%s" % rid)

        for wk, txns in (season.get("transactions") or {}).items():
            week = int(wk)
            if str(week) not in weeks:
                skipped += len(txns or [])
                continue
            for t in (txns or []):
                if t.get("status") != "complete":
                    continue
                if t.get("type") not in ("waiver", "free_agent"):
                    continue
                for pid, rid in (t.get("drops") or {}).items():
                    held = roster_before_drop(season, week, rid, pid)
                    if not held:
                        # He cannot have declined to cut a man he did not hold.
                        skipped += 1
                        continue
                    pool = [q for q in held if q != pid and (pts.get(q) or {})]
                    if len(pool) < MIN_POOL:
                        skipped += 1
                        continue
                    pool_sizes.append(len(pool))

                    actual = ros_value(pts, pid, week, last_week)
                    draws = [ros_value(pts, rng.choice(pool), week, last_week)
                             for _ in range(N_DRAWS)]
                    # INVERTED ON PURPOSE: a GOOD drop is one where the
                    # alternatives would have cost MORE than what you cut.
                    above = sum(1 for d in draws if d > actual)
                    ties = sum(1 for d in draws if d == actual)
                    pct = (above + 0.5 * ties) / len(draws)
                    worst = min(ros_value(pts, q, week, last_week) for q in pool)
                    rows.append({
                        "season": season["season"], "week": week,
                        "owner": owners.get(rid, "roster_%s" % rid),
                        "pos": pos.get(pid), "pid": pid, "pool": len(pool),
                        "dropped_ros": actual, "pct": round(pct, 4),
                        "cheapest_cut_ros": worst,
                        # points handed away versus the best cut available
                        "cost": round(actual - worst, 2),
                    })
                    # CONTROLS — drawn independently of `draws`
                    r = ros_value(pts, rng.choice(pool), week, last_week)
                    a2 = sum(1 for d in draws if d > r)
                    t2 = sum(1 for d in draws if d == r)
                    ctl_rand.append((a2 + 0.5 * t2) / len(draws))
                    a3 = sum(1 for d in draws if d > worst)
                    t3 = sum(1 for d in draws if d == worst)
                    ctl_best.append((a3 + 0.5 * t3) / len(draws))
    return rows, ctl_rand, ctl_best, skipped, pool_sizes


def main():
    rows, ctl_rand, ctl_best, skipped, pool_sizes = run()
    if not rows:
        print("NO USABLE DROPS — refusing to print a statistic. skipped=%d" % skipped)
        return 2
    n = len(rows)
    mean_pct = statistics.fmean(r["pct"] for r in rows)
    half = 1.96 * (1.0 / 12.0) ** 0.5 / (n ** 0.5)
    cr = statistics.fmean(ctl_rand)
    cb = statistics.fmean(ctl_best)
    ctl_half = (1.96 * (1.0 / 12.0) ** 0.5 / (len(ctl_rand) ** 0.5)) if ctl_rand else 1.0
    neg_ok = abs(cr - 0.5) <= ctl_half
    pos_ok = cb > 0.90

    print("\n  THE DROP vs A RANDOM MAN OFF YOUR OWN ROSTER")
    print("  value = points the dropped player produced from that week to season end")
    print("  HIGHER percentile = you cut the right guy (direction is inverted vs the other graders)\n")
    print("  CONTROLS (GRADING-POLICY §3 — both must pass)")
    print("    known-negative  random own player  %.3f   (band ±%.4f, derived from n=%d)   %s"
          % (cr, ctl_half, len(ctl_rand), "ok" if neg_ok else "⛔ FAILED"))
    print("    known-positive  cut the least-scoring man   %.3f   %s"
          % (cb, "ok" if pos_ok else "⛔ FAILED — the SIGN IS BACKWARDS"))
    print("\n  drops graded: %d   (skipped %d)   median roster pool: %d"
          % (n, skipped, statistics.median(pool_sizes)))
    print("  MEAN PERCENTILE vs random: %.4f    null 95%%: [%.4f, %.4f]"
          % (mean_pct, 0.5 - half, 0.5 + half))
    print("  verdict: %s" % ("SKILL — above the null band" if mean_pct > 0.5 + half
                             else ("BELOW the band — worse than dropping at random"
                                   if mean_pct < 0.5 - half
                                   else "inside the null band — not distinguishable from chance")))

    per, cost = {}, {}
    for r in rows:
        per.setdefault(r["owner"], []).append(r["pct"])
        cost.setdefault(r["owner"], []).append(r["cost"])
    print("\n  owner                     n    pct    ±SE    pts handed away / drop")
    for o in sorted(per, key=lambda k: -statistics.fmean(per[k])):
        v = per[o]
        se = (statistics.pstdev(v) / (len(v) ** 0.5)) if len(v) > 1 else 0.0
        print("    %-22s %3d  %.3f  %.3f   %8.2f"
              % (o, len(v), statistics.fmean(v), se, statistics.fmean(cost[o])))
    print("\n  ⚠️ ranks are NOT findings — adjacent owners sit inside one SE (policy rule 1)")
    print("  league mean points handed away per drop: %.2f"
          % statistics.fmean(r["cost"] for r in rows))

    OUT.write_text(json.dumps({
        "_territory": "TERRITORY: A — draft/backtest/drop_vs_random.py",
        "_what": "Decision-null grading of the DROP: rest-of-season points the "
                 "cut player went on to score, against a random other man on "
                 "the same roster that week. Higher = better cut.",
        "_direction": "INVERTED vs the add/pick/start-sit graders on purpose — "
                      "for a drop, LESS rest-of-season value is the good "
                      "outcome. The known-positive control is what pins the sign.",
        "n_drops": n, "mean_percentile": round(mean_pct, 4),
        "null_95": [round(0.5 - half, 4), round(0.5 + half, 4)],
        "controls": {
            "random_own_player": round(cr, 4),
            "cut_the_least_scoring": round(cb, 4),
            "known_negative_band_half_width": round(ctl_half, 4),
            "band_derived_from_n": len(ctl_rand),
        },
        "median_pool_size": statistics.median(pool_sizes),
        "n_draws": N_DRAWS, "seed": SEED, "skipped": skipped,
        "mean_points_handed_away_per_drop": round(
            statistics.fmean(r["cost"] for r in rows), 2),
        "by_owner": {o: {"n": len(per[o]),
                         "mean_pct": round(statistics.fmean(per[o]), 4),
                         "mean_cost": round(statistics.fmean(cost[o]), 2)}
                     for o in per},
    }, indent=2) + "\n")
    print("\n  wrote %s" % OUT.relative_to(ROOT))
    return 0 if (neg_ok and pos_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
