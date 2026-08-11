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
    c = CANDIDATES["odds_api_io"]
    io = {"host": c["host"], "docs": c["docs"],
          "published_free_tier": c["published_free_tier"]}
    # THE KEY BELONGS TO odds-api.io, NOT the-odds-api.com. It was being sent to
    # the wrong provider, which would have produced a 401 and a report that "the
    # key does not work" — a false negative about the KEY rather than a fact about
    # either provider. Exactly the failure the new habit names.
    io_key = os.environ.get("ODDS_API_KEY", "").strip()
    io["key_configured"] = bool(io_key)
    # PATH DISCOVERY, because /sports was a GUESS and returned 404. A 404 on a
    # guessed path says nothing about the provider — reporting it as a negative
    # would repeat the Kalshi mistake, where "0 NFL markets" turned out to be
    # pagination. So: read the docs page, extract the api paths it advertises,
    # and try a bounded candidate set. Whatever this finds, the hunt stops here.
    io["path_probe"] = _discover_paths(get, c["docs"], c["host"], [
        "/sports", "/v1/sports", "/api/sports", "/v3/sports",
        "/leagues", "/v1/leagues", "/fixtures", "/v1/fixtures", "/odds", "/v1/odds",
    ])
    # /v3/sports responds 200 WITHOUT a key (path discovery, run 6). Walk from
    # there to the questions that decide feasibility: NFL coverage, which markets,
    # and — the number that actually matters — what one useful snapshot costs.
    try:
        data, hdrs = get(f"{c['host']}/v3/sports")
        rows = data if isinstance(data, list) else (data.get("data") or data.get("sports") or [])
        def _blob(x):
            return json.dumps(x).lower() if not isinstance(x, str) else x.lower()
        nfl = [r for r in rows if "nfl" in _blob(r) or "american football" in _blob(r)]
        io.update(reachable=True, needs_key=False, sports_listed=len(rows),
                  nfl_present=bool(nfl), nfl_entries=[str(r)[:90] for r in nfl[:4]],
                  rate_headers={k: v for k, v in hdrs.items()
                                if any(w in k.lower() for w in
                                       ("limit", "remain", "quota", "reset", "credit"))})
        # Markets/props: try the documented shapes for a bookmakers/markets list.
        # AUTHENTICATED PROBE — the questions that decide feasibility all live
        # behind the 401. The auth SHAPE is not documented to me, so rather than
        # guess one and report its failure as a fact, try a bounded set and record
        # WHICH works. A 401 against an auth style I invented is evidence about my
        # request, not about the provider.
        if io_key:
            auth_styles = {
                "query_apiKey": ("/v3/events?apiKey={k}", None),
                "query_apikey": ("/v3/events?apikey={k}", None),
                "query_key": ("/v3/events?key={k}", None),
                "header_x_api_key": ("/v3/events", {"x-api-key": io_key}),
                "header_authorization": ("/v3/events", {"authorization": f"Bearer {io_key}"}),
            }
            io["auth_probe"] = {}
            working = None
            for style, (path, hdr) in auth_styles.items():
                url = c["host"] + path.replace("{k}", io_key)
                try:
                    d3, h3 = get(url, headers=dict({"user-agent": "mfga-market-probe"}, **(hdr or {})))
                    rows = (len(d3) if isinstance(d3, list)
                            else len(d3.get("data") or d3.get("events") or []))
                    io["auth_probe"][style] = {
                        "status": 200, "rows": rows,
                        # THE NUMBER THAT MATTERS: rows > 1 from ONE request means
                        # the slate is retrievable in a single call.
                        "rate_headers": {k: v for k, v in h3.items() if any(
                            w in k.lower() for w in ("limit", "remain", "quota", "reset", "credit"))},
                    }
                    working = working or style
                except Exception as e3:                     # noqa: BLE001
                    io["auth_probe"][style] = {"status": getattr(e3, "code", str(type(e3).__name__))}
            io["auth_style_working"] = working

            # FOLLOW THE 400. A 401 is auth rejected; a 400 is auth ACCEPTED and
            # the request malformed — so `apiKey` is the right parameter and
            # /v3/events simply needs more of them. Reading that 400 as "the key
            # does not work" would be rule 13 exactly: evidence about my request
            # reported as a fact about the provider. Bounded sweep of the shapes a
            # fixtures endpoint plausibly requires, recording what each returns.
            if not working and io["auth_probe"].get("query_apiKey", {}).get("status") == 400:
                k = io_key
                shapes = {
                    "events+sport": f"/v3/events?apiKey={k}&sport=american-football",
                    "events+sport+league": f"/v3/events?apiKey={k}&sport=american-football&league=NFL",
                    "events+league": f"/v3/events?apiKey={k}&league=NFL",
                    "events+sportId": f"/v3/events?apiKey={k}&sportId=american-football",
                    "leagues": f"/v3/leagues?apiKey={k}",
                    "leagues+sport": f"/v3/leagues?apiKey={k}&sport=american-football",
                    "sports": f"/v3/sports?apiKey={k}",
                    "odds+league": f"/v3/odds?apiKey={k}&league=NFL",
                }
                io["shape_probe"] = {}
                for name, path in shapes.items():
                    try:
                        d4, h4 = get(c["host"] + path)
                        rows = (len(d4) if isinstance(d4, list)
                                else len(d4.get("data") or d4.get("events") or d4.get("leagues") or []))
                        body = json.dumps(d4)[:400]
                        io["shape_probe"][name] = {
                            "status": 200, "rows": rows,
                            "rate_headers": {kk: vv for kk, vv in h4.items() if any(
                                w in kk.lower() for w in ("limit", "remain", "quota", "reset", "credit"))},
                            "sample": body,
                        }
                        io["auth_style_working"] = io["auth_style_working"] or "query_apiKey"
                    except Exception as e5:                 # noqa: BLE001
                        # The BODY of a 400 usually names the missing parameter.
                        detail = ""
                        try:
                            detail = e5.read().decode("utf-8", "replace")[:200]
                        except Exception:                    # noqa: BLE001
                            pass
                        io["shape_probe"][name] = {
                            "status": getattr(e5, "code", str(type(e5).__name__)),
                            "detail": detail}

                # FEASIBILITY, end to end. /v3/events?sport= returns the whole
                # slate in ONE call, but /v3/odds wants an eventId — so a Signal-B
                # capture is 1 + N, not 1. Establish N and what the odds payload
                # actually carries.
                try:
                    lg, _ = get(c["host"] + f"/v3/leagues?apiKey={k}&sport=american-football")
                    try:
                        bl, _ = get(c["host"] + "/v3/bookmakers")
                        io["_books"] = [b for b in (bl or []) if b.get("active")][:6]
                        io["active_books_sample"] = [b.get("name") for b in (io["_books"] or [])]
                    except Exception:                        # noqa: BLE001
                        io["_books"] = []
                    io["football_leagues"] = [
                        {"name": x.get("name"), "slug": x.get("slug"),
                         "events": x.get("eventsCount")} for x in (lg or [])]
                    nfl = next((x for x in (lg or []) if "nfl" in str(x.get("slug", "")).lower()
                                or "nfl" in str(x.get("name", "")).lower()), None)
                    io["nfl_league"] = nfl
                    if nfl:
                        ev, h5 = get(c["host"] + f"/v3/events?apiKey={k}&sport=american-football"
                                                 f"&league={nfl['slug']}")
                        io["nfl_slate"] = {
                            "events_in_one_request": len(ev or []),
                            "remaining_after": h5.get("x-ratelimit-remaining"),
                        }
                        if ev:
                            eid = (ev[0] or {}).get("id")
                            # NAMED RECREATIONAL BOOKS. Taking the first active entries alphabetically
                            # picked 10BET/12bet — all sharp or exchange books, which the free
                            # plan excludes, so the 403 was about MY choice of book and not
                            # about coverage. The error text is the finding: "your free plan
                            # includes ALL the recreational bookmakers".
                            bm = "draftkings,fanduel"
                            od, h6 = get(c["host"] + f"/v3/odds?apiKey={k}&eventId={eid}"
                                                     f"&bookmakers={bm}")
                            body = json.dumps(od)
                            io["odds_payload"] = {
                                "status": 200, "bytes": len(body),
                                "has_spread": any(w in body.lower() for w in ("spread", "handicap")),
                                "has_total": any(w in body.lower() for w in ("total", "over_under", "overunder")),
                                "mentions_props": [w for w in ("player", "receptions", "yards")
                                                   if w in body.lower()],
                                "bookmakers_seen": len(od.get("bookmakers") or []) if isinstance(od, dict) else None,
                                "top_keys": sorted(od.keys())[:14] if isinstance(od, dict) else f"list[{len(od)}]",
                                "sample": body[:500],
                                "remaining_after": h6.get("x-ratelimit-remaining"),
                            }
                except Exception as e6:                     # noqa: BLE001
                    det = ""
                    try:
                        det = e6.read().decode("utf-8", "replace")[:200]
                    except Exception:                        # noqa: BLE001
                        pass
                    io["feasibility_error"] = f"{type(e6).__name__}: {e6} {det}"

                # RETRY COST — the operational detail least likely to be
                # documented and most likely to bite. Read the counter, make a
                # request that MUST fail, read it again.
                try:
                    _, ha = get(c["host"] + f"/v3/events?apiKey={k}&sport=american-football")
                    before = ha.get("x-ratelimit-remaining")
                    try:
                        get(c["host"] + f"/v3/events?apiKey={k}")      # 400: sport required
                    except Exception:                                   # noqa: BLE001
                        pass
                    _, hb2 = get(c["host"] + f"/v3/events?apiKey={k}&sport=american-football")
                    after = hb2.get("x-ratelimit-remaining")
                    drop = (int(before) - int(after)) if (before and after) else None
                    io["retry_cost"] = {
                        "remaining_before": before, "remaining_after": after,
                        "drop_across_two_good_and_one_bad": drop,
                        "failed_requests_bill": (drop is not None and drop > 2),
                        "note": "two successful calls bracket one guaranteed 400; a drop of 2 "
                                "means only the successes billed, 3 means the failure billed too",
                    }
                except Exception as e7:                     # noqa: BLE001
                    io["retry_cost"] = {"error": f"{type(e7).__name__}: {e7}"}
            # RETRY COST: does a FAILED request consume budget? Compare the
            # remaining-quota header before and after a deliberate 404.
            if working:
                try:
                    _, hb = get(c["host"] + "/v3/sports")
                    before = {k: v for k, v in hb.items() if "remain" in k.lower()}
                    try:
                        get(c["host"] + "/v3/definitely-not-a-real-path")
                    except Exception:                        # noqa: BLE001
                        pass
                    _, ha = get(c["host"] + "/v3/sports")
                    after = {k: v for k, v in ha.items() if "remain" in k.lower()}
                    io["retry_cost_probe"] = {"remaining_before": before, "remaining_after": after,
                                              "note": "if the counter moved by more than the two "
                                                      "successful calls, failed requests bill"}
                except Exception as e4:                     # noqa: BLE001
                    io["retry_cost_probe"] = {"error": f"{type(e4).__name__}: {e4}"}

        # THE NUMBER THAT MATTERS: does ONE request return the whole NFL slate, or
        # one game per request? That is one call a week versus sixteen, and it is
        # why "500/day is enormous" and "measure the real cost" only agree if a
        # request is cheap. /v3 is the working prefix (path discovery, run 6).
        for probe_path in ("/v3/bookmakers", "/v3/markets", "/v3/leagues",
                           "/v3/events", "/v3/events?sport=american-football",
                           "/v3/fixtures?sport=american-football",
                           "/v3/odds?sport=american-football",
                           "/v3/matches?sport=american-football"):
            try:
                d2, h2 = get(c["host"] + probe_path)
                body = json.dumps(d2)[:1200].lower()
                io.setdefault("secondary", {})[probe_path] = {
                    "status": 200,
                    "keys": sorted(d2.keys())[:12] if isinstance(d2, dict) else f"list[{len(d2)}]",
                    # SLATE vs PER-GAME: how many event-like rows came back from ONE
                    # request. >1 means the slate is retrievable in a single call.
                    "rows": (len(d2) if isinstance(d2, list) else
                             len(d2.get("data") or d2.get("events") or d2.get("fixtures") or [])),
                    # Do the four props and any TOUCHDOWN market appear at all?
                    "mentions_props": [w for w in ("player_", "receptions", "reception_yds",
                                                   "rush_yds", "pass_yds") if w in body],
                    "mentions_touchdown": ("touchdown" in body or "_td" in body or "anytime" in body),
                    "rate_headers": {k: v for k, v in h2.items()
                                     if any(w in k.lower() for w in ("limit", "remain", "credit"))},
                    "sample": body[:260],
                }
            except Exception as e2:                         # noqa: BLE001
                io.setdefault("secondary", {})[probe_path] = {
                    "status": getattr(e2, "code", str(type(e2).__name__))}
    except Exception as e:                                  # noqa: BLE001
        code = getattr(e, "code", None)
        io.update(reachable=(code is not None), needs_key=(code in (401, 403)),
                  status=code, error=f"{type(e).__name__}: {e}")
    out["sources"]["odds_api_io"] = io

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
