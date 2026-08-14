# TERRITORY: C
"""IS THE PER-SOURCE WRITE TRUSTWORTHY — the guards, written after the mutations.

`external_source_prices.json` landed its first write on 2026-08-14 with NOTHING
checking it. The MFL archive one file over has `integrity` at write time and
`snapshot_audit` daily; this one had a writer and no judge, which is rule 14 in
its plainest form.

Every test below states the mutation that motivates it, and each mutation was
applied to the module and observed to fail these assertions before the assertion
was written.

Run: python3 -m pytest draft/tests/test_source_audit.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_source_capture as S  # noqa: E402


_NO = object()


def _day(source="ffc", observed_at="2026-08-14", rows=None, sd=None, params=_NO):
    rows = {"1": 5.0, "2": 15.0, "3": 40.0} if rows is None else rows
    if params is _NO:
        params = {"format": "half-ppr", "teams": 10, "year": 2026}
    return S.append_day([], source, "2026", observed_at, rows, sd=sd,
                        params=params)[0]


def _checks(out, bucket):
    return [c["check"] for c in out[bucket]]


# ── FATAL: THE DAY IS CORRUPT WHATEVER ANYONE DOES WITH IT ──────────────────

def test_A_DECLARED_COUNT_THAT_DISAGREES_WITH_ITS_OWN_ROWS_IS_FATAL():
    """`coverage` judges a source's whole depth on `row_count` and never opens
    `rows`. A count that disagrees with its own rows describes a board nobody
    captured, and every reader downstream believes the count.

    MUTATION: compare `row_count` against itself — a hand-edited or truncated
    entry passes, and the source's depth history is a record of a fiction."""
    d = _day()
    d["row_count"] = 99
    out = S.source_audit([d], "2026", "2026-08-14")
    assert "row_count_mismatch" in _checks(out, "fatal")
    assert out["note"].startswith("1 FATAL")


def test_AN_sd_COUNT_THAT_DISAGREES_IS_FATAL_TOO_not_merely_noted():
    """Same class, on the field that decides whether a survival curve is shaped by
    a measurement or by a clamp. `published_sd` counts are read straight off it.

    MUTATION: check only `row_count` — the sd half goes unguarded, which is
    exactly the half that was missed in `merge_primary_over_ffc` and cost the
    board its published dispersion on 211 of 215 players."""
    d = _day(sd={"1": 2.0})
    d["sd_count"] = 7
    assert "sd_count_mismatch" in _checks(S.source_audit([d], "2026", "2026-08-14"), "fatal")


def test_AN_sd_FOR_A_PLAYER_WITH_NO_PRICE_IS_FATAL():
    """The dispersion and the mean come out of ONE response. A spread whose player
    has no mean here means the two halves were keyed differently, and any consumer
    joining them gets a width around somebody else's centre — which is the exact
    defect measured on the shipped board this afternoon, one layer up.

    MUTATION: drop the orphan check — the mismatch is invisible until somebody
    joins the two dicts and gets a quietly wrong answer for the players that
    happen to overlap."""
    d = _day(sd={"1": 2.0, "999": 9.0})
    out = S.source_audit([d], "2026", "2026-08-14")
    assert "sd_orphan" in _checks(out, "fatal")
    assert [c for c in out["fatal"] if c["check"] == "sd_orphan"][0]["n"] == 1


def test_A_PICK_NUMBER_OF_ZERO_OR_BELOW_IS_FATAL_not_a_very_early_pick():
    """There is no pick 0 and no pick -3. A zero would sort first in every
    ordering built from this archive and read as the most certain pick on the
    board, which is how a parse failure becomes a consensus number one.

    MUTATION: accept anything not None — a source that starts serving 0 for
    unpriced players silently puts them at the top of every comparison."""
    d = _day(rows={"1": 5.0, "2": 0.0, "3": -3.0})
    out = S.source_audit([d], "2026", "2026-08-14")
    bad = [c for c in out["fatal"] if c["check"] == "adp_not_a_pick_number"]
    assert bad and bad[0]["n"] == 2, out["fatal"]


def test_TWO_ENTRIES_FOR_ONE_SOURCE_ON_ONE_DAY_IS_FATAL():
    """`append_day` dedupes by (source, year, date), so this can only be
    corruption or a hand edit. `disagreement` takes whichever sorts first and says
    nothing about the other.

    MUTATION: key the scan by source alone and overwrite — the second entry wins
    silently and the day reports as one clean board."""
    a, b = _day(), _day(rows={"1": 99.0})
    out = S.source_audit([a, b], "2026", "2026-08-14")
    assert "duplicate_source_day" in _checks(out, "fatal")


def test_A_FIELD_THAT_STOPS_BEING_WRITTEN_IS_FATAL_rather_than_absent():
    """`SOURCE_FIELDS` exists so that a field which stops being written shows up as
    EMPTY instead of ceasing to exist. Nothing enforced it until now, so the
    declaration was a comment.

    MUTATION: derive the expected fields from the row itself — every possible row
    then has exactly the fields it has, and the check can never fail (rule 10d,
    an expectation taken from the thing under test)."""
    d = _day()
    del d["note"]
    out = S.source_audit([d], "2026", "2026-08-14")
    got = [c for c in out["fatal"] if c["check"] == "field_missing"]
    assert got and got[0]["fields"] == ["note"], out["fatal"]


# ── OBSERVED: THE FETCH OR THE PROVIDER BEHAVING DIFFERENTLY ────────────────

def test_A_SOURCE_THAT_VANISHES_IS_OBSERVED_not_silently_dropped():
    """The others keep arriving and the file keeps growing, so the archive looks
    healthy while the comparison quietly becomes a comparison of fewer things.

    MUTATION: iterate over TODAY's sources instead of yesterday's — a source that
    disappears is simply not looked for, and only a source that APPEARS is ever
    noticed."""
    y = _day(source="fantasypros", observed_at="2026-08-13")
    y2 = _day(source="ffc", observed_at="2026-08-13")
    t = _day(source="ffc", observed_at="2026-08-14")
    out = S.source_audit([y, y2, t], "2026", "2026-08-14")
    got = [c for c in out["observed"] if c["check"] == "source_vanished"]
    assert got and got[0]["source"] == "fantasypros", out["observed"]
    assert out["fatal"] == []


def test_A_BOARD_THAT_LOSES_A_QUARTER_OVERNIGHT_IS_OBSERVED():
    """A partial fetch returns 200 and writes a truncated board that becomes the
    day's price. In mid-August boards GROW as more players get priced, so a
    quarter vanishing between two mornings is the fetch, not the market.

    MUTATION: compare against the SMALLEST day ever seen instead of yesterday —
    one bad morning permanently lowers the bar and no later collapse ever
    clears it."""
    y = _day(observed_at="2026-08-13",
             rows={str(i): float(i + 1) for i in range(100)})
    t = _day(observed_at="2026-08-14",
             rows={str(i): float(i + 1) for i in range(60)})
    out = S.source_audit([y, t], "2026", "2026-08-14")
    got = [c for c in out["observed"] if c["check"] == "row_count_collapsed"]
    assert got and got[0]["was"] == 100 and got[0]["now"] == 60, out["observed"]
    assert got[0]["lost_share"] == 0.4


def test_A_BOARD_THAT_GROWS_IS_NOT_A_COLLAPSE_so_the_alarm_stays_believable():
    """The other arm, so the check above is a discrimination rather than one that
    fires on any change. Boards grow all August; an alarm on growth is one nobody
    reads by the 22nd.

    MUTATION: threshold on `abs(now - was)` — every ordinary morning of new
    prices reports a truncated fetch."""
    y = _day(observed_at="2026-08-13",
             rows={str(i): float(i + 1) for i in range(100)})
    t = _day(observed_at="2026-08-14",
             rows={str(i): float(i + 1) for i in range(180)})
    out = S.source_audit([y, t], "2026", "2026-08-14")
    assert "row_count_collapsed" not in _checks(out, "observed")


def test_A_FORMAT_THAT_CHANGES_BETWEEN_DAYS_IS_OBSERVED():
    """A price without its format is not evidence — this archive's opening claim,
    and unenforced until now. Two days captured at different settings are not the
    same measurement, and every cross-day comparison would silently span the
    change: the exact defect the whole file exists to prevent, arriving through
    the back door.

    MUTATION: compare the whole `params` dict — `total_drafts` and `parsed` move
    every single day, so the check fires every morning and is muted by its
    second."""
    y = _day(observed_at="2026-08-13",
             params={"format": "half-ppr", "teams": 10, "year": 2026,
                     "total_drafts": 2000, "parsed": 210})
    t = _day(observed_at="2026-08-14",
             params={"format": "ppr", "teams": 10, "year": 2026,
                     "total_drafts": 2391, "parsed": 223})
    out = S.source_audit([y, t], "2026", "2026-08-14")
    got = [c for c in out["observed"] if c["check"] == "format_drifted"]
    assert got and got[0]["changed"] == {"format": ["half-ppr", "ppr"]}, out["observed"]


def test_ORDINARY_PARAM_MOVEMENT_IS_NOT_A_FORMAT_CHANGE():
    """The discrimination for the test above. `total_drafts` climbing and `parsed`
    ticking up is what a working capture looks like every day.

    MUTATION: add `total_drafts` to `FORMAT_KEYS` — a healthy accumulating source
    reports a format change every morning."""
    y = _day(observed_at="2026-08-13",
             params={"format": "half-ppr", "teams": 10, "year": 2026,
                     "total_drafts": 2000, "parsed": 210})
    t = _day(observed_at="2026-08-14",
             params={"format": "half-ppr", "teams": 10, "year": 2026,
                     "total_drafts": 2391, "parsed": 223})
    out = S.source_audit([y, t], "2026", "2026-08-14")
    assert out["observed"] == [] and out["fatal"] == []


def test_A_PRICE_WITH_NO_PARAMS_AT_ALL_IS_OBSERVED():
    """A year from now a row with no format is a number with no meaning, which is
    the state `draft/data/adp_series.json` is in and the reason this file exists.

    MUTATION: skip the check when `params` is falsy — the one row that most needs
    flagging is the one that gets past."""
    d = _day(params={})
    out = S.source_audit([d], "2026", "2026-08-14")
    assert "no_params" in _checks(out, "observed")


# ── THE STATES THAT MUST NAME THEMSELVES ────────────────────────────────────

def test_THE_FIRST_DAY_SAYS_FIRST_DAY_not_clean():
    """This archive is one day old, so on its first run every cross-day check can
    only answer "nothing yet" — and a check whose only possible answer is that has
    not looked (rule 13f). Guaranteed to fire on the morning it lands, which is
    the morning it is most likely to be misread.

    MUTATION: report `status: measured` with an empty comparison — the first
    morning certifies the archive against a yesterday that does not exist."""
    out = S.source_audit([_day()], "2026", "2026-08-14")
    assert out["cross_day"]["status"] == "first_day"
    assert "not a clean bill of health" in out["cross_day"]["note"]


def test_A_DAY_NOBODY_WROTE_IS_UNMEASURED_not_a_clean_day():
    """Zero sources on a day is the capture failing. Reported as a pass it reads
    as "no problems found", which is the strongest possible statement resting on
    nothing at all.

    MUTATION: return the measured shape with empty lists — a morning when the job
    never ran comes back with no FATAL and no OBSERVED, indistinguishable from a
    perfect capture."""
    out = S.source_audit([_day(observed_at="2026-08-13")], "2026", "2026-08-14")
    assert out["status"] == "unmeasured"
    assert out["sources"] == []
    assert "capture failing" in out["note"]


def test_THE_LIVE_ARCHIVE_PASSES_ITS_OWN_AUDIT():
    """The positive control. Every test above builds a fixture designed to fail;
    without this one they collectively prove only that the audit can say no. This
    is the archive as actually written this morning.

    MUTATION: any FATAL check that is too strict — it fires on real, correct data,
    which is how an audit gets switched off."""
    import json
    p = HERE.parents[1] / "draft" / "data" / "external_source_prices.json"
    if not p.exists():
        import pytest
        pytest.skip("archive not present in this tree")
    ser = json.loads(p.read_text()).get("series") or []
    days = sorted({str(s.get("observed_at")) for s in ser if s.get("observed_at")})
    if not days:
        import pytest
        pytest.skip("archive holds no days yet")
    out = S.source_audit(ser, "2026", days[-1])
    assert out["status"] == "measured"
    assert out["fatal"] == [], out["fatal"]
