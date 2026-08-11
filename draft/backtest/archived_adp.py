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


def cdx_query(url: str, before: str, limit: int = DEFAULT_LIMIT) -> str:
    """The index URL for "captures of `url` at or before `before` (YYYYMMDD)".

    `to` is INCLUSIVE of its day, and F5 wants strictly-before. The query stays wide
    and `usable_captures` applies the strict test, so the strictness lives in exactly
    one place instead of being split across a URL and a comparison.
    """
    q = {"url": url, "to": str(before), "output": "json",
         "filter": "statuscode:200", "limit": str(-abs(int(limit))),
         "collapse": "timestamp:8"}
    return CDX + "?" + urllib.parse.urlencode(q)


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


def first_serving_capture(captures, fetch, min_rows=50, tries=4) -> dict:
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
        v = looks_like_a_board(body, min_rows)
        tried.append({"timestamp": cap["timestamp"], "bytes": v["bytes"],
                      "rows": v["rows_seen"], "empty": v["empty"]})
        if v["is_board"]:
            return {"state": "board", "timestamp": cap["timestamp"], "rows": v["rows_seen"],
                    "bytes": v["bytes"], "body": body, "examined": tried}
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
        # Public mirrors. THESE URLS ARE GUESSES and are labelled as such in the
        # report: a 404 here is evidence about the URL I constructed, not about
        # whether anyone mirrors preseason boards (rule 13).
        ("mirror dynastyprocess", "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr.csv", CONTENT_DATED),
        ("mirror ffverse adp", "https://github.com/ffverse/ffopportunity", CONTENT_DATED),
    ]


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
