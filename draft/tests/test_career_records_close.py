"""THE SEEDED CAREER RECORDS MUST DESCRIBE A POSSIBLE SET OF SEASONS.

FOUND BY B (2026-08-11): 425 wins against 424 losses and 2 ties, i.e. 851 slots,
when every game contributes exactly two. That is not a discrepancy to argue
about — it is arithmetically impossible, so some row was wrong with certainty.

THIS FAILS ON THE SUM, NOT ON THE CELL. Pinning Cory's row to 48 would pass
forever and catch nothing: the next transcription error in a different row would
be just as impossible and just as invisible. The invariants below are properties
of any real league, so any row that breaks one is caught.

WHY THE ROW WAS IDENTIFIABLE WITHOUT A SOURCE. Sleeper was asked first and its
three seasons close exactly (225-225-0, 45 games each) but stop at 2023; the
master sheet archive holds 2016-2022 standings and money but no W-L records. So
no source we hold states the pre-2023 record. Counting games per owner settles it
anyway: nine owners at 85 and one at 86 identifies the row, and only removing a
win both closes the league and equalises the counts.

WHAT IS ASSUMED, STATED RATHER THAN BURIED: that every owner played the same
number of regular-season games across the seeded history. If someone genuinely
joined a season earlier, an unequal count would be legitimate — but the totals
would still have to close, and they did not, so a defect exists either way.

Run: python3 -m pytest draft/tests/test_career_records_close.py
"""
import json
import os
import re
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SEED = os.path.join(ROOT, "src", "seed-data.js")


def owners():
    """Read OWNERS out of the JS module by executing it, not by regex.

    A regex over the source would re-implement JS object parsing and would drift
    the moment the file is reformatted — and it could not tell a commented-out
    row from a live one, which is exactly the rule 11e weakness this project
    keeps hitting.
    """
    out = subprocess.run(
        ["node", "-e",
         "const m=require(%r);"
         "const o=m.OWNERS||m.owners||(m.default&&m.default.OWNERS);"
         "process.stdout.write(JSON.stringify(o||null));" % SEED],
        capture_output=True, text=True, timeout=60)
    data = json.loads(out.stdout) if out.stdout.strip() else None
    if data:
        return data
    # The module may not export OWNERS. Fall back to the literal, and SAY SO in
    # the failure message rather than silently checking a different thing.
    src = open(SEED, encoding="utf-8").read()
    rows = re.findall(
        r"name:\s*'([^']+)'.*?wins:\s*(\d+),\s*losses:\s*(\d+),\s*ties:\s*(\d+)", src)
    assert rows, "could not read OWNERS from seed-data.js by export or by literal"
    return [{"name": n, "wins": int(w), "losses": int(l), "ties": int(t)}
            for n, w, l, t in rows]


OWNERS = owners()


def test_there_are_ten_owners():
    assert len(OWNERS) == 10, [o["name"] for o in OWNERS]


def test_wins_equal_losses_across_the_league():
    """Every game gives exactly one win and one loss, or two ties."""
    w = sum(o["wins"] for o in OWNERS)
    lo = sum(o["losses"] for o in OWNERS)
    assert w == lo, (
        "career records do not close: %d wins against %d losses. Every game "
        "contributes one of each, so the difference is a transcription error, "
        "not a disagreement." % (w, lo))


def test_ties_are_even():
    """A tie is one game and marks TWO owners, so the league total must be even."""
    t = sum(o["ties"] for o in OWNERS)
    assert t % 2 == 0, "odd tie count (%d) — a tie always marks two rows" % t


def test_total_slots_are_even():
    """The same invariant from the other side, which is how B found it."""
    slots = sum(o["wins"] + o["losses"] + o["ties"] for o in OWNERS)
    assert slots % 2 == 0, (
        "%d record slots is odd; every game contributes two" % slots)


def test_every_owner_played_the_same_number_of_games():
    """The check that IDENTIFIED the row, kept as a standing guard.

    Nine owners at 85 and one at 86 is what localised the defect to Cory's row
    without any source able to state the pre-2023 record. Stated as an
    assumption in this file's docstring: if an owner ever genuinely joins late,
    this is the test to revisit — deliberately, with a reason.
    """
    counts = {o["name"]: o["wins"] + o["losses"] + o["ties"] for o in OWNERS}
    distinct = sorted(set(counts.values()))
    assert len(distinct) == 1, (
        "owners have different game counts %s — the odd ones out are %s"
        % (distinct, {n: c for n, c in counts.items() if c != distinct[0]}))
