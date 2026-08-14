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

⚠ CORRECTION, SAME DAY, AND IT MAKES THIS FILE MORE IMPORTANT RATHER THAN LESS.
A told me FFC was "format-matched at our exact settings" and Cory caught that it
is not: `adp.py:67` — FFC publishes `standard`, `ppr`, `half-ppr`, `2qb`,
`dynasty`, every one a RECEPTION or ROSTER-SHAPE axis. THERE IS NO PASSING-TD
PARAMETER, so FFC is 4-point passing TDs exactly like FantasyPros. The anchor
swap would have fixed nothing. And that is the finding getting BIGGER, not going
away: if no public source prices our 6-point rule, the QB bias cannot be fixed by
CHOOSING a source — it is structural, and recording what each source said is then
the only way it is ever quantified. A confirmed it from our own drafts: our room
takes QB1 5.7 picks early, QB2 14.7, TE1 13.0, while RB and WR sit at ~0.

Every row this file writes therefore carries `format_axes_matched` and
`format_axes_unmatched` AS DATA. The claim that was wrong was going to be written
into the archive daily, and a false claim stored beside real numbers is worse than
no claim: a year from now it is indistinguishable from a measurement.

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


# ── IS TODAY'S PER-SOURCE WRITE TRUSTWORTHY ─────────────────────────────────
#
# Cory, 2026-08-14: "the daily data capture process needs to be correct and fixed
# so we don't keep having problems and the data itself needs to be accurate."
# The MFL archive got `integrity` and `snapshot_audit`. THIS ONE LANDED ITS FIRST
# WRITE THIS MORNING WITH NOTHING CHECKING IT AT ALL, which is the same gap one
# file over: a writer shipped without the consumer that judges it (rule 14).
#
# THE SAME TWO-CATEGORY SPLIT, and getting it wrong in either direction is worse
# than not checking. FATAL is arithmetically impossible — the day is corrupt
# whatever anyone does with it. OBSERVED is the provider or the fetch behaving
# differently from yesterday, which may be real and must not refuse a write.

#: Losing this share of a source's board overnight is a partial fetch, not a
#: provider trimming. DECLARED, not fitted, and the direction is the argument:
#: in mid-August boards GROW as more players get priced, so a quarter of one
#: vanishing between two mornings is the fetch, not the market.
ROW_COUNT_COLLAPSE = 0.25

#: And the share a source must KEEP to be written at all. Below this the day is
#: refused, not merely noted.
#:
#: ⚠ TWO THRESHOLDS, TWO JOBS, AND THEY ARE ORDERED ON PURPOSE. The one above
#: REPORTS at a 25% loss; this one REFUSES at a 50% loss, so everything refused is
#: also reported and the reporting bar can never rise above the refusing one. A
#: test pins that ordering, because the failure mode of two related constants is
#: that one drifts past the other and the quieter check silently becomes the
#: louder one's gate.
#:
#: DELIBERATELY THE SAME 0.5 AS THE MFL ARCHIVE'S `COLLAPSE_KEEP_FRACTION`, and
#: for a reason worth stating rather than assuming: that floor was calibrated
#: against a REAL feed's observed day-over-day drift (worst 36 of 708, 5.1%).
#: THIS archive is one day old and has NO drift observation of its own, so
#: inventing a tighter number here would be a threshold fitted to nothing. When
#: these sources have a fortnight of days, re-derive it from them.
COLLAPSE_KEEP_FRACTION = 0.5

#: The parameters that define WHAT WAS PRICED. If any of these changes between
#: two days, the two days are not the same measurement and every cross-day
#: comparison silently spans a format change — which is precisely the defect this
#: whole archive exists to prevent, arriving through the back door.
FORMAT_KEYS = ("scoring", "format", "teams", "year")


def source_audit(series: list, year, observed_at: str) -> dict:
    """One day's per-source write, judged. FATAL and OBSERVED kept apart.

    ⚠ CROSS-DAY CHECKS SAY "FIRST DAY" RATHER THAN "CLEAN" (rule 13f). A check
    whose only possible answer is "nothing yet" has not looked, and this archive
    is one day old — so every comparison against yesterday reports the absence of
    a yesterday by name instead of passing by default. That state was worth
    building on the morning it is guaranteed to fire.

    NOT AN `integrity`-STYLE WRITE GATE, and that is deliberate rather than an
    omission. The MFL archive refuses a corrupt write because its days are
    perishable and unrefetchable — there is no provider to re-ask. These sources
    serve TODAY's board on request, so a bad day here can be re-fetched by
    re-running the job, and refusing the write would trade a recoverable bad day
    for a permanent missing one.
    """
    ser = [s for s in (series or []) if str(s.get("year")) == str(year)]
    today = [s for s in ser if str(s.get("observed_at")) == str(observed_at)]
    fatal, observed = [], []
    if not today:
        return {"status": "unmeasured", "observed_at": str(observed_at),
                "sources": [], "fatal": [], "observed": [],
                "note": "no source wrote on this day at all — that is the capture "
                        "failing, not the sources disagreeing"}

    seen = {}
    for s in today:
        name = str(s.get("source"))
        # TWO BOARDS FOR ONE SOURCE ON ONE DAY. `append_day` dedupes by
        # (source, year, date), so this can only be corruption or a hand edit —
        # and downstream `disagreement` would pick whichever sorted first.
        if name in seen:
            fatal.append({"check": "duplicate_source_day", "source": name,
                          "note": "two entries for one source on one day; every "
                                  "reader takes whichever sorts first"})
        seen[name] = s

        rows, sd = s.get("rows") or {}, s.get("sd") or {}
        # THE DECLARED COUNT IS WHAT EVERY INSTRUMENT READS, and `coverage`
        # judges a source's depth entirely on `row_count`. A count that disagrees
        # with its own rows describes a board nobody captured.
        if s.get("row_count") != len(rows):
            fatal.append({"check": "row_count_mismatch", "source": name,
                          "declared": s.get("row_count"), "actual": len(rows)})
        if s.get("sd_count") != len(sd):
            fatal.append({"check": "sd_count_mismatch", "source": name,
                          "declared": s.get("sd_count"), "actual": len(sd)})
        # AN sd FOR A PLAYER WITH NO PRICE. The dispersion and the mean come from
        # one response; a spread without its own mean means the two halves were
        # keyed differently, and any consumer joining them gets a width around
        # somebody else's centre.
        orphans = [k for k in sd if k not in rows]
        if orphans:
            fatal.append({"check": "sd_orphan", "source": name, "n": len(orphans),
                          "sample": sorted(orphans)[:5]})
        bad = [k for k, v in rows.items() if not (v > 0)]
        if bad:
            fatal.append({"check": "adp_not_a_pick_number", "source": name,
                          "n": len(bad), "sample": sorted(bad)[:5]})
        neg = [k for k, v in sd.items() if v < 0]
        if neg:
            fatal.append({"check": "negative_sd", "source": name, "n": len(neg)})
        missing = [f for f in SOURCE_FIELDS if f not in s]
        if missing:
            fatal.append({"check": "field_missing", "source": name,
                          "fields": missing,
                          "note": "a field that stops being written must show up "
                                  "as EMPTY, not cease to exist"})
        # A PRICE WITHOUT ITS FORMAT IS NOT EVIDENCE — this file's own opening
        # claim, unenforced until now.
        if not (s.get("params") or {}):
            observed.append({"check": "no_params", "source": name,
                             "note": "priced with no record of the format that "
                                     "produced it; a year from now this row is "
                                     "a number with no meaning"})

    # ── AGAINST YESTERDAY ───────────────────────────────────────────────
    prior_days = sorted({str(s.get("observed_at")) for s in ser
                         if str(s.get("observed_at")) < str(observed_at)})
    if not prior_days:
        cross = {"status": "first_day",
                 "note": "no earlier day in this archive, so nothing cross-day "
                         "has been checked — that is the archive's age, not a "
                         "clean bill of health"}
    else:
        prev = {str(s.get("source")): s for s in ser
                if str(s.get("observed_at")) == prior_days[-1]}
        cross = {"status": "measured", "against": prior_days[-1]}
        for name, y in prev.items():
            t = seen.get(name)
            if t is None:
                # A SOURCE THAT SILENTLY STOPS ARRIVING. The others keep landing,
                # the file keeps growing, and the comparison quietly becomes a
                # comparison of fewer things.
                observed.append({"check": "source_vanished", "source": name,
                                 "was": y.get("row_count"),
                                 "note": "captured yesterday, absent today"})
                continue
            was, now = y.get("row_count") or 0, t.get("row_count") or 0
            if was and now < was * (1.0 - ROW_COUNT_COLLAPSE):
                observed.append({"check": "row_count_collapsed", "source": name,
                                 "was": was, "now": now,
                                 "lost_share": round(1.0 - now / float(was), 3),
                                 "note": "a partial fetch returns 200 and writes "
                                         "a truncated board that becomes the "
                                         "day's price"})
            drifted = {k: [(y.get("params") or {}).get(k), (t.get("params") or {}).get(k)]
                       for k in FORMAT_KEYS
                       if (y.get("params") or {}).get(k) != (t.get("params") or {}).get(k)}
            if drifted:
                observed.append({"check": "format_drifted", "source": name,
                                 "changed": drifted,
                                 "note": "the two days are not the same "
                                         "measurement; any cross-day comparison "
                                         "spans a format change"})
    return {"status": "measured", "observed_at": str(observed_at),
            "sources": sorted(seen), "cross_day": cross,
            "fatal": fatal, "observed": observed,
            "note": ("%d FATAL, %d observed" % (len(fatal), len(observed))
                     if fatal else
                     ("today's write is internally consistent; %d observed"
                      % len(observed)))}


# ── DOES A PLAYER'S PUBLISHED SPREAD HOLD STILL ACROSS DAYS? ────────────────
#
# A closed the dispersion fit on a stability falsifier: refitting the sd rule on
# half-samples of PLAYERS moved the floor 119% against a 25% bar. Their revisit
# condition was "when FFC's published-sd population makes the 1-25 band survive a
# half-sample refit" — and that band is bounded by construction. It IS the top 25
# picks of FFC's board: 25 rows today, about 25 on draft day. More days add DAYS,
# NOT PLAYERS, so the trigger as written can never fire.
#
# WHAT MORE DAYS DO BUY is the axis this archive was built for: the same players
# re-measured every morning. That supports the falsifier the passage of time CAN
# answer, and it discriminates between two very different worlds:
#
#   steady across days, unstable across players -> the instability is
#       CROSS-SECTIONAL. Those 25 players genuinely disagree with each other and
#       no amount of patience fixes it; the floor is unidentifiable, full stop.
#   unstable across days too -> the FEED is noisy at the top of its own board,
#       which is a second and independent reason not to fit a constant to it.

#: A player's own published sd moving more than this share of its median, across
#: days, is the feed moving rather than the market.
#:
#: ⚠ DECLARED, AND IT IS A PLACEHOLDER UNTIL THERE ARE DAYS TO DERIVE IT FROM —
#: exactly like `COLLAPSE_KEEP_FRACTION` in this file and for the same reason.
#: It is set to A's own bar (25%) so the two stability questions are judged on one
#: number rather than two that drift, and `sd_stability` reports the OBSERVED
#: spread every day so it can be re-derived the moment it is derivable.
SD_STABILITY_TOLERANCE = 0.25


def sd_stability(series: list, source: str, year, bands=((0, 25), (25, 50),
                                                         (50, 100), (100, 10 ** 6))):
    """Per-player published-sd movement across days, by the SOURCE'S OWN band.

    ⚠ BANDED ON THE SOURCE'S OWN PICK SCALE, never on our board's. The bands
    exist to line up with A's per-band objective, and A's bands are FFC's — a
    player FFC prices at 20 and our board prices at 40 belongs to FFC's 1-25 band
    for this question, because the constant being judged is fitted against FFC's
    own dispersion. Using the board's scale here would answer a different
    question while looking like this one.

    ONE DAY IS `first_day`, NOT `stable`. A spread that has been observed once has
    not been observed to hold still (rule 13f).
    """
    days = sorted({str(s.get("observed_at")) for s in (series or [])
                   if str(s.get("source")) == str(source)
                   and str(s.get("year")) == str(year) and s.get("observed_at")})
    base = {"status": "first_day", "source": str(source), "days": len(days),
            "tolerance": SD_STABILITY_TOLERANCE, "players": 0, "by_band": {},
            "moved": 0, "note": None}
    if len(days) < 2:
        return dict(base, note="only %d day of %s in the archive — a spread "
                               "observed once has not been observed to HOLD, and "
                               "this is the archive's age rather than a verdict "
                               "on the feed" % (len(days), source))
    per, adp0 = {}, {}
    for d in days:
        snap = next((s for s in series
                     if str(s.get("source")) == str(source)
                     and str(s.get("year")) == str(year)
                     and str(s.get("observed_at")) == d), None)
        if snap is None:
            continue
        rows, sd = snap.get("rows") or {}, snap.get("sd") or {}
        for pid, v in sd.items():
            if v is None or pid not in rows:
                continue
            per.setdefault(pid, []).append(float(v))
            adp0.setdefault(pid, float(rows[pid]))     # first day's own adp
    from statistics import median
    out, moved, n = {}, 0, 0
    for pid, vals in per.items():
        if len(vals) < 2:
            continue
        n += 1
        med = median(vals)
        # RANGE OVER MEDIAN, not sd-of-sd: with two or three days a standard
        # deviation is barely defined, and the question is how far the value
        # travelled rather than how it was distributed.
        spread = (max(vals) - min(vals)) / med if med else None
        if spread is not None and spread > SD_STABILITY_TOLERANCE:
            moved += 1
        a = adp0.get(pid)
        for lo, hi in bands:
            if a is not None and lo < a <= hi:
                key = "%d-%d" % (lo, hi) if hi < 10 ** 6 else "%d+" % lo
                b = out.setdefault(key, {"n": 0, "moved": 0, "spreads": []})
                b["n"] += 1
                if spread is not None:
                    b["spreads"].append(spread)
                    if spread > SD_STABILITY_TOLERANCE:
                        b["moved"] += 1
                break
    for k, b in out.items():
        b["median_spread"] = round(median(b["spreads"]), 4) if b["spreads"] else None
        b["worst_spread"] = round(max(b["spreads"]), 4) if b["spreads"] else None
        del b["spreads"]
    return dict(base, status="measured", players=n, moved=moved,
                by_band={k: out[k] for k in sorted(out, key=lambda x: float(x.split("-")[0].rstrip("+")))},
                note="%d of %d players carrying a published sd on 2+ days moved "
                     "their own sd by more than %.0f%% of its median across %d "
                     "day(s). Steady across days with A's cross-player refit still "
                     "unstable means the instability is CROSS-SECTIONAL and no "
                     "amount of waiting fixes it; unsteady here means the feed "
                     "itself is noisy at the top of its own board."
                     % (moved, n, 100.0 * SD_STABILITY_TOLERANCE, len(days)))
