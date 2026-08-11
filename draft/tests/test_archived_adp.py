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
    assert "UNANSWERED FOR 7 OF 7" in v
    assert "not about whether dated boards exist" in v
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


def test_UNANSWERED_IS_KEYED_ON_THE_ARCHIVE_QUERY_not_on_both_halves_failing():
    """MEASURED on the first real run: 10 of 15 CDX queries came back unreached and
    the probe printed ROUTE 1 IS CLOSED — because `unreachable` had been computed as
    "live failed AND archive failed", and the live fetches had succeeded. The
    archive query is the one that decides F5. A target whose page loads fine while
    its index query times out has told us NOTHING.

    That is the exact false negative this module exists to prevent, produced by the
    module itself. MUTATION: require both halves to fail. A working site with an
    unreachable index reads as proof that no dated board exists."""
    v = X.route1_verdict(hits=[], probed=15, unreachable=10)
    assert "UNANSWERED FOR 10 OF 15" in v
    assert "CLOSED" not in v
    # ...and it says how many WERE answered, so a partial answer is not read as none.
    assert "5 target(s) WERE answered" in v


def test_a_closure_still_requires_EVERY_target_to_have_been_answered():
    """The other side of the same rule: CLOSED is only available when nothing was
    left unreached. MUTATION: allow a closure with one unanswered target and the
    verdict overstates its own coverage by exactly that target."""
    assert "CLOSED ON THIS EVIDENCE" in X.route1_verdict(hits=[], probed=15, unreachable=0)
    assert "CLOSED" not in X.route1_verdict(hits=[], probed=15, unreachable=1)


# ── a capture is a snapshot ATTEMPT, not a guarantee ───────────────────────
def test_A_DUD_NEWEST_CAPTURE_DOES_NOT_HIDE_THE_ONES_BEHIND_IT():
    """MEASURED on the first successful run: FantasyPros' overall page had a capture
    at 20240731003217 that returned ZERO BYTES — 32 seconds after a sibling capture
    that served 422KB. The probe took the newest capture, judged it, and gave up, so
    the target was reported as serving no board while earlier captures sat
    unexamined in the same index.

    "The newest capture was a dud" and "no capture serves a board" are different
    findings. MUTATION: take captures[0] and stop. The second gets reported when
    only the first is true, and Route 1 closes on an empty HTTP response."""
    caps = [{"timestamp": "20240731003217", "original": "https://fp.example/adp"},
            {"timestamp": "20240731003145", "original": "https://fp.example/adp"}]
    # No digits in the fixture names: the detector rejects "Name0" for the same
    # reason it rejects "Week 3", and a fixture the code is right to refuse
    # proves nothing about the code.
    board = "<td><a>Player Name</a></td>" * 60
    served = {"https://web.archive.org/web/20240731003145id_/https://fp.example/adp": board}
    got = X.first_serving_capture(caps, lambda u: served.get(u, ""))
    assert got["state"] == "board" and got["timestamp"] == "20240731003145"
    # Every capture examined is reported, so a hit is never a lucky draw from a
    # list nobody can see.
    assert [e["timestamp"] for e in got["examined"]] == ["20240731003217", "20240731003145"]
    assert got["examined"][0]["empty"] is True


def test_AN_EMPTY_BODY_AND_A_PAGE_WITHOUT_A_BOARD_ARE_DIFFERENT_FINDINGS():
    """One is a fetch that returned nothing; the other is content we read and
    judged. The first run gave both the same label, `not-a-board`."""
    assert X.looks_like_a_board("")["empty"] is True
    assert X.looks_like_a_board("<html>a real page, no players</html>")["empty"] is False
    caps = [{"timestamp": "20240731000000", "original": "https://x.example/a"}]
    assert X.first_serving_capture(caps, lambda u: "")["state"] == "empty"
    assert X.first_serving_capture(caps, lambda u: "<html>hi</html>")["state"] == "not-a-board"


# ── the known-answer check the probe's own verdict demands ──────────────────
def test_REAL_NFL_NAMES_SURVIVE_THE_EXTRACTOR():
    """A page that parses is not a page that is right, and the only check that can
    tell is a human reading the top of the board. So the sample has to contain
    PLAYERS.

    Real names break a tidy pattern, and a tidy one returns nothing silently:
    Ja'Marr Chase (apostrophe), CeeDee Lamb (internal capital), Amon-Ra St. Brown
    (hyphen, period, three words), A.J. Brown (initials), Kenneth Walker III.
    MUTATION: require [A-Z][a-z]+ twice. It matches NONE of these, the hand-check
    sample comes back empty, and an empty sample reads as a page with no players."""
    real = ["Ja'Marr Chase", "CeeDee Lamb", "Amon-Ra St. Brown", "A.J. Brown",
            "D'Andre Swift", "Bijan Robinson", "Kenneth Walker III"]
    html = "".join("<td class=p><a href=/x>%s</a></td>" % n for n in real)
    got = X.extract_names(html)
    assert got == real, "lost: %r" % [n for n in real if n not in got]


def test_THE_SAMPLE_IS_NOT_POLLUTED_WITH_NAVIGATION():
    """Two capitalised words in a row is a loose pattern and it catches menus, ad
    copy and city names. A sample full of "Draft Kit" and "Green Bay" cannot be
    hand-checked, which is the only thing it is for. MUTATION: drop the filter, and
    the count that called it a board was counting furniture."""
    nav = "<a>Fantasy Football</a><a>Draft Kit</a><a>Mock Draft</a><a>Green Bay</a>"
    got = X.extract_names(nav + "<td><a>Bijan Robinson</a></td>")
    assert got == ["Bijan Robinson"], got


def test_the_names_come_out_IN_DOCUMENT_ORDER():
    """An ADP board's first rows are its top picks. Order is what makes the sample
    checkable: the right players in roughly the right order is the evidence."""
    names = ["First Player", "Second Player", "Third Player"]
    html = "".join("<td><a>%s</a></td>" % n for n in names)
    assert X.extract_names(html, limit=2) == names[:2]
    # JSON boards are read in order too, and take precedence when both are present.
    j = '{"players":[{"name":"Alpha One"},{"name":"Beta Two"}]}'
    assert X.extract_names(j) == ["Alpha One", "Beta Two"]


# ── a filter on my own query can manufacture a negative ────────────────────
def test_FILTERING_TO_200_CAN_MAKE_A_LIVE_PAGE_LOOK_ABANDONED():
    """A site that starts 301-redirecting a URL keeps being captured — under 301,
    not 200 — so `filter=statuscode:200` makes a heavily-archived page look like one
    nobody saved. That is a fact about my query, not the publisher.

    Measured suspicion, not invented: FantasyPros' PPR page has a 2024-07-31 capture
    while its HALF-PPR page's newest is 2023-12-09 — same site, same crawler, which
    is what a redirect on one path and not the other looks like.

    MUTATION: hard-code the filter. The redirected page reports zero captures and
    Route 1 closes on a URL the archive holds hundreds of copies of."""
    assert "filter=statuscode%3A200" in X.cdx_query("https://x.example/a", "20240801")
    assert "filter" not in X.cdx_query("https://x.example/a", "20240801", only_200=False)


def test_THE_STATUSES_ARE_COUNTED_so_a_filtered_page_is_visible_as_filtered():
    """"No captures" and "captures we excluded" are different findings, and only one
    of them is about the publisher. MUTATION: drop statuscode from the parsed rows.
    The two collapse into the same empty list and the distinction is unrecoverable."""
    head = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]
    body = json.dumps([head,
                       ["k", "20240715120000", "https://x/a", "text/html", "301", "D", "0"],
                       ["k", "20240716120000", "https://x/a", "text/html", "301", "D", "0"],
                       ["k", "20231209010000", "https://x/a", "text/html", "200", "D", "9"]])
    rows = X.parse_cdx(body)
    assert X.status_census(rows) == {"301": 2, "200": 1}
    assert all(r.get("statuscode") for r in rows)


# ── the count that called it a board was counting furniture ────────────────
def test_A_NAVIGATION_MENU_IS_NOT_A_BOARD_however_many_bytes_it_is():
    """THE WRONG ANSWER, REPRODUCED. Two FantasyPros captures scored as boards at
    422KB and 480KB and Route 1 was reported OPEN. The hand-check read:

        Draft Wizard, NFL Draft Contest, View Contest, Game Day, My Account,
        My Leagues, Mobile Apps, FantasyPros Championship, Discord Chat, Sign Out

    Zero of fifteen were players. `looks_like_a_board` counts capitalised pairs, and
    a content-heavy site's menu clears any such threshold on its own.

    MUTATION: keep shape-counting as the test. A menu is reported as a dated
    pre-draft board and the 2027 timeline 'collapses' on site chrome."""
    menu = "".join("<a>%s</a>" % n for n in [
        "Draft Wizard", "NFL Draft Contest", "View Contest", "Game Day", "My Account",
        "My Leagues", "Mobile Apps", "Discord Chat", "Sign Out", "NFL Home",
        "Waiver Central", "Waiver Assistant", "Free Agent Finder", "Trade Analyzer",
        "Trade Central", "Start Sit", "Player News", "Depth Charts", "Injury Report",
        "Rest Of", "Season Rankings", "Draft Kit", "Mock Draft", "Best Ball"] * 3)
    known = {"ja'marr chase", "bijan robinson", "ceedee lamb", "saquon barkley",
             "amon-ra st. brown", "tyreek hill", "justin jefferson", "breece hall",
             "garrett wilson", "puka nacua", "jahmyr gibbs", "chris olave"}
    # The OLD test says yes...
    assert X.looks_like_a_board(menu)["is_board"] is True, "the fixture must reproduce the defect"
    # ...the known-answer test says no.
    v = X.board_confidence(menu, known)
    assert v["is_board"] is False and v["player_hits"] == 0


def test_a_REAL_board_clears_the_known_answer_test():
    known = {"ja'marr chase", "bijan robinson", "ceedee lamb", "saquon barkley",
             "amon-ra st. brown", "tyreek hill", "justin jefferson", "breece hall",
             "garrett wilson", "puka nacua", "jahmyr gibbs", "chris olave"}
    html = "<a>Draft Wizard</a><a>My Account</a>" + "".join(
        "<td><a>%s</a></td>" % n.title().replace("St. Brown", "St. Brown") for n in known)
    v = X.board_confidence(html, known)
    assert v["is_board"] is True, v
    assert v["player_hits"] >= 10
    # The hits are RETURNED so the verdict can be read rather than trusted.
    assert v["matched"] and all(h.lower() in known for h in v["matched"])


def test_the_known_answer_comes_from_OUR_OWN_BOARD_not_a_hand_written_list():
    """A list of "players I expect" would be a third derivation of something we
    already hold, and it would drift. MUTATION: hard-code a list; it goes stale the
    first time the board changes and nothing says so."""
    names = X.board_names({"players": [{"name": "Bijan Robinson"}],
                           "kept_players": [{"name": "CeeDee Lamb"}]})
    assert names == {"bijan robinson", "ceedee lamb"}
    assert X.board_names({}) == set() and X.board_names(None) == set()


def test_BYTE_COUNT_IS_NOT_EVIDENCE():
    """422KB of menu is still menu. MUTATION: admit a page on size."""
    known = {"bijan robinson"}
    huge = "<a>Draft Wizard</a>" * 40000
    assert len(huge) > 400000
    assert X.board_confidence(huge, known)["is_board"] is False


def test_THE_CAPTURE_WALK_IS_GATED_ON_THE_JUDGE_NOT_ON_SHAPE():
    """The walk stops at the first capture that PASSES. Gated on shape, it stopped
    on the first navigation menu it found and returned it as the board — so the
    injected judge is what makes the walk honest, and a walk that ignores it would
    reproduce the wrong answer with the right test sitting unused.

    MUTATION: ignore `judge` and use looks_like_a_board. The menu capture is
    returned and the real board behind it is never examined."""
    menu = "".join("<a>Draft Wizard</a><a>My Account</a><a>Trade Analyzer</a>" for _ in range(40))
    real = "".join("<td><a>%s</a></td>" % n for n in
                   ["Bijan Robinson", "CeeDee Lamb", "Saquon Barkley"] * 20)
    caps = [{"timestamp": "20240730000000", "original": "https://x/a"},
            {"timestamp": "20240715000000", "original": "https://x/a"}]
    served = {X.replay_url(caps[0]): menu, X.replay_url(caps[1]): real}
    known = {"bijan robinson", "ceedee lamb", "saquon barkley"}
    got = X.first_serving_capture(caps, lambda u: served[u],
                                  judge=lambda b: X.board_confidence(b, known, min_hits=3))
    assert got["state"] == "board" and got["timestamp"] == "20240715000000", got
    # Both captures reported, so the skip is visible.
    assert [e["timestamp"] for e in got["examined"]] == ["20240730000000", "20240715000000"]
