#!/usr/bin/env python3
"""ROUTE PROBE — is there ANY route to public leagues at our format, beyond the dead-end crawl?

The crawl-from-our-league exhausted (a private league's members cluster). Cory's question: is
there a DIFFERENT route, or is it genuinely closed? Three routes tested here (Q1 answered
separately from ID structure — snowflakes, enumeration hit-rate ~1e-11, out):
  * Q2 Sleeper listing/search: try candidate undocumented endpoints (low prior — Sleeper
    exposes no public-league browsing by design). Expect 404s; a hit would be a real find.
  * Q4 MFL leagueSearch: MFL (unlike Sleeper) has a documented `TYPE=leagueSearch` export that
    returns PUBLIC leagues by keyword. This is the promising route: search → TYPE=league for
    settings → filter to our format → TYPE=results/weeklyResults for realized outcomes. Test
    whether it returns volume AND whether the leagues are format-filterable.

Reports what each route actually returns so "closed" is a tested finding, not a guess. All
egress (CI only); no pure core to unit-test — it's a reconnaissance probe.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _get(url, timeout=25):   # pragma: no cover  (egress, CI only)
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 mfga-route-probe"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "ignore")
    except Exception as e:
        return getattr(e, "code", 0), f"{type(e).__name__}: {e}"


def probe_sleeper():   # pragma: no cover
    """Candidate Sleeper listing/search endpoints (low prior). A 200 with league data is a find."""
    base = "https://api.sleeper.app/v1"
    cands = [f"{base}/leagues/nfl/2024", f"{base}/leagues/public/nfl/2024",
             f"{base}/league/search?sport=nfl", f"{base}/leagues?sport=nfl&season=2024"]
    out = []
    for u in cands:
        st, body = _get(u)
        looks_like_leagues = st == 200 and body.strip().startswith("[") and "league_id" in body
        out.append({"url": u, "status": st, "leagues": looks_like_leagues, "head": body[:120]})
    return out


def probe_mfl(year=2024, terms=("football", "ppr", "keeper", "dynasty", "redraft")):   # pragma: no cover
    """MFL leagueSearch: does it return public leagues, and can we pull settings to filter to
    our format? Reports counts + whether a sample league's settings are readable + look 10-team."""
    base = f"https://api.myfantasyleague.com/{year}/export"
    results = []
    sample_league_ids = []
    for term in terms:
        st, body = _get(f"{base}?TYPE=leagueSearch&SEARCH={term}&JSON=1")
        n, ids = 0, []
        try:
            d = json.loads(body)
            leagues = (((d.get("leagues") or {}).get("league")) or []) if isinstance(d, dict) else []
            if isinstance(leagues, dict):
                leagues = [leagues]
            n = len(leagues)
            ids = [(lg.get("id"), lg.get("name")) for lg in leagues[:3]]
            sample_league_ids += [lg.get("id") for lg in leagues[:2] if lg.get("id")]
        except Exception as e:
            ids = [f"parse:{type(e).__name__}"]
        results.append({"term": term, "status": st, "n_leagues": n, "sample": ids[:3]})
    # can we read a sample league's settings (franchises, scoring) to filter to our format?
    settings_readable = None
    if sample_league_ids:
        lid = sample_league_ids[0]
        st, body = _get(f"{base}?TYPE=league&L={lid}&JSON=1")
        try:
            d = json.loads(body)
            lg = (d or {}).get("league") or {}
            settings_readable = {"league_id": lid, "status": st,
                                 "franchises": ((lg.get("franchises") or {}).get("count")),
                                 "has_scoring_keys": bool([k for k in lg if "ppr" in str(k).lower()
                                                           or k in ("h2h", "rosterSize")]),
                                 "keys": list(lg.keys())[:15]}
        except Exception as e:
            settings_readable = {"league_id": lid, "status": st, "error": type(e).__name__}
    return {"searches": results, "sample_settings": settings_readable}


def _verdict(sleeper, mfl):
    sl_hit = any(s["leagues"] for s in sleeper)
    total_mfl = sum(s["n_leagues"] for s in mfl["searches"])
    mfl_readable = bool(mfl.get("sample_settings") and mfl["sample_settings"].get("franchises"))
    if sl_hit:
        return "OPEN via Sleeper — an undocumented listing endpoint returned leagues (unexpected; investigate)."
    if total_mfl >= 50 and mfl_readable:
        return (f"OPEN via MFL — leagueSearch returned {total_mfl} public leagues across terms and "
                f"their settings are readable (franchise count, scoring) → format-filterable. This "
                f"is the route: search → filter to 10-team/half-PPR/6ptTD → pull drafts+results. "
                f"Next: a format-match crawl over MFL leagueSearch, and grade by RANK (MFL default "
                f"full-PPR, so format-filter or offset). The post-draft sample program is VIABLE here.")
    if total_mfl > 0:
        return (f"PARTIAL via MFL — leagueSearch returned {total_mfl} leagues but "
                f"{'settings not cleanly readable' if not mfl_readable else 'volume is thin'}; "
                f"needs a deeper MFL probe before committing.")
    return ("CLOSED (tested) — Sleeper exposes no listing endpoint, ID enumeration is precluded "
            "(snowflakes, ~1e-11 hit rate), the social crawl dead-ends, and MFL leagueSearch "
            "returned nothing usable. No route to volume of format-matched public leagues. The "
            "draft-STRATEGY-in-rooms question stays thin; player-VALUE questions still ride "
            "nflverse (no leagues needed), and in-season data accrues weekly regardless.")


def egress_main():   # pragma: no cover
    sleeper = probe_sleeper()
    mfl = probe_mfl()
    out = {"experiment": "route probe — any route to public leagues at our format?",
           "q1_id_enumeration": "PRECLUDED — Sleeper IDs are snowflakes (epoch ~2016, 22-bit shift; "
                                "our leagues decode to real creation dates). Per-ms sequence space "
                                "4.2M, ~1e-11 random hit rate → ~1e13 probes for 500. Out.",
           "q2_sleeper_listing": sleeper, "q4_mfl_leaguesearch": mfl,
           "verdict": _verdict(sleeper, mfl)}
    (HERE / "exp_route_probe.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
