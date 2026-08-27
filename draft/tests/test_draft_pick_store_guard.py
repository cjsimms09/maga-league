# TERRITORY: A
"""THE DRAFT-PICK GRADER WAS PROTECTED BY AN ACCIDENT WITH AN EXPIRY DATE.

Register 349. On 2026-08-25 an unplayed 2026 season entered `league_history` as
a full schedule of zeroes and broke four instruments (registers 338-341).
`draft_pick_vs_random` came through clean — and register 340 ① recorded WHY, so
it would not be mistaken for a clean bill of health: it values picks from a
DIFFERENT store, `nflverse_weekly_points_<year>.json`, and no 2026 file exists.
`f.exists()` was False, the season was skipped, and nothing else in the function
had to be right.

**The moment C captures 2026 weekly points, that guard is gone.** These arms fire
the landmine deliberately, by BUILDING the 2026 store in each of the shapes it
could arrive in, so the fix is tested against the future rather than against
today's convenient absence.

Run: python -m pytest draft/tests/test_draft_pick_store_guard.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import draft_pick_vs_random as D  # noqa: E402

REAL = ROOT / "draft" / "backtest" / "nflverse_weekly_points_2025.json"
FAKE = ROOT / "draft" / "backtest" / "nflverse_weekly_points_2026.json"


@pytest.fixture()
def store_2026():
    """Write a 2026 store for the duration of one test, then remove it.

    REFUSES to run if a real 2026 store has appeared — the day C captures one,
    these arms must not silently clobber it. That is the same failure this file
    exists to prevent, pointed at itself.
    """
    if FAKE.exists():
        pytest.skip("a real 2026 store exists — not clobbering it")
    real = json.loads(REAL.read_text())

    def write(mutate):
        doc = json.loads(json.dumps(real))
        mutate(doc)
        FAKE.write_text(json.dumps(doc))
        return doc

    try:
        yield write
    finally:
        if FAKE.exists():
            FAKE.unlink()


def test_CONTROL_a_real_complete_season_is_still_valued():
    """The guard must not be a wall. If this fails, every arm below passes for
    the wrong reason — the function refusing everything."""
    assert D.season_totals(2025), "a real complete season is now refused"
    assert len(D.season_totals(2025)) > 300


def test_A_SCHEDULE_OF_ZEROES_IS_REFUSED(store_2026):
    """The landmine. A store written before games are played sums to a dict of
    0.0 — NON-EMPTY, so the old `if not tot` waved it through, and every pick
    and every alternative would have been valued at nothing."""
    def zero(doc):
        doc["coverage"] = {"2026": {"weeks": 18, "complete": True}}
        for w in doc["weeks"]:
            w["points"] = {k: 0.0 for k in w["points"]}
    doc = store_2026(zero)

    # THE OLD GUARD, reproduced here as a known positive rather than described:
    old = {}
    for w in doc["weeks"]:
        for pid, v in w["points"].items():
            old[pid] = old.get(pid, 0.0) + float(v)
    assert old, "the old `if not tot` no longer reproduces — re-read this test"
    assert len(old) > 300, "the old guard would have graded %d players at 0.0" % len(old)

    assert D.season_totals(2026) is None
    assert "NOTHING SCORED" in D.skip_reason(2026)


def test_A_PARTIAL_SEASON_IS_REFUSED_ON_THE_STORES_OWN_WORD(store_2026):
    """Week 1 real, the rest empty. `tot` is genuinely non-zero, so NO zero-check
    can see this one — the store's own `coverage.complete` is the only evidence,
    which is why it is read rather than a week-count threshold being invented."""
    def partial(doc):
        doc["coverage"] = {"2026": {"weeks": 1, "first": 1, "last": 1,
                                    "missing": list(range(2, 19)), "complete": False}}
        for w in doc["weeks"][1:]:
            w["points"] = {}
    store_2026(partial)
    assert D.season_totals(2026) is None
    assert "INCOMPLETE" in D.skip_reason(2026)


def test_A_REAL_COMPLETE_2026_IS_GRADED(store_2026):
    """KNOWN POSITIVE. The point is to grade 2026 once it is real — a fix that
    only ever refuses would be a different way of being wrong."""
    store_2026(lambda doc: doc.update(
        {"coverage": {"2026": {"weeks": 18, "complete": True}}}))
    assert D.season_totals(2026)


def test_A_STORE_WITH_NO_COVERAGE_KEY_IS_NOT_REFUSED_FOR_THAT(store_2026):
    """A missing field is not evidence of an incomplete season. Older stores, or
    a writer that stops emitting the key, must fall back to the zero-check rather
    than have every season silently vanish from the grade."""
    def no_cov(doc):
        doc.pop("coverage", None)
    store_2026(no_cov)
    assert D.season_totals(2026)


def test_THE_SKIP_LINE_NAMES_THE_REASON_IT_ACTUALLY_HIT():
    """The report said "for want of a weekly-points store" when that became one
    of three causes. A report that names the one cause that did NOT happen is
    how a reader stops believing the report."""
    if FAKE.exists():
        pytest.skip("a real 2026 store exists")
    assert D.skip_reason(2026) == "no weekly-points store"
    assert "no weekly-points store" not in D.skip_reason(2025)
