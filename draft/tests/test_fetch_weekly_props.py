# TERRITORY: A
"""fetch_weekly_props — the pure surface, tested without a network.

The claims: median-of-BOOKS per (player, market) — not per outcome row (a
book listing both Over and Under must not out-vote a book listing one side);
markets combine additively into one stat line via the league's OWN scoring
table (never a hand-typed rate); a player with zero requested markets is
ABSENT, never zero; name matching disambiguates by the event's two teams and
NAMES every miss (no board candidate / ambiguous / no scoring market) rather
than guessing; the credit estimator matches the-odds-api.com's documented
10-credits-per-market-per-region-per-event pricing exactly; the snapshot doc
states markets_confirmed_live vs markets_assumed honestly; main() runs the
fixture-injection (PROPS_WEEKLY_EVENTS) path end to end with the network
physically unreachable; the module import never touches the network.
"""
import json
import socket
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import fetch_weekly_props as FP  # noqa: E402
from fetch_component_stats import frozen_scoring_table  # noqa: E402


def _book(key, markets):
    return {"key": key, "markets": markets}


def _market(mk, *pairs):
    """pairs of (side_name_or_desc, point) -> one market's outcomes, each
    tagged with a player description (Over/Under name distinct from the
    player's own name, matching the real the-odds-api shape)."""
    return {"key": mk, "outcomes": [
        {"name": "Over", "description": desc, "point": pt, "price": -110}
        for desc, pt in pairs
    ]}


def _event_doc(books):
    return {"data": {"bookmakers": books}}


# ── extract_event_props: median of BOOKS, not outcome rows ──────────────────

def test_median_is_per_book_not_per_outcome_row():
    # Book "a" lists BOTH Over and Under at 275.5 (2 outcome rows, 1 book);
    # book "b" lists only Under at 265.5 (1 outcome row, 1 book). A naive
    # per-outcome median would see [275.5, 275.5, 265.5] -> 275.5 (book "a"
    # silently double-weighted). The correct per-BOOK median of two books
    # is (275.5 + 265.5) / 2 = 270.5.
    doc = _event_doc([
        _book("a", [{"key": "player_pass_yds", "outcomes": [
            {"name": "Over", "description": "QB One", "point": 275.5},
            {"name": "Under", "description": "QB One", "point": 275.5},
        ]}]),
        _book("b", [_market("player_pass_yds", ("QB One", 265.5))]),
    ])
    props = FP.extract_event_props(doc)
    assert props["QB One"]["player_pass_yds"] == 270.5


def test_median_odd_and_even_book_counts():
    doc3 = _event_doc([
        _book("a", [_market("player_rush_yds", ("RB One", 60.5))]),
        _book("b", [_market("player_rush_yds", ("RB One", 65.5))]),
        _book("c", [_market("player_rush_yds", ("RB One", 70.5))]),
    ])
    assert FP.extract_event_props(doc3)["RB One"]["player_rush_yds"] == 65.5
    doc2 = _event_doc([
        _book("a", [_market("player_rush_yds", ("RB One", 60.0))]),
        _book("b", [_market("player_rush_yds", ("RB One", 64.0))]),
    ])
    assert FP.extract_event_props(doc2)["RB One"]["player_rush_yds"] == 62.0


def test_unrequested_market_is_dropped():
    doc = _event_doc([_book("a", [_market("player_field_goals", ("K One", 1.5))])])
    assert FP.extract_event_props(doc) == {}


def test_missing_point_or_description_contributes_nothing():
    doc = _event_doc([_book("a", [{"key": "player_pass_yds", "outcomes": [
        {"name": "Over", "point": 275.5},                      # no description
        {"name": "Over", "description": "QB Two"},              # no point
    ]}])])
    assert FP.extract_event_props(doc) == {}


def test_accepts_bare_and_wrapped_shapes():
    bare = {"bookmakers": [_book("a", [_market("player_receptions", ("WR One", 5.5))])]}
    wrapped = {"data": bare}
    assert (FP.extract_event_props(bare)
            == FP.extract_event_props(wrapped)
            == {"WR One": {"player_receptions": 5.5}})


def test_malformed_doc_is_absent_not_a_crash():
    assert FP.extract_event_props({}) == {}
    assert FP.extract_event_props({"data": None}) == {}
    assert FP.extract_event_props(None) == {}


# ── implied_points: additive markets, league's own scoring table ────────────

def test_implied_points_additive_and_scored_by_the_real_table():
    table = frozen_scoring_table()
    pts, stat_line = FP.implied_points(
        {"player_pass_yds": 275.5, "player_pass_tds": 2.5,
         "player_pass_interceptions": 0.5},
        table)
    expected = round(275.5 * table.get("pass_yd", 0)
                     + 2.5 * table.get("pass_td", 0)
                     + 0.5 * table.get("pass_int", 0), 2)
    assert pts == expected
    assert stat_line == {"pass_yd": 275.5, "pass_td": 2.5, "pass_int": 0.5}


def test_implied_points_absent_when_no_market_maps():
    pts, stat_line = FP.implied_points({"player_field_goals": 1.5}, frozen_scoring_table())
    assert pts is None and stat_line == {}


# ── any_td: the PRICE market, folded as expected TDs (register 467) ─────────

def _price_market(mk, *rows):
    """rows of (desc, yes_price, no_price_or_None) -> one anytime-TD market
    in the-odds-api shape: outcomes named Yes/No carrying a `price` and NO
    `point` — the row shape the line branch silently dropped."""
    outs = []
    for desc, yes, no in rows:
        outs.append({"name": "Yes", "description": desc, "price": yes})
        if no is not None:
            outs.append({"name": "No", "description": desc, "price": no})
    return {"key": mk, "outcomes": outs}


def test_any_td_price_market_is_priced_not_dropped():
    # KNOWN POSITIVE (rule 3e): Yes -150 / No +120 de-vigs to 0.569 (the
    # historical converter's own docstring example), Poisson -ln(1-p) = 0.841
    # expected TDs. Before 467 this doc extracted {} for the player.
    doc = _event_doc([_book("a", [_price_market("player_anytime_td",
                                                ("RB One", -150, 120))])])
    props = FP.extract_event_props(doc)
    assert "RB One" in props, "the price market was dropped again"
    import math
    p = (150 / 250) / ((150 / 250) + (100 / 220))
    assert props["RB One"]["player_anytime_td"] == round(-math.log(1 - p), 4)
    assert abs(props["RB One"]["player_anytime_td"] - 0.8415) < 0.001


def test_any_td_median_is_per_book_like_a_line():
    doc = _event_doc([
        _book("a", [_price_market("player_anytime_td", ("RB One", -150, 120))]),
        _book("b", [_price_market("player_anytime_td", ("RB One", -100, -120))]),
        _book("c", [_price_market("player_anytime_td", ("RB One", +200, -260))]),
    ])
    props = FP.extract_event_props(doc)
    singles = [FP.extract_event_props(_event_doc([_book("x", [
        _price_market("player_anytime_td", ("RB One", y, n))])]))["RB One"]["player_anytime_td"]
        for y, n in ((-150, 120), (-100, -120), (200, -260))]
    assert props["RB One"]["player_anytime_td"] == sorted(singles)[1]


def test_any_td_scored_as_one_rush_td_per_expected_td():
    table = frozen_scoring_table()
    pts, line = FP.implied_points({"player_rush_yds": 60.5,
                                   "player_anytime_td": 0.5}, table)
    assert line == {"rush_yd": 60.5, "any_td": 0.5}
    assert pts == round(60.5 * table["rush_yd"] + 0.5 * table["rush_td"], 2)


def test_any_td_never_double_counts_a_per_type_td_line():
    table = frozen_scoring_table()
    with_line, line = FP.implied_points({"player_rush_tds": 0.5,
                                         "player_anytime_td": 0.7}, table)
    assert "any_td" not in line and line == {"rush_td": 0.5}
    assert with_line == round(0.5 * table["rush_td"], 2)
    rec_line, line2 = FP.implied_points({"player_reception_tds": 0.4,
                                         "player_anytime_td": 0.7}, table)
    assert line2 == {"rec_td": 0.4} and rec_line == round(0.4 * table["rec_td"], 2)


def test_any_td_alone_is_a_priced_row_not_an_absence():
    table = frozen_scoring_table()
    pts, line = FP.implied_points({"player_anytime_td": 0.3}, table)
    assert line == {"any_td": 0.3} and pts == round(0.3 * table["rush_td"], 2)


def test_any_td_decimal_odds_refused_not_priced():
    # the historical converter's guard travels with it: a "price" of 1.67 is
    # decimal odds (oddsFormat lost) and must refuse, never price 1.67 as
    # American odds
    import pytest as _pt
    from fetch_historical_props import DecimalOddsDetected
    doc = _event_doc([_book("a", [_price_market("player_anytime_td",
                                                ("RB One", 1.67, None))])])
    with _pt.raises(DecimalOddsDetected):
        FP.extract_event_props(doc)


def test_default_markets_include_any_td_and_snapshot_states_the_rule():
    assert "player_anytime_td" in FP.DEFAULT_MARKETS
    assert FP.MARKET_TO_STAT["player_anytime_td"] == "any_td"
    board = [{"player_id": "9", "name": "RB One", "position": "RB", "team": "KC"}]
    events = [{"event_id": "e1", "home_team": "Kansas City Chiefs",
               "away_team": "Buffalo Bills", "kickoff": "2026-09-10T00:00:00Z",
               "odds": _event_doc([_book("a", [
                   _price_market("player_anytime_td", ("RB One", -150, 120))])])}]
    result = FP.build_week_props(events, board, frozen_scoring_table())
    doc = FP.build_snapshot(result, 2026, 1, "2026-09-10T00:00:00Z")
    assert doc["players"]["9"]["stat_line"] == {"any_td": 0.842}   # 3dp on the row
    assert doc["players"]["9"]["markets_used"] == ["player_anytime_td"]
    assert "player_anytime_td" in doc["provenance"]["markets_confirmed_live"]
    assert "467" in doc["provenance"]["any_td_rule"]


# ── name matching: team disambiguates, misses are NAMED, never guessed ──────

def _board(rows):
    return rows


def test_match_uses_event_teams_to_disambiguate():
    # Two "John Smith"s in the league, on different teams — only the one on
    # this event's two teams may match.
    board = [{"player_id": "1", "name": "John Smith", "position": "WR", "team": "KC"},
            {"player_id": "2", "name": "John Smith", "position": "RB", "team": "DAL"}]
    idx = FP.board_index(board)
    match, reason = FP.match_player("John Smith", "KC", "BUF", idx)
    assert reason is None and match[0] == "1"
    match2, reason2 = FP.match_player("John Smith", "DAL", "NYG", idx)
    assert reason2 is None and match2[0] == "2"


def test_match_ambiguous_when_both_candidates_on_the_two_teams():
    board = [{"player_id": "1", "name": "John Smith", "position": "WR", "team": "KC"},
            {"player_id": "2", "name": "John Smith", "position": "TE", "team": "KC"}]
    idx = FP.board_index(board)
    match, reason = FP.match_player("John Smith", "KC", "BUF", idx)
    assert match is None and "ambiguous" in reason


def test_match_unknown_name_is_named_not_guessed():
    idx = FP.board_index([{"player_id": "1", "name": "Real Player", "position": "WR", "team": "KC"}])
    match, reason = FP.match_player("Nobody Onboard", "KC", "BUF", idx)
    assert match is None and "no board player" in reason


def test_normalize_name_handles_the_common_variants():
    board = [{"player_id": "1", "name": "D.K. Metcalf", "position": "WR", "team": "SEA"}]
    idx = FP.board_index(board)
    match, reason = FP.match_player("DK Metcalf", "SEA", "LAR", idx)
    assert reason is None and match[0] == "1"


# ── build_event_player_rows / build_week_props: the full per-event pipeline ─

def test_build_event_player_rows_matches_and_scores():
    doc = _event_doc([
        _book("a", [_market("player_pass_yds", ("Patrick Mahomes", 275.5))]),
        _book("b", [_market("player_pass_yds", ("Patrick Mahomes", 275.5))]),
    ])
    board = [{"player_id": "9999", "name": "Patrick Mahomes", "position": "QB", "team": "KC"}]
    idx = FP.board_index(board)
    rows, unmatched = FP.build_event_player_rows(
        doc, "Kansas City Chiefs", "Buffalo Bills", idx, frozen_scoring_table())
    assert unmatched == []
    assert rows["9999"]["stat_line"] == {"pass_yd": 275.5}
    assert rows["9999"]["team"] == "KC" and rows["9999"]["pos"] == "QB"
    assert rows["9999"]["markets_used"] == ["player_pass_yds"]


def test_build_event_player_rows_names_unmatched_never_drops_silently():
    doc = _event_doc([_book("a", [_market("player_pass_yds", ("Ghost Player", 200.0))])])
    idx = FP.board_index([{"player_id": "1", "name": "Real Player", "position": "QB", "team": "KC"}])
    rows, unmatched = FP.build_event_player_rows(
        doc, "Kansas City Chiefs", "Buffalo Bills", idx, frozen_scoring_table())
    assert rows == {}
    assert len(unmatched) == 1 and unmatched[0]["name"] == "Ghost Player"


def test_build_week_props_aggregates_events_and_carries_meta():
    board = [{"player_id": "1", "name": "Patrick Mahomes", "position": "QB", "team": "KC"},
            {"player_id": "2", "name": "Josh Allen", "position": "QB", "team": "BUF"}]
    events = [
        {"event_id": "e1", "home_team": "Kansas City Chiefs", "away_team": "Buffalo Bills",
         "kickoff": "2026-09-10T00:00:00Z",
         "odds": _event_doc([_book("a", [
             _market("player_pass_yds", ("Patrick Mahomes", 275.5)),
             _market("player_pass_yds", ("Josh Allen", 260.5)),
         ])])},
    ]
    result = FP.build_week_props(events, board, frozen_scoring_table())
    assert set(result["players"]) == {"1", "2"}
    assert result["unmatched"] == []
    assert result["events"][0]["players_matched"] == 2


def test_build_week_props_event_with_no_odds_is_named_never_crashes():
    board = [{"player_id": "1", "name": "Patrick Mahomes", "position": "QB", "team": "KC"}]
    events = [{"event_id": "e1", "home_team": "Kansas City Chiefs",
              "away_team": "Buffalo Bills", "odds": None, "status": "unreachable"}]
    result = FP.build_week_props(events, board, frozen_scoring_table())
    assert result["players"] == {}
    assert result["events"][0]["status"] == "unreachable"


# ── build_snapshot: the committed contract ───────────────────────────────────

def test_snapshot_shape_and_confirmed_vs_assumed_markets():
    board = [{"player_id": "1", "name": "Patrick Mahomes", "position": "QB", "team": "KC"}]
    events = [{"event_id": "e1", "home_team": "Kansas City Chiefs",
              "away_team": "Buffalo Bills", "kickoff": "2026-09-10T00:00:00Z",
              "odds": _event_doc([_book("a", [
                  _market("player_pass_yds", ("Patrick Mahomes", 275.5)),
                  _market("player_pass_tds", ("Patrick Mahomes", 2.5)),
              ])])}]
    result = FP.build_week_props(events, board, frozen_scoring_table())
    doc = FP.build_snapshot(result, 2026, 1, "2026-09-10T00:00:00Z")
    assert next(iter(doc)) == "_territory"
    assert doc["season"] == 2026 and doc["week"] == 1
    assert doc["formula"] == "props_weekly_v1"
    prov = doc["provenance"]
    assert prov["markets_confirmed_live"] == ["player_anytime_td", "player_pass_yds"]
    assert "player_pass_tds" in prov["markets_assumed"]
    assert "1" in doc["players"]
    assert doc["players"]["1"]["points"] > 0


# ── estimate_credits: the-odds-api.com's documented pricing, exactly ────────

def test_estimate_credits_matches_documented_pricing():
    est = FP.estimate_credits(16, markets=("player_pass_yds", "player_rush_yds"),
                              regions="us")
    assert est == {"events": 16, "markets": 2, "regions": 1,
                   "credits_per_event": 20, "credits_total": 320}


def test_estimate_credits_multi_region():
    est = FP.estimate_credits(1, markets=("player_pass_yds",), regions="us,uk")
    assert est["regions"] == 2 and est["credits_per_event"] == 20


def test_estimate_credits_default_market_set_matches_workflow_comment():
    # The workflow's budget comment states 9 markets x 1 region x 10 = 90
    # credits/game (8 -> 9 on 2026-09-01, register 467: anytime TD) — pinned
    # here so the two can never silently drift apart.
    est = FP.estimate_credits(1)
    assert est["markets"] == 9
    assert est["credits_per_event"] == 90
    wf = (Path(__file__).resolve().parents[2] / ".github/workflows/weekly-props-fetch.yml").read_text()
    assert "9 markets x 1 region x 10 credits = 90 credits PER GAME" in wf


# ── network is never touched by import or the pure surface ──────────────────

def test_import_and_pure_functions_are_network_free():
    real_socket = socket.socket

    def _blocked(*a, **k):
        raise AssertionError("network touched during a pure-function test")
    socket.socket = _blocked
    try:
        import importlib
        importlib.reload(FP)
        FP.estimate_credits(1)
        FP.extract_event_props({"bookmakers": []})
    finally:
        socket.socket = real_socket


# ── CLI main(): the fixture-injection path, end to end, network unreachable ─

def test_main_dry_run_via_injected_events(tmp_path):
    board_path = tmp_path / "board.json"
    board_path.write_text(json.dumps({"players": [
        {"player_id": "1", "name": "Patrick Mahomes", "position": "QB", "team": "KC"},
    ]}))
    events_path = tmp_path / "events.json"
    events_path.write_text(json.dumps({"events": [
        {"event_id": "e1", "home_team": "Kansas City Chiefs",
         "away_team": "Buffalo Bills", "kickoff": "2026-09-10T00:00:00Z",
         "odds": _event_doc([_book("a", [
             _market("player_pass_yds", ("Patrick Mahomes", 275.5)),
         ])])},
    ]}))
    out_dir = tmp_path / "out"
    env = {
        "PROPS_WEEKLY_BOARD": str(board_path),
        "PROPS_WEEKLY_OUT_DIR": str(out_dir),
        "PROPS_WEEKLY_EVENTS": str(events_path),
        "PATH": "/usr/bin:/bin",
    }
    r = subprocess.run(
        [sys.executable, str(ROOT / "draft" / "tools" / "fetch_weekly_props.py"),
         "--season", "2026", "--week", "1"],
        cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stdout + r.stderr
    out_path = out_dir / "weekly_props_2026_w1.json"
    assert out_path.exists()
    doc = json.loads(out_path.read_text())
    assert doc["players"]["1"]["points"] > 0
    assert "network" not in r.stderr.lower()


def test_main_dry_run_flag_writes_nothing(tmp_path):
    board_path = tmp_path / "board.json"
    board_path.write_text(json.dumps({"players": []}))
    events_path = tmp_path / "events.json"
    events_path.write_text(json.dumps({"events": []}))
    out_dir = tmp_path / "out"
    env = {
        "PROPS_WEEKLY_BOARD": str(board_path),
        "PROPS_WEEKLY_OUT_DIR": str(out_dir),
        "PROPS_WEEKLY_EVENTS": str(events_path),
        "PATH": "/usr/bin:/bin",
    }
    r = subprocess.run(
        [sys.executable, str(ROOT / "draft" / "tools" / "fetch_weekly_props.py"),
         "--season", "2026", "--week", "1", "--dry-run"],
        cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stdout + r.stderr
    assert not out_dir.exists() or not list(out_dir.glob("*.json"))


def test_main_refuses_real_fetch_without_date(tmp_path):
    board_path = tmp_path / "board.json"
    board_path.write_text(json.dumps({"players": []}))
    env = {"PROPS_WEEKLY_BOARD": str(board_path),
          "PROPS_WEEKLY_API_KEY": "fake-key-never-used",
          "PATH": "/usr/bin:/bin"}
    r = subprocess.run(
        [sys.executable, str(ROOT / "draft" / "tools" / "fetch_weekly_props.py"),
         "--season", "2026", "--week", "1"],
        cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=30)
    assert r.returncode == 1
    assert "--date is required" in r.stdout
