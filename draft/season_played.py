# TERRITORY: A
"""HAS THIS SEASON ACTUALLY BEEN PLAYED? — the one definition, read by both
money paths.

WHY THIS FILE EXISTS. On 2026-08-25 the Money Board credited Cory with $2,550
and SECOND PLACE on the career money board. The honest figure is $800 and
sixth. $1,750 of that was money for a season that has not started.

The mechanism, in one line each:

  * `league_history.json` carries the 2026 season as an eighteen-week SCHEDULE.
    Every one of its 180 team-weeks scores exactly `0.0`, because no game has
    been played.
  * `money_history.analyse()` graded any season with a non-empty `weeks` dict.
    Eighteen weeks is non-empty.
  * The weekly high is `max(scored, key=points)`. On a ten-way tie at 0.0,
    `max` returns the FIRST roster — which in 2026 is roster 1, which is Cory.
    Fifteen paying weeks x $100 = $1,500, all to one seat, for zero football.

MEASURED, with the 2026 season removed as a control: the board distributes
$13,375 against era-correct pots of $11,500. The $1,875 difference is entirely
the unplayed season — $1,500 weekly high and $375 regular season.

AND BOTH PATHS HAD IT. `money_grade.grade_actual(.., "2026")` independently
returns weekly_high $1,500 + regular_season $375. The two surfaces are supposed
to be an independent cross-check of each other and they AGREED on the wrong
answer — `test_data_spine` only caught it because its own `SEASONS` list stops
at 2025, i.e. by accident rather than by design. **A cross-surface
reconciliation is blind to a defect both surfaces share.** That is why the gate
below is ONE definition imported by both rather than a copy in each: register
313's ruling, applied to money.

THE PREDICATE, and why it is this one. "Has a game been played" is not "does a
week exist" and not "is the week list long enough" — a schedule is published
before kickoff and a bye week is legitimately empty. It is: does ANY team in
ANY week have a non-zero score. Nothing else distinguishes a season that has
not started from one that has, and a season where literally nobody has scored a
point cannot have a weekly-high winner, a standings order, or a payout.

Deliberately NOT a date check. The season's own scores are the evidence; a
clock is a second source that can disagree with them, and this repo has spent a
week finding condition-bound rules whose condition expired.

Register 338.
"""
from __future__ import annotations


def has_been_played(season: dict) -> bool:
    """True when at least one team has scored at least one point in the season.

    A season that fails this is a SCHEDULE, not a result, and no money may be
    assigned from it.
    """
    for entries in (season.get("weeks") or {}).values():
        for team in entries or []:
            pts = team.get("points")
            if isinstance(pts, (int, float)) and pts:
                return True
    return False


def played_seasons(seasons) -> dict:
    """`{key: season}` filtered to the seasons that have actually been played.

    Accepts the dict form `money_history` uses and the list form the raw store
    carries, because the two money paths normalise at different points and a
    helper that only speaks one of them would just move the drift somewhere
    else.
    """
    if isinstance(seasons, list):
        seasons = {str(s.get("season") or i): s for i, s in enumerate(seasons)}
    return {k: s for k, s in (seasons or {}).items() if has_been_played(s)}


def week_has_a_single_high(entries) -> bool:
    """True when exactly one team holds the top score, and that score is above 0.

    The second half of the same defect. `max()` breaks a tie silently toward
    whichever roster the list happens to put first, so a tied week does not
    return "no winner", it returns "the lowest roster id" — with a dollar sign
    on it. MEASURED across 2023-2025: **zero** weeks have a tied high, so
    refusing them costs nothing on real football; 2026 has eighteen of eighteen.
    """
    scored = [t.get("points") for t in (entries or [])
              if isinstance(t.get("points"), (int, float))]
    if not scored:
        return False
    hi = max(scored)
    return hi > 0 and scored.count(hi) == 1
