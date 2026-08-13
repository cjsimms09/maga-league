# TERRITORY: C
"""SEASON STAMPS AT INGEST — the gate against last season reaching this year's board.

Cory, 2026-08-13, HIGH: a player drafted high in 2025 may go late or undrafted in
2026, so any field carrying a prior-season value into a 2026 recommendation is a
silent, plausible-looking error. C stamps at ingest; A builds the refusal in
projections.py. Cory's clarification: *"unless that data IS considered relevant to
this year — the goal is to make sure we are operating off current years projections,
ADPs, and data."*

THAT CLARIFICATION IS WHY THE STAMP HAS THREE VALUES AND NOT TWO. A two-state
stamp forces a lie on the largest group of fields. Sleeper serves `age`,
`years_exp`, `injury_status`, `depth_chart_order` and `team` with no season attached
at all — they are LIVE STATE, correct for 2026 by construction, and there is nothing
in the payload that proves it. Stamping them `2026` would be an assertion dressed as
a measurement, which is the exact failure this program keeps finding. So:

    2026      proven from a season-scoped source (the year was in the request)
    current   live state, no season in the payload, correct by construction
    <year>    explicitly historical, and must say so

A's refusal then rejects any sub-target year that is not declared historical, and
cannot be fooled by a field claiming `2026` that nothing verified.

AND AN UNSTAMPED FIELD IS A VIOLATION, NOT A PASS. That is the whole design: a gate
whose default is "fine" only catches the fields somebody remembered to mark, which
are never the ones that bite.

Run: python3 -m pytest draft/tests/test_season_stamp.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import season_stamp as SS  # noqa: E402


# ── the stamp itself ────────────────────────────────────────────────────────
def test_a_SEASON_SCOPED_source_stamps_the_YEAR_it_was_requested_for():
    """MFL's ADP export is year-scoped, so the stamp is the request parameter — a
    fact, not an inference. MUTATION: stamp the CURRENT year regardless — a 2025
    export relabels itself 2026 and the gate waves it through."""
    r = SS.stamp({"adp": 12.4}, {"adp": SS.seasonal(2025)})
    assert r["adp_season"] == 2025


def test_LIVE_STATE_stamps_current_rather_than_asserting_a_YEAR():
    """`age` and `injury_status` arrive with no season in the payload. MUTATION:
    stamp them with the target year — the board then claims every Sleeper field was
    verified as 2026 when nothing verified anything, and the gate goes green on the
    largest group of unproven fields."""
    r = SS.stamp({"age": 27, "injury_status": "IR"},
                 {"age": SS.CURRENT_STATE, "injury_status": SS.CURRENT_STATE})
    assert r["age_season"] == SS.CURRENT and r["injury_status_season"] == SS.CURRENT


def test_a_HISTORICAL_field_must_DECLARE_itself():
    """Prior-season production is legitimate input — walk_forward is built on it.
    MUTATION: treat any past year as a violation — the projection's own inputs
    become illegal and the gate blocks the thing it was built to protect."""
    r = SS.stamp({"prior_points": 210.0}, {"prior_points": SS.historical(2025)})
    assert r["prior_points_season"] == 2025
    assert r["prior_points_historical"] is True


# ── the gate ────────────────────────────────────────────────────────────────
def test_an_UNSTAMPED_field_is_a_VIOLATION_not_a_pass():
    """THE WHOLE DESIGN. A gate whose default is 'fine' only catches fields somebody
    remembered to mark, which are never the ones that bite. MUTATION: skip fields
    with no stamp — a newly added ingest field is exempt on the day it lands."""
    v = SS.violations([{"player_id": "1", "adp": 12.4}], 2026, fields=("adp",))
    assert len(v) == 1 and "unstamped" in v[0]["why"]


def test_a_SUB_TARGET_year_that_is_NOT_declared_historical_is_a_VIOLATION():
    """The defect Cory named, in one row: a 2025 ADP riding into a 2026
    recommendation. MUTATION: compare only when the stamp is present and equal —
    2025 passes as 'stamped', which is the silent plausible error itself."""
    row = SS.stamp({"player_id": "1", "adp": 12.4}, {"adp": SS.seasonal(2025)})
    v = SS.violations([row], 2026, fields=("adp",))
    assert len(v) == 1
    assert "2025" in v[0]["why"] and "historical" in v[0]["why"].lower()


def test_a_DECLARED_HISTORICAL_field_is_allowed_through():
    row = SS.stamp({"player_id": "1", "prior_points": 210.0},
                   {"prior_points": SS.historical(2025)})
    assert SS.violations([row], 2026, fields=("prior_points",)) == []


def test_CURRENT_is_allowed_and_is_NOT_silently_upgraded_to_the_target_year():
    """`current` must stay distinguishable from a proven 2026 forever — otherwise
    the gate cannot ever be tightened, because nothing records which fields were
    verified. MUTATION: normalise current to the target year on the way in."""
    row = SS.stamp({"player_id": "1", "age": 27}, {"age": SS.CURRENT_STATE})
    assert SS.violations([row], 2026, fields=("age",)) == []
    assert row["age_season"] == SS.CURRENT, "still 'current', not 2026"


def test_an_EMPTY_BOARD_is_UNCOUNTED_rather_than_clean(capsys=None):
    """Rule 13f. MUTATION: return [] for an empty board — the gate reports clean on
    the day the artifact fails to build, which is the day it must shout."""
    rep = SS.report([], 2026, fields=("adp",))
    assert rep["status"] == "uncounted"
    assert rep["ok"] is False


def test_the_report_COUNTS_each_kind_so_a_gate_can_state_its_denominator():
    rows = [SS.stamp({"player_id": "1", "adp": 1.0, "age": 27},
                     {"adp": SS.seasonal(2026), "age": SS.CURRENT_STATE}),
            SS.stamp({"player_id": "2", "adp": 2.0, "age": 28},
                     {"adp": SS.seasonal(2025), "age": SS.CURRENT_STATE})]
    rep = SS.report(rows, 2026, fields=("adp", "age"))
    assert rep["rows"] == 2 and rep["checked"] == 4
    assert rep["by_kind"]["proven"] == 1
    assert rep["by_kind"]["current"] == 2
    assert rep["violations"] == 1 and rep["ok"] is False
