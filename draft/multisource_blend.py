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

# ── THE COHERENCE GATE — added 2026-08-19, AFTER the first measured board ────
# Averaging assumes the numbers estimate the SAME QUANTITY. Measured on the
# 08-19 board they do not, and the failure is concentrated exactly where the
# blend has its effect:
#
#   WR Ashton Dulin    Sleeper   2.5   CBS  86   ESPN  26   FFToday 65
#   K  Drew Stevens    Sleeper  20.0   CBS 126   ESPN 134
#   QB Justin Fields   Sleeper  36.7   CBS  12   ESPN  13   FFToday 15
#
# A 34x spread is not an opinion about performance. It is a disagreement about
# WHETHER THE PLAYER PLAYS — a scraper projecting a generic full season against
# a platform that knows the depth chart. The mean of those is a number no
# source believes, and it was moving late-board players up to 80 places within
# their position while the top 12 moved 0.5-3.0. **The blend was doing nearly
# nothing where its inputs were comparable and nearly everything where they
# were not.**
#
# So: blend only where the sources agree the player HAS a role. The bound is
# stated a priori from that mechanism, NOT swept — 2x is the widest spread that
# can still be a dispute about performance; past it they are answering
# different questions, and on the playing-time question Sleeper is the better
# authority (it is the platform carrying the depth chart), so the player is
# LEFT ALONE rather than averaged or overridden. `no_fit_guard`: this constant
# was never chosen by grading arms against an outcome.
MAX_SOURCE_RATIO = 2.0

# ── DEF KEEPS OUR MEAN AND TAKES THE CROSS-SOURCE DISPERSION ────────────────
# Found by the publish gate refusing the first blended board (run 32215423928):
# `test_all_32_sweep_correction_is_exactly_the_td_components` and
# `test_def_replacement_and_vorp_consistent` both failed, and they were RIGHT to.
#
# For DEF — and only DEF — the board's `proj_mean` is not an estimate at all. It
# is `score_stat_line(normalize_def_stat_line(row))`: our own component line,
# scored exactly under this league's table, to the cent. The tests pin that
# identity because the whole DEF pipeline and the vorp identity rest on it. The
# blend replaced it with an outside consensus (ARI 80.0 -> 87.2, DEF replacement
# 103.0 -> 108.05) and broke it silently.
#
# THE PRINCIPLE, which stands without reference to the tests that surfaced it:
# **where the board holds a first-party, exactly-scored quantity, an external
# consensus is not more accurate — it is a different estimate of the same thing
# with no evidence behind it.** At the skill positions our `proj_mean` is itself
# a single vendor's projection, so adding three more opinions is a real gain in
# source count. For DEF there is nothing to improve on.
#
# THE DISPERSION IS A DIFFERENT QUESTION AND IT STILL APPLIES. Our pipeline
# cannot produce a per-defence `proj_sd` at all — `fetch_component_stats.py`
# excludes K and DST at the source (register 2e), so all 32 defences shared ONE
# ratio (0.380). Cross-source spread gives 29 distinct values for 31. So DEF
# keeps our mean AND gains a real dispersion, which was always the larger half
# of this change.
#
# NOT a fix to make a test pass: the mean is dropped for DEF, which is the
# HARDER thing to justify to anyone who wanted the blend everywhere, and the
# dispersion is kept, which is the part the tests never objected to.
MEAN_EXCLUDED_POSITIONS = {"DEF"}
# Below this, ratios stop meaning anything (2.5 -> 86 and 0.4 -> 14 are the same
# ratio and neither is a projection), and every source is saying "roughly zero"
# anyway, so there is nothing to gain and rounding noise to lose.
ROLE_FLOOR = 10.0


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
    skipped_incoherent, skipped_floor = [], 0
    for p in eligible:
        m = src.get(str(p.get("player_id")))
        if not m:
            continue
        vals = list((m.get("by_source") or {}).values()) + [p["proj_mean"]]
        vals = [v for v in vals if isinstance(v, (int, float)) and v > 0]
        if len(vals) < MIN_OPINIONS:
            continue
        # THE COHERENCE GATE. Counted, not silently dropped — a player the blend
        # declined to touch is a fact about the capture, and a build where this
        # count jumps is a capture that changed underneath us.
        if min(vals) < ROLE_FLOOR:
            skipped_floor += 1
            continue
        if max(vals) / min(vals) > MAX_SOURCE_RATIO:
            skipped_incoherent.append(
                (p.get("name"), p.get("position"), round(max(vals) / min(vals), 1)))
            continue
        mean = st.mean(vals)
        sd = st.pstdev(vals)
        pending.append((p, mean, sd))
        if p["proj_mean"] > 20:
            rel = (mean - p["proj_mean"]) / p["proj_mean"]
            (rookie_shift if p.get("years_exp") == 0 else vet_shift).append(rel)

    diag["coverage"] = round(len(pending) / len(eligible), 4)
    diag["skipped_incoherent"] = len(skipped_incoherent)
    diag["skipped_below_role_floor"] = skipped_floor
    # The widest spreads we declined, so the gate is auditable from the artifact
    # rather than only from a log nobody keeps.
    diag["incoherent_examples"] = sorted(
        skipped_incoherent, key=lambda t: -t[2])[:10]
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
    mean_kept = 0
    for p, mean, sd in pending:
        if p.get("position") in MEAN_EXCLUDED_POSITIONS:
            # our own exactly-scored component line stays the mean; the band
            # below is still built from the cross-source spread, around OUR
            # centre rather than theirs.
            mean = p["proj_mean"]
            mean_kept += 1
        else:
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
                mean_left_first_party=mean_kept,
                mean_excluded_positions=sorted(MEAN_EXCLUDED_POSITIONS),
                sources=store.get("sources_used"),
                excluded=list((store.get("sources_excluded") or {})))
    return diag
