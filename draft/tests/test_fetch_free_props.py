"""The free props writer, offline: both doors parsed from the shapes the census
stored, merged Sleeper-first, priced through the ONE converter, and the file
it writes loads through the arm's own reader. Includes the refusal arm.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
sys.path.insert(0, str(ROOT / "draft"))
spec = importlib.util.spec_from_file_location("ffp", ROOT / "draft" / "tools" / "fetch_free_props.py")
ffp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ffp)
from fetch_component_stats import frozen_scoring_table  # noqa: E402
import weekly_props_arm  # noqa: E402

SCORING = frozen_scoring_table()


def sp_row(pid, wager, line, over_mult="1.85", under_mult="1.85", pos="WR", team="PHI", sport="nfl"):
    mk = lambda outcome, mult: {"outcome": outcome, "subject_id": pid, "sport": sport, "wager_type": wager,
                                "outcome_value": line, "payout_multiplier": mult, "subject_position": pos,
                                "subject_team": team, "game_id": "g1"}
    return {"status": "active", "sport": sport, "wager_type": wager, "options": [mk("over", over_mult), mk("under", under_mult)]}


def ud_doc(lines):
    """lines: [(name, stat, value, higher_american, lower_american, game_title)]"""
    doc = {"appearances": [], "games": [], "over_under_lines": []}
    for i, (name, stat, val, hi, lo, title) in enumerate(lines):
        gid, aid = f"game{i}", f"app{i}"
        doc["games"].append({"id": gid, "title": title, "sport_id": "NFL", "scheduled_at": "2026-09-13T17:00:00Z"})
        doc["appearances"].append({"id": aid, "match_id": gid if title else None})
        doc["over_under_lines"].append({
            "stat_value": val,
            "over_under": {"title": f"{name}  O/U", "appearance_stat": {"display_stat": stat, "appearance_id": aid}},
            "options": [{"choice": "higher", "american_price": hi, "selection_header": name},
                        {"choice": "lower", "american_price": lo, "selection_header": name}],
        })
    return doc


BOARD = {"players": [
    {"player_id": "1", "name": "Jalen Hurts", "position": "QB", "team": "PHI"},
    {"player_id": "2", "name": "A.J. Brown", "position": "WR", "team": "PHI"},
    {"player_id": "3", "name": "Saquon Barkley", "position": "RB", "team": "PHI"},
    {"player_id": "4", "name": "Bijan Robinson", "position": "RB", "team": "ATL"},
    {"player_id": "5", "name": "Brian Robinson", "position": "RB", "team": "WAS"},
], "kept_players": [{"player_id": "6", "name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}]}


def test_td_fold_known_values():
    # P(>=1) = 0.5 -> Poisson mean ln 2
    assert abs(ffp.expected_tds_from_line(0.5, 0.5) - math.log(2)) < 1e-6
    # P(>=2) = 0.5 -> mean ~1.678 (1 - e^-L(1+L) = 0.5)
    L = ffp.expected_tds_from_line(1.5, 0.5)
    assert abs(1 - math.exp(-L) * (1 + L) - 0.5) < 1e-6
    # de-vig: symmetric prices -> 0.5 exactly
    assert abs(ffp.fair_over_prob(0.54, 0.54) - 0.5) < 1e-9


def test_sleeper_parse_prices_yardage_as_line_and_tds_as_expected_count():
    rows = [sp_row("1", "passing_yards", 245.5, pos="QB"), sp_row("1", "passing_touchdowns", 1.5, pos="QB"),
            sp_row("2", "receptions", 5.5), sp_row("2", "anytime_touchdowns", 0.5, "1.60", "2.20"),
            sp_row("9", "hits", 1.5, sport="mlb"), sp_row("2", "first_touchdown", 0.5)]
    out = ffp.parse_sleeper_lines(rows)
    assert out["by_pid"]["1"] == {"player_pass_yds": 245.5, "player_pass_tds": 1.5}
    assert out["by_pid"]["2"]["player_receptions"] == 5.5
    # anytime 0.5 at 1.60/2.20: p_over_raw .625, p_under_raw .4545 -> fair .579 -> -ln(1-.579)
    p_fair = 0.625 / (0.625 + 1 / 2.20)
    assert abs(out["by_pid"]["2"]["player_anytime_td"] - (-math.log(1 - p_fair))) < 1e-6
    assert "9" not in out["by_pid"] and "first_touchdown" not in str(out["by_pid"])


def test_underdog_parse_is_gameweek_only_and_reads_teams_from_the_game_title():
    doc = ud_doc([("A.J. Brown", "Receiving Yards", "62.5", "-112", "-112", "NE @ PHI"),
                  ("A.J. Brown", "Rush + Rec TDs", "0.5", "-135", "+105", "NE @ PHI"),
                  ("Denzel Boston", "Season Receiving Yards", "499.5", "-112", "-112", "")])
    rows = ffp.parse_underdog(doc)
    assert len(rows) == 1 and rows[0]["name"] == "A.J. Brown"
    assert rows[0]["home"] == "PHI" and rows[0]["away"] == "NE"
    assert rows[0]["markets"]["player_reception_yds"] == 62.5
    assert 0.3 < rows[0]["markets"]["player_anytime_td"] < 1.2


def test_build_week_writes_sleeper_first_fills_from_underdog_and_prices_through_the_one_converter():
    rows = [sp_row("1", "passing_yards", 245.5, pos="QB"), sp_row("2", "receptions", 5.5), sp_row("2", "receiving_yards", 70.5)]
    doc = ud_doc([("A.J. Brown", "Receiving Yards", "62.5", "-112", "-112", "NE @ PHI"),   # Sleeper has it: Sleeper wins
                  ("A.J. Brown", "Rush + Rec TDs", "0.5", "-135", "+105", "NE @ PHI"),      # fill
                  ("Saquon Barkley", "Rush Yards", "88.5", "-112", "-112", "NE @ PHI"),     # fill, new player
                  ("Bijan Robinson", "Rush Yards", "95.5", "-112", "-112", "ATL @ TB"),
                  ("Nobody Real", "Rush Yards", "10.5", "-112", "-112", "NE @ PHI")])
    r = ffp.build_week(rows, doc, BOARD, SCORING)
    p = r["players"]
    assert p["2"]["lines"]["player_reception_yds"] == 70.5 and p["2"]["sources"]["player_reception_yds"] == "sleeper_picks"
    assert p["2"]["sources"]["player_anytime_td"] == "underdog"
    assert p["3"]["lines"]["player_rush_yds"] == 88.5 and p["4"]["lines"]["player_rush_yds"] == 95.5
    assert "5" not in p                                    # Brian Robinson never matched Bijan's line
    assert [u["name"] for u in r["unmatched"]] == ["Nobody Real"]
    # the one converter: 70.5 rec yds + 5.5 rec + any_td (scored as rush_td) == implied_points on the same dict
    from fetch_weekly_props import implied_points
    pts, _ = implied_points({"player_reception_yds": 70.5, "player_receptions": 5.5,
                             "player_anytime_td": p["2"]["lines"]["player_anytime_td"]}, SCORING)
    assert p["2"]["points"] == pts
    assert r["counts"]["sleeper_qbs_with_pass_yds"] == 1 and r["counts"]["underdog_filled_players"] == 3


def test_a_qb_with_an_anytime_line_gets_his_rushing_td_expectation_folded():
    # Register 467's rule, applied 2026-09-02 on Cory's word: the line is folded
    # for EVERY position. Before this the QB's line was popped and 32 week-1 QBs
    # were priced without it.
    rows = [sp_row("1", "passing_yards", 245.5, pos="QB"), sp_row("1", "passing_touchdowns", 1.5, pos="QB")]
    doc = ud_doc([("Jalen Hurts", "Rush + Rec TDs", "0.5", "-135", "+105", "NE @ PHI")])
    r = ffp.build_week(rows, doc, BOARD, SCORING)
    q = r["players"]["1"]
    assert q["pos"] == "QB" and q["sources"]["player_anytime_td"] == "underdog"
    assert "any_td" in q["stat_line"] and 0.3 < q["stat_line"]["any_td"] < 1.2
    from fetch_weekly_props import implied_points
    pts, _ = implied_points({"player_pass_yds": 245.5, "player_pass_tds": 1.5,
                             "player_anytime_td": q["lines"]["player_anytime_td"]}, SCORING)
    assert q["points"] == pts
    # and the gain is exactly one rush-TD's points per expected TD (K6's identity)
    base, _ = implied_points({"player_pass_yds": 245.5, "player_pass_tds": 1.5}, SCORING)
    assert abs((q["points"] - base) - SCORING["rush_td"] * q["stat_line"]["any_td"]) < 0.02
    assert ffp.self_check(r) == [] or all("any_td" not in b for b in ffp.self_check(r))


def test_REFUSAL_ARM_a_row_with_an_anytime_source_and_no_any_td_is_refused():
    rows = [sp_row("1", "passing_yards", 245.5, pos="QB")] + [sp_row(str(100 + i), "receptions", 4.5) for i in range(30)]
    doc = ud_doc([("Jalen Hurts", "Rush + Rec TDs", "0.5", "-135", "+105", "NE @ PHI")])
    r = ffp.build_week(rows, doc, BOARD, SCORING)
    assert ffp.self_check(r) == [] if r["counts"]["underdog_filled_players"] else True
    # simulate the pre-467 strip on the built result: the writer must REFUSE
    r["players"]["1"]["stat_line"].pop("any_td", None)
    bad = ffp.self_check(r)
    assert any("anytime-TD source and no any_td" in b for b in bad), bad


def test_the_written_file_loads_through_the_arms_own_reader(tmp_path):
    rows = [sp_row("1", "passing_yards", 245.5, pos="QB")] + [sp_row(str(100 + i), "receptions", 4.5) for i in range(30)]
    doc = ud_doc([("Saquon Barkley", "Rush Yards", "88.5", "-112", "-112", "NE @ PHI")])
    board = {"players": BOARD["players"] + [{"player_id": str(100 + i), "name": f"P{i}", "position": "WR", "team": "PHI"} for i in range(30)]}
    r = ffp.build_week(rows, doc, board, SCORING)
    assert ffp.self_check(r) == []
    snap = ffp.build_snapshot(r, 2026, 1, "2026-09-02")
    path = ffp.props_snapshot_path(tmp_path, 2026, 1)
    path.write_text(json.dumps(snap))
    loaded = weekly_props_arm.load_props_arm(tmp_path, 2026, 1)
    assert loaded and loaded["3"] == r["players"]["3"]["points"] and len(loaded) == 32


def test_REFUSAL_ARM_no_sleeper_qb_or_too_few_players_writes_nothing():
    r = ffp.build_week([sp_row("2", "receptions", 5.5)], ud_doc([]), BOARD, SCORING)
    bad = ffp.self_check(r)
    assert any("QB" in b for b in bad) and any("Underdog" in b for b in bad) and any("<30" in b for b in bad)


def test_MERGE_NOT_CLOBBER_a_player_whose_line_vanished_keeps_his_earlier_row():
    """Week-1 opener kicks off before the Thursday run: the refresh must not
    erase the opener's players (register 172's clobber lesson)."""
    rows = [sp_row("1", "passing_yards", 245.5, pos="QB")] + [sp_row(str(100 + i), "receptions", 4.5) for i in range(30)]
    board = {"players": BOARD["players"] + [{"player_id": str(100 + i), "name": f"P{i}", "position": "WR", "team": "PHI"} for i in range(30)]}
    doc_wed = ud_doc([("Saquon Barkley", "Rush Yards", "88.5", "-112", "-112", "NE @ PHI")])
    wed = ffp.build_snapshot(ffp.build_week(rows, doc_wed, board, SCORING), 2026, 1, "2026-09-09")
    assert "3" in wed["players"]
    # Thursday: Barkley's game already kicked off — Underdog no longer quotes him; P0 got a new line
    rows_thu = [sp_row("1", "passing_yards", 251.5, pos="QB")] + [sp_row(str(100 + i), "receptions", 5.5 if i == 0 else 4.5) for i in range(30)]
    thu = ffp.build_snapshot(ffp.build_week(rows_thu, ud_doc([]), board, SCORING), 2026, 1, "2026-09-10")
    merged = ffp.merge_with_existing(thu, wed)
    assert merged["players"]["3"]["carried_from"] == "2026-09-09" and merged["players"]["3"]["points"] == wed["players"]["3"]["points"]
    assert merged["players"]["100"]["lines"]["player_receptions"] == 5.5           # quoted players take the new line
    assert merged["players"]["1"]["lines"]["player_pass_yds"] == 251.5
    assert merged["provenance"]["counts"]["carried_from_earlier_run"] == 1
    # a different week never merges
    assert ffp.merge_with_existing(dict(thu, week=2), wed)["players"].get("3") is None
