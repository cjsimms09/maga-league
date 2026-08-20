# TERRITORY: C
"""Discovery probe for draftsharks.com's half-PPR rankings page.

Cory, 2026-08-19: "can you view this site, pull in all these projections,
score for our league and put them in our database" --
https://www.draftsharks.com/rankings/half-ppr

Blocked at CONNECT from both the agent sandbox (curl) and WebFetch --
confirmed independently today, same shape as every other projection host this
project has hit (register/DATA-LIFECYCLE.md, A, 2026-08-19). And it is NOT one
of ffanalytics' twelve scraped sources -- ffanalytics scrapes FantasySharks, a
different company with a similar name (measured, same file).

So there is no existing pipeline to extend; this is a from-scratch source,
same as Kalshi and the Odds API were. Rule 3e: before writing a real parser,
find out what is actually on the page rather than guessing its shape --
a real projection table, a JSON payload embedded in a <script> tag (common on
Next.js/React sites), a login wall, or something else entirely. This script
answers that question and nothing more: it writes no board field, joins no
crosswalk, computes no fantasy points.

Run: python3 draft/tools/draftsharks_discover.py
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

URL = "https://www.draftsharks.com/rankings/half-ppr"
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "draft" / "data" / "draftsharks_discovery.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch(url: str) -> tuple[int, str, dict]:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, body, dict(e.headers or {})


def find_embedded_json(html: str) -> list[dict]:
    """Common shapes: Next.js __NEXT_DATA__, a window.__INITIAL_STATE__ blob,
    or an application/json script tag. Report candidates, don't assume one."""
    hits = []
    for pat, label in [
        (r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', "__NEXT_DATA__"),
        (r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});', "__INITIAL_STATE__"),
        (r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', "application/json script"),
    ]:
        for m in re.finditer(pat, html, re.DOTALL):
            raw = m.group(1)
            try:
                parsed = json.loads(raw)
                hits.append({"label": label, "bytes": len(raw), "top_level_keys": list(parsed.keys()) if isinstance(parsed, dict) else "not-a-dict"})
            except json.JSONDecodeError:
                hits.append({"label": label, "bytes": len(raw), "parse_error": True})
    return hits


def count_tables(html: str) -> int:
    return len(re.findall(r"<table\b", html, re.IGNORECASE))


def main() -> int:
    status, body, headers = fetch(URL)
    doc = {
        "_territory": "TERRITORY: C — written by draftsharks_discover.py",
        "_what": "discovery probe only: does the page load, what shape is it, "
                 "no parsing, no board field, no crosswalk join",
        "url": URL,
        "status": status,
        "content_length_bytes": len(body),
        "content_type": headers.get("Content-Type"),
        "html_table_count": count_tables(body),
        "embedded_json_candidates": find_embedded_json(body),
        "looks_like_login_wall": bool(re.search(r"\b(sign in|log in|subscribe|paywall)\b", body, re.IGNORECASE)),
        "title": (re.search(r"<title[^>]*>(.*?)</title>", body, re.DOTALL) or [None, None])[1],
        "body_snippet_first_2000_chars": body[:2000],
    }
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"status={status} bytes={len(body)} tables={doc['html_table_count']} "
          f"embedded_json={len(doc['embedded_json_candidates'])} "
          f"login_wall={doc['looks_like_login_wall']}")
    if status != 200:
        print(f"NON-200 STATUS — {status}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
