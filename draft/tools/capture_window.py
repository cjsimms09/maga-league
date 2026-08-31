#!/usr/bin/env python3
# TERRITORY: A
"""IS THIS WEEK'S DATA PLAUSIBLY AVAILABLE YET? — the Python half of
`src/capture_window.js` (register 438).

⚠️ TWO FILES, ONE PREDICATE, AND A TEST THAT PROVES THEY AGREE. This repo has
paid for the alternative: register 408's duplicate-arm guard was shipped four
times by hand and the copies drifted. The JS side is required because the reco
crons are Netlify functions; this side is required because
`draft/weekly_proj_snapshot.py` is Python. `draft/tests/test_capture_window_agrees.py`
runs both against the real schedule and fails if they ever disagree, which is
the same shape `season_completeness.js`/`.py` already uses here.

Keep the constants and the rule identical to the JS. If you change one, the
agreement test will tell you about the other.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

LEAD_DAYS = 4
TRAIL_DAYS = 1
SCHEDULE = Path(__file__).resolve().parents[2] / "draft" / "data" / "nfl_schedule_2026.json"


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))


def window_for(season, week, schedule_path: Path = SCHEDULE):
    """(opens, closes) as aware datetimes, or None when the schedule cannot say."""
    try:
        doc = json.loads(Path(schedule_path).read_text())
    except (OSError, ValueError):
        return None
    try:
        if int(doc.get("season")) != int(season):
            return None
    except (TypeError, ValueError):
        return None
    wk = (doc.get("weeks") or {}).get(str(week))
    if not wk or not wk.get("first") or not wk.get("last"):
        return None
    try:
        first, last = _parse(wk["first"]), _parse(wk["last"])
    except ValueError:
        return None
    return (first - timedelta(days=LEAD_DAYS), last + timedelta(days=TRAIL_DAYS))


def week_is_live(season, week, now=None, schedule_path: Path = SCHEDULE):
    """True / False / None.

    ⚠️ None means CANNOT SAY and every caller must treat it as such rather than
    as "no". A missing schedule must never become a silent season-long refusal
    to capture — the worst it may do is restore the behaviour that existed
    before this file (rule 3e: "could not check" and "checked and it is not
    live" must never look the same).
    """
    w = window_for(season, week, schedule_path)
    if w is None:
        return None
    if now is None:
        now = datetime.now(timezone.utc)
    elif isinstance(now, str):
        now = _parse(now)
    return w[0] <= now <= w[1]
