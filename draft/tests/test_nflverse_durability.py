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


# ── A HISTORY IS NOT A FORECAST ─────────────────────────────────────────────
#
# MEASURED ON REAL 2023-24 DATA, 112 draftable players (adp <= 150) matched:
# median |player - position constant| is 1.00 games, 43% differ by more than one
# and 18% by more than three. The variation A asked about is real.
#
# AND THE RAW MEAN IS NOT A DROP-IN REPLACEMENT, which is the part that would
# have hurt. `expected_games` averages the seasons observed and nothing else, so
# Jonathon Brooks — one rookie season, three games, torn ACL — comes out at 3.00
# against an RB prior of 14.2, and McCaffrey's [16, 4] averages to 10.0. Those
# are HISTORIES. Using them as 2026 expectations systematically under-prices
# exactly the players coming off an injury year, which is the population where
# injury is least persistent and the market has already applied its own discount.
#
# Only two seasons are available at all (import_weekly_data 404s for 2025), so
# these are two-point means. The thinner the evidence the harder it must be
# pulled toward the prior, and that is what shrinkage is.

def test_shrinkage_pulls_a_THIN_history_toward_the_position_prior():
    """One season of 4 games against a 14.2 prior, k=1: (1*4 + 1*14.2)/2 = 9.1.
    MUTATION: return the raw mean — a rookie's torn-ACL season becomes his 2026
    expectation, and the board under-prices every post-injury player at once."""
    out = {"s1": {"games": {2024: 4}, "position": "RB",
                  "byes": {2024: []}, "missed": {2024: []}, "spells": {2024: []}}}
    eg = D.expected_games(out, position_prior={"RB": 14.2}, shrink_k=1.0)
    assert abs(eg["s1"]["expected_games"] - 9.1) < 1e-6, eg
    assert eg["s1"]["status"] == "shrunk"


def test_MORE_SEASONS_shrink_LESS():
    """The whole point of weighting by evidence. Four seasons averaging 4 games is a
    player who is genuinely unavailable; one season of 4 is a player we barely saw.
    MUTATION: shrink by a constant — a four-season history is discounted as hard as
    a one-season one and the term stops carrying information."""
    mk = lambda gs: {"games": gs, "position": "RB", "byes": {}, "missed": {}, "spells": {}}
    thin  = D.expected_games({"s": mk({2024: 4})}, {"RB": 14.2}, shrink_k=1.0)
    thick = D.expected_games({"s": mk({2021: 4, 2022: 4, 2023: 4, 2024: 4})},
                             {"RB": 14.2}, shrink_k=1.0)
    assert thick["s"]["expected_games"] < thin["s"]["expected_games"]
    assert abs(thick["s"]["expected_games"] - (4 * 4 + 14.2) / 5) < 1e-6


def test_the_RAW_MEAN_SURVIVES_beside_the_shrunk_one():
    """A consumer must be able to tell a measurement from a blend — that distinction
    is the reason this module reports statuses at all. MUTATION: overwrite the raw
    value; the blend then looks exactly like an observation."""
    out = {"s": {"games": {2024: 4}, "position": "RB",
                 "byes": {}, "missed": {}, "spells": {}}}
    eg = D.expected_games(out, position_prior={"RB": 14.2}, shrink_k=1.0)
    assert eg["s"]["observed_games"] == 4.0
    assert eg["s"]["seasons_observed"] == 1
    assert eg["s"]["prior"] == 14.2


def test_NO_PRIOR_for_the_position_means_NO_SHRINKAGE_and_it_says_so():
    """Rule 13f. MUTATION: fall through to the raw mean silently — the caller
    believes every value was shrunk and one quietly was not."""
    out = {"s": {"games": {2024: 4}, "position": "FB",
                 "byes": {}, "missed": {}, "spells": {}}}
    eg = D.expected_games(out, position_prior={"RB": 14.2}, shrink_k=1.0)
    assert eg["s"]["status"] == "measured_unshrunk"
    assert eg["s"]["expected_games"] == 4.0
    assert "no prior" in eg["s"]["basis"].lower()


def test_WITHOUT_shrink_k_the_behaviour_is_UNCHANGED():
    """Additive, like every other option I have added this session: the existing
    raw-mean contract is preserved so nothing downstream moves without asking.
    MUTATION: shrink by default — a caller's numbers change under them."""
    out = {"s": {"games": {2024: 4}, "position": "RB",
                 "byes": {}, "missed": {}, "spells": {}}}
    eg = D.expected_games(out, position_prior={"RB": 14.2})
    assert eg["s"]["expected_games"] == 4.0 and eg["s"]["status"] == "measured"


# ── RECOVERING A SEASON THE LIBRARY WILL NOT SERVE, WITHOUT PRETENDING ──────
#
# `import_weekly_data` 404s for 2025 — the season CLOSEST to the board we draft
# on, so losing it does not merely shrink n, it re-weights every durability
# figure toward older conditions.
#
# `games` is `len(weeks the player appeared)` and NOTHING ELSE — a bye changes
# `byes`/`missed`/`spells` and never the count. So games-played for 2025 can come
# from the weekly POINTS store, which is keyed by our ids and needs no team.
#
# GATED, not assumed: rebuilt 2024 from the store and required it to reproduce
# the library exactly before trusting the path for a season that cannot be
# checked. 485 players in both, 485 agree, zero disagreements.
#
# WHAT IT CANNOT GIVE IS BYES, and that is the whole reason this is a separate
# function instead of a fabricated frame. Without team there is no team-week set,
# so `missed` and `spells` are UNDERIVABLE for that season — and the dangerous
# failure is not an error, it is a season silently contributing "nobody missed
# time" to the injury statistics.

def test_a_games_only_season_ADDS_GAMES_and_REFUSES_to_invent_spells():
    """MUTATION: fabricate empty byes/missed/spells for the merged season — then
    `weeks_out_by_position` counts a season nobody examined as a season in which
    nobody was hurt, and the injury rate is diluted by construction."""
    out = {"s1": {"position": "RB", "games": {2024: 15}, "byes": {2024: [7]},
                  "missed": {2024: [3]}, "spells": {2024: [{"weeks": 1, "censored": False}]}}}
    D.merge_games_only(out, 2025, {"s1": 11})
    assert out["s1"]["games"] == {2024: 15, 2025: 11}
    assert 2025 not in out["s1"]["spells"], "a season with no team has no spells"
    assert 2025 not in out["s1"]["missed"] and 2025 not in out["s1"]["byes"]
    assert out["s1"]["games_only_seasons"] == [2025]


def test_the_injury_statistics_IGNORE_a_games_only_season():
    """The consequence the marker exists for, asserted at the consumer.
    MUTATION: let the merged season through — one spell becomes one spell across
    two seasons and E[weeks out] halves without anything saying so."""
    out = {"s1": {"position": "RB", "games": {2024: 15}, "byes": {2024: []},
                  "missed": {2024: [3]},
                  "spells": {2024: [{"weeks": 2, "censored": False}]}}}
    before = D.weeks_out_by_position(out, min_n=1)["RB"]
    D.merge_games_only(out, 2025, {"s1": 11})
    after = D.weeks_out_by_position(out, min_n=1)["RB"]
    assert before["completed_n"] == after["completed_n"] == 1
    assert before["mean_completed"] == after["mean_completed"] == 2.0


def test_merging_REFUSES_to_overwrite_a_season_that_was_fully_derived():
    """MUTATION: overwrite — a real record with byes and spells is silently
    replaced by a count, and the loss is invisible afterwards."""
    out = {"s1": {"position": "RB", "games": {2024: 15}, "byes": {2024: [7]},
                  "missed": {2024: [3]}, "spells": {2024: []}}}
    try:
        D.merge_games_only(out, 2024, {"s1": 9})
    except ValueError as e:
        assert "2024" in str(e) and "already" in str(e).lower()
    else:
        raise AssertionError("overwriting a fully derived season must be refused")


def test_a_player_the_merge_has_never_seen_is_ADDED_with_no_history_claimed():
    """He played in the recovered season and nowhere else we hold. MUTATION: skip
    him — the recovered season silently covers only players who already existed,
    which is exactly the population least likely to need recovering."""
    out = {}
    D.merge_games_only(out, 2025, {"newguy": 12})
    assert out["newguy"]["games"] == {2025: 12}
    assert out["newguy"]["spells"] == {} and out["newguy"]["position"] is None
    assert out["newguy"]["games_only_seasons"] == [2025]
