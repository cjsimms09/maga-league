# TERRITORY: D
"""THE OPPONENT ARM IS A NULL, AND THE THING THAT MADE IT ONE IS PINNED.

DEFECT GUARDED: opponent_strength.py rules IN-SEASON ONLY at all four
positions, with QB the STRONGEST (+0.320 median persistence). The arm built on
that rating is QB's WORST result (-0.024, placebo p=0.95). A feasibility median
is not a licence to build, and the next lane to quote one as support should
trip over this file.

These guards keep three things honest:
  - the null itself, per position, against a bar preregistered with magnitudes;
  - the 3-of-3-seasons requirement, which is the ONLY thing standing between
    RB (+0.0147, placebo p=0.016) and a "clears";
  - the population, because a null over a silently shrunken set is not a null.

draft/audit/opponent_arm_row3_2026-08-18.md
Run: python -m pytest draft/tests/test_opponent_arm.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ARM = ROOT / "draft" / "backtest" / "opponent_arm.json"
FEASIBILITY = ROOT / "draft" / "backtest" / "opponent_strength.json"

POSITIONS = ("QB", "RB", "WR", "TE")


def _doc() -> dict:
    return json.loads(ARM.read_text())


def test_no_position_clears_the_preregistered_bar():
    doc = _doc()
    assert doc["clears_any"] == [], (
        f"{doc['clears_any']} now clears. The bar was pooled >= +0.010 AND 3 of "
        "3 seasons positive AND placebo p < 0.05, all fixed before the numbers "
        "existed — read draft/audit/opponent_arm_row3_2026-08-18.md before "
        "reporting it, and note four positions were tested."
    )
    assert doc["status"] == "graded"


def test_every_position_was_actually_measured():
    """CONTROL — a missing position would make 'nothing clears' vacuous."""
    pos = _doc()["positions"]
    assert set(pos) == set(POSITIONS), sorted(pos)
    for p, d in pos.items():
        assert len(d["leave_one_out"]) == 3, (p, d["leave_one_out"])
        assert all(n > 200 for n in d["n_rows"].values()), (p, d["n_rows"])


def test_the_population_was_counted_and_nothing_was_silently_dropped():
    """Absent stays absent — and here nothing was absent at all, which is what
    makes the null readable."""
    for season, c in _doc()["population"].items():
        assert c["kept"] == c["eligible"], (season, c)
        assert c["no_opponent"] == 0 and c["no_rating"] == 0, (season, c)


def test_RB_fails_only_on_the_seasons_requirement():
    """The load-bearing detail: RB beats its placebo and clears the magnitude.
    If the 3-of-3 rule is ever relaxed, RB becomes a 'result' — so the reason
    it failed is pinned, not just the fact."""
    rb = _doc()["positions"]["RB"]
    v = rb["verdict"]
    assert v["pooled_delta_mae"] >= 0.010, v
    assert rb["placebo"]["p_value"] < 0.05, rb["placebo"]
    assert v["seasons_positive"] < 3, v
    assert v["clears"] is False, v


def test_the_three_dead_positions_do_not_beat_their_own_placebo():
    """KNOWN-NEGATIVE CONTROL. QB, WR and TE must stay indistinguishable from a
    reassignment of their own ratings; if one starts beating it, the harness
    changed and every other number here needs re-reading."""
    pos = _doc()["positions"]
    for p in ("QB", "WR", "TE"):
        assert pos[p]["placebo"]["p_value"] > 0.05, (p, pos[p]["placebo"])


def test_the_mean_normalised_multiplier_did_not_buy_a_free_shrink():
    """Register DS3's prediction, checked. An uncentred multiplier bought
    +0.046 for nothing in register DS2; a centred one should not, and the
    placebo means are the evidence."""
    for p, d in _doc()["positions"].items():
        assert abs(d["placebo"]["mean"]) < 0.010, (
            f"{p}: placebo mean {d['placebo']['mean']} — a centred multiplier "
            "should not buy a free shrink. See register DS3."
        )


def test_the_arm_contradicts_the_feasibility_ranking_and_that_is_the_finding():
    """The headline, derived from both artifacts rather than asserted in prose:
    the position with the STRONGEST in-season persistence is the arm's WORST."""
    feas = json.loads(FEASIBILITY.read_text())["by_position"]
    arm = _doc()["positions"]
    best_persistence = max(POSITIONS, key=lambda p: feas[p]["in_season"]["median"])
    worst_arm = min(POSITIONS, key=lambda p: arm[p]["verdict"]["pooled_delta_mae"])
    assert best_persistence == worst_arm, (
        f"persistence-best is {best_persistence}, arm-worst is {worst_arm}. "
        "The audit doc's headline — that a rating which DESCRIBES the second "
        "half is not a multiplier that REDUCES error — rested on these being "
        "the same position. Re-read it."
    )


def test_the_multiplicity_is_disclosed():
    assert "4 positions" in _doc()["multiplicity"], _doc()["multiplicity"]
