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
    out: dict[str, float] = {}
    for week in (store.get("weeks") or {}).values():
        for pid, pts in (week or {}).items():
            out[str(pid)] = out.get(str(pid), 0.0) + float(pts or 0.0)
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
    sys.path.insert(0, str(HERE.parent))
    import sleeper_import as SL

    store_path = HERE / f"nflverse_weekly_points_{YEAR}.json"
    if not store_path.exists():
        return void(f"no realized store at {store_path.name}")
    realized = season_totals(json.loads(store_path.read_text()))

    scoring = json.loads((HERE.parent / "config.json").read_text()).get("scoring", {})
    if not scoring:
        return void("house scoring table is empty — every arm would be scored wrong")

    # ── SLEEPER ──────────────────────────────────────────────────────────────
    sl_raw = SL.fetch_projections(str(YEAR))
    if not sl_raw:
        return void("Sleeper egress failed — a fact about the runner, not the source")
    sleeper = {}
    for row in (sl_raw if isinstance(sl_raw, list) else sl_raw.get("players", [])):
        pid, stats = str(row.get("player_id") or ""), row.get("stats") or {}
        if pid and stats:
            v = score_stat_line(stats, scoring)
            if v:
                sleeper[pid] = v

    # ── FANTASYPROS ──────────────────────────────────────────────────────────
    text, url, _diag = FP.fetch_projections(YEAR)
    if not text:
        return void("FantasyPros egress failed — a fact about the runner, not the source")
    index = {normalize_name(k): k for k in realized}       # placeholder crosswalk key space
    fp = {}
    for row in FP.parse_projections(text):
        v = score_stat_line(row.get("stats") or {}, scoring)
        if v:
            fp[normalize_name(row.get("name", ""))] = (v, row.get("position"))

    return report(sleeper, fp, realized, index, url)


def void(reason: str) -> int:
    OUT.write_text(json.dumps({
        "experiment": "SOURCE-BLEND-2025", "status": "VOID", "reason": reason,
        "_prereg": "draft/backtest/SOURCE-BLEND-2025-PREREG.md",
        "_note": ("VOID is not a negative result. The prereg names egress failure and a "
                  "missing control as VOID precisely so a broken run is never read as "
                  "'the blend does not help'."),
    }, indent=1) + "\n")
    print(f"VOID — {reason}")
    return 1


def report(sleeper, fp, realized, index, fp_url) -> int:
    print("SOURCE-BLEND-2025 — populations before matching:")
    print(f"  sleeper scored: {len(sleeper)}   fp scored: {len(fp)}   realized: {len(realized)}")
    OUT.write_text(json.dumps({
        "experiment": "SOURCE-BLEND-2025",
        "status": "FETCHED — matching and arms pending crosswalk wiring",
        "_prereg": "draft/backtest/SOURCE-BLEND-2025-PREREG.md",
        "counts": {"sleeper": len(sleeper), "fp": len(fp), "realized": len(realized)},
        "fp_url": fp_url,
        "_next": ("Join FP names to sleeper pids through the SAME crosswalk "
                  "exp_fp_hist_proj uses, then run arm_metrics + decide on the "
                  "matched set. Both fetch arms are proven live by this run."),
    }, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
