# TERRITORY: C
"""THE FORMAT CENSUS AS A SERIES — capture, not modelling.

CORY'S CAPTURE TEST, 2026-08-12: is it free or cheap, already accessible, and
UNRECOVERABLE if we do not save it? The census passes on all three, and until now
it failed on the fourth thing nobody asked: is it saved. It was not.

Every ingest run computes a census over the readable pool — teams, reception
points, superflex, draft type, keeper type, passing-TD prevalence — writes it to
`ingest-report.json`, uploads it as a CI artifact with a 90-day retention, and
DISCARDS it. The run commits nothing.

WHY IT IS UNRECOVERABLE, which is the clause that decides it. MFL's public pool is
a MOVING POPULATION: leagues change scoring between seasons, change size, are
deleted, and are created. A census of the 2026 pool taken today cannot be
reconstructed next year from any source. This program spent a whole session
establishing that historical league states are not retrievable — that is what
Route 1 closed on.

AND A FAILED HYPOTHESIS IS NOT A FAILED DATA SOURCE. F7 answered negative: the
200-league target is unreachable, so no pooling and no shadow-field expansion. That
is a MODELLING verdict. It says nothing about whether the composition of the public
pool is worth a row a year — and the passing-TD prevalence, which Cory named
explicitly, lives inside this same census.

WHAT THIS IS NOT: not a scan, not an analysis, not a dashboard. It appends one row
and returns. Rule 9.
"""
import json
from pathlib import Path

import field_population as FP

SERIES = "draft/data/format_census_series.json"
SERIES_VERSION = "format-census-series/v1"

#: What a census row is SUPPOSED to carry. A CONSTANT, and the reason is worth stating
#: precisely, because the first version of this comment overclaimed.
#:
#: The first cut passed `fields=list(row)` — derived from the very dict being written.
#: A mutation test showed it caught nothing: if the writer stops emitting `keeper_type`,
#: `list(row)` stops containing it too, and the field vanishes from the population
#: record exactly as silently as it vanishes from the data. The comment claimed a
#: protection the code did not provide, which is the defect this module exists to catch,
#: committed inside the fix for it.
#:
#: AND THE HONEST LIMIT, because the replacement mutation ALSO survives. `append()`
#: always writes every key, so the union of the rows always contains every field and
#: the declared list is, today, redundant with it. Its teeth are in
#: `test_the_declared_field_list_cannot_drift_from_the_row`: edit the row literal and
#: that test fails, forcing a deliberate update here rather than a silent one there.
#: The constant is the schema; the drift test is the enforcement. Neither alone is the
#: mechanism, and saying "declared, so a dropped field is caught" would be the same
#: overclaim a second time.
CENSUS_FIELDS = [
    "observed_at", "season", "examined", "readable_leagues", "matched", "teams",
    "reception_points", "pass_td_points", "superflex", "draft_type", "keeper_type",
    "rejected_by_reason", "crosswalk_pooled_rate",
]


def append(report: dict, path: str = SERIES, observed_at: str = None) -> dict:
    """Append this run's census to the series, deduped by (season, observed_at).

    DEDUPED RATHER THAN OVERWRITTEN: two runs on one day against the same season
    describe the same pool, and keeping both would let a re-run silently double the
    weight of whichever day someone happened to re-run.
    """
    p = Path(path)
    doc = {"_note": ("One row per ingest run. CAPTURE, not modelling: F7's negative "
                     "answer is a verdict about POOLING, not about whether the "
                     "composition of MFL's public pool is worth a row a year. The pool "
                     "is a moving population and no row here is reconstructable later."),
           "version": SERIES_VERSION, "series": []}
    if p.exists():
        try:
            doc = json.loads(p.read_text()) or doc
        except ValueError:
            # UNREADABLE IS NOT EMPTY. Overwriting a corrupt file with a fresh one
            # would silently destroy every prior row, which is the one failure this
            # archive cannot survive.
            raise
    doc.setdefault("series", [])
    census = (report or {}).get("format_census") or {}
    row = {
        "observed_at": observed_at or (report or {}).get("observed_at"),
        "season": (report or {}).get("season"),
        "examined": (report or {}).get("examined"),
        "readable_leagues": census.get("readable_leagues"),
        "matched": (report or {}).get("matched"),
        "teams": census.get("teams"),
        "reception_points": census.get("reception_points"),
        "pass_td_points": census.get("pass_td_points"),
        "superflex": census.get("superflex"),
        "draft_type": census.get("draft_type"),
        "keeper_type": census.get("keeper_type"),
        "rejected_by_reason": (report or {}).get("rejected_by_reason"),
        "crosswalk_pooled_rate": ((report or {}).get("crosswalk") or {}).get("pooled_rate"),
    }
    key = (str(row["season"]), str(row["observed_at"]))
    doc["series"] = [r for r in doc["series"]
                     if (str(r.get("season")), str(r.get("observed_at"))) != key]
    doc["series"].append(row)
    doc["series"].sort(key=lambda r: (str(r.get("season")), str(r.get("observed_at"))))
    # POPULATION TRAVELS WITH THE ARCHIVE (Cory, 2026-08-12). One line at write time.
    # If a future ingest run stops emitting `pass_td_points` or `keeper_type`, the field
    # does not silently become absent from the record — it drops off 100% in a number
    # sitting beside the rows. `keeper_type` was missing from this row for a week and
    # nothing said so, which is the same hole in this lane's own archive.
    doc["population"] = FP.of_records(doc["series"], fields=CENSUS_FIELDS)
    return doc
