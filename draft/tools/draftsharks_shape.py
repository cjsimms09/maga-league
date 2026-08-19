# TERRITORY: C (written by A to unblock C's live ask, 2026-08-19)
"""Second probe: WHAT IS IN the Draft Sharks tables?

The discovery probe (draftsharks_discovery.json) answered the first question:
status 200 from GitHub Actions, 418KB, 2 <table> elements, no embedded JSON.
It could not answer the one that decides Cory's ask, because it only stored a
2000-character snippet:

    does the page expose per-player FLOOR and CEILING, and are the rows real
    data or a teaser behind the login wall its keyword check flagged?

C's own routing note named this as the deciding question -- "if it's
points-only, the honest ingest is a labelled 'Draft Sharks' own half-PPR
opinion', not a true rescore."

STILL DISCOVERY ONLY. No board field, no crosswalk join, no fantasy points.

Run: python3 draft/tools/draftsharks_shape.py
"""
from __future__ import annotations
import json, re, sys, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path

URL = "https://www.draftsharks.com/rankings/half-ppr"
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "draft" / "data" / "draftsharks_shape.json"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class Tables(HTMLParser):
    """Collect every <table> as a list of rows of cell text."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self._t, self._r, self._c = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._t = []
        elif tag == "tr" and self._t is not None:
            self._r = []
        elif tag in ("td", "th") and self._r is not None:
            self._c = []

    def handle_endtag(self, tag):
        if tag == "table" and self._t is not None:
            self.tables.append(self._t); self._t = None
        elif tag == "tr" and self._r is not None:
            if self._r:
                self._t.append(self._r)
            self._r = None
        elif tag in ("td", "th") and self._c is not None:
            self._r.append(re.sub(r"\s+", " ", "".join(self._c)).strip())
            self._c = None

    def handle_data(self, data):
        if self._c is not None:
            self._c.append(data)


def main() -> int:
    req = urllib.request.Request(URL, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            status, html = r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        html = e.read().decode("utf-8", errors="replace") if e.fp else ""

    p = Tables(); p.feed(html)
    # what we are actually hunting for, named explicitly so a null is readable
    WANT = {"floor": r"\bfloor\b", "ceiling": r"\bceiling\b|\bceil\b",
            "projection": r"\bproj|\bpts\b|\bpoints\b|\bfpts\b",
            "adp": r"\badp\b", "player": r"\bplayer\b|\bname\b",
            "position": r"\bpos\b|\bposition\b", "tier": r"\btier\b",
            "bye": r"\bbye\b", "upside": r"\bupside\b", "risk": r"\brisk\b|\binjur"}

    tables = []
    for i, t in enumerate(p.tables):
        header = t[0] if t else []
        blob = " | ".join(header).lower()
        tables.append({
            "index": i, "rows": len(t),
            "header": header,
            "widths_seen": sorted({len(r) for r in t})[:6],
            "fields_found": sorted([k for k, rx in WANT.items()
                                    if re.search(rx, blob, re.I)]),
            "first_data_rows": t[1:4],
        })

    # login-wall check with an actual CONTROL, unlike the keyword match in the
    # first probe: a nav link saying "Log In" is not a paywall. The question is
    # whether the TABLE has real rows.
    biggest = max((t["rows"] for t in tables), default=0)
    doc = {
        "_territory": "TERRITORY: C — written by draftsharks_shape.py",
        "_what": "discovery only: table headers, row counts, sample rows. "
                 "No board field, no crosswalk, no points.",
        "url": URL, "status": status, "bytes": len(html),
        "table_count": len(p.tables),
        "largest_table_rows": biggest,
        "verdict_data_is_present": biggest >= 50,
        "why_verdict": "the first probe's login_wall flag was a keyword match on "
                       "'sign in|subscribe' anywhere in 418KB of page, which nearly "
                       "every site's nav contains -- it is not evidence of a "
                       "paywall. Real rankings rows are. 50 is well below a full "
                       "board and well above a teaser.",
        "tables": tables,
    }
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"status={status} tables={len(p.tables)} largest_table_rows={biggest}")
    for t in tables:
        print(f"  table {t['index']}: {t['rows']} rows, fields={t['fields_found']}")
        print(f"    header: {t['header'][:14]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
