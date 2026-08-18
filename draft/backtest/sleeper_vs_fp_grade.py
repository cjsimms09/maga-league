# TERRITORY: A
"""SLEEPER vs FANTASYPROS vs own_v6 — the three-way grade on 2025.

Implements `draft/backtest/SLEEPER-VS-FP-PREREG.md`, committed BEFORE this file
and before any three-way number existed. Every threshold, population rule and
decision rule below is that document's.

WHY THIS IS NOW POSSIBLE. `proj_mean_blend_2026-08-16.md` §1 refused this exact
test on two blockers, and step 2 removed both:

    "Sleeper: never archived by anyone"   -> FALSE; /projections/nfl/regular/2025
                                             serves it and it passed every leak
                                             gate (sleeper_hist_proj)
    "FantasyPros: per-player rows not     -> reachable FROM CI, which is where
     retained; re-fetching unreachable"      this runs. That document's §9.2
                                             asked for exactly this fetch.

ONE SEASON, DECLARED NOT WORKED AROUND. N = 1 season is the ceiling of this
evidence because Sleeper's 2023/2024 are refused by step 2's leak gates
("1/3 season(s) passed every leak gate: [2025]"). CORRECTED 2026-08-18 (A):
this used to also say "2021/2022 weekly-points stores do not exist" — they
were built 08-17 00:20 (199103e4), so own_v6's coverage is no longer the
binding limit; the leak gates are. own_v6-vs-FP alone now has 2023-25.

PURE core (`grade`, `blend_arms`, `cross_fit_weights`, `precision_at`,
`error_correlation`): fixtures in, verdict out, both arms unit-tested in
`draft/tests/test_sleeper_vs_fp_grade.py`. The egress that re-fetches
FantasyPros runs in CI only (`.github/workflows/sleeper-vs-fp-grade.yml`) — the
sandbox proxy answers `www.fantasypros.com` and `api.sleeper.app` with 403/000.

Run (CI): python3 draft/backtest/sleeper_vs_fp_grade.py
Writes draft/backtest/sleeper_vs_fp_grade.json.
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import spearman           # noqa: E402
from exp_fp_hist_proj import season_totals      # noqa: E402  one definition

# ── preregistered constants (mirror SLEEPER-VS-FP-PREREG.md exactly) ─────────
SEASON = 2025
LAST_SCORED_WEEK = 17
POSITIONS = ("QB", "RB", "WR", "TE")
MIN_N = 10
TOP_N = (12, 24, 48)
TIE_RHO = 0.01
SINGLE_ARMS = ("sleeper", "fantasypros", "own_v6")
BLEND_ARMS = ("blend_equal", "blend_weighted")

OUT = HERE / "sleeper_vs_fp_grade.json"


# ── metrics ──────────────────────────────────────────────────────────────────
def precision_at(proj: dict, actual: dict, pids: list, n: int):
    """|top-n by projection ∩ top-n by realized| / n, within one position.

    Returns None when the cell is smaller than n. A cell of 30 players has no
    top-48 and MUST NOT quietly report a top-30 under that name — the number
    would be incomparable across positions and would flatter the shallow ones.
    """
    if len(pids) < n:
        return None
    top_p = set(sorted(pids, key=lambda p: -proj[p])[:n])
    top_a = set(sorted(pids, key=lambda p: -actual[p])[:n])
    return round(len(top_p & top_a) / n, 4)


def cell(proj: dict, actual: dict, pids: list) -> dict:
    if len(pids) < MIN_N:
        return {"n": len(pids), "status": "unmeasurable"}
    errs = [proj[p] - actual[p] for p in pids]
    out = {"n": len(pids), "status": "measured",
           "spearman": round(spearman([proj[p] for p in pids],
                                      [actual[p] for p in pids]), 4),
           "mae": round(statistics.fmean(abs(e) for e in errs), 2),
           "bias": round(statistics.fmean(errs), 2)}
    for n in TOP_N:
        out[f"top{n}"] = precision_at(proj, actual, pids, n)
    return out


def error_correlation(a: dict, b: dict, actual: dict, pids: list):
    """Pearson correlation of the two arms' signed errors. THE mechanism
    quantity: averaging pays when errors are independent, and `proj_mean_blend`
    §5 measured our sources at ~0.94, where it does not."""
    if len(pids) < MIN_N:
        return None
    ea = [a[p] - actual[p] for p in pids]
    eb = [b[p] - actual[p] for p in pids]
    ma, mb = statistics.fmean(ea), statistics.fmean(eb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ea, eb))
    da = sum((x - ma) ** 2 for x in ea) ** 0.5
    db = sum((y - mb) ** 2 for y in eb) ** 0.5
    return None if da == 0 or db == 0 else round(num / (da * db), 4)


# ── blends ───────────────────────────────────────────────────────────────────
def blend_equal(arms: dict, pids: list) -> dict:
    return {p: statistics.fmean(arms[a][p] for a in SINGLE_ARMS) for p in pids}


def cross_fit_weights(arms: dict, actual: dict, pids: list) -> dict:
    """Weights ∝ 1/MSE per position, fitted OUT OF SAMPLE by a 2-fold split over
    players, so no player is graded under a weight his own error helped choose.

    NAMED LIMITATION, carried from `proj_mean_blend` §5b: this is a PLAYER
    holdout, not a SEASON holdout. It cannot see whether a position weight
    transfers across seasons — the transfer that actually matters — and both
    folds share 2025's idiosyncratic shocks. It is the friendly case.
    """
    folds = ([p for p in pids if int(str(p)[-1]) % 2 == 0],
             [p for p in pids if int(str(p)[-1]) % 2 == 1])
    if min(len(f) for f in folds) < 5:
        return {"status": "fold_too_thin", "blended": {}, "weights": None}
    blended, weights = {}, []
    for fit, grade in (folds, folds[::-1]):
        mse = {}
        for a in SINGLE_ARMS:
            m = statistics.fmean((arms[a][p] - actual[p]) ** 2 for p in fit)
            if m <= 0:
                return {"status": "degenerate_mse", "blended": {}, "weights": None}
            mse[a] = m
        inv = {a: 1.0 / mse[a] for a in SINGLE_ARMS}
        tot = sum(inv.values())
        w = {a: inv[a] / tot for a in SINGLE_ARMS}
        weights.append({a: round(w[a], 4) for a in SINGLE_ARMS})
        for p in grade:
            blended[p] = sum(w[a] * arms[a][p] for a in SINGLE_ARMS)
    return {"status": "fitted", "blended": blended, "weights": weights}


# ── the graded population + the verdict ──────────────────────────────────────
def build_shared(arms: dict, actual: dict, positions: dict) -> dict:
    """The SHARED population, per the prereg: the only denominator on which
    'source X beats source Y' is one quantity. Every exclusion is counted and
    NOTHING is scored as zero for being absent."""
    union = set().union(*(set(v) for v in arms.values())) if arms else set()
    cells: dict[str, list] = {p: [] for p in POSITIONS}
    excl = {"excluded_no_position": 0, "excluded_no_weekly_row": 0,
            "excluded_not_in_all_arms": 0}
    for pid in sorted(union):
        if positions.get(pid) not in POSITIONS:
            excl["excluded_no_position"] += 1
            continue
        if actual.get(pid) is None:
            excl["excluded_no_weekly_row"] += 1
            continue
        if not all(pid in arms[a] for a in arms):
            excl["excluded_not_in_all_arms"] += 1
            continue
        cells[positions[pid]].append(pid)
    return {"pids_by_pos": cells, "exclusions": excl,
            "shared_total": sum(len(v) for v in cells.values())}


def winner_at(cells: dict, pos: str) -> dict:
    """Highest shared-population Spearman wins. Ties inside TIE_RHO are TIED and
    are NOT broken by a metric chosen after the fact."""
    ranked = [(name, c[pos]["spearman"]) for name, c in cells.items()
              if c.get(pos, {}).get("status") == "measured"]
    if not ranked:
        return {"winner": None, "status": "unmeasurable"}
    ranked.sort(key=lambda kv: -kv[1])
    best, rho = ranked[0]
    tied = [n for n, r in ranked if rho - r <= TIE_RHO]
    margin = round(rho - ranked[1][1], 4) if len(ranked) > 1 else None
    return {"winner": (best if len(tied) == 1 else None),
            "status": ("clear" if len(tied) == 1 else "TIED"),
            "tied": tied, "spearman": rho, "margin_over_runner_up": margin,
            "ranked": [[n, r] for n, r in ranked]}


def grade(arms: dict, actual: dict, positions: dict) -> dict:
    """Every arm, every position, on the shared population — plus the blends,
    the error correlations that decide whether a blend SHOULD help, and the
    per-position winner under the preregistered rule."""
    pop = build_shared(arms, actual, positions)
    res = {"season": SEASON, "population": pop["exclusions"] |
           {"shared_total": pop["shared_total"],
            "by_position": {p: len(v) for p, v in pop["pids_by_pos"].items()}},
           "cells": {}, "error_correlation": {}, "weights": {}, "winners": {}}

    all_arms: dict[str, dict] = {a: dict(arms[a]) for a in arms}
    for pos, pids in pop["pids_by_pos"].items():
        if not pids:
            continue
        if len(arms) == len(SINGLE_ARMS):
            eq = blend_equal(arms, pids)
            all_arms.setdefault("blend_equal", {}).update(eq)
            cf = cross_fit_weights(arms, actual, pids)
            res["weights"][pos] = {"status": cf["status"], "folds": cf["weights"]}
            if cf["blended"]:
                all_arms.setdefault("blend_weighted", {}).update(cf["blended"])

    for name, proj in all_arms.items():
        res["cells"][name] = {
            pos: cell(proj, actual, [p for p in pids if p in proj])
            for pos, pids in pop["pids_by_pos"].items()}

    for pos, pids in pop["pids_by_pos"].items():
        pairs = {}
        names = [a for a in all_arms if a in SINGLE_ARMS]
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                pairs[f"{a}|{b}"] = error_correlation(all_arms[a], all_arms[b],
                                                      actual, pids)
        res["error_correlation"][pos] = pairs
        res["winners"][pos] = winner_at(res["cells"], pos)

    # THE MECHANISM VERDICT — a blend only wins if it beats the BETTER parent,
    # never the average of the parents and never the worse one.
    mech = {}
    for pos in POSITIONS:
        c = res["cells"]
        parents = [c[a][pos]["spearman"] for a in SINGLE_ARMS
                   if c.get(a, {}).get(pos, {}).get("status") == "measured"]
        row = {"better_parent": (max(parents) if parents else None)}
        for b in BLEND_ARMS:
            cb = c.get(b, {}).get(pos, {})
            row[b] = (None if cb.get("status") != "measured"
                      else {"spearman": cb["spearman"],
                            "beats_better_parent": bool(
                                parents and cb["spearman"] > max(parents)),
                            "delta": (round(cb["spearman"] - max(parents), 4)
                                      if parents else None)})
        mech[pos] = row
    res["blend_vs_better_parent"] = mech
    return res


# ── egress (CI only) ─────────────────────────────────────────────────────────
def _positions_2025() -> dict:   # pragma: no cover
    import sleeper_hist_proj as SHP
    per = {y: SHP._positions_from_components(y) for y in SHP.COMPONENT_SEASONS}
    return SHP._positions_for(SEASON, per)


def _sleeper_arm(scoring: dict) -> tuple[dict, dict]:   # pragma: no cover
    import sleeper_hist_proj as SHP
    import sleeper_import as SL
    payload = SL.fetch_projections(str(SEASON)) or {}
    scored, counts = SHP.score_payload(payload, scoring)
    return scored, counts


def _fp_arm(scoring: dict) -> tuple[dict, dict]:   # pragma: no cover
    """FantasyPros 2025, re-fetched and CROSSWALKED TO SLEEPER PIDS — the rows
    `proj_mean_blend` §9.2 asked a future egress run to retain."""
    import adp as ADP
    import fantasypros_adp as FP
    import sleeper_import as SL
    from scoring import score_stat_line

    text, url, diag = FP.fetch_projections(SEASON)
    if not text:
        return {}, {"status": "no_fetch", "url": url, "diag": diag}
    rows = FP.parse_projections(text)
    index = ADP.build_index(SL.fetch_players())
    out, matched, unmatched, no_stats = {}, 0, 0, 0
    for r in rows:
        stats = r.get("stats") or {}
        if not stats:
            no_stats += 1
            continue
        sid, _how = ADP.match_player(r, index)
        if not sid:
            unmatched += 1
            continue
        matched += 1
        v = score_stat_line(stats, scoring)
        pid = str(sid)
        # Duplicate rows (a player listed at two positions) keep the larger
        # value — the same conservative rule exp_fp_hist_proj uses.
        if pid not in out or v > out[pid]:
            out[pid] = float(v)
    return out, {"status": "fetched", "rows": len(rows), "matched": matched,
                 "unmatched_excluded": unmatched, "rows_without_stats": no_stats,
                 "url": (diag or {}).get("api_ok") or url}


def _own6_arm() -> tuple[dict, dict]:   # pragma: no cover
    """own_v6's 2025 per-player predictions, rebuilt offline from its committed
    helpers. `own_model_v*` is read-only to this task and its `run()` exposes no
    per-player predictions, so `proj_mean_blend._probe_models` — which carries
    its own reproduction check against `model_accuracy_v6.json` — is imported
    and used unchanged."""
    import proj_mean_blend as PMB
    models, positions, actual = PMB._probe_models()
    return models["own_v6"], {"status": "rebuilt", "n": len(models["own_v6"]),
                              "positions_from_probe": len(positions),
                              "actual_from_probe": len(actual)}


def egress_main() -> int:   # pragma: no cover
    import fetch_component_stats as FCS

    scoring = FCS.frozen_scoring_table()
    print(f"frozen scoring table: {len(scoring)} keys")

    store = json.loads((HERE / f"nflverse_weekly_points_{SEASON}.json").read_text())
    actual = season_totals(store, LAST_SCORED_WEEK)[0]
    positions = _positions_2025()
    print(f"realized 2025: {len(actual)} players · positions known: {len(positions)}")

    arms, diags = {}, {}
    for name, fn in (("sleeper", lambda: _sleeper_arm(scoring)),
                     ("fantasypros", lambda: _fp_arm(scoring)),
                     ("own_v6", _own6_arm)):
        try:
            vals, d = fn()
        except Exception as exc:                                 # noqa: BLE001
            vals, d = {}, {"status": "raised", "error": type(exc).__name__}
        diags[name] = d
        print(f"  arm {name}: {len(vals)} players — {d}")
        if vals:
            arms[name] = vals

    missing = [a for a in SINGLE_ARMS if a not in arms]
    if missing:
        # A MISSING ARM IS REPORTED ABSENT AND IS NOT SUBSTITUTED. Filling it
        # from exp_fp_hist_proj's committed per-position aggregates would be a
        # different quantity wearing this one's name — the prereg forbids it.
        print(f"  ! ARMS ABSENT: {missing} — graded without them, not substituted")

    res = grade(arms, actual, positions)
    res["arms_present"] = sorted(arms)
    res["arms_absent"] = missing
    res["fetch_diagnostics"] = diags

    print(f"\npopulation: {res['population']}")
    for name in sorted(res["cells"]):
        print(f"\n{name}:")
        for pos in POSITIONS:
            print(f"    {pos}: {res['cells'][name].get(pos)}")
    print("\nerror correlation between single sources (the mechanism quantity):")
    for pos, pairs in res["error_correlation"].items():
        print(f"    {pos}: {pairs}")
    print("\ncross-fit position weights (out of sample, player holdout):")
    for pos, w in res["weights"].items():
        print(f"    {pos}: {w}")
    print("\nWINNER per position (highest shared-population Spearman, "
          f"ties inside {TIE_RHO}):")
    for pos, w in res["winners"].items():
        print(f"    {pos}: {w}")
    print("\nblend vs the BETTER parent:")
    for pos, m in res["blend_vs_better_parent"].items():
        print(f"    {pos}: {m}")

    out = {
        "_territory": "TERRITORY: A — produced by draft/backtest/sleeper_vs_fp_grade.py",
        "_prereg": "draft/backtest/SLEEPER-VS-FP-PREREG.md (committed before any number)",
        "_licensed_by": ("draft/audit/sleeper_vs_fp_grade_2026-08-16.md — Sleeper's "
                         "2025 projection passed every preregistered leak gate; "
                         "2023 and 2024 did not and are NOT graded here"),
        "_limitation": ("ONE SEASON. Sleeper's 2023/2024 are refused upstream by the "
                        "leak gates (1/3 seasons clean: [2025]) — that is the binding "
                        "limit. [Corrected 2026-08-18: this used to blame missing "
                        "2021/2022 weekly-points stores; they were built 08-17 "
                        "(199103e4), so own_v6 covers 2023-25 and a Sleeper-free "
                        "study is no longer season-capped.] N=1 season is the "
                        "ceiling of this evidence. Sleeper's 2025 file is also 7.1% "
                        "hollow, so the shared population is easier than the true "
                        "one by an unbounded amount — identically for every arm."),
        "result": res,
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(f"\nwrote {OUT.name}")
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
