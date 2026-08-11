# TERRITORY: C
"""ROUTE 1 — finding a pre-draft ADP board that was OBSERVABLY FROZEN before a draft.

F5 does not require a provider to support a date parameter. It requires a board whose
observation date is KNOWABLE and strictly earlier than the decisions being graded. A
dated web-archive capture is exactly that, which is why "no as-of endpoint" — the
answer both live probes returned — does not settle Route 1.

THE DEFECT THIS FILE EXISTS TO PREVENT, found by reading the probe before dispatching
it rather than by running it. The first cut asked the Wayback AVAILABILITY API:

    https://archive.org/wayback/available?url=...&timestamp=20240801

which returns the capture CLOSEST to that timestamp — in either direction. If the
closest capture is 2024-08-15 and a perfectly good 2024-07-20 capture also exists, the
probe sees the August one, marks it AFTER-CUTOFF, finds no usable board, and reports
ROUTE 1 IS CLOSED. That negative would be an artifact of the query, not a fact about
the archive: rule 13, and the same premature write-off that closed the FFC arm once on
a User-Agent failure that turned out to be about our own request.

So the search uses the CDX index instead, which ENUMERATES captures and takes a `to`
bound. Asking for captures up to a date and reading the latest of them answers the
question actually being asked — is there ANY capture before the draft — instead of one
capture's accidental position relative to it.

Everything here is pure and tested offline. The workflow does the fetching, the same
split every probe in this lane lives with.
"""
from __future__ import annotations

import json
import urllib.parse

CDX = "https://web.archive.org/cdx/search/cdx"

# How many captures to pull. `limit` is NEGATIVE so the index returns the LAST
# matches rather than the first: the most useful capture is the latest one still
# preceding the cutoff — closest to the draft while genuinely predating it. A
# positive limit would return captures from the dawn of the archive, which predate
# the cutoff trivially and price a season nobody drafted.
DEFAULT_LIMIT = 8


def cdx_query(url: str, before: str, limit: int = DEFAULT_LIMIT, only_200=True,
              since=None) -> str:
    """The index URL for "captures of `url` at or before `before` (YYYYMMDD)".

    `to` is INCLUSIVE of its day, and F5 wants strictly-before. The query stays wide
    and `usable_captures` applies the strict test, so the strictness lives in exactly
    one place instead of being split across a URL and a comparison.

    `only_200` IS A FILTER ON MY OWN QUERY, and it can manufacture a negative. A site
    that starts 301-redirecting a URL keeps being captured — under 301, not 200 — so
    filtering to 200 makes a live, heavily-archived page look abandoned. The suspicion
    is measured, not invented: FantasyPros' PPR page has a 2024-07-31 capture while
    its HALF-PPR page's newest is 2023-12-09, same site and same crawler, which is
    what a redirect on one path and not the other looks like.

    So the caller can drop the filter and SEE the statuses, rather than inferring a
    publisher's behaviour from a list this query pre-emptied.
    """
    q = {"url": url, "to": str(before), "output": "json",
         "limit": str(-abs(int(limit))), "collapse": "timestamp:8"}
    if since:
        # A WINDOW, not just a ceiling. One capture proves a board existed; a REPLAY
        # needs the latest snapshot before EACH draft, so the question that decides
        # whether Route 1 is usable rather than merely interesting is how many
        # distinct days across a preseason serve one. `collapse=timestamp:8` already
        # gives at most one row per day, so the count of rows IS the count of days.
        q["from"] = str(since)
    if only_200:
        q["filter"] = "statuscode:200"
    return CDX + "?" + urllib.parse.urlencode(q)


def preseason_window(year) -> tuple:
    """(from, to) for a season's PRESEASON, as YYYYMMDD.

    June 1 to August 31. Stated as a rule rather than tuned per season: drafts
    cluster in late August, so a window that stops at the cutoff would report
    coverage only for the earliest drafters and call it the whole picture.
    """
    y = int(year)
    return ("%d0601" % y, "%d0831" % y)


def capture_days(rows) -> list:
    """Distinct capture DAYS, newest first. The unit a replay actually consumes.

    Two captures on one day are one day of coverage — a draft on the 15th is served
    by the latest capture before it, and a second capture that morning adds nothing.
    Counting rows instead of days would overstate coverage by however often the
    crawler happened to double up.
    """
    return sorted({str(r.get("timestamp") or "")[:8] for r in rows or []
                   if len(str(r.get("timestamp") or "")) >= 8}, reverse=True)


def status_census(rows) -> dict:
    """{statuscode: n} over captures, so a filtered-away page is visible as filtered.

    "No captures" and "captures we excluded" are different findings and only one of
    them is about the publisher.
    """
    from collections import Counter
    c = Counter(str(r.get("statuscode") or "?") for r in rows or [])
    return dict(c.most_common())


def parse_cdx(body) -> list:
    """CDX JSON -> [{timestamp, original, mimetype, length}], newest first.

    THE SHAPE, quoted rather than assumed: the response is a list whose FIRST ROW IS
    THE HEADER, not a list of objects —

        [["urlkey","timestamp","original","mimetype","statuscode","digest","length"],
         ["com,example)/", "20240715120000", "http://example.com/", "text/html",
          "200", "ABC", "1234"]]

    A consumer that skipped the header would parse the literal string "timestamp" as
    a capture date and compare it to a cutoff, and `"timestamp" < "20240801"` is
    False, so it would silently drop a real capture. That is the defect class this
    program has hit six times: a reader written against the shape its author pictured.

    An EMPTY response is a list with no rows at all — not an error, and not a
    capture. Anything that is not a list of lists raises rather than returning
    nothing, because "no captures" and "we could not read the answer" are opposite
    findings and must not share a return value.
    """
    if isinstance(body, (bytes, bytearray)):
        body = body.decode("utf-8", "replace")
    if isinstance(body, str):
        body = body.strip()
        if not body:
            return []
        body = json.loads(body)
    if not isinstance(body, list):
        raise TypeError("CDX response is %s, not a list — cannot tell an empty index "
                        "from an unreadable one" % type(body).__name__)
    if not body:
        return []
    head = body[0]
    if not isinstance(head, list):
        raise TypeError("CDX first row is %s, not the header list" % type(head).__name__)
    idx = {name: i for i, name in enumerate(head)}
    if "timestamp" not in idx or "original" not in idx:
        raise ValueError("CDX header lacks timestamp/original: %r" % (head,))
    rows = []
    for r in body[1:]:
        if not isinstance(r, list) or len(r) <= idx["timestamp"]:
            continue
        rows.append({"timestamp": str(r[idx["timestamp"]]),
                     "original": r[idx["original"]],
                     # KEPT so an unfiltered query can report WHY a page looked
                     # abandoned. Without it, "no 200s" and "no captures" collapse
                     # into the same empty list.
                     "statuscode": (r[idx["statuscode"]] if "statuscode" in idx
                                    and len(r) > idx["statuscode"] else None),
                     "mimetype": r[idx["mimetype"]] if "mimetype" in idx
                                 and len(r) > idx["mimetype"] else None,
                     "length": r[idx["length"]] if "length" in idx
                               and len(r) > idx["length"] else None})
    rows.sort(key=lambda x: x["timestamp"], reverse=True)
    return rows


def usable_captures(rows, before: str) -> list:
    """Captures STRICTLY before `before`. A same-day capture is not before the draft.

    `to=` in the query is inclusive, so this is where F5's strictly-before actually
    holds. A capture whose timestamp is unparseable is dropped rather than admitted:
    a board whose observation date we cannot read is a board with no observation
    date, and F5 is about the date.
    """
    out = []
    for r in rows or []:
        ts = str(r.get("timestamp") or "")
        if len(ts) < 8 or not ts[:8].isdigit():
            continue
        if ts[:8] < str(before):
            out.append(r)
    return out


def replay_url(row) -> str:
    """The RAW archived bytes, not the Wayback page wrapped around them.

    `id_` after the timestamp is what makes this the original response. Without it an
    archived JSON endpoint comes back inside the Archive's HTML toolbar, and a
    content check looking for a player board would be reading the wrapper — scoring
    the archive's chrome as evidence about the board.
    """
    return "https://web.archive.org/web/%sid_/%s" % (row["timestamp"], row["original"])


def looks_like_a_board(text, min_rows=50) -> dict:
    """Is this a PLAYER BOARD, or a 200 with nothing in it?

    A status code is not evidence. The archive happily serves error pages, empty
    JSON and "this page is not available" with a 200, and a probe that counted those
    as hits would report Route 1 OPEN on a page containing no players at all.

    Two shapes are counted because two are expected: a JSON board with "name" keys
    and an HTML table with "Firstname Lastname" cells. The count is returned beside
    the verdict so a marginal result is visible as marginal rather than rounded to a
    yes.
    """
    import re
    text = text.decode("utf-8", "replace") if isinstance(text, (bytes, bytearray)) else (text or "")
    json_rows = len(re.findall(r'"name"\s*:\s*"', text))
    # TWO HTML SHAPES, because the sources write the name differently. FFC puts it
    # straight in the cell; FantasyPros wraps it in an anchor inside the cell, and a
    # cell-only pattern scores that page as EMPTY — a false negative about a real
    # board, which is the direction this whole probe must not fail in.
    html_rows = max(
        len(re.findall(r"<td[^>]*>\s*[A-Z][a-z]+ [A-Z][a-z'.-]+", text)),
        len(re.findall(r">\s*[A-Z][a-z]+ [A-Z][a-z'.-]+\s*<", text)))
    rows = max(json_rows, html_rows)
    return {"rows_seen": rows, "json_rows": json_rows, "html_rows": html_rows,
            # AN EMPTY BODY IS NOT A PAGE WITHOUT A BOARD. Measured: the 2024-07-31
            # capture of FantasyPros' overall page came back at ZERO BYTES and was
            # filed as `not-a-board`, alongside a sibling capture 32 seconds later
            # that served 422KB. One is a fetch that returned nothing; the other is a
            # page whose content we read and judged. Same label, opposite meanings.
            "empty": len(text) == 0,
            "is_board": rows >= min_rows, "bytes": len(text)}


def first_serving_capture(captures, fetch, min_rows=50, tries=4, judge=None) -> dict:
    """Walk pre-cutoff captures NEWEST FIRST until one actually serves a board.

    THE DEFECT THIS FIXES, measured on the first successful run. The probe took
    `usable[0]` — the single latest capture before the cutoff — judged it, and gave
    up. FantasyPros' overall page had a capture at 20240731003217 that returned ZERO
    BYTES, so the target was reported as serving no board while earlier captures in
    the same index sat unexamined.

    A capture is a snapshot attempt, not a guarantee: the archive holds empty ones,
    redirects and error pages under a 200. "The newest capture was a dud" and "no
    capture serves a board" are different findings, and taking the first is how the
    second gets reported when only the first is true.

    Every capture examined is reported, so a hit is never a lucky draw from a list
    nobody can see.
    """
    tried = []
    for cap in (captures or [])[:max(1, tries)]:
        body = fetch(replay_url(cap))
        shape = looks_like_a_board(body, min_rows)
        # THE JUDGE IS INJECTED so the walk cannot be gated on shape by accident.
        # Shape-counting stopped this walk on the first navigation menu it found.
        v = judge(body) if judge else shape
        tried.append({"timestamp": cap["timestamp"], "bytes": shape["bytes"],
                      "rows": v.get("player_hits", shape["rows_seen"]),
                      "empty": shape["empty"]})
        if v["is_board"]:
            return {"state": "board", "timestamp": cap["timestamp"],
                    "rows": v.get("player_hits", shape["rows_seen"]),
                    "bytes": shape["bytes"], "body": body, "examined": tried}
    return {"state": "empty" if (tried and all(t["empty"] for t in tried)) else "not-a-board",
            "timestamp": tried[0]["timestamp"] if tried else None,
            "rows": 0, "examined": tried}


# Words that appear in these pages and are NOT players. Two capitalised words in a
# row is a loose pattern and it will catch navigation, ad copy and section headings;
# a sample polluted with them cannot be hand-checked, which is the only thing it is
# for.
_NOT_PLAYERS = frozenset((
    "fantasy football", "draft kit", "mock draft", "start sit", "waiver wire",
    "trade value", "my playbook", "sign in", "sign up", "expert consensus",
    "half point", "point ppr", "best ball", "dynasty rankings", "player news",
    "injury report", "depth charts", "free agent", "privacy policy", "terms of",
    "contact us", "about us", "all rights", "las vegas", "new york", "green bay",
    "kansas city", "san francisco", "tampa bay", "new england", "new orleans",
    "los angeles", "united states",
))


def extract_names(text, limit=15) -> list:
    """The first plausible player names, in document order, for a KNOWN-ANSWER check.

    RULE 11, and this probe's own verdict demands it: a page that parses is not a
    page that is right. `looks_like_a_board` counts shapes; it cannot tell a board
    of 2024 NFL players from a board of anything else with 200 capitalised pairs on
    it. The only check that can is a human reading the top of the list and seeing
    whether those are the players who actually went early.

    So the names come out in ORDER — an ADP board's first rows are its top picks,
    and a list that opens with the right players in roughly the right order is
    evidence the page is what it claims. A list that opens with "Draft Kit" and
    "Mock Draft" is a navigation menu, and the count that called it a board was
    counting furniture.
    """
    import re
    text = text.decode("utf-8", "replace") if isinstance(text, (bytes, bytearray)) else (text or "")
    found, seen = [], set()
    # CSV FIRST, because a CSV contains neither of the other two shapes and would
    # otherwise read as a page with no players at all. MEASURED: the mirror
    # enumeration found `ecr_20190818.csv`, `HALF_PPR_ADP.csv` and
    # `fantasypros/ecr/2021/9_6_2021/HALF_PPR.csv` — dated boards, exactly what Route
    # 1 is looking for — and every one came back 0/0 because this function knew only
    # JSON `"name":` and HTML `>Name<`. A reader written for the formats its author
    # had in mind, applied to a third, returning zero: the same defect this program
    # has now hit seven times, and this time it was hiding the lead.
    csv_names = _csv_names(text, limit)
    if csv_names:
        return csv_names
    for m in re.finditer(r'"name"\s*:\s*"([^"]{3,40})"', text):
        cand = m.group(1).strip()
        if cand.lower() not in seen:
            seen.add(cand.lower()); found.append(cand)
        if len(found) >= limit:
            return found
    # REAL NFL NAMES BREAK A TIDY PATTERN, and a tidy one silently returns nothing:
    # Ja'Marr Chase (apostrophe), CeeDee Lamb (internal capital), Amon-Ra St. Brown
    # (hyphen, period, three words), A.J. Brown (initials). A first cut required
    # [A-Z][a-z]+ twice and matched NONE of them, which would have produced an empty
    # hand-check sample and read as "the page has no players".
    for m in re.finditer(r">\s*([A-Z][A-Za-z'.’-]+(?:\s+[A-Z][A-Za-z'.’-]+){1,2})\s*<", text):
        cand = m.group(1).strip()
        low = cand.lower()
        if low in _NOT_PLAYERS or low in seen:
            continue
        seen.add(low); found.append(cand)
        if len(found) >= limit:
            break
    return found


def route1_verdict(hits, probed, unreachable=0, leads=0, bad_urls=0) -> str:
    """What a negative here does and does not rule out.

    An UNREACHABLE archive is not a closed route — it is an unanswered one, and the
    distinction is the whole reason this runs in CI rather than the sandbox, where
    every archive.org request returned a proxy 403 that says nothing about the
    archive.
    """
    # WHAT COUNTS AS UNANSWERED, and the first run got this wrong. `unreachable` is
    # the number of targets whose ARCHIVE query failed — not the number where BOTH
    # the live fetch and the archive query failed. The archive query is the one that
    # decides F5; a target whose live page loaded fine while its CDX query timed out
    # has told us nothing about whether a pre-draft capture exists.
    #
    # MEASURED 2026-08-11, first real run: 10 of 15 CDX queries came back unreached
    # and this function printed ROUTE 1 IS CLOSED, because `unreachable` had been
    # computed as `live_failed AND archive_failed` and the live fetches had
    # succeeded. That is the exact false negative this whole module was written to
    # prevent, produced by the module itself.
    if unreachable and not hits:
        return ("ROUTE 1 UNANSWERED FOR %d OF %d TARGETS: the archive index did not "
                "answer for them, so no capture was ruled in OR out. That is a statement "
                "about reaching the index, not about whether dated boards exist, and it "
                "must not be recorded as a closure. %d target(s) WERE answered"
                % (unreachable, probed, probed - unreachable))
    if hits:
        return ("ROUTE 1 IS OPEN: %d dated pre-cutoff board(s) of %d targets probed. An "
                "archived board with a knowable observation date satisfies F5 without any "
                "provider supporting a date parameter. It is NOT yet usable: a page that "
                "parses is not a page that is right, and the content must be checked "
                "against a known answer before anything is graded against it" % (len(hits), probed))
    tail = ""
    if leads:
        # THE MOST DANGEROUS RESULT SHAPE. A pile of "2024 ADP" pages that all
        # resolve today looks exactly like success and satisfies nothing.
        tail += ("; %d target(s) are CONTENT-DATED LEADS — a board the publisher labels "
                 "with a year and serves today. That label is a claim made now about then. "
                 "MFL's own year aggregate ACCUMULATES over the whole season's drafts, so a "
                 "year-labelled board is as contaminated as a live one and harder to spot. "
                 "These are NOT counted above and must not be graded against" % leads)
    if bad_urls:
        tail += ("; %d URL(s) returned no board at all, which is evidence about the paths "
                 "this probe constructed and NOT about whether those publishers offer "
                 "historical boards" % bad_urls)
    return ("ROUTE 1 IS CLOSED ON THIS EVIDENCE: no capture strictly predating the cutoff "
            "returned a recognisable board, across %d targets. Stated precisely: this rules "
            "out THE SOURCES AND DATES PROBED. It does not rule out a paid archive, a source "
            "not on the list, or a capture the CDX index does not hold%s" % (probed, tail))


# ── WHAT ESTABLISHES THE DATE — the distinction the whole route turns on ────
#
# The question is not whether an API accepts a date parameter. It is whether anyone
# PUBLISHES A DATED PRESEASON BOARD. Two very different things can look like one:
#
#   ARCHIVE-DATED   a capture of a live board, stamped by the archive at the moment
#                   it was taken. The date is EVIDENCE — a third party recorded when
#                   it saw this content. Strictly before the drafts, this satisfies
#                   F5.
#
#   CONTENT-DATED   a page that SAYS a year: "2024 ADP", MFL's `/2024/export`. The
#                   date is a LABEL, applied by the publisher, retrievable today.
#                   It is a claim made in the present about the past, and nothing in
#                   it establishes what the board showed before the drafts.
#
# CONTENT-DATED IS NOT ENOUGH, and this is not pedantry — it is the failure already
# measured in this program. MFL's year aggregate ACCUMULATES: `/2024/export?TYPE=adp`
# retrieved now returns ADP over that season's drafts INCLUDING drafts that happened
# after any date being graded. A page labelled with a year is exactly as contaminated
# as a live board and wears a date on its face, which makes it worse than an
# undated one: it invites the mistake.
#
# So content-dated candidates are probed — they are the best URLs to look for in the
# archive — but a content-dated hit is reported as a LEAD, never as a satisfied F5.
ARCHIVE_DATED = "archive"
CONTENT_DATED = "content"


def candidates(year=2024) -> list:
    """The registered target list. Each entry names what would date it.

    Registered as a LIST IN CODE rather than assembled in the workflow so the set
    probed is reviewable, diffable, and identical between runs — a probe whose
    targets are typed inline each time cannot have its negative trusted, because
    nobody can tell what it actually asked.
    """
    y = int(year)
    return [
        # FFC — a JSON API and its rendered pages. No date parameter (measured), so
        # the archive is the only thing that can date these.
        ("FFC api half-ppr", "https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=12&year=%d" % y, CONTENT_DATED),
        ("FFC api ppr", "https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=%d" % y, CONTENT_DATED),
        ("FFC api standard", "https://fantasyfootballcalculator.com/api/v1/adp/standard?teams=12&year=%d" % y, CONTENT_DATED),
        ("FFC page half-ppr", "https://fantasyfootballcalculator.com/adp/half-ppr/12-team/all", ARCHIVE_DATED),
        ("FFC page ppr", "https://fantasyfootballcalculator.com/adp/ppr", ARCHIVE_DATED),
        # FantasyPros — publishes historical ADP pages. The bare page is a live board
        # (archive-dated only); the ?year= form is the publisher's own historical
        # board, which is content-dated and therefore a lead, not evidence.
        ("FP half live", "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php", ARCHIVE_DATED),
        ("FP ppr live", "https://www.fantasypros.com/nfl/adp/ppr-overall.php", ARCHIVE_DATED),
        ("FP overall live", "https://www.fantasypros.com/nfl/adp/overall.php", ARCHIVE_DATED),
        ("FP half year", "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php?year=%d" % y, CONTENT_DATED),
        ("FP ppr year", "https://www.fantasypros.com/nfl/adp/ppr-overall.php?year=%d" % y, CONTENT_DATED),
        # MFL — the API by year, and its rendered ADP report, which is a DIFFERENT
        # surface from the API and may be captured even where the API is not.
        ("MFL api adp", "https://api.myfantasyleague.com/%d/export?TYPE=adp&JSON=1" % y, CONTENT_DATED),
        ("MFL adp report", "https://www03.myfantasyleague.com/%d/adp" % y, CONTENT_DATED),
        ("MFL adp page", "https://www.myfantasyleague.com/%d/adp" % y, CONTENT_DATED),
        # SERVER-RENDERED CANDIDATES. Measured 2026-08-11: FantasyPros renders its
        # ADP table client-side, so neither its live HTML nor any capture of it
        # carries a player table — the captures that scored as boards were the site's
        # navigation. A source is only useful to Route 1 if the PLAYERS ARE IN THE
        # HTML, so these are here to be tested for exactly that by the known-answer
        # check, not because they are known to work.
        ("FantasyData adp", "https://fantasydata.com/nfl/adp", ARCHIVE_DATED),
        ("NFL.com adp", "https://fantasy.nfl.com/research/draftrankings", ARCHIVE_DATED),
        ("ESPN adp", "https://www.espn.com/fantasy/football/story/_/id/40000000/adp", ARCHIVE_DATED),
        ("FFToday adp", "https://www.fftoday.com/nfl/draft/adp.php", ARCHIVE_DATED),
        ("FFC page std", "https://fantasyfootballcalculator.com/adp/standard/12-team/all", ARCHIVE_DATED),
    ]


# Mirrors are ENUMERATED, not guessed: `github_tree_query` lists the repository and
# the paths come back from it. The first probe typed raw-file URLs and collected
# 404s, which is evidence about the typing. Repo + branch only — no filenames.
MIRROR_REPOS = (
    ("dynastyprocess", "data", "master"),
    ("ffverse", "ffopportunity", "main"),
    ("fantasydatapros", "data", "master"),
)


def classify(name, date_basis, live, archived) -> dict:
    """One target's outcome, with LIVE and ARCHIVED kept apart.

    BOTH ARE ASKED, and they answer different questions. `live` says whether the URL
    is real — a 404 is evidence about the URL I constructed, not about whether the
    publisher offers historical boards, and conflating those is how a probe reports
    "nobody publishes this" when it means "I guessed the path wrong". `archived`
    says whether a capture predating the drafts serves a board, which is the only
    thing that satisfies F5.

    A CONTENT-DATED target that is live and unarchived is a LEAD: the board exists,
    but nothing establishes it was frozen before the drafts.
    """
    out = {"target": name, "date_basis": date_basis,
           "live": (live or {}).get("state"), "live_rows": (live or {}).get("rows"),
           "archived": (archived or {}).get("state"),
           "archived_timestamp": (archived or {}).get("timestamp"),
           "archived_rows": (archived or {}).get("rows"),
           "pre_cutoff_captures": (archived or {}).get("captures")}
    if out["archived"] == "board":
        # The archive stamped it, so the date is evidence whatever the page says.
        out["verdict"] = "SATISFIES F5"
    elif out["live"] == "board" and date_basis == CONTENT_DATED:
        out["verdict"] = ("LEAD ONLY — publisher-labelled year, retrievable today. The "
                          "label is a claim made now about then; MFL's year aggregate "
                          "ACCUMULATES and this cannot be shown frozen before the drafts")
    elif out["live"] == "board":
        out["verdict"] = "LIVE BOARD, NO PRE-CUTOFF CAPTURE — real page, undated for our purpose"
    elif out["live"] in ("absent", "not-a-board"):
        out["verdict"] = "URL RETURNED NO BOARD — evidence about this URL, not about the publisher"
    else:
        out["verdict"] = "UNREACHED"
    return out


def route1_report(rows, unreachable=0) -> dict:
    """The route's answer, with the two kinds of hit never summed.

    Summing them is the one thing that would make this probe worse than useless: a
    pile of content-dated leads reported as "12 dated boards found" is precisely the
    contamination F5 exists to prevent, wearing the shape of a positive result.
    """
    satisfies = [r for r in rows if r.get("verdict") == "SATISFIES F5"]
    leads = [r for r in rows if str(r.get("verdict", "")).startswith("LEAD ONLY")]
    live_only = [r for r in rows if str(r.get("verdict", "")).startswith("LIVE BOARD")]
    bad_url = [r for r in rows if str(r.get("verdict", "")).startswith("URL RETURNED")]
    return {
        "probed": len(rows),
        "satisfies_f5": satisfies,
        "content_dated_leads": leads,
        "live_but_uncaptured": live_only,
        "urls_that_returned_nothing": bad_url,
        "unreachable": unreachable,
        "verdict": route1_verdict(satisfies, len(rows), unreachable, len(leads), len(bad_url)),
    }


def board_confidence(text, known_names, sample=40, min_hits=10) -> dict:
    """Is this a board OF NFL PLAYERS? Checked against a set of real player names.

    THE DEFECT THIS REPLACES, and it produced a WRONG ANSWER that was reported.
    `looks_like_a_board` counts SHAPES: capitalised pairs in table cells and anchors.
    A content-heavy site's navigation menu clears any such threshold on its own. So
    two FantasyPros captures were scored as boards at 422KB and 480KB, Route 1 was
    reported OPEN, and the hand-check sample turned out to read:

        Draft Wizard, NFL Draft Contest, View Contest, Game Day, My Account,
        My Leagues, Mobile Apps, FantasyPros Championship, Discord Chat, Sign Out...

    Zero of fifteen were players. The pages were the site's chrome, and the count
    that called them boards was counting furniture. Byte count is not evidence
    either: 422KB of menu is still menu.

    So the test is now a KNOWN-ANSWER test against names we already hold. A real ADP
    board's top rows are the players everybody drafted early, and our own board
    carries them; navigation carries none. This cannot be satisfied by volume.

    NOT AN EXACT-ERA MATCH, and it does not need to be. A 2024 board checked against
    a 2026 player set loses the retired and gains nothing — but the great majority of
    any season's early picks are still on a board two years later, so ten hits out of
    forty is a low bar that furniture cannot reach and a real board clears easily.
    `min_hits` is stated rather than tuned, and the hits are RETURNED so the verdict
    can be read rather than trusted.
    """
    known = {str(n).strip().lower() for n in (known_names or []) if n}
    names = extract_names(text, sample)
    hits = [n for n in names if n.strip().lower() in known]
    return {"names_seen": len(names), "player_hits": len(hits),
            "is_board": len(hits) >= min_hits, "matched": hits[:15],
            "sample": names[:15], "min_hits": min_hits}


def board_names(board_json) -> set:
    """Player names out of OUR OWN board file — the known answer, not a second list.

    Reads the same `players` + `kept_players` the crosswalk reads. A hand-written
    list of "players I expect" would be a third derivation of a thing we already
    hold, and it would drift.
    """
    d = board_json or {}
    out = set()
    for p in (d.get("players") or []) + (d.get("kept_players") or []):
        n = (p or {}).get("name")
        if n:
            out.add(str(n).strip().lower())
    return out


# ── mirrors: ENUMERATE the repository, do not guess filenames ───────────────
GITHUB_TREE = "https://api.github.com/repos/%s/%s/git/trees/%s?recursive=1"

# Filename fragments that would make a file worth opening. Deliberately loose: this
# decides what to LOOK at, not what to believe, and a narrow list here is another way
# of guessing.
_ADP_HINTS = ("adp", "average_draft", "average-draft", "ecr", "rankings", "draft_pick")


def github_tree_query(owner: str, repo: str, branch: str = "master") -> str:
    """The recursive tree listing for a repo.

    WHY THIS EXISTS. The first probe listed guessed raw-file URLs like
    `.../data/master/files/db_fpecr.csv`, and got 404s. A 404 on a path I invented is
    evidence about my invention — rule 13 — and reporting it as "this mirror has no
    ADP data" would be the write-off this whole module keeps guarding against.

    Listing the tree replaces the guess with a QUESTION the repository answers. If it
    holds a preseason board under any name, the name comes back; if it holds none,
    that is a fact about the repository rather than about my spelling.
    """
    return GITHUB_TREE % (owner, repo, branch)


def adp_files(tree_json, hints=_ADP_HINTS, limit=25) -> list:
    """Paths in a GitHub tree listing that might carry a draft board.

    The shape, quoted: {"sha":..., "tree":[{"path":..., "type":"blob", "size":...}],
    "truncated": bool}. TRUNCATION IS REPORTED rather than ignored — GitHub caps the
    recursive listing, and a truncated tree that found nothing has not searched the
    repository, which is a different finding from one that has.
    """
    if isinstance(tree_json, (bytes, bytearray)):
        tree_json = tree_json.decode("utf-8", "replace")
    if isinstance(tree_json, str):
        tree_json = json.loads(tree_json or "{}")
    if not isinstance(tree_json, dict):
        raise TypeError("GitHub tree response is %s, not an object" % type(tree_json).__name__)
    nodes = tree_json.get("tree")
    if nodes is None:
        # A rate-limit or 404 body is an object too, and returning [] for it would
        # report "no ADP files" for a repository we never listed.
        raise ValueError("no `tree` in the response: %r" % (list(tree_json)[:5],))
    out = []
    for n in nodes:
        if not isinstance(n, dict) or n.get("type") != "blob":
            continue
        path = str(n.get("path") or "")
        low = path.lower()
        if any(h in low for h in hints):
            out.append({"path": path, "size": n.get("size")})
        if len(out) >= limit:
            break
    return {"files": out, "truncated": bool(tree_json.get("truncated")),
            "listed": len(nodes)}


def raw_url(owner: str, repo: str, branch: str, path: str) -> str:
    """A tree path -> its raw bytes. Built from a path the repo GAVE us, not typed."""
    return "https://raw.githubusercontent.com/%s/%s/%s/%s" % (owner, repo, branch, path)


# Header labels that hold a player's name. MFL writes "Last, First"; several mirrors
# write first and last in separate columns, so both shapes are read.
_NAME_COLS = ("name", "player", "player_name", "playername", "full_name", "fullname",
              "player name", "merge_name", "mergename")
_FIRST_COLS = ("first_name", "firstname", "first")
_LAST_COLS = ("last_name", "lastname", "last")


def _csv_names(text, limit=15) -> list:
    """Player names out of a delimited file, or [] if this is not one.

    Uses the `csv` module rather than splitting on commas, because a board that
    writes `"Chase, Ja'Marr",CIN,WR` — MFL's own format, and several mirrors' — is
    exactly the row a naive split turns into two fields and a wrong name.

    The name COLUMN is found by its header, and a file with no such header returns
    nothing rather than guessing at column 0: a guess here would put team
    abbreviations or rank numbers into a hand-check sample whose only purpose is to
    be readable.
    """
    import csv as _csv
    import io as _io
    head = (text or "")[:200000]
    if "," not in head and "\t" not in head and ";" not in head:
        return []
    try:
        sniffed = _csv.Sniffer().sniff(head[:4096], delimiters=",\t;")
        delim = sniffed.delimiter
    except Exception:                                            # noqa: BLE001
        delim = ","
    try:
        rows = list(_csv.reader(_io.StringIO(head), delimiter=delim))
    except Exception:                                            # noqa: BLE001
        return []
    if len(rows) < 2:
        return []
    header = [str(h or "").strip().lower().lstrip("\ufeff") for h in rows[0]]
    name_i = next((i for i, h in enumerate(header) if h in _NAME_COLS), None)
    first_i = next((i for i, h in enumerate(header) if h in _FIRST_COLS), None)
    last_i = next((i for i, h in enumerate(header) if h in _LAST_COLS), None)
    out, seen = [], set()
    for r in rows[1:]:
        if name_i is not None and len(r) > name_i:
            cand = str(r[name_i] or "").strip()
        elif first_i is not None and last_i is not None and len(r) > max(first_i, last_i):
            cand = ("%s %s" % (str(r[first_i] or "").strip(),
                               str(r[last_i] or "").strip())).strip()
        else:
            return []
        # MFL and several mirrors write "Last, First". Normalised HERE so the
        # known-answer check compares names in one spelling, not two.
        if "," in cand:
            last, _, first = cand.partition(",")
            cand = ("%s %s" % (first.strip(), last.strip())).strip()
        low = cand.lower()
        if not cand or low in seen or low in _NOT_PLAYERS:
            continue
        seen.add(low); out.append(cand)
        if len(out) >= limit:
            break
    return out


# ── WHAT THE FILE MEASURES, and WHETHER IT WAS EVER FROZEN ──────────────────
#
# Two more ways a mirror can look like an answer and not be one, and both are the
# same failure this module already guards against on the live side.
#
# QUANTITY. `ecr_20190818.csv` is EXPERT CONSENSUS RANKINGS — what analysts said the
# order should be. ADP is what drafters actually did. They are different quantities,
# not a noisier and a cleaner version of one, and F1/F5 want the second: this program
# grades decisions against a market, and substituting a ranking for a market is the
# silent swap rule 11 exists to catch. An ECR file is reported, never counted as ADP.
#
# FROZEN. A file named `HALF_PPR_ADP.csv` that is rewritten every week is a LIVE board
# wearing a filename — the same trap as a page labelled "2024 ADP". What makes a
# mirror file usable is that its content stopped changing before the drafts it would
# price, and git records exactly that: a file whose LAST commit precedes the cutoff
# held that content before the cutoff, attested by a third party's history.
QUANTITY_ADP = "adp"
QUANTITY_ECR = "ecr"
QUANTITY_UNKNOWN = "unknown"

GITHUB_COMMITS = "https://api.github.com/repos/%s/%s/commits?path=%s&per_page=100"


def quantity_of(path: str) -> str:
    """Does this file hold ADP, a RANKING, or something we cannot tell?

    `adp` wins over `ecr` when both appear, because a path like
    `fantasypros/adp/HALF_PPR_ADP.csv` names its quantity in two places and a file
    under an `adp/` directory is an ADP file whatever else the name says. UNKNOWN is
    its own answer — a file we cannot classify is not an ADP file by default.
    """
    p = str(path or "").lower()
    if "adp" in p or "average_draft" in p or "average-draft" in p:
        return QUANTITY_ADP
    if "ecr" in p or "rank" in p:
        return QUANTITY_ECR
    return QUANTITY_UNKNOWN


def commits_query(owner: str, repo: str, path: str) -> str:
    return GITHUB_COMMITS % (owner, repo, urllib.parse.quote(path))


def commit_dates(body) -> dict:
    """{first, last, n} from a commits listing, newest-first as GitHub returns it.

    The shape, quoted: a LIST of {"commit": {"committer": {"date": "2019-08-19T..."}}}.
    A rate-limit or error body is an OBJECT, and treating it as an empty history
    would report a file as having no commits — which downstream reads as "we cannot
    date it" when the truth is "we were throttled". Raises instead.
    """
    if isinstance(body, (bytes, bytearray)):
        body = body.decode("utf-8", "replace")
    if isinstance(body, str):
        body = json.loads(body or "[]")
    if not isinstance(body, list):
        raise TypeError("commits response is %s, not a list — a throttled request is "
                        "not an empty history" % type(body).__name__)
    stamps = []
    for c in body:
        if not isinstance(c, dict):
            continue
        d = (((c.get("commit") or {}).get("committer") or {}).get("date")
             or ((c.get("commit") or {}).get("author") or {}).get("date"))
        if d:
            stamps.append(str(d))
    if not stamps:
        return {"first": None, "last": None, "n": 0}
    stamps.sort()
    return {"first": stamps[0], "last": stamps[-1], "n": len(stamps)}


def frozen_before(dates: dict, before: str) -> dict:
    """Did this file stop changing before the cutoff? F5's rule, applied to git.

    `before` is YYYYMMDD; commit dates are ISO. Compared on the date prefix, and
    STRICTLY — a file last written on the cutoff day is not a file that held its
    content before it.

    A file with NO readable history is not frozen. Absent is not a pass, here as
    everywhere: an undated board is exactly what F5 exists to refuse.
    """
    last = (dates or {}).get("last")
    if not last or len(str(last)) < 10:
        return {"frozen": False, "why": "no readable commit history — an undated file "
                                        "is what F5 refuses, not a file we may assume"}
    stamp = str(last)[:10].replace("-", "")
    if not stamp.isdigit():
        return {"frozen": False, "why": "unreadable commit date %r" % last}
    if stamp < str(before):
        return {"frozen": True, "last_commit": str(last),
                "why": "last written %s, before the %s cutoff — the content it holds "
                       "now is the content it held then" % (str(last)[:10], before)}
    return {"frozen": False, "last_commit": str(last),
            "why": "last written %s, ON OR AFTER the %s cutoff — this is a LIVE file "
                   "with a filename, and its current content is not evidence about "
                   "what it held before the drafts" % (str(last)[:10], before)}


# ── FROM AN ARCHIVED PAGE TO AN ADP SNAPSHOT THE STORE CAN EAT ─────────────
def parse_board(text, limit=300) -> dict:
    """An archived board's HTML -> [{name, adp, rank}], and WHICH quantity that is.

    TWO QUANTITIES, NEVER MERGED. A board page carries a RANK (the row's position)
    and usually an ADP (a decimal, "3.4", the average pick the market actually made).
    They are not the same number: ranks are 1,2,3... by construction while ADP has
    gaps and ties, and a replay that reads one as the other prices every player at a
    pick nobody took him at. So the parsed ADP is used when present, the rank is used
    only as a fallback, and `adp_source` says which — per row.

    The ADP is taken from the SAME ROW as the name, matched inside one cell block
    rather than by looking for the next decimal anywhere in the document: a page has
    plenty of decimals (bye weeks, projections, tiers) and the nearest one is not the
    right one.
    """
    import re
    text = text.decode("utf-8", "replace") if isinstance(text, (bytes, bytearray)) else (text or "")
    rows, seen = [], set()
    # Each table row, then the name and the first standalone decimal inside IT.
    for block in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S | re.I):
        names = extract_names(block, 1)
        if not names:
            continue
        nm = names[0]
        if nm.lower() in seen:
            continue
        m = re.search(r">\s*(\d{1,3}\.\d)\s*<", block)
        seen.add(nm.lower())
        rows.append({"name": nm, "rank": len(rows) + 1,
                     "adp": float(m.group(1)) if m else None,
                     "adp_source": "parsed" if m else "rank"})
        if len(rows) >= limit:
            break
    parsed = sum(1 for r in rows if r["adp_source"] == "parsed")
    return {"rows": rows, "n": len(rows), "with_parsed_adp": parsed,
            "quantity": ("adp" if parsed >= max(1, len(rows) // 2) else "rank_only"),
            "note": ("rank is NOT adp: ranks are 1,2,3 by construction while ADP has "
                     "gaps and ties, and reading one as the other prices a player at a "
                     "pick nobody took him at")}


def to_snapshot(parsed, index, observed_at) -> dict:
    """A parsed board + our board index -> the {observed_at, rows:[{player_id, adp}]}
    shape `ExternalAsOfStore` already consumes.

    THE CROSSWALK IS THE SHIPPED MATCHER, not a name comparison written here. This
    program has one matcher and one set of alias tables; a second one is how the
    crosswalk and the checker came to disagree about the same player (P6).

    COVERAGE IS REPORTED, NEVER ASSUMED. A snapshot that matched a third of its names
    is a board with two thirds of the market missing, and a replay against it would
    price the missing players at nothing — which looks like a bargain rather than a
    gap. The caller decides what rate is enough; this refuses to hide it.
    """
    from mfl_adapter import match_player_shared
    out, unmatched = [], []
    for r in (parsed or {}).get("rows") or []:
        sid, _how = match_player_shared({"name": r["name"], "position": None, "team": None},
                                        index)
        if not sid:
            unmatched.append(r["name"])
            continue
        out.append({"player_id": str(sid),
                    "adp": r["adp"] if r["adp"] is not None else float(r["rank"]),
                    # ON THE ROW, not only beside it. `draft/adp.py` and
                    # `build_bundle.py` both put `adp_source` on EACH PLAYER, and a
                    # consumer written against that shape reading a snapshot-level
                    # label gets None — which reads as "no source" rather than "an
                    # archived capture". Three levels already carry this field name
                    # (per-player, snapshot, and `provenance.adp.adp_source`, which
                    # `keeper_optimize` reads); mine now matches the one a row
                    # consumer expects, and the snapshot keeps its copy for a
                    # consumer that reads the envelope.
                    "adp_source": ADP_SOURCE_ARCHIVE,
                    # WHICH QUANTITY THIS ROW ACTUALLY IS, travelling with it. A
                    # board where some rows are parsed ADP and some are rank order
                    # is two quantities in one list, and only the row can say which.
                    "adp_kind": r["adp_source"]})
    n = len((parsed or {}).get("rows") or [])
    return {"observed_at": observed_at, "rows": out,
            "adp_source": ADP_SOURCE_ARCHIVE,
            "quantity": (parsed or {}).get("quantity"),
            "names_seen": n, "matched": len(out),
            "coverage": round(len(out) / n, 4) if n else 0.0,
            "unmatched_sample": unmatched[:10]}


# Every snapshot built this way carries it, so an archived board can never be read as
# a live capture inside a table that holds both.
ADP_SOURCE_ARCHIVE = "wayback_capture_v1"
