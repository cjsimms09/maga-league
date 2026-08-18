# TERRITORY: A
"""V7 candidate C1 — age curves FITTED on our own stores, not borrowed.

Cory supplied position peaks (RB 23-26, WR 26-28, QB 28-33, TE 26-29) and a
0.003/yr decline slope from an ML guide. House rule: adopt the SHAPE, fit the
NUMBER — every hand-adopted constant this project graded eventually died.

THE MEASUREMENT: for each season transition y->y+1 in 2021-25 (four
transitions), players with >=8 scored games in both seasons, ratio =
points_{y+1} / points_y, grouped by the player's age in season y+1 (derived
from the 2026 board's age minus the season gap — the only committed age
source). The per-age median ratio IS the year-over-year age effect with level
controlled by construction.

DECLARED CAVEATS, before anyone reads a number:
  * SURVIVORSHIP — ages come from the 2026 board, so players who left the
    league before 2026 are absent, and late-career decline is therefore
    UNDERSTATED. Fine for the v7 use (we price players who are, in fact, on
    the 2026 board) and stated so nobody quotes these as league-wide curves.
  * The ratio conflates age with everything else that changes year to year;
    n per (position, age) cell is printed and cells under MIN_N report
    `unmeasurable` — the calibration's own discipline.

Output: draft/backtest/age_curve_2026.json — per position, per age: median
ratio, n, status; plus the fitted peak (argmax of a 3-age rolling median) and
the mean measured decline per year past the peak, printed NEXT TO Cory's
priors so the comparison is one read.

Run: python3 draft/backtest/age_curve_fit.py
"""
from __future__ import annotations

import json
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SEASONS = (2021, 2022, 2023, 2024, 2025)
POSITIONS = ("QB", "RB", "WR", "TE")
MIN_GAMES = 8
MIN_N = 8
CORY_PRIORS = {"RB": (23, 26), "WR": (26, 28), "QB": (28, 33), "TE": (26, 29)}


def season_data(season):
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    totals, games = {}, {}
    for wk in doc["weeks"]:
        for pid, pts in (wk.get("points") or {}).items():
            totals[pid] = totals.get(pid, 0.0) + float(pts)
            if float(pts) != 0.0:
                games[pid] = games.get(pid, 0) + 1
    return totals, games


def board_ages():
    b = json.loads((ROOT / "public" / "draft_data.json").read_text())
    out = {}
    for p in b["players"] + b.get("kept_players", []):
        if p.get("age") and p.get("position") in POSITIONS:
            out[str(p["player_id"])] = (float(p["age"]), p["position"])
    return out


def build() -> dict:
    ages = board_ages()
    cells: dict[tuple, list] = {}
    pairs_used = 0
    for y in SEASONS[:-1]:
        t1, g1 = season_data(y)
        t2, g2 = season_data(y + 1)
        gap = 2026 - (y + 1)
        for pid, (age26, pos) in ages.items():
            if g1.get(pid, 0) < MIN_GAMES or g2.get(pid, 0) < MIN_GAMES:
                continue
            if t1.get(pid, 0) <= 20:
                continue  # a near-zero base makes the ratio a coin toss
            age = round(age26 - gap)
            ratio = t2[pid] / t1[pid]
            cells.setdefault((pos, age), []).append(ratio)
            pairs_used += 1

    curves = {}
    for pos in POSITIONS:
        by_age = {}
        for (p, age), v in sorted(cells.items()):
            if p != pos:
                continue
            by_age[age] = {"median_ratio": round(median(v), 3), "n": len(v),
                           "status": "measured" if len(v) >= MIN_N else "unmeasurable"}
        meas = {a: d for a, d in by_age.items() if d["status"] == "measured"}
        peak, decline = None, None
        if len(meas) >= 4:
            ages_sorted = sorted(meas)
            roll = {}
            for a in ages_sorted:
                win = [meas[x]["median_ratio"] for x in (a - 1, a, a + 1) if x in meas]
                if len(win) >= 2:
                    roll[a] = sum(win) / len(win)
            if roll:
                peak = max(roll, key=roll.get)
                past = [(meas[a]["median_ratio"]) for a in ages_sorted if a > peak]
                if past:
                    decline = round(1.0 - (sum(past) / len(past)), 4)
        curves[pos] = {"by_age": {str(a): d for a, d in sorted(by_age.items())},
                       "fitted_peak_age": peak,
                       "mean_decline_past_peak_per_year": decline,
                       "cory_prior_peak": list(CORY_PRIORS[pos])}

    doc = {"_territory": "TERRITORY: A — written by age_curve_fit.py",
           "_what": ("V7 C1: year-over-year points ratio by (position, age), "
                     "2021-25 transitions, >=8 games both seasons, ages from "
                     "the 2026 board shifted back. SURVIVORSHIP-BIASED toward "
                     "players still active in 2026 — correct for pricing the "
                     "2026 board, understated for league-wide decline."),
           "transitions": [f"{y}->{y+1}" for y in SEASONS[:-1]],
           "player_season_pairs": pairs_used,
           "curves": curves}
    (HERE / "age_curve_2026.json").write_text(json.dumps(doc, indent=1))
    return doc


if __name__ == "__main__":
    d = build()
    print(f"pairs: {d['player_season_pairs']}")
    for pos, c in d["curves"].items():
        print(f"{pos}: fitted peak {c['fitted_peak_age']} (Cory prior "
              f"{c['cory_prior_peak']}), decline past peak "
              f"{c['mean_decline_past_peak_per_year']}")
