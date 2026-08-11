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
    html_rows = len(re.findall(r"<td[^>]*>\s*[A-Z][a-z]+ [A-Z][a-z]+", text))
    rows = max(json_rows, html_rows)
    return {"rows_seen": rows, "json_rows": json_rows, "html_rows": html_rows,
            "is_board": rows >= min_rows, "bytes": len(text)}


def route1_verdict(hits, probed, unreachable=0) -> str:
    """What a negative here does and does not rule out.

    An UNREACHABLE archive is not a closed route — it is an unanswered one, and the
    distinction is the whole reason this runs in CI rather than the sandbox, where
    every archive.org request returned a proxy 403 that says nothing about the
    archive.
    """
    if unreachable and not hits:
        return ("ROUTE 1 UNANSWERED: the archive could not be reached for %d of %d "
                "targets. That is a statement about egress, not about whether dated "
                "boards exist, and it must not be recorded as a closure"
                % (unreachable, probed))
    if hits:
        return ("ROUTE 1 IS OPEN: %d dated pre-cutoff board(s) of %d targets probed. An "
                "archived board with a knowable observation date satisfies F5 without any "
                "provider supporting a date parameter. It is NOT yet usable: a page that "
                "parses is not a page that is right, and the content must be checked "
                "against a known answer before anything is graded against it" % (len(hits), probed))
    return ("ROUTE 1 IS CLOSED ON THIS EVIDENCE: no capture strictly predating the cutoff "
            "returned a recognisable board, across %d targets. Stated precisely: this rules "
            "out THE SOURCES AND DATES PROBED. It does not rule out a paid archive, a source "
            "not on the list, or a capture the CDX index does not hold" % probed)
