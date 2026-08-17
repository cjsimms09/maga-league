# TERRITORY: A
"""KALSHI SEASON-LONG PLAYER LADDERS — free, no key, THE UNRECOVERABLE WINDOW.

Cory, 2026-08-16: "Agreed on Kalshi! Set it up for the future. Make sure we are
happy about it 2027 and not upset we didn't capture something."

WHY THIS EXISTS. Kalshi runs season-long PLAYER stat markets for 2026-27 that
The Odds API does not sell at any price (every season-long market key 422s
there — key-probe run 31970500296). They are free and need no API key. And
their PRICES TODAY are the thing that expires: a market's August price is what
a drafter could actually have acted on, and once the season starts that number
is gone forever. Same logic market-capture.yml already runs on — "a snapshot
not taken cannot be reconstructed."

WHAT THE MARKETS ACTUALLY ARE (verified live, free-betting-probe.yml run
31970...):

    KXNFLSEASONRECYDS-27C1000-ZFLOWERS4
    "Will Zay Flowers record 1000+ receiving yards during 2026-27?"

Each series is a LADDER of yes/no thresholds per player. Zay Flowers, measured:

    750+  last 0.69      1000+ last 0.51 (OI 1004)
    1250+ last 0.33      1500+ last 0.17 (OI  239)

Monotonically decreasing — which makes it a CUMULATIVE DISTRIBUTION over his
season, not a point estimate. That is strictly more information than own_v6 or
FantasyPros produce, both of which emit a single mean. It yields P(breakout)
directly, which is the number that actually decides a late-round pick: two
players projected for the same mean are NOT the same pick if one has 12%
chance of 1250+ and the other 3%.

PRICES ARE NOT PROBABILITIES, QUITE. A Kalshi contract settles at $1, so its
price reads as a probability — but bid/ask spreads here are often enormous
(Flowers 750+: bid 0.04, ask 0.84), so a `last` price can be stale by days.
This module stores last/bid/ask/open_interest SEPARATELY and never collapses
them, so the grader in 2027 can decide what to trust rather than inheriting a
choice made today.

COHERENCE IS A FREE DATA-QUALITY SIGNAL. P(>=750) must be >= P(>=1000) >=
P(>=1250) >= P(>=1500). Where that ordering breaks, the ladder is stale rather
than informative — `ladder_coherence` reports it instead of smoothing it away.

NOT A BOARD INPUT. This captures and grades only. Nothing here feeds proj_mean,
VORP or ranking; wiring it anywhere is a separate, graded, promotable decision
under the same champion/challenger bar every other arm faces. Cory's own
standard, from draft/backtest/market_probe.py: "a thin market carries little
information no matter how accessible it is."

PURE VS I/O, same split as fetch_odds.py / fetch_historical_props.py: every
function that parses, reconstructs a ladder or checks coherence is pure and
tested in draft/tests/test_fetch_kalshi.py. Only `_get` and `fetch_all` touch
the network, and they run in CI (this sandbox cannot reach kalshi.com).

Run (CI):
    python3 draft/tools/fetch_kalshi.py fetch
Writes draft/data/kalshi/season_ladders_<UTC-date>.json
"""
from __future__ import annotations

import argparse
import collections
import datetime as _dt
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
OUT_DIR = DRAFT / "data" / "kalshi"

BASE = "https://api.elections.kalshi.com/trade-api/v2"

#: Season-long PLAYER stat series -> the component-store stat key its threshold
#: is denominated in. Only series whose rungs are a player's own season total
#: belong here: a ladder is only reconstructable into a distribution if every
#: rung measures the SAME quantity for the SAME player.
SERIES_TO_STAT = {
    "KXNFLSEASONRECYDS": "rec_yd",
    "KXNFLSEASONRSHYDS": "rush_yd",
    "KXNFLSEASONPASSYDS": "pass_yd",
    "KXNFLSEASONREC": "rec",
    "KXNFLSEASONRECTD": "rec_td",
    "KXNFLSEASONRSHTD": "rush_td",
}

#: GAME-LEVEL (weekly) player series. Cory, 2026-08-16: "Let's make sure the
#: Kalshi weekly get built when it can! Do not forget."
#:
#: SELF-ACTIVATING BY DESIGN — this is the whole point. On 2026-08-16 every one
#: of these carried ZERO current-season events (the only live KXNFLANYTD events
#: were January 2026 playoff games), because books post game markets days, not
#: months, ahead. Rather than leave a note for a human to remember in
#: September, `fetch_weekly` runs against these EVERY DAY and records an honest
#: empty capture until the events appear — at which point it simply starts
#: returning data with no human action at all. A calendar reminder is a promise;
#: a daily job that already works is a mechanism.
#:
#: These feed the WEEKLY loop (weekly_own_grade.py's champion/challenger), not
#: the draft. Different question, different data — Cory's own distinction.
WEEKLY_SERIES = {
    "KXNFLANYTD": "anytime touchdown (per game)",
    "KXNFLPASSYDS": "passing yards (per game)",
    "KXNFLRSHYDS": "rushing yards (per game)",
    "KXNFLPASSTDS": "passing touchdowns (per game)",
    "KXNFLPASSCOMP": "passing completions (per game)",
    "KXNFLPASSINT": "passing interceptions (per game)",
    "KXNFLRSHATT": "rushing ATTEMPTS — pure volume, i.e. role",
    "KXNFLGAMETD": "touchdowns (per game)",
    "KXNFL2TD": "multiple touchdowns (per game)",
    # THE TWO THAT MAY MATTER MOST, and that no projection model we own can
    # produce: market-priced player AVAILABILITY. The 2026-08-16 start/sit
    # study found QB is our worst slot (.4935 accuracy — below a coin flip —
    # forfeiting ~390 of ~1,130 bench points), and QB outcomes hinge on who
    # actually suits up. A live P(plays) aims straight at our measured
    # weakest point.
    "KXNFLWEEKCOMPETE": "will a player PLAY this week (availability)",
    "KXNFLCOMPETE": "will a player compete in a game (availability)",
}

#: Deliberately EXCLUDED, with reasons, so a future reader does not "helpfully"
#: add them back:
#:   KXNFLFFLEADER / KXNFLFFTOP — "#1 ranked fantasy X" is a WINNER-TAKE-ALL
#:     market, not a threshold on a player's own total, so its rungs cannot be
#:     assembled into a per-player distribution. Measured 2026-08-16: every
#:     rookie market last=0.0000, OI=0.00 — untraded on top of that.
#:   KXNFLFFPTS — priced in fantasy points, which would be ideal, but the live
#:     probe found ZERO events under it. Re-check before each season.
#:   KXNFLANYTD — weekly, not season-long; its only live events were January
#:     2026 playoff games. Belongs to the weekly loop, not the draft study.
EXCLUDED_SERIES = {
    "KXNFLFFLEADER": "winner-take-all, not a per-player threshold ladder; untraded",
    "KXNFLFFTOP": "winner-take-all rank market, same reason",
    "KXNFLFFPTS": "zero live events as of 2026-08-16 — recheck each season",
    "KXNFLANYTD": "weekly market, not season-long; belongs to the weekly loop",
}


# ── pure: parsing Kalshi's dollars-denominated schema ─────────────────────

def _num(m: dict, *keys):
    """First present value among `keys`.

    Kalshi returns a DOLLARS-denominated schema — last_price_dollars,
    yes_bid_dollars, open_interest_fp — NOT the volume/open_interest/yes_bid
    names an older API version used. Reading the wrong key returns None for
    every market and reads exactly like a dead, illiquid catalog; that error
    was made against these very markets on 2026-08-16 and nearly killed a real
    lead. This helper accepts both vocabularies so a schema change degrades
    instead of silently zeroing everything."""
    for k in keys:
        v = m.get(k)
        if v not in (None, ""):
            return v
    return None


def parse_market(m: dict) -> dict | None:
    """One Kalshi market row -> a flat record, or None if it is not a
    player-threshold market this module understands.

    Ticker shape: SERIES-<event>-<PLAYER>, e.g.
    KXNFLSEASONRECYDS-27C1000-ZFLOWERS4. The middle segment carries the rung
    (27C1000 = the 1000+ threshold); the last carries the player."""
    tick = m.get("ticker") or ""
    parts = tick.split("-")
    if len(parts) < 3:
        return None
    series = parts[0]
    if series not in SERIES_TO_STAT:
        return None
    rung_raw, player = parts[-2], parts[-1]
    threshold = _rung_threshold(rung_raw)
    if threshold is None:
        return None
    return {
        "ticker": tick,
        "series": series,
        "stat": SERIES_TO_STAT[series],
        "player_code": player,
        "threshold": threshold,
        "status": m.get("status"),
        # Kept SEPARATE on purpose — see the module docstring. A `last` can be
        # days stale while bid/ask are live, and collapsing them here would
        # bake today's guess into a 2027 grade.
        "last": _f(_num(m, "last_price_dollars", "last_price")),
        "yes_bid": _f(_num(m, "yes_bid_dollars", "yes_bid")),
        "yes_ask": _f(_num(m, "yes_ask_dollars", "yes_ask")),
        "open_interest": _f(_num(m, "open_interest_fp", "open_interest")),
        "liquidity": _f(_num(m, "liquidity_dollars")),
        "close_time": m.get("close_time"),
        "title": m.get("title") or m.get("yes_sub_title"),
    }


def _f(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _rung_threshold(rung: str) -> float | None:
    """'27C1000' -> 1000.0. The leading '27' is the season, 'C' the convention
    Kalshi uses before the numeric strike. Anything without a trailing number
    is not a threshold rung (winner-take-all markets land here) and is
    rejected rather than guessed at."""
    digits = ""
    for ch in reversed(rung):
        if ch.isdigit():
            digits = ch + digits
        else:
            break
    if not digits:
        return None
    # A rung like '27ROOK' has no trailing digits; '27C1000' yields '1000'.
    # Guard the degenerate case where the season prefix itself is all that is
    # left (e.g. a bare '27'), which is not a strike.
    if digits == rung.lstrip("0"):
        return None
    return float(digits)


def build_ladders(markets: list) -> dict:
    """[parsed market] -> {(player_code, stat): [rung, ...]} sorted ascending
    by threshold. A ladder of one rung is kept — it is still a real datapoint,
    just not yet a distribution — and `ladder_coherence` reports its width."""
    out: dict = collections.defaultdict(list)
    for m in markets:
        out[(m["player_code"], m["stat"])].append(m)
    return {k: sorted(v, key=lambda r: r["threshold"]) for k, v in out.items()}


def ladder_coherence(rungs: list, price_key: str = "last") -> dict:
    """Is this ladder a valid cumulative distribution?

    P(>=750) >= P(>=1000) >= P(>=1250) must hold: clearing a higher bar is
    strictly harder. A violation means at least one rung is stale, and that is
    reported rather than smoothed — a broken ladder is a data-quality SIGNAL,
    not noise to be averaged away.

    Rungs with no price at all are excluded and counted, never treated as
    zero probability (absent != zero, this repo's standing rule)."""
    priced = [r for r in rungs if r.get(price_key) is not None]
    violations = []
    for a, b in zip(priced, priced[1:]):
        pa, pb = a[price_key], b[price_key]
        if pb > pa + 1e-9:
            violations.append({"lower": a["threshold"], "upper": b["threshold"],
                               "p_lower": pa, "p_upper": pb})
    return {
        "rungs": len(rungs),
        "priced_rungs": len(priced),
        "unpriced_rungs": len(rungs) - len(priced),
        "monotone": not violations,
        "violations": violations,
        "thresholds": [r["threshold"] for r in rungs],
    }


def implied_distribution(rungs: list, price_key: str = "last") -> dict | None:
    """A priced ladder -> the survival function it implies, plus a lower-bound
    expectation.

    P(X >= t) for each rung t is the price itself. The bucket masses between
    consecutive rungs follow by differencing. `expectation_lower_bound` sums
    mass x the LOWER edge of each bucket and is therefore deliberately
    CONSERVATIVE: the open top bucket (above the highest rung) is credited
    only at that rung's threshold, though its true mean is higher. It is a
    floor on the market's expectation, named as one — NOT a projection, and
    never to be presented as own_v6's equal without that caveat.

    Returns None when fewer than 2 rungs carry a price: a single point is not
    a distribution."""
    priced = [r for r in rungs if r.get(price_key) is not None]
    if len(priced) < 2:
        return None
    surv = [(r["threshold"], r[price_key]) for r in priced]
    buckets = []
    for (t_lo, p_lo), (t_hi, p_hi) in zip(surv, surv[1:]):
        buckets.append({"lo": t_lo, "hi": t_hi, "mass": round(p_lo - p_hi, 6)})
    top_t, top_p = surv[-1]
    buckets.append({"lo": top_t, "hi": None, "mass": round(top_p, 6)})
    lower_bound = sum(b["mass"] * b["lo"] for b in buckets)
    return {
        "survival": [{"threshold": t, "p_at_least": p} for t, p in surv],
        "buckets": buckets,
        "expectation_lower_bound": round(lower_bound, 3),
        "p_top_rung": top_p,
        "top_threshold": top_t,
        "note": ("expectation_lower_bound credits the open top bucket at its "
                 "floor, so it UNDERSTATES the market's mean by construction; "
                 "it is a floor, not a projection"),
    }


def summarize(ladders: dict) -> dict:
    """Capture-health summary, so a thin or broken snapshot announces itself
    rather than needing an audit pass to discover."""
    total = len(ladders)
    multi = {k: v for k, v in ladders.items() if len(v) > 1}
    incoherent, priced_any, oi_total = 0, 0, 0.0
    for rungs in ladders.values():
        c = ladder_coherence(rungs)
        if not c["monotone"]:
            incoherent += 1
        if c["priced_rungs"]:
            priced_any += 1
        oi_total += sum((r.get("open_interest") or 0) for r in rungs)
    by_stat = collections.Counter(k[1] for k in ladders)
    return {
        "player_stat_ladders": total,
        "ladders_with_2plus_rungs": len(multi),
        "ladders_with_any_price": priced_any,
        "incoherent_ladders": incoherent,
        "total_open_interest": round(oi_total, 2),
        "by_stat": dict(by_stat),
    }


# ── I/O ───────────────────────────────────────────────────────────────────

def _get(path: str) -> dict:
    import urllib.request
    req = urllib.request.Request(BASE + path,
                                 headers={"User-Agent": "maga-league-kalshi"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_all() -> dict:
    """Every season-long player ladder Kalshi currently lists. No key, no
    credits — this costs nothing and can run as often as we like."""
    rows, errors = [], {}
    for series in sorted(SERIES_TO_STAT):
        try:
            body = _get(f"/markets?series_ticker={series}&limit=1000")
        except Exception as e:  # noqa: BLE001 — one dead series must not lose the rest
            errors[series] = f"{type(e).__name__}: {e}"
            continue
        for m in (body.get("markets") or []):
            rec = parse_market(m)
            if rec:
                rows.append(rec)
    ladders = build_ladders(rows)
    captured = _dt.datetime.now(_dt.timezone.utc).isoformat()
    out = {
        "_territory": "TERRITORY: A — produced by draft/tools/fetch_kalshi.py",
        "_note": ("Kalshi season-long PLAYER threshold ladders. Prices are "
                  "point-in-time and UNRECOVERABLE once they move — that is "
                  "the whole reason this runs on a schedule. last/bid/ask/OI "
                  "are stored separately and never collapsed; a grader in "
                  "2027 chooses what to trust. NOT a board input."),
        "captured_at": captured,
        "source": "api.elections.kalshi.com /trade-api/v2 (public, no key)",
        "series_captured": sorted(SERIES_TO_STAT),
        "series_excluded": EXCLUDED_SERIES,
        "errors": errors,
        "health": summarize(ladders),
        "ladders": [
            {
                "player_code": pc, "stat": stat,
                "coherence": ladder_coherence(rungs),
                "implied": implied_distribution(rungs),
                "rungs": rungs,
            }
            for (pc, stat), rungs in sorted(ladders.items())
        ],
    }
    return out


def fetch_weekly() -> dict:
    """Game-level player markets, captured raw.

    Runs every day and returns an HONEST EMPTY capture until Kalshi lists
    current-season events — which is the mechanism that stops "build the
    weekly capture in September" from depending on anyone remembering. When
    the markets appear, this starts producing data by itself.

    Deliberately does NOT reshape rows into ladders. The season series were
    verified live and their ticker grammar is known; these were dormant when
    this was written, so their real shape is UNCONFIRMED. Inventing a parse
    for markets nobody has seen is exactly the error that cost us the
    anytime-TD column today (a converter written against an assumed odds
    format, shipped, and wrong by 21-33x). Store raw, parse once the real
    shape is in front of us."""
    out, errors = {}, {}
    for series in sorted(WEEKLY_SERIES):
        try:
            body = _get(f"/markets?series_ticker={series}&limit=1000")
        except Exception as e:  # noqa: BLE001
            errors[series] = f"{type(e).__name__}: {e}"
            continue
        rows = body.get("markets") or []
        out[series] = {
            "description": WEEKLY_SERIES[series],
            "market_count": len(rows),
            "statuses": dict(collections.Counter(m.get("status") for m in rows)),
            "markets": rows,
        }
    live = {k: v["market_count"] for k, v in out.items() if v["market_count"]}
    return {
        "_territory": "TERRITORY: A — produced by draft/tools/fetch_kalshi.py",
        "_note": ("Kalshi GAME-LEVEL player markets, stored RAW and unparsed. "
                  "Feeds the weekly loop, not the draft. An empty capture is a "
                  "real result, not a failure: these series carry no events "
                  "until the season is close."),
        "captured_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "source": "api.elections.kalshi.com /trade-api/v2 (public, no key)",
        "series_polled": sorted(WEEKLY_SERIES),
        "series_with_markets": live,
        "any_live": bool(live),
        "errors": errors,
        "by_series": out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("fetch", help="capture today's season ladders (free)")
    p.add_argument("--out-dir", type=str, default=None)
    pw = sub.add_parser("fetch-weekly",
                        help="poll the game-level series; empty until they open")
    pw.add_argument("--out-dir", type=str, default=None)
    args = ap.parse_args()

    if args.cmd == "fetch-weekly":
        doc = fetch_weekly()
        out_dir = Path(args.out_dir) if args.out_dir else OUT_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        day = doc["captured_at"][:10]
        if not doc["any_live"]:
            # Do NOT write a file per day while dormant — that is 25 days of
            # identical empty artifacts before the season. Report and exit 0;
            # dormancy is the expected state, not an error.
            print(f"weekly: no live markets yet ({len(doc['series_polled'])} series polled)")
            if doc["errors"]:
                print(f"  errors: {doc['errors']}")
            return 0
        path = out_dir / f"weekly_markets_{day}.json"
        path.write_text(json.dumps(doc, indent=1))
        print(f"WEEKLY MARKETS ARE LIVE — wrote {path}")
        print(f"  series with markets: {doc['series_with_markets']}")
        return 0

    if args.cmd == "fetch":
        doc = fetch_all()
        out_dir = Path(args.out_dir) if args.out_dir else OUT_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        day = doc["captured_at"][:10]
        path = out_dir / f"season_ladders_{day}.json"
        path.write_text(json.dumps(doc, indent=1))
        h = doc["health"]
        print(f"wrote {path}")
        print(f"  ladders: {h['player_stat_ladders']} "
              f"({h['ladders_with_2plus_rungs']} with 2+ rungs, "
              f"{h['ladders_with_any_price']} priced)")
        print(f"  incoherent: {h['incoherent_ladders']}; "
              f"total OI: {h['total_open_interest']}")
        print(f"  by stat: {h['by_stat']}")
        if doc["errors"]:
            print(f"  ERRORS: {doc['errors']}")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
