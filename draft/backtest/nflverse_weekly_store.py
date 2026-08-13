# TERRITORY: C
"""THE WEEKLY REALIZED-POINTS STORE — the outcome half of learning, stamped.

WHY THIS EXISTS. `component-grading-live` and `ledger-to-gate-path` are both unmet
and stay unmet without a realized-points record (A, 2026-08-13). The DATA is not the
gap: `build_bundle.build()` is already handed `weekly_df`, and `grade.py` already
scores it with our table. The gap is that nothing is KEPT. Every grade re-derives
the outcome against whatever the config says on the day the grade runs, so a January
number cannot be checked against the August number it is supposed to be scoring.

THE GUARD THIS MODULE IS FOR, and it is not D3's. An ADP snapshot is a fact about a
DAY. A points total is a fact about a day AND A RULE SET. Our scoring table is
config, not code — `pass_td` could move from 6 to 4 in a one-line edit. Two weeks
scored under two tables and summed produce a season total that never existed under
either table, and NOTHING IN THE ARITHMETIC WOULD COMPLAIN: the sum is a valid float,
the row count is right, the population is 100%, and every check we own goes green.
So the table is fingerprinted, the fingerprint is compared on every append, and a
second table is REFUSED rather than mixed in.

AND THE TABLE ITSELF IS STORED, NOT ONLY ITS HASH. A hash proves two weeks agree; it
cannot say WHAT they agreed on. In January the live table may have moved on, and a
grade needs the rules its numbers were computed under, not a receipt saying they
matched something.

ABSENT IS NOT ZERO, in both directions. A fetch that returned nothing is not a week
in which nobody scored, so an empty week is refused rather than stored as a dated row
of zeros a grader would average in. A player who genuinely scored 0.0 is a
measurement and is kept.

AND A HOLE IS NAMED, NOT COUNTED. `weeks: 3` reads as a season to anything summing
rows; `missing: [2]` reads as a question. Rule 13f — a record that can only say how
much it has has not said what it lacks.

RULE 14: `season_totals()` ships with the writer. A season total is what every grade
actually consumes, and leaving each caller to re-derive it is how two callers end up
summing differently.

NOT A DASHBOARD (rule 9). Append at capture time, read at grade time. No scan.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import field_population as FP

#: Lives in draft/backtest/, NOT draft/data/ — draft/data is A's (config and seed
#: data) and this is a measurement produced in this lane. The first default pointed
#: at draft/data and would have written into another lane the first time it ran;
#: caught before it ever did, same as the projection-error calibration.
STORE = Path(__file__).resolve().parent / "nflverse_weekly_points.json"

#: The fields a stored week is SUPPOSED to carry, declared rather than derived — for
#: the same reason `SNAPSHOT_FIELDS` is declared in D3: a field that stops being
#: written simply stops existing, and a population computed from the rows themselves
#: cannot tell you it is gone.
WEEK_FIELDS = ["season", "week", "points", "scoring", "scoring_fingerprint", "row_count"]

#: The NFL regular season since 2021. Used ONLY to decide whether a captured season
#: is complete; it is never used to fabricate a missing week.
SEASON_WEEKS = 18

FINGERPRINT_VERSION = "scoring-fingerprint/v1"


def _canonical(obj):
    """The scoring table reduced to a form two equal tables always share.

    Numbers are floated and rounded because a table that round-trips through JSON
    comes back as `6.0` where it went in as `6`, and a fingerprint that changed on
    that would refuse every legitimate week — locking the store against itself,
    which is a worse failure than the one this guard exists to catch.
    """
    if isinstance(obj, dict):
        return {str(k): _canonical(v) for k, v in sorted(obj.items(), key=lambda kv: str(kv[0]))}
    if isinstance(obj, (list, tuple)):
        return [_canonical(v) for v in obj]
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, (int, float)):
        return round(float(obj), 6)
    return obj


def scoring_fingerprint(scoring: dict) -> str:
    """A stable digest of a scoring table. Key order and int/float spelling do not
    move it; a changed VALUE does."""
    blob = json.dumps(_canonical(scoring or {}), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def _weeks_of(obj) -> list:
    """Accept the weeks LIST or the store FILE it lives in. Refuse anything else by
    name, symmetric with `external_adp_capture._series_of` and for the same reason:
    iterating the wrapper dict yields its KEYS, and a reader that silently returned
    `[]` there would report every season as ungraded — a statement about the seasons
    that is really a statement about the argument."""
    if obj is None:
        return []
    if isinstance(obj, dict):
        return list(obj.get("weeks") or [])
    if isinstance(obj, list):
        return list(obj)
    raise TypeError(
        "the weekly points store must be the weeks list or the store dict, got %s. "
        "Returning an empty store here would report every season as having no "
        "realized points, which is a claim about the seasons and not about this "
        "argument." % type(obj).__name__)


def _clean_points(points) -> dict:
    """{player_id: float}, with the two things that must not pass silently.

    A NaN sums to NaN and poisons a whole season total while every count stays
    right; a non-numeric value would raise three frames down inside whatever
    consumes the store rather than here, where the offending week is still named.
    """
    out = {}
    for pid, v in (points or {}).items():
        try:
            f = float(v)
        except (TypeError, ValueError):
            raise ValueError(
                "weekly points for %r are %r, which is not a number. A week is a "
                "measurement or it is refused; there is no third state." % (pid, v))
        if f != f:
            raise ValueError(
                "weekly points for %r are NaN. A NaN propagates through every sum "
                "that touches it while the row counts stay correct, so the season "
                "total would be wrong and nothing would say so." % pid)
        out[str(pid)] = f
    return out


def append_week(series: list, season, week, points: dict, scoring: dict) -> list:
    """Add one week of realized points. Returns a NEW list; deduped by (season, week).

    DEDUPED, because a retried job is the normal case and not an exception. Two rows
    for one week leave a season total silently doubled — a number that is wrong by a
    factor nothing in the record contradicts.

    REFUSES A SECOND SCORING TABLE. See the module docstring: this is the defect the
    module exists for, and it is the one that produces a plausible answer rather than
    an error.
    """
    weeks = _weeks_of(series)
    fp = scoring_fingerprint(scoring)

    pts = _clean_points(points)
    if not pts:
        # A fetch that returned nothing is NOT a week in which nobody scored. Storing
        # it puts a dated empty week in an append-only record, and every average over
        # the season quietly gains a zero.
        raise ValueError(
            "week %s of %s carries no rows. An empty result is a failed fetch, not a "
            "week in which every player scored zero — refusing rather than storing a "
            "dated row of nothing." % (week, season))

    for w in weeks:
        other = w.get("scoring_fingerprint")
        if other and other != fp:
            raise ValueError(
                "REFUSED: week %s of %s was scored under scoring fingerprint %s, but "
                "this store already holds week %s of %s under %s. Two weeks scored "
                "under two tables and summed produce a season total that never "
                "existed under either, and the arithmetic cannot detect it. Start a "
                "new store, or re-score the existing weeks under one table."
                % (week, season, fp, w.get("week"), w.get("season"), other))

    row = {"season": int(season), "week": int(week), "points": pts,
           "scoring": dict(scoring or {}), "scoring_fingerprint": fp,
           "row_count": len(pts)}
    kept = [w for w in weeks
            if not (int(w.get("season", -1)) == int(season)
                    and int(w.get("week", -1)) == int(week))]
    kept.append(row)
    kept.sort(key=lambda w: (int(w.get("season", 0)), int(w.get("week", 0))))
    return kept


def coverage(series: list, season) -> dict:
    """What this store HAS and what it LACKS for one season.

    `missing` names the holes INSIDE the captured span, which is the failure that
    reads as success: a grader summing weeks 1 and 3 gets a season total short by a
    week, and every count in the record agrees with itself.

    `complete` additionally requires the span to be the whole regular season. A
    season captured through week 3 is not incomplete because of a defect — it is
    incomplete because it is September — and the distinction belongs to the reader,
    not to this function.
    """
    got = sorted({int(w.get("week")) for w in _weeks_of(series)
                  if str(w.get("season")) == str(season) and w.get("week") is not None})
    if not got:
        # UNCOUNTED, not complete. A season with no weeks has no holes, and a
        # `complete: True` off an empty denominator is the vacuous green this
        # program keeps finding (rule 13f).
        return {"weeks": 0, "first": None, "last": None, "missing": [],
                "complete": False, "uncounted": True,
                "note": "UNCOUNTED — no weeks stored for season %s." % season}
    first, last = got[0], got[-1]
    missing = [w for w in range(first, last + 1) if w not in got]
    return {"weeks": len(got), "first": first, "last": last, "missing": missing,
            "complete": bool(not missing and first == 1 and last >= SEASON_WEEKS),
            "uncounted": False, "season_weeks": SEASON_WEEKS}


def seasons(series: list) -> list:
    return sorted({int(w.get("season")) for w in _weeks_of(series)
                   if w.get("season") is not None})


def season_totals(series: list, season, through_week=None) -> dict:
    """{player_id: season points} for one season, optionally cut at a week.

    THE CUT BELONGS TO THE CONSUMER, AND IT IS NOT OPTIONAL TO THINK ABOUT.
    `league_history` says `last_scored_leg = 17`: weeks 18-22 score nothing for
    anybody in this league. The STORE still holds them, deliberately — what happened
    is what happened, and baking one league's boundary into an archive makes the
    archive league-specific forever. But summing all 22 weeks hands a grader a
    playoff-inflated total with nothing saying so, and the inflation is not uniform:
    it favours players whose teams went deep, which correlates with being good.

    That is the same defect I routed to A about `rest_of_season_points` having a
    `from_week` and no `to_week`, and I wrote it here first. Measured on the
    projection calibration, the cut moves a season ratio by a median 0.077 and up to
    0.217.

    THE COMPANION IS `coverage()`, and a caller that sums without reading it is
    summing whatever weeks happen to be present. The one error that cannot be
    recovered downstream — a mixed scoring table — is refused at `append_week`, so
    everything this sums was scored under one set of rules.
    """
    out = {}
    for w in _weeks_of(series):
        if str(w.get("season")) != str(season):
            continue
        if through_week is not None and int(w.get("week", 0)) > int(through_week):
            continue
        for pid, v in (w.get("points") or {}).items():
            out[pid] = round(out.get(pid, 0.0) + float(v), 4)
    return out


def ingest_season(series: list, weekly_df, season, scoring_cfg: dict,
                  crosswalk: dict) -> list:
    """Fill the store for one season from an nflverse weekly frame.

    DELEGATES TO `grade.weekly_points_table` RATHER THAN SCORING AGAIN. The store has
    to hold the same numbers the replay was graded against; a second mapper here
    would drift from the first the moment nflverse renames a column — and both would
    go on returning valid floats. That exact bug has already been paid for once:
    `nflverse_weekly_to_scoring` carries the scar of `interceptions` becoming
    `passing_interceptions`, which silently zeroed a scored term for a whole season.

    NO `before_season` GUARD, AND THE ASYMMETRY IS DELIBERATE. `nflverse_usage` and
    `nflverse_variance` refuse the drafted season because a PRIOR taken from the
    season under replay is foreknowledge. This is not a prior — it is the OUTCOME,
    and the drafted season is the only season worth storing. A guard copied here for
    symmetry would refuse the module's entire purpose.

    A season with no rows stores NOTHING. Eighteen fabricated empty weeks would make
    `coverage` report a complete season that never happened.
    """
    import grade as GR

    table = GR.weekly_points_table(weekly_df, int(season), scoring_cfg, crosswalk)
    out = _weeks_of(series)
    for wk in sorted(table):
        pts = table[wk]
        if not pts:
            # A week the frame covered but nobody crosswalked into is a JOIN failure,
            # not a scoreless week. `append_week` would refuse it anyway; skipping
            # here keeps the refusal from taking down the whole season's ingest.
            continue
        out = append_week(out, season, wk, pts, scoring_cfg)
    return out


def save(series: list, path=None) -> None:
    """Write the store, WITH its own field population and coverage beside it.

    Cory's standing rule (2026-08-12): an artifact committed as a durable record
    records its field population alongside it. And coverage, because a week that was
    never captured contributes no row to be counted as empty — so a holed season
    scores 100% on every field while being short a week.
    """
    weeks = _weeks_of(series)
    p = Path(path or STORE)
    p.parent.mkdir(parents=True, exist_ok=True)
    fps = sorted({w.get("scoring_fingerprint") for w in weeks if w.get("scoring_fingerprint")})
    p.write_text(json.dumps({
        "_territory": "TERRITORY: C — produced by draft/backtest/nflverse_weekly_store.py",
        "_note": "Realized weekly fantasy points, scored with OUR table at capture "
                 "time and stamped with that table's fingerprint. Append-only, "
                 "deduped by (season, week). `coverage.missing` names holes INSIDE "
                 "the captured span — read it before summing. A week scored under a "
                 "different table is refused at append, so every total here was "
                 "computed under one rule set.",
        "fingerprint_version": FINGERPRINT_VERSION,
        "scoring_fingerprints": fps,
        "weeks": weeks,
        "coverage": {str(s): coverage(weeks, s) for s in seasons(weeks)},
        "population": FP.of_records(weeks, fields=WEEK_FIELDS),
    }, indent=2, sort_keys=False) + "\n")


def load(path=None) -> list:
    p = Path(path or STORE)
    if not p.exists():
        return []
    return _weeks_of(json.loads(p.read_text()))
