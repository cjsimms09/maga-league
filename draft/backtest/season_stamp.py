# TERRITORY: C
"""SEASON STAMPS AT INGEST — the ingest half of the last-season gate.

Cory, 2026-08-13, HIGH: a player drafted high in 2025 may go late or undrafted in
2026, so any field carrying a prior-season value into a 2026 recommendation is a
**silent, plausible-looking error** — the worst kind, because nothing downstream
looks wrong. C stamps at ingest; A builds the refusal in `projections.py`.

Cory's clarification decides the design: *"unless that data IS considered relevant to
this year. The goal is to make sure we are operating off current years projections,
ADPs, and data."*

## WHY THREE VALUES AND NOT TWO

A two-state stamp (this year / not this year) forces a lie on the largest group of
fields on the board. Sleeper serves `age`, `years_exp`, `injury_status`,
`depth_chart_order` and `team` **with no season in the payload at all**. They are
live state — correct for 2026 by construction, because they describe the world today
— but nothing in the response proves it. Stamping them `2026` would be an assertion
wearing a measurement's clothes, which is the exact defect class this gate exists to
stop. Stamping them `2025` would be false. So:

    2026      PROVEN — the year was in the request; a fact about the fetch
    current   LIVE STATE — no season in the payload, correct by construction
    <year>    HISTORICAL — and it must declare itself

`current` is deliberately never normalised to the target year. If it were, the record
of which fields were actually *verified* would be destroyed, and the gate could never
be tightened later because nothing would distinguish a proven 2026 from an assumed
one.

## AND AN UNSTAMPED FIELD IS A VIOLATION

That is the whole design rather than a strictness preference. A gate whose default is
"fine" only catches the fields somebody remembered to mark — and the field that bites
is always the one added last week by someone who did not know the gate existed.

## WHAT THIS DOES NOT DO

It does not decide policy. `violations()` reports; the refusal is A's, in
`projections.py`, where the board is assembled. Rule 14 still applies in the other
direction: the detector ships with the stamp so A's refusal is one call and not a
second implementation of the same rule.
"""
from __future__ import annotations

#: The stamp for live state with no season in the payload.
CURRENT = "current"

#: Field-source declarations, passed to `stamp()`.
CURRENT_STATE = {"kind": "current"}


def seasonal(year):
    """A source that was requested FOR a season — the year is a fact about the fetch."""
    return {"kind": "seasonal", "season": int(year)}


def historical(year):
    """A prior-season value, deliberately carried. Must declare itself."""
    return {"kind": "historical", "season": int(year)}


def stamp(record: dict, sources: dict) -> dict:
    """Return a copy of `record` with `<field>_season` beside each declared field.

    PER FIELD, NOT PER RECORD, and that is the point. A board row is assembled from
    four or five sources with different season semantics — an ADP from a year-scoped
    export, an age from a live dump, a prior-season total from nflverse. One stamp on
    the row would have to pick one of them and would be wrong about the rest.
    """
    out = dict(record)
    for field, src in (sources or {}).items():
        kind = (src or {}).get("kind")
        if kind == "current":
            out[field + "_season"] = CURRENT
        elif kind == "historical":
            out[field + "_season"] = int(src["season"])
            out[field + "_historical"] = True
        elif kind == "seasonal":
            out[field + "_season"] = int(src["season"])
        else:
            raise ValueError(
                "unknown source kind %r for field %r — a field whose provenance is "
                "not one of seasonal/current/historical cannot be stamped, and "
                "guessing here is the defect this module exists to prevent"
                % (kind, field))
    return out


def violations(rows: list, target_season, fields=()) -> list:
    """Every field that must not reach a `target_season` board, with the reason.

    Three ways a field fails, and they are reported distinctly because they need
    different fixes:

      * UNSTAMPED — ingest does not declare where it came from
      * SUB-TARGET, NOT DECLARED HISTORICAL — the defect Cory named
      * A FUTURE season — a stamp later than the board it is on, which is either a
        mislabel or a leak, and either way is not something to wave through
    """
    out = []
    for r in (rows or []):
        for f in fields:
            if f not in r:
                continue
            key = f + "_season"
            if key not in r:
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "unstamped — ingest did not declare a season for "
                                   "this field, and an unstamped field is a "
                                   "violation rather than a pass"})
                continue
            s = r[key]
            if s == CURRENT:
                continue
            try:
                yr = int(s)
            except (TypeError, ValueError):
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "season stamp %r is neither a year nor %r"
                                   % (s, CURRENT)})
                continue
            if yr < int(target_season) and not r.get(f + "_historical"):
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "sourced from %d on a %s board and NOT declared "
                                   "historical — a prior-season value reaching this "
                                   "year's recommendation" % (yr, target_season)})
            elif yr > int(target_season):
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "stamped %d on a %s board — a mislabel or a leak"
                                   % (yr, target_season)})
    return out


def report(rows: list, target_season, fields=()) -> dict:
    """The gate's verdict, with its denominator stated.

    UNCOUNTED ON AN EMPTY BOARD (rule 13f): a gate that reports clean when the
    artifact failed to build is green on exactly the day it must shout.
    """
    rows = list(rows or [])
    if not rows:
        return {"status": "uncounted", "ok": False, "rows": 0, "checked": 0,
                "violations": 0, "by_kind": {}, "detail": [],
                "why": "no rows — a gate needs a denominator (rule 13f)"}

    kinds = {"proven": 0, "current": 0, "historical": 0, "unstamped": 0, "other": 0}
    checked = 0
    for r in rows:
        for f in fields:
            if f not in r:
                continue
            checked += 1
            key = f + "_season"
            if key not in r:
                kinds["unstamped"] += 1
            elif r[key] == CURRENT:
                kinds["current"] += 1
            elif r.get(f + "_historical"):
                kinds["historical"] += 1
            elif str(r[key]) == str(target_season):
                kinds["proven"] += 1
            else:
                kinds["other"] += 1

    v = violations(rows, target_season, fields=fields)
    return {"status": "counted", "ok": not v, "rows": len(rows), "checked": checked,
            "violations": len(v), "by_kind": kinds, "detail": v[:20],
            "note": "`current` is live state with no season in the payload and is "
                    "NEVER normalised to the target year — that distinction is the "
                    "only record of which fields were actually verified."}
