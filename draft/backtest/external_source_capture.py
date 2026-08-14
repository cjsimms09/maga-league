#!/usr/bin/env python3
# TERRITORY: C
"""EVERY SOURCE'S OWN PRICE, KEPT SEPARATELY — because the merged one destroys them.

A's finding, 2026-08-14, and it is the right thing to fix before the anchor
question: `draft/data/adp_series.json` stores `{date, adp}` — THE MERGED PRICE,
with no source field. Every day we record what the anchor said and throw away what
every other source said. So "does FFC actually price quarterbacks earlier than
FantasyPros, and by how much" cannot be answered from anything on disk. It needs a
re-fetch, and a re-fetch of a PAST date does not exist: neither provider serves ADP
as of a past day, which is the measured finding this whole archive exists because
of.

AND NEXT AUGUST IT STILL WOULD NOT BE ANSWERABLE, because we are not storing it
this year either. That is the part worth fixing today rather than after the draft.

WHAT IT CHANGES. `merge_primary_over_ffc` makes FFC the coverage backbone and
merges FantasyPros over it — so the shipped board's "ffc: 4 rows" is not FFC's
depth, it is what SURVIVED. A measured it: FFC priced 215, 211 are overwritten,
144 of those sit inside the draftable board, and the overwritten quarterbacks are
Allen, Lamar, Burrow, Maye, Daniels, Hurts, Herbert and Prescott. Every one of
those prices is discarded daily and none of them is recoverable afterwards.

⚠ THIS IS A SEPARATE ARTIFACT AND A SEPARATE STEP, DELIBERATELY. The MFL capture
is the perishable, unrefetchable thing and everything in this lane today has been
about not costing it a day. A new fetch that fails must not touch it — so this
writes its own file, runs after the snapshot is committed, and its every failure
mode is a missing day in ITS archive rather than a missing day in the one that
matters.

WHAT IT DOES NOT DO. It does not merge, rank, average or choose. It records what
each source said, keyed by OUR player id, with the fetch parameters that produced
it. Deciding which one prices the board is A's; this only makes the decision
answerable from evidence instead of from a re-fetch that cannot happen.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERIES = HERE.parent / "data" / "external_source_prices.json"

#: What each snapshot declares about itself. Named rather than derived, so a field
#: that stops being written shows up as EMPTY instead of ceasing to exist — the
#: same reason `SNAPSHOT_FIELDS` exists one file over.
SOURCE_FIELDS = ("source", "observed_at", "year", "params", "row_count", "rows",
                 "sd", "sd_count", "note")


def load(path=None) -> list:
    p = Path(path or SERIES)
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("series") or []


def append_day(series: list, source: str, year, observed_at: str, rows: dict,
               sd: dict = None, params: dict = None, note: str = None) -> list:
    """Add one source's board for one day. Returns a NEW series.

    DEDUPED BY (source, year, date), so a retried workflow replaces rather than
    doubling — the same rule the MFL archive enforces, and for the same reason: a
    duplicated day is indistinguishable from two real observations downstream.

    `sd` IS THE PROVIDER'S OWN PUBLISHED DISPERSION AND NOTHING ELSE. FFC serves
    one; FantasyPros serves none. The merge destroys FFC's on the same rows it
    destroys the price — the shipped board keeps an `ffc-published` sd on 4
    players of the 215 FFC priced — so it is exactly as unrefetchable as the mean
    beside it. A value FITTED from the mean by our own clamp must never be stored
    here: archived, it becomes our arithmetic wearing the provider's name a year
    later, which is the same failure as a merged price with no source field.
    """
    key = (str(source), str(year), str(observed_at))
    keep = [s for s in (series or [])
            if (str(s.get("source")), str(s.get("year")),
                str(s.get("observed_at"))) != key]
    keep.append({
        "source": str(source), "observed_at": str(observed_at), "year": str(year),
        # THE PARAMETERS THAT PRODUCED IT, stored beside the numbers. A price
        # without its format is not evidence — half-PPR at ten teams and full-PPR
        # at twelve are different quantities wearing the same field name, which is
        # the whole reason this file exists.
        "params": dict(params or {}),
        "rows": {str(k): float(v) for k, v in (rows or {}).items() if v is not None},
        "row_count": len([v for v in (rows or {}).values() if v is not None]),
        "sd": {str(k): float(v) for k, v in (sd or {}).items() if v is not None},
        "sd_count": len([v for v in (sd or {}).values() if v is not None]),
        "note": note,
    })
    return keep


def save(series: list, path=None) -> None:
    p = Path(path or SERIES)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({
        "_territory": "TERRITORY: C — written by external_source_capture.py",
        "_what": "What EACH source said, per day, before any merge. The board's "
                 "merged price destroys the alternatives; this keeps them.",
        "series": sorted(series or [],
                         key=lambda s: (s.get("year") or "", s.get("observed_at") or "",
                                        s.get("source") or "")),
    }, indent=1))


def disagreement(series: list, year, observed_at: str, positions: dict = None) -> dict:
    """What the sources actually said about the same players on the same day.

    THE QUESTION THIS FILE EXISTS TO MAKE ANSWERABLE. Reported per position,
    because the format difference that matters — 4-point passing TDs against our
    6 — bites at one position and the whole-board median hides it.

    Reports the MEDIAN SIGNED DIFFERENCE in pick number over the players both
    priced, and the count. It does NOT rank, merge or choose; comparing two
    sources on the players they share is the one comparison whose two sides are
    the same quantity.
    """
    day = [s for s in (series or [])
           if str(s.get("year")) == str(year) and str(s.get("observed_at")) == str(observed_at)]
    if len(day) < 2:
        return {"status": "unmeasured", "sources": [s.get("source") for s in day],
                "note": "fewer than two sources captured on this day — nothing to "
                        "compare, which is a fact about the capture rather than "
                        "about the sources"}
    from statistics import median
    out = {"status": "measured", "sources": sorted(s.get("source") for s in day),
           "pairs": {}}
    # ⚠ SORTED, SO THE SIGN OF EVERY GAP IS A FACT ABOUT THE SOURCES AND NOT
    # ABOUT THE ORDER THEY WERE APPENDED IN. `a->b` reports `b - a`; `save` sorts
    # by source name and `append_day` does not, so the same day read +15 in the
    # run that captured it and -15 the next morning after a reload. Same number,
    # opposite readings, nothing saying which was which — and the whole point of
    # this file is a comparison somebody trusts a year later.
    day = sorted(day, key=lambda s: str(s.get("source")))
    for i in range(len(day)):
        for j in range(i + 1, len(day)):
            a, b = day[i], day[j]
            shared = set(a["rows"]) & set(b["rows"])
            if not shared:
                continue
            per_pos, overall = {}, []
            for pid in shared:
                d = b["rows"][pid] - a["rows"][pid]
                overall.append(d)
                pos = (positions or {}).get(str(pid))
                if pos:
                    per_pos.setdefault(pos, []).append(d)
            out["pairs"]["%s->%s" % (a["source"], b["source"])] = {
                "shared": len(shared),
                # THE DIRECTION IN WORDS. A signed pick difference is exactly the
                # kind of number a reader flips without noticing, and the finding
                # this archive exists to settle is a SIGNED one — whether FFC
                # prices quarterbacks EARLIER than FantasyPros, not by how much
                # they differ. Spelling it out costs a string per pair.
                "reads": "positive = priced LATER by %s than by %s"
                         % (b["source"], a["source"]),
                "median_pick_difference": round(median(overall), 2),
                "by_position": {k: {"n": len(v), "median": round(median(v), 2)}
                                for k, v in sorted(per_pos.items())},
            }
    return out


def coverage(series: list, year) -> dict:
    """Which sources we hold, over which days, and how deep each was.

    A source that silently stops being captured is the failure this reports: the
    others keep arriving, the file keeps growing, and the comparison quietly
    becomes a comparison of fewer things.
    """
    ser = [s for s in (series or []) if str(s.get("year")) == str(year)]
    by = {}
    for s in ser:
        b = by.setdefault(s.get("source"), {"days": [], "min_rows": None, "max_rows": None})
        b["days"].append(s.get("observed_at"))
        n = s.get("row_count") or 0
        b["min_rows"] = n if b["min_rows"] is None else min(b["min_rows"], n)
        b["max_rows"] = n if b["max_rows"] is None else max(b["max_rows"], n)
    for b in by.values():
        b["days"] = sorted(set(b["days"]))
        b["day_count"] = len(b["days"])
    days = sorted({s.get("observed_at") for s in ser})
    thin = [d for d in days
            if len({s.get("source") for s in ser if s.get("observed_at") == d}) < len(by)]
    return {"year": str(year), "sources": by, "days": days,
            # A DAY MISSING ONE SOURCE IS NOT A DAY. It is a day on which no
            # comparison can be made, and it must not be counted as covered.
            "days_missing_a_source": thin}
