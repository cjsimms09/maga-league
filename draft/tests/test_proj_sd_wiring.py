# TERRITORY: A
"""REC-1 APPLIED — the wiring test for the measured proj_sd path.

Cory's ruling ("We need to fix!!!") authorized REC-1; the decision arm was
re-run on the fresh 86e42bc2 board first and reproduced (roles identical at all
twelve seats — PROJ-SD-DECISION-ARM.md addendum). This file pins the wiring
itself:

  1. blend() prices a measured (position, band) cell from C's calibration —
     the appliers' first production caller — and DECLARES the source per row;
  2. an unmeasured cell (K/DEF) falls back to the POSITION_VARIANCE path,
     never to zero and never silently to a measured neighbour;
  3. the board identity proj_sd == proj_mean × variance holds on BOTH paths;
  4. fail arm: with no calibration on disk, every row is the pre-REC-1
     behaviour — the fallback is the old pipeline, not a crash and not a zero;
  5. the in-blend rank ordering matches the pos_rank definition the calibration
     was fitted on (proj_mean desc within position).
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import projections as PJ  # noqa: E402


def _mkplayers():
    # 2026-08-17, calibration regenerated on Cory's ruling: QB|1-3 is now
    # honestly unmeasurable (n=6 < min_n 8, ratios null), so the fixture grew
    # q3/q4 to put a row (q4, rank 4) inside the shallowest MEASURED band,
    # QB|4-8. Old fixture drove QB|1-3 through q1/q2.
    return [
        {"player_id": "q1", "position": "QB", "years_exp": 5},
        {"player_id": "q2", "position": "QB", "years_exp": 5},
        {"player_id": "q3", "position": "QB", "years_exp": 5},
        {"player_id": "q4", "position": "QB", "years_exp": 5},
        {"player_id": "k1", "position": "K", "years_exp": 5},
    ]


BASELINE = {"q1": 400.0, "q2": 300.0, "q3": 290.0, "q4": 280.0, "k1": 140.0}


def _cal_cells():
    doc = json.loads((HERE.parent / "backtest"
                      / "projection_error_calibration.json").read_text())
    return {k: v for k, v in doc["cells"].items() if v.get("status") == "measured"}


def test_measured_cell_prices_the_row_and_declares_itself():
    # 2026-08-18, clean 4s regeneration: QB|1-3 is measured again (n=9 — its
    # 08-17 refusal was the dropped-2025 symptom, not a fact about top QBs),
    # so q1 is back on the measured path and pinned to HIS OWN cell's ratio —
    # the two-cell pin now also proves adjacent ranks price different cells.
    cells = _cal_cells()
    assert "QB|4-8" in cells, "the calibration lost the cell this test drives"
    ratio = cells["QB|4-8"]["sd_ratio"]
    out = PJ.blend(_mkplayers(), dict(BASELINE), {}, {})
    q4 = next(p for p in out if p["player_id"] == "q4")
    assert q4["proj_sd_source"] == "measured-2023-25-error"
    assert q4["proj_sd"] == pytest.approx(q4["proj_mean"] * ratio, abs=0.5)
    # the why names the band, so the board can say where the number came from
    assert any("QB|4-8" in w for w in q4["variance_why"])
    q1 = next(p for p in out if p["player_id"] == "q1")
    assert q1["proj_sd_source"] == "measured-2023-25-error"
    assert q1["proj_sd"] == pytest.approx(
        q1["proj_mean"] * cells["QB|1-3"]["sd_ratio"], abs=0.5)
    assert any("QB|1-3" in w for w in q1["variance_why"])


def test_unmeasured_position_falls_back_to_position_variance():
    out = PJ.blend(_mkplayers(), dict(BASELINE), {}, {})
    k = next(p for p in out if p["position"] == "K")
    assert k["proj_sd_source"] == "position_variance"
    # K base 0.28, no modifiers in this fixture
    assert k["variance"] == pytest.approx(PJ.POSITION_VARIANCE["K"], abs=1e-6)


def test_identity_holds_on_both_paths():
    out = PJ.blend(_mkplayers(), dict(BASELINE), {}, {})
    for p in out:
        assert p["proj_sd"] == pytest.approx(p["proj_mean"] * p["variance"], abs=0.05), \
            f"{p['player_id']}: proj_sd != proj_mean × variance"


def test_fail_arm_no_calibration_means_pre_rec1_behaviour(monkeypatch):
    """The fallback is the OLD pipeline, never a zero and never a crash."""
    monkeypatch.setattr(PJ, "_sd_calibration", lambda: None)
    out = PJ.blend(_mkplayers(), dict(BASELINE), {}, {})
    q1 = next(p for p in out if p["player_id"] == "q1")
    assert q1["proj_sd_source"] == "position_variance"
    assert q1["variance"] == pytest.approx(PJ.POSITION_VARIANCE["QB"], abs=1e-6)
    assert q1["proj_sd"] > 0


def test_in_blend_rank_matches_the_calibrations_band_basis():
    """q1 (400) must read QB band 1-3 as rank 1 and q4 (280) as rank 4 —
    proj_mean desc within position, the exact definition vorp.assign_tiers
    writes as pos_rank and projection_error fitted its bands on.

    2026-08-18, clean 4s regeneration: every QB cell is measured, so the
    ordering check rides the RATIOS rather than the measured/fallback seam —
    q3 must price QB|1-3 and q4 QB|4-8, two cells whose sd_ratios differ. A
    reversed in-blend ordering swaps the cells and both approx pins fire."""
    cells = _cal_cells()
    assert cells["QB|1-3"]["sd_ratio"] != cells["QB|4-8"]["sd_ratio"], (
        "the two QB cells this test tells apart have merged — pick a pair "
        "of cells with distinct ratios or the ordering check is blind")
    out = PJ.blend(_mkplayers(), dict(BASELINE), {}, {})
    q3 = next(p for p in out if p["player_id"] == "q3")
    q4 = next(p for p in out if p["player_id"] == "q4")
    assert q3["proj_sd"] == pytest.approx(
        q3["proj_mean"] * cells["QB|1-3"]["sd_ratio"], abs=0.5)
    assert q4["proj_sd"] == pytest.approx(
        q4["proj_mean"] * cells["QB|4-8"]["sd_ratio"], abs=0.5)


def test_scratch_keys_do_not_leak_onto_the_board():
    out = PJ.blend(_mkplayers(), dict(BASELINE), {}, {})
    for p in out:
        assert "_blend_base" not in p and "_blend_adj" not in p
