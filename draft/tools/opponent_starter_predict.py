#!/usr/bin/env python3
"""P284 — can we predict what an opponent will START, better than assuming
they start last week's lineup again?

PREREGISTERED (PREDICTION-LEDGER P284, E, grade-by 2026-09-03):
    "E's opponent starter-prediction model, leave-week-out on 2025, hits >= 80%
     of starting slots AND beats the persistence null ('last week's lineup minus
     injured outs'). If it cannot beat persistence, the model is a costume and
     the null ships as the league analyzer's predictor instead — that outcome is
     filed as a result, not a failure."

WHAT THIS IS NOT. `public/js/draft/opponent_predict.js` (A's) predicts opponent
DRAFT PICKS. Same words, different question, no shared code. Checked before
building rather than after — a name collision has already reported a known
defect absent once in this project.

THE NULL IS WEAKER THAN PREREGISTERED, AND THAT CUTS AGAINST ME.
"Minus injured outs" needs weekly injury designations for 2025 and no such store
exists (`roster_status_exclusions.json` is season-level, never-played). So the
null is run TWICE to bracket the truth:

    persistence            last week's starters, minus anyone off the roster
    persistence_hindsight  the same, minus anyone who scored 0 this week --
                           i.e. handed PERFECT inactive-player knowledge it
                           could not have had. An upper bound on the null.

A win over `persistence` alone is the weak result. A win over
`persistence_hindsight` is the safe one. Reported separately, never pooled.

Leave-week-out: every arm for week W sees only weeks < W.

Run from the repo root:  python3 draft/tools/opponent_starter_predict.py
"""
import collections
import json
import random
import statistics
import sys

ROOT = "."
REG_SEASON = 14
SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "K": 1, "DEF": 1}
FLEX_OK = ("RB", "WR", "TE")
N_SLOTS = sum(SLOTS.values()) + 1          # +1 FLEX
PRIMARY_SEASON = "2025"                    # preregistered

failures = []


def ok(name, cond, detail):
    print("  %-5s %-64s %s" % (name, detail, "OK" if cond else "*** FAILED ***"))
    if not cond:
        failures.append(name)


def load():
    hist = json.load(open(ROOT + "/draft/data/league_history.json"))
    pos = json.load(open(ROOT + "/draft/data/player_positions.json"))["positions"]
    return hist, pos


def best_lineup(cands, pts, pos):
    """Greedy-by-slot legal lineup: dedicated slots first, then FLEX.

    Exact for this roster shape because every dedicated slot is filled by the
    best remaining player at that position and FLEX takes the best leftover —
    no slot competes with another for a different position's player.
    """
    picked, used = [], set()
    ranked = sorted(cands, key=lambda p: -pts.get(p, 0.0))
    for slot, n in SLOTS.items():
        got = 0
        for p in ranked:
            if got >= n:
                break
            if p in used or pos.get(p) != slot:
                continue
            used.add(p); picked.append(p); got += 1
    for p in ranked:                                   # FLEX
        if p not in used and pos.get(p) in FLEX_OK:
            used.add(p); picked.append(p); break
    return picked


def season_frames(season, pos):
    """[(week, roster_id, roster_ids, actual_starters, points_this_week)] sorted by week."""
    out = []
    for w, teams in sorted(season.get("weeks", {}).items(), key=lambda kv: int(kv[0])):
        if int(w) > REG_SEASON:
            continue
        for t in teams:
            ids = [str(x) for x in (t.get("players") or []) if pos.get(str(x))]
            out.append({
                "week": int(w), "team": t.get("roster_id"),
                "roster": ids,
                "actual": [str(x) for x in (t.get("starters") or [])],
                "pts": {str(k): float(v or 0.0) for k, v in (t.get("players_points") or {}).items()},
            })
    return out


def run_season(season, pos, label, rng):
    frames = season_frames(season, pos)
    by_week = collections.defaultdict(list)
    for f in frames:
        by_week[f["week"]].append(f)
    weeks = sorted(by_week)

    # season-to-date totals and games, built forward so nothing leaks
    tot = collections.defaultdict(float)
    games = collections.Counter()
    prev_starters = {}                      # team -> last week's starters
    rows = []

    for w in weeks:
        for f in by_week[w]:
            if w == weeks[0]:
                continue                    # no prior week: persistence undefined
            ppg = {p: tot[p] / games[p] for p in f["roster"] if games[p]}
            actual = set(f["actual"])

            # --- arms -------------------------------------------------------
            keep = [p for p in prev_starters.get(f["team"], []) if p in f["roster"]]
            persistence = keep + [p for p in best_lineup(
                [x for x in f["roster"] if x not in keep], ppg, pos) if len(keep) < N_SLOTS]
            persistence = persistence[:N_SLOTS]

            keep_h = [p for p in keep if f["pts"].get(p, 0.0) > 0]
            hind = keep_h + [p for p in best_lineup(
                [x for x in f["roster"] if x not in keep_h], ppg, pos) if len(keep_h) < N_SLOTS]
            hind = hind[:N_SLOTS]

            model = best_lineup(f["roster"], ppg, pos)
            oracle = best_lineup(f["roster"], f["pts"], pos)
            rand = rng.sample(f["roster"], min(N_SLOTS, len(f["roster"])))

            hit = lambda pred: len(actual & set(pred)) / float(N_SLOTS)
            rows.append({
                "week": w, "team": f["team"],
                "persistence": hit(persistence), "hindsight": hit(hind),
                "model": hit(model), "oracle": hit(oracle),
                "random": hit(rand), "identity": hit(list(actual)),
            })
        for f in by_week[w]:                # advance AFTER predicting week w
            for p, v in f["pts"].items():
                tot[p] += v; games[p] += 1
            prev_starters[f["team"]] = list(f["actual"])
    return rows


def report(rows, label, primary):
    n = len(rows)
    mean = lambda k: statistics.mean(r[k] for r in rows)
    print("\n%s  (%d team-weeks, weeks 2-%d)" % (label, n, REG_SEASON))
    for k in ("identity", "random", "persistence", "hindsight", "model", "oracle"):
        print("    %-14s %.4f" % (k, mean(k)))
    for null in ("persistence", "hindsight"):
        d = [r["model"] - r[null] for r in rows]
        m = statistics.mean(d)
        se = statistics.pstdev(d) / (len(d) ** 0.5)
        print("    model - %-11s %+0.4f   se %.4f   %s"
              % (null, m, se, "beats it" if m - 1.96 * se > 0
                 else ("LOSES to it" if m + 1.96 * se < 0 else "indistinguishable")))
    if primary:
        print("    P284 bar 1: model >= 0.80 of slots ....... %.4f  %s"
              % (mean("model"), "MET" if mean("model") >= 0.80 else "NOT MET"))
        print("    P284 bar 2: beats persistence ............ %s"
              % ("MET" if statistics.mean(r["model"] - r["persistence"] for r in rows)
                 - 1.96 * statistics.pstdev([r["model"] - r["persistence"] for r in rows])
                 / (len(rows) ** 0.5) > 0 else "NOT MET"))
        # BASE RATE BEFORE SCORE. 9 starters drawn from a ~15-man roster overlap
        # the real 9 by 9/15 = 0.60 on average WITHOUT ANY MODEL. Quoting 0.75
        # without this is quoting a number without the distribution it came from.
        print("\n    base rate, analytic: 9 of a %d-man roster overlaps the real 9 by %.4f"
              % (15, 9.0 / 15.0))
        print("    so the whole real band is %.3f (chance) -> %.3f (a perfect-hindsight"
              % (9.0 / 15.0, mean("oracle")))
        print("    optimiser) -> 1.000 (identity). Persistence already sits at %.3f."
              % mean("persistence"))
        by_team = collections.defaultdict(list)
        for r in rows:
            by_team[r["team"]].append(r)
        print("\n    PER OWNER — how predictable is each seat? (persistence, n=%d each)"
              % len(next(iter(by_team.values()))))
        for t in sorted(by_team, key=lambda k: -statistics.mean(x["persistence"] for x in by_team[k])):
            v = by_team[t]
            print("      seat %-3s persistence %.3f   model %.3f   oracle %.3f"
                  % (t, statistics.mean(x["persistence"] for x in v),
                     statistics.mean(x["model"] for x in v),
                     statistics.mean(x["oracle"] for x in v)))


def main():
    hist, pos = load()
    rng = random.Random(20260824)
    seasons = {str(s["season"]): s for s in hist["seasons"] if s.get("weeks")}

    print("CONTROLS")
    prim = run_season(seasons[PRIMARY_SEASON], pos, PRIMARY_SEASON, rng)
    ok("C1", all(abs(r["identity"] - 1.0) < 1e-9 for r in prim),
       "identity arm (predict the actual starters) scores exactly 1.0")
    rnd = statistics.mean(r["random"] for r in prim)
    ok("C2", 0.30 < rnd < 0.75, "random legal-ish arm lands near chance: %.4f" % rnd)
    ok("C3", min(r["week"] for r in prim) == 2,
       "week 1 excluded — persistence is undefined with no prior week")
    ok("C4", len(prim) == 10 * (REG_SEASON - 1),
       "%d team-weeks == 10 teams x %d weeks" % (len(prim), REG_SEASON - 1))
    orc = statistics.mean(r["oracle"] for r in prim)
    ok("C5", orc < 1.0, "oracle < 1.0 (%.4f) — owners do not play the optimal lineup, "
                        "so 1.0 is not the ceiling" % orc)
    if failures:
        print("\n*** %d control(s) failed — output void ***" % len(failures))
        return 1

    report(prim, "PRIMARY — %s, preregistered" % PRIMARY_SEASON, True)
    for yr in sorted(seasons):
        if yr == PRIMARY_SEASON:
            continue
        report(run_season(seasons[yr], pos, yr, random.Random(20260824)),
               "REPLICATION (secondary, not the preregistered grade) — %s" % yr, False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
