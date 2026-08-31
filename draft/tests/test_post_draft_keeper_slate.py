# TERRITORY: A
"""THE BOARD MUST NOT LOSE ITS KEEPERS THE DAY THE DRAFT ENDS — register 335.

WHAT HAPPENED. `build.py` sourced keeper PLACEMENTS from the draft whose status
is `pre_draft`, `drafting` or `paused`. A completed draft is none of those, so
from the moment the 2026 draft finished the filter matched nothing, `placements`
stayed None, and `keeper_slate.assess_slate` took its `not placed` branch —
status `predicted`, confirmed False. `build.py`'s withholding rule then withheld
EVERY keeper, and the nightly build produced a **700-player board with an empty
keeper slate**, measured on run 114's own in-run diagnosis:

    keeper_lock_passed True · status 'predicted' · confirmed False
    teams_designated 0 · undesignated_teams 10 · 700 players

The acceptance gate refused it, correctly, and has been refusing it every run
since. That refusal is the only reason a keeperless board never reached Cory.

THE MACHINERY WAS NEVER MISSING, which is the part worth remembering.
`assess_slate` already resolves this case exactly right — placements from 9
teams, the lock passed, no unplaced designator, no mismatch gives CONFIRMED with
the tenth team resolved to kept-none by the deadline. It simply never got the
chance, because the draft holding those placements had been filtered out for
having finished.

AND POST-DRAFT THE DRAFT IS THE ONLY SOURCE LEFT. Sleeper stops reporting roster
DESIGNATIONS once the draft consumes them (register 319), so `designations` is
`{}` from that moment on. Before the draft the two sources cross-check each
other; after it, only one of them still speaks.

⚠️ THE FIX IS DELIBERATELY NOT "loosen the withholding rule". Withholding an
unconfirmed slate is Cory's ruling of 2026-08-11 and is correct. The defect was
that the slate was being ASSESSED from a source that had gone silent, not that it
withheld when unsure.
"""
import collections
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "draft"))

import build as B  # noqa: E402
import keeper_slate as KS  # noqa: E402

LOG = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"
LOCK = {"date": "2026-08-21"}


# ── WHICH DRAFT CARRIES THE PLACEMENTS ──────────────────────────────────────

@pytest.mark.parametrize("drafts,season,want,why", [
    ([], "2026", None, "nothing at all"),
    ([{"draft_id": "A", "status": "pre_draft", "season": "2026"}], "2026", "A",
     "PRE-DRAFT: unchanged, the upcoming draft"),
    ([{"draft_id": "OLD", "status": "complete", "season": "2025"},
      {"draft_id": "LIVE", "status": "drafting", "season": "2026"}], "2026", "LIVE",
     "DRAFT NIGHT: a live draft must outrank any completed one — on the night "
     "itself the live draft IS the truth and last year's must never win"),
    ([{"draft_id": "C", "status": "complete", "season": "2026"},
      {"draft_id": "P", "status": "paused", "season": "2026"}], "2026", "P",
     "a paused draft is still live"),
    ([{"draft_id": "D26", "status": "complete", "season": "2026"}], "2026", "D26",
     "POST-DRAFT: the completed draft — this is the fix"),
    ([{"draft_id": "D25", "status": "complete", "season": "2025"},
      {"draft_id": "D26", "status": "complete", "season": "2026"}], "2026", "D26",
     "picks OUR season among completed drafts"),
    ([{"draft_id": "D25", "status": "complete", "season": "2025"}], "2026", None,
     "REFUSES another season rather than guessing — answering a 2026 question "
     "with 2025 keepers is worse than answering nothing"),
    ([{"draft_id": "D", "status": "complete"}], "2026", "D",
     "a completed draft that states no season is still usable"),
])
def test_which_draft_holds_the_keeper_placements(drafts, season, want, why):
    got = B._draft_holding_keeper_placements(drafts, season)
    assert (got or {}).get("draft_id") == want, why


# ── AND WHAT THE SLATE THEN SAYS ────────────────────────────────────────────

def _real_placements():
    """The 2026 keeper placements exactly as build.py reads them: `is_keeper`
    picks on the completed draft, grouped by team."""
    if not LOG.exists():
        pytest.skip("no pick log on disk")
    kp = collections.defaultdict(list)
    for line in LOG.read_text().splitlines():
        r = json.loads(line)
        if r.get("is_keeper"):
            kp[str(r["team_slot"])].append(str(r["player_id"]))
    return dict(kp)


def test_the_real_draft_carries_the_keeper_placements():
    """CONTROL, before any claim about what the slate does with them. If the
    completed draft did not carry `is_keeper` picks, sourcing from it would be
    pointless and every assertion below would be vacuous."""
    kp = _real_placements()
    assert len(kp) == 9, f"expected 9 teams with keepers, got {len(kp)}"
    assert sum(len(v) for v in kp.values()) == 23, "expected 23 kept players"


def test_WITHOUT_placements_the_slate_withholds_everything_KNOWN_POSITIVE():
    """RULE 3e — the defect, reproduced. This is what every post-draft build
    produced: no placements, no designations (Sleeper consumed them), so the
    slate reads `predicted` and build.py withholds all 23 keepers.

    If this ever stops being true, the fix below is being credited for something
    else and this file is not testing what it claims."""
    s = KS.assess_slate(10, {}, placements=None, keeper_lock_passed=True,
                        keeper_lock_deadline=LOCK)
    assert s["status"] == "predicted" and s["confirmed"] is False, s
    assert s["teams_placed"] is None


def test_WITH_the_completed_drafts_placements_the_slate_CONFIRMS():
    """THE FIX. Same zero designations — post-draft that is the truth, not a
    broken read — but placements sourced from the completed draft."""
    s = KS.assess_slate(10, {}, placements=_real_placements(),
                        keeper_lock_passed=True, keeper_lock_deadline=LOCK)
    assert s["confirmed"] is True, s
    assert s["status"] == "confirmed"
    assert s["teams_placed"] == 9
    assert s["teams_designated"] == 0, (
        "post-draft Sleeper reports no designations; that is expected and the "
        "slate must confirm on placements alone")
    assert "resolved to KEPT NONE" in s["reason"], (
        "the tenth team kept nobody and the passed lock must say so explicitly — "
        "silence there is the 'unknown vs zero' confusion this slate exists to "
        "prevent")


def test_the_lock_STILL_gates_it_even_with_placements():
    """The deadline is what turns 'unknown' into 'kept none'. Without it, nine
    of ten teams placed is INCOMPLETE, not confirmed — and it must stay that way,
    or a mid-lock rebuild would confirm a slate that is still being decided."""
    s = KS.assess_slate(10, {}, placements=_real_placements(),
                        keeper_lock_passed=False, keeper_lock_deadline=LOCK)
    assert s["confirmed"] is False, s
    assert s["status"] == "partial"
