# TERRITORY: D
"""AN INTERIOR HOLE IN A WEEKLY SERIES IS A DIFFERENT MEASUREMENT, NOT A GAP.

Register 41, the D half. Four capture workflows end with
`git diff --cached --quiet && echo "no change" && exit 0`. Pre-season that is
right — nothing staged means the season is unpublished, and going red weekly
until September would train everyone to ignore the job. **From 2026-09-10 it
stops being right**: in-season, nothing staged can mean the fetch failed, the
provider was empty, or the data genuinely did not move, and the workflow cannot
tell them apart. `weekly-snap-counts.yml` states the stakes in its own words —
the value of the feed is `share_volatility`, *"a quantity you can only build out
of a week-by-week series, and a series with holes in it measures a different
thing than one without."*

A owns the workflows and the warning that would fire at capture time. **This is
the other half: the series itself, checked after the fact, every CI run.** A
silent "no change" that costs a week shows up here the next day rather than in
January when someone tries to build volatility out of it.

⚠️ WHAT IS AND IS NOT A HOLE, because the distinction is the whole test. A
missing week BETWEEN two captured weeks is unrecoverable and is a defect. A
missing week at the END is simply not captured yet and is the normal state of
every in-season Wednesday. Only the interior counts.

⚠️ RULE 3E — EVERY HISTORICAL SERIES ON DISK IS COMPLETE, so this returns a null
everywhere today and a null from a probe that has never returned a positive is a
bug report. The positive is therefore constructed and asserted below: a week is
removed from a copy and the detector must find it, and a trailing week is
removed and it must NOT.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEARCH = ("draft/backtest", "draft/data")


def weeks_of(doc):
    """The week numbers a store carries, or None if it is not week-shaped."""
    if not isinstance(doc, dict):
        return None
    wk = doc.get("weeks")
    if isinstance(wk, dict):
        got = {int(k) for k in wk if str(k).isdigit()}
        return sorted(got) or None
    if isinstance(wk, list):
        got = {int(e["week"]) for e in wk
               if isinstance(e, dict) and str(e.get("week", "")).isdigit()}
        return sorted(got) or None
    return None


def interior_holes(weeks):
    """Missing weeks strictly between the first and last captured week."""
    if not weeks or len(weeks) < 2:
        return []
    return [w for w in range(weeks[0], weeks[-1] + 1) if w not in set(weeks)]


def _series():
    out = []
    for d in SEARCH:
        for p in sorted((ROOT / d).rglob("*.json")):
            try:
                doc = json.loads(p.read_text())
            except (ValueError, OSError, UnicodeDecodeError):
                continue
            wk = weeks_of(doc)
            if wk:
                out.append((p, wk))
    return out


def test_the_scan_finds_weekly_series_at_all():
    """The licence. If the shape check stops matching, the assertion below
    passes on an empty list and this file becomes decoration."""
    found = _series()
    assert len(found) >= 5, f"only {len(found)} week-shaped stores found"


def test_no_weekly_series_has_an_interior_hole():
    bad = [f"{p.relative_to(ROOT)}: weeks {wk[0]}-{wk[-1]} missing {interior_holes(wk)}"
           for p, wk in _series() if interior_holes(wk)]
    assert not bad, (
        "a weekly series has a hole between two captured weeks. That week cannot "
        "be refetched, and a series with holes measures a different thing than "
        "one without (register 41):\n  " + "\n  ".join(bad))


def test_CONTROL_the_detector_fires_on_a_hole_and_not_on_a_short_series():
    """RULE 3E, and it is constructed because reality gives no positive: every
    historical series on disk is complete, so without this the test above is a
    null nobody has licensed."""
    assert interior_holes([1, 2, 4, 5]) == [3]
    assert interior_holes([1, 4]) == [2, 3]
    assert interior_holes(list(range(1, 19))) == []
    # a TRAILING absence is not a hole — the normal in-season state
    assert interior_holes([1, 2, 3]) == []
    # and neither is a series too short to have an interior
    assert interior_holes([7]) == []
    assert interior_holes([]) == []


def test_CONTROL_a_real_store_with_a_week_removed_is_caught():
    """The end-to-end arm: take a real complete series, drop a middle week, and
    require the detector to name it — so the check is exercised against the
    shape stores actually have, not only against hand-written lists."""
    found = _series()
    complete = [(p, wk) for p, wk in found if not interior_holes(wk) and len(wk) >= 4]
    assert complete, "no complete multi-week series to build the positive from"
    p, wk = complete[0]
    victim = wk[len(wk) // 2]
    holed = [w for w in wk if w != victim]
    assert interior_holes(holed) == [victim], (
        f"removing week {victim} from {p.name} was not detected")
