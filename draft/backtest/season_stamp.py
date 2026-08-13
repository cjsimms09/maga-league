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


def historical(*years):
    """A prior-season value, deliberately carried. Must declare itself.

    ACCEPTS SEVERAL YEARS, because the board's usage fields are a BLEND.
    `build.py:678` runs `opportunity_metrics(pbp, weekly, [2025, 2024],
    recency_weights [0.7, 0.3])`, so `target_share` and its siblings are 70% 2025
    and 30% 2024. A single-year stamp cannot say that: `historical(2025)` hides the
    2024 component and `historical(2024)` misstates the dominant one.

    Found by verifying the classification against the artifact rather than trusting
    my reading of the code — the board and a 2025-only computation produced the same
    509 players but only 5% matching values, with the board's range compressed at
    both ends, which is what a blend looks like.
    """
    ys = [int(y) for y in years]
    if not ys:
        raise ValueError("historical() needs at least one season")
    return {"kind": "historical", "season": ys[0] if len(ys) == 1 else ys,
            "seasons": ys}


def derive(*sources):
    """A field computed from others — as current as its FURTHEST-BACK input.

    THE FIELD THIS EXISTS FOR IS `proj_mean`. `projections.blend` computes
    `mean_proj = base * (1 + adj)` where `adj` is a function of
    `composite_z(metrics, ...)` and `metrics` is the [2025, 2024] usage blend. So the
    board's single most consequential number is a 2026 projection MODULATED BY
    prior-season usage, and it reaches back to 2024 on every path — including the one
    where the base is a clean 2026 fetch.

    A flat `derived` label cannot say that, and `seasonal(2026)` would be a false
    claim about the most important field there is. So a derivation carries the UNION
    of its inputs' seasons, and is historical if ANY input is.

    A derivation over only live state stays `current` — it must not acquire a
    spurious year, or the record of what was actually verified is destroyed one layer
    down from where it was made.
    """
    if not sources:
        raise ValueError("derive() needs at least one input source")
    years, any_hist, all_current = [], False, True
    for src in sources:
        kind = (src or {}).get("kind")
        if kind == "current":
            continue
        all_current = False
        if kind == "historical":
            any_hist = True
            years.extend(src.get("seasons") or [src.get("season")])
        elif kind == "seasonal":
            years.append(src.get("season"))
        else:
            raise ValueError("derive() got an undeclared input kind %r" % kind)
    if all_current:
        return CURRENT_STATE
    ys = sorted({int(y) for y in years if y is not None})
    if any_hist:
        return historical(*ys)
    return {"kind": "seasonal", "season": ys[0] if len(ys) == 1 else ys,
            "seasons": ys}


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
            out[field + "_season"] = src["season"]
            out[field + "_historical"] = True
        elif kind == "seasonal":
            out[field + "_season"] = src["season"]
        else:
            raise ValueError(
                "unknown source kind %r for field %r — a field whose provenance is "
                "not one of seasonal/current/historical cannot be stamped, and "
                "guessing here is the defect this module exists to prevent"
                % (kind, field))
    return out


def oldest_season(row: dict, field: str):
    """The OLDEST season a field draws on — a blend is only as current as its
    furthest-back component. The newest component cannot launder the oldest: if a
    2024 value is unacceptable on a 2026 board, a blend containing 2024 is too."""
    s = (row or {}).get(field + "_season")
    if isinstance(s, (list, tuple)):
        return min(int(x) for x in s) if s else None
    if s == CURRENT or s is None:
        return s
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


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
            yr = oldest_season(r, f)          # a blend is judged on its oldest year
            try:
                yr = int(yr)
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
            elif str(oldest_season(r, f)) == str(target_season):
                kinds["proven"] += 1
            else:
                kinds["other"] += 1

    v = violations(rows, target_season, fields=fields)
    return {"status": "counted", "ok": not v, "rows": len(rows), "checked": checked,
            "violations": len(v), "by_kind": kinds, "detail": v[:20],
            "note": "`current` is live state with no season in the payload and is "
                    "NEVER normalised to the target year — that distinction is the "
                    "only record of which fields were actually verified."}


# ── THE BOARD FIELD MAP, traced from the ingest paths rather than guessed ───
#
# Each entry says WHERE the field comes from, so A's refusal has something to
# declare against. Traced 2026-08-13 by reading the fetch sites, not by inferring
# from field names.
#
#   seasonal    the year was in the request — a fact about the fetch
#   current     live state, no season in the payload
#   historical  a prior season, deliberately carried
#   derived     computed from other board fields; inherits their stamps
#   runtime     the kind DEPENDS ON A BRANCH TAKEN AT BUILD TIME (see below)
BOARD_FIELD_SOURCES = {
    # Sleeper's /players/nfl dump. No season anywhere in the payload — these
    # describe the world today and are correct for 2026 by construction.
    "player_id": "current", "name": "current", "position": "current",
    "team": "current", "age": "current", "years_exp": "current",
    "injury_status": "current", "depth_chart_order": "current",
    "sleeper_rank": "current",

    # FFC / FantasyPros, fetched with the year in the URL.
    "adp": "seasonal", "raw_adp": "seasonal", "adjusted_adp": "seasonal",
    "adp_source": "seasonal", "adp_sd": "seasonal", "consensus_rank": "seasonal",
    "bye": "seasonal", "bye_source": "seasonal",
    "proj_sleeper": "seasonal", "proj_fantasypros": "seasonal",

    # nflfastR play-by-play for [season-1, season-2] — build.py:665. These ARE
    # prior-season values on a 2026 board, and legitimately so: 2026 usage does
    # not exist yet. They must be DECLARED historical, not blocked and not waved
    # through. This is exactly Cory's "unless that data IS considered relevant to
    # this year".
    # A BLEND of [season-1, season-2] at recency_weights [0.7, 0.3], NOT one year.
    "target_share": "historical", "opportunity_share": "historical",
    "wopr": "historical", "opportunity_z": "historical",
    "opportunity_adj": "historical",

    # Computed from the above; a derived field is only as current as its inputs,
    # which is why A's refusal belongs where the derivation happens.
    # RUNTIME on the base (build.py:340 can swap in prior-season actuals) AND
    # always blended with [season-1, season-2] usage through opportunity_adj —
    # projections.blend does `base * (1 + adj)`. Reaches 2024 on every path.
    "proj_mean": "runtime", "proj_baseline": "runtime",
    "proj_sd": "derived", "proj_ceiling": "derived", "proj_floor": "derived",
    "variance": "derived", "variance_why": "derived", "weekly_sd": "derived",
    "games_expected": "derived", "vorp": "derived", "replacement": "derived",
    "tier": "derived", "tier_rank": "derived", "tier_size": "derived",
    "tier_drop": "derived", "overall_rank": "derived", "pos_rank": "derived",
    "pool_rank": "derived", "adp_stale": "derived", "adp_velocity": "derived",
}

#: `PROJECTION_PROVENANCE.source` values and what season they imply.
PROJECTION_SOURCES = {
    "sleeper_projections": "seasonal",
    "fantasypros_projections": "seasonal",
}


def projection_source(provenance: dict, target_season):
    """The projection field's TRUE kind, read from provenance at build time.

    THIS IS THE FIELD CORY'S GATE EXISTS FOR. `build.py:340` falls back to the PRIOR
    SEASON'S ACTUALS when fewer than `PROJECTION_MIN_NONZERO` of this year's
    projections carry points — the August case, when the upcoming season has no
    projections published yet. On that path every `proj_mean` on a 2026 board is a
    2025 realized total, and the only thing that says so is
    `PROJECTION_PROVENANCE.source` reading `sleeper_stats_2025`.

    So this field cannot be declared statically. Declaring it `seasonal(2026)` would
    stamp a board built on last season's actuals as this year's, and pass the gate
    built to catch precisely that.

    (Checked on the 2026-08-13 board: source is `sleeper_projections`, 633 rows with
    points — the fallback did NOT fire. The path is live and currently unused.)
    """
    src = ((provenance or {}).get("projections") or {}).get("source")
    if src in PROJECTION_SOURCES:
        return seasonal(int(target_season))
    if isinstance(src, str) and src.startswith("sleeper_stats_"):
        return historical(int(src.rsplit("_", 1)[-1]))
    raise ValueError(
        "unrecognised projection source %r — refusing to guess. An unknown source "
        "defaulted to this year's is the assumption this gate exists to remove; if "
        "a new provider has landed, add it to PROJECTION_SOURCES deliberately." % src)


def unclassified_fields(row: dict) -> list:
    """Board fields with no declared provenance.

    A MAP WITH A HOLE IS WORSE THAN NO MAP: the gate goes green on exactly the field
    nobody thought about, which is always the one added last week by someone who did
    not know the gate existed. So this is asserted by test against the real artifact
    rather than maintained by hope.
    """
    return sorted(k for k in (row or {})
                  if not k.endswith("_season") and not k.endswith("_historical")
                  and k not in BOARD_FIELD_SOURCES)
