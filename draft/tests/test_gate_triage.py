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


# ─────────────────────────────────────────────────────────────────────────────
# WORLD-STATE OVERRIDE — added 2026-08-20, OFF by default, on Cory's call
# ("prepare the fallback now, decide Friday").
#
# The exposure: six of ten teams had keepers PLACED on the Sleeper draft, so the
# keeper lock read passed a day early, the pre-draft freeze could not seal, and
# test_freeze_staleness_alarm escalated. Blanket `pytest draft/tests` in the
# publish gate turned a fact about the LEAGUE into a refusal to publish the
# BOARD — five times, while 4640 other tests passed.
#
# The whole safety of this feature is that it is OFF unless deliberately turned
# on, so the first two tests below are the ones that matter most.
# ─────────────────────────────────────────────────────────────────────────────

WORLD_FAIL = ("FAILED draft/tests/test_freeze_staleness_alarm.py::"
              "test_control_the_real_freeze_is_intact_and_the_check_is_quiet_today")
WORLD_FAIL_2 = ("FAILED draft/tests/test_freeze_staleness_alarm.py::"
                "test_control_the_real_board_still_reports_the_lock_as_not_passed")


def test_DEFAULT_IS_OFF_a_world_state_failure_still_refuses(tmp_path, monkeypatch):
    """THE ONE THAT MATTERS. With the flag unset, nothing has changed."""
    monkeypatch.delenv(G.OVERRIDE_ENV, raising=False)
    assert G.main([_out(tmp_path, WORLD_FAIL, WORLD_FAIL_2)]) == 1


def test_EQUIVALENCE_flag_off_classifies_exactly_as_before(tmp_path, monkeypatch):
    """Byte-identical behaviour, asserted rather than claimed: with the override
    off, a world-state node is classified BLOCKING, which is what it was before
    the category existed."""
    monkeypatch.delenv(G.OVERRIDE_ENV, raising=False)
    blocking, advisory, world = G.classify(WORLD_FAIL, allow_world_state=False)
    assert world == []
    # NOTE: the module's FAILED regex is `^FAILED\s+([^\s:]+)` — it stops at the
    # first colon, so what it collects is the FILE PATH, not the full node id.
    # My first version of this test asserted the node id and failed; the code was
    # right and the expectation was wrong. Pinned as the path so the next reader
    # does not repeat it.
    assert blocking == ["draft/tests/test_freeze_staleness_alarm.py"]
    assert advisory == []


def test_a_typo_in_the_flag_fails_CLOSED(tmp_path, monkeypatch):
    """'true', 'yes', 'TRUE' must NOT enable it. Only the exact string '1'."""
    for bad in ("true", "TRUE", "yes", "on", "0", "", " 1"):
        monkeypatch.setenv(G.OVERRIDE_ENV, bad)
        assert G.main([_out(tmp_path, WORLD_FAIL)]) == 1, bad


def test_when_ON_a_world_state_failure_publishes(tmp_path, monkeypatch):
    monkeypatch.setenv(G.OVERRIDE_ENV, "1")
    monkeypatch.setattr(G, "STAMP_PATH", tmp_path / "stamp.json")
    assert G.main([_out(tmp_path, WORLD_FAIL, WORLD_FAIL_2)]) == 0


def test_when_ON_a_REAL_board_failure_STILL_refuses(tmp_path, monkeypatch):
    """The override waives one named category, never the gate. A board defect
    alongside a world-state alarm must still stop the publish — otherwise this
    is a bypass, not a triage."""
    monkeypatch.setenv(G.OVERRIDE_ENV, "1")
    monkeypatch.setattr(G, "STAMP_PATH", tmp_path / "stamp.json")
    assert G.main([_out(tmp_path, WORLD_FAIL, BOARD_FAIL)]) == 1


def test_an_overridden_board_is_STAMPED_so_it_cannot_look_clean(tmp_path, monkeypatch):
    import json
    stamp = tmp_path / "stamp.json"
    monkeypatch.setenv(G.OVERRIDE_ENV, "1")
    monkeypatch.setattr(G, "STAMP_PATH", stamp)
    assert G.main([_out(tmp_path, WORLD_FAIL)]) == 0
    assert stamp.exists(), "an overridden publish left no trace"
    d = json.loads(stamp.read_text())
    assert d["tests"] == ["draft/tests/test_freeze_staleness_alarm.py"]
    assert "not a clean build" in d["_what"]
    # the reason has to travel WITH the stamp, not live only in the source
    only = d["details"]["draft/tests/test_freeze_staleness_alarm.py"]
    assert "clears_when" in only and len(only["clears_when"]) > 40


def test_NO_stamp_is_written_when_the_override_is_off(tmp_path, monkeypatch):
    stamp = tmp_path / "stamp.json"
    monkeypatch.delenv(G.OVERRIDE_ENV, raising=False)
    monkeypatch.setattr(G, "STAMP_PATH", stamp)
    G.main([_out(tmp_path, WORLD_FAIL)])
    assert not stamp.exists(), "a refused board must not leave an override stamp"


def test_the_world_state_list_must_stay_honest():
    """Same discipline the advisory list gets. Every entry names its condition,
    how it CLEARS, and what overriding costs — an override with no exit
    condition is a permanent bypass wearing a reason."""
    assert G.world_state_is_still_honest() == []


def test_FAIL_ARM_a_world_state_entry_with_no_exit_condition_is_REFUSED(monkeypatch):
    monkeypatch.setitem(G.WORLD_STATE, "draft/tests/test_gate_triage.py",
                        {"condition": "x" * 50, "clears_when": "soon",
                         "cost_of_overriding": "y" * 50})
    problems = G.world_state_is_still_honest()
    assert any("clears_when" in p for p in problems), problems


def test_FAIL_ARM_an_entry_in_BOTH_lists_is_REFUSED(monkeypatch):
    monkeypatch.setitem(G.WORLD_STATE, "draft/tests/test_stale_blockers.py",
                        {"condition": "x" * 50, "clears_when": "y" * 50,
                         "cost_of_overriding": "z" * 50})
    assert any("BOTH" in p for p in G.world_state_is_still_honest())
