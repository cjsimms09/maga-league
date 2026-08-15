# TERRITORY: A
"""OWN MODEL v3 — the ensemble candidate against REC-3's promotion bar.
Built 2026-08-15, beside v2 (never replacing it); promotion stays a written
decision for Cory either way.

WHY v3 EXISTS. v2 failed the bar at QB (both metrics: MAE 76.14 vs the blend's
74.09, Spearman 0.7166 vs 0.7213) and at TE Spearman (0.7813 vs 0.7871) —
model_accuracy_v2.json. The diagnosis: QB season points are dominated by
information the weekly POINTS stores cannot carry (rushing role, team change,
recovery status), and TE is a two-tier position whose tiers a stats-only
linear model smears. Both are exactly what a PRESEASON MARKET already prices.

THE ONE NEW INPUT: the league's own preseason snake draft, already committed in
draft/data/league_history.json (150 picks, 10 teams, no keepers, every season
2023-2025). A draft for season Y completes before Y's week 1 — it is a
preseason-frozen human forecast, the same information class as the
FantasyPros archive the projection-skill backtest graded (preseason-frozen ==
leak-free is that experiment's own standard). Frozenness is VERIFIED, not
assumed: see the marker gate below.

════════════════════════════════════════════════════════════════════════════════
PREREGISTRATION — structure, weights, gates and evaluation FIXED IN THIS FILE
BEFORE THE 2025 COMPARISON WAS RUN. The commit that adds this file carries no
results artifact; model_accuracy_v3.json lands in a later commit. Commit order
is the proof.
════════════════════════════════════════════════════════════════════════════════

── INFORMATION SET, PER PREDICTION (season Y = 2025) ─────────────────────────

  · weekly points stores of seasons ≤ Y−1 (2023, 2024) — v2's features;
  · v2's OLS coefficients, fitted ONLY on the 2023→2024 transition (unchanged
    import of own_model_v2's fit — v2 itself is untouched);
  · the recency blend 0.7·total_{Y−1} + 0.3·total_{Y−2} (declared weights,
    missing Y−2 ⇒ total_{Y−1}) — the baseline's own arithmetic;
  · the LEAGUE DRAFT OF SEASON Y (completed pre-week-1; zero realized-Y
    information), reduced to position rank by pick_no;
  · the position-rank→points curve from season Y−1's REALIZED totals (the
    market rank is priced with last season's curve, never the graded one);
  · board ages only where v2 already uses them (inside v2's features);
  · draft/data/player_positions.json (the record, not the live board).

Nothing from season Y's games enters any feature. own_model_v2's
_assert_no_leak guards the stat features; the draft is pre-week-1 by
construction and PROVEN frozen by the marker gate.

── THE MARKER GATE (authenticity, mirrored from EXP-FP-HIST-PROJ G2) ─────────

A genuinely preseason draft contains high picks whose seasons then died — a
post-hoc list never would. Gate, fixed here: the season-Y draft must contain
≥ 1 pick with overall pick_no ≤ MARKER_MAX_PICK (75) at QB/RB/WR/TE whose
realized season-Y total (weeks 1-17) is ≤ MARKER_DEAD_POINTS (30). The gate
consumes realized Y totals ONLY as verification of the input's frozenness —
never as a feature. Fail ⇒ status "no_markers" and NO grade: refusal is the
artifact, exactly the FP experiment's discipline. (Observed in design, for the
record: the 2025 draft prices James Conner at pick 48 — realized 29.3 — the
same marker the FP archive audit cites; 2023's prices Nick Chubb at 25.)

── v3, DEFINED ───────────────────────────────────────────────────────────────

Coverage: exactly v2's (players with a Y−1 store row and a QB/RB/WR/TE
position record) — so the shared-population protocol grades the identical
denominator as model_accuracy_v2.json, and every baseline number must
reproduce that artifact bit for bit.

Three leak-free opinions per player:
    v2      own_model_v2's fitted prediction (unchanged code, unchanged fit)
    blend   0.7·total_{Y−1} + 0.3·total_{Y−2}   (declared)
    market  curve_{Y−1}(position_rank_in_draft_Y)  — the Y−1 realized total of
            that position rank (rank beyond the curve clamps to its tail)

Prediction, drafted players:    pred = wv·v2 + wb·blend + wm·market
Prediction, undrafted players:  pred = (wv·v2 + wb·blend) / (wv + wb)
Clamped at 0, rounded to 2dp.

ENSEMBLE_WEIGHTS (wv, wb, wm) — POSITION-SPECIFIC STRUCTURE, the lever the
rb_te/QB failure analysis called for:

    QB (0.25, 0.25, 0.50)   market-heavy: rushing role/team change/recovery
                            live in the market, not in points-only stores
    RB (0.25, 0.25, 0.50)   market strongly validated at RB in both prior
                            drafts (rank-vs-outcome rho 0.43 / 0.54)
    WR (0.50, 0.25, 0.25)   v2's OLS is the strongest known WR opinion —
                            market is a light corrective
    TE (0.35, 0.35, 0.30)   two-tier position: the ensemble hedges the tiers
                            through the market instead of one linear smear

── HOW THE WEIGHTS WERE CHOSEN (tuning discipline, stated honestly) ──────────

Tuned ONLY on the 2023→2024 training transition (features 2023 + the 2024
league draft → realized 2024), where the frozen configuration beats naive on
BOTH metrics at ALL FOUR positions (QB 71.67/0.6596 vs 81.36/0.6019; RB
40.37/0.7771 vs 44.62/0.742; WR 37.06/0.7286 vs 41.34/0.7196; TE 26.10/0.7159
vs 27.63/0.7139). The market signal itself was validated on BOTH pre-2025
drafts (2023 and 2024, rank-vs-outcome per position). No 2025 evaluation was
run during design. Named residual risk: the per-position STRUCTURE choice
(which opinion anchors which position) is additionally informed by v2's
already-published 2025 table — public prior art, the same way v2 was designed
off v1's published failure — so the 2025 arm is one honest shot, not a search.

── THE 2024 ARM IS DELIBERATELY ABSENT ───────────────────────────────────────

The ensemble weights were tuned on 2024 outcomes, so ANY 2024 grade of v3 is
in-sample — reporting one would manufacture a flattering second sample. v2's
artifact already carries the 2024 declared-skeleton context; v3's verdict
rests on the single held-out season the stores allow (2025), and says so.

── EVALUATION (identical to own_model_v2.py's, stated again) ─────────────────

    graded season   2025, weeks 1-17
    population      per position (QB/RB/WR/TE per player_positions.json),
                    ≥1 weekly row in 2025 AND a forecast; MIN_N = 10
    metrics         MAE, mean signed bias, Spearman within position
    models          own_v3, own_v2, walk_forward_v1, naive_prev, recency_blend
                    — head-to-head on the SHARED population (grading code
                    imported from own_model_v2, not re-implemented)
    bar (REC-3)     own_v3 clears iff at ALL FOUR positions:
                    MAE(v3) < min(MAE(naive_prev), MAE(recency_blend)) AND
                    Spearman(v3) > max(Spearman(naive_prev), Spearman(recency_blend))
                    Strict inequalities. Ties lose. Cory-ratified; not weakened.

NOT AVAILABLE — named data-needs, not faked:
  · per-player FantasyPros archived preseason projections: only summary
    metrics were committed (exp_fp_hist_proj.json); the per-player rows would
    be the strongest possible market feature and are a named need;
  · per-week usage (targets/carries), TD counts, team-assignment history:
    unchanged from v2's named absences;
  · any season before 2023 (stores start 2023): the training transition is
    ONE year — the single biggest limit on this whole program.

Run: python draft/backtest/own_model_v3.py
Writes draft/backtest/model_accuracy_v3.json.
"""
from __future__ import annotations

import json
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

GRADED_SEASON = 2025
PRIOR_SEASONS = (2023, 2024)
MARKER_MAX_PICK = 75
MARKER_DEAD_POINTS = 30.0

# (w_v2, w_blend, w_market) per position — see prereg above. Rows sum to 1.
ENSEMBLE_WEIGHTS = {
    "QB": (0.25, 0.25, 0.50),
    "RB": (0.25, 0.25, 0.50),
    "WR": (0.50, 0.25, 0.25),
    "TE": (0.35, 0.35, 0.30),
}

LEAGUE_HISTORY = HERE.parent / "data" / "league_history.json"
OUT = HERE / "model_accuracy_v3.json"


# ── the market input ─────────────────────────────────────────────────────────

def league_draft_picks(season: int, history_path: Path = LEAGUE_HISTORY) -> dict:
    """{pid: pick_no} for the season's completed league draft. Where a season
    carries more than one draft record (2023 has a 30-pick partial beside the
    real one), the completed draft with the most picks is the draft. Raises if
    no completed draft exists — a missing market is a refusal, not a zero."""
    doc = json.loads(history_path.read_text())
    for s in doc["seasons"]:
        if str(s.get("season")) != str(season):
            continue
        drafts = [d for d in s.get("drafts", []) if d.get("status") == "complete"]
        if not drafts:
            break
        best = max(drafts, key=lambda d: len(d.get("picks", [])))
        return {str(p["player_id"]): int(p["pick_no"]) for p in best["picks"]}
    raise ValueError(f"no completed league draft on disk for season {season}")


def market_ranks(picks: dict, positions: dict) -> dict:
    """{pid: (pos, position_rank)} from overall pick order, QB/RB/WR/TE only.
    Deterministic: ties in pick_no (impossible in a real draft, possible in a
    fixture) break on pid."""
    out = {}
    for pos in POSITIONS:
        ordered = sorted((pk, pid) for pid, pk in picks.items()
                         if positions.get(pid) == pos)
        for i, (_pk, pid) in enumerate(ordered):
            out[pid] = (pos, i + 1)
    return out


def rank_curve(season: int, positions: dict) -> dict:
    """{pos: [realized totals, desc]} for the season — the price sheet a
    position rank converts through. Callers pass Y−1, never Y."""
    totals, _games = season_totals(season)
    return {pos: sorted((t for pid, t in totals.items()
                         if positions.get(pid) == pos), reverse=True)
            for pos in POSITIONS}


def market_points(curve: dict, pos: str, rank: int) -> float:
    """The Y−1 realized total of this position rank; ranks past the curve's
    tail clamp to the tail (a late pick prices as a late season, not zero)."""
    c = curve[pos]
    return float(c[min(rank - 1, len(c) - 1)])


def draft_marker_gate(picks: dict, realized: dict, positions: dict) -> dict:
    """Preseason-frozenness proof — EXP-FP-HIST-PROJ G2's logic on the draft:
    ≥1 top-MARKER_MAX_PICK QB/RB/WR/TE pick whose realized graded-season total
    is ≤ MARKER_DEAD_POINTS. Consumes realized totals ONLY as verification.
    Returns {"status": "ok"|"no_markers", "markers": [...]}."""
    markers = []
    for pid, pk in sorted(picks.items(), key=lambda kv: kv[1]):
        if pk > MARKER_MAX_PICK or positions.get(pid) not in POSITIONS:
            continue
        r = realized.get(pid)
        if r is not None and r <= MARKER_DEAD_POINTS:
            markers.append({"player_id": pid, "pick_no": pk,
                            "position": positions[pid], "realized": round(r, 1)})
    return {"status": "ok" if markers else "no_markers", "markers": markers}


# ── the ensemble ─────────────────────────────────────────────────────────────

def build_v3(v2_pred: dict, blend: dict, mrank: dict, curve: dict,
             positions: dict, weights: dict | None = None) -> dict:
    """v3 predictions. Drafted: wv·v2 + wb·blend + wm·market. Undrafted:
    (wv·v2 + wb·blend)/(wv+wb). Clamp 0, round 2dp. Deterministic order."""
    weights = weights or ENSEMBLE_WEIGHTS
    out = {}
    for pid in sorted(v2_pred):
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        wv, wb, wm = weights[pos]
        b = blend.get(pid, v2_pred[pid])
        entry = mrank.get(pid)
        if entry is not None and entry[0] == pos:
            v = wv * v2_pred[pid] + wb * b + wm * market_points(curve, pos, entry[1])
        else:
            s = wv + wb
            v = (wv * v2_pred[pid] + wb * b) / s
        out[pid] = round(max(0.0, v), 2)
    return out


# ── the bar (REC-3, computed for own_v3) ─────────────────────────────────────

def promotion_verdict(h2h: dict, candidate: str = "own_v3") -> dict:
    """REC-3's bar verbatim: beat BOTH naive baselines at ALL four positions
    on BOTH metrics, strict inequalities, shared population."""
    per_pos = {}
    clears = True
    for pos in POSITIONS:
        row = h2h.get(pos) or {}
        if row.get("status") != "measured":
            per_pos[pos] = {"status": "unmeasurable"}
            clears = False
            continue
        cand = row[candidate]
        base_mae = min(row["naive_prev"]["mae"], row["recency_blend"]["mae"])
        base_sp = max(row["naive_prev"]["spearman"], row["recency_blend"]["spearman"])
        mae_ok = cand["mae"] < base_mae
        sp_ok = cand["spearman"] > base_sp
        per_pos[pos] = {"mae_beats_both": mae_ok, "spearman_beats_both": sp_ok,
                        f"{candidate}_mae": cand["mae"], "best_baseline_mae": base_mae,
                        f"{candidate}_spearman": cand["spearman"],
                        "best_baseline_spearman": base_sp}
        clears = clears and mae_ok and sp_ok
    return {
        "bar": ("beat BOTH naive baselines at ALL four positions on BOTH metrics "
                "(MAE and Spearman), shared population, leak-free walk-forward — "
                "REC-3, Cory-ratified, strict inequalities"),
        "candidate": candidate,
        "clears": clears,
        "per_position": per_pos,
        "consequence": ("clears=false → v3 stays display-only beside v2. "
                        "clears=true → a written promotion decision goes to Cory; "
                        "NOTHING flips automatically either way."),
    }


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

    # the market: season-Y draft, priced on the Y−1 curve. Leak guard on the
    # curve's season, then the marker gate on the draft itself.
    _assert_no_leak(PRIOR_SEASONS, GRADED_SEASON)
    picks = league_draft_picks(GRADED_SEASON)
    curve = rank_curve(max(PRIOR_SEASONS), positions)
    mrank = market_ranks(picks, positions)

    actual_2025 = season_totals(GRADED_SEASON)[0]
    gate = draft_marker_gate(picks, actual_2025, positions)
    if gate["status"] != "ok":
        doc = {
            "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v3.py",
            "status": "no_markers",
            "why": ("the season-2025 league draft shows no top-{} pick with a "
                    "dead realized season (≤ {} pts) — cannot prove it is "
                    "preseason-frozen, so nothing is graded. Refusal is the "
                    "artifact.").format(MARKER_MAX_PICK, MARKER_DEAD_POINTS),
            "gate": gate,
        }
        OUT.write_text(json.dumps(doc, indent=1))
        return doc

    v3_2025 = build_v3(v2_2025, blend, mrank, curve, positions)

    prior_pts, prior_games = {}, {}
    for y in PRIOR_SEASONS:
        prior_pts[y], prior_games[y] = season_totals(y)
    v1_2025 = walk_forward(GRADED_SEASON, prior_pts, prior_games, positions, ages={})

    models = {"own_v3": v3_2025, "own_v2": v2_2025, "walk_forward_v1": v1_2025,
              "naive_prev": base["naive_prev"], "recency_blend": blend}
    arm = _grade_models(models, GRADED_SEASON, positions)
    verdict = promotion_verdict(arm["head_to_head_shared_population"])

    drafted_counts = {pos: sum(1 for p, (pp, _r) in mrank.items()
                               if pp == pos and p in v3_2025)
                      for pos in POSITIONS}

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v3.py",
        "_note": ("Own-model v3 (v2 + recency blend + league-draft market ensemble) "
                  "vs v2, v1 and both naive baselines, leak-free, under "
                  "model_accuracy_backtest.py's exact protocol. Structure, weights, "
                  "gates and evaluation were PREREGISTERED in own_model_v3.py and "
                  "committed before this artifact existed — commit order is the "
                  "proof. Promotion stays gated regardless of the verdict."),
        "preregistration": "own_model_v3.py module docstring (committed first)",
        "status": "graded",
        "graded_season": GRADED_SEASON,
        "prior_seasons": list(PRIOR_SEASONS),
        "information_set": ("weekly stores ≤2024; v2's 2023→2024 fit; the 0.7/0.3 "
                            "blend; the PRESEASON 2025 league draft (marker-gated); "
                            "the 2024 realized rank→points curve; board ages inside "
                            "v2's features only"),
        "marker_gate": gate,
        "ensemble_weights": {p: {"v2": w[0], "blend": w[1], "market": w[2]}
                             for p, w in ENSEMBLE_WEIGHTS.items()},
        "drafted_in_population": drafted_counts,
        "arm_2024": ("deliberately absent: ensemble weights were tuned on the "
                     "2023→2024 transition, so a 2024 grade of v3 is in-sample — "
                     "reporting one would manufacture a flattering second sample"),
        "features_unavailable_named": {
            "fp_archive_per_player": ("exp_fp_hist_proj committed only summary "
                                      "metrics; per-player archived FP projections "
                                      "are the strongest absent market feature"),
            "usage_trends": "weekly stores carry points only — no targets/carries/shares",
            "td_rate_regression": "no TD counts in the stores",
            "team_change_flags": "no team assignment history on committed disk",
            "pre_2023_stores": "training transition is ONE year — the binding limit",
        },
        "arm_2025": dict(arm, graded_season=GRADED_SEASON,
                         prior_seasons=list(PRIOR_SEASONS), mode="fitted+ensemble"),
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
            for m in ("own_v3", "own_v2", "naive_prev", "recency_blend"))
        print(f"  {pos} (n={row['n']}): {cells}")
    print(f"promotion bar clears: {doc['promotion_bar']['clears']}")


if __name__ == "__main__":
    main()
