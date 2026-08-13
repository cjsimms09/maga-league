# TERRITORY: C
"""PLAYER-LEVEL DURABILITY — expected games, and E[weeks out | injured].

A's two requests, in A's priority order:

  1. `games_expected` is ONE VALUE PER POSITION, so Harstad's per-game VBD is
     unavailable rather than unimplemented — every RB is priced at 14.2 games whether
     he has played 17 three years running or 9.
  2. The bench equation multiplies P(need) by a FULL-SEASON advantage, so a one-week
     bye and a season-ending tear price identically.

TWO THINGS MAKE THIS HARDER THAN COUNTING ROWS, AND BOTH INFLATE THE ANSWER IF MISSED.

**A BYE IS NOT A MISSED GAME.** Every player on a team has no weekly row in that
team's bye week. Counting it as absence adds exactly one missed game to every player
in the league — uniform enough to look like a real durability signal and wrong for
everyone at once.

**AND A SEASON-ENDING INJURY IS RIGHT-CENSORED.** A player who misses weeks 12-17 is
observed as "6 weeks out", but the injury did not end in week 17 — the season did.
Averaging censored and completed absences together UNDERSTATES E[weeks out], and it
understates it most for the severe injuries the term exists to price. So they are
counted separately and the censored fraction is reported, rather than a single mean
that quietly mixes them.

Run: python3 -m pytest draft/tests/test_nflverse_durability.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_durability as D  # noqa: E402

CW = {"g1": "s1", "g2": "s2"}


def wk(gsis, season, week, team="BUF", pos="RB"):
    return {"player_id": gsis, "season": season, "week": week,
            "recent_team": team, "position": pos}


def season_of(gsis, weeks, team="BUF", season=2024, pos="RB"):
    return [wk(gsis, season, w, team, pos) for w in weeks]


# ── games played ────────────────────────────────────────────────────────────
def test_games_played_counts_WEEKS_WITH_A_ROW():
    rows = season_of("g1", range(1, 18))
    out, _ = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    assert out["s1"]["games"][2024] == 17


def test_a_TEAM_BYE_is_not_a_missed_game():
    """THE ONE THAT INFLATES EVERYTHING. Every player on a team is absent in its bye
    week. MUTATION: count any week with no row as missed — every player in the league
    gains one missed game, uniformly, and it reads as a real durability signal."""
    # BUF's bye is week 7: nobody on BUF has a row that week.
    rows = season_of("g1", [w for w in range(1, 18) if w != 7])
    out, _ = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    p = out["s1"]
    assert p["byes"][2024] == [7]
    assert p["missed"][2024] == [], "the bye is not absence"
    assert p["games"][2024] == 16


def test_a_MISSED_WEEK_that_is_NOT_the_bye_is_counted():
    """The other side: a real absence, with a team-mate playing that week to prove
    the team had a game. MUTATION: treat every gap as a bye and nobody is ever hurt."""
    rows = (season_of("g1", [w for w in range(1, 18) if w not in (7, 10)])
            + season_of("g2", [w for w in range(1, 18) if w != 7]))
    out, _ = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    assert out["s1"]["byes"][2024] == [7]
    assert out["s1"]["missed"][2024] == [10]


# ── E[weeks out | injured], and the censoring ───────────────────────────────
def test_a_COMPLETED_absence_is_measured_end_to_end():
    """Missed 9-11, played again in 12: a three-week absence that we watched finish."""
    rows = (season_of("g1", [w for w in range(1, 18) if w not in (9, 10, 11)])
            + season_of("g2", range(1, 18)))
    out, _ = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    sp = out["s1"]["spells"][2024]
    assert len(sp) == 1
    assert sp[0]["weeks"] == 3 and sp[0]["censored"] is False


def test_an_absence_RUNNING_TO_THE_LAST_WEEK_is_CENSORED_not_a_short_injury():
    """THE STATISTICAL ONE. Missing 15-17 is observed as three weeks, but the injury
    did not end in week 17 — the season did. MUTATION: mark it complete; the mean
    absorbs a truncated observation as if it were a full one, and it understates the
    severe injuries this term exists to price."""
    rows = (season_of("g1", range(1, 15)) + season_of("g2", range(1, 18)))
    out, _ = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    sp = out["s1"]["spells"][2024]
    assert len(sp) == 1 and sp[0]["weeks"] == 3
    assert sp[0]["censored"] is True, "the season ended, not the injury"


def test_weeks_out_by_position_REPORTS_THE_CENSORED_FRACTION_not_one_mean():
    """MUTATION: average completed and censored together — one number that is biased
    low by an amount nothing in the output discloses."""
    rows = (season_of("g1", [w for w in range(1, 18) if w not in (5, 6)])
            + season_of("g2", range(1, 15)))
    out, rep = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    wo = D.weeks_out_by_position(out, min_n=1)
    rb = wo["RB"]
    assert rb["completed_n"] == 1 and rb["censored_n"] == 1
    assert rb["mean_completed"] == 2.0
    assert rb["censored_fraction"] == 0.5
    assert "censor" in rb["caveat"].lower()


# ── absent is not zero, and the leak guard ─────────────────────────────────
def test_a_player_with_NO_ROWS_AT_ALL_is_absent_not_zero_games():
    """He may have been out all year, or not in the league. Scoring him 0 games
    conflates the two. MUTATION: emit games=0 — every non-NFL id becomes the least
    durable player on the board."""
    out, _ = D.durability(season_of("g1", range(1, 18)), [2024], CW,
                          before_season=2025, last_week=17)
    assert "s2" not in out


def test_a_THIN_position_cell_carries_a_STATUS_not_a_number():
    rows = season_of("g1", [w for w in range(1, 18) if w != 5])
    out, _ = D.durability(rows, [2024], CW, before_season=2025, last_week=17)
    wo = D.weeks_out_by_position(out, min_n=10)
    assert wo["RB"]["status"] == "unmeasurable" and wo["RB"]["mean_completed"] is None


def test_THE_DRAFTED_SEASON_IS_REFUSED():
    try:
        D.durability(season_of("g1", range(1, 18)), [2024], CW, before_season=2024)
    except ValueError as e:
        assert "before" in str(e).lower() or "prior" in str(e).lower()
    else:
        raise AssertionError("the drafted season must be refused")
