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
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "market_probe.json"

import sys as _sys                                    # noqa: E402
if str(HERE) not in _sys.path:
    _sys.path.insert(0, str(HERE))
import market_request as _R                           # noqa: E402


def _redact(text) -> str:
    """Delegates to market_request.redact — ONE implementation, not two.

    This was the original fix and it lived ONLY here, so market_capture wrote
    unredacted exception text into a COMMITTED health file by a path this never
    covered. Found auditing history before the repo went public. Copying it
    across would have made two redactors that drift; it moved to the request
    layer both modules already import, and that version covers key=, token= and
    secret= as well as apiKey=."""
    return _R.redact(text)

# Kalshi's public market list. Series/tickers are what we need to see; whether any
# of them are player-level is the open question.
KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"
# ── THE NAMING COLLISION, RECORDED RATHER THAN ASSUMED ──────────────────────
# "The Odds API" is not a sufficient identifier. There are at least three similar
# names in this space and they are different products with different NFL coverage.
# So every candidate records the EXACT hostname and docs URL that was queried, and
# the artifact carries them — a feasibility verdict against an unnamed host is
# not a verdict anyone can re-check.
CANDIDATES = {
    "odds_api_io": {
        "host": "https://api.odds-api.io",
        "docs": "https://odds-api.io/",
        "published_free_tier": "100 requests/hour, 500/day, NFL included, "
                               "2 recreational books, permanent, no card",
        "priority": 1,
    },
    # the-odds-api.com REMOVED 2026-08-11. Cory confirmed the site is odds-api.io,
    # the source question is closed on it, and keeping a second similarly-named
    # host in the table is what caused the key to be sent to the WRONG PROVIDER —
    # which would have reported "the key does not work" as a fact about the key.
    # One odds source, unambiguous. The name collision is recorded in
    # MARKET-LAYER.md so the history is not lost with the code.
    "parlayapi": {
        "host": "https://api.parlayapi.com",
        "docs": "https://parlayapi.com/",
        "note": "PROBED, NOT BUILT AGAINST. Advertises props from 30+ books and a "
                "closing archive; ships llms.txt / agents.json.",
        "priority": 3,
    },
}

SLEEPER_TRENDING = "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=48&limit=25"

# ═══ ESTABLISHED BY DISCOVERY — CONSTANTS NOW, NOT CALLS ═══════════════════
# Re-deriving these cost ~34 authenticated calls per run against a 100/hour cap:
# a third of the hour spent re-answering answered questions. Discovery is a
# ONE-TIME cost. Once paid it becomes a constant, and the probe's job shrinks to
# confirming these still hold.
ODDS_API_IO = {
    "host": "https://api.odds-api.io",
    "auth": "query parameter ?apiKey=",          # 400 vs 401 distinguished it
    "slate_endpoint": "/v3/events?apiKey={k}&sport=american-football&league=usa-nfl",
    "odds_endpoint": "/v3/odds?apiKey={k}&eventId={e}&bookmakers={b}",
    "nfl_league_slug": "usa-nfl",
    "nfl_preseason_slug": "usa-nfl-preseason",   # separate league; the live window
    "slate_in_one_request": True,                # 134 events from ONE call
    "odds_granularity": "per event — /v3/odds requires eventId",
    "recreational_books": ["DraftKings", "FanDuel", "BetMGM", "Caesars", "Bet365"],
    "free_plan_note": "free plan includes ALL recreational books; sharps, exchanges "
                      "and prediction markets are paid (verbatim from a 403 body)",
    "rate_headers": ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"],
    "hourly_limit_observed": 100,
}

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


def credits_per_snapshot(markets: int, books: int, per_market_per_book: bool) -> dict:
    """THE UNIT THAT ACTUALLY MATTERS: credits per useful SNAPSHOT, not per request.

    A request might cost one credit, or one credit per market per book — 1 request
    x 10 markets x 20 books is 200 credits, and nobody would guess that from the
    headline number. Getting this wrong is not a small error: it is the difference
    between an allowance that funds a season and one that funds three days.
    """
    cost = (markets * books) if per_market_per_book else 1
    return {"markets_requested": markets, "books_requested": books,
            "billing": "per market per book" if per_market_per_book else "per request",
            "credits_per_snapshot": cost}


def season_feasible(allowance: int, credits_per_snap: int, snaps_per_week: int,
                    weeks: int = 22, margin: float = 1.5, period: str = "season") -> dict:
    """`period` says WHAT RESETS AND WHEN — "season", "month", "day" or "hour".

    A 500-credit allowance means completely different things monthly and
    once-ever, and comparing a MONTHLY allowance against a SEASON requirement is
    a units error that would call a comfortable source infeasible (or the
    reverse). Part 2 asks how consumption is measured and what resets it; this is
    where that answer changes the verdict rather than sitting in a note.
    """

    """Season feasible, yes or no, WITH THE ARITHMETIC and a safety margin.

    The margin is not decoration: an allowance that exactly covers a perfect
    season covers nothing the first week a call needs a retry.
    """
    PER_PERIOD = {"season": weeks, "month": 4.35, "week": 1.0, "day": 1 / 7, "hour": 1 / 168}
    span = PER_PERIOD.get(period)
    if span is None:
        return {"season_feasible": None, "why": f"unknown allowance period {period!r}"}
    # Compare like with like: what the allowance funds IN ONE PERIOD against what
    # one period actually costs.
    need_per_period = credits_per_snap * snaps_per_week * span
    need = credits_per_snap * snaps_per_week * weeks
    need_with_margin = int(need_per_period * margin) or 1
    return {
        "allowance": allowance, "allowance_period": period,
        "credits_per_snapshot": credits_per_snap,
        "snapshots_per_week": snaps_per_week, "weeks": weeks,
        "credits_needed_whole_season": need,
        "credits_needed_per_period": round(need_per_period, 1),
        "safety_margin": margin,
        "credits_needed_per_period_with_margin": need_with_margin,
        "season_feasible": allowance >= need_with_margin,
        "arithmetic": (f"{credits_per_snap} credits/snapshot x {snaps_per_week}/wk "
                       f"x {span:.2f} wk-per-{period} = {need_per_period:.1f}, "
                       f"x{margin} margin = {need_with_margin} vs {allowance} per {period} "
                       f"(whole season would be {need})"),
    }


def summarise_odds_markets(sports: list) -> dict:
    nfl = [s for s in (sports or []) if str(s.get("key", "")).startswith("americanfootball_nfl")]
    return {"nfl_sport_keys": [s.get("key") for s in nfl], "sports_listed": len(sports or [])}


def _discover_paths(get, docs_url, host, candidates):    # pragma: no cover (egress)
    """Read the docs page for advertised paths, then try a bounded candidate set.

    Bounded on purpose: this either finds the endpoint or produces a negative that
    was actually earned. It does not become a provider hunt.
    """
    import re
    import urllib.request as _u
    found = {"docs_paths": [], "tried": {}}
    try:
        req = _u.Request(docs_url, headers={"user-agent": "mfga-market-probe"})
        with _u.urlopen(req, timeout=25) as r:
            html = r.read(400_000).decode("utf-8", "replace")
        # Any absolute api URL or quoted /path the page advertises.
        found["docs_paths"] = sorted(set(
            re.findall(r"https?://api\.[a-z0-9.\-]+/[A-Za-z0-9/_\-]{2,40}", html)
        ))[:15]
        found["docs_reachable"] = True
    except Exception as e:                                  # noqa: BLE001
        found["docs_reachable"] = False
        found["docs_error"] = f"{type(e).__name__}: {e}"
    for path in candidates:
        try:
            get(host + path)
            found["tried"][path] = 200
        except Exception as e:                              # noqa: BLE001
            found["tried"][path] = getattr(e, "code", str(type(e).__name__))
    found["responding"] = [p for p, c in found["tried"].items() if c == 200]
    return found


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
            # A NAIVE "nfl" SUBSTRING MATCHES iNFLation. The first cut of this
            # filter reported 478 football series; the list was full of CPI,
            # ARGINFLATION and gas-price markets. Match the TICKER PREFIX (which
            # is structured) or "football" as a word in the title.
            def _is_football(sr):
                tick = str(sr.get("ticker") or "").upper()
                title = str(sr.get("title") or "").lower()
                if tick.startswith(("KXNFL", "NFL", "KXNCAAF", "KXLEADERNFL", "KXCFB")):
                    return True
                return "football" in title or " nfl " in f" {title} "
            sport = [s for s in series if _is_football(s)]
            # THE ACTUAL QUESTION: not "does Kalshi run NFL markets" (it does —
            # 12,622 series, many NFL) but "does it price PLAYER PRODUCTION",
            # which is the only kind that maps to a fantasy projection. Team
            # results, coach markets and season awards do not.
            PROD = ("yard", "reception", "catch", "rushing", "passing", "receiving",
                    "completions", "attempts", "targets", "touchdown")
            prod = [s for s in sport if any(
                w in (str(s.get("ticker", "")) + " " + str(s.get("title", ""))).lower()
                for w in PROD)]
            summary["series_listed"] = len(series)
            summary["football_series_count"] = len(sport)
            summary["football_series_tickers"] = sorted(
                str(s.get("ticker") or "")[:28] for s in sport)[:60]
            summary["player_production_series"] = sorted(
                str(s.get("ticker") or "")[:28] for s in prod)[:30]
            summary["player_production_series_count"] = len(prod)
        except Exception as se:                             # noqa: BLE001
            summary["series_endpoint_error"] = f"{type(se).__name__}: {se}"
        out["sources"]["kalshi"] = summary
    except Exception as e:                                  # noqa: BLE001
        out["errors"]["kalshi"] = f"{type(e).__name__}: {e}"

    # ── ODDS-API.IO — priority 1: published free tier needs no card ────────
    # Probed WITHOUT a key first, because the question "is the free tier usable
    # without payment" is answered by trying it, not by reading the pricing page.
    # ── ODDS-API.IO — CONFIRM, DO NOT RE-DISCOVER ──────────────────────────
    # TWO authenticated calls, not thirty-four. Everything the discovery runs
    # established is in ODDS_API_IO above; this checks the two facts that would
    # actually invalidate the plan if they changed — the slate still returns in
    # one request, and the rate headers still report a budget we can steer by.
    c = CANDIDATES["odds_api_io"]
    io = {"host": c["host"], "docs": c["docs"], "established": ODDS_API_IO}
    io_key = os.environ.get("ODDS_API_KEY", "").strip()
    io["key_configured"] = bool(io_key)
    if io_key:
        from market_budget import RateBudget
        budget = RateBudget(limit=ODDS_API_IO["hourly_limit_observed"])
        try:
            url = c["host"] + ODDS_API_IO["slate_endpoint"].replace("{k}", io_key)
            ev, h = get(url)
            budget.observe(h)
            budget.note_call()
            io["slate"] = {
                "events_in_one_request": len(ev or []),
                "one_call_covers_slate": len(ev or []) > 1,
                "budget": budget.snapshot(),
            }
            # The second call only happens if the budget says it can be afforded
            # AND leave the reserve intact — the probe obeys the same rule the
            # capture job will.
            if ev and budget.affordable(1):
                eid = (ev[0] or {}).get("id")
                bm = ",".join(ODDS_API_IO["recreational_books"][:2])
                od, h2 = get(c["host"] + ODDS_API_IO["odds_endpoint"]
                             .replace("{k}", io_key).replace("{e}", str(eid))
                             .replace("{b}", urllib.parse.quote(bm, safe=",")))
                budget.observe(h2)
                budget.note_call()
                body = json.dumps(od)
                io["odds_payload"] = {
                    "status": 200, "bytes": len(body),
                    "has_spread": any(w in body.lower() for w in ("spread", "handicap")),
                    "has_total": any(w in body.lower() for w in ("total", "over")),
                    "mentions_props": [w for w in ("player", "reception", "yard")
                                       if w in body.lower()],
                    "top_keys": sorted(od.keys())[:14] if isinstance(od, dict) else f"list[{len(od)}]",
                    "sample": _redact(body[:400]),
                    "budget": budget.snapshot(),
                }
            else:
                io["odds_payload"] = {"skipped": "budget reserve would be breached"}
        except Exception as e:                                  # noqa: BLE001
            io["error"] = _redact(f"{type(e).__name__}: {e}")
            io["budget"] = budget.snapshot()

    # ── PARLAYAPI — priority 3: probed, NOT built against ──────────────────
    c = CANDIDATES["parlayapi"]
    pa = {"host": c["host"], "docs": c["docs"], "note": c["note"]}
    try:
        # llms.txt is the cheapest possible existence check and tells us whether
        # the provider really is designed for programmatic consumption.
        import urllib.request as _u
        req = _u.Request(c["docs"].rstrip("/") + "/llms.txt",
                         headers={"user-agent": "mfga-market-probe"})
        with _u.urlopen(req, timeout=20) as r:
            body = r.read(4000).decode("utf-8", "replace")
        pa.update(reachable=True, llms_txt=True, llms_txt_head=body[:400])
    except Exception as e:                                  # noqa: BLE001
        pa.update(reachable=False, llms_txt=False, error=f"{type(e).__name__}: {e}")
    out["sources"]["parlayapi"] = pa

    return out


if __name__ == "__main__":                                  # pragma: no cover
    res = probe()
    OUT.write_text(json.dumps(res, indent=2, sort_keys=True) + "\n")
    for name, s in res["sources"].items():
        print(f"{name}: {json.dumps(s)[:300]}")
    for name, e in (res.get("errors") or {}).items():
        print(f"  ERROR {name}: {e}")
    print(f"wrote {OUT}")
