"""ROUTE 1's SEARCH — every mutation below produces a FALSE NEGATIVE.

That direction is the point. A probe that wrongly reports ROUTE 1 IS CLOSED does not
fail loudly; it ends an investigation, and the 2027 timeline stands on a bug. The
first cut of this probe had exactly such a defect, found by reading it rather than by
running it, and it is the first test here.

Run: python3 -m pytest draft/tests/test_archived_adp.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import archived_adp as X  # noqa: E402


def cdx(*rows):
    """A CDX response in the shape the index actually returns: HEADER ROW FIRST."""
    head = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]
    return json.dumps([head] + [list(r) for r in rows])


def row(ts, url="https://ffc.example/adp/ppr", mime="application/json", length="9000"):
    return ("com,example)/adp", ts, url, mime, "200", "DIGEST", length)


# ── the defect that would have closed Route 1 on our own query ──────────────
def test_the_search_ENUMERATES_captures_instead_of_asking_for_the_CLOSEST_one():
    """THE DEFECT, stated as the test. The Wayback availability API returns the
    capture closest to a timestamp IN EITHER DIRECTION. If the closest is 2024-08-15
    and a good 2024-07-20 capture also exists, a probe built on it sees only August,
    marks it after the cutoff, and reports ROUTE 1 IS CLOSED — a fact about the
    query, not about the archive.

    The CDX query carries a `to` bound, so what comes back is bounded by the cutoff
    rather than centred on it. MUTATION: drop `to`. Every capture ever taken is
    returned and the newest is post-cutoff, which is the same false negative."""
    q = X.cdx_query("https://ffc.example/adp/ppr", "20240801")
    assert "to=20240801" in q
    assert "output=json" in q
    # NEGATIVE limit, or the index returns captures from the dawn of the archive:
    # they predate the cutoff trivially and price a season nobody drafted.
    assert "limit=-8" in q


def test_a_capture_BEFORE_the_cutoff_survives_even_when_a_LATER_one_exists():
    """The whole point: the later capture must not hide the earlier one."""
    rows = X.parse_cdx(cdx(row("20240815120000"), row("20240720090000")))
    usable = X.usable_captures(rows, "20240801")
    assert [r["timestamp"] for r in usable] == ["20240720090000"]


# ── the shape, quoted rather than pictured ──────────────────────────────────
def test_the_HEADER_ROW_is_not_parsed_as_a_CAPTURE():
    """MUTATION: read `body` as rows without stripping the header. The literal
    string "timestamp" becomes a capture date, and `"timestamp" < "20240801"` is
    False — so the header is silently dropped as post-cutoff and nothing looks
    wrong. Then a REAL capture at index 0 is consumed as the header and lost."""
    rows = X.parse_cdx(cdx(row("20240720090000")))
    assert len(rows) == 1 and rows[0]["timestamp"] == "20240720090000"
    assert all(r["timestamp"] != "timestamp" for r in rows)


def test_an_EMPTY_INDEX_and_an_UNREADABLE_ONE_are_not_the_same_return():
    """"No captures" and "we could not read the answer" are opposite findings. One
    closes a route, the other means we have not asked yet. MUTATION: return [] on
    anything unparseable, and every transport failure reads as a closure."""
    assert X.parse_cdx("") == []
    assert X.parse_cdx("[]") == []
    with pytest.raises(TypeError):
        X.parse_cdx('{"error": "blocked"}')
    with pytest.raises(TypeError):
        X.parse_cdx('["not-a-header-list"]')
    with pytest.raises(ValueError):
        X.parse_cdx('[["urlkey","statuscode"],["x","200"]]')


# ── F5's strictly-before, in one place ──────────────────────────────────────
def test_a_SAME_DAY_capture_is_NOT_before_the_draft():
    """`to=` in the CDX query is INCLUSIVE, so the strict test has to live here.
    MUTATION: use `<=`. A board captured the morning of the draft is admitted as
    pre-draft evidence when it may have been observed after picks were made."""
    rows = X.parse_cdx(cdx(row("20240801000001"), row("20240731235959")))
    assert [r["timestamp"] for r in X.usable_captures(rows, "20240801")] == ["20240731235959"]


def test_a_capture_with_an_UNREADABLE_DATE_is_dropped_not_admitted():
    """F5 is about the observation date. A board whose date we cannot read is a
    board with no date, and admitting it would put an undated board into the one
    filter that exists to require one."""
    rows = X.parse_cdx(cdx(row("2024"), row("notadate00"), row("20240720090000")))
    assert [r["timestamp"] for r in X.usable_captures(rows, "20240801")] == ["20240720090000"]


# ── what gets fetched, and what counts as a board ───────────────────────────
def test_the_REPLAY_URL_asks_for_the_RAW_bytes_not_the_archive_page():
    """MUTATION: drop `id_`. An archived JSON endpoint comes back wrapped in the
    Wayback toolbar, and the content check then scores the ARCHIVE'S CHROME as
    evidence about the board."""
    u = X.replay_url({"timestamp": "20240720090000", "original": "https://ffc.example/api"})
    assert u == "https://web.archive.org/web/20240720090000id_/https://ffc.example/api"


def test_a_200_WITH_NOTHING_IN_IT_is_not_a_board():
    """The archive serves error pages, empty JSON and "page not available" with a
    200. MUTATION: treat status 200 as the hit. Route 1 is reported OPEN on a page
    containing no players at all, and the next step is grading against it."""
    assert X.looks_like_a_board("<html>Sorry, this page is not available</html>")["is_board"] is False
    assert X.looks_like_a_board("[]")["is_board"] is False
    board = '{"players":[' + ",".join('{"name":"P%d","adp":%d}' % (i, i) for i in range(60)) + "]}"
    v = X.looks_like_a_board(board)
    assert v["is_board"] is True and v["rows_seen"] == 60


def test_an_HTML_board_counts_too_and_the_COUNT_is_reported_beside_the_verdict():
    """A marginal result has to be visible as marginal rather than rounded to yes."""
    html = "".join("<td class='player'>Player Name</td>" for _ in range(51))
    v = X.looks_like_a_board(html)
    assert v["is_board"] is True and v["html_rows"] == 51
    assert X.looks_like_a_board(html, min_rows=200)["is_board"] is False


# ── the verdict cannot record an unanswered question as a closed one ────────
def test_AN_UNREACHABLE_ARCHIVE_IS_UNANSWERED_NOT_CLOSED():
    """Every archive.org request from the sandbox returned a proxy 403. That is a
    fact about egress. MUTATION: fall through to the CLOSED line when nothing was
    reachable, and a network block is written down as evidence that no dated board
    exists — the premature write-off that closed the FFC arm once already."""
    v = X.route1_verdict(hits=[], probed=7, unreachable=7)
    assert "UNANSWERED" in v and "egress" in v
    assert "CLOSED" not in v


def test_a_CLOSURE_states_exactly_what_it_rules_out():
    v = X.route1_verdict(hits=[], probed=7)
    assert "CLOSED ON THIS EVIDENCE" in v and "SOURCES AND DATES PROBED" in v
    assert "does not rule out" in v


def test_an_OPEN_route_is_not_yet_a_USABLE_board():
    """A page that parses is not a page that is right. The hit is permission to
    check the content, never permission to grade against it."""
    v = X.route1_verdict(hits=[{"target": "FFC"}], probed=7)
    assert "ROUTE 1 IS OPEN" in v
    assert "NOT yet usable" in v and "known answer" in v


# ── the question is not "does an API take a date" ───────────────────────────
def _live(state, rows=0):
    return {"state": state, "rows": rows}


def _arch(state, ts=None, rows=0, captures=0):
    return {"state": state, "timestamp": ts, "rows": rows, "captures": captures}


def test_a_YEAR_LABELLED_BOARD_SERVED_TODAY_DOES_NOT_SATISFY_F5():
    """THE TRAP THIS PROBE IS SHAPED AROUND. "2024 ADP" retrieved in 2026 is a claim
    made in the present about the past. Nothing in it establishes what the board
    showed before the 2024 drafts — and MFL's year aggregate ACCUMULATES over that
    season's whole draft calendar, which this program has already measured. A
    year-labelled board is as contaminated as a live one and wears a date on its
    face, which makes it worse: it invites the mistake.

    MUTATION: treat a content-dated live board as a hit. Route 1 reports OPEN, the
    2027 timeline 'collapses', and every grade built on it is contaminated by drafts
    that happened after the decision being graded."""
    r = X.classify("MFL api adp", X.CONTENT_DATED, _live("board", 300), _arch("none"))
    assert r["verdict"].startswith("LEAD ONLY")
    assert "ACCUMULATES" in r["verdict"]
    assert r["verdict"] != "SATISFIES F5"


def test_an_ARCHIVE_CAPTURE_satisfies_F5_whatever_the_page_says_about_itself():
    """The archive's stamp is a third party recording WHEN it saw the content. That
    is evidence, not a label, and it is what F5 asks for."""
    r = X.classify("FFC page ppr", X.ARCHIVE_DATED,
                   _live("board", 200), _arch("board", "20240715120000", 180, 3))
    assert r["verdict"] == "SATISFIES F5"
    assert r["archived_timestamp"] == "20240715120000"
    # A content-dated target is upgraded by a capture too — the basis is what dated
    # it, and a capture dates anything.
    assert X.classify("MFL api adp", X.CONTENT_DATED, _live("board"),
                      _arch("board", "20240715120000", 180, 1))["verdict"] == "SATISFIES F5"


def test_a_URL_THAT_RETURNS_NOTHING_is_evidence_about_THE_URL():
    """Rule 13, and the user named this failure directly: the FFC arm was written
    off once on a User-Agent failure that turned out to be about our own request.
    Some of these paths are guesses. A 404 on a guessed path says the guess was
    wrong, not that the publisher offers no historical board."""
    r = X.classify("mirror ffverse adp", X.CONTENT_DATED, _live("absent"), _arch("none"))
    assert "evidence about this URL" in r["verdict"]
    assert "not about the publisher" in r["verdict"]


def test_the_TWO_KINDS_OF_HIT_ARE_NEVER_SUMMED():
    """MUTATION: report `len(satisfies) + len(leads)`. Twelve content-dated leads
    become "12 dated boards found", which is the contamination F5 exists to prevent
    wearing the shape of a positive result."""
    rows = [X.classify("MFL api adp", X.CONTENT_DATED, _live("board", 300), _arch("none")),
            X.classify("FP half year", X.CONTENT_DATED, _live("board", 250), _arch("none")),
            X.classify("mirror x", X.CONTENT_DATED, _live("absent"), _arch("none"))]
    rep = X.route1_report(rows)
    assert rep["satisfies_f5"] == []
    assert len(rep["content_dated_leads"]) == 2
    assert "CLOSED ON THIS EVIDENCE" in rep["verdict"]
    assert "CONTENT-DATED LEADS" in rep["verdict"] and "NOT counted above" in rep["verdict"]
    assert "evidence about the paths this probe constructed" in rep["verdict"]


def test_ONE_REAL_CAPTURE_OPENS_THE_ROUTE_even_beside_a_pile_of_leads():
    rows = [X.classify("FFC page ppr", X.ARCHIVE_DATED, _live("board", 200),
                       _arch("board", "20240715120000", 180, 4)),
            X.classify("MFL api adp", X.CONTENT_DATED, _live("board", 300), _arch("none"))]
    rep = X.route1_report(rows)
    assert len(rep["satisfies_f5"]) == 1 and len(rep["content_dated_leads"]) == 1
    assert "ROUTE 1 IS OPEN" in rep["verdict"] and "NOT yet usable" in rep["verdict"]


def test_the_CANDIDATE_LIST_lives_in_CODE_and_names_what_would_date_each():
    """A probe whose targets are typed inline each run cannot have its negative
    trusted — nobody can tell what it actually asked. The list is reviewable,
    diffable, and identical between runs, and every entry declares its date basis."""
    c = X.candidates(2024)
    assert len(c) >= 12
    assert all(b in (X.ARCHIVE_DATED, X.CONTENT_DATED) for _, _, b in c)
    names = [n for n, _, _ in c]
    assert len(set(names)) == len(names), "duplicate target names make the report ambiguous"
    urls = [u for _, u, _ in c]
    joined = " ".join(urls)
    assert "2024" in joined, "the year must reach the URLs, or every target is the live board"

    # THE COVERAGE THE NEGATIVE RESTS ON. "No dated board exists" is only as broad
    # as what was asked, so a target quietly dropped from this list makes the
    # closure over-broad without changing a single test that only counts the total.
    # Per-publisher counts, and BOTH DATE BASES where the publisher offers both.
    # MUTATION: delete one FantasyPros year URL. A domain check still passes.
    # Set at the ACTUAL counts, not below them: a threshold with slack in it is a
    # threshold that lets exactly one target vanish unnoticed. Adding targets stays
    # free; removing one has to be a deliberate edit here.
    for domain, least in (("fantasyfootballcalculator.com", 5),
                          ("fantasypros.com", 5),
                          ("myfantasyleague.com", 3)):
        n = sum(1 for u in urls if domain in u)
        assert n >= least, "%s probed %d times, expected >= %d" % (domain, n, least)
    for domain in ("fantasypros.com", "fantasyfootballcalculator.com"):
        bases = {b for _, u, b in c if domain in u}
        assert bases == {X.ARCHIVE_DATED, X.CONTENT_DATED}, (
            "%s must be probed BOTH as a live board the archive can date AND as the "
            "publisher's own year-labelled page: %r" % (domain, bases))


def test_a_FANTASYPROS_SHAPED_page_is_not_scored_as_EMPTY():
    """FFC puts the name straight in the cell; FantasyPros wraps it in an anchor
    inside the cell. A cell-only pattern scores a real FantasyPros board as empty —
    a false negative about a real board, the direction this probe must not fail in.
    MUTATION: keep only the `<td>Name` pattern."""
    fp = "".join('<td class="player-label"><a href="/x">Player Name</a></td>' for _ in range(60))
    assert X.looks_like_a_board(fp)["is_board"] is True
    assert X.looks_like_a_board("<html>Page not available</html>")["is_board"] is False
