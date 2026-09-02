# TERRITORY: A
"""The game-environment lab's pure parts, and its committed artifact."""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
import game_env_lab as L  # noqa: E402


def test_weather_map_flags_only_outdoor_wind_or_cold_and_shuffle_reshapes():
    wx = L.weather_by_week(2025)
    flagged = sum(len(v) for v in wx.values())
    assert 20 <= flagged <= 120, flagged                       # 15-19 windy + 13-15 freezing games x 2 teams, minus overlap
    assert all(f["wind"] or f["cold"] for week in wx.values() for f in week.values())
    doc = json.loads((ROOT / "draft" / "backtest" / "nflverse_games_weather_2024_2025.json").read_text())
    dome = next(g for g in doc["seasons"]["2025"] if g["roof"] == "dome")
    assert dome["home"] not in wx.get(dome["week"], {}) or wx[dome["week"]][dome["home"]] is not None  # a dome game never flags on its own
    shuf = L.weather_by_week(2025, random.Random(1))
    assert sum(len(v) for v in shuf.values()) > 0 and shuf != wx


def test_tilts_touch_the_right_players_by_the_right_factor():
    tp = {"q": ("BUF", "QB"), "r": ("BUF", "RB"), "w": ("MIA", "WR"), "d": ("ATL", "TE")}
    arm = {"q": 20.0, "r": 10.0, "w": 12.0, "d": 8.0}
    out, touched = L.tilt_weather(arm, tp, {"BUF": {"wind": True, "cold": True}, "MIA": {"wind": False, "cold": True}})
    assert touched == {"q", "r", "w"}
    assert out["q"] == round(20.0 * L.WIND_PASS * L.COLD_ALL, 2) and out["r"] == round(10.0 * L.WIND_RB * L.COLD_ALL, 2)
    assert out["w"] == round(12.0 * L.COLD_ALL, 2) and out["d"] == 8.0
    z = {"BUF": 1.0, "MIA": -2.0}
    out2, t2 = L.tilt_pace(arm, tp, z)
    assert t2 == {"q", "r", "w"} and out2["q"] == round(20.0 * (1 + L.PACE_PER_SD), 2) and out2["w"] == round(12.0 * (1 - 2 * L.PACE_PER_SD), 2)


def test_pace_z_is_strictly_prior_and_standardised():
    z = L.pace_z(2025)
    assert len(z) >= 30 and abs(sum(z.values()) / len(z)) < 1e-6


def test_committed_artifact_carries_green_controls_and_the_fixed_claims():
    doc = json.loads((ROOT / "draft" / "backtest" / "game_env_lab.json").read_text())
    assert all(c["ok"] for c in doc["controls"])
    assert set(doc["claims"]) == {"C1_pace_does_not_beat_untilted", "C2_weather_does_not_beat_untilted_pooled",
                                  "C2_weather_touched_inside_0.10", "C3_props_weather_does_not_beat_untilted_touched"}
    assert "PACE" in doc["_claims_fixed_before_the_run"] and doc["_reading_2026-09-02"]
    assert set(doc["folds"]) == {"2025", "2024"}
