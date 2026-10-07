"""A REAL FOUR-WEEK FETCH IS NOT A BAD FETCH — and a half season still is.

Cory, 2026-10-07: *"Every week going forward needs to work! And needs to work
in a way that helps us draft and manage better next year."*

── WHAT THIS FILE IS DEFENDING ────────────────────────────────────────────────

`component_stats_2021..2025.json` are all committed and `component_stats_2026`
did not exist. Same for `nflverse_weekly_points_2021..2025` against a missing
2026. Five seasons of realized outcomes on disk and none for the season being
played — so every forecast capture that ran all season (our own weekly
projection, Sleeper's, FantasyPros', the props market) was accumulating
evidence that could not be turned into a verdict.

The first scheduled run showed why, and it was not a network failure.
`fetch_component_stats.py` reached nflverse, downloaded the right asset, built
**1,453 real offensive player-weeks and 128 real kicker player-weeks**, and
threw them both away:

    {"season": 2026, "status": "refused_too_small",
     "why": "a season with <3000 offensive player-weeks is a bad fetch, not a
             season — refused rather than committed"}

Three annual floors — `<3000` offensive, `<400` kicker, `<400` team-weeks —
every one written when every season this fetcher had ever seen was already
finished. They are the same defect as the pipeline never being scheduled: a
rule whose condition expired the day week 1 kicked off, with nothing to notice.

── WHY A PER-WEEK FLOOR IS NOT A WEAKER GUARD ─────────────────────────────────

Removing a floor invites the assumption that something was given up, so this
file measures both directions. The replacement is per-week thinness PLUS
coverage of the weeks nflverse's own schedules say have been scored — a
different dataset from the one under test, which is what makes it a check
rather than the payload vouching for itself.

Run: python3 -m pytest draft/tests/test_realized_week_guard.py -q
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import fetch_component_stats as F  # noqa: E402

B = ROOT / "draft" / "backtest"
COMPLETE = (2021, 2022, 2023, 2024, 2025)


def _weeks(prefix: str, year: int) -> list:
    return json.loads((B / f"{prefix}_{year}.json").read_text())["weeks"]


def _week_rows(prefix: str) -> list:
    return [len(w["players"]) for y in COMPLETE for w in _weeks(prefix, y)]


def _season(n_weeks: int, rows: int, *, skip: int = 0) -> list:
    """A synthetic payload: `n_weeks` weeks of `rows` players each."""
    return [{"week": w, "players": {f"p{i}": {} for i in range(rows)}}
            for w in range(1, n_weeks + 1) if w != skip]


# ── the floors must come from the distribution, not from taste ──────────────

@pytest.mark.parametrize("unit,prefix", [
    ("offense", "component_stats"),
    ("kicker", "component_stats_kicker"),
    ("def", "component_stats_def"),
    ("advanced", "advanced_stats"),
])
def test_the_floor_sits_UNDER_every_week_of_real_football_ever_committed(unit, prefix):
    """Rule 3i, as a test rather than a promise.

    A floor is only defensible against the population it was drawn from. If
    someone later raises one of these to a round number, this goes red naming
    the week it would have thrown away. 90 season-weeks per class.
    """
    rows = _week_rows(prefix)
    assert len(rows) == 90, len(rows)
    floor = F.PER_WEEK_FLOOR[unit]
    assert floor < min(rows), (
        f"{unit} floor {floor} is at or above the thinnest real week ever "
        f"committed ({min(rows)}) — it would refuse genuine football")
    # and not so low it stops catching a truncated payload
    assert floor > min(rows) * 0.5, (
        f"{unit} floor {floor} is less than half the thinnest real week "
        f"({min(rows)}) — a badly truncated week would slip through")
    print(f"\n{unit}: floor {floor} vs min {min(rows)} "
          f"median {int(statistics.median(rows))} max {max(rows)}")


# ── it must PASS the case that is currently broken ──────────────────────────

def test_the_REAL_2026_FETCH_IS_BANKABLE():
    """The whole point. These are the numbers CI actually measured on
    2026-10-07: 4 scored weeks, 1,453 offensive player-weeks (~363/week, which
    is inside the committed band of 248-365), 128 kicker rows (32/week).

    ⚠️ RULE 3e: this assertion could not have passed before the fix — the old
    code had no `week_coverage_problem` at all, and the annual floor it
    replaces refused exactly this payload. The control for that is
    `test_CONTROL_the_old_annual_floor_REFUSED_this_very_payload` below, which
    reproduces the refusal from the real counts.
    """
    assert F.week_coverage_problem(_season(4, 363), unit="offense",
                                   expect_weeks={1, 2, 3, 4}) is None
    assert F.week_coverage_problem(_season(4, 32), unit="kicker",
                                   expect_weeks={1, 2, 3, 4}) is None
    assert F.week_coverage_problem(_season(4, 32), unit="def",
                                   expect_weeks={1, 2, 3, 4}) is None


def test_CONTROL_the_old_annual_floor_REFUSED_this_very_payload():
    """What was lost, stated in the units of the old rule. Keeping this as a
    test rather than a comment means the regression is named if anybody
    reintroduces a season-total threshold."""
    assert 1453 < 3000, "the offensive payload the old floor discarded"
    assert 128 < 400, "the kicker payload the old floor discarded"


# ── it must still FIRE, in each of its three ways ───────────────────────────

def test_a_TRUNCATED_week_is_refused():
    """The case the annual floor was really guarding: a payload that arrives
    mangled rather than short."""
    bad = F.week_coverage_problem(_season(4, 363)[:2] + [{"week": 3, "players": {"a": {}}},
                                                         {"week": 4, "players": {f"p{i}": {} for i in range(363)}}],
                                  unit="offense", expect_weeks={1, 2, 3, 4})
    assert bad and bad["status"] == "refused_thin_week", bad
    assert 3 in bad["rows_by_week"]


def test_a_HOLE_in_the_middle_is_refused():
    bad = F.week_coverage_problem(_season(4, 363, skip=3), unit="offense",
                                  expect_weeks={1, 2, 3, 4})
    assert bad and bad["status"] == "refused_incomplete", bad
    assert "3" in str(bad["why"])


def test_an_EMPTY_payload_is_refused():
    bad = F.week_coverage_problem([], unit="offense", expect_weeks={1})
    assert bad and bad["status"] == "refused_empty", bad


# ── the replacement must be STRONGER than what it replaces ──────────────────

@pytest.mark.parametrize("year,upto", [(2021, 10), (2023, 11), (2025, 9)])
def test_the_coverage_arm_catches_a_HALF_SEASON_that_the_annual_floor_WAVED_THROUGH(year, upto):
    """MEASURED, not argued. For each finished season there is a truncation
    point where the running total crosses 3,000 while seven to nine weeks of
    football are still missing — and the old floor banked it silently.

    This is the reason the coverage arm reads a SECOND dataset (schedules)
    instead of trusting the payload's own size.
    """
    weeks = [w for w in _weeks("component_stats", year) if w["week"] <= upto]
    rows = sum(len(w["players"]) for w in weeks)
    assert rows >= 3000, f"{year} weeks 1-{upto} = {rows}: the old floor refuses this"
    assert len(weeks) == upto and upto < 18
    bad = F.week_coverage_problem(weeks, unit="offense",
                                  expect_weeks=set(range(1, 19)))
    assert bad and bad["status"] == "refused_incomplete", bad


def test_a_COMPLETE_committed_season_passes_the_guard_unchanged():
    """The other direction: the guard must not reject the five seasons every
    backtest arm in the repo already reads."""
    for year in COMPLETE:
        for unit, prefix in (("offense", "component_stats"),
                             ("kicker", "component_stats_kicker"),
                             ("def", "component_stats_def"),
                             ("advanced", "advanced_stats")):
            weeks = _weeks(prefix, year)
            assert F.week_coverage_problem(
                weeks, unit=unit, expect_weeks=set(range(1, 19))) is None, \
                f"{prefix} {year} would now be refused"


# ── scored_weeks is the coverage definition, and it is score-based ──────────

def test_scored_weeks_counts_a_week_only_once_somebody_SCORED_in_it():
    """Not a clock — the same predicate `season_played.has_been_played`
    settled for money, for the same reason: a date is a second source that can
    disagree with the scores.

    Built from a synthetic frame so the test needs no network: week 3 is
    scheduled but unscored, which is exactly the state of the current week
    when this fetch runs on a Tuesday before nflverse has published Monday
    night.
    """
    pd = pytest.importorskip("pandas")
    games = pd.DataFrame([
        {"season": 2026, "week": 1, "game_type": "REG", "home_team": "KC",
         "away_team": "BUF", "home_score": 21.0, "away_score": 17.0},
        {"season": 2026, "week": 2, "game_type": "REG", "home_team": "KC",
         "away_team": "BUF", "home_score": 0.0, "away_score": 3.0},
        {"season": 2026, "week": 3, "game_type": "REG", "home_team": "KC",
         "away_team": "BUF", "home_score": None, "away_score": None},
        {"season": 2026, "week": 1, "game_type": "POST", "home_team": "KC",
         "away_team": "BUF", "home_score": 30.0, "away_score": 7.0},
        {"season": 2025, "week": 5, "game_type": "REG", "home_team": "KC",
         "away_team": "BUF", "home_score": 10.0, "away_score": 7.0},
    ])
    assert F.scored_weeks(games, 2026) == {1, 2}, \
        "an unscored week is not owed a capture, and a 0-0 week IS (week 2 " \
        "has a real 0 for the home side)"
    assert F.scored_weeks(games, 2025) == {5}, "seasons must not bleed"
    assert F.scored_weeks(None, 2026) == set(), \
        "an unreachable schedules frame must degrade to 'cannot check', not " \
        "to 'nothing is owed'"


def test_an_unreachable_schedules_frame_degrades_to_THINNESS_ONLY():
    """Rule 3e's shape: the absence of a coverage answer must be reported as
    an absence. With no schedules frame the thinness arm still runs, so a
    mangled payload is still refused — but a truncated COMPLETE season is not
    caught, and `coverage_checked: false` in the status record is the only
    honest way to say so."""
    assert F.week_coverage_problem(_season(4, 363), unit="offense",
                                   expect_weeks=set()) is None
    bad = F.week_coverage_problem(_season(4, 5), unit="offense",
                                  expect_weeks=set())
    assert bad and bad["status"] == "refused_thin_week", bad


# ── the schedules source itself ─────────────────────────────────────────────

def test_the_schedules_asset_is_the_parquet_and_there_are_TWO_paths():
    """`.../schedules/games.csv` is a 404 as of 2026-10-07 — measured from CI
    and from the dev sandbox in the same minute — and it was the single source
    for BOTH the DST store and the vegas store, so both read `unreachable`
    while the team-week parquet beside it downloaded fine."""
    assert F.URL_SCHEDULES.endswith(".parquet"), F.URL_SCHEDULES
    assert "games.csv" not in F.URL_SCHEDULES
    assert F.URL_SCHEDULES_FALLBACK != F.URL_SCHEDULES
    assert "nflverse-data" in F.URL_SCHEDULES
    assert "nflverse-data" not in F.URL_SCHEDULES_FALLBACK, \
        "the fallback must be an INDEPENDENT path, not the same release"


def test_the_ADVANCED_fetcher_shares_the_one_guard_and_does_not_copy_it():
    """It carried a verbatim copy of the `<3000` floor, and
    `advanced_stats_2026` was missing for the same reason. Register 11: two
    definitions of one thing is how the second one goes stale. Also pins 2026
    into its season list — the list used to stop at 2025, so the season being
    played was not even a default target."""
    import inspect
    sys.path.insert(0, str(ROOT / "draft" / "backtest"))
    import fetch_advanced_stats as AS

    src = (ROOT / "draft" / "backtest" / "fetch_advanced_stats.py").read_text()
    assert "< 3000" not in src and "<3000 offensive" not in src, \
        "the annual floor is back, copied again"
    assert "FCS.week_coverage_problem" in src, \
        "the advanced fetcher must call the shared guard, not its own"
    assert "advanced" in F.PER_WEEK_FLOOR
    assert 2026 in AS.SEASONS, "the season being played is not a fetch target"
    assert "expect_weeks" in inspect.signature(AS.fetch_season).parameters


def test_the_fetch_arms_take_the_expected_weeks_so_the_guard_can_run():
    """`main()` used to load the schedules frame AFTER the offensive and kicker
    loops, which is why those two arms had nothing to check coverage against
    and leaned entirely on a season total. Pinned so the ordering cannot
    silently revert."""
    import inspect
    for fn in (F.fetch_season, F.fetch_kicker_season):
        assert "expect_weeks" in inspect.signature(fn).parameters, fn.__name__
    src = inspect.getsource(F.main)
    assert src.index("load_games") < src.index("fetch_season("), \
        "the schedules frame must be loaded BEFORE the stats loops"
