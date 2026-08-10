#!/usr/bin/env python3
"""CONSTRUCTION OBJECTIVE — does the roster the board OPTIMIZES earn the most MONEY?

The board ranks by VALUE (points over replacement). But the league pays for WEEKLY
HIGHS and PLAYOFF FINISHES, not for total points — and those reward a different
roster SHAPE than point-maxing:
  * weekly-high rewards CEILING (boom weeks),
  * the playoff bracket rewards FLOOR + AVAILABILITY in weeks 15-17,
  * total points rewards neither specifically.
If the dollar-maximizing shape differs from the point-maximizing one, the board is
quietly optimizing the wrong objective, and correcting it is uncopyable edge — it
needs OUR payout structure and OUR grading harness.

THE TEST. Build three policy rosters from the SAME walk-forward projection, holding
the room fixed, differing only in the OBJECTIVE each pick optimizes:
  POINTS   = max projected season points          (what the board does today)
  CEILING  = points nudged toward boom weeks       (chase weekly-high $)
  FLOOR    = points nudged toward reliable weeks   (chase playoff $)
             AND discounted for injury history      (availability robustness)
Grade all three through the CERTIFIED money layer (roster_sim -> money_grade), the
same one exp34-dollars uses, and ask which SHAPE banked the most, decomposed into
weekly-high / regular-season / playoff dollars across 2023/24/25.

DISCIPLINE.
  * LEAK-FREE. Every input a policy sees is knowable PRESEASON: the projection is
    walk-forward (prior years only), and the ceiling/floor/availability nudges come
    from PRIOR-season weekly scores (yr-1, yr-2) — never the season being graded.
  * PRE-REGISTERED NUDGE. beta = 0.15 is fixed before running — the SAME magnitude
    the live board already uses for its opportunity nudge, so it is an anchor, not
    a knob tuned to the answer. Availability discount is bounded at 15%.
  * THIN BY CONSTRUCTION. n = 3 seasons, single seat, room fixed — the same limits
    exp34-dollars states. The per-season SIGN and the component decomposition are
    the read; a 3-season dollar CI is descriptive, not inferential. A null ("the
    objective barely moves the money, the board's points objective is fine") is a
    real, useful result and is reported as one.

Pure core (attributes -> objective scores -> distinct rosters) is unit-tested with
no egress in draft/tests/test_exp_construction_objective.py. The egress main fetches
the ranker inputs (nflverse prior weekly) and reuses exp34-dollars' certified
policy-roster construction and money grader. Run (CI): python draft/backtest/exp_construction_objective.py
"""
from __future__ import annotations
import json, sys
from pathlib import Path
from statistics import mean, pstdev

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

BETA = 0.15                 # pre-registered nudge magnitude (= board opportunity nudge)
AVAIL_FLOOR = 0.85         # availability discount bottoms out at -15% (a full miss)
FULL_SEASON_GAMES = 16     # forgiving denominator (17 games, allow a bye + a miss)
MIN_WEEKS_FOR_RISK = 4     # below this, no ceiling/floor opinion — projection stands
Z_CLAMP = 2.0              # cap standardized nudges so one outlier can't dominate
OBJECTIVES = ("points", "ceiling", "floor")
COMPONENTS = ("weekly_high", "regular_season", "playoff")


# ───────────────────────────────────────────────────────── pure core ──
def player_weekly_series(weekly_tables: list[dict]) -> dict[str, list[float]]:
    """Flatten prior-season {week:{pid:pts}} tables into {pid: [weekly points]}.

    Every week a player scored, pooled across the given PRIOR seasons — the raw
    material for his boom/bust profile. Order does not matter (we take quantiles)."""
    series: dict[str, list[float]] = {}
    for table in weekly_tables or []:
        for _wk, pts in (table or {}).items():
            for pid, v in (pts or {}).items():
                series.setdefault(str(pid), []).append(float(v or 0.0))
    return series


def attrs_from_series(series: dict[str, list[float]],
                      min_weeks: int = MIN_WEEKS_FOR_RISK) -> dict[str, dict]:
    """Per-player boom/bust profile from prior weekly points. games = weeks scored;
    ceiling = mean of the top quartile of weeks; floor = mean of the bottom quartile.
    A player with < min_weeks of history gets games only (no ceiling/floor opinion) —
    honest thinness, not a fabricated risk read."""
    out: dict[str, dict] = {}
    for pid, pts in (series or {}).items():
        n = len(pts)
        if n < min_weeks:
            out[pid] = {"games": n, "ceiling": None, "floor": None}
            continue
        s = sorted(pts, reverse=True)
        k = max(1, n // 4)
        out[pid] = {"games": n,
                    "ceiling": round(sum(s[:k]) / k, 3),
                    "floor": round(sum(s[-k:]) / k, 3)}
    return out


def availability(prev_games_by_pid: dict[str, int],
                 full: int = FULL_SEASON_GAMES) -> dict[str, float]:
    """Injury-history reliability from the MOST RECENT prior season's games played,
    in [0,1]. A player with no prior-season row (rookie/absent) is omitted -> no
    penalty later (the projection already handles unknowns)."""
    return {str(pid): min(1.0, (g or 0) / full)
            for pid, g in (prev_games_by_pid or {}).items() if g}


def zscores_within_position(attr_by_pid: dict[str, dict], key: str,
                            pos_by_id: dict[str, str]) -> dict[str, float]:
    """Standardize one attribute WITHIN position (a WR ceiling and a QB ceiling are
    not comparable raw). Positions with <2 rated players get 0 (no opinion)."""
    groups: dict[str, list[tuple[str, float]]] = {}
    for pid, a in (attr_by_pid or {}).items():
        v = a.get(key)
        pos = pos_by_id.get(pid)
        if v is None or not pos:
            continue
        groups.setdefault(pos, []).append((pid, float(v)))
    z: dict[str, float] = {}
    for _pos, items in groups.items():
        vals = [v for _, v in items]
        if len(vals) < 2:
            for pid, _ in items:
                z[pid] = 0.0
            continue
        m, sd = mean(vals), (pstdev(vals) or 1.0)
        for pid, v in items:
            z[pid] = (v - m) / sd
    return z


def objective_scores(proj: dict[str, float], ceiling_z: dict[str, float],
                     floor_z: dict[str, float], avail: dict[str, float],
                     beta: float = BETA) -> dict[str, dict[str, float]]:
    """Three score dicts over the projected pool, one per objective. POINTS is the
    projection untouched; CEILING nudges up boom players; FLOOR nudges up reliable
    players AND discounts injury history. All multiplicative around the projection,
    so a player with no risk data (z=0, avail absent) scores identically under all
    three — the objectives diverge only where prior evidence exists."""
    def clamp(zz: float) -> float:
        return max(-Z_CLAMP, min(Z_CLAMP, zz))
    points, ceiling, floor = {}, {}, {}
    for pid, base in (proj or {}).items():
        base = float(base)
        cz, fz = clamp(ceiling_z.get(pid, 0.0)), clamp(floor_z.get(pid, 0.0))
        av = avail.get(pid)
        avf = 1.0 if av is None else (AVAIL_FLOOR + (1.0 - AVAIL_FLOOR) * av)
        points[pid] = base
        ceiling[pid] = base * (1.0 + beta * cz)
        floor[pid] = base * (1.0 + beta * fz) * avf
    return {"points": points, "ceiling": ceiling, "floor": floor}


# ───────────────────────────────────── finer proxy (higher power) ──
# The dollar grade on a single fixed seat is starved: the seat misses the playoffs,
# so playoff/regular-season $ are 0 for every variant and only the coarse $100
# weekly-high (winner-take-all per week) moves. These proxies give the SAME three
# rosters a higher-power test against the SAME real field, activating the channels
# the dollar signal can't see even when the seat never cashes:
#   * expected weekly-high wins  — the $100/week smoothed into a WIN PROBABILITY by
#     integrating over week-to-week noise, so losing the high by 0.5 pts is ~0.45,
#     not 0 (the CEILING thesis lives here),
#   * mean weekly rank           — consistency a boom-or-bust roster never shows in
#     dollars (the FLOOR thesis lives here),
#   * playoff-window points      — weeks 15-17 lineup points, the playoff channel
#     made continuous so it fires without the seat making the bracket.
import math


def normal_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def residual_weekly_sigma(field: dict, weeks: list[int]) -> float | None:
    """The typical week-to-week SWING: pooled SD of (a team's weekly score minus its
    own mean over these weeks). This is the scale at which a weekly-high could have
    gone the other way — the right noise for smoothing the winner-take-all bonus.
    Pre-registered as the smoothing scale (data-set, not tuned to the answer)."""
    by_team: dict[int, list[float]] = {}
    for w in weeks:
        for rid, sc in (field.get(w) or {}).items():
            by_team.setdefault(rid, []).append(float(sc))
    resid: list[float] = []
    for scores in by_team.values():
        if len(scores) < 2:
            continue
        m = sum(scores) / len(scores)
        resid.extend(s - m for s in scores)
    if len(resid) < 2:
        return None
    return math.sqrt(sum(r * r for r in resid) / len(resid))   # mean ~0 by construction


def week_win_prob(my: float, others: list[float], sigma: float | None,
                  lo: float = -5.0, hi: float = 5.0, step: float = 0.05) -> float:
    """P(my seat posts the strict weekly high) with every score carrying iid N(0,sigma)
    noise — numeric integration over my seat's noise, deterministic (no RNG, no scipy).
    sigma None/<=0 falls back to the hard indicator (ties shared)."""
    if not others:
        return 1.0
    top = max(others)
    if sigma is None or sigma <= 0:
        if my > top:
            return 1.0
        if my < top:
            return 0.0
        return 1.0 / (1 + sum(1 for o in others if o == my))
    total = dens = 0.0
    z = lo
    while z <= hi + 1e-9:
        phi = math.exp(-0.5 * z * z)             # unnormalized N(0,1) density
        x = my + z * sigma
        prod = 1.0
        for o in others:
            prod *= normal_cdf((x - o) / sigma)
        total += phi * prod
        dens += phi
        z += step
    return total / dens if dens else 0.0


def grade_policy_proxies(field: dict, my_weekly: dict[int, float], roster_id: int,
                         rs_weeks: list[int], po_weeks: list[int],
                         sigma: float | None) -> dict:
    """The three finer metrics for one policy roster against the real field (my seat
    substituted). Pure over dicts; unit-tested with synthetic fields."""
    sub = {w: dict(scores) for w, scores in field.items()}
    for w, pts in my_weekly.items():
        if int(w) in sub and roster_id in sub[int(w)]:
            sub[int(w)][roster_id] = float(pts)
    exp_wins = exact_wins = 0.0
    ranks: list[int] = []
    for w in rs_weeks:
        scores = sub.get(w) or {}
        if roster_id not in scores:
            continue
        my = scores[roster_id]
        others = [sc for rid, sc in scores.items() if rid != roster_id]
        exp_wins += week_win_prob(my, others, sigma)
        exact_wins += 1.0 if (others and my > max(others)) else 0.0
        ranks.append(1 + sum(1 for o in others if o > my))
    playoff_pts = sum(float(my_weekly.get(w, 0.0)) for w in po_weeks)
    return {"exp_weekly_high_wins": round(exp_wins, 4),
            "exact_weekly_high_wins": round(exact_wins, 1),
            "mean_weekly_rank": round(sum(ranks) / len(ranks), 3) if ranks else None,
            "playoff_window_points": round(playoff_pts, 2)}


# ─────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:   # pragma: no cover  (CI only)
    sys.path.insert(0, str(HERE.parent))          # draft/
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import adp as ADP
    import sleeper_import as SL
    from backtest import grade as GR
    from backtest import lab_projections as PROJ
    import exp34 as X
    import exp34_dollars as XD
    import roster_sim as RS
    import money_grade as MG
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    payouts = json.loads((HERE.parent / "config" / "payouts.json").read_text())
    seasons = [s for s in history["seasons"] if X.real_draft(s)]
    print("construction-objective seasons:", sorted({int(s["season"]) for s in seasons}))

    players_raw = SL.fetch_players()
    index = ADP.build_index(players_raw)
    positions = {str(pid): p.get("position") for pid, p in players_raw.items()}
    ages = {str(pid): p.get("age") for pid, p in players_raw.items()}
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"),
                     "position": p.get("position"), "team": p.get("team"),
                     "gsis_id": p.get("gsis_id")}
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
            df = nfl.import_weekly_data([y]); frames.append(df); print(f"  prior weekly {y}: {len(df)} rows")
        except Exception as e:
            print(f"  prior weekly {y} UNAVAILABLE ({type(e).__name__})")
    weekly = pd.concat(frames, ignore_index=True) if frames else None
    have_years = (set(int(y) for y in weekly["season"].unique())
                  if weekly is not None and "season" in weekly.columns else set())

    caveats, season_rows = [], []
    for s in seasons:
        yr = int(s["season"])
        rid = X.cory_roster_id(s)
        if rid is None:
            caveats.append(f"{yr}: no roster_id; skipped"); continue
        picks = X.real_draft(s)
        scoring_cfg = s.get("scoring_settings") or {}

        # projection (leak-free) + prior weekly tables for the boom/bust profile
        prior_pts, prior_games, weekly_tables = {}, {}, []
        for py in (yr - 2, yr - 1):
            if py not in have_years:
                continue
            prior_pts[py] = GR.rest_of_season_points(weekly, py, scoring_cfg, crosswalk)
            tbl = GR.weekly_points_table(weekly, py, scoring_cfg, crosswalk)
            weekly_tables.append(tbl)
            prior_games[py] = {}
            for wk_pts in tbl.values():
                for pid in wk_pts:
                    prior_games[py][pid] = prior_games[py].get(pid, 0) + 1
        proj = PROJ.walk_forward(yr, prior_pts, prior_games, positions, ages)
        if not proj:
            caveats.append(f"{yr}: no priors to project from; skipped"); continue

        # boom/bust profile (both prior seasons pooled) + availability (yr-1 only)
        attrs = attrs_from_series(player_weekly_series(weekly_tables))
        pos_by_id = dict(positions)
        pos_by_id.update(RS.infer_positions(s))
        ceiling_z = zscores_within_position(attrs, "ceiling", pos_by_id)
        floor_z = zscores_within_position(attrs, "floor", pos_by_id)
        avail = availability(prior_games.get(yr - 1, {}))
        scores = objective_scores(proj, ceiling_z, floor_z, avail)

        keepers = XD.cory_keepers(picks, rid)
        rosters, fallbacks = {}, {}
        for obj in OBJECTIVES:
            roster, trace = XD.build_policy_roster(picks, rid, XD.our_pick_fn(scores[obj]),
                                                   keepers=keepers)
            rosters[obj] = roster
            fallbacks[obj] = sum(t["used_fallback"] for t in trace)

        graded = {obj: XD._dollars_of(
            XD.roster_dollars(history, payouts, yr, rid, rosters[obj], pos_by_id))
            for obj in OBJECTIVES}
        deltas = {obj: {k: (round((graded[obj][k] or 0) - (graded["points"][k] or 0), 2)
                            if graded[obj].get(k) is not None and graded["points"].get(k) is not None
                            else None)
                        for k in COMPONENTS + ("total",)}
                  for obj in ("ceiling", "floor")}
        # did the objectives even produce different rosters?
        distinct = {obj: len(set(rosters[obj]) - set(rosters["points"])) for obj in ("ceiling", "floor")}

        # finer proxy (higher power than the coarse $): same rosters, same real field
        s_hist = MG.season_of(history, yr)
        field = MG.field_weekly_scores(s_hist)
        rs_weeks = MG.regular_season_weeks(s_hist)
        po_weeks = MG.playoff_weeks(s_hist)
        sigma = residual_weekly_sigma(field, rs_weeks)
        proxy = {}
        for obj in OBJECTIVES:
            my_weekly = RS.roster_weekly_scores(s_hist, rosters[obj], pos_by_id)
            proxy[obj] = grade_policy_proxies(field, my_weekly, rid, rs_weeks, po_weeks, sigma)
        proxy_delta = {obj: {m: (round(proxy[obj][m] - proxy["points"][m], 4)
                                 if proxy[obj].get(m) is not None and proxy["points"].get(m) is not None
                                 else None)
                             for m in ("exp_weekly_high_wins", "mean_weekly_rank", "playoff_window_points")}
                       for obj in ("ceiling", "floor")}

        season_rows.append({"season": str(yr), "graded": graded, "delta_vs_points": deltas,
                            "players_changed_vs_points": distinct, "fallbacks": fallbacks,
                            "sigma_weekly": round(sigma, 2) if sigma else None,
                            "proxy": proxy, "proxy_delta_vs_points": proxy_delta})
        print(f"  {yr}: E[wh-wins] points {proxy['points']['exp_weekly_high_wins']} | "
              f"ceiling {proxy['ceiling']['exp_weekly_high_wins']} "
              f"(Δ{proxy_delta['ceiling']['exp_weekly_high_wins']}) | "
              f"floor {proxy['floor']['exp_weekly_high_wins']} "
              f"(Δ{proxy_delta['floor']['exp_weekly_high_wins']}) ;; "
              f"mean-rank points {proxy['points']['mean_weekly_rank']} "
              f"ceiling {proxy['ceiling']['mean_weekly_rank']} floor {proxy['floor']['mean_weekly_rank']}")

    agg = _aggregate(season_rows)
    proxy_agg = _proxy_aggregate(season_rows)
    result = {
        "experiment": "construction objective — points vs ceiling vs floor, E[$] + finer proxy",
        "beta": BETA, "n_seasons": len(season_rows),
        "aggregate": agg, "proxy_aggregate": proxy_agg,
        "seasons": season_rows, "caveats": caveats,
        "verdict": _verdict(agg, season_rows),
        "proxy_verdict": _proxy_verdict(proxy_agg, season_rows),
        "note": ("leak-free: projection is walk-forward, boom/bust + availability from "
                 "PRIOR-season weekly only. beta pre-registered at 0.15 (board's opportunity "
                 "nudge). Both alt objectives graded on the SAME optimal-lineup ceiling and "
                 "the SAME fixed room as POINTS, so the delta isolates the objective. Thin "
                 "(n=seasons) — per-season sign + component split is the read, not the CI."),
    }
    (out_dir / "exp_construction_objective.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    print("\nVERDICT:", result["verdict"])
    return 0


def _aggregate(rows: list[dict]) -> dict:
    """Pool per-season deltas for each alt objective vs POINTS, by component + total."""
    out = {}
    for obj in ("ceiling", "floor"):
        comp = {}
        for k in COMPONENTS + ("total",):
            vals = [r["delta_vs_points"][obj][k] for r in rows
                    if r["delta_vs_points"].get(obj, {}).get(k) is not None]
            comp[k] = {"sum": round(sum(vals), 2) if vals else None,
                       "mean": round(sum(vals) / len(vals), 2) if vals else None, "n": len(vals)}
        totals = [r["delta_vs_points"][obj]["total"] for r in rows
                  if r["delta_vs_points"].get(obj, {}).get("total") is not None]
        signs = [(1 if t > 0 else (-1 if t < 0 else 0)) for t in totals]
        comp["sign_consistent"] = bool(totals) and len(set(signs)) == 1 and 0 not in signs
        comp["per_season_total"] = {r["season"]: r["delta_vs_points"][obj]["total"] for r in rows}
        out[obj] = comp
    out["thin"] = len(rows) < 4
    return out


def _proxy_aggregate(rows: list[dict]) -> dict:
    """Pool the finer-proxy deltas (ceiling/floor vs points) across seasons. For each
    metric: sum, mean, per-season, and sign consistency. Direction is metric-specific
    (higher wins/points better; LOWER mean-rank better) — recorded so the verdict reads
    it right."""
    metrics = ("exp_weekly_high_wins", "mean_weekly_rank", "playoff_window_points")
    lower_is_better = {"mean_weekly_rank"}
    out = {"lower_is_better": sorted(lower_is_better)}
    for obj in ("ceiling", "floor"):
        m_out = {}
        for m in metrics:
            vals = [r["proxy_delta_vs_points"][obj][m] for r in rows
                    if r.get("proxy_delta_vs_points", {}).get(obj, {}).get(m) is not None]
            signs = [(1 if v > 0 else (-1 if v < 0 else 0)) for v in vals]
            m_out[m] = {"sum": round(sum(vals), 4) if vals else None,
                        "mean": round(sum(vals) / len(vals), 4) if vals else None, "n": len(vals),
                        "per_season": {r["season"]: r["proxy_delta_vs_points"][obj][m] for r in rows
                                       if r.get("proxy_delta_vs_points", {}).get(obj, {}).get(m) is not None},
                        "sign_consistent": bool(vals) and len(set(signs)) == 1 and 0 not in signs,
                        "helped": (None if not vals else
                                   ((sum(vals) < 0) if m in lower_is_better else (sum(vals) > 0)))}
        out[obj] = m_out
    out["thin"] = len(rows) < 4
    return out


def _proxy_verdict(pagg: dict, rows: list[dict]) -> str:
    if not rows:
        return "no seasons graded."
    def line(obj, m, unit, better):
        c = pagg[obj][m]
        if c["sum"] is None:
            return f"{obj}:{m} n/a"
        helped = "HELPED" if c["helped"] else ("hurt" if c["helped"] is False else "flat")
        cons = "same sign every season" if c["sign_consistent"] else "mixed by season"
        return (f"{obj.upper()} {m}: Δ{c['sum']}{unit} vs points ({better}) -> {helped} "
                f"[{c['n']} seasons, {cons}]")
    parts = [
        line("ceiling", "exp_weekly_high_wins", " wins", "higher better"),
        line("floor", "mean_weekly_rank", "", "lower better"),
        line("floor", "playoff_window_points", " pts", "higher better"),
        line("ceiling", "mean_weekly_rank", "", "lower better"),
        line("floor", "exp_weekly_high_wins", " wins", "higher better"),
        line("ceiling", "playoff_window_points", " pts", "higher better"),
    ]
    # A claim of SIGNAL must clear three honesty gates, not just "the sum helped":
    #   (1) the metric helped in the hypothesized direction,
    #   (2) it did so with the SAME SIGN every season (mixed-by-season on n=3 is noise),
    #   (3) for the shape-SPECIFIC channel it must BEAT the other shape — a playoff-points
    #       bump that BOTH ceiling and floor produce is generic, not a floor/robustness effect.
    def gated(obj, m, rival=None):
        c = pagg[obj][m]
        if not (c["helped"] and c["sign_consistent"]):
            return False
        if rival is not None:                      # must beat the rival shape on this metric
            lower = m in set(pagg.get("lower_is_better", []))
            a, b = c["sum"], pagg[rival][m]["sum"]
            if a is None or b is None:
                return False
            return (a < b) if lower else (a > b)
        return True
    ceil_boom = gated("ceiling", "exp_weekly_high_wins")
    floor_cons = gated("floor", "mean_weekly_rank")
    floor_po = gated("floor", "playoff_window_points", rival="ceiling")
    if ceil_boom or floor_cons or floor_po:
        head = ("SIGNAL on the finer proxy (sign-consistent + shape-specific): "
                + ", ".join(x for x, ok in [("ceiling raises weekly-high win prob", ceil_boom),
                                            ("floor improves weekly consistency", floor_cons),
                                            ("floor lifts playoff-window points beyond ceiling", floor_po)] if ok)
                + ". Worth a board tilt to test live; confirm on the post-draft simulator. ")
    else:
        head = ("NULL even on the finer proxy: no shape beats the points objective with a "
                "sign-consistent, shape-specific edge on weekly-high win probability, consistency, "
                "or playoff-window points. Positive sums exist but are mixed by season and/or shared "
                "by BOTH tilts (generic, not the hypothesized effect). The board's value ranking IS "
                "the money-maximizing shape at this seat. ")
    return head + " ;; ".join(parts) + " Thin (n=seasons); directional."


def _verdict(agg: dict, rows: list[dict]) -> str:
    if not rows:
        return "no seasons graded — see caveats."
    parts = []
    for obj in ("ceiling", "floor"):
        tot = agg[obj]["total"]["sum"]
        wh = agg[obj]["weekly_high"]["sum"]
        po = agg[obj]["playoff"]["sum"]
        consistent = agg[obj]["sign_consistent"]
        if tot is None:
            parts.append(f"{obj}: not gradeable."); continue
        direction = ("beats" if tot > 0 else ("trails" if tot < 0 else "ties"))
        parts.append(
            f"{obj.upper()} {direction} points by ${tot} total across {agg[obj]['total']['n']} "
            f"seasons (weekly-high Δ${wh}, playoff Δ${po}; "
            f"{'same sign every season' if consistent else 'mixed by season'}).")
    lead = ("Both alternative shapes ~tie the points objective — the board's value ranking is "
            "already close to the money-maximizing shape; the objective is not where the edge is. "
            if all((agg[o]['total']['sum'] or 0) <= 0 for o in ('ceiling', 'floor'))
            else "At least one alternative shape out-earns the points objective — worth a board tilt. ")
    return lead + " ".join(parts) + " Thin (n=seasons); directional, not significant."


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(_egress_main(HERE))
