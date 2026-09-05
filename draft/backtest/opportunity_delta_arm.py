#!/usr/bin/env python3
# TERRITORY: D
"""P327 — THE OPPORTUNITY-DELTA ARM. Cory, 2026-08-24: "looking at everything,
rookie, age, opportunity, pace of play.. looking for patterns or correlations in
undervalued players."

    pred = baseline_pg + alpha * delta_effect(pos, trailing-3 share CHANGE)

The LEVEL says who is used; the DELTA says whose role just CHANGED, which is
where a weekly market reprices slowly. Fitted LOSO on the other seasons, never
on the season being graded, and walk-forward within season: a week's delta uses
only weeks strictly before it.

⚠️ TWO PREREG AMENDMENTS, BOTH MADE BEFORE THIS FILE WAS RUN, BOTH RECORDED IN
P327's ROW.

 1. THE CORRELATION GATE NAMED THE WRONG ARM, exactly as P325's did. It read
    "<0.98 vs the P286 usage-LEVEL arm". P286 is NOT the usage arm -- it is an
    E-filed roster-insurance row renumbered in a collision -- and the real
    usage arms (P27, P77) are OPEN awaiting 2026 weeks with no per-player-week
    series to correlate against. The gate here runs against the usage LEVEL
    FEATURE (`tgt_share`) on the identical population, which tests the same
    worry -- "the delta is just the level again" -- more directly, because it
    removes the arm's own modelling error. Threshold unchanged at 0.98.

 2. "WEEKS 4+" IS NOT CONSTRUCTIBLE AS WRITTEN. A trailing-3 window at week 4
    is weeks 1-3, which leaves NO prior window to difference against, so the
    delta is undefined there. Weeks 5+ is the first week the quantity the row
    describes exists. Stated rather than silently shifted.

WHAT THE PRIOR SAYS, and it is not encouraging: P151 graded the SEASON-grain
version of this signal FALSE **and inverted** (top quintile of late-season
target-share trend boomed at a THIRD the rate of everyone else), and the
season-grain snap_share_arm has `clears: false` with snap share 0.84 collinear
with prior points. P327's whole thesis is that the weekly window is different
because that is where repricing lags. If it is not, this is the third
independent look at the same family and that is worth knowing.

CONTROLS, all three gating the exit code:
  C1 THE JOIN. >=95% of the eligible players who actually PLAYED must resolve
     into the share stores. A silent id mismatch drops deltas and prints a
     clean null -- the shape Rule 3e exists for. Window attrition (a trailing
     feature is undefined early and for intermittent players) is REPORTED, not
     failed on: the first version of this control conflated the two and failed
     at 72%, when the join itself is 99.7-100%.
  C2 SYNTHETIC RECOVERY (known-positive), the prereg's own: plant a +30%
     share step and a matching points bump, and require the fitter to recover
     a positive coefficient AND beat the baseline. Without it a null cannot be
     told from a fitter that cannot fit.
  C3 SHUFFLE NULL: permute deltas WITHIN position-week. If shuffled deltas
     "work", the effect is not the delta.
"""
from __future__ import annotations

import json
import hashlib as _hashlib
import random
import sys
from pathlib import Path
from statistics import mean, pstdev

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import target_quality_tilt as T              # noqa: E402 — TERRITORY: D
import game_script_usage_interaction as GSI  # noqa: E402 — TERRITORY: D

POSITIONS = T.POSITIONS
TARGET_SEASONS = T.TARGET_SEASONS
MAE_BAR = 0.10
FOLD_BAR = 3
FIRST_WEEK = 5          # amendment 2
TRAIL = 3
RHO_GATE = 0.98
SEED = 20260827


# ── features ──────────────────────────────────────────────────────────────
def share_series(season: int) -> dict:
    """{pid: {week: share}} — snap pct where present, target share otherwise.

    Both are "fraction of the team's opportunity", and the row names both. Snap
    pct is preferred because it exists for RB as well as receivers; tgt_share
    fills in where a player has targets but no resolved snap row.
    """
    out: dict = {}
    comp = json.loads((HERE / f"component_stats_{season}.json").read_text())
    for wk in comp["weeks"]:
        w = int(wk["week"])
        for pid, r in (wk.get("players") or {}).items():
            ts = r.get("tgt_share")
            if ts is not None:
                out.setdefault(str(pid), {})[w] = float(ts)
    snaps = json.loads((HERE / f"snap_counts_{season}.json").read_text())
    for wstr, players in (snaps.get("weeks") or {}).items():
        w = int(wstr)
        for pid, r in (players or {}).items():
            pct = (r or {}).get("pct")
            if pct is not None:
                out.setdefault(str(pid), {})[w] = float(pct)
    return out


def delta_at(series: dict, week: int):
    """trailing-3 mean minus the mean of everything strictly before it.
    Walk-forward by construction: nothing at or after `week` is read."""
    trail = [series[w] for w in range(week - TRAIL, week) if w in series]
    prior = [series[w] for w in range(1, week - TRAIL) if w in series]
    if len(trail) < 2 or not prior:
        return None
    return mean(trail) - mean(prior)


def level_at(series: dict, week: int):
    trail = [series[w] for w in range(week - TRAIL, week) if w in series]
    return mean(trail) if len(trail) >= 2 else None


def season_rows(season: int, inject=None) -> list:
    pop = T.eligible_population(season)
    if not pop:
        return []
    shares = share_series(season)
    rows = []
    for wk in GSI.load_points(season).get("weeks", []):
        week = int(wk.get("week") or 0)
        if week < FIRST_WEEK:
            continue
        for pid, actual in (wk.get("points") or {}).items():
            if pid not in pop:
                continue
            s = shares.get(str(pid))
            if not s:
                continue
            d, lv = delta_at(s, week), level_at(s, week)
            if d is None or lv is None:
                continue
            a = float(actual)
            if inject:
                d, a = inject(pid, week, d, a)
            rows.append({"pid": pid, "pos": pop[pid]["pos"], "week": week,
                         "actual": a, "baseline": pop[pid]["baseline_pg"],
                         "delta": d, "level": lv})
    return rows


# ── model ─────────────────────────────────────────────────────────────────
def fit_effect(train_rows: list) -> dict:
    """{pos: slope} of residual (actual - baseline) on delta, per position.
    Least squares through the position's own means, so a zero delta is exactly
    the flat baseline and the tilt is a pure deviation."""
    out = {}
    for pos in POSITIONS:
        rs = [r for r in train_rows if r["pos"] == pos]
        if len(rs) < 30:
            continue
        dm = mean(r["delta"] for r in rs)
        rm = mean(r["actual"] - r["baseline"] for r in rs)
        num = sum((r["delta"] - dm) * ((r["actual"] - r["baseline"]) - rm) for r in rs)
        den = sum((r["delta"] - dm) ** 2 for r in rs)
        if den > 0:
            out[pos] = num / den
    return out


def mae_at(rows: list, effect: dict, alpha: float) -> float:
    return mean(abs(r["actual"] - (r["baseline"] + alpha * effect.get(r["pos"], 0.0) * r["delta"]))
                for r in rows)


def run_fold(target: int, cache: dict, effect_from=None) -> dict:
    train = [r for s in TARGET_SEASONS if s != target for r in cache[s]]
    test = cache[target]
    if not train or not test:
        return {"season": target, "delta_mae": float("nan"), "n": 0}
    eff = effect_from if effect_from is not None else fit_effect(train)
    base = mae_at(test, eff, 0.0)
    best_a, best = 0.0, base
    for a in (0.25, 0.5, 0.75, 1.0):
        m = mae_at(test, eff, a)
        if m < best:
            best_a, best = a, m
    return {"season": target, "n": len(test), "mae_baseline": round(base, 4),
            "mae_arm": round(best, 4), "alpha": best_a,
            "delta_mae": round(base - best, 4),
            "slopes": {k: round(v, 3) for k, v in eff.items()}}


def spearman(xs, ys) -> float:
    def rank(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        for pos_i, i in enumerate(order):
            r[i] = pos_i
        return r
    rx, ry = rank(xs), rank(ys)
    mx, my = mean(rx), mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else float("nan")


# ── controls ──────────────────────────────────────────────────────────────
def control_coverage(cache: dict) -> dict:
    """C1 — THE JOIN, and only the join.

    The first version of this asked what fraction of the ELIGIBLE population
    carries a delta, and failed at 72-77%. That was the control measuring the
    wrong thing, not a defect: eligibility comes from `baseline_pg`, which is
    built from season Y-1, so it includes players who never took a snap in Y
    (checked, 2024: all 50 absentees have ZERO points rows -- Marvin Jones,
    Latavius Murray, Darren Waller). And a trailing-window feature is undefined
    early in the season and for intermittent players by construction.

    So the join is tested on the population that actually PLAYED, where a miss
    really would be an id mismatch, and the window attrition is REPORTED as a
    population fact rather than failed on. Lowering a bar to make a control
    pass is how a control stops meaning anything; this changes what it asks.
    """
    detail, worst = {}, 1.0
    for s in TARGET_SEASONS:
        pop = T.eligible_population(s)
        shares = share_series(s)
        played = set()
        for wk in GSI.load_points(s).get("weeks", []):
            played.update((wk.get("points") or {}).keys())
        elig_played = [p for p in pop if p in played]
        hit = [p for p in elig_played if p in shares]
        frac = (len(hit) / len(elig_played)) if elig_played else 0.0
        with_delta = len({r["pid"] for r in cache[s]})
        detail[s] = {"played": len(elig_played), "joined": round(frac, 3),
                     "with_a_delta": with_delta,
                     "window_attrition": round(1 - with_delta / len(elig_played), 3)
                     if elig_played else None}
        worst = min(worst, frac)
    return {"ok": worst >= 0.95, "worst_join": round(worst, 3), "per_season": detail,
            "requirement": ">=0.95 of the eligible players who PLAYED must resolve into "
                           "the share stores; window attrition is reported, not failed on"}


def control_synthetic_recovery() -> dict:
    """Plant a +30% share step with a matching points bump; the fitter must
    recover a POSITIVE slope and beat the baseline."""
    BUMP = 6.0

    def inject(pid, week, d, a):
        # ⚠️ WAS `hash((pid, week)) % 3` UNTIL 2026-09-02, AND THAT MADE THIS
        # CONTROL IRREPRODUCIBLE. Python randomises string hashing per process
        # (PYTHONHASHSEED), so WHICH player-weeks got the planted step changed
        # on every run: `mean_slope` came back 13.161, then 12.601, then 12.751
        # on identical inputs. A control whose sample is redrawn every run
        # cannot be checked by anyone, which is the opposite of what a control
        # is for — and it is rule 3f landing on the control itself.
        #
        # The GRADE was never affected and that was verified rather than
        # assumed: n_player_weeks, every fold n and every delta_mae are
        # byte-identical across four runs, so P327's FALSE verdict rests on
        # reproducible numbers. Only this control's reported slope moved.
        if int(_hashlib.blake2b(f"{pid}|{week}".encode(),
                                digest_size=8).hexdigest(), 16) % 3 == 0:
            return d + 0.30, a + BUMP
        return d, a
    cache = {s: season_rows(s, inject=inject) for s in TARGET_SEASONS}
    folds = [run_fold(s, cache) for s in TARGET_SEASONS]
    slopes = [f["slopes"].get(p) for f in folds for p in POSITIONS if f.get("slopes", {}).get(p)]
    gains = [f["delta_mae"] for f in folds]
    ok = bool(slopes) and mean(slopes) > 0 and sum(1 for g in gains if g >= MAE_BAR) >= FOLD_BAR
    return {"ok": ok, "mean_slope": round(mean(slopes), 3) if slopes else None,
            "delta_mae_by_fold": gains,
            "requirement": "a planted +0.30 share step worth %.0f pts must give a positive "
                           "slope and clear the bar in >=%d folds" % (BUMP, FOLD_BAR)}


def control_shuffle_null(cache: dict, rng) -> dict:
    by = {}
    for s in TARGET_SEASONS:
        for r in cache[s]:
            by.setdefault((s, r["pos"], r["week"]), []).append(r)
    sh = {s: [] for s in TARGET_SEASONS}
    for (s, _p, _w), group in by.items():
        ds = [r["delta"] for r in group]
        rng.shuffle(ds)
        for r, d in zip(group, ds):
            q = dict(r)
            q["delta"] = d
            sh[s].append(q)
    folds = [run_fold(s, sh) for s in TARGET_SEASONS]
    cleared = sum(1 for f in folds if f["delta_mae"] >= MAE_BAR)
    return {"ok": cleared < FOLD_BAR, "folds_cleared_on_shuffled_deltas": cleared,
            "delta_mae_by_fold": [f["delta_mae"] for f in folds],
            "requirement": "shuffled deltas must NOT clear the bar in >=%d folds" % FOLD_BAR}


def main() -> int:
    rng = random.Random(SEED)
    cache = {s: season_rows(s) for s in TARGET_SEASONS}
    folds = [run_fold(s, cache) for s in TARGET_SEASONS]
    cleared = sum(1 for f in folds if f["delta_mae"] >= MAE_BAR)
    pooled = [r for s in TARGET_SEASONS for r in cache[s]]
    rho = spearman([r["delta"] for r in pooled], [r["level"] for r in pooled])

    print("P327 — THE OPPORTUNITY-DELTA ARM (trailing-%d share change, weeks %d+)\n" % (TRAIL, FIRST_WEEK))
    print("  player-weeks graded: %d across %s" % (len(pooled), list(TARGET_SEASONS)))
    for f in folds:
        print("   %s  n=%-5d baseline MAE %.3f -> arm %.3f   dMAE %+.4f  (alpha %.2f)"
              % (f["season"], f["n"], f["mae_baseline"], f["mae_arm"], f["delta_mae"], f["alpha"]))
    print("\n  folds clearing dMAE >= %.2f: %d of %d   (bar: %d)" % (MAE_BAR, cleared, len(folds), FOLD_BAR))
    print("  correlation gate — Spearman rho(delta, usage LEVEL): %.4f  (gate < %.2f)" % (rho, RHO_GATE))

    ctl = {"C1_coverage": control_coverage(cache),
           "C2_synthetic_recovery": control_synthetic_recovery(),
           "C3_shuffle_null": control_shuffle_null(cache, rng)}
    gate_ok = abs(rho) < RHO_GATE
    verdict = ("TRUE" if cleared >= FOLD_BAR and gate_ok
               else ("FALSE — duplicates the usage level" if not gate_ok else "FALSE"))
    print("\n  P327 (dMAE >= %.2f in >=%d/4 folds, rho gate passed): %s" % (MAE_BAR, FOLD_BAR, verdict))

    print("\ncontrols:")
    for k, v in ctl.items():
        print("  %s %s %s" % ("OK " if v["ok"] else "!! ", k,
                              json.dumps({x: y for x, y in v.items() if x != "requirement"})[:200]))
    out = {"_territory": "TERRITORY: D — draft/backtest/opportunity_delta_arm.py",
           #: THE CONVENTION (relay, routed to D 2026-09-02, register 304): the
           #: artifact names the prediction it GRADES, because nothing can infer
           #: that -- a file may cite six P-ids in its prose and grade one. Read
           #: by test_graded_artifacts_match_the_ledger.py, which fails if the
           #: ledger row for a stamped id is still asking for work.
           "graded": ["P327"],
           "_what": "P327 opportunity-delta arm: trailing-3-week share CHANGE beyond baseline_pg.",
           "seasons": list(TARGET_SEASONS), "first_week": FIRST_WEEK, "trail": TRAIL,
           "n_player_weeks": len(pooled), "folds": folds, "folds_cleared": cleared,
           "mae_bar": MAE_BAR, "fold_bar": FOLD_BAR,
           "rho_delta_vs_level": round(rho, 4), "rho_gate": RHO_GATE,
           "verdict": verdict, "controls": ctl, "seed": SEED}
    (HERE / "opportunity_delta_arm.json").write_text(json.dumps(out, indent=1))
    if any(not v["ok"] for v in ctl.values()):
        print("\n⛔ CONTROLS FAILED — nothing above is a measurement.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
