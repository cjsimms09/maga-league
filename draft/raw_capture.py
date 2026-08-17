# TERRITORY: A
"""KEEP THE RESPONSE. One primitive, used by every fetcher.

Cory, 2026-08-17: *"I want all the data we can possibly get... this is literally
the base of our model, without this we are building a model on top of shit."*

THE DEFECT THIS CLOSES. Both FantasyPros fetchers already RETURN the raw text —
`fetch()` and `fetch_projections()` hand back `(text, url, diag)`. Every caller
threw the text away and kept the parsed rows. So the loss was never in the
fetch; it was one line further on, in five different places, five times.

A parser is a whitelist. `_FP_STAT_MAP` has thirteen entries against a scoring
table that prices thirty-two categories, and its own docstring says "unknown
stat keys are dropped" — silently. Every whitelist loses whatever nobody
thought to anticipate, and you do not find out until the question that needed
it is asked.

**Keeping the response means a 2027 question is answered by RE-PARSING instead
of RE-FETCHING.** That distinction is not convenience. Re-fetching a preseason
projection is exactly what leaks (exp33) — the endpoint has since been
overwritten with in-season revisions, so the number you get back already knows
who got hurt. For those sources, re-parsing is the difference between an answer
and no answer that will ever exist.

## as_of vs applies_to — Cory's separation requirement, made structural

> *"Maintains that historical data doesn't get mixed in with this years data."*

Every payload carries BOTH:

    as_of        when WE fetched it        (a fact about the request)
    applies_to   which season it DESCRIBES (a fact about the content)

They are different questions and the gap between them IS the leak risk. A 2023
projection frozen in 2023 has `as_of == applies_to` and is a clean forecast. The
same URL fetched in 2026 has `as_of` three years later — a live endpoint that
has been rewritten since, which is why `sleeper_hist_proj` passed only 2025 of
three seasons. Until now only a FILENAME distinguished those two objects, and a
filename is not something a consumer can check.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW_DIR = HERE / "data" / "raw"

#: A payload fetched this many seasons after the one it describes cannot be a
#: clean preseason forecast — the endpoint has had a whole season to be
#: overwritten. This does not BLOCK retention (we keep everything); it stamps
#: the row so a grader cannot use it without deciding to.
LEAK_SUSPECT_LAG = 1


def fingerprint(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8", "replace")).hexdigest()[:16]


def classify_lag(as_of_season: int, applies_to: int) -> dict:
    """The honest label for the gap between when we asked and what we asked about."""
    lag = int(as_of_season) - int(applies_to)
    if lag <= 0:
        return {"lag_seasons": lag, "provenance": "contemporaneous",
                "gradeable_without_review": True,
                "why": "fetched in or before the season it describes — a real forecast"}
    return {
        "lag_seasons": lag,
        "provenance": "retrospective",
        "gradeable_without_review": bool(lag < LEAK_SUSPECT_LAG),
        "why": ("fetched %d season(s) after the one it describes; the endpoint "
                "has had time to be rewritten, so this may already know the "
                "outcome. RETAINED, but a grade must clear a leak gate first "
                "(exp33)." % lag),
    }


def retain(source: str, applies_to: int, text: str, url: str = "",
           diag: dict | None = None, *, as_of: str | None = None,
           root: Path | None = None) -> dict:
    """Persist one raw payload with its provenance. Returns the manifest entry.

    DELIBERATELY NOT PARSED HERE. The whole point is to keep the bytes exactly
    as the provider served them, so a future reader can apply a parser we have
    not written yet. A retention step that understands the payload has already
    started losing it.

    Same (source, applies_to, as_of-date) overwrites rather than doubling, so a
    same-day re-run is idempotent — the same rule proj_series uses.
    """
    stamp = as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base = root or RAW_DIR
    out_dir = base / source
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{applies_to}__asof_{stamp}.raw"
    path.write_text(text or "", encoding="utf-8")

    entry = {
        "source": source,
        "as_of": stamp,
        "as_of_season": int(stamp[:4]),
        "applies_to": int(applies_to),
        "url": url,
        "bytes": len(text or ""),
        "sha256_16": fingerprint(text),
        "path": str(path.relative_to(base.parent.parent))
        if base.parent.parent in path.parents else str(path),
        "diag": diag or {},
    }
    entry.update(classify_lag(entry["as_of_season"], applies_to))

    manifest = base / "MANIFEST.json"
    rows = []
    if manifest.exists():
        try:
            rows = json.loads(manifest.read_text()).get("entries") or []
        except (ValueError, OSError):
            rows = []
    rows = [r for r in rows if not (r.get("source") == source
                                    and r.get("applies_to") == int(applies_to)
                                    and r.get("as_of") == stamp)]
    rows.append(entry)
    rows.sort(key=lambda r: (r["source"], r["applies_to"], r["as_of"]))
    manifest.write_text(json.dumps({
        "_territory": "TERRITORY: A",
        "_note": ("Raw provider payloads, kept verbatim. `as_of` is when WE "
                  "fetched; `applies_to` is the season the content DESCRIBES. "
                  "A retrospective row is RETAINED but must clear a leak gate "
                  "before it may be graded — keeping data and grading it are "
                  "different decisions."),
        "entries": rows,
    }, indent=1))
    return entry


def manifest(root: Path | None = None) -> list[dict]:
    m = (root or RAW_DIR) / "MANIFEST.json"
    if not m.exists():
        return []
    try:
        return json.loads(m.read_text()).get("entries") or []
    except (ValueError, OSError):
        return []


def gradeable(entries: list[dict] | None = None, root: Path | None = None) -> list[dict]:
    """Only the payloads a grade may use without a separate leak review."""
    return [e for e in (entries if entries is not None else manifest(root))
            if e.get("gradeable_without_review")]
