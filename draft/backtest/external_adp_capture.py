"""D3 — THE DAILY EXTERNAL ADP SNAPSHOT. The only recoverable copy of the 2026 curve.

WHY THIS EXISTS AND WHY IT IS URGENT. The as-of probe (runs 31458991195 /
31459812251) established two things about both providers:

  * NO candidate parameter bounds ADP to a past date — DAYS, START_DATE/END_DATE,
    AS_OF and FFC's `date`/`as_of` are all accepted and IGNORED (both providers
    silently swallow unknown parameters, which is why the probe judged on moved
    composition rather than status);
  * the year figure ACCUMULATES — 2025 complete reported 844 drafts against 2026
    in progress at 112 — so a finished season's ADP necessarily contains drafts
    LATER than any league that drafted in August, and cannot be that league's
    pre-draft board under F5.

Together: **the 2026 pre-draft curve is observable only while it is happening.**
Every day not captured is gone. That is the whole justification for a cron.

WHAT D3 REGISTERS, and this file implements exactly that and nothing more:
daily, the FULL board, no top-N truncation and no retention window, append-only,
deduped by date. It deliberately differs from `draft/adp_series.py` — A's HOME
staleness instrument, which caps at TOP_N=300 and MAX_DAYS=60. Those caps are
right for a staleness alarm and wrong for an evidence archive: a league's board
is the whole board, and a 60-day window would silently delete the early season.

RULE 4, ON WHY A DAILY CAPTURE IS NOT A FILTER. Capturing a superset is the
opposite of selection. The degree of freedom rule 4 governs is WHICH snapshot a
league uses, and F5 already registers that — the latest strictly before its
draft. Daily is the maximal-information cadence, the one choice that cannot be
tuned toward a result.

RULE 14, THE CONSUMER. `as_store_snapshots()` converts the stored series into the
exact shape `external_replay.ExternalAsOfStore` already consumes, so the reader
exists the day the writer does — and the strictly-before rule stays implemented
in ONE place rather than being re-derived here.
"""
from __future__ import annotations

import json
from datetime import date as _date
from datetime import timedelta as _timedelta
from pathlib import Path

import field_population as FP

SERIES = Path(__file__).resolve().parent.parent / "data" / "external_adp_series.json"

#: The fields a snapshot is SUPPOSED to carry, declared rather than derived. Derived
#: from the rows, a field that stops being written simply stops existing and the
#: population record cannot tell you it is gone — which is the failure mode, not a
#: detail of it.
SNAPSHOT_FIELDS = ["year", "observed_at", "rows", "total_drafts", "row_count"]

# The header the shipped client sends; FFC 403s Python's default. Kept in step
# with `draft/adp.py` by test, not by trust.
USER_AGENT = "mfga-league-draft-tool/1.0"


def append_snapshot(series: list, year, observed_at: str, rows: dict,
                    total_drafts=None) -> list:
    """Add one day's board. Returns a NEW series; deduped by (year, date).

    NO TRUNCATION AND NO RETENTION WINDOW, deliberately — see the module note.
    A same-day re-run REPLACES rather than doubles, so a retried workflow cannot
    silently create two boards for one date and leave `board()` picking whichever
    sorted first.

    `rows` is {provider_player_id: adp}. Names are NOT stored: MFL ids are stable
    and the players export resolves them at replay time, so storing a name here
    would be a second copy of a fact that already has an owner.
    """
    keep = [s for s in (series or [])
            if not (str(s.get("year")) == str(year) and s.get("observed_at") == observed_at)]
    keep.append({
        "year": str(year), "observed_at": observed_at,
        "rows": {str(k): float(v) for k, v in (rows or {}).items()},
        # COVERAGE TRAVELS WITH THE SNAPSHOT, not in a log. `total_drafts` is the
        # provider's own composition figure — the thing that showed the aggregate
        # accumulates — and a snapshot without it cannot be judged later.
        "total_drafts": total_drafts,
        "row_count": len(rows or {}),
    })
    keep.sort(key=lambda s: (s["year"], s["observed_at"]))
    return keep


def _series_of(obj) -> list:
    """Accept the series LIST or the ARCHIVE FILE it lives in. Refuse by name.

    THE TRAP THIS CLOSES, stepped in by its own author on 2026-08-11. `load()`
    unwraps `{"_note": ..., "series": [...]}` correctly, but a caller doing
    `json.load(open(SERIES))` by hand gets the WRAPPER — and iterating a dict
    yields its KEYS, so every snapshot became the string "_note" and the reader
    died on `'str' object has no attribute 'get'`.

    Loud, and it named itself, which is the only reason it cost minutes rather
    than a run. But the wiring that did it was mine, in the ingest workflow, and a
    reader that only works when the caller remembers to unwrap is a reader with a
    trap in it. Anything that is neither shape RAISES rather than returning [] —
    an empty series would report every league as `F4.no_pre_draft_adp`, which is a
    true-looking statement about the leagues and a false one about the archive.
    """
    if obj is None:
        return []
    if isinstance(obj, dict):
        return list(obj.get("series") or [])
    if isinstance(obj, list):
        return list(obj)
    raise TypeError(
        "external ADP series must be the series list or the archive dict, got %s. "
        "Returning an empty series here would report every league as having no "
        "pre-draft ADP, which is a statement about the leagues and not about this "
        "argument." % type(obj).__name__)


def as_store_snapshots(series: list, year) -> list:
    """The stored series -> `ExternalAsOfStore`'s input shape, for one season.

    THE READER, BUILT WITH THE WRITER (rule 14). It deliberately does NOT
    implement "latest strictly before the draft" — `ExternalAsOfStore.board()`
    owns that rule, and a second implementation here is how two derivation paths
    for one F5 decision would come to disagree.
    """
    return [{"observed_at": s["observed_at"],
             "rows": [{"player_id": pid, "adp": adp} for pid, adp in (s.get("rows") or {}).items()]}
            for s in _series_of(series) if str(s.get("year")) == str(year)]


#: How many absent dates to NAME. The count is always exact; only the list is
#: capped, and `missing_listed_truncated` says so when it bites. A cap that
#: silently shortens a list reads as "that was all of them".
MISSING_DAYS_LISTED = 14


def _gaps(days: list) -> dict:
    """Which calendar days between the first and the last were never captured.

    SEPARATE FROM `coverage` so it can be tested on dates alone, and because the
    parse failure has to be handled somewhere it cannot be mistaken for zero.
    """
    try:
        got = sorted({_date.fromisoformat(d) for d in days})
    except (TypeError, ValueError):
        # A DATE THIS FUNCTION CANNOT PARSE IS NOT A DAY WITH NO GAP. Returning
        # `missing: 0` here would report a clean capture off the back of a broken
        # one — the exact inversion this module exists to prevent. Rule 13f.
        return {"expected_days": None, "missing": None, "missing_days": [],
                "missing_listed_truncated": False, "complete": None,
                "gap_note": "UNCOUNTED — a date in this series is unparseable"}
    if not got:
        return {"expected_days": 0, "missing": 0, "missing_days": [],
                "missing_listed_truncated": False, "complete": None,
                "gap_note": "UNCOUNTED — nothing captured, so there is no span to check"}
    span = (got[-1] - got[0]).days + 1
    have = set(got)
    absent = [got[0] + _timedelta(days=i) for i in range(span)]
    absent = [d for d in absent if d not in have]
    return {
        "expected_days": span,
        "missing": len(absent),
        "missing_days": [d.isoformat() for d in absent[:MISSING_DAYS_LISTED]],
        "missing_listed_truncated": len(absent) > MISSING_DAYS_LISTED,
        "complete": not absent,
        "gap_note": None,
    }


def coverage(series: list, year) -> dict:
    """What we actually hold for a season — reported, never assumed.

    THE CLAIM THIS DOCSTRING USED TO MAKE WAS FALSE, and it is worth recording
    rather than quietly deleting. It said this was "the one that makes a gap in
    the capture visible". It did not. A twelve-day window with three consecutive
    days lost reported `snapshots: 9, first: 08-11, last: 08-22,
    empty_snapshots: 0` — arithmetically indistinguishable from a complete
    capture, in the function whose stated job was making the gap visible.

    That matters more here than almost anywhere else in this project, because
    the days are PERISHABLE. `empty_snapshots` already catches a dated row with
    no board behind it. Nothing caught a day with no row at all, and a day with
    no row at all can never be refetched — MFL serves no as-of-date board, which
    is the measured finding this whole archive exists because of.

    ── WHAT IT CATCHES AND WHAT IT CANNOT, STATED RATHER THAN IMPLIED ────────

    `missing_days` finds INTERIOR gaps: the capture stopped and STARTED AGAIN.
    That is detectable here at the first moment it is detectable at all — the
    resumed run sees the hole its own outage made and names the dates.

    It CANNOT see a capture that stopped and stayed stopped. There is no
    interior gap in that case; `last` simply stops advancing, and a job that is
    not running cannot report that it is not running. Detecting THAT needs an
    instrument on a different clock, comparing `last` to today. This function
    deliberately does not take a clock — the module keeps date logic passed in
    so the archive stays testable — and it would be an overclaim to imply the
    dead-capture case is covered by anything below.
    """
    ser = _series_of(series)
    days = sorted(s["observed_at"] for s in ser if str(s.get("year")) == str(year))
    counts = [s.get("row_count") or 0 for s in ser if str(s.get("year")) == str(year)]
    out = {
        "year": str(year), "snapshots": len(days),
        "first": days[0] if days else None, "last": days[-1] if days else None,
        "min_rows": min(counts) if counts else 0,
        "max_rows": max(counts) if counts else 0,
        # A DAY WITH ZERO ROWS IS NOT A DAY CAPTURED. It is a failed fetch wearing
        # a date, and counting it would make a broken run look like coverage.
        "empty_snapshots": sum(1 for c in counts if c == 0),
    }
    out.update(_gaps(days))
    return out


def missed_yesterday(series: list, year, today: _date) -> bool:
    """Did the daily capture skip the run before this one — i.e. is TODAY a resume.

    THE ESCALATION CONDITION, AND IT LIVES HERE RATHER THAN IN THE WORKFLOW
    because the first draft of it lived in the workflow and had two defects that
    no test in this project could have reached: it read the runner's local clock
    instead of UTC, and it asked `missing_days` — a list capped at 14 — whether
    yesterday was absent, so a long enough historical gap would push yesterday
    off the end and silently stop the alarm firing. A cap turning into a mute is
    the exact failure this module keeps finding in other people's code, and it
    got written here the moment the logic was somewhere untestable.

    WHY THIS CONDITION AND NOT "the archive has a gap". A permanent historical
    hole cannot be repaired — MFL serves no as-of-date board — so escalating on
    it would make this job red every morning for ever, and a permanently red job
    gets muted and then ignored. This fires on the run that can FIRST see the
    loss and goes quiet by itself the next day.

    AND THE LIMIT, AGAIN, because it is the same one: a capture that stops and
    never resumes never reaches this function, because the job that would call
    it is the job that is not running.
    """
    days = {s.get("observed_at") for s in _series_of(series)
            if str(s.get("year")) == str(year)}
    days.discard(None)
    if not days:
        return False
    yday = (today - _timedelta(days=1)).isoformat()
    # A BRAND-NEW ARCHIVE HAS NOT MISSED ANYTHING. Without this, the first run
    # would escalate about the day before the archive existed.
    return min(days) < yday and yday not in days


def load(path=None) -> list:
    p = Path(path or SERIES)
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("series") or []


def save(series: list, path=None) -> None:
    p = Path(path or SERIES)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({
        "_note": "D3 external ADP archive. Daily, FULL board, append-only, no retention "
                 "window. Not draft/data/adp_series.json (that is the HOME staleness "
                 "instrument, capped at 300 players / 60 days). See INGEST-PLAN.md D3.",
        # POPULATION TRAVELS WITH THE ARCHIVE (Cory, 2026-08-12). One line at write
        # time. `total_drafts` is the provider's composition figure and this module
        # already says a snapshot without it "cannot be judged later" — so the day it
        # starts coming back empty has to be visible HERE, in the file, rather than
        # discovered by whoever next tries to weight the series.
        "population": FP.of_records(series or [], fields=SNAPSHOT_FIELDS),
        # AND SO DOES COVERAGE, for the same reason one step along. Population
        # answers "which FIELDS of a row are empty". On an append-only DAILY
        # series there is a second hole shaped exactly like it and just as
        # invisible: a day with no row. `population` cannot see it — a day that
        # was never captured contributes no row to be counted as empty, so a
        # holed archive scores 100% on every field.
        #
        # Recorded per year, beside the rows, so the reader who picks this file
        # up as F5 evidence learns what it does NOT contain without having to
        # difference the dates themselves.
        "coverage": {y: coverage(series or [], y)
                     for y in sorted({str(s.get("year")) for s in (series or [])})},
        "series": series}, indent=1))


# ── the fetch, CI only ──────────────────────────────────────────────────────
def fetch_mfl(year):  # pragma: no cover  (egress; CI only)
    """One day's MFL ADP board. Returns (rows, total_drafts, note)."""
    import urllib.parse
    import urllib.request
    params = {"TYPE": "adp", "PERIOD": "DRAFT", "IS_PPR": "1", "IS_KEEPER": "N",
              "IS_MOCK": "-1", "INJURED": "-1", "CUTOFF": "5", "FCOUNT": "12", "JSON": "1"}
    url = ("https://api.myfantasyleague.com/%s/export?" % year) + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.loads(r.read().decode("utf-8", "replace"))
    node = (payload.get("adp") or {})
    players = node.get("player") or []
    if isinstance(players, dict):
        players = [players]
    rows = {}
    for p in players:
        pid, avg = p.get("id"), p.get("averagePick")
        if pid is None or avg is None:
            continue
        try:
            rows[str(pid)] = float(avg)
        except (TypeError, ValueError):
            continue
    try:
        total = int(node.get("totalDrafts"))
    except (TypeError, ValueError):
        total = None
    return rows, total, "mfl PERIOD=DRAFT IS_PPR=1 FCOUNT=12"


def capture(year, observed_at, path=None):  # pragma: no cover  (egress; CI only)
    rows, total, note = fetch_mfl(year)
    if not rows:
        # A FETCH THAT RETURNED NOTHING IS NOT A DAY WITH NO ADP. Writing an empty
        # snapshot would put a date in the archive with no board behind it, and
        # `board()` would later hand a replay an empty market and call it frozen.
        raise RuntimeError(
            "capture for %s on %s returned ZERO rows — refusing to write an empty "
            "snapshot, because a dated empty board is indistinguishable from a real "
            "one downstream (%s)" % (year, observed_at, note))
    series = append_snapshot(load(path), year, observed_at, rows, total)
    save(series, path)
    rep = coverage(series, year)
    print(json.dumps({"captured": len(rows), "total_drafts": total, "coverage": rep}, indent=1))
    return rep
