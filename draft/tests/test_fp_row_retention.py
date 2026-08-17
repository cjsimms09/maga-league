# TERRITORY: A
"""FantasyPros per-player rows must be RETAINED, not summarised away.

Cory, 2026-08-17: "why can't we also pull in the fantasy pros data again and
keep all data this time? This allows us to check which is better between
sleeper for fantasy pros or blend of both."

He is right, and the cost of the old behaviour was already paid twice: the
blend study he ordered was REFUSED for want of a control arm, and the
position-weight study could only compare our own models to each other. A blend
is a per-player average whose value is decided by the ERROR CORRELATION between
sources — a quantity no aggregate MAE can carry. Both were blocked by this
retention decision, not by anything the world withheld.
"""
import sys
from pathlib import Path

BT = Path(__file__).resolve().parents[1] / "backtest"
sys.path.insert(0, str(BT))
import exp_fp_hist_proj as FP  # noqa: E402


def test_a_rows_file_is_declared_separately_from_the_verdict():
    assert FP.ROWS_OUT.name != FP.OUT.name
    assert "rows" in FP.ROWS_OUT.name


def test_value_rows_scores_under_OUR_table_not_fantasypros_printed_points():
    """THE NORMALISATION Cory asked about, and it already existed. `our_pts` is
    the stat line re-scored under our league table; `fp_fpts` is FP's number in
    FP's scoring. Comparing the second to our outcomes is the ~20% scale error
    this repo already found once."""
    scoring = {"rec_yd": 0.1, "rec": 0.5, "rec_td": 6.0}
    rows = [{"name": "A", "stats": {"rec_yd": 1000, "rec": 80, "rec_td": 8},
             "fp_fpts": 999.0}]
    valued, coverage = FP.value_rows(rows, scoring)
    assert valued[0]["our_pts"] == 100.0 + 40.0 + 48.0
    assert valued[0]["our_pts"] != valued[0]["fp_fpts"]
    assert coverage == 1.0


def test_a_row_with_no_stat_line_gets_no_our_pts_rather_than_a_guess():
    valued, coverage = FP.value_rows([{"name": "B", "fp_fpts": 120.0}], {"rec": 1.0})
    assert valued[0]["our_pts"] is None, (
        "no stat line means we cannot re-score it; inventing a number here "
        "would silently mix two scoring systems in one column")
    assert valued[0]["gate_value"] == 120.0, "FP's own number may still GATE"
    assert coverage == 0.0


def test_evaluate_year_carries_the_rows_out_for_retention():
    """The rows have to escape evaluate_year or the caller cannot keep them.
    Checked on the source rather than by running a fetch (egress-only)."""
    src = (BT / "exp_fp_hist_proj.py").read_text()
    assert 'res["_rows"] = valued' in src
    assert 'year_res.pop("_rows"' in src


def test_a_refused_year_keeps_its_rows_but_is_marked_ungradeable():
    """A refusal says the year may not be GRADED, not that the rows are
    worthless — they are the evidence for the refusal, and re-fetching to
    inspect one costs a live fetch that may not be available later."""
    src = (BT / "exp_fp_hist_proj.py").read_text()
    assert '"gradeable": year_res["status"] == "graded"' in src
    # The warning is line-wrapped in the source, so match a fragment that is
    # not split — grepping a wrapped literal is how this test failed first.
    assert "EVIDENCE for that refusal" in src


def test_the_rows_file_warns_that_fp_points_are_in_fp_scoring():
    src = (BT / "exp_fp_hist_proj.py").read_text()
    assert "NOT comparable" in src or "not be compared directly" in src
