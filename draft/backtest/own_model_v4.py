# TERRITORY: A
"""OWN MODEL v4 — v3's cleared arms untouched, one targeted QB replacement.
Built 2026-08-16, beside v2 and v3 (never replacing them); promotion stays a
written decision for Cory either way.

WHY v4 EXISTS — ONE IDENTIFIED ANGLE, NOT A BROAD RE-SEARCH. v3 cleared REC-3
at RB, WR and TE and failed ONLY the QB cells, both metrics, by hair-thin
margins (MAE 74.76 vs the blend's 74.09; Spearman 0.7189 vs 0.7213). Its own
failure analysis named the cause: half of v3's QB opinion was the league's
preseason draft market, and the 2025 QB market went dead (rank-vs-outcome rho
0.054 after 0.43/0.27 in the two tuning years). v4 removes the dead QB opinion
and replaces it with the one thing the committed weekly stores DO carry for
QBs: the decomposition of a season into AVAILABILITY (active games) and
PER-GAME RATE, and the empirical fact that availability regresses to the mean
harder than rate does. RB/WR/TE keep v3's ensemble bit for bit — their cells
must reproduce model_accuracy_v3.json exactly, asserted by test.

THE DATA-AUDIT FINDING THAT TRIGGERED THIS ATTEMPT, stated honestly. v3's
report listed "per-week usage/TD stats" as a named absence and implied weekly
grain was missing. Verified for v4: draft/data/league_history.json DOES carry
per-player weekly fantasy points (seasons[].weeks[wk][].players_points, every
roster, 2023-2025) — but for QBs it is a STRICT SUBSET of the committed
nflverse weekly stores (2023: 0 league-history-only player-weeks vs 103
nflverse-only among shared QBs; values agree within 0.05 pts on ~99% of
overlapping weeks; its extra zero-point weeks are "rostered, didn't play" —
the same availability fact the nflverse store encodes by row-absence).
So the LEAGUE store corroborates the weekly grain but adds no new QB
player-weeks; v4's features read the fuller nflverse store, and the artifact
carries the corroboration audit. What remains genuinely absent is unchanged:
usage splits, TD counts, team history, pre-2023 seasons.

════════════════════════════════════════════════════════════════════════════════
PREREGISTRATION — structure, constants, gates and evaluation FIXED IN THIS FILE
BEFORE THE 2025 COMPARISON WAS RUN. The commit that adds this file carries no
results artifact; model_accuracy_v4.json lands in a later commit. Commit order
is the proof.
════════════════════════════════════════════════════════════════════════════════

── INFORMATION SET, PER PREDICTION (season Y = 2025) ─────────────────────────

  Everything v3 uses, unchanged (weekly stores ≤ Y−1; v2's 2023→2024 fit; the
  declared 0.7/0.3 blend; the marker-gated preseason season-Y league draft and
  the Y−1 rank→points curve for the RB/WR/TE arms; board ages inside v2's
  features; the positions record) — PLUS, for the QB arm only:

  · per-week points of season Y−1 from the committed nflverse weekly store,
    reduced to ACTIVE GAMES: weeks with ≥ QB_TAU points (8.0 — a started-QB
    week, not a mop-up appearance);
  · the QB availability mean over season Y−1 (players with ≥ QB_MU_MIN_ACT
    active games).

Nothing from any season-Y game enters any feature; own_model_v2's
_assert_no_leak still guards the stat side and v3's marker gate still guards
the draft side (v4 inherits the market-bearing RB/WR/TE arms, so the gate
stays load-bearing: no markers ⇒ nothing graded).

── v4, DEFINED ───────────────────────────────────────────────────────────────

Coverage: exactly v3's (= v2's), so the shared-population denominator is
identical to model_accuracy_v2.json / model_accuracy_v3.json.

RB / WR / TE:  v3's prediction, byte for byte (own_model_v3.build_v3 with
               v3's frozen ENSEMBLE_WEIGHTS — imported, not copied).

QB:            pred = blend · corr(act)          — no v2 term, no market term.

    act        active games in Y−1: weeks 1-17 with ≥ QB_TAU points
    blend      0.7·total_{Y−1} + 0.3·total_{Y−2}  (the baseline's own value)
    E[G]       QB_LAM·act + (1−QB_LAM)·mu_g      — availability regressed
               toward the Y−1 QB mean mu_g (mean act over QBs with
               act ≥ QB_MU_MIN_ACT; no such QB ⇒ corr ≡ 1.0, declared)
    corr(act)  act < QB_MIN_ACT  ⇒ 1.0 (a bench profile is not an injury
               profile — never inflated);
               else clamp(E[G]/act, [1/QB_RATIO_CAP, QB_RATIO_CAP])^QB_THETA

Clamped at 0, rounded 2dp. The mechanism: a QB season total is rate ×
availability; availability mean-reverts (an injury-shortened Y−1 under-prices
Y, a 17-game Y−1 over-prices it) while the blend prices last season's
availability as if it were the player's true rate of play.

── HOW THE QB CONSTANTS WERE CHOSEN (tuning discipline, stated honestly) ─────

Grid-searched on THREE folds built strictly from seasons ≤ 2024 — no 2025
value was read at any point during design:

    A  2023 season features → realized 2024 totals (the real transition;
       the recency blend degenerates to naive_prev here — no 2022 store)
    B  2023 weeks 1-9 → 2023 weeks 10-17 (within-season availability split)
    C  2024 weeks 1-9 → 2024 weeks 10-17

Selection rule, fixed before the search: a configuration QUALIFIES only if it
beats its base (the fold's blend-equivalent) on BOTH metrics in ALL THREE
folds; among qualifiers, maximize the minimum-across-folds MAE gain, tie-break
on minimum Spearman gain. Seventeen configurations qualified; the winner —

    QB_TAU 8.0 · QB_LAM 0.7 · QB_THETA 0.75 · QB_MIN_ACT 2
    QB_MU_MIN_ACT 4 · QB_RATIO_CAP 2.0

— re-verified under these exact production definitions:

    fold A: base 81.36/0.6014 → 80.23/0.6068   (ΔMAE +1.12, Δρ +0.0054)
    fold B: base 38.06/0.7248 → 37.75/0.7273   (ΔMAE +0.31, Δρ +0.0025)
    fold C: base 37.38/0.7139 → 36.39/0.7236   (ΔMAE +0.99, Δρ +0.0097)

Richer alternatives were tried on the same folds and REJECTED before any 2025
contact: multiplicative rate×availability models (shrunk rate × regressed
games) beat naive by less than this correction and lost rho in ensembles;
OLS on weekly features (rate/late-rate/volatility/availability) overfits at
n≈59 (leave-one-out MAE 79-84, rho ≤ 0.55 — worse than naive's 0.60). The
one-parameter-family-around-the-strongest-baseline shape is the point: QB
holds the least out-of-sample signal, so it gets the smallest model.

Named residual risk, same class as v3's: three folds from two seasons is thin
evidence, the fold gains (+0.3..+1.1 MAE, +0.003..+0.010 rho) are the same
order as the margin v4 must close (0.67 MAE, 0.0025 rho), and the within-
season folds test availability regression at half-season, not full-season,
horizon. The 2025 arm below is one honest shot, not a search.

── THE 2024 ARM IS DELIBERATELY ABSENT ───────────────────────────────────────

Fold A consumed realized 2024, and folds B/C consumed 2023/2024 late-season
weeks, in tuning — so any ≤2024 grade of v4 is in-sample. v4's verdict rests
on the single held-out season the stores allow (2025), and says so.

── EVALUATION (v2's harness, imported, stated again) ─────────────────────────

    graded season   2025, weeks 1-17
    population      per position (QB/RB/WR/TE per player_positions.json),
                    ≥1 weekly row in 2025 AND a forecast; MIN_N = 10
    metrics         MAE, mean signed bias, Spearman within position
    models          own_v4, own_v3, own_v2, walk_forward_v1, naive_prev,
                    recency_blend — head-to-head on the SHARED population
                    (grading code imported from own_model_v2; v3 predictions
                    imported from own_model_v3 — neither re-implemented)
    bar (REC-3)     own_v4 clears iff at ALL FOUR positions:
                    MAE(v4) < min(MAE(naive_prev), MAE(recency_blend)) AND
                    Spearman(v4) > max(Spearman(naive_prev), Spearman(recency_blend))
                    Strict inequalities. Ties lose. Cory-ratified; not weakened.
    reproduction    every own_v3 / own_v2 / walk_forward_v1 / naive_prev /
                    recency_blend cell must equal model_accuracy_v3.json bit
                    for bit, and own_v4's RB/WR/TE cells must equal own_v3's
                    (inherited arms) — asserted by test.

POST-GRADE ANALYSIS carried by the artifact (never features): the
availability-vs-rate variance decomposition of QB season totals per season
(var(log total) = var(log games) + var(log rate) + 2cov), and the
league-history corroboration audit described above.

Run: python draft/backtest/own_model_v4.py
Writes draft/backtest/model_accuracy_v4.json.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import walk_forward  # noqa: E402
from model_accuracy_backtest import season_totals, positions_record  # noqa: E402
from own_model_v2 import (  # noqa: E402
    POSITIONS,
    _assert_no_leak,
    _baselines,
    _grade_models,
    board_ages,
    features_for,
    fit_transition,
    predict,
)
from own_model_v3 import (  # noqa: E402
    build_v3,
    draft_marker_gate,
    league_draft_picks,
    market_ranks,
    promotion_verdict,
    rank_curve,
)

GRADED_SEASON = 2025
PRIOR_SEASONS = (2023, 2024)
LAST_SCORED_WEEK = 17

# The frozen QB availability configuration — see prereg above. Chosen on the
# three ≤2024 folds under the fixed selection rule; never touched since.
QB_TAU = 8.0          # an ACTIVE week: ≥ this many points (a started-QB week)
QB_LAM = 0.7          # weight on the player's own Y−1 availability
QB_THETA = 0.75       # exponent tempering the correction ratio
QB_MIN_ACT = 2        # below this, corr ≡ 1.0 (bench profile ≠ injury profile)
QB_MU_MIN_ACT = 4     # availability mean is over QBs with ≥ this many actives
QB_RATIO_CAP = 2.0    # E[G]/act clamps to [1/cap, cap]

LEAGUE_HISTORY = HERE.parent / "data" / "league_history.json"
OUT = HERE / "model_accuracy_v4.json"


# ── the QB availability layer ────────────────────────────────────────────────

def weekly_points(season: int, last_week: int = LAST_SCORED_WEEK,
                  first_week: int = 1) -> dict:
    """{pid: {week: points}} from the committed nflverse weekly store —
    presence of a row is "was on a field", the same games basis the whole
    backtest program uses."""
    store = json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())
    out: dict[str, dict[int, float]] = {}
    for w in store["weeks"]:
        if not (first_week <= w["week"] <= last_week):
            continue
        for pid, v in w["points"].items():
            out.setdefault(str(pid), {})[int(w["week"])] = float(v)
    return out


def qb_active_games(wk: dict, positions: dict, tau: float = QB_TAU) -> dict:
    """{pid: active games} for QBs: weeks with ≥ tau points."""
    return {pid: sum(1 for v in rows.values() if v >= tau)
            for pid, rows in wk.items() if positions.get(pid) == "QB"}


def qb_availability_correction(acts: dict) -> tuple[dict, float | None]:
    """({pid: corr}, mu_g). corr per the prereg: act < QB_MIN_ACT ⇒ 1.0, else
    clamp(E[G]/act)^theta with E[G] regressed toward mu_g. No QB reaches
    QB_MU_MIN_ACT ⇒ (all 1.0, None) — the declared degenerate arm."""
    eligible = sorted(a for a in acts.values() if a >= QB_MU_MIN_ACT)
    if not eligible:
        return {pid: 1.0 for pid in acts}, None
    mu_g = sum(eligible) / len(eligible)
    out = {}
    for pid in sorted(acts):
        a = acts[pid]
        if a < QB_MIN_ACT:
            out[pid] = 1.0
            continue
        eg = QB_LAM * a + (1.0 - QB_LAM) * mu_g
        ratio = min(QB_RATIO_CAP, max(1.0 / QB_RATIO_CAP, eg / a))
        out[pid] = ratio ** QB_THETA
    return out, mu_g


def build_v4(v3_pred: dict, blend: dict, corr: dict, positions: dict) -> dict:
    """v4: v3's prediction everywhere except QB, where pred = blend·corr.
    Coverage is exactly v3's. A QB absent from the correction map (no Y−1
    week — impossible inside coverage, possible in a fixture) keeps corr 1.0;
    a QB absent from the blend map falls back to the v3 prediction."""
    out = dict(v3_pred)
    for pid in sorted(v3_pred):
        if positions.get(pid) != "QB":
            continue
        base = blend.get(pid, v3_pred[pid])
        out[pid] = round(max(0.0, base * corr.get(pid, 1.0)), 2)
    return out


# ── post-grade analysis blocks (never features) ──────────────────────────────

def qb_variance_decomposition(season: int, positions: dict) -> dict:
    """var(log total) = var(log games) + var(log rate) + 2cov over the season's
    QBs with positive totals — how much of the season-total spread is
    availability. Row-presence games; population log for determinism."""
    wk = weekly_points(season)
    pids = sorted(p for p in wk if positions.get(p) == "QB"
                  and sum(wk[p].values()) > 0)
    lt = [math.log(sum(wk[p].values())) for p in pids]
    lg = [math.log(len(wk[p])) for p in pids]
    lr = [lt[i] - lg[i] for i in range(len(pids))]

    def var(v):
        mu = sum(v) / len(v)
        return sum((x - mu) ** 2 for x in v) / len(v)

    def cov(a, b):
        ma, mb = sum(a) / len(a), sum(b) / len(b)
        return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / len(a)

    vt, vg, vr, c = var(lt), var(lg), var(lr), cov(lg, lr)
    return {"n": len(pids), "var_log_total": round(vt, 3),
            "var_log_games": round(vg, 3), "var_log_rate": round(vr, 3),
            "twice_cov": round(2 * c, 3),
            "availability_share": round((vg + c) / vt, 4)}


def league_history_weekly_audit(seasons=(2023, 2024),
                                history_path: Path = LEAGUE_HISTORY) -> dict:
    """The data-audit finding that triggered v4, embedded as evidence: for QBs,
    league_history's players_points weekly grain vs the nflverse stores —
    coverage relation and value agreement. Absence from every roster's map in
    a week is MISSING DATA (unrostered), never a zero; the comparison below
    therefore only grades weeks present in BOTH sources, and counts the rest."""
    doc = json.loads(history_path.read_text())
    positions = positions_record()
    out = {"rule": ("a player absent from every roster's players_points in a "
                    "week is UNROSTERED that week — missing data, not a zero; "
                    "only weeks present in both stores are value-compared"),
           "seasons": {}}
    for season in seasons:
        recs = [s for s in doc["seasons"] if str(s.get("season")) == str(season)]
        if not recs:
            out["seasons"][str(season)] = {"status": "absent"}
            continue
        lh: dict[str, dict[int, float]] = {}
        for wk_str, entries in recs[0].get("weeks", {}).items():
            w = int(wk_str)
            if w > LAST_SCORED_WEEK:
                continue
            for e in entries:
                for pid, pts in (e.get("players_points") or {}).items():
                    lh.setdefault(str(pid), {})[w] = float(pts)
        nv = weekly_points(season)
        qb_nv = {p for p in nv if positions.get(p) == "QB"}
        qb_lh = {p for p in lh if positions.get(p) == "QB"}
        shared = sorted(qb_nv & qb_lh)
        diffs = [abs(nv[p][w] - lh[p][w]) for p in shared for w in sorted(nv[p])
                 if w in lh[p]]
        lh_only_pw = sum(1 for p in sorted(qb_lh) for w in lh[p]
                         if p not in nv or w not in nv[p])
        nv_only_pw = sum(1 for p in shared for w in nv[p] if w not in lh[p])
        rostered_dnp = sum(1 for p in shared for w, v in lh[p].items()
                           if v == 0.0 and (p not in nv or w not in nv[p]))
        out["seasons"][str(season)] = {
            "qb_players": {"nflverse": len(qb_nv), "league_history": len(qb_lh),
                           "league_history_only": len(qb_lh - qb_nv)},
            "qb_player_weeks_compared": len(diffs),
            "mean_abs_point_diff": round(sum(diffs) / len(diffs), 3) if diffs else None,
            "share_within_0.05": round(sum(1 for d in diffs if d <= 0.05)
                                       / len(diffs), 3) if diffs else None,
            "league_history_only_player_weeks": lh_only_pw,
            "nflverse_only_player_weeks_shared_qbs": nv_only_pw,
            "rostered_did_not_play_weeks": rostered_dnp,
        }
    return out


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    positions = positions_record()
    ages = board_ages()

    # v2, rebuilt through v2's own unchanged code path (fit on 2023→2024).
    feat_fit = features_for(2024, (2023,), positions, ages)
    fits = fit_transition(feat_fit, season_totals(2024)[0])
    feat_2025 = features_for(GRADED_SEASON, PRIOR_SEASONS, positions, ages)
    v2_2025 = predict(feat_2025, fits)

    # baselines — the backtest's own construction.
    base = _baselines(GRADED_SEASON, PRIOR_SEASONS)
    blend = base["recency_blend"]

    # v3's market layer, through v3's own unchanged code path.
    _assert_no_leak(PRIOR_SEASONS, GRADED_SEASON)
    picks = league_draft_picks(GRADED_SEASON)
    curve = rank_curve(max(PRIOR_SEASONS), positions)
    mrank = market_ranks(picks, positions)

    actual_2025 = season_totals(GRADED_SEASON)[0]
    gate = draft_marker_gate(picks, actual_2025, positions)
    if gate["status"] != "ok":
        doc = {
            "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v4.py",
            "status": "no_markers",
            "why": ("the season-2025 league draft shows no dead top pick — "
                    "cannot prove it is preseason-frozen, and v4 inherits v3's "
                    "market-bearing RB/WR/TE arms, so nothing is graded. "
                    "Refusal is the artifact."),
            "gate": gate,
        }
        OUT.write_text(json.dumps(doc, indent=1))
        return doc

    v3_2025 = build_v3(v2_2025, blend, mrank, curve, positions)

    # the QB availability layer, strictly from the Y−1 weekly store.
    wk_y1 = weekly_points(max(PRIOR_SEASONS))
    acts = qb_active_games(wk_y1, positions)
    corr, mu_g = qb_availability_correction(acts)
    v4_2025 = build_v4(v3_2025, blend, corr, positions)

    prior_pts, prior_games = {}, {}
    for y in PRIOR_SEASONS:
        prior_pts[y], prior_games[y] = season_totals(y)
    v1_2025 = walk_forward(GRADED_SEASON, prior_pts, prior_games, positions, ages={})

    models = {"own_v4": v4_2025, "own_v3": v3_2025, "own_v2": v2_2025,
              "walk_forward_v1": v1_2025, "naive_prev": base["naive_prev"],
              "recency_blend": blend}
    arm = _grade_models(models, GRADED_SEASON, positions)
    verdict = promotion_verdict(arm["head_to_head_shared_population"],
                                candidate="own_v4")

    decomposition = {str(s): qb_variance_decomposition(s, positions)
                     for s in (*PRIOR_SEASONS, GRADED_SEASON)}

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v4.py",
        "_note": ("Own-model v4 (v3's RB/WR/TE arms unchanged; QB = recency "
                  "blend × availability correction from the Y−1 weekly store) "
                  "vs v3, v2, v1 and both naive baselines, leak-free, under "
                  "model_accuracy_backtest.py's exact protocol. Structure, "
                  "constants, gates and evaluation were PREREGISTERED in "
                  "own_model_v4.py and committed before this artifact existed — "
                  "commit order is the proof. Promotion stays gated regardless "
                  "of the verdict."),
        "preregistration": "own_model_v4.py module docstring (committed first)",
        "status": "graded",
        "graded_season": GRADED_SEASON,
        "prior_seasons": list(PRIOR_SEASONS),
        "information_set": ("everything v3 uses, unchanged (marker-gated 2025 "
                            "league draft + 2024 curve for RB/WR/TE; weekly "
                            "stores ≤2024; v2's 2023→2024 fit; the 0.7/0.3 "
                            "blend) — plus, for QB only, 2024 active-game "
                            "counts from the committed nflverse weekly store"),
        "marker_gate": gate,
        "qb_availability_config": {
            "tau": QB_TAU, "lam": QB_LAM, "theta": QB_THETA,
            "min_act": QB_MIN_ACT, "mu_min_act": QB_MU_MIN_ACT,
            "ratio_cap": QB_RATIO_CAP,
            "mu_g_2024": round(mu_g, 4) if mu_g is not None else None,
        },
        "inherited_v3_arms": ("RB/WR/TE predictions are own_model_v3.build_v3's "
                              "output bit for bit (imported, v3's frozen "
                              "weights); their own_v4 cells must equal own_v3's "
                              "— asserted by test"),
        "arm_2024": ("deliberately absent: the QB constants were tuned on the "
                     "2023→2024 transition and on 2023/2024 within-season "
                     "half-splits, so any ≤2024 grade of v4 is in-sample — "
                     "reporting one would manufacture a flattering second sample"),
        "features_unavailable_named": {
            "fp_archive_per_player": ("exp_fp_hist_proj committed only summary "
                                      "metrics; per-player archived FP projections "
                                      "are the strongest absent market feature"),
            "usage_trends": ("still absent: no targets/carries/attempts in ANY "
                             "committed weekly store — league_history's "
                             "players_points is points-only and, for QBs, a "
                             "strict subset of the nflverse stores (see "
                             "league_history_weekly_audit)"),
            "td_rate_regression": "no TD counts in the stores",
            "team_change_flags": "no team assignment history on committed disk",
            "pre_2023_stores": "training transition is ONE year — the binding limit",
        },
        "league_history_weekly_audit": league_history_weekly_audit(),
        "qb_variance_decomposition": decomposition,
        "arm_2025": dict(arm, graded_season=GRADED_SEASON,
                         prior_seasons=list(PRIOR_SEASONS),
                         mode="inherited-ensemble + QB availability correction"),
        "promotion_bar": verdict,
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    if doc.get("status") != "graded":
        print(f"status: {doc.get('status')} — refused, nothing graded")
        return
    h = doc["arm_2025"]["head_to_head_shared_population"]
    print("2025 arm, shared population (MAE / Spearman):")
    for pos in POSITIONS:
        row = h.get(pos) or {}
        if row.get("status") != "measured":
            print(f"  {pos}: unmeasurable")
            continue
        cells = "  ".join(
            f"{m}={row[m]['mae']}/{row[m]['spearman']}"
            for m in ("own_v4", "own_v3", "naive_prev", "recency_blend"))
        print(f"  {pos} (n={row['n']}): {cells}")
    print(f"promotion bar clears: {doc['promotion_bar']['clears']}")


if __name__ == "__main__":
    main()
