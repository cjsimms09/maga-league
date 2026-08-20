#!/usr/bin/env python3
"""SEASON-FORWARD SIMULATOR (task 9) — many worlds over the harvested
seasons, so the payout channels the single-seat replay never activated
can finally be measured.

WHY (EDGE-LEDGER, the strategy-grid inconclusive): in the one realized
world Cory's seat missed the playoffs all three seasons, so playoff $ and
RS $ were $0 for EVERY policy variant and the FLOOR/CEILING question
graded on a 3-sample weekly-high coin flip. The fix named there is this
module: rosters make (or miss) the playoffs across MANY simulated worlds,
turning made_playoffs from a binary into a probability and E[$] into a
distribution.

WHAT A WORLD IS — two resampling axes over one harvested season, both
operating on REALIZED weekly scores only (register 49: a sim that draws
scores from the board's own projections cannot adjudicate anything about
the board; this one never touches a projection):

  SCHEDULE PERMUTATION   each RS week's pairings are redrawn as a uniform
                         random perfect matching over the 10 seats. Own
                         scores unchanged; who you face changes. This is
                         the "schedule luck" axis.
  WEEK BOOTSTRAP         each seat's weekly score is redrawn i.i.d. with
                         replacement from ITS OWN realized RS scores.
                         Team strength preserved, timing randomized. This
                         is the "timing luck" axis — it decides close
                         matchups, weekly highs and playoff games.
                         Playoff-week scores are bootstrap draws from the
                         same RS distribution (declared: harvested
                         playoff-week scores exist only for seats that
                         played meaningful games, and a bracket needs a
                         score for every seeded seat in every world).

Dollars per world via the CERTIFIED money layer (money_grade.py) — the
same standings, weekly-high, RS-prize and bracket-resim code that
reproduces every harvested bracket and payout, unmodified.

CONTROLS (rule 3f, built in, asserted by the test suite):
  * IDENTITY WORLD — permutation off, bootstrap off, actual playoff
    scores: per-roster dollars must EQUAL grade_actual's for every seat,
    every season. If the plumbing drifts a cent, nothing else here means
    anything.
  * MONEY CONSERVATION — every world distributes exactly the pot that
    grade_actual distributes for that season.
  * FOUR SEATS SEED — every world's bracket has exactly 4 teams.

SUBSTITUTED ENTRY POINT — `simulate(..., substitute=(roster_id,
{week: score}))` replaces one seat's realized series BEFORE the bootstrap
(grade_substituted's semantics, extended to worlds): the policy-variant
question re-enters through here, against activated payout channels, in
its own preregistered follow-up study — this module computes, it does not
conclude.

Run: python3 draft/backtest/season_forward_sim.py [--worlds N]
Writes season_forward_baseline.json (actual rosters, all seasons).
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import money_grade as MG  # noqa: E402

SEED = 20260821
N_WORLDS = 2000
OUT = HERE / "season_forward_baseline.json"


def _random_matchups(rosters, weeks, rng):
    out = {}
    for w in weeks:
        order = list(rosters)
        rng.shuffle(order)
        pair = {}
        for i in range(0, len(order) - 1, 2):
            a, b = order[i], order[i + 1]
            pair[a] = b
            pair[b] = a
        out[w] = pair
    return out


def _bootstrap_field(own_scores, rosters, weeks, rng):
    return {w: {r: rng.choice(own_scores[r]) for r in rosters} for w in weeks}


def one_world(season, pay, own_scores, rosters, rs_weeks, bracket_weeks,
              rng, permute=True, bootstrap=True,
              actual_field=None, actual_matchups=None):
    if bootstrap:
        field = _bootstrap_field(own_scores, rosters,
                                 rs_weeks + bracket_weeks, rng)
    else:
        field = {w: dict(actual_field[w]) for w in actual_field}
    matchups = (_random_matchups(rosters, rs_weeks, rng) if permute
                else actual_matchups)
    standings = MG.standings_from_scores(field, matchups, rs_weeks)
    placements = MG.simulate_bracket(standings, field, season)
    per = {}
    for rid in rosters:
        wh = MG.weekly_high_dollars(field, rs_weeks, pay, rid)
        rs = MG.regular_season_dollars(standings, pay, rid)
        po = MG.playoff_dollars(placements, pay, rid)
        per[rid] = (wh, rs, po)
    return per, placements


def simulate(history, payouts, season, n_worlds=N_WORLDS, seed=SEED,
             permute=True, bootstrap=True, substitute=None):
    s = MG.season_of(history, season)
    if s is None:
        raise KeyError(f"no season {season} in history")
    pay = MG.season_pay(payouts, season)
    field = MG.field_weekly_scores(s)
    matchups = MG.weekly_matchups(s)
    rs_weeks = MG.regular_season_weeks(s)
    start = int((s.get("settings") or {}).get("playoff_week_start") or 15)
    bracket_weeks = [start, start + 1]
    rosters = sorted({r for wk in field.values() for r in wk})

    own = {r: [field[w][r] for w in rs_weeks if r in field.get(w, {})]
           for r in rosters}
    if substitute:
        sub_rid, sub_weekly = substitute
        own[sub_rid] = [float(sub_weekly.get(w, field[w].get(sub_rid, 0.0)))
                        for w in rs_weeks]
        field = {w: dict(sc) for w, sc in field.items()}
        for w, pts in sub_weekly.items():
            if int(w) in field and sub_rid in field[int(w)]:
                field[int(w)][sub_rid] = float(pts)
    for r, v in own.items():
        if not v:
            raise ValueError(f"roster {r} has no RS scores to resample")

    rng = random.Random(seed)
    pot = None
    agg = {r: {"wh": [], "rs": [], "po": [], "total": [],
               "made_playoffs": 0, "won_wh_week": 0} for r in rosters}
    for _ in range(n_worlds):
        per, placements = one_world(
            s, pay, own, rosters, rs_weeks, bracket_weeks, rng,
            permute=permute, bootstrap=bootstrap,
            actual_field=field, actual_matchups=matchups)
        world_total = round(sum(sum(v) for v in per.values()), 2)
        if pot is None:
            pot = world_total
        elif world_total != pot:
            raise AssertionError(
                f"money not conserved: world distributed {world_total}, "
                f"first world {pot}")
        if len(placements) != MG.PLAYOFF_TEAMS:
            raise AssertionError(f"bracket had {len(placements)} seats")
        for rid, (wh, rs, po) in per.items():
            agg[rid]["wh"].append(wh)
            agg[rid]["rs"].append(rs)
            agg[rid]["po"].append(po)
            agg[rid]["total"].append(wh + rs + po)
            if rid in placements:
                agg[rid]["made_playoffs"] += 1
            if wh > 0:
                agg[rid]["won_wh_week"] += 1

    def stat(v):
        srt = sorted(v)
        n = len(srt)
        return {"mean": round(sum(v) / n, 2),
                "p5": round(srt[int(0.05 * n)], 2),
                "p95": round(srt[min(n - 1, int(0.95 * n))], 2)}

    per_roster = {}
    for rid, a in agg.items():
        per_roster[rid] = {
            "p_playoffs": round(a["made_playoffs"] / n_worlds, 4),
            "p_any_weekly_high": round(a["won_wh_week"] / n_worlds, 4),
            "E_weekly_high": stat(a["wh"]),
            "E_regular_season": stat(a["rs"]),
            "E_playoff": stat(a["po"]),
            "E_total": stat(a["total"]),
        }
    return {"season": str(season), "n_worlds": n_worlds, "seed": seed,
            "permute": permute, "bootstrap": bootstrap,
            "pot_per_world": pot,
            "substituted_roster": substitute[0] if substitute else None,
            "per_roster": per_roster}


def identity_check(history, payouts, season):
    """The rule-3f control: one identity world == grade_actual, cent-exact."""
    actual = MG.grade_actual(history, payouts, season)
    sim = simulate(history, payouts, season, n_worlds=1,
                   permute=False, bootstrap=False)
    diffs = []
    for rid, cell in actual["per_roster"].items():
        got = sim["per_roster"][rid]["E_total"]["mean"]
        if abs(got - cell["total"]) > 0.005:
            diffs.append(f"roster {rid}: sim {got} != actual {cell['total']}")
    if diffs:
        raise AssertionError("identity world diverges: " + "; ".join(diffs))
    return {"season": str(season), "ok": True,
            "distributed": actual["distributed"]}


def main():
    n = N_WORLDS
    if "--worlds" in sys.argv:
        n = int(sys.argv[sys.argv.index("--worlds") + 1])
    history = MG.load_history()
    payouts = MG.load_payouts()
    MG.certify_bracket_resim(history)
    seasons = [str(s.get("season")) for s in history["seasons"]
               if len(MG.playoff_placements(s)) >= MG.PLAYOFF_TEAMS]
    doc = {"_territory": "TERRITORY: A — season_forward_sim.py",
           "_note": ("Baseline many-worlds run on the ACTUAL harvested "
                     "rosters. The identity control ran first; policy "
                     "questions enter via simulate(substitute=...) behind "
                     "their own prereg."),
           "identity_controls": {}, "seasons": {}}
    for y in seasons:
        doc["identity_controls"][y] = identity_check(history, payouts, y)
        doc["seasons"][y] = simulate(history, payouts, y, n_worlds=n)
        print(f"{y}: identity ok, {n} worlds, pot "
              f"{doc['seasons'][y]['pot_per_world']}")
    OUT.write_text(json.dumps(doc, indent=1))
    print("wrote", OUT.name)


if __name__ == "__main__":
    main()
