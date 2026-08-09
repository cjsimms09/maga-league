"""EXP 25 dead-zone — pure surface + cliff location, verified on fixtures.
Run: python -m pytest draft/tests/test_exp25_deadzone.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp25_deadzone as E  # noqa: E402


def _pick(overall, position, realized):
    return {"overall": overall, "position": position, "realized": realized}


def test_surface_buckets_by_overall_pick_band():
    picks = [_pick(1, "RB", 200), _pick(5, "RB", 180), _pick(11, "RB", 100), _pick(12, "WR", 150)]
    rows = E.deadzone_surface(picks, band=10)
    b1 = next(r for r in rows if r["band"] == "1-10")
    assert b1["RB"]["n"] == 2 and b1["RB"]["mean"] == 190.0
    b2 = next(r for r in rows if r["band"] == "11-20")
    assert b2["RB"]["mean"] == 100.0 and b2["WR"]["mean"] == 150.0


def test_thin_cells_flagged_and_excluded_from_cliff():
    # A big drop into a THIN cell must NOT be reported as the cliff (n<8 is noise).
    picks = ([_pick(i, "RB", 180) for i in range(1, 11)]        # band 1-10: n=10, mean 180
             + [_pick(11, "RB", 10), _pick(12, "RB", 10)])      # band 11-20: n=2 thin, mean 10
    rows = E.deadzone_surface(picks, band=10)
    assert rows[1]["RB"]["thin"] is True
    cliff = E.locate_cliff(rows)
    assert cliff["cliff"] is None   # the only drop is into a thin cell -> not evidence


def test_locate_cliff_finds_the_largest_nonthin_drop_in_overall_picks():
    # RB strong through pick 20, collapses at 21-30; both cells non-thin.
    picks = ([_pick(i, "RB", 180) for i in range(1, 11)]
             + [_pick(i, "RB", 170) for i in range(11, 21)]
             + [_pick(i, "RB", 90) for i in range(21, 31)]
             + [_pick(i, "WR", 130) for i in range(1, 31)])
    rows = E.deadzone_surface(picks, band=10)
    cliff = E.locate_cliff(rows)
    assert cliff["cliff"]["boundary_overall_pick"] == 21       # located in OVERALL picks
    assert cliff["cliff"]["drop"] == 80.0
    # crossover: RB (90) falls below WR (130) at 21-30
    assert cliff["crossover"]["overall_pick"] == 21


def test_bbm_agreement_reports_direction_and_our_coordinates():
    cliff = {"boundary_overall_pick": 61, "drop": 40.1}
    agr = E.compare_to_bbm(cliff)
    assert agr["agrees"] is True and agr["our_boundary_overall_pick"] == 61
    assert agr["our_boundary_round_10team"] == 7    # pick 61 -> round 7 in 10-team


def test_no_cliff_when_position_holds_flat():
    picks = ([_pick(i, "RB", 120) for i in range(1, 31)]       # flat, no collapse
             + [_pick(i, "WR", 100) for i in range(1, 31)])
    rows = E.deadzone_surface(picks, band=10)
    cliff = E.locate_cliff(rows)
    # flat -> tiny drops only; crossover never (RB stays above WR)
    assert cliff["crossover"] is None
