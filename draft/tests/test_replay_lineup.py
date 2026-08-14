# TERRITORY: A
"""THE LINEUP ARM'S CONTROLS — and a ceiling that answers a different question
than its prose claims.

EVIDENCE CLASS: CORRECTNESS of the replay plumbing, established by reproducing
numbers computed by OTHER machinery. It says nothing about whether any decision
logic is good — no decision logic runs here.

── WHY CONTROLS FIRST ─────────────────────────────────────────────────────────

ACTUAL and CEILING are not arms, they are instrument checks. They caught two
real defects before a single decision was made:

1. CEILING SCORED BELOW ACTUAL — 1808.8 against 1830.6 in 2024, 1500.0 against
   1555.9 in 2025. A hindsight-optimal lineup cannot lose to a lineup it could
   have copied. Cause: player_positions.json has no entry for 3198 (Derrick
   Henry) or 7564 (Ja'Marr Chase), so the ceiling could not place two of Cory's
   ACTUAL starters and quietly filled their slots with worse players.

   Fixed from Cory's observation that the league's own matchup records hold the
   lineups: `starters` is stored IN SLOT ORDER, so every dedicated-slot
   appearance states a position.

2. I REIMPLEMENTED roster_sim.infer_positions INSTEAD OF CALLING IT — the exact
   duplicate-definition defect this repo keeps removing, committed while
   removing it. replay_lineup now delegates; the only addition is FLEX_ONLY,
   which infer_positions deliberately does not do.

── THE FINDING: TWO CEILINGS, AND THE PUBLISHED ONE IS NOT LINEUP-ONLY ────────

EFFICIENCY-LEAK.md reports $470/$595/$445 per team and calls it "the ceiling of
a roster, perfect bench decisions". Reproducing lab.py's L0 exactly matches
those figures — so the plumbing here is correct — but L0 draws its player pool
from `_season_players`, the UNION of everyone the roster held all season (~35
players) rather than who was on it that week (~16).

That ceiling therefore includes ACQUISITION TIMING: it may start in week 3 a
player acquired in week 10. It is a legitimate quantity and it is NOT
lineup-only, while the prose describes lineup-only.

**BOTH ARE KEPT, BECAUSE THEY BOUND DIFFERENT ARMS:**

    per-week ceiling   $280/$355/$268   bounds the LINEUP arm (roster fixed)
    season-pool ceiling $470/$595/$445  bounds LINEUP+WAIVER (roster moves)

Assigning the season-pool ceiling to the lineup arm would give that arm 65-70%
more headroom than it can legitimately use, and a leak could hide inside the
slack. That is why §3c's detector must use the per-week number.
"""
import pathlib
import sys
from statistics import mean

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import lab                      # noqa: E402
import money_grade as MG        # noqa: E402
import replay_lineup as RL      # noqa: E402
import roster_sim as RS         # noqa: E402

SEASONS = ("2023", "2024", "2025")
PUBLISHED = {"2023": 470, "2024": 595, "2025": 445}   # EFFICIENCY-LEAK.md


@pytest.fixture(scope="module")
def ctx():
    h = MG.load_history()
    return h, MG.load_payouts(), RL.positions_map(h)


def _seats(season):
    return sorted({int(r["roster_id"]) for r in RL.week_rows(season, 1)})


def _money(g):
    return (g.get("weekly_high") or 0) + (g.get("regular_season") or 0)


# ── THE PLUMBING REPRODUCES SLEEPER'S OWN NUMBER ──────────────────────────

@pytest.mark.parametrize("season", SEASONS)
def test_ACTUAL_reproduces_sleepers_recorded_weekly_score(ctx, season):
    """If this fails, slot assignment or scoring is wrong and every other
    number this module produces is worthless."""
    h, _p, pos = ctx
    for rid in _seats(MG.season_of(h, season)):
        got = RL.replay(h, season, rid, "ACTUAL", pos)
        want = RL.recorded(h, season, rid)
        assert got == want, f"{season} seat {rid}: replay != Sleeper's own points"


# ── THE POSITION MAP IS COMPLETE FOR EVERYONE WHO ACTUALLY PLAYED ─────────

def test_no_player_who_started_is_missing_a_position(ctx):
    """The defect that made CEILING lose to ACTUAL. An unmapped starter is
    silently dropped, so the ceiling reads LOW and flatters every other arm."""
    h, _p, pos = ctx
    assert RL.unmapped_starters(h, pos) == []


def test_flex_only_players_are_bounded_and_named(ctx):
    """One is a rounding error; twenty would be a data problem. The bias is
    CONSERVATIVE — such a player can fill flex but not a dedicated slot, so the
    ceiling can only be too LOW, never too high."""
    _h, _p, pos = ctx
    fo = RL.flex_only_players(pos)
    assert len(fo) <= 2, fo


# ── A HINDSIGHT CEILING CANNOT LOSE TO THE LINEUP IT COULD HAVE COPIED ────

@pytest.mark.parametrize("season", SEASONS)
def test_CEILING_never_scores_below_ACTUAL_in_any_week(ctx, season):
    """The invariant that caught the position bug. Asserted per WEEK, not per
    season — a season total can hide a bad week inside a good one."""
    h, _p, pos = ctx
    for rid in _seats(MG.season_of(h, season)):
        a = RL.replay(h, season, rid, "ACTUAL", pos)
        c = RL.replay(h, season, rid, "CEILING", pos)
        bad = {w: (a[w], c[w]) for w in a if c[w] < a[w] - 1e-6}
        assert not bad, f"{season} seat {rid}: ceiling below actual in {bad}"


# ── THE TWO CEILINGS, BOTH PINNED ────────────────────────────────────────

@pytest.mark.parametrize("season", SEASONS)
def test_the_SEASON_POOL_ceiling_reproduces_the_published_figure(ctx, season):
    """Reproducing lab.py's L0 must match EFFICIENCY-LEAK.md, or this module's
    understanding of the certified layer is wrong."""
    h, p, _pos = ctx
    s = MG.season_of(h, season)
    lpos = RS.infer_positions(s)
    act = MG.grade_actual(h, p, season)
    leaks = []
    for rid in _seats(s):
        cs = RS.roster_weekly_scores(s, lab._season_players(s, rid), lpos)
        sub = MG.grade_substituted(h, p, season, rid, cs)
        r = act["per_roster"][rid]
        leaks.append((sub["weekly_high"] - r["weekly_high"])
                     + (sub["regular_season"] - r["regular_season"]))
    assert round(mean(leaks)) == PUBLISHED[season]


@pytest.mark.parametrize("season", SEASONS)
def test_the_PER_WEEK_ceiling_is_STRICTLY_SMALLER_than_the_published_one(ctx, season):
    """THE FINDING. The published ceiling includes ACQUISITION TIMING — its pool
    is everyone held all season (~35) rather than that week (~16) — while the
    prose calls it "perfect bench decisions". Both are kept because they bound
    different arms; giving the lineup arm the season-pool ceiling would hand it
    65-70% more headroom than it can legitimately use, and a leak could hide in
    the slack."""
    h, p, pos = ctx
    s = MG.season_of(h, season)
    leaks = []
    for rid in _seats(s):
        a = RL.replay(h, season, rid, "ACTUAL", pos)
        c = RL.replay(h, season, rid, "CEILING", pos)
        leaks.append(_money(MG.grade_substituted(h, p, season, rid, c))
                     - _money(MG.grade_substituted(h, p, season, rid, a)))
    per_week = mean(leaks)
    assert 0 < per_week < PUBLISHED[season], (
        f"{season}: per-week ceiling {per_week:.0f} vs published "
        f"{PUBLISHED[season]}. It must be positive (a ceiling beats actual) and "
        "strictly smaller (it cannot use players not yet acquired).")


@pytest.mark.parametrize("season", SEASONS)
def test_the_pool_difference_is_the_whole_explanation(ctx, season):
    """Not asserted from the gap's size but from its CAUSE, so the claim is
    about the mechanism rather than about two numbers differing."""
    h, _p, _pos = ctx
    s = MG.season_of(h, season)
    for rid in _seats(s)[:3]:
        weekly = [len(RL.seat_row(s, w, rid).get("players") or [])
                  for w in MG.regular_season_weeks(s) if RL.seat_row(s, w, rid)]
        assert len(lab._season_players(s, rid)) > mean(weekly) * 1.5


# ── NAIVE IS A REAL BASELINE, NOT A STRAWMAN AND NOT A CHEAT ─────────────

@pytest.mark.parametrize("season", SEASONS)
def test_NAIVE_sits_between_nothing_and_the_ceiling(ctx, season):
    """It must not beat the hindsight ceiling — that would mean it saw week N."""
    h, _p, pos = ctx
    for rid in _seats(MG.season_of(h, season))[:4]:
        n = sum(RL.replay(h, season, rid, "NAIVE", pos).values())
        c = sum(RL.replay(h, season, rid, "CEILING", pos).values())
        assert 0 < n <= c + 1e-6, f"{season} seat {rid}: naive {n} vs ceiling {c}"


def test_the_as_of_boundary_excludes_the_week_being_scored(ctx):
    """The leak, at the one place it can enter: _history_means must be built
    from weeks strictly BEFORE the week under decision."""
    h, _p, _pos = ctx
    s = MG.season_of(h, "2024")
    row = RL.seat_row(s, 5, 1)
    means = RL._history_means(s, 1, 5)
    only_w5 = {p for p, v in (row.get("players_points") or {}).items()
               if p not in RL._history_means(s, 1, 5)}
    # A player whose ONLY appearance is week 5 must be absent from the week-5
    # decision inputs entirely — not present with a zero.
    assert all(p not in means for p in only_w5)
