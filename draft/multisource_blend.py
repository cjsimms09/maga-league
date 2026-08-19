# TERRITORY: A
"""APPLY THE MULTI-SOURCE MEAN TO THE BOARD — Cory's ruling, 2026-08-19.

*"switch to mean projections, fix ceiling and floors"* … *"Ship it"*.

WHAT IT DOES. Where a player has Sleeper PLUS AT LEAST TWO of CBS / ESPN /
FFToday, `proj_mean` becomes the mean of those opinions and `proj_ceiling` /
`proj_floor` / `proj_sd` come from the ACTUAL DISAGREEMENT between them instead
of a per-(position, band) constant times the projection. Everyone else is left
exactly as built — absent stays absent, and a one-source player keeps his one
number rather than being dropped or handed a fabricated peer.

WHY THE DISPERSION IS THE BIGGER HALF. Measured on the 08-19 board: 100% of the
32 defences shared ONE `proj_sd/proj_mean` ratio (0.380) and 73% of kickers
shared one, because `fetch_component_stats.py` excludes K and DST at the source
(register 2e, reopened 08-19) and always will. Cross-source spread gives 31
distinct values for 31 defences. This is information our own pipeline
structurally cannot produce.

── THE PRIOR ATTEMPT REFUSED, AND THIS ONE ANSWERS THE TEST THAT STOPPED IT ──
`draft/audit/proj_mean_blend_2026-08-16.md`: an earlier blend was ordered by
Cory, RAN, and refused — no control arm existed, and every coverage policy
failed a preregistered ROOKIE-BLOC VETO. That veto is the reason this module
carries `_veto_check`: a coverage gap only tilts a board if the blend MOVES the
blocs differently.

Measured 2026-08-19 before shipping: coverage rookies 69.9% vs veterans 77.9%;
median shift +0.97% vs +5.46%; difference of medians −4.49pp at **p = 0.135**
over 4,000 permutations. **NO DETECTABLE BLOC BIAS — and "not detectable" is
the honest phrase, because n = 36 rookies makes that a weak null rather than a
strong clearance.** The check is re-run on every build so a future capture that
shifts coverage cannot slip past it.

WHAT IT STILL CANNOT SAY: whether the mean is more ACCURATE than Sleeper. That
needs per-player projection history the repo does not hold —
`proj_mean_blend.py`'s constructibility gate returns `no_control`, and P113
grades it in January. Shipping is Cory's ruling on a validated capture, not a
graded accuracy claim, and this docstring says so rather than implying more.
"""
from __future__ import annotations

import json
import random
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
STORE = HERE / "data" / "multisource_projections.json"

MIN_OPINIONS = 3            # Sleeper + at least two others
Z = 1.28                    # ~p90 / p10 of a normal — the same band the
                            # measured-quantile dispersion targets
VETO_P = 0.05
MIN_COVERAGE = 0.30         # a capture this thin is a broken fetch, not a board


def _permutation_p(a: list[float], b: list[float], seed: int = 20260819,
                   n: int = 4000) -> float:
    """p for |median(a) − median(b)| under label shuffling. A fixed seed, so a
    build cannot produce a different verdict from the same inputs."""
    if len(a) < 8 or len(b) < 8:
        return 1.0
    rng = random.Random(seed)
    obs = abs(st.median(a) - st.median(b))
    pool = a + b
    k = len(a)
    hits = 0
    for _ in range(n):
        rng.shuffle(pool)
        if abs(st.median(pool[:k]) - st.median(pool[k:])) >= obs:
            hits += 1
    return hits / n


def apply_multisource(players: list[dict], *, store_path: Path | None = None) -> dict:
    """Mutates `players` in place. Returns a diagnostic dict for provenance.

    REFUSES rather than half-applying: a missing store, or coverage collapsing
    below MIN_COVERAGE, or a rookie-bloc veto, leaves the board exactly as it
    was and says why. A blend that silently applies to a third of the board is
    worse than no blend, because nothing downstream can tell the two apart.
    """
    path = store_path or STORE
    diag = {"applied": False, "reason": None, "players_changed": 0,
            "coverage": 0.0, "veto": None}
    if not path.exists():
        diag["reason"] = f"no {path.name} — multi-source store absent"
        return diag
    store = json.loads(path.read_text())
    src = store.get("players") or {}

    eligible = [p for p in players if p.get("proj_mean")]
    if not eligible:
        diag["reason"] = "no priced players on the board"
        return diag

    # ---- gather the candidate changes WITHOUT applying them ----------------
    pending, rookie_shift, vet_shift = [], [], []
    for p in eligible:
        m = src.get(str(p.get("player_id")))
        if not m:
            continue
        vals = list((m.get("by_source") or {}).values()) + [p["proj_mean"]]
        vals = [v for v in vals if isinstance(v, (int, float)) and v > 0]
        if len(vals) < MIN_OPINIONS:
            continue
        mean = st.mean(vals)
        sd = st.pstdev(vals)
        pending.append((p, mean, sd))
        if p["proj_mean"] > 20:
            rel = (mean - p["proj_mean"]) / p["proj_mean"]
            (rookie_shift if p.get("years_exp") == 0 else vet_shift).append(rel)

    diag["coverage"] = round(len(pending) / len(eligible), 4)
    if diag["coverage"] < MIN_COVERAGE:
        diag["reason"] = (f"coverage {diag['coverage']:.1%} below the "
                          f"{MIN_COVERAGE:.0%} floor — that is a broken fetch, "
                          "not a board")
        return diag

    # ---- THE ROOKIE-BLOC VETO, re-run every build -------------------------
    p_val = _permutation_p(rookie_shift, vet_shift)
    diag["veto"] = {
        "rookies_n": len(rookie_shift), "veterans_n": len(vet_shift),
        "rookie_median_shift": round(st.median(rookie_shift), 4) if rookie_shift else None,
        "veteran_median_shift": round(st.median(vet_shift), 4) if vet_shift else None,
        "permutation_p": round(p_val, 4),
        "note": "A coverage gap only tilts a board if the blend MOVES the blocs "
                "differently. This is the test that refused the 2026-08-16 "
                "attempt. A small rookie n makes a pass a WEAK null, not a "
                "strong clearance.",
    }
    if p_val < VETO_P:
        diag["reason"] = (f"ROOKIE-BLOC VETO: rookie and veteran shifts differ "
                          f"at p={p_val:.3f} — the 2026-08-16 refusal's own test")
        return diag

    # ---- apply --------------------------------------------------------------
    for p, mean, sd in pending:
        p["proj_mean_sleeper_only"] = p["proj_mean"]
        p["proj_mean"] = round(mean, 2)
        p["proj_mean_source"] = "multisource-mean-2026"
        if sd > 0:
            p["proj_sd"] = round(sd, 2)
            p["proj_sd_source"] = "cross-source-disagreement"
            p["proj_ceiling"] = round(mean + Z * sd, 2)
            p["proj_floor"] = round(max(0.0, mean - Z * sd), 2)
            p["proj_ceiling_source"] = "cross-source-p90"
            p["proj_floor_source"] = "cross-source-p10"
    diag.update(applied=True, players_changed=len(pending),
                sources=store.get("sources_used"),
                excluded=list((store.get("sources_excluded") or {})))
    return diag
