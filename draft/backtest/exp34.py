#!/usr/bin/env python3
"""EXPERIMENT 34 — decision alignment helpers (verified) + SUPERSEDED single-pick summary.

⚠️ THE SINGLE-PICK SUMMARY BELOW IS SUPERSEDED — do not fire it. Cory (2026-08-09)
rejected the my-guy-vs-their-guy comparison correctly: 41 single-pick comparisons
are coin flips dominated by which player broke out. The measuring stick is
redesigned in EXP34-METHODOLOGY.md (policy-level rank correlation + top-N set value
+ the deviation-edge surface across board position / tier proximity / round /
dispersion). What survives from this file is the PURE ALIGNMENT CORE — roster_id
resolution, keeper exclusion, board-before, best-available-by-source — verified in
test_exp34.py and reused by the surface build. The summarize_arm/build_result layer
is kept only as the secondary single-pick read the methodology explicitly demotes.

── original header ──────────────────────────────────────────────────────────────
EXPERIMENT 34 — RECOMMENDATION-VS-MARKET SCOREBOARD (two runnable arms).

THE QUESTION, narrowed to what the data can answer. The cap result (2026-08-09)
found that ~72% of our deviations carry >=4 points of need/ceiling evidence, so
the open question is whether that evidence is CORRECT against the market. 34
answers it at each of Cory's REAL historical picks (2023-25), on realized points:

  ARM A — MARKET (FFC contemporaneous ADP): at my pick, did the player I took
          out-score the best player still on the board by real ADP? If not, our
          picks do not beat the market on selection.
  ARM B — ROOM (revealed preference): did the player I took out-score the best
          player still on the board by the ROOM's own revealed order (the actual
          overall draft sequence)? i.e. did I beat these nine specific humans?

The third spec arm — "what the TOOL would have recommended" — stays BLOCKED: it
needs decision-time projections, none archived (D13's remaining half). So 34 runs
as a two-arm scoreboard, reported separately, as the pre-registration now says.

PRE-REGISTRATION (binding, PRE-REGISTRATION-34.md): n ~= 41 decisions across three
seasons, UNDERPOWERED BY CONSTRUCTION; every reading assumes wide intervals; an
inconclusive CI spanning zero argues for the anchor binding HARDER, not looser,
exactly as strongly as a loss would. Do not soften that after seeing the number.

── ARCHITECTURE ────────────────────────────────────────────────────────────────
The PURE CORE (decision alignment, best-available-by-source, bootstrap CI) is
unit-tested with a fixture in draft/tests/test_exp34.py — verifiable WITHOUT
egress. The egress main (FFC ADP + nflverse realized points) follows cli.py's
proven year-by-year loader and runs only in CI (lab.yml). Dollars are a stated
translation of the points result, not a per-pick money re-grade: per-pick dollar
attribution is inherently approximate and the honest primary metric is realized
points; the dollar line carries its assumptions with it.

Run (CI, egress): python draft/backtest/exp34.py --out draft/backtest
"""
from __future__ import annotations
import json, os, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORY = "coryjsimms"


# ─────────────────────────────────────────────────────────────── pure core ──
def cory_roster_id(season: dict) -> int | None:
    """Cory's roster_id this season, by display_name — his SLOT moves year to
    year, so it is resolved per season, never assumed."""
    owners = season.get("owners") or {}
    items = owners.items() if isinstance(owners, dict) else enumerate(owners)
    for rid, o in items:
        if (o or {}).get("display_name") == CORY:
            try:
                return int(rid)
            except (TypeError, ValueError):
                return int((o or {}).get("roster_id")) if (o or {}).get("roster_id") else None
    return None


def real_draft(season: dict) -> list[dict]:
    """The season's completed draft picks, sorted by overall pick number."""
    for d in season.get("drafts") or []:
        picks = d.get("picks") or []
        if picks:
            return sorted(picks, key=lambda p: p.get("pick_no") or 0)
    return []


def cory_decisions(picks: list[dict], rid: int) -> list[dict]:
    """Cory's NON-KEEPER picks — the real decisions 34 grades. A keeper is not a
    decision made against the board, so it is excluded exactly as the registry's
    ~41-count assumes."""
    return [p for p in picks
            if p.get("roster_id") == rid and not p.get("is_keeper")]


def board_before(picks: list[dict], pick_no: int) -> set[str]:
    """player_ids NOT yet taken when pick `pick_no` is on the clock."""
    taken = {str(p.get("player_id")) for p in picks if (p.get("pick_no") or 0) < pick_no}
    allp = {str(p.get("player_id")) for p in picks}
    return allp - taken


def best_available_by_adp(board: set[str], adp_rank: dict[str, float]) -> str | None:
    """The player still on the board with the best (lowest) real ADP. Players
    with no ADP entry cannot be the market's pick and are skipped."""
    cand = [(adp_rank[pid], pid) for pid in board if pid in adp_rank]
    return min(cand)[1] if cand else None


def best_available_by_room(board: set[str], picks: list[dict], pick_no: int) -> str | None:
    """The player still on the board whom the ROOM drafted earliest (min overall
    pick after mine) — the room's revealed 'best guy left'. Excludes my own pick."""
    cand = [((p.get("pick_no") or 1e9), str(p.get("player_id")))
            for p in picks
            if str(p.get("player_id")) in board and (p.get("pick_no") or 0) != pick_no]
    return min(cand)[1] if cand else None


def align_decisions(season_num: int, picks: list[dict], rid: int,
                    adp_rank: dict[str, float], points: dict[str, float]) -> list[dict]:
    """One row per real decision: what I took vs the market-best and room-best
    still available, each with realized points. A decision is DROPPED (not scored
    zero) when the taken player has no realized-points row — missing data is not a
    zero, per grade.rest_of_season_points's own contract."""
    out = []
    for p in cory_decisions(picks, rid):
        pn = p.get("pick_no") or 0
        took = str(p.get("player_id"))
        if took not in points:
            continue  # ungradeable pick: no NFL field time -> missing, not zero
        board = board_before(picks, pn)
        adp_pid = best_available_by_adp(board, adp_rank)
        room_pid = best_available_by_room(board, picks, pn)
        row = {"season": season_num, "pick_no": pn, "round": p.get("round"),
               "took": took, "took_pts": points[took],
               "adp_best": adp_pid, "adp_best_pts": points.get(adp_pid) if adp_pid else None,
               "room_best": room_pid, "room_best_pts": points.get(room_pid) if room_pid else None}
        # deltas: my realized points minus the counterfactual's. Positive = I beat it.
        row["adp_delta"] = (row["took_pts"] - row["adp_best_pts"]) if row["adp_best_pts"] is not None else None
        row["room_delta"] = (row["took_pts"] - row["room_best_pts"]) if row["room_best_pts"] is not None else None
        out.append(row)
    return out


def assemble(season_num: int, picks: list[dict], rid: int, *,
             proj: dict[str, float], adp_rank: dict[str, float],
             realized: dict[str, float], tiers: dict[str, int] | None = None,
             dispersion: dict[str, float] | None = None) -> tuple[list[list[dict]], list[dict]]:
    """PURE. Turn loaded season data into the two record shapes the metrics need:

      pools     — per real decision, the AVAILABLE pool [{pid, our_proj, adp,
                  realized}] over players that carry all three (correlation/top-N).
      decisions — per real decision, my pick vs the ADP-preferred available, with
                  FORGONE VALUE (our proj gap), ADP distance, tier-cross, dispersion.

    Only the egress fetch is unverifiable; this — where the analysis actually lives
    — is unit-tested with a fixture in test_exp34.py."""
    tiers = tiers or {}
    dispersion = dispersion or {}
    pools, decisions = [], []
    for p in cory_decisions(picks, rid):
        pn = p.get("pick_no") or 0
        took = str(p.get("player_id"))
        if took not in realized or took not in proj:
            continue  # ungradeable or unprojectable pick: missing, not zero
        board = board_before(picks, pn)
        pool = [{"pid": pid, "our_proj": proj[pid], "adp": adp_rank[pid],
                 "realized": realized.get(pid)}
                for pid in board if pid in proj and pid in adp_rank]
        pools.append(pool)
        adp_best = best_available_by_adp(board & set(adp_rank), adp_rank)
        if adp_best is None:
            continue
        tt, at = tiers.get(took), tiers.get(adp_best)
        decisions.append({
            "season": season_num, "round": p.get("round"), "pick_no": pn,
            "took": took, "took_proj": proj.get(took), "took_realized": realized.get(took),
            "adp_best": adp_best, "adp_best_proj": proj.get(adp_best),
            "adp_best_realized": realized.get(adp_best),
            # deviation cost in FORGONE VALUE (our projected points), the adopted unit
            "forgone_value": (round(proj[adp_best] - proj[took], 2)
                              if adp_best in proj and took in proj else None),
            # ADP distance kept as the comparison unit: spots I reached past market
            "adp_distance": (round(adp_rank[took] - pn, 1) if took in adp_rank else None),
            "dispersion": dispersion.get(took),
            "crosses_cliff": (None if tt is None or at is None else (tt != at)),
            "took_tier": tt, "adp_best_tier": at,
        })
    return pools, decisions


def _bootstrap_ci(deltas: list[float], iters: int = 10000, seed: int = 34) -> tuple[float, float]:
    """Percentile bootstrap 95% CI of the mean. Deterministic seed — a metric
    that moves between runs is not a metric."""
    xs = [d for d in deltas if d is not None]
    if len(xs) < 2:
        return (float("nan"), float("nan"))
    # tiny LCG, no numpy dependency in the pure core
    state = seed & 0xFFFFFFFF
    def rnd():
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    n = len(xs)
    means = []
    for _ in range(iters):
        s = 0.0
        for _ in range(n):
            s += xs[int(rnd() * n)]
        means.append(s / n)
    means.sort()
    return (round(means[int(0.025 * iters)], 2), round(means[int(0.975 * iters)], 2))


def summarize_arm(rows: list[dict], key: str) -> dict:
    """Mean delta, bootstrap CI, n, and per-season sign consistency for one arm.
    'inconclusive' when the CI spans zero — which the pre-registration reads as
    arguing for the anchor to bind harder, not as a tie that lets deviating stand."""
    ds = [r[key] for r in rows if r.get(key) is not None]
    n = len(ds)
    mean = round(sum(ds) / n, 2) if n else float("nan")
    lo, hi = _bootstrap_ci(ds)
    by_season = {}
    for r in rows:
        if r.get(key) is None:
            continue
        by_season.setdefault(r["season"], []).append(r[key])
    signs = {s: (1 if sum(v) > 0 else (-1 if sum(v) < 0 else 0)) for s, v in by_season.items()}
    consistent = len(set(signs.values())) == 1 and 0 not in signs.values()
    verdict = ("inconclusive" if (lo <= 0 <= hi or n < 2)
               else ("beat" if mean > 0 else "lost"))
    return {"n": n, "mean_delta": mean, "ci95": [lo, hi], "verdict": verdict,
            "per_season_sign": signs, "sign_consistent": consistent}


def build_result(all_rows: list[dict]) -> dict:
    return {
        "experiment": "34 — recommendation-vs-market scoreboard (two arms)",
        "metric": "realized rest-of-season fantasy points; my pick minus best-available-by-source",
        "n_decisions": len(all_rows),
        "underpowered": True,
        "note": "n~41, underpowered by construction; inconclusive => anchor binds HARDER (PRE-REGISTRATION-34.md)",
        "arm_A_market_adp": summarize_arm(all_rows, "adp_delta"),
        "arm_B_room_revealed": summarize_arm(all_rows, "room_delta"),
        "decisions": all_rows,
    }


# ───────────────────────────────────────────────────────────── egress main ──
# CI ONLY. Thin glue: it fetches (FFC ADP + nflverse realized/priors) and delegates
# ALL analysis to the verified pure functions (assemble + exp34_metrics). It cannot
# run in the sandbox (no egress); the analysis it calls is unit-tested there.
def _weekly_games(weekly_df, season: int, crosswalk: dict) -> dict[str, int]:
    """{sleeper_id: games played} for a season — how many weeks a player has a row.
    Feeds walk_forward's small-sample shrink."""
    out: dict[str, int] = {}
    if weekly_df is None or len(weekly_df) == 0:
        return out
    cols = set(weekly_df.columns)
    id_col = "player_id" if "player_id" in cols else "gsis_id"
    df = weekly_df[weekly_df["season"] == season] if "season" in cols else weekly_df
    for row in df.to_dict("records"):
        sid = crosswalk.get(str(row.get(id_col)))
        if sid:
            out[sid] = out.get(sid, 0) + 1
    return out


def _harvest_realized(season: dict) -> dict[str, float]:
    """Season-total realized fantasy points per player from the HARVEST
    (league_history players_points), summed across every harvested week. The
    obvious in-repo source when nflverse cannot serve a season's realized — the
    same source the dollar arm grades all three seasons from. ROSTER-GATED: a
    player only scores weeks he was rostered, so a mid-season drop is truncated
    (the accepted limit roster_sim documents). Scored under Sleeper's engine =
    the league's own scoring, so it is in the same currency as our projection."""
    sys.path.insert(0, str(HERE))
    import roster_sim as RS
    gpp = RS.global_player_points(season)          # {week: {player_id: points}}
    out: dict[str, float] = {}
    for _wk, pts in gpp.items():
        for pid, v in pts.items():
            out[str(pid)] = round(out.get(str(pid), 0.0) + float(v or 0.0), 2)
    return out


def _egress_main(out_dir: Path) -> int:
    sys.path.insert(0, str(HERE.parent))          # draft/ on path
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import adp as ADP
    import sleeper_import as SL
    from backtest import grade as GR
    from backtest import projections as PROJ
    import exp34_metrics as MET
    import nfl_data_py as nfl

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    seasons = [s for s in history["seasons"] if real_draft(s)]
    print("exp34 seasons:", sorted({int(s["season"]) for s in seasons}))

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

    import pandas as pd
    # weekly per year, year-by-year so one 404 can't kill the run (cli.py's lesson).
    need = sorted({y for s in seasons for y in (int(s["season"]) - 2,
                   int(s["season"]) - 1, int(s["season"]))})
    caveats = []
    frames, missing = [], []
    for y in need:
        try:
            df = nfl.import_weekly_data([y]); frames.append(df); print(f"  weekly {y}: {len(df)} rows")
        except Exception as e:
            missing.append(y); print(f"  weekly {y} UNAVAILABLE ({type(e).__name__})")
    weekly = pd.concat(frames, ignore_index=True) if frames else None

    # PBP FALLBACK (cli.py's recovery): import_weekly_data 404s for some seasons
    # that import_pbp_data still serves — notably 2025. Rebuild from pbp, but ONLY
    # after cross-validating on a season the library CAN serve, so a quietly-wrong
    # rebuild never corrupts the grades. Refuse (with a caveat) if it disagrees.
    if missing and weekly is not None:
        have = sorted(set(need) - set(missing)); control = have[-1] if have else None
        print(f"  recovering {missing} from pbp (cross-validating on {control})")
        try:
            pbp = nfl.import_pbp_data(sorted(set(missing) | ({control} if control else set())), downcast=True)
        except Exception as e:
            pbp = None; caveats.append(f"pbp unavailable for {missing} ({type(e).__name__}); those seasons stay skipped")
        if pbp is not None and control:
            scfg = next((s.get("scoring_settings") for s in seasons if int(s["season"]) == control), {}) or {}
            xval = GR.cross_validate(pbp, weekly, control, scfg, crosswalk)
            print("    cross-validation:", json.dumps(xval, default=str))
            if xval.get("agrees"):
                rebuilt = GR.weekly_from_pbp(pbp, missing)
                if rebuilt:
                    weekly = pd.concat([weekly, pd.DataFrame(rebuilt)], ignore_index=True)
                    caveats.append(f"{missing} weekly REBUILT from pbp (import_weekly_data 404s); "
                                   f"cross-validated on {control} (worst top-200 diff {xval.get('worst_diff_top200')})")
                    missing = []
            else:
                caveats.append(f"{missing} NOT recovered: pbp rebuild disagreed with the library on {control}")

    have_years = set() if weekly is None else set(int(y) for y in weekly["season"].unique()) \
        if "season" in weekly.columns else set()

    all_pools, all_decisions = [], []
    realized_source = {}
    for s in seasons:
        yr = int(s["season"])
        scoring_cfg = s.get("scoring_settings") or {}
        teams = ((s.get("settings") or {}).get("teams")) or 10
        if yr not in have_years:
            # nflverse (incl. the cross-validation-gated pbp rebuild) could not serve
            # this season's realized. Before skipping, PROBE THE OBVIOUS IN-REPO
            # SOURCE: the harvest (league_history players_points) — the same source
            # the dollar arm grades all three seasons from, complete where nflverse
            # 404s. Roster-gated (a player only scores weeks he was rostered, so a
            # dropped bust is truncated), which is the accepted limit roster_sim
            # already carries; flagged, never smuggled.
            realized = _harvest_realized(s)
            if not realized:
                caveats.append(f"{yr}: realized unavailable from nflverse AND the harvest; SKIPPED")
                continue
            realized_source[yr] = "harvest"
            caveats.append(f"{yr}: nflverse realized unavailable (pbp rebuild refused by cross-"
                           f"validation on 2024 — the gate working); RECOVERED from the harvest "
                           f"(league_history players_points, season totals, {len(realized)} players; "
                           f"roster-gated so a mid-season drop is truncated).")
        else:
            realized = GR.rest_of_season_points(weekly, yr, scoring_cfg, crosswalk, from_week=1)
            realized_source[yr] = "nflverse"
        # our walk-forward projection from strictly PRIOR realized points (no leak).
        prior_pts, prior_games = {}, {}
        for py in (yr - 2, yr - 1):
            if py in have_years:
                prior_pts[py] = GR.rest_of_season_points(weekly, py, scoring_cfg, crosswalk)
                prior_games[py] = _weekly_games(weekly, py, crosswalk)
        proj = PROJ.walk_forward(yr, prior_pts, prior_games, positions, ages)
        if not proj:
            caveats.append(f"{yr}: no prior seasons to project from; season SKIPPED")
            continue
        # market: real contemporaneous FFC ADP + published dispersion.
        try:
            payload = ADP.fetch_adp("half-ppr", teams, yr)
        except Exception as e:
            caveats.append(f"{yr}: FFC ADP unavailable ({type(e).__name__}); season SKIPPED"); continue
        adp_rank, dispersion = {}, {}
        for entry in payload.get("players") or []:
            sid, _how = ADP.match_player(entry, index)
            if sid and entry.get("adp") is not None:
                adp_rank[str(sid)] = float(entry["adp"])
                sd = entry.get("stdev") or entry.get("std_dev") or entry.get("sd")
                if sd is not None:
                    dispersion[str(sid)] = float(sd)
        rid = cory_roster_id(s)
        if rid is None:
            caveats.append(f"{yr}: could not resolve Cory's roster_id; season skipped"); continue
        # tiers deliberately omitted for now -> cliff analysis degrades to 'thin' rather
        # than inventing tier boundaries; a measured tier model is exp 36's job.
        pools, decisions = assemble(yr, real_draft(s), rid, proj=proj, adp_rank=adp_rank,
                                    realized=realized, tiers=None, dispersion=dispersion)
        print(f"  {yr}: {len(decisions)} decisions, {len(adp_rank)} ADP-matched, "
              f"{len(proj)} projected [realized: {realized_source.get(yr)}]")
        all_pools.extend(pools); all_decisions.extend(decisions)

    # ── the measuring stick: delegate to the verified metrics ────────────────
    fv_edges, fv_labels = [1e-6, 10, 30], ["value(<=0)", "near-zero", "moderate", "large"]
    dist_edges, dist_labels = [5, 15, 30], ["<5", "5-15", "15-30", ">30"]
    disp_edges, disp_labels = [4, 8], ["unanimous", "mid", "contested"]
    from collections import Counter as _Counter
    n_by_season = dict(_Counter(str(d["season"]) for d in all_decisions))
    result = {
        "experiment": "34 — recommendation-vs-market, policy-level (forgone-value unit)",
        "n_decisions": len(all_decisions), "n_pool_picks": len(all_pools),
        "n_by_season": n_by_season, "realized_source": realized_source,
        "underpowered": True,
        "note": "n~41, underpowered; inconclusive => anchor binds HARDER (PRE-REGISTRATION-34)",
        "rank_correlation": MET.aggregate_correlations(all_pools),
        "top5_set_value": MET.topn_value(all_pools, 5),
        "top10_set_value": MET.topn_value(all_pools, 10),
        "bands_forgone_value": MET.bands(all_decisions, "forgone_value", fv_edges, fv_labels),
        "bands_adp_distance": MET.bands(all_decisions, "adp_distance", dist_edges, dist_labels),
        "sensitivity_by_round": MET.bands(all_decisions, "round", [4, 8, 12], ["r1-3", "r4-7", "r8-11", "r12+"]),
        "sensitivity_by_dispersion": MET.bands(all_decisions, "dispersion", disp_edges, disp_labels),
        "cliff": MET.cliff_split(all_decisions),
        "caveats": caveats,
        "decisions": all_decisions,
    }
    (out_dir / "exp34.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (out_dir / "EXP34.md").write_text(_report(result))
    print("\n" + _report(result))
    return 0


def _report(r: dict) -> str:
    rc = r["rank_correlation"]
    L = ["# EXPERIMENT 34 — recommendation vs market (policy-level)", "",
         f"_{r['n_decisions']} real decisions across three seasons; our ordering =",
         "walk-forward projected value. Underpowered by construction (n~41); an",
         "inconclusive CI (spans zero) reads as the anchor binding HARDER, not looser._", "",
         f"**n by season: {r.get('n_by_season')}** · realized source: {r.get('realized_source')}",
         "_(a season marked `harvest` had its realized recovered from league_history "
         "players_points after nflverse's pbp rebuild was refused by cross-validation — "
         "roster-gated, so a mid-season drop is truncated.)_", "",
         "## PRIMARY — rank correlation over the available pool", "",
         f"- our ordering: mean rho {rc['rho_our_mean']} CI {rc['rho_our_ci']}",
         f"- market (ADP): mean rho {rc['rho_market_mean']} CI {rc['rho_market_ci']}",
         f"- **difference (our - market): {rc['diff_mean']} CI {rc['diff_ci']} -> {rc['verdict'].upper()}** "
         f"over {rc['n_picks']} picks", "",
         "## Top-N set value (realized pts, our set vs market set)", "",
         f"- top-5: our {r['top5_set_value']['our_mean']} vs market {r['top5_set_value']['market_mean']} "
         f"(delta {r['top5_set_value']['delta_mean']}, {r['top5_set_value']['verdict']})",
         f"- top-10: our {r['top10_set_value']['our_mean']} vs market {r['top10_set_value']['market_mean']} "
         f"(delta {r['top10_set_value']['delta_mean']}, {r['top10_set_value']['verdict']})", "",
         "## The deviation-edge surface (hit rate = took beat ADP-preferred available)", ""]
    def band_block(title, bands, unit):
        out = [f"### by {title} ({unit})", ""]
        for b in bands:
            thin = " ⚠THIN" if b.get("thin") else ""
            out.append(f"- {b['band']}: n={b['n']} hit={b['hit_rate']} "
                       f"mean_delta={b['mean_delta']} CI {b['ci']} {b['verdict']}{thin}")
        return out + [""]
    L += band_block("FORGONE VALUE (primary)", r["bands_forgone_value"], "projected pts given up")
    L += band_block("ADP DISTANCE (comparison — which unit predicts better is a finding)",
                    r["bands_adp_distance"], "spots")
    L += band_block("ROUND / remaining-picks decay", r["sensitivity_by_round"], "round band")
    L += band_block("MARKET DISPERSION", r["sensitivity_by_dispersion"], "ADP stdev")
    cl = r["cliff"]
    L += ["### tier-cliff proximity", "",
          f"- crosses cliff: n={cl['crosses_cliff']['n']} hit={cl['crosses_cliff']['hit_rate']} "
          f"(tiers omitted this run -> expect thin/empty; measured tiers are exp 36)",
          f"- within tier:  n={cl['within_tier']['n']} hit={cl['within_tier']['hit_rate']}", ""]
    if r.get("caveats"):
        L += ["## Caveats", ""] + [f"- {c}" for c in r["caveats"]] + [""]
    L += ["## What this does NOT settle", "",
          "Correct cost accounting on unvalidated projections is still unvalidated: if our",
          "player evaluations are wrong, a correctly-priced deviation is still wrong. That is",
          "exp 33's job. And the composite-ordering variant (E.recommend, not just projections)",
          "is a labelled follow-up needing the JS replay path.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
