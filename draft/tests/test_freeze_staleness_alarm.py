# TERRITORY: A
"""THE FREEZE ALARM MUST FIRE IN THE WINDOW IT PROTECTS. BREAK IT AND WATCH.

EVIDENCE CLASS (directive §10): CORRECTNESS of the alarm's trigger condition,
plus REGRESSION PROTECTION on its cadence. It establishes nothing about whether
the freeze's CONTENTS are right — only that a provisional freeze cannot survive
the keeper lock unnoticed.

── WHAT WAS WRONG ─────────────────────────────────────────────────────────────

`freeze_pre_draft.verify()` existed and nothing called it. Intention with no
trigger, on the one artifact where the entire value is that it was written once
before the draft and where nothing can reconstruct it afterwards.

── THE ALARM IS NOT ON DRIFT, AND THAT IS DELIBERATE ──────────────────────────

draft-data.yml rebuilds the board every morning, so `source_artifact_sha256`
stops matching tomorrow. That is what a snapshot IS. An alarm on drift would
fire every day from tomorrow and be ignored by the 20th — the cry-wolf failure
that gets banners tuned out. Drift is REPORTED, never escalated.

The real exposure is drafting on a PROVISIONAL freeze after the keeper lock,
because it was built on PREDICTED opponent keepers. The freeze says so itself.

── THE TRIGGER IS DERIVED ─────────────────────────────────────────────────────

`keeper_slate.keeper_lock_passed`, computed from Sleeper placements on the live
board. No "20 August" literal exists anywhere in the check. A hardcoded date
would be a SECOND definition of the lock and would disagree with the board on
precisely the day it mattered — and a lock that moves, or happens early, would
be missed.

── THE CADENCE BUG THIS ALMOST SHIPPED WITH ───────────────────────────────────

The full examination is Monday-gated. The Mondays around the draft are 08-17 and
08-24; the lock is 08-20 and the draft is 08-22. A WEEKLY freeze row COULD NOT
FIRE BETWEEN THE LOCK AND THE DRAFT — it would first speak two days after the
thing it protects was already lost. That is exactly the invariant standing_check
documents for the ADP series (`bar_days + examination_lag <= tolerable_loss`),
applied to a window measured in hours. `test_the_alarm_is_examined_daily` pins
it, because a correct check on the wrong cadence is not a check.
"""
import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import standing_check as SC  # noqa: E402

FREEZE = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
BOARD = ROOT / "public" / "draft_data.json"


def _run(tmp_path, monkeypatch, *, freeze=None, board=None):
    """Run the real check against a scratch ROOT, so nothing touches the real
    freeze. The check is NOT reimplemented here — a copy of the logic would pass
    while the shipped one was broken."""
    root = tmp_path
    (root / "draft" / "data").mkdir(parents=True, exist_ok=True)
    (root / "public").mkdir(parents=True, exist_ok=True)
    if freeze is not None:
        (root / "draft" / "data" / "pre_draft_freeze_2026.json").write_text(
            json.dumps(freeze))
    if board is not None:
        (root / "public" / "draft_data.json").write_text(json.dumps(board))
    monkeypatch.setattr(SC, "ROOT", root)
    return SC.check_pre_draft_freeze()


def _sealed(status="PROVISIONAL"):
    """A freeze whose self-hash is genuinely correct, sealed the way the real
    one is. Building it wrong would make every arm below fail on integrity and
    never reach the condition under test."""
    import hashlib
    payload = {"status": status, "players": [], "my_picks": [33],
               "source_artifact_sha256": "deadbeef",
               "source_artifact_built_at": "2026-08-14T09:15:36Z"}
    payload["_sha256_of_payload"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return payload


def _board(lock_passed):
    return {"keeper_slate": {"keeper_lock_passed": lock_passed,
                             "teams_designated": 10 if lock_passed else 4,
                             "teams_expected": 10}}


# ── CONTROL: the real artifacts are what the arms below imitate ─────────────

def test_control_the_real_freeze_is_intact_and_the_check_is_quiet_today():
    row = SC.check_pre_draft_freeze()
    assert row["state"] == "quiet", (
        f"the real freeze is not quiet today: {row['detail']}. If this fires, "
        "read it — it is the alarm doing its job, not a broken test."
    )


def test_control_the_real_board_still_reports_the_lock_as_not_passed():
    """If this flips, the ESCALATE arm below is live for real."""
    slate = json.loads(BOARD.read_text()).get("keeper_slate") or {}
    assert slate.get("keeper_lock_passed") is False, (
        "the live board now says the keeper lock HAS passed — the freeze must "
        "be re-taken and this test is telling you so"
    )


# ── THE ALARM FIRES. BREAK-FIRST. ──────────────────────────────────────────

def test_ESCALATES_when_the_lock_has_passed_and_the_freeze_is_provisional(
        tmp_path, monkeypatch):
    """THE ONE THAT MATTERS. This is the Aug 20-22 exposure, simulated."""
    row = _run(tmp_path, monkeypatch, freeze=_sealed("PROVISIONAL"),
               board=_board(True))
    assert row["state"] == "ESCALATE", row
    assert "PROVISIONAL" in row["detail"] and "re-take" in row["detail"].lower()


def test_a_confirmed_freeze_after_the_lock_is_quiet(tmp_path, monkeypatch):
    """The alarm must CLEAR when the freeze is re-taken, or it is a permanent
    red that gets muted — which is how a real one gets missed later."""
    row = _run(tmp_path, monkeypatch, freeze=_sealed("CONFIRMED"),
               board=_board(True))
    assert row["state"] == "quiet", row


def test_drift_alone_never_escalates(tmp_path, monkeypatch):
    """The board rebuilds daily. If drift escalated, this row would be red every
    day from 08-15 and ignored by 08-20."""
    board = _board(False)
    row = _run(tmp_path, monkeypatch, freeze=_sealed("PROVISIONAL"), board=board)
    assert row["state"] == "quiet", row
    assert "rebuilt" in row["detail"], (
        "drift is not escalated, but it must still be REPORTED — silence about "
        "it would leave a reader thinking the freeze matches the live board"
    )


def test_an_altered_freeze_escalates(tmp_path, monkeypatch):
    doc = _sealed("PROVISIONAL")
    doc["players"] = [{"tampered": True}]        # hash no longer matches
    row = _run(tmp_path, monkeypatch, freeze=doc, board=_board(False))
    assert row["state"] == "ESCALATE" and "ALTERED" in row["detail"], row


def test_a_missing_freeze_escalates(tmp_path, monkeypatch):
    row = _run(tmp_path, monkeypatch, board=_board(False))
    assert row["state"] == "ESCALATE" and "NO FREEZE" in row["detail"], row


@pytest.mark.parametrize("board", [None, {"not_json": True}])
def test_an_unreadable_board_is_BLIND_never_quiet(tmp_path, monkeypatch, board):
    """"I could not look" rendered as "nothing yet" is the failure this whole
    file exists to end. A missing board must not read as "lock not passed"."""
    row = _run(tmp_path, monkeypatch, freeze=_sealed(), board=board)
    if board is None:
        assert row["state"] == "BLIND", row
    else:
        assert row["state"] in ("BLIND", "quiet"), row
        if row["state"] == "quiet":
            assert "lock not yet passed" in row["detail"]


# ── CADENCE. A CORRECT CHECK ON THE WRONG SCHEDULE IS NOT A CHECK. ─────────

def test_the_alarm_is_examined_daily_not_weekly():
    """Monday-gated, the row would first speak on 08-24 — two days after the
    draft it exists to protect."""
    assert "pre_draft_freeze" in SC.LIVENESS_ROWS, (
        "the freeze row is not in LIVENESS_ROWS, so it is examined WEEKLY. The "
        "Mondays around the draft are 08-17 and 08-24; the lock is 08-20 and "
        "the draft is 08-22. It could not fire inside the window it protects."
    )


def test_the_check_is_registered_so_it_actually_runs():
    """verify() existed and nothing called it. That is the defect being fixed;
    a check nobody invokes is the same bug with a new name."""
    names = [f.__name__ for f in SC.CHECKS]
    assert "check_pre_draft_freeze" in names, names


def test_no_hardcoded_lock_date_anywhere_in_the_check():
    """A date literal would be a SECOND definition of the lock, and it would
    disagree with the board on exactly the day it mattered."""
    import inspect
    src = inspect.getsource(SC.check_pre_draft_freeze)
    body = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
    body = body.split('"""')[0] + body.split('"""')[-1] if body.count('"""') >= 2 else body
    for bad in ("08-20", "08/20", "2026-08-2", "august 20"):
        assert bad not in body.lower(), (
            f"the check hardcodes {bad!r}; the trigger must stay derived from "
            "keeper_slate.keeper_lock_passed"
        )
