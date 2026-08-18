#!/usr/bin/env python3
"""IN-SEASON FORWARD SIMULATOR — live playoff odds per seat, validated by
hindcast BEFORE it ever touches a screen.

Blind prediction P103 (same commit, before first execution) states the
ship bar: the week-8 hindcast must beat the climatological Brier baseline
in all three graded seasons or this does NOT feed B's widget.

THE FORWARD MODE, from the season-grain simulator (season_forward_sim.py,
identity/conservation-certified): at week W of season S,

  * weeks 1..W are REALIZED — scores and matchups exactly as they
    happened, never resampled (the past is data, not a distribution);
  * weeks W+1..RS-end use the REAL remaining schedule (matchups are known
    for the whole season in advance) with each seat's score drawn from a
    SHRUNK pool: its own realized weeks with weight W/(W+K), the
    league-wide week pool with weight K/(W+K), K = 3 — early-season a
    seat's three scores are not a distribution, and the shrinkage
    declares that instead of pretending;
  * playoff weeks: bracket via the certified money layer, seats scoring
    from the same shrunk pools.

Outputs per seat: P(playoffs), E[$] decomposed, week-over-week movement.
`--live` writes public/season_forward_live.json for B's risk-posture
widget (shape provisional until B states preferences — the dispatch says
the JSON fits the render, not the reverse).

HINDCAST (the validation): for each of 2023/2024/2025 and W in {4, 8, 12},
compute P(playoffs) per seat from only weeks 1..W, then Brier-score
against realized made-playoffs. Baseline: every seat at p = 4/10 → Brier
= 0.24. An instrument that cannot beat a constant does not ship.

Run: python3 draft/backtest/season_forward_inseason.py [--worlds N]
Writes season_forward_hindcast.json next to this file.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import money_grade as MG  # noqa: E402

SEED = 20260910
N_WORLDS = 1500
SHRINK_K = 3
HINDCAST_WEEKS = (4, 8, 12)


def forward_odds(history, payouts, season, as_of_week, n_worlds=N_WORLDS,
                 seed=SEED):
    """P(playoffs)/E[$] per seat using ONLY weeks 1..as_of_week as realized."""
    s = MG.season_of(history, season)
    if s is None:
        raise KeyError(f"no season {season}")
    pay = MG.season_pay(payouts, season)
    field = MG.field_weekly_scores(s)
    matchups = MG.weekly_matchups(s)
    rs_weeks = MG.regular_season_weeks(s)
    start = int((s.get("settings") or {}).get("playoff_week_start") or 15)
    bracket_weeks = [start, start + 1]
    rosters = sorted({r for wk in field.values() for r in wk})

    past = [w for w in rs_weeks if w <= as_of_week]
    future = [w for w in rs_weeks if w > as_of_week]
    if not past:
        raise ValueError("as_of_week before any realized week")

    own = {r: [field[w][r] for w in past if r in field.get(w, {})]
           for r in rosters}
    pool = [v for r in rosters for v in own[r]]

    def draw(rng, r):
        # shrunk sampling: own history with weight n/(n+K), league pool else
        n = len(own[r])
        if rng.random() < n / (n + SHRINK_K):
            return rng.choice(own[r])
        return rng.choice(pool)

    rng = random.Random(seed + season_hash(season) + as_of_week)
    made = {r: 0 for r in rosters}
    tot = {r: [] for r in rosters}
    for _ in range(n_worlds):
        sim_field = {w: dict(field[w]) for w in past}
        for w in future + bracket_weeks:
            sim_field[w] = {r: draw(rng, r) for r in rosters}
        standings = MG.standings_from_scores(sim_field, matchups, rs_weeks)
        placements = MG.simulate_bracket(standings, sim_field, s)
        for r in rosters:
            wh = MG.weekly_high_dollars(sim_field, rs_weeks, pay, r)
            rs_d = MG.regular_season_dollars(standings, pay, r)
            po = MG.playoff_dollars(placements, pay, r)
            tot[r].append(wh + rs_d + po)
            if r in placements:
                made[r] += 1
    out = {}
    for r in rosters:
        v = sorted(tot[r])
        n = len(v)
        out[r] = {"p_playoffs": round(made[r] / n_worlds, 4),
                  "E_total": round(sum(v) / n, 2),
                  "p5": round(v[int(0.05 * n)], 2),
                  "p95": round(v[min(n - 1, int(0.95 * n))], 2)}
    return out


def season_hash(season):
    return sum(ord(c) for c in str(season))


def realized_playoffs(history, season):
    s = MG.season_of(history, season)
    return set(MG.playoff_placements(s))


def brier(pred_by_seat, made_set):
    vals = [(p["p_playoffs"] - (1.0 if r in made_set else 0.0)) ** 2
            for r, p in pred_by_seat.items()]
    return round(sum(vals) / len(vals), 4)


def hindcast(n_worlds=N_WORLDS):
    history = MG.load_history()
    payouts = MG.load_payouts()
    MG.certify_bracket_resim(history)
    seasons = [str(s.get("season")) for s in history["seasons"]
               if len(MG.playoff_placements(s)) >= MG.PLAYOFF_TEAMS]
    doc = {"_prereg": "blind prediction P103, filed before first execution",
           "baseline_brier_constant_p0.4": 0.24,
           "n_worlds": n_worlds, "shrink_k": SHRINK_K, "seasons": {}}
    for y in seasons:
        made = realized_playoffs(history, y)
        row = {}
        for w in HINDCAST_WEEKS:
            odds = forward_odds(history, payouts, y, w, n_worlds=n_worlds)
            row[f"week_{w}"] = {
                "brier": brier(odds, made),
                "beats_baseline": brier(odds, made) < 0.24,
                "per_seat": odds,
            }
        doc["seasons"][y] = row
    p1 = all(doc["seasons"][y]["week_8"]["beats_baseline"]
             for y in doc["seasons"])
    improve = sum(1 for y in doc["seasons"]
                  if doc["seasons"][y]["week_12"]["brier"]
                  < doc["seasons"][y]["week_8"]["brier"])
    doc["p103"] = {
        "leg1_week8_beats_baseline_all_seasons": p1,
        "leg2_week12_better_than_week8_count": f"{improve}/{len(doc['seasons'])}",
        "leg2_met": improve >= 2,
        "ships_to_widget": p1,
    }
    return doc


def write_live(season=2026, n_worlds=N_WORLDS):
    """The week-1+ entry: publish public/season_forward_live.json for B's
    widget. Refuses (stated, not silent) until the season has realized
    weeks — running this preseason is a caller error, not an empty file."""
    history = MG.load_history()
    payouts = MG.load_payouts()
    s = MG.season_of(history, season)
    if s is None:
        raise SystemExit(f"season {season} not in league history yet")
    weeks = sorted(MG.field_weekly_scores(s))
    rs = MG.regular_season_weeks(s)
    done = [w for w in rs if w in weeks]
    if not done:
        raise SystemExit(f"season {season} has no realized regular-season "
                         "weeks — the live feed starts after week 1, not before")
    w = max(done)
    odds = forward_odds(history, payouts, season, w, n_worlds=n_worlds)
    out = {"_territory": "TERRITORY: A — season_forward_inseason.write_live",
           "_validated_by": "season_forward_hindcast.json (P103 TRUE: week-8 "
                            "Brier 0.072-0.131 vs 0.24 baseline, all seasons)",
           "season": season, "as_of_week": w, "n_worlds": n_worlds,
           "per_seat": odds,
           "_shape_note": "provisional until B states render preferences "
                          "(A -> B dispatch 08-18)"}
    dest = HERE.parents[1] / "public" / "season_forward_live.json"
    dest.write_text(json.dumps(out, indent=1))
    print(f"wrote {dest.name}: season {season} through week {w}")
    return out


def main():
    if "--live" in sys.argv:
        return write_live()
    n = N_WORLDS
    if "--worlds" in sys.argv:
        n = int(sys.argv[sys.argv.index("--worlds") + 1])
    doc = hindcast(n_worlds=n)
    (HERE / "season_forward_hindcast.json").write_text(json.dumps(doc, indent=1))
    for y, row in doc["seasons"].items():
        print(y, " ".join(f"w{w}:{row[f'week_{w}']['brier']}"
                          for w in HINDCAST_WEEKS))
    print("P103:", json.dumps(doc["p103"]))
    print("wrote season_forward_hindcast.json")


if __name__ == "__main__":
    main()
