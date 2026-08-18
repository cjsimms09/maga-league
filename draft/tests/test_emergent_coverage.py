# TERRITORY: D
"""Q17'S LEVEL IS THE FINDING; ITS TRAJECTORY IS NOT. BOTH ARE PINNED.

DEFECT GUARDED: I nearly reported "the blind spot grows through the season"
from a week-17-minus-week-1 delta (+6.9 / +7.0 / +16.7). It is a two-point
comparison of two noisy weeks -- the series ranges 5.6%-23.6% -- and the slope
beats its shuffle null in only 1 of 3 seasons, at p=0.042 across three tests.
Week 17 is elevated in every season, which is also what late-season starter
rest looks like.

So these guards do two jobs: keep the LEVEL honest (12.9%, material band, with
its gate), and stop the DELTA from ever being promoted to a trajectory claim.

Pure logic over one committed artifact, inside the publication gate.

draft/audit/emergent_coverage_q17_2026-08-18.md
Run: python -m pytest draft/tests/test_emergent_coverage.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "draft" / "backtest" / "emergent_coverage.json"

MIN_SEASONS = 3
MIN_SEASON_WEEKS = 17


def _doc() -> dict:
    return json.loads(ARTIFACT.read_text())


def test_the_perfect_foresight_gate_passed():
    """VOIDING control. Under perfect foresight nobody is invisible, so any
    nonzero share means the join lost rows and the whole number is worthless."""
    g = _doc()["gate_control"]
    assert g["passed"], g["violations"]
    assert g["n_violations"] == 0, g
    assert _doc()["status"] == "graded"


def test_the_control_actually_covered_every_season_week():
    """CONTROL ON THE CONTROL -- a gate that inspected nothing also passes."""
    doc = _doc()
    assert len(doc["seasons"]) >= MIN_SEASONS, list(doc["seasons"])
    for season, arms in doc["seasons"].items():
        weeks = arms["CONTROL_perfect_foresight"]["by_week"]
        assert len(weeks) >= MIN_SEASON_WEEKS, (season, len(weeks))
        for w, d in weeks.items():
            assert d["startable"]["share"] == 0, (season, w, d)
            assert d["all_points"]["share"] == 0, (season, w, d)


def test_the_level_is_material_and_consistent_across_seasons():
    """The finding. A band change is a real event and must be read, not
    absorbed -- the bar was preregistered with magnitudes."""
    doc = _doc()
    primary = doc["headline"]["pooled_across_seasons"]
    assert 0.05 <= primary <= 0.15, (
        f"the invisible share is now {primary:.1%}, outside the MATERIAL band. "
        "That is a band change and the preregistered reading changes with it — "
        "see draft/audit/emergent_coverage_q17_2026-08-18.md."
    )
    assert "MATERIAL" in doc["headline"]["band"], doc["headline"]["band"]
    per = [a["any_prior"]["pooled"]["startable_share"] for a in doc["seasons"].values()]
    assert max(per) - min(per) < 0.06, (
        f"season-to-season spread is now {max(per) - min(per):.1%}; the level's "
        "credibility rests on it being stable across seasons")


def test_the_generous_arm_is_the_primary_and_the_strict_arm_is_worse():
    """any_prior is the LOWER bound by construction. If prior_20 ever came out
    lower, the definitions are the wrong way round and the 'even the lower
    bound is material' argument collapses."""
    h = _doc()["headline"]
    assert h["sensitivity_prior_20_startable"] > h["pooled_across_seasons"], h
    assert "any_prior" in h["primary_metric"], h


def test_the_trend_is_reported_as_not_established():
    """The guard that matters most here: the delta must never become the read."""
    doc = _doc()
    assert "NOT ESTABLISHED" in doc["headline"]["trend_verdict"], (
        "the trend verdict changed. Before claiming the blind spot grows within "
        "a season, check the SLOPE against its shuffle null in every season and "
        "re-fit without weeks 16-17 — week 17 is elevated in all three seasons "
        "and late-season starter rest produces the same shape."
    )
    sig = [a["any_prior"]["trajectory"]["slope_beats_null"]
           for a in doc["seasons"].values()]
    assert sum(1 for s in sig if s) < 2, sig


def test_the_preregistered_delta_still_ships_with_its_caveat_attached():
    """It was preregistered, so it is emitted. It must never travel bare."""
    for season, arms in _doc()["seasons"].items():
        t = arms["any_prior"]["trajectory"]
        assert t["delta"] is not None, season
        assert t["_delta_caveat"], season
        assert t["slope_p_value"] is not None, season
        assert t["slope_pp_per_week_weeks_1_15"] is not None, (
            f"{season}: the weeks-1-15 refit is missing — it is what separates "
            "in-season emergence from late-season starter rest")


def test_no_position_is_consistently_the_worst():
    """The instability rules out a cheap per-position patch, and the audit doc
    rests on it. If one position IS consistently worst, that is a new and more
    actionable finding, not a detail."""
    doc = _doc()
    worst = [
        max(a["any_prior"]["pooled"]["startable_by_position"].items(), key=lambda kv: kv[1])[0]
        for a in doc["seasons"].values()
    ]
    assert len(set(worst)) > 1, (
        f"the same position is worst in every season ({worst[0]}) — that is a "
        "structural per-position hole and changes the recommended fix.")
