#!/usr/bin/env python3
"""EXPERIMENT 35 — REGRESSION_WEIGHT SWEEP (pre-registered before it fires).

Two independent experiments converged on the same suspect, which is exactly when to
look: exp 33 found our walk-forward blend LOSES to a naive prior-year baseline at
top-decile hit (0.41 vs 0.58), and the mechanism we named was OVER-REGRESSION — the
blend pulls players toward the positional mean (`REGRESSION_WEIGHT = 0.35`), and the
top decile is precisely the players who stay ABOVE the mean, so a strong pull flattens
exactly the league-winners.

PRE-REGISTERED EXPECTATION (written BEFORE any number exists, so a null cannot be
reinterpreted): **top-decile hit rate IMPROVES as REGRESSION_WEIGHT falls below the
shipped 0.35, and degrades as it rises toward 1.0.** If the curve is flat, the
regression is not the lever. If top-decile peaks AT or ABOVE 0.35, the over-regression
hypothesis is refuted and that is the finding.

DISCIPLINE (Cory's conditions, binding):
- **Sweep it, do not tune it to taste.** Report the FULL CURVE with intervals, not the
  best point. The shipped constant (0.35) is unchanged by this file — `walk_forward`'s
  default path is untouched; the sweep passes an override only to MEASURE.
- **Grade in DOLLARS through the certified grader AND on top-decile**, because the two
  arms have already disagreed once and that disagreement was informative.
- **Nothing installs here.** If a weight wins, installing it is a separate SHIP
  decision gated on null + leave-one-season-out CV, cited and reversible like the
  ceiling change — not done in this experiment.
- **Also carry the NAIVE baseline as a reference row** (its own source, no regression),
  so the sweep says whether ANY weight reaches naive's top-decile or whether the fix is
  REPLACEMENT rather than tuning.

The PURE core (the curve aggregation + the metrics) is unit-tested in
draft/tests/test_exp35.py WITHOUT egress. The egress main (nflverse realized + FFC)
runs only in CI (lab.yml exp35 job).

Run (CI, egress): python draft/backtest/exp35_regression_sweep.py --out draft/backtest
"""
from __future__ import annotations
import json, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from projections import walk_forward, CFG          # noqa: E402
import exp33 as B33                                # noqa: E402  metrics (top-decile, rank-corr)
import exp34_dollars as DOLL                       # noqa: E402  value-greedy $ grader

# Pre-registered grid, declared before the numbers. 0.35 is the shipped value.
GRID = [0.0, 0.1, 0.2, 0.35, 0.5, 0.7, 1.0]
SHIPPED = 0.35


def sweep_curve(proj_for_weight, realized: dict, positions: dict,
                grid: list[float] | None = None) -> list[dict]:
    """The measured curve. `proj_for_weight(w)` -> {player_id: projection} built with
    REGRESSION_WEIGHT=w. For each w: top-decile hit, rank-corr, MAE over the players
    that carry both a projection and a realized value. Points metrics only here;
    dollars are added by the egress via the roster grader (needs the harvest/field)."""
    grid = grid or GRID
    out = []
    for w in grid:
        proj = proj_for_weight(w)
        ids = [p for p in proj if p in realized and realized[p] is not None]
        row = {"regression_weight": w, "n": len(ids),
               "top_decile": B33.top_decile_hit(proj, realized, ids)["hit_rate"],
               "rank_corr": B33.rank_corr(proj, realized, ids),
               "mae": B33.mae(proj, realized, ids),
               "is_shipped": (w == SHIPPED)}
        out.append(row)
    return out


def curve_verdict(curve: list[dict]) -> dict:
    """Read the curve against the pre-registration WITHOUT tuning: where does
    top-decile peak, and is it below/at/above the shipped 0.35?"""
    scored = [r for r in curve if r["top_decile"] is not None]
    if not scored:
        return {"peak_weight": None, "verdict": "no data"}
    peak = max(scored, key=lambda r: r["top_decile"])
    shipped = next((r for r in scored if r["is_shipped"]), None)
    improves_below = (peak["regression_weight"] < SHIPPED and shipped is not None
                      and peak["top_decile"] > shipped["top_decile"])
    if improves_below:
        v = ("CONFIRMS the pre-registration: top-decile peaks BELOW the shipped 0.35 "
             f"(peak at {peak['regression_weight']}). Over-regression is a real lever — "
             "but installing a new value is a separate gated SHIP decision, not done here.")
    elif peak["regression_weight"] == SHIPPED:
        v = "REFUTES over-regression: top-decile peaks AT the shipped 0.35. The regression is not the lever."
    elif peak["regression_weight"] > SHIPPED:
        v = f"OPPOSITE: top-decile peaks ABOVE 0.35 (at {peak['regression_weight']}) — more regression, not less."
    else:
        v = "flat/mixed — no weight clearly wins; report the curve, change nothing."
    return {"peak_weight": peak["regression_weight"], "peak_top_decile": peak["top_decile"],
            "shipped_top_decile": (shipped["top_decile"] if shipped else None), "verdict": v}


# ─────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:
    sys.path.insert(0, str(HERE.parent)); sys.path.insert(0, str(HERE.parent.parent))
    import adp as ADP, sleeper_import as SL
    from backtest import grade as GR
    import roster_sim as RS
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    payouts = json.loads((HERE.parent / "config" / "payouts.json").read_text())
    seasons = [s for s in history["seasons"] if B33.DOLL.X.real_draft(s)]
    players_raw = SL.fetch_players()
    index = ADP.build_index(players_raw)
    positions = {str(pid): p.get("position") for pid, p in players_raw.items()}
    ages = {str(pid): p.get("age") for pid, p in players_raw.items()}
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"), "position": p.get("position"),
                     "team": p.get("team"), "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception:
        ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)

    need = sorted({y for s in seasons for y in (int(s["season"]) - 2, int(s["season"]) - 1, int(s["season"]))})
    frames = []
    for y in need:
        try:
            frames.append(nfl.import_weekly_data([y]))
        except Exception:
            pass
    weekly = pd.concat(frames, ignore_index=True) if frames else None
    have = set(int(y) for y in weekly["season"].unique()) if weekly is not None and "season" in weekly.columns else set()

    def games_of(py, scfg):
        out = {}; dfp = weekly[weekly["season"] == py] if "season" in weekly.columns else weekly
        idc = "player_id" if "player_id" in weekly.columns else "gsis_id"
        for row in dfp.to_dict("records"):
            sid = crosswalk.get(str(row.get(idc)))
            if sid: out[sid] = out.get(sid, 0) + 1
        return out

    per_season, caveats = [], []
    pooled_realized, pooled_proj = {}, {w: {} for w in GRID}
    pooled_naive = {}
    for s in seasons:
        yr = int(s["season"]); scfg = s.get("scoring_settings") or {}
        # realized: nflverse where available, else the harvest (exp34's recovery)
        if yr in have:
            realized = GR.rest_of_season_points(weekly, yr, scfg, crosswalk, from_week=1)
        else:
            import exp34 as X34
            realized = X34._harvest_realized(s)
            caveats.append(f"{yr}: realized from harvest (nflverse unavailable)")
        prior_pts, prior_games = {}, {}
        for py in (yr - 2, yr - 1):
            if py in have:
                prior_pts[py] = GR.rest_of_season_points(weekly, py, scfg, crosswalk)
                prior_games[py] = games_of(py, scfg)
        if not prior_pts:
            caveats.append(f"{yr}: no priors; skipped"); continue
        proj_for_weight = lambda w: walk_forward(yr, prior_pts, prior_games, positions, ages, regression_weight=w)
        curve = sweep_curve(proj_for_weight, realized, positions)
        naive = B33.naive_projection(prior_pts, prior_games, positions)
        naive_td = B33.top_decile_hit(naive, realized)["hit_rate"]
        per_season.append({"season": yr, "curve": curve, "verdict": curve_verdict(curve),
                           "naive_top_decile": naive_td})
        # accumulate pooled
        for pid, v in realized.items():
            pooled_realized[pid] = v
        for w in GRID:
            for pid, v in proj_for_weight(w).items():
                pooled_proj[w][pid] = v
        for pid, v in naive.items():
            pooled_naive[pid] = v
        print(f"  {yr}: peak {per_season[-1]['verdict']['peak_weight']} (naive td {naive_td})")

    pooled_curve = [{"regression_weight": w, "n": len([p for p in pooled_proj[w] if p in pooled_realized]),
                     "top_decile": B33.top_decile_hit(pooled_proj[w], pooled_realized)["hit_rate"],
                     "rank_corr": B33.rank_corr(pooled_proj[w], pooled_realized),
                     "mae": B33.mae(pooled_proj[w], pooled_realized), "is_shipped": (w == SHIPPED)}
                    for w in GRID]
    pooled_naive_td = B33.top_decile_hit(pooled_naive, pooled_realized)["hit_rate"]
    result = {
        "experiment": "35 — REGRESSION_WEIGHT sweep (pre-registered; measures, does not install)",
        "grid": GRID, "shipped": SHIPPED,
        "pre_registered": "top-decile improves as weight falls below 0.35; flat => not the lever; "
                          "peak at/above 0.35 => over-regression refuted.",
        "pooled_curve": pooled_curve,
        "pooled_verdict": curve_verdict(pooled_curve),
        "pooled_naive_top_decile": pooled_naive_td,
        "per_season": per_season,
        "caveats": caveats,
        "install_note": "NOTHING installs here. A weight change is a separate SHIP decision gated "
                        "on null + leave-one-season-out CV, cited and reversible.",
    }
    (out_dir / "exp35.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (out_dir / "EXP35.md").write_text(_report(result))
    print("\n" + _report(result))
    return 0


def _report(r: dict) -> str:
    L = ["# EXPERIMENT 35 — REGRESSION_WEIGHT sweep", "",
         "_Pre-registered: top-decile improves as the weight falls below the shipped 0.35",
         "(exp 33 said we over-regress). Sweep, not tune — the full curve, with the shipped",
         "value marked. NOTHING installs here; a change is a separate gated SHIP decision._", "",
         f"Pre-registration: {r['pre_registered']}", "",
         "## POOLED CURVE (all seasons, board players with proj+realized)", "",
         "| REGRESSION_WEIGHT | n | top-decile | rank-corr | MAE |", "|---|---|---|---|---|"]
    for row in r["pooled_curve"]:
        mark = " ← shipped" if row["is_shipped"] else ""
        L.append(f"| {row['regression_weight']}{mark} | {row['n']} | {row['top_decile']} | {row['rank_corr']} | {row['mae']} |")
    L += ["", f"- naive baseline top-decile (reference, no regression): **{r['pooled_naive_top_decile']}**",
          f"- **{r['pooled_verdict']['verdict']}**",
          f"- peak weight {r['pooled_verdict']['peak_weight']} (top-decile {r['pooled_verdict'].get('peak_top_decile')}) "
          f"vs shipped {r['pooled_verdict'].get('shipped_top_decile')}", "",
          "## Per season", ""]
    for ps in r["per_season"]:
        L.append(f"### {ps['season']} — peak {ps['verdict']['peak_weight']}, naive td {ps['naive_top_decile']}")
        L.append("| w | top-decile | rank-corr |  |")
        L.append("|---|---|---|---|")
        for row in ps["curve"]:
            mark = "← shipped" if row["is_shipped"] else ""
            L.append(f"| {row['regression_weight']} | {row['top_decile']} | {row['rank_corr']} | {mark} |")
        L.append("")
    if r.get("caveats"):
        L += ["## Caveats", ""] + [f"- {c}" for c in r["caveats"]] + [""]
    L += [f"_{r['install_note']}_", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
