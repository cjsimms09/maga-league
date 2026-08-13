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
