# TERRITORY: C
"""TEAM PACE AND PLAYS PER GAME — item 2, the tiebreak signal with no data at all.

Every other signal Cory named is already on the board: target_share,
opportunity_share, wopr, age, years_exp. Pace is the one with nothing behind it, and
it is the denominator under all of them — a player's share is a share OF something,
and two backs with identical shares on offences running 68 and 58 plays a game are
not the same player.

THE MEASUREMENT THIS FILE IS SHAPED AROUND, and it is the whole difficulty: RAW
PLAYS PER GAME IS NOT PACE. A team that trails all season throws to catch up and runs
more plays; a team that leads kneels the clock away. Ranking offences by raw volume
partly ranks them by how badly they were losing, and then recommends the players on
bad teams. So neutral-script volume is measured alongside it and the two are reported
separately rather than blended into one number nobody can interrogate.

Run: python3 -m pytest draft/tests/test_nflverse_pace.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_pace as P  # noqa: E402


# `min_games=1` in the counting tests is deliberate: they are about WHICH ROWS
# COUNT, and the games bar is exercised on its own below. Leaving the default in
# made every one of them fail as `unmeasurable` for a reason unrelated to what it
# was asserting — which is a fixture that cannot see its own subject.
def play(team, game, play_type="pass", diff=0, season=2024, **kw):
    r = {"posteam": team, "game_id": game, "play_type": play_type,
         "season": season, "score_differential": diff,
         "qb_kneel": 0, "qb_spike": 0}
    r.update(kw)
    return r


# ── what counts as a play ───────────────────────────────────────────────────
def test_only_SCRIMMAGE_plays_count():
    """pbp rows include punts, kickoffs, field goals, extra points and no_play
    penalty rows. MUTATION: count every row — the ranking becomes 'who kicked and
    got flagged most', and special teams have nothing to do with an offence's volume."""
    rows = ([play("BUF", "g1", "pass")] * 40 + [play("BUF", "g1", "run")] * 20
            + [play("BUF", "g1", t) for t in ("punt", "kickoff", "field_goal",
                                              "extra_point", "no_play")])
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=1)
    assert out["BUF"]["plays_per_game"] == 60.0, out["BUF"]


def test_a_KNEEL_or_SPIKE_is_not_an_offensive_play():
    """Both are clock management and both are typed as run/pass in pbp. A team that
    leads a lot kneels a lot, so counting them rewards exactly the offences that
    stopped playing. MUTATION: count them — pace inflates for the best teams."""
    rows = ([play("KC", "g1", "run")] * 50
            + [play("KC", "g1", "run", qb_kneel=1)] * 6
            + [play("KC", "g1", "pass", qb_spike=1)] * 2)
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=1)
    assert out["KC"]["plays_per_game"] == 50.0


def test_the_team_is_the_one_ON_OFFENCE():
    """`posteam`, not home_team. MUTATION: key on home_team and every road drive is
    credited to the wrong offence — the numbers stay plausible and are half wrong."""
    rows = [play("BUF", "g1", "pass", home_team="MIA") for _ in range(30)]
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=1)
    assert "BUF" in out and "MIA" not in out


def test_the_denominator_is_GAMES_not_rows():
    """MUTATION: divide by drives, or report the raw total. A team with a bye or a
    missing week reads as slow purely because it played fewer games."""
    rows = ([play("BUF", "g1")] * 60 + [play("BUF", "g2")] * 40)
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=1)
    assert out["BUF"]["games"] == 2 and out["BUF"]["plays_per_game"] == 50.0


# ── pace vs game script, which is the point ─────────────────────────────────
def test_NEUTRAL_pace_excludes_blowout_snaps():
    """THE ONE THAT MATTERS. A team down 24 runs a two-minute offence for a quarter,
    and its raw volume says 'fast'. MUTATION: report raw only — the pace ranking
    becomes partly a ranking of who was losing, and the tiebreak recommends players
    on bad offences."""
    rows = ([play("CHI", "g1", "pass", diff=-28)] * 40      # garbage time
            + [play("CHI", "g1", "pass", diff=0)] * 20)     # neutral
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=1)
    assert out["CHI"]["plays_per_game"] == 60.0
    assert out["CHI"]["neutral_plays_per_game"] == 20.0
    assert out["CHI"]["neutral_share"] < 0.5


def test_the_pass_rate_is_reported_and_is_NEUTRAL_too():
    """Raw pass rate is the most script-contaminated number on the page — trailing
    teams pass. A neutral pass rate is what actually predicts next year's target
    volume. MUTATION: report raw pass rate alone."""
    rows = ([play("CIN", "g1", "pass", diff=-21)] * 30
            + [play("CIN", "g1", "pass", diff=0)] * 10
            + [play("CIN", "g1", "run", diff=0)] * 10)
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=1)
    assert abs(out["CIN"]["pass_rate"] - 40 / 50) < 1e-9
    assert abs(out["CIN"]["neutral_pass_rate"] - 0.5) < 1e-9


# ── absent is not zero ──────────────────────────────────────────────────────
def test_a_frame_with_NO_play_type_REFUSES_rather_than_counting_everything():
    """Without `play_type` every row looks like a scrimmage play, so every team's
    pace inflates by roughly the special-teams rate — uniformly enough to look
    plausible. MUTATION: fall through and count rows."""
    rows = [{"posteam": "BUF", "game_id": "g1", "season": 2024} for _ in range(50)]
    out, rep = P.team_pace(rows, [2024], before_season=2025)
    assert out == {}
    assert rep["usable"] is False and "play_type" in rep["why"]


def test_a_team_with_TOO_FEW_GAMES_carries_a_STATUS_not_a_number():
    """One game is not a pace. MUTATION: emit it — a team seen once ranks alongside
    teams measured over seventeen, and nothing says which is which."""
    rows = [play("NYJ", "g1")] * 60
    out, _ = P.team_pace(rows, [2024], before_season=2025, min_games=4)
    assert out["NYJ"]["status"] == "unmeasurable"
    assert out["NYJ"]["plays_per_game"] is None


# ── the leak guard, same rule as usage and variance ─────────────────────────
def test_THE_DRAFTED_SEASON_IS_REFUSED():
    """Pace taken from the season being replayed is an outcome, not a prior — the
    same rule `usage_shares` and `weekly_variance` already enforce."""
    rows = [play("BUF", "g1", season=2024)] * 60
    try:
        P.team_pace(rows, [2024], before_season=2024)
    except ValueError as e:
        assert "before" in str(e).lower() or "prior" in str(e).lower()
    else:
        raise AssertionError("the drafted season must be refused")
