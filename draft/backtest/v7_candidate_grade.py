# TERRITORY: A
"""V7 candidates C1 (fitted age curves) and C3 (fitted recency weights),
graded one-at-a-time on top of own_v6 — V7-CANDIDATE-PREREG §2/§3 executed.

THE INFORMATION SET IS THE POINT, so it is stated before any result:

  * BASE reproduces own_model_v6.run()'s v6_2025 map through the same module
    functions — no re-derivation that could quietly disagree.
  * C1's age curves are REFIT HERE on transitions ENDING <= 2024 only
    (2021->22, 22->23, 23->24). The committed age_curve_2026.json used the
    2024->25 transition too and would leak into a 2025 grade; using it here
    would be the free-shrink class D just taught us to hunt. Same method as
    age_curve_fit.py (median y->y+1 ratio by (pos, age), MIN_GAMES=8,
    MIN_N=8, board ages shifted back, survivorship declared). The factor is
    MEAN-NORMALIZED per position before application, so the arm adds the
    curve's SHAPE, never a level shift — v6's level is already graded.
  * C3's per-position w comes from recency_weight_fit.json's per_triple
    table restricted to triples ENDING <= 2024 (the ->2025 triple is the
    graded season and is excluded). The whole v6 stack is REBUILT with the
    per-position blend, because the blend feeds v3/v4/v5 — swapping it only
    at the surface would grade a map v6 never produces.

DECISION BARS (§3's "beyond noise", fixed here before the first number):
  * a position IMPROVES on family 1 iff Spearman rises AND MAE falls;
  * it IMPROVES on family 2 iff P@12 or P@24 rises and neither falls;
  * it DEGRADES BEYOND NOISE iff Spearman falls > 0.020, or MAE rises > 2%
    of BASE's MAE, or P@12/P@24 falls by more than one player in twelve
    (> 0.084).
A candidate SHIPS iff >=1 position improves on BOTH families and no
position degrades beyond noise on EITHER. Position-specific adoption is
allowed (§3) and reported per position.

Display-safe: proj_ownmodel feeds nothing on the board (D14); this file
writes an artifact and touches nothing Cory drafts from.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from model_accuracy_backtest import season_totals, positions_record  # noqa: E402
from model_accuracy_grade import grade  # noqa: E402
from own_model_v2 import (  # noqa: E402
    POSITIONS, RECENCY_WEIGHTS, _assert_no_leak, board_ages, features_for,
    fit_transition, predict,
)
from own_model_v3 import (  # noqa: E402
    build_v3, league_draft_picks, market_ranks, rank_curve,
)
from own_model_v4 import (  # noqa: E402
    build_v4, qb_active_games, qb_availability_correction, weekly_points,
)
from own_model_v6 import build_v6  # noqa: E402
import fetch_component_stats as FCS  # noqa: E402
import own_model_v5 as V5  # noqa: E402

GRADED_SEASON = 2025
PRIOR_SEASONS = (2023, 2024)
OUT = HERE / "v7_candidate_grade.json"

# ── declared bars (see docstring) ───────────────────────────────────────────
NOISE_SPEARMAN = 0.020
NOISE_MAE_FRAC = 0.02
NOISE_P_AT_K = 0.084

MIN_GAMES = 8
MIN_N = 8
AGE_FIT_TRANSITIONS = ((2021, 2022), (2022, 2023), (2023, 2024))
# C1 features RB/WR/QB only — the committed fit found TE flat, and shipping a
# flat multiplier would be decoration wearing a feature's name.
AGE_POSITIONS = ("QB", "RB", "WR")


def _weekly_totals_games(season):
    doc = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    totals, games = {}, {}
    for wk in doc["weeks"]:
        for pid, pts in (wk.get("points") or {}).items():
            totals[pid] = totals.get(pid, 0.0) + float(pts)
            if float(pts) != 0.0:
                games[pid] = games.get(pid, 0) + 1
    return totals, games


def _ages_2026():
    b = json.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
    out = {}
    for p in b["players"] + b.get("kept_players", []):
        if p.get("age") and p.get("position") in POSITIONS:
            out[str(p["player_id"])] = (float(p["age"]), p["position"])
    return out


def fit_age_curves_leakfree():
    """age_curve_fit.py's method, transitions ending <= 2024 only."""
    ages = _ages_2026()
    cells: dict[tuple, list] = {}
    for y1, y2 in AGE_FIT_TRANSITIONS:
        t1, g1 = _weekly_totals_games(y1)
        t2, g2 = _weekly_totals_games(y2)
        gap = 2026 - y2
        for pid, (age26, pos) in ages.items():
            if g1.get(pid, 0) < MIN_GAMES or g2.get(pid, 0) < MIN_GAMES:
                continue
            if t1.get(pid, 0) <= 20:
                continue
            age = round(age26 - gap)
            cells.setdefault((pos, age), []).append(t2[pid] / t1[pid])
    curves = {}
    for pos in POSITIONS:
        by_age = {age: round(median(v), 4)
                  for (p, age), v in sorted(cells.items())
                  if p == pos and len(v) >= MIN_N}
        curves[pos] = by_age
    return curves


def c1_apply(base_map, curves, positions):
    """v6 x mean-normalized age ratio at the player's GRADED-season age.
    A player whose (pos, age) cell is unmeasured keeps the position mean
    (factor 1.0 after normalization) — absence stays the cohort, never 0."""
    ages = _ages_2026()
    gap = 2026 - GRADED_SEASON
    out = {}
    # per-position mean of the applied ratios, for normalization
    means = {}
    for pos in AGE_POSITIONS:
        vals = [curves[pos][round(a - gap)] for pid, (a, p) in ages.items()
                if p == pos and round(a - gap) in curves[pos]
                and pid in base_map]
        means[pos] = (sum(vals) / len(vals)) if vals else 1.0
    applied = 0
    for pid, v in base_map.items():
        pos = positions.get(pid)
        f = 1.0
        if pos in AGE_POSITIONS and pid in ages:
            age = round(ages[pid][0] - gap)
            r = curves[pos].get(age)
            if r is not None and means[pos] > 0:
                f = r / means[pos]
                applied += 1
        out[pid] = v * f
    return out, applied, means


def c3_weights_leakfree():
    """Per-position w from recency_weight_fit.json, ->2025 triple excluded."""
    doc = json.loads((HERE / "recency_weight_fit.json").read_text())
    out = {}
    for pos, cell in doc["curves"].items():
        ws = [v["best_w"] for k, v in cell["per_triple"].items()
              if not k.endswith("->2025")]
        out[pos] = round(sum(ws) / len(ws), 3) if ws else RECENCY_WEIGHTS[0]
    return out


def build_stack(blend, positions, ages, eg_map=None):
    """The v6 pipeline from own_model_v6.run(), parametrized on the blend."""
    feat_fit = features_for(2024, (2023,), positions, ages)
    fits = fit_transition(feat_fit, season_totals(2024)[0])
    feat_g = features_for(GRADED_SEASON, PRIOR_SEASONS, positions, ages)
    v2 = predict(feat_g, fits)

    _assert_no_leak(PRIOR_SEASONS, GRADED_SEASON)
    picks = league_draft_picks(GRADED_SEASON)
    curve = rank_curve(max(PRIOR_SEASONS), positions)
    mrank = market_ranks(picks, positions)

    v3 = build_v3(v2, blend, mrank, curve, positions)
    wk_y1 = weekly_points(max(PRIOR_SEASONS))
    acts = qb_active_games(wk_y1, positions)
    corr, _mu = qb_availability_correction(acts)
    v4 = build_v4(v3, blend, corr, positions)

    vegas_imp = FCS.implied_team_totals(GRADED_SEASON, 1, 1)
    comp = V5.comp_opinion(GRADED_SEASON, PRIOR_SEASONS, positions, ages,
                           vegas_imp, eg_map=eg_map)
    v5 = V5.build_v5(v3, comp, blend, corr, mrank, curve, positions)
    assert sorted(v4) == sorted(v5)
    return build_v6(v4, v5, positions)


def build_c5(hand_blend, positions, ages):
    """C5 — efficiency (the xFP arm) restricted to WR: beta -> 0 at RB/TE.

    In this stack the "NGS/efficiency feature" is v5's xFP construction —
    volume priced at league efficiency — weighted by V5_CONFIG[pos]["beta"]
    against the player's own realized rate. position_predictor's ablation
    kept it at WR and dropped it elsewhere; our advanced_stats study was a
    null. QB's beta is already 0.00 and is untouched. The config is patched
    for the build and restored unconditionally — the frozen V5_CONFIG is
    graded history and must leave this function exactly as it entered."""
    saved = {p: V5.V5_CONFIG[p]["beta"] for p in ("RB", "TE")}
    try:
        for p in saved:
            V5.V5_CONFIG[p]["beta"] = 0.0
        return build_stack(hand_blend, positions, ages)
    finally:
        for p, b in saved.items():
            V5.V5_CONFIG[p]["beta"] = b


C7_SHRINK_K = 1.0   # one prior season's worth of position-mean belief


def c7_eg_map(positions):
    """C7 — the availability gate as a fitted PER-PLAYER prior, leak-free.

    The frozen gate regresses Y-1 games toward the position mean with one
    hand-set glam per position and never looks past one season. This arm
    replaces it with the player's OWN multi-season availability record:
    E[G] = (sum of observed games over 2023+2024 + k*mu_pos) / (n_obs + k),
    k = 1 season, mu_pos = the 2024 position mean over players with >= 1
    game. A player with no prior seasons is ABSENT from the map and falls
    back to the frozen gate inside comp_opinion — a fitted gate must never
    zero a rookie it cannot see. Both input seasons predate the graded one.
    """
    obs = {}
    for y in PRIOR_SEASONS:
        _tot, games = season_totals(y)
        for pid, g in games.items():
            if positions.get(pid) in POSITIONS and g > 0:
                obs.setdefault(pid, []).append(float(g))
    mu = {}
    y1 = max(PRIOR_SEASONS)
    _t, g1 = season_totals(y1)
    for pos in POSITIONS:
        vals = [float(g) for pid, g in g1.items()
                if positions.get(pid) == pos and g > 0]
        mu[pos] = sum(vals) / len(vals) if vals else 12.0
    out = {}
    for pid, vals in obs.items():
        pos = positions.get(pid)
        out[pid] = min(17.0, (sum(vals) + C7_SHRINK_K * mu[pos])
                       / (len(vals) + C7_SHRINK_K))
    return out


def make_blend(w_by_pos, positions):
    y1, y2 = max(PRIOR_SEASONS), min(PRIOR_SEASONS)
    tot1, tot2 = season_totals(y1)[0], season_totals(y2)[0]
    out = {}
    for pid, v in tot1.items():
        w = w_by_pos.get(positions.get(pid), RECENCY_WEIGHTS[0])
        out[pid] = (w * v + (1 - w) * tot2[pid]) if pid in tot2 else v
    return out


def _fam1_improves(b, a):
    return (a.get("spearman") is not None and b.get("spearman") is not None
            and a["spearman"] > b["spearman"] and a["mae"] < b["mae"])


def _fam2_improves(b, a):
    p12b, p12a = b.get("p_at_12"), a.get("p_at_12")
    p24b, p24a = b.get("p_at_24"), a.get("p_at_24")
    if None in (p12b, p12a, p24b, p24a):
        return False
    return ((p12a > p12b or p24a > p24b)
            and p12a >= p12b - 1e-9 and p24a >= p24b - 1e-9)


def _degrades(b, a):
    if a.get("spearman") is None or b.get("spearman") is None:
        return False
    if b["spearman"] - a["spearman"] > NOISE_SPEARMAN:
        return True
    if a["mae"] - b["mae"] > NOISE_MAE_FRAC * b["mae"]:
        return True
    for k in ("p_at_12", "p_at_24"):
        if b.get(k) is not None and a.get(k) is not None \
                and b[k] - a[k] > NOISE_P_AT_K:
            return True
    return False


def _cell(g, pos):
    """Flatten one harness cell to the fields the bars read."""
    c = (g.get("cells") or {}).get(pos, {})
    prec = c.get("precision") or {}
    def pk(k):
        e = prec.get(str(k)) or {}
        return e.get("precision") if e.get("status") == "measured" else None
    return {"status": c.get("status"), "spearman": c.get("spearman"),
            "mae": c.get("mae"), "p_at_12": pk(12), "p_at_24": pk(24)}


def verdict(base_g, arm_g):
    per_pos, ships_positions, degraded = {}, [], []
    for pos in POSITIONS:
        b, a = _cell(base_g, pos), _cell(arm_g, pos)
        if b.get("status") != "measured" or a.get("status") != "measured":
            per_pos[pos] = {"status": "unmeasurable"}
            continue
        f1, f2, deg = _fam1_improves(b, a), _fam2_improves(b, a), _degrades(b, a)
        per_pos[pos] = {"family1_improves": f1, "family2_improves": f2,
                        "degrades_beyond_noise": deg}
        if f1 and f2:
            ships_positions.append(pos)
        if deg:
            degraded.append(pos)
    ships = bool(ships_positions) and not degraded
    return {"per_position": per_pos, "positions_improving_both": ships_positions,
            "positions_degrading": degraded, "ships_under_section_3": ships}


def run() -> dict:
    positions = positions_record()
    ages = board_ages()
    actual = season_totals(GRADED_SEASON)[0]

    hand_blend = make_blend({p: RECENCY_WEIGHTS[0] for p in POSITIONS}, positions)
    base = build_stack(hand_blend, positions, ages)

    curves = fit_age_curves_leakfree()
    c1_map, c1_applied, c1_means = c1_apply(base, curves, positions)

    w_fit = c3_weights_leakfree()
    c3_map = build_stack(make_blend(w_fit, positions), positions, ages)

    c5_map = build_c5(hand_blend, positions, ages)

    eg = c7_eg_map(positions)
    c7_map = build_stack(hand_blend, positions, ages, eg_map=eg)
    assert V5.V5_CONFIG["RB"]["beta"] == 0.50 and V5.V5_CONFIG["TE"]["beta"] == 0.25, \
        "V5_CONFIG must be restored after the C5 build"

    g_base = grade(base, actual, positions)
    g_c1 = grade(c1_map, actual, positions)
    g_c3 = grade(c3_map, actual, positions)
    g_c5 = grade(c5_map, actual, positions)
    g_c7 = grade(c7_map, actual, positions)

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/v7_candidate_grade.py",
        "_prereg": "V7-CANDIDATE-PREREG.md §2/§3; bars declared in this module's docstring before any number",
        "graded_season": GRADED_SEASON,
        "information_set": {
            "c1_age_transitions": [f"{a}->{b}" for a, b in AGE_FIT_TRANSITIONS],
            "c1_positions": list(AGE_POSITIONS),
            "c1_players_adjusted": c1_applied,
            "c1_position_means_normalized_out": {k: round(v, 4) for k, v in c1_means.items()},
            "c3_w_by_pos_leakfree": w_fit,
            "c3_incumbent_w": RECENCY_WEIGHTS[0],
            "c7_shrink_k": C7_SHRINK_K,
            "c7_map_size": len(eg),
            "leak_note": "the ->2025 age transition and recency triple are excluded from both fits",
        },
        "bars": {"spearman": NOISE_SPEARMAN, "mae_frac": NOISE_MAE_FRAC,
                 "p_at_k": NOISE_P_AT_K},
        "grades": {"base_v6": g_base, "c1_age_curves": g_c1,
                   "c3_fitted_recency": g_c3, "c5_wr_only_efficiency": g_c5,
                   "c7_availability_gate": g_c7},
        "verdicts": {"c1_age_curves": verdict(g_base, g_c1),
                     "c3_fitted_recency": verdict(g_base, g_c3),
                     "c5_wr_only_efficiency": verdict(g_base, g_c5),
                     "c7_availability_gate": verdict(g_base, g_c7)},
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    for arm in ("c1_age_curves", "c3_fitted_recency", "c5_wr_only_efficiency", "c7_availability_gate"):
        v = doc["verdicts"][arm]
        print(f"{arm}: ships={v['ships_under_section_3']} "
              f"improving={v['positions_improving_both']} "
              f"degrading={v['positions_degrading']}")


if __name__ == "__main__":
    main()
