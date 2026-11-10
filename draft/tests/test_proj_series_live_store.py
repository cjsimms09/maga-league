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
    """⛔ THE KEY INCLUDES `week`, AND LEAVING IT OUT FLAGGED SIX HONEST ROWS.

    This keyed on `(date, source)` while the WRITER dedupes on
    `(date, source, week)` — `proj_series.py:145`, `and s.get("week") == week`.
    The function grew a week dimension for the weekly sources and this artifact
    checker kept the old key, which is register 5h's shape: the code moved and
    the thing checking it did not.

    Measured 2026-11-10, every pair it called a duplicate:

        2026-10-07 sleeper_weekly  weeks [1, 5]   n [444, 438]
        2026-10-11 sleeper_weekly  weeks [1, 5]   n [444, 423]
        2026-10-18 sleeper_weekly  weeks [1, 6]   n [444, 395]
        2026-10-25 sleeper_weekly  weeks [1, 7]   n [444, 393]
        2026-11-01 sleeper_weekly  weeks [1, 8]   n [444, 402]
        2026-11-08 sleeper_weekly  weeks [1, 9]   n [444, 428]

    Two different NFL weeks captured on the same DATE — which is what a weekly
    source does — with different player sets, so not duplicates in any sense.
    Under the writer's own key there are ZERO. And it cost real damage: this
    file is in the nightly board's acceptance gate, so both of its failures
    counted as BLOCKING and helped hold the draft board unpublished (546).

    ⚠️ A SEPARATE, REAL DEFECT LIVES INSIDE THAT SAME DATA and is NOT fixed by
    this key — see test_the_weekly_source_is_not_re_recording_one_frozen_week.
    """
    counts = collections.Counter(
        (e.get("date"), e.get("source"), e.get("week")) for e in series)
    return sorted((k for k, v in counts.items() if v > 1),
                  key=lambda k: tuple("" if x is None else str(x) for x in k))


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
    look identical from the outside.

    ⚠️ AND THIS ASSERTION WAS WRONG IN A WAY THAT LIED ABOUT THE DETECTOR.
    It read `found == [(date, source)]`, which can only hold when the store is
    already clean — so the moment the store held anything the detector flagged,
    this failed with "the detector did not find a planted duplicate: [6 items]"
    while the detector had in fact found the plant AND the six. A control that
    reports a working detector as broken is worse than no control: by rule 3e
    it says the instrument beside it cannot be trusted, and here that was false.

    The fix is to be DIFFERENTIAL — planting one duplicate must add exactly
    that key to whatever was already there — which is a statement about the
    detector and holds whatever state the store is in.
    """
    series = _series()
    before = set(_dupes(series))
    first = series[0]
    key = (first.get("date"), first.get("source"), first.get("week"))
    planted = series + [dict(first)]
    after = set(_dupes(planted))
    assert after - before == {key}, (
        f"planting a duplicate of {key} should add exactly that key; "
        f"the detector added {after - before} and lost {before - after}")


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


def test_the_weekly_source_is_not_re_recording_one_frozen_week():
    """⛔ THE REAL DEFECT THAT WAS HIDING BEHIND A WRONG KEY.

    Correcting `_dupes` to the writer's own `(date, source, week)` key clears
    six false flags — and would have buried this, which is why it gets its own
    test rather than riding along in the duplicate count.

    Measured 2026-11-10 on the committed store: `sleeper_weekly` holds 40
    entries, and THIRTY-FOUR of them are `week=1`, written on every calendar
    day from 2026-10-07 to 2026-11-09, with ONE distinct `proj` payload between
    them. Byte-identical, 34 times. The six genuine captures are weeks
    5, 5, 6, 7, 8, 9 — and weeks 2, 3 and 4 were never captured at all.

    WHY IT HAPPENS, as far as it is pinned: week 1 is historical, so refetching
    it returns the same numbers forever, and the series is append-only BY DATE
    — so a stale week pinned in a daily job writes one zero-information row per
    day. They arrive in the "Rescue the daily capture from a refused board"
    commits, which is the series-rescue step of the board build that has been
    refused since 2026-09-10; each such commit adds exactly three rows for the
    day: `fantasypros`, `sleeper`, and `sleeper_weekly week=1`.

    ⚠️ WHAT IS NOT PINNED, stated rather than guessed: WHICH step appends that
    third row. `build.py` writes only `sleeper` and `fantasypros`; both weekly
    writers (`weekly-proj-snapshot.yml` Sundays, `weekly-projection-archive.yml`
    Wednesdays) run weekly, not daily; and the board job's own completeness
    check expects only `{sleeper, fantasypros}`. So the writer is somewhere this
    sandbox cannot reach, and this test states the SYMPTOM precisely so the next
    run in CI can be read against it.

    This is also the GO sweep's standing "frozen series: 1 source(s)
    re-recording identical content" alarm, in the one store whose own note says
    it cannot be repaired after the fact (exp33).
    """
    series = _series()
    weekly = [e for e in series if str(e.get("source", "")).endswith("_weekly")]
    if not weekly:
        pytest.skip("no weekly source in the store yet")
    by_week = collections.defaultdict(list)
    for e in weekly:
        by_week[(e.get("source"), e.get("week"))].append(e)
    offenders = []
    for (src, wk), rows in sorted(by_week.items(), key=lambda kv: str(kv[0])):
        if len(rows) < 3:
            continue
        payloads = {json.dumps(r.get("proj"), sort_keys=True) for r in rows}
        if len(payloads) == 1:
            days = sorted(str(r.get("date")) for r in rows)
            offenders.append(
                f"{src} week={wk}: {len(rows)} dated rows "
                f"({days[0]}..{days[-1]}) share ONE payload")
    assert not offenders, (
        "a weekly source is re-recording one frozen week every day, which adds "
        "dated rows carrying no information to an append-only store that "
        "cannot be repaired (exp33):\n  " + "\n  ".join(offenders))
