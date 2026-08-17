# TERRITORY: A
"""LATE-SEASON TRAJECTORY (F7) AS A BOARD COLUMN — additive, never touching a
projection, a ranking, or a weight.

WHY THE COLUMN EXISTS — the ONE measured 50/50 tie-breaker.
`draft/audit/edge_hunt_2026-08-16.md` §3 tested nine pick-time-knowable
features across 259 historical near-ties (2023-25). Eight predicted nothing.
The one that cleared its preregistered bar: **in 176 near-ties the player who
finished the prior season hotter than his own average won 58.0% (Wilson 95%
CI [.506, .650]; two-sided p = .035, Bonferroni ×9 = .31 — a lean, not a
law)** — direction-consistent in both pair sources and at every band, and the
same mechanism the draft replay measured independently (walk-forward boards
under-rank ascending players). A ruled 2026-08-17 (DECISIONS-NEEDED.md, "50/50
TIE-BREAK LEAN: APPLY the prepared diff (§3.1)"): the trajectory fact prints
FIRST in verdict.js tiebreakFacts, and that fact needs this board field. The
verdict.js half is PREPARED at draft/patches/tiebreak_facts_bake.patch (app.js
and verdict.js are owned by a sibling worktree right now); this module is the
data plumbing half, which build.py owns.

THE CONSTRUCTION IS F7's, NOT A NEW ONE. `late_trajectory` = prior-season
late-window points per game (weeks LATE_FROM..17, at least LATE_MIN_GAMES
scored games) minus prior-season points per game — the exact feature the study
graded, with LATE_FROM / LATE_MIN_GAMES imported from
`backtest/own_model_v2.py` (their single home) rather than retyped here.

THE STORE IS THE COMPONENT STORE, DELIBERATELY. A's 2026-08-17 ruling on the
empirical-draft-value findings ordered every availability/games-played
consumer routed to the component stores, because the committed 2025
weekly-points store drops zero-point rows (884 player-weeks; pinned by
`test_2025_points_store_drops_zero_point_rows`). Per-game rates ARE
games-counting, so this module reads
`backtest.fetch_component_stats.scored_weekly_points` under the frozen
scoring table — the same accessor the study itself read through
(`draft_replay_2025.late_rates_of`).

ABSENT STAYS ABSENT. A player with no prior-season rows, or fewer than
LATE_MIN_GAMES scored games in the late window, gets NO key — not None, not
0.0 — mirroring `draft_capital.attach_capital`'s contract, so the verdict.js
fact makes no claim about him ("absent field, no claim, like every fact
here"). `test_late_trajectory.py` proves the attach is additive rather than
trusting this docstring.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

#: weeks 1..LAST_SCORED_WEEK — the study's own season window
#: (draft_replay_2025.LAST_SCORED_WEEK; week 18 is deliberately outside it).
LAST_SCORED_WEEK = 17

#: Rendered evidence for any consumer that surfaces this column — measured
#: strength, never folklore (edge_hunt_2026-08-16 §3, ruled applied 2026-08-17).
EVIDENCE = ("hotter-finish side won 58.0% of 176 historical near-ties, "
            "2023-25 (Wilson 95% CI [.506, .650]; p=.035, Bonferroni x9=.31 "
            "— a lean, not a law)")


def late_trajectory_from_weekly(weekly: dict, *, late_from: int,
                                late_min_games: int,
                                last_week: int = LAST_SCORED_WEEK) -> dict:
    """{pid: late-window ppg − season ppg} from a {pid: {week: points}} map.

    Pure — the F7 arithmetic with no store attached, so the construction is
    testable against a synthetic fixture without monkeypatching the stores.
    A pid with no rows in 1..last_week, or fewer than `late_min_games` rows in
    late_from..last_week, is ABSENT from the result (no claim), exactly as
    `draft_replay_2025.late_rates_of` leaves him out of its map.
    """
    out: dict[str, float] = {}
    for pid, rows in weekly.items():
        weeks = {int(w): float(v) for w, v in rows.items()
                 if 1 <= int(w) <= last_week}
        if not weeks:
            continue
        ppg = sum(weeks.values()) / len(weeks)
        late = [v for w, v in weeks.items() if late_from <= w <= last_week]
        if len(late) < late_min_games:
            continue
        out[str(pid)] = (sum(late) / len(late)) - ppg
    return out


def compute_late_trajectory(season: int) -> dict:
    """{pid: F7 value} for the season BEFORE `season`, from committed stores.

    For the 2026 board this reads the 2025 component store — scored under the
    frozen table so points parity with the graded weekly stores holds (the
    parity is the component stores' own pinned property, not re-proven here).
    """
    from backtest import fetch_component_stats as FCS
    from backtest.own_model_v2 import LATE_FROM, LATE_MIN_GAMES
    weekly = FCS.scored_weekly_points(
        season - 1, FCS.frozen_scoring_table(), LAST_SCORED_WEEK)
    return late_trajectory_from_weekly(
        weekly, late_from=LATE_FROM, late_min_games=LATE_MIN_GAMES)


def attach_late_trajectory(board: list[dict], values: dict) -> dict:
    """Additively write `late_trajectory` onto board rows; return a diagnostic.

    A player with no computed value is left COMPLETELY untouched — no key, not
    None — so "no prior-season late window" stays distinguishable from "flat
    finish (0.0)", which are different facts.
    """
    attached = 0
    for p in board:
        v = values.get(str(p.get("player_id") or ""))
        if v is None:
            continue
        p["late_trajectory"] = round(float(v), 2)
        attached += 1
    return {
        "attached": attached,
        "prior_season_players": len(values),
        "construction": ("F7: prior-season late-window ppg (weeks "
                         "LATE_FROM..17, >= LATE_MIN_GAMES games) minus "
                         "prior-season ppg; constants from "
                         "backtest/own_model_v2.py; component stores, per "
                         "A's 2026-08-17 availability-consumer ruling"),
        "evidence": EVIDENCE,
        "column_is_informational": True,
        "changes_projection_or_ranking": False,
    }
