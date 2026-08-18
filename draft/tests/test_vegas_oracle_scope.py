# TERRITORY: D
"""WHAT THE EXP-WEEKLY-ENV ORACLE ACTUALLY BOUNDS — pinned structurally.

The "+0.23 perfect-foresight ceiling" is stamped inside
`vegas_lines_2021_2026.json`'s `_note` as "context every Vegas feature must be
read against", and from there into seven other places
(`draft/audit/vegas_oracle_row18_2026-08-17.md` §6). It has been used to tell
Cory not to buy historical betting data.

DEFECT GUARDED: that note says "perfect-foresight TEAM game-total ceiling". The
code computes a GAME total and hands it to BOTH teams — 208 of 208 games in
2023 and 208 of 208 in 2024. An oracle that cannot tell a 45-point offence from
the 3-point one it played does not bound a team-level feature, and a
spread-derived implied team total (which the Vegas store exists to provide) is
not in the class it bounds at all.

WHY THIS IS A TEST AND NOT A COMMENT: DRAFT-WEEK-BRIEF §5 records that a
TEXTUAL citation-sweep for exactly this class was built and then deleted,
because it could not fail honestly — this repo keeps a constant's obituary in
the comments beside its replacement, so "is the cited number still present?"
cannot distinguish the two. So this check is structural. It reads the oracle's
real behaviour out of exp_weekly_env.py, which means the day someone makes the
oracle team-aware, THIS TEST FAILS and sends them to the register row that
lists every citation needing to move with it. Code and claim fail together.

Run: python -m pytest draft/tests/test_vegas_oracle_scope.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import exp_weekly_env as E  # noqa: E402

# One game, maximally lopsided: 45-3. Any team-aware oracle must separate these
# two; the shipped game-total oracle cannot.
BLOWOUT = [
    {"game_id": "g1", "team": "AAA", "opp": "BBB", "week": 5,
     "plays": 60, "neutral_plays": 40, "points_for": 45.0, "points_against": 3.0},
    {"game_id": "g1", "team": "BBB", "opp": "AAA", "week": 5,
     "plays": 60, "neutral_plays": 40, "points_for": 3.0, "points_against": 45.0},
]
# A second, quiet game in the same week, so `mean_total` is a real league mean
# over more than one game rather than a degenerate self-division.
QUIET = [
    {"game_id": "g2", "team": "CCC", "opp": "DDD", "week": 5,
     "plays": 60, "neutral_plays": 40, "points_for": 10.0, "points_against": 6.0},
    {"game_id": "g2", "team": "DDD", "opp": "CCC", "week": 5,
     "plays": 60, "neutral_plays": 40, "points_for": 6.0, "points_against": 10.0},
]


def test_oracle_multiplier_is_game_symmetric_not_team_level():
    """The oracle hands both teams in a game the SAME multiplier, so it carries
    zero information about which side scored. Measured at 208/208 games in each
    of 2023 and 2024 on the committed features artifact; pinned here on a
    fixture so it is provable without egress.

    If this fails, the oracle has become team-aware. That is an improvement, not
    a regression — but DEFECT-REGISTER row 18 lists eight places that quote its
    result as a ceiling, and every one of them must be re-read before this test
    is updated.
    """
    wm = E.multipliers_for_week(BLOWOUT + QUIET, 5)

    assert wm["AAA"]["oracle_total"] == wm["BBB"]["oracle_total"], (
        "the oracle separated a 45-point offence from the 3-point one it played; "
        "it is no longer the game-symmetric bound that DEFECT-REGISTER row 18 and "
        "vegas_lines_2021_2026.json's _note describe"
    )

    # KNOWN-POSITIVE CONTROL — the check above must not be passing because the
    # fixture is flat. A team-level oracle over these identical rows separates
    # the two sides by 15x, so there is real, large team-level signal present
    # that the shipped oracle is throwing away.
    rows = BLOWOUT + QUIET
    mean_team_points = sum(r["points_for"] for r in rows) / len(rows)
    team_level = {r["team"]: r["points_for"] / mean_team_points for r in rows}
    assert team_level["AAA"] != team_level["BBB"]
    assert team_level["AAA"] / team_level["BBB"] == 15.0

    # ...and the discarded signal is not a rounding artifact: the game-symmetric
    # multiplier sits between the two team-level ones, i.e. it is wrong for BOTH
    # sides, not merely imprecise for one.
    shared = wm["AAA"]["oracle_total"]
    assert team_level["BBB"] < shared < team_level["AAA"]


def test_a_missing_team_rides_the_baseline_and_still_counts_in_mae():
    """DEFECT GUARDED (Rule 3d question 2): exp_weekly_env.py:258 resolves the
    multiplier with three chained .get()s ending in a default of 1.0, so a
    player-week whose team does not join is NOT dropped — it is kept in the MAE
    denominator at exactly "this game was league-average".

    That is why the run can report a clean number over an unknown join rate: a
    failed join and a genuinely average game are arithmetically identical, and
    the experiment records no join counter for any arm. This test pins the
    mechanism so the next person reading a null from this harness knows the
    dilution is silent by construction.
    """
    joined = {"player_id": "p", "week": 5, "points": 12.0, "team": "AAA",
              "baseline": 10.0, "position": "RB", "name": "joined"}
    unjoined = {"player_id": "q", "week": 5, "points": 12.0, "team": "NOPE",
                "baseline": 10.0, "position": "RB", "name": "unjoined"}
    wm = {5: E.multipliers_for_week(BLOWOUT + QUIET, 5)}

    preds = E.project([joined, unjoined], wm, "oracle_total", 1.0)

    # the unjoined row is silently neutral — not dropped, not raised, not logged
    assert preds[1] == unjoined["baseline"]

    # KNOWN-POSITIVE CONTROL — the assertion above would also pass if the oracle
    # were inert for everybody. The joined row must actually move, so the test
    # distinguishes "arrived" from "silently defaulted".
    assert preds[0] != joined["baseline"]

    # and the unjoined row still counts: MAE is over 2 rows, not 1. This is the
    # difference between dilution (effect shrinks, n is unchanged) and a silent
    # inner join (effect intact, n shrinks) — only the latter is visible in an
    # output row count, which is why this one went unnoticed.
    assert E.mae(preds, [joined, unjoined]) == (
        abs(preds[0] - 12.0) + abs(preds[1] - 12.0)) / 2
