# TERRITORY: C
"""FIELD POPULATION, RECORDED BESIDE ANY ARTIFACT WE COMMIT AS A DURABLE RECORD.

CORY'S RULING, 2026-08-12, and it is the fix for the INSTANCE rather than the class:

    "The positive control catches a bad query; it wouldn't have caught this,
    because the query was fine and the file was wrong. WHEN AN ARTIFACT IS
    COMMITTED AS A DURABLE RECORD, RECORD ITS FIELD POPULATION ALONGSIDE IT.
    projection_adp at 0% and draft_time at 0% sitting in the manifest would have
    made anyone reading it ask why before concluding the source publishes nothing."

WHAT WENT WRONG WITHOUT IT. We archived Underdog's BBM round-4 dump, whose schema
carries `projection_adp` and `draft_time` like every other round, and whose rows carry
neither: 7,938 empty cells under a column that exists. The manifest recorded the column
LIST. A reader — me — concluded from it that Underdog publishes no dated ADP, and Route
1 then spent a week hunting the web archive for a board that was sitting in round 1 of
the same tournament, free and reachable.

**The query was fine. The file was wrong. No control fires on that.** A rate does.

THE THREE-WAY PARTITION IS THE WHOLE POINT, because two different failures hide under
the word "missing":

    present   the key is there and carries a value
    null      the key is there and the value is empty  <- round 4's projection_adp
    missing   the key is not there at all              <- our subset's draft_time

Collapsing those two is the null-as-absence defect in its purest form, and this program
has now hit that defect ten times. A column of empty cells is a claim by the producer
that it HAS this field. A column that is not there is a claim that it does not. They
must never read the same.

EVERY FIELD IS REPORTED, INCLUDING THE ZEROES — especially the zeroes. A summary that
lists only the populated fields would reproduce the exact hole it exists to close, since
the fields that bite are the ones nobody thought to look for.

AND ZERO ROWS REPORTS UNCOUNTED, NEVER 100%. A denominator of zero cannot produce a
rate, and a check that can only say "nothing yet" has not looked (rule 13f). Vacuous
green is the failure mode this whole program keeps finding.

NOT A SCAN, NOT AN ANALYSIS, NOT A DASHBOARD. One call at write time, one dict beside
the artifact. Rule 9.
"""
import csv
import gzip
import io

#: Values that mean THE PRODUCER SENT NOTHING. `"NA"` is here because that is
#: literally what Underdog writes in an empty numeric cell — treating it as a value
#: is how `projection_adp` read as 100% populated to anything counting non-empties.
ABSENT = (None, "", "NA")

POPULATION_VERSION = "field-population/v1"


def _is_absent(v):
    """Absent covers empty and whitespace-only, and is deliberately NOT truthiness.

    `0`, `0.0` and `False` are VALUES. Counting them as absent would report a
    legitimately-zero column as an empty one, which is the same wrong conclusion in
    the opposite direction — and a numeric ADP of 0 is exactly the kind of thing a
    truthiness check would silently drop.
    """
    if v in ABSENT:
        return True
    return isinstance(v, str) and v.strip() == ""


def population(rows, fields=None):
    """Per-field population over `rows`, as a dict fit to sit in a manifest.

    `fields` is the DECLARED field list (a CSV header, say). Pass it whenever the
    producer declares one: it is the only way to see a field that is declared and
    never delivered, which would otherwise be invisible because no row mentions it.
    """
    rows = list(rows or [])
    n = len(rows)

    declared = list(fields) if fields is not None else []
    seen = []
    for r in rows:
        for k in r:
            if k not in declared and k not in seen:
                seen.append(k)
    names = declared + seen

    if n == 0:
        # UNCOUNTED IS NOT ZERO AND IS NOT FINE. Emitting 0.0% here would read as
        # "measured, and empty"; emitting 100% would read as "measured, and full".
        # Both are claims this input cannot support.
        return {"version": POPULATION_VERSION, "rows": 0, "uncounted": True,
                "fields": {name: {"present": 0, "null": 0, "missing": 0, "pct": None}
                           for name in names},
                "empty": [], "partial": [], "absent_fields": list(names),
                "note": "UNCOUNTED — no rows. A rate needs a denominator."}

    out = {}
    for name in names:
        present = null = missing = 0
        for r in rows:
            if name not in r:
                missing += 1
            elif _is_absent(r.get(name)):
                null += 1
            else:
                present += 1
        # The partition is asserted, not assumed: every row lands in exactly one
        # bucket. A counting bug that double-counts would otherwise show up as a
        # plausible rate rather than as an error.
        assert present + null + missing == n, (name, present, null, missing, n)
        out[name] = {"present": present, "null": null, "missing": missing,
                     "pct": round(100.0 * present / n, 1)}

    empty = [k for k, v in out.items() if v["present"] == 0]
    partial = [k for k, v in out.items() if 0 < v["present"] < n]
    return {"version": POPULATION_VERSION, "rows": n, "fields": out,
            "empty": empty, "partial": partial,
            "absent_fields": [k for k in empty if out[k]["missing"] == n],
            "note": ("Field population measured at write time from the bytes actually "
                     "committed. `empty` fields are DECLARED BY THE PRODUCER AND NEVER "
                     "DELIVERED — ask why before concluding the source has no such data.")}


def line(pop):
    """One line, for a log or a commit message. The zeroes are named, not counted.

    Naming them is the difference between a reader asking a question and a reader
    scrolling past: "2 empty" is a statistic, "empty: projection_adp, draft_time" is
    a prompt.
    """
    if not pop or pop.get("uncounted"):
        return "population: UNCOUNTED (0 rows) — a rate needs a denominator"
    n = pop["rows"]
    if pop["empty"]:
        return ("population: %d rows | %d/%d fields full | EMPTY: %s"
                % (n, len(pop["fields"]) - len(pop["empty"]) - len(pop["partial"]),
                   len(pop["fields"]), ", ".join(sorted(pop["empty"]))))
    if pop["partial"]:
        return ("population: %d rows | partial: %s"
                % (n, ", ".join("%s %.1f%%" % (k, pop["fields"][k]["pct"])
                                for k in sorted(pop["partial"]))))
    return "population: %d rows | all %d fields 100%%" % (n, len(pop["fields"]))


def of_csv(path):
    """Population of a CSV or .csv.gz ON DISK — the artifact as committed.

    Reading the FILE rather than the in-memory rows is deliberate. The record has to
    describe the bytes that landed, not the object the writer believed it wrote; a
    serialisation that drops or blanks a field is precisely the failure this catches,
    and it is invisible to anything measuring the producer's own variables.
    """
    op = gzip.open if str(path).endswith(".gz") else open
    with op(path, "rt", newline="") as fh:
        r = csv.DictReader(fh)
        header = list(r.fieldnames or [])
        return population(list(r), fields=header)


def of_records(rows, fields=None):
    """Population of a list of dicts (a JSON series' rows), same contract."""
    return population(rows, fields=fields)
