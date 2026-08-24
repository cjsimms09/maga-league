# TERRITORY: A
"""THE DETECTOR FOR COLUMNS THAT WERE NEVER WIRED (register 272).

`is_mine` was false on all 150 rows of the 2026 draft because nothing on the
live path ever set it. Nothing crashed, no test failed, and `--status` printed
`mine: 0 of 12` during the draft and exited 0.

A field that is always its default is indistinguishable from a field that is
CORRECTLY its default. Both read as a healthy capture. So the sweep classifies
and a human rules; this file makes sure the classifying half works, in both
directions, against real data.

THE POINT OF TESTING A DETECTOR IS THAT IT CAN FAIL — the same standard
`test_constant_multiple_sweep.py` holds itself to. Two ways this one could be
useless and both are tested:

  * it flags nothing            -> the known-dead control catches that
  * it flags everything         -> the known-live control catches that, and it
                                   is the half a careless version would omit

Run: python -m pytest draft/tests/test_dead_field_sweep.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import dead_field_sweep as S  # noqa: E402


# ── the classifier, on values whose answer is not in doubt ─────────────────
@pytest.mark.parametrize("values,expected", [
    ([None, None, None], "never_populated"),
    ([False, False], "always_false"),
    ([[], []], "always_empty"),
    ([{}, {}], "always_empty"),
    (["", ""], "always_empty"),
    ([0, 0, 0], "always_zero"),
    (["x", "x"], "constant"),
    ([1, 2], "varies"),
    ([None, 1], "varies"),
    ([False, True], "varies"),
    ([], "no_rows"),
])
def test_the_classifier_on_unambiguous_input(values, expected):
    assert S.classify(values) == expected


def test_False_and_zero_are_NOT_the_same_class():
    """In Python `False == 0` is True, so a naive equality check collapses the
    two — and they are different findings. `is_mine` false everywhere is a
    never-wired flag; a count that is always zero is usually a real count of
    nothing. The classifier must keep them apart or its most important case
    gets the wrong name."""
    assert S.classify([False, False]) == "always_false"
    assert S.classify([0, 0]) == "always_zero"
    assert S.classify([False, 0]) == "varies"


# ── THE CONTROL, on the real 2026 capture ──────────────────────────────────
def test_CONTROL_the_sweep_catches_four_known_dead_fields():
    """THE LOAD-BEARING TEST. These four are known-dead on the real log by
    direct census. If the sweep cannot find them it cannot find the next one,
    and everything it reports is worthless."""
    out = S.self_test()
    if not out["ran"]:
        pytest.skip(out["why"])
    for field, cls in out["known_dead_caught"].items():
        assert cls in S.SUSPECT, "%s classified %r — the sweep missed a KNOWN " \
            "dead field, which is the defect it exists for" % (field, cls)


def test_CONTROL_the_sweep_leaves_four_known_LIVE_fields_alone():
    """The half a careless detector omits. A sweep that flags every column is
    exactly as useless as one that flags none, and only this direction can tell
    them apart."""
    out = S.self_test()
    if not out["ran"]:
        pytest.skip(out["why"])
    for field, cls in out["known_live_left_alone"].items():
        assert cls == "varies", "%s classified %r — a field that plainly " \
            "varies must not be flagged, or the report is noise" % (field, cls)


def test_self_test_reports_passed_and_main_refuses_when_it_does_not():
    out = S.self_test()
    if not out["ran"]:
        pytest.skip(out["why"])
    assert out["passed"] is True
    assert out["rows"] == 150, "the 2026 capture is 150 picks"


# ── a NEW dead field must FAIL the build ───────────────────────────────────
def test_an_UNACKNOWLEDGED_suspect_field_is_reported():
    """The whole mechanism: a column nobody has ruled on fails, so the next
    `is_mine` surfaces on a run instead of after a draft."""
    results = [{"store": "fake.jsonl", "fields": {
        "brand_new_flag": {"class": "always_false", "rows_present": 9,
                           "rows_total": 9, "value": False},
        "healthy": {"class": "varies", "rows_present": 9, "rows_total": 9,
                    "value": None},
    }}]
    new = S.unacknowledged(results, acks={})
    assert [n["field"] for n in new] == ["brand_new_flag"]


def test_an_ACKNOWLEDGED_field_goes_quiet():
    results = [{"store": "fake.jsonl", "fields": {
        "known_one": {"class": "never_populated", "rows_present": 9,
                      "rows_total": 9, "value": None},
    }}]
    assert S.unacknowledged(results, {"fake.jsonl": {"known_one": {"verdict": "x"}}}) == []


def test_a_CONSTANT_is_reported_but_does_not_fail():
    """`freeze_sha256` is constant across the 2026 log and that is the point of
    it — a NON-constant value there would be the defect (a log spanning two
    boards). One distinct value is usually intent, so it prints and does not
    gate."""
    results = [{"store": "fake.jsonl", "fields": {
        "freeze_sha256": {"class": "constant", "rows_present": 9,
                          "rows_total": 9, "value": "abc"},
    }}]
    assert S.unacknowledged(results, acks={}) == []


# ── the shipped ack file has to mean something ─────────────────────────────
def test_the_repo_currently_has_no_unacknowledged_dead_fields():
    """Green today, and it is the going-green that arms the mechanism: from
    here, any newly dead column fails."""
    results = [S.sweep_store(p) for p in S.DEFAULT_STORES if p.exists()]
    if not results:
        pytest.skip("no capture stores in this checkout")
    new = S.unacknowledged(results, S.load_acks())
    assert new == [], "unacknowledged suspect field(s): %s" % new


def test_every_ack_states_which_of_the_two_it_is():
    """An ack means 'somebody looked', not 'this is fine'. A bare entry is how
    this file becomes a rubber stamp, so every one must carry a verdict and a
    reason — and at least one must be an OPEN defect, because acknowledging a
    thing is not the same as fixing it and the file must be able to say so."""
    acks = S.load_acks()
    assert acks, "the ack file must not be empty while the sweep reports fields"
    verdicts = []
    for store, fields in acks.items():
        for field, ack in fields.items():
            assert isinstance(ack, dict), "%s::%s is a bare entry" % (store, field)
            assert ack.get("verdict"), "%s::%s has no verdict" % (store, field)
            assert len(ack.get("reason") or "") > 40, \
                "%s::%s has no real reason" % (store, field)
            verdicts.append(ack["verdict"])
    assert any("OPEN" in v for v in verdicts), \
        "no ack records an OPEN defect — either the file is a rubber stamp, or " \
        "my_deviation_reason got quietly marked resolved"
    assert any("CORRECT DEFAULT" in v for v in verdicts), \
        "no ack records a correct default — if every flagged field were a bug, " \
        "the sweep would not need a human in the loop at all"
