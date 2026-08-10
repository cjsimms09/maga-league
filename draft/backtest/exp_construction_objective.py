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
        season_rows.append({"season": str(yr), "graded": graded, "delta_vs_points": deltas,
                            "players_changed_vs_points": distinct, "fallbacks": fallbacks})
        print(f"  {yr}: points ${graded['points']['total']} | "
              f"ceiling ${graded['ceiling']['total']} (Δ{deltas['ceiling']['total']}, "
              f"{distinct['ceiling']} changed) | "
              f"floor ${graded['floor']['total']} (Δ{deltas['floor']['total']}, "
              f"{distinct['floor']} changed)")

    agg = _aggregate(season_rows)
    result = {
        "experiment": "construction objective — points vs ceiling vs floor, graded in E[$]",
        "beta": BETA, "n_seasons": len(season_rows),
        "aggregate": agg, "seasons": season_rows, "caveats": caveats,
        "verdict": _verdict(agg, season_rows),
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
