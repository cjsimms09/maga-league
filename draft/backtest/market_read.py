#!/usr/bin/env python3
"""READING SNAPSHOTS BACK — built WITH the completeness check, not after it.

B's structural note, and it is the important one. It asked whether a partial
snapshot can become Signal C's baseline, and the answer today is no — because
NOTHING READS A MARKET SNAPSHOT BACK. The only consumer is the workflow's health
file. So `complete: false` is a correct label on a producer, and the reader that
must honour it does not exist.

That is exactly the seam where the attrition reasons were discarded in the first
ingest audit, where the retry advice was discarded in the second, and where
`last_coverage` was written one line above a verdict that ignored it. Three
instances of one pattern: computed correctly, written down, ignored by the
consumer. The pattern is not a bug in any of the producers. It is what happens
when a check is built before its reader, because there is nothing yet that can
fail to honour it, so nothing proves it is honoured.

So the reader arrives with the honouring built in:

  * A BASELINE SET CANNOT BE OBTAINED WITHOUT ITS HOLES. `baselines()` returns
    the covered events AND the events known to be listed-but-never-captured, in
    one object. There is no accessor that hands back the dict alone, because that
    accessor is precisely how a partial slate silently becomes the baseline.

  * THE DENOMINATOR IS THE UNION OF EVERY EVENT EVER LISTED, not the events that
    happen to appear in the snapshots. An event deferred for budget in every run
    to date is invisible if you only count what was captured — it has no rows
    anywhere, so it cannot lower a coverage figure computed from rows.

  * EARLIEST OBSERVATION WINS, and carries its own `captured_at`. Signal C
    measures movement FROM a baseline, so the baseline is the earliest stated
    timestamp for that event, never "the first file we happened to open".

READ-ONLY, and invisible during a live decision — same contract as the capture.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SNAP_DIR = HERE.parent / "market_snapshots"
HEALTH_NAME = "capture_health.json"


class IncompleteBaseline(RuntimeError):
    """Raised when a caller demands a complete baseline set and it has holes."""


def load_snapshots(directory=None) -> list:
    """Every snapshot on disk, oldest first by its own stated finish time.

    Sorted by CONTENT rather than filename or mtime: a file's name encodes the
    start time and a rebase rewrites its mtime, but `finished_at` is what the
    capture actually observed.
    """
    d = Path(directory or SNAP_DIR)
    if not d.exists():
        return []
    out = []
    for p in sorted(d.glob("*.json")):
        if p.name == HEALTH_NAME:
            continue
        try:
            out.append(json.loads(p.read_text()))
        except Exception:                                        # noqa: BLE001
            # A CORRUPT FILE IS NOT AN ABSENT ONE. It is reported as its own kind
            # of hole rather than skipped into silence.
            out.append({"_unreadable": str(p.name)})
    return sorted(out, key=lambda s: str(s.get("finished_at") or ""))


def baselines(snapshots) -> dict:
    """Signal C's earliest observation per event — WITH the holes attached.

    Returns a single object carrying both halves:
        by_event       {event_id: {captured_at, starts_at, home, away, odds}}
        missing        [event_id, ...] listed at some point, never captured
        listed_total   the union denominator
        coverage       len(by_event) / listed_total
        complete       coverage == 1.0
        unreadable     snapshot files that could not be parsed

    There is deliberately no function that returns `by_event` on its own.
    """
    by_event, listed, unreadable = {}, set(), []
    for snap in snapshots or []:
        if snap.get("_unreadable"):
            unreadable.append(snap["_unreadable"])
            continue
        # THE UNION DENOMINATOR. Events deferred for budget have no rows anywhere,
        # so counting only captured rows would make a 13-of-48 run look total.
        for row in snap.get("events") or []:
            if row.get("event_id") is not None:
                listed.add(str(row["event_id"]))
        for eid in snap.get("events_deferred_for_budget") or []:
            if eid is not None:
                listed.add(str(eid))
        for f in snap.get("failures") or []:
            if f.get("event_id") is not None:
                listed.add(str(f["event_id"]))

        for row in snap.get("events") or []:
            eid = row.get("event_id")
            if eid is None:
                continue
            eid = str(eid)
            prior = by_event.get(eid)
            # EARLIEST STATED TIMESTAMP WINS, not file order.
            if prior is None or str(row.get("captured_at") or "") < str(
                    prior.get("captured_at") or ""):
                by_event[eid] = row

    missing = sorted(listed - set(by_event))
    total = len(listed)
    cov = (len(by_event) / total) if total else 0.0
    return {
        "by_event": by_event,
        "missing": missing,
        "listed_total": total,
        "captured_total": len(by_event),
        "coverage": cov,
        "complete": total > 0 and not missing,
        "unreadable": unreadable,
    }


def require_complete(bl: dict, what: str = "Signal C baseline") -> dict:
    """Honour `complete: false` LOUDLY, for callers that cannot tolerate holes.

    The failure names the events rather than the count, because "35 missing" is
    not actionable and "these 35 event ids" is — the next capture can take them
    while the window is still open.
    """
    if not bl.get("complete"):
        miss = bl.get("missing") or []
        raise IncompleteBaseline(
            f"{what} covers {bl.get('captured_total')}/{bl.get('listed_total')} events "
            f"({bl.get('coverage', 0):.1%}); {len(miss)} have NO baseline: "
            f"{miss[:10]}{' ...' if len(miss) > 10 else ''}. "
            "A partial slate must not become the baseline movement is measured from")
    return bl


def observations(snapshots, event_id) -> list:
    """Every observation of one event, oldest first — the Signal C series.

    Per event by construction, which is the whole reason a partial slate is
    survivable: event A's opening line does not depend on event B being captured.
    """
    eid = str(event_id)
    out = []
    for snap in snapshots or []:
        for row in snap.get("events") or []:
            if str(row.get("event_id")) == eid:
                out.append(row)
    return sorted(out, key=lambda r: str(r.get("captured_at") or ""))


def report(directory=None) -> dict:
    """The whole picture, for a health step or a human. Never raises."""
    snaps = load_snapshots(directory)
    bl = baselines(snaps)
    return {
        "snapshots": len([s for s in snaps if not s.get("_unreadable")]),
        "baseline_coverage": round(bl["coverage"], 4),
        "events_with_baseline": bl["captured_total"],
        "events_listed": bl["listed_total"],
        "events_without_baseline": bl["missing"],
        "complete": bl["complete"],
        "unreadable": bl["unreadable"],
        # Events observed more than once — the only ones movement is measurable on
        # at all. A baseline with no second observation is a point, not a series.
        "events_with_movement": sum(
            1 for e in bl["by_event"] if len(observations(snaps, e)) > 1),
    }


def main():                                                      # pragma: no cover
    print(json.dumps(report(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":                                       # pragma: no cover
    raise SystemExit(main())
