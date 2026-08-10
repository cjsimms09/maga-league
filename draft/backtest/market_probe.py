#!/usr/bin/env python3
"""MARKET-SOURCE PROBE — what actually exists, before anything is designed on it.

Cory's instruction is explicit and it is the same discipline the MFL probe earned:
PROBE BEFORE DESIGNING. Kalshi's API being free says nothing about whether it runs
player-level markets at meaningful volume, and a thin market carries little
information no matter how accessible it is. So this answers three questions and
draws no conclusions the data does not support:

  SLEEPER    trending adds/drops — already wired, free, no token. What does the
             payload actually contain, and is it player-resolvable?
  KALSHI     what markets EXIST, at what volume, and does anything map to a
             question we care about? A clean negative is a useful result.
  ODDS API   NOT pass-or-fail on the allowance. Report the ACTUAL allowance and
             the MINIMUM VIABLE CAPTURE CADENCE it supports. A source that cannot
             do daily may be entirely usable weekly, or twice weekly around news.

WHAT THIS DELIBERATELY DOES NOT DO. It does not compute a gap, touch a projection,
or write anything the board reads. Part 1 of the brief: the market layer observes,
it never rewrites — and at this stage it does not even observe yet, it only
establishes whether there is anything to observe.

CI-ONLY. The sandbox proxy blocks all four hosts (CONNECT 000); CI has egress.
`summarise_*` are pure and tested; only `probe()` touches the network.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "market_probe.json"

# Kalshi's public market list. Series/tickers are what we need to see; whether any
# of them are player-level is the open question.
KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"
ODDS_BASE = "https://api.the-odds-api.com/v4"
SLEEPER_TRENDING = "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=48&limit=25"

# The ONLY props that map to our scoring. Not hundreds of markets — four, plus the
# three game-level lines that give Signal B its implied team total.
PROPS_WE_CARE_ABOUT = ("player_pass_yds", "player_rush_yds", "player_reception_yds",
                       "player_receptions")
GAME_MARKETS = ("spreads", "totals", "h2h")


def summarise_kalshi(markets: list) -> dict:
    """Coverage and volume, not a verdict dressed as one.

    VOLUME IS THE POINT. A market that exists but never trades is not a market
    price, it is a quote nobody has disagreed with — and treating it as a
    forecast would be the thin-pool error in a new domain.
    """
    nfl, player_level = [], []
    for m in markets or []:
        blob = " ".join(str(m.get(k) or "") for k in ("ticker", "title", "subtitle", "event_ticker"))
        low = blob.lower()
        if "nfl" not in low and "football" not in low:
            continue
        nfl.append(m)
        # Player-level = a market about ONE player's production, which is the only
        # kind that maps to a fantasy projection. Award markets (MVP, OPOY) are
        # season-long and categorical; they do not price weekly production.
        if any(w in low for w in ("yards", "receptions", "touchdowns", "rushing", "passing", "receiving")):
            player_level.append(m)
    vols = [int(m.get("volume") or 0) for m in nfl]
    # WHAT DID WE ACTUALLY SEE? A bare "0 NFL markets" is not a trustworthy
    # negative — it looks identical whether Kalshi has no football markets or we
    # queried the wrong surface, filtered wrongly, or read one page of many. So
    # the scan reports its own composition, and the negative can be judged.
    from collections import Counter
    cats = Counter()
    for m in markets or []:
        tick = str(m.get("ticker") or "")
        cats[tick.split("-")[0][:14] or "?"] += 1
    return {
        "series_prefixes_seen": dict(cats.most_common(12)),
        "any_sport_words": sum(1 for m in (markets or []) if any(
            w in " ".join(str(m.get(k) or "") for k in ("ticker", "title", "subtitle")).lower()
            for w in ("nfl", "football", "touchdown", "quarterback", "super bowl"))),
        "nfl_markets": len(nfl),
        "player_production_markets": len(player_level),
        "volume_total": sum(vols),
        "volume_median": sorted(vols)[len(vols) // 2] if vols else 0,
        "zero_volume_share": (sum(1 for v in vols if v == 0) / len(vols)) if vols else None,
        "sample_titles": [str(m.get("title") or m.get("ticker"))[:70] for m in nfl[:8]],
    }


def cadence_from_allowance(remaining, used, per_pull: int = 1) -> dict:
    """What capture cadence does the allowance actually support?

    NOT a pass/fail gate — Cory's correction. The question is not "does it survive
    a season at the cadence I imagined" but "what cadence does it support, and is
    that enough for the signal we want". Signal C (movement) needs at least TWO
    observations per market per week to measure anything at all, so the floor is
    stated in those terms rather than as a bare number.
    """
    try:
        rem = int(remaining)
    except (TypeError, ValueError):
        return {"allowance_known": False,
                "note": "the API did not report a remaining-requests header"}
    WEEKS = 18 + 4                      # regular season + playoffs
    pulls = rem // max(1, per_pull)
    per_week = pulls / WEEKS
    if per_week >= 14:
        cadence = "daily or better"
    elif per_week >= 4:
        cadence = "every other day"
    elif per_week >= 2:
        cadence = "twice weekly — the FLOOR for Signal C (movement needs two points)"
    elif per_week >= 1:
        cadence = "weekly — level only; Signal C is NOT measurable at this cadence"
    else:
        cadence = "less than weekly — not viable"
    return {
        "allowance_known": True, "remaining": rem, "used": used,
        "requests_per_pull": per_pull, "pulls_available": pulls,
        "weeks_in_season": WEEKS, "pulls_per_week": round(per_week, 2),
        "supported_cadence": cadence,
        "signal_c_measurable": per_week >= 2,
    }


def summarise_odds_markets(sports: list) -> dict:
    nfl = [s for s in (sports or []) if str(s.get("key", "")).startswith("americanfootball_nfl")]
    return {"nfl_sport_keys": [s.get("key") for s in nfl], "sports_listed": len(sports or [])}


def probe() -> dict:                                        # pragma: no cover (egress)
    import urllib.error
    import urllib.request

    def get(url, headers=None):
        req = urllib.request.Request(url, headers=headers or {
            "user-agent": "mfga-market-probe (fantasy league research)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8")), dict(r.headers)

    out = {"sources": {}, "errors": {}}

    # ── SLEEPER — already wired, free, no token ─────────────────────────────
    try:
        rows, _ = get(SLEEPER_TRENDING)
        out["sources"]["sleeper_trending"] = {
            "reachable": True, "rows": len(rows or []),
            "shape": sorted((rows or [{}])[0].keys()) if rows else [],
            # Player-resolvable means it carries an id we can crosswalk. If it is
            # only counts with no id, it is not usable per player.
            "player_resolvable": bool(rows and "player_id" in (rows[0] or {})),
            "note": "adds/drops = what people are REACTING to; ADP = what they PAID",
        }
    except Exception as e:                                  # noqa: BLE001
        out["errors"]["sleeper_trending"] = f"{type(e).__name__}: {e}"

    # ── KALSHI — coverage and volume, no key required for public markets ────
    # PAGINATE. Run 2 scanned 1000 markets and found zero football — but every one
    # came from just TWO series prefixes, so it was ONE PAGE of a default ordering,
    # not a sample of the universe. A negative drawn from that would have been
    # confidently wrong. Walk the cursor, and ALSO ask the series endpoint directly,
    # so "no NFL markets" can only be concluded from evidence that could have shown
    # otherwise.
    try:
        markets, cursor, pages = [], None, 0
        while pages < 12:
            url = f"{KALSHI_BASE}/markets?limit=1000&status=open"
            if cursor:
                url += f"&cursor={cursor}"
            data, _ = get(url)
            batch = data.get("markets") or []
            markets.extend(batch)
            cursor = data.get("cursor")
            pages += 1
            if not cursor or not batch:
                break
        summary = dict(summarise_kalshi(markets), reachable=True,
                       markets_scanned=len(markets), pages_walked=pages,
                       exhausted=not cursor)
        # The series list is the authoritative catalogue of what Kalshi RUNS,
        # independent of which markets happen to be open right now.
        try:
            sdata, _ = get(f"{KALSHI_BASE}/series?limit=500")
            series = sdata.get("series") or []
            sport = [s for s in series if any(
                w in (str(s.get("ticker", "")) + str(s.get("title", ""))).lower()
                for w in ("nfl", "football"))]
            summary["series_listed"] = len(series)
            summary["series_matching_football"] = [
                str(s.get("ticker") or "")[:24] for s in sport][:12]
        except Exception as se:                             # noqa: BLE001
            summary["series_endpoint_error"] = f"{type(se).__name__}: {se}"
        out["sources"]["kalshi"] = summary
    except Exception as e:                                  # noqa: BLE001
        out["errors"]["kalshi"] = f"{type(e).__name__}: {e}"

    # ── THE ODDS API — needs a key; ABSENCE IS A FINDING, not a failure ─────
    key = os.environ.get("ODDS_API_KEY", "").strip()
    if not key:
        out["sources"]["odds_api"] = {
            "reachable": None, "key_configured": False,
            "note": "no ODDS_API_KEY secret is configured, so the free-tier allowance "
                    "could not be measured. This is a SETUP gap, not evidence the "
                    "source is unusable — do not record it as a dead end.",
        }
    else:
        try:
            sports, hdrs = get(f"{ODDS_BASE}/sports/?apiKey={key}")
            rem = hdrs.get("x-requests-remaining")
            used = hdrs.get("x-requests-used")
            # One pull = one request per market group we want, per event batch.
            per_pull = len(GAME_MARKETS) + len(PROPS_WE_CARE_ABOUT)
            out["sources"]["odds_api"] = dict(
                summarise_odds_markets(sports), reachable=True, key_configured=True,
                allowance=cadence_from_allowance(rem, used, per_pull),
                props_of_interest=list(PROPS_WE_CARE_ABOUT),
                game_markets=list(GAME_MARKETS))
        except Exception as e:                              # noqa: BLE001
            out["errors"]["odds_api"] = f"{type(e).__name__}: {e}"

    return out


if __name__ == "__main__":                                  # pragma: no cover
    res = probe()
    OUT.write_text(json.dumps(res, indent=2, sort_keys=True) + "\n")
    for name, s in res["sources"].items():
        print(f"{name}: {json.dumps(s)[:300]}")
    for name, e in (res.get("errors") or {}).items():
        print(f"  ERROR {name}: {e}")
    print(f"wrote {OUT}")
