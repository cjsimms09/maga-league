# TERRITORY: A
"""The props second opinion (register 476's tool): the brief parses both rosters;
the crosswalk sees keepers; the lineup builder honours the league's slots; the
second lineup uses P357's blend rule; a swap is NAMED with who it replaces."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
import props_second_opinion as SO  # noqa: E402

BRIEF = """# THIS WEEK — coryjsimms, week 3 (2026)

**Generated 2026-09-22T13:30:00+00:00 from LIVE Sleeper.**

## Opponent: Richard2121

## My roster

| st | player | pos | team | game | injury |
|---|---|---|---|---|---|
| S | Ja'Marr Chase | WR | CIN | vs TB (Sun) |  |
| S | Caleb Williams | QB | CHI | at CAR (Sun) |  |
|   | Rome Odunze | WR | CHI | at CAR (Sun) |  |
| S | Derrick Henry | RB | BAL | at IND (Sun) |  |
|   | Quinshon Judkins | RB | CLE | at JAX (Sun) |  |
| S | Juwan Johnson | TE | NO | at DET (Sun) |  |
| S | Harrison Mevis | K | LAR | vs SF (Thu) |  |
| S | HOU D/ST | DEF | HOU | vs BUF (Sun) |  |

## Opponent's roster

| st | player | pos | team | game | injury |
|---|---|---|---|---|---|
| S | Dak Prescott | QB | DAL | at NYG (Sun) |  |

## Weather
"""
BOARD = [
    {"player_id": "1", "name": "Caleb Williams", "position": "QB", "team": "CHI"},
    {"player_id": "2", "name": "Rome Odunze", "position": "WR", "team": "CHI"},
    {"player_id": "4", "name": "Quinshon Judkins", "position": "RB", "team": "CLE"},
    {"player_id": "5", "name": "Juwan Johnson", "position": "TE", "team": "NO"},
    {"player_id": "9", "name": "Dak Prescott", "position": "QB", "team": "DAL"},
    {"player_id": "7564", "name": "Ja'Marr Chase", "position": "WR", "team": "CIN", "kept": True},
    {"player_id": "3198", "name": "Derrick Henry", "position": "RB", "team": "BAL", "kept": True},
]
SLOTS = {"QB": 1, "RB": 1, "WR": 1, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1}


def test_parse_reads_week_opponent_and_both_rosters():
    tw = SO.parse_this_week(BRIEF)
    assert tw["week"] == 3 and tw["season"] == 2026 and tw["opponent"] == "Richard2121"
    assert [r["name"] for r in tw["roster"]][:2] == ["Ja'Marr Chase", "Caleb Williams"]
    assert tw["roster"][0]["st"] is True and tw["roster"][2]["st"] is False
    assert [r["name"] for r in tw["opponent_roster"]] == ["Dak Prescott"]


def test_resolve_sees_keepers_and_names_the_unmatched():
    tw = SO.parse_this_week(BRIEF)
    rows, unmatched = SO.resolve_roster(tw["roster"], BOARD)
    ids = {r["name"]: r["player_id"] for r in rows}
    assert ids["Ja'Marr Chase"] == "7564" and ids["Derrick Henry"] == "3198"      # keepers resolve
    assert ids["Harrison Mevis"] is None and unmatched == []                       # K/DEF: no id, not a miss
    rows2, un2 = SO.resolve_roster([{"st": True, "name": "Nobody Real", "pos": "RB", "team": "CLE"}], BOARD)
    assert un2 and un2[0]["name"] == "Nobody Real"


def test_second_opinion_names_the_swap_and_uses_the_blend_rule():
    tw = SO.parse_this_week(BRIEF)
    rows, _ = SO.resolve_roster(tw["roster"], BOARD)
    champion = {"1": 18.0, "2": 8.0, "4": 7.0, "5": 6.0, "7564": 16.0, "3198": 13.0}
    props = {"4": 12.0, "7564": 17.0}                      # Judkins jumps; Chase covered; others no line
    so = SO.second_opinion(rows, champion, props, None, SLOTS)
    assert so["lineup_champion"][:5] == ["Caleb Williams", "Derrick Henry", "Ja'Marr Chase", "Juwan Johnson", "Rome Odunze"]
    # blend rule: props where a line exists, champion elsewhere -> Judkins (12) takes FLEX from Odunze (8)
    assert "Quinshon Judkins" in so["lineup_props_blend"] and "Rome Odunze" not in so["lineup_props_blend"]
    assert so["swaps"] == [{"props_starts": "Quinshon Judkins", "champion_starts": "Rome Odunze"}]
    assert so["valuation"]["champion_lineup"]["by_champion"] == 61.0                 # 18+13+16+6+8
    assert so["valuation"]["props_blend_lineup"]["by_props_blend"] == 66.0           # 18+13+17+6+12
    assert so["skill_players_with_a_props_line"] == 2
    row = next(r for r in so["table"] if r["name"] == "Quinshon Judkins")
    assert row["props_minus_champion"] == 5.0
    # K/DEF ride into both lineups by position, never priced
    assert "Harrison Mevis" in so["lineup_champion"] and "HOU D/ST" in so["lineup_props_blend"]


def test_agreement_is_reported_as_no_swaps():
    tw = SO.parse_this_week(BRIEF)
    rows, _ = SO.resolve_roster(tw["roster"], BOARD)
    champion = {"1": 18.0, "2": 8.0, "4": 7.0, "5": 6.0, "7564": 16.0, "3198": 13.0}
    so = SO.second_opinion(rows, champion, {}, None, SLOTS)
    assert so["swaps"] == [] and so["lineup_champion"] == so["lineup_props_blend"]
