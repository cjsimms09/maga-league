# TERRITORY: D
"""THE ADJUSTER'S MAE HALF HAS NO VERDICT, SO THE NUMBERS ARE PINNED HERE.

DEFECT GUARDED: opportunity_adj_grade.json grades the opportunity adjustment on
BOTH ordering and magnitude, but grade_cell's permutation test runs only for
Spearman and the only verdict the artifact emits is `verdict_ordering`. Every
cell reads NEUTRAL, so a reader stopping at the verdict sees a harmless
adjuster -- while 27 of 27 cells show it making MAE worse and adding a mean
+9.1 points of bias.

Register 21: proj_mean IS Sleeper x this adjuster (proj_baseline ==
proj_sleeper, 422 of 422). It is the entire difference between the board and a
free public projection, which is what makes an unread verdict expensive here
rather than merely untidy.

Pure logic over one committed artifact -- no regeneration, no board, no
network -- so these belong INSIDE the publication gate.

draft/audit/opportunity_adjuster_row33_2026-08-18.md -- register 33, Q1
Run: python -m pytest draft/tests/test_opportunity_adjuster_grade.py -q
"""
from __future__ import annotations

import json
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "draft" / "backtest" / "opportunity_adj_grade.json"

#: Measured 2026-08-18 and quoted in the audit doc. Bands, not point values --
#: a re-run on new seasons may move them, and only a REVERSAL is a finding.
MIN_CELLS = 27
MAX_CELLS_WHERE_ADJUSTER_HELPS_MAE = 0
MIN_MEAN_BIAS_ADDED = 5.0          # measured +9.10
MAX_SURROGATE_EDGE = 2.0           # measured +0.54 on a ~40-point MAE
MAX_CELLS_BEATING_SHUFFLE = 3      # measured 1 of 27, at p=.035


def _cells() -> list:
    doc = json.loads(ARTIFACT.read_text())
    out = []
    for year, season in doc["seasons"].items():
        for baseline, positions in season["baselines"].items():
            for pos, cell in positions.items():
                if "base" in cell:
                    out.append((year, baseline, pos, cell))
    return out


def test_the_artifact_still_grades_magnitude_at_all():
    """CONTROL -- if base/adj/rank_surrogate MAE ever stop being emitted, every
    assertion below silently passes over an empty list."""
    cells = _cells()
    assert len(cells) >= MIN_CELLS, len(cells)
    for year, baseline, pos, c in cells:
        for key in ("base", "adj", "rank_surrogate"):
            assert "mae" in c[key] and "bias" in c[key], (year, baseline, pos, key)


def test_the_adjuster_does_not_improve_mae_in_any_cell():
    helps = [
        (y, b, p, round(c["adj"]["mae"] - c["base"]["mae"], 3))
        for y, b, p, c in _cells()
        if c["adj"]["mae"] < c["base"]["mae"]
    ]
    assert len(helps) <= MAX_CELLS_WHERE_ADJUSTER_HELPS_MAE, (
        f"the adjuster now improves MAE in {len(helps)} cells: {helps}. "
        "That REVERSES the 27-of-27 finding and the audit doc must be re-read "
        "before this bound is relaxed."
    )


def test_the_adjuster_inflates_an_already_high_baseline():
    """The mechanism, not just the symptom."""
    added = [c["adj"]["bias"] - c["base"]["bias"] for _, _, _, c in _cells()]
    assert st.mean(added) >= MIN_MEAN_BIAS_ADDED, st.mean(added)


def test_the_adjuster_barely_beats_a_zero_information_surrogate():
    """The rank surrogate holds the same multiset of adjustments assigned purely
    by descending baseline order -- the distribution with none of the
    player-specific information. The gap IS the adjuster's contribution."""
    gaps = [c["rank_surrogate"]["mae"] - c["adj"]["mae"] for _, _, _, c in _cells()]
    assert st.mean(gaps) <= MAX_SURROGATE_EDGE, (
        f"the adjuster now beats its zero-information surrogate by "
        f"{st.mean(gaps):.3f} MAE points, above the {MAX_SURROGATE_EDGE} bound. "
        "That would be a real finding -- read the audit doc before widening it."
    )


def test_the_ordering_contribution_is_a_coin_flip():
    """The permutation the artifact DOES run: shuffle the adjustments among the
    same players and re-score ordering."""
    ps = [c["shuffled_p_one_sided"] for _, _, _, c in _cells()]
    beats = [p for p in ps if p < 0.05]
    assert len(beats) <= MAX_CELLS_BEATING_SHUFFLE, (len(beats), sorted(ps)[:5])
    assert 0.15 <= st.median(ps) <= 0.85, st.median(ps)


def test_every_pooled_cell_reports_only_an_ordering_verdict():
    """The defect itself, pinned: if an MAE verdict ever appears, this test is
    the thing that should be deleted -- and someone must notice it is gone."""
    doc = json.loads(ARTIFACT.read_text())
    for baseline, positions in doc["pooled"].items():
        for pos, cell in positions.items():
            assert "verdict_ordering" in cell, (baseline, pos)
            assert "verdict_mae" not in cell, (
                f"{baseline}/{pos} now carries an MAE verdict. Good -- the "
                "adjuster's magnitude half is graded. Delete this test and "
                "update draft/audit/opportunity_adjuster_row33_2026-08-18.md."
            )
            assert cell["d_mae"] > 0, (baseline, pos, cell["d_mae"])
