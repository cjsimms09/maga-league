# TERRITORY: A
"""WHERE DOES THE DATA ACTUALLY LIVE? Stop guessing at the markup.

Cory ruled we use Draft Sharks' ceiling (CORY-ASKS A19/A20). Three probes in,
the numbers parse (floor 261 / proj 322 / ceiling 370) and the NAMES do not.

⛔ AND MY LAST FIX WAS A RULE 3f FAILURE, RECORDED HERE RATHER THAN GLOSSED.
I wrote a known-positive control for the name extraction against HTML I
INVENTED -- `<a title="..."><img alt="...">` -- and it passed on all three
fixtures while the real page still returned nothing. A control built from a
guess about the input tests the guess, not the input.

The stored `sample_row_html` shows why: `@mousedown="sortBy(...)"` and
`:class="getSortClass(...)"` are Vue directives. The table is a Vue component,
so the header is server-rendered and the ROWS are bound client-side. The first
probe looked for `__NEXT_DATA__` and `window.__INITIAL_STATE__` -- both Next.js
/ Redux patterns -- and correctly found none, which read as "no embedded JSON"
when the real answer was "wrong pattern searched".

So this probe does not assume a framework. It ANCHORS ON VALUES WE ALREADY
KNOW ARE IN THE PAYLOAD -- a ceiling of 370, a floor of 261 -- and reports
where in the document they appear and what surrounds them. Wherever those
numbers live, the names live beside them.

REPORT ONLY. No board field, no crosswalk, no points.

Run: python3 draft/tools/draftsharks_payload.py
"""
from __future__ import annotations
import json, re, urllib.request, urllib.error
from pathlib import Path

URL = "https://www.draftsharks.com/rankings/half-ppr"
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "draft" / "data" / "draftsharks_payload.json"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Values the previous capture already proved are in this document. Anchoring on
# these is what makes the probe testable: if it cannot find a number we KNOW is
# present, the probe is broken -- not the page. That is the known-positive.
ANCHORS = ["370", "261", "322"]


def main() -> int:
    req = urllib.request.Request(URL, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            status, html = r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        html = e.read().decode("utf-8", errors="replace") if e.fp else ""

    # 1. Vue / Inertia / generic prop-bound payloads, plus any large JSON blob
    patterns = [
        (r'data-page="([^"]{200,})"', "inertia data-page"),
        (r':players="([^"]{200,})"', "vue :players prop"),
        (r':rows="([^"]{200,})"', "vue :rows prop"),
        (r':data="([^"]{200,})"', "vue :data prop"),
        (r'v-bind:[a-z-]+="([^"]{500,})"', "vue v-bind large prop"),
        (r'<script[^>]*type="application/json"[^>]*>(.{200,}?)</script>', "json script"),
        (r'window\.[A-Za-z_$]+\s*=\s*(\{.{500,}?\});', "window assignment"),
        (r'JSON\.parse\(\s*[\'"](.{500,}?)[\'"]\s*\)', "JSON.parse literal"),
    ]
    found = []
    for pat, label in patterns:
        for m in re.finditer(pat, html, re.DOTALL):
            raw = m.group(1)
            found.append({"label": label, "bytes": len(raw), "offset": m.start(),
                          "head": raw[:200]})

    # 2. Where do the anchor values physically sit?
    anchor_hits = []
    for a in ANCHORS:
        for m in list(re.finditer(re.escape(a), html))[:4]:
            s, e = max(0, m.start() - 260), min(len(html), m.end() + 260)
            anchor_hits.append({"anchor": a, "offset": m.start(),
                                "context": html[s:e]})

    # 3. Any URL that smells like the data endpoint the Vue app calls
    api = sorted(set(re.findall(
        r'["\'](/(?:api|ajax|v\d)/[A-Za-z0-9._/-]{3,80})["\']', html)))

    # KNOWN POSITIVE: the anchors are values a previous capture read OUT of this
    # document. If none is present, this probe is broken or the page changed --
    # either way nothing below it means anything.
    ok = len(anchor_hits) > 0
    doc = {
        "_territory": "TERRITORY: A — draft/tools/draftsharks_payload.py",
        "_what": "locate the real data payload. REPORT ONLY.",
        "url": URL, "status": status, "bytes": len(html),
        "control_anchors_found": {
            "ok": ok, "hits": len(anchor_hits),
            "why": "these values were parsed OUT of this same document by the "
                   "previous capture, so they must be findable. A null here "
                   "means the probe is broken, not that the data is absent -- "
                   "which is the distinction rule 3e exists for."},
        "candidate_payloads": found,
        "api_like_urls": api[:40],
        "anchor_contexts": anchor_hits[:12],
    }
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"status={status} bytes={len(html)} payload_candidates={len(found)} "
          f"anchor_hits={len(anchor_hits)} api_urls={len(api)}")
    for f in found[:8]:
        print(f"  {f['label']:28} {f['bytes']:>8} bytes @ {f['offset']}")
    for u in api[:15]:
        print(f"  api: {u}")
    if not ok:
        print("CONTROL FAILED — could not find values this page is known to contain")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
