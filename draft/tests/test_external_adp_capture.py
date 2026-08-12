"""D3's ARCHIVE — the only recoverable copy of the 2026 curve.

Written break-first: each assertion below exists because the mutation named in
its docstring was applied first and the suite was watched. The mutations matter
more than usual here, because every one of them produces an archive that LOOKS
complete — a date is present, rows are present, coverage reports a number — and
the damage only surfaces months later as a league quietly failing F5.

Run: python3 -m pytest draft/tests/test_external_adp_capture.py -q
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import external_adp_capture as C  # noqa: E402
import external_replay as X  # noqa: E402


def rows(n=5, base=1.0):
    return {str(100 + i): base + i for i in range(n)}


# ── append: dedupe, order, and the caps that must NOT be here ───────────────
def test_a_same_day_rerun_REPLACES_rather_than_doubling():
    """MUTATION: drop the dedupe filter. Two boards for one date, and `board()`
    would pick whichever happened to sort first — a silent coin flip over which
    market a replay sees."""
    s = C.append_snapshot([], 2026, "2026-08-11", rows(3))
    s = C.append_snapshot(s, 2026, "2026-08-11", rows(9))
    assert len(s) == 1 and s[0]["row_count"] == 9


def test_two_SEASONS_on_the_same_date_are_different_snapshots():
    """The dedupe key is (year, date), not date. MUTATION: key on date alone —
    capturing 2025 and 2026 on one day would silently discard one."""
    s = C.append_snapshot([], 2025, "2026-08-11", rows(3))
    s = C.append_snapshot(s, 2026, "2026-08-11", rows(9))
    assert len(s) == 2
    assert {x["year"] for x in s} == {"2025", "2026"}


def test_the_archive_is_NOT_truncated_to_a_top_N():
    """MUTATION: sort and slice to 300, matching the home instrument. A league's
    board is the WHOLE board; the deep rows are exactly where a late-round pick
    gets priced, and they cannot be re-fetched later."""
    s = C.append_snapshot([], 2026, "2026-08-11", rows(700))
    assert s[0]["row_count"] == 700 and len(s[0]["rows"]) == 700


def test_the_archive_has_NO_retention_WINDOW():
    """MUTATION: keep only the most recent 60 dates, matching the home
    instrument. That cap silently deletes the early season, and the early season
    is precisely what a league drafting in August needs."""
    s = []
    for d in range(1, 100):
        s = C.append_snapshot(s, 2026, "2026-%02d-%02d" % (1 + d // 28, 1 + d % 28), rows(2))
    assert len(s) >= 90, "an evidence archive must not expire its own early days"


def test_the_providers_own_composition_travels_with_the_snapshot():
    """`total_drafts` is the figure that showed the year aggregate accumulates.
    MUTATION: drop it — a snapshot that cannot be judged later is an archive of
    numbers with no provenance."""
    s = C.append_snapshot([], 2026, "2026-08-11", rows(4), total_drafts=112)
    assert s[0]["total_drafts"] == 112


# ── the reader, built with the writer (rule 14) ─────────────────────────────
def test_the_series_feeds_ExternalAsOfStore_DIRECTLY():
    """The consumer exists the day the writer does. MUTATION: change the emitted
    key names — the store would receive rows it cannot read and hand back an
    empty board without erroring."""
    s = C.append_snapshot([], 2026, "2026-08-09", {"100": 1.0, "101": 2.0})
    s = C.append_snapshot(s, 2026, "2026-08-10", {"100": 1.5, "101": 2.5})
    store = X.ExternalAsOfStore("L1", "2026-08-12", C.as_store_snapshots(s, 2026), "fp")
    board = store.board()
    assert {r["player_id"] for r in board} == {"100", "101"}
    assert store.snapshot_date().isoformat() == "2026-08-10"


def test_F5s_strictly_before_rule_is_NOT_reimplemented_here():
    """One owner for one rule. `as_store_snapshots` hands over EVERY snapshot for
    the season and lets the store choose; a second selection here is how two
    derivation paths for one F5 decision come to disagree.

    THE FIRST CUT OF THIS TEST GREPPED THE SOURCE FOR "strictly before" AND
    FAILED ON ITS OWN DOCSTRING — the same defect as the `setSlot` guard that
    matched the COMMENT explaining a fix rather than the code implementing it.
    A prose scan cannot tell an explanation from an implementation, so this walks
    the AST of the function instead and looks for an actual date comparison.
    """
    import ast
    src = (HERE.parent / "backtest" / "external_adp_capture.py").read_text()
    fn = next(n for n in ast.parse(src).body
              if isinstance(n, ast.FunctionDef) and n.name == "as_store_snapshots")
    compares = [n for n in ast.walk(fn) if isinstance(n, ast.Compare)]
    dated = [c for c in compares
             if any("observed_at" in ast.dump(part) for part in [c.left] + list(c.comparators))]
    assert not dated, (
        "as_store_snapshots compares observed_at — it is selecting a snapshot, which "
        "is ExternalAsOfStore's job and would be a second implementation of F5")
    s = C.append_snapshot([], 2026, "2026-08-09", rows(2))
    s = C.append_snapshot(s, 2026, "2026-08-20", rows(2))
    assert len(C.as_store_snapshots(s, 2026)) == 2, "the store must see BOTH and pick"


def test_a_snapshot_ON_the_draft_date_is_still_refused_downstream():
    """The capture must not weaken F5 by handing over a same-day board. The store
    refuses it; this asserts the pair actually behaves that way end to end."""
    s = C.append_snapshot([], 2026, "2026-08-12", rows(2))
    store = X.ExternalAsOfStore("L1", "2026-08-12", C.as_store_snapshots(s, 2026), "fp")
    from asof import TimeTravelError
    try:
        store.board()
        raise AssertionError("a same-day snapshot must not be usable")
    except TimeTravelError:
        pass


# ── coverage: a gap must be visible, and an empty day must not count ────────
def test_coverage_reports_the_span_and_the_thinnest_day():
    s = C.append_snapshot([], 2026, "2026-08-09", rows(400))
    s = C.append_snapshot(s, 2026, "2026-08-11", rows(390))
    cov = C.coverage(s, 2026)
    assert (cov["snapshots"], cov["first"], cov["last"]) == (2, "2026-08-09", "2026-08-11")
    assert (cov["min_rows"], cov["max_rows"]) == (390, 400)


def test_an_EMPTY_snapshot_is_counted_as_empty_not_as_a_day_captured():
    """MUTATION: drop `empty_snapshots`. A failed fetch that still wrote a dated
    row would read as coverage — the 2%-capture-recorded-as-success failure that
    B found in the market layer, in a different archive."""
    s = C.append_snapshot([], 2026, "2026-08-09", {})
    s = C.append_snapshot(s, 2026, "2026-08-10", rows(5))
    cov = C.coverage(s, 2026)
    assert cov["snapshots"] == 2 and cov["empty_snapshots"] == 1
    assert cov["min_rows"] == 0


def test_coverage_of_a_season_we_hold_NOTHING_for_is_zero_not_an_error():
    cov = C.coverage([], 2026)
    assert cov["snapshots"] == 0 and cov["first"] is None and cov["empty_snapshots"] == 0


# ── A DAY WITH NO ROW AT ALL, which is the loss that could not be seen ──────
#
# `empty_snapshots` catches a dated row with no board behind it. Until these
# tests there was nothing that caught a day with NO ROW, and the difference is
# not cosmetic: MFL serves no as-of-date board — the measured finding this whole
# archive exists because of — so a day not captured is gone for good.
#
# The mutation was applied to the shipped function before any of this was
# written. A twelve-day window with 08-14..08-16 dropped reported `snapshots: 9,
# first: 08-11, last: 08-22, empty_snapshots: 0`, which is arithmetically
# identical to a complete capture.

def _days(ds, year=2026):
    s = []
    for d in ds:
        s = C.append_snapshot(s, year, d, rows(700))
    return s


def test_a_capture_that_STOPPED_AND_RESUMED_names_the_days_it_lost():
    """THE ONE THIS EXISTS FOR. MUTATION: the shipped function, before the fix.

    An outage in the middle of the archive leaves `first`, `last`, `snapshots`
    and `empty_snapshots` all looking healthy — the row count simply goes up by
    less than the calendar did, and nobody is subtracting."""
    cov = C.coverage(_days(["2026-08-11", "2026-08-12", "2026-08-13",
                            "2026-08-17", "2026-08-18"]), 2026)
    assert cov["snapshots"] == 5          # the number that looked fine
    assert cov["empty_snapshots"] == 0    # ...and the check that could not see it
    assert cov["expected_days"] == 8
    assert cov["missing"] == 3
    assert cov["complete"] is False


def test_the_lost_days_are_NAMED_and_not_merely_counted():
    """MUTATION: report `missing: 3` and drop `missing_days`. A count says the
    archive is holed; only the dates say WHICH market days are unrecoverable, and
    that is the difference between a number and something actionable. Same
    principle as naming empty fields rather than counting them."""
    cov = C.coverage(_days(["2026-08-11", "2026-08-12", "2026-08-13",
                            "2026-08-17", "2026-08-18"]), 2026)
    assert cov["missing_days"] == ["2026-08-14", "2026-08-15", "2026-08-16"]


def test_an_UNBROKEN_capture_reports_complete():
    """The negative control. MUTATION: return `complete: False` unconditionally —
    without this, an always-firing gap report is indistinguishable from a working
    one, and a check that always fires gets muted exactly like a check that never
    does."""
    cov = C.coverage(_days(["2026-08-11", "2026-08-12", "2026-08-13"]), 2026)
    assert cov["complete"] is True
    assert cov["missing"] == 0 and cov["missing_days"] == []
    assert cov["expected_days"] == 3


def test_a_SINGLE_day_archive_is_complete_rather_than_an_error():
    """The state the real archive was in on its first day. MUTATION: compute the
    span as `last - first` and a one-day archive reports `expected_days: 0`
    against one snapshot — a brand-new capture reading as over-full."""
    cov = C.coverage(_days(["2026-08-11"]), 2026)
    assert cov["expected_days"] == 1 and cov["missing"] == 0
    assert cov["complete"] is True


def test_an_UNPARSEABLE_date_reports_UNCOUNTED_rather_than_ZERO_MISSING():
    """MUTATION: wrap the parse in `except: return {'missing': 0}`. A malformed
    date would then certify the archive as gap-free ON THE STRENGTH OF THE
    MALFORMED DATE — a broken capture reporting a clean one, which is the precise
    inversion this module exists to prevent. Rule 13f: 'I could not look' must
    never render as 'nothing there'."""
    s = _days(["2026-08-11", "2026-08-12"])
    s[1]["observed_at"] = "not-a-date"
    cov = C.coverage(s, 2026)
    assert cov["missing"] is None and cov["complete"] is None
    assert "UNCOUNTED" in cov["gap_note"]


def test_nothing_captured_is_UNCOUNTED_and_specifically_NOT_complete():
    """MUTATION: let the empty case fall through to `complete: True`. An archive
    holding nothing would certify itself as a complete capture — 'no gaps found'
    where the truth is 'no days found'."""
    cov = C.coverage([], 2026)
    assert cov["complete"] is None and "UNCOUNTED" in cov["gap_note"]


def test_a_LONG_outage_lists_a_capped_sample_but_counts_every_day():
    """MUTATION: truncate `missing_days` and let the count follow the list. The
    report would then say 14 days lost when 40 were, and a silent cap reads as
    'that was all of them'. The cap is declared in the row that carries it."""
    cov = C.coverage(_days(["2026-06-01", "2026-08-11"]), 2026)
    assert cov["missing"] == 70                      # exact, not the cap
    assert len(cov["missing_days"]) == C.MISSING_DAYS_LISTED
    assert cov["missing_listed_truncated"] is True


def test_the_saved_archive_carries_its_own_COVERAGE_not_just_its_population(tmp_path):
    """Cory's ruling one step along: a durable record states what it does not hold.

    MUTATION: write only `population`. It reports 100% on every field of a holed
    archive and is RIGHT to — a day never captured contributes no row to be
    counted empty. The two records catch different holes and neither substitutes
    for the other, which is why both are written."""
    p = tmp_path / "arch.json"
    C.save(_days(["2026-08-11", "2026-08-12", "2026-08-16"]), path=str(p))
    doc = json.loads(p.read_text())
    assert doc["population"]["fields"]["observed_at"]["pct"] == 100.0   # and yet
    assert doc["coverage"]["2026"]["missing"] == 3
    assert doc["coverage"]["2026"]["missing_days"] == ["2026-08-13", "2026-08-14",
                                                       "2026-08-15"]


def test_the_saved_coverage_is_keyed_PER_SEASON():
    """MUTATION: compute one coverage over every row. Two seasons captured on
    overlapping calendars would report the union as one span and invent gaps that
    do not exist in either."""
    s = C.append_snapshot([], 2025, "2026-08-11", rows(9))
    s = C.append_snapshot(s, 2026, "2026-08-11", rows(9))
    s = C.append_snapshot(s, 2026, "2026-08-12", rows(9))
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "a.json"
        C.save(s, path=str(p))
        cov = json.loads(p.read_text())["coverage"]
    assert set(cov) == {"2025", "2026"}
    assert cov["2025"]["snapshots"] == 1 and cov["2025"]["complete"] is True
    assert cov["2026"]["snapshots"] == 2 and cov["2026"]["complete"] is True


# ── the escalation condition, tested because it is no longer in YAML ────────
_D = __import__("datetime").date


def test_a_run_that_RESUMED_after_a_skipped_day_escalates():
    """The alarm. MUTATION: return False always — an outage passes in silence and
    the days are gone before anyone knows the schedule stopped."""
    s = _days(["2026-08-11", "2026-08-12"])
    assert C.missed_yesterday(s, 2026, _D(2026, 8, 16)) is True


def test_an_UNBROKEN_daily_capture_stays_quiet():
    """The negative control. MUTATION: return True always — a job that escalates
    every morning gets muted, and a muted alarm is worse than none because it is
    believed to be working."""
    s = _days(["2026-08-11", "2026-08-12"])
    assert C.missed_yesterday(s, 2026, _D(2026, 8, 13)) is False


def test_the_alarm_SELF_CLEARS_once_the_gap_is_historical():
    """MUTATION: escalate whenever `coverage()['missing']` is non-zero. A gap can
    never be repaired — no provider serves an as-of-date board — so that version
    is red every morning for ever, which is how a real alarm gets switched off."""
    s = _days(["2026-08-11", "2026-08-12", "2026-08-16"])
    assert C.missed_yesterday(s, 2026, _D(2026, 8, 17)) is False


def test_a_BRAND_NEW_archive_does_not_escalate_about_the_day_before_it_existed():
    """MUTATION: drop the `min(days) < yday` guard. The very first capture would
    report a missed day on its first morning — a false alarm on day one, which is
    the fastest way to teach everyone to ignore this."""
    s = _days(["2026-08-11"])
    assert C.missed_yesterday(s, 2026, _D(2026, 8, 11)) is False


def test_a_LONG_historical_gap_does_NOT_mute_the_alarm_for_yesterday():
    """THE DEFECT THE MOVE OUT OF YAML FOUND, pinned so it cannot come back.

    MUTATION: ask `coverage()['missing_days']` whether yesterday is absent. That
    list is capped at 14; with 70 earlier days lost, yesterday falls off the end
    and the alarm silently stops firing — the cap becoming a mute."""
    s = _days(["2026-06-01", "2026-08-11"])
    assert "2026-08-12" not in C.coverage(s, 2026)["missing_days"]   # off the cap
    assert C.missed_yesterday(s, 2026, _D(2026, 8, 13)) is True      # fires anyway


def test_the_alarm_is_scoped_to_the_SEASON_being_captured():
    """MUTATION: ignore `year`. A 2025 row dated yesterday would satisfy the 2026
    check, and a dead 2026 capture would read as healthy off another season."""
    s = C.append_snapshot([], 2025, "2026-08-12", rows(3))
    s = C.append_snapshot(s, 2026, "2026-08-09", rows(3))
    assert C.missed_yesterday(s, 2026, _D(2026, 8, 13)) is True


def test_an_EMPTY_archive_does_not_escalate():
    """Nothing captured is a statement about the run, not a missed day."""
    assert C.missed_yesterday([], 2026, _D(2026, 8, 13)) is False


def test_a_DEAD_capture_is_NOT_claimed_to_be_caught_here():
    """The honest limit, pinned so a later reader cannot infer more than is true.

    A capture that stops and never resumes leaves NO interior gap — `last` simply
    stops advancing. This function takes no clock and cannot see that. Pinning it
    keeps the next person from routing the dead-capture case here and believing
    it covered; that instrument has to run on a different schedule than the job
    it is watching."""
    cov = C.coverage(_days(["2026-08-11", "2026-08-12"]), 2026)
    assert cov["complete"] is True        # contiguous...
    assert "age_days" not in cov          # ...and silent about how old it is


# ── the archive must not be confused with the HOME instrument ───────────────
def test_the_archive_is_a_DIFFERENT_FILE_from_the_home_staleness_series():
    """`draft/data/adp_series.json` is A's home instrument at TOP_N=300 /
    MAX_DAYS=60. Writing this archive there — or reading that one as this — would
    silently apply both caps to the evidence."""
    assert C.SERIES.name == "external_adp_series.json"
    assert C.SERIES.name != "adp_series.json"


def test_the_capture_sends_the_SHIPPED_user_agent():
    src = (HERE.parent / "adp.py").read_text()
    shipped = re.search(r'"User-Agent":\s*"([^"]+)"', src)
    assert shipped and C.USER_AGENT == shipped.group(1)


# ── the reader must accept the ARTIFACT, not just the shape a test hands it ──
def test_the_readers_accept_the_ARCHIVE_FILE_as_written_to_disk():
    """RULE 14, AND ITS AUTHOR STEPPED IN IT. `save()` writes
    {"_note":..., "series":[...]}; a caller doing json.load() by hand gets the
    WRAPPER, and iterating a dict yields its KEYS — every snapshot became the
    string "_note". The unit tests all passed because they hand a LIST, which is
    the shape the live path does not have."""
    ser = C.append_snapshot([], "2026", "2026-08-11", {"1": 2.5, "2": 3.0}, total_drafts=115)
    archive = {"_note": "whatever this file says about itself", "series": ser}
    assert C.as_store_snapshots(archive, "2026") == C.as_store_snapshots(ser, "2026")
    assert C.coverage(archive, "2026") == C.coverage(ser, "2026")
    assert C.coverage(archive, "2026")["snapshots"] == 1


def test_a_shape_the_reader_does_not_understand_RAISES_rather_than_reading_EMPTY():
    """MUTATION: `return []` on the unknown branch. Every league would report
    F4.no_pre_draft_adp — a true-looking statement about the leagues and a false
    one about the archive, and nothing anywhere would contradict it."""
    import pytest
    with pytest.raises(TypeError) as e:
        C.as_store_snapshots("draft/data/external_adp_series.json", "2026")
    assert "statement about the leagues" in str(e.value)


def test_None_is_still_an_empty_series_because_that_is_a_real_caller():
    assert C.as_store_snapshots(None, "2026") == []
    assert C.coverage(None, "2026")["snapshots"] == 0


def test_the_saved_series_carries_its_own_field_population(tmp_path):
    """`total_drafts` going empty must be visible in the FILE, not inferred later.

    This module already states a snapshot without it "cannot be judged later"; the
    population record is what makes the day it disappears legible to whoever next
    tries to weight the series.
    """
    import json as _json
    series = [
        {"year": "2026", "observed_at": "2026-08-11", "rows": {"1": 2.0},
         "total_drafts": 500, "row_count": 1},
        {"year": "2026", "observed_at": "2026-08-12", "rows": {"1": 2.1},
         "total_drafts": None, "row_count": 1},
    ]
    p = tmp_path / "series.json"
    C.save(series, path=str(p))
    pop = _json.loads(p.read_text())["population"]
    assert pop["rows"] == 2
    assert pop["fields"]["total_drafts"]["pct"] == 50.0
    assert "total_drafts" in pop["partial"]


def test_a_snapshot_field_that_disappears_entirely_is_still_named(tmp_path):
    """Declared, not derived: a key absent from EVERY row must not vanish silently."""
    import json as _json
    series = [{"year": "2026", "observed_at": "2026-08-11", "rows": {"1": 2.0},
               "row_count": 1}]                      # total_drafts never written
    p = tmp_path / "s.json"
    C.save(series, path=str(p))
    pop = _json.loads(p.read_text())["population"]
    assert pop["fields"]["total_drafts"]["missing"] == 1
    assert "total_drafts" in pop["empty"]
