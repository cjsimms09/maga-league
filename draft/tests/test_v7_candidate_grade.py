# TERRITORY: A
"""The V7 C1/C3 grading study — its leak guards and decision rule, pinned.

The artifact's regeneration parity is covered by artifact_registry.json
(entry pattern), so nothing here re-tests that. What IS here: the two
constraints that make the grade mean anything (no 2025 information reaches
either fit), and the decision rule's both arms.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import v7_candidate_grade as VG  # noqa: E402


def test_the_age_fit_cannot_see_2025():
    """The committed age_curve_2026.json used the 2024->25 transition; this
    study must not, or the 2025 grade is the free-shrink class."""
    assert all(y2 <= 2024 for _y1, y2 in VG.AGE_FIT_TRANSITIONS)
    assert (2024, 2025) not in VG.AGE_FIT_TRANSITIONS


def test_the_recency_weights_exclude_the_graded_triple():
    doc = json.loads((BT / "recency_weight_fit.json").read_text())
    w = VG.c3_weights_leakfree()
    for pos, cell in doc["curves"].items():
        clean = [v["best_w"] for k, v in cell["per_triple"].items()
                 if not k.endswith("->2025")]
        assert abs(w[pos] - sum(clean) / len(clean)) < 1e-6, pos
        # and the ->2025 triple really exists to be excluded, or this test
        # is guarding against nothing
        assert any(k.endswith("->2025") for k in cell["per_triple"]), pos


def _cellpair(b, a):
    return ({"cells": {"RB": b}}, {"cells": {"RB": a}})


def _cell(s, m, p12, p24, status="measured"):
    return {"status": status, "spearman": s, "mae": m,
            "precision": {"12": {"status": "measured", "precision": p12},
                          "24": {"status": "measured", "precision": p24}}}


def test_the_rule_can_ship():
    """FAIL ARM: better on both families, nothing degrading -> ships."""
    b, a = _cellpair(_cell(0.70, 40.0, 0.50, 0.60),
                     _cell(0.75, 38.0, 0.58, 0.60))
    v = VG.verdict(b, a)
    assert v["per_position"]["RB"]["family1_improves"]
    assert v["per_position"]["RB"]["family2_improves"]
    assert v["ships_under_section_3"] is True


def test_the_rule_can_refuse_on_degradation():
    b, a = _cellpair(_cell(0.70, 40.0, 0.50, 0.60),
                     _cell(0.60, 40.0, 0.50, 0.60))   # rho -0.10 > 0.020
    v = VG.verdict(b, a)
    assert v["per_position"]["RB"]["degrades_beyond_noise"]
    assert v["ships_under_section_3"] is False


def test_a_wash_neither_ships_nor_degrades():
    b, a = _cellpair(_cell(0.70, 40.0, 0.50, 0.60),
                     _cell(0.705, 40.1, 0.50, 0.60))
    v = VG.verdict(b, a)
    assert v["positions_improving_both"] == []
    assert v["positions_degrading"] == []
    assert v["ships_under_section_3"] is False


def test_the_committed_artifact_recorded_no_ship_for_both_arms():
    """The 2026-08-18 result, pinned as repo state: C1 and C3 both NO SHIP.
    If a regeneration flips this, the model input data changed — look, do
    not re-pin."""
    doc = json.loads((BT / "v7_candidate_grade.json").read_text())
    assert doc["verdicts"]["c1_age_curves"]["ships_under_section_3"] is False
    assert doc["verdicts"]["c3_fitted_recency"]["ships_under_section_3"] is False
    assert doc["information_set"]["leak_note"].startswith("the ->2025")
