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
    coverage figure and becomes a copy of `row_count`."""
    d = C.dispersion_of(_parsed(min_pick=None, max_pick=None, sel_pct=None))
    assert d == {}


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
# OPTIONAL AND ADDITIVE, ON PURPOSE. `board_vs_market.py` is A's and reads this
# report; silently reclassifying misses would move A's numbers without A asking.
# Passing no `kept` reproduces today's output exactly.

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
    """A's `board_vs_market.py` reads this report. MUTATION: classify anyway — A's
    numbers move under them without A asking, which is the lane boundary breaking
    quietly rather than loudly."""
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

WRITE_PATH = ["coverage", "load_players", "merge_players", "append_snapshot"]
GUARDS = ["integrity"]
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
    import inspect
    import re as _re
    body = inspect.getsource(C.capture)
    known = set(WRITE_PATH) | set(GUARDS) | set(SOURCE) | {"load", "save", "capture"}
    called = {m.group(1) for m in _re.finditer(r"\b([a-z_][a-z0-9_]*)\(", body)}
    module_level = {n for n in called if hasattr(C, n) and n not in dir(__builtins__)}
    missing = module_level - known
    assert not missing, (
        "capture() calls %s and neither list covers them — classify each as WRITE "
        "PATH (may abort, must be loud and leave no partial file) or GUARD (must "
        "never cost the day)" % sorted(missing))


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
