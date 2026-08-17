# TERRITORY: A
"""PER-PLAYER WEEKLY VOLATILITY — the signal the board has never had, from data already committed.

Cory, repeatedly: *"quantify why I think they have upside"*, and
*"Above all!! Fix the data problem"*.

THE GAP, STATED ONCE MORE BECAUSE THIS IS THE FILE THAT CLOSES IT. Every
dispersion field on the board — `proj_ceiling`, `proj_floor`, `proj_sd`,
`weekly_sd` — is `proj_mean x (a per-band constant)`. Spearman 1.0000 against
the projection within a cell: **exactly zero player-specific information.** That
one fact is why `ceiling` measured collinear and was zeroed, why the phase grid
could only discover that double-counting the projection hurts, and why the
variance modifiers came back unmeasurable. Three dead ends, one cause.

WHAT THIS MEASURES INSTEAD. For each player-season, the mean and standard
deviation of his REALIZED weekly fantasy points under OUR scoring, and the
coefficient of variation `cv = sd / mean`. `cv` is the scale-free version and is
the one to use: a raw sd partly tracks the mean by construction, which is the
defect being escaped.

IT NEEDED NO NEW FETCH. `nflverse_weekly_points_YYYY.json` has been committed in
this repo the whole time. `nflverse_variance.py` was written to measure this and
was never run and never consumed — a module with no caller, which is the same
"computed and thrown away" family the capture registry exists for.

THE SCORING-TABLE GUARD IS NOT OPTIONAL AND IT FIRED HERE. The stores carry a
`scoring_fingerprint` per week, and 2021-2022 were scored under a DIFFERENT
table than 2023-2025. Pooling them would produce per-player totals that never
existed under either table, and — in `nflverse_weekly_store`'s own words —
"NOTHING IN THE ARITHMETIC WOULD COMPLAIN". So this module REFUSES a mixed
population rather than averaging across a rule change. That costs two seasons
and is the correct price.

WHAT WAS MEASURED (2023-2025, one table, n~200 per transition):

  * WITHIN-BAND SPREAD, so it is not the mean in disguise: inside a fixed mean
    band, cv spans 1.6x-1.9x from p10 to p90. A `mean x constant` field has NO
    within-band spread by construction. The gradient is interpretable too — cv
    falls from ~0.84 at low means to ~0.44 at high ones, i.e. better players are
    relatively steadier.

  * YEAR-OVER-YEAR PERSISTENCE against a 400-draw permutation null, which is
    the test that separates a trait from sampling noise:

        2023 -> 2024   rho +0.482   null 95% [-0.176, +0.142]   SIGNAL
        2024 -> 2025   rho +0.605   null 95% [-0.134, +0.133]   SIGNAL

    Control (mean carryover, a known-stable quantity): +0.740 / +0.781.

**READ THAT COMPARISON CAREFULLY, BECAUSE IT IS THE POINT.** Volatility persists
at roughly two thirds the strength of scoring LEVEL. It is not a weak
correlate — it is nearly as much a property of the player as how good he is.

WHAT THIS DOES NOT DO, AND WILL NOT DO IN THIS FILE. It sets no weight, changes
no board, and proposes no policy. A measurement that a signal EXISTS is not a
measurement that leaning on it PAYS, and this repo has spent a week learning
that difference the expensive way. Wiring it is a separate, preregistered
decision, and not before the 2026-08-22 draft.

TWO LIMITS, STATED HERE RATHER THAN DISCOVERED LATER:
  1. Only two transitions survive the fingerprint guard. Two is enough to
     refuse a null twice and not enough to call the coefficient precise.
  2. This is REALIZED volatility. Using it prospectively is licensed by the
     persistence above and by nothing else — which is exactly why the
     persistence, not the level, is the headline.

Run:
    python3 draft/backtest/weekly_volatility.py            # measure + write
    python3 draft/backtest/weekly_volatility.py --check    # report, write nothing
"""
from __future__ import annotations

import argparse
import json
import random
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEASONS = (2021, 2022, 2023, 2024, 2025)
OUT = HERE / "weekly_volatility.json"

#: A player-season needs this many graded weeks before a volatility means
#: anything. Below it the sd is noise about noise, and it would land hardest on
#: exactly the deep, intermittently-used players whose apparent boom/bust is
#: most tempting to over-read.
MIN_WEEKS = 8

#: And a mean this low makes `cv` explode on arithmetic alone: a player averaging
#: 0.4 points with one 6-point week reads as wildly volatile while telling us
#: only that he does not play.
MIN_MEAN = 3.0

PERMUTATIONS = 400


def load_season(season: int) -> tuple[dict, set]:
    """({player_id: [weekly points]}, {scoring fingerprints seen})."""
    path = HERE / f"nflverse_weekly_points_{season}.json"
    if not path.exists():
        return {}, set()
    doc = json.loads(path.read_text())
    by, fps = {}, set()
    for wk in doc.get("weeks") or []:
        fps.add(wk.get("scoring_fingerprint"))
        for pid, pts in (wk.get("points") or {}).items():
            by.setdefault(str(pid), []).append(float(pts))
    return by, fps


def comparable_seasons(seasons=SEASONS) -> tuple[list, dict]:
    """The LARGEST set of seasons sharing ONE scoring fingerprint, plus the map.

    THE GUARD THAT MATTERS. A points total is a fact about a week AND a rule
    set. Two seasons scored under two tables are not two measurements of the
    same quantity, and averaging across the boundary produces a number that
    never existed. Refusing costs seasons; mixing costs the truth.
    """
    fp_of = {}
    for s in seasons:
        _by, fps = load_season(s)
        if len(fps) == 1:
            fp_of[s] = next(iter(fps))
        elif fps:
            fp_of[s] = None          # mixed WITHIN a season — unusable
    groups: dict = {}
    for s, fp in fp_of.items():
        if fp:
            groups.setdefault(fp, []).append(s)
    if not groups:
        return [], fp_of
    best = max(groups.values(), key=len)
    return sorted(best), fp_of


def season_volatility(by_player: dict, min_weeks=MIN_WEEKS, min_mean=MIN_MEAN) -> dict:
    out = {}
    for pid, vals in by_player.items():
        if len(vals) < min_weeks:
            continue
        mean = st.fmean(vals)
        if mean <= min_mean:
            continue
        sd = st.pstdev(vals)
        out[pid] = {"weeks": len(vals), "mean": round(mean, 3),
                    "sd": round(sd, 3), "cv": round(sd / mean, 4)}
    return out


def _spearman(xs, ys):
    def rk(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0] * len(v)
        for j, i in enumerate(order):
            r[i] = j + 1
        return r
    a, b = rk(xs), rk(ys)
    n = len(a)
    if n < 3:
        return 0.0
    ma, mb = st.fmean(a), st.fmean(b)
    num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else 0.0


def persistence(per_season: dict, seasons: list, field="cv", draws=PERMUTATIONS,
                seed=20260817) -> list:
    """Year-over-year carryover of `field`, each against a permutation null.

    SPREAD IS NOT SIGNAL, which is the whole reason this function exists. A
    player with 8 graded weeks has a noisier sd than one with 17, so some of the
    observed spread is sampling noise. Only persistence separates a trait from
    that, and only a null says whether the persistence is real.
    """
    rng = random.Random(seed)
    rows = []
    for a_s, b_s in zip(seasons, seasons[1:]):
        a, b = per_season[a_s], per_season[b_s]
        shared = [p for p in a if p in b]
        if len(shared) < 30:
            rows.append({"from": a_s, "to": b_s, "n": len(shared),
                         "status": "underpowered"})
            continue
        xs = [a[p][field] for p in shared]
        ys = [b[p][field] for p in shared]
        rho = _spearman(xs, ys)
        null = []
        for _ in range(draws):
            z = ys[:]
            rng.shuffle(z)
            null.append(_spearman(xs, z))
        null.sort()
        lo, hi = null[draws // 40], null[-(draws // 40) - 1]
        rows.append({
            "from": a_s, "to": b_s, "n": len(shared),
            "rho": round(rho, 4),
            "null_95": [round(lo, 4), round(hi, 4)],
            "status": "signal" if rho > hi else "not distinguishable from noise",
            # The control rides along in the SAME row, so a reader cannot see
            # the headline without the yardstick next to it.
            "control_mean_carryover": round(
                _spearman([a[p]["mean"] for p in shared],
                          [b[p]["mean"] for p in shared]), 4),
        })
    return rows


def within_band_spread(vol: dict, bands=((3, 8), (8, 12), (12, 16), (16, 1e9))) -> list:
    """Does cv still vary INSIDE a mean band? A `mean x constant` field cannot."""
    out = []
    for lo, hi in bands:
        cell = sorted(v["cv"] for v in vol.values() if lo <= v["mean"] < hi)
        if len(cell) < 15:
            continue
        n = len(cell)
        p10, p50, p90 = cell[n // 10], cell[n // 2], cell[9 * n // 10]
        out.append({"mean_band": [lo, None if hi > 1e8 else hi], "n": n,
                    "cv_p10": round(p10, 4), "cv_p50": round(p50, 4),
                    "cv_p90": round(p90, 4),
                    "spread_ratio": round(p90 / p10, 3) if p10 else None})
    return out


def build() -> dict:
    seasons, fp_of = comparable_seasons()
    refused = sorted(s for s in fp_of if s not in seasons)
    per = {}
    for s in seasons:
        by, _fps = load_season(s)
        per[s] = season_volatility(by)
    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/weekly_volatility.py",
        "seasons_used": seasons,
        "seasons_refused_different_scoring_table": refused,
        "scoring_fingerprint_by_season": {str(k): v for k, v in fp_of.items()},
        "min_weeks": MIN_WEEKS, "min_mean": MIN_MEAN,
        "players_by_season": {str(s): len(per[s]) for s in seasons},
        "within_band_spread": {str(s): within_band_spread(per[s]) for s in seasons},
        "persistence_cv": persistence(per, seasons, "cv"),
        "per_player": {str(s): per[s] for s in seasons},
        "_note": (
            "PER-PLAYER weekly volatility of realized fantasy points under OUR "
            "scoring. `cv` (sd/mean) is the scale-free measure and the one to "
            "use — a raw sd partly tracks the mean by construction, which is "
            "the defect this exists to escape. Seasons under a DIFFERENT "
            "scoring fingerprint are REFUSED, not averaged in: a points total "
            "is a fact about a week AND a rule set. This file MEASURES a "
            "signal; it sets no weight and changes no board. That a signal "
            "exists is not evidence that leaning on it pays."),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    args = ap.parse_args()

    doc = build()
    if not doc["seasons_used"]:
        print("no comparable seasons — refusing", file=sys.stderr)
        return 1

    print(f"seasons used: {doc['seasons_used']}")
    if doc["seasons_refused_different_scoring_table"]:
        print(f"REFUSED (different scoring table): "
              f"{doc['seasons_refused_different_scoring_table']} — a points total is a "
              "fact about a week AND a rule set")
    for s in doc["seasons_used"]:
        print(f"  {s}: {doc['players_by_season'][str(s)]} players")

    print("\nWITHIN-BAND SPREAD OF cv (a mean x constant field would show none):")
    for row in doc["within_band_spread"][str(doc["seasons_used"][-1])]:
        lo, hi = row["mean_band"]
        print(f"  mean[{lo},{hi or '+'}) n={row['n']:3d}: "
              f"p10={row['cv_p10']:.3f} p50={row['cv_p50']:.3f} "
              f"p90={row['cv_p90']:.3f}  spread {row['spread_ratio']}x")

    print("\nYEAR-OVER-YEAR PERSISTENCE (400-draw permutation null):")
    for r in doc["persistence_cv"]:
        if r.get("status") == "underpowered":
            print(f"  {r['from']}->{r['to']}: n={r['n']} UNDERPOWERED")
            continue
        print(f"  {r['from']}->{r['to']}: n={r['n']:3d} rho={r['rho']:+.3f} "
              f"null95={r['null_95']} {r['status'].upper()}   "
              f"(control mean carryover {r['control_mean_carryover']:+.3f})")

    if not args.check:
        OUT.write_text(json.dumps(doc, indent=1))
        print(f"\nwrote {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
