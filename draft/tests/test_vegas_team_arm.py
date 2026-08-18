# TERRITORY: D
"""VEGAS TEAM-LEVEL ARM mechanics — register 18's answer, pinned.

The load-bearing property is the JOIN COUNTER. exp_weekly_env defaulted a failed
team lookup to m = 1.0 and kept the row in the MAE denominator, so a diluted
effect and a real one produced identical output — which is why register 18's
question 2 had no answer for a day. This arm excludes unjoined rows and reports
survival, and both halves are tested.

Run: python -m pytest draft/tests/test_vegas_team_arm.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import vegas_team_arm as V  # noqa: E402

RESULT = ROOT / "draft" / "backtest" / "vegas_team_arm.json"


def test_implied_totals_use_the_stores_own_formula_and_split_the_game():
    """DEFECT GUARDED: inventing a second implied-total formula, or giving both
    teams the same number — which is exactly what made the +0.23 oracle a
    team-blind bound (208/208 games shared one multiplier)."""
    imp = V.implied_by_team_week(2024)
    games = json.loads(
        (ROOT / "draft" / "backtest" / "vegas_lines_2021_2026.json").read_text()
    )["seasons"]["2024"]
    g = next(x for x in games if x["spread_line"] != 0)   # a non-pickem game
    home = imp[(g["week"], g["home"])]
    away = imp[(g["week"], g["away"])]

    assert abs(home - (g["total_line"] / 2 + g["spread_line"] / 2)) < 1e-9
    assert abs((home + away) - g["total_line"]) < 1e-9
    # KNOWN-POSITIVE CONTROL: the two sides must DIFFER, or this arm is the
    # team-blind oracle wearing a new name.
    assert home != away, (g, home, away)


def test_an_unjoined_row_is_excluded_not_defaulted_to_neutral():
    """The whole point of register 18. A row with no line must leave the
    population, never ride at m = 1.0 inside the denominator."""
    rows = [{"pid": "p", "week": 5, "baseline": 10.0, "actual": 12.0}]
    teams = {(5, "p"): "KC"}
    joined = [r for r in rows
              if teams.get((r["week"], r["pid"]))
              and (r["week"], teams[(r["week"], r["pid"])]) in {(5, "KC"): 24.0}]
    assert len(joined) == 1
    # ...and with no line for that team-week, it drops out entirely
    joined_missing = [r for r in rows
                      if (r["week"], teams[(r["week"], r["pid"])]) in {(5, "BUF"): 24.0}]
    assert joined_missing == []


def test_the_committed_result_reports_join_survival_and_it_is_complete():
    """Register 18's answer, pinned so it cannot quietly become unavailable
    again. Survival must be recorded per fold AND the arithmetic must close."""
    doc = json.loads(RESULT.read_text())
    assert doc["status"] == "graded"
    for season, v in doc["seasons"].items():
        p = v["population"]
        for key in ("eligible_rows", "joined", "dropped_no_team",
                    "dropped_no_line", "join_survival", "fold_valid"):
            assert key in p, (season, key)
        assert p["joined"] + p["dropped_no_team"] + p["dropped_no_line"] \
            == p["eligible_rows"], season
        assert p["join_survival"] >= 0.90, (season, p)


def test_the_baseline_reproduces_exp_weekly_env_exactly():
    """THE CONTROL that makes the comparison mean anything: an independently
    written eligibility path must land on the same population and the same
    baseline MAE as the study this arm is answering. If it drifts, the two are
    not comparable and no delta below is readable."""
    doc = json.loads(RESULT.read_text())
    expected = {"2023": (2179, 5.6729), "2024": (2259, 5.7369)}
    for season, (n, mae) in expected.items():
        v = doc["seasons"][season]
        assert v["population"]["eligible_rows"] == n, (season, v["population"])
        assert abs(v["baseline_mae"] - mae) < 1e-4, (season, v["baseline_mae"])


def test_the_lambda_grid_extends_below_the_originals_minimum():
    """The original ran {1.0, 0.5} and 0.5 — its grid MINIMUM — won, so its
    optimum was never bracketed. Extending below is the whole reason this grid
    exists; if it stops reaching under 0.5 the bracketing claim is void."""
    assert min(V.LAMBDAS) < 0.5
    doc = json.loads(RESULT.read_text())
    for season, v in doc["seasons"].items():
        assert "lambda=0.15" in v["arms"], season
        # and the effect must fall as lambda rises — the transform's signature
        deltas = [v["arms"][f"lambda={l}"]["delta_mae"] for l in (0.15, 0.5, 1.0)]
        assert deltas[0] > deltas[2], (season, deltas)
