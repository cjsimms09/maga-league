# TERRITORY: A
"""LEAK-FREE PROJECTION ACCURACY, GRADED FROM WHAT IS ON DISK — Mission 1 of the
model/learning audit (2026-08-15).

── WHAT CAN AND CANNOT BE GRADED, stated before any number ──────────────────

The board's authoritative projection (`proj_mean`) is Sleeper's 2026 stat-line
consensus scored under OUR rules. No pre-2026 Sleeper or FantasyPros projection
was ever archived (proj_series.json starts 2026-08-09), so a backtest of the
SOURCES against 2023-25 is UNMEASURABLE from this repo — and a retroactive
fetch leaks (exp33). What IS measurable offline, leak-free:

    · walk_forward — the proj_ownmodel algorithm, built strictly from the two
      prior seasons' realized points in the committed weekly stores
    · naive_prev — last season's realized total, unchanged
    · recency_blend — 0.7×last + 0.3×prior season totals (the config's own
      recency_weights, declared not fitted; a player missing the prior season
      uses last season alone)

graded against realized 2025 points under OUR scoring. 2025 is the ONLY graded
season: it is the only one whose two prior seasons are both on committed
stores (2023+2024). C's projection_error.py graded 2023-25 with network access
and reports ratio calibration; this module is the offline, per-position
MAE/bias/rank-correlation view, and its numbers should be read beside C's.

── PREREGISTRATION (fixed before results were computed) ─────────────────────

    graded season      2025, weeks 1-17 (league's last_scored_leg)
    population         players with ≥1 weekly row in the 2025 store AND a
                       forecast from the model under grade AND a position in
                       QB/RB/WR/TE per draft/data/player_positions.json (the
                       RECORD, not the live board — the live-board join defect
                       C measured in five tools is not repeated here)
    metrics            MAE (season points), mean signed bias (proj − actual),
                       Spearman rank correlation within position
    cells              per position; a cell below MIN_N = 10 reports
                       status "unmeasurable", never a number
    survivorship       players with a forecast and NO 2025 weekly row are
                       EXCLUDED and counted (same caveat as C's calibration:
                       this biases MAE optimistic; the count travels with
                       every cell)

K and DEF are structurally ungradeable here: the weekly stores carry no
kicking or team-defense stats (grade._WEEKLY_MAP is offense-only). Reported
as unmeasurable, not skipped silently.

Run: python draft/backtest/model_accuracy_backtest.py
Writes draft/backtest/model_accuracy_2025.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import walk_forward, spearman  # noqa: E402

GRADED_SEASON = 2025
PRIOR_SEASONS = (2023, 2024)
LAST_SCORED_WEEK = 17
POSITIONS = ("QB", "RB", "WR", "TE")
UNMEASURABLE_POSITIONS = ("K", "DEF")
MIN_N = 10
RECENCY_WEIGHTS = (0.7, 0.3)   # league_config.recency_weights, declared not fitted

OUT = HERE / "model_accuracy_2025.json"


def _store(season: int) -> dict:
    return json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())


def season_totals(season: int, last_week: int = LAST_SCORED_WEEK) -> tuple[dict, dict]:
    """({pid: points}, {pid: weeks_with_a_row}) for weeks 1..last_week.

    A week ROW is presence in that week's points dict — the store writes a row
    only for players nflverse scored that week, so presence is "was on a field",
    which is the games basis own_projections uses.
    """
    totals: dict[str, float] = {}
    games: dict[str, int] = {}
    for w in _store(season)["weeks"]:
        if w["week"] > last_week:
            continue
        for pid, v in w["points"].items():
            totals[pid] = totals.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return totals, games


def positions_record() -> dict:
    rec = json.loads((HERE.parent / "data" / "player_positions.json").read_text())
    return rec["positions"]


def build_models() -> dict[str, dict]:
    """{model_name: {pid: forecast}} — every model strictly from prior seasons."""
    prior_pts, prior_games = {}, {}
    for y in PRIOR_SEASONS:
        prior_pts[y], prior_games[y] = season_totals(y)
    pos = positions_record()

    own = walk_forward(GRADED_SEASON, prior_pts, prior_games, pos, ages={})

    y_last, y_prior = max(PRIOR_SEASONS), min(PRIOR_SEASONS)
    naive = dict(prior_pts[y_last])

    blend = {}
    w_last, w_prior = RECENCY_WEIGHTS
    for pid, last_total in prior_pts[y_last].items():
        prior_total = prior_pts[y_prior].get(pid)
        if prior_total is None:
            blend[pid] = last_total
        else:
            blend[pid] = w_last * last_total + w_prior * prior_total

    return {"walk_forward": own, "naive_prev": naive, "recency_blend": blend}


def grade(models: dict[str, dict] | None = None) -> dict:
    models = models or build_models()
    actual, _games = season_totals(GRADED_SEASON)
    pos = positions_record()

    out: dict = {
        "_territory": "TERRITORY: A — produced by draft/backtest/model_accuracy_backtest.py",
        "_note": ("Leak-free per-position accuracy of the offline-gradeable projection "
                  "models against realized {s} points under OUR scoring (weeks 1-{w}). "
                  "proj_mean's SOURCES (Sleeper/FantasyPros) are NOT here: no pre-2026 "
                  "projection was archived, so their past accuracy is unmeasurable — "
                  "proj_series.json (frozen daily since 2026-08-09) makes the 2026 "
                  "season the first gradeable one, in January 2027."
                  ).format(s=GRADED_SEASON, w=LAST_SCORED_WEEK),
        "graded_season": GRADED_SEASON,
        "prior_seasons": list(PRIOR_SEASONS),
        "weeks": [1, LAST_SCORED_WEEK],
        "min_n": MIN_N,
        "models": {},
        "unmeasurable": {
            "K": "weekly stores carry no kicking stats (grade._WEEKLY_MAP is offense-only)",
            "DEF": "weekly stores carry no team-defense stats",
            "proj_mean_sources": ("no archived pre-2026 Sleeper/FantasyPros projections; "
                                  "measurable for season 2026 from draft/data/proj_series.json "
                                  "in January 2027"),
        },
    }

    for name, proj in models.items():
        cells = {}
        skipped_no_row = 0
        for p in POSITIONS:
            pairs = []
            for pid, f in proj.items():
                if pos.get(pid) != p:
                    continue
                a = actual.get(pid)
                if a is None:
                    skipped_no_row += 1
                    continue
                pairs.append((float(f), float(a)))
            if len(pairs) < MIN_N:
                cells[p] = {"n": len(pairs), "status": "unmeasurable"}
                continue
            errs = [f - a for f, a in pairs]
            cells[p] = {
                "n": len(pairs),
                "status": "measured",
                "mae": round(sum(abs(e) for e in errs) / len(errs), 2),
                "bias": round(sum(errs) / len(errs), 2),
                "spearman": round(spearman([f for f, _ in pairs],
                                           [a for _, a in pairs]), 4),
            }
        out["models"][name] = {
            "cells": cells,
            "forecasts": len(proj),
            "excluded_no_weekly_row": skipped_no_row,
            "survivorship_note": ("players forecast but absent from every graded week are "
                                  "excluded and counted here — MAE is optimistic by an "
                                  "unmeasured amount, same caveat as C's calibration"),
        }

    # HEAD-TO-HEAD ON THE SHARED POPULATION. The per-model cells above grade
    # each model on its own coverage, so their MAEs are not directly comparable
    # (walk_forward projects players the naive baselines cannot). This block
    # compares all models on the INTERSECTION of their populations — the only
    # denominator on which "model A beats model B" is one quantity.
    shared = set.intersection(*(set(m) for m in models.values()))
    h2h: dict = {}
    for p in POSITIONS:
        pids = [pid for pid in shared if pos.get(pid) == p and actual.get(pid) is not None]
        if len(pids) < MIN_N:
            h2h[p] = {"n": len(pids), "status": "unmeasurable"}
            continue
        row = {"n": len(pids), "status": "measured"}
        for name, proj in models.items():
            errs = [proj[pid] - actual[pid] for pid in pids]
            row[name] = {
                "mae": round(sum(abs(e) for e in errs) / len(errs), 2),
                "spearman": round(spearman([proj[pid] for pid in pids],
                                           [actual[pid] for pid in pids]), 4),
            }
        h2h[p] = row
    out["head_to_head_shared_population"] = h2h
    return out


def main() -> None:
    result = grade()
    OUT.write_text(json.dumps(result, indent=1))
    print(f"wrote {OUT.name}")
    for name, m in result["models"].items():
        print(f"  {name}: " + "  ".join(
            f"{p}={c.get('mae', '—')}mae/{c.get('spearman', '—')}rho(n={c['n']})"
            for p, c in m["cells"].items()))


if __name__ == "__main__":
    main()
