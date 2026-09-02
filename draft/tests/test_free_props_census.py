"""The census's crosswalk and verdict logic, against REAL label spellings.

Rule 3f: the census answers "which free source carries which market", and a
wrong label→market map would print a confident zero. So the map is tested on
the exact strings each source uses, in both directions (a label we need maps
to the right key; a label we do not need maps to nothing).
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("fpc", ROOT / "draft" / "tools" / "free_props_census.py")
fpc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fpc)


def test_labels_from_each_source_map_to_the_arms_markets():
    cases = {
        # Bovada per-event market descriptions
        "Total Passing Yards - Josh Allen (BUF)": "player_pass_yds",
        "Total Receiving Yards - Ja'Marr Chase (CIN)": "player_reception_yds",
        "Total Receptions - Ja'Marr Chase (CIN)": "player_receptions",
        "Total Rushing Yards - Bijan Robinson (ATL)": "player_rush_yds",
        "Total Passing Touchdowns - Josh Allen (BUF)": "player_pass_tds",
        "Anytime Touchdown Scorer": "player_anytime_td",
        # DraftKings subcategory / offer labels
        "Pass Yds": "player_pass_yds",
        "Rec Yds": "player_reception_yds",
        "Receptions": "player_receptions",
        "Rush Yds": "player_rush_yds",
        "Pass TDs": "player_pass_tds",
        "Interceptions Thrown": "player_pass_interceptions",
        "TD Scorer": "player_anytime_td",
        # PrizePicks stat_type
        "Pass Yards": "player_pass_yds",
        "Receiving Yards": "player_reception_yds",
        "Rush Yards": "player_rush_yds",
        "Pass TDs": "player_pass_tds",
        "Rush+Rec TDs": "player_anytime_td",
        # Underdog display_stat
        "Passing Yards": "player_pass_yds",
        "Rushing Yards": "player_rush_yds",
        "Receiving Yards": "player_reception_yds",
        "Receptions": "player_receptions",
        # Kalshi series titles
        "Pro Football Player Receptions": "player_receptions",
        "Pro Football Player Passing Yards": "player_pass_yds",
    }
    for label, want in cases.items():
        assert fpc.market_of(label) == want, (label, fpc.market_of(label))


def test_labels_we_do_not_need_map_to_nothing():
    for label in ("Point Spread", "Total", "Moneyline", "Longest Reception", "Fantasy Score",
                  "Kicking Points", "Tackles + Assists", "1st Quarter Total", ""):
        assert fpc.market_of(label) is None, label


def test_KNOWN_BAD_a_receiving_yards_label_must_not_be_read_as_receptions():
    """The bare 'rec' rule would swallow 'Rec Yds' if it ran first — the exact
    false-positive shape Rule 3e names. Pinned."""
    assert fpc.market_of("Rec Yds") == "player_reception_yds"
    assert fpc.market_of("Receiving Yds") == "player_reception_yds"
    assert fpc.market_of("Rec") == "player_receptions"


def test_need_table_and_verdict_logic():
    srcs = {
        "a": {"by_market": {"player_pass_yds": 30, "player_receptions": 5}, "samples": [{"x": 1}]},
        "b": {"by_market": {"player_pass_yds": 12}, "samples": []},
        "c": {"error": "boom", "by_market": {}},
    }
    t = fpc.need_table(srcs)
    assert t["player_pass_yds"]["best"] == 30 and list(t["player_pass_yds"]["carriers"]) == ["a", "b"]
    assert t["player_receptions"]["best"] == 5
    assert t["player_rush_yds"]["best"] == 0 and t["player_rush_yds"]["carriers"] == {}
