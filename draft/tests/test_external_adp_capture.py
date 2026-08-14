"""D3's ARCHIVE — the only recoverable copy of the 2026 curve.

Written break-first: each assertion below exists because the mutation named in
its docstring was applied first and the suite was watched. The mutations matter
more than usual here, because every one of them produces an archive that LOOKS
complete — a date is present, rows are present, coverage reports a number — and
the damage only surfaces months later as a league quietly failing F5.

Run: python3 -m pytest draft/tests/test_external_adp_capture.py -q
"""
import json

import pytest
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import external_adp_capture as C  # noqa: E402
import external_replay as X  # noqa: E402


def SAME_NAMESPACE(series):
    """An identity id map, written out at every call site that wants one.

    There is deliberately no default inside `as_store_snapshots`. These fixtures
    key their snapshots with OUR ids, which is a real and legitimate case — but it
    is an ASSUMPTION, and it was the assumption that hid the shipped defect for two
    days. Naming it here means a reader sees the claim being made instead of
    inheriting it from a default.
    """
    return {pid: pid for s in series for pid in (s.get("rows") or {})}


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
    store = X.ExternalAsOfStore("L1", "2026-08-12",
                                C.as_store_snapshots(s, 2026, SAME_NAMESPACE(s)), "fp")
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
    assert len(C.as_store_snapshots(s, 2026, SAME_NAMESPACE(s))) == 2, (
        "the store must see BOTH and pick")


def test_a_snapshot_ON_the_draft_date_is_still_refused_downstream():
    """The capture must not weaken F5 by handing over a same-day board. The store
    refuses it; this asserts the pair actually behaves that way end to end."""
    s = C.append_snapshot([], 2026, "2026-08-12", rows(2))
    store = X.ExternalAsOfStore("L1", "2026-08-12",
                                C.as_store_snapshots(s, 2026, SAME_NAMESPACE(s)), "fp")
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
    assert (C.as_store_snapshots(archive, "2026", SAME_NAMESPACE(ser))
            == C.as_store_snapshots(ser, "2026", SAME_NAMESPACE(ser)))
    assert C.coverage(archive, "2026") == C.coverage(ser, "2026")
    assert C.coverage(archive, "2026")["snapshots"] == 1


def test_a_shape_the_reader_does_not_understand_RAISES_rather_than_reading_EMPTY():
    """MUTATION: `return []` on the unknown branch. Every league would report
    F4.no_pre_draft_adp — a true-looking statement about the leagues and a false
    one about the archive, and nothing anywhere would contradict it."""
    import pytest
    with pytest.raises(TypeError) as e:
        C.as_store_snapshots("draft/data/external_adp_series.json", "2026", {})
    assert "statement about the leagues" in str(e.value)


def test_None_is_still_an_empty_series_because_that_is_a_real_caller():
    assert C.as_store_snapshots(None, "2026", {}) == []
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


# ── the fetch retry: one HTTP request stood between us and a day of the curve ──
#
# Break-first, on the shipped function: a single transient 503 raised out of
# `fetch_mfl`, aborted `capture()`, failed the step and lost the day. Tomorrow's
# run fetches tomorrow's board, so the missed day never returns.
#
# The DECISION lives in `retryable`/`with_retry` rather than inside `fetch_mfl`,
# which is `pragma: no cover` because it needs egress. Retry logic written in
# there would be untested logic guarding a perishable observation — which is the
# mistake this lane already made once today, in a workflow YAML.
import urllib.error  # noqa: E402


def _http(code):
    return urllib.error.HTTPError("http://x", code, "boom", {}, None)


def test_a_5xx_is_RETRIED_because_it_means_not_now():
    assert C.retryable(_http(503)) is True
    assert C.retryable(_http(500)) is True


def test_a_429_is_RETRIED():
    """Rate limiting is the one 4xx that is a 'not now' rather than a 'no'."""
    assert C.retryable(_http(429)) is True


def test_a_404_is_NOT_retried_because_it_is_the_servers_ANSWER():
    """MUTATION: retry every HTTPError. Repeating a question the server already
    answered spends the window and turns a clear failure into a slow one."""
    assert C.retryable(_http(404)) is False
    assert C.retryable(_http(403)) is False


def test_a_network_failure_is_RETRIED():
    """DNS, reset, TLS and timeout are 'the network did not answer', not 'no'.
    MUTATION: only retry HTTPError — the most common transient failure at a fixed
    minute each day is precisely the one that never reaches an HTTP status."""
    assert C.retryable(urllib.error.URLError("reset")) is True
    assert C.retryable(TimeoutError()) is True
    assert C.retryable(ConnectionError()) is True


def test_a_PROGRAMMING_error_is_not_retried_as_if_it_were_weather():
    """MUTATION: return True by default. A KeyError in the parser would be
    attempted four times and reported as a network problem."""
    assert C.retryable(ValueError("bad json")) is False
    assert C.retryable(KeyError("adp")) is False


def test_a_transient_failure_is_SURVIVED_and_the_day_is_captured():
    """THE ONE THIS EXISTS FOR — the exact shape demonstrated against the shipped
    function: one 503, then success. MUTATION: the shipped `fetch_mfl`, a single
    urlopen. The day is lost and cannot be refetched."""
    n = {"i": 0}

    def call():
        n["i"] += 1
        if n["i"] == 1:
            raise _http(503)
        return "the board"
    assert C.with_retry(call, sleep=lambda s: None) == "the board"
    assert n["i"] == 2


def test_a_PERMANENT_failure_raises_IMMEDIATELY_rather_than_burning_the_window():
    """MUTATION: retry regardless. A 404 would take the full backoff before
    failing, for an answer available on the first attempt."""
    n = {"i": 0}

    def call():
        n["i"] += 1
        raise _http(404)
    try:
        C.with_retry(call, sleep=lambda s: None)
        raise AssertionError("a 404 must not be retried")
    except urllib.error.HTTPError:
        pass
    assert n["i"] == 1


def test_the_LAST_error_is_RAISED_rather_than_swallowed_into_an_empty_board():
    """MUTATION: return None after the last attempt. `capture()` would then get
    no rows and — because it refuses an empty snapshot — report a MISLEADING
    'zero rows' failure instead of the transport error that actually happened."""
    def call():
        raise _http(502)
    try:
        C.with_retry(call, attempts=3, sleep=lambda s: None)
        raise AssertionError("exhausted retries must re-raise")
    except urllib.error.HTTPError as e:
        assert e.code == 502


def test_the_backoff_is_BETWEEN_attempts_and_never_before_the_first():
    """MUTATION: sleep at the top of every iteration. Every healthy daily run
    would pay the delay for nothing."""
    slept = []
    n = {"i": 0}

    def call():
        n["i"] += 1
        if n["i"] < 3:
            raise _http(503)
        return "ok"
    C.with_retry(call, backoff=3, sleep=slept.append)
    assert slept == [3, 6], slept


def test_a_SINGLE_attempt_setting_still_makes_one_call():
    """MUTATION: `range(attempts - 1)`. attempts=1 would make zero calls and
    report success having never asked."""
    n = {"i": 0}

    def call():
        n["i"] += 1
        return "ok"
    assert C.with_retry(call, attempts=1, sleep=lambda s: None) == "ok"
    assert n["i"] == 1


def test_the_DECLARED_attempt_budget_is_the_number_of_calls_ACTUALLY_made():
    """FOUND BY A SURVIVING MUTATION: `range(attempts - 1)`. Every other test here
    passed under it, because `max(1, ...)` rescues the attempts=1 case and the
    others fail early enough that one fewer try still reaches the same outcome.

    So the off-by-one would have shipped silently, and `RETRY_ATTEMPTS = 4` would
    have bought three tries — a resilience budget that reads correct in the
    constant and is wrong in the loop, guarding a day that cannot be refetched."""
    for budget in (1, 2, 4, 5):
        n = {"i": 0}

        def call():
            n["i"] += 1
            raise _http(503)
        try:
            C.with_retry(call, attempts=budget, sleep=lambda s: None)
        except urllib.error.HTTPError:
            pass
        assert n["i"] == budget, "attempts=%d made %d calls" % (budget, n["i"])


def test_the_shipped_default_is_the_budget_the_constant_declares():
    """MUTATION: change RETRY_ATTEMPTS without changing the loop, or vice versa."""
    n = {"i": 0}

    def call():
        n["i"] += 1
        raise _http(503)
    try:
        C.with_retry(call, sleep=lambda s: None)
    except urllib.error.HTTPError:
        pass
    assert n["i"] == C.RETRY_ATTEMPTS


# ── how far behind, which is NOT the interior-gap count ─────────────────────
#
# Found by rehearsing the workflow end to end against a dead MFL: the resume
# alarm printed "0 uncaptured day(s)" while firing correctly. `missing` counts
# gaps INSIDE the span held, and a capture that has stopped has none yet — the
# hole only becomes interior once a later row lands on the far side of it.

def test_days_since_last_reports_how_far_behind_the_archive_is():
    """MUTATION: quote `coverage()['missing']` in the alarm, as shipped. On the
    run that matters most — the capture is dead and has not resumed — that number
    is 0, and an alarm about an unrecoverable loss that reports zero reads as a
    bug and gets ignored."""
    s = _days(["2026-08-05"])
    assert C.coverage(s, 2026)["missing"] == 0          # the wrong number...
    assert C.days_since_last(s, 2026, _D(2026, 8, 12)) == 7   # ...and the right one


def test_the_two_numbers_are_DIFFERENT_questions_and_both_are_reported():
    """A resumed capture has both: days lost inside the span, and how far behind
    the newest row is. MUTATION: report only one — either alone understates."""
    s = _days(["2026-08-05", "2026-08-09"])
    assert C.coverage(s, 2026)["missing"] == 3                 # 08-06..08-08
    assert C.days_since_last(s, 2026, _D(2026, 8, 12)) == 3    # 08-09 -> 08-12


def test_a_capture_that_ran_today_is_ZERO_days_behind():
    """The negative control. MUTATION: off-by-one — a healthy daily capture would
    report 1 day stale every morning."""
    s = _days(["2026-08-11", "2026-08-12"])
    assert C.days_since_last(s, 2026, _D(2026, 8, 12)) == 0


def test_an_EMPTY_archive_reports_None_rather_than_zero_days_behind():
    """MUTATION: return 0. 'Nothing captured' would render as 'perfectly current',
    which is absent-as-zero in the instrument built to end absent-as-zero."""
    assert C.days_since_last([], 2026, _D(2026, 8, 12)) is None


def test_an_unparseable_date_reports_None_rather_than_a_wrong_number():
    s = _days(["2026-08-11"]); s[0]["observed_at"] = "not-a-date"
    assert C.days_since_last(s, 2026, _D(2026, 8, 12)) is None


def test_days_since_last_is_scoped_to_the_SEASON():
    """MUTATION: ignore `year`. A 2025 row dated today would make a dead 2026
    capture look current."""
    s = C.append_snapshot([], 2025, "2026-08-12", rows(3))
    s = C.append_snapshot(s, 2026, "2026-08-05", rows(3))
    assert C.days_since_last(s, 2026, _D(2026, 8, 12)) == 7


def test_the_alarm_names_only_the_number_that_is_NON_ZERO():
    """MUTATION: a fixed two-clause template, as first shipped. Exactly one of the
    numbers is zero in each real case, so it always printed a stray nought — and
    an alarm for an unrecoverable loss containing a 0 gets skimmed."""
    # capture succeeded and resumed: 0 days behind, 6 lost inside the span
    m = C.resume_alarm(6, 0)
    assert "6 day(s) are already lost" in m and "0 day" not in m
    # capture is dead and never resumed: 7 days behind, no interior gap yet
    m = C.resume_alarm(0, 7)
    assert "7 day(s) old" in m and "0 day" not in m


def test_the_alarm_reports_BOTH_when_both_are_real():
    m = C.resume_alarm(3, 2)
    assert "2 day(s) old" in m and "3 day(s) are already lost" in m


def test_an_UNCOUNTABLE_archive_says_so_rather_than_inventing_a_figure():
    """MUTATION: fall through to '0 days'. `missing` is None when a date could not
    be parsed; printing zero would report a clean archive off a broken one, in the
    alarm built to announce the opposite."""
    m = C.resume_alarm(None, None)
    assert "cannot say how many days" in m and "0" not in m


# ── THE NAMESPACE SEAM: whose id is under `player_id`? ──────────────────────
# These two exist because the archive shipped for two days emitting MFL's OWN
# player ids under the key `player_id`, which every consumer downstream reads as
# OUR sleeper id. Measured on the real 2026-08-12 capture: 15 of 708 ids collide
# numerically with a board id and ALL FIFTEEN are false matches (MFL's #1 overall
# resolves to a fourth-string college tight end). The two tests above could not
# see it — one asserts the emitted KEY NAMES, the other asserts ids in == ids
# out. Neither asks what namespace the value is in.
def test_as_store_snapshots_REFUSES_to_label_a_foreign_id_as_OUR_player_id():
    """MUTATION: let `ids` default to a pass-through. That is exactly the shipped
    defect — the source's key travels under our field name, every downstream join
    silently misses, and nothing raises because a dict lookup that finds nothing
    is a normal dict lookup."""
    s = C.append_snapshot([], 2026, "2026-08-09", {"13589": 2.6, "16161": 3.8})
    try:
        C.as_store_snapshots(s, 2026)
    except TypeError:
        pass                      # the signature itself refuses — acceptable
    except ValueError as e:
        assert "id" in str(e).lower()
    else:
        raise AssertionError(
            "as_store_snapshots handed over rows without being told whose ids they "
            "are — the shipped defect, and it cannot be caught downstream because "
            "a miss looks identical to a player who was simply never drafted")


def test_a_DRAFTED_player_is_actually_REMOVED_from_the_replay_board():
    """THE CONSEQUENCE, asserted where it bites rather than at the seam.

    MUTATION: give the archive ids from a different namespace than the picks —
    which is what the live path did. `taken` fills with OUR ids while the board is
    keyed by MFL's, so `i not in taken` is ALWAYS true and the available set NEVER
    SHRINKS. Every player stays draftable for the whole replay and the baseline is
    graded against a board where nobody was ever picked. It does not raise, it does
    not empty, it just quietly grades a fiction.

    The whole-chain test in test_survival_grade.py cannot catch this: it builds the
    crosswalk and the snapshot from the same `S%d` generator, so the two namespaces
    are identical BY CONSTRUCTION. Rule 10d, on the one guard written for this class.
    """
    import external_replay_run as RR
    picks = [{"overall": i, "round": (i - 1) // 10 + 1, "team": "T%d" % ((i - 1) % 10 + 1),
              "player_id": "S%d" % i, "timestamp": 1756141200 + i * 600}
             for i in range(1, 31)]
    rec = {"league_id": "L1", "draft_at": "2025-08-25", "draft": {"picks": picks}}
    src = {str(13000 + i): float(i) for i in range(1, 81)}        # MFL's ids
    ours = {str(13000 + i): "S%d" % i for i in range(1, 81)}      # the decode key
    s = C.append_snapshot([], 2025, "2025-08-20", src, total_drafts=500)
    store = X.ExternalAsOfStore("L1", "2025-08-25", C.as_store_snapshots(s, 2025, ours), "fp")
    board = store.board()
    ctx = RR.decision_contexts(rec, board)
    avail = [len(c["context"]["available"]) for c in (ctx[0], ctx[14], ctx[29])]
    assert avail == [80, 66, 51], (
        "the available set must shrink by one per pick; got %s. If it is flat at "
        "the board size, the board's ids and the picks' ids are in different "
        "namespaces and nobody is ever removed." % avail)


# ── THE DECODE KEY: an archive of ids nobody can resolve is not evidence ────
def test_the_players_map_KEEPS_an_id_that_todays_fetch_no_longer_returns():
    """The archive is append-only because the days are perishable; the DECODE KEY
    for those days is perishable in exactly the same way and was not being kept at
    all. MUTATION: let today's fetch replace the map. A player who falls off MFL's
    ADP board takes his own name with him, and every earlier day that priced him
    becomes a number against an id nothing can resolve."""
    old = {"13589": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}}
    new = {"16161": {"name": "Bijan Robinson", "position": "RB", "team": "ATL"}}
    m = C.merge_players(old, new)
    assert set(m) == {"13589", "16161"}
    assert m["13589"]["name"] == "Ja'Marr Chase"


def test_a_BLANK_incoming_row_does_not_ERASE_a_name_we_already_hold():
    """MUTATION: let the incoming record win unconditionally. One day of MFL
    serving `name: ""` blanks the archive's only copy of who these ids are, and
    `population` would still report the field 100% PRESENT because the key is
    there. Absent is not zero, and neither is empty."""
    old = {"1": {"name": "Bijan Robinson", "position": "RB", "team": "ATL"}}
    new = {"1": {"name": "", "position": None, "team": "ATL"}}
    m = C.merge_players(old, new)
    assert m["1"]["name"] == "Bijan Robinson"
    assert m["1"]["position"] == "RB"
    assert m["1"]["team"] == "ATL"


def test_save_WITHOUT_a_players_map_does_not_wipe_the_one_on_disk(tmp_path):
    """MUTATION: write the file from the arguments alone. `save(series)` is called
    from more than one place, and the first caller that does not happen to hold the
    decode key silently deletes it for every day already archived. The file still
    looks complete — dates, rows, coverage all present."""
    p = tmp_path / "a.json"
    C.save(C.append_snapshot([], 2026, "2026-08-11", {"13589": 2.6}),
           path=str(p), players={"13589": {"name": "Ja'Marr Chase",
                                           "position": "WR", "team": "CIN"}})
    C.save(C.append_snapshot(C.load(str(p)), 2026, "2026-08-12", {"13589": 2.5}),
           path=str(p))                       # no players argument at all
    d = json.loads(p.read_text())
    assert d["players"]["13589"]["name"] == "Ja'Marr Chase", (
        "the decode key was dropped by a save that simply did not mention it")
    assert len(d["series"]) == 2


def test_the_archive_can_be_CROSSWALKED_without_asking_the_source_again():
    """THE POINT OF STORING NAMES AT ALL. MUTATION: build the id map from a live
    fetch instead of from the archive. The archive then decodes only while MFL is
    up and still serving 2026 — which is precisely the window the archive exists
    to outlive."""
    p_map = {"13589": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
             "99999": {"name": "Nobody At All", "position": "WR", "team": "FA"}}
    board = [{"player_id": "4034", "name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}]
    ids, report = C.crosswalk_map(p_map, board)
    assert ids == {"13589": "4034"}
    assert report["crosswalked"] == 1 and report["no_sleeper_match"] == 1
    assert "Nobody At All" in str(report["unmatched_sample"])


def test_an_MFL_TEAM_UNIT_never_crosswalks_onto_our_team_DEFENCE():
    """MUTATION — AND I WROTE IT BEFORE I CAUGHT IT. The first cut of
    `crosswalk_map` called `adp.match_player` directly, reasoning that reusing the
    authoritative matcher was enough. It is not: the team-unit refusal lives in the
    authoritative CALLER. MFL prints a team unit as "Bills, Buffalo", which
    normalizes to "Buffalo Bills", which is exactly what our Buffalo DEF is called —
    so the name matches, a real board id comes back, and nothing errors. Measured on
    the real run before this guard existed: TMQB -> DEF 65 times, TMPK -> DEF 38."""
    p_map = {"0518": {"name": "Bills, Buffalo", "position": "TMQB", "team": "BUF"}}
    board = [{"player_id": "BUF", "name": "Buffalo Bills", "position": "DEF", "team": "BUF"}]
    ids, report = C.crosswalk_map(p_map, board)
    assert ids == {}, "an MFL team unit matched our DEF on name — it is not a player"
    assert "team_unit_not_a_player" in str(report["unmatched_sample"])


# ── PROVENANCE: the archive must record WHICH MARKET priced these players ───
def test_a_snapshot_RECORDS_THE_MARKET_IT_CAME_FROM():
    """MEASURED, AND THIS IS WHY IT MATTERS. `fetch_mfl` builds
    `note = "mfl PERIOD=DRAFT IS_PPR=1 FCOUNT=12"`, hands it to `capture()` — and it
    was thrown away. The archive stored PRICES WITH NO RECORD OF THE FORMAT THAT
    PRODUCED THEM, which is the decode-key defect one layer up: bytes nobody can
    interpret later.

    It is not hypothetical. This pool is superflex-contaminated: against FantasyPros
    on the same players, the median MFL/FPROS ADP ratio is 0.98 at TE, 1.01 at DEF —
    and 0.514 at QB, ranging 0.12 to 0.77 and varying systematically with rank, so
    no scalar correction repairs it. A grader reading this archive as F5 evidence in
    2027 would price quarterbacks off a superflex market and have nothing in the
    file to warn them.

    MUTATION: drop the field. Every snapshot still looks complete — date, rows,
    row_count, total_drafts all present — and the one fact that makes the prices
    interpretable is gone."""
    s = C.append_snapshot([], 2026, "2026-08-13", {"1": 2.0}, total_drafts=119,
                          source_note="mfl PERIOD=DRAFT IS_PPR=1 FCOUNT=12")
    assert s[0]["source_note"] == "mfl PERIOD=DRAFT IS_PPR=1 FCOUNT=12"
    assert "source_note" in C.SNAPSHOT_FIELDS, (
        "declared, not derived — a field that stops being written must show up as "
        "empty in the population record rather than silently ceasing to exist")


def test_a_run_whose_PLAYERS_EXPORT_FAILED_says_so_IN_THE_ARCHIVE():
    """`fetch_mfl` deliberately keeps the day's ADP when the players export 403s,
    because the curve is perishable and names are not. But that run produces a
    snapshot whose ids may be undecodable, and until now the only trace was a line
    in a CI log that expires. MUTATION: keep the ADP and record nothing — the
    degraded day is indistinguishable from a clean one forever after."""
    s = C.append_snapshot([], 2026, "2026-08-13", {"1": 2.0},
                          source_note="mfl PERIOD=DRAFT (players export FAILED this run)")
    assert "FAILED" in s[0]["source_note"]


def test_the_two_days_captured_BEFORE_provenance_read_as_ABSENT_not_clean():
    """The archive is append-only, so the first two days genuinely have no note.
    They must read as MISSING in the population record — not be back-filled with a
    guess, and not be silently omitted from the count. Absent is not zero."""
    old = C.append_snapshot([], 2026, "2026-08-11", {"1": 1.0}, total_drafts=115)
    new = C.append_snapshot(old, 2026, "2026-08-13", {"1": 2.0}, total_drafts=119,
                            source_note="mfl PERIOD=DRAFT IS_PPR=1 FCOUNT=12")
    pop = __import__("field_population").of_records(new, fields=C.SNAPSHOT_FIELDS)
    f = pop["fields"]["source_note"]
    assert f["present"] == 1 and (f["missing"] + f["null"]) == 1, f


# ── DISPERSION TRAVELS WITH THE DAY (A, 2026-08-13) ─────────────────────────
#
# 83% of the priced board carries one of two adp_sd values, because `adp.fitted_sd`
# saturates at 15.00 for every player at adp >= 100 and the search_rank fallback
# yields exactly 30.00 for its whole population by construction. A clamp that
# saturates in both directions carries no player-specific information, and adp_sd
# drives survival, which drives VONA.
#
# MFL publishes minPick/maxPick/draftSelPct. `mfl_adp.parse` now keeps them; this
# is the other half — the archive has to STORE them, or the fix survives one
# process and dies. A spread is a fact about a day, exactly as perishable as the
# mean beside it.

def test_a_snapshot_CARRIES_dispersion_beside_the_mean():
    """MUTATION: store rows only. The clamp stays the only available sd forever,
    because a day's spread cannot be re-fetched once the day has passed."""
    s = C.append_snapshot([], 2026, "2026-08-13", {"1": 10.5, "2": 20.0},
                          dispersion={"1": {"min_pick": 2, "max_pick": 40, "sel_pct": 70.0}})
    assert s[0]["rows"]["1"] == 10.5
    assert s[0]["dispersion"]["1"]["min_pick"] == 2
    assert s[0]["dispersion"]["1"]["max_pick"] == 40


def test_a_snapshot_with_NO_dispersion_says_so_rather_than_faking_it():
    """The two days already archived (2026-08-11, -12) genuinely have none — the
    parser was discarding it. They must read as ABSENT, not as zero spread.
    MUTATION: default to {} silently and let a reader treat the gap as measured."""
    s = C.append_snapshot([], 2026, "2026-08-11", {"1": 10.5})
    assert s[0]["dispersion"] is None, "absent, not an empty measurement"


def test_dispersion_does_not_disturb_the_row_shape_consumers_read():
    """`as_store_snapshots` and the replay read `rows` as {id: adp}. MUTATION:
    fold dispersion into rows — every consumer starts sorting on a dict."""
    s = C.append_snapshot([], 2026, "2026-08-13", {"1": 10.5},
                          dispersion={"1": {"min_pick": 2, "max_pick": 40}})
    assert s[0]["rows"] == {"1": 10.5}
    out = C.as_store_snapshots(s, 2026, {"1": "sleeper1"})
    assert out[0]["rows"] == [{"player_id": "sleeper1", "adp": 10.5}]


# ── THE SEAM THAT RUNS ONLY IN CI, AND ONLY ONCE A DAY ──────────────────────
#
# `fetch_mfl` is `pragma: no cover` because it needs egress, so the dispersion dict
# built inside it was shipped untested. That is the worst possible place for an
# untested line: it runs once a day, in CI, against a day that cannot be refetched.
# A bug there does not fail loudly tomorrow — it captures the mean and silently
# drops the spread again, which is the exact defect the change was made to end.
#
# So the transformation is a pure function with the fetch on one side of it, the
# same split this file already made for the row extraction ("THE ROW EXTRACTION IS
# NO LONGER WRITTEN HERE").

def _parsed(**over):
    row = {"mfl_id": "1", "adp": 10.5, "drafts": 3510,
           "min_pick": 2, "max_pick": 40, "sel_pct": 70.0}
    row.update(over)
    return [row]


def test_dispersion_of_carries_every_published_field():
    """MUTATION: keep min/max and drop sel_pct — draftSelPct is how often he was
    taken AT ALL, which is the difference between a consensus pick and a flier, and
    it is the one field that distinguishes them at equal ADP."""
    d = C.dispersion_of(_parsed())
    assert d["1"] == {"min_pick": 2, "max_pick": 40, "sel_pct": 70.0, "drafts": 3510}


def test_a_player_the_source_gave_NO_spread_for_is_OMITTED_not_stored_as_nulls():
    """A row of all-None is indistinguishable from a measured zero once it is on
    disk, and it inflates the dispersion count so a later reader thinks coverage is
    complete. MUTATION: emit every player — `dispersion_rows` stops being a
    coverage figure and becomes a copy of `row_count`.

    ⚠ THE FIXTURE GAINED `drafts=None` WHEN `DISPERSION_KEEP` WIDENED, and that is
    a correction to the fixture rather than a relaxation of the assertion. This
    test's own sentence says "a row of all-None"; `drafts` is one of the Nones and
    the fixture had been leaving it at 3510, so it was really testing "no bounds"
    under a name that claimed more. A row carrying a selection count is now KEPT on
    purpose — the marginal day needs exactly that number and no other field
    supplies it — and the row that says NOTHING is still dropped, which is what the
    assertion below has always been about."""
    d = C.dispersion_of(_parsed(min_pick=None, max_pick=None, sel_pct=None,
                                drafts=None))
    assert d == {}
    # AND THE NARROWER CLAIM THE OLD FIXTURE ACTUALLY TESTED, kept explicitly so
    # the widening is visible rather than inferred from a passing suite.
    kept = C.dispersion_of(_parsed(min_pick=None, max_pick=None, sel_pct=None))
    assert list(kept) == ["1"] and kept["1"]["drafts"] == 3510


def test_ONE_published_bound_is_enough_to_keep_him():
    """Partial is not absent. MUTATION: require both — every player MFL gives only
    a minPick for vanishes, and the loss is invisible because the rest look fine."""
    d = C.dispersion_of(_parsed(max_pick=None))
    assert list(d) == ["1"] and d["1"]["max_pick"] is None


def test_dispersion_of_an_EMPTY_parse_is_empty_not_a_crash():
    """The players export can fail while the ADP export succeeds — the file already
    keeps the day in that case. MUTATION: index [0] and the whole capture dies on
    the one path built to survive a partial fetch."""
    assert C.dispersion_of([]) == {}


# ── THE BOARD CAN SHRINK SILENTLY, AND min/max DOES NOT SHOW IT ─────────────
#
# Observed 2026-08-13 on the real archive: total_drafts ROSE 115 -> 119 -> 125 while
# row_count FELL 705 -> 708 -> 672. More drafts, 36 fewer players priced. `coverage()`
# reported `complete: true` with `min_rows 672, max_rows 708` — both true, and neither
# says "the board lost 5% of its players in a day".
#
# The likely mechanism is MFL's `CUTOFF=5`: if that is a PERCENTAGE of drafts rather
# than a count, the bar rises as drafts accumulate and marginal players fall off. I
# cannot reach MFL from here to confirm the semantics, so this does NOT assert a
# defect — it makes the movement visible so the question can be asked.

def test_coverage_REPORTS_day_over_day_row_movement():
    """MUTATION: report min/max only. A board that shrinks 5% a day reads as
    'complete' with a plausible min and max, and the shrink is invisible until
    someone diffs two snapshots by hand."""
    s = []
    for day, n in (("2026-08-11", 705), ("2026-08-12", 708), ("2026-08-13", 672)):
        s = C.append_snapshot(s, 2026, day, {str(i): 1.0 for i in range(n)})
    cov = C.coverage(s, 2026)
    assert cov["row_deltas"] == [3, -36], cov["row_deltas"]
    assert cov["largest_drop"] == -36
    assert cov["row_drop_note"], "a drop this size must carry a note, not just a number"
    assert "36" in cov["row_drop_note"]


def test_a_STABLE_series_carries_NO_drop_note():
    """The other side: an instrument that always warns is not an instrument.
    MUTATION: always emit the note — it stops meaning anything by the second day."""
    s = []
    for day, n in (("2026-08-11", 700), ("2026-08-12", 702), ("2026-08-13", 701)):
        s = C.append_snapshot(s, 2026, day, {str(i): 1.0 for i in range(n)})
    cov = C.coverage(s, 2026)
    assert cov["largest_drop"] == -1
    assert cov["row_drop_note"] is None


def test_a_SINGLE_snapshot_has_no_deltas_and_says_so():
    """Rule 13f: one day cannot show movement, and reporting 0 would read as
    'measured, and stable'. MUTATION: return 0 for the largest drop."""
    s = C.append_snapshot([], 2026, "2026-08-11", {"1": 1.0})
    cov = C.coverage(s, 2026)
    assert cov["row_deltas"] == []
    assert cov["largest_drop"] is None


# ── WHICH players left, not how many (rule 9) ───────────────────────────────
#
# `row_drop_note` is a dashboard reading: "36 players lost, go look." I went and
# looked, by hand, and the answer was that all 37 sat at ADP 169+ and 19 of them
# were IDP this league cannot roster at any price. That is the source CONVERGING
# — MFL's CUTOFF is a percentage of drafts, so marginal players wash out as the
# sample grows — and it costs us nothing.
#
# But the count cannot tell those two cases apart. Thirty-six deep IDP washing
# out and three draftable WRs vanishing nine days before a draft produce the
# SAME NUMBER, and only one of them costs a pick. So the instrument answers the
# question instead of raising it.

def test_a_drop_INSIDE_the_draftable_range_is_NAMED():
    """THE CASE THIS EXISTS FOR. A player priced inside the last pick on Monday and
    gone on Tuesday has no ADP for a draft that is nine days away, and F5 reads the
    latest snapshot before the draft. MUTATION: report the count only — a draftable
    loss and a tail loss are the same integer, and the tail case is the common one,
    so the alarm gets ignored exactly when it starts being real."""
    a = {"p1": 10.0, "p2": 140.0, "p3": 400.0}
    s = C.append_snapshot([], 2026, "2026-08-12", a)
    s = C.append_snapshot(s, 2026, "2026-08-13", {"p1": 10.0})
    d = C.dropped_inside(s, 2026, last_pick=150)
    assert d["inside_ids"] == ["p2"], d
    assert d["inside_n"] == 1
    assert d["outside_n"] == 1, "the ADP-400 loss is the source converging, not a cost"


def test_a_TAIL_ONLY_drop_is_reported_as_COSTING_NOTHING():
    """The measured 2026-08-13 case. MUTATION: flag any drop — the instrument fires
    every day the source converges and is therefore never read."""
    a = {"p1": 10.0, "p2": 169.17, "p3": 400.0}
    s = C.append_snapshot([], 2026, "2026-08-12", a)
    s = C.append_snapshot(s, 2026, "2026-08-13", {"p1": 10.0})
    d = C.dropped_inside(s, 2026, last_pick=150)
    assert d["inside_ids"] == []
    assert d["inside_n"] == 0 and d["outside_n"] == 2
    assert d["verdict"] == "clean"


def test_WITHOUT_a_last_pick_it_REFUSES_TO_JUDGE_rather_than_guessing_150():
    """The league's boundary is the CONSUMER's, not the archive's — the same line I
    held in nflverse_weekly_store, where baking `last_scored_leg = 17` into the store
    would have made the archive league-specific forever. 10 teams x 15 rounds is 150
    TODAY; it is a config edit away from not being.

    MUTATION: default last_pick=150 — the archive silently encodes one league's
    settings and every verdict it gives a different league is wrong while looking
    exactly as authoritative."""
    s = C.append_snapshot([], 2026, "2026-08-12", {"p1": 10.0, "p2": 400.0})
    s = C.append_snapshot(s, 2026, "2026-08-13", {"p1": 10.0})
    d = C.dropped_inside(s, 2026)
    assert d["verdict"] == "unjudged"
    assert d["inside_ids"] is None, "no boundary means no verdict, not an empty one"
    assert "last_pick" in d["note"]


def test_ONE_SNAPSHOT_cannot_show_a_loss_and_says_so_rather_than_clean():
    """Rule 13f, again, and it is the dangerous direction here: a capture that ran
    once would report `clean` — a check that CANNOT fail reading as a check that
    PASSED. MUTATION: return verdict 'clean' when there is nothing to compare."""
    s = C.append_snapshot([], 2026, "2026-08-12", {"p1": 10.0})
    d = C.dropped_inside(s, 2026, last_pick=150)
    assert d["verdict"] == "unmeasured"
    assert d["inside_n"] is None


def test_a_player_who_RETURNS_is_not_counted_as_lost_on_the_LATEST_board():
    """A player can drop out and come back as the sample grows — that is what a
    percentage cutoff does at the margin. What matters for the draft is the LATEST
    board, so a round trip is not a standing loss. MUTATION: accumulate every
    pairwise disappearance — the count grows all preseason and never comes down,
    and by draft day it describes churn rather than the board we will draft off."""
    s = C.append_snapshot([], 2026, "2026-08-11", {"p1": 10.0, "p2": 140.0})
    s = C.append_snapshot(s, 2026, "2026-08-12", {"p1": 10.0})
    s = C.append_snapshot(s, 2026, "2026-08-13", {"p1": 10.0, "p2": 141.0})
    d = C.dropped_inside(s, 2026, last_pick=150)
    assert d["inside_ids"] == [], "he is on the board we will draft off"
    assert d["churn_inside_n"] == 1, "but the round trip is still visible"


# ── the draft's last pick, DERIVED, because dropped_inside refuses to guess ──

def LS(teams=10, rounds=15, slots=15, draft_rounds=3, declared=None):
    return {"settings": {"num_teams": declared if declared is not None else teams,
                         "draft_rounds": draft_rounds},
            "draft": {"settings": {"teams": teams, "rounds": rounds}},
            "owner_to_roster": {str(i): i for i in range(teams)},
            "roster_positions": ["BN"] * slots}


def test_last_pick_is_teams_times_rounds_and_NAMES_ITS_SOURCES():
    d = C.draft_last_pick(LS())
    assert d["last_pick"] == 150
    assert d["teams"] == 10 and d["rounds"] == 15
    assert "roster_positions" in d["note"] and "draft.settings" in d["note"]
    assert "owner_to_roster" in d["note"]


def test_draft_rounds_IS_NOT_THE_DRAFT_LENGTH():
    """THE FIELD-NAME TRAP, and it is live in our real config: `settings.draft_rounds`
    is 3 while the draft is 15 rounds — it tracks `max_keepers: 3`. It is exactly the
    name you reach for, it holds a plausible integer, and nothing about reading it
    raises an error.

    MUTATION: read `settings.draft_rounds` — last_pick becomes 30, and `dropped_inside`
    then judges 120 picks of real draftable board as OUT of range. Every draftable
    loss from pick 31 to 150 reports `clean`, in the instrument built to catch it."""
    d = C.draft_last_pick(LS(rounds=15, draft_rounds=3))
    assert d["last_pick"] == 150, "draft_rounds is the keeper count, not the length"


def test_DISAGREEING_team_counts_REFUSE_rather_than_picking_one():
    """Rule 11: two independent derivations, and a disagreement is a finding.
    MUTATION: take the first source — one of the two is wrong and nothing says which,
    so the boundary is quietly off by a whole round or more."""
    ls = LS()                      # 10 actual rosters
    ls["draft"]["settings"]["teams"] = 12
    d = C.draft_last_pick(ls)
    assert d["last_pick"] is None
    assert "10" in d["note"] and "12" in d["note"], d["note"]


def test_ROUNDS_disagreeing_with_the_roster_REFUSE_too():
    """15 roster slots and 14 rounds cannot both be right. MUTATION: trust
    draft.settings.rounds alone — the second derivation stops being a check."""
    d = C.draft_last_pick(LS(rounds=14, slots=15))
    assert d["last_pick"] is None
    assert "14" in d["note"] and "15" in d["note"]


def test_a_MISSING_config_yields_NO_BOUNDARY_not_a_default():
    """MUTATION: fall back to 150 — the number is right for this league today and
    would stay looking right for any league it is wrong for."""
    d = C.draft_last_pick({})
    assert d["last_pick"] is None
    assert "UNDERIVABLE" in d["note"]


def test_the_derived_boundary_FEEDS_dropped_inside():
    """Rule 14 — the consumer exists the day the writer does, and the whole point of
    deriving the boundary is that `dropped_inside` stops refusing to judge."""
    s = C.append_snapshot([], 2026, "2026-08-12", {"p1": 10.0, "p2": 149.0})
    s = C.append_snapshot(s, 2026, "2026-08-13", {"p1": 10.0})
    lp = C.draft_last_pick(LS())["last_pick"]
    assert C.dropped_inside(s, 2026, last_pick=lp)["inside_ids"] == ["p2"]


def test_num_teams_IS_NOT_THE_TEAM_COUNT():
    """THE SAME TRAP ONE FIELD OVER, and I walked into it — `test_settings_registry_truth`
    caught me reading `settings.num_teams` and the registry explained why not: it is a
    DECLARED TARGET, filed `ignored`, and `sleeper_import` reads the actual rosters
    because a declared target can disagree with how many rosters exist.

    A league sitting at 9 of a declared 10 would put the last pick at 150 when the
    draft is 135 — and the 15 phantom picks are the DEEPEST ones, exactly where the
    percentage cutoff drops players. `dropped_inside` would then report draftable
    losses that are not draftable, and the alarm gets muted for being wrong.

    MUTATION: read settings.num_teams — this passes on every league where the target
    happens to be met, which is nearly all of them, right up until it is not."""
    ls = LS(teams=9, declared=10)      # 9 rosters exist; the config still says 10
    d = C.draft_last_pick(ls)
    assert d["teams"] == 9, "count the rosters that exist, not the ones declared"
    assert d["last_pick"] == 9 * 15


# ── A KEPT PLAYER IS NOT A CROSSWALK FAILURE ────────────────────────────────
#
# THIS COST ME AN HOUR AND VERY NEARLY A FALSE REPORT TO A. Measuring the
# archive's usability I found 31 of MFL's top-150 unresolved, and among them
# Ja'Marr Chase at ADP 4.72, Derrick Henry at 54.91, Kenneth Walker III at
# 39.51. I searched the board's `players` list exhaustively — no name match, no
# id — reproduced it on a clean origin/main worktree, checked both active
# branches for a fix, and was assembling the route to A.
#
# They are KEEPERS. `kept_players` holds exactly those three. They are absent
# from the draftable list because they CANNOT BE DRAFTED, which is the board
# being right.
#
# The report could not tell me that. `unmatched_composition.by_why` explains
# only `team_unit_not_a_player`; every other miss lands in an undifferentiated
# `no_sleeper_match`, where "IDP this league cannot roster", "kept, so not
# draftable" and "genuinely missing from the board" are one number. Two of those
# three are correct behaviour and the third is an emergency, and at the TOP of
# the board — where keepers live — the benign case dominates.
#
# Same shape as the row-drop count: an instrument that raises a question it has
# the information to answer. It answers this one now.
#
# OPTIONAL AND ADDITIVE, ON PURPOSE. `board_vs_market.py` reads this report, and
# silently reclassifying misses would move its numbers without its author asking.
# Passing no `kept` reproduces today's output exactly.
#
# ⚠ CORRECTED 2026-08-14: these two comments said `board_vs_market.py` is A's. It
# is NOT — it carries `# TERRITORY: C` and the header rule in territory-check.sh
# is what decides ownership, not my memory of who wrote it. A wrong attribution
# in a comment is not harmless: it would have had me PARK a change to my own file
# and wait on a lane that does not own it.

KEPT = [{"player_id": "7564", "name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}]


def _board(*rows):
    return [dict(r) for r in rows]


def test_a_KEPT_player_is_classified_KEPT_not_a_crosswalk_miss():
    """MUTATION: leave him under `no_sleeper_match` — an elite keeper reads as a
    crosswalk failure, and I can testify it sends the reader hunting a board gap
    that does not exist."""
    key = {"1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}}
    board = _board({"player_id": "99", "name": "Chase Brown",
                    "position": "RB", "team": "CIN"})
    ids, rep = C.crosswalk_map(key, board, kept=KEPT)
    assert rep["kept_not_draftable"] == 1, rep
    assert [k["name"] for k in rep["kept_rows"]] == ["Ja'Marr Chase"]
    assert rep["no_sleeper_match_excluding_kept"] == 0


def test_a_GENUINE_miss_is_still_a_miss():
    """The other side, and the one that keeps the classifier honest. MUTATION: treat
    every miss as kept — the report can no longer find a real board gap at all, which
    is the failure the whole measurement exists to catch."""
    key = {"1": {"name": "Somebody Absent", "position": "WR", "team": "CIN"}}
    ids, rep = C.crosswalk_map(key, _board(
        {"player_id": "99", "name": "Chase Brown", "position": "RB", "team": "CIN"}),
        kept=KEPT)
    assert rep["kept_not_draftable"] == 0
    assert rep["no_sleeper_match_excluding_kept"] == 1


def test_WITHOUT_kept_the_report_is_UNCHANGED():
    """`board_vs_market.py` reads this report. MUTATION: classify anyway — its
    numbers move underneath it without its caller asking, which is a consumer
    contract breaking quietly rather than loudly."""
    key = {"1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}}
    board = _board({"player_id": "99", "name": "Chase Brown",
                    "position": "RB", "team": "CIN"})
    _, plain = C.crosswalk_map(key, board)
    _, withk = C.crosswalk_map(key, board, kept=KEPT)
    assert "kept_not_draftable" not in plain, "no kept list, no new keys"
    assert plain["crosswalk_rate"] == withk["crosswalk_rate"], (
        "the ORIGINAL rate must not move — only a new one is added beside it")


def test_the_DRAFTABLE_rate_excludes_kept_players_from_the_denominator():
    """`crosswalk_rate` answers "how much of the source can we decode". The question
    that decides whether the archive is usable is "how much of what we can actually
    DRAFT can we decode", and a keeper is not draftable by anyone.

    MUTATION: leave keepers in the denominator — the rate understates, and it
    understates MOST at the top of the board, because that is where keepers are."""
    key = {"1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
           "2": {"name": "Chase Brown", "position": "RB", "team": "CIN"}}
    board = _board({"player_id": "99", "name": "Chase Brown",
                    "position": "RB", "team": "CIN"})
    _, rep = C.crosswalk_map(key, board, kept=KEPT)
    assert rep["crosswalk_rate"] == 0.5, "1 of 2 decoded, unchanged"
    assert rep["crosswalk_rate_draftable"] == 1.0, "1 of 1 DRAFTABLE decoded"


def test_an_EMPTY_kept_list_still_reports_the_new_keys():
    """Rule 13f. A league with no keepers must say `kept_not_draftable: 0` — MEASURED
    zero — rather than omitting the key, which reads identically to not having looked.
    MUTATION: treat [] like None and skip the classification."""
    key = {"1": {"name": "Somebody Absent", "position": "WR", "team": "CIN"}}
    _, rep = C.crosswalk_map(key, _board(
        {"player_id": "99", "name": "Chase Brown", "position": "RB", "team": "CIN"}),
        kept=[])
    assert rep["kept_not_draftable"] == 0
    assert rep["no_sleeper_match_excluding_kept"] == 1


# ── AND A POSITION THIS LEAGUE CANNOT ROSTER IS NOT A MISS EITHER ───────────
#
# Adding the keeper class exposed an overclaim in my own naming. With keepers
# excluded, `crosswalk_rate_draftable` came out 0.6119 against a raw 0.6093 —
# three players out of 709. The name says "draftable" and handled ONE of the two
# reasons a player is not draftable.
#
# The other reason dominates: MFL's board carries DE/DT/LB/CB/S and team-kicker
# units, and this league rosters QB/RB/WR/TE/K/DEF. Inside pick 150 the
# arithmetic is 170 priced - 3 kept - 28 unrosterable = 139, and 139 decode.
# The number that decides whether the archive is usable is 100%, and my report
# was about to say 61%.

def RP(*extra):
    return {"roster_positions": ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX",
                                 "K", "DEF"] + ["BN"] * 6 + list(extra)}


def test_rostered_positions_STRIPS_FLEX_AND_BN():
    """FLEX and BN are slots, not positions — no player has position "BN".
    MUTATION: return roster_positions verbatim; the set gains two members that
    match nobody, which looks harmless and makes every later assertion about the
    set false."""
    assert C.rostered_positions(RP()) == {"QB", "RB", "WR", "TE", "K", "DEF"}


def test_rostered_positions_SPEAKS_MFLS_VOCABULARY():
    """THE ONE THAT WOULD HAVE BITTEN. MFL says `PK` for a kicker and `Def` for a
    team defense; our roster says `K` and `DEF`. MUTATION: compare raw strings —
    every kicker and every team defense on MFL's board is classified "not
    rostered", which silently removes 19 kickers and 24 defenses from the
    draftable population AND RAISES the rate, so the instrument improves its own
    score by dropping the players it cannot explain."""
    rp = C.rostered_positions(RP())
    assert C.position_is_rostered("PK", rp) is True, "MFL's kicker is our K"
    assert C.position_is_rostered("Def", rp) is True, "MFL's Def is our DEF"
    assert C.position_is_rostered("LB", rp) is False
    assert C.position_is_rostered("TMPK", rp) is False, "a team kicker unit is not our K"


def test_an_UNROSTERED_position_is_classified_not_counted_as_a_miss():
    """MUTATION: leave IDP in the miss bucket — the draftable rate reads 61% when
    the answer is 100%, and that rate is what decides whether the archive is
    usable at all."""
    key = {"1": {"name": "Some Linebacker", "position": "LB", "team": "CIN"},
           "2": {"name": "Chase Brown", "position": "RB", "team": "CIN"}}
    board = _board({"player_id": "99", "name": "Chase Brown",
                    "position": "RB", "team": "CIN"})
    _, rep = C.crosswalk_map(key, board, positions=C.rostered_positions(RP()))
    assert rep["position_not_rostered"] == 1
    assert rep["crosswalk_rate"] == 0.5, "the original rate does not move"
    assert rep["crosswalk_rate_draftable"] == 1.0, "1 of 1 rosterable decoded"


def test_a_ROSTERED_position_that_misses_is_STILL_A_MISS():
    """The honesty check. MUTATION: classify every miss as unrostered — the report
    can no longer find a genuine board gap, which is the emergency it exists for."""
    key = {"1": {"name": "Absent Receiver", "position": "WR", "team": "CIN"}}
    _, rep = C.crosswalk_map(key, _board(
        {"player_id": "99", "name": "Chase Brown", "position": "RB", "team": "CIN"}),
        positions=C.rostered_positions(RP()))
    assert rep["position_not_rostered"] == 0
    assert rep["undraftable_excluded"] == 0
    assert rep["crosswalk_rate_draftable"] == 0.0, "a real gap must show as a real gap"


def test_kept_and_unrostered_are_counted_ONCE_not_twice():
    """A player in BOTH lists must be subtracted once. A denominator smaller than
    the truth inflates the rate, and in the limit pushes it past 1.0, where it reads
    as better than perfect rather than as arithmetic that has gone wrong.

    MY FIRST VERSION OF THIS TEST WAS VACUOUS AND THE MUTATION SURVIVED IT. The
    fixture used a kept WR — rostered, so in one list only — and the overlap the
    name promises was never constructed. Double-counting changed nothing and the
    assertion passed. So the keeper here is a LINEBACKER: kept AND at a position
    this league cannot roster, which is the only shape that can catch it."""
    kept_lb = [{"player_id": "5", "name": "Kept Linebacker",
                "position": "LB", "team": "CIN"}]
    key = {"1": {"name": "Kept Linebacker", "position": "LB", "team": "CIN"},
           "2": {"name": "Chase Brown", "position": "RB", "team": "CIN"}}
    board = _board({"player_id": "99", "name": "Chase Brown",
                    "position": "RB", "team": "CIN"})
    _, rep = C.crosswalk_map(key, board, kept=kept_lb,
                             positions=C.rostered_positions(RP()))
    assert rep["kept_not_draftable"] == 1 and rep["position_not_rostered"] == 1, (
        "the fixture must put him in BOTH lists or this test proves nothing")
    assert rep["undraftable_excluded"] == 1, "both lists, ONE exclusion"
    assert rep["crosswalk_rate_draftable"] == 1.0


def test_the_POSITION_HELPERS_work_without_crosswalk_map_running_first(tmp_path):
    """GREEN BY TEST ORDER IS NOT GREEN. `rostered_positions` imports `adp`, which
    lives in `draft/`, and the sys.path insert that makes that possible lived inside
    `crosswalk_map`. Every test above passed because some earlier test had already
    called `crosswalk_map` and sys.path is process-global — and the function raised
    ModuleNotFoundError the first time it was called from a script, which is exactly
    where an ingest helper gets called.

    A SUBPROCESS, because the pollution cannot be undone inside this one: by the
    time any assertion runs here, `draft/` is already on the path.

    MUTATION: move the path insert back inside `crosswalk_map` — this fails and
    nothing else does."""
    import subprocess, sys, textwrap
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent          # draft/
    src = textwrap.dedent('''
        import sys
        sys.path.insert(0, %r)
        import external_adp_capture as E
        print(sorted(E.rostered_positions({"roster_positions": ["QB", "FLEX", "K"]})))
        print(E.position_is_rostered("PK", {"K"}))
    ''') % str(root / "backtest")
    r = subprocess.run([sys.executable, "-c", src], capture_output=True, text=True)
    assert r.returncode == 0, (
        "the helpers must import on their own:\n%s" % r.stderr[-600:])
    assert r.stdout.split("\n")[0] == "['K', 'QB']"
    assert r.stdout.split("\n")[1] == "True"


# ── WHICH SNAPSHOT WILL OUR OWN DRAFT ACTUALLY USE ──────────────────────────
#
# INGEST-PLAN.md:2453 records "board() for draft 2026-08-22 -> the 08-12
# snapshot, 708 rows". It was true when written and it is wrong now — the
# archive has since gained 08-13, and 08-13 has 672 rows. A fact copied into
# prose goes stale silently; rule 9 says that is a mechanism implemented as a
# note.
#
# AND IT SURFACES A DEADLINE NOBODY HAS STATED. F5 takes the latest snapshot
# STRICTLY BEFORE the draft, so a capture taken on draft morning is worth
# nothing to it. The last capture that can still matter is 2026-08-21 — one day
# earlier than everyone has been assuming, on an archive where a lost day cannot
# be refetched.
#
# THE SELECTION IS NOT RE-DERIVED HERE. `ExternalAsOfStore.snapshot_date()`
# already implements strictly-before and this module's own header says the rule
# stays in ONE place. A second `<` written here is the multi-derivation defect
# that has bitten this project repeatedly — and it would drift silently, because
# both copies would keep returning valid-looking dates.

def _series3():
    s = C.append_snapshot([], 2026, "2026-08-20", {"p": 1.0})
    s = C.append_snapshot(s, 2026, "2026-08-21", {"p": 1.0, "q": 2.0})
    return C.append_snapshot(s, 2026, "2026-08-22", {"p": 1.0, "q": 2.0, "r": 3.0})


def test_a_snapshot_taken_ON_DRAFT_DAY_IS_NOT_THE_ONE_F5_USES():
    """THE DEADLINE THIS EXISTS TO SURFACE. Strictly before, not `<=`: a board
    stamped the morning of the draft may have seen picks already in.

    MUTATION: use `<=` — the check reports ready off a snapshot F5 will refuse,
    and the one day that actually mattered is spent believing it is covered."""
    r = C.f5_readiness(_series3(), 2026, draft_date="2026-08-22")
    assert r["snapshot_date"] == "2026-08-21", r
    assert r["rows"] == 2, "and it is that snapshot's board, not draft morning's"
    assert r["last_useful_capture"] == "2026-08-21"


def test_it_says_HOW_MANY_DAYS_ARE_LEFT_to_capture_something_that_matters():
    """MUTATION: count to the draft date — every statement of the remaining window
    is one day too generous, on days that cannot be bought back."""
    r = C.f5_readiness(_series3(), 2026, draft_date="2026-08-22",
                       today="2026-08-13")
    assert r["days_until_last_useful"] == 8, "08-13 -> 08-21, not 9 to the draft"
    assert r["days_until_draft"] == 9


def test_NO_QUALIFYING_SNAPSHOT_is_EXCLUDED_not_ready():
    """F4/F5 attrition, and it must not read as readiness. MUTATION: return the
    nearest snapshot anyway — the replay silently uses a board from after the
    draft it is predicting, which is the leak this whole archive is shaped to
    prevent."""
    s = C.append_snapshot([], 2026, "2026-08-25", {"p": 1.0})
    r = C.f5_readiness(s, 2026, draft_date="2026-08-22")
    assert r["verdict"] == "excluded"
    assert r["snapshot_date"] is None
    assert "strictly before" in r["note"].lower()


def test_the_LEAD_is_reported_so_a_stale_board_cannot_pass_as_a_fresh_one():
    """A qualifying snapshot four days old still qualifies. It is also four days
    of market movement we did not capture, and `verdict: ready` alone hides that.
    MUTATION: report readiness without the lead — a capture that died a week
    before the draft reports exactly like one that ran this morning.

    `today` IS PASSED, and that is the correction rather than a detail. This test
    first asserted `stale is True` with no clock, which the implementation then
    satisfied by keying staleness off the draft — and that made the flag fire every
    day of a perfectly healthy capture. Staleness needs a clock; without one the
    honest answer is None, and the test that demanded otherwise was the reason the
    implementation was wrong."""
    s = C.append_snapshot([], 2026, "2026-08-17", {"p": 1.0})
    r = C.f5_readiness(s, 2026, draft_date="2026-08-22", today="2026-08-22")
    assert r["verdict"] == "ready"
    assert r["lead_days"] == 5, "08-17 board used for an 08-22 draft"
    assert r["age_days"] == 5 and r["stale"] is True


def test_WITHOUT_a_draft_date_it_REFUSES_to_judge():
    """Same line held for `last_pick`: the draft's date belongs to the league, not
    to the archive, and `draft.start_time` is null in our own Sleeper config today.
    MUTATION: default to 2026-08-22 — the archive hardcodes one league's calendar
    and every answer it gives another one is wrong while looking authoritative."""
    r = C.f5_readiness(_series3(), 2026, draft_date=None)
    assert r["verdict"] == "unjudged"
    assert r["snapshot_date"] is None and "draft_date" in r["note"]


def test_STALENESS_IS_MEASURED_AGAINST_TODAY_not_against_the_draft():
    """AN ALARM THAT IS ON BY DEFAULT IS OFF, and my first cut of `f5_readiness`
    was one. It set `stale` from `lead_days` — draft minus snapshot — so on
    2026-08-13, with a snapshot captured THAT MORNING and nine days of captures
    still to come, it reported `stale: True`. It would have said so every day
    until the week of the draft and then gone quiet, which is precisely backwards.

    `lead_days` is a projection until the draft arrives: what F5 would see if the
    draft were held on today's archive. Whether we are CAPTURING is a question
    about today.

    MUTATION: key `stale` off lead_days — a healthy daily capture reports stale
    for eight consecutive days and the flag is worthless by the time it is true."""
    s = C.append_snapshot([], 2026, "2026-08-13", {"p": 1.0})
    r = C.f5_readiness(s, 2026, draft_date="2026-08-22", today="2026-08-13")
    assert r["lead_days"] == 9, "at the draft, this board would be 9 days old"
    assert r["age_days"] == 0, "but it was captured today"
    assert r["stale"] is False, "a capture that ran this morning is not stale"


def test_a_capture_that_DIED_is_stale_even_with_the_draft_far_off():
    """The other side. MUTATION: never flag it — the archive quietly stops and the
    only signal is a number nobody is diffing day to day."""
    s = C.append_snapshot([], 2026, "2026-08-08", {"p": 1.0})
    r = C.f5_readiness(s, 2026, draft_date="2026-08-22", today="2026-08-13")
    assert r["age_days"] == 5 and r["stale"] is True
    assert "5 day" in r["note"]


def test_with_NO_today_staleness_is_UNKNOWN_rather_than_False():
    """Rule 13f. Without a clock the question cannot be asked, and `False` would
    read as "checked, and fresh". MUTATION: default stale to False."""
    s = C.append_snapshot([], 2026, "2026-08-13", {"p": 1.0})
    r = C.f5_readiness(s, 2026, draft_date="2026-08-22")
    assert r["age_days"] is None and r["stale"] is None


# ── THE WIRING SEAM, which is the one place a day's SPREAD can vanish ───────
#
# `dispersion_of` is pure and tested. `fetch_mfl` needs egress and is honestly
# `pragma: no cover`. `capture()` is the GLUE between them and was uncovered for
# the same reason — which puts the untested part exactly where the two tested
# parts meet.
#
# That matters tomorrow specifically. The dispersion change landed today, so
# 2026-08-14 is the FIRST capture that can carry a spread; the three snapshots
# we hold have none because the parser was discarding it. If `capture` drops the
# argument, the run still goes green, the row count is still right, the archive
# still grows — and the spread is silently gone for another perishable day.
#
# The fetch is INJECTED rather than mocked away wholesale: everything downstream
# of it is the real code path, so this exercises append_snapshot, save and load
# as they will actually run at 11:20 UTC.

def test_capture_THREADS_DISPERSION_from_the_fetch_all_the_way_to_DISK(tmp_path,
                                                                       monkeypatch):
    """MUTATION: drop `dispersion=dispersion` from the append_snapshot call. The
    run stays green, the row count stays right, the archive still grows by a day —
    and the spread is gone, on a day that cannot be refetched."""
    p = tmp_path / "arch.json"
    disp = {"1": {"min_pick": 2.0, "max_pick": 9.0, "sel_pct": 88.0, "drafts": 120}}
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5, "2": 9.0}, {"1": {"name": "A B"}},
                                      120, "mfl adp", disp))
    C.capture(2026, "2026-08-14", path=str(p))

    got = json.loads(p.read_text())
    snap = [s for s in got["series"] if s["observed_at"] == "2026-08-14"][0]
    assert snap["dispersion"] == {"1": {"min_pick": 2.0, "max_pick": 9.0,
                                        "sel_pct": 88.0, "drafts": 120}}, snap


def test_a_day_MFL_PUBLISHES_NO_SPREAD_stores_None_not_an_empty_measurement():
    """`None`, not `{}`. The two days captured before this landed genuinely have no
    dispersion because the parser was discarding it, and that is ABSENCE — an empty
    dict on disk reads as "we looked and every player had no spread".

    MUTATION: store `{}` — `dispersion_rows: 0` then means the same thing whether
    MFL stopped publishing spreads or we stopped reading them."""
    s = C.append_snapshot([], 2026, "2026-08-14", {"1": 4.5}, dispersion=None)
    assert s[0]["dispersion"] is None
    s2 = C.append_snapshot([], 2026, "2026-08-14", {"1": 4.5}, dispersion={})
    assert s2[0]["dispersion"] is None, "empty is absence here, not a measurement"


def test_capture_REFUSES_a_zero_row_day_before_it_can_reach_the_archive(tmp_path,
                                                                       monkeypatch):
    """Already the documented behaviour; pinned because the injection now makes it
    reachable. MUTATION: write it anyway — a dated empty board is indistinguishable
    from a real one downstream, and `board()` hands a replay an empty market and
    calls it frozen."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl", lambda year: ({}, {}, 0, "mfl down", {}))
    try:
        C.capture(2026, "2026-08-14", path=str(p))
    except RuntimeError as e:
        assert "zero rows" in str(e).lower()
    else:
        raise AssertionError("an empty fetch must not reach the archive")
    assert not p.exists(), "and it must not have written a file either"


def test_a_FAILING_REPORT_CANNOT_DESTROY_THE_DAY(tmp_path, monkeypatch, capsys):
    """THE LESSON THIS FILE ALREADY LEARNED, ONE LAYER DOWN.

    `external-adp-capture.yml` carries it in capitals at the board-pin step: THE
    PIN MUST NOT BE ABLE TO KILL THE SNAPSHOT — a failure in the recoverable thing
    was destroying the unrecoverable one. Inside `capture()` the same shape was
    live and unnoticed: `save()` runs, then a summary line prints
    `len(dispersion)`. Hand that a None and it raises AFTER the archive is written
    but BEFORE the function returns, so the step fails — and the commit step is
    gated on `steps.cap.outcome == 'success'`, so the day sits on the runner's
    disk and never reaches git. A cosmetic print, deleting a perishable day.

    Not reachable today: `dispersion_of` always returns a dict. It is one edit to
    `fetch_mfl` away from being reachable, and `fetch_mfl` is `pragma: no cover`,
    so that edit would be made where nothing is watching.

    MUTATION: report before saving, or let the report raise — the archive loses
    the day and the run is red for a reason that has nothing to do with the data."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5}, {"1": {"name": "A B"}},
                                      120, "mfl adp", None))   # None, not {}
    rep = C.capture(2026, "2026-08-14", path=str(p))

    assert p.exists(), "the day must be on disk whatever the report did"
    got = json.loads(p.read_text())
    assert [s["observed_at"] for s in got["series"]] == ["2026-08-14"]
    assert rep["snapshots"] == 1, "and coverage must still come back"
    assert "REPORT FAILED" in capsys.readouterr().out, (
        "and it must SAY the report broke — silently swallowing it would hide a "
        "real shape change in what MFL returns")


# ── DID THE SPREAD ARRIVE, AND IF NOT, WHOSE FAULT IS IT ────────────────────
#
# 2026-08-14 is the first capture that can carry dispersion. The keys —
# `minPick`, `maxPick`, `draftSelPct` — are read from the SAME response dict as
# `averagePick`, which provably works, so the shape is right. What is untested
# is whether MFL publishes those fields on this endpoint at all. If it does not,
# `dispersion_of` omits every player (it requires at least one bound), the run
# goes GREEN, and the log says `dispersion_rows: 0`.
#
# A COUNT OF ZERO HAS TWO CAUSES AND THEY POINT IN OPPOSITE DIRECTIONS. Zero on
# the first attempt is evidence about OUR PARSER. Zero after weeks of non-zero
# is evidence about THE FEED. A check that cannot separate them tells you
# nothing on the only morning it matters, and the spread is perishable exactly
# like the mean.

def test_ZERO_ON_THE_FIRST_ATTEMPT_blames_our_parser_by_name():
    """MUTATION: report it as quiet or as `stopped` — the first failed run reads
    like a success, or sends the reader to MFL's release notes instead of to the
    four key names in `mfl_adp.parse` that have never once matched anything."""
    s = C.append_snapshot([], 2026, "2026-08-14", {"1": 4.5}, dispersion=None)
    h = C.dispersion_health(s, 2026)
    assert h["state"] == "never_captured"
    assert "parse" in h["note"] and "minPick" in h["note"], h["note"]


def test_days_BEFORE_the_capture_could_carry_it_are_NOT_counted_against_us():
    """The three snapshots we already hold have no dispersion because the parser
    was discarding it, which is a fact about our history and not a failure to
    diagnose. Judging them would make this alarm fire on its own first run, and
    an alarm that is red on day one is muted by day two.

    MUTATION: judge every snapshot — the check screams that the parser is broken
    about days on which the parser provably could not have captured anything."""
    s = C.append_snapshot([], 2026, "2026-08-11", {"1": 4.5}, dispersion=None)
    s = C.append_snapshot(s, 2026, "2026-08-12", {"1": 4.5}, dispersion=None)
    h = C.dispersion_health(s, 2026)
    assert h["state"] == "unmeasured", h
    assert h["judged_snapshots"] == 0
    assert C.DISPERSION_SINCE in h["note"]


def test_PRESENT_THEN_ABSENT_blames_the_feed_not_the_parser():
    """The distinction that decides where to look. MUTATION: collapse it into
    `never_captured` — the reader goes and re-reads a parser that has been working
    for a fortnight."""
    s = C.append_snapshot([], 2026, "2026-08-14", {"1": 4.5},
                          dispersion={"1": {"min_pick": 2, "max_pick": 9}})
    s = C.append_snapshot(s, 2026, "2026-08-15", {"1": 4.5}, dispersion=None)
    h = C.dispersion_health(s, 2026)
    assert h["state"] == "stopped"
    assert "MFL" in h["note"] and "2026-08-14" in h["note"], h["note"]


def test_PARTIAL_coverage_is_a_FRACTION_not_a_boolean():
    """5 players with a spread out of 672 is not "dispersion is working".
    MUTATION: report present/absent — a near-total collapse in coverage reads
    exactly like a healthy day, which is the `crosswalk_rate` mistake again."""
    s = C.append_snapshot([], 2026, "2026-08-14", {"1": 4.5, "2": 9.0, "3": 12.0},
                          dispersion={"1": {"min_pick": 2, "max_pick": 9}})
    h = C.dispersion_health(s, 2026)
    assert h["state"] == "present"
    assert h["rows"] == 1 and h["adp_rows"] == 3
    assert abs(h["coverage"] - 1 / 3) < 1e-9


def test_NO_SNAPSHOTS_is_unmeasured_not_a_verdict_about_anything():
    """Rule 13f. MUTATION: return `never_captured` for an empty archive — a check
    that has looked at nothing reports a diagnosis about our code."""
    h = C.dispersion_health([], 2026)
    assert h["state"] == "unmeasured" and h["rows"] is None


# ── TURNING MFL's min/max INTO A SPREAD — the reader for tomorrow's data ────
#
# A's item #1: 94.6% of the board's `adp_sd` sits on two values — 1,418 players
# at exactly 30.0 and 246 at exactly 15.0, 71 distinct values across 1,759
# players. My answer was to capture MFL's real dispersion. CAPTURING IS NOT
# FIXING: the spread lands tomorrow and nothing reads it, which is rule 14 on my
# own newest work.
#
# The estimator is the range one — sd ~= (max - min) / d_n, d_n the expected
# range of n standard normals — because min/max is what MFL publishes. It is
# crude and its weaknesses are stated in the module rather than buried: a single
# outlier drives it entirely, and for a rarely-selected player the observed
# range is truncated by the draft ending, so the estimate is a LOWER bound.

def test_the_spread_is_estimated_from_the_RANGE_and_the_SELECTION_COUNT():
    """n = 5 selections, picks spanning 10..20. d_5 = 2.326, so sd ~= 10/2.326."""
    r = C.spread_from_dispersion({"min_pick": 10, "max_pick": 20,
                                  "sel_pct": 100.0, "drafts": 5})
    assert r["status"] == "measured"
    assert abs(r["sd"] - 10 / 2.326) < 0.05, r
    assert r["n"] == 5


def test_n_IS_THE_SELECTION_COUNT_not_the_number_of_drafts_run():
    """THE ONE THAT WOULD QUIETLY RUIN IT. MFL's min/max are over the drafts the
    player was SELECTED in, not over every draft in the pool. A player taken in 7
    of 125 drafts has a range over SEVEN observations; charging him d_125 instead
    of d_7 divides by 5.1 rather than 2.7 and halves every deep player's spread —
    reintroducing exactly the flatness this exists to cure, while looking measured.

    MUTATION: take n from total_drafts."""
    row = {"min_pick": 100, "max_pick": 160, "sel_pct": 5.6, "drafts": 7}
    r = C.spread_from_dispersion(row, total_drafts=125)
    assert r["n"] == 7, "seven selections, not 125 drafts"
    assert abs(r["sd"] - 60 / 2.704) < 0.1, r


def test_a_SINGLE_selection_has_no_spread_and_says_so():
    """Range is 0 with one observation. Returning sd 0.0 would assert the market is
    CERTAIN about a player it has seen once — the most confident number on the
    board attached to the least evidence. Rule 13f.

    MUTATION: return 0.0 — and the flat board gains a third spike, at zero."""
    r = C.spread_from_dispersion({"min_pick": 44, "max_pick": 44,
                                  "sel_pct": 0.8, "drafts": 1})
    assert r["sd"] is None
    assert r["status"] == "unmeasurable" and "one" in r["note"].lower()


def test_MISSING_BOUNDS_are_absent_not_zero():
    """MUTATION: treat a missing bound as 0 — the range becomes the ADP itself and
    every player MFL declined to describe gets a huge, invented spread."""
    r = C.spread_from_dispersion({"min_pick": None, "max_pick": None,
                                  "sel_pct": 3.0, "drafts": 4})
    assert r["sd"] is None and r["status"] == "absent"


def test_a_RARELY_SELECTED_player_carries_a_TRUNCATION_caveat():
    """He is observed only where he was picked; the drafts that would have taken him
    later simply ended. So the observed range is cut and the sd is a LOWER bound —
    and it must say so, or a small number reads as market agreement.

    MUTATION: drop the caveat — the deepest, least-known players report the
    tightest spreads, which is the inversion this whole exercise is about."""
    r = C.spread_from_dispersion({"min_pick": 150, "max_pick": 170,
                                  "sel_pct": 4.0, "drafts": 5})
    assert r["status"] == "measured"
    assert r["truncated"] is True
    assert "lower bound" in r["note"].lower()
    full = C.spread_from_dispersion({"min_pick": 10, "max_pick": 30,
                                     "sel_pct": 96.0, "drafts": 120})
    assert full["truncated"] is False and full["note"] is None


def test_THE_WHOLE_POINT_distinct_players_get_DISTINCT_spreads():
    """The board today: 1,418 players at exactly 30.0, 246 at exactly 15.0, 71
    distinct values over 1,759 players. An estimator that collapses is no better
    than the clamp it replaces.

    MUTATION: return a constant, or round to the nearest 5 — the assertion above
    still passes on any single row and the flatness comes straight back."""
    rows = [{"min_pick": 1, "max_pick": 3, "sel_pct": 100.0, "drafts": 120},
            {"min_pick": 8, "max_pick": 30, "sel_pct": 98.0, "drafts": 118},
            {"min_pick": 40, "max_pick": 95, "sel_pct": 70.0, "drafts": 88},
            {"min_pick": 100, "max_pick": 190, "sel_pct": 30.0, "drafts": 38},
            {"min_pick": 150, "max_pick": 165, "sel_pct": 6.0, "drafts": 8}]
    sds = [C.spread_from_dispersion(r)["sd"] for r in rows]
    assert all(s is not None for s in sds)
    assert len(set(round(s, 6) for s in sds)) == 5, sds
    assert sds == sorted(sds)[:0] + sds, "no ordering claim, just distinctness"


def test_spread_summary_ANSWERS_THE_FLATNESS_QUESTION_on_a_whole_day():
    """The claim this exists to test is "does a real spread beat the clamp", and
    that is a question about a DAY, not a player. The board today has 71 distinct
    `adp_sd` values across 1,759 players with 94.6% on two of them; a summary that
    cannot count distinct values cannot say whether tomorrow is any better.

    MUTATION: report only a mean — a distribution collapsed onto one value has a
    perfectly healthy mean, which is how the clamp survived this long."""
    disp = {"a": {"min_pick": 1, "max_pick": 3, "sel_pct": 100.0, "drafts": 120},
            "b": {"min_pick": 8, "max_pick": 30, "sel_pct": 98.0, "drafts": 118},
            "c": {"min_pick": 150, "max_pick": 165, "sel_pct": 6.0, "drafts": 8},
            "d": {"min_pick": 44, "max_pick": 44, "sel_pct": 0.8, "drafts": 1},
            "e": {"min_pick": None, "max_pick": None, "sel_pct": 2.0, "drafts": 4}}
    s = C.spread_summary(disp)
    assert s["measured"] == 3 and s["unmeasurable"] == 1 and s["absent"] == 1
    assert s["distinct"] == 3, "three measured players, three different spreads"
    assert s["truncated"] == 1, "only the 6%-selected one is a lower bound"
    assert s["median_sd"] is not None


def test_spread_summary_of_NOTHING_is_unmeasured_not_a_flat_verdict():
    """Rule 13f, and the case that arrives if MFL publishes no bounds at all:
    zero measured players is not "the spread is flat". MUTATION: report
    distinct 0 with no status — which reads as a measured collapse."""
    s = C.spread_summary({})
    assert s["measured"] == 0 and s["distinct"] is None and s["median_sd"] is None
    assert s["status"] == "unmeasured"


# ── INTEGRITY, CHECKED BEFORE THE WRITE ────────────────────────────────────
#
# The archive is APPEND-ONLY and its days are UNREFETCHABLE. A corrupt snapshot
# is therefore permanent: there is no provider to re-ask, so "notice it later and
# fix it" is not available the way it is for a regenerable artifact.
#
# I audited the three days we hold by hand and they are consistent. That is worth
# exactly nothing tomorrow — a check run by hand is a check that stops being run
# (rule 9). So it runs at WRITE TIME and refuses, the same shape as the existing
# zero-row refusal, and again in CI against the committed file.

def _snap(day, rows, **kw):
    s = {"year": "2026", "observed_at": day, "rows": rows,
         "row_count": len(rows), "total_drafts": 100}
    s.update(kw)
    return s


def test_a_ROW_COUNT_THAT_DISAGREES_WITH_THE_ROWS_is_fatal():
    """Not cosmetic: `coverage`, `dropped_inside` and the daily row-delta alarm all
    read `row_count`, so a disagreement makes every one of them describe a board
    that was never captured. MUTATION: compare nothing — the archive keeps a
    permanent record whose own summary contradicts its contents."""
    a = {"series": [_snap("2026-08-14", {"1": 4.0}, row_count=99)], "players": {"1": {}}}
    r = C.integrity(a)
    assert r["ok"] is False
    assert any(f["kind"] == "row_count_mismatch" for f in r["fatal"]), r


def test_a_DUPLICATE_DAY_is_fatal():
    """Two boards for one date and `board()` silently takes whichever sorts first.
    MUTATION: allow it — F5 picks a snapshot by date and would have two to choose
    from, deterministically wrong rather than loudly wrong."""
    a = {"series": [_snap("2026-08-14", {"1": 4.0}), _snap("2026-08-14", {"1": 5.0})],
         "players": {"1": {}}}
    assert any(f["kind"] == "duplicate_day" for f in C.integrity(a)["fatal"])


def test_a_NON_NUMERIC_OR_NEGATIVE_adp_is_fatal():
    """A pick number is positive by construction. MUTATION: accept it — the value
    flows into every band cut and every spread, and nothing downstream type-checks
    a number it was promised."""
    a = {"series": [_snap("2026-08-14", {"1": 0.0, "2": -3.0})], "players": {"1": {}, "2": {}}}
    kinds = [f["kind"] for f in C.integrity(a)["fatal"]]
    assert "bad_adp" in kinds


def test_a_DISPERSION_ROW_FOR_A_PLAYER_NOT_ON_THE_BOARD_is_fatal():
    """A spread for a player the day did not price is a join that went wrong.
    MUTATION: ignore it — the spread summary counts players the board never had."""
    a = {"series": [_snap("2026-08-14", {"1": 4.0},
                          dispersion={"9": {"min_pick": 1, "max_pick": 2}})],
         "players": {"1": {}}}
    assert any(f["kind"] == "dispersion_orphan" for f in C.integrity(a)["fatal"])


def test_an_ID_THE_DECODE_KEY_CANNOT_RESOLVE_is_REPORTED_and_NOT_fatal():
    """The one that must NOT be fatal. MFL can price a player its own players
    export omits; that is a fact about the feed, and refusing the day would throw
    away a whole board — unrefetchable — over one unresolvable row.

    MUTATION: make it fatal — the capture starts discarding real days to protect a
    lookup, which is the alarm destroying what it watches, again."""
    a = {"series": [_snap("2026-08-14", {"1": 4.0, "2": 9.0})], "players": {"1": {}}}
    r = C.integrity(a)
    assert r["ok"] is True, "an unresolvable id must not fail the archive"
    assert any(f["kind"] == "undecodable_id" for f in r["reported"])


def test_an_EMPTY_ARCHIVE_is_UNMEASURED_not_ok():
    """Rule 13f. MUTATION: return ok=True for an empty archive — 'nothing to check'
    reports as 'checked and clean', on the exact run where the file failed to load."""
    r = C.integrity({"series": [], "players": {}})
    assert r["ok"] is None and r["status"] == "unmeasured"


def test_the_COMMITTED_ARCHIVE_IS_CLEAN():
    """Standing check against the real file, so corruption fails CI rather than
    waiting for someone to look. MUTATION: check series[0] only."""
    import copy as _copy
    import json as _json
    from pathlib import Path
    p = Path(__file__).resolve().parent.parent / "data" / "external_adp_series.json"
    real = _json.loads(p.read_text())

    # PLANT FIRST. Asserting only that the real archive is clean passes for a
    # checker that can never find anything — the gate proved exactly that against
    # this test, twice, before this plant existed.
    # ONE PLANT PER FATAL KIND. My first plant only broke `row_count`, so
    # disabling the `bad_adp` detector still passed — the test proved ONE of four
    # detectors fires and read as though it proved the checker. Each kind is
    # planted into a real archive shape and required to be found by name.
    def _sick(fn):
        d = _copy.deepcopy(real)
        fn(d["series"][0])
        return {f["kind"] for f in C.integrity(d)["fatal"]}

    def _dup(d):
        d["series"].insert(0, _copy.deepcopy(d["series"][0]))

    assert "row_count_mismatch" in _sick(
        lambda s: s.__setitem__("row_count", 999999))
    assert "bad_adp" in _sick(
        lambda s: s["rows"].__setitem__(next(iter(s["rows"])), -1.0))
    assert "dispersion_orphan" in _sick(
        lambda s: s.__setitem__("dispersion", {"no_such_player": {"min_pick": 1}}))
    planted = _copy.deepcopy(real)
    _dup(planted)
    assert "duplicate_day" in {f["kind"] for f in C.integrity(planted)["fatal"]}, (
        "integrity cannot FIND a duplicated day in a real archive shape, so the "
        "assertion below is satisfied by a check that never fires")

    r = C.integrity(real)
    assert r["ok"] is True, r["fatal"]
    assert r["snapshots"] >= 3, "and it must actually have looked at every day"


def test_capture_REFUSES_TO_WRITE_a_corrupt_archive(tmp_path, monkeypatch):
    """The refusal has to be at the WRITE, not in a report afterwards. The days are
    unrefetchable, so an archive that has already been written corrupt is
    permanently corrupt — there is no second chance to be careful.

    MUTATION: check integrity after `save()` — the corrupt day is on disk and in
    git before anyone sees the complaint, which is the whole difference."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": -4.5}, {"1": {"name": "A B"}}, 10, "n", {}))
    try:
        C.capture(2026, "2026-08-14", path=str(p))
    except RuntimeError as e:
        assert "integrity" in str(e).lower() and "bad_adp" in str(e)
    else:
        raise AssertionError("a corrupt snapshot must not reach the archive")
    assert not p.exists(), "and it must not have written the file either"


def test_capture_still_writes_when_an_id_is_merely_UNDECODABLE(tmp_path, monkeypatch):
    """The other side, and the one that matters more: a day must NOT be discarded
    over a feed quirk. MUTATION: make undecodable ids fatal — the capture starts
    throwing away real unrefetchable boards to protect a lookup."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5, "2": 9.0}, {"1": {"name": "A B"}},
                                      10, "n", {}))
    C.capture(2026, "2026-08-14", path=str(p))
    assert p.exists()
    assert len(json.loads(p.read_text())["series"][0]["rows"]) == 2


def test_a_CHECKER_THAT_THROWS_MUST_NOT_COST_THE_DAY(tmp_path, monkeypatch):
    """I INTRODUCED THIS AN HOUR AGO AND IT IS THE SAME LESSON A THIRD TIME.

    The integrity refusal is deliberate for CORRUPTION. But it also stands between
    a good board and the disk, so a BUG IN THE CHECKER — an exception rather than
    a fatal finding — silently costs a day that no provider will serve again.
    `external-adp-capture.yml` carries the rule in capitals for the board pin, and
    `capture()` learned it once already for its own summary print. This is the
    third place, and I wrote it myself while fixing the second.

    WHICH ERROR IS WORSE decides the direction, and here it is not close. Writing
    a possibly-corrupt day is recoverable: the standing CI test runs `integrity`
    against the committed archive and would catch it, and the file can be
    corrected. Losing a good day is PERMANENT — no provider serves a board as of a
    past date, which is the finding this archive exists because of.

    So a checker that cannot run reports LOUDLY and does not block. A checker that
    RUNS and finds corruption still refuses; that path is unchanged and the test
    above pins it.

    MUTATION: let the exception propagate — a bug in my own guard destroys the
    thing the guard exists to protect."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5}, {"1": {"name": "A B"}}, 10, "n", {}))
    def boom(_):
        raise KeyError("a bug in the checker, not in the data")
    monkeypatch.setattr(C, "integrity", boom)

    C.capture(2026, "2026-08-14", path=str(p))

    assert p.exists(), "a checker bug must not cost an unrefetchable day"
    assert json.loads(p.read_text())["series"][0]["rows"] == {"1": 4.5}


# ── THE STANDING INVARIANT: A GUARD MAY NEVER COST THE DAY ─────────────────
#
# THREE TIMES TODAY A GUARD I BUILT BECAME THE NEXT THING THAT COULD DESTROY
# WHAT IT PROTECTS. The summary print could raise after `save()` and lose the day
# to a `len(None)`. The integrity checker could raise before `save()` and lose it
# to a bug in my own guard. Each was found by pointing the mechanism at itself,
# which is a thing I have to remember — and remembering is not a mechanism.
#
# MY FIRST VERSION OF THIS TEST WAS TOO PERMISSIVE AND I CAUGHT IT BY CHECKING
# WHICH PATH EACH CASE TOOK. It said "nothing but the write may stop the write"
# and then accepted a lost day for four of five helpers as "loud loss is
# acceptable" — which satisfied the claim trivially, because `save()` calls
# `coverage`, `load_players` and `merge_players` INTERNALLY. Those are the write.
# The invariant only has teeth once the two roles are separated:
#
#   WRITE PATH — failure legitimately aborts the capture. It must be LOUD and
#     must not leave a partial file. Silent or partial loss is the refusal.
#   GUARD / REPORT — failure must NOT cost the day. These sit between a good
#     board and the disk and have no business stopping it.
#
# The classification is checked against `capture()`'s source, so a NEW helper
# forces a decision instead of silently joining whichever set is convenient.

def _calls(fn) -> set:
    """Every bare name this function CALLS — prose excluded.

    ⚠ ONE DEFINITION, USED BY BOTH CLASSIFICATION TESTS. My first version of the
    `assemble_day` one was a second copy of the regex `capture()`'s uses, and it
    failed immediately on the word "`capture()`" appearing in a DOCSTRING. Two
    copies of "what does this function call", drifting, in a file whose recurring
    finding is exactly that — so there is one, and it reads code rather than
    English: the docstring and every comment are removed first.

    That also closes the direction the old regex could not see. A name mentioned
    in prose was an unexplained failure; a call that only APPEARS in prose was
    indistinguishable from a real one, so a helper deleted from the body but left
    in a comment would still look classified.
    """
    import ast
    import inspect
    import textwrap
    src = textwrap.dedent(inspect.getsource(fn))
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
                              ast.Module)) and ast.get_docstring(node)):
            node.body = node.body[1:]
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name):
                out.add(f.id)
            elif isinstance(f, ast.Attribute):
                out.add(f.attr)
    return out


#: `_series_of` was briefly on this list and is deliberately NOT any more, and
#: the round trip is worth recording because the classification test drove
#: every step of it. Filed under GUARDS first (the collapse guard reads it,
#: wrapped) — refused, because `save()` reaches it via `coverage()` so a
#: failure legitimately aborts the WRITE. Moved here — then refused AGAIN by
#: the other direction of the same test once the read moved inside
#: `collapse_verdict`: `capture` no longer calls it, so a fault injected into
#: it was being injected into nothing. Wrapping a call site does not make a
#: function a guard, and classifying one `capture` does not call proves
#: nothing at all.
WRITE_PATH = ["coverage", "load_players", "merge_players", "append_snapshot"]
#: `blocking_fatal` joined `integrity` here the moment it was written, because the
#: check above FORCED the decision — it failed naming the new call by name rather
#: than letting it default into whichever list was convenient. That is the whole
#: point of the classification test, and it is the first time it has fired.
#: `sel_pct_units` is a REPORT, and reports live in this list for the reason the
#: list exists: it sits between a saved day and the reader, and a bug in it must
#: not be able to reach back and cost the day. It is called inside the report
#: `try` for exactly that, and the parametrised test below proves it rather than
#: trusting the placement.
#: `collapse_verdict` joined them on 2026-08-14 — the truncated-200 refusal.
#: It REFUSES a collapsed board by design, and that refusal propagates; what
#: must never propagate is the guard itself throwing, so `capture` wraps the
#: call and only the verdict escapes. The parametrised test below proves the
#: wrap rather than trusting it.
GUARDS = ["integrity", "blocking_fatal", "sel_pct_units", "collapse_verdict"]
#: The SOURCE. Not a guard and not the write: if it fails there is no board at
#: all, so aborting is the only honest outcome. Grouped with the write path for
#: the loud-and-no-partial-file assertion because the requirement is identical.
SOURCE = ["fetch_mfl"]


@pytest.mark.parametrize("victim", GUARDS)
def test_A_GUARD_FAILING_MUST_NOT_COST_THE_DAY(victim, tmp_path, monkeypatch):
    """The case that has bitten three times. MUTATION: let it propagate — a bug in
    a check silently destroys an unrefetchable board, which is how the last three
    got in."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5}, {"1": {"name": "A B"}}, 10, "n", {}))
    hit = {"x": False}

    def boom(*a, **k):
        hit["x"] = True
        raise KeyError("injected fault in %s" % victim)

    monkeypatch.setattr(C, victim, boom)
    C.capture(2026, "2026-08-14", path=str(p))
    assert hit["x"], "%s was never called — this proved nothing" % victim
    assert p.exists() and json.loads(p.read_text())["series"][0]["rows"] == {"1": 4.5}


@pytest.mark.parametrize("victim", WRITE_PATH + SOURCE)
def test_A_WRITE_PATH_FAILURE_IS_LOUD_AND_LEAVES_NO_PARTIAL_FILE(victim, tmp_path,
                                                                 monkeypatch):
    """These legitimately abort — `save()` calls them. What must never happen is a
    HALF-WRITTEN archive, which is worse than either outcome because the standing
    integrity check would then be judging a file nobody meant to create.

    MUTATION: swallow the failure and carry on to `save()` — a snapshot gets
    written from state that a broken helper produced."""
    p = tmp_path / "arch.json"
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5}, {"1": {"name": "A B"}}, 10, "n", {}))
    hit = {"x": False}

    def boom(*a, **k):
        hit["x"] = True
        raise KeyError("injected fault in %s" % victim)

    monkeypatch.setattr(C, victim, boom)
    with pytest.raises(Exception):
        C.capture(2026, "2026-08-14", path=str(p))
    assert hit["x"], "%s was never called — this proved nothing" % victim
    assert not p.exists(), "%s: aborted AND left a partial file" % victim


def test_EVERY_HELPER_capture_CALLS_IS_CLASSIFIED_as_write_or_guard():
    """The lists go stale the moment someone adds a helper, and a stale list
    silently narrows the invariant to whatever it happened to cover. So the next
    person is forced to decide which role their new call plays.

    MUTATION: drop a name from either list — the parametrised tests keep passing
    on a smaller set and the coverage quietly shrinks with nothing saying so."""
    known = set(WRITE_PATH) | set(GUARDS) | set(SOURCE) | {"load", "save"}
    called = _calls(C.capture)
    module_level = {n for n in called if hasattr(C, n) and n not in dir(__builtins__)}
    missing = module_level - known
    assert not missing, (
        "capture() calls %s and neither list covers them — classify each as WRITE "
        "PATH (may abort, must be loud and leave no partial file) or GUARD (must "
        "never cost the day)" % sorted(missing))
    # AND THE OTHER DIRECTION, which this check did not have and rule 13f names:
    # `module_level - known` is empty whenever `_calls` returns NOTHING, so a
    # reader that stopped reading would report a fully classified function
    # forever. Every classified name must still be a call.
    for name in WRITE_PATH + GUARDS + SOURCE:
        assert name in called, (
            "%s is classified but capture() no longer calls it — the parametrised "
            "tests above are injecting a fault into nothing" % name)


# ── WHEN THE SPREAD DOES NOT ARRIVE, SAY WHY IN THE SAME BREATH ────────────
#
# MFL IS UNREACHABLE FROM HERE — verified, not assumed: the agent proxy reports
# `connect_rejected`, "gateway answered 403 to CONNECT", for
# api.myfantasyleague.com:443. nflverse over GitHub is allowed; MFL is not. So
# tomorrow's scheduled run is the FIRST contact between `minPick`/`maxPick`/
# `draftSelPct` and whatever MFL actually sends, and I cannot test it first.
#
# `dispersion_health` already fires once if nothing arrives. That tells us the
# parser never matched; it does NOT tell us what to change. On a feed whose days
# cannot be refetched, the difference between "we lost a day" and "we lost a day
# AND still have to guess" is another day.
#
# So a run that finds no bounds records the keys MFL ACTUALLY SENT. The fix
# becomes a diff instead of an investigation.

def test_a_MISSING_SPREAD_records_the_keys_MFL_ACTUALLY_SENT():
    """MUTATION: return a generic 'no dispersion' note — tomorrow we learn the
    parser failed and still have to spend a second unrefetchable day discovering
    that the field is called something else."""
    raw = [{"id": "1", "averagePick": "4.5", "minPickNo": "2", "maxPickNo": "9"},
           {"id": "2", "averagePick": "9.0", "minPickNo": "5", "maxPickNo": "14"}]
    note = C.dispersion_diagnosis(raw, dispersion={})
    assert note, "a missing spread must explain itself"
    assert "minPickNo" in note and "maxPickNo" in note, note
    assert "minPick" in note, "and name what we looked for, so it is a diff"


def test_a_SUCCESSFUL_spread_adds_NO_note():
    """An instrument that always speaks is not an instrument. MUTATION: always
    return the note — every healthy day carries a failure diagnosis."""
    raw = [{"id": "1", "averagePick": "4.5", "minPick": "2", "maxPick": "9"}]
    assert C.dispersion_diagnosis(raw, dispersion={"1": {"min_pick": 2}}) is None


def test_it_reports_keys_from_MORE_THAN_THE_FIRST_ROW():
    """MFL need not send the same keys for every player — a kicker row and a
    quarterback row can differ. MUTATION: read raw[0] only, and the one row that
    would have explained it is the one not sampled."""
    raw = [{"id": "1", "averagePick": "4.5"},
           {"id": "2", "averagePick": "9.0", "selPctOfDrafts": "88"}]
    note = C.dispersion_diagnosis(raw, dispersion={})
    assert "selPctOfDrafts" in note, note


def test_NO_RAW_ROWS_AT_ALL_says_that_instead_of_blaming_the_field_names():
    """A fetch that returned nothing is a different failure from a fetch whose
    fields we misread, and sending the reader to `mfl_adp.parse` for an empty
    response wastes the day this exists to save.

    MUTATION: emit the field-name note regardless — the diagnosis points at the
    parser when the problem was the feed."""
    note = C.dispersion_diagnosis([], dispersion={})
    assert note and "no rows" in note.lower()
    assert "minPick" not in note


# ── THE LAST PICK IS READ, NOT COMPUTED (A, 4126a85 — and it caught me too) ─
#
# A found `draft_plan.js` hardcoding `my_picks_before_keepers` — what Cory would
# hold IF HE KEPT NOBODY — and warned: "if either of you computes a round
# anywhere, it is wrong". A also wrote "C: nothing of yours is implicated that I
# can see". I checked instead of accepting, and it was.
#
# `draft_last_pick` computed `teams * rounds = 10 * 15 = 150`, and READING the
# list instead of computing it is right and stays. What was wrong was the number
# C was told to expect.
#
# ⚠️ EDITED BY A, 2026-08-13, WITH CORY'S AUTHORISATION — SECOND OVERRIDE OF THE
# A/C BOUNDARY. C acted in good faith on a premise A supplied and A was wrong.
#
# A CLAIMED forfeited picks are REMOVED from the sequence. THEY ARE NOT. Sleeper
# OCCUPIES a keeper's pick with `is_keeper: true` and nothing after it shifts up
# — verified against this league's own draft log across 450 real picks: 150
# picks and round 4 beginning at overall 31 in 2023 (0 keepers), 2024 (23) and
# 2025 (20) ALIKE. See `draft/tests/draft_shape.test.js`.
#
# So `pick_order.picks` is now the BOARD — 150 rows, keeper slots FLAGGED — and
# `pick_order.live_picks` is 147, how many SELECTIONS happen. 147 was never the
# draft's length; it was the live count wearing the wrong name. The reading
# discipline C built here was right; only the expected value moves.
#
# The class C named still stands and is worth keeping in the record: a
# computation producing a PLAUSIBLE number — right shape, right magnitude, off
# by exactly the keepers — while an authoritative list sits in the artifact.
# That was true of `teams * rounds` and it was equally true of A's 147.

def test_the_LAST_PICK_is_READ_from_pick_order_not_computed():
    """The READING discipline, which is the part that was always right.

    MUTATION: compute `teams * rounds` instead. It happens to agree on this
    league TODAY — the board is 150 and so is the product — so the fixture below
    is deliberately 149 rows, a length no product of the settings can produce.
    A test whose fixture agrees with the wrong method proves nothing.
    """
    d = C.draft_last_pick({
        "settings": {"num_teams": 10},
        "draft": {"settings": {"teams": 10, "rounds": 15}},
        "owner_to_roster": {str(i): i for i in range(10)},
        "roster_positions": ["BN"] * 15,
        "pick_order": {"picks": [{"overall": n, "round": 1, "slot": 1}
                                 for n in range(1, 150)]}})
    assert d["last_pick"] == 149, d
    assert d["last_pick"] != 10 * 15, "the fixture must not agree with the product"
    assert d["basis"] == "pick_order.picks"
    assert "forfeit" in d["note"].lower() or "read" in d["note"].lower()


def test_the_READ_boundary_CARRIES_BOTH_QUANTITIES_and_says_which_is_which():
    """DEPTH and SELECTIONS are different numbers and they are 3 apart, which is
    small enough to look like a rounding difference and large enough to be wrong.

    A consumer that wants selections and finds only `last_pick` will use
    `last_pick` — nobody stops to wonder whether the field they were handed is
    the one they meant. So the read path returns both, and the note names which
    is which rather than leaving the reader to infer it from a number.

    MUTATION: return `last_pick` alone. Every existing assertion still passes and
    the two quantities silently become one again — which is the state this file
    was in this morning, when 147 was reported as the draft's length."""
    d = C.draft_last_pick({
        "pick_order": {
            "picks": [dict({"overall": n, "round": 1, "slot": 1},
                           **({"keeper_slot": True} if n in (2, 5) else {}))
                      for n in range(1, 151)],
            "live_picks": 148}})
    assert d["last_pick"] == 150, d
    assert d["live_picks"] == 148, "the SELECTION count must survive the call"
    assert d["keeper_slots"] == 2, d
    assert "DEPTH" in d["note"] and "SELECTIONS" in d["note"], d["note"]


def test_a_MISSING_live_picks_is_reported_as_absent_not_as_the_board():
    """The null-as-absence trap, in the one place it would be most expensive: a
    board whose `live_picks` never got written must not leave a consumer reading
    150 as the selection count.

    MUTATION: default `live_picks` to `last_pick` — every caller then silently
    counts 150 selections in a 147-selection draft and nothing anywhere says so."""
    d = C.draft_last_pick({
        "pick_order": {"picks": [{"overall": n} for n in range(1, 151)]}})
    assert d["last_pick"] == 150
    assert d["live_picks"] is None, "absent must stay absent, never become depth"
    assert "live_picks is absent" in d["note"], d["note"]


def test_a_COMPUTED_boundary_is_LABELLED_as_derived_when_the_list_is_absent():
    """Without `pick_order` there is nothing to read, and teams x rounds is the
    best available — but it must not present as authoritative.

    MUTATION: report the same basis either way — a consumer cannot tell the
    number it is trusting was inferred from a league that may forfeit picks."""
    d = C.draft_last_pick({
        "settings": {"num_teams": 10},
        "draft": {"settings": {"teams": 10, "rounds": 15}},
        "owner_to_roster": {str(i): i for i in range(10)},
        "roster_positions": ["BN"] * 15})
    assert d["last_pick"] == 150
    assert d["basis"] == "teams_x_rounds"
    assert "keeper" in d["note"].lower() or "forfeit" in d["note"].lower()


def test_the_REAL_config_yields_the_REAL_BOARD_DEPTH():
    """Against the shipped artifact, because that is the number every cut of mine
    uses. MUTATION: read `my_picks_before_keepers` — the 15-entry list that looks
    like the answer and is what Cory would hold if he kept nobody.

    THE EXPECTED VALUE MOVED 147 -> 150 (A, with Cory's authorisation). A keeper
    OCCUPIES his pick; the draft is 150 deep whatever the keeper count. `147` is
    `pick_order.live_picks`, a different quantity, and both are asserted here so
    the two can never be confused again in this file."""
    import json as _json
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    ls = _json.loads((root / "data" / "sleeper_league_settings.json").read_text())
    board = _json.loads((root.parent / "public" / "draft_data.json").read_text())
    po = board.get("pick_order") or {}
    d = C.draft_last_pick(dict(ls, pick_order=po))
    teams = int(board["league"]["teams"]); rounds = int(board["league"]["rounds"])
    assert d["last_pick"] == teams * rounds == 150, (
        "the board is %d x %d deep; %s says %s"
        % (teams, rounds, d["basis"], d["last_pick"]))
    # AND THE OTHER QUANTITY, NAMED, so a future reader cannot mistake one for
    # the other. 147 is how many SELECTIONS happen, not how deep the draft is.
    assert po["live_picks"] == 147
    assert po["live_picks"] == d["last_pick"] - len(po["forfeited"])

# ── THE SAME INVARIANT, ONE LAYER UP: INSIDE THE FETCH ─────────────────────
#
# THE INVARIANT ABOVE WAS CHECKED FOR EVERY HELPER `capture()` CALLS AND FOR NONE
# OF THE HELPERS `fetch_mfl` CALLS — and `fetch_mfl` is where the riskiest line in
# the whole path lived: `dispersion = dispersion_of(parsed)`, unguarded, inside a
# `pragma: no cover` function, on the morning of the first day it would ever meet
# MFL's real response. A raise there aborts the capture and costs a day no
# provider will serve again, in exchange for a field the archive did without
# entirely until 2026-08-13.
#
# So the second half of `fetch_mfl` — everything below the two HTTP reads — is now
# `assemble_day`, pure and executable, and the invariant reaches it. Same split
# `dispersion_of` got, same reason, one level out.
#
# The three roles are the ones `capture()` already names:
#   SOURCE  `mfl_adp.parse` — no board without it, so raising is the honest outcome
#   GUARD   `dispersion_of`, `dispersion_diagnosis` — enhancements; may not stop
#           a day reaching disk
#   REPORT  the note

ASSEMBLE_SOURCE = ["parse"]
ASSEMBLE_GUARDS = ["dispersion_of", "dispersion_diagnosis"]

#: One MFL row in the shape the live endpoint actually returns — observed keys,
#: string values and all. `_parsed` above starts from `parse`'s OUTPUT; this
#: starts from MFL's, so the assertions below exercise the whole assembly rather
#: than the half of it that was already reachable.
def _texts(**over):
    row = {"id": "13593", "averagePick": "10.5", "draftsSelectedIn": "3510",
           "minPick": "2", "maxPick": "40", "draftSelPct": "70", "rank": "1"}
    row.update(over)
    adp = {"adp": {"totalDrafts": "5011", "player": [row]}}
    players = {"players": {"player": [
        {"id": "13593", "name": "Jefferson, Justin", "position": "WR", "team": "MIN"}]}}
    return json.dumps(adp), json.dumps(players)


def test_assemble_day_TURNS_THE_TWO_RAW_EXPORTS_INTO_A_DAY():
    """The whole assembly, end to end, for the first time — it was unreachable
    behind `pragma: no cover` until it was split out.

    MUTATION: return `rows` keyed by the players export instead of the ADP report.
    Every id still resolves in the test above because both fixtures use the same
    one; the archive silently keys a day by whichever export happened to be
    richer, and the ADP curve is attributed to the wrong players."""
    adp_text, players_text = _texts()
    rws, plrs, total, note, disp = C.assemble_day(adp_text, players_text, "n")
    assert rws == {"13593": 10.5}
    assert plrs["13593"] == {"name": "Justin Jefferson", "position": "WR",
                             "team": "MIN"}
    assert total == 5011
    assert disp == {"13593": {"min_pick": 2.0, "max_pick": 40.0, "sel_pct": 70.0,
                              "drafts": 3510}}
    assert note == "n", "a successful assembly adds nothing to the note"


@pytest.mark.parametrize("victim", ASSEMBLE_GUARDS)
def test_A_GUARD_INSIDE_THE_FETCH_MUST_NOT_COST_THE_DAY(victim, monkeypatch, capsys):
    """THE ONE THIS SPLIT EXISTS FOR. Both of these were written after the archive
    was already running and neither is load-bearing: the day was worth keeping
    without a spread for two days, and it is worth keeping without one again.

    MUTATION: let it propagate — an optional field kills an unrefetchable day, and
    it does it in a function nothing can execute, so nothing says it will."""
    adp_text, players_text = _texts()
    hit = {"x": False}

    def boom(*a, **k):
        hit["x"] = True
        raise KeyError("injected fault in %s" % victim)

    monkeypatch.setattr(C, victim, boom)
    rws, plrs, total, note, disp = C.assemble_day(adp_text, players_text, "n")
    assert hit["x"], "%s was never called — this proved nothing" % victim
    assert rws == {"13593": 10.5}, "the day survived %s failing" % victim
    assert total == 5011, "and so did the coverage figure beside it"


def test_a_FAILED_SPREAD_NAMES_ITSELF_IN_THE_NOTE_AND_IN_THE_LOG():
    """SURVIVING IS NOT ENOUGH — a day whose spread silently became `None` is
    indistinguishable from a day MFL published no spread for, and `dispersion_health`
    would then blame the feed for our bug. The note travels with the snapshot into
    the archive; the print reaches the CI log. Both name the exception.

    MUTATION: swallow it quietly — the archive gains days with no spread and no
    reason, and the diagnosis built to make the fix a diff has nothing to read."""
    import mfl_adp as MFL
    adp_text, players_text = _texts()
    real = C.dispersion_of
    try:
        C.dispersion_of = lambda p: (_ for _ in ()).throw(TypeError("bad shape"))
        rws, _p, _t, note, disp = C.assemble_day(adp_text, players_text, "mfl PPR")
    finally:
        C.dispersion_of = real
    assert rws == {"13593": 10.5}
    assert disp == {}
    assert "DISPERSION PARSE FAILED" in note and "TypeError" in note, note
    assert "bad shape" in note, "and WHICH failure, so the fix is a diff: %s" % note
    assert note.startswith("mfl PPR"), "the market's own note must survive: %s" % note
    assert MFL.parse  # the source is untouched by any of this


def test_THE_SOURCE_INSIDE_THE_FETCH_ABORTS_RATHER_THAN_INVENTING_A_DAY(monkeypatch):
    """The other direction, and it must stay this way. If `parse` fails there is no
    board — `capture()` refuses a zero-row day precisely so a dated empty snapshot
    never reaches the archive to be replayed later as a frozen market.

    MUTATION: guard `parse` the way the enhancements are guarded — the capture
    writes a day with no rows in it, or `capture` raises its zero-row refusal and
    the real reason is gone."""
    import mfl_adp as MFL
    adp_text, players_text = _texts()

    def boom(*a, **k):
        raise ValueError("MFL returned something parse cannot read")

    monkeypatch.setattr(MFL, "parse", boom)
    with pytest.raises(ValueError):
        C.assemble_day(adp_text, players_text, "n")


def test_EVERY_HELPER_assemble_day_CALLS_IS_CLASSIFIED_as_source_or_guard():
    """Same forcing function as `capture()`'s, and it has already earned its keep
    once today — the capture-side version failed by name when `blocking_fatal` was
    added, which is how `blocking_fatal` came to be inside the guard's `try` rather
    than beside it.

    MUTATION: drop a name from either list — the parametrised test keeps passing on
    a smaller set and the invariant quietly stops covering the line it was built
    for."""
    import mfl_adp as MFL
    known = set(ASSEMBLE_SOURCE) | set(ASSEMBLE_GUARDS)
    called = _calls(C.assemble_day)
    interesting = {n for n in called
                   if (hasattr(C, n) or hasattr(MFL, n)) and n not in dir(__builtins__)}
    missing = interesting - known
    assert not missing, (
        "assemble_day calls %s and neither list covers them — classify each as "
        "SOURCE (may raise; there is no day without it) or GUARD (must never cost "
        "the day)" % sorted(missing))
    for name in ASSEMBLE_GUARDS + ASSEMBLE_SOURCE:
        assert name in called, (
            "%s is classified but assemble_day no longer calls it — the "
            "parametrised test above is injecting a fault into nothing" % name)


# ── ONE BAD DAY MUST NOT COST ALL THE REST ─────────────────────────────────
#
# `integrity` judges the WHOLE archive; `capture()` refused to write whenever ANY
# day in it was fatal. So a single corrupt day — from a bug, a bad merge, a hand
# edit — would have blocked EVERY SUBSEQUENT CAPTURE, not just its own. The
# workflow step fails, the commit step is gated on it, and the days accumulate as
# nothing until a human notices the red run.
#
# This is the board-pin lesson for the fourth time in this file and by far the
# largest instance: the previous three could each cost a day. This one could cost
# every day that came after it, and the archive exists BECAUSE those days are
# unrepeatable.
#
# The rule is unchanged in the case the check was built for — corruption in the
# day being written still refuses. What changed is that yesterday's corruption is
# no longer allowed to destroy today's board, because refusing does not unwrite
# it, does not fix it, and is not even how anyone finds out: the standing check
# over the committed archive is.

def _fatal(kind="bad_adp", day=("2026", "2026-08-10")):
    return {"kind": kind, "day": day, "n": 1}


def test_only_TODAYS_OWN_CORRUPTION_may_stop_todays_write():
    """MUTATION: return `ig["fatal"]` whole — one bad day anywhere blocks every
    capture that follows it, permanently, which is the defect this replaced."""
    ig = {"fatal": [_fatal(day=("2026", "2026-08-10")),
                    _fatal(kind="row_count_mismatch", day=("2026", "2026-08-14"))]}
    blocking = C.blocking_fatal(ig, 2026, "2026-08-14")
    assert [f["kind"] for f in blocking] == ["row_count_mismatch"]


def test_the_SAME_DATE_IN_ANOTHER_SEASON_is_not_todays_day():
    """Two seasons legitimately hold the same observation date — the archive keys on
    (year, date) and a 2025 backfill sitting beside a 2026 capture is normal.

    MUTATION: compare the date only — a corrupt historical season blocks the live
    one, which is the original defect wearing a smaller hat."""
    ig = {"fatal": [_fatal(day=("2025", "2026-08-14"))]}
    assert C.blocking_fatal(ig, 2026, "2026-08-14") == []
    assert len(C.blocking_fatal(ig, 2025, "2026-08-14")) == 1


def test_the_YEAR_MATCHES_WHETHER_IT_ARRIVES_AS_INT_OR_STRING():
    """`capture(2026, ...)` passes an int; `integrity` stamps `str(s["year"])`; a
    round trip through JSON turns the tuple into a list. All three are the same day.

    MUTATION: compare the raw values — the types never match, `blocking_fatal`
    returns empty for everything, and a genuinely corrupt day sails onto disk while
    the test above still passes."""
    assert len(C.blocking_fatal({"fatal": [_fatal(day=["2026", "2026-08-14"])]},
                                2026, "2026-08-14")) == 1
    assert len(C.blocking_fatal({"fatal": [_fatal(day=("2026", "2026-08-14"))]},
                                "2026", "2026-08-14")) == 1


def test_a_FINDING_THAT_CANNOT_NAME_A_DAY_DOES_NOT_BLOCK_ONE():
    """Every fatal kind carries `day` today. A future archive-wide check that does
    not is not evidence about the board in hand, and it may not destroy it — it is
    printed with the others instead. The same asymmetry decides it as everywhere
    else here: a corrupt archive is recoverable, a lost day is not.

    MUTATION: block on unattributable findings — a new whole-archive check silently
    acquires the power to end the capture, which is how this defect got in."""
    assert C.blocking_fatal({"fatal": [{"kind": "something_new"}]},
                            2026, "2026-08-14") == []
    assert C.blocking_fatal({"fatal": [{"kind": "x", "day": None}]},
                            2026, "2026-08-14") == []


def test_NOTHING_WRONG_blocks_nothing_and_a_MISSING_report_is_not_a_finding():
    """`ig` is a stub with an empty `fatal` when the checker itself failed, and that
    path must not be read as corruption."""
    assert C.blocking_fatal({"fatal": [], "ok": True}, 2026, "2026-08-14") == []
    assert C.blocking_fatal({}, 2026, "2026-08-14") == []
    assert C.blocking_fatal(None, 2026, "2026-08-14") == []


def test_a_CORRUPT_OLDER_DAY_DOES_NOT_COST_TODAYS_BOARD(tmp_path, monkeypatch, capsys):
    """END TO END, because the unit above proves the decision and this proves it is
    the decision `capture()` actually makes.

    An archive holding one fatal day from last week; today's fetch is good. Today
    must reach disk, and the older finding must still be shouted — a corruption
    that stops blocking must not also stop being reported.

    MUTATION: keep `if not ig["ok"]` — every capture after the first bad day is
    lost, and the archive this file exists to protect stops growing."""
    p = tmp_path / "arch.json"
    p.write_text(json.dumps({"series": [
        {"year": "2026", "observed_at": "2026-08-10",
         "rows": {"1": 4.5}, "row_count": 999, "total_drafts": 10},
    ], "players": {"1": {"name": "A B"}}}))

    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": 4.5, "2": 9.0}, {"1": {"name": "A B"}},
                                      10, "n", {}))
    C.capture(2026, "2026-08-14", path=str(p))

    days = {s["observed_at"] for s in json.loads(p.read_text())["series"]}
    assert days == {"2026-08-10", "2026-08-14"}, (
        "today's unrefetchable board was discarded over a week-old finding")
    out = capsys.readouterr().out
    assert "OTHER DAYS" in out and "row_count_mismatch" in out, (
        "and it went quiet about the corruption while it was at it:\n%s" % out)


def test_TODAYS_corruption_STILL_REFUSES_even_beside_an_older_one(tmp_path,
                                                                  monkeypatch):
    """The half that must not have moved. MUTATION: return `[]` unconditionally —
    every test above still passes and the refusal built to keep a corrupt day out
    of a permanent archive has silently become a no-op."""
    p = tmp_path / "arch.json"
    p.write_text(json.dumps({"series": [
        {"year": "2026", "observed_at": "2026-08-10",
         "rows": {"1": 4.5}, "row_count": 999, "total_drafts": 10},
    ], "players": {}}))
    before = p.read_text()
    monkeypatch.setattr(C, "fetch_mfl",
                        lambda year: ({"1": -4.5}, {"1": {"name": "A B"}}, 10, "n", {}))
    with pytest.raises(RuntimeError) as e:
        C.capture(2026, "2026-08-14", path=str(p))
    assert "bad_adp" in str(e.value)
    assert p.read_text() == before, "and it must not have touched the file"


# ── IS `sel_pct` A PERCENT OR A FRACTION? DERIVED, NOT ASSUMED ─────────────
#
# `TRUNCATION_SEL_PCT = 50.0` and the note's `%.1f%%` both read MFL's
# `draftSelPct` as a whole percent. That reading rests on ONE row quoted in a
# comment — no captured MFL response in this repo carries the field, and MFL is
# unreachable from here — so it was an assumption going live on the first day the
# spread is ever captured.
#
# It is DERIVABLE from what the snapshot already stores: `drafts` per player and
# `total_drafts` for the report give the rate, and a derived rate against the
# published one settles the scale on day one rather than never.
#
# WHAT IS AND IS NOT AT STAKE, so this is not read as worse than it is. `sd` is
# `(max - min) / d_n` and does not touch `sel_pct`. A wrong scale mislabels
# `truncated` and prints a wrong figure in a note; it moves no number anyone
# drafts on, and the raw value is archived so the reading can be corrected later
# over every day already captured.

def _day(sel_scale=1.0, total=125, rows=(("a", 70, 87), ("b", 20, 25),
                                         ("c", 8, 10))):
    """A day whose published rates are EXACTLY consistent with its counts.

    Built from selection counts and a total, so the fixture cannot accidentally
    encode the answer: each `sel_pct` is computed from `drafts/total`, then scaled
    by `sel_scale` to plant a units error.
    """
    disp = {}
    for pid, _pct, n in rows:
        disp[pid] = {"min_pick": 1, "max_pick": 100, "drafts": n,
                     "sel_pct": (n / total * 100.0) * sel_scale}
    return {"total_drafts": total, "dispersion": disp}


def test_the_UNITS_CHECK_FIRES_on_a_planted_fraction():
    """Proved before the real feed is judged by it. MUTATION: compare the
    published rate against `drafts/total` WITHOUT the x100 — percent and fraction
    swap places and the check confidently reports the wrong scale."""
    assert C.sel_pct_units(_day(sel_scale=1.0))["verdict"] == "percent"
    frac = C.sel_pct_units(_day(sel_scale=0.01))
    assert frac["verdict"] == "fraction", frac
    assert frac["expected_percent"] is False
    assert "100x" in frac["note"]


def test_a_rate_that_is_NEITHER_says_so_rather_than_picking_the_closer_one():
    """The answer that matters most, because it is the one that means STOP. If
    `draftSelPct` is not the selection rate at all, rounding it to whichever of
    two guesses is nearer would put a confident label on a field nobody
    understands.

    MUTATION: return `percent` unless it matches `fraction` — an unrecognised
    feed silently becomes the assumption this check was built to test."""
    odd = C.sel_pct_units(_day(sel_scale=3.7))
    assert odd["verdict"] == "disagrees", odd
    assert "NOTHING" in odd["note"]


def test_ROUNDING_IN_THE_PUBLISHED_FIGURE_is_not_read_as_a_units_error():
    """MFL publishes `draftSelPct` rounded to whole percents ("70"). At the real
    archive's scale — 125 drafts — one rounding step is 0.4 points on a figure of
    5.6, which is 7%. A tolerance tight enough to call that a units error would
    fail on the first real day, every day.

    ⚠ MY FIRST FIXTURE PROVED NOTHING AND THE GATE SAID SO. It rounded counts of
    87, 25 and 10 against a total of 125 — all of which divide evenly into whole
    percents — so `round()` changed nothing, the median ratio was exactly 1.0, and
    the tight-tolerance mutation SURVIVED. A test that cannot fail for the reason
    it names is not evidence, so the count here is deliberately one that does NOT
    divide evenly, and the planted distortion is asserted before the verdict is.

    7 of 125 is also the realistic worst case rather than an invented one: it is
    the shape of a deep player on the live board, and it is where the rounding
    error is largest.

    MUTATION: drop the tolerance to 1e-9 — every real day reports `disagrees` and
    a check built to answer a question becomes a daily false alarm."""
    d = {"total_drafts": 125,
         "dispersion": {"deep": {"min_pick": 40, "max_pick": 150, "drafts": 7,
                                 "sel_pct": round(7 / 125 * 100.0)}}}
    implied = 7 / 125 * 100.0
    assert d["dispersion"]["deep"]["sel_pct"] != implied, (
        "the fixture's rounding is a no-op, so this proves nothing — pick a count "
        "that does not divide evenly into whole percents")
    r = C.sel_pct_units(d)
    assert r["verdict"] == "percent", r
    assert abs(r["median_ratio"] - 1.0) > 0.05, (
        "and the distortion must be REAL: ratio %s is inside any tolerance, so a "
        "tighter one would still pass" % r["median_ratio"])


def test_a_DAY_WITH_NO_SPREAD_is_UNMEASURED_and_specifically_not_percent():
    """The two days archived before the parser kept the spread are exactly this
    shape, and they are not evidence that the scale is right.

    MUTATION: default to `percent` when there is nothing to check — the assumption
    this exists to test gets confirmed by days that contain none of it."""
    assert C.sel_pct_units({"total_drafts": 125, "dispersion": None})["verdict"] \
        == "unmeasured"
    assert C.sel_pct_units({"dispersion": _day()["dispersion"]})["verdict"] \
        == "unmeasured", "no total_drafts means no derivable rate"
    assert C.sel_pct_units({})["verdict"] == "unmeasured"
    assert C.sel_pct_units(None)["verdict"] == "unmeasured"


def test_a_ZERO_SELECTION_row_cannot_imply_a_rate_and_is_SKIPPED():
    """Dividing by a zero selection count is not a disagreement, and counting a
    published zero as agreement would let a feed of zeroes certify any scale.

    MUTATION: keep them — one malformed row drags the median and the verdict flips
    on data that says nothing either way."""
    d = _day()
    d["dispersion"]["dead"] = {"drafts": 0, "sel_pct": 0.0,
                               "min_pick": 1, "max_pick": 2}
    r = C.sel_pct_units(d)
    assert r["verdict"] == "percent" and r["rows"] == 3, r
    allzero = {"total_drafts": 125,
               "dispersion": {"x": {"drafts": 0, "sel_pct": 0.0}}}
    assert C.sel_pct_units(allzero)["verdict"] == "unmeasured"


def test_the_REAL_ARCHIVE_is_judged_and_the_verdict_is_RECORDED_not_assumed():
    """Against the committed archive, so this stops being a fixture exercise the
    morning real data lands. Today every day predates the spread, so the honest
    answer is `unmeasured` — and that is asserted rather than skipped, because a
    check that can only say "nothing yet" has not looked.

    WHEN THE FIRST REAL DAY LANDS this will read `percent` (or tell us it does
    not), and the assertion below tightens to require a measured verdict."""
    # THE SHIPPED PATH, from the module rather than rebuilt here — a second copy
    # of where the archive lives is how a test ends up judging a file nobody
    # writes. `C.SERIES` is the one `capture()` itself uses.
    p = C.SERIES
    if not p.exists():
        pytest.skip("UNCHECKED: no committed archive")
    days = json.loads(p.read_text())["series"]
    judged = [(s["observed_at"], C.sel_pct_units(s)) for s in days]
    assert judged, "the archive has no days at all"
    measured = [(d, v) for d, v in judged if v["verdict"] != "unmeasured"]
    for day, v in measured:
        assert v["verdict"] == "percent", (
            "%s: MFL's draftSelPct is not the percent scale TRUNCATION_SEL_PCT "
            "assumes — %s" % (day, v["note"]))
    # AND THE COUNT IS PINNED, so a day that stops being judged is visible.
    unmeasured = len(judged) - len(measured)
    assert unmeasured <= 3, (
        "%d days carry no derivable rate; only the three captured before the "
        "parser kept the spread (08-11, -12, -13) should" % unmeasured)


def test_THE_DRAFTABLE_MISSES_ARE_NAMED_not_only_counted():
    """`no_sleeper_match_draftable` is reported in the capture summary every
    morning and NOBODY CAN ACT ON IT, because it is computed by SUBTRACTION —
    `no_sleeper_match - len(excluded)` — so the players it counts were never
    identified. I hit this trying to answer "which players did the prune cost us
    market coverage on": my own ad-hoc enumeration disagreed with the module twice
    in one session, once listing three of our own keepers.

    A count of a set nobody can enumerate is the shape this lane keeps finding in
    other people's code.

    MUTATION: report the count alone — the number moves 6 to 11 across a rebuild
    and the only way to learn WHO is to re-derive the exclusions by hand and get
    them wrong."""
    key = {"1": {"name": "Real Player", "position": "WR", "team": "CIN"},
           "2": {"name": "A Linebacker", "position": "LB", "team": "CIN"},
           "3": {"name": "Kept Guy", "position": "RB", "team": "DET"}}
    board = [{"player_id": "x", "name": "Somebody Else", "position": "WR",
              "team": "SEA"}]
    _ids, rep = C.crosswalk_map(key, board, kept=[{"name": "Kept Guy"}],
                                positions={"QB", "RB", "WR", "TE", "K", "DEF"})
    assert rep["no_sleeper_match_draftable"] == 1
    assert rep["no_sleeper_match_draftable_ids"] == ["1"], rep
    assert rep["no_sleeper_match_draftable_truncated"] is False


def test_THE_NAMED_SET_AND_THE_ARITHMETIC_MUST_AGREE():
    """A FREE CONTROL THAT DID NOT EXIST. The count subtracts `len(excluded)` from
    `no_sleeper_match`, which is only sound while every excluded id is itself
    unresolved. Nothing checked that. Now the set is built directly, so its size
    and the subtraction are two independent routes to one number — and a
    disagreement means the exclusion sets have drifted out of the unresolved
    population, which would silently inflate `crosswalk_rate_draftable`.

    MUTATION: derive the ids by filtering something other than `unresolved` — the
    two numbers part company and the rate quietly climbs toward a better-than-real
    figure, which is the direction this kind of error always goes."""
    key = {str(i): {"name": "P%d" % i, "position": "WR", "team": "CIN"}
           for i in range(1, 6)}
    key["9"] = {"name": "Linebacker", "position": "LB", "team": "CIN"}
    _ids, rep = C.crosswalk_map(key, [], kept=None,
                                positions={"QB", "RB", "WR", "TE", "K", "DEF"})
    assert len(rep["no_sleeper_match_draftable_ids"]) == \
        rep["no_sleeper_match_draftable"], rep


# ── THE MARGINAL DAY: WHAT TODAY'S DRAFTERS DID, NOT WHAT THE SEASON AVERAGES ──
#
# Measured 2026-08-14: MFL's published ADP moves a median 0.17-0.21 picks a day
# inside the top 150, and `total_drafts` goes 115 -> 119 -> 125. The stability is
# ARITHMETIC — one day's new drafts carry 3-5% of the weight — so the published
# number is structurally incapable of showing what today's room did. Six days from
# the draft, that is the only part anybody would act on.
#
# ⚠ I NEARLY BUILT THIS ON A DEFECT THAT DOES NOT EXIST. I had it written down
# that `sel_pct` was extracted by `mfl_adp.parse` and then discarded on the way to
# disk, making the marginal day permanently underivable — urgent, and false.
# `dispersion_of` stores it, `append_snapshot` archives it, and the three days on
# disk carry `dispersion: None` for the plain reason that `dispersion_of` reached
# MAIN at f1e1d4e 13:02 on 08-13, one hour AFTER that day's 12:03 capture. I had
# dated the code from the commit on MY BRANCH (6472968, 05:22) instead of from the
# hour it could actually run. `DISPERSION_SINCE = "2026-08-14"` was right the
# whole time. Merged is not executed — and neither is committed.
#
# SO THE GAP IS NOT STORAGE. It is that nothing DERIVES the marginal day from what
# is already being stored, and two cumulative snapshots contain it exactly, because
# a mean times its count is a sum:
#     new       = drafts1 - drafts0
#     marginal  = (adp1*drafts1 - adp0*drafts0) / new
#
# AND THE DENOMINATOR IS `drafts`, NEVER `sel_pct * total_drafts`. Both are "how
# many drafts he was selected in", which is exactly the coincidence A's first
# criterion is about — say the comparison out loud and they part company. MFL
# publishes `draftSelPct` rounded to whole percents, so its quantum is
# total_drafts/100: 1.25 drafts today, and ~50 at the 5011-draft depth MFL
# reported for a finished 2023. The DAILY INCREMENT does not grow with the season;
# the rounding error does. `draftsSelectedIn` is an exact integer and is sitting in
# the same row.

def _mday(day, adp, drafts, total, lo=5, hi=400):
    return {"year": "2026", "observed_at": day, "rows": {"1": float(adp)},
            "total_drafts": total,
            "dispersion": {"1": {"min_pick": lo, "max_pick": hi,
                                 "sel_pct": round(drafts / total * 100.0),
                                 "drafts": drafts}}}


def test_THE_MARGINAL_ADP_IS_DERIVED_EXACTLY_from_the_counts_not_the_percents():
    """60 selections at 80.0, then 62 at 83.87: the two new drafters took him at
    200.0. The published board moved 3.9 picks and calls that a quiet day.

    MUTATION 1: difference the MEANS instead of the sums — reports 3.87, the damped
    figure, which is the one quantity this function exists to see past.
    MUTATION 2: use `sel_pct * total_drafts / 100` as the count. Both days publish
    "50" (60/119 = 50.4%, 62/125 = 49.6%), so the derived increment is 3.0 rather
    than 2 and the marginal comes back 160.7 — a 20% miss, in the direction that
    makes the new drafters look tamer than they were."""
    a = _mday("2026-08-13", 80.0, 60, 119)
    b = _mday("2026-08-14", (60 * 80.0 + 200.0 + 200.0) / 62, 62, 125)
    assert a["dispersion"]["1"]["sel_pct"] == b["dispersion"]["1"]["sel_pct"] == 50
    r = C.marginal_adp(a, b)
    assert r["status"] == "measured", r
    row = r["rows"]["1"]
    assert row["new_selections"] == 2
    assert abs(row["marginal_adp"] - 200.0) < 1e-9, row
    assert abs(row["published_move"] - 3.87096774193549) < 1e-6, row


def test_THE_DERIVED_MEAN_MUST_LIE_INSIDE_THE_OBSERVED_RANGE_or_the_premise_is_wrong():
    """The one falsifiable check this derivation admits, and it costs nothing.

    Every new selection is a REAL PICK, so their mean cannot fall outside the
    later day's own observed [min_pick, max_pick] — that range already contains
    them. If it does, the decomposition's premise is false: `averagePick` is not
    averaged over `draftsSelectedIn`, or the two snapshots are not the same
    accumulation. That turns "MFL's fields mean what their names say" from an
    assumption into a measurement, on the first morning two snapshots exist.

    MUTATION: drop the check — a marginal ADP of 200 gets reported for a player
    MFL says was never taken later than 150, with the same confidence as a sound
    one, and the wrongness is invisible because the number is plausible."""
    a = _mday("2026-08-13", 80.0, 60, 119, hi=150)
    b = _mday("2026-08-14", (60 * 80.0 + 200.0 + 200.0) / 62, 62, 125, hi=150)
    r = C.marginal_adp(a, b)
    assert r["outside_observed_range"] == ["1"], r
    assert r["rows"]["1"]["outside_observed_range"] is True
    # STILL REPORTED, NOT DELETED. Rule 17a — preserve before you alarm. The
    # number is the evidence that the premise is wrong; discarding it leaves the
    # alarm with nothing to point at.
    assert abs(r["rows"]["1"]["marginal_adp"] - 200.0) < 1e-9


def test_A_PLAYER_WITH_NO_NEW_SELECTIONS_IS_SKIPPED_not_divided_by_zero():
    """MUTATION: divide anyway — one unchanged player raises ZeroDivisionError and
    takes the whole day's derivation down with him, on a day that cannot be
    refetched."""
    a = _mday("2026-08-13", 80.0, 60, 119)
    b = _mday("2026-08-14", 80.0, 60, 125)
    r = C.marginal_adp(a, b)
    assert r["rows"] == {}
    assert r["skipped_no_new_selections"] == 1


def test_A_SHRINKING_SELECTION_COUNT_IS_REFUSED():
    """A cumulative count cannot fall. If it does, the two snapshots are not the
    same accumulation — a restatement, a re-scoped feed, or our own units drifting.

    MUTATION: allow it — the negative denominator flips the sign and the marginal
    ADP comes back pointing the wrong way, with nothing to say it is odd."""
    a = _mday("2026-08-13", 80.0, 60, 119)
    b = _mday("2026-08-14", 81.0, 55, 125)
    r = C.marginal_adp(a, b)
    assert r["rows"] == {}
    assert r["refused_count_fell"] == 1


def test_MARGINAL_WITHOUT_DISPERSION_IS_UNMEASURED_not_zero():
    """Every day on disk before 2026-08-14 is exactly this case.

    MUTATION: treat a missing dispersion as full coverage — the days that CANNOT
    be derived report a marginal equal to the published move, which is the damped
    number wearing the undamped name, across the whole back-archive at once."""
    a = {"observed_at": "2026-08-13", "rows": {"1": 80.0}, "total_drafts": 119}
    b = {"observed_at": "2026-08-14", "rows": {"1": 81.0}, "total_drafts": 125}
    r = C.marginal_adp(a, b)
    assert r["status"] == "unmeasured"
    assert "dispersion" in r["note"]
    assert r["rows"] == {}


def test_THE_SNAPSHOTS_MUST_BE_PASSED_EARLIER_FIRST():
    """Swapping them does not fail — it silently returns the mirror image, and a
    caller reading `marginal_adp(today, yesterday)` gets a confident number for a
    day that ran backwards.

    MUTATION: sort them internally instead of refusing. That is worse, not better:
    it makes the argument order stop meaning anything, so `published_move` and
    `new_selections` quietly describe a different pair than the caller named."""
    a = _mday("2026-08-13", 80.0, 60, 119)
    b = _mday("2026-08-14", 83.87, 62, 125)
    with pytest.raises(ValueError, match="earlier"):
        C.marginal_adp(b, a)


# ── AND SOMETHING HAS TO READ IT ─────────────────────────────────────────────
# The derivation above is useless sitting in a module. It needs the two right
# days chosen for it, and choosing days is exactly where this file has already
# been burned: `capture()` carries a comment about finding today "by (year, date)
# rather than taken as `series[-1]`", and I spent part of 08-14 comparing a board
# file to ITSELF because I picked the wrong two refs.

def _md(day, year, players, total, disp=True, hi=400):
    """players: {pid: (adp, drafts)}."""
    s = {"year": year, "observed_at": day, "total_drafts": total,
         "rows": {p: float(a) for p, (a, _n) in players.items()}, "dispersion": None}
    if disp:
        s["dispersion"] = {p: {"min_pick": 1, "max_pick": hi,
                               "sel_pct": round(n / total * 100.0), "drafts": n}
                           for p, (_a, n) in players.items()}
    return s


def test_IT_PICKS_THE_LAST_TWO_DAYS_THAT_ACTUALLY_CARRY_A_SPREAD():
    """08-11 and 08-12 have no dispersion — the parser was still discarding it.
    Taking `series[-1]` and `series[-2]` works only while the tail happens to be
    complete, and the tail is exactly what a daily capture keeps changing.

    MUTATION: use the last two rows regardless — the pair straddles the day the
    spread started arriving, `marginal_adp` returns UNMEASURED, and a report that
    could have been produced says there is nothing to see."""
    ser = [_md("2026-08-12", "2026", {"1": (20.0, 100)}, 119, disp=False),
           _md("2026-08-13", "2026", {"1": (20.0, 100)}, 119),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 125)]
    r = C.latest_marginal(ser, "2026")
    assert r["status"] == "measured", r
    assert (r["earlier"], r["later"]) == ("2026-08-13", "2026-08-14")


def test_IT_STAYS_INSIDE_THE_YEAR_IT_WAS_ASKED_FOR():
    """MUTATION: drop the year filter — asking about 2025 silently answers with
    2026, because the series is sorted by (year, date) and the most recent rows
    are always the newest season. Two seasons differenced against each other is
    not a slow day, it is a different question."""
    ser = [_md("2025-08-20", "2025", {"1": (30.0, 700)}, 800),
           _md("2025-08-21", "2025", {"1": (31.0, 720)}, 830),
           _md("2026-08-13", "2026", {"1": (20.0, 100)}, 119),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 125)]
    r = C.latest_marginal(ser, "2025")
    assert (r["earlier"], r["later"]) == ("2025-08-20", "2025-08-21"), r


def test_ONE_SPREAD_DAY_IS_UNMEASURED_and_says_how_many_it_found():
    """THIS IS TONIGHT. The 12:02 capture on 2026-08-14 is the first contact
    between `dispersion_of` and MFL's real response, so the first marginal day
    cannot exist before 08-15. A report that printed nothing tonight would be
    indistinguishable from one that was broken.

    MUTATION: return `measured` with no rows — the step reads as a working
    instrument observing a market where nobody moved."""
    ser = [_md("2026-08-13", "2026", {"1": (20.0, 100)}, 119, disp=False),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 125)]
    r = C.latest_marginal(ser, "2026")
    assert r["status"] == "unmeasured"
    assert r["spread_days_found"] == 1
    assert "2026-08-15" in r["note"] or "one more" in r["note"]


def test_THE_RANKING_IS_BY_DISTANCE_FROM_THE_STANDING_PRICE_not_by_the_move():
    """The actionable quantity is where today's room took a player versus what
    the board is charging for him NOW — not how far the cumulative average
    drifted, which is the damped number this whole exercise exists to get past.

    Player 2's board price moved 1.0 pick while his four new drafters averaged
    46.0 against a standing price of 21.0. Player 1's price moved 10.0 — ten
    times as much — on a smaller real disagreement.

    MUTATION: rank by `published_move` — the order inverts, and the report leads
    with the player the market has ALREADY repriced instead of the one it has
    not."""
    ser = [_md("2026-08-13", "2026", {"1": (80.0, 60), "2": (20.0, 100)}, 119),
           _md("2026-08-14", "2026", {"1": (90.0, 90), "2": (21.0, 104)}, 125)]
    r = C.latest_marginal(ser, "2026")
    top = r["ranked"][0]
    assert top["player_id"] == "2", r["ranked"]
    assert abs(top["gap"] - 25.0) < 1e-9 and abs(top["adp_later"] - 21.0) < 1e-9
    assert abs(r["rows"]["1"]["published_move"] - 10.0) < 1e-9


def test_A_SINGLE_NEW_DRAFTER_IS_NOT_A_MARKET_and_is_kept_out_of_the_RANKING():
    """One new selection makes the "mean of the new picks" a single person's
    pick. Ranked by distance from the price, those rows win every morning by
    construction, and the report becomes a list of the thinnest players on the
    board wearing the authority of an average.

    KEPT IN `rows`, EXCLUDED FROM `ranked` — rule 17a. The row is real evidence
    and gets thrown away by nobody; it just does not get to lead the report.

    MUTATION: rank everything — player 3 moved one pick of published ADP on a
    single new drafter and leads, displacing a player four drafters agreed on."""
    ser = [_md("2026-08-13", "2026", {"2": (20.0, 100), "3": (30.0, 50)}, 119),
           _md("2026-08-14", "2026", {"2": (21.0, 104), "3": (31.0, 51)}, 125)]
    r = C.latest_marginal(ser, "2026")
    assert abs(r["rows"]["3"]["marginal_adp"] - 81.0) < 1e-9   # kept
    assert [x["player_id"] for x in r["ranked"]] == ["2"]
    assert r["ranking_excluded_thin"] == 1


def test_THE_RANKING_IS_SCOPED_TO_PICKS_WE_CAN_ACTUALLY_REACH():
    """FOUND BY REHEARSING THE WORKFLOW STEP, not by reasoning about it. Run
    against a realistic board, the top 15 came back as players priced 222 to 458
    — a 10x15 draft ends at 150, so not one of them can be reached. Deep players
    win a ranking by |gap| structurally: they carry the largest ADP values and the
    thinnest denominators, so they will crowd out the actionable rows EVERY
    morning, and the report would have looked busy while saying nothing.

    THE TEST IS `min(price, marginal) <= DRAFT_RANGE` — EITHER end inside, never
    both. The two rows that matter most are precisely the ones that straddle it:

      a RISER  the board prices him at 291 and today's room took him at 20
      a FALLER the board prices him at 50 and today's room took him at 300

    MUTATION 1: scope on the board price alone — the riser disappears, and a
    player the market has not noticed being taken 271 picks early is the single
    most actionable row this report can produce.
    MUTATION 2: scope on the marginal alone — the faller disappears, and a player
    we are about to spend a fifth-round pick on quietly stopped going there.

    NOT A SILENT CAP: the excluded count is reported, so a morning where
    everything interesting sat outside the range says so rather than looking
    like a quiet day."""
    a = _md("2026-08-13", "2026",
            {"deep": (460.0, 10), "riser": (400.0, 10), "faller": (40.0, 100)},
            119, hi=600)
    b = _md("2026-08-14", "2026",
            {"deep": (450.0, 14), "riser": (4080.0 / 14, 14), "faller": (50.0, 104)},
            125, hi=600)
    r = C.latest_marginal(a and [a, b], "2026")
    assert abs(r["rows"]["riser"]["marginal_adp"] - 20.0) < 1e-9, r["rows"]["riser"]
    assert abs(r["rows"]["faller"]["marginal_adp"] - 300.0) < 1e-9
    assert abs(r["rows"]["deep"]["marginal_adp"] - 425.0) < 1e-9   # kept, rule 17a
    assert [x["player_id"] for x in r["ranked"]] == ["riser", "faller"], r["ranked"]
    assert r["ranking_excluded_out_of_range"] == 1
    assert r["draft_range"] == 150


# ── THE SPREAD AND THE COUNT ARE TWO CONSUMERS OF ONE ROW ────────────────────
#
# `dispersion_of` drops any player with no min/max bound, and that was right when
# `dispersion` had exactly one consumer: a SPREAD, which `drafts` and `sel_pct`
# genuinely cannot describe. `marginal_adp` arrived today with a different need —
# `drafts` alone, the exact per-player denominator — and it reads the same record.
#
# So a player MFL gives a selection count but no bounds is now dropped carrying a
# number nothing else can supply. Whether that happens at all is unknown until the
# first real capture: `dispersion_health` says so itself — "suspect the field names
# in mfl_adp.parse — minPick, maxPick, draftSelPct — BEFORE suspecting MFL... the
# shape is right and only the names are unproven." If minPick/maxPick turn out
# absent, EVERY row is dropped and the marginal day becomes silently underivable
# even though its input was in the response.

def test_A_PLAYER_WITH_A_COUNT_BUT_NO_BOUNDS_IS_KEPT_for_the_marginal_day():
    """MUTATION: keep the bounds-only test — a feed that publishes
    `draftsSelectedIn` without `minPick`/`maxPick` loses every selection count,
    and `marginal_adp` reports UNMEASURED on a day whose denominator arrived."""
    parsed = [{"mfl_id": "1", "min_pick": 3, "max_pick": 40, "sel_pct": 70.0, "drafts": 88},
              {"mfl_id": "2", "min_pick": None, "max_pick": None,
               "sel_pct": 50.0, "drafts": 62},
              {"mfl_id": "3", "min_pick": None, "max_pick": None,
               "sel_pct": None, "drafts": None}]
    d = C.dispersion_of(parsed)
    assert set(d) == {"1", "2"}, d
    assert d["2"]["drafts"] == 62
    # STILL DROPS THE ROW THAT SAYS NOTHING. All-None on disk is a measurement of
    # nothing wearing the shape of one.
    assert "3" not in d


def test_THE_SPREAD_ALARM_COUNTS_ROWS_WITH_A_BOUND_not_rows_with_anything():
    """Keeping count-only rows would inflate `dispersion_health`'s coverage — the
    instrument that fires when the spread never arrives — until it reported a
    healthy day on a feed that sent no bounds at all. The alarm has to keep
    counting the thing it is about.

    MUTATION: count every dispersion row — a capture carrying selection counts and
    NO bounds reports full spread coverage, and the escalation that exists for
    exactly that case never fires."""
    ser = [{"year": "2026", "observed_at": "2026-08-14", "rows": {"1": 1.0, "2": 2.0},
            "row_count": 2,
            "dispersion": {"1": {"min_pick": 3, "max_pick": 40, "sel_pct": 70.0,
                                 "drafts": 88},
                           "2": {"min_pick": None, "max_pick": None,
                                 "sel_pct": 50.0, "drafts": 62}}}]
    h = C.dispersion_health(ser, "2026")
    assert h["rows"] == 1, h        # one row carries a spread, not two
    assert h["adp_rows"] == 2


# ── THE FIRST REAL CAPTURE MOVED A NUMBER I HAD DECLARED FROM THREE DAYS ─────
#
# `MIN_NEW_SELECTIONS = 3` was declared from the cadence: "total_drafts gained 4
# and then 6 over the two most recent days, so requiring 3 means a majority of the
# day's drafts took him." The 2026-08-14 capture gained **2** (125 -> 127).
#
# At +2, the MOST new selections any player can have is 2, so NOT ONE can reach 3
# and `ranked` is empty — every row filed under `ranking_excluded_thin`. The report
# would print a correct-looking table with nothing in it, every morning the market
# happens to be quiet, and the reason would be invisible.
#
# THE FIX IS NOT A LOWER THRESHOLD. Lowering it to reach a number is the move this
# project refuses; two drafters are two drafters however they are labelled. The
# window widens instead: compare against the most recent EARLIER day that adds
# enough drafts to make a qualifying player arithmetically possible, and say which
# window was used.

def test_A_DAY_TOO_THIN_TO_QUALIFY_ANYBODY_WIDENS_THE_WINDOW():
    """08-13 -> 08-14 adds 2 drafts, so no player can reach 3 new selections. The
    answer is to reach further back, not to lower the bar.

    MUTATION: keep the one-day window — `ranked` is empty, every row lands in
    `ranking_excluded_thin`, and a quiet day is indistinguishable from a broken
    instrument."""
    ser = [_md("2026-08-12", "2026", {"1": (20.0, 100)}, 119),
           _md("2026-08-13", "2026", {"1": (21.0, 104)}, 125),
           _md("2026-08-14", "2026", {"1": (21.5, 106)}, 127)]
    r = C.latest_marginal(ser, "2026")
    assert r["status"] == "measured", r
    assert (r["earlier"], r["later"]) == ("2026-08-12", "2026-08-14"), r
    assert r["window_days"] == 2 and r["window_qualifying"] == 1, r
    assert r["rows"]["1"]["new_selections"] == 6
    # AND THE PROVIDER'S FIGURE IS CARRIED WITHOUT DECIDING: +8 here, which would
    # also have passed the old total_drafts test — the two agree in this fixture
    # and the point is that only one of them is consulted.
    assert r["provider_total_drafts_delta"] == 8


def test_THE_WINDOW_STAYS_AT_ONE_DAY_WHEN_ONE_DAY_IS_ENOUGH():
    """Widening is a fallback, not the default: the whole point is the MARGINAL
    day, and reaching back further than necessary blends days that could have been
    read separately.

    MUTATION: always take the widest window — the instrument stops being marginal
    and starts being a slow-moving average, which is the thing it was built to see
    past."""
    ser = [_md("2026-08-12", "2026", {"1": (20.0, 100)}, 119),
           _md("2026-08-13", "2026", {"1": (21.0, 104)}, 125),
           _md("2026-08-14", "2026", {"1": (21.5, 110)}, 131)]
    r = C.latest_marginal(ser, "2026")
    assert (r["earlier"], r["later"]) == ("2026-08-13", "2026-08-14")
    assert r["window_days"] == 1 and r["window_qualifying"] == 1


def test_IF_NO_WINDOW_IS_WIDE_ENOUGH_IT_SAYS_SO_rather_than_reporting_empty():
    """Two thin days in a row and nothing further back: there is genuinely no
    derivable marginal figure yet, and that must read as UNMEASURED with the
    reason, not as a market where nobody moved.

    MUTATION: report the widest window anyway — a table built on one new draft
    goes out labelled the same as one built on twelve."""
    ser = [_md("2026-08-13", "2026", {"1": (21.0, 104)}, 125),
           _md("2026-08-14", "2026", {"1": (21.5, 105)}, 126)]
    r = C.latest_marginal(ser, "2026")
    assert r["status"] == "unmeasured"
    assert "new selections" in r["note"]
    assert r["window_qualifying"] == 0


def test_A_SNAPSHOT_WITH_NO_total_drafts_STILL_DERIVES_THE_MARGINAL_DAY():
    """This test used to assert that a missing `total_drafts` did not manufacture
    a window, because the window arithmetic subtracted the field and a zero
    default made the widest window always look wide enough.

    THAT PREMISE IS GONE AND THAT IS THE POINT. The window is now decided by how
    many players cleared the selection floor — exact per-player integers — so
    `total_drafts` cannot corrupt it however it is missing or wrong. Re-aimed at
    the stronger property that replaced the guard: the day derives ANYWAY, and
    the provider's figure is reported as UNKNOWN rather than as a number.

    MUTATION: make the decision consult `total_drafts` again — a day MFL happened
    not to stamp becomes underivable, when every number the derivation needs is
    present on the players themselves."""
    ser = [_md("2026-08-13", "2026", {"1": (20.0, 100)}, 125),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 127)]
    ser[0]["total_drafts"] = None
    r = C.latest_marginal(ser, "2026")
    assert r["status"] == "measured", r
    assert r["rows"]["1"]["new_selections"] == 4
    assert r["provider_total_drafts_delta"] is None


# ── `total_drafts` IS NOT EXACT, SO IT MUST NOT DECIDE ANYTHING ──────────────
#
# MEASURED on the first real snapshot, 2026-08-14: MFL reports
# `totalDrafts = 127`, and 25 players carry a `draftsSelectedIn` LARGER than that
# — up to 130 — with `draftSelPct` up to 102.0. Recovering the denominator from
# each player's own pair (drafts / (sel_pct/100)) gives 127.0-128.4 for the 180
# players with 100+ drafts, so the pool really is ~127-128 and MFL's own
# aggregate disagrees with its own per-player counts by two or three.
#
# THAT IS FINE FOR THE MARGINAL ADP ITSELF, which uses per-player `drafts` — an
# exact integer. It is NOT fine for the window decision, which I wrote against
# `total_drafts` deltas: a field wrong by up to 3 cannot decide a threshold of 3.

def test_THE_WINDOW_IS_DECIDED_BY_PLAYERS_QUALIFYING_not_by_total_drafts():
    """`total_drafts` says the window gained only 1 — below the floor — while a
    player's own exact count gained 4. The player is what matters.

    MUTATION: decide on the `total_drafts` delta — a real, derivable marginal day
    is thrown away because MFL's aggregate under-reported by three, which it
    demonstrably does."""
    ser = [_md("2026-08-13", "2026", {"1": (20.0, 100)}, 125),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 126)]
    r = C.latest_marginal(ser, "2026")
    assert r["status"] == "measured", r
    assert r["rows"]["1"]["new_selections"] == 4
    assert r["window_qualifying"] == 1, r


def test_A_WINDOW_NOBODY_QUALIFIES_IN_WIDENS_even_if_total_drafts_looks_ample():
    """The mirror case: `total_drafts` claims +9, comfortably over the floor, but
    no player's own count moved by 3. Widening is decided by the players.

    MUTATION: trust the aggregate — the report goes out with an empty `ranked`
    table on a day it could have reached back one more and filled it."""
    ser = [_md("2026-08-12", "2026", {"1": (20.0, 100)}, 110),
           _md("2026-08-13", "2026", {"1": (20.5, 102)}, 119),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 128)]
    r = C.latest_marginal(ser, "2026")
    assert (r["earlier"], r["later"]) == ("2026-08-12", "2026-08-14"), r
    assert r["rows"]["1"]["new_selections"] == 4


def test_total_drafts_IS_STILL_REPORTED_but_labelled_as_the_providers_figure():
    """It is real context — the pool's rough size — and dropping it would lose a
    measurement. It just does not decide.

    MUTATION: stop reporting it — the reader loses the only handle on how big the
    pool is, and the inconsistency this test exists to document becomes invisible."""
    ser = [_md("2026-08-13", "2026", {"1": (20.0, 100)}, 125),
           _md("2026-08-14", "2026", {"1": (21.0, 104)}, 126)]
    r = C.latest_marginal(ser, "2026")
    assert r["provider_total_drafts_delta"] == 1
    assert "not" in (r.get("provider_total_drafts_note") or "").lower()


# ── THE DAILY AUDIT: what must never be wrong, and what is wrong every day ────
#
# Cory, 2026-08-14: "the daily data capture process needs to be correct and fixed
# so we don't keep having problems and the data itself needs to be accurate and we
# need understand what it means so we don't misuse it."
#
# Two categories, and conflating them is how a real alarm gets muted. A FATAL
# violation means OUR pipeline or the provider's export is broken and the day
# cannot be trusted. An OBSERVED inconsistency is MFL disagreeing with itself in a
# way that is present every day, bounded, and now understood — reporting it as a
# failure would make the audit red forever and therefore ignored.

def _real_ish(**over):
    d = {"observed_at": "2026-08-14", "year": "2026", "total_drafts": 127,
         "rows": {"1": 20.0, "2": 300.0},
         "dispersion": {"1": {"min_pick": 3, "max_pick": 60, "sel_pct": 99.0, "drafts": 126},
                        "2": {"min_pick": 200, "max_pick": 400, "sel_pct": 12.0, "drafts": 16}}}
    d["row_count"] = len(d["rows"])
    d.update(over)
    return d


def test_A_CLEAN_DAY_HAS_NO_FATAL_FINDINGS():
    r = C.snapshot_audit(_real_ish())
    assert r["fatal"] == [], r
    assert r["ok"] is True


def test_AN_ADP_OUTSIDE_ITS_OWN_MIN_MAX_IS_FATAL():
    """A mean pick outside the observed range of the picks it averages is
    arithmetically impossible. If it happens, `averagePick` and min/max are not
    describing the same population and NOTHING on the day may be trusted —
    including the marginal ADP, which assumes exactly that they do.

    MUTATION: skip the check — the single strongest evidence that the fields mean
    what we think stops being looked at."""
    d = _real_ish()
    d["rows"]["1"] = 500.0           # above its own max_pick of 60
    r = C.snapshot_audit(d)
    assert any(f["kind"] == "adp_outside_range" for f in r["fatal"]), r
    assert r["ok"] is False


def test_A_ROW_COUNT_THAT_LIES_IS_FATAL():
    """MUTATION: drop it — every coverage figure downstream reads `row_count`, so
    the archive would carry a permanent record whose own summary contradicts it."""
    d = _real_ish(row_count=999)
    assert any(f["kind"] == "row_count_mismatch" for f in C.snapshot_audit(d)["fatal"])


def test_DRAFTS_ABOVE_total_drafts_IS_OBSERVED_NOT_FATAL_and_is_QUANTIFIED():
    """This happens EVERY day. Measured 2026-08-14: 25 players carry a
    `draftsSelectedIn` above MFL's own `totalDrafts` of 127, up to 130, and 12
    carry `draftSelPct` above 100. Recovering the denominator from each player's
    own pair gives 127.0-128.4 across the 180 players with 100+ drafts, so the
    pool is ~127-128 and MFL's aggregate disagrees with its own per-player counts
    by two or three.

    REPORTING IT AS FATAL WOULD MAKE THE AUDIT RED EVERY MORNING and therefore
    ignored — the muted-alarm shape this project keeps finding. But it must be
    QUANTIFIED, because the day the excess jumps from 3 to 30 is the day
    something actually changed.

    MUTATION: treat it as fatal — the audit fails on its first real day and
    somebody switches it off."""
    d = _real_ish()
    d["dispersion"]["1"]["drafts"] = 130      # above total_drafts of 127
    d["dispersion"]["1"]["sel_pct"] = 102.0
    r = C.snapshot_audit(d)
    assert r["fatal"] == [], r
    obs = {o["kind"]: o for o in r["observed"]}
    assert obs["drafts_above_total"]["n"] == 1
    assert obs["drafts_above_total"]["worst_excess"] == 3
    assert obs["sel_pct_above_100"]["n"] == 1


def test_AN_OBSERVED_INCONSISTENCY_THAT_GROWS_PAST_ITS_BOUND_IS_FATAL():
    """Bounded is the whole reason it is tolerated. An excess of 3 on a pool of
    127 is MFL's aggregation lagging its own counts; an excess of 40 is a
    different fact and must not inherit the tolerance granted to the first.

    MUTATION: tolerate any excess — the category stops being "understood and
    bounded" and becomes "ignored", which is the same thing one word later."""
    d = _real_ish()
    d["dispersion"]["1"]["drafts"] = 200       # excess of 73 on a pool of 127
    r = C.snapshot_audit(d)
    assert any(f["kind"] == "drafts_above_total_UNBOUNDED" for f in r["fatal"]), r


# ── AN ABSENT DAY IS NOT A CORRUPT DAY ──────────────────────────────────────
#
# FOUND BY EXECUTING THE WORKFLOW STEP, NOT BY READING IT. The daily audit step
# does `C.snapshot_audit(today or {})`, and on a year the archive does not hold
# `today` is None — so every invariant ran against an empty dict and the first one
# fired FATAL `row_count_mismatch`, with a note accusing the archive of carrying
# "a permanent record whose own summary contradicts its contents". There was no
# record. There was no day.

def test_AN_ABSENT_SNAPSHOT_IS_UNMEASURED_not_a_fatal_row_count_mismatch():
    """The caller shape that produces this is the live one: `days[-1] if days else
    None`, then `or {}`. Reported as FATAL it makes the loudest possible claim —
    the archive is corrupt, do not use the day — out of the archive simply not
    holding the year that was asked for.

    MUTATION: drop the guard and let `{}` fall through — `row_count` is None,
    `len(rows)` is 0, they differ, and the audit condemns an archive that is
    fine."""
    out = C.snapshot_audit({})
    assert out["status"] == "unmeasured"
    assert out["fatal"] == [] and out["observed"] == []
    assert out["ok"] is None, "ok must be None, not False — False is a verdict"
    assert out["players"] == 0
    assert "NOT a clean bill of health" in out["note"]
    # AND None IS THE SAME CASE, because the live caller passes `today or {}`.
    assert C.snapshot_audit(None)["status"] == "unmeasured"


def test_A_REAL_SNAPSHOT_STILL_REPORTS_measured_so_the_guard_discriminates():
    """The other arm. A guard that swallowed every snapshot would make the audit
    permanently silent, which is a worse failure than the one it fixes.

    MUTATION: return the unmeasured shape unconditionally — every morning reports
    "no snapshot", nobody's invariants are ever checked, and the escalation fires
    daily until it is switched off."""
    snap = {"year": "2026", "observed_at": "2026-08-14",
            "rows": {"1": 10.0, "2": 20.0}, "row_count": 2, "total_drafts": 100,
            "dispersion": {"1": {"min_pick": 5.0, "max_pick": 15.0, "drafts": 50,
                                 "sel_pct": 100.0},
                           "2": {"min_pick": 12.0, "max_pick": 30.0, "drafts": 50,
                                 "sel_pct": 100.0}}}
    out = C.snapshot_audit(snap)
    assert out["status"] == "measured"
    assert out["players"] == 2
    assert out["ok"] is True and out["fatal"] == []
    assert out["checked"], "a measured audit must name the invariants it ran"


def test_THE_MEASURED_RETURN_CARRIES_A_STATUS_at_all():
    """`snapshot_audit` never returned a `status` key, so the workflow's headline
    printed a literal `None` beside a real result and any reader branching on
    status saw the same value for a clean day and a missing one. The absent-day
    guard above is only usable because both paths now answer the same question.

    MUTATION: return the measured dict without `status` — the workflow's
    `r["status"] != "measured"` raises KeyError on every healthy morning, which
    the new SystemExit turns into a red job on good data."""
    snap = {"year": "2026", "observed_at": "2026-08-14", "rows": {"1": 10.0},
            "row_count": 1, "total_drafts": 100, "dispersion": None}
    for got in (C.snapshot_audit(snap), C.snapshot_audit({})):
        assert "status" in got, got
        assert got["status"] in ("measured", "unmeasured")
        assert set(("status", "ok", "fatal", "observed", "checked", "players")) <= set(got)


# ── A TRUNCATED 200 IS THE ONLY BROKEN RESPONSE THAT LOOKS LIKE A GOOD DAY ───
#
# Measured by substituting the wire under `capture` and breaking it nine ways. A
# connection error, a 404, a 403, an empty body, garbage and a zero-player export
# ALL raise and leave the archive untouched. A 200 carrying 20 of 681 players in
# a perfectly valid MFL shape wrote a 20-row day with no complaint — into an
# APPEND-ONLY archive whose days cannot be refetched.
#
# ⚠ THESE TEST `collapse_verdict`, NOT A COPY OF IT. The first cut left the
# condition inline in `capture` — which is `pragma: no cover` egress — so the
# tests pinned a reimplementation of the arithmetic living in THIS FILE. The
# mutation gate killed nothing: changing the shipped condition left them all
# green. The function was extracted for that reason and nothing else.


def _cday(n, day="2026-08-13", year="2026"):
    return {"year": year, "observed_at": day,
            "rows": {str(i): float(i + 1) for i in range(n)},
            "row_count": n, "total_drafts": 120, "dispersion": None}


def test_A_BOARD_THAT_KEEPS_UNDER_HALF_OF_YESTERDAY_IS_REFUSED():
    """20 of 681 is 2.9%. The largest REAL day-over-day loss this feed has shown
    is 36 of 708 — 5.1% — so a floor at 50% sits ten times above the drift and
    cannot fire on it.

    MUTATION: reuse `ROW_DROP_FLOOR` (30 ROWS) as the write-time bar — an ordinary
    Tuesday that sheds 36 marginal players is refused, and the archive starts
    losing real, unrefetchable days to its own alarm."""
    ser = [_cday(681)]
    assert C.collapse_verdict(20, ser, "2026", "2026-08-14")["refuse"] is True
    assert C.collapse_verdict(340, ser, "2026", "2026-08-14")["refuse"] is True
    assert C.collapse_verdict(341, ser, "2026", "2026-08-14")["refuse"] is False
    # AND THE REAL OBSERVED DRIFT MUST SURVIVE — this is the calibration itself.
    assert C.collapse_verdict(672, [_cday(708)], "2026", "2026-08-14")["refuse"] is False


def test_THE_FIRST_DAY_HAS_NO_YESTERDAY_AND_SAYS_SO_rather_than_passing():
    """A season's first capture has nothing to compare. Refusing it would lose the
    first day of every year; reporting a plain pass would be a check whose only
    possible answer is "nothing yet" claiming to have looked (rule 13f).

    MUTATION: return `refuse: True` when `prior` is empty — no 2027 board is ever
    archived. Or return a bare `refuse: False` with `status: measured` — the first
    morning of the season certifies a board nothing examined."""
    got = C.collapse_verdict(681, [], "2026", "2026-08-14")
    assert got["refuse"] is False
    assert got["status"] == "first_day"
    assert got["was"] is None and got["kept"] is None
    # A DIFFERENT YEAR'S DAYS ARE NOT A YESTERDAY EITHER.
    other = C.collapse_verdict(681, [_cday(700, year="2025")], "2026", "2026-08-14")
    assert other["status"] == "first_day"


def test_A_PREVIOUS_DAY_WITH_NO_ROWS_IS_NOT_A_DENOMINATOR():
    """Two days archived before the parser worked hold no rows. A share of zero is
    not a quantity, and `now / 0` is the crash — inside the guard that stands
    between a good board and the disk.

    MUTATION: divide anyway — the guard raises ZeroDivisionError, `capture` catches
    it, prints "COULD NOT RUN", and every day after an empty one is written
    unjudged with nobody the wiser."""
    got = C.collapse_verdict(681, [_cday(0)], "2026", "2026-08-14")
    assert got["refuse"] is False and got["status"] == "prior_empty"
    assert got["kept"] is None


def test_THE_FLOOR_IS_A_SEPARATE_CONSTANT_FROM_THE_REPORTING_ONE():
    """Two thresholds meaning different things must not be one name (rule 11).
    `ROW_DROP_FLOOR` is 30 ROWS and reports inside `coverage`, AFTER the write;
    this is a FRACTION and refuses BEFORE it.

    MUTATION: set them equal — 30 read as a share refuses every board smaller than
    thirty times yesterday, which is every board there has ever been."""
    assert C.COLLAPSE_KEEP_FRACTION != C.ROW_DROP_FLOOR
    assert 0.0 < C.COLLAPSE_KEEP_FRACTION < 1.0, "a share, not a row count"
    assert C.ROW_DROP_FLOOR >= 1, "a row count, not a share"


def test_THE_COMPARISON_IS_AGAINST_YESTERDAY_not_the_first_or_the_biggest_day():
    """Against the biggest day ever seen, one unusually deep morning permanently
    raises the bar and later normal days are refused. Against the first, the bar
    never moves with the feed.

    MUTATION: take `prior[0]` instead of the latest — with a 700-row day on the
    10th and a 300-row day on the 13th, today's ordinary 310 is refused against a
    board four days stale."""
    ser = [_cday(700, "2026-08-10"), _cday(300, "2026-08-13")]
    got = C.collapse_verdict(310, ser, "2026", "2026-08-14")
    assert got["was"] == 300, "must compare against the LATEST earlier day"
    assert got["refuse"] is False
    # AND THE SAME BOARD AGAINST THE WRONG DAY IS WHAT THE MUTATION DOES.
    assert C.collapse_verdict(310, [_cday(700, "2026-08-10")],
                              "2026", "2026-08-14")["refuse"] is True


def test_A_LATER_DAY_IS_NOT_A_YESTERDAY():
    """A same-day re-run must compare against the day BEFORE, not against the copy
    of itself already in the archive — which would always be a 100% keep and pass
    unconditionally.

    MUTATION: drop the `< observed_at` filter — a re-dispatched truncated morning
    compares 20 rows against the 20 already written by the bad run, keeps 100%,
    and the collapse is certified clean on its second attempt."""
    ser = [_cday(681, "2026-08-13"), _cday(20, "2026-08-14")]
    got = C.collapse_verdict(20, ser, "2026", "2026-08-14")
    assert got["was"] == 681, "the same date must not be its own baseline"
    assert got["refuse"] is True


# ── ARE TWO DAYS ONE CUMULATIVE SERIES AT ALL ───────────────────────────────
#
# THE GAP IS BETWEEN A PER-PLAYER GUARD AND A POPULATION ONE. `marginal_adp`
# already refuses an INDIVIDUAL player whose count fell, which handles MFL's
# aggregation lag. It cannot see the provider RE-SCOPING its sample — a rolling
# window advancing, a season boundary, a format filter changing — where counts
# fall for many players at once, the per-player guard drops every one of them,
# and the marginal comes back as a real-looking number over whichever players
# survived the break.
#
# ⚠ WRITTEN BEFORE THE FIRST DAY IT CAN FIRE. The archive holds one dispersion
# day; tomorrow is the first morning two exist to compare. A guard that arrives
# after the day it was needed is a post-mortem.


def _cum(dt, n, cnt, td=100, start=0):
    return {"year": "2026", "observed_at": dt, "total_drafts": td,
            "rows": {str(i): 10.0 + i for i in range(start, start + n)},
            "dispersion": {str(i): {"drafts": cnt, "min_pick": 1.0,
                                    "max_pick": 50.0, "sel_pct": 100.0}
                           for i in range(start, start + n)}}


def test_A_POOL_RESET_IS_CAUGHT_even_though_every_player_would_be_dropped_singly():
    """Every count falls, so `marginal_adp`'s per-player refusal would drop every
    row and report "nothing qualified" — a fact about the floor, not about the
    provider re-scoping its sample.

    MUTATION: rely on the per-player guard alone — a partial reset (say half the
    pool) leaves the other half, `new = drafts1 - drafts0` is computed for them,
    and a marginal ADP is published over a population selected by the break."""
    got = C.cumulative_break(_cum("2026-08-13", 50, 40, td=100),
                             _cum("2026-08-14", 50, 10, td=30))
    assert got["status"] == "measured"
    assert got["usable"] is False
    assert got["fell"] == 50 and got["fell_share"] == 1.0
    assert got["total_drafts_fell"] is True
    assert "not one accumulating series" in got["note"]


def test_THE_AGGREGATION_LAG_IS_TOLERATED_so_the_alarm_can_be_believed():
    """MFL disagrees with itself every day — 25 of 681 players (3.7%) carried a
    count above `total_drafts` on 2026-08-14. A check that fires on a handful of
    players moving backwards would be red every morning and therefore unread.

    MUTATION: refuse on ANY fall — the ordinary daily lag stops the marginal
    being derived at all, and the instrument built to see today's drafters never
    sees one."""
    later = _cum("2026-08-14", 100, 55, td=120)
    later["dispersion"]["0"] = dict(later["dispersion"]["0"], drafts=40)
    got = C.cumulative_break(_cum("2026-08-13", 100, 50, td=100), later)
    assert got["fell"] == 1
    assert got["usable"] is True
    assert "within the" in got["note"]


def test_THE_PROVIDERS_OWN_TOTAL_FALLING_IS_ENOUGH_on_its_own():
    """`total_drafts` is an aggregate that LAGS its own per-player counts — this
    module measured that — so it decides nothing by itself normally. But it is
    cumulative too, and a cumulative aggregate going DOWN is the provider having
    re-scoped, whatever the per-player share says.

    MUTATION: judge on the player share alone — a re-scope that happens to leave
    most individual counts alone (a format filter dropping whole leagues) passes,
    and the marginal is derived across a boundary."""
    got = C.cumulative_break(_cum("2026-08-13", 100, 50, td=200),
                             _cum("2026-08-14", 100, 55, td=120))
    assert got["fell"] == 0, "no player moved backwards"
    assert got["total_drafts_fell"] is True
    assert got["usable"] is False, got


def test_TWO_DAYS_WITH_NO_SHARED_COUNTS_ARE_UNMEASURED_not_clean():
    """The days archived before the dispersion parser landed carry no counts at
    all. Reported as "no falls" they would read as a verified cumulative series,
    which is the strongest possible claim resting on nothing.

    MUTATION: return `usable: True` on an empty overlap — every pair involving a
    pre-dispersion day certifies itself."""
    # ⚠ THE TWO ABSENCES ARE DIFFERENT AND EACH MUST NAME ITSELF. The first cut
    # accepted either note for either case, so a mutation collapsing the two
    # branches SURVIVED — the test could not tell them apart.
    #
    # (a) NO OVERLAP AT ALL: one day has no dispersion, or the ids are disjoint.
    for a, b in (({"observed_at": "2026-08-12", "dispersion": None},
                  _cum("2026-08-14", 10, 20)),
                 (_cum("2026-08-13", 10, 20, start=0),
                  _cum("2026-08-14", 10, 30, start=500))):
        got = C.cumulative_break(a, b)
        assert got["status"] == "unmeasured", got
        assert got["usable"] is None
        assert "share no player" in got["note"], got["note"]

    # (b) THE PLAYERS OVERLAP BUT NEITHER DAY CARRIES A COUNT — the days archived
    # before `dispersion_of` parsed `draftsSelectedIn`. A separate branch, and
    # without this case it is unreachable from any fixture here.
    def _nocount(dt):
        d = _cum(dt, 10, 20)
        d["dispersion"] = {k: {"min_pick": 1.0, "max_pick": 50.0, "drafts": None}
                           for k in d["dispersion"]}
        return d
    got = C.cumulative_break(_nocount("2026-08-13"), _nocount("2026-08-14"))
    assert got["status"] == "unmeasured", got
    assert got["usable"] is None
    assert "BOTH days" in got["note"], got["note"]


def test_latest_marginal_REFUSES_A_BROKEN_PAIR_and_says_which_it_was():
    """The consumer. "Nothing qualified" and "the series broke" are different
    facts and only one of them is about the market — a reader who gets the first
    concludes the drafters were quiet.

    MUTATION: drop the check from the window loop — the reset pair is used, every
    player is refused individually, and the run reports UNMEASURED with a note
    about the new-selection floor."""
    healthy = [_cum("2026-08-13", 50, 40, td=100), _cum("2026-08-14", 50, 50, td=120)]
    assert C.latest_marginal(healthy, "2026")["status"] == "measured"

    # ⚠ A PARTIAL RESET, NOT A TOTAL ONE, AND THAT IS THE WHOLE TEST. The first
    # fixture reset EVERY player, so `marginal_adp`'s per-player guard alone
    # already produced `unmeasured` and the mutation that removes this check
    # SURVIVED. The dangerous case is the one where survivors WOULD qualify: half
    # the pool is re-scoped, the other half still clears the new-selection floor,
    # and a marginal ADP is published over a population selected by the break.
    earlier = _cum("2026-08-13", 50, 40, td=100)
    later = _cum("2026-08-14", 50, 50, td=120)
    for i in range(25):                      # half the pool goes backwards
        later["dispersion"][str(i)] = dict(later["dispersion"][str(i)], drafts=5)
    survivors = sum(1 for i in range(25, 50))
    assert survivors >= C.MIN_NEW_SELECTIONS, "the survivors must be able to qualify"
    got = C.latest_marginal([earlier, later], "2026")
    assert got["status"] == "unmeasured", (
        "half the pool was re-scoped and the other half still clears the floor — "
        "without the series check this publishes a marginal over the survivors")
    assert got["cumulative_break"]["usable"] is False
    assert got["cumulative_break"]["fell"] == 25
    assert "not one accumulating series" in got["cumulative_break"]["note"]


def test_THE_TOLERANCE_IS_DECLARED_AND_THE_OBSERVED_SHARE_IS_REPORTED():
    """This archive holds ONE dispersion day, so no day-over-day count movement
    has ever been observed and the bar cannot be derived from any. It is set from
    the only related figure that HAS been measured — the 3.7% same-day
    aggregation lag — and the OBSERVED share is reported every day so it can be
    re-derived from real movement once there is some.

    MUTATION: report only the verdict — the number that would let anyone
    recalibrate this is thrown away daily, and the declared bar becomes permanent
    by default."""
    got = C.cumulative_break(_cum("2026-08-13", 100, 50), _cum("2026-08-14", 100, 55))
    assert got["fell_share"] is not None
    assert got["tolerance"] == C.CUMULATIVE_FALL_TOLERANCE
    assert 0.0 < C.CUMULATIVE_FALL_TOLERANCE < 1.0
