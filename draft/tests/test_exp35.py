"""EXP 35 pure core — the REGRESSION_WEIGHT sweep, no egress.

Pins the curve aggregation and the pre-registered verdict logic, and proves the
walk_forward override leaves the SHIPPED path byte-identical (the sweep measures,
it must not silently change the shipped projection).

Run: python -m pytest draft/tests/test_exp35.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp35_regression_sweep as E  # noqa: E402
from projections import walk_forward, CFG  # noqa: E402


def test_override_leaves_shipped_path_identical():
    prior = {2022: {"a": 200.0, "b": 100.0, "c": 40.0}, 2023: {"a": 210.0, "b": 90.0, "c": 60.0}}
    games = {2022: {"a": 16, "b": 15, "c": 10}, 2023: {"a": 16, "b": 14, "c": 12}}
    pos = {"a": "WR", "b": "WR", "c": "WR"}
    default = walk_forward(2024, prior, games, pos)
    explicit = walk_forward(2024, prior, games, pos, regression_weight=CFG["REGRESSION_WEIGHT"])
    assert default == explicit                      # override == shipped when equal
    # a different weight actually changes the projection
    heavy = walk_forward(2024, prior, games, pos, regression_weight=1.0)
    assert heavy != default


def test_more_regression_compresses_toward_the_mean():
    # heavier regression pulls the top player DOWN and the bottom player UP (toward mean)
    prior = {2023: {"hi": 300.0, "lo": 30.0}}
    games = {2023: {"hi": 16, "lo": 16}}
    pos = {"hi": "RB", "lo": "RB"}
    light = walk_forward(2024, prior, games, pos, regression_weight=0.0)
    heavy = walk_forward(2024, prior, games, pos, regression_weight=1.0)
    assert heavy["hi"] < light["hi"]                # the leader is flattened by regression
    assert heavy["lo"] > light["lo"]


def test_sweep_curve_shape():
    # 20 players (top decile = 2). realized descending a..t.
    ids = [chr(ord('a') + i) for i in range(20)]            # top decile = 2
    realized = {p: 100 - i for i, p in enumerate(ids)}      # a,b are the elite
    # Explicit per-weight projections with KNOWN top-decile: lower weight ranks the
    # elite correctly; higher weight scrambles them (the pre-registered direction).
    def proj_for_weight(w):
        if w <= 0.0:
            return dict(realized)                            # perfect -> top-decile 1.0
        if w >= 1.0:
            return {p: i for i, p in enumerate(ids)}         # reversed -> top-decile 0.0
        # shipped 0.35: elite 'a','b' pushed out of the top-2 by proj -> 0.5 hit
        d = dict(realized); d['a'] = -100; return d
    curve = E.sweep_curve(proj_for_weight, realized, {}, grid=[0.0, 0.35, 1.0])
    assert [r["regression_weight"] for r in curve] == [0.0, 0.35, 1.0]
    assert any(r["is_shipped"] for r in curve)
    # fixture premise: top-decile really does fall as w rises
    tds = {r["regression_weight"]: r["top_decile"] for r in curve}
    assert tds[0.0] > tds[1.0]
    v = E.curve_verdict(curve)
    assert v["peak_weight"] == 0.0
    assert "CONFIRMS" in v["verdict"]


def test_curve_verdict_refutes_when_peak_at_shipped():
    curve = [{"regression_weight": 0.0, "top_decile": 0.3, "is_shipped": False},
             {"regression_weight": 0.35, "top_decile": 0.6, "is_shipped": True},
             {"regression_weight": 1.0, "top_decile": 0.2, "is_shipped": False}]
    v = E.curve_verdict(curve)
    assert v["peak_weight"] == 0.35
    assert "REFUTES" in v["verdict"]
