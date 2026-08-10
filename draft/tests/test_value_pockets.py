"""Value pockets — within-position persistence surface + pocket/dead-zone verdicts.
Run: python -m pytest draft/tests/test_value_pockets.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_value_pockets as VP  # noqa: E402


def _cell(mean, n, thin=False):
    return {"mean": mean, "n": n, "thin": thin}


def _row(lo, rb=None, wr=None):
    hi = lo + 9
    r = {"band": f"{lo}-{hi}", "lo": lo, "hi": hi,
         "RB": rb or _cell(None, 0, True), "WR": wr or _cell(None, 0, True),
         "TE": _cell(None, 0, True), "QB": _cell(None, 0, True)}
    return r


def test_persistence_is_within_position_and_qb_does_not_confound():
    # RB premium 200 early, collapses to 90 late; WR premium 130, holds 115 late.
    rows = [
        _row(1, rb=_cell(200, 20), wr=_cell(130, 20)),
        _row(61, rb=_cell(90, 20), wr=_cell(115, 20)),
    ]
    surf = VP.value_surface(rows)
    late = next(r for r in surf if r["lo"] == 61)
    assert late["pos"]["RB"]["persistence"] == round(90 / 200, 2)   # 0.45 -> dead zone
    assert late["pos"]["WR"]["persistence"] == round(115 / 130, 2)  # 0.88 -> pocket
    assert late["pos"]["RB"]["verdict"] == "overpriced"
    assert late["pos"]["WR"]["verdict"] == "underpriced"


def test_thin_cells_excluded_from_baseline_and_verdicts():
    rows = [
        _row(1, rb=_cell(999, 3, thin=True)),      # thin: must NOT become the baseline
        _row(11, rb=_cell(200, 20)),                # real premium
        _row(61, rb=_cell(100, 20)),                # 100/200 = 0.5 -> dead zone
    ]
    surf = VP.value_surface(rows)
    late = next(r for r in surf if r["lo"] == 61)
    assert late["pos"]["RB"]["baseline"] == 200     # not 999 (thin skipped)
    assert late["pos"]["RB"]["verdict"] == "overpriced"


def test_early_bands_are_never_flagged_a_pocket_or_dead_zone():
    # A big drop that happens BEFORE the LATE cutoff is not a late verdict.
    rows = [_row(1, rb=_cell(200, 20)), _row(21, rb=_cell(90, 20))]
    surf = VP.value_surface(rows)
    early = next(r for r in surf if r["lo"] == 21)
    assert early["pos"]["RB"]["verdict"] == "fair"   # 21 < LATE(51)


def test_pockets_collects_and_sorts():
    rows = [
        _row(1, rb=_cell(200, 20), wr=_cell(130, 20)),
        _row(61, rb=_cell(90, 20), wr=_cell(120, 20)),
    ]
    pk = VP.pockets(VP.value_surface(rows))
    assert any(e["position"] == "WR" for e in pk["underpriced_pockets"])
    assert any(e["position"] == "RB" for e in pk["overpriced_dead_zones"])
