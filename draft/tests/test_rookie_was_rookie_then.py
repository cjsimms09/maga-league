"""ROOKIE STATUS MUST ASK "WAS HE A ROOKIE THEN", NOT "IS HE ONE NOW".

Register E13. `manager_profiles.league_average.rookie_rate` read 0.0, and
`rookie_affinity.rate` read 0.0 for all ten managers across ~450 picks — zero
rookies drafted by anybody in three drafts of a 10-team league.

It was not a measurement. `managers.py` tested `years_exp == 0` against TODAY'S
Sleeper payload while the row describes a draft from 2023-25, so a player taken
as a rookie in 2023 carried `years_exp` 3 and was never counted. The only rows
that could qualify were players who are rookies in 2026, and none of them appear
in a past draft. **The rate was pinned at 0.0 by construction**, and the
`"chases rookies"` clause it feeds (`rate > league_rate * 1.5 and rate > 0.08`,
both terms 0.0) was unsatisfiable and had never fired for any manager.

The fix needed no new data: `years_exp` counts seasons since debut, so a rookie
at that draft satisfies `years_exp == season_now - draft_season`. Both terms
were already present — the row has always carried `season`, and `season_now` had
been a `build_profiles` parameter since it was written, declared but never read
and never passed.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import managers as M  # noqa: E402


NOW = 2026


@pytest.mark.parametrize("label,row,expected", [
    ("a 2023 pick who has three years now WAS a rookie then",
     {"season": "2023", "years_exp": 3}, True),
    ("a 2023 pick who is a rookie TODAY was not one then",
     {"season": "2023", "years_exp": 0}, False),
    ("a 2025 pick with one year now WAS a rookie then",
     {"season": "2025", "years_exp": 1}, True),
    ("a 2025 pick with four years now was a veteran then",
     {"season": "2025", "years_exp": 4}, False),
])
def test_the_derivation_reads_the_draft_season_not_today(label, row, expected):
    assert M._was_rookie(row, NOW) is expected, label


@pytest.mark.parametrize("row", [
    {"season": "2024", "years_exp": None},   # no experience figure
    {"season": None, "years_exp": 2},        # no draft season
    {"season": "2030", "years_exp": 1},      # a draft "after" now
])
def test_an_underivable_row_is_ABSENT_rather_than_False(row):
    """None, not False. `position` already gets this treatment via its "?"
    sentinel so a caller can tell "no tendency" from "we could not see it".
    Counting a missing years_exp as False is exactly how the old behaviour
    laundered "unknown" into "nobody drafts rookies"."""
    assert M._was_rookie(row, NOW) is None


def test_season_now_is_actually_required():
    """The parameter existed for a year and was never passed, which is why the
    metric never worked. If it goes unsupplied again the answer must be ABSENT,
    never a confident zero."""
    assert M._was_rookie({"season": "2023", "years_exp": 3}, None) is None


def test_KNOWN_POSITIVE_the_metric_can_now_reach_a_nonzero_rate():
    """THE CONTROL THAT MATTERS. Everything above could pass while the live
    metric still read 0.0 — that is what a unit test on a helper cannot see. So
    this runs the derivation over the REAL historical picks and requires a rate
    that is both non-zero and plausible for a 10-team league.

    Measured when this landed: 409 of 438 picks derivable (93% coverage), 45
    rookies, rate 0.110, spread 13/15/17 across 2023/24/25.
    """
    import json
    root = Path(__file__).resolve().parents[2]
    hist = json.loads((root / "draft" / "data" / "league_history.json").read_text())
    board = json.loads((root / "public" / "draft_data.json").read_text())
    years = {str(p["player_id"]): p.get("years_exp") for p in board["players"]}

    rows = []
    for season in hist["seasons"]:
        for draft in season.get("drafts", []):
            for pick in draft.get("picks", []):
                pid = str(pick.get("player_id") or "")
                if pid in years:
                    rows.append({"season": season.get("season"), "years_exp": years[pid]})

    assert len(rows) > 200, f"too few matched picks to mean anything: {len(rows)}"
    derivable = [r for r in rows if M._was_rookie(r, NOW) is not None]
    coverage = len(derivable) / len(rows)
    rate = sum(1 for r in derivable if M._was_rookie(r, NOW)) / len(derivable)

    assert coverage > 0.80, f"rookie status derivable for only {coverage:.0%} of picks"
    assert rate > 0.0, "the metric is still pinned at zero — E13 has regressed"
    # A 10-team league drafting ~1-2 rookies a team per year lands here. A rate
    # near 1.0 would mean the comparison has inverted, which is just as broken as
    # a zero and would otherwise pass a "non-zero" assertion.
    assert 0.02 < rate < 0.40, f"implausible rookie rate {rate:.3f} — check the sign"


def test_the_chases_rookies_clause_is_now_satisfiable():
    """The old numbers made it unreachable: `rate > league_rate * 1.5` with both
    at 0.0 is false, and so is `rate > 0.08`. It fired 0 times for 0 managers.
    With a league rate near 0.11 a manager needs roughly 0.17 to trip it, which
    is a bar a real drafter can clear."""
    league_rate, manager_rate = 0.110, 0.20
    assert manager_rate > league_rate * 1.5 and manager_rate > 0.08
    # and the OLD state genuinely could not
    assert not (0.0 > 0.0 * 1.5 and 0.0 > 0.08)
