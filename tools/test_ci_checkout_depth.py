# TERRITORY: A
"""THE GATE MUST CHECK OUT ENOUGH HISTORY TO RUN ITS OWN CHECKS.

2026-08-17. `main`'s CI was red for hours, five days before the draft, and the
cause was not in any product file. `.github/workflows/ci.yml` used a bare
`actions/checkout@v4`, whose default is `fetch-depth: 1` — one commit, no
parents. Two separate things broke on that one line, and only ONE of them was
visible:

  THE VISIBLE HALF. test_core_needs_no_reviewer.py runs the real reviewer as
  `--base HEAD~1 --head HEAD` to prove a NORMAL review stays non-blocking when
  the key is absent. `HEAD~1` does not resolve on a depth-1 clone, so the
  reviewer refused an empty diff and exited 1 and the assertion went red. The
  test was correct; the environment could not satisfy its premise.

  THE INVISIBLE HALF, WHICH IS THE ONE THAT MATTERS. The merge-completeness
  step is gated on `git rev-parse -q --verify HEAD^2`. On a depth-1 clone that
  never resolves, so on a REAL merge commit the step printed "not a merge
  commit — merge-completeness check N/A" and passed. Measured on `main`:
  ac4b2253 has two parents and its own run printed exactly that. The guard
  against a half-landed merge could not fire on a merge. That is this repo's
  most-repeated defect class — a check that cannot fail, reported as a check
  that passed — and it had reached the gate itself.

WHY THIS FILE EXISTS RATHER THAN A COMMENT IN THE WORKFLOW. A comment cannot
fail. The `with: fetch-depth: 0` is one line that any future edit could drop
while the workflow still parses, still runs, and still reports green — and the
only symptom would be a guard quietly going N/A again. So the requirement is
read from the WORKFLOW FILE ITSELF (yaml.safe_load, never a copy typed here).

THE KNOWN-POSITIVE CONTROL IS NOT OPTIONAL HERE. Every check in this repo ships
with proof it can fail, because the thing being guarded against is precisely a
check that only ever passes. test_the_check_can_actually_fail runs the same
predicate against a synthetic workflow with the depth removed and asserts it
REFUSES — so a green result from the real check means something.

Run: python3 -m pytest tools/test_ci_checkout_depth.py -q
"""
from __future__ import annotations

from pathlib import Path

import pytest

yaml = pytest.importorskip(
    "yaml", reason="PyYAML absent; ci.yml installs it before the suites run")

ROOT = Path(__file__).resolve().parent.parent
CI = ROOT / ".github" / "workflows" / "ci.yml"

#: The workflows whose jobs depend on history beyond the tip commit, each with
#: WHAT depends on it. A workflow that does not walk parents does not belong
#: here — a blanket rule would push a needless full clone onto every job.
NEEDS_FULL_HISTORY = {
    "ci.yml": "test_core_needs_no_reviewer's HEAD~1 arm + the HEAD^2 "
              "merge-completeness gate",
}


def _checkout_steps(doc):
    """Every actions/checkout step in the document, whatever job it sits in."""
    out = []
    for job in (doc.get("jobs") or {}).values():
        for step in (job or {}).get("steps") or []:
            uses = str((step or {}).get("uses") or "")
            if uses.startswith("actions/checkout"):
                out.append(step)
    return out


def _shallow_offenders(doc):
    """The predicate under test, factored out so the control can reuse it.

    Returns the checkout steps that would leave the runner without parent
    commits. `fetch-depth: 0` means unlimited; anything else (including the
    DEFAULT, which is the case that actually bit us) is shallow.
    """
    bad = []
    for step in _checkout_steps(doc):
        depth = ((step or {}).get("with") or {}).get("fetch-depth")
        if str(depth) != "0":
            bad.append(step)
    return bad


def test_ci_checks_out_full_history():
    doc = yaml.safe_load(CI.read_text())
    steps = _checkout_steps(doc)
    assert steps, "ci.yml has no actions/checkout step at all"
    bad = _shallow_offenders(doc)
    assert not bad, (
        "ci.yml checks out a SHALLOW clone (fetch-depth "
        + ", ".join(repr(((s.get('with') or {}).get('fetch-depth')))
                    for s in bad)
        + "). It needs " + NEEDS_FULL_HISTORY["ci.yml"] + ".\n"
        "A default checkout has ONE commit and no parents, so HEAD~1 and HEAD^2 "
        "do not resolve — which reddens the reviewer test AND makes the "
        "merge-completeness step report N/A on real merge commits instead of "
        "checking them. Restore `with: {fetch-depth: 0}`.")


def test_the_check_can_actually_fail():
    """THE KNOWN-POSITIVE CONTROL. Without this, a green above proves nothing:
    a predicate that returned [] for every input would look identical."""
    default_checkout = yaml.safe_load(
        "jobs:\n  tests:\n    steps:\n      - uses: actions/checkout@v4\n")
    assert _shallow_offenders(default_checkout), (
        "the predicate did not flag a BARE actions/checkout@v4 — the exact "
        "shape that broke main on 2026-08-17. It cannot fail, so its passing "
        "says nothing.")

    explicit_one = yaml.safe_load(
        "jobs:\n  tests:\n    steps:\n      - uses: actions/checkout@v4\n"
        "        with:\n          fetch-depth: 1\n")
    assert _shallow_offenders(explicit_one), (
        "the predicate did not flag an EXPLICIT fetch-depth: 1")

    ok = yaml.safe_load(
        "jobs:\n  tests:\n    steps:\n      - uses: actions/checkout@v4\n"
        "        with:\n          fetch-depth: 0\n")
    assert not _shallow_offenders(ok), (
        "the predicate flagged a CORRECT fetch-depth: 0 — it would fail on the "
        "fix as well as the bug, which makes it useless as a gate")


def test_the_merge_completeness_gate_still_reads_HEAD_caret_2():
    """The depth requirement is only meaningful while something still walks
    parents. If the merge-completeness step is ever rewritten to stop using
    HEAD^2, half this file's justification is stale and should be re-read
    rather than silently kept."""
    text = CI.read_text()
    assert "HEAD^2" in text, (
        "the merge-completeness gate no longer reads HEAD^2. The fetch-depth "
        "requirement above was written for it — re-derive whether full history "
        "is still needed rather than leaving this file asserting a dead reason.")
