# TERRITORY: C
"""FETCHABILITY CENSUS — stage 1 of A's ffanalytics ask (ROUTES.md, A -> C,
2026-08-18, accelerated by Cory: "are we now pulling in more sources... anyway
to use those this year" — asked twice, that is a date-move).

WHY THIS MATTERS: `ffanalytics` (R, cjpearson/FantasyFootballAnalytics)
aggregates projections across ~10 independent public sources. We hold TWO
(Sleeper, FantasyPros). A per-player spread across 8-10 independent POINT
projections would be an outside-source floor/ceiling in the right UNITS —
points, not ranks, which is what the expert-rank spread study (register 4t)
could never be without a rank->points curve.

THIS FILE ONLY CENSUSES REACHABILITY. It does not scrape a real projection,
does not parse a player row, and computes nothing. Same discipline as
`discovery_ceiling_sources.py` (register 4t) and `discovery_fp_adp_field_
census.py` earlier this session: probe BEFORE building a parser, so a parser
never gets built against a source that turns out unreachable.

URLS ARE NOT GUESSED. Pulled directly from ffanalytics's own
`data-raw/source_configs.R` (FantasyFootballAnalytics/ffanalytics, fetched
2026-08-18) — the base URL each of its own scrape functions builds on. A
base URL reachable here still needs its own follow-up (real query params,
parsing) before it is a usable source; this only answers "is the HOST even
reachable from where we run."

KNOWN-POSITIVE CONTROL: FantasyPros' ADP endpoint, already proven reachable
from CI this session (`fantasypros_adp.py`). If the control comes back
blocked too, the finding is "this run's egress is broken," not "every
source is unreachable" — the same distinction register 4t's probe drew.

CI-ONLY. Every candidate host 403s at the CONNECT level from this sandbox
(verified via the proxy's own /__agentproxy/status, "policy denial or
upstream failure" on all five spot-checked hosts) — same wall as Sleeper,
FFC and every other external source probed this session.

Run: python3 draft/backtest/discovery_projection_source_census.py
Writes draft/backtest/discovery_projection_source_census.json.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "discovery_projection_source_census.json"

#: {source_name: url} — verbatim from ffanalytics's source_configs.R.
#: Comments note which URLs are already known API/query-shaped vs. a bare
#: page root a real scraper would build on.
CANDIDATE_SOURCES = {
    "cbs": "https://www.cbssports.com/fantasy/football/stats/",
    "espn": "http://games.espn.com/ffl/tools/projections",
    "numberfire": "https://www.numberfire.com/nfl/fantasy/",
    "fftoday": "http://www.fftoday.com/rankings/",
    "fantasysharks": "https://www.fantasysharks.com/apps/bert/forecasts/projections.php",
    "fantasyfootballnerd": "http://www.fantasyfootballnerd.com/service/",
    "nfl": "http://api.fantasy.nfl.com/v1/players/stats",
    "rtsports": "https://www.freedraftguide.com/football/draft-guide-rankings-provider.php",
    "walterfootball": "http://walterfootball.com/",
    "fantasydata": "https://fantasydata.com/nfl-stats/fantasy-football-weekly-projections.aspx",
}

#: FantasyPros is already OURS (register 4t, fp_expert_ranks.py) — not a
#: census candidate, it is the control proving egress itself works.
CONTROL_NAME = "fantasypros_adp_control"
CONTROL_URL = "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php?year=2026"

#: A response this short is an error/landing/captcha page, not real content,
#: regardless of status code — same "no silent nulls" rule discovery_ceiling
#: _sources.py and fp_expert_ranks.py both apply.
MIN_PLAUSIBLE_BYTES = 2000


def _probe_one(name, url, timeout=20):
    """One GET, real headers, no retries — a census counts what happened
    once, not what happens if you keep asking. Returns a result dict; NEVER
    raises (a probe that crashes the whole run on one bad host is how a
    census stops covering anything after the first failure)."""
    import requests

    result = {"source": name, "url": url}
    try:
        resp = requests.get(url, timeout=timeout, headers={
            "User-Agent": "Mozilla/5.0 (compatible; maga-league-source-census/1.0)"})
        body = resp.content or b""
        result.update({
            "status_code": resp.status_code,
            "content_type": resp.headers.get("content-type"),
            "size_bytes": len(body),
            "reachable": resp.status_code < 400,
            "plausible_content": len(body) >= MIN_PLAUSIBLE_BYTES,
        })
    except Exception as exc:                                    # noqa: BLE001
        result.update({"status_code": None, "content_type": None,
                      "size_bytes": 0, "reachable": False,
                      "plausible_content": False,
                      "error": "%s: %s" % (type(exc).__name__, exc)})
    return result


def census() -> dict:  # pragma: no cover  (egress; CI only)
    control = _probe_one(CONTROL_NAME, CONTROL_URL)
    if not control["reachable"]:
        return {"status": "VOID", "reason": "the KNOWN-POSITIVE CONTROL "
                "(FantasyPros, proven reachable earlier this session) failed "
                "this run — this is an egress/runner problem, not a finding "
                "about any of the ten candidate sources", "control": control}

    results = {name: _probe_one(name, url) for name, url in CANDIDATE_SOURCES.items()}
    reachable = [n for n, r in results.items() if r["reachable"]]
    plausible = [n for n, r in results.items() if r.get("plausible_content")]

    return {
        "_territory": "TERRITORY: C — produced by discovery_projection_source_census.py",
        "_prereg": "N/A — a reachability census, not a graded study. Register 4t / "
                  "ROUTES.md A->C 2026-08-18 (ffanalytics resource review).",
        "_note": "'reachable' = HTTP status < 400. 'plausible_content' = body >= "
                 "%d bytes -- neither means the page actually contains a real "
                 "projection table; that needs a per-source parser, built only "
                 "for sources that clear both here." % MIN_PLAUSIBLE_BYTES,
        "control": control,
        "candidates": results,
        "reachable_count": len(reachable),
        "reachable_sources": reachable,
        "plausible_sources": plausible,
        "clears_3_source_bar": len(plausible) >= 3,
    }


def main() -> int:  # pragma: no cover  (egress; CI only)
    result = census()
    if result.get("status") == "VOID":
        print("VOID — %s" % result.get("reason"))
        OUT.write_text(json.dumps(result, indent=2) + "\n")
        return 1
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print("reachable: %d/%d, plausible content: %d/%d -- clears 3-source bar: %s"
         % (result["reachable_count"], len(CANDIDATE_SOURCES),
            len(result["plausible_sources"]), len(CANDIDATE_SOURCES),
            result["clears_3_source_bar"]))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
