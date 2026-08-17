# TERRITORY: A
"""EXP-FP-HIST-PROJ — is FantasyPros' historical projection archive genuinely
preseason-frozen, and if so, does a professional source beat the naive baselines
under OUR scoring? (Cory 2026-08-15: "have we ran through previous years to
test for sanity")

Implements draft/backtest/EXP-FP-HIST-PROJ-PREREG.md — committed BEFORE this
file and before any fetch. Every threshold below is that document's; changing
one here without changing it there breaks the preregistration and the tests.

REFUSAL-FIRST. A "historical" endpoint served today may return post-hoc revised
numbers — the exp33 leak in costume — and grading a leaked forecast flatters
it. So authenticity gates run BEFORE any accuracy number exists, in a fixed
order, and the first failing gate is the year's filed verdict:

    no_fetch / no_rows       nothing usable served
    no_adp_anchor            archived ADP (the trusted anchor) unavailable ->
                             markers underivable -> refuse
    no_markers               zero early-lost top-75 picks derivable -> undecidable
    leaked                   a marker is missing or already injury-sized
    ambiguous_markers        a marker sits between leak-sized and full-season
    regenerated              since-departed players absent -> built from a current DB
    thin_anchor_join /       the ADP<->projection join too thin / wildly
    anchor_divergent         divergent from the proven-genuine archive
    thin_crosswalk           too few Sleeper-pid matches to grade honestly
    graded                   every gate passed; metrics licensed

PURE core (evaluate_year + the gate functions): fixtures in, verdict out —
unit-tested both arms in draft/tests/test_exp_fp_hist_proj.py. The egress that
fetches FP runs in CI only (.github/workflows/exp-fp-hist-proj.yml).

What this can NEVER answer: Sleeper's own historical preseason skill —
unarchived anywhere; proj_series.json makes 2026 the first gradeable season,
in January 2027.

Run (CI): python3 draft/backtest/exp_fp_hist_proj.py
Writes draft/backtest/exp_fp_hist_proj.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import spearman           # noqa: E402  reused, unit-tested
from scoring import score_stat_line            # noqa: E402
from adp import normalize_name                 # noqa: E402

# ── preregistered constants (mirror EXP-FP-HIST-PROJ-PREREG.md exactly) ──────
YEARS = (2023, 2024, 2025)
LAST_SCORED_WEEK = 17
POSITIONS = ("QB", "RB", "WR", "TE")
MIN_N = 10
PROJ_ROWS_FLOOR = 50
ADP_ANCHOR_FLOOR = 100
MARKER_ADP_MAX = 75.0
MARKER_REALIZED_MAX = 30.0
MARKER_FULL_SEASON_MIN = 100.0
MARKER_LEAK_MAX = 60.0
GHOST_MIN = 10
ANCHOR_RHO_MIN = 0.60
ANCHOR_JOIN_MIN = 100
CROSSWALK_MIN = 100
STATLINE_COVERAGE_MIN = 0.5
RECENCY_WEIGHTS = (0.7, 0.3)   # league_config.recency_weights, declared not fitted

LATEST_STORE_YEAR = 2025       # the "still exists" reference for the ghost gate

OUT = HERE / "exp_fp_hist_proj.json"

#: PER-PLAYER ROW RETENTION, ADDED 2026-08-17. Cory: "why can't we also pull in
#: the fantasy pros data again and keep all data this time?"
#:
#: He is right and the cost of not doing it has already been paid twice. This
#: module graded 2023/2024/2025, passed every authenticity gate, and committed
#: 10.7 KB of PER-POSITION AGGREGATES — n, spearman, mae, bias. The per-player
#: rows existed in memory and were dropped on the floor. Consequences, both
#: real and both his own questions going unanswered:
#:
#:   * proj_mean_blend_2026-08-16.md was REFUSED for want of a control arm. A
#:     blend is a per-player average and whether it beats its best component is
#:     decided by the ERROR CORRELATION between sources — a quantity no
#:     aggregate MAE can carry.
#:   * position_weight_transfer could only test own-model arms against each
#:     other, never Sleeper against FantasyPros.
#:
#: Neither was blocked by the world. Both were blocked by this retention
#: decision. `our_pts` on each row is FP's stat line scored under OUR league
#: table, so what is retained is already league-normalised — which is the other
#: half of what Cory asked for.
ROWS_OUT = HERE / "fp_hist_rows.json"


# ── realized totals (same semantics as model_accuracy_backtest.season_totals,
#    but takes the loaded store dict so fixtures can stand in) ────────────────
def season_totals(store: dict, last_week: int = LAST_SCORED_WEEK) -> tuple[dict, dict]:
    """({pid: points}, {pid: weeks_with_a_row}) for weeks 1..last_week. A week
    ROW is presence in that week's points dict — presence means 'was on a
    field', the games basis the rest of the repo uses."""
    totals: dict[str, float] = {}
    games: dict[str, int] = {}
    for w in store["weeks"]:
        if w["week"] > last_week:
            continue
        for pid, v in w["points"].items():
            totals[pid] = totals.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return totals, games


# ── projection valuation (OUR scoring only; FP's points never grade) ─────────
def value_rows(proj_rows: list, scoring: dict) -> tuple[list, float]:
    """Attach `our_pts` (score_stat_line over the row's stats, None if no
    stats) and `gate_value` (our_pts, else FP's printed points — magnitude
    GATES only, never a graded number) to each row. Returns (rows, coverage =
    fraction of rows with a stats-derived value)."""
    out = []
    with_stats = 0
    for r in proj_rows:
        stats = r.get("stats") or {}
        our = score_stat_line(stats, scoring) if stats else None
        if stats:
            with_stats += 1
        out.append({**r, "our_pts": our,
                    "gate_value": our if our is not None else r.get("fp_fpts")})
    coverage = (with_stats / len(out)) if out else 0.0
    return out, coverage


def proj_by_name(valued_rows: list) -> dict:
    """{normalized_name: max gate_value} — same-provider name join for the
    marker and anchor gates (no crosswalk noise). Max on duplicates: the
    conservative direction for a gate that asks 'is a full-season-sized
    number still there'."""
    by = {}
    for r in valued_rows:
        v = r.get("gate_value")
        n = normalize_name(r.get("name") or "")
        if not n or v is None:
            continue
        if n not in by or v > by[n]:
            by[n] = float(v)
    return by


# ── G2: marker players ───────────────────────────────────────────────────────
def derive_markers(adp_rows: list, realized: dict) -> list:
    """Markers, derived not hand-picked: archived-ADP players with adp <=
    MARKER_ADP_MAX, position in POSITIONS, a crosswalked pid, and realized
    weeks-1-17 total <= MARKER_REALIZED_MAX (absent from the store entirely =
    0.0 — the strongest marker: drafted top-75, never played)."""
    out = []
    for r in adp_rows:
        pid = r.get("pid")
        if pid is None or r.get("position") not in POSITIONS:
            continue
        if r.get("adp") is None or float(r["adp"]) > MARKER_ADP_MAX:
            continue
        real = float(realized.get(str(pid), 0.0))
        if real <= MARKER_REALIZED_MAX:
            out.append({"name": r.get("name"), "pid": str(pid),
                        "adp": float(r["adp"]), "realized": round(real, 2)})
    return out


def gate_markers(markers: list, values_by_name: dict) -> dict:
    """The leak detector. A preseason-frozen file must still project a lost
    season at full size; a post-hoc file already knows. Any marker missing or
    leak-sized -> leaked. Any in the ambiguous band -> ambiguous_markers.
    Zero markers -> no_markers (undecidable, refuse)."""
    if not markers:
        return {"status": "no_markers", "markers": []}
    detail = []
    verdicts = set()
    for m in markers:
        v = values_by_name.get(normalize_name(m["name"] or ""))
        if v is None:
            verdict = "missing"
        elif v >= MARKER_FULL_SEASON_MIN:
            verdict = "full_season"
        elif v < MARKER_LEAK_MAX:
            verdict = "leak_sized"
        else:
            verdict = "ambiguous"
        verdicts.add(verdict)
        detail.append({**m, "projected": (round(v, 2) if v is not None else None),
                       "verdict": verdict})
    if "missing" in verdicts or "leak_sized" in verdicts:
        status = "leaked"
    elif "ambiguous" in verdicts:
        status = "ambiguous_markers"
    else:
        status = "pass"
    return {"status": status, "markers": detail}


# ── G3: retired-since ghosts ─────────────────────────────────────────────────
def gate_ghosts(matched_pids: list, graded_realized: dict, latest_realized: dict,
                year: int) -> dict:
    """Crosswalked projection players who existed in the graded season (>= 1
    weekly row) but have ZERO rows in the latest store. A genuine old preseason
    file carries dozens of the since-departed; a file regenerated from today's
    player DB does not. Undecidable for the latest season itself."""
    if year >= LATEST_STORE_YEAR:
        return {"status": "not_applicable", "ghost_count": None,
                "note": "no later store exists to establish departure"}
    ghosts = [str(p) for p in matched_pids
              if str(p) in graded_realized and str(p) not in latest_realized]
    status = "pass" if len(ghosts) >= GHOST_MIN else "regenerated"
    return {"status": status, "ghost_count": len(ghosts),
            "ghost_sample_pids": sorted(ghosts)[:10]}


# ── G4: anchor cross-check ───────────────────────────────────────────────────
def gate_anchor(adp_rows: list, values_by_name: dict) -> dict:
    """Spearman(-adp, projection value) on the name-joined population. The ADP
    archive is already proven genuine (exp_source_grade); a claimed projection
    archive that disagrees wildly with it is off, and gets named."""
    pairs = []
    for r in adp_rows:
        if r.get("adp") is None:
            continue
        v = values_by_name.get(normalize_name(r.get("name") or ""))
        if v is not None:
            pairs.append((-float(r["adp"]), float(v)))
    if len(pairs) < ANCHOR_JOIN_MIN:
        return {"status": "thin_anchor_join", "n": len(pairs), "rho": None}
    rho = round(spearman([a for a, _ in pairs], [b for _, b in pairs]), 4)
    return {"status": ("pass" if rho >= ANCHOR_RHO_MIN else "anchor_divergent"),
            "n": len(pairs), "rho": rho}


# ── baselines (identical semantics to model_accuracy_backtest.build_models) ──
def build_baselines(prior_totals: dict) -> dict:
    """prior_totals: {season: {pid: realized}} for whatever prior stores exist.
    naive_prev needs y-1; recency_blend needs BOTH y-1 and y-2 stores (the
    per-player fallback to last-alone is model_accuracy_backtest's rule, but a
    missing y-2 STORE refuses rather than silently collapsing onto naive)."""
    out = {"models": {}, "statuses": {}}
    if not prior_totals:
        out["statuses"]["naive_prev"] = "no_prior_store"
        out["statuses"]["recency_blend"] = "no_prior_store"
        return out
    y_last = max(prior_totals)
    out["models"]["naive_prev"] = dict(prior_totals[y_last])
    out["statuses"]["naive_prev"] = "built"
    if len(prior_totals) < 2:
        out["statuses"]["recency_blend"] = "no_prior_prior_store"
        return out
    y_prior = sorted(prior_totals)[-2]
    w_last, w_prior = RECENCY_WEIGHTS
    blend = {}
    for pid, last_total in prior_totals[y_last].items():
        prior_total = prior_totals[y_prior].get(pid)
        blend[pid] = (last_total if prior_total is None
                      else w_last * last_total + w_prior * prior_total)
    out["models"]["recency_blend"] = blend
    out["statuses"]["recency_blend"] = "built"
    return out


# ── grading (runs ONLY after every gate passed) ──────────────────────────────
def _cell(pairs: list, mode: str) -> dict:
    if len(pairs) < MIN_N:
        return {"n": len(pairs), "status": "unmeasurable"}
    cell = {"n": len(pairs), "status": "measured",
            "spearman": round(spearman([f for f, _ in pairs],
                                       [a for _, a in pairs]), 4)}
    if mode == "statline":
        errs = [f - a for f, a in pairs]
        cell["mae"] = round(sum(abs(e) for e in errs) / len(errs), 2)
        cell["bias"] = round(sum(errs) / len(errs), 2)
    return cell


def grade_projections(fp_by_pid: dict, actual: dict, positions: dict,
                      baselines: dict, mode: str) -> dict:
    """Per-position FP cells on FP's own coverage, plus head-to-head vs each
    built baseline on the SHARED population — the only denominator on which
    'FP beats naive' is one quantity. MAE only in statline mode: FP's printed
    points encode FP's league, not ours."""
    out = {"mode": mode, "fp_cells": {}, "excluded_no_weekly_row": 0,
           "survivorship_note": ("players projected but absent from every graded "
                                 "week are excluded and counted here — MAE is "
                                 "optimistic by an unmeasured amount"),
           "baseline_statuses": dict(baselines.get("statuses") or {}),
           "head_to_head_shared_population": {}}
    for p in POSITIONS:
        pairs = []
        for pid, f in fp_by_pid.items():
            if positions.get(pid) != p:
                continue
            a = actual.get(pid)
            if a is None:
                out["excluded_no_weekly_row"] += 1
                continue
            pairs.append((float(f), float(a)))
        out["fp_cells"][p] = _cell(pairs, mode)

    models = {"fantasypros": fp_by_pid, **(baselines.get("models") or {})}
    if len(models) > 1:
        shared = set.intersection(*(set(m) for m in models.values()))
        for p in POSITIONS:
            pids = [pid for pid in shared
                    if positions.get(pid) == p and actual.get(pid) is not None]
            if len(pids) < MIN_N:
                out["head_to_head_shared_population"][p] = {
                    "n": len(pids), "status": "unmeasurable"}
                continue
            row = {"n": len(pids), "status": "measured"}
            for name, proj in models.items():
                row[name] = _cell([(float(proj[pid]), float(actual[pid]))
                                   for pid in pids], mode)
                row[name].pop("n", None), row[name].pop("status", None)
            if mode == "statline":
                for bname in (baselines.get("models") or {}):
                    row["fp_minus_" + bname + "_mae"] = round(
                        row["fantasypros"]["mae"] - row[bname]["mae"], 2)
            out["head_to_head_shared_population"][p] = row
    else:
        out["head_to_head_shared_population"] = {
            "status": "no_baselines_available",
            "why": out["baseline_statuses"]}
    return out


# ── the pure orchestrator: fixtures in, verdict out ──────────────────────────
def evaluate_year(year: int, adp_rows: list, proj_rows: list, scoring: dict,
                  stores: dict, positions: dict) -> dict:
    """One year, gated in preregistered order. adp_rows: [{name, position,
    adp, pid|None}] (pid = Sleeper crosswalk). proj_rows: parse_projections
    rows + optional 'pid'. stores: {season: store_dict} (graded year required;
    priors/latest as available). First failing gate is the verdict; NO metric
    is computed for a failed year."""
    res: dict = {"year": year, "gates": {}}

    def refuse(status: str) -> dict:
        res["status"] = status
        res["metrics"] = None
        return res

    # G0 — served at all
    res["gates"]["g0_rows"] = {"proj_rows": len(proj_rows)}
    if len(proj_rows) < PROJ_ROWS_FLOOR:
        return refuse("no_rows")

    # G1 — anchor present
    res["gates"]["g1_adp_anchor"] = {"adp_rows": len(adp_rows)}
    if len(adp_rows) < ADP_ANCHOR_FLOOR:
        return refuse("no_adp_anchor")

    valued, coverage = value_rows(proj_rows, scoring)
    # Carried out under a private key so the caller can RETAIN them (2026-08-17)
    # without changing evaluate_year's signature or any of its pure-function
    # tests. Popped before the verdict is written, so the graded artifact keeps
    # its old shape and the rows live in their own file.
    res["_rows"] = valued
    names = proj_by_name(valued)
    res["statline_coverage"] = round(coverage, 3)
    mode = "statline" if coverage >= STATLINE_COVERAGE_MIN else "points_only_rank_order"
    res["grading_mode"] = mode
    if mode != "statline":
        res["limitation"] = ("<50% of rows carry stat lines — FP's printed points "
                             "cannot be scored under OUR table, so only rank-order "
                             "is graded; MAE deliberately absent")

    graded_realized, _g = season_totals(stores[year])

    # G2 — markers
    g2 = gate_markers(derive_markers(adp_rows, graded_realized), names)
    res["gates"]["g2_markers"] = g2
    if g2["status"] != "pass":
        return refuse(g2["status"] if g2["status"] != "no_markers" else "no_markers")

    # G3 — ghosts
    matched_pids = [str(r["pid"]) for r in valued if r.get("pid") is not None]
    latest_realized = ({} if year >= LATEST_STORE_YEAR or LATEST_STORE_YEAR not in stores
                       else season_totals(stores[LATEST_STORE_YEAR])[0])
    g3 = gate_ghosts(matched_pids, graded_realized, latest_realized, year)
    res["gates"]["g3_ghosts"] = g3
    if g3["status"] not in ("pass", "not_applicable"):
        return refuse("regenerated")

    # G4 — anchor cross-check
    g4 = gate_anchor(adp_rows, names)
    res["gates"]["g4_anchor"] = g4
    if g4["status"] != "pass":
        return refuse(g4["status"])

    # G5 — crosswalk breadth
    n_matched = len(set(matched_pids))
    res["gates"]["g5_crosswalk"] = {
        "matched": n_matched, "parsed": len(valued),
        "match_rate": round(n_matched / len(valued), 3) if valued else 0.0}
    if n_matched < CROSSWALK_MIN:
        return refuse("thin_crosswalk")

    # every gate passed — grading is licensed
    fp_by_pid = {}
    for r in valued:
        pid = r.get("pid")
        v = r.get("our_pts") if mode == "statline" else r.get("gate_value")
        if pid is None or v is None:
            continue
        pid = str(pid)
        if pid not in fp_by_pid or v > fp_by_pid[pid]:
            fp_by_pid[pid] = float(v)

    prior_totals = {y: season_totals(stores[y])[0]
                    for y in stores if y < year}
    res["status"] = "graded"
    res["metrics"] = grade_projections(fp_by_pid, graded_realized, positions,
                                       build_baselines(prior_totals), mode)
    return res


# ── egress (CI only) ─────────────────────────────────────────────────────────
def _load_positions() -> dict:   # pragma: no cover
    return json.loads((HERE.parent / "data" / "player_positions.json").read_text())["positions"]


def _load_scoring() -> dict:   # pragma: no cover
    return json.loads((HERE.parent / "config" / "league_config.json").read_text())["scoring"]


def egress_main() -> int:   # pragma: no cover  (CI only — the sandbox has no FP egress)
    import fantasypros_adp as FP
    import adp as ADP
    import sleeper_import as SL

    scoring = _load_scoring()
    positions = _load_positions()
    stores = {y: json.loads((HERE / f"nflverse_weekly_points_{y}.json").read_text())
              for y in YEARS}
    index = ADP.build_index(SL.fetch_players())

    per_year = {}
    retained = {}
    for year in YEARS:
        print(f"── {year} " + "─" * 40)
        adp_text, adp_url, adp_diag = FP.fetch(year)
        adp_rows = FP.parse(adp_text) if adp_text else []
        for r in adp_rows:
            sid, how = ADP.match_player(r, index)
            r["pid"] = str(sid) if sid else None
            r["match_method"] = how

        proj_text, proj_url, proj_diag = FP.fetch_projections(year)
        proj_rows = FP.parse_projections(proj_text) if proj_text else []
        for r in proj_rows:
            sid, how = ADP.match_player(r, index)
            r["pid"] = str(sid) if sid else None
            r["match_method"] = how

        if proj_text is None:
            year_res = {"year": year, "status": "no_fetch", "metrics": None,
                        "gates": {}}
        else:
            year_res = evaluate_year(year, adp_rows, proj_rows, scoring,
                                     stores, positions)
        year_res["fetch"] = {
            "adp": {"url": (adp_diag or {}).get("api_ok") or adp_url,
                    "rows": len(adp_rows)},
            "projections": {"url": (proj_diag or {}).get("api_ok") or proj_url,
                            "rows": len(proj_rows),
                            "tried": (proj_diag or {}).get("api_tried", [])},
        }
        year_rows = year_res.pop("_rows", [])
        per_year[year] = year_res
        # RETAIN THE ROWS, INCLUDING FOR A REFUSED YEAR. A refusal is a
        # statement about whether the year may be GRADED, not about whether the
        # rows are worth keeping — the rows are the evidence for the refusal,
        # and re-fetching to inspect one costs another live fetch that may not
        # be available later. The gate status is stamped on every row set so a
        # future consumer cannot grade a leaked year by accident.
        retained[str(year)] = {
            "status": year_res["status"],
            "gradeable": year_res["status"] == "graded",
            "scoring_note": ("our_pts = FP's stat line scored under OUR league "
                             "table; fp_fpts = FP's own printed number, which is "
                             "in THEIR scoring and must not be compared directly"),
            "rows": year_rows,
        }
        print(f"  status: {year_res['status']}  "
              f"(adp {len(adp_rows)} rows, proj {len(proj_rows)} rows)")

    graded = [y for y, r in per_year.items() if r["status"] == "graded"]
    out = {
        "_territory": "TERRITORY: A — produced by draft/backtest/exp_fp_hist_proj.py",
        "_prereg": "draft/backtest/EXP-FP-HIST-PROJ-PREREG.md (committed before any fetch)",
        "_note": ("Authenticity-gated grade of FantasyPros' claimed historical "
                  "preseason projections under OUR scoring. A year that failed a "
                  "gate carries its refusal as the verdict and NO numbers. "
                  "Sleeper's own historical skill remains structurally unmeasurable "
                  "until Jan 2027 (proj_series grading, already armed)."),
        "years": {str(y): per_year[y] for y in YEARS},
        "graded_years": graded,
        "headline": (f"{len(graded)}/{len(YEARS)} years passed every authenticity "
                     "gate and were graded" if graded else
                     "NO year passed the authenticity gates — the refusals above "
                     "are the filed verdict (exp33 discipline held)"),
    }
    OUT.write_text(json.dumps(out, indent=1))
    ROWS_OUT.write_text(json.dumps({
        "_territory": "TERRITORY: A — produced by exp_fp_hist_proj.py",
        "_note": ("PER-PLAYER FantasyPros historical projection rows, retained "
                  "2026-08-17 after they were dropped on every prior run. "
                  "`our_pts` is the row's stat line scored under OUR league "
                  "table (league-normalised); `fp_fpts` is FP's own printed "
                  "number in THEIR scoring and is NOT comparable to it. A year "
                  "whose `gradeable` is false failed an authenticity gate — its "
                  "rows are kept as the EVIDENCE for that refusal and must not "
                  "be graded."),
        "years": retained,
    }, indent=1))
    kept = sum(len(v["rows"]) for v in retained.values())
    print(f"wrote {OUT.name} — {out['headline']}")
    print(f"wrote {ROWS_OUT.name} — {kept} per-player rows retained across "
          f"{len(retained)} year(s)")
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
