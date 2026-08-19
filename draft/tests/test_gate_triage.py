"""The triage must let hygiene through and STOP anything board-shaped —
every arm through the real main() and its real exit code."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import gate_triage as G  # noqa: E402

BOARD_FAIL = ("FAILED draft/tests/test_own_projections_v6_live.py::"
              "test_committed_board_carries_the_promoted_numbers - AssertionError")
HYGIENE_FAIL = ("FAILED draft/tests/test_stale_blockers.py::"
                "test_the_live_corpus_still_surfaces_the_pair_this_was_built_for")
HYGIENE_FAIL_2 = ("FAILED draft/tests/test_unread_artifacts.py::"
                  "test_KNOWN_POSITIVE_the_founding_case_is_still_detected")


def _out(tmp_path, *lines):
    p = tmp_path / "pytest.txt"
    p.write_text("\n".join(lines) + "\n1 failed, 4400 passed\n")
    return str(p)


def test_all_advisory_failures_publish(tmp_path):
    assert G.main([_out(tmp_path, HYGIENE_FAIL, HYGIENE_FAIL_2)]) == 0


def test_FAIL_ARM_a_board_failure_still_refuses(tmp_path):
    assert G.main([_out(tmp_path, BOARD_FAIL)]) == 1


def test_FAIL_ARM_one_board_failure_among_advisory_ones_refuses(tmp_path):
    """The mixed case is the dangerous one: a real defect must not be
    waved through because it arrived beside hygiene noise."""
    assert G.main([_out(tmp_path, HYGIENE_FAIL, BOARD_FAIL, HYGIENE_FAIL_2)]) == 1


def test_FAIL_ARM_an_unknown_test_is_blocking_not_advisory(tmp_path):
    """Unclassified means blocking — a new board defect can never become
    advisory by omission."""
    assert G.main([_out(tmp_path, "FAILED draft/tests/test_brand_new.py::test_x")]) == 1


def test_FAIL_ARM_unparseable_output_refuses(tmp_path):
    """A gate that cannot read its own evidence must not wave a board through."""
    p = tmp_path / "empty.txt"
    p.write_text("everything passed, or did it\n")
    assert G.main([str(p)]) == 1


def test_FAIL_ARM_a_board_reading_test_may_not_be_advisory(tmp_path, monkeypatch):
    """The allowlist's own rot check: listing a test that reads the board
    refuses the whole triage rather than silently downgrading it."""
    monkeypatch.setitem(G.ADVISORY, "draft/tests/test_projection_coverage_census.py",
                        "pretend reason that is long enough to pass the length check")
    assert G.main([_out(tmp_path, HYGIENE_FAIL)]) == 1


def test_FAIL_ARM_a_dead_advisory_entry_refuses(tmp_path, monkeypatch):
    monkeypatch.setitem(G.ADVISORY, "draft/tests/test_deleted_long_ago.py",
                        "a reason long enough to clear the minimum length bar here")
    assert G.main([_out(tmp_path, HYGIENE_FAIL)]) == 1


def test_the_live_advisory_list_is_sound():
    """CONTROL on the real list, not a fixture — it must pass its own rot
    checks today, or the gate is running on a lie."""
    assert G.advisory_is_still_honest() == []
