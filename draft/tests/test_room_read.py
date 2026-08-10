"""Room-read logic — the discriminating-tell filter. Run:
   python -m pytest draft/tests/test_room_read.py -q

Locks the rules that keep the read SHARP: K/DEF are never a per-owner tell (universal-late),
RB/WR timing tells only on a material deviation from the field norm, onesie (QB/TE) run clocks
always surface, and a thin/low-predictability owner shows no fitted tell. These are the guards
against the read filling with noise nobody can act on.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import room_read as RR  # noqa: E402


def _profiles():
    # Two reliable owners + one thin. field RB round ~ (2+6)/2 = 4.
    return {
        "coryjsimms": {"predictability": "high", "timing_by_position": {}, "position_share_vs_field": {}},
        "EarlyRB": {
            "predictability": "high",
            "first_round_by_position": {"RB": 2, "QB": 6},
            "position_share_vs_field": {"RB": 0.08, "K": 0.06},   # K lean must be dropped
            "timing_by_position": {
                "RB": {"mean": 2.0, "sd": 0.5, "n_seasons": 3, "confidence": "hard"},
                "QB": {"mean": 6.0, "sd": 0.5, "n_seasons": 3, "confidence": "hard"},
                "K":  {"mean": 12.0, "sd": 0.5, "n_seasons": 3, "confidence": "hard"},  # must not be a per-owner tell
            },
        },
        "LateRB": {
            "predictability": "high",
            "first_round_by_position": {"RB": 6, "TE": 5},
            "position_share_vs_field": {},
            "timing_by_position": {
                "RB": {"mean": 6.0, "sd": 0.8, "n_seasons": 3, "confidence": "hard"},
                "TE": {"mean": 5.0, "sd": 0.5, "n_seasons": 3, "confidence": "firm"},
            },
        },
        "Noise": {   # thin -> no reliable tell, even with a timing entry
            "predictability": "thin",
            "position_share_vs_field": {},
            "timing_by_position": {"WR": {"mean": 3.0, "sd": 0.5, "n_seasons": 3, "confidence": "hard"}},
        },
    }


def test_kdef_never_a_per_owner_tell_but_stays_in_run_clock():
    rr = RR.build(_profiles())
    early = next(o for o in rr["owners"] if o["owner"] == "EarlyRB")
    tell_positions = [t["position"] for t in early["tells"]]
    assert "K" not in tell_positions                       # universal-late, dropped as a tell
    assert not any(l["position"] == "K" for l in early["leans"])   # K share lean dropped too
    assert "K" in rr["run_clock"]                          # but the room clock keeps it ("wait till rd 12")


def test_rb_deviation_direction():
    rr = RR.build(_profiles())
    early = next(o for o in rr["owners"] if o["owner"] == "EarlyRB")
    late = next(o for o in rr["owners"] if o["owner"] == "LateRB")
    assert any("EARLY" in t["move"] and t["position"] == "RB" for t in early["tells"])
    assert any("WAITS" in t["move"] and t["position"] == "RB" for t in late["tells"])


def test_onesie_run_clock_always_surfaces():
    rr = RR.build(_profiles())
    early = next(o for o in rr["owners"] if o["owner"] == "EarlyRB")
    assert any(t["position"] == "QB" and "run clock" in t["move"] for t in early["tells"])


def test_thin_owner_shows_no_fitted_tell():
    rr = RR.build(_profiles())
    noise = next(o for o in rr["owners"] if o["owner"] == "Noise")
    assert noise["reliable"] is False
    assert noise["tells"] == []
    assert noise["note"] and "no discriminating tell" in noise["note"]


def test_me_excluded_and_counts():
    rr = RR.build(_profiles())
    assert all(o["owner"] != "coryjsimms" for o in rr["owners"])
    assert rr["n_opponents"] == 3
    assert rr["n_reliable"] == 2         # EarlyRB + LateRB; Noise excluded
