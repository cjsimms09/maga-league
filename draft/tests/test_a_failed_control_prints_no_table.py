"""A WARNING OVER A FULL TABLE IS NOT A REFUSAL — register 345 (D), applied by A 09-05.

`measured_need_curve.py` and `streamability.py` both printed

    !! A CONTROL FAILED. Nothing below is a measurement.

and then printed the measurement. On the contaminated store that table carried
the whole need curve computed on 180 phantom owner-weeks, and streamability's
carried "P153 FALSE" — the inverse of its own published result. A reader lifts
a table out of a log into a document without ever seeing the line above it;
numbers travelling out of a log into prose is this project's own most-repeated
failure (register 5h).

WHAT THIS FILE PINS, and why each half is here:

  · with a control failing, NO table reaches stdout        (the fix)
  · the `--json` artifact is still written, complete, and  (the fix must not
    carries `controls_all_passed: false`; exit is still 1   blind the machines)
  · the same module with the fix's one guard line undone    (the known positive
    DOES print the table — so a clean result above is a       — rule 3e)
    measurement rather than a module that crashed early

The third is the one that makes the first two mean anything. "No table in
stdout" is also what a module that crashed early produces, and this suite
would read that as success without it.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKTEST = ROOT / "draft" / "backtest"

# The row-label of each module's suppressed table. Chosen because it appears
# ONLY in the table body, never in a control line or a header, so its absence
# is evidence about the table specifically.
MODULES = {
    "measured_need_curve.py": "how often an owner's Nth-best player",
    "streamability.py": "need for a SECOND body",
}

FAILED = "A CONTROL FAILED"


def run(path: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(path), *args],
        cwd=str(ROOT), capture_output=True, text=True, timeout=300,
    )


@pytest.mark.parametrize("module,table_marker", sorted(MODULES.items()))
def test_a_failing_control_suppresses_the_table(module: str, table_marker: str) -> None:
    r = run(BACKTEST / module)
    out = r.stdout + r.stderr

    # This suite is about the FAILING path. If the store is ever repaired so the
    # controls pass, say so loudly rather than passing vacuously — a green test
    # that stopped testing anything is worse than a red one.
    if FAILED not in out:
        pytest.skip(
            f"{module}'s controls now PASS on this store, so there is no refusal "
            "to test. That is good news and this skip is the notification: "
            "re-point this suite at a synthetic failing store, or retire it."
        )

    assert table_marker not in out, (
        f"{module} announced a failed control and printed the table anyway — "
        f"the exact defect register 345 named. Marker found: {table_marker!r}"
    )
    assert r.returncode == 1, (
        f"{module} must still EXIT 1 on a failed control; suppressing the print "
        f"is not the same as passing. got {r.returncode}"
    )


def test_the_artifact_is_still_written_complete_because_a_gate_reads_it() -> None:
    """Suppressing the WRITE would blind the machines instead of the reader.

    `streamability.py:38` refuses on `measured_need_curve.json`'s
    `controls_all_passed`, so that file must still be written, still carry the
    false flag, and still carry the full curve.
    """
    with tempfile.TemporaryDirectory() as d:
        out_path = Path(d) / "mnc.json"
        r = run(BACKTEST / "measured_need_curve.py", "--json", str(out_path))
        if FAILED not in (r.stdout + r.stderr):
            pytest.skip("controls pass on this store — see the skip note above")
        assert out_path.exists(), "the artifact must still be written"
        doc = json.loads(out_path.read_text())

    assert doc.get("controls_all_passed") is False, (
        "the artifact must carry the FALSE flag — that flag is what the "
        "downstream gate refuses on"
    )
    curve = doc.get("curve") or {}
    assert set(curve) >= {"QB", "RB", "WR", "TE", "K", "DEF"}, (
        f"the curve must still be complete, got {sorted(curve)}"
    )
    assert any(v is not None for row in curve.values() for v in row), (
        "the curve must carry real values, not a shell of Nones"
    )


@pytest.mark.parametrize("module,table_marker", sorted(MODULES.items()))
def test_KNOWN_POSITIVE_the_pre_patch_module_really_did_print_the_table(
    module: str, table_marker: str,
) -> None:
    """Rule 3e: an absent table is also what an early crash produces.

    Runs the module with the fix's one guard line undone, from a copy placed
    in `draft/backtest/` so its relative data paths resolve. If this stops
    printing the table, this suite has stopped being able to detect the defect
    it guards, and every assertion above it is unanchored.
    """
    # ⚠️ A MUTATION OF THE LIVE SOURCE, NOT A SHA AND NOT A FROZEN FIXTURE,
    # and the two rejected options are worth naming because I tried both.
    #
    # `git show <sha>~1:...` — my first cut, against a sha that does not exist
    # in this repo. It SKIPPED. A skipped control is not a control; it printed
    # "3 passed, 1 skipped" and I nearly shipped it as evidence.
    #
    # Reverse-applying register345's patch onto a copy — failed at line 167,
    # because the patch was generated against a slightly different base and
    # `git apply` had absorbed the offset going forward. A control that must
    # be re-generated whenever the module moves is a control that will be
    # deleted the first time it goes red for the wrong reason.
    #
    # So: take the module AS IT IS TODAY and undo exactly the one line the fix
    # introduced — `say` becomes an unconditional `print`. That reproduces the
    # pre-fix behaviour from the live source, cannot go stale, and fails loudly
    # if the fix is ever restructured, which is precisely when this suite needs
    # a human to look at it.
    src = (BACKTEST / module).read_text()
    GUARD = "say = print if all_ok else (lambda *a, **k: None)"
    assert GUARD in src, (
        "the fix's guard line is gone or restructured, so this control cannot "
        "reproduce the pre-fix behaviour and the tests above are unanchored. "
        "Re-point this control at whatever replaced it."
    )
    tmp = BACKTEST / ("_prepatch_" + module.replace(".py", "") + "_control_tmp.py")
    tmp.write_text(src.replace(GUARD, "say = print"))
    try:
        r = run(tmp)
        out = r.stdout + r.stderr
        assert FAILED in out, (
            "the control run did not even reach the control block — it is not "
            "exercising the path this suite is about"
        )
        assert table_marker in out, (
            "THE KNOWN POSITIVE FAILED: the pre-patch module did not print the "
            "table, so 'no table' in the patched module is not evidence of "
            "anything. Fix this before trusting the tests above."
        )
    finally:
        os.unlink(tmp)
