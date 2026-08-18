# TERRITORY: D
"""DATA-LIFECYCLE'S "ARE WE PREDICTING WITH IT?" COLUMN, CHECKED AGAINST THE BOARD.

DEFECT GUARDED: on 2026-08-17 `DATA-LIFECYCLE.md` said `snap_counts` reaches
`projections.py` and stops at step 6 (predicting, ungraded), and DEFECT-REGISTER
rows 13/13b were written against that claim. It reaches no board field at all —
it stops at step 4. `draft/capture_registry.py` had the state right the same
day; nothing compared the two, so the wrong version drove two register rows and
a next action ("grade the contribution") that could not be executed because
there was no contribution.

That is the failure this file exists to stop: a claim in a table that no code
reads. The table is the thing D's lane is judged on, so it gets checked rather
than trusted — the same argument test_defect_register.py makes for the register.

WHAT THIS DOES NOT DO: judge whether a store SHOULD predict. That is a wiring
decision and it is A's and Cory's, not a test's. This only asserts that what the
table CLAIMS and what the board CONTAINS are the same thing.

Run: python -m pytest draft/tests/test_data_lifecycle_predicts_column.py -q
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
LIFECYCLE = ROOT / "DATA-LIFECYCLE.md"

# Fields the opportunity_metrics capture really does put on the board. These are
# the control: a detector that cannot find these cannot be trusted to report
# honestly that it found no snap field.
KNOWN_PRESENT = ("wopr", "target_share", "opportunity_share")

# Stores measured on 2026-08-17 to reach NO board field. Captured weekly, wired
# to nothing — deliberately, per capture_registry.py and DRAFT-WEEK-BRIEF §7.
KNOWN_ABSENT_SUBSTRINGS = ("snap", "route")


def board_players():
    return json.loads(BOARD.read_text())["players"]


def board_fields_matching(substring: str) -> list[str]:
    """Every distinct board key containing `substring`, case-insensitively."""
    keys: set[str] = set()
    for p in board_players():
        keys |= set(p.keys())
    return sorted(k for k in keys if substring.lower() in k.lower())


def test_the_board_field_detector_finds_fields_that_are_really_there():
    """KNOWN-POSITIVE CONTROL — the load-bearing test in this file.

    Both assertions below are of the form "no board field matches X". That form
    passes trivially against a broken board loader, an empty player list, or a
    renamed key. So first prove the detector finds fields that ARE present: the
    three opportunity_metrics fields, each non-null on a real share of rows.
    """
    players = board_players()
    assert len(players) > 100, f"only {len(players)} board rows — the board did not load"

    keys: set[str] = set()
    for p in players:
        keys |= set(p.keys())
    for field in KNOWN_PRESENT:
        assert field in keys, (
            f"{field} is not on the board — either the board changed shape or this "
            f"control is stale; either way the absence checks below prove nothing "
            f"until this is fixed"
        )
        non_null = sum(1 for p in players if p.get(field) is not None)
        assert non_null > 50, (
            f"{field} is present but non-null on only {non_null} rows; a field that "
            f"is almost entirely absent is not evidence the detector works"
        )


def test_snap_counts_and_routes_reach_no_board_field():
    """The measured fact behind DEFECT-REGISTER rows 13/13b and 14: both stores
    are captured weekly and reach no prediction. Verified 2026-08-17 across 682
    board rows and 56 distinct keys.

    If this fails, one of them has been wired — which is good news, and it means
    DATA-LIFECYCLE's row, its stop step, and the matching register row all have
    to move in the same commit. That is exactly why it is pinned here.
    """
    for substring in KNOWN_ABSENT_SUBSTRINGS:
        found = board_fields_matching(substring)
        assert not found, (
            f"board fields matching {substring!r}: {found}. A store that reaches the "
            f"board is at lifecycle step 4+; update DATA-LIFECYCLE.md and the "
            f"matching DEFECT-REGISTER row in this commit"
        )


def test_data_lifecycle_agrees_with_the_board_about_what_predicts():
    """The reconciliation itself. DATA-LIFECYCLE's table has a "-> predicts"
    column; for the two stores measured absent above it must not claim a tick.

    THIS TEST FAILS ON THE FILE AS IT STOOD ON THE MORNING OF 2026-08-17, when
    the snap_counts row read "predicts ✅ (projections) ... stops at 6". That is
    the defect: the table asserted a wiring the board contradicted, two register
    rows were written against it, and nothing could tell.
    """
    text = LIFECYCLE.read_text(encoding="utf8")
    rows = [ln for ln in text.split("\n")
            if ln.startswith("|") and not ln.startswith("|---")]
    assert len(rows) > 8, "the lifecycle store table did not parse — rows missing"

    for store in ("snap_counts", "routes"):
        matching = [r for r in rows if re.search(rf"`{store}[_*]*\S*`", r)]
        assert matching, f"no DATA-LIFECYCLE row found for {store}"
        for row in matching:
            cells = [c.strip() for c in row.strip("|").split("|")]
            # the "-> predicts" cell is the first tick/cross after the weekly-job
            # cell; take every mark on the row and require the predicts one to be
            # a cross. Cells: store | captured | weekly job | predicts | graded | ...
            assert len(cells) >= 5, f"unexpected row shape for {store}: {row}"
            predicts = cells[3]
            assert "✅" not in predicts, (
                f"DATA-LIFECYCLE claims {store} predicts ({predicts!r}), but no board "
                f"field matches it. One of the two is wrong and the board is the "
                f"one that cannot be mistaken."
            )
