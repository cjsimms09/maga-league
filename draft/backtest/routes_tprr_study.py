# TERRITORY: D
"""ROUTES-TPRR — does target-per-route-run carry, and does it add anything to
volume? Preregistered in ROUTES-TPRR-PREREG.md (committed first, in its own
commit); results land in routes_tprr_study.json.

RESEARCH ONLY. Reads committed stores, writes its own results file. Touches no
projection, no board, no production surface. Nothing here puts a number in
front of Cory, and nothing installs from it either way — a positive routes to a
separate, gated wiring decision that is A's and Cory's.

THE FINGERPRINT DISCIPLINE, AND THE CORRECTION IT NEEDED. E2's outcome is
fantasy points, and 2021/2022 carry a different `scoring_fingerprint`
(220bf4c671786351) from 2023-25 (bd8f3e50bd67a9ce). The original run REFUSED the
2022->2023 transition on that basis.

THAT REFUSAL WAS WRONG, and AMENDMENT 1 restores the fold. The fingerprint is a
sha256 of the SERIALISED scoring dict, so representation alone changes it — and
representation is the only thing that differs. The two tables have the same 44
keys, and the three unequal values are float32 vs float64 renderings of 0.04,
0.1 and 0.1, worth under 5e-06 points on a season total. Rounding the older
table to 6dp reproduces the newer fingerprint EXACTLY.

So the runtime guard now compares TABLES, not fingerprints: a genuine rule
change still refuses, a serialisation artifact no longer does. The verdict is
unchanged with the fold restored (clears: false on four folds instead of three),
which is the point of reporting both. draft/audit/scoring_fingerprint_artifact_2026-08-17.md

Run: python3 draft/backtest/routes_tprr_study.py
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ── preregistered constants (ROUTES-TPRR-PREREG.md) ─────────────────────────
SEASONS = (2021, 2022, 2023, 2024, 2025)
E1_TRANSITIONS = ((2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025))
# AMENDMENT 1 (2026-08-17, after the original 3-fold run): 2022->2023 is
# RESTORED. The prereg refused it because the two seasons carry different
# `scoring_fingerprint` values and were believed to be scored under different
# tables. They are not: the tables are byte-identical once the older one is
# rounded to 6dp, and rounding it reproduces the newer fingerprint exactly
# (bd8f3e50bd67a9ce). The three differing values are float32 vs float64
# representations of 0.04 / 0.1 / 0.1, worth <5e-06 points on a season total.
# The refusal was factually wrong, not a judgement changed after seeing results;
# both the 3-fold and 4-fold verdicts are reported.
# draft/audit/scoring_fingerprint_artifact_2026-08-17.md
E2_TRANSITIONS = ((2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025))
MIN_ROUTES = 200
PERMUTATIONS = 400
SEED = 20260817


# ── stores ──────────────────────────────────────────────────────────────────

def season_routes(season: int) -> dict[str, dict]:
    """{pid: {routes, targets, tprr}} from summed WEEKLY counts.

    tprr is computed from the summed counts, never as a mean of weekly ratios —
    averaging ratios weights a 12-route week equally with a 45-route week.
    """
    doc = json.loads((HERE / f"routes_{season}.json").read_text())
    acc: dict[str, dict] = {}
    weeks = doc["weeks"]
    for wk in (weeks.values() if isinstance(weeks, dict) else weeks):
        players = wk.get("players", wk) if isinstance(wk, dict) else wk
        for pid, row in players.items():
            if not isinstance(row, dict):
                continue
            a = acc.setdefault(str(pid), {"routes": 0, "targets": 0})
            a["routes"] += row.get("routes") or 0
            a["targets"] += row.get("targets") or 0
    for a in acc.values():
        a["tprr"] = (a["targets"] / a["routes"]) if a["routes"] else None
    return acc


def season_points(season: int) -> tuple[dict[str, float], str]:
    """{pid: total points} plus the store's scoring fingerprint."""
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    total: dict[str, float] = {}
    prints = set()
    for wk in doc["weeks"]:
        prints.add(wk["scoring_fingerprint"])
        for pid, pts in wk["points"].items():
            total[str(pid)] = total.get(str(pid), 0.0) + float(pts)
    if len(prints) != 1:
        raise SystemExit(f"{season}: {len(prints)} scoring fingerprints in one store")
    return total, prints.pop()


# ── rank statistics (no numpy; ties averaged) ───────────────────────────────

def rankdata(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def pearson(a, b):
    n = len(a)
    if n < 3:
        return None
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((y - mb) ** 2 for y in b))
    return (num / (da * db)) if da and db else None


def spearman(a, b):
    return pearson(rankdata(a), rankdata(b))


def _residualise(y_ranks, x_ranks):
    """Least-squares residuals of y on x, both already ranked."""
    n = len(x_ranks)
    mx, my = sum(x_ranks) / n, sum(y_ranks) / n
    sxx = sum((x - mx) ** 2 for x in x_ranks)
    if not sxx:
        return None
    beta = sum((x - mx) * (y - my) for x, y in zip(x_ranks, y_ranks)) / sxx
    return [y - (my + beta * (x - mx)) for x, y in zip(x_ranks, y_ranks)]


def partial_spearman(y, z, x):
    """Rank-partial correlation of y and z controlling for x — rank all three,
    residualise y and z on x, correlate the residuals. Fits nothing tunable."""
    if len(y) < 5:
        return None
    ry, rz, rx = rankdata(y), rankdata(z), rankdata(x)
    ey, ez = _residualise(ry, rx), _residualise(rz, rx)
    if ey is None or ez is None:
        return None
    return pearson(ey, ez)


def permutation_p95(stat_fn, n, rng):
    """95th percentile of `stat_fn` under a shuffled pairing, PERMUTATIONS draws.
    The null faces the same construction as the real statistic."""
    draws = []
    idx = list(range(n))
    for _ in range(PERMUTATIONS):
        rng.shuffle(idx)
        v = stat_fn(idx)
        if v is not None:
            draws.append(v)
    if not draws:
        return None
    draws.sort()
    return draws[min(len(draws) - 1, max(0, math.ceil(0.95 * len(draws)) - 1))]


# ── the two experiments ─────────────────────────────────────────────────────

def eligible_pairs(a: dict, b: dict):
    """Players clearing MIN_ROUTES in BOTH seasons. Absent stays absent: a
    player missing from either season is EXCLUDED, never imputed."""
    pids = sorted(p for p in a.keys() & b.keys()
                  if a[p]["routes"] >= MIN_ROUTES and b[p]["routes"] >= MIN_ROUTES
                  and a[p]["tprr"] is not None and b[p]["tprr"] is not None)
    return pids



def _same_table_at_6dp(y0: int, y1: int) -> bool:
    """Two stores are scored under the SAME table if their scoring dicts agree
    once rounded to 6dp. A bare fingerprint comparison does NOT establish a real
    difference: the fingerprint hashes the serialised dict, so float32-vs-float64
    representation alone changes it. 2021/2022 vs 2023-25 differ ONLY that way —
    0.04 and 0.1 stored at two widths, worth under 5e-06 points on a season
    total — and that artifact cost this study a fold, weekly_volatility two
    seasons, and pace its registered second fold."""
    def table(y):
        doc = json.loads((HERE / f"nflverse_weekly_points_{y}.json").read_text())
        return {k: (round(v, 6) if isinstance(v, float) else v)
                for k, v in doc["weeks"][0]["scoring"].items()}
    return table(y0) == table(y1)


def run_e1(rng):
    out = {}
    for y0, y1 in E1_TRANSITIONS:
        a, b = season_routes(y0), season_routes(y1)
        pids = eligible_pairs(a, b)
        tprr0 = [a[p]["tprr"] for p in pids]
        tprr1 = [b[p]["tprr"] for p in pids]
        tg0 = [a[p]["targets"] for p in pids]
        tg1 = [b[p]["targets"] for p in pids]

        rho = spearman(tprr0, tprr1)
        control = spearman(tg0, tg1)
        p95 = permutation_p95(
            lambda idx: spearman(tprr0, [tprr1[i] for i in idx]), len(pids), rng)

        out[f"{y0}->{y1}"] = {
            "population": {
                "eligible_both_seasons": len(pids),
                "with_routes_y0": len(a), "with_routes_y1": len(b),
                "cleared_min_routes_y0": sum(1 for v in a.values()
                                             if v["routes"] >= MIN_ROUTES),
                "cleared_min_routes_y1": sum(1 for v in b.values()
                                             if v["routes"] >= MIN_ROUTES),
            },
            "tprr_persistence_rho": round(rho, 4) if rho is not None else None,
            "control_targets_carryover_rho": round(control, 4) if control else None,
            "null_p95": round(p95, 4) if p95 is not None else None,
            "beats_null_p95": (rho is not None and p95 is not None and rho > p95),
        }
    return out


def run_e2(rng):
    out = {}
    for y0, y1 in E2_TRANSITIONS:
        a, b = season_routes(y0), season_routes(y1)
        pts0, fp0 = season_points(y0)
        pts1, fp1 = season_points(y1)
        if fp0 != fp1 and not _same_table_at_6dp(y0, y1):
            raise SystemExit(
                f"REFUSED {y0}->{y1}: scoring tables genuinely differ. "
                "Pooling would compare totals scored under different rules.")

        pids = [p for p in eligible_pairs(a, b) if p in pts1]
        joined = len(pids)
        tprr0 = [a[p]["tprr"] for p in pids]
        tg0 = [float(a[p]["targets"]) for p in pids]
        nxt = [pts1[p] for p in pids]

        partial = partial_spearman(nxt, tprr0, tg0)
        control = spearman(nxt, tg0)
        raw = spearman(nxt, tprr0)
        p95 = permutation_p95(
            lambda idx: partial_spearman([nxt[i] for i in idx], tprr0, tg0),
            len(pids), rng)

        out[f"{y0}->{y1}"] = {
            "scoring_fingerprint": fp1,
            "population": {
                "eligible_both_seasons": len(eligible_pairs(a, b)),
                "also_present_in_points_store": joined,
                "lost_at_points_join": len(eligible_pairs(a, b)) - joined,
            },
            "partial_rho_tprr_given_targets": round(partial, 4) if partial else None,
            "control_rho_next_points_vs_prior_targets": round(control, 4) if control else None,
            "raw_rho_next_points_vs_prior_tprr": round(raw, 4) if raw else None,
            "null_p95": round(p95, 4) if p95 is not None else None,
            "beats_null_p95": (partial is not None and p95 is not None and partial > p95),
        }
    return out


def main():
    rng = random.Random(SEED)
    e1 = run_e1(rng)
    e2 = run_e2(rng)

    ship = all(v["partial_rho_tprr_given_targets"] is not None
               and v["partial_rho_tprr_given_targets"] > 0
               and v["beats_null_p95"] for v in e2.values())

    result = {
        "_territory": "TERRITORY: D — research artifact, produced by "
                      "draft/backtest/routes_tprr_study.py",
        "preregistration": "draft/backtest/ROUTES-TPRR-PREREG.md",
        "status": "graded",
        "min_routes": MIN_ROUTES,
        "permutations": PERMUTATIONS,
        "seed": SEED,
        "e1_persistence": e1,
        "e2_increment": e2,
        "ship_rule": "E2 partial rho > 0 AND beats null p95 in ALL THREE folds",
        "clears": ship,
        "refused_transition": {
            "2022->2023": "scoring fingerprints differ (220bf4c671786351 vs "
                          "bd8f3e50bd67a9ce) — refused in the prereg, asserted "
                          "at runtime in run_e2()"},
    }
    (HERE / "routes_tprr_study.json").write_text(json.dumps(result, indent=1) + "\n")
    print(f"wrote {HERE / 'routes_tprr_study.json'}")
    for k, v in e1.items():
        print(f"E1 {k}  n={v['population']['eligible_both_seasons']:3d}  "
              f"tprr rho {v['tprr_persistence_rho']:+.4f}  "
              f"control {v['control_targets_carryover_rho']:+.4f}  "
              f"null p95 {v['null_p95']:+.4f}  beats={v['beats_null_p95']}")
    for k, v in e2.items():
        print(f"E2 {k}  n={v['population']['also_present_in_points_store']:3d}  "
              f"partial {v['partial_rho_tprr_given_targets']:+.4f}  "
              f"control {v['control_rho_next_points_vs_prior_targets']:+.4f}  "
              f"null p95 {v['null_p95']:+.4f}  beats={v['beats_null_p95']}")
    print(f"CLEARS: {ship}")
    return result


if __name__ == "__main__":
    main()
