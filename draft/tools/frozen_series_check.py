#!/usr/bin/env python3
"""IS A DAILY CAPTURE STILL MOVING? — the blindness that cost 28 days.

Register 538 ④. Cory, 2026-10-07: *"Every week going forward needs to work!"*

── WHAT NOTHING IN THIS REPO COULD SEE ────────────────────────────────────────

`external_source_prices.json` is an append-only daily series. Measured
2026-10-07 by hashing each day's `rows` content per source:

    fantasypros   53 days, 2026-08-14 .. 2026-10-06
                  identical-content streak of 28 DAYS, from 2026-09-08
                  — the same ADP value for every one of 365 players,
                    every day, for four weeks
    ffc           31 days, 2026-08-14 .. 2026-09-13
                  longest identical streak 3; varied daily to its last capture

And the pre-kickoff distribution says how abnormal that is: before 2026-09-08
FantasyPros' longest identical-day streak was **1** — it changed EVERY DAY for
25 straight days. FFC's was 3.

So one source has been re-recording a dead payload for four weeks and the other
stopped appearing entirely, and **every freshness instrument in the repo read
both as healthy**: the file is present, it gains a row daily, the newest row
parses, the row counts are stable. Stability was the symptom and every check
was built to reward it.

⚠️ 2026-09-08 IS TWO DAYS BEFORE WEEK 1 KICKED OFF (2026-09-10). Both pricing
sources ended at the start of the season, which is what a DRAFT measurement does
— ADP stops being published once drafts stop happening. The board has therefore
been priced on a frozen pre-season ADP snapshot since 09-08, and nothing said
so. That is the finding; this tool is so that it cannot happen quietly again.

── THE BAR, AND WHY IT IS THIS NUMBER ─────────────────────────────────────────

MEASURED, not chosen: across 84 captured days and two sources, a LIVE feed's
longest identical-content streak is 3 (FFC) and typically 1 (FantasyPros, 25
days running). The dead streak is 28. A bar of 5 sits comfortably above every
live observation and far below the dead one, so a quiet weekend cannot fire it
and a dead feed cannot hide behind it.

It reports the CURRENT streak — the one ending at the newest captured day —
because a streak in the middle of history is a past event, and the question
that matters is whether the feed is moving NOW.

Run:  python3 draft/tools/frozen_series_check.py [--json] [--max-streak 5]
Exit: 1 if any source's CURRENT identical-content streak is at or over the bar.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Append-only daily series this applies to, with the field holding the payload
#: whose CONTENT must change. Add a row here when a new daily capture lands —
#: `test_frozen_series_check.py` asserts every entry resolves.
SERIES = [
    {"key": "external_source_prices",
     "path": "draft/data/external_source_prices.json",
     "list": "series", "group": "source", "day": "observed_at",
     "payload": "rows",
     "serves": "DRAFT+MANAGE — the two sources that PRICE the board. A frozen "
               "one means the board is ranking on a stale snapshot while every "
               "presence check reads green."},
]

#: See the module header: live streaks observed are 1-3, the dead one is 28.
MAX_STREAK = 5


def _hash(payload) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def current_streak(days: list) -> tuple:
    """(streak, first_day_of_streak) for the run ENDING at the newest day.

    `days` is [(day, content_hash)] in any order; sorted here so a caller
    cannot change the answer by changing the order it happens to read in.
    """
    if not days:
        return 0, None
    days = sorted(days, key=lambda d: d[0])
    newest = days[-1][1]
    streak, first = 0, days[-1][0]
    for day, h in reversed(days):
        if h != newest:
            break
        streak += 1
        first = day
    return streak, first


def audit(max_streak: int = MAX_STREAK) -> dict:
    out = []
    for spec in SERIES:
        p = ROOT / spec["path"]
        row = {**spec, "present": p.exists(), "sources": []}
        if p.exists():
            try:
                doc = json.loads(p.read_text(encoding="utf8"))
            except ValueError as exc:
                row["error"] = f"unreadable: {exc}"
                out.append(row)
                continue
            by: dict = {}
            for e in doc.get(spec["list"]) or []:
                src = str(e.get(spec["group"]))
                day = str(e.get(spec["day"]))
                by.setdefault(src, []).append((day, _hash(e.get(spec["payload"]))))
            #: ⚠️ THE NEWEST DAY ACROSS THE WHOLE SERIES, so a source that
            #: STOPPED REPORTING is not printed with a tick.
            #:
            #: The first version did exactly that: FFC's last captured day was
            #: 2026-09-13 and its final day differed from the one before, so
            #: `current_streak` was 1 and the row read ✅ — a green tick beside
            #: a source that had not reported for 24 days. "Not frozen" and
            #: "not there" are different answers and only one of them is good
            #: news; a tool that prints the wrong one is how a dead feed keeps
            #: passing for a live one, which is the defect this file exists for.
            newest_overall = max(
                (str(e.get(spec["day"])) for e in doc.get(spec["list"]) or []),
                default=None)
            for src, days in sorted(by.items()):
                n, first = current_streak(days)
                uniq = len({h for _d, h in days})
                last = max(d for d, _h in days)
                behind = None
                if newest_overall:
                    try:
                        import datetime as _dt
                        behind = (_dt.date.fromisoformat(newest_overall)
                                  - _dt.date.fromisoformat(last)).days
                    except ValueError:
                        behind = None
                row["sources"].append({
                    "source": src, "days": len(days),
                    "first_day": min(d for d, _h in days),
                    "last_day": last,
                    "days_behind_newest": behind,
                    "distinct_payloads": uniq,
                    "current_streak": n, "streak_began": first,
                    "frozen": n >= max_streak,
                    #: reported, never ticked — the absence belongs to the
                    #: capture audit and the source probe, not to this tool
                    "stopped_reporting": bool(behind and behind >= max_streak),
                })
        out.append(row)
    return {"max_streak": max_streak, "series": out}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--max-streak", type=int, default=MAX_STREAK)
    a = ap.parse_args(argv)

    res = audit(a.max_streak)
    frozen = [(r["key"], s) for r in res["series"] for s in r.get("sources", [])
              if s["frozen"]]

    if a.json:
        print(json.dumps(res, indent=1))
        return 1 if frozen else 0

    print("=" * 74)
    print("FROZEN SERIES CHECK — is each daily capture still MOVING?")
    print(f"a live feed's identical-day streak measured 1-3; the bar is "
          f"{a.max_streak}")
    print("=" * 74)
    for r in res["series"]:
        print(f"\n{r['key']}  ({r['path']})")
        if not r["present"]:
            print("   🔴 the file does not exist")
            continue
        if r.get("error"):
            print(f"   🔴 {r['error']}")
            continue
        if not r["sources"]:
            print("   🔴 no dated entries — the series is empty, which no "
                  "freshness check reads as a problem")
        for s in r["sources"]:
            mark = "🔴" if s["frozen"] else ("⏹" if s["stopped_reporting"] else "✅")
            print(f"   {mark} {s['source']:<14} {s['days']:>3} day(s) "
                  f"{s['first_day']}..{s['last_day']}  "
                  f"{s['distinct_payloads']:>3} distinct payload(s)  "
                  f"current streak {s['current_streak']}")
            if s["frozen"]:
                print(f"        IDENTICAL CONTENT SINCE {s['streak_began']} — "
                      "present, parsing, growing a row a day, and carrying no "
                      "new information. Every presence check reads this green.")
            if s["stopped_reporting"]:
                print(f"        STOPPED REPORTING {s['days_behind_newest']} "
                      "day(s) ago — NOT frozen, ABSENT, which is a different "
                      "answer and not a tick. Whether that is a dead fetch or "
                      "an upstream winding down is the source probe's question, "
                      "not this tool's.")
        print(f"   serves : {r['serves']}")

    print("\n" + "=" * 74)
    if not frozen:
        print("✅ every source is still moving.")
        return 0
    print(f"🔴 {len(frozen)} FROZEN SOURCE(S).")
    print("   A frozen series is not a missing one: it answers every freshness")
    print("   question correctly and still tells you nothing. Decide whether")
    print("   the upstream ENDED (then stop reading it as current) or BROKE")
    print("   (then fix the fetch) — and write the answer down either way.")
    print("=" * 74)
    return 1


if __name__ == "__main__":
    sys.exit(main())
