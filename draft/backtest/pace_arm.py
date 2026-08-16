# TERRITORY: A
"""PACE ARM — §5 of the pace study. Does a tempo tilt beat `own_v6`, leak-free?

Preregistration: `draft/audit/pace_of_play_prereg_2026-08-16.md` §5, plus
AMENDMENT 1 in the same file, which was committed BEFORE this file existed and
which records (a) that §5's originally-registered feature
`neutral_plays_per_game` FAILED the persistence gate and is not run, (b) the
substitution of `neutral_sec_per_play`, (c) the tilt's SIGN, and (d) the
eight-way screen the survivor came out of. Commit order is the proof.

READ AMENDMENT 1 BEFORE READING ANY NUMBER THIS FILE PRODUCES. §4b already
established that `tempo(Y-1) -> plays(Y)` cannot be resolved from zero — with
no fantasy outcome read at all. This file is therefore a CONFIRMATION of a null
already found upstream, not the primary evidence, and a pass here would be a
candidate for chance rather than a finding.

THE ARM. `own_v6_pace{k}` is `own_v6` with ONE added term, built as the exact
structural analogue of the Vegas tilt that already sits at
`own_model_v5.py:482-483` and is the one component the start/sit work found
earning its keep:

    v *= 1 + k · (mean_sec − sec_prev[team]) / mean_sec        (RB/WR/TE only)

Inverted, per AMENDMENT 1: fewer seconds per play = faster = more snaps, so a
fast team gets a POSITIVE tilt. QB is untouched — in v6 the QB arm is v4's, and
the mandate names the volume-dependent positions.

NOTHING IN THE MODEL IS EDITED. `own_model_v5.py`, `own_model_v6.py`,
`own_model_v4.py`, `own_model_v3.py`, `own_model_v2.py`,
`fetch_component_stats.py`, `model_accuracy_backtest.py` are imported
READ-ONLY. The tilt is applied to the DICT v5's `comp_opinion` returns, which
is arithmetically identical to applying it inside v5's own loop because the
tilt is the last multiplicative step before a `max(0, ·)` clamp on a
non-negative quantity — asserted by `draft/tests/test_pace_arm.py`, not assumed.

THE SELECTION FOLD DOES NOT EXIST, AND THAT IS A DATA FACT, NOT A CHOICE —
recorded in AMENDMENT 2 of the prereg, committed before this file ran. §5
registered "`k` selected on the 2024 grade, applied unchanged to 2025". A 2024
grade needs `season_totals(2022)`, which reads
`nflverse_weekly_points_2022.json`. **Only 2023, 2024 and 2025 exist**, and
that store's name sits under C's `nflverse*` prefix, so manufacturing the
missing year is out of this lane. 2025 is the only gradable fold in the repo.

SO THE GRID IS GRADED WHOLE, AS A BEST-CASE UPPER BOUND, AND THAT IS THE MORE
CONSERVATIVE TEST. Every declared `k` is reported on 2025, and the verdict is
computed against the grid's BEST member by §5's own criterion. That member is
an IN-SAMPLE optimum and is labelled as one everywhere it appears — it is not
a leak-free win and must never be quoted as one. Its only legitimate use is the
direction it actually points: **if the best `k` in the declared grid cannot
clear §5's bar, no selection rule could have rescued it**, and the null is
stronger than the registered protocol would have produced. A pass, by contrast,
would prove nothing on its own — an in-sample maximum over five arms is exactly
what a chance result looks like — and would need the missing fold to mean
anything.

  · `k = -0.50` is the NEGATIVE CONTROL. If it wins, the instrument is
    measuring something that is not tempo and the arm is void, not inverted.
  · the POSITIVE CONTROL replaces the tempo term with the known-good Vegas
    tilt at the same magnitude. If that substitution does not move the cells,
    the harness cannot detect a real effect and no null it reports is evidence
    about pace (SESSION-A 13f).

ORDERING IS REPORTED SEPARATELY FROM MAE, because the start/sit work found the
two can rank arms differently and ordering is what a draft board consumes:
per position, Spearman on the full cell, Spearman restricted to the top 36 by
our own projection, and the count of adjacent-rank pairs that flip against
`own_v6`.

Run: python draft/backtest/pace_arm.py
Writes draft/backtest/pace_arm.json.
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
    POSITIONS, _assert_no_leak, _baselines, _grade_models, board_ages,
    features_for, fit_transition, predict,
)
from own_model_v3 import (  # noqa: E402
    build_v3, draft_marker_gate, league_draft_picks, market_ranks, rank_curve,
)
from own_model_v4 import (  # noqa: E402
    build_v4, qb_active_games, qb_availability_correction, weekly_points,
)
import fetch_component_stats as FCS  # noqa: E402
import fetch_team_pace as TP  # noqa: E402
import own_model_v5 as V5  # noqa: E402
from own_model_v6 import build_v6  # noqa: E402
from pace_study import spearman  # noqa: E402

OUT = HERE / "pace_arm.json"

#: AMENDMENT 1 — the metric that passed the gate. NOT the one §5 first named.
PACE_METRIC = "neutral_sec_per_play"

#: Prereg §5 — the grid, declared, plus the negative control.
K_GRID = (0.25, 0.50, 0.75, 1.00)
K_NEGATIVE_CONTROL = -0.50

#: Prereg §5 — the tilt touches the volume-dependent positions only.
TILTED = ("RB", "WR", "TE")

#: Prereg §5 — the draftable range for the ordering metric.
TOP_N = 36

#: The ONLY gradable fold in this repo — see AMENDMENT 2. A 2024 fold needs
#: nflverse_weekly_points_2022.json, which does not exist and is C-named.
TEST_FOLD = (2025, (2023, 2024))

#: The fold §5 registered and that the data cannot supply. Kept as a named
#: constant rather than deleted, so the gap is visible in the code and not only
#: in prose — and so it becomes runnable the day 2022 lands.
SELECT_FOLD_UNAVAILABLE = (2024, (2022, 2023))


def pace_tilt(comp: dict, teams: dict, pace_prev: dict, positions: dict,
              k: float, tilted=TILTED) -> dict:
    """v5's component opinion with the tempo tilt applied.

    Applying it here rather than inside v5's loop is arithmetically identical:
    v5's tilt is the last multiplicative step before `max(0.0, v)`, and the
    quantity is non-negative, so an extra non-negative multiplier commutes
    with the clamp. Pinned by test, not asserted.

    A TEAM WITH NO MEASURED TEMPO IS LEFT UNTILTED — absent is not zero, and a
    zeroed tilt would read as 'this offence played at exactly league-average
    tempo', which is a claim.
    """
    if not pace_prev:
        return dict(comp)
    mean_sec = sum(pace_prev.values()) / len(pace_prev)
    out = {}
    for pid, v in comp.items():
        pos = positions.get(pid)
        t = teams.get(pid)
        if pos in tilted and t in pace_prev and mean_sec:
            # INVERTED, per AMENDMENT 1: fewer seconds per play = faster =
            # more snaps, so a fast team gets a POSITIVE tilt.
            v = v * (1.0 + k * (mean_sec - pace_prev[t]) / mean_sec)
        out[pid] = max(0.0, v)
    return out


def vegas_tilt_control(comp: dict, teams: dict, imp: dict, positions: dict,
                       k: float, tilted=TILTED) -> dict:
    """THE POSITIVE CONTROL — the identical harness with the known-good Vegas
    signal in the tempo term's place. Not inverted: more implied points is
    already the good direction."""
    if not imp:
        return dict(comp)
    mean_imp = sum(imp.values()) / len(imp)
    out = {}
    for pid, v in comp.items():
        pos = positions.get(pid)
        t = teams.get(pid)
        if pos in tilted and t in imp and mean_imp:
            v = v * (1.0 + k * (imp[t] - mean_imp) / mean_imp)
        out[pid] = max(0.0, v)
    return out


def _fold(graded: int, priors: tuple, positions: dict, ages: dict) -> dict:
    """Everything `own_v6` needs for one fold, computed once and reused by
    every arm so the arms differ ONLY in the tilt."""
    _assert_no_leak(priors, graded)
    y1 = max(priors)
    feat_fit = features_for(y1, (min(priors),), positions, ages)
    fits = fit_transition(feat_fit, season_totals(y1)[0])
    feat = features_for(graded, priors, positions, ages)
    v2 = predict(feat, fits)

    base = _baselines(graded, priors)
    blend = base["recency_blend"]
    picks = league_draft_picks(graded)
    gate = draft_marker_gate(picks, season_totals(graded)[0], positions)
    curve = rank_curve(y1, positions)
    mrank = market_ranks(picks, positions)
    v3 = build_v3(v2, blend, mrank, curve, positions)
    corr, _mu = qb_availability_correction(qb_active_games(weekly_points(y1),
                                                          positions))
    v4 = build_v4(v3, blend, corr, positions)

    imp = FCS.implied_team_totals(graded, 1, 1)
    comp = V5.comp_opinion(graded, priors, positions, ages, imp)
    teams = {pid: f["team"] for pid, f in V5.season_profiles(y1)[0].items()}

    prior_pts, prior_games = {}, {}
    for y in priors:
        prior_pts[y], prior_games[y] = season_totals(y)
    v1 = walk_forward(graded, prior_pts, prior_games, positions, ages={})

    return {"graded": graded, "priors": priors, "gate": gate, "v2": v2,
            "v3": v3, "v4": v4, "blend": blend, "corr": corr, "mrank": mrank,
            "curve": curve, "comp": comp, "teams": teams, "imp": imp,
            "v1": v1, "naive": base["naive_prev"],
            "pace_prev": TP.team_pace(y1, PACE_METRIC)}


def _arm_from_comp(f: dict, comp: dict, positions: dict) -> dict:
    v5 = V5.build_v5(f["v3"], comp, f["blend"], f["corr"], f["mrank"],
                     f["curve"], positions)
    return build_v6(f["v4"], v5, positions)


def _ordering(pred: dict, base_pred: dict, actual: dict, positions: dict,
              top_n=TOP_N) -> dict:
    """Ordering, reported SEPARATELY from MAE. Two questions MAE cannot
    answer: does the order improve where a draft actually happens, and how
    many adjacent pairs did this arm reorder at all?"""
    out = {}
    for pos in POSITIONS:
        ids = [p for p in pred if positions.get(p) == pos and p in actual
               and p in base_pred]
        if len(ids) < 5:
            out[pos] = {"status": "unmeasurable", "n": len(ids)}
            continue
        top = sorted(ids, key=lambda p: -base_pred[p])[:top_n]
        flips = 0
        order = sorted(ids, key=lambda p: -base_pred[p])
        for a, b in zip(order, order[1:]):
            if pred[a] < pred[b]:
                flips += 1
        out[pos] = {
            "status": "measured", "n": len(ids), "n_top": len(top),
            "spearman_top": (None if len(top) < 5 else
                             round(spearman([pred[p] for p in top],
                                            [actual[p] for p in top]), 4)),
            "spearman_top_base": (None if len(top) < 5 else
                                  round(spearman([base_pred[p] for p in top],
                                                 [actual[p] for p in top]), 4)),
            "adjacent_pairs_flipped_vs_own_v6": flips,
            "adjacent_pairs": len(order) - 1,
        }
    return out


def grade_fold(f: dict, positions: dict, ks=K_GRID) -> dict:
    """Every arm on one fold, graded on `model_accuracy_v6.json`'s own cells."""
    base = _arm_from_comp(f, f["comp"], positions)
    # ⚠ THE FULL v6 MODEL SET IS CARRIED, INCLUDING THE ARMS THIS STUDY DOES
    # NOT COMPARE AGAINST. `_grade_models` intersects coverage across EVERY
    # model handed to it, so dropping own_v2..own_v5 silently WIDENS the shared
    # population — measured: WR went 150 -> 151 and own_v6's own WR cell moved
    # 33.63 -> 33.44 / 0.7634 -> 0.7663. The baseline would then not have been
    # the committed one, and every delta below would have been computed against
    # a number that appears nowhere in the repo. Reproduction is pinned by test.
    v5 = V5.build_v5(f["v3"], f["comp"], f["blend"], f["corr"], f["mrank"],
                     f["curve"], positions)
    models = {"own_v6": base, "own_v5": v5, "own_v4": f["v4"],
              "own_v3": f["v3"], "own_v2": f["v2"]}
    for k in list(ks) + [K_NEGATIVE_CONTROL]:
        models[f"own_v6_pace{k:+.2f}"] = _arm_from_comp(
            f, pace_tilt(f["comp"], f["teams"], f["pace_prev"], positions, k),
            positions)
    # POSITIVE CONTROL — the known-good signal through the identical pipe.
    models["own_v6_vegascontrol+0.50"] = _arm_from_comp(
        f, vegas_tilt_control(f["comp"], f["teams"], f["imp"], positions, 0.50),
        positions)
    models["naive_prev"] = f["naive"]
    models["recency_blend"] = f["blend"]
    models["walk_forward_v1"] = f["v1"]

    arm = _grade_models(models, f["graded"], positions)
    h2h = arm["head_to_head_shared_population"]
    actual = season_totals(f["graded"])[0]
    ordering = {name: _ordering(pred, base, actual, positions)
                for name, pred in models.items() if name.startswith("own_v6")}
    return {"graded_season": f["graded"], "prior_seasons": list(f["priors"]),
            "pace_from": max(f["priors"]), "marker_gate": f["gate"],
            "teams_with_tempo": len(f["pace_prev"]),
            "head_to_head_shared_population": h2h, "ordering": ordering,
            "_models": models}


def select_k(h2h: dict, ks=K_GRID) -> dict:
    """Prereg §5's criterion — minimum summed MAE over RB/WR/TE, ties on mean
    Spearman — applied to the grid.

    ⚠ ON THE TEST FOLD THIS IS AN IN-SAMPLE OPTIMUM, NOT A SELECTION. The fold
    §5 registered for selection does not exist (AMENDMENT 2). The result is a
    BEST-CASE upper bound: useful only if it FAILS, because a failure means no
    selection rule could have rescued the arm. The negative control is NOT
    eligible — it is a check, not a candidate.
    """
    rows = []
    for k in ks:
        name = f"own_v6_pace{k:+.2f}"
        cells = [h2h[p][name] for p in TILTED
                 if h2h.get(p, {}).get("status") == "measured"]
        if len(cells) != len(TILTED):
            continue
        rows.append({"k": k, "name": name,
                     "mae_sum": round(sum(c["mae"] for c in cells), 4),
                     "spearman_mean": round(sum(c["spearman"] for c in cells)
                                            / len(cells), 4)})
    if not rows:
        return {"status": "unmeasurable"}
    rows.sort(key=lambda r: (r["mae_sum"], -r["spearman_mean"]))
    return {"status": "selected", "chosen_k": rows[0]["k"],
            "chosen": rows[0]["name"], "candidates": rows}


def verdict(h2h: dict, chosen: str) -> dict:
    """Prereg §5's bar, unweakened: improves BOTH metrics at >= 2 of RB/WR/TE
    and degrades NEITHER metric at ANY of the three."""
    per = {}
    improved_both, degraded_any = 0, []
    for pos in TILTED:
        row = h2h.get(pos) or {}
        if row.get("status") != "measured":
            per[pos] = {"status": "unmeasurable"}
            continue
        a, b = row[chosen], row["own_v6"]
        dm = round(b["mae"] - a["mae"], 4)          # positive = pace better
        ds = round(a["spearman"] - b["spearman"], 4)
        per[pos] = {"mae_own_v6": b["mae"], "mae_pace": a["mae"],
                    "mae_gain": dm, "spearman_own_v6": b["spearman"],
                    "spearman_pace": a["spearman"], "spearman_gain": ds}
        if dm > 0 and ds > 0:
            improved_both += 1
        if dm < 0:
            degraded_any.append(f"{pos} MAE")
        if ds < 0:
            degraded_any.append(f"{pos} Spearman")
    clears = improved_both >= 2 and not degraded_any
    return {"bar": ("improves BOTH MAE and Spearman at >=2 of RB/WR/TE and "
                    "degrades NEITHER metric at ANY of the three"),
            "positions_improving_both": improved_both,
            "degraded": degraded_any, "clears": clears, "per_position": per}


# ── §6 where would it actually matter ────────────────────────────────────────

def movers(base: dict, arm: dict, positions: dict, teams: dict,
           pace_prev: dict, top_n: int = 60, show: int = 15) -> dict:
    """§6 — which players move, by how much, and are they draftable?

    A pace effect that only reorders players nobody drafts is not useful, and
    this section exists to say so in numbers rather than in a shrug. Draftable
    is approximated by rank within position on OUR OWN projection, which is
    what the board consumes; ADP is a market quantity and the 2025 board is not
    the one this study can read.
    """
    out = {}
    names = {}
    try:
        import json as _j
        board = _j.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
        for p in board.get("players") or []:
            pid = p.get("player_id") or p.get("id")
            if pid is not None and p.get("name"):
                names[str(pid)] = p["name"]
    except Exception:
        names = {}          # a missing name is a missing name, never a fake id
    for pos in TILTED:
        ids = [p for p in base if positions.get(p) == pos]
        ranked = sorted(ids, key=lambda p: -base[p])[:top_n]
        rows = []
        for p in ranked:
            b, a = base[p], arm.get(p, base[p])
            rows.append({
                "player_id": p, "name": names.get(p),
                "team_prev": teams.get(p),
                "tempo_prev": (round(pace_prev[teams[p]], 2)
                               if teams.get(p) in pace_prev else None),
                "own_v6": round(b, 2), "with_pace": round(a, 2),
                "delta": round(a - b, 2),
                "delta_pct": (round(100.0 * (a - b) / b, 2) if b else None),
                "rank_own_v6": ranked.index(p) + 1,
            })
        by_size = sorted(rows, key=lambda r: -abs(r["delta"]))
        ranks_before = [r["player_id"] for r in
                        sorted(rows, key=lambda r: -r["own_v6"])]
        ranks_after = [r["player_id"] for r in
                       sorted(rows, key=lambda r: -r["with_pace"])]
        moved = sum(1 for i, p in enumerate(ranks_before)
                    if ranks_after.index(p) != i)
        out[pos] = {
            "top_n": top_n,
            "max_abs_delta": by_size[0]["delta"] if by_size else None,
            "max_abs_delta_pct": by_size[0]["delta_pct"] if by_size else None,
            "median_abs_delta": (round(sorted(abs(r["delta"]) for r in rows)
                                       [len(rows) // 2], 2) if rows else None),
            "players_changing_rank_within_top_n": moved,
            "largest_movers": by_size[:show],
        }
    return out


def run() -> dict:
    positions = positions_record()
    ages = board_ages()

    test_fold = _fold(*TEST_FOLD, positions, ages)
    test = grade_fold(test_fold, positions)
    choice = select_k(test["head_to_head_shared_population"])

    chosen = choice.get("chosen")
    fold_models = test.pop("_models")
    moved = movers(fold_models["own_v6"], fold_models.get(chosen, {}), positions,
                   test_fold["teams"], test_fold["pace_prev"]) if chosen else {}
    v = verdict(test["head_to_head_shared_population"], chosen) if chosen else {
        "clears": False, "bar": "no k could be selected"}

    h2h_t = test["head_to_head_shared_population"]
    neg = f"own_v6_pace{K_NEGATIVE_CONTROL:+.2f}"
    controls = {}
    for pos in TILTED:
        row = h2h_t.get(pos) or {}
        if row.get("status") != "measured":
            continue
        controls[pos] = {
            "own_v6": row["own_v6"],
            "negative_control": row[neg],
            "positive_control_vegas": row["own_v6_vegascontrol+0.50"],
        }
    pc_moved = any(
        abs(c["positive_control_vegas"]["mae"] - c["own_v6"]["mae"]) > 0.01
        or abs(c["positive_control_vegas"]["spearman"] - c["own_v6"]["spearman"]) > 1e-4
        for c in controls.values())
    # THE NEGATIVE CONTROL IS THE ARM WITH THE SIGN REVERSED — slow teams get
    # the boost. Anywhere it beats own_v6 on BOTH metrics while the registered
    # sign does not, the arm is not measuring tempo and is VOID at that
    # position, not inverted (prereg §5, and AMENDMENT 1 registered the sign in
    # advance precisely so this could be checked rather than rationalised).
    neg_wins = []
    for pos, c in controls.items():
        if (c["negative_control"]["mae"] < c["own_v6"]["mae"]
                and c["negative_control"]["spearman"] > c["own_v6"]["spearman"]):
            neg_wins.append(pos)

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/pace_arm.py",
        "_note": ("§5 of the pace study. READ AMENDMENT 1 of the prereg FIRST: "
                  "§5's originally-registered feature failed the persistence "
                  "gate, this arm runs the survivor of an eight-way screen, and "
                  "§4b already showed tempo(Y-1)->plays(Y) cannot be resolved "
                  "from zero WITHOUT reading any fantasy outcome. This file is a "
                  "confirmation of that null, not the primary evidence."),
        "preregistration": ("draft/audit/pace_of_play_prereg_2026-08-16.md §5 "
                            "+ AMENDMENT 1, both committed before this file"),
        "pace_metric": PACE_METRIC,
        "tilt": ("v *= 1 + k*(mean_sec - sec_prev[team])/mean_sec, RB/WR/TE "
                 "only — the structural analogue of own_model_v5.py:482-483's "
                 "Vegas tilt, INVERTED because fewer seconds per play is faster"),
        "leak_protocol": {
            "registered_selection_fold": {
                "graded": SELECT_FOLD_UNAVAILABLE[0],
                "priors": list(SELECT_FOLD_UNAVAILABLE[1]),
                "status": "UNAVAILABLE",
                "why": ("a %d grade needs season_totals(%d), which reads "
                        "nflverse_weekly_points_%d.json. Only 2023, 2024 and "
                        "2025 exist, and that store sits under C's nflverse* "
                        "prefix, so manufacturing the missing year is out of "
                        "this lane. 2025 is the only gradable fold in the repo."
                        % (SELECT_FOLD_UNAVAILABLE[0],
                           min(SELECT_FOLD_UNAVAILABLE[1]),
                           min(SELECT_FOLD_UNAVAILABLE[1]))),
            },
            "graded_fold": {"graded": TEST_FOLD[0],
                            "priors": list(TEST_FOLD[1]),
                            "tempo_from": max(TEST_FOLD[1])},
            "features_are_leak_free": ("every feature is from %s; tempo is from "
                                       "%d; no season-%d game is read by any "
                                       "predictor — own_model_v2._assert_no_leak "
                                       "enforces it and would raise"
                                       % (list(TEST_FOLD[1]), max(TEST_FOLD[1]),
                                          TEST_FOLD[0])),
            "k_IS_NOT_leak_free": ("⚠ k is an IN-SAMPLE optimum over the "
                                   "declared grid on the graded season, NOT a "
                                   "selected constant. It is a BEST-CASE upper "
                                   "bound and is legitimate evidence only if it "
                                   "FAILS: a failure means no selection rule "
                                   "could have rescued the arm. A pass would "
                                   "prove nothing without the missing fold."),
        },
        "k_selection": choice,
        "test_fold": test,
        "verdict": v,
        "movers": moved,
        "controls": {
            "negative_control_k": K_NEGATIVE_CONTROL,
            "per_position": controls,
            "negative_control_beats_own_v6_on_both_metrics_at": neg_wins,
            "negative_control_note": ("the registered sign says FAST teams get "
                                      "the boost. Wherever the REVERSED sign "
                                      "beats own_v6 on both metrics and the "
                                      "registered sign does not, the arm is "
                                      "void at that position — it is fitting "
                                      "something that is not tempo."),
            "positive_control_moved_the_cells": pc_moved,
            "positive_control_limitation": (
                "v5 ALREADY carries the Vegas tilt at vg=0.50 for RB and WR, so "
                "at those two positions this control is a DOUBLED tilt, not an "
                "added one — it proves the pipe transmits, which is what 13f "
                "asks, but it is not 'a known-good signal added to a model "
                "lacking it'. TE is the clean case: v5 chose vg=0.00 there, so "
                "the control genuinely ADDS the Vegas tilt at TE — and it makes "
                "TE worse on both metrics, independently reproducing v5's own "
                "preregistered choice of vg=0.00 at TE. The harness works."),
            "positive_control_note": ("SESSION-A 13f — if the KNOWN-GOOD Vegas "
                                      "signal through this identical pipe does "
                                      "not move the cells, the harness cannot "
                                      "detect a real effect and no null it "
                                      "reports is evidence about pace"),
        },
        "multiplicity": ("eight pace metrics were screened for persistence; two "
                         "cleared; one is graded here. Every number above is the "
                         "survivor of that screen. Separately, 2025 has now been "
                         "read by v4, v5, v6 and this arm — a fourth read of the "
                         "same season."),
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    print(f"\nBEST-CASE k over the declared grid (IN-SAMPLE, not selected — "
          f"the {SELECT_FOLD_UNAVAILABLE[0]} fold does not exist): "
          f"{doc['k_selection'].get('chosen')}")
    for r in doc["k_selection"].get("candidates", []):
        print(f"   k={r['k']:+.2f}  mae_sum={r['mae_sum']}  rho_mean={r['spearman_mean']}")
    print(f"\n{TEST_FOLD[0]} FOLD — own_v6 vs {doc['k_selection'].get('chosen')}")
    for pos, p in doc["verdict"]["per_position"].items():
        if p.get("status") == "unmeasurable":
            print(f"  {pos}: unmeasurable")
            continue
        print(f"  {pos}: MAE {p['mae_own_v6']} -> {p['mae_pace']} "
              f"(gain {p['mae_gain']:+.4f})   rho {p['spearman_own_v6']} -> "
              f"{p['spearman_pace']} (gain {p['spearman_gain']:+.4f})")
    print(f"\nBAR CLEARS: {doc['verdict']['clears']}   "
          f"degraded: {doc['verdict']['degraded'] or 'none'}")
    print(f"positive control moved the cells: "
          f"{doc['controls']['positive_control_moved_the_cells']}")
    neg_at = doc["controls"]["negative_control_beats_own_v6_on_both_metrics_at"]
    print("NEGATIVE control (sign reversed) beats own_v6 on both metrics at: "
          + (", ".join(neg_at) if neg_at else "nowhere"))
    print("\nORDERING (top-%d by own projection), test fold:" % TOP_N)
    ordering = doc["test_fold"]["ordering"]
    chosen = doc["k_selection"].get("chosen")
    for pos in TILTED:
        a = ordering.get(chosen, {}).get(pos, {})
        if a.get("status") != "measured":
            continue
        print(f"  {pos}: rho_top own_v6={a['spearman_top_base']} -> "
              f"pace={a['spearman_top']}   adjacent flips "
              f"{a['adjacent_pairs_flipped_vs_own_v6']}/{a['adjacent_pairs']}")
    print("\n§6 MOVERS (top-60 by own_v6 projection, at the best-case k):")
    for pos, m in doc.get("movers", {}).items():
        print(f"  {pos}: max |delta| {m['max_abs_delta']} pts "
              f"({m['max_abs_delta_pct']}%), median |delta| {m['median_abs_delta']}, "
              f"{m['players_changing_rank_within_top_n']}/{m['top_n']} change rank")
        for r in m["largest_movers"][:3]:
            print(f"      #{r['rank_own_v6']:>2} {str(r['name'] or r['player_id']):22s} "
                  f"{r['team_prev']} tempo {r['tempo_prev']}  "
                  f"{r['own_v6']} -> {r['with_pace']} ({r['delta']:+.2f})")


if __name__ == "__main__":
    main()
