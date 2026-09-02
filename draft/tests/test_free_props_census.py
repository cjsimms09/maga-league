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
        "Rush+Rec TDs": "player_rush_rec_tds",
        "Rush + Rec TDs": "player_rush_rec_tds",
        # Underdog display_stat
        "Passing Yards": "player_pass_yds",
        "Rushing Yards": "player_rush_yds",
        "Receiving Yards": "player_reception_yds",
        "Receptions": "player_receptions",
        # Kalshi series titles
        "Pro Football Player Receptions": "player_receptions",
        "Pro Football Player Passing Yards": "player_pass_yds",
        # Sleeper Picks wager_type spellings (run 6, 09-02)
        "anytime_touchdowns": "player_anytime_td",
        "receiving_yards": "player_reception_yds",
        "passing_touchdowns": "player_pass_tds",
        "interceptions": "player_pass_interceptions",
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


def test_a_joint_rush_rec_td_line_covers_both_split_td_markets():
    """Underdog prices 'Rush + Rec TDs' and never the split; under our scoring
    both are six points, so the joint line must satisfy both needs — the first
    census read it as two gaps."""
    srcs = {"ud": {"by_market": {"player_rush_rec_tds": 300}, "samples": [{}]}}
    t = fpc.need_table(srcs)
    assert t["player_rush_tds"]["best"] == 300 and "joint" in t["player_rush_tds"]["covered_by"]
    assert t["player_reception_tds"]["best"] == 300
    assert t["player_pass_tds"]["best"] == 0          # a joint TD line says nothing about passing


def test_sleeper_stat_keys_map_directly():
    """Sleeper Picks' market_type is Sleeper's own stat key — our scoring keys."""
    for k, want in (("pass_yd", "player_pass_yds"), ("rec", "player_receptions"), ("rec_yd", "player_reception_yds"),
                    ("rush_td", "player_rush_tds"), ("pass_int", "player_pass_interceptions"), ("rec_td", "player_reception_tds")):
        assert fpc.market_of(k) == want, k
    assert fpc.market_of("fum_lost") is None
