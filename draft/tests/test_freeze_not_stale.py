# TERRITORY: A
"""THE FREEZE MUST NOT PREDATE ITS OWN FIELD LIST.

Cory, 2026-08-17: *"make sure this won't happen again"*

WHAT HAPPENED. `draft/data/pre_draft_freeze_2026.json` was written 2026-08-14.
On 2026-08-17 `proj_ceiling` and `proj_floor` CHANGED MEANING — from a Gaussian
over the mean (carrying no player information) to the measured p90/p10 of
realized outcomes — and `freeze_pre_draft.PLAYER_FIELDS` gained
`proj_ceiling_source` / `proj_floor_source` to record which quantity a given
freeze holds, plus the four draft-capital columns.

**The declaration moved. The committed artifact did not.** Every one of the 157
draftable rows in it carries `proj_ceiling_source: None`, because the field did
not exist when it was written. Nothing failed. It was found by reading the file
by hand, which is not a strategy.

WHY IT MATTERS, AND WHY IT IS *NOT* A DRAFT-NIGHT BUG. The war room boots from
live `/draft_data.json` (`app.js:1230`), so the board Cory drafts from is
current. The freeze is the LEARNING-SIGNAL CAPTURE — the one irreversible item,
the record that lets January 2027 ask "did the board say he would be gone by
pick 48, and was he?". A freeze describing the 08-14 board would grade a board
Cory never drafted from: wrong ceilings, wrong floors, no draft capital. The
2027 grade would be a grade of the broken model, and it would look fine.

HOW THIS GATE WORKS, and why it is self-maintaining. It does not hardcode a list
of fields to look for — it reads `PLAYER_FIELDS` from the freezer itself and
requires every declared field to appear on at least one row of the artifact. So
the NEXT time someone adds a field to the freeze, this fails until the freeze is
re-taken, without anyone remembering to update a test.

THRESHOLD IS "AT LEAST ONE ROW", DELIBERATELY. Several fields are legitimately
absent per-player — `attach_capital` leaves an unmatched veteran untouched
rather than writing None, because ABSENT IS NOT UNDRAFTED. So a field missing on
*some* rows is normal and says nothing. A field missing on *every* row is the
signature of an artifact written before that field existed.

MARKED `repo_parity`, matching the ADP-sd ratchet's treatment: this is evidence
awaiting a human action (re-take the freeze on draft day), not a reason to block
a board publish. `draft-data.yml` runs its gate with `-m "not repo_parity"`.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import freeze_pre_draft as FZ  # noqa: E402

FREEZE = os.path.join(ROOT, "draft", "data", "pre_draft_freeze_2026.json")


@pytest.fixture(scope="module")
def frozen():
    if not os.path.exists(FREEZE):
        pytest.skip("no freeze written yet")
    return json.loads(open(FREEZE).read())


def test_the_freeze_carries_every_field_it_declares(frozen):
    """THE GATE. A declared field that appears on ZERO rows means the artifact
    was written before that field existed — the freeze predates its own
    contract and must be re-taken before it can be graded against."""
    players = frozen.get("players") or []
    assert players, "a freeze with no players cannot be graded against anything"

    missing = []
    for field in FZ.PLAYER_FIELDS:
        if not any(p.get(field) is not None for p in players):
            missing.append(field)

    assert not missing, (
        "The committed freeze predates these declared fields: "
        + ", ".join(sorted(missing))
        + ".\n\nThe freeze is the LEARNING-SIGNAL capture — it exists so 2027 can "
        "grade what the board actually said. An artifact missing fields the "
        "board now carries would grade a board that was never drafted from.\n\n"
        "FIX (draft day, after the final board build — the module refuses to "
        "overwrite on purpose and has no --force):\n"
        "    rm draft/data/pre_draft_freeze_2026.json\n"
        "    python3 draft/freeze_pre_draft.py\n"
        "    git commit   # say why")


def test_the_gate_reads_the_freezers_own_list_rather_than_a_copy():
    """Self-maintaining or it is worthless. If this test carried its own list of
    fields, the next field added to the freeze would be invisible to it — which
    is precisely the failure mode being closed. Pin that it reads the source of
    truth, and that the source of truth is non-trivial."""
    assert len(FZ.PLAYER_FIELDS) > 20
    # The fields whose ABSENCE caused this gate to be written must be in the
    # declaration, or the gate cannot detect the thing it was built for.
    for f in ("proj_ceiling_source", "proj_floor_source", "nfl_draft_round"):
        assert f in FZ.PLAYER_FIELDS


def test_a_freeze_that_predates_a_field_is_detected(tmp_path):
    """The detector, proven against a KNOWN-STALE artifact rather than trusted.
    A gate that has never been shown to fire is a gate nobody has checked."""
    stale = {"players": [{"player_id": "1", "proj_mean": 100.0}]}
    missing = [f for f in FZ.PLAYER_FIELDS
               if not any(p.get(f) is not None for p in stale["players"])]
    assert "proj_ceiling_source" in missing, (
        "the check must flag a field absent from every row")
    # ... and the converse: a row carrying the field is NOT flagged.
    fresh = {"players": [{"player_id": "1", "proj_ceiling_source": "measured-2023-25-p90"}]}
    assert not [f for f in ("proj_ceiling_source",)
                if not any(p.get(f) is not None for p in fresh["players"])]


pytestmark = pytest.mark.repo_parity
