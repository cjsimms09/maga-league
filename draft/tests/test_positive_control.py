# TERRITORY: C
"""EVERY MUTATION HERE LETS A BROKEN PROBE REPORT A FINDING."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import positive_control as PC  # noqa: E402


def test_a_FAILING_control_VOIDS_the_verdict_rather_than_annotating_it():
    """A broken probe's finding is not a finding with a caveat — it is not evidence.
    Leaving it readable beside a warning is how four false results got reported this
    week. MUTATION: append the warning and keep the verdict. The reader takes the
    number, because the number is still there."""
    r = PC.run([("known capture serves a board", lambda: 0, 15, "hand-verified 15/15")])
    v = PC.guard("ROUTE 1 IS CLOSED: no capture served a board", r)
    assert v.startswith("INSTRUMENT FAILED")
    assert "VOID" in v
    assert "ROUTE 1 IS CLOSED" not in v      # the finding must be GONE, not adjacent


def test_NO_CONTROLS_reports_UNCONTROLLED_and_never_reads_as_all_passed():
    """Absent is not zero. An empty control set trivially has no failures, so `all()`
    over it is True — MUTATION: report ok. Every probe that forgot a control then
    certifies itself, which is worse than having no scaffold at all."""
    r = PC.run([])
    assert r["uncontrolled"] is True and r["ok"] is False
    v = PC.guard("0 of 18 targets served a board", r)
    assert v.startswith("UNCONTROLLED")
    assert "defect in the probe" in v
    # ...but it is UNVERIFIED, not void: the probe may be fine, nobody checked.
    assert "0 of 18 targets" in v


def test_a_PASSING_control_still_PRINTS_so_the_check_is_visible():
    """MUTATION: print nothing on success. A reader cannot tell a controlled probe from
    an uncontrolled one, and the scaffold's whole value is that the instrument's state
    travels WITH the result."""
    r = PC.run([("csv path reads names", lambda: 40, 40, "")])
    v = PC.guard("no board found", r)
    assert v.startswith("controls: 1/1 passed")
    assert "no board found" in v


def test_a_control_that_RAISES_is_a_FAILED_control_not_a_crashed_run():
    """A probe whose instrument throws is exactly as broken as one returning the wrong
    answer. MUTATION: let it propagate — a diagnosis becomes an outage, and the run
    produces nothing at all rather than 'my instrument is broken'."""
    def boom():
        raise ValueError("index unreachable")
    r = PC.run([("cdx index answers", boom, 3, "")])
    assert r["ok"] is False
    assert "ValueError" in r["failed"][0]["error"]
    assert "raised ValueError" in PC.guard("closed", r)


def test_ALL_controls_run_even_after_one_fails():
    """MUTATION: short-circuit on the first failure. The report names one broken thing
    when three are broken, and the next run fixes one and fails again."""
    r = PC.run([("a", lambda: 1, 1, ""), ("b", lambda: 0, 9, ""), ("c", lambda: 0, 9, "")])
    assert r["n"] == 3 and len(r["failed"]) == 2
