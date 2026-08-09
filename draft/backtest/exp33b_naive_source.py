#!/usr/bin/env python3
"""EXPERIMENT 33b — NAIVE AS THE PROJECTION SOURCE (the tune-vs-replace decision).

Exp 33 found our walk-forward blend LOSES to a naive prior-year+availability baseline
at top-decile hit, and exp 35 confirmed the blend over-regresses (monotonic: less
regression, better ranking). Both point at the projections — the foundation every
recommendation inherits. This asks the decisive question those two raised but did not
answer: **is the fix to LOWER the regression weight, or to REPLACE the source with the
naive model?** — by running naive as the ACTUAL source through the two graders that
matter, against the shipped blend and against the market.

THREE ORDERINGS, raced head to head at Cory's real seats across the graded seasons:
  * BLEND  — `projections.walk_forward` (the shipped source).
  * NAIVE  — `exp33.naive_projection` (prior-year ppg × expected games × availability;
             NO regression, NO age curve). Decision-time-safe (strictly prior data).
  * ADP    — the market (FFC), the benchmark both must clear.

TWO GRADERS (draft-decision work reports in dollars where the grader supports it, with
the robust points companion):
  * RANKING — per-pick Spearman(ordering, realized) over the available pool, bootstrap
    CI over picks, and the paired differences (blend−naive, naive−adp, blend−adp).
  * DOLLARS — the value-greedy roster each source builds in Cory's seat, graded through
    the certified `grade_substituted`, per-season deltas (carries the dollar arm's
    stated construction limit: read gaps between sources, not levels).

PRE-REGISTERED READING (fixed 2026-08-09 in EXP34-METHODOLOGY.md, before this run):
if the naive input produces better rankings AND/OR better rosters than the blend, the
fix is to REPLACE the blend's input, not tune it — a simpler input that wins is the
finding. If the blend wins on construction (dollars) despite losing on ranking, that
isolates where each adds value. Ships NOTHING — a source change is a separate gated
SHIP decision (null + leave-one-season-out CV), cited and reversible.

Pure core (the three-way comparison aggregation) unit-tested in
draft/tests/test_exp33b.py WITHOUT egress. Egress main (nflverse + FFC) runs in CI.

Run (CI, egress): python draft/backtest/exp33b_naive_source.py --out draft/backtest
"""
from __future__ import annotations
import json, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from lab_projections import spearman, walk_forward      # noqa: E402
from exp34_metrics import bootstrap_ci              # noqa: E402
import exp33 as B33                                 # noqa: E402  naive_projection
import exp34_dollars as DOLL                        # noqa: E402  roster grading
import exp34 as X34                                 # noqa: E402  assemble/align/harvest


# ─────────────────────────────────────────── ranking comparison (pure) ──
def pool_three_way(pool: list[dict]) -> dict | None:
    """One pick's pool: rank-correlation of each ordering with realized value.
    `pool`: [{blend, naive, adp, realized}]. Skips pools with <3 gradeable players."""
    rows = [r for r in pool if r.get("realized") is not None]
    if len(rows) < 3:
        return None
    realized = [r["realized"] for r in rows]
    rho_blend = spearman([r["blend"] for r in rows], realized)
    rho_naive = spearman([r["naive"] for r in rows], realized)
    rho_adp = spearman([-r["adp"] for r in rows], realized)   # -adp: lower adp = better
    return {"blend": rho_blend, "naive": rho_naive, "adp": rho_adp,
            "naive_minus_blend": rho_naive - rho_blend,
            "naive_minus_adp": rho_naive - rho_adp,
            "blend_minus_adp": rho_blend - rho_adp, "n": len(rows)}


def _verdict(mean, lo, hi):
    if lo <= 0 <= hi:
        return "inconclusive"
    return "positive" if mean > 0 else "negative"


def aggregate_ranking(pools: list[dict]) -> dict:
    """Mean per-pick rho for each ordering + the paired differences with bootstrap
    CIs over picks. The pairwise diffs are the decision: does naive out-rank the
    blend (replace), and does either clear the market (adp)?"""
    per = [pc for pc in (pool_three_way(p) for p in pools) if pc]
    def col(k):
        xs = [c[k] for c in per]
        return round(sum(xs) / len(xs), 3) if xs else float("nan")
    out = {"n_picks": len(per),
           "rho_blend": col("blend"), "rho_naive": col("naive"), "rho_adp": col("adp")}
    for pair in ("naive_minus_blend", "naive_minus_adp", "blend_minus_adp"):
        xs = [c[pair] for c in per]
        lo, hi = bootstrap_ci(xs) if len(xs) >= 2 else (float("nan"), float("nan"))
        out[pair] = {"mean": round(sum(xs) / len(xs), 3) if xs else None,
                     "ci95": [lo, hi], "verdict": _verdict(sum(xs) / len(xs) if xs else 0, lo, hi)}
    return out


def replace_or_tune(rank: dict, dollar_naive_minus_blend_sum) -> str:
    """The pre-registered read, applied to the numbers (not tuned after)."""
    nmb = rank.get("naive_minus_blend", {})
    ranks_better = nmb.get("verdict") == "positive"
    earns_more = (dollar_naive_minus_blend_sum is not None and dollar_naive_minus_blend_sum > 0)
    if ranks_better and earns_more:
        return ("REPLACE: naive out-ranks the blend AND builds richer rosters — a simpler "
                "input wins on both, so the fix is replacement, not tuning (still gate-first).")
    if ranks_better and not earns_more:
        return ("MIXED: naive ranks better but the blend's construction holds the dollars — "
                "keep the blend's need/tier layer, feed it a less-regressed value input "
                "(exp 35's lever), rather than swapping wholesale.")
    if not ranks_better and earns_more:
        return "MIXED: blend ranks as well but naive earns more — investigate before acting."
    return ("KEEP/TUNE: naive does not clearly beat the blend on ranking here — the exp-35 "
            "weight reduction is the lever, not replacement. Gate before installing either.")


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
    seasons = [s for s in history["seasons"] if X34.real_draft(s)]
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

    def games_of(py):
        out = {}; dfp = weekly[weekly["season"] == py] if "season" in weekly.columns else weekly
        idc = "player_id" if "player_id" in weekly.columns else "gsis_id"
        for row in dfp.to_dict("records"):
            sid = crosswalk.get(str(row.get(idc)))
            if sid: out[sid] = out.get(sid, 0) + 1
        return out

    all_pools, season_rows, caveats = [], [], []
    for s in seasons:
        yr = int(s["season"]); scfg = s.get("scoring_settings") or {}
        teams = ((s.get("settings") or {}).get("teams")) or 10
        realized = (GR.rest_of_season_points(weekly, yr, scfg, crosswalk, from_week=1)
                    if yr in have else X34._harvest_realized(s))
        if yr not in have:
            caveats.append(f"{yr}: realized from harvest (nflverse unavailable)")
        prior_pts, prior_games = {}, {}
        for py in (yr - 2, yr - 1):
            if py in have:
                prior_pts[py] = GR.rest_of_season_points(weekly, py, scfg, crosswalk)
                prior_games[py] = games_of(py)
        if not prior_pts:
            caveats.append(f"{yr}: no priors; skipped"); continue
        blend = walk_forward(yr, prior_pts, prior_games, positions, ages)
        naive = B33.naive_projection(prior_pts, prior_games, positions)
        try:
            payload = ADP.fetch_adp("half-ppr", teams, yr)
        except Exception as e:
            caveats.append(f"{yr}: FFC ADP unavailable ({type(e).__name__}); skipped"); continue
        adp_rank = {}
        for entry in payload.get("players") or []:
            sid, _ = ADP.match_player(entry, index)
            if sid and entry.get("adp") is not None:
                adp_rank[str(sid)] = float(entry["adp"])
        rid = X34.cory_roster_id(s); picks = X34.real_draft(s)

        # RANKING pools: at each of Cory's decisions, the available board scored by all three.
        for p in X34.cory_decisions(picks, rid):
            pn = p.get("pick_no") or 0
            board = X34.board_before(picks, pn)
            pool = [{"blend": blend[pid], "naive": naive.get(pid, 0.0), "adp": adp_rank[pid],
                     "realized": realized.get(pid)}
                    for pid in board if pid in blend and pid in adp_rank]
            if pool:
                all_pools.append(pool)

        # DOLLARS: the value-greedy roster each source builds, graded.
        pos_by_id = dict(RS.infer_positions(s))
        keepers = DOLL.cory_keepers(picks, rid)
        def grade(pick_fn):
            roster, _ = DOLL.build_policy_roster(picks, rid, pick_fn, keepers=keepers)
            return DOLL._dollars_of(DOLL.roster_dollars(history, payouts, yr, rid, roster, pos_by_id))["total"]
        d_blend = grade(DOLL.our_pick_fn(blend))
        d_naive = grade(DOLL.our_pick_fn(naive))
        d_adp = grade(DOLL.adp_pick_fn(adp_rank))
        season_rows.append({"season": yr, "dollars": {"blend": d_blend, "naive": d_naive, "adp": d_adp},
                            "naive_minus_blend": (round(d_naive - d_blend, 2) if None not in (d_naive, d_blend) else None),
                            "naive_minus_adp": (round(d_naive - d_adp, 2) if None not in (d_naive, d_adp) else None)})
        print(f"  {yr}: $ blend {d_blend} naive {d_naive} adp {d_adp}")

    rank = aggregate_ranking(all_pools)
    nmb_sum = sum(r["naive_minus_blend"] for r in season_rows if r["naive_minus_blend"] is not None) if season_rows else None
    result = {
        "experiment": "33b — naive as the projection source (tune-vs-replace)",
        "ranking": rank,
        "dollars_by_season": season_rows,
        "dollars_naive_minus_blend_sum": (round(nmb_sum, 2) if nmb_sum is not None else None),
        "decision": replace_or_tune(rank, nmb_sum),
        "caveats": caveats,
        "install_note": "Ships nothing. A source change is gated on null + leave-one-season-out CV.",
    }
    (out_dir / "exp33b.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (out_dir / "EXP33B.md").write_text(_report(result))
    print("\n" + _report(result))
    return 0


def _report(r: dict) -> str:
    rk = r["ranking"]
    L = ["# EXPERIMENT 33b — naive as the projection source (tune vs replace)", "",
         "_Race the shipped BLEND vs the NAIVE prior-year model vs the MARKET on ranking",
         "(per-pick Spearman over the pool) and on DOLLARS (value-greedy roster, certified",
         "grader). Pre-registered: if naive wins, REPLACE the input; ships nothing (gate first)._", "",
         "## RANKING (mean per-pick rho with realized)", "",
         f"- blend {rk['rho_blend']} · naive {rk['rho_naive']} · market/ADP {rk['rho_adp']} (n={rk['n_picks']} picks)",
         f"- **naive − blend: {rk['naive_minus_blend']['mean']} CI {rk['naive_minus_blend']['ci95']} "
         f"→ {rk['naive_minus_blend']['verdict']}**",
         f"- naive − market: {rk['naive_minus_adp']['mean']} CI {rk['naive_minus_adp']['ci95']} "
         f"→ {rk['naive_minus_adp']['verdict']}",
         f"- blend − market: {rk['blend_minus_adp']['mean']} CI {rk['blend_minus_adp']['ci95']} "
         f"→ {rk['blend_minus_adp']['verdict']}", "",
         "## DOLLARS (value-greedy roster per source)", ""]
    for row in r["dollars_by_season"]:
        d = row["dollars"]
        L.append(f"- {row['season']}: blend ${d['blend']} · naive ${d['naive']} · adp ${d['adp']} "
                 f"(naive−blend ${row['naive_minus_blend']})")
    L += [f"- **naive − blend, summed: ${r['dollars_naive_minus_blend_sum']}**", "",
          "## DECISION (pre-registered reading, applied not tuned)", "",
          f"**{r['decision']}**", ""]
    if r.get("caveats"):
        L += ["## Caveats", ""] + [f"- {c}" for c in r["caveats"]] + [""]
    L += [f"_{r['install_note']}_", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
