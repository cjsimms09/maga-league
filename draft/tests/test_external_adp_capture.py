"""D3's ARCHIVE — the only recoverable copy of the 2026 curve.

Written break-first: each assertion below exists because the mutation named in
its docstring was applied first and the suite was watched. The mutations matter
more than usual here, because every one of them produces an archive that LOOKS
complete — a date is present, rows are present, coverage reports a number — and
the damage only surfaces months later as a league quietly failing F5.

Run: python3 -m pytest draft/tests/test_external_adp_capture.py -q
"""
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
