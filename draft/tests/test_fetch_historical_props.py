# TERRITORY: A
"""fetch_historical_props — pure parsing, matching, planning and budget
arithmetic, tested against fixtures shaped exactly like the CONFIRMED real
API response (key-probe.yml run 31967817943, quoted in the module
docstring and the audit doc). No network call is made by any test here —
every I/O function (_download, _get_json, fetch_season_schedule,
fetch_week_events, fetch_event_props, fetch_season) is glue exercised only
by the workflow, same discipline as fetch_component_stats.py's untested
_crosswalk/fetch_season.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import fetch_historical_props as FHP  # noqa: E402


# ── parse_historical_events — the confirmed events-list shape ─────────────

EVENTS_DOC = {
    "timestamp": "2024-09-08T17:00:00Z",
    "previous_timestamp": "2024-09-08T16:00:00Z",
    "next_timestamp": "2024-09-08T18:00:00Z",
    "data": [
        {"id": "7a5e353202d40a844491fa5753bc3097",
         "sport_key": "americanfootball_nfl", "sport_title": "NFL",
         "commence_time": "2024-09-08T17:00:00Z",
         "home_team": "Kansas City Chiefs", "away_team": "Baltimore Ravens"},
        {"id": "zzz999", "sport_key": "americanfootball_nfl",
         "commence_time": "2024-09-08T20:25:00Z",
         "home_team": "Dallas Cowboys", "away_team": "New York Giants"},
    ],
}


def test_parse_historical_events_shape_and_sort():
    got = FHP.parse_historical_events(EVENTS_DOC)
    assert [e["id"] for e in got] == ["7a5e353202d40a844491fa5753bc3097", "zzz999"]
    assert got[0]["home_team"] == "Kansas City Chiefs"
    assert got[0]["away_team"] == "Baltimore Ravens"


def test_parse_historical_events_tolerates_bare_list():
    assert FHP.parse_historical_events(EVENTS_DOC["data"]) == \
        FHP.parse_historical_events(EVENTS_DOC)


def test_parse_historical_events_empty_data():
    assert FHP.parse_historical_events({"data": []}) == []
    assert FHP.parse_historical_events({}) == []


def test_parse_historical_events_drops_rows_with_no_id():
    doc = {"data": [{"home_team": "X", "away_team": "Y"}]}
    assert FHP.parse_historical_events(doc) == []


# ── match_event_to_game — abbreviation -> full-name join ──────────────────

def test_match_event_to_game_exact_hit():
    events = FHP.parse_historical_events(EVENTS_DOC)
    eid = FHP.match_event_to_game(events, "KC", "BAL")
    assert eid == "7a5e353202d40a844491fa5753bc3097"


def test_match_event_to_game_no_hit_returns_none_not_a_guess():
    events = FHP.parse_historical_events(EVENTS_DOC)
    assert FHP.match_event_to_game(events, "SEA", "SF") is None


def test_match_event_to_game_unknown_abbreviation_returns_none():
    events = FHP.parse_historical_events(EVENTS_DOC)
    assert FHP.match_event_to_game(events, "ZZ", "BAL") is None


def test_match_event_to_game_ambiguous_returns_none():
    dupe = FHP.parse_historical_events(EVENTS_DOC) + \
        FHP.parse_historical_events(EVENTS_DOC)[:1]
    assert FHP.match_event_to_game(dupe, "KC", "BAL") is None


def test_team_full_name_covers_all_32_plus_relocation_aliases():
    # every abbreviation actually used by the nflverse schedule dataset must
    # resolve — including historical relocation aliases (OAK/SD/STL/LA).
    current = {"ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL",
               "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR",
               "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT",
               "SEA", "SF", "TB", "TEN", "WAS"}
    assert current <= set(FHP.TEAM_FULL_NAME)
    for alias in ("OAK", "SD", "STL", "LA"):
        assert alias in FHP.TEAM_FULL_NAME


# ── parse_event_props — the confirmed event-odds shape ────────────────────

def _event_odds_doc(bookmakers):
    return {"timestamp": "2024-09-08T17:00:00Z",
            "data": {"id": "7a5e...", "home_team": "Kansas City Chiefs",
                     "away_team": "Baltimore Ravens", "bookmakers": bookmakers}}


def test_parse_event_props_single_book_single_market():
    doc = _event_odds_doc([
        {"key": "draftkings", "title": "DraftKings", "markets": [
            {"key": "player_pass_yds", "outcomes": [
                {"name": "Over", "description": "Patrick Mahomes",
                 "price": -115, "point": 275.5},
                {"name": "Under", "description": "Patrick Mahomes",
                 "price": -105, "point": 275.5}]}]}])
    got = FHP.parse_event_props(doc)
    assert got == {"Patrick Mahomes": {"pass_yd": 275.5}}


def test_parse_event_props_median_across_books():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [{"key": "player_pass_yds",
            "outcomes": [{"name": "Over", "description": "Lamar Jackson",
                          "price": -110, "point": 220.5}]}]},
        {"key": "fanduel", "markets": [{"key": "player_pass_yds",
            "outcomes": [{"name": "Over", "description": "Lamar Jackson",
                          "price": -110, "point": 230.5}]}]},
        {"key": "betmgm", "markets": [{"key": "player_pass_yds",
            "outcomes": [{"name": "Over", "description": "Lamar Jackson",
                          "price": -110, "point": 226.5}]}]},
    ])
    got = FHP.parse_event_props(doc)
    assert got == {"Lamar Jackson": {"pass_yd": 226.5}}  # median of 3


def test_parse_event_props_multiple_markets_and_players():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [
            {"key": "player_pass_yds", "outcomes": [
                {"name": "Over", "description": "Patrick Mahomes", "point": 260.5}]},
            {"key": "player_rush_yds", "outcomes": [
                {"name": "Over", "description": "Isiah Pacheco", "point": 65.5}]},
        ]}])
    got = FHP.parse_event_props(doc)
    assert got == {"Patrick Mahomes": {"pass_yd": 260.5},
                   "Isiah Pacheco": {"rush_yd": 65.5}}


def test_parse_event_props_ignores_markets_outside_requested_set():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [
            {"key": "player_field_goals", "outcomes": [
                {"name": "Over", "description": "Harrison Butker", "point": 1.5}]},
            {"key": "player_pass_yds", "outcomes": [
                {"name": "Over", "description": "Patrick Mahomes", "point": 260.5}]},
        ]}])
    got = FHP.parse_event_props(doc)
    assert "Harrison Butker" not in got
    assert got == {"Patrick Mahomes": {"pass_yd": 260.5}}


def test_parse_event_props_missing_point_or_name_is_skipped_not_zeroed():
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [{"key": "player_pass_yds", "outcomes": [
            {"name": "Over", "description": None, "point": 260.5},
            {"name": "Over", "description": "Patrick Mahomes", "point": None},
        ]}]}])
    assert FHP.parse_event_props(doc) == {}


def test_parse_event_props_empty_bookmakers():
    assert FHP.parse_event_props(_event_odds_doc([])) == {}
    assert FHP.parse_event_props({"data": {}}) == {}


# ── merge_event_props ──────────────────────────────────────────────────────

def test_merge_event_props_unions_and_counts_collisions():
    e1 = {"Patrick Mahomes": {"pass_yd": 260.5}}
    e2 = {"Isiah Pacheco": {"rush_yd": 65.5}}
    e3 = {"Patrick Mahomes": {"pass_yd": 999.0}}   # collision, first wins
    got = FHP.merge_event_props([e1, e2, e3])
    assert got["players"] == {"Patrick Mahomes": {"pass_yd": 260.5},
                              "Isiah Pacheco": {"rush_yd": 65.5}}
    assert got["collisions"] == 1


# ── build_snapshot_plan ────────────────────────────────────────────────────

GAMES_FIX = [
    {"week": 1, "home": "KC", "away": "BAL", "commence_time": "2024-09-05T00:20:00Z"},
    {"week": 1, "home": "DAL", "away": "CLE", "commence_time": "2024-09-08T17:00:00Z"},
    {"week": 2, "home": "SF", "away": "MIN", "commence_time": "2024-09-09T00:15:00Z"},
]


def test_snapshot_plan_sample_week1_filters_and_sorts():
    plan = FHP.build_snapshot_plan(GAMES_FIX, "sample_week1")
    assert [(g["home"], g["away"]) for g in plan] == [("DAL", "CLE"), ("KC", "BAL")]


def test_snapshot_plan_full_season_keeps_everything():
    plan = FHP.build_snapshot_plan(GAMES_FIX, "full_season")
    assert len(plan) == 3


def test_snapshot_plan_single_week_requires_week_arg():
    with pytest.raises(ValueError):
        FHP.build_snapshot_plan(GAMES_FIX, "single_week")
    plan = FHP.build_snapshot_plan(GAMES_FIX, "single_week", week=2)
    assert len(plan) == 1 and plan[0]["home"] == "SF"


def test_snapshot_plan_unknown_scope_raises():
    with pytest.raises(ValueError):
        FHP.build_snapshot_plan(GAMES_FIX, "everything_please")


# ── estimate_credits — the exact arithmetic the workflow comment quotes ───

def test_estimate_credits_matches_vendor_formula():
    est = FHP.estimate_credits(n_games=272, n_markets=6, n_regions=1,
                               n_snapshots_per_game=1, n_events_list_calls=18)
    assert est["odds_calls"] == 272
    assert est["odds_credits"] == 272 * 10 * 6 * 1
    assert est["events_list_credits_est"] == 18 * FHP.EVENTS_LIST_CREDIT_EST
    assert est["total_credits_est"] == est["odds_credits"] + est["events_list_credits_est"]


def test_estimate_credits_sample_week1_is_cheap():
    est = FHP.estimate_credits(n_games=16, n_events_list_calls=1)
    assert est["total_credits_est"] < 1000


def test_estimate_credits_full_three_seasons_fits_the_100k_plan():
    # the exact number the audit doc and the workflow comment quote —
    # 3 seasons x ~272 games x 1 snapshot x 6 markets x 10 credits, plus a
    # small events-list overhead.
    per_season = FHP.estimate_credits(n_games=272, n_events_list_calls=18)
    total = per_season["total_credits_est"] * 3
    assert total < 100_000
    assert per_season["odds_credits"] == 16_320


# ── MARKETS / MARKET_TO_STAT — the credit basis and the scoring join ──────

def test_markets_is_exactly_six_and_matches_market_to_stat():
    assert len(FHP.MARKETS) == 6
    assert set(FHP.MARKETS) == set(FHP.MARKET_TO_STAT)


def test_market_to_stat_targets_are_frozen_scoring_table_keys():
    # every stat key this file emits must be a real scoring-table key so
    # props_season_projection.line_to_points can price it without a KeyError
    # silently swallowing a typo.
    # `rush_td` was dropped 2026-08-16: the vendor bills for
    # player_rush_tds and serves nothing (0 rows / 7,019 player-weeks).
    # `any_td` replaces it and is priced via props_season_projection's
    # _any_td_rate, which refuses to guess when rush_td != rec_td.
    scoring_keys = {"pass_yd", "pass_td", "rush_yd", "any_td", "rec_yd", "rec"}
    assert set(FHP.MARKET_TO_STAT.values()) == scoring_keys
    assert "player_rush_tds" not in FHP.MARKET_TO_STAT


# ── fetch health: the 2026-08-16 truncated-week / missing-market catch ────
#
# The first three real full-season pulls (2023/2024/2025, ~49k credits)
# shipped four silently-truncated weeks and zero rows for one of the six
# markets we were billed for. Neither failure left a trace in the artifact:
# a week whose events-list snapshot resolved 2 of 15 games looked exactly
# like a healthy week with a thin betting market. These tests pin the two
# detectors added in response, using the REAL shapes those pulls produced.


def test_summarize_health_flags_a_week_that_resolved_almost_no_events():
    # 2025 wk3's real shape: 15 players off a 16-game slate, because one
    # stale events-list snapshot could not match the rest of the week.
    health = {
        1: {"games_planned": 16, "events_matched": 16, "odds_ok": 16, "players": 199},
        3: {"games_planned": 16, "events_matched": 2, "odds_ok": 2, "players": 15},
    }
    out = FHP.summarize_health(health)
    assert out["complete"] is False
    assert [s["week"] for s in out["suspect_weeks"]] == [3]
    assert out["suspect_weeks"][0]["match_rate"] == 0.125


def test_summarize_health_passes_a_fully_resolved_season():
    health = {w: {"games_planned": 16, "events_matched": 16, "odds_ok": 16,
                  "players": 200} for w in range(1, 19)}
    out = FHP.summarize_health(health)
    assert out["complete"] is True
    assert out["suspect_weeks"] == []
    assert out["games_planned"] == 288


def _doc(counts, markets=("rec_yd", "rec", "rush_yd", "pass_yd", "pass_td", "any_td")):
    return {"season": 2024, "weeks": [
        {"week": w, "players": {f"P{i}": {m: 1.0 for m in markets}
                                for i in range(n)}}
        for w, n in counts.items()]}


def test_audit_doc_catches_the_real_2024_week7_truncation():
    counts = {w: 190 for w in range(1, 19)}
    counts[7] = 28                      # the real number that shipped
    out = FHP.audit_doc(_doc(counts))
    assert out["truncated_weeks"] == {7: 28}
    assert out["complete"] is False


def test_audit_doc_does_not_flag_legitimate_late_season_tapering():
    # 2023 wk18 really did carry 110 players against a 218 median — fewer
    # books quote a week where playoff seeds are already settled. That is a
    # thin market, not a broken fetch, and must NOT trip the detector.
    counts = {w: 218 for w in range(1, 18)}
    counts[18] = 110
    out = FHP.audit_doc(_doc(counts))
    assert out["truncated_weeks"] == {}


def test_audit_doc_catches_a_market_we_paid_for_that_never_landed():
    # The real 2023-2025 shape: five markets land, the sixth never does.
    got = ("rec_yd", "rec", "rush_yd", "pass_yd", "pass_td")
    out = FHP.audit_doc(_doc({w: 200 for w in range(1, 19)}, markets=got))
    assert out["markets_missing"] == ["any_td"]
    assert out["complete"] is False


def test_audit_doc_passes_a_clean_file():
    out = FHP.audit_doc(_doc({w: 200 for w in range(1, 19)}))
    assert out["complete"] is True
    assert out["markets_missing"] == []


# ── anytime-TD: price -> probability -> expected touchdowns ──────────────
#
# player_rush_tds is billed and never served (key-probe 31970300788), so
# player_anytime_td replaced it. That market quotes a PRICE, not a line, so
# it needs a conversion the over/under path never had. These pin the math
# rather than trusting it, including the two places it is deliberately
# approximate.


def test_american_to_prob_both_signs():
    assert FHP.american_to_prob(-150) == pytest.approx(0.6, abs=1e-9)
    assert FHP.american_to_prob(+200) == pytest.approx(1 / 3, abs=1e-9)
    assert FHP.american_to_prob(+100) == pytest.approx(0.5, abs=1e-9)


def test_devig_pair_strips_the_book_margin():
    # -150 / +120 implies 0.600 + 0.4545 = 1.0545 — the 5.45% over-round is
    # the book's take, and the fair number must be below the raw 0.600.
    fair = FHP.devig_pair(FHP.american_to_prob(-150), FHP.american_to_prob(120))
    assert fair == pytest.approx(0.6 / (0.6 + 100 / 220), abs=1e-9)
    assert fair < 0.6


def test_devig_pair_leaves_a_single_sided_quote_alone():
    # Books often publish only the Yes side of anytime-TD. There is no pair
    # to normalise against, so the value stays raw and is biased HIGH by
    # roughly the vig — a documented limitation, not a silent correction.
    assert FHP.devig_pair(0.42, None) == 0.42


def test_expected_tds_exceeds_the_anytime_probability():
    # P(>=1 TD) and E[TD] differ because multi-TD games exist. A 0.30
    # anytime price is ~0.357 expected TDs; reading the probability
    # directly would under-price exactly the goal-line backs who matter.
    exp = FHP.anytime_td_to_expected_tds(0.30)
    assert exp == pytest.approx(0.35667, abs=1e-4)
    assert exp > 0.30


def test_expected_tds_is_monotonic_and_bounded_at_zero():
    assert FHP.anytime_td_to_expected_tds(0.0) == 0.0
    vals = [FHP.anytime_td_to_expected_tds(p) for p in (0.05, 0.2, 0.5, 0.8)]
    assert vals == sorted(vals)


def test_parse_price_market_pairs_yes_with_no_and_converts():
    m = {"key": "player_anytime_td", "outcomes": [
        {"name": "Yes", "description": "Saquon Barkley", "price": -110},
        {"name": "No", "description": "Saquon Barkley", "price": -110},
        {"name": "Yes", "description": "Deep Reserve", "price": +900},
    ]}
    got = FHP.parse_price_market(m)
    # -110/-110 de-vigs to exactly 0.5 -> E[TD] = -ln(0.5) = 0.693
    assert got["Saquon Barkley"] == pytest.approx(0.69315, abs=1e-4)
    # a +900 longshot stays small
    assert got["Deep Reserve"] < 0.15


def test_parse_event_props_routes_anytime_td_through_the_price_path():
    # The over/under path reads `point`; an anytime-TD outcome has none, so
    # before the split this market was silently dropped in full.
    doc = _event_odds_doc([
        {"key": "draftkings", "markets": [
            {"key": "player_anytime_td", "outcomes": [
                {"name": "Yes", "description": "CeeDee Lamb", "price": -110},
                {"name": "No", "description": "CeeDee Lamb", "price": -110}]}]}])
    got = FHP.parse_event_props(doc)
    assert got["CeeDee Lamb"]["any_td"] == pytest.approx(0.69, abs=0.01)


def test_store_path_keeps_the_week1_draft_pull_off_the_18_week_file():
    # Cory's own distinction: the week-1 pull feeds the DRAFT study
    # (preseason-only information -> season totals), the 18-week pull feeds
    # the WEEKLY study. One path for both would let a ~960-credit week-1
    # fetch silently overwrite ~11,800 credits of already-paid data.
    wk1 = FHP.store_path(2023, "sample_week1")
    full = FHP.store_path(2023, "full_season")
    assert wk1 != full
    assert wk1.name == "historical_props_week1_2023.json"
    assert full.name == "historical_props_2023.json"


def test_store_path_defaults_to_the_full_season_name():
    assert FHP.store_path(2024).name == "historical_props_2024.json"


# ── the oddsFormat defect: 21-33x corruption, caught 2026-08-16 ───────────
#
# fetch_event_props omitted &oddsFormat=american, the vendor defaults to
# DECIMAL, and american_to_prob then read a decimal odd as an American
# moneyline. Shipped week-1 anytime-TD sums were 2002.6 / 1742.3 / 1426.2
# expected touchdowns against a real nflverse count of 61 / 71 / 69.
#
# It survived a coverage check because the ROWS were real — 912 of them —
# and only their VALUES were destroyed. Yardage was untouched because it
# travels in `point`; only price-quoted markets were affected.


def test_odds_url_pins_american_format():
    # The one-line request fix. Without it the whole price path is garbage,
    # so it is pinned rather than trusted to survive a future edit.
    import inspect
    src = inspect.getsource(FHP.fetch_event_props)
    assert "oddsFormat=american" in src


def test_american_to_prob_refuses_a_decimal_odd():
    # 2.50 decimal is a real ~40% chance. Read as American it returns 0.976,
    # which Poisson-inverts to ~3.7 expected TDs for one player.
    with pytest.raises(FHP.DecimalOddsDetected):
        FHP.american_to_prob(2.50)
    with pytest.raises(FHP.DecimalOddsDetected):
        FHP.american_to_prob(1.91)


def test_american_to_prob_still_accepts_real_american_odds():
    # The guard must not reject legitimate prices at the band edges.
    assert FHP.american_to_prob(-110) == pytest.approx(0.5238, abs=1e-4)
    assert FHP.american_to_prob(+900) == pytest.approx(0.1, abs=1e-9)
    assert FHP.american_to_prob(-100) == pytest.approx(0.5, abs=1e-9)
    assert FHP.american_to_prob(+100) == pytest.approx(0.5, abs=1e-9)


def test_the_exact_corruption_is_now_impossible():
    # Reproduce the real failure: a book quoting decimal, parsed as a price
    # market. Before the guard this yielded ~3.7 expected TDs; now it raises
    # rather than shipping a number that looks plausible in a JSON file.
    m = {"key": "player_anytime_td", "outcomes": [
        {"name": "Yes", "description": "Some Backup TE", "price": 2.50}]}
    with pytest.raises(FHP.DecimalOddsDetected):
        FHP.parse_price_market(m)


# ── the values check the coverage check could not do ─────────────────────
#
# audit_doc's coverage checks ALL PASSED on the corrupt anytime-TD column:
# 912 rows, 18 weeks, every market present. They were all garbage. A
# coverage check cannot see a units bug by construction, because the rows
# are there. audit_values compares the numbers against the world instead.


def _td_doc(total, rows=900):
    per = total / rows
    return {"season": 2023, "weeks": [
        {"week": 1, "players": {f"P{i}": {"any_td": per} for i in range(rows)}}]}


def test_audit_values_catches_the_real_pre_fix_corruption():
    # The number that actually shipped: 2002.6 expected TDs against 61.
    r = FHP.audit_values(_td_doc(2002.6), realized_td=61)
    assert r["plausible"] is False
    assert r["factor"] > 30


def test_audit_values_catches_corruption_even_without_a_benchmark():
    # If nobody passes realized_td, the per-player ceiling must still fire —
    # no NFL player averages a touchdown a game.
    r = FHP.audit_values(_td_doc(2002.6), realized_td=None)
    assert r["plausible"] is False
    assert "a touchdown a game" in r["why"]


def test_audit_values_flags_the_residual_vig_inflation():
    # POST-FIX MEASURED STATE: 145.34 vs 61 realized = 2.38x. The units bug
    # is gone (13.8x better) but a real overstatement remains, from
    # single-sided quotes devig_pair cannot correct. A 3.0 threshold would
    # have waved this through; it is not plausible, it is a known bias.
    r = FHP.audit_values(_td_doc(145.34, rows=912), realized_td=61)
    assert r["factor"] == 2.38
    assert r["plausible"] is False


def test_audit_values_passes_a_calibrated_total():
    # A fully de-vigged set should sum NEAR the realized count.
    r = FHP.audit_values(_td_doc(68.0, rows=912), realized_td=61)
    assert r["plausible"] is True
    assert r["why"] is None


def test_audit_values_is_silent_when_there_is_nothing_to_judge():
    r = FHP.audit_values({"weeks": [{"week": 1, "players": {}}]}, realized_td=61)
    assert r["any_td_rows"] == 0 and r["plausible"] is True
