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
from pathlib import Path

SERIES = Path(__file__).resolve().parent.parent / "data" / "external_adp_series.json"

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


def coverage(series: list, year) -> dict:
    """What we actually hold for a season — reported, never assumed.

    The number that answers "can this league be replayed at all" before any
    replay is attempted, and the one that makes a gap in the capture visible
    rather than showing up as a league silently failing F5 months later.
    """
    ser = _series_of(series)
    days = sorted(s["observed_at"] for s in ser if str(s.get("year")) == str(year))
    counts = [s.get("row_count") or 0 for s in ser if str(s.get("year")) == str(year)]
    return {
        "year": str(year), "snapshots": len(days),
        "first": days[0] if days else None, "last": days[-1] if days else None,
        "min_rows": min(counts) if counts else 0,
        "max_rows": max(counts) if counts else 0,
        # A DAY WITH ZERO ROWS IS NOT A DAY CAPTURED. It is a failed fetch wearing
        # a date, and counting it would make a broken run look like coverage.
        "empty_snapshots": sum(1 for c in counts if c == 0),
    }


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
