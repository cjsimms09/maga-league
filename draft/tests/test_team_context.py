# TERRITORY: relay
"""team_context.py — the situational store (FUTURE-PROOF-2027 Layer 1, half
built 09-02). The committed store must carry passing controls; the implied
totals must be arithmetic on OUR capture, not a quoted number; the coaching
half must be null (NOT CAPTURED), never a blank that reads as 'no change';
and the nflverse LA→LAR alias — caught by control C3 on the first run — must
keep mapping."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("team_context", ROOT / "draft" / "tools" / "team_context.py")
TC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TC)
STORE = json.loads((ROOT / "draft" / "data" / "team_context_2026.json").read_text())


def test_committed_store_controls_pass_and_all_32_teams_are_rows():
    assert [c["id"] for c in STORE["controls"]] == ["C1", "C2", "C3"]
    assert all(c["ok"] for c in STORE["controls"]), STORE["controls"]
    assert len(STORE["teams"]) == 32 and set(STORE["teams"]) == set(TC.NFL_TEAMS)


def test_known_positive_week1_opener_is_arithmetic_on_the_capture():
    sea, ne = STORE["teams"]["SEA"]["weeks"]["1"], STORE["teams"]["NE"]["weeks"]["1"]
    assert sea["opp"] == "NE" and ne["opp"] == "SEA" and sea["home"] and not ne["home"]
    assert abs(sea["implied_total"] + ne["implied_total"] - sea["game_total"]) < 0.011
    assert sea["implied_total"] > ne["implied_total"]          # Seattle favoured on the capture
    assert sea["spread"] == -ne["spread"]


def test_parse_game_reads_total_and_home_spread_and_refuses_a_row_without_them():
    row = {"game": "New England Patriots @ Seattle Seahawks", "start": 1, "ts": "t",
           "markets": {"Total": [{"o": "Over", "h": "44.5"}, {"o": "Under", "h": "44.5"}],
                       "Point Spread": [{"o": "New England Patriots", "h": "4.0"}, {"o": "Seattle Seahawks", "h": "-4.0"}]}}
    g = TC.parse_game(row)
    assert (g["away"], g["home"], g["total"], g["home_spread"]) == ("NE", "SEA", 44.5, -4.0)
    assert TC.parse_game({"game": "New England Patriots @ Seattle Seahawks", "markets": {"Total": []}}) is None
    assert TC.parse_game({"game": "Nowhere FC @ Seattle Seahawks", "markets": {}}) is None


def test_the_coaching_half_is_null_not_blank_and_pace_covers_the_rams():
    for code, t in STORE["teams"].items():
        for k in ("head_coach", "offensive_coordinator", "hc_changed_since_2025", "oc_changed_since_2025", "oline_starters_returning"):
            assert t[k] is None, (code, k)
    assert STORE["teams"]["LAR"]["pace_prior"] and STORE["teams"]["LAR"]["pace_prior"]["plays_per_game"] > 40
    assert any("NOT CAPTURED" in g or "no free source" in g for g in STORE["_gaps"])
