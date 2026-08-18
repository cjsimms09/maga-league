"""The manifest gate must FIRE, or it joins the class it polices.

Every arm runs the REAL tool via its main() and reads the real exit code —
a copy of the logic passing is not evidence about the gate
(commitments_check.test.js's rule, applied here).
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import lab_output_manifest as M  # noqa: E402


def test_fresh_output_passes(tmp_path):
    stamp = tmp_path / "stamp"
    assert M.main(["--stamp", str(stamp)]) == 0
    out = tmp_path / "REPORT.md"
    out.write_text("x")
    assert M.main(["--check", str(out), "--since-stamp", str(stamp)]) == 0


def test_FAIL_ARM_missing_output_fails(tmp_path):
    stamp = tmp_path / "stamp"
    M.main(["--stamp", str(stamp)])
    assert M.main(["--check", str(tmp_path / "never_written.json"),
                   "--since-stamp", str(stamp)]) == 1


def test_FAIL_ARM_stale_output_fails(tmp_path):
    """The swallowed-write shape exactly: the file EXISTS from an earlier run
    and this run wrote nothing — committing it would ship old data as new."""
    out = tmp_path / "REPORT.md"
    out.write_text("old")
    past = time.time() - 3600
    os.utime(out, (past, past))
    stamp = tmp_path / "stamp"
    M.main(["--stamp", str(stamp)])
    assert M.main(["--check", str(out), "--since-stamp", str(stamp)]) == 1


def test_FAIL_ARM_zero_declared_outputs_fails(tmp_path):
    """A manifest declaring nothing is vacuous green — refused by name."""
    stamp = tmp_path / "stamp"
    M.main(["--stamp", str(stamp)])
    assert M.main(["--check", "--since-stamp", str(stamp)]) == 1


def test_FAIL_ARM_missing_stamp_fails(tmp_path):
    """Without a run-start instant, 'exists from last week' would read as
    'written today' — freshness unjudgeable is a refusal, not a pass."""
    out = tmp_path / "REPORT.md"
    out.write_text("x")
    assert M.main(["--check", str(out),
                   "--since-stamp", str(tmp_path / "no_such_stamp")]) == 1


def test_one_stale_among_fresh_is_still_a_failure(tmp_path):
    stamp = tmp_path / "stamp"
    fresh = tmp_path / "fresh.json"
    stale = tmp_path / "stale.json"
    stale.write_text("old")
    past = time.time() - 3600
    os.utime(stale, (past, past))
    M.main(["--stamp", str(stamp)])
    fresh.write_text("new")
    assert M.main(["--check", str(fresh), str(stale),
                   "--since-stamp", str(stamp)]) == 1
