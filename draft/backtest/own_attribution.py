# TERRITORY: A
"""EXACT per-player attribution for own_v6 — Cory's order, 2026-08-18.

"When our model says McCaffrey 195 and Sleeper says 256, the re-open ruling
needs to know what's driving our number." own_v6 is a LAYERED pipeline, so
attribution is exact arithmetic, not a SHAP approximation: each layer's delta
IS its contribution. This module re-runs the promoted stack stepwise (same
modules, same stores, zero network) and publishes the decomposition.

READ-ONLY over the model: changes nothing own_projections computes, feeds
nothing on the board (proj_ownmodel is display-only — engine.js never reads
it), exists so the post-08-22 blend ruling argues with named layers instead
of two black boxes.

Run: python3 draft/backtest/own_attribution.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SEASON = 2026


def build() -> dict:
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(HERE.parent))
    from own_model_v2 import (features_for, fit_transition, predict,
                              season_totals, RECENCY_WEIGHTS, POSITIONS)
    from own_model_v3 import (build_v3, league_draft_picks, market_ranks,
                              rank_curve)
    from own_model_v4 import (weekly_points, qb_active_games,
                              qb_availability_correction, build_v4)
    from own_model_v5 import comp_opinion, build_v5
    from own_model_v6 import build_v6
    import fetch_component_stats as FCS
    import own_projections as OP

    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    players = board["players"] + board.get("kept_players", [])
    prior = OP._discover_prior_years(OP._store_year_available, SEASON, 2)
    y1, y2 = prior[0], prior[1]

    positions = {str(p["player_id"]): p.get("position") for p in players
                 if p.get("position") in POSITIONS}
    ages = {str(p["player_id"]): p.get("age") for p in players}
    depth = {str(p["player_id"]): p.get("depth_chart_order") for p in players}
    names = {str(p["player_id"]): p.get("name") for p in players}

    # The stack, stepwise — mirrors compute_own_projections exactly.
    feat_fit = features_for(y1, (y2,), positions, ages)
    fits = fit_transition(feat_fit, season_totals(y1)[0])
    feat_now = features_for(SEASON, (y2, y1), positions, ages)
    v2 = predict(feat_now, fits)
    w1, w2 = RECENCY_WEIGHTS
    tot1, tot2 = season_totals(y1)[0], season_totals(y2)[0]
    blend = {pid: (w1 * v + w2 * tot2[pid]) if pid in tot2 else v
             for pid, v in tot1.items()}
    try:
        picks = league_draft_picks(SEASON)
    except ValueError:
        picks = {}
    curve = rank_curve(y1, positions) if picks else {}
    mrank = market_ranks(picks, positions) if picks else {}
    v3 = build_v3(v2, blend, mrank, curve, positions)
    wk = weekly_points(y1)
    corr, _mu = qb_availability_correction(qb_active_games(wk, positions))
    v4 = build_v4(v3, blend, corr, positions)
    implied = FCS.implied_team_totals(SEASON, 1, 1)
    comp = comp_opinion(SEASON, (y2, y1), positions, ages, implied)
    v5 = build_v5(v3, comp, blend, corr, mrank, curve, positions)
    v6 = build_v6(v4, v5, positions)

    rows = []
    for pid, final_pre_dampen in v6.items():
        pos = positions.get(pid)
        if not pos:
            continue
        base = v2.get(pid)
        r = {"player_id": pid, "name": names.get(pid), "position": pos,
             "ols_base": round(base, 1) if base is not None else None,
             "market_delta": round(v3.get(pid, 0) - v2.get(pid, 0), 1)
                             if pid in v3 and pid in v2 else None,
             "qb_availability_delta": round(v4.get(pid, 0) - v3.get(pid, 0), 1)
                             if pos == "QB" and pid in v4 and pid in v3 else None,
             "component_delta": round(v5.get(pid, 0) - v3.get(pid, 0), 1)
                             if pos != "QB" and pid in v5 and pid in v3 else None,
             "own_v6": round(final_pre_dampen, 1)}
        d = depth.get(pid)
        r["depth_chart_order"] = d
        rows.append(r)

    doc = {"_territory": "TERRITORY: A — written by own_attribution.py",
           "_what": ("EXACT layer attribution for own_v6 (pipeline deltas, not a "
                     "SHAP approximation): ols_base is the fitted two-year "
                     "regression; market_delta the league-draft market layer "
                     "(zero pre-draft by design); qb_availability_delta v4's "
                     "correction (QB only); component_delta v5's usage x "
                     "efficiency x availability opinion (RB/WR/TE only). "
                     "own_v6 = the composed number BEFORE depth-chart "
                     "dampening, which the board attach applies separately."),
           "season": SEASON, "fit_transition": f"{y2}->{y1}",
           "market_arm": bool(picks), "players": rows}
    out = json.dumps(doc, indent=1)
    (HERE / "own_attribution_2026.json").write_text(out)
    return doc


if __name__ == "__main__":
    d = build()
    named = [r for r in d["players"] if r["name"] == "Christian McCaffrey"]
    print(f"wrote own_attribution_2026.json: {len(d['players'])} players")
    if named:
        print("McCaffrey:", json.dumps(named[0]))
