#!/usr/bin/env python3
"""MFL SCHEMA PROBE — meet the real JSON before writing a parser against it.

WHY THIS EXISTS RATHER THAN THE ADAPTER IT UNBLOCKS

The next ingest step is an adapter from MFL's league/draft exports into the shape
`ingest_filters.screen()` reads. Writing that now would mean coding against an
IMAGINED schema: this repo has real samples of MFL's `TYPE=adp` and `TYPE=players`
(they are fixtures in test_mfl_adp.py) and none at all of `TYPE=leagueSearch`,
`TYPE=league` or `TYPE=draftResults`. Guessing at nesting and key names would
produce an adapter that parses cleanly against my own assumptions and silently
mismatches reality — and a league that fails to parse looks identical to a league
that fails the FILTERS, so the attrition report would lie about why leagues were
dropped.

That failure has a recent precedent worth naming: the external replay harness's
first cut declared 'survival' and 'room_seat' as ledger kinds because the contract
was restated from memory instead of read. Same mistake, one layer out.

So this probe fetches a SMALL sample and commits the observed SHAPE — key paths,
types, cardinality, and a couple of redacted example values — not a data dump. The
adapter then gets written against what MFL actually returns.

WHAT IS PURE AND WHAT IS NOT. `describe()` and `merge_shapes()` are pure and
tested. Only `probe()` touches the network, and it is CI-only: the sandbox proxy
blocks myfantasyleague.com (CONNECT 403) while CI has open egress, which is the
same split `mfl_live_probe.py` already lives with.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "mfl_schema_probe.json"

# The endpoints the ingest needs and this repo has never seen. Documented here so the
# probe's coverage is reviewable without reading the fetch code.
ENDPOINTS = {
    # Discovery: which public leagues exist at our format.
    "leagueSearch": "export?TYPE=leagueSearch&SEARCH={q}&JSON=1",
    # Format: team count, starter slots, scoring — everything F1 screens on.
    "league": "export?TYPE=league&L={league_id}&JSON=1",
    # The draft itself: pick sequence, timestamps, and whether picks were autopicked.
    "draftResults": "export?TYPE=draftResults&L={league_id}&JSON=1",
    # SCORING. Added after probe run 2, which found TYPE=league carries no scoring
    # at all — no `rec`, no PPR field, nothing. F1's half-PPR filter is the single
    # most important format check we have (FantasyPros beat FFC as our anchor
    # specifically because it matched our format), and without this endpoint it
    # cannot be evaluated, so every league would have been screened on the wrong
    # criteria or dropped for the wrong reason.
    "rules": "export?TYPE=rules&L={league_id}&JSON=1",
}

# Values are never committed verbatim beyond this length — a probe artifact is a
# schema record, not a copy of someone else's league.
_SAMPLE_CHARS = 40
_MAX_KEYS = 60


def describe(node, path: str = "$", depth: int = 0, max_depth: int = 9) -> dict:
    """A JSON value's SHAPE: {path: {type, sample|len|keys}}.

    Lists are described by their FIRST element plus a length, because MFL is
    inconsistent about singletons: `TYPE=players` returns a bare dict when there
    is exactly one player and a list otherwise, and `mfl_adp._players_index`
    already carries a special case for it. Recording cardinality is what makes
    that trap visible in the artifact instead of at parse time.
    """
    out: dict = {}
    if depth > max_depth:
        out[path] = {"type": "…", "note": "max depth"}
        return out
    if isinstance(node, dict):
        keys = sorted(node.keys())
        out[path] = {"type": "object", "n_keys": len(keys), "keys": keys[:_MAX_KEYS]}
        for k in keys[:_MAX_KEYS]:
            out.update(describe(node[k], f"{path}.{k}", depth + 1, max_depth))
    elif isinstance(node, list):
        out[path] = {"type": "array", "len": len(node)}
        if node:
            out.update(describe(node[0], f"{path}[0]", depth + 1, max_depth))
    else:
        s = "" if node is None else str(node)
        out[path] = {
            "type": type(node).__name__,
            "sample": s[:_SAMPLE_CHARS] + ("…" if len(s) > _SAMPLE_CHARS else ""),
        }
    return out


def merge_shapes(shapes: list) -> dict:
    """Union several observations of the same endpoint.

    One league is one league: a field that happens to be absent, or a list that
    happens to have one element, would otherwise be recorded as though it were
    the rule. Merging several says which paths are ALWAYS present and which are
    only sometimes — and `seen_in` is what tells the adapter author whether a
    field can be relied on or must be defaulted.
    """
    merged: dict = {}
    total = len(shapes)
    for sh in shapes:
        for path, info in (sh or {}).items():
            e = merged.setdefault(path, {"seen_in": 0, "types": set(), "samples": []})
            e["seen_in"] += 1
            e["types"].add(info.get("type"))
            if info.get("sample") and len(e["samples"]) < 3:
                e["samples"].append(info["sample"])
            if "keys" in info:
                e.setdefault("keys", set()).update(info["keys"])
            if "len" in info:
                e.setdefault("lens", []).append(info["len"])
    out: dict = {}
    for path, e in sorted(merged.items()):
        row = {
            "types": sorted(t for t in e["types"] if t),
            "seen_in": e["seen_in"],
            "of": total,
            # The one fact an adapter author actually needs per field.
            "always_present": e["seen_in"] == total and total > 0,
        }
        if e.get("keys"):
            row["keys"] = sorted(e["keys"])
        if e.get("lens"):
            row["len_range"] = [min(e["lens"]), max(e["lens"])]
        if e.get("samples"):
            row["samples"] = e["samples"]
        out[path] = row
    return out


def ids_from_search(search_json, limit: int = 3) -> list:
    """League ids out of a leagueSearch response — the DISCOVERY step.

    Observed shape (probe run 1, 2025): `$.leagues.league` is an array of
    {homeURL, id, name, year}, 65 results for "redraft". Written against that
    artifact rather than against a guess, which is the whole reason the probe
    ran before this function existed.

    Tolerates the singleton case (a bare dict when one league matches) because
    MFL does that on other endpoints and there is no reason to assume this one is
    different — `mfl_adp._players_index` already carries the same special case.
    """
    d = json.loads(search_json) if isinstance(search_json, str) else (search_json or {})
    node = ((d.get("leagues") or {}).get("league")) or []
    if isinstance(node, dict):
        node = [node]
    out = []
    for lg in node:
        lid = lg.get("id")
        if lid and str(lid) not in out:
            out.append(str(lid))
        if len(out) >= limit:
            break
    return out


def host_from_home_url(home_url: str) -> str | None:
    """The per-league SERVER host, from its homeURL.

    A REAL FINDING FROM PROBE RUN 1, and one a guessed adapter would have missed:
    MFL leagues live on numbered hosts (`www48.myfantasyleague.com`), not only on
    `api.`. An export aimed at the wrong host can redirect or come back empty,
    and "empty" is indistinguishable from "this league does not qualify" once it
    reaches the filters — the exact misattribution the probe exists to prevent.

    MFL's own homeURL sample is malformed ('https//www48…', no colon), so this
    parses defensively rather than trusting urlparse.
    """
    if not home_url:
        return None
    s = str(home_url).replace("https//", "").replace("http//", "")
    s = s.split("://")[-1]
    host = s.split("/")[0].strip()
    return host or None


def probe(league_ids: list, year: int = 2025, search: str = "") -> dict:  # pragma: no cover
    """CI ONLY — the sandbox cannot reach myfantasyleague.com (proxy CONNECT 403).

    Deliberately small: enough leagues to distinguish "always present" from
    "happened to be there once", and no more. This is a schema record, not a
    scrape, and it is read-only against public exports.
    """
    import urllib.request

    base = f"https://api.myfantasyleague.com/{year}/"

    def get(url):
        req = urllib.request.Request(
            url, headers={"user-agent": "mfga-schema-probe (fantasy league research)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))

    result = {"year": year, "endpoints": {}, "errors": {}, "discovered": []}
    per: dict = {k: [] for k in ENDPOINTS}
    if search:
        try:
            raw = get(base + ENDPOINTS["leagueSearch"].format(q=search))
            per["leagueSearch"].append(describe(raw))
            # DISCOVERY CHAIN: run 1 probed leagueSearch with no ids to feed the
            # other two, so they recorded nothing. Harvest ids here so one run
            # answers all three.
            if not league_ids:
                league_ids = ids_from_search(raw, limit=3)
                result["discovered"] = league_ids
        except Exception as e:                                  # noqa: BLE001
            result["errors"]["leagueSearch"] = f"{type(e).__name__}: {e}"
    for lid in league_ids:
        for name in ("league", "draftResults", "rules"):
            try:
                per[name].append(describe(get(base + ENDPOINTS[name].format(league_id=lid))))
            except Exception as e:                              # noqa: BLE001
                result["errors"].setdefault(name, f"{type(e).__name__}: {e}")
    for name, shapes in per.items():
        if shapes:
            result["endpoints"][name] = {"observed": len(shapes),
                                         "shape": merge_shapes(shapes)}
    # An endpoint that returned nothing is recorded as such rather than omitted:
    # a missing key in the artifact would read as "not probed yet", and this file
    # exists precisely so nobody has to guess what was checked.
    for name in ENDPOINTS:
        result["endpoints"].setdefault(name, {"observed": 0, "shape": {},
                                              "note": "no successful response"})
    return result


if __name__ == "__main__":  # pragma: no cover
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--leagues", default="", help="comma-separated MFL league ids")
    ap.add_argument("--search", default="", help="leagueSearch term")
    a = ap.parse_args()
    ids = [s.strip() for s in a.leagues.split(",") if s.strip()]
    res = probe(ids, year=a.year, search=a.search)
    OUT.write_text(json.dumps(res, indent=2, sort_keys=True) + "\n")
    for name, e in res["endpoints"].items():
        print(f"{name}: {e['observed']} observed, {len(e.get('shape') or {})} paths")
    for name, err in (res.get("errors") or {}).items():
        print(f"  ERROR {name}: {err}")
    print(f"wrote {OUT}")
