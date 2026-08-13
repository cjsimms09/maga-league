# TERRITORY: C
"""EVERY FIELD ON THE LIVE BOARD HAS A DECLARED PURPOSE, CHECKED ON THE REAL FILE.

`season_stamp.BOARD_FIELD_PURPOSE` exists so that research data cannot price a
recommendation: an experiment's output, or a prior read as a current measurement,
seeping into the war room, the optimizer or the draft model. The rule the map
encodes is that a LIVE surface may act on a live feed, a NAMED prior, a declared
constant or arithmetic over those — and never on `experiment`.

THE MAP HAD NO CONSUMER. It was written, tested against hand-built rows, and
nothing ever ran it over `public/draft_data.json` — the artifact the in-season
tools actually read. A separation that is only asserted about fixtures is not a
separation, it is a document; the field that seeps in is by definition the one
nobody thought to put in the fixture. `unpurposed_fields` was built to refuse
exactly that, and it was never pointed at the board.

It found something the first time it was: the map was built from the `players`
rows, so `kept_players` — a different shape, and the three rows whose keeper cost
decides which picks exist at all — carried four fields nothing classified.

THE DEFAULT IS THE DESIGN. An unmapped field counts as `experiment` and so as a
violation, rather than defaulting to `live_feed`. The dangerous default is the
generous one: a brand-new ingest field trusted as a current measurement on the
day it lands, which is the day nobody has looked at it yet.

WHEN THIS GOES RED, THE FIX IS ONE LINE and it is in this lane. A new board field
means a new entry in BOARD_FIELD_PURPOSE, classified from what WRITES it — read
the builder, do not infer from the name. It is not a reason to widen the map's
default or to skip the row list that failed.

⚠ The artifact is a BUILT file. If it is absent this reports UNCHECKED and skips
rather than passing: "could not look" must never read as "looked and it was
fine", which is the same rule the board-pin checks run under.

Run: python3 -m pytest draft/tests/test_board_purpose.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import season_stamp as S  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"

#: Every key of the artifact that holds player-shaped rows. Named rather than
#: discovered, because a list that stops being checked because it stopped being
#: FOUND is the failure this file is about — a new row list must be added here
#: deliberately, and `test_no_row_list_is_unchecked` fails until it is.
ROW_LISTS = ("players", "kept_players")


def board():
    if not BOARD.exists():
        pytest.skip("UNCHECKED: %s is not present — the board is a built "
                    "artifact and this says nothing about it" % BOARD)
    return json.loads(BOARD.read_text())


def test_no_row_list_is_unchecked():
    """The list nobody added here is the list nobody checks, and it fails silent:
    every other test in this file would still pass while a whole collection of
    rows goes unclassified. That is how `kept_players` was missed in the map
    itself — the map was built from one shape and a second shape existed.

    MUTATION: discover the lists dynamically instead of naming them, and a new
    row list is checked or not depending on whether the discovery heuristic
    happens to recognise it."""
    d = board()
    found = sorted(k for k, v in d.items()
                   if isinstance(v, list) and v and isinstance(v[0], dict)
                   and "player_id" in v[0])
    assert found == sorted(ROW_LISTS), (
        "the artifact holds player-row lists this file does not check: %s. Add "
        "them to ROW_LISTS — a list that is not named here is not covered by any "
        "assertion below." % sorted(set(found) - set(ROW_LISTS)))


def test_the_detector_FIRES_on_a_field_nobody_declared():
    """PROVED ON A REAL ROW BEFORE THE REAL ROWS ARE ASSERTED CLEAN. A detector
    that cannot find anything satisfies "nothing found" perfectly, and this exact
    vacuity has already been caught six times in this lane. The planted field is
    added to an ACTUAL board row, so the check is of the detector against the
    real shape rather than against a fixture that flatters it.

    MUTATION: return `[]` from `unpurposed_fields` — every assertion below still
    passes and the map stops meaning anything."""
    d = board()
    row = dict(d["players"][0], a_field_that_was_never_declared=1.23)
    assert S.unpurposed_fields(row) == ["a_field_that_was_never_declared"]
    assert S.purpose_violations(row) == ["a_field_that_was_never_declared"], (
        "an unmapped field must count as a VIOLATION, not merely as unmapped — "
        "defaulting a new field to live_feed trusts it on the day it lands")


@pytest.mark.parametrize("key", ROW_LISTS)
def test_EVERY_FIELD_ON_THE_LIVE_BOARD_HAS_A_DECLARED_PURPOSE(key):
    """The assertion this file exists for, over every row rather than row 0 —
    fields are not uniform across rows, and a field present on 3 rows out of 1759
    is exactly the one that gets missed."""
    d = board()
    rows = d.get(key) or []
    assert rows, "no %s rows in the artifact — nothing was checked" % key

    counts = {}
    for r in rows:
        for f in S.unpurposed_fields(r):
            counts[f] = counts.get(f, 0) + 1
    assert not counts, (
        "%s carries fields with no declared purpose: %s. Classify each in "
        "season_stamp.BOARD_FIELD_PURPOSE from what WRITES it — read the builder, "
        "do not infer from the name — or the live surfaces are acting on values "
        "nothing has vouched for." % (key, counts))


@pytest.mark.parametrize("key", ROW_LISTS)
def test_NO_EXPERIMENT_OUTPUT_REACHES_A_LIVE_ROW(key):
    """The rule stated directly, so it holds even if the default ever changes.
    An experiment is selected, pre-registered and often adversarial by design;
    its output answers "does this work", never "what is this player worth"."""
    d = board()
    bad = {}
    for r in (d.get(key) or []):
        for f in S.purpose_violations(r):
            bad[f] = bad.get(f, 0) + 1
    assert not bad, (
        "fields on %s that a live surface may not act on: %s" % (key, bad))


def test_THE_PRIORS_ARE_PRESENT_AND_NAMED_rather_than_absent():
    """The other half, and the one a violation count cannot show. Priors on the
    board are LEGITIMATE — it is how anything gets priced — and the failure mode
    is not that they are there but that a reader cannot tell. So this asserts
    they are present AND classified, because a board that reported zero priors
    would mean the map had stopped recognising them, which reads as clean.

    MUTATION: drop the historical_prior entries from the map — every violation
    check above still passes, since unmapped-as-experiment would then fire... and
    that is the point: this is what distinguishes 'named' from 'gone'."""
    d = board()
    rep = S.purpose_report(d["players"][0])
    assert rep["priors_present"], (
        "no field on the board is classified as a historical prior. Either the "
        "priors stopped being written or the map stopped recognising them; both "
        "read as clean and only one is.")
    # NAMED, NOT COUNTED. `len(priors) >= 4` passed while two of the six were
    # reclassified as live_feed, which is the precise failure this asserts
    # against — a threshold with slack in it cannot see the first field to slip.
    # These six are usage and durability estimated off 2024-25; every one of them
    # reads as a current measurement when printed beside `injury_status`.
    priors = set(rep["by_purpose"].get(S.HISTORICAL_PRIOR) or [])
    expected = {"opportunity_adj", "opportunity_share", "opportunity_z",
                "target_share", "wopr", "games_expected"}
    assert expected <= priors, (
        "these are estimated from prior seasons and are no longer classified as "
        "priors: %s — a prior that stops being named is a prior a reader takes "
        "for this season's number" % sorted(expected - priors))
    assert rep["by_purpose"].get(S.LIVE_FEED), rep["by_purpose"]
