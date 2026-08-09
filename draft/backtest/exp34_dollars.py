#!/usr/bin/env python3
"""EXPERIMENT 34 — THE DOLLAR ARM (policy rosters graded in E[$]).

The correlation arm (exp34.py) answers *does our ORDERING rank realized value
better than the market's* — a POINTS claim. This arm answers the question the
league actually settles in: *would the roster our ordering builds have EARNED
MORE MONEY than the roster ADP builds*, under era-correct payouts, the harvested
weekly-high bar, and the real field.

WHY A SEPARATE ARM. In this league points != money. A pick's dollar value depends
on the roster it joins and the payout structure it competes in, not on the player
in isolation. Ranking better and earning more are different claims; the spec
(EXP34-METHODOLOGY.md) demands both be reported, AND whether they agree — because
"ranks better but earns the same or less" is the more interesting result and
points at the portfolio doctrine rather than at the projections.

THE PIPELINE, and where each half is trustworthy:
  1. CONSTRUCT the two policy rosters (`build_policy_roster`). Hold the rest of the
     room FIXED; at each of Cory's real non-keeper pick slots, "our ordering" takes
     the highest walk-forward-projected available player and "ADP" takes the
     ADP-best available, carried forward to a full seat (keepers + one body per
     real decision). Pure; unit-tested.
  2. GRADE each roster through the CERTIFIED money layer: `roster_sim` turns the
     roster into {week: best-legal-lineup points} off the HARVESTED per-player
     weekly scores, then `money_grade.grade_substituted` re-grades weekly-high +
     regular-season + the RESIMULATED playoff bracket against the real field, with
     era-correct payouts. Both certified before they may grade.

TWO LIMITS, STATED so they cannot masquerade as precision:
  * BOTH policies are graded on the OPTIMAL-lineup ceiling (roster_sim starts the
    best legal lineup in hindsight). So neither equals Cory's realized dollars —
    but the our-minus-ADP DELTA holds lineup-optimality constant across both, so
    the comparison stays apples-to-apples. The baseline here is the ADP-policy
    ceiling, never Cory's realized money.
  * The counterfactual holds the rest of the room fixed — a real deviation would
    ripple through everyone's later picks. Resimulating nine opponents' behaviour
    is a different, much larger experiment (the tournament). This is the honest
    single-seat counterfactual: the same board_before pool the correlation arm
    uses, so both arms describe the same decisions.

COVERAGE NOTE. The grading source is the HARVEST (`league_history.json`
players_points), complete for 2023/24/25 — so this arm grades ALL THREE seasons,
including 2025, which the correlation arm skipped because nflverse could not serve
2025 realized points. The ranker still needs egress (FFC ADP + nflverse PRIOR
points for the walk-forward projection), but 2025's projection comes from 2023/24
priors, which nflverse does serve. So n_seasons here can exceed the correlation
arm's.

The PURE core (roster construction, per-band marginal attribution, decomposition,
CI) is unit-tested in draft/tests/test_exp34_dollars.py WITHOUT egress — the
grading is pure over the harvest and needs only a synthetic ranker to exercise.
The egress main (FFC + nflverse priors) runs only in CI (lab.yml exp34 job).

Run (CI, egress): python draft/backtest/exp34_dollars.py --out draft/backtest
"""
from __future__ import annotations
import json, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import roster_sim as RS          # noqa: E402  certified roster -> weekly scores
import money_grade as MG         # noqa: E402  certified weekly scores -> dollars
import exp34 as X                # noqa: E402  shared alignment core (verified)

CORY = "coryjsimms"
COMPONENTS = ("weekly_high", "regular_season", "playoff")


# ─────────────────────────────────────────────────────── policy rosters ──
def cory_keepers(picks: list[dict], rid: int) -> list[str]:
    """Cory's keeper player_ids — kept by BOTH policies (a keeper is not a
    decision made against the board), so they anchor every policy roster."""
    return [str(p["player_id"]) for p in picks
            if p.get("roster_id") == rid and p.get("is_keeper")]


def build_policy_roster(picks: list[dict], rid: int, pick_fn, *,
                        keepers: list[str] | None = None) -> tuple[list[str], list[dict]]:
    """The full-seat roster a policy would have produced, room held FIXED.

    At each of Cory's real NON-KEEPER pick slots (in overall-pick order), the
    policy takes `pick_fn(available)` where `available` is the honest single-seat
    counterfactual pool:

        every player not taken by ANYONE before this slot in the real sequence
        (`board_before`), PLUS the players Cory really took at his OWN earlier
        slots (in the counterfactual he did not take them, so they are back on the
        board), MINUS players this policy already took, MINUS keepers.

    `pick_fn(available: set[str]) -> str | None` is the policy's ranker. When it
    returns None (no player it can rank is available), the slot FALLS BACK to
    Cory's real pick — so the roster is always a full seat and the policy deviates
    only where it has an opinion. Fallbacks are counted in the trace.

    Returns (roster_ids, trace); trace has one row per non-keeper slot:
    {pick_no, round, chosen, real, used_fallback}.
    """
    keepers = keepers if keepers is not None else cory_keepers(picks, rid)
    decisions = X.cory_decisions(picks, rid)                 # non-keeper, pick order
    cory_real = [str(p["player_id"]) for p in decisions]
    taken_by_policy: set[str] = set(keepers)
    roster: list[str] = list(keepers)
    trace: list[dict] = []
    for i, p in enumerate(decisions):
        pn = p.get("pick_no") or 0
        avail = X.board_before(picks, pn) | set(cory_real[:i])
        avail -= taken_by_policy
        chosen = pick_fn(avail)
        used_fallback = chosen is None
        if used_fallback:
            chosen = cory_real[i]                            # policy has no opinion here
        chosen = str(chosen)
        taken_by_policy.add(chosen)
        roster.append(chosen)
        trace.append({"pick_no": pn, "round": p.get("round"),
                      "chosen": chosen, "real": cory_real[i],
                      "used_fallback": used_fallback})
    return roster, trace


def our_pick_fn(proj: dict[str, float]):
    """Policy = take the highest walk-forward-projected available player."""
    def fn(avail: set[str]) -> str | None:
        cand = [(proj[pid], pid) for pid in avail if pid in proj]
        return max(cand)[1] if cand else None
    return fn


def adp_pick_fn(adp_rank: dict[str, float]):
    """Policy = take the ADP-best (lowest ADP) available player."""
    def fn(avail: set[str]) -> str | None:
        cand = [(adp_rank[pid], pid) for pid in avail if pid in adp_rank]
        return min(cand)[1] if cand else None
    return fn


# ─────────────────────────────────────────────────────────── grading ──
def roster_dollars(history: dict, payouts: dict, season_num, rid: int,
                   roster_ids: list[str], pos_by_id: dict[str, str],
                   slots: dict[str, int] | None = None) -> dict:
    """Grade a policy roster through the certified money layer. Returns the
    grade_substituted dict (weekly_high / regular_season / playoff / total)."""
    s = MG.season_of(history, season_num)
    if s is None:
        raise KeyError(f"no season {season_num} in history")
    weekly = RS.roster_weekly_scores(s, roster_ids, pos_by_id, slots)
    return MG.grade_substituted(history, payouts, season_num, rid, weekly)


def _dollars_of(grade: dict) -> dict:
    """The three components + a total, tolerant of a withheld (partial) playoff.
    When playoff $ is withheld the total is the RS+WH partial and `playoff` is
    None — surfaced, never silently summed as zero."""
    po = grade.get("playoff")
    total = grade.get("graded_total")
    if total is None:                       # playoff withheld -> partial only
        total = grade.get("graded_total_partial")
    return {"weekly_high": grade.get("weekly_high"),
            "regular_season": grade.get("regular_season"),
            "playoff": po,
            "total": total,
            "playoff_place": grade.get("playoff_place"),
            "made_playoffs": grade.get("made_playoffs"),
            "partial": grade.get("playoff") is None}


def season_delta(history: dict, payouts: dict, season_num, rid: int,
                 our_roster: list[str], adp_roster: list[str],
                 pos_by_id: dict[str, str], slots=None) -> dict:
    """One season's our-vs-ADP dollar comparison, decomposed by component."""
    og = _dollars_of(roster_dollars(history, payouts, season_num, rid, our_roster, pos_by_id, slots))
    ag = _dollars_of(roster_dollars(history, payouts, season_num, rid, adp_roster, pos_by_id, slots))
    delta = {}
    for k in COMPONENTS + ("total",):
        ov, av = og.get(k), ag.get(k)
        delta[k] = (round(ov - av, 2) if ov is not None and av is not None else None)
    return {"season": str(season_num), "our": og, "adp": ag, "delta": delta}


# ───────────────────────────────────── per-band marginal attribution ──
def band_of_forgone(fv: float | None, edges=(1e-6, 10, 30),
                    labels=("value(<=0)", "near-zero", "moderate", "large")) -> str | None:
    """The forgone-value band for one decision — SAME cut as the correlation arm,
    so a band's dollars line up beside its hit rate."""
    if fv is None:
        return None
    for edge, lab in zip(edges, labels):
        if fv < edge:
            return lab
    return labels[-1]


def marginal_dollars_by_band(history: dict, payouts: dict, season_num, rid: int,
                             adp_roster: list[str], our_trace: list[dict],
                             proj: dict[str, float], pos_by_id: dict[str, str],
                             slots=None) -> list[dict]:
    """Per-decision SINGLE-PICK-SWAP marginal dollars, bucketed by forgone value.

    Baseline = the full ADP roster. For each of Cory's decisions, swap that ONE
    slot's ADP pick for our-ordering's pick at the same slot, keep everything else
    ADP, re-grade, and attribute (this roster's total - ADP baseline total) to the
    decision. Assign it to the forgone-value band. Summed per band, this is
    "dollars per band" beside the correlation arm's hit rate.

    APPROXIMATE, and flagged as such: it prices each deviation as if the others
    did not happen, ignoring interactions among simultaneous deviations. The spec
    demotes per-pick dollar attribution to a secondary read for exactly this
    reason; the season-level our-minus-ADP total is the primary dollar figure.
    Slots where our pick == the ADP pick are no-ops (marginal 0, forgone ~0).
    """
    base_total = _dollars_of(roster_dollars(history, payouts, season_num, rid,
                                            adp_roster, pos_by_id, slots))["total"]
    # index of each decision slot inside the roster (keepers lead the roster)
    n_keepers = len(adp_roster) - len(our_trace)
    rows = []
    for i, t in enumerate(our_trace):
        our_pid, adp_pid = t["chosen"], adp_roster[n_keepers + i]
        fv = (round(proj[adp_pid] - proj[our_pid], 2)
              if adp_pid in proj and our_pid in proj else None)
        if our_pid == adp_pid:
            marginal = 0.0
        else:
            swapped = list(adp_roster)
            swapped[n_keepers + i] = our_pid
            swap_total = _dollars_of(roster_dollars(history, payouts, season_num, rid,
                                                    swapped, pos_by_id, slots))["total"]
            marginal = (round(swap_total - base_total, 2)
                        if swap_total is not None and base_total is not None else None)
        rows.append({"season": str(season_num), "pick_no": t["pick_no"], "round": t["round"],
                     "our": our_pid, "adp": adp_pid, "forgone_value": fv,
                     "band": band_of_forgone(fv), "marginal_dollars": marginal,
                     "deviated": our_pid != adp_pid})
    return rows


# ───────────────────────────────────────────── aggregate + interval ──
def _bootstrap_ci(vals: list[float], iters: int = 10000, seed: int = 34) -> tuple[float, float]:
    """Percentile bootstrap 95% CI of the mean (deterministic seed). Reuses the
    correlation arm's tiny LCG so both arms report intervals the same way."""
    return X._bootstrap_ci(vals, iters=iters, seed=seed)


def aggregate(season_rows: list[dict]) -> dict:
    """Pool the per-season deltas into the headline our-minus-ADP figure.

    The independent replication unit is the SEASON, so the interval is a bootstrap
    over seasons (n = number of graded seasons) and is flagged THIN — with two or
    three seasons a dollar CI is descriptive, not inferential, exactly the noise
    the spec predicts for this arm. If it spans zero, say so and let the
    correlation arm carry the statistical weight.
    """
    totals = [r["delta"]["total"] for r in season_rows if r["delta"]["total"] is not None]
    n = len(totals)
    mean = round(sum(totals) / n, 2) if n else None
    lo, hi = _bootstrap_ci(totals) if n >= 2 else (float("nan"), float("nan"))
    per_component = {}
    for k in COMPONENTS:
        vals = [r["delta"][k] for r in season_rows if r["delta"].get(k) is not None]
        per_component[k] = {"mean": round(sum(vals) / len(vals), 2) if vals else None,
                            "sum": round(sum(vals), 2) if vals else None, "n": len(vals)}
    signs = {r["season"]: (1 if (r["delta"]["total"] or 0) > 0 else
                           (-1 if (r["delta"]["total"] or 0) < 0 else 0))
             for r in season_rows if r["delta"]["total"] is not None}
    consistent = n >= 1 and len(set(signs.values())) == 1 and 0 not in signs.values()
    verdict = ("inconclusive" if n < 2 or lo <= 0 <= hi
               else ("our-earns-more" if mean > 0 else "adp-earns-more"))
    return {"n_seasons": n, "per_season_total_delta": {r["season"]: r["delta"]["total"] for r in season_rows},
            "mean_season_delta": mean, "sum_delta": round(sum(totals), 2) if n else None,
            "ci95_mean_season": [lo, hi], "verdict": verdict,
            "per_season_sign": signs, "sign_consistent": consistent,
            "by_component": per_component, "thin": n < 4}


def bands_summary(all_marginals: list[dict]) -> list[dict]:
    """Dollars per forgone-value band (summed marginal attribution) + deviation
    count, in the band order the correlation arm reports its hit rates."""
    order = ("value(<=0)", "near-zero", "moderate", "large")
    out = []
    for lab in order:
        rows = [m for m in all_marginals if m["band"] == lab and m["marginal_dollars"] is not None]
        devs = [m for m in rows if m["deviated"]]
        dollars = [m["marginal_dollars"] for m in rows]
        out.append({"band": lab, "n": len(rows), "n_deviations": len(devs),
                    "sum_dollars": round(sum(dollars), 2) if dollars else 0.0,
                    "mean_dollars": round(sum(dollars) / len(dollars), 2) if dollars else None})
    return out


# ─────────────────────────────────────────────────────────── egress main ──
# CI ONLY. Fetches the RANKER inputs (FFC ADP + nflverse PRIOR points for the
# walk-forward projection); the grading is pure over the harvest. It reuses the
# correlation arm's proven year-by-year loader shape. Cannot run in the sandbox
# (no egress); everything it delegates to is unit-tested there.
def _egress_main(out_dir: Path) -> int:
    sys.path.insert(0, str(HERE.parent))          # draft/ on path
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import adp as ADP
    import sleeper_import as SL
    from backtest import grade as GR
    from backtest import lab_projections as PROJ
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    payouts = json.loads((HERE.parent / "config" / "payouts.json").read_text())
    seasons = [s for s in history["seasons"] if X.real_draft(s)]
    print("exp34-dollars seasons:", sorted({int(s["season"]) for s in seasons}))

    players_raw = SL.fetch_players()
    index = ADP.build_index(players_raw)
    positions = {str(pid): p.get("position") for pid, p in players_raw.items()}
    ages = {str(pid): p.get("age") for pid, p in players_raw.items()}

    # PRIOR-season nflverse points only (for the projection); NOT current realized —
    # the harvest supplies realized dollars. So one 404 on the current season never
    # blocks grading it. Fetch the priors year-by-year (cli.py's lesson).
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
    frames, missing = [], []
    for y in prior_years:
        try:
            df = nfl.import_weekly_data([y]); frames.append(df); print(f"  prior weekly {y}: {len(df)} rows")
        except Exception as e:
            missing.append(y); print(f"  prior weekly {y} UNAVAILABLE ({type(e).__name__})")
    weekly = pd.concat(frames, ignore_index=True) if frames else None
    have_years = (set(int(y) for y in weekly["season"].unique())
                  if weekly is not None and "season" in weekly.columns else set())

    caveats = []
    season_rows, all_marginals, traces = [], [], {}
    for s in seasons:
        yr = int(s["season"])
        rid = X.cory_roster_id(s)
        if rid is None:
            caveats.append(f"{yr}: could not resolve Cory's roster_id; skipped"); continue
        picks = X.real_draft(s)
        scoring_cfg = s.get("scoring_settings") or {}
        teams = ((s.get("settings") or {}).get("teams")) or 10

        # our ordering = walk-forward projection from strictly PRIOR realized points
        prior_pts, prior_games = {}, {}
        for py in (yr - 2, yr - 1):
            if py in have_years:
                prior_pts[py] = GR.rest_of_season_points(weekly, py, scoring_cfg, crosswalk)
                prior_games[py] = {}
                # games count feeds walk_forward's shrink; rebuild cheaply
                dfp = weekly[weekly["season"] == py] if "season" in weekly.columns else weekly
                idc = "player_id" if "player_id" in weekly.columns else "gsis_id"
                for row in dfp.to_dict("records"):
                    sid = crosswalk.get(str(row.get(idc)))
                    if sid:
                        prior_games[py][sid] = prior_games[py].get(sid, 0) + 1
        proj = PROJ.walk_forward(yr, prior_pts, prior_games, positions, ages)
        if not proj:
            caveats.append(f"{yr}: no prior seasons to project from; skipped"); continue

        # market = real contemporaneous FFC ADP
        try:
            payload = ADP.fetch_adp("half-ppr", teams, yr)
        except Exception as e:
            caveats.append(f"{yr}: FFC ADP unavailable ({type(e).__name__}); skipped"); continue
        adp_rank = {}
        for entry in payload.get("players") or []:
            sid, _how = ADP.match_player(entry, index)
            if sid and entry.get("adp") is not None:
                adp_rank[str(sid)] = float(entry["adp"])

        # positions: harvest starter slots (season-local, no egress) first, Sleeper as fill
        pos_by_id = dict(positions)
        pos_by_id.update(RS.infer_positions(s))     # season-authoritative overrides

        keepers = cory_keepers(picks, rid)
        our_roster, our_trace = build_policy_roster(picks, rid, our_pick_fn(proj), keepers=keepers)
        adp_roster, adp_trace = build_policy_roster(picks, rid, adp_pick_fn(adp_rank), keepers=keepers)
        traces[yr] = {"our": our_trace, "adp": adp_trace,
                      "our_fallbacks": sum(t["used_fallback"] for t in our_trace),
                      "adp_fallbacks": sum(t["used_fallback"] for t in adp_trace)}

        row = season_delta(history, payouts, yr, rid, our_roster, adp_roster, pos_by_id)
        season_rows.append(row)
        all_marginals.extend(
            marginal_dollars_by_band(history, payouts, yr, rid, adp_roster, our_trace, proj, pos_by_id))
        print(f"  {yr}: our ${row['our']['total']} vs adp ${row['adp']['total']} "
              f"(delta ${row['delta']['total']}); fallbacks our={traces[yr]['our_fallbacks']} "
              f"adp={traces[yr]['adp_fallbacks']}")

    agg = aggregate(season_rows)
    bands = bands_summary(all_marginals)

    # cross-read the correlation arm to state agreement
    corr = {}
    corr_path = out_dir / "exp34.json"
    if corr_path.exists():
        try:
            cj = json.loads(corr_path.read_text())
            rc = cj.get("rank_correlation") or {}
            corr = {"diff_mean": rc.get("diff_mean"), "diff_ci": rc.get("diff_ci"),
                    "verdict": rc.get("verdict"), "n_picks": rc.get("n_picks")}
        except Exception as e:
            corr = {"error": str(e)}

    result = {
        "experiment": "34 dollar arm — policy rosters graded in E[$] (certified grader)",
        "n_seasons": agg["n_seasons"],
        "aggregate": agg,
        "seasons": season_rows,
        "bands_dollars": bands,
        "traces": traces,
        "correlation_arm": corr,
        "agreement": _agreement(agg, corr),
        "caveats": caveats,
        "note": ("both policies graded on the optimal-lineup ceiling (delta holds it "
                 "constant); room held fixed; harvest-graded so 2025 is included even "
                 "where the correlation arm skipped it. Dollar CI is thin (n=seasons) — "
                 "if it spans zero the correlation arm carries the weight."),
    }
    (out_dir / "exp34_dollars.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (out_dir / "EXP34-DOLLARS.md").write_text(_report(result))
    print("\n" + _report(result))
    return 0


def _agreement(agg: dict, corr: dict) -> dict:
    """Do the two arms agree? Ranks-better AND earns-more -> coherent. Ranks-better
    but earns same-or-less -> the MORE INTERESTING result (edge is in evaluating
    players, not in building rosters that fit this payout structure) -> portfolio
    doctrine, not projections."""
    ranks_better = (corr.get("verdict") == "beat") if corr else None
    dollar_verdict = agg.get("verdict")
    earns_more = dollar_verdict == "our-earns-more"
    dollar_inconclusive = dollar_verdict == "inconclusive"
    if ranks_better is None:
        return {"state": "correlation-arm-unavailable", "ranks_better": None,
                "dollar_verdict": dollar_verdict}
    if ranks_better and earns_more:
        state = "coherent — ranks better AND earns more"
    elif ranks_better and dollar_inconclusive:
        state = ("ranks better; dollars inconclusive (CI spans zero) — the thin-n "
                 "read: correlation carries the weight, no dollar claim")
    elif ranks_better and not earns_more:
        state = ("THE INTERESTING RESULT: ranks better but earns same-or-less — the "
                 "edge is in evaluating players, not in constructing rosters that fit "
                 "this payout structure. Points at the PORTFOLIO DOCTRINE, not the "
                 "projections.")
    else:
        state = f"ranks_better={ranks_better}, dollar_verdict={dollar_verdict}"
    return {"state": state, "ranks_better": ranks_better, "dollar_verdict": dollar_verdict}


def _report(r: dict) -> str:
    agg = r["aggregate"]
    L = ["# EXPERIMENT 34 — THE DOLLAR ARM (policy rosters graded in E[$])", "",
         f"_{r['n_seasons']} seasons graded through the certified money layer "
         "(`grade_substituted`): era-correct payouts, harvested weekly-high bar, real",
         "field, resimulated bracket. Our ordering = walk-forward projected value;",
         "ADP = real contemporaneous FFC. Both graded on the optimal-lineup ceiling,",
         "so the DELTA — not either level — is the number. The dollar CI is thin by",
         "construction (n=seasons); where it spans zero the correlation arm carries it._", "",
         "## HEADLINE — our-policy minus ADP-policy dollars", "",
         f"- **mean per-season delta: ${agg['mean_season_delta']}  "
         f"CI95 {agg['ci95_mean_season']}  -> {agg['verdict'].upper()}**",
         f"- sum across {agg['n_seasons']} seasons: ${agg['sum_delta']}"
         + ("  ⚠THIN (n<4 seasons — descriptive, not inferential)" if agg["thin"] else ""),
         f"- per season: " + ", ".join(f"{k}: ${v}" for k, v in agg["per_season_total_delta"].items()),
         f"- sign consistent across seasons: {agg['sign_consistent']} ({agg['per_season_sign']})", "",
         "### decomposed (our - ADP), summed across seasons", ""]
    for k in COMPONENTS:
        c = agg["by_component"][k]
        L.append(f"- {k.replace('_', ' ')}: sum ${c['sum']} (mean/season ${c['mean']}, n={c['n']})")
    L += ["", "## AGREEMENT with the correlation (ranking) arm", "",
          f"- correlation arm: diff {r['correlation_arm'].get('diff_mean')} "
          f"CI {r['correlation_arm'].get('diff_ci')} -> {r['correlation_arm'].get('verdict')} "
          f"(n={r['correlation_arm'].get('n_picks')})",
          f"- dollar arm: {agg['verdict']}",
          f"- **{r['agreement']['state']}**", "",
          "## Per season", ""]
    for s in r["seasons"]:
        o, a, d = s["our"], s["adp"], s["delta"]
        L += [f"### {s['season']}",
              f"- our:  total ${o['total']}  (wh ${o['weekly_high']} / rs ${o['regular_season']} / "
              f"po ${o['playoff']}, place {o['playoff_place']})",
              f"- adp:  total ${a['total']}  (wh ${a['weekly_high']} / rs ${a['regular_season']} / "
              f"po ${a['playoff']}, place {a['playoff_place']})",
              f"- **delta ${d['total']}** (wh ${d['weekly_high']} / rs ${d['regular_season']} / po ${d['playoff']})", ""]
    L += ["## Dollars per forgone-value band (single-pick-swap marginal — APPROXIMATE)", "",
          "_Each deviation priced as if the others did not happen (ignores interaction); "
          "the season-level delta above is the primary figure. Beside the correlation "
          "arm's per-band hit rate, this says how much money each class of deviation made._", ""]
    for b in r["bands_dollars"]:
        L.append(f"- {b['band']}: n={b['n']} ({b['n_deviations']} deviations) "
                 f"sum ${b['sum_dollars']} (mean ${b['mean_dollars']})")
    if r.get("caveats"):
        L += ["", "## Caveats", ""] + [f"- {c}" for c in r["caveats"]]
    L += ["", "## What this does NOT settle", "",
          "The counterfactual holds the room FIXED — a real deviation would ripple through "
          "nine opponents' later picks (that is the tournament, a larger experiment). Both "
          "policies get perfect-hindsight lineups, so this is a draft-quality ceiling, not a "
          "realized-dollars claim. And correct roster construction on unvalidated projections "
          "is still unvalidated — exp 33's job.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
