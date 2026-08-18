"""Register 5l — the keeper-lock flag was PERMANENTLY FALSE, and both consumers
keyed on it were dead code: freeze_pre_draft could never stamp CONFIRMED, and
standing_check's "re-take the freeze NOW" escalation could never fire.

`assess_slate()` took `keeper_lock_passed=False` and all three build.py call
sites omitted it. standing_check's own docstring argued the flag was "computed
from Sleeper placements on the live board" — carefully, and falsely: it was a
parameter nobody passed. The relay prepared the fix
(`5l_proposed_fix_for_approval_2026-08-18.md`); A applied it 08-18.

THE TEST DRIVES THE CLOCK rather than waiting for Friday — the correct
behaviour otherwise first appears after the last useful moment to learn it is
wrong. Arm 2 is the whole point: it had never once been reachable.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build  # noqa: E402

CDT = dt.timezone(dt.timedelta(hours=-5))
CFG = {"keepers": {"deadline": {"date": "2026-08-21", "time": "6:00 PM", "tz": "CDT"}}}


def test_arm1_before_deadline_no_placements_is_false():
    """The control: proves the fix did not simply hardcode True."""
    now = dt.datetime(2026, 8, 18, 12, 0, tzinfo=CDT)
    assert build._keeper_lock_passed(CFG, None, now=now) is False


def test_arm2_after_deadline_no_placements_is_true():
    """THE ARM THAT WAS NEVER REACHABLE: lock passed, teams unplaced — the
    exact state standing_check's escalation exists to catch."""
    now = dt.datetime(2026, 8, 22, 8, 0, tzinfo=CDT)
    assert build._keeper_lock_passed(CFG, None, now=now) is True


def test_arm3_placements_before_deadline_is_true():
    """The derived path the standing_check docstring believed existed: an
    early lock is caught without any date."""
    now = dt.datetime(2026, 8, 18, 12, 0, tzinfo=CDT)
    assert build._keeper_lock_passed(CFG, {"1": ["p1"]}, now=now) is True


def test_boundary_exactly_six_pm_friday_is_passed():
    now = dt.datetime(2026, 8, 21, 18, 0, tzinfo=CDT)
    assert build._keeper_lock_passed(CFG, None, now=now) is True
    one_minute_early = dt.datetime(2026, 8, 21, 17, 59, tzinfo=CDT)
    assert build._keeper_lock_passed(CFG, None, now=one_minute_early) is False


def test_unknown_config_is_not_passed():
    """Unknown must never read as 'passed' — the safe direction. A missing
    deadline block means the board simply does not know."""
    assert build._keeper_lock_passed({}, None) is False
    assert build._keeper_lock_passed({"keepers": {}}, None) is False


def test_all_three_call_sites_pass_the_flag():
    """The defect was three call sites omitting the parameter. The fix is only
    alive while all three pass it — a fourth omitted call site would recreate
    the permanently-false flag one path at a time."""
    src = (Path(__file__).resolve().parents[1] / "build.py").read_text()
    calls = src.count("assess_slate(")
    wired = src.count("keeper_lock_passed=_keeper_lock_passed(")
    assert calls == wired, (
        f"{calls} assess_slate call(s) but only {wired} pass keeper_lock_passed — "
        "an omitted site defaults the flag to False silently (register 5l)")
    assert wired >= 3


def test_unparseable_time_falls_to_end_of_day():
    """A garbled time must fail LATE (11:59 PM), never early — stamping
    CONFIRMED prematurely is the worse direction."""
    cfg = {"keepers": {"deadline": {"date": "2026-08-21", "time": "six-ish"}}}
    at_six = dt.datetime(2026, 8, 21, 18, 0, tzinfo=CDT)
    assert build._keeper_lock_passed(cfg, None, now=at_six) is False
    end_of_day = dt.datetime(2026, 8, 21, 23, 59, tzinfo=CDT)
    assert build._keeper_lock_passed(cfg, None, now=end_of_day) is True
