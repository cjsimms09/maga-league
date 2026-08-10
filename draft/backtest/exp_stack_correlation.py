#!/usr/bin/env python3
"""STACK CORRELATION — measure the REALIZED same-team QB↔WR/TE weekly correlation in
OUR scoring, and size a provisional stack bonus from it (step 1 of the stack build).

The stack sweep (exp 6) found a modest stack pays +$196 — but priced on an ASSUMED
within-team correlation (ρ=0.35). Before we build a stack bonus into the live board we
have to replace that assumption with the number our own league actually produced. This
measures it, leak-free from realized history:

  1. score every offensive player's WEEKLY points through our engine (6-pt pass TD,
     half-PPR — the format that makes QB-WR correlation worth MORE here than generic),
  2. for each team/season find the primary QB and correlate his weekly points with each
     same-team WR/TE across the weeks both played (Pearson),
  3. from the realized correlation AND the realized weekly SDs, compute the actual
     per-week CEILING PREMIUM a stack buys — Var(A+B)=Var A+Var B+2ρσσ, so the stack's
     value is the extra lineup-ceiling from the covariance, NOT any change to the mean
     (the projection is never touched — the mistake we're avoiding),
  4. size a PROVISIONAL first-partner bonus with the pre-registered concave dose curve
     (modest wins, over-stacking bleeds — exp 6) and compare realized ρ to the sweep's
     0.35 assumption.

The dollar value is confirmed in step 3 (stacked-vs-unstacked policy rosters graded on
realized weekly scores + the weekly-high win-probability proxy). This step answers only
"how strong is the correlation, and how big a ceiling does a stack actually buy."

Pure core (correlation, ceiling premium, sizing) is unit-tested with no egress. The
egress main fetches nflverse weekly and scores it through our engine. Run (CI):
python draft/backtest/exp_stack_correlation.py
"""
from __future__ import annotations
import json, sys
from math import sqrt
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

MIN_SHARED_WEEKS = 6        # a stable weekly correlation needs a real sample
MIN_QB_WEEKS = 8           # the team's PRIMARY QB, not a backup cameo
CEILING_K = 1.28           # boom-week ceiling ≈ mean + 1.28·SD (the ~90th percentile week)
DOSE_CURVE = (1.0, 0.5, 0.0)   # pre-registered: partner #1 full, #2 half, #3+ none (concave)
SWEEP_ASSUMED_RHO = 0.35   # exp 6's modeled within-team correlation, for the reality check


# ───────────────────────────────────────────────────────── pure core ──
def pearson(pairs: list[tuple[float, float]]) -> float | None:
    """Pearson r over (x,y) pairs; None if <3 points or a side has no spread."""
    n = len(pairs)
    if n < 3:
        return None
    sx = sum(x for x, _ in pairs); sy = sum(y for _, y in pairs)
    mx, my = sx / n, sy / n
    cov = sum((x - mx) * (y - my) for x, y in pairs)
    vx = sum((x - mx) ** 2 for x, _ in pairs)
    vy = sum((y - my) ** 2 for _, y in pairs)
    if vx <= 0 or vy <= 0:
        return None
    return cov / sqrt(vx * vy)


def stdev(xs: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    return sqrt(sum((x - m) ** 2 for x in xs) / n)


def ceiling_premium(sigma_q: float, sigma_r: float, rho: float, k: float = CEILING_K) -> float:
    """The extra lineup CEILING (points) a stack buys, vs owning the same two projections
    UNcorrelated. Ceiling ≈ k·SD(sum); the mean is unchanged, so the whole premium is the
    SD gain from the covariance: k·(√(σq²+σr²+2ρσqσr) − √(σq²+σr²)). Zero/negative ρ → ~0."""
    base = sqrt(sigma_q ** 2 + sigma_r ** 2)
    stacked = sqrt(max(0.0, sigma_q ** 2 + sigma_r ** 2 + 2 * rho * sigma_q * sigma_r))
    return round(k * (stacked - base), 3)


def size_stack_bonus(premium_pts: float, dose_curve: tuple = DOSE_CURVE) -> dict:
    """Provisional per-partner bonus in the SAME ceiling-points unit, applying the
    pre-registered concave dose curve. The board/$ translation is finalized after the
    step-3 grade; this reports the shape and the first-partner size the data supports."""
    return {"partner_1": round(premium_pts * dose_curve[0], 3),
            "partner_2": round(premium_pts * dose_curve[1], 3),
            "partner_3plus": round(premium_pts * dose_curve[2], 3),
            "dose_curve": list(dose_curve)}


def team_pairs(series: dict[str, dict], positions: dict[str, str]) -> list[dict]:
    """Same-team QB↔WR/TE pairs for ONE team-season. `series[pid] = {week: our_pts}`,
    `positions[pid] = 'QB'|'WR'|'TE'|...`. Picks the primary QB (most total points, with
    ≥MIN_QB_WEEKS), pairs him with each WR/TE sharing ≥MIN_SHARED_WEEKS, and returns the
    realized correlation + SDs + ceiling premium per pair, tagged with the receiver's
    within-team scoring rank (1 = the WR1/TE1 you'd actually stack)."""
    qbs = [(pid, sum(w.values())) for pid, w in series.items()
           if positions.get(pid) == "QB" and len(w) >= MIN_QB_WEEKS]
    if not qbs:
        return []
    qb_id = max(qbs, key=lambda t: t[1])[0]
    qb_w = series[qb_id]
    # rank receivers within team by total points, per position
    recs = [(pid, sum(w.values())) for pid, w in series.items()
            if positions.get(pid) in ("WR", "TE") and len(w) >= MIN_SHARED_WEEKS]
    rank_in_pos: dict[str, int] = {}
    for pos in ("WR", "TE"):
        ranked = sorted([(pid, tot) for pid, tot in recs if positions.get(pid) == pos],
                        key=lambda t: -t[1])
        for i, (pid, _tot) in enumerate(ranked):
            rank_in_pos[pid] = i + 1
    out = []
    for rid, _tot in recs:
        shared = [(qb_w[w], series[rid][w]) for w in qb_w if w in series[rid]]
        if len(shared) < MIN_SHARED_WEEKS:
            continue
        rho = pearson(shared)
        if rho is None:
            continue
        sq = stdev([a for a, _ in shared]); sr = stdev([b for _, b in shared])
        out.append({"qb": qb_id, "receiver": rid, "position": positions.get(rid),
                    "receiver_rank": rank_in_pos.get(rid), "n_weeks": len(shared),
                    "rho": round(rho, 4), "sigma_qb": round(sq, 3), "sigma_rec": round(sr, 3),
                    "ceiling_premium_pts": ceiling_premium(sq, sr, rho)})
    return out


def aggregate_pairs(all_pairs: list[dict]) -> dict:
    """Mean realized ρ + ceiling premium by pairing, with the WR1/TE1 slice (the stack you
    actually draft) broken out, and the reality check vs the sweep's assumed 0.35."""
    def slice_stats(rows):
        rhos = [r["rho"] for r in rows]
        prem = [r["ceiling_premium_pts"] for r in rows]
        if not rhos:
            return {"n": 0, "mean_rho": None, "median_rho": None, "mean_ceiling_premium_pts": None}
        srt = sorted(rhos)
        med = srt[len(srt) // 2] if len(srt) % 2 else (srt[len(srt) // 2 - 1] + srt[len(srt) // 2]) / 2
        return {"n": len(rhos), "mean_rho": round(sum(rhos) / len(rhos), 4),
                "median_rho": round(med, 4),
                "mean_ceiling_premium_pts": round(sum(prem) / len(prem), 3)}
    qb_wr = [r for r in all_pairs if r["position"] == "WR"]
    qb_te = [r for r in all_pairs if r["position"] == "TE"]
    wr1 = [r for r in qb_wr if r.get("receiver_rank") == 1]
    te1 = [r for r in qb_te if r.get("receiver_rank") == 1]
    out = {"qb_wr_all": slice_stats(qb_wr), "qb_te_all": slice_stats(qb_te),
           "qb_wr1": slice_stats(wr1), "qb_te1": slice_stats(te1)}
    primary = out["qb_wr1"]
    if primary["mean_rho"] is not None:
        out["implied_dose_vs_sweep"] = round(primary["mean_rho"] / SWEEP_ASSUMED_RHO, 3)
        out["provisional_bonus_wr1_pts"] = size_stack_bonus(primary["mean_ceiling_premium_pts"])
    return out


# ─────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:   # pragma: no cover  (CI only)
    sys.path.insert(0, str(HERE.parent))
    sys.path.insert(0, str(HERE.parent.parent))
    from backtest import grade as GR
    import scoring
    import config_schema
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    cfg = config_schema.load(HERE.parent / "config" / "league_config.json")
    scoring_cfg = cfg["scoring"]
    seasons = sorted({int(s["season"]) for s in history["seasons"]})
    print("stack-correlation seasons:", seasons)

    frames = []
    for y in seasons:
        try:
            df = nfl.import_weekly_data([y]); frames.append(df); print(f"  weekly {y}: {len(df)} rows")
        except Exception as e:
            print(f"  weekly {y} UNAVAILABLE ({type(e).__name__})")
    if not frames:
        (out_dir / "exp_stack_correlation.json").write_text(json.dumps(
            {"experiment": "stack correlation", "error": "no weekly data (egress)"}, indent=2))
        return 0
    weekly = pd.concat(frames, ignore_index=True)
    cols = set(weekly.columns)
    team_col = "recent_team" if "recent_team" in cols else ("team" if "team" in cols else None)

    all_pairs, per_season = [], {}
    for y in seasons:
        dfy = weekly[weekly["season"] == y] if "season" in cols else weekly
        # per (team) -> series[pid]={week:pts}, positions[pid]
        teams: dict[str, dict] = {}
        pos_of: dict[str, str] = {}
        for row in dfy.to_dict("records"):
            pos = row.get("position")
            if pos not in ("QB", "WR", "TE"):
                continue
            pid = str(row.get("player_id") or row.get("gsis_id") or "")
            team = str(row.get(team_col)) if team_col else "?"
            wk = row.get("week")
            if not pid or wk is None or not team:
                continue
            pts = scoring.score_stat_line(GR.nflverse_weekly_to_scoring(row), scoring_cfg)
            teams.setdefault(team, {}).setdefault(pid, {})[int(wk)] = float(pts)
            pos_of[pid] = pos
        season_pairs = []
        for _team, series in teams.items():
            season_pairs.extend(team_pairs(series, pos_of))
        for r in season_pairs:
            r["season"] = str(y)
        all_pairs.extend(season_pairs)
        per_season[str(y)] = aggregate_pairs(season_pairs)
        agg_y = per_season[str(y)]["qb_wr1"]
        print(f"  {y}: QB-WR1 mean ρ={agg_y['mean_rho']} "
              f"(n={agg_y['n']}, ceiling premium {agg_y['mean_ceiling_premium_pts']} pts)")

    agg = aggregate_pairs(all_pairs)
    top = sorted([r for r in all_pairs if r["position"] == "WR" and r.get("receiver_rank") == 1],
                 key=lambda r: -r["rho"])[:12]
    result = {
        "experiment": "stack correlation — realized same-team QB↔WR/TE weekly correlation (our scoring)",
        "seasons": seasons, "n_pairs": len(all_pairs),
        "aggregate": agg, "per_season": per_season,
        "strongest_qb_wr1_pairs": [{"season": r["season"], "rho": r["rho"], "n": r["n_weeks"],
                                    "ceiling_premium_pts": r["ceiling_premium_pts"]} for r in top],
        "verdict": _verdict(agg),
        "note": ("leak-free: realized weekly points through OUR scoring (6-pt pass TD, half-PPR). "
                 "Correlation raises lineup CEILING, not the mean — the bonus is a roster-conditional "
                 "ceiling premium, never a projection bump. Bonus size here is PROVISIONAL (ceiling "
                 "points, pre-registered concave dose); the $ value is confirmed by the step-3 grade."),
    }
    (out_dir / "exp_stack_correlation.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    print("\nVERDICT:", result["verdict"])
    return 0


def _verdict(agg: dict) -> str:
    w1 = agg.get("qb_wr1", {})
    if not w1 or w1.get("mean_rho") is None:
        return "no gradeable QB-WR1 pairs — see per_season."
    rho, prem = w1["mean_rho"], w1["mean_ceiling_premium_pts"]
    dose = agg.get("implied_dose_vs_sweep")
    vs = ("ABOVE" if rho > SWEEP_ASSUMED_RHO else ("BELOW" if rho < SWEEP_ASSUMED_RHO else "at"))
    strength = ("meaningful" if rho >= 0.25 else ("weak" if rho >= 0.1 else "negligible"))
    head = (f"Realized QB-WR1 correlation ρ={rho} ({vs} the sweep's assumed {SWEEP_ASSUMED_RHO}; "
            f"implied dose ×{dose}) — {strength}. A WR1 stack buys ~{prem} ceiling pts/week "
            f"(n={w1['n']} pairs). ")
    tail = ("Supports a modest board stack bonus (first partner ~this size, halving for a "
            "second, off by the third), pending the step-3 money grade. "
            if rho >= 0.15 else
            "Too weak to justify a board bonus on its own — the step-3 grade must clear before install. ")
    return head + tail + "Ceiling effect only; the projection is never touched."


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(_egress_main(HERE))
