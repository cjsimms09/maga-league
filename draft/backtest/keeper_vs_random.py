#!/usr/bin/env python3
# TERRITORY: A
"""DECISION-NULL GRADING, FIFTH DECISION TYPE: THE KEEPER.

`GRADING-POLICY.md`, register 289. The last named gap in `LEARNING-COVERAGE.md`
and the highest-stakes single decision Cory makes — his three 2026 keepers are
his three best players, at rounds 1, 2 and 3.

    THE DECISION  an owner keeps player X, and that keeper CONSUMES his pick
                  at slot N. He could have used that slot on the board.
    THE NULL      the players actually available at slot N — the same pool
                  `draft_pick_vs_random.py` builds, reconstructed from the
                  draft's own pick list.
    THE MARGIN    season fantasy points the keeper delivered, against what a
                  random available player at that slot delivered.

WHY THIS NULL AND NOT "A DIFFERENT KEEPER SET". The economics of a keeper are
not *"which of my men do I keep"* — they are *"is this man worth the pick he
costs."* The pick is what you actually surrender, and the board at that slot is
what you actually forgo. Using the SAME null as the pick grader also makes the
two directly comparable: keeping X at slot N and drafting at slot N are scored
on one yardstick, which is the comparison the decision really is.

WHY IT WAS UNGRADED UNTIL NOW. `draft_pick_vs_random.py:27` excludes keepers,
correctly, with the reason stated: *"A keeper is not a choice made at that
pick; grading it against a board of available players would score a decision
nobody made."* That is right about the PICK — nobody chose at pick 8 — but the
keeper decision itself then fell through every net we have.
`keeper_optimize.py` CHOOSES keepers; nothing scored the choice.

⚠️ TWO POOLS, BECAUSE THE LEAGUE RECORDED KEEPERS TWO DIFFERENT WAYS, and
this was nearly reported wrong. 2024 and 2025 put keepers INSIDE the 150-pick
main draft, so a keeper's pool is the board as it stood at the slot it
consumed. **2023 has a SEPARATE 30-pick keeper draft** alongside its 150-pick
main draft — so those keepers are scored against the pre-draft pool, which is
arguably the truer null for a decision made before the draft, but it is not
the identical null. Stated rather than blended silently.

⚠️ AND THE SEASON COUNT WAS WRONG IN MY OWN NOTES FIRST. I told Cory "43
gradeable, 2023 had no keepers" — read off `drafts[0]` alone, which is the
150-pick draft where 2023's keepers do not live. The real total is **73**
(2023: 30, 2024: 23, 2025: 20). Iterate every draft object in a season; the
first one is not the only one.

n IS STILL SMALL. Power comes from the number of decisions, and 73 is enough
to see a large effect, not enough to resolve a small one. A result inside the
band means WE CANNOT TELL, never "keepers are not skill".

⚠️ AND THE SET-LEVEL DECISION IS NOT WHAT THIS GRADES. An owner picks 0-3
together under one cost structure; this scores each keeper against its own
slot independently. That decomposition is defensible (each keeper really does
cost its own pick) but it cannot see an interaction — keeping two RBs when one
would do. Recorded as a limit, not papered over.

⚠️⚠️ AND THE HEADLINE THIS GRADER FIRST PRINTED WAS TRUE AND USELESS — read
the SECOND panel, not the first. Against a random available player the keepers
score 0.9082 with a null band of [0.4338, 0.5662], and that reads as a large
result until you look at the distribution it came from (Rule 3i): REAL DRAFT
PICKS SCORE 0.8554 ON THE SAME NULL, and they are flat at ~0.85 from round 1
to round 15. The pool is 570 players of whom 38% scored under 20 points all
season, so "beat a random name in the points store" is a floor test that
essentially every drafted player passes. It cannot be the answer to *is this
man worth the pick he costs*.

So this grader computes a SECOND, decision-relevant contrast and gates on it
too: THE KEEPER AGAINST WHAT A REAL PICK AT THAT ROUND ACTUALLY RETURNED,
taken from `draft_pick_vs_random.run()` itself so both sides are built by the
same pool reconstruction, the same 400 draws and the same percentile. That
contrast says +0.025, z=1.16 — NOT RESOLVED. In the unit that pays it is
+22.8 season points, about 1.3 a week, a point estimate with nothing behind
it. **We cannot show that keeping beats drafting at the same slot.** That is
the finding; 0.9082 was the arithmetic.

CONTROLS (GRADING-POLICY §3 — drawn INDEPENDENTLY of the null sample, ALL
FOUR gating the exit code, bands DERIVED from each control's own n):
  panel 1, vs random
    known-negative  keeping a RANDOM available player must land at ~0.5.
    known-positive  keeping the BEST available player must land near 1.0.
  panel 2, vs a real pick at that round — a contrast needs its own controls
  (Rule 3f), because a comparison that can resolve nothing and a comparison
  that resolves a true null print the same "NOT RESOLVED"
    known-negative  real R1-3 picks split in half against themselves must NOT
                    resolve (measured z=+1.08).
    known-positive  keepers against real R13-15 picks MUST resolve, or the
                    contrast has no power and its null result means nothing
                    (measured z=+3.11).

Run: python3 draft/backtest/keeper_vs_random.py
"""
from __future__ import annotations
import importlib.util, json, random, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
POSN = ROOT / "draft" / "data" / "player_positions.json"
OUT = ROOT / "draft" / "backtest" / "keeper_vs_random.json"

N_DRAWS = 400
SEED = 20260824
MIN_POOL = 20
KEEPER_ROUNDS = (1, 2, 3)   # the rounds keepers actually consume in this league
LATE_ROUNDS = (13, 14, 15)  # the known-positive end of the pick distribution


def pick_rows():
    """Real draft picks, scored by `draft_pick_vs_random.py`'s OWN run(), so the
    two sides of the contrast share one pool reconstruction, one draw count and
    one percentile definition. Imported by path rather than by package name —
    draft/backtest is not a package and a bare `import` would depend on cwd."""
    src = Path(__file__).with_name("draft_pick_vs_random.py")
    spec = importlib.util.spec_from_file_location("_dpvr", src)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.run()[0]


def contrast(a, b):
    """Two-sample difference in mean percentile. Returns (delta, half, z)."""
    if len(a) < 2 or len(b) < 2:
        return float("nan"), float("nan"), float("nan")
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    sa = statistics.pstdev(a) / (len(a) ** 0.5)
    sb = statistics.pstdev(b) / (len(b) ** 0.5)
    se = (sa * sa + sb * sb) ** 0.5
    d = ma - mb
    return d, 1.96 * se, (d / se if se else float("nan"))


def season_totals(year):
    """player_id -> season total, from the nflverse store so the pool covers
    EVERY player rather than only the ones somebody rostered."""
    f = ROOT / "draft" / "backtest" / ("nflverse_weekly_points_%s.json" % year)
    if not f.exists():
        return None
    tot = {}
    for wk in (json.loads(f.read_text()).get("weeks") or []):
        for pid, v in (wk.get("points") or {}).items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
    return tot


def run():
    hist = json.loads(HIST.read_text())
    pos = json.loads(POSN.read_text())["positions"]
    rng = random.Random(SEED)
    rows, skipped, no_store, drafts_without_keepers = [], 0, [], []
    ctl_rand, ctl_best = [], []

    for season in hist["seasons"]:
        year = season["season"]
        tot = season_totals(year)
        if not tot:
            no_store.append(year)
            continue
        owners = {}
        for rid, o in (season.get("owners") or {}).items():
            try:
                rid_i = int(rid)
            except Exception:
                rid_i = rid
            owners[rid_i] = (o or {}).get("display_name") or ("roster_%s" % rid)

        for dr in (season.get("drafts") or []):
            picks = sorted((dr.get("picks") or []), key=lambda p: p.get("pick_no") or 0)
            if not picks:
                continue
            if not any(p.get("is_keeper") for p in picks):
                # PER-DRAFT, NOT PER-SEASON — and the first cut printed it as
                # "seasons with no keepers at all: ['2023']", which is FALSE:
                # 2023's keepers live in a second, 30-pick draft object beside
                # its 150-pick main draft. A draft without keepers is ordinary;
                # a season without them is a finding, and the two must not
                # print the same sentence.
                drafts_without_keepers.append((year, len(picks)))
                continue
            # ALL keepers are off the board from the start — a keeper is not
            # available to anyone at any slot, including to the null.
            keepers = {str(p.get("player_id")) for p in picks if p.get("is_keeper")}
            taken = set(keepers)
            for pk in picks:
                pid = str(pk.get("player_id"))
                if not pk.get("is_keeper"):
                    taken.add(pid)
                    continue
                # The pool AS IT STOOD at the slot this keeper consumed.
                # `taken` already holds every keeper plus every player drafted
                # before this slot, so the null can never draw a man who was
                # gone — the same reconstruction the pick grader uses.
                pool = [q for q in tot if q not in taken]
                if pid not in tot or len(pool) < MIN_POOL:
                    skipped += 1
                    continue
                actual = tot[pid]
                draws = [tot[rng.choice(pool)] for _ in range(N_DRAWS)]
                below = sum(1 for d in draws if d < actual)
                ties = sum(1 for d in draws if d == actual)
                pct = (below + 0.5 * ties) / len(draws)
                best = max(tot[q] for q in pool)
                rows.append({
                    "season": year, "pick_no": pk.get("pick_no"),
                    "round": pk.get("round"),
                    "owner": owners.get(pk.get("roster_id"),
                                        "roster_%s" % pk.get("roster_id")),
                    "pid": pid, "pos": pos.get(pid),
                    "actual": round(actual, 2), "pct": round(pct, 4),
                    "best_available": round(best, 2),
                    "left": round(best - actual, 2), "pool": len(pool),
                })
                # CONTROLS — independent draws, never resampled from `draws`
                r = tot[rng.choice(pool)]
                b1 = sum(1 for d in draws if d < r)
                t1 = sum(1 for d in draws if d == r)
                ctl_rand.append((b1 + 0.5 * t1) / len(draws))
                b2 = sum(1 for d in draws if d < best)
                t2 = sum(1 for d in draws if d == best)
                ctl_best.append((b2 + 0.5 * t2) / len(draws))
    return rows, ctl_rand, ctl_best, skipped, no_store, drafts_without_keepers


def main():
    rows, ctl_rand, ctl_best, skipped, no_store, drafts_without_keepers = run()
    if not rows:
        print("NO GRADED KEEPERS — refusing to print a statistic. skipped=%d, "
              "seasons without a points store: %s, drafts with no keepers: %s"
              % (skipped, no_store, drafts_without_keepers))
        return 2
    n = len(rows)
    mean_pct = statistics.fmean(r["pct"] for r in rows)
    half = 1.96 * (1.0 / 12.0) ** 0.5 / (n ** 0.5)
    cr, cb = statistics.fmean(ctl_rand), statistics.fmean(ctl_best)
    ctl_half = 1.96 * (1.0 / 12.0) ** 0.5 / (len(ctl_rand) ** 0.5)
    neg_ok = abs(cr - 0.5) <= ctl_half
    pos_ok = cb > 0.90

    print("\n  THE KEEPER, vs a random player AVAILABLE at the slot it consumed")
    print("  value = season fantasy points the keeper actually delivered\n")
    print("  CONTROLS (GRADING-POLICY §3 — band DERIVED, not pinned)")
    print("    known-negative  random available  %.3f  (band ±%.4f from n=%d)  %s"
          % (cr, ctl_half, len(ctl_rand), "ok" if neg_ok else "⛔ FAILED"))
    print("    known-positive  best available    %.3f  %s"
          % (cb, "ok" if pos_ok else "⛔ FAILED"))
    print("\n  keepers graded: %d   (skipped %d)" % (n, skipped))
    if no_store:
        print("  seasons with no points store (cannot grade): %s" % no_store)
    for (yr, npicks) in drafts_without_keepers:
        print("  %s: one draft of %d picks carried no keepers (a season may have "
              "more than one draft object — 2023's keepers are in a second, "
              "30-pick draft)" % (yr, npicks))
    print("  MEAN PERCENTILE vs random: %.4f    null 95%%: [%.4f, %.4f]"
          % (mean_pct, 0.5 - half, 0.5 + half))
    verdict = ("SKILL — above the null band" if mean_pct > 0.5 + half
               else ("BELOW the band — the pick was worth more than the keeper"
                     if mean_pct < 0.5 - half
                     else "INSIDE the null band — WE CANNOT TELL at this n, "
                          "which is not the same as 'no skill'"))
    print("  verdict: %s" % verdict)

    print("\n  by round (a keeper's cost is its round)")
    by_r = {}
    for r in rows:
        by_r.setdefault(r["round"], []).append(r)
    for rd in sorted(by_r, key=lambda x: (x is None, x)):
        v = by_r[rd]
        se = (statistics.pstdev([x["pct"] for x in v]) / (len(v) ** 0.5)) if len(v) > 1 else 0.0
        print("    round %-4s n=%-3d  pct %.3f ±%.3f   mean pts %.1f"
              % (rd, len(v), statistics.fmean(x["pct"] for x in v), se,
                 statistics.fmean(x["actual"] for x in v)))
    print("\n  ⚠️ ranks and round-orderings are NOT findings — adjacent cells sit "
          "inside one SE (policy rule 1), and n is small on purpose-stated grounds")

    # ————— PANEL 2: THE CONTRAST THAT IS ACTUALLY THE DECISION —————
    # Panel 1 asks "did the keeper beat a random name". Real picks answer that
    # at 0.855 and are FLAT at ~0.85 from round 1 to round 15, so passing it
    # distinguishes nobody. The keeper decision is keeper-vs-the-board-at-that-
    # slot, and what the board at that slot actually returns is what real picks
    # at that round returned.
    prows = pick_rows()
    kp = [r["pct"] for r in rows if r["round"] in KEEPER_ROUNDS]
    pp = [r["pct"] for r in prows if r["round"] in KEEPER_ROUNDS]
    plate = [r["pct"] for r in prows if r["round"] in LATE_ROUNDS]

    # CONTROLS FOR THE CONTRAST — a comparison with no power and a comparison
    # that correctly finds nothing both print "NOT RESOLVED"; only these two
    # tell them apart. Shuffled on a FIXED seed so the split is reproducible.
    csplit = pp[:]
    random.Random(7).shuffle(csplit)
    _, _, z_neg = contrast(csplit[:len(csplit) // 2], csplit[len(csplit) // 2:])
    _, _, z_pos = contrast(kp, plate)
    c_neg_ok = abs(z_neg) <= 1.96      # halves of one population must NOT resolve
    c_pos_ok = abs(z_pos) > 1.96       # keepers vs last-round fliers MUST resolve

    d, half_d, z = contrast(kp, pp)
    kpts = statistics.fmean(r["actual"] for r in rows if r["round"] in KEEPER_ROUNDS)
    ppts = statistics.fmean(r["actual"] for r in prows if r["round"] in KEEPER_ROUNDS)

    print("\n  ══ IS THE KEEPER WORTH THE PICK IT COSTS? ══")
    print("  the null above is a random NAME; this null is a real PICK at that round\n")
    print("  CONTROLS FOR THIS CONTRAST (Rule 3f — no power and a true null print alike)")
    print("    known-negative  real R%s picks, split against themselves  z=%+.2f  %s"
          % ("-".join(str(x) for x in (KEEPER_ROUNDS[0], KEEPER_ROUNDS[-1])),
             z_neg, "ok (does not resolve)" if c_neg_ok else "⛔ FAILED — resolves a null"))
    print("    known-positive  keepers vs real R%d-%d picks                 z=%+.2f  %s"
          % (LATE_ROUNDS[0], LATE_ROUNDS[-1], z_pos,
             "ok (resolves)" if c_pos_ok else "⛔ FAILED — contrast has no power"))
    print("\n    keepers R1-3      %.3f  (n=%d)" % (statistics.fmean(kp), len(kp)))
    print("    real picks R1-3   %.3f  (n=%d)" % (statistics.fmean(pp), len(pp)))
    print("    delta %+.3f ±%.3f   z=%+.2f   →  %s"
          % (d, half_d, z, "RESOLVED" if abs(z) > 1.96 else "NOT RESOLVED"))
    print("    in the unit that pays: %+.1f season points (%.1f vs %.1f), ≈%+.1f a week"
          % (kpts - ppts, kpts, ppts, (kpts - ppts) / 17.0))
    if abs(z) <= 1.96:
        print("\n    ⇒ WE CANNOT SHOW THAT KEEPING BEATS DRAFTING AT THE SAME SLOT.")
        print("      Not 'keepers are worthless' — a point estimate with nothing")
        print("      behind it. Panel 1's 0.9082 does not rescue this; real picks")
        print("      score %.4f on that same null."
              % statistics.fmean(r["pct"] for r in prows))

    OUT.write_text(json.dumps({
        "_territory": "TERRITORY: A — draft/backtest/keeper_vs_random.py",
        "_what": "Decision-null grading of the KEEPER, in TWO panels. Panel 1: "
                 "season points delivered vs a random player available at the "
                 "pick slot the keeper consumed. Panel 2, THE ONE THAT IS THE "
                 "DECISION: vs what a REAL PICK at that round actually "
                 "returned. Read panel 2.",
        "_headline": "vs a random name 0.9082 (large-looking and near-vacuous "
                     "— real picks score 0.8554 on the same null and are flat "
                     "at ~0.85 from round 1 to round 15). vs a real pick at "
                     "the same round: NOT RESOLVED. We cannot show that "
                     "keeping beats drafting at the slot it costs.",
        "_limits": ["2023/2024/2025 — 2026 has no season yet",
                    "panel 1's null is a random name from a 570-player pool of "
                    "whom 38% scored under 20 points all season — a floor test "
                    "essentially every drafted player passes (Rule 3i)",
                    "2023's keepers come from a SEPARATE 30-pick keeper draft, "
                    "so they are scored against the pre-draft pool; 2024-25 "
                    "keepers sit in the main draft and are scored against the "
                    "board at the slot they consumed. Two pools, not one.",
                    "per-keeper, not per-SET: cannot see an interaction "
                    "between two keepers on one roster",
                    "n is small; inside the band means CANNOT TELL"],
        "n_keepers": n, "mean_percentile": round(mean_pct, 4),
        "null_95": [round(0.5 - half, 4), round(0.5 + half, 4)],
        "verdict": verdict,
        "controls": {"random_available": round(cr, 4),
                     "best_available": round(cb, 4),
                     "known_negative_band_half_width": round(ctl_half, 4),
                     "band_derived_from_n": len(ctl_rand)},
        "vs_real_pick_at_that_round": {
            "_what": "THE DECISION-RELEVANT PANEL. A keeper costs a pick; what "
                     "that pick returns is what real picks at that round "
                     "returned, scored by draft_pick_vs_random.run() itself so "
                     "both sides share one pool reconstruction and one "
                     "percentile.",
            "keeper_rounds": list(KEEPER_ROUNDS),
            "keepers_mean_pct": round(statistics.fmean(kp), 4), "keepers_n": len(kp),
            "real_picks_mean_pct": round(statistics.fmean(pp), 4), "real_picks_n": len(pp),
            "delta": round(d, 4), "half_width_95": round(half_d, 4), "z": round(z, 3),
            "resolved": bool(abs(z) > 1.96),
            "points_delta_season": round(kpts - ppts, 2),
            "points_delta_per_week": round((kpts - ppts) / 17.0, 2),
            "controls": {"known_negative_split_halves_z": round(z_neg, 3),
                         "known_negative_ok": bool(c_neg_ok),
                         "known_positive_vs_late_rounds_z": round(z_pos, 3),
                         "known_positive_ok": bool(c_pos_ok),
                         "_why": "A contrast with no power and a contrast that "
                                 "correctly finds nothing both print NOT "
                                 "RESOLVED; only these two tell them apart "
                                 "(Rule 3f)."},
        },
        "seasons_without_points_store": no_store,
        "drafts_without_keepers": drafts_without_keepers,
        "n_draws": N_DRAWS, "seed": SEED, "skipped": skipped,
        "by_owner": {o: {"n": len(v),
                         "mean_pct": round(statistics.fmean(x["pct"] for x in v), 4)}
                     for o, v in
                     {r["owner"]: [x for x in rows if x["owner"] == r["owner"]]
                      for r in rows}.items()},
        "rows": rows,
    }, indent=2) + "\n")
    try:
        where = OUT.relative_to(ROOT)
    except ValueError:      # a test redirects OUT outside the repo
        where = OUT
    print("\n  wrote %s" % where)
    # ALL FOUR controls gate. A failed control in EITHER panel means the numbers
    # above are not evidence, and a silently-powerless contrast is exactly the
    # failure Rule 3e was written about.
    bad = [nm for nm, ok in (("panel1 known-negative", neg_ok),
                             ("panel1 known-positive", pos_ok),
                             ("panel2 known-negative", c_neg_ok),
                             ("panel2 known-positive", c_pos_ok)) if not ok]
    if bad:
        print("\n  ⛔ REFUSING: control(s) failed — %s. The numbers above are "
              "not evidence." % ", ".join(bad))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
