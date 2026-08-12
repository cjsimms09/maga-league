#!/usr/bin/env python3
"""SLEEPER TRENDING ADDS AND DROPS — the series that cannot be reconstructed later.

WHY, AND THE TEST IT PASSES. Cory's rule, 2026-08-12: capture where it is free
and the series cannot be rebuilt afterwards. Not "do we have a hypothesis" — a
snapshot not taken is unrecoverable and a hypothesis can arrive later.

Sleeper serves `/players/nfl/trending/{add,drop}` free, unauthenticated, with no
rate concern, and it returns ONLY THE CURRENT WINDOW. There is no historical
endpoint. Every day nobody captures it is a day that does not exist afterwards.

AND IT MEASURES SOMETHING NOTHING ELSE WE HOLD MEASURES. ADP is what people
PAID — a settled price over weeks. Trending is what people are SUDDENLY REACTING
TO, in the last 24 hours. A player can be flat in ADP and violently trending, and
that difference is the whole content of the series.

BOUNDED, per rule 9. Two endpoints Sleeper already returns, nothing derived,
nothing new integrated. No claim is made here that trending predicts anything —
it is not graded, not scored, and not visible on any live surface. It is a
series being started because starting it later is impossible.

WHAT IT DELIBERATELY DOES NOT DO. It does not resolve player ids to names or
join to the board. A capture that transforms is a capture that can be wrong; the
raw `{player_id: count}` Sleeper returns is what gets stored, and interpretation
happens whenever somebody has a question.

Pure functions here; the workflow calls `fetch_and_append`.
"""
from __future__ import annotations

MAX_DAYS = 400          # a full year plus, bounded so the file cannot grow forever
LOOKBACK_HOURS = 24     # the window Sleeper aggregates over
LIMIT = 50              # deeper than the 25 the app shows; still one small response


def append_snapshot(series, date, adds, drops, max_days=MAX_DAYS):
    """series: [{date, adds:{id:count}, drops:{id:count}}] oldest→newest.

    Returns a NEW list with `date`'s snapshot added, or REPLACED if that date is
    already present — a same-day re-run must not double-count, the same dedupe
    rule adp_series and proj_series use. Deterministic: no clock, the date is
    passed in.
    """
    kept = [s for s in (series or []) if s.get("date") != date]
    kept.append({
        "date": date,
        "adds": {str(k): int(v) for k, v in (adds or {}).items()},
        "drops": {str(k): int(v) for k, v in (drops or {}).items()},
        "lookback_hours": LOOKBACK_HOURS,
    })
    kept.sort(key=lambda s: s["date"])
    return kept[-max_days:]


def _parse(payload):
    """Sleeper returns [{player_id, count}, ...]. Anything else is refused.

    NOT tolerant on purpose. A shape change that this silently absorbed would
    write an empty snapshot every day and the series would look captured while
    being hollow — the exact failure the standing check exists to catch, and it
    is cheaper to refuse here than to detect there.
    """
    if not isinstance(payload, list):
        raise ValueError(f"trending payload is {type(payload).__name__}, expected a list")
    out = {}
    for row in payload:
        if not isinstance(row, dict) or "player_id" not in row or "count" not in row:
            raise ValueError(f"trending row missing player_id/count: {str(row)[:80]}")
        out[str(row["player_id"])] = int(row["count"])
    return out


def movers(series, kind="adds", days=1, top=10):
    """The biggest movers between the latest snapshot and `days` before it.

    Provided so the series has a reader from day one rather than accumulating
    unread (rule 14). Returns [(player_id, latest, delta)] sorted by delta.
    """
    if not series or len(series) <= days:
        return []
    now = series[-1].get(kind) or {}
    then = series[-(days + 1)].get(kind) or {}
    rows = [(pid, c, c - int(then.get(pid, 0))) for pid, c in now.items()]
    rows.sort(key=lambda r: -r[2])
    return rows[:top]


def fetch_and_append(series, date, *, get_json, limit=LIMIT,
                     lookback_hours=LOOKBACK_HOURS):
    """Fetch both directions and append one snapshot. `get_json` is injected so
    the whole path is testable without egress."""
    base = "https://api.sleeper.app/v1/players/nfl/trending"
    q = f"?lookback_hours={lookback_hours}&limit={limit}"
    adds = _parse(get_json(f"{base}/add{q}"))
    drops = _parse(get_json(f"{base}/drop{q}"))
    if not adds and not drops:
        raise ValueError("both trending endpoints returned nothing — refusing to "
                         "write an empty snapshot that would read as a captured day")
    return append_snapshot(series, date, adds, drops)


if __name__ == "__main__":                                  # pragma: no cover (egress)
    import json
    import pathlib
    import urllib.request
    from datetime import datetime, timezone

    path = pathlib.Path(__file__).resolve().parent / "data" / "sleeper_trending.json"
    doc = json.loads(path.read_text()) if path.exists() else {
        "_note": "Daily Sleeper trending adds/drops (append-only, deduped by date). "
                 "Sleeper serves only the CURRENT window — there is no historical "
                 "endpoint, so an un-captured day is unrecoverable. Not graded, not "
                 "wired to any live surface. See draft/sleeper_trending.py.",
        "series": [],
    }

    def _get(url):
        req = urllib.request.Request(url, headers={"User-Agent": "maga-league/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc["series"] = fetch_and_append(doc.get("series") or [], today, get_json=_get)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1) + "\n")
    latest = doc["series"][-1]
    print(f"trending {today}: {len(latest['adds'])} adds, {len(latest['drops'])} drops, "
          f"{len(doc['series'])} days retained")
