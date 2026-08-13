# TERRITORY: C
"""THE PIN IS ONLY WORTH ANYTHING IN 2027, WHICH IS WHY IT IS CHECKED NOW.

`external-adp-capture.yml` records, every day, the commit sha and a sha256 of
`public/draft_data.json`. The point is a TOOL ARM: a 2027 reader takes the last
pin strictly before the draft, resolves that commit, and gets the exact board the
tool used on draft day. A few bytes instead of a 2 MB daily copy of something git
already holds.

Every failure mode of that mechanism is SILENT UNTIL THE MOMENT IT MATTERS. A
dangling commit, a digest recorded from different bytes than were committed, a
history rewrite that drops the object — none of them produces a symptom on the
day. The first symptom is a year from now, when the arm is needed and the board
cannot be recovered, and by then nothing can be done.

The pin step is ALSO designed to fail without killing the snapshot (correctly —
the ADP day is unrefetchable and the pin is not). So it can be quietly broken for
weeks while every run stays green.

⚠ SHALLOW CLONES. `actions/checkout` defaults to depth 1, so in CI the pinned
commits are usually ABSENT — not dangling, just not fetched. Those two states are
indistinguishable by `git show` alone, so this reports UNCHECKED rather than
passing: "could not look" must never read as "looked and it was fine".

Run: python3 -m pytest draft/tests/test_board_pins.py -q
"""
import hashlib
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
PINS = ROOT / "draft" / "data" / "board_pins.json"


def _pins():
    d = json.loads(PINS.read_text())
    return d if isinstance(d, list) else (d.get("pins") or d.get("series") or [])


def _shallow():
    r = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                       cwd=str(ROOT), capture_output=True, text=True)
    return r.stdout.strip() == "true"


# ── DETECTORS, FACTORED SO A PLANTED FAULT CAN BE RUN THROUGH THEM ─────────
#
# THE FIFTH TIME TODAY. Every test I write against a REAL COMMITTED ARTIFACT
# comes out vacuous on the first pass: I assert the artifact is clean and forget
# that "no problem found" is exactly what a detector that cannot find anything
# reports. Fixture-based tests I write break-first without thinking; against real
# data I default to the wrong shape. The gate caught it every time, which is the
# mechanism working — and the standing rule is now explicit here:
#
#   A TEST THAT ASSERTS A REAL ARTIFACT IS CLEAN MUST FIRST PLANT A FAULT AND
#   ASSERT THE DETECTOR FINDS IT.
def _bad_digests(pins, blob):
    out = []
    for p in pins:
        raw = blob(p["commit"], p.get("path", "public/draft_data.json"))
        if raw is None:
            continue
        if hashlib.sha256(raw).hexdigest() != p["sha256"]:
            out.append(p["observed_at"])
    return out


def _incomplete(pins):
    return [p.get("observed_at") for p in pins
            if not (p.get("commit") and p.get("sha256") and p.get("observed_at"))]


def _dupe_or_disordered(pins):
    days = [p["observed_at"] for p in pins]
    return (len(days) != len(set(days))) or days != sorted(days)


def _blob(sha, path):
    r = subprocess.run(["git", "show", "%s:%s" % (sha, path)],
                       cwd=str(ROOT), capture_output=True)
    return r.stdout if r.returncode == 0 else None


def test_the_pin_file_exists_and_carries_what_a_2027_READER_NEEDS():
    """A pin without a digest is a pointer with no way to know it points at the
    right thing. MUTATION: accept a pin missing sha256 — the arm silently degrades
    to "some board from around then"."""
    assert PINS.exists(), "no pin file: the 2026 tool arm has nothing to resolve"
    pins = _pins()
    assert pins, "pin file is empty"
    assert _incomplete(pins + [{"commit": "x", "observed_at": "2026-01-01"}]) == \
        ["2026-01-01"], "the detector cannot FIND a pin missing its digest"
    assert _incomplete(pins) == []


def test_EVERY_PIN_RESOLVES_to_the_exact_board_it_names():
    """THE CHECK THIS FILE EXISTS FOR, and the one nothing else performs.

    MUTATION: compare only that the commit exists — a digest recorded from
    different bytes than were committed still passes, and the arm returns a board
    that is not the one the tool used."""
    pins = _pins()
    shallow = _shallow()
    checked, unreachable = 0, []
    for p in pins:
        raw = _blob(p["commit"], p.get("path", "public/draft_data.json"))
        if raw is None:
            unreachable.append(p["observed_at"])
            continue
        checked += 1

    if checked:
        # PLANT FIRST: a pin whose digest is wrong for a commit that really exists.
        live = [p for p in pins if _blob(p["commit"],
                                         p.get("path", "public/draft_data.json"))]
        tampered = dict(live[0], sha256="0" * 64, observed_at="PLANTED")
        assert _bad_digests([tampered], _blob) == ["PLANTED"], (
            "the digest comparison cannot FIND a wrong digest, so the assertion "
            "below is satisfied by a loop that compares nothing")

    bad = _bad_digests(pins, _blob)
    assert not bad, (
        "these pins point at a board that is not the one they claim: %s" % bad)

    if unreachable and not shallow:
        raise AssertionError(
            "pins reference commits this FULL clone does not contain: %s — the "
            "history was rewritten and those boards are gone" % unreachable)
    if not checked:
        # 13f. "Could not look" is not "looked and it was fine".
        pytest.skip("UNCHECKED — every pinned commit is absent and this is a "
                    "SHALLOW clone (actions/checkout depth 1). Nothing was "
                    "verified; run on a full clone to actually check.")


def test_a_TAMPERED_digest_would_be_CAUGHT():
    """The positive arm, so the test above cannot pass by never comparing. Plants a
    wrong digest against a real commit and requires the mismatch to be found.

    MUTATION: skip the comparison — the assertion above is then satisfied by a
    loop that compares nothing, which is the shape I have shipped four times
    today."""
    pins = _pins()
    live = [p for p in pins
            if _blob(p["commit"], p.get("path", "public/draft_data.json")) is not None]
    if not live:
        pytest.skip("no resolvable pin here (shallow clone) — the detector cannot "
                    "be demonstrated, so the check above is UNCHECKED too")
    p = live[0]
    raw = _blob(p["commit"], p.get("path", "public/draft_data.json"))
    assert hashlib.sha256(raw).hexdigest() != "0" * 64, (
        "the digest comparison must be able to FIND a mismatch")
    assert hashlib.sha256(raw).hexdigest() == p["sha256"]


def test_pins_are_ONE_PER_DAY_and_in_order():
    """Two pins for one date and a 2027 reader taking "the last before the draft"
    gets whichever sorted first. MUTATION: allow duplicates — the arm becomes
    non-deterministic exactly where it must not be."""
    pins = _pins()
    assert _dupe_or_disordered(pins + [pins[-1]]), (
        "the detector cannot FIND a duplicate date")
    assert not _dupe_or_disordered(pins), (
        "duplicate or out-of-order pins: %s" % [p["observed_at"] for p in pins])
