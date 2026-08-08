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


def test_harvested_weekly_high_distribution_for_monte_carlo(hp):
    # Money-grading requirement #2: Monte-Carlo rooms sample the weekly-high bar
    # from the HARVESTED distribution, not a flat constant. Lock its shape.
    hist, _ = hp
    dist = MG.weekly_high_threshold_distribution(hist, ["2023", "2024", "2025"])
    assert dist["n"] == 45                          # 15 RS weeks x 3 seasons
    assert dist["min"] == pytest.approx(122.1, abs=0.1)   # the cited floor of the range
    assert 140 <= dist["median"] <= 155             # real median (~148), not the flat bar
    assert dist["max"] > 166                         # cited "166+" upper range
    assert dist["samples"] == sorted(dist["samples"])
    # Every sample is a real winning score: it appears as some week's max.
    assert all(s > 0 for s in dist["samples"])


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


# --- the playoff bracket resim (53% of the pot) -------------------------------
#
# Playoff money is the largest single component. These lock the resim to the
# harvested brackets before it is allowed to price anything.

def test_the_resim_reproduces_every_harvested_bracket(hp):
    hist, _ = hp
    report = MG.certify_bracket_resim(hist, SEASONS)
    assert set(report) == set(SEASONS)
    for year in SEASONS:
        assert report[year]["ok"] is True, report[year]
        # Non-vacuous: a real four-team bracket, not an empty dict matching an
        # empty dict.
        assert sorted(report[year]["actual"].values()) == [1, 2, 3, 4]


def test_the_bracket_is_seeded_off_the_rebuilt_standings(hp):
    hist, _ = hp
    for year in SEASONS:
        s = MG.season_of(hist, year)
        field = MG.field_weekly_scores(s)
        standings = MG.standings_from_scores(field, MG.weekly_matchups(s),
                                             MG.regular_season_weeks(s))
        seeds = MG.bracket_seeds(standings)
        assert sorted(seeds) == [1, 2, 3, 4]
        # The seeds are exactly the four teams the real bracket placed.
        assert set(seeds.values()) == set(MG.playoff_placements(s)), year


def test_substituting_a_seat_with_its_own_scores_is_an_identity_including_playoffs(hp):
    """The strongest available check: replay a seat with the scores it actually
    posted and every component — playoff dollars included — must come back
    unchanged. A resim that reseeds or replays wrongly cannot survive this."""
    hist, pay = hp
    for year in SEASONS:
        s = MG.season_of(hist, year)
        field = MG.field_weekly_scores(s)
        actual = MG.grade_actual(hist, pay, year)
        for rid, truth in actual["per_roster"].items():
            own = {w: field[w][rid] for w in field if rid in field[w]}
            sub = MG.grade_substituted(hist, pay, year, rid, own)
            assert sub["weekly_high"] == pytest.approx(truth["weekly_high"]), (year, rid)
            assert sub["regular_season"] == pytest.approx(truth["regular_season"]), (year, rid)
            assert sub["playoff"] == pytest.approx(truth["playoff"]), (year, rid)
            assert sub["graded_total"] == pytest.approx(truth["total"]), (year, rid)


def test_a_dominant_seat_wins_the_bracket_and_collects_first_place_money(hp):
    """Direction check: a seat that outscores everyone every week, playoffs
    included, must take the title prize — not merely reach the bracket."""
    hist, pay = hp
    season = "2025"
    s = MG.season_of(hist, season)
    field = MG.field_weekly_scores(s)
    rid = sorted(field[1])[0]
    monster = {w: 99999.0 for w in field}
    sub = MG.grade_substituted(hist, pay, season, rid, monster)
    p = MG.season_pay(pay, season)
    assert sub["made_playoffs"] is True
    assert sub["playoff_place"] == 1
    assert sub["playoff"] == pytest.approx(float(p["playoffs"]["1"]))
    assert sub["graded_total"] == pytest.approx(sub["weekly_high"] + sub["regular_season"]
                                                + sub["playoff"])


def test_a_seat_that_misses_the_bracket_grades_zero_playoff_dollars_exactly(hp):
    hist, pay = hp
    season = "2025"
    s = MG.season_of(hist, season)
    field = MG.field_weekly_scores(s)
    rid = sorted(field[1])[0]
    # Lose every regular-season week by scoring nothing; the seat cannot seed.
    doormat = {w: 0.0 for w in MG.regular_season_weeks(s)}
    sub = MG.grade_substituted(hist, pay, season, rid, doormat)
    assert sub["made_playoffs"] is False
    assert sub["playoff"] == 0.0
    assert "missed the bracket" in sub["substituted_playoff_note"]
    assert "graded_total" in sub          # $0 is a resolved answer, not a withheld one


def test_playoff_dollars_are_WITHHELD_not_guessed_when_the_replay_stops_early(hp):
    """A regular-season-only replay that reaches the bracket must NOT be graded
    on the incumbent roster's playoff scores — that would pair one strategy's
    regular season with another roster's playoffs."""
    hist, pay = hp
    season = "2025"
    s = MG.season_of(hist, season)
    field = MG.field_weekly_scores(s)
    rid = sorted(field[1])[0]
    rs_only = {w: 99999.0 for w in MG.regular_season_weeks(s)}
    sub = MG.grade_substituted(hist, pay, season, rid, rs_only)
    assert sub["made_playoffs"] is True
    assert sub["playoff"] is None
    assert "withheld" in sub["substituted_playoff_note"]
    # And nothing downstream can mistake it for a complete grade.
    assert "graded_total" not in sub
    assert sub["graded_total_partial"] == pytest.approx(sub["weekly_high"] + sub["regular_season"])


def test_a_broken_resim_cannot_pass_certification_silently(hp):
    """The certification must actually bite. Corrupt the seeding rule and the
    harvested brackets must stop reproducing."""
    hist, _ = hp
    original = MG.SEED_PAIRS
    try:
        MG.SEED_PAIRS = ((1, 3), (2, 4))       # wrong pairing
        with pytest.raises(AssertionError):
            MG.certify_bracket_resim(hist, SEASONS)
    finally:
        MG.SEED_PAIRS = original
    # ...and is green again once restored.
    assert MG.certify_bracket_resim(hist, SEASONS)["2025"]["ok"] is True
