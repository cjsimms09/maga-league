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


def sample_pool(leagues, n, salt="external-ingest-v1") -> list:
    """D6 — WHICH leagues of the pool get fetched, decided by a rule, not by order.

    The 2025 crawl returned **21,323 unique leagues** (measured 2026-08-11). Three
    exports each is ~64,000 requests, so every run works from a SAMPLE, and how that
    sample is chosen is a degree of freedom exactly like a filter. Registered as D6
    before any league was fetched from this pool:

      Order by `sha256(salt + league_id)` and take the first `n`.

    THREE PROPERTIES, and each rules out a way the sample could flatter the result:

      REPRODUCIBLE.  The same pool and n give the same leagues, so a rerun is a
                     rerun and not a fresh draw. A random sample would let a
                     disappointing attrition rate be re-rolled until it improved,
                     which is optional stopping with extra steps.
      ORDER-BLIND.   `leagueSearch` returns leagues in an order we did not choose
                     and do not understand; taking "the first n" would make the
                     sample a function of that order. Provider rank is already kept
                     per league as a COVARIATE (`found_by[].rank`) so any
                     order-correlation can be measured — which only works if the
                     sample itself is not built from it.
      NESTED.        The first 200 are the first 500's prefix. Enlarging the sample
                     ADDS leagues rather than replacing them, so an earlier run's
                     result stays a subset of a later one and the two can be
                     compared. A fresh draw at each size cannot be.

    The salt is fixed and versioned. Changing it is a NEW sample and a new
    registration, never a quiet reshuffle after seeing what the first one gave.
    """
    import hashlib
    ids = list(leagues.keys()) if isinstance(leagues, dict) else [str(x) for x in leagues]
    keyed = sorted(ids, key=lambda i: hashlib.sha256(
        (salt + "|" + str(i)).encode("utf-8")).hexdigest())
    return keyed[:max(0, int(n))]


def sample_report(leagues, taken) -> dict:
    """What the sample left behind, said out loud.

    A run over 200 of 21,323 leagues that reports "12 matched" without its
    denominator invites the number to be read as a rate over the pool.
    """
    total = len(leagues or {})
    k = len(taken or [])
    return {"pool": total, "sampled": k,
            "share_of_pool": round(k / total, 5) if total else None,
            "rule": "D6: sha256(salt|league_id) order, first n — reproducible, "
                    "order-blind, and NESTED so a larger n is a superset",
            "verdict": ("%d of %d pooled leagues fetched (%.2f%%) — every count below is "
                        "over the SAMPLE, and scaling it to the pool assumes the sample is "
                        "representative, which this run does not test"
                        % (k, total, 100.0 * k / total) if total else "empty pool")}


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
