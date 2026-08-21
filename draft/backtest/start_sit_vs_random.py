#!/usr/bin/env python3
# TERRITORY: A
"""TEST 3 FROM GETTY ET AL. (SIAM Review 2018), APPLIED TO OUR LEAGUE.

Cory uploaded the paper on 2026-08-21 and asked whether we should implement it.
We had implemented ONE of its four tests -- persistence (R*) -- and that is the
one our data supports worst: the paper's NFL dataset has m = 190,562 players,
ours has m = 10, and at our measured skill spread R* has 12% power (see
SKILL-LUCK-R-POWER-2026-08-21.md).

THIS IS THE PAPER'S THIRD TEST, which we had not implemented and which our data
supports WELL:

    "Do actions that a player takes in the game have statistically significant
     impacts on the payoffs that are achieved?"

The paper answers it by comparing real players against a Monte Carlo league of
randomly-drawn LEGAL lineups. That construction is why it fits us: the null is
CONSTRUCTED PER DECISION, so power comes from the number of owner-weeks (~560
across four seasons), not from having only ten owners.

OUR VERSION, and it is narrower than the paper's on purpose. The paper randomises
the whole lineup out of the entire athlete pool, which mixes DRAFTING skill with
START/SIT skill. We hold the roster FIXED -- the players an owner actually had
that week -- and randomise only which of them start. So this isolates exactly one
decision: given the roster you already own, did you set a better lineup than
chance would have?

WHAT A RESULT MEANS. For each owner-week we compute the actual starters' points,
then N random legal lineups from that same roster, and record the actual score's
PERCENTILE within that null. Pure chance => percentiles uniform on [0,1], mean
0.5. Skill => mean above 0.5. The test statistic is the mean percentile across
all owner-weeks, with its own null band from the uniform.

CONTROLS (rule 3e -- both must pass or no number here is worth reading):
  known-negative: a synthetic owner who starts a RANDOM legal lineup must land
    at mean percentile ~0.5.
  known-positive: an ORACLE owner who always starts his best legal lineup must
    land at ~1.0.
A run that cannot separate those two cannot separate skill from luck either.

Run: python3 draft/backtest/start_sit_vs_random.py
"""
from __future__ import annotations
import json, random, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
POSN = ROOT / "draft" / "data" / "player_positions.json"
OUT  = ROOT / "draft" / "backtest" / "start_sit_vs_random.json"

N_DRAWS = 400          # random legal lineups per owner-week
SEED    = 20260821

def load():
    hist = json.loads(HIST.read_text())
    pos  = json.loads(POSN.read_text())["positions"]
    return hist, pos


def id_type_audit(hist, pos):
    """REVIEWER'S FINDING (run 32437911836, [medium]): player ids could be str
    in one store and int in the other, in which case every lookup misses and
    the tool would report a huge 'unmapped' count that is really a type bug.

    Counts unmapped BEFORE and AFTER normalising both sides to str. If
    normalising rescues a meaningful number, the ids were mistyped and the
    'unmapped player' story was wrong. Printed, not assumed."""
    raw = set()
    for season in hist["seasons"]:
        for _, entries in (season.get("weeks") or {}).items():
            for e in entries:
                raw.update(e.get("players") or [])
    pos_keys = set(pos)
    unmapped_raw = {p for p in raw if p not in pos_keys}
    pos_str = {str(k) for k in pos_keys}
    unmapped_norm = {p for p in raw if str(p) not in pos_str}
    return {
        "distinct_ids_in_history": len(raw),
        "id_types_in_history": sorted({type(p).__name__ for p in raw}),
        "id_types_in_position_map": sorted({type(k).__name__ for k in pos_keys}),
        "unmapped_raw": len(unmapped_raw),
        "unmapped_after_str_normalisation": len(unmapped_norm),
        "rescued_by_normalisation": len(unmapped_raw) - len(unmapped_norm),
    }


def oracle_is_optimal(roster, pos, slots, pts, cap=40000):
    """REVIEWER'S FINDING (same run, [low/boundary]): the oracle fills slots
    greedily, and greedy is not guaranteed globally optimal for every
    slot/eligibility pattern. If the oracle is understated, 'points left on the
    bench' is understated too.

    Exact check by exhaustive assignment over the eligible sets. Returns the
    true maximum, or None when the search would be too large to be worth it
    (reported, never silently skipped)."""
    import itertools
    elig = []
    for sname in slots:
        ok = [p for p in roster if p in pos and (pos[p] in FLEX_OK if sname == "FLEX" else pos[p] == sname)]
        if not ok:
            return None
        elig.append(ok)
    size = 1
    for e in elig:
        size *= len(e)
        if size > cap:
            return None
    best = None
    for combo in itertools.product(*elig):
        if len(set(combo)) != len(combo):
            continue
        tot = sum(pts.get(p, 0.0) for p in combo)
        if best is None or tot > best:
            best = tot
    return None if best is None else round(best, 2)

def slots_from(roster_positions):
    """The league's starting slots, as a list like ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF']."""
    return [p for p in roster_positions if p not in ("BN", "IR", "TAXI")]

FLEX_OK = {"RB", "WR", "TE"}

def best_or_random(roster, pos, slots, pts, rng, oracle=False):
    """Fill each slot legally. oracle=True takes the highest scorer available at
    each slot (greedy, slots hardest-first); otherwise picks uniformly at random.
    Returns total points, or None if the roster cannot legally fill the slots."""
    avail = {p for p in roster if p in pos}
    # hardest first so a scarce position is not eaten by FLEX
    order = sorted(range(len(slots)), key=lambda i: (slots[i] == "FLEX", slots[i] in ("RB", "WR")))
    total = 0.0
    for i in order:
        s = slots[i]
        ok = [p for p in avail if (pos[p] in FLEX_OK if s == "FLEX" else pos[p] == s)]
        if not ok:
            return None
        pick = max(ok, key=lambda p: pts.get(p, 0.0)) if oracle else rng.choice(ok)
        avail.discard(pick)
        total += pts.get(pick, 0.0)
    return round(total, 2)

def percentile(actual, draws):
    """Fraction of the null at or below the actual score. Ties split, so a
    lineup identical to most random ones does not read as skill."""
    below = sum(1 for d in draws if d < actual)
    ties  = sum(1 for d in draws if d == actual)
    return (below + 0.5 * ties) / len(draws)

def run():
    hist, pos = load()
    rng = random.Random(SEED)
    rows, skipped = [], 0
    skipped_started_unmapped, dropped_bench = 0, 0
    ctl_rand, ctl_oracle = [], []
    oracle_exact = []

    for season in hist["seasons"]:
        slots = slots_from(season.get("roster_positions") or [])
        if not slots:
            continue
        # NAMES LIVE IN season['owners'], KEYED BY ROSTER_ID. `final_rosters`
        # carries owner_name/display_name as None on every row, so reading them
        # there yields "roster_7" for everybody and quietly anonymises the
        # result -- which is how the 08-20 write-up ended up discussing
        # "roster_7" and "roster_2" instead of people.
        owners = {}
        for rid, o in (season.get("owners") or {}).items():
            try: rid_i = int(rid)
            except Exception: rid_i = rid
            owners[rid_i] = (o or {}).get("display_name") or ("roster_%s" % rid)
        for wk, entries in (season.get("weeks") or {}).items():
            for e in entries:
                roster  = e.get("players") or []
                starters = e.get("starters") or []
                pts = {k: float(v) for k, v in (e.get("players_points") or {}).items()}
                if not roster or not starters or not pts:
                    skipped += 1; continue
                # ⚠️ DROPPING THE WHOLE WEEK FOR ONE UNMAPPED PLAYER BIASED THE
                # RESULT, AND IT BIASED IT UNEVENLY. The first version refused
                # any owner-week containing a player absent from
                # player_positions.json. Measured: 28 owner-weeks lost, and they
                # were NOT spread evenly -- roster_1 lost 10, roster_10 lost 8,
                # four owners lost none. Cory's n came out 42 against everyone
                # else's 52-54, which is what made it visible at all.
                #
                # Six ids cause all of it, and they are bench filler: 12530 was
                # rostered 10 times and STARTED ZERO. An unplaceable player only
                # blocks LEGALITY, so he can be dropped from the eligible pool
                # instead of taking the week with him.
                #
                # The week is still refused if an unmapped player was actually
                # STARTED -- there the real lineup cannot be compared like for
                # like against a null that could never have built it. That is 7
                # owner-weeks across four seasons, and they are counted, not
                # silently dropped.
                unmapped = [p for p in roster if p not in pos]
                if unmapped:
                    if any(p in unmapped for p in starters):
                        skipped_started_unmapped += 1; continue
                    roster = [p for p in roster if p in pos]
                    dropped_bench += len(unmapped)
                actual = round(sum(pts.get(p, 0.0) for p in starters), 2)
                draws = []
                for _ in range(N_DRAWS):
                    v = best_or_random(roster, pos, slots, pts, rng)
                    if v is not None:
                        draws.append(v)
                if len(draws) < N_DRAWS // 2:
                    skipped += 1; continue
                orc = best_or_random(roster, pos, slots, pts, rng, oracle=True)
                # exact optimum on a sample, to check greedy is not understating
                if orc is not None and len(oracle_exact) < 60:
                    ex = oracle_is_optimal(roster, pos, slots, pts)
                    if ex is not None:
                        oracle_exact.append((orc, ex))
                rows.append({
                    "season": season["season"], "week": int(wk),
                    "owner": owners.get(e.get("roster_id"), "roster_%s" % e.get("roster_id")),
                    "actual": actual, "pct": round(percentile(actual, draws), 4),
                    "null_mean": round(statistics.fmean(draws), 2),
                    "oracle": orc,
                    "left": (round(orc - actual, 2) if orc is not None else None),
                })
                # CONTROLS, on the same rosters, same draws
                # ⚠️ THIS CONTROL WAS TAUTOLOGICAL AND THE EXTERNAL REVIEWER
                # CAUGHT IT (run 32437911836, [high/test_independence]).
                #
                # It read `percentile(rng.choice(draws), draws)` — draw an
                # element FROM the null multiset and score it AGAINST that same
                # multiset. That is 0.5 by construction. It could not fail, on
                # any data, ever. So the thing advertised as proving the
                # instrument can detect "no skill" proved nothing at all, and
                # its reassuring 0.510 was arithmetic, not evidence.
                #
                # This is the vacuous-control failure this project has paid for
                # repeatedly, shipped by me inside the very commit that argued
                # controls are what make a green mean something.
                #
                # FIXED: draw a genuinely FRESH random legal lineup through the
                # same code path a real owner's alternatives come from, and
                # score THAT against the null. It now depends on the sampler
                # actually being unbiased, so it can fail — and it must, if
                # best_or_random ever stops being uniform.
                fresh = best_or_random(roster, pos, slots, pts, rng)
                if fresh is not None:
                    ctl_rand.append(percentile(fresh, draws))
                if orc is not None:
                    ctl_oracle.append(percentile(orc, draws))
    return (rows, ctl_rand, ctl_oracle, skipped, skipped_started_unmapped,
            dropped_bench, oracle_exact, id_type_audit(hist, pos))

def main():
    (rows, ctl_rand, ctl_oracle, skipped, skip_started, dropped_bench,
     oracle_exact, idaudit) = run()
    if not rows:
        print("NO USABLE OWNER-WEEKS — refusing to print a statistic. skipped=%d" % skipped)
        return 2
    n = len(rows)
    mean_pct = statistics.fmean(r["pct"] for r in rows)
    # null band for the MEAN of n uniform[0,1] draws: 0.5 +/- 1.96/sqrt(12n)
    half = 1.96 * (1.0 / 12.0) ** 0.5 / (n ** 0.5)
    cr = statistics.fmean(ctl_rand) if ctl_rand else None
    co = statistics.fmean(ctl_oracle) if ctl_oracle else None

    print("\n  TEST 3 (Getty et al.): DO OUR START/SIT DECISIONS BEAT CHANCE?")
    print("  roster held FIXED; only WHICH of your own players start is randomised\n")
    neg_ok = cr is not None and 0.42 < cr < 0.58
    pos_ok = co is not None and co > 0.90
    print("  CONTROLS (rule 3e — both must pass or ignore everything below)")
    print("    known-negative  random lineup   mean pct %.3f   %s" % (cr, "ok" if neg_ok else "⛔ FAILED"))
    print("    known-positive  oracle lineup   mean pct %.3f   %s" % (co, "ok" if pos_ok else "⛔ FAILED"))
    print("\n  owner-weeks used: %d   (skipped %d; of those %d because an UNMAPPED"
          " player was actually STARTED)" % (n, skipped + skip_started, skip_started))
    print("  unmapped BENCH players dropped from eligible pools (week kept): %d" % dropped_bench)
    # REVIEWER-REQUIRED DIAGNOSTICS (run 32437911836), printed every run so an
    # id-type regression or a greedy-oracle gap cannot hide behind a headline.
    print("  id types: history=%s map=%s | unmapped raw=%d, after str()=%d, rescued=%d"
          % (idaudit["id_types_in_history"], idaudit["id_types_in_position_map"],
             idaudit["unmapped_raw"], idaudit["unmapped_after_str_normalisation"],
             idaudit["rescued_by_normalisation"]))
    if oracle_exact:
        gaps = [ex - gr for gr, ex in oracle_exact]
        worse = sum(1 for g in gaps if g > 1e-9)
        print("  greedy oracle vs EXACT optimum on %d sampled weeks: %d understated, max gap %.2f pts"
              % (len(oracle_exact), worse, max(gaps) if gaps else 0.0))
    print("  MEAN PERCENTILE vs random: %.4f    null 95%%: [%.4f, %.4f]" % (mean_pct, 0.5 - half, 0.5 + half))
    print("  verdict: %s" % ("SKILL — above the null band" if mean_pct > 0.5 + half
                             else ("BELOW the null band" if mean_pct < 0.5 - half else "inside the null band — not distinguishable from chance")))
    per, left = {}, {}
    for r in rows:
        per.setdefault(r["owner"], []).append(r["pct"])
        if r.get("left") is not None:
            left.setdefault(r["owner"], []).append(r["left"])
    print("\n  BEATING RANDOM IS A LOW BAR -- random benches your stars. The number")
    print("  that pays is the gap to the ORACLE: points/week left on your bench.\n")
    # ⚠️ THE ORDERING IS NOISIER THAN IT LOOKS AND MUST CARRY ITS ERROR (rule
    # 3i). With ~50 owner-weeks each, the standard error on a mean percentile is
    # ~0.03-0.04, so adjacent rows are inside one SE of each other and the RANK
    # is not a finding. The points-left column is the one to act on.
    print("    owner                    n   mean pct  +-SE    pts left/wk   /season(14wk)")
    for o, v in sorted(per.items(), key=lambda kv: -statistics.fmean(kv[1])):
        lv = left.get(o) or [0]
        se = (statistics.pstdev(v) / (len(v) ** 0.5)) if len(v) > 1 else float("nan")
        lse = (statistics.pstdev(lv) / (len(lv) ** 0.5)) if len(lv) > 1 else float("nan")
        print("    %-22s %4d   %.3f  %.3f   %6.2f+-%.2f    %8.1f"
              % (o, len(v), statistics.fmean(v), se, statistics.fmean(lv), lse, 14 * statistics.fmean(lv)))
    allleft = [x for v in left.values() for x in v]
    if allleft:
        print("\n    league mean points left on the bench per week: %.2f" % statistics.fmean(allleft))
    OUT.write_text(json.dumps({
        "_territory": "TERRITORY: A — draft/backtest/start_sit_vs_random.py",
        "_what": "Getty et al. SIAM 2018 Test 3 (effect of player action) on our own league: actual start/sit vs a Monte-Carlo null of random LEGAL lineups from the same roster.",
        "n_owner_weeks": n, "mean_percentile": round(mean_pct, 4),
        "null_95": [round(0.5 - half, 4), round(0.5 + half, 4)],
        "controls": {"random_lineup": round(cr, 4), "oracle_lineup": round(co, 4)},
        "n_draws_per_week": N_DRAWS, "seed": SEED, "skipped": skipped + skip_started,
        "skipped_because_unmapped_player_was_started": skip_started,
        "unmapped_bench_players_dropped": dropped_bench,
        "id_type_audit": idaudit,
        "greedy_oracle_vs_exact": ({
            "sampled_weeks": len(oracle_exact),
            "weeks_greedy_understated": sum(1 for gr, ex in oracle_exact if ex - gr > 1e-9),
            "max_gap_pts": round(max((ex - gr for gr, ex in oracle_exact), default=0.0), 2),
        } if oracle_exact else None),
        "by_owner": {o: {"n": len(v), "mean_pct": round(statistics.fmean(v), 4),
                          "pts_left_per_week": round(statistics.fmean(left.get(o) or [0]), 2)}
                     for o, v in per.items()},
    }, indent=1) + "\n")
    print("\n  wrote %s" % OUT.relative_to(ROOT))

    # ⚠️ THE CONTROLS GATE THE EXIT CODE, and they did not until 2026-08-21.
    #
    # This now runs unattended in the weekly cron. Printing "⛔ FAILED" beside a
    # headline number and then exiting 0 is exactly how a broken instrument
    # keeps publishing confident output: the cron commits the artifact, the log
    # scrolls, and nobody reads it. If this cannot separate a random owner from
    # an oracle it cannot separate skill from luck either, and the run must go
    # red rather than quietly ship a number.
    #
    # Written because the workflow comment wiring this step ALREADY CLAIMED the
    # tool exits non-zero on a failed control -- a claim the code did not
    # honour. That is the same defect (register 5h) I spent tonight correcting
    # in CLAUDE.md and composite.js: prose asserting behaviour the constant
    # beside it does not have.
    if not (neg_ok and pos_ok):
        print("\n  ⛔ REFUSING: a control failed, so the number above is not"
              " evidence of anything. random=%.3f (want 0.42-0.58),"
              " oracle=%.3f (want >0.90)" % (cr if cr is not None else -1,
                                             co if co is not None else -1))
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
