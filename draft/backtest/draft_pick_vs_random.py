#!/usr/bin/env python3
# TERRITORY: A
"""DECISION-NULL GRADING, THIRD DECISION TYPE: THE DRAFT PICK ITSELF.

`GRADING-POLICY.md`. This is the null the policy's own table still listed as
*proposed*, and E was right that it is the one that matters most:

    THE DECISION  at pick N, an owner takes player X off the board.
    THE NULL      a random player still AVAILABLE at pick N.
    THE MARGIN    the season points that pick actually delivered.

WHY THIS ONE UNBLOCKS A HEADLINE. `engine_seat_replay.json`'s estimand reads,
verbatim, "mean engine-minus-owner season total" -- and neither it nor
`replay_league_table.json` contains the string `random` or `control`. That is
engine-versus-owners: the comparison GRADING-POLICY retired, because at our
skill spread it carries 12% power and cannot converge. Its outputs (-188.35,
"beats 0 of 10 owners", -9.4) are quoted in 13 markdown files including
CLAUDE.md. Replacing the yardstick is the only way those numbers become
evidence rather than arithmetic.

WHAT "AVAILABLE" MEANS, RECONSTRUCTED RATHER THAN ASSUMED. Availability at pick
N is every player not taken in picks 1..N-1 and not held as a keeper. It is
derived from the draft's own pick list, never from a season-end roster, because
a season-end view would let the null take players who were gone by then and
make every real pick look worse than it was.

KEEPER PICKS ARE EXCLUDED. A keeper is not a choice made at that pick; grading
it against a board of available players would score a decision nobody made.

TWO NULLS, REPORTED SEPARATELY, because they answer different questions:
  ANY      uniform over every available player -- "did you beat a coin?"
  SAME-POS uniform over available players at the SAME position -- this holds
           positional strategy fixed and isolates PLAYER SELECTION, which is
           the harder and more interesting question.

CONTROLS (GRADING-POLICY §3), both drawn INDEPENDENTLY of the null sample and
both gating the exit code. The known-negative's band is DERIVED from its own
sample size (1.96/sqrt(12n)) rather than pinned -- a hardcoded +-0.08 was
3.3-3.9x looser than the null it guards, which E caught in the two graders
that shipped before this one (register 194).

Run: python3 draft/backtest/draft_pick_vs_random.py
"""
from __future__ import annotations
import json, random, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
OUT  = ROOT / "draft" / "backtest" / "draft_pick_vs_random.json"

N_DRAWS = 400
SEED    = 20260821


def _store_path(season_year):
    """The one place this module names the weekly store, so `season_totals` and
    the skip-reason below cannot drift apart about which file they mean."""
    return ROOT / "draft" / "backtest" / ("nflverse_weekly_points_%s.json" % season_year)


def skip_reason(season_year):
    """WHY a season could not be valued — printed, so the line is true.

    `no_store` used to be the only reason and the report said so. Register 349
    gave `season_totals` two more (a schedule of zeroes, a store that marks
    itself incomplete), and a report that still said "for want of a store" would
    be stating the one cause that had NOT happened.
    """
    f = _store_path(season_year)
    if not f.exists():
        return "no weekly-points store"
    doc = json.loads(f.read_text())
    cov = (doc.get("coverage") or {}).get(str(season_year)) or {}
    if cov.get("complete") is False:
        miss = cov.get("missing")
        return ("store marks the season INCOMPLETE"
                + (" (missing weeks %s)" % miss if miss else ""))
    return "store present but NOTHING SCORED — a schedule, not a season"


def season_totals(season_year):
    """player_id -> total fantasy points that season, from the nflverse store so
    the pool covers EVERY player, not only the ones somebody rostered.

    Returns None when the season cannot be VALUED, which is not the same as the
    file being absent. Register 349.

    ⚠️ THIS FUNCTION WAS PROTECTED BY AN ACCIDENT AND THE ACCIDENT HAS AN EXPIRY
    DATE. Register 340 ① recorded it: on 2026-08-25 this study was the only one
    of the three decision-null graders that stayed clean through the unplayed
    season, and it stayed clean solely because `nflverse_weekly_points_2026.json`
    DOES NOT EXIST — `f.exists()` was False and the season was skipped. That is
    a different store from `league_history`, which is why the zero-schedule never
    reached here. **The moment C captures 2026 weekly points, the guard is gone.**

    Two ways it goes wrong then, and the old `if not tot` caught neither:

      * A SCHEDULE OF ZEROES. If the store is created before games are played,
        `tot` is a dict of 0.0 — non-empty, so truthy. Every 2026 pick would be
        valued at nothing, every alternative too, and every percentile would land
        at ~0.5 by construction: the exact shape that broke `start_sit` (340) and
        collapsed its oracle control to 0.873.
      * A PARTIAL SEASON. Week 1 captured, weeks 2-18 empty. `tot` is real and
        non-zero, so no zero-check can see it — but this study values a pick by
        SEASON total, and pooling a one-week 2026 with three seventeen-week
        seasons compares picks against incomparable denominators.

    So the store's OWN statement is used for the second, rather than a threshold
    invented here: every committed store carries `coverage.<year>.complete`, and
    all five say True (verified before relying on it). A store without the key
    falls back to the zero-check alone rather than being refused, because a
    missing field is not evidence of an incomplete season.
    """
    f = _store_path(season_year)
    if not f.exists():
        return None
    doc = json.loads(f.read_text())
    tot = {}
    for wk in (doc.get("weeks") or []):
        for pid, v in (wk.get("points") or {}).items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
    if not any(tot.values()):
        return None                     # a schedule, not a season
    cov = (doc.get("coverage") or {}).get(str(season_year)) or {}
    if cov and cov.get("complete") is False:
        return None                     # the store says so itself
    return tot


def run():
    hist = json.loads(HIST.read_text())
    rng = random.Random(SEED)
    rows, skipped, no_store = [], 0, []
    ctl_rand, ctl_best = [], []

    for season in hist["seasons"]:
        year = season["season"]
        tot = season_totals(year)
        if not tot:
            no_store.append("%s (%s)" % (year, skip_reason(year))); continue
        owners = {}
        for rid, o in (season.get("owners") or {}).items():
            try: rid_i = int(rid)
            except Exception: rid_i = rid
            owners[rid_i] = (o or {}).get("display_name") or ("roster_%s" % rid)
        for dr in (season.get("drafts") or []):
            picks = sorted((dr.get("picks") or []), key=lambda p: p.get("pick_no") or 0)
            if not picks:
                continue
            keepers = {str(p.get("player_id")) for p in picks if p.get("is_keeper")}
            taken = set(keepers)
            for pk in picks:
                pid = str(pk.get("player_id"))
                if pk.get("is_keeper"):
                    taken.add(pid); continue
                # the pool AS IT STOOD at this pick
                pool = [q for q in tot if q not in taken]
                taken.add(pid)
                if pid not in tot or len(pool) < 20:
                    skipped += 1; continue
                actual = tot[pid]
                draws = [tot[rng.choice(pool)] for _ in range(N_DRAWS)]
                below = sum(1 for d in draws if d < actual)
                ties = sum(1 for d in draws if d == actual)
                pct = (below + 0.5 * ties) / len(draws)
                best = max(tot[q] for q in pool)
                rows.append({
                    "season": year, "pick_no": pk.get("pick_no"), "round": pk.get("round"),
                    "owner": owners.get(pk.get("roster_id"), "roster_%s" % pk.get("roster_id")),
                    "pid": pid, "actual": round(actual, 2), "pct": round(pct, 4),
                    "best_available": round(best, 2), "left": round(best - actual, 2),
                    "pool": len(pool),
                })
                # CONTROLS — independent draws, never sampled from `draws`
                r = tot[rng.choice(pool)]
                b1 = sum(1 for d in draws if d < r); t1 = sum(1 for d in draws if d == r)
                ctl_rand.append((b1 + 0.5 * t1) / len(draws))
                b2 = sum(1 for d in draws if d < best); t2 = sum(1 for d in draws if d == best)
                ctl_best.append((b2 + 0.5 * t2) / len(draws))
    return rows, ctl_rand, ctl_best, skipped, no_store


def main():
    rows, ctl_rand, ctl_best, skipped, no_store = run()
    if not rows:
        print("NO GRADED PICKS — refusing to print a statistic. skipped=%d, seasons"
              " without a points store: %s" % (skipped, no_store))
        return 2
    n = len(rows)
    mean_pct = statistics.fmean(r["pct"] for r in rows)
    half = 1.96 * (1.0 / 12.0) ** 0.5 / (n ** 0.5)
    cr, cb = statistics.fmean(ctl_rand), statistics.fmean(ctl_best)
    ctl_half = 1.96 * (1.0 / 12.0) ** 0.5 / (len(ctl_rand) ** 0.5)
    neg_ok = abs(cr - 0.5) <= ctl_half
    pos_ok = cb > 0.90

    print("\n  THE DRAFT PICK ITSELF, vs a random AVAILABLE player at that pick")
    print("  value = season fantasy points the pick actually delivered\n")
    print("  CONTROLS (GRADING-POLICY §3 — band DERIVED, not pinned)")
    print("    known-negative  random available  %.3f  (band ±%.4f from n=%d)  %s"
          % (cr, ctl_half, len(ctl_rand), "ok" if neg_ok else "⛔ FAILED"))
    print("    known-positive  best available    %.3f  %s" % (cb, "ok" if pos_ok else "⛔ FAILED"))
    if no_store:
        print("\n  ⚠️ seasons SKIPPED for want of a weekly-points store: %s" % no_store)
    print("\n  picks graded: %d   (skipped %d)" % (n, skipped))
    print("  MEAN PERCENTILE vs random: %.4f    null 95%%: [%.4f, %.4f]"
          % (mean_pct, 0.5 - half, 0.5 + half))
    print("  verdict: %s" % ("SKILL — above the null band" if mean_pct > 0.5 + half
                             else ("BELOW the band" if mean_pct < 0.5 - half
                                   else "inside the null band — not distinguishable from chance")))
    per = {}
    for r in rows:
        per.setdefault(r["owner"], []).append(r["pct"])
    print("\n    owner                    n   mean pct  ±SE")
    for o, v in sorted(per.items(), key=lambda kv: -statistics.fmean(kv[1])):
        se = statistics.pstdev(v) / (len(v) ** 0.5) if len(v) > 1 else float("nan")
        print("    %-22s %4d   %.3f  %.3f" % (o, len(v), statistics.fmean(v), se))
    print("\n  ⚠️ ranks are NOT findings — adjacent owners sit inside one SE (policy rule 1)")
    # by round, because a first-round pick and a 15th are not the same decision
    byr = {}
    for r in rows:
        byr.setdefault(r["round"], []).append(r["pct"])
    print("\n    round   n   mean pct")
    for rd in sorted(k for k in byr if k is not None):
        print("    %5s %4d   %.3f" % (rd, len(byr[rd]), statistics.fmean(byr[rd])))
    OUT.write_text(json.dumps({
        "_territory": "TERRITORY: A — draft/backtest/draft_pick_vs_random.py",
        "_what": "Decision-null grading of the draft pick: season points delivered vs a random AVAILABLE player at that pick.",
        "_supersedes": "the engine-minus-owner comparison in engine_seat_replay.json / replay_league_table.json, whose estimand carries no null (GRADING-POLICY).",
        "n_picks": n, "mean_percentile": round(mean_pct, 4),
        "null_95": [round(0.5 - half, 4), round(0.5 + half, 4)],
        "controls": {"random_available": round(cr, 4), "best_available": round(cb, 4),
                     "known_negative_band_half_width": round(ctl_half, 4),
                     "band_derived_from_n": len(ctl_rand)},
        "seasons_without_points_store": no_store,
        "n_draws": N_DRAWS, "seed": SEED, "skipped": skipped,
        "by_owner": {o: {"n": len(v), "mean_pct": round(statistics.fmean(v), 4)} for o, v in per.items()},
        "by_round": {str(k): {"n": len(v), "mean_pct": round(statistics.fmean(v), 4)} for k, v in byr.items() if k is not None},
    }, indent=1) + "\n")
    print("\n  wrote %s" % OUT.relative_to(ROOT))
    if not (neg_ok and pos_ok):
        print("\n  ⛔ REFUSING: a control failed, so the number above is not evidence.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
