#!/usr/bin/env python3
"""TIER-GRADUATED CEILING BLEND — Cory's model: mean up top, tip toward ceiling as the
tier deepens; combined with VONA that IS the draft model. This grades the STRATEGY.

The principle: a tier-1 player you take for his floor (you can't replace an elite); a
deep-tier player is fungible, so his floor is worthless and you should swing for the
ceiling — the outcome that returns a league-winner. Formally, score each player at

    blended(tier) = proj_mean × (1 + w(tier) · cv)

where cv is his realized volatility (boom/bust) and w(tier) = min(cap, step·(tier−1))
ramps the ceiling weight from 0 in tier 1 upward. step = 0 is pure mean (the baseline
the board uses today). We SWEEP step and grade every curve — the "trial and error to
find the sweet spot," automated — through the CERTIFIED money layer plus the weekly-high
win-probability proxy, across 2023-25.

WHY THIS, WHY NOW. The MEAN is already ~solved (Sleeper≈FP, ρ=0.93 — more sites barely
move it). The FLAT ceiling tilt already graded NULL this session. So the open question
is the one thing untested: does concentrating the upside in the fungible tiers (and
keeping mean-discipline up top, where the flat tilt did its damage) beat pure mean?
Answer that on the two sources we have BEFORE building a five-site pipeline — if the
strategy doesn't clear here, more datasets won't rescue it; if it does, the range is
worth enriching.

Leak-free: proj_mean is walk-forward; cv and tiers come from PRIOR-season weekly only.
step is PRE-REGISTERED as a swept grid (not tuned to the answer — the whole curve is
reported). Thin (n=3 seasons): the per-season sign + proxy channel is the read.

Pure core (tiers, cv, blend) unit-tested; egress reuses the construction-objective +
exp34-dollar harness. Run (CI): python draft/backtest/exp_tier_ceiling.py
"""
from __future__ import annotations
import json, sys
from pathlib import Path
from statistics import mean as _mean, pstdev

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

STEP_GRID = (0.0, 0.10, 0.20, 0.30, 0.50)   # ceiling-weight ramp per tier; 0 = pure mean
W_CAP = 0.60          # a deep-tier pick still leans on the mean at least 40%
CV_CAP = 1.00         # clamp volatility so one noisy prior can't dominate
GAP_MULT = 1.5        # tier break when a gap exceeds this × the position's average gap
MIN_TIER = 2          # a tier needs at least this many players before a break


# ───────────────────────────────────────────────────────── pure core ──
def gap_tiers(value_by_id: dict[str, float], positions: dict[str, str],
              gap_mult: float = GAP_MULT, min_tier: int = MIN_TIER) -> dict[str, int]:
    """Assign a within-position tier to each player by projection GAPS (the board's own
    tiering shape): walk the position sorted high→low, open a new tier when the drop to
    the next player exceeds gap_mult × the position's average drop and the current tier
    already holds min_tier players. Tier 1 = the elite band."""
    by_pos: dict[str, list[tuple[str, float]]] = {}
    for pid, v in value_by_id.items():
        pos = positions.get(pid)
        if pos:
            by_pos.setdefault(pos, []).append((pid, float(v)))
    out: dict[str, int] = {}
    for _pos, rows in by_pos.items():
        rows.sort(key=lambda t: -t[1])
        gaps = [rows[i][1] - rows[i + 1][1] for i in range(len(rows) - 1)]
        avg = _mean(gaps) if gaps else 0.0
        tier, since = 1, 0
        for i, (pid, _v) in enumerate(rows):
            out[pid] = tier
            since += 1
            if i < len(gaps) and avg > 0 and gaps[i] > gap_mult * avg and since >= min_tier:
                tier += 1
                since = 0
    return out


def cv_by_id(series: dict[str, list[float]], cap: float = CV_CAP) -> dict[str, float]:
    """Coefficient of variation (weekly SD ÷ weekly mean) per player from prior weekly
    points — his boom/bust, clamped to [0, cap]. Flat/thin histories → 0 (no upside claim)."""
    out: dict[str, float] = {}
    for pid, pts in (series or {}).items():
        if len(pts) < 3:
            out[pid] = 0.0
            continue
        m = _mean(pts)
        out[pid] = max(0.0, min(cap, (pstdev(pts) / m) if m > 0 else 0.0))
    return out


def w_ceiling(tier: int, step: float, cap: float = W_CAP) -> float:
    """Ceiling weight for a tier: 0 in tier 1, +step per tier deeper, capped."""
    return max(0.0, min(cap, step * (max(1, tier) - 1)))


def blended_scores(proj: dict[str, float], cv: dict[str, float], tiers: dict[str, int],
                   step: float) -> dict[str, float]:
    """Cory's blend: mean × (1 + w(tier)·cv). step=0 returns the pure mean unchanged."""
    out = {}
    for pid, m in proj.items():
        out[pid] = float(m) * (1.0 + w_ceiling(tiers.get(pid, 1), step) * cv.get(pid, 0.0))
    return out


# ─────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:   # pragma: no cover  (CI only)
    sys.path.insert(0, str(HERE.parent))
    sys.path.insert(0, str(HERE.parent.parent))
    import adp as ADP  # noqa: F401  (kept for parity / future ADP arm)
    import sleeper_import as SL
    from backtest import grade as GR
    from backtest import lab_projections as PROJ
    import exp34 as X
    import exp34_dollars as XD
    import exp_construction_objective as CO
    import roster_sim as RS
    import money_grade as MG
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    payouts = json.loads((HERE.parent / "config" / "payouts.json").read_text())
    seasons = [s for s in history["seasons"] if X.real_draft(s)]
    players_raw = SL.fetch_players()
    positions = {str(pid): p.get("position") for pid, p in players_raw.items()}
    ages = {str(pid): p.get("age") for pid, p in players_raw.items()}
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"), "position": p.get("position"),
                     "team": p.get("team"), "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception as e:
        print("  ! import_ids unavailable:", e); ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)

    prior_years = sorted({y for s in seasons for y in (int(s["season"]) - 2, int(s["season"]) - 1)})
    frames = []
    for y in prior_years:
        try:
            frames.append(nfl.import_weekly_data([y]))
        except Exception as e:
            print(f"  prior weekly {y} UNAVAILABLE ({type(e).__name__})")
    weekly = pd.concat(frames, ignore_index=True) if frames else None
    have = (set(int(y) for y in weekly["season"].unique())
            if weekly is not None and "season" in weekly.columns else set())

    season_rows, caveats = [], []
    for s in seasons:
        yr = int(s["season"]); rid = X.cory_roster_id(s)
        if rid is None:
            caveats.append(f"{yr}: no roster_id"); continue
        picks = X.real_draft(s); scoring_cfg = s.get("scoring_settings") or {}
        prior_pts, prior_games, tables = {}, {}, []
        for py in (yr - 2, yr - 1):
            if py not in have:
                continue
            prior_pts[py] = GR.rest_of_season_points(weekly, py, scoring_cfg, crosswalk)
            tbl = GR.weekly_points_table(weekly, py, scoring_cfg, crosswalk); tables.append(tbl)
            prior_games[py] = {}
            for wk in tbl.values():
                for pid in wk:
                    prior_games[py][pid] = prior_games[py].get(pid, 0) + 1
        proj = PROJ.walk_forward(yr, prior_pts, prior_games, positions, ages)
        if not proj:
            caveats.append(f"{yr}: no priors"); continue
        cv = cv_by_id(CO.player_weekly_series(tables))
        tiers = gap_tiers(proj, positions)
        pos_by_id = dict(positions); pos_by_id.update(RS.infer_positions(s))
        keepers = XD.cory_keepers(picks, rid)
        s_hist = MG.season_of(history, yr)
        field = MG.field_weekly_scores(s_hist)
        rs_weeks = MG.regular_season_weeks(s_hist); po_weeks = MG.playoff_weeks(s_hist)
        sigma = CO.residual_weekly_sigma(field, rs_weeks)

        per_step = {}
        for step in STEP_GRID:
            scores = blended_scores(proj, cv, tiers, step)
            roster, _tr = XD.build_policy_roster(picks, rid, XD.our_pick_fn(scores), keepers=keepers)
            dollars = XD._dollars_of(XD.roster_dollars(history, payouts, yr, rid, roster, pos_by_id))
            weekly_scores = RS.roster_weekly_scores(s_hist, roster, pos_by_id)
            proxy = CO.grade_policy_proxies(field, weekly_scores, rid, rs_weeks, po_weeks, sigma)
            per_step[f"{step:.2f}"] = {"dollars_total": dollars["total"],
                                       "exp_weekly_high_wins": proxy["exp_weekly_high_wins"],
                                       "mean_weekly_rank": proxy["mean_weekly_rank"],
                                       "playoff_window_points": proxy["playoff_window_points"]}
        season_rows.append({"season": str(yr), "per_step": per_step})
        base = per_step["0.00"]
        print(f"  {yr}: baseline(step0) $ {base['dollars_total']}, wh-wins {base['exp_weekly_high_wins']}; "
              + " ".join(f"s{st}:whΔ{round((per_step[st]['exp_weekly_high_wins'] or 0)-(base['exp_weekly_high_wins'] or 0),3)}"
                         for st in per_step if st != "0.00"))

    agg = _aggregate(season_rows)
    result = {"experiment": "tier-graduated ceiling blend — mean→ceiling by tier, + VONA (Cory's model)",
              "step_grid": list(STEP_GRID), "w_cap": W_CAP, "n_seasons": len(season_rows),
              "aggregate": agg, "seasons": season_rows, "caveats": caveats,
              "verdict": _verdict(agg),
              "note": ("leak-free: mean is walk-forward, cv+tiers from prior-season weekly. step "
                       "swept (pre-registered grid), not tuned. Graded vs step=0 (pure mean). Thin "
                       "(n=seasons); the flat ceiling tilt was null, so the bar is: does ANY tier ramp "
                       "beat pure mean on weekly-high win prob / dollars. Range from single-source cv; "
                       "richer cross-dataset range is the post-draft data-hunt if a ramp clears.")}
    (out_dir / "exp_tier_ceiling.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    print("\nVERDICT:", result["verdict"])
    return 0


def _aggregate(rows: list[dict]) -> dict:
    """Per step, summed delta vs step0 on each metric across seasons (rank: lower better)."""
    steps = [f"{st:.2f}" for st in STEP_GRID if st != 0.0]
    out = {}
    for st in steps:
        d_wh = d_rank = d_pts = d_dol = 0.0; n = 0
        for r in rows:
            b, x = r["per_step"].get("0.00"), r["per_step"].get(st)
            if not b or not x:
                continue
            n += 1
            d_wh += (x["exp_weekly_high_wins"] or 0) - (b["exp_weekly_high_wins"] or 0)
            if x["mean_weekly_rank"] is not None and b["mean_weekly_rank"] is not None:
                d_rank += x["mean_weekly_rank"] - b["mean_weekly_rank"]
            d_pts += (x["playoff_window_points"] or 0) - (b["playoff_window_points"] or 0)
            d_dol += (x["dollars_total"] or 0) - (b["dollars_total"] or 0)
        out[st] = {"n": n, "sum_wh_wins_delta": round(d_wh, 3), "sum_rank_delta": round(d_rank, 3),
                   "sum_playoff_pts_delta": round(d_pts, 2), "sum_dollars_delta": round(d_dol, 2)}
    return out


def _verdict(agg: dict) -> str:
    if not agg:
        return "no seasons graded."
    # a ramp "helps" if it lifts weekly-high win prob AND doesn't worsen mean rank
    winners = [st for st, a in agg.items() if a["sum_wh_wins_delta"] > 0 and a["sum_rank_delta"] <= 0]
    best = max(agg, key=lambda st: agg[st]["sum_wh_wins_delta"]) if agg else None
    if winners:
        return (f"SIGNAL: tier ceiling ramp(s) {winners} beat pure mean on weekly-high win prob "
                f"without hurting rank (best step {best}: whΔ{agg[best]['sum_wh_wins_delta']}, "
                f"$Δ{agg[best]['sum_dollars_delta']}). Worth wiring + enriching the range. Thin (n=seasons).")
    return ("NULL: no tier ceiling ramp beats pure mean on weekly-high win prob without hurting "
            f"rank (best step {best}: whΔ{agg[best]['sum_wh_wins_delta'] if best else None}). Even the "
            "tier-graduated version doesn't pay here — the board's mean+VONA is the model, and more "
            "projection sites won't change that. Thin (n=seasons).")


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(_egress_main(HERE))
