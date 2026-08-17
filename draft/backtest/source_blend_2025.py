# TERRITORY: A — implements draft/backtest/SOURCE-BLEND-2025-PREREG.md
"""SOURCE-BLEND-2025 — Sleeper vs FantasyPros vs blend, on one matched population.

Cory, 2026-08-17: *"GETTING ANNOYED WITH FANTASY PRO, SLEEPER, VS BLEND ISSUE,
THIS IS INCREDIBLY IMPORTANT AND DEFINITELY EFFECTS DRAFT RECOMMENDATIONS, NEEDS
DONE NOW AND NEEDS DONE RIGHT."*

He has asked this since 08-16 and it has never been run. It is runnable now
because the blocker was false: three committed files said Sleeper's history was
unmeasurable and none had asked the API. `sleeper_hist_proj.json` shows **2025
passed every leak gate.**

EVERY CONSTANT AND EVERY DECISION RULE BELOW IS THE PREREG'S, committed before
this file existed. Changing one here without changing it there breaks the
preregistration and voids the run.

THE ONE THING THAT MATTERS MOST: **one matched population across every arm.** The
figures already on disk (Sleeper 486 graded, FP 464) come from DIFFERENT player
sets, which is exactly why a head-to-head off them is inadmissible. A player is
graded only if he has a Sleeper projection, an FP projection, and a realized
total. Everyone else is dropped from ALL arms equally, and the count is reported.

NAIVE (previous-season points) is the KNOWN-POSITIVE CONTROL. If it beats both
professional sources, the harness is broken rather than the sources, and the run
is VOID. A run that cannot fail is not evidence.

Run:  python3 draft/backtest/source_blend_2025.py
Needs egress to api.sleeper.app and api.fantasypros.com — both are proxy-blocked
from the dev sandbox (403 CONNECT, measured 2026-08-17) and reachable from GitHub
Actions, so this runs as a workflow dispatched FROM `main`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import spearman        # noqa: E402  reused, unit-tested
from scoring import score_stat_line         # noqa: E402
from adp import normalize_name              # noqa: E402

# ── preregistered constants (SOURCE-BLEND-2025-PREREG.md) ───────────────────
YEAR = 2025
POSITIONS = ("QB", "RB", "WR", "TE")
BLEND_GRID = (0.25, 0.50, 0.75)      # w on SLEEPER; 0.50 is Cory's named mix
PRIMARY = "spearman"                  # named BEFORE the run, per the prereg
MIN_CELL_N = 25                       # below this a position cell is INSUFFICIENT-N
OUT = HERE / "source_blend_2025.json"


def season_totals(store: dict) -> dict:
    """Realized season points per sleeper pid. Same semantics as
    exp_fp_hist_proj.season_totals — a shared derivation, not a second one."""
    # SHAPE, CHECKED RATHER THAN ASSUMED: `weeks` is a LIST of
    # {season, week, points:{pid: pts}} — not a dict keyed by week. The first
    # version of this function read it as a dict and would have summed NOTHING,
    # producing an empty realized set and a VOID run that looked like an egress
    # problem. Found by measuring the store instead of trusting the memory of it.
    out: dict[str, float] = {}
    weeks = store.get("weeks") or []
    if isinstance(weeks, dict):          # tolerate the other shape if it appears
        weeks = list(weeks.values())
    for wk in weeks:
        pts = (wk or {}).get("points") or {}
        for pid, v in pts.items():
            out[str(pid)] = out.get(str(pid), 0.0) + float(v or 0.0)
    return out


def blend(a: float, b: float, w: float) -> float:
    return w * a + (1.0 - w) * b


def arm_metrics(pairs_by_pos: dict) -> dict:
    """Spearman + MAE per position, on whatever population is handed in."""
    out = {}
    for pos, pairs in pairs_by_pos.items():
        n = len(pairs)
        if n < MIN_CELL_N:
            out[pos] = {"n": n, "status": "INSUFFICIENT-N"}
            continue
        rho = spearman([p for p, _ in pairs], [r for _, r in pairs])
        mae = sum(abs(p - r) for p, r in pairs) / n
        bias = sum(p - r for p, r in pairs) / n
        out[pos] = {"n": n, "status": "measured", "spearman": round(rho, 4),
                    "mae": round(mae, 2), "bias": round(bias, 2)}
    return out


def decide(arms: dict) -> dict:
    """The prereg's decision rule, applied mechanically.

    The blend wins ONLY if it beats BOTH single sources on the PRIMARY metric in
    at least 3 of 4 positions. Anything less is 'no separation' and the board
    keeps its current source. Stated before the numbers so it cannot be chosen
    after them.
    """
    def cells(name):
        return {p: c for p, c in arms[name].items() if c.get("status") == "measured"}

    sl, fp = cells("SLEEPER"), cells("FP")
    best_w, best_wins, best_mean, per_w = None, -1, -2.0, {}
    for w in BLEND_GRID:
        bl = cells(f"BLEND-{w:.2f}")
        shared = [p for p in bl if p in sl and p in fp]
        wins = sum(1 for p in shared
                   if bl[p][PRIMARY] > sl[p][PRIMARY] and bl[p][PRIMARY] > fp[p][PRIMARY])
        # TIES BREAK ON THE METRIC, NOT ON GRID ORDER. Found by
        # test_an_edge_of_grid_win_is_flagged_not_shipped: with a win-count-only
        # rule, two weights that both beat the sources everywhere were separated
        # by nothing but their position in BLEND_GRID — so the "best" weight was
        # decided by the order somebody typed the grid, and the edge-of-grid
        # guard then read the wrong cell. The mean of the primary metric is the
        # quantity the prereg names, so it is what breaks the tie.
        mean = (sum(bl[p][PRIMARY] for p in shared) / len(shared)) if shared else -2.0
        per_w[f"{w:.2f}"] = {"positions_beating_both": wins, "of": len(shared),
                             f"mean_{PRIMARY}": round(mean, 4)}
        if (wins, mean) > (best_wins, best_mean):
            best_wins, best_mean, best_w = wins, mean, w

    # Edge-of-grid guard — the defect found twice on 08-17 (exp_ceiling_replicate,
    # exp_weekly_env). A best cell at the boundary did not bracket the optimum.
    edge = len(BLEND_GRID) > 1 and best_w in (min(BLEND_GRID), max(BLEND_GRID))

    if best_wins >= 3:
        verdict = (f"BLEND WINS at w={best_w:.2f} on Sleeper — beats BOTH single sources "
                   f"on {PRIMARY} in {best_wins} of 4 positions.")
        if edge:
            verdict += (" ⚠️ BEST CELL IS AT THE EDGE OF THE GRID — the optimum is not "
                        "bracketed and the weight is NOT established. Widen before shipping.")
    else:
        verdict = (f"NO SEPARATION — the best blend (w={best_w:.2f}) beats both sources in only "
                   f"{best_wins} of 4 positions; the prereg requires 3. The board keeps its "
                   f"current source.")

    return {"per_weight": per_w, "best_w": best_w, "positions_beating_both": best_wins,
            "edge_of_grid": edge, "verdict": verdict,
            "shipping_cap": ("One season, n≈450. Per the prereg the most this licenses is "
                             "'adopt for 2026 and re-test when 2023/2024 become gradeable'. "
                             "NOTHING from this run ships during draft week.")}


def main() -> int:
    import fantasypros_adp as FP
    import adp as ADP
    import sleeper_import as SL
    import raw_capture as RAW

    store_path = HERE / f"nflverse_weekly_points_{YEAR}.json"
    if not store_path.exists():
        return void(f"no realized store at {store_path.name}")
    realized = season_totals(json.loads(store_path.read_text()))
    prior_path = HERE / f"nflverse_weekly_points_{YEAR - 1}.json"
    prior = season_totals(json.loads(prior_path.read_text())) if prior_path.exists() else {}
    if not prior:
        return void(f"no {YEAR - 1} store — NAIVE is the known-positive control and "
                    "cannot be built, so the run could not fail")

    # SAME LOADER exp_fp_hist_proj USES, not a second path that merely resembles
    # it. My first version read draft/config.json, which does not exist — the run
    # would have VOIDed on a wrong path and read as an egress failure. Checked
    # against the repo rather than assumed, after the store-shape bug did exactly
    # this an hour earlier.
    scoring_path = HERE.parent / "config" / "league_config.json"
    if not scoring_path.exists():
        return void(f"house scoring table not found at {scoring_path}")
    scoring = json.loads(scoring_path.read_text()).get("scoring") or {}
    if not scoring:
        return void("house scoring table is empty — every arm would be scored wrong")

    players = SL.fetch_players()
    if not players:
        return void("Sleeper player index unreachable — a fact about the runner")
    index = ADP.build_index(players)
    position_of = {str(pid): (p or {}).get("position") for pid, p in players.items()}

    # ── SLEEPER ─────────────────────────────────────────────────────────────
    sl_raw = SL.fetch_projections(str(YEAR))
    if not sl_raw:
        return void("Sleeper projections egress failed — a fact about the runner, "
                    "not about the source")
    sleeper = {}
    for row in (sl_raw if isinstance(sl_raw, list) else sl_raw.get("players", [])):
        pid, stats = str(row.get("player_id") or ""), row.get("stats") or {}
        if pid and stats:
            v = score_stat_line(stats, scoring)
            if v:
                sleeper[pid] = float(v)

    # ── FANTASYPROS, crosswalked through the SAME index exp_fp_hist_proj uses ─
    text, url, diag = FP.fetch_projections(YEAR)
    if not text:
        return void("FantasyPros egress failed — a fact about the runner, not the source")
    RAW.retain("fantasypros_projections", YEAR, text, url, diag)   # re-parse, never re-fetch
    fp, unmatched = {}, 0
    for row in FP.parse_projections(text):
        sid, _how = ADP.match_player(row, index)
        if not sid:
            unmatched += 1
            continue
        v = score_stat_line(row.get("stats") or {}, scoring)
        if v:
            fp[str(sid)] = float(v)

    # ── THE MATCHED POPULATION — the control that makes this admissible ──────
    matched = [pid for pid in sleeper if pid in fp and pid in realized and pid in prior]
    drops = {"sleeper_only": len([p for p in sleeper if p not in fp]),
             "fp_only": len([p for p in fp if p not in sleeper]),
             "no_realized": len([p for p in sleeper if p in fp and p not in realized]),
             "no_prior_for_naive": len([p for p in sleeper if p in fp and p in realized
                                        and p not in prior]),
             "fp_unmatched_to_pid": unmatched}

    def by_pos(value_of):
        out = {p: [] for p in POSITIONS}
        for pid in matched:
            pos = position_of.get(pid)
            if pos in out:
                out[pos].append((value_of(pid), realized[pid]))
        return out

    arms = {"SLEEPER": arm_metrics(by_pos(lambda p: sleeper[p])),
            "FP": arm_metrics(by_pos(lambda p: fp[p])),
            "NAIVE": arm_metrics(by_pos(lambda p: prior[p]))}
    for w in BLEND_GRID:
        arms[f"BLEND-{w:.2f}"] = arm_metrics(by_pos(lambda p, w=w: blend(sleeper[p], fp[p], w)))

    # ── THE KNOWN-POSITIVE CONTROL, checked BEFORE the verdict is written ────
    def mean_primary(name):
        c = [v[PRIMARY] for v in arms[name].values() if v.get("status") == "measured"]
        return sum(c) / len(c) if c else -2.0
    naive, sl_m, fp_m = mean_primary("NAIVE"), mean_primary("SLEEPER"), mean_primary("FP")
    if naive >= sl_m and naive >= fp_m:
        return void(f"NAIVE (prev-season points, mean {PRIMARY} {naive:.4f}) beat BOTH "
                    f"professional sources (Sleeper {sl_m:.4f}, FP {fp_m:.4f}). That is a "
                    "broken harness, not a finding about the sources.",
                    {"matched_population": len(matched), "drops": drops,
                     "sleeper_scored": len(sleeper), "fp_scored_and_matched": len(fp),
                     "realized": len(realized), "prior": len(prior),
                     "positions_known": sum(1 for v in position_of.values() if v),
                     "cells": {k: {p: c.get("status") or c.get("n")
                                   for p, c in v.items()} for k, v in arms.items()}})

    verdict = decide(arms)
    OUT.write_text(json.dumps({
        "experiment": "SOURCE-BLEND-2025", "status": "graded", "year": YEAR,
        "_prereg": "draft/backtest/SOURCE-BLEND-2025-PREREG.md",
        "_territory": "TERRITORY: A — produced by draft/backtest/source_blend_2025.py",
        "matched_population": len(matched), "drops": drops,
        "control_naive_lost": {"naive": round(naive, 4), "sleeper": round(sl_m, 4),
                               "fp": round(fp_m, 4), "passed": True},
        "arms": arms, "decision": verdict, "fp_url": url,
    }, indent=1) + "\n")
    print(f"matched population: {len(matched)}   drops: {drops}")
    for name in ("SLEEPER", "FP", "NAIVE", *[f"BLEND-{w:.2f}" for w in BLEND_GRID]):
        print(f"  {name:<12} " + "  ".join(
            f"{p}:{c.get('spearman', c.get('status'))}" for p, c in arms[name].items()))
    print("\n" + verdict["verdict"])
    print(verdict["shipping_cap"])
    return 0


def void(reason: str, diag: dict | None = None) -> int:
    """A run that could not be completed is VOID, never a negative result.

    The prereg names egress failure and a lost known-positive control as VOID
    precisely so a broken run is never read as "the blend does not help". This
    is the same discipline sleeper_hist_proj uses: the first failing gate IS the
    verdict, and it carries no accuracy number with it.
    """
    OUT.write_text(json.dumps({
        "experiment": "SOURCE-BLEND-2025", "status": "VOID", "reason": reason,
        "_prereg": "draft/backtest/SOURCE-BLEND-2025-PREREG.md",
        "_territory": "TERRITORY: A — produced by draft/backtest/source_blend_2025.py",
        "_note": ("VOID is not a negative result. Nothing here licenses any claim "
                  "about Sleeper, FantasyPros or a blend."),
        # THE DIAGNOSTICS SURVIVE THE REFUSAL. The 08-17 run voided correctly and
        # told us nothing about WHERE the join failed, so the refusal cost a whole
        # dispatch. A refusal that discards its own evidence makes you pay twice.
        "diagnostics": diag or {},
    }, indent=1) + "\n")
    print(f"VOID — {reason}")
    if diag:
        for k, v in diag.items():
            print(f"   {k}: {v}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
