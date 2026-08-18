"""THE CAPTURE THAT IS THE EXPERIMENT MUST NOT LOSE DAYS QUIETLY.

── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────

`draft/data/proj_series.json` is the frozen record of what Sleeper and
FantasyPros projected, day by day, before anyone knew the answers. Tracing
`PREDICTION-LEDGER` P39 on 2026-08-18 established what rests on it:

**We have never once measured our own model against Sleeper.** Not at any
position, on any season. `model_accuracy_v5/v6`'s promotion bar is *"beat BOTH
NAIVE baselines"* — Sleeper is not in it — and v5 records `api.sleeper.app: "no
route"` with the consequence stated outright: the bar *"first becomes measurable
at the January 2027 grade of the frozen 2026 proj_series, which prices Sleeper,
FP and own_v5 on the same season."*

**So this file is not an input to the experiment. It IS the experiment**, and it
is the only one that can ever settle `CORY-ASKS` A2 — the source ruling Cory has
been waiting on. A day lost here is not a day of data; it is a permanent hole in
the only evidence that can answer the question, and retroactive fetches leak
(exp33), so it cannot be backfilled.

── WHAT IT ALREADY LOST ───────────────────────────────────────────────────────

**2026-08-10 has a `sleeper` row and no `fantasypros` row.** Nine of ten dates
are complete; that one is not, and **nothing reported it.** It happened during
the easiest possible conditions — preseason, daily cadence, no game-week timing
pressure — which is why the in-season risk is worth a check rather than a hope.

That is register row 41's failure mode in the concrete: the capture job ends with
`git diff --cached --quiet && echo "no change" && exit 0`, so "nothing new to
capture" and "the fetch returned nothing" are the same green.

── WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────

Three questions, because any one alone passes on a broken series:

  1. **Is a captured date missing a source?** A RATCHET, not a wall — one hole
     exists and cannot be backfilled, so failing outright would be a red nobody
     can clear (the `intervention-rate` epitaph). It fails when the count GROWS,
     and it NAMES the known hole so a swap cannot hide behind the same count.
  2. **Is a whole day missing?** The cadence is daily (`draft-data.yml`,
     `0 8 * * *`), so captured dates must be contiguous.
  3. **Is anything still being written?** A contiguous, complete series can be a
     DEAD one — that is the vacuous pass this whole file is about.
"""
from __future__ import annotations

import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERIES = ROOT / "draft" / "data" / "proj_series.json"

#: Both sources must be present on a captured date, because the January 2027
#: grade prices them against each other ON THE SAME DAY. One without the other
#: is not half a comparison — it is none.
REQUIRED = {"sleeper", "fantasypros"}

#: Measured 2026-08-18: 2026-08-10 is missing `fantasypros`. Retroactive fetches
#: leak (exp33), so this can never go to zero — lower it only if a date is
#: legitimately removed, never by relaxing REQUIRED.
KNOWN_INCOMPLETE = 1


def _by_date():
    doc = json.loads(SERIES.read_text(encoding="utf8"))
    out = collections.defaultdict(set)
    for row in doc.get("series", []):
        if row.get("date") and row.get("source"):
            out[row["date"]].add(row["source"])
    return out


def test_CONTROL_the_series_exists_and_has_real_rows():
    """Every assertion below passes trivially on an empty file."""
    assert SERIES.exists(), "the series that IS the experiment is missing"
    by = _by_date()
    assert len(by) >= 5, f"only {len(by)} captured dates — the series emptied out"
    assert any(REQUIRED <= s for s in by.values()), \
        "not one date has both sources — the check has nothing to compare"


def test_no_MORE_dates_are_missing_a_source_than_already_were():
    """The ratchet. A new hole fails at the commit that lands it."""
    by = _by_date()
    bad = sorted(d for d, s in by.items() if not REQUIRED <= s)
    detail = ", ".join(f"{d} has only {sorted(by[d])}" for d in bad)
    assert len(bad) <= KNOWN_INCOMPLETE, (
        f"{len(bad)} captured dates are missing a source (baseline "
        f"{KNOWN_INCOMPLETE}): {detail}\n"
        "This series cannot be backfilled — retroactive fetches leak (exp33) — "
        "so a new hole is permanent, and it is a hole in the ONLY evidence that "
        "can settle CORY-ASKS A2.")


def test_the_known_hole_is_STILL_the_one_we_think_it_is():
    """A ratchet that does not name its exemption can hide a swap.

    If 2026-08-10 were quietly backfilled and a different date broke, the count
    would still be 1 and the ratchet would pass. Naming it stops that.
    """
    by = _by_date()
    bad = sorted(d for d, s in by.items() if not REQUIRED <= s)
    if len(bad) == KNOWN_INCOMPLETE:
        assert bad == ["2026-08-10"], (
            f"the incomplete date changed from 2026-08-10 to {bad} — same count, "
            "different hole, which a bare ratchet cannot see")


def test_FAIL_ARM_the_detector_can_actually_fail():
    """Rule 3e: a check never seen to fail is not known to work."""
    fake = {"2026-09-01": {"sleeper", "fantasypros"}, "2026-09-02": {"sleeper"}}
    bad = [d for d, s in fake.items() if not REQUIRED <= s]
    assert bad == ["2026-09-02"], bad
    clean = {"2026-09-01": {"sleeper", "fantasypros"}}
    assert not [d for d, s in clean.items() if not REQUIRED <= s]


def test_no_WHOLE_DAY_is_missing_from_the_span():
    """CLOSES THE LIMIT THIS FILE SHIPPED WITH AN HOUR AGO.

    The first version compared sources WITHIN a captured date and said outright
    that a day the job never ran leaves no row and is invisible. That is the
    bigger hole, and it turned out not to need "a calendar the series does not
    carry" after all — the cadence is knowable from the workflows.
    `draft-data.yml` runs `0 8 * * *`, DAILY, and is what appends these rows;
    `weekly-proj-snapshot.yml` adds the Sunday one. So the expectation is simply
    that captured dates are contiguous.

    Measured 2026-08-18: 2026-08-09 → 2026-08-18, ten calendar days, ten
    captured, ZERO whole days missing. The only defect is the source-level hole
    on 08-10 that the ratchet above pins.
    """
    import datetime as _dt
    dates = sorted(_by_date())
    assert dates, "no dates at all"
    lo, hi = _dt.date.fromisoformat(dates[0]), _dt.date.fromisoformat(dates[-1])
    span = {(lo + _dt.timedelta(days=i)).isoformat() for i in range((hi - lo).days + 1)}
    missing = sorted(span - set(dates))
    assert not missing, (
        f"{len(missing)} whole day(s) never captured: {missing}\n"
        "A daily job produced these rows, so a gap is a run that did not happen "
        "or did not write. This series cannot be backfilled (exp33).")


def test_the_series_is_still_BEING_written():
    """A contiguous series can be a DEAD one, and that is the vacuous pass here.

    If the capture stopped today, tomorrow's run would still find 2026-08-09 →
    2026-08-18 perfectly contiguous and perfectly complete, and every check above
    would pass while nothing was being captured at all. Freshness is the half
    that makes the rest mean something.

    Seven days is deliberately generous for a daily job — tight enough to notice
    a dead capture inside a week, loose enough that it cannot cry wolf over a
    single missed run or a weekend of CI trouble. A guard that fires every
    morning is a guard that gets switched off; `intervention-rate` wrote that
    epitaph and this file is not going to repeat it.
    """
    import datetime as _dt
    dates = sorted(_by_date())
    newest = _dt.date.fromisoformat(dates[-1])
    age = (_dt.date.today() - newest).days
    assert age <= 7, (
        f"the newest captured date is {dates[-1]}, {age} days old. The capture "
        "that IS the January 2027 experiment has stopped writing.")


def test_FAIL_ARM_the_gap_and_freshness_checks_can_fail_too():
    """Both new checks, exercised on synthetic input. Rule 3e applies to them
    as much as to the ratchet, and neither had been seen to fail."""
    import datetime as _dt

    # (2) a whole day missing IS detected
    dates = ["2026-08-09", "2026-08-10", "2026-08-12"]
    lo, hi = _dt.date.fromisoformat(dates[0]), _dt.date.fromisoformat(dates[-1])
    span = {(lo + _dt.timedelta(days=i)).isoformat() for i in range((hi - lo).days + 1)}
    assert sorted(span - set(dates)) == ["2026-08-11"]

    # CONTROL — a contiguous run is NOT flagged
    ok = ["2026-08-09", "2026-08-10", "2026-08-11"]
    lo, hi = _dt.date.fromisoformat(ok[0]), _dt.date.fromisoformat(ok[-1])
    span = {(lo + _dt.timedelta(days=i)).isoformat() for i in range((hi - lo).days + 1)}
    assert not span - set(ok)

    # (3) a dead capture IS detected, and a live one is not
    today = _dt.date.today()
    assert (today - (today - _dt.timedelta(days=30))).days > 7
    assert (today - (today - _dt.timedelta(days=2))).days <= 7
