"""Pre-registered logic for the regression-weight CV gate. Run:
   python -m pytest draft/tests/test_regression_cv.py -q

Fixes the SHIP-LOWER rule on synthetic curves so a data refresh can't move the bar:
a consistently-low CV pick that never loses out-of-sample => supported; a jumpy pick
or an out-of-sample loss => not supported.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_regression_cv as CV  # noqa: E402


def _doc(per_season):
    return {"per_season": per_season}


def _season(year, td_by_w, n=100, rho_by_w=None):
    return {"season": year, "n": n,
            "curve": [{"regression_weight": w, "top_decile": td, "n": n,
                       "rank_corr": (rho_by_w or {}).get(w, 0.6)} for w, td in td_by_w.items()]}


def test_low_weight_that_never_loses_is_supported():
    # low weights strong every season, 0.35 weak -> SHIP-LOWER supported
    doc = _doc([
        _season("2023", {0.0: 0.50, 0.1: 0.48, 0.2: 0.46, 0.35: 0.41}),
        _season("2024", {0.0: 0.54, 0.1: 0.54, 0.2: 0.52, 0.35: 0.41}),
        _season("2025", {0.0: 0.53, 0.1: 0.59, 0.2: 0.53, 0.35: 0.53}),
    ])
    out = CV.run.__wrapped__(doc) if hasattr(CV.run, "__wrapped__") else None
    curves = CV._season_curves(doc)
    v = CV.verdict(CV.leave_one_out(curves), CV.robust_weight(curves))
    assert v["ship_lower_supported"] is True
    assert v["cv_all_low"] and v["cv_never_loses_oos"]
    assert v["recommended_weight"] <= 0.2


def test_out_of_sample_loss_is_not_supported():
    # a fold where the CV-selected low weight LOSES to shipped on the held-out season
    doc = _doc([
        _season("2023", {0.0: 0.50, 0.1: 0.50, 0.2: 0.46, 0.35: 0.41}),
        _season("2024", {0.0: 0.54, 0.1: 0.54, 0.2: 0.52, 0.35: 0.41}),
        # 2025: low weights collapse, 0.35 is best -> holding out 2025, the train-best low
        # weight loses out-of-sample here
        _season("2025", {0.0: 0.20, 0.1: 0.20, 0.2: 0.30, 0.35: 0.55}),
    ])
    curves = CV._season_curves(doc)
    v = CV.verdict(CV.leave_one_out(curves), CV.robust_weight(curves))
    assert v["ship_lower_supported"] is False
    assert v["cv_never_loses_oos"] is False


def test_high_cv_pick_is_not_supported():
    # best training weight is HIGH (0.5) -> not a "lower the weight" story
    doc = _doc([
        _season("2023", {0.0: 0.30, 0.1: 0.32, 0.2: 0.40, 0.35: 0.45, 0.5: 0.55}),
        _season("2024", {0.0: 0.31, 0.1: 0.33, 0.2: 0.41, 0.35: 0.46, 0.5: 0.56}),
        _season("2025", {0.0: 0.30, 0.1: 0.34, 0.2: 0.42, 0.35: 0.47, 0.5: 0.57}),
    ])
    curves = CV._season_curves(doc)
    v = CV.verdict(CV.leave_one_out(curves), CV.robust_weight(curves))
    assert v["ship_lower_supported"] is False
    assert v["cv_all_low"] is False


def test_robust_weight_prefers_best_mean():
    doc = _doc([
        _season("2023", {0.0: 0.50, 0.1: 0.48, 0.35: 0.41}),
        _season("2024", {0.0: 0.54, 0.1: 0.54, 0.35: 0.41}),
        _season("2025", {0.0: 0.53, 0.1: 0.59, 0.35: 0.53}),
    ])
    curves = CV._season_curves(doc)
    r = CV.robust_weight(curves)
    # 0.1 mean = (0.48+0.54+0.59)/3 = 0.5367 > 0.0 mean = (0.50+0.54+0.53)/3 = 0.5233
    assert r["recommended"]["weight"] == 0.1
