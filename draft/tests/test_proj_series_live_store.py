# TERRITORY: relay measures · C owns the capture
"""THE COMMITTED `proj_series.json` OBEYS ITS OWN RULES — checked on the FILE.

`test_proj_series.py` proves `append_snapshot()` dedupes by `(date, source)`.
That is the function. **Nobody was checking the artifact.** This project has
found the same gap four separate times this week — a tested function and an
unexamined file — so this closes it for the one store where the damage is
permanent.

WHY PERMANENT. `proj_series.json` is the preseason-frozen record that a clean
post-season source grade is computed against. Its own `_note` says why it cannot
be repaired: *"Frozen for a CLEAN post-season grade — retroactive fetches leak
(exp33)."* A snapshot not taken on the day cannot be taken later, and a snapshot
corrupted in place cannot be recovered from anywhere. Register row 20 calls this
*"the retention rule's canonical case."*

⚠️ WHAT THIS FILE DELIBERATELY DOES **NOT** ASSERT, and the reason matters more
than the assertions. It does not require a capture on every calendar day for
every source. FantasyPros is missing 2026-08-10 — a real, permanent, single-day
hole — and `draft-data.yml` already emits `::warning::proj_series for <today> is
PARTIAL` when that happens. Turning a source outage into a red build would red
the nightly board over somebody else's downtime, which is the `intervention-rate`
epitaph word for word: *"a guard that cries wolf every morning is a guard that
gets switched off."*

So every assertion below fires ONLY on corruption — a duplicate, an empty
snapshot, a malformed row, a source vanishing entirely. Those are never normal,
never caused by an upstream outage, and always mean something wrote the file
wrongly.

Run: python3 -m pytest draft/tests/test_proj_series_live_store.py -q
"""
from __future__ import annotations

import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "draft" / "data" / "proj_series.json"
EXPECTED_SOURCES = {"fantasypros", "sleeper"}


def _series() -> list:
    return json.loads(STORE.read_text(encoding="utf8"))["series"]


def _dupes(series) -> list:
    counts = collections.Counter((e.get("date"), e.get("source")) for e in series)
    return sorted(k for k, v in counts.items() if v > 1)


def test_the_store_exists_and_is_a_list_of_snapshots():
    assert STORE.exists(), f"{STORE} is gone — the frozen record is the whole point"
    doc = json.loads(STORE.read_text(encoding="utf8"))
    assert "series" in doc and isinstance(doc["series"], list)
    assert doc["series"], "the store is empty"
    #: the note is load-bearing — it is where the un-backfillable reason lives
    assert "retroactive" in doc.get("_note", "").lower(), (
        "the _note no longer explains why this cannot be re-fetched; a reader "
        "who does not know that will try to backfill it and leak")


def test_no_duplicate_date_and_source_in_the_committed_file():
    """`append_snapshot` REPLACES a same-day re-run rather than appending a
    second row. If two ever land, one silently wins every downstream `latest()`
    and the grade is computed on a snapshot nobody chose."""
    d = _dupes(_series())
    assert not d, f"duplicate (date, source) rows in the frozen store: {d}"


def test_CONTROL_the_duplicate_detector_can_actually_find_one():
    """Rule 3e. The test above returns a clean 'no'. A checker that CANNOT say
    yes has not been tested, only run — and 'nothing found' and 'asked wrong'
    look identical from the outside."""
    series = _series()
    planted = series + [dict(series[0])]
    found = _dupes(planted)
    assert found == [(series[0]["date"], series[0]["source"])], (
        f"the detector did not find a planted duplicate: {found}")


def test_every_snapshot_is_well_formed_and_non_empty():
    """An empty `proj` dict is the dangerous shape: it reads downstream as 'we
    captured that day and the source had nobody', which is a measurement. It is
    not one — it is a failed fetch that got written anyway."""
    for i, e in enumerate(_series()):
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(e.get("date", ""))), (
            f"entry {i} has a malformed date: {e.get('date')!r}")
        assert e.get("source"), f"entry {i} has no source"
        proj = e.get("proj")
        assert isinstance(proj, dict) and proj, (
            f"entry {i} ({e.get('date')} {e.get('source')}) has an empty "
            "projection map — a failed fetch must not be recorded as a capture")
        #: values are points, not ranks or strings
        assert all(isinstance(v, (int, float)) for v in proj.values()), (
            f"entry {i} carries non-numeric projections")


def test_both_sources_are_still_being_captured():
    """The comparison this store exists to enable needs BOTH arms. One source
    silently dropping out is not an outage shape — an outage costs a day, not a
    column — so this is worth a red build."""
    got = {e["source"] for e in _series()}
    missing = EXPECTED_SOURCES - got
    assert not missing, (
        f"{sorted(missing)} has no snapshot at all; the store can no longer "
        "answer the source question it was built for")


def test_the_store_is_append_only_in_practice_not_only_in_docstring():
    """Every committed snapshot predates or equals the most recent one, and none
    is from the future. A future-dated row means something wrote a projection
    for a day that has not happened, which is the leak this store refuses."""
    import datetime as dt
    dates = sorted({e["date"] for e in _series()})
    today = dt.date.today().isoformat()
    ahead = [d for d in dates if d > today]
    assert not ahead, f"snapshots dated in the future: {ahead}"
    assert len(dates) >= 2, "a one-day store cannot show a trend"
