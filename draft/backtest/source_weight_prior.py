# TERRITORY: A
"""THE SOURCE-WEIGHT PRIOR — REC-2's Week-1 prior, built from the FP archive.

Ruling: Cory, verbatim, on this exact proposal: "Yes! If it works." —
conditional application. The construction rule, gates, thresholds, shrinkage
and wiring were fixed in draft/backtest/SOURCE-WEIGHT-PRIOR-PREREG.md,
committed BEFORE this file existed (the commit order is the proof). If any of
gates G1-G3 fails, this module writes the failed-gate record and learning_loop
consumes NOTHING — "if it works" cuts both ways.

WHAT IT IS. REC-2 (per-source per-position composition weights) is measured in
January 2027. Until then the artifact could only say "insufficient evidence" —
a flat prior. But three years of authenticity-gated FP-archive measurement
under OUR scoring (exp_fp_hist_proj.json) plus the measured 2026 pre-draft
Sleeper-vs-FP divergence (proj_series.json) are committed evidence TODAY.
This module turns them into a per-position prior over {sleeper, fantasypros}
that REC-2's January combine consumes and immediately down-weights as real
outcomes accumulate (n0 per position ~17-45 vs January cells at n 57-141).

WHAT IT REFUSES. proj_mean stays single-source Sleeper — this prior's only
consumer is the RECOMMENDATION artifact (regenerated weekly by scheduled
machinery). A composition change stays a separate January decision file.

Run: python draft/backtest/source_weight_prior.py
Writes draft/backtest/source_weight_prior.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
OUT = HERE / "source_weight_prior.json"

CUTOFF = "2026-08-22"            # REC-2's preregistered pre-draft cutoff
POSITIONS = ("QB", "RB", "WR", "TE")
TRANSFER_T = 0.5                 # class-transfer discount (prereg §2.5)
MAE_TO_RMSE = 1.2533             # sqrt(pi/2), zero-mean normal inversion (§2.2)
VAR_FLOOR_FRAC = 0.25            # var floor as a fraction of MSE_fp (§2.2)
BIAS_CLAIM_MIN = 5.0             # G2: fitted |bias| below this makes no claim
SCALE_BAND = 0.40                # G3: +/-40% relative MAE error
G4_MIN_N = {"QB": 25, "RB": 25, "WR": 25, "TE": 12}
G4_MAX_DATE_SPREAD_DAYS = 3


# ── input loading (committed files only — prereg §1) ─────────────────────────

def load_inputs(base: Path = HERE):
    fp = json.loads((base / "exp_fp_hist_proj.json").read_text())
    series = json.loads((base.parent / "data" / "proj_series.json").read_text())
    positions = json.loads(
        (base.parent / "data" / "player_positions.json").read_text())
    return fp, series.get("series") or [], (positions.get("positions") or {})


def fp_year_cells(fp_doc: dict) -> dict:
    """{year: {pos: {n, mae, bias, spearman}}} for graded years only."""
    out = {}
    for y, yd in (fp_doc.get("years") or {}).items():
        if yd.get("status") != "graded":
            continue
        cells = ((yd.get("metrics") or {}).get("fp_cells")) or {}
        row = {p: c for p, c in cells.items() if c.get("status") == "measured"}
        if row:
            out[str(y)] = row
    return out


def h2h_tables(fp_doc: dict) -> dict:
    """{year: {pos: head-to-head cell}} for years whose h2h is measured."""
    out = {}
    for y, yd in (fp_doc.get("years") or {}).items():
        h = ((yd.get("metrics") or {}).get("head_to_head_shared_population")) or {}
        if h.get("status") == "no_baselines_available":
            continue
        row = {p: c for p, c in h.items()
               if isinstance(c, dict) and c.get("status") == "measured"}
        if row:
            out[str(y)] = row
    return out


# ── the divergence join (prereg §2.3, health-gated by G4) ────────────────────

def last_pre_cutoff(series: list, source: str, cutoff: str = CUTOFF):
    rows = [s for s in series
            if s.get("source") == source and (s.get("date") or "") <= cutoff]
    return max(rows, key=lambda s: s.get("date") or "") if rows else None


def _median(vals):
    v = sorted(vals)
    n = len(v)
    if not n:
        return None
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2.0


def divergence_by_position(series: list, positions: dict,
                           cutoff: str = CUTOFF) -> dict:
    """Per-position median (sleeper - fantasypros) on same-player joins from
    the two last pre-cutoff snapshots, plus the G4 health facts."""
    sl = last_pre_cutoff(series, "sleeper", cutoff)
    fpx = last_pre_cutoff(series, "fantasypros", cutoff)
    out = {"snapshot_dates": {"sleeper": sl and sl.get("date"),
                              "fantasypros": fpx and fpx.get("date")}}
    if not sl or not fpx:
        out["status"] = "missing_snapshot"
        return out
    d_sl = sl.get("proj") or {}
    d_fp = fpx.get("proj") or {}
    gaps: dict[str, list] = {p: [] for p in POSITIONS}
    for pid, v in d_sl.items():
        if pid in d_fp and positions.get(pid) in gaps:
            gaps[positions[pid]].append(float(v) - float(d_fp[pid]))
    # date spread in days (dates are ISO yyyy-mm-dd; string math is unsafe,
    # so parse properly)
    from datetime import date
    def _d(s):
        y, m, dd = (int(x) for x in s.split("-"))
        return date(y, m, dd)
    spread = abs((_d(sl["date"]) - _d(fpx["date"])).days)
    out["date_spread_days"] = spread
    out["by_position"] = {
        p: {"n": len(gaps[p]), "median_gap": (round(_median(gaps[p]), 2)
                                              if gaps[p] else None)}
        for p in POSITIONS}
    out["status"] = "measured"
    return out


# ── gates (prereg §3) ────────────────────────────────────────────────────────

def gate1_skill_sign(h2h: dict) -> dict:
    """G1: FP beats every measured baseline at all 4 positions, each h2h
    year independently."""
    cells = []
    for y, table in sorted(h2h.items()):
        for p in POSITIONS:
            c = table.get(p)
            if not c:
                cells.append({"year": y, "pos": p, "ok": False,
                              "why": "position unmeasured"})
                continue
            fp_mae = c["fantasypros"]["mae"]
            for base in ("naive_prev", "recency_blend"):
                if base in c:
                    cells.append({"year": y, "pos": p, "baseline": base,
                                  "fp_mae": fp_mae, "base_mae": c[base]["mae"],
                                  "ok": fp_mae < c[base]["mae"]})
    return {"cells": cells, "pass": bool(cells) and all(c["ok"] for c in cells)}


def _loo_folds(years: list) -> list:
    return [(y, [x for x in years if x != y]) for y in years]


def gate2_bias_sign(cells_by_year: dict) -> dict:
    """G2: LOO bias-sign persistence; fitted |bias| <= BIAS_CLAIM_MIN makes
    no claim in that fold."""
    years = sorted(cells_by_year)
    folds = []
    ok = True
    for held, fit in _loo_folds(years):
        for p in POSITIONS:
            fit_biases = [cells_by_year[y][p]["bias"] for y in fit
                          if p in cells_by_year[y]]
            if len(fit_biases) < 2 or p not in cells_by_year[held]:
                folds.append({"held_out": held, "pos": p, "claim": False,
                              "why": "insufficient cells"})
                continue
            fitted = sum(fit_biases) / len(fit_biases)
            if abs(fitted) <= BIAS_CLAIM_MIN:
                folds.append({"held_out": held, "pos": p, "claim": False,
                              "fitted_bias": round(fitted, 2)})
                continue
            realized = cells_by_year[held][p]["bias"]
            same = (fitted > 0) == (realized > 0)
            folds.append({"held_out": held, "pos": p, "claim": True,
                          "fitted_bias": round(fitted, 2),
                          "held_out_bias": realized, "ok": same})
            ok = ok and same
    return {"folds": folds, "pass": ok}


def gate3_scale_transfer(cells_by_year: dict) -> dict:
    """G3: LOO error-scale transfer within +/-SCALE_BAND relative MAE."""
    years = sorted(cells_by_year)
    folds = []
    ok = True
    for held, fit in _loo_folds(years):
        for p in POSITIONS:
            fit_maes = [cells_by_year[y][p]["mae"] for y in fit
                        if p in cells_by_year[y]]
            if len(fit_maes) < 2 or p not in cells_by_year[held]:
                folds.append({"held_out": held, "pos": p, "ok": False,
                              "why": "insufficient cells"})
                ok = False
                continue
            fitted = sum(fit_maes) / len(fit_maes)
            realized = cells_by_year[held][p]["mae"]
            rel = abs(fitted - realized) / realized
            good = rel <= SCALE_BAND
            folds.append({"held_out": held, "pos": p,
                          "fitted_mae": round(fitted, 2),
                          "held_out_mae": realized,
                          "rel_err": round(rel, 3), "ok": good})
            ok = ok and good
    return {"folds": folds, "pass": ok}


def gate4_divergence_health(div: dict) -> dict:
    """G4: degrades a position (gap := 0), never fails the build."""
    out = {"per_position": {}, "date_spread_days": div.get("date_spread_days")}
    spread = div.get("date_spread_days")
    spread_ok = (div.get("status") == "measured" and spread is not None
                 and spread <= G4_MAX_DATE_SPREAD_DAYS)
    for p in POSITIONS:
        cell = ((div.get("by_position") or {}).get(p)) or {}
        n = cell.get("n") or 0
        healthy = bool(spread_ok and n >= G4_MIN_N[p]
                       and cell.get("median_gap") is not None)
        out["per_position"][p] = {
            "n": n, "needed": G4_MIN_N[p], "healthy": healthy,
            "effect_when_unhealthy": "gap := 0 (equal-professional weight prior, named)"}
    return out


# ── construction (prereg §2) ─────────────────────────────────────────────────

def build_prior(cells_by_year: dict, div: dict, g4: dict) -> dict:
    prior = {}
    for p in POSITIONS:
        yearly = [cells_by_year[y][p] for y in sorted(cells_by_year)
                  if p in cells_by_year[y]]
        if len(yearly) < 2:
            prior[p] = {"status": "unmeasurable", "why": "fewer than 2 archive cells"}
            continue
        mae_fp = sum(c["mae"] for c in yearly) / len(yearly)
        bias_fp = sum(c["bias"] for c in yearly) / len(yearly)
        n_mean = sum(c["n"] for c in yearly) / len(yearly)
        mse_fp = (MAE_TO_RMSE * mae_fp) ** 2
        var = max(mse_fp - bias_fp ** 2, VAR_FLOOR_FRAC * mse_fp)
        healthy = g4["per_position"][p]["healthy"]
        gap = (((div.get("by_position") or {}).get(p) or {}).get("median_gap")
               if healthy else 0.0) or 0.0
        bias_sl = bias_fp + gap
        mse_sl = var + bias_sl ** 2
        inv_fp, inv_sl = 1.0 / mse_fp, 1.0 / mse_sl
        tot = inv_fp + inv_sl
        n0 = round(TRANSFER_T ** 2 * n_mean)
        prior[p] = {
            "status": "measured",
            "expected_mae_professional": round(mae_fp, 2),
            "mae_band_across_years": [round(min(c["mae"] for c in yearly), 2),
                                      round(max(c["mae"] for c in yearly), 2)],
            "bias_prior": {"fantasypros": round(bias_fp, 2),
                           "sleeper": round(bias_sl, 2),
                           "gap_2026_median": round(gap, 2),
                           "gap_used": healthy},
            "mse_prior": {"fantasypros": round(mse_fp, 1),
                          "sleeper": round(mse_sl, 1)},
            "weights": {"fantasypros": round(inv_fp / tot, 4),
                        "sleeper": round(inv_sl / tot, 4)},
            "n0": n0,
        }
    return prior


# ── the posterior combine REC-2 consumes (prereg §5; G5 pins both arms) ─────

def combine_with_measured(prior_cell: dict, measured: dict | None) -> dict:
    """Posterior weights for one position given the prior cell and REC-2's
    measured January cells ({source: {mse, n}} or None). Pure — the January
    run and the unit test share this exact code path."""
    if not prior_cell or prior_cell.get("status") != "measured":
        return {"status": "no_prior", "weights": None}
    n0 = prior_cell["n0"]
    mse_prior = prior_cell["mse_prior"]
    if not measured:
        return {"status": "prior_only", "weights": dict(prior_cell["weights"]),
                "n0": n0}
    post = {}
    for src in ("fantasypros", "sleeper"):
        m = measured.get(src)
        if m and m.get("n", 0) > 0:
            n = m["n"]
            post[src] = (n0 * mse_prior[src] + n * m["mse"]) / (n0 + n)
        else:
            post[src] = mse_prior[src]
    inv = {s: 1.0 / max(v, 1e-9) for s, v in post.items()}
    tot = sum(inv.values())
    return {"status": "posterior",
            "weights": {s: round(v / tot, 4) for s, v in inv.items()},
            "n0": n0,
            "measured_n": {s: (measured.get(s) or {}).get("n", 0)
                           for s in ("fantasypros", "sleeper")}}


# ── the artifact ─────────────────────────────────────────────────────────────

def build_artifact(base: Path = HERE) -> dict:
    fp_doc, series, positions = load_inputs(base)
    cells = fp_year_cells(fp_doc)
    h2h = h2h_tables(fp_doc)
    div = divergence_by_position(series, positions)

    g1 = gate1_skill_sign(h2h)
    g2 = gate2_bias_sign(cells)
    g3 = gate3_scale_transfer(cells)
    g4 = gate4_divergence_health(div)

    passed = g1["pass"] and g2["pass"] and g3["pass"]
    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/source_weight_prior.py",
        "_prereg": "draft/backtest/SOURCE-WEIGHT-PRIOR-PREREG.md (committed before this module)",
        "_ruling": ("Cory, verbatim: 'Yes! If it works.' — conditional application; "
                    "a failed gate files this artifact as the honest negative and "
                    "wires nothing."),
        "status": "passed-gates" if passed else "failed-gate",
        "gates": {"G1_skill_sign": g1, "G2_bias_sign": g2,
                  "G3_scale_transfer": g3, "G4_divergence_health": g4},
        "g5_machinery_note": (
            "G5(b) as preregistered is ALSO unsatisfied by the preregistered "
            "n0 rule: at n0=t2*mean_n (45 at WR) a maximally-opposed prior "
            "deviates ~0.06 from pure measured weights at January n — outside "
            "the prereg's own 0.05 dominance bar. The two clauses conflict; "
            "resolving them (smaller t, or a looser bar) is a NEW "
            "preregistration decision. Pinned in "
            "draft/tests/test_source_weight_prior.py."),
        "divergence": div,
        "consumer": ("REC-2 in draft/data/model_update_recommendations.json — "
                     "regenerated weekly (Tue 13:30 UTC, weekly-grade.yml); "
                     "grade_frozen_sources combines this prior with January's "
                     "measured cells via combine_with_measured. proj_mean stays "
                     "single-source Sleeper; a composition change is a separate "
                     "January decision file."),
        "handoff": ("measured evidence outweighs the prior at n > n0 per position "
                    "— January's cells (n 57-141 by the archive's own range) "
                    "dominate the day they land"),
        "drift_monitor": ("player-week loop, sleeper arm, WR/TE cumulative bias: "
                          "NEGATIVE at n>=30 in any calibration snapshot "
                          "contradicts the transported gap -> flag "
                          "contradicted-in-season on the next weekly regeneration. "
                          "QB excluded by name (known 4pt-passTD weekly bias, a "
                          "different quantity)."),
    }
    doc["prior"] = build_prior(cells, div, g4) if passed else None
    return doc


def main() -> None:
    doc = build_artifact()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(HERE.parent.parent)} — status: {doc['status']}")
    for g, res in doc["gates"].items():
        if "pass" in res:
            print(f"  {g}: {'PASS' if res['pass'] else 'FAIL'}")
    if doc["prior"]:
        for p, c in doc["prior"].items():
            if c.get("status") == "measured":
                w = c["weights"]
                print(f"  {p}: fp {w['fantasypros']:.3f} / sl {w['sleeper']:.3f}"
                      f"  (n0={c['n0']}, exp MAE {c['expected_mae_professional']})")


if __name__ == "__main__":
    main()
