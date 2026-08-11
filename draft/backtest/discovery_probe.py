"""IS D2 IMPLEMENTABLE? Whether `leagueSearch` can be walked to exhaustion at all.

D2 pre-registers: walk the ENTIRE result set, every page, and stop only when it is
exhausted — never when a matched-count target is hit, because stopping at F7's 200
would make the sample a function of the provider's ordering. That rule assumes the
full set is reachable. **It has never been checked.**

The one observation we have is the schema probe's: a single `SEARCH` returned
`$.leagues.league[]` with exactly **65** entries. Sixty-five is either a true count
for that term or a CAP, and the two have opposite consequences:

  * a true count -> D2 is implementable as written;
  * a cap -> the reachable pool is a function of the QUERY, D1's format-neutral
    requirement cannot deliver a complete pool, and D2 needs a new dated
    registration BEFORE the crawl rather than an apology after it.

WHY THIS NEEDS CONTROLS AND NOT JUST A REQUEST. Both providers were measured
silently accepting unknown parameters and returning the baseline unchanged, so a
`PAGE=2` that comes back 200 with a full-looking list proves nothing whatever. The
discriminators here:

  * TWO DIFFERENT BROAD QUERIES returning the SAME count is the cap signature —
    unrelated searches do not coincidentally match equally many leagues;
  * A NONSENSE QUERY returning the same count means `SEARCH` itself is being
    ignored, and the "pool" is not a search result at all;
  * A BOGUS PARAMETER establishes what a 200 is worth here, exactly as it did for
    the as-of probe.

`classify` and `verdict` are IMPORTED from `adp_asof_probe`, not re-implemented —
they are generic over "rows carrying a composition", and a second copy of the
did-this-parameter-do-anything logic is the dual-maintenance disease this project
has twelve instances of.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from adp_asof_probe import USER_AGENT, classify, verdict  # noqa: E402

MFL_HOST = "https://api.myfantasyleague.com"

# D1 requires a FORMAT-NEUTRAL query: no term selecting on team count or scoring,
# because selecting on format at discovery makes format-match prevalence
# unmeasurable and turns the attrition report into a tautology. These are
# structure-neutral words, and the pair exists to test the cap, not to be a
# curated pool.
CANDIDATES = [
    ("baseline", "league", {}),
    ("CONTROL_bogus_param", "league", {"ZZZNOTAPARAM": "1"}),
    # IS THERE AN "ALL LEAGUES" QUERY? The first run established that SEARCH does
    # filter (three terms, three different counts), which means the pool is a
    # function of the WORD — and no word is the universe. These two ask whether
    # the endpoint will hand over everything when asked for nothing.
    ("empty_search", "", {}),
    ("single_letter", "a", {}),
    ("CONTROL_nonsense_query", "zzqqxnonsenseterm", {}),
    ("different_query", "football", {}),
    ("third_query", "the", {}),
    ("page_2", "league", {"PAGE": "2"}),
    ("offset_65", "league", {"OFFSET": "65"}),
    ("limit_500", "league", {"LIMIT": "500"}),
    ("count_500", "league", {"COUNT": "500"}),
]


def search_composition(payload) -> dict:
    """What a leagueSearch response is MADE OF.

    The id list matters as much as its length: a `PAGE=2` that returns 65
    DIFFERENT leagues is pagination, and one that returns the same 65 is a
    parameter being swallowed. Length alone cannot tell those apart.
    """
    node = ((payload or {}).get("leagues") or {}).get("league") or []
    if isinstance(node, dict):
        node = [node]
    ids = [str(x.get("id")) for x in node if isinstance(x, dict)]
    return {"total_drafts": None, "players": len(ids),
            "top5": [{"id": i, "adp": None} for i in ids[:5]],
            "count": len(ids), "first_id": ids[0] if ids else None,
            "last_id": ids[-1] if ids else None, "ids": ids}


def cap_verdict(rows: list) -> dict:
    """Is the observed count a TRUE COUNT or a CEILING? The question D2 rests on.

    Unrelated broad searches matching exactly equally many leagues is not a
    coincidence, it is a cap. And if the NONSENSE query returns the same count as
    a real one, `SEARCH` is not filtering at all and the returned set is whatever
    the provider felt like handing over — which would mean the candidate pool is
    not a search result and D1 cannot be satisfied by choosing a query.
    """
    got = {r["name"]: (r.get("composition") or {}).get("count")
           for r in rows if r.get("composition")}
    broad = {n: c for n, c in got.items()
             if n in ("baseline", "different_query", "third_query") and c is not None}
    nonsense = got.get("CONTROL_nonsense_query")
    out = {"counts": got, "cap_suspected": False, "search_ignored": False, "reading": ""}
    if len(set(broad.values())) == 1 and len(broad) > 1:
        out["cap_suspected"] = True
        out["reading"] = (
            "CAP SUSPECTED — %d unrelated queries each returned exactly %s leagues. "
            "Unrelated searches do not match equally many leagues by chance, so this is a "
            "RESULT CEILING. D2's 'walk the entire result set' is NOT implementable as "
            "written and needs a new dated registration BEFORE the crawl."
            % (len(broad), list(broad.values())[0]))
    if nonsense is not None and nonsense in set(broad.values()) and broad:
        out["search_ignored"] = True
        out["reading"] += (
            " AND SEARCH ITSELF APPEARS IGNORED — a nonsense term returned the same count "
            "as real ones, so the returned set is not a search result and D1 cannot be "
            "satisfied by choosing a neutral query.")
    if not out["reading"]:
        out["reading"] = (
            "No cap signature: the broad queries returned DIFFERENT counts (%s), which is "
            "what a real search does. D2 remains implementable on this evidence."
            % ", ".join("%s=%s" % kv for kv in sorted(broad.items())))
    return out


def paging_verdict(overlap: dict, counts: dict) -> dict:
    """Is the result set PAGED, or does it arrive whole?

    D2 says walk every page. If every paging candidate returns the baseline's
    exact ids, either the whole set arrives at once or paging lives under a name
    not in the candidate set — and those are different facts.

    THE DISCRIMINATOR IS THE COUNTS, NOT THE PARAMETERS. A paginated endpoint has
    a PAGE SIZE, so first pages come back at a fixed number. Three unrelated
    queries returning three large, different, non-round counts is direct evidence
    that no page size is being applied — which is a stronger statement than any
    parameter test, because it does not depend on guessing a parameter name.
    """
    ignored = [k for k, v in (overlap or {}).items() if v.get("identical_to_baseline")]
    vals = [c for c in (counts or {}).values() if isinstance(c, int) and c > 0]
    distinct = len(set(vals)) > 1
    roundish = any(v in (10, 20, 25, 50, 100, 200, 250, 500, 1000) for v in vals)
    if ignored and distinct and not roundish:
        return {"paged": False, "ignored_candidates": sorted(ignored),
                "reading": ("NO PAGE SIZE IS BEING APPLIED — %d queries returned different, "
                            "large, non-round counts (%s), so first pages are not being cut to "
                            "a fixed size. Every paging candidate also returned the baseline's "
                            "exact ids. The result set arrives WHOLE, and D2's 'walk every "
                            "page, stop on exhaustion' is satisfied by a single request."
                            % (len(vals), ", ".join(str(v) for v in sorted(vals, reverse=True))))}
    if ignored:
        return {"paged": None, "ignored_candidates": sorted(ignored),
                "reading": ("Every paging candidate was ignored, but the counts do not rule out "
                            "a page size (%s). Cannot distinguish 'arrives whole' from 'paging "
                            "lives under a name not in the candidate set' — rule 13, and the "
                            "set is recorded so it can be extended." % sorted(vals))}
    return {"paged": True, "ignored_candidates": [],
            "reading": "A paging candidate returned DIFFERENT leagues — pagination exists."}


def probe(year="2026"):  # pragma: no cover  (egress; CI only)
    import urllib.error
    import urllib.parse
    import urllib.request

    def get(search, extra):
        params = dict({"TYPE": "leagueSearch", "SEARCH": search, "JSON": "1"}, **extra)
        url = "%s/%s/export?%s" % (MFL_HOST, year, urllib.parse.urlencode(params))
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return {"status": r.status, "payload": json.loads(r.read().decode("utf-8", "replace"))}
        except urllib.error.HTTPError as e:
            return {"status": e.code, "payload": None, "http_error": "%s %s" % (e.code, e.reason)}
        except Exception as e:
            return {"status": None, "payload": None,
                    "transport_error": "%s: %s" % (type(e).__name__, e)}

    rows, baseline = [], None
    for name, search, extra in CANDIDATES:
        got = get(search, extra)
        row = {"name": name, "search": search, "params": extra,
               "status": got.get("status"), "http_error": got.get("http_error"),
               "transport_error": got.get("transport_error"),
               "composition": search_composition(got.get("payload")) if got.get("payload") else None}
        if name == "baseline":
            baseline = row
        row["classification"] = "baseline" if name == "baseline" else classify(baseline or {}, row)
        rows.append(row)

    # Do the paging candidates return DIFFERENT leagues, or the same ones? Length
    # is not the test — overlap is.
    base_ids = set((baseline.get("composition") or {}).get("ids") or [])
    overlap = {}
    for r in rows:
        if r["name"].startswith(("page", "offset", "limit", "count")) and r.get("composition"):
            ids = set(r["composition"].get("ids") or [])
            overlap[r["name"]] = {
                "returned": len(ids), "new_vs_baseline": len(ids - base_ids),
                "identical_to_baseline": ids == base_ids and bool(ids)}

    cap = cap_verdict(rows)
    out = {"question": "can leagueSearch be walked to exhaustion, as D2 assumes?",
           "year": year, "rows": rows, "verdict": verdict(rows),
           "cap": cap, "paging_overlap": overlap,
           "paging": paging_verdict(overlap, cap.get("counts") or {})}
    (HERE / "discovery_probe.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({"cap": out["cap"], "paging": out["paging"],
                      "controls": out["verdict"].get("controls")}, indent=1))
    return out


if __name__ == "__main__":  # pragma: no cover
    probe(sys.argv[1] if len(sys.argv) > 1 else "2026")
