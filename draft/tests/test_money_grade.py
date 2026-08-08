"""THE LAB — lock the shared money-grading layer against harvested reality.

The grader is the Lab's currency; if it miscounts dollars, every experiment
verdict is wrong. These tests grade the three REAL completed seasons and demand
that the money it computes reconciles with the era-correct payout table:
conservation (dollars out == pot), the weekly-high pool, the RS prizes, and the
bracket finishes. Substituting a seat's own scores must be an identity.
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import money_grade as MG  # noqa: E402

SEASONS = ["2023", "2024", "2025"]


@pytest.fixture(scope="module")
def hp():
    return MG.load_history(), MG.load_payouts()


@pytest.mark.parametrize("season", SEASONS)
def test_weekly_high_pool_is_fully_distributed(hp, season):
    hist, pay = hp
    s = MG.season_of(hist, season)
    p = MG.season_pay(pay, season)
    field = MG.field_weekly_scores(s)
    rs_weeks = MG.regular_season_weeks(s)
    # The weekly-high pool paid across RS weeks equals amount x weeks (each week
    # pays exactly one prize, split on ties but summing to the same amount).
    winners = MG.weekly_high_winners(field, rs_weeks)
    assert len(winners) == p["weekly_high_weeks"], \
        f"{season}: {len(winners)} weekly-high weeks, era says {p['weekly_high_weeks']}"
    distributed = sum(
        MG.weekly_high_dollars(field, rs_weeks, p, rid)
        for rid in {r for wk in field.values() for r in wk})
    assert distributed == pytest.approx(p["weekly_high_total"]), \
        f"{season}: weekly-high distributed {distributed} != pool {p['weekly_high_total']}"


@pytest.mark.parametrize("season", SEASONS)
def test_full_season_conserves_the_pot(hp, season):
    hist, pay = hp
    g = MG.grade_actual(hist, pay, season)
    p = g["pay"]
    expected = (p["weekly_high_total"] or 0) + (p["rs_total"] or 0) + (p["playoffs_total"] or 0)
    assert g["distributed"] == pytest.approx(expected), \
        f"{season}: distributed {g['distributed']} != prize pool {expected}"
    # And the prize pool is the buy-in pot (money in == money out).
    assert expected == pytest.approx(p["total_pot"]), \
        f"{season}: prize pool {expected} != pot {p['total_pot']}"


@pytest.mark.parametrize("season", SEASONS)
def test_rs_prizes_go_to_top_two_by_record_then_points(hp, season):
    hist, pay = hp
    g = MG.grade_actual(hist, pay, season)
    champs = [rid for rid, v in g["per_roster"].items() if v["regular_season"] == g["pay"]["rs_champ"]]
    runners = [rid for rid, v in g["per_roster"].items() if v["regular_season"] == g["pay"]["rs_runner_up"]]
    assert len(champs) == 1 and len(runners) == 1
    # Rebuilt standings rank 1 / rank 2 must be exactly those seats.
    assert g["standings"][0]["roster_id"] == champs[0]
    assert g["standings"][1]["roster_id"] == runners[0]


@pytest.mark.parametrize("season", SEASONS)
def test_rebuilt_standings_match_harvested_records(hp, season):
    hist, pay = hp
    s = MG.season_of(hist, season)
    field = MG.field_weekly_scores(s)
    matchups = MG.weekly_matchups(s)
    rebuilt = MG.standings_from_scores(field, matchups, MG.regular_season_weeks(s))
    by_rid = {r["roster_id"]: r for r in rebuilt}
    harvested = {row["roster_id"]: row for row in (s.get("standings") or [])}
    # Records reconstructed from weekly scores must match Sleeper's own standings.
    for rid, hs in harvested.items():
        rb = by_rid[rid]
        assert rb["wins"] == hs["wins"], f"{season} r{rid}: wins {rb['wins']} != {hs['wins']}"
        assert rb["losses"] == hs["losses"], f"{season} r{rid}: losses {rb['losses']} != {hs['losses']}"
        assert rb["points_for"] == pytest.approx(hs["points_for"], abs=0.5)


@pytest.mark.parametrize("season", SEASONS)
def test_playoff_dollars_only_to_bracket_finishers(hp, season):
    hist, pay = hp
    g = MG.grade_actual(hist, pay, season)
    paid = {rid for rid, v in g["per_roster"].items() if v["playoff"] > 0}
    # Exactly the four placed teams collect playoff money.
    assert paid == set(g["placements"].keys())
    assert len(paid) == 4


@pytest.mark.parametrize("season", SEASONS)
def test_substituting_own_scores_is_identity(hp, season):
    hist, pay = hp
    s = MG.season_of(hist, season)
    field = MG.field_weekly_scores(s)
    g = MG.grade_actual(hist, pay, season)
    rid = g["standings"][0]["roster_id"]          # the RS champ seat
    own = {w: field[w][rid] for w in MG.regular_season_weeks(s) if rid in field[w]}
    sub = MG.grade_substituted(hist, pay, season, rid, own)
    assert sub["weekly_high"] == pytest.approx(g["per_roster"][rid]["weekly_high"])
    assert sub["regular_season"] == pytest.approx(g["per_roster"][rid]["regular_season"])
    assert sub["standings_rank"] == 1


def test_a_dominant_substituted_seat_wins_more_weekly_highs(hp):
    # Sanity of the substitution direction: give a seat an unbeatable score every
    # week and it must sweep the weekly-high pool it is eligible for.
    hist, pay = hp
    season = "2025"
    s = MG.season_of(hist, season)
    rid = MG.field_weekly_scores(s)[1] and sorted(MG.field_weekly_scores(s)[1])[0]
    rs_weeks = MG.regular_season_weeks(s)
    monster = {w: 99999.0 for w in rs_weeks}
    sub = MG.grade_substituted(hist, pay, season, rid, monster)
    p = MG.season_pay(pay, season)
    assert sub["weekly_high"] == pytest.approx(p["weekly_high_total"])
    assert sub["standings_rank"] == 1
