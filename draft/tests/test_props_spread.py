# TERRITORY: relay
"""props_spread.py — P355's feed. The committed table must carry passing
controls (a table with a failed control has EMPTY fits, and the writer
then stamps nothing); the fit is clipped to the measured range; K/DEF and
unknown positions get None, never a number."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
SPEC = importlib.util.spec_from_file_location("props_spread", ROOT / "draft" / "tools" / "props_spread.py")
PS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PS)
TABLE = json.loads((ROOT / "draft" / "data" / "props_residual_sd.json").read_text())


def test_committed_table_controls_pass_and_fits_exist_for_the_four_positions():
    assert [c["id"] for c in TABLE["controls"]] == ["C1", "C2", "C3"]
    assert all(c["ok"] for c in TABLE["controls"]), TABLE["controls"]
    assert set(TABLE["fits"]) == {"QB", "RB", "WR", "TE"}
    assert TABLE["measured"]["player_weeks"] > 10000 and TABLE["measured"]["weeks"] >= 50


def test_sd_rises_with_implied_points_and_is_clipped_to_the_measured_range():
    fits = TABLE["fits"]
    for P in ("RB", "WR", "TE"):
        lo, hi = PS.sd_for(P, 2, fits), PS.sd_for(P, 14, fits)
        assert lo < hi, (P, lo, hi)
        assert PS.sd_for(P, 0, fits) == fits[P]["sd_min"]        # no extrapolation below
        assert PS.sd_for(P, 60, fits) == fits[P]["sd_max"]       # or above
    assert PS.sd_for("QB", 22, fits) > PS.sd_for("RB", 12, fits)  # QBs scatter most


def test_unknown_positions_and_missing_inputs_are_none_not_zero():
    fits = TABLE["fits"]
    assert PS.sd_for("K", 8, fits) is None
    assert PS.sd_for("DEF", 8, fits) is None
    assert PS.sd_for("WR", None, fits) is None
    assert PS.sd_for("WR", 8, {}) is None


def test_the_shuffle_control_is_a_real_positive_and_the_perfect_forecast_a_real_negative():
    c1 = next(c for c in TABLE["controls"] if c["id"] == "C1")
    assert c1["shuffled_sd"] > c1["true_sd"] * 1.2
    c2 = next(c for c in TABLE["controls"] if c["id"] == "C2")
    assert c2["ok"]


def test_a_failed_control_empties_the_fits(tmp_path):
    """The writer's loader must refuse a table whose controls failed."""
    import fetch_free_props as F
    bad = dict(TABLE)
    bad["controls"] = [dict(c, ok=False) for c in TABLE["controls"]]
    p = tmp_path / "t.json"
    p.write_text(json.dumps(bad))
    assert F.load_spread_fits(p) == {}
    assert F.load_spread_fits(tmp_path / "missing.json") == {}
    assert F.load_spread_fits(ROOT / "draft" / "data" / "props_residual_sd.json") == TABLE["fits"]


def test_stamp_spread_marks_priced_skill_players_and_leaves_k_def_alone():
    import fetch_free_props as F
    players = {"1": {"pos": "WR", "points": 12.0}, "2": {"pos": "K", "points": 8.0},
               "3": {"pos": "RB", "points": 3.0}, "4": {"pos": None, "points": 5.0}}
    n = F.stamp_spread(players, TABLE["fits"])
    assert n == 2
    assert players["1"]["sd"] > players["3"]["sd"]
    assert "sd" not in players["2"] and "sd" not in players["4"]
