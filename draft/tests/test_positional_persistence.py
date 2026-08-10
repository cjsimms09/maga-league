"""Pre-registered logic for the RB-vs-WR persistence check. Run:
   python -m pytest draft/tests/test_positional_persistence.py -q

Tests the DECISION RULE on synthetic seasons (not the live data): a real edge must persist
across seasons, a 2024-only spike must read NULL, and a too-thin split must read UNDERPOWERED.
The rule is fixed here so a future data refresh can't quietly move the bar to fit a result.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_positional_persistence as EP  # noqa: E402


def _picks(spec):
    """spec: {season: {'RB': [realized...], 'WR': [realized...]}} -> pick rows in the early band."""
    rows = []
    for season, bypos in spec.items():
        for pos, vals in bypos.items():
            for v in vals:
                rows.append({"overall": 40, "position": pos, "realized": v, "season": season})
    return rows


def test_2024_only_spike_reads_null_not_signal():
    # RB crushes WR in 2024 but loses in 2023 and 2025 (Cory's actual data shape).
    spec = {
        "2023": {"RB": [150] * 10, "WR": [160] * 10},
        "2024": {"RB": [210] * 10, "WR": [140] * 10},
        "2025": {"RB": [110] * 10, "WR": [150] * 10},
    }
    v = EP.verdict(EP.early_band_by_season(_picks(spec)))
    assert v["rb_tilt_supported"] is False
    assert v["rb_win_seasons"] == ["2024"]
    assert "does NOT generalize" in v["text"] or "NOT PERSISTENT" in v["text"]


def test_persistent_edge_reads_supported():
    # RB beats WR every season by a material margin, adequate n.
    spec = {
        "2023": {"RB": [190] * 10, "WR": [150] * 10},
        "2024": {"RB": [200] * 10, "WR": [155] * 10},
        "2025": {"RB": [185] * 10, "WR": [160] * 10},
    }
    v = EP.verdict(EP.early_band_by_season(_picks(spec)))
    assert v["rb_tilt_supported"] is True
    assert len(v["rb_win_seasons"]) == 3
    assert v["pooled_gap"] >= EP.MATERIAL_GAP


def test_thin_cells_read_underpowered():
    # Fewer than MIN_CELL per position per season -> cannot separate fluke from signal.
    spec = {
        "2023": {"RB": [190] * 3, "WR": [150] * 3},
        "2024": {"RB": [200] * 3, "WR": [150] * 3},
        "2025": {"RB": [185] * 3, "WR": [150] * 3},
    }
    v = EP.verdict(EP.early_band_by_season(_picks(spec)))
    assert v["rb_tilt_supported"] is False
    assert "UNDERPOWERED" in v["text"]


def test_positive_but_only_one_usable_season_is_not_supported():
    # Two seasons thin, one strong -> not enough usable seasons to claim persistence.
    spec = {
        "2023": {"RB": [190] * 3, "WR": [150] * 3},   # thin
        "2024": {"RB": [200] * 12, "WR": [150] * 12},  # usable, RB wins big
        "2025": {"RB": [185] * 3, "WR": [150] * 3},   # thin
    }
    v = EP.verdict(EP.early_band_by_season(_picks(spec)))
    assert v["rb_tilt_supported"] is False
    assert "UNDERPOWERED" in v["text"]
