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

A RATCHET on incomplete dates, not a wall. One hole exists and cannot be
backfilled, so failing outright would be a red nobody can clear — the
`intervention-rate` epitaph. It fails when the count GROWS.
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


def test_THE_LIMIT_a_date_absent_ENTIRELY_is_invisible_here():
    """STATED, NOT HIDDEN — and it is the bigger hole of the two.

    This compares sources WITHIN a captured date. A day on which the job did not
    run at all leaves no row, so there is nothing to find incomplete, and this
    check sees a shorter list rather than a gap. Catching that needs a calendar
    the series does not carry — an expected-cadence field — which is register row
    41's actual fix and belongs with the workflow, not here.
    """
    by = _by_date()
    dates = sorted(by)
    assert dates, "no dates at all"
    # documents the current span so a future reader can see what was covered
    assert dates[0] <= dates[-1]
