"""THE CRAWL — D1 v2's registered term set into a candidate pool, with its shape reported.

D1 v2 (2026-08-11) fixed the pool as the UNION of `leagueSearch` over ten registered
terms, because the probe established there is no all-leagues query: an empty SEARCH
returns nothing and a one-letter term returns nothing, so SEARCH is token-based with
a minimum length and the pool is a function of the WORDS.

D2 fixed the walk: every term, whole result set, stop only on exhaustion. The probe
established that is one request per term — 11,056 / 5,029 / 3,328 for three unrelated
terms, none round, so no page size is being applied.

THE DEFECT THIS FILE IS SHAPED AROUND, and it is the attrition seam again in a third
place: **A TERM WHOSE FETCH FAILED IS NOT A TERM THAT MATCHED NOTHING.** Both give you
no leagues. One means the pool is smaller than the registration claims, silently, and
the union looks like an honest number. So a failed term is recorded as failed, never as
zero, the report leads with it, and the union declares itself incomplete.

WHAT IS PURE AND WHAT IS NOT. `crawl` takes an injected `fetch`, so the whole
orchestration — dedupe, rank, overlap, the failed-term accounting — is tested offline
without egress. Only `mfl_fetch` touches the network.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from adp_asof_probe import USER_AGENT  # noqa: E402
from discovery_probe import REGISTERED_TERMS, search_composition  # noqa: E402

MFL_HOST = "https://api.myfantasyleague.com"


def crawl(fetch, year, terms=REGISTERED_TERMS) -> dict:
    """Run every registered term. Returns the pool and its composition.

    D2: NO EARLY STOP. Every term runs even after the pool is large, because
    stopping when a count looks sufficient would make the sample a function of
    term order — optional stopping wearing a target's clothes.

    A league found by several terms keeps ALL of them, with the provider's rank in
    each, so any order- or term-correlated bias is measurable after the fact
    rather than invisible.
    """
    leagues: dict = {}
    per_term: dict = {}
    failed: dict = {}
    for term in terms:
        got = fetch(term, year)
        if got.get("error"):
            # NOT zero. A term we could not fetch is a hole in the pool, and the
            # union must not close over it as though the term matched nothing.
            failed[term] = got["error"]
            per_term[term] = None
            continue
        rows = got.get("leagues") or []
        per_term[term] = len(rows)
        for rank, row in enumerate(rows):
            lid = str(row.get("id"))
            if not lid or lid == "None":
                continue
            rec = leagues.setdefault(lid, {"league_id": lid, "name": row.get("name"),
                                           "year": str(row.get("year") or year),
                                           "found_by": []})
            rec["found_by"].append({"term": term, "rank": rank})
    return {"year": str(year), "leagues": leagues, "per_term": per_term,
            "failed_terms": failed, "terms": list(terms)}


def pool_report(crawled: dict) -> dict:
    """The pool's shape, as D1 v2 requires it published rather than assumed."""
    leagues = crawled.get("leagues") or {}
    per_term = crawled.get("per_term") or {}
    failed = crawled.get("failed_terms") or {}
    found_counts: dict = {}
    for rec in leagues.values():
        found_counts[len(rec["found_by"])] = found_counts.get(len(rec["found_by"]), 0) + 1
    # OVERLAP, which is what says whether ten terms bought ten pools or one.
    only_one = found_counts.get(1, 0)
    rep = {
        "year": crawled.get("year"),
        "terms_registered": len(crawled.get("terms") or []),
        "terms_fetched": sum(1 for v in per_term.values() if v is not None),
        "terms_failed": len(failed),
        "failed_terms": failed,
        "per_term_counts": per_term,
        "union": len(leagues),
        "sum_of_terms": sum(v for v in per_term.values() if v is not None),
        "found_by_exactly_one_term": only_one,
        "found_by_multiple_terms": len(leagues) - only_one,
        # A union SMALLER than the sum means the terms overlap; equal means they
        # are disjoint. Reported, because "ten terms" is not ten times a pool.
        "overlap_factor": (round(sum(v for v in per_term.values() if v is not None)
                                 / len(leagues), 3) if leagues else None),
        "complete": not failed,
    }
    rep["verdict"] = _verdict(rep)
    return rep


def _verdict(rep: dict) -> str:
    """Rule 8: the failures lead, on the line itself."""
    parts = []
    if rep["terms_failed"]:
        parts.append(
            "%d of %d REGISTERED TERMS COULD NOT BE FETCHED (%s) — the pool is INCOMPLETE "
            "against its own registration and the union below is a floor, not a count"
            % (rep["terms_failed"], rep["terms_registered"],
               "; ".join("%s: %s" % kv for kv in sorted(rep["failed_terms"].items()))))
    zero = [t for t, c in (rep["per_term_counts"] or {}).items() if c == 0]
    if zero:
        parts.append(
            "%d term(s) returned ZERO leagues (%s) — a registered term contributing nothing "
            "is worth checking against the measured minimum term length before it is trusted"
            % (len(zero), ", ".join(sorted(zero))))
    head = ("%d unique leagues from %d fetched terms (%d found by more than one term)"
            % (rep["union"], rep["terms_fetched"], rep["found_by_multiple_terms"]))
    return head + "".join("; and " + p for p in parts)


# ── the fetch, CI only ──────────────────────────────────────────────────────
def mfl_fetch(term, year):  # pragma: no cover  (egress; CI only)
    """One term's whole result set. An error is RETURNED, never raised away."""
    import urllib.error
    import urllib.parse
    import urllib.request
    url = "%s/%s/export?%s" % (MFL_HOST, year, urllib.parse.urlencode(
        {"TYPE": "leagueSearch", "SEARCH": term, "JSON": "1"}))
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return {"error": "http %s %s" % (e.code, e.reason)}
    except Exception as e:
        return {"error": "%s: %s" % (type(e).__name__, e)}
    node = ((payload or {}).get("leagues") or {}).get("league") or []
    if isinstance(node, dict):
        node = [node]
    # Composition recorded from the SAME parser the probe used, so the crawl and
    # the probe cannot disagree about what a response contained.
    _ = search_composition(payload)
    return {"leagues": [x for x in node if isinstance(x, dict)]}


def run(year, out_path=None):  # pragma: no cover  (egress; CI only)
    crawled = crawl(mfl_fetch, year)
    rep = pool_report(crawled)
    if out_path:
        Path(out_path).write_text(json.dumps(
            {"report": rep, "leagues": crawled["leagues"]}, indent=1))
    print(json.dumps(rep, indent=1))
    return rep
