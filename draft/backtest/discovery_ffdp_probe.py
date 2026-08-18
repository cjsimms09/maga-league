# TERRITORY: C
"""DOES FANTASY FOOTBALL DATA PROS SERVE A REAL PER-PLAYER CEILING? ONE CHEAP RUN ANSWERS IT.

Cory, 2026-08-17: "Fantasy Football Data Pros (FFDP) look at this api for
projected ceiling and other stats we could gather and use." Raised directly
against the register-4q discussion — whether a genuinely per-player,
opportunity/age/team-aware ceiling exists anywhere, rather than the
historical-error band this repo currently measures.

WHY THIS IS CHEAP COMPARED TO EVERY OTHER PROBE THIS SESSION. FFDP is
confirmed (web search, since this sandbox's egress proxy blocks the host
itself — same 403 shape as Sleeper/FantasyPros/FFC) to be a free REST API,
GET-only, NO API KEY REQUIRED. Every other external source touched this
session needed a credential or a paid-plan budget; this needs neither. The
only real cost is CI minutes.

WHAT THIS DOES NOT ASSUME. I could not read FFDP's own docs page from this
sandbox (same block) and could not confirm the exact endpoint paths or
response field names from web search alone — search results describe "weekly
data back to 1999" and "season data back to 1970" built on ESPN's
projections, but never quoted a real JSON schema. So this probe does not
assume a `ceiling` field exists; it SCRAPES THE DOCS PAGE ITSELF for the
endpoint URLs FFDP advertises (the same "read the provider's own words rather
than our guess" discipline `external_odds_probe.py`'s `provider_urls` field
follows), tries a small DECLARED set of plausible fallback paths if the
scrape finds nothing, and WALKS whatever JSON comes back for every key name —
never a fixed field list. A `ceiling`/`floor`/`proj` key showing up in
`unclassified` because this file's patterns did not anticipate its exact
spelling would be exactly the kind of miss the `external_odds_probe.py`
family exists to prevent, so unclassified keys are reported in full, not
dropped.

WHAT A HIT WOULD MEAN, AND WHAT IT WOULD NOT. FFDP's own description says its
projections are "based on ESPN's projections" — if a ceiling field exists and
is a scalar derived from that same single upstream source, it may not be
independent information (the same caveat already given to Cory about
FantasyPros' rank-spread ceiling being a different quantity from an
outcome-measured one). This probe reports WHETHER a per-player field exists
and what it looks like; it does not itself judge whether the number is worth
adopting — that is a second, separate question for once real field names
exist to look at.

CI-ONLY for the egress half — the sandbox proxy blocks the host, verified
this session. Everything that decides anything is pure and tested.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "discovery_ffdp_probe.json"

DOCS_URL = "https://www.fantasyfootballdatapros.com/our_api"

#: DECLARED, WITH A REASON EACH — same discipline as `external_odds_probe.
#: DISCOVERY_PATHS`: every one of these is a GUESS, so a 404 on one proves
#: only that this repo spelled it wrong, never that FFDP serves nothing.
#: Used only if the docs-page scrape below finds no literal endpoint of its
#: own to try — the scrape is preferred precisely because it is not a guess.
FALLBACK_CANDIDATES = (
    ("https://www.fantasyfootballdatapros.com/api/players/2025/1",
     "confirmed via search: 'weekly data ... provide the season number, "
     "followed by the week number' — 2025/1 is the most recent completed "
     "week, most likely to have real cached data"),
    ("https://www.fantasyfootballdatapros.com/api/players/2025",
     "the season-totals sibling of the weekly path, same host and prefix"),
    ("https://www.fantasyfootballdatapros.com/api/projections/2025",
     "named directly for what Cory asked about, in case projections are a "
     "separate resource from realized weekly/season stats"),
    ("https://api.fantasyfootballdatapros.com/players/2025/1",
     "many of this project's other sources split a `www` docs host from an "
     "`api` data host (FantasyPros does exactly this) — tried as a sibling "
     "guess, not because anything confirms it"),
)


# ── pure: read the docs page for FFDP's OWN advertised endpoints ───────────

_URL_RE = re.compile(
    r"https?://(?:www\.|api\.)?fantasyfootballdatapros\.com/[A-Za-z0-9_/\-]*")
_PATH_RE = re.compile(r"(?<![\w/])/api/[A-Za-z0-9_/\-]*")


def extract_endpoint_examples(html: str) -> list:
    """Every literal FFDP URL or `/api/...` path mentioned in the docs page.

    THE PROVIDER'S OWN WORDS BEAT OUR GUESS. A docs page that shows
    `curl https://www.fantasyfootballdatapros.com/api/players/2020/1` is
    telling us the exact shape rather than making us invent one — the same
    reason `external_odds_probe.py` reads a payload's own `urls` node before
    falling back to declared discovery paths.

    MUTATION: return `[]` unconditionally — every real run would silently
    fall through to the fallback guesses even when the docs page spelled the
    answer out, and nobody would know the scrape never ran.
    """
    if not html:
        return []
    full = _URL_RE.findall(html)
    bare = _PATH_RE.findall(html)
    seen, out = set(), []
    for u in full + bare:
        u = u.rstrip("/.,\"')")
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


# ── pure: walk an arbitrary JSON payload for every key name ────────────────

def walk_keys(payload, depth: int = 0, _seen=None) -> set:
    """Every dict key anywhere in the payload, however deeply nested.

    NEVER A FIXED PATH. FFDP's real response shape is unconfirmed from this
    sandbox, so reading one expected location (`payload["ceiling"]`) would
    report absence for a field that exists one level down. Depth-capped at 12
    — the same limit `external_odds_probe._walk` uses — so a pathological or
    self-referential structure cannot hang the probe.

    MUTATION: only look at top-level keys — a nested `stats: {ceiling: ...}`
    shape (which is exactly how `fantasypros_adp.parse_projections` nests its
    own stats) would report `ceiling` absent when it is one level down.
    """
    keys = set()
    if depth > 12:
        return keys
    if isinstance(payload, dict):
        for k, v in payload.items():
            keys.add(str(k))
            keys |= walk_keys(v, depth + 1)
    elif isinstance(payload, list):
        for item in payload[:50]:      # capped: a 5,000-row season list needs one sample, not all
            keys |= walk_keys(item, depth + 1)
    return keys


#: Declared families, with the reason each matters — same shape as
#: `external_odds_probe.FAMILIES`. Loose patterns on purpose: a family that
#: matches nothing is reported absent, and every key matching none of them
#: lands in `unclassified` rather than vanishing.
FAMILIES = {
    "ceiling": (
        r"ceiling|upside|p90|high_?end|best_?case",
        "the exact thing Cory asked about — a per-player upside number"),
    "floor": (
        r"floor|downside|p10|low_?end|worst_?case",
        "the ceiling's sibling — worth knowing whether it travels with it"),
    "projection": (
        r"proj(ection)?|forecast|expected|mean\b|median\b|estimate",
        "a point estimate — useful even without ceiling/floor, as a "
        "possible additional proj_mean input"),
    "identity": (
        r"player.?name|player.?id|position|team\b",
        "confirms a row IS a player record, not something else entirely"),
}


def classify_fields(keys) -> dict:
    """Group observed keys into the declared families; report the rest.

    EVERY UNMATCHED KEY TRAVELS. The same discipline as
    `external_odds_probe.classify` — a family list states what we went
    looking for, and the keys matching none of them are the ones most likely
    to be the thing we did not know to ask for.
    """
    out = {name: [] for name in FAMILIES}
    unclassified = []
    for k in sorted(keys or []):
        hit = [name for name, (pat, _why) in FAMILIES.items()
               if re.search(pat, k, re.I)]
        if hit:
            for name in hit:
                out[name].append(k)
        else:
            unclassified.append(k)
    return {"families": out, "unclassified": unclassified,
            "counts": {name: len(v) for name, v in out.items()},
            "unclassified_count": len(unclassified)}


def report(docs_endpoints: list, tried: list, classified: dict) -> dict:
    """The whole answer in one object, including what was ASKED and TRIED.

    THREE VERDICT SHAPES, never a bare boolean — same reasoning
    `external_odds_probe.discovery_report`/`availability` already state: a
    404 on a path THIS FILE invented proves only that the guess was wrong,
    never that FFDP serves nothing. Only a 200 with a real player-shaped
    payload can answer the ceiling question either way.
    """
    answered = [t for t in tried if t.get("status") == 200 and t.get("keys")]
    ceiling_hits = (classified or {}).get("families", {}).get("ceiling") or []
    floor_hits = (classified or {}).get("families", {}).get("floor") or []
    if not answered:
        verdict = ("UNMEASURED — no candidate endpoint returned a player-"
                   "shaped payload. Every path tried was either scraped from "
                   "FFDP's own docs or a declared guess; a failure here is a "
                   "fact about this run's guesses, not proof FFDP serves "
                   "nothing. Read the docs page manually before concluding "
                   "absence.")
    elif ceiling_hits:
        verdict = ("ACTIONABLE — a field name matching `ceiling` was found: "
                   "%s. This is a LEAD, not a verdict on whether it's worth "
                   "adopting — check what it's derived from before treating "
                   "it as independent information." % ", ".join(ceiling_hits))
    else:
        verdict = ("NULL — a real payload came back with no field name "
                   "matching ceiling/floor/upside/downside. FFDP may still "
                   "serve one under a name these patterns did not "
                   "anticipate — see `unclassified` below before concluding "
                   "absence.")
    return {
        "_territory": "TERRITORY: C — written by discovery_ffdp_probe.py",
        "docs_url": DOCS_URL,
        "docs_endpoints_found": list(docs_endpoints or []),
        "tried": tried,
        "answered_count": len(answered),
        "observed_fields": (classified or {}).get("families"),
        "unclassified": (classified or {}).get("unclassified"),
        "ceiling_field_found": bool(ceiling_hits),
        "floor_field_found": bool(floor_hits),
        "verdict": verdict,
    }


# ---------------------------------------------------------------------------
# egress — CI only (this sandbox's proxy blocks the host, verified 2026-08-17)
# ---------------------------------------------------------------------------

def _get(url, timeout=20):  # pragma: no cover  (egress; CI only)
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "maga-league-probe/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def probe(timeout: int = 20) -> dict:  # pragma: no cover  (egress; CI only)
    """Fetch the docs page, extract its own endpoint examples, try them —
    falling back to declared guesses only if the scrape finds nothing — walk
    every response for field names, and report what was found."""
    docs_endpoints = []
    try:
        _status, html = _get(DOCS_URL, timeout)
        docs_endpoints = extract_endpoint_examples(html)
    except Exception as e:                              # noqa: BLE001
        print("docs page fetch failed (%s: %s) — falling back to declared "
             "candidates only" % (type(e).__name__, e))

    candidates = [(u, "scraped from FFDP's own docs page") for u in docs_endpoints]
    if not candidates:
        candidates = list(FALLBACK_CANDIDATES)

    tried = []
    all_keys = set()
    for url, reason in candidates[:8]:          # capped: this is a probe, not a crawl
        try:
            status, text = _get(url, timeout)
            try:
                payload = json.loads(text)
            except (ValueError, TypeError):
                tried.append({"url": url, "reason": reason, "status": status,
                             "error": "response was not JSON"})
                continue
            keys = walk_keys(payload)
            all_keys |= keys
            tried.append({"url": url, "reason": reason, "status": status,
                          "keys": sorted(keys)[:60],
                          "keys_truncated": len(keys) > 60,
                          # RAW, TRUNCATED, ALWAYS INCLUDED — a human reading
                          # this artifact should be able to see what actually
                          # came back, not just this file's classification of
                          # it, the same "describe the shape you walked"
                          # discipline external_odds_probe.raw_shape follows.
                          "sample": json.dumps(payload)[:500]})
        except Exception as e:                          # noqa: BLE001
            tried.append({"url": url, "reason": reason, "status": 0,
                         "error": "%s: %s" % (type(e).__name__, e)})

    classified = classify_fields(all_keys)
    return report(docs_endpoints, tried, classified)


def main() -> int:  # pragma: no cover  (egress; CI only)
    rep = probe()
    OUT.write_text(json.dumps(rep, indent=1) + "\n")
    print("wrote %s" % OUT.name)
    print(rep["verdict"])
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
