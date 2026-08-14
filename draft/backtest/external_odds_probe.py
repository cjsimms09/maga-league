#!/usr/bin/env python3
# TERRITORY: C
"""DOES THE ODDS PIPE CARRY ANYTHING THAT MAPS ONTO OUR SCORING? ONE REQUEST ANSWERS IT.

Cory's words, routed through A as the priority: *"we're paying for the pipe and
pulling the one market type least connected to what we're modelling."* The daily
capture is healthy — 4 snapshots, 32/32 events, coverage 1.0 — and what it
captures is `ML`, `Spread`, `Totals` on PRESEASON games. Preseason moneylines
carry almost no fantasy signal; starters play a series and the result is noise.

What WOULD carry signal: **player props** (passing yards/TDs, rush attempts,
receptions) which map directly onto our 44 scoring rules, **season win totals**
(the cleanest market read on offensive quality), and **regular-season game
totals** (the scoring environment a player sits in).

AND THE REQUEST HAS NEVER ASKED FOR ANY OF THEM. `market_capture.py:294` builds
the odds URL as `{apiKey, eventId, bookmakers}` — no `markets` parameter — so we
receive the provider's defaults. C's existing guard already refuses to over-read
that: *"NO TD TERMS, BUT THE REQUEST COULD NOT HAVE CARRIED THEM ... A fact about
the query, NOT about the provider."* That guard is why nobody has been misled,
and it is also why the availability question is still open.

⚠ THE FAILURE MODE THIS PROBE IS BUILT AROUND, BECAUSE WE HAVE ALREADY BEEN BITTEN
BY IT. The as-of probe (runs 31458991195 / 31459812251) established that this
class of API ACCEPTS AND SILENTLY IGNORES parameters it does not implement: every
date-bounding candidate was accepted, every one was ignored, and each returned a
perfectly healthy 200. So "we asked for player props and got none back" has TWO
readings — the provider has none, or the provider ignored the word `markets` —
and they argue for opposite decisions. **Every request here is therefore paired
with a NONSENSE CONTROL.** If the control's response is materially identical to
the real one, the parameter is being ignored and every availability reading in
that run is VOID rather than negative.

A NULL IS A RESULT. If props do not exist at a sane credit cost, that is worth
knowing today: A stops planning around the pipe and we stop paying attention to
it. What must not happen is a null that is really a mis-asked question.

⚠ IT DOES NOT TOUCH THE DAILY CAPTURE. `market_capture.py` and its filters are
A's files and its budget is the live pipe's; this reads the same host through A's
`market_request` validator and writes its own artifact. Nothing here can cost the
capture a day.

CI-ONLY for the egress half — the sandbox proxy blocks the host. Everything that
decides anything is pure and tested.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

OUT = HERE / "external_odds_probe.json"

#: THE FAMILIES WE CARE ABOUT, DECLARED — with the reason each one matters, so a
#: later reader can tell an intentional target from an accident of matching.
#: Patterns are deliberately loose: a family that matches nothing is reported as
#: absent, and every key that matches NOTHING is reported verbatim under
#: `unclassified`. A market vocabulary we did not anticipate must show up as
#: unclassified rather than vanish — that is the whole reason this is a probe.
FAMILIES = {
    "player_props": (
        r"player|pass(ing)?|rush(ing)?|recept|receiv|anytime|"
        r"yards|attempts|completions|touchdown|td\b|scorer",
        "maps directly onto our scoring — passing yards/TDs, rush attempts, "
        "receptions are line items in our 44 rules"),
    "season_win_totals": (
        r"win.?total|season.?win|regular.?season.?wins|outright|futures|champion",
        "the cleanest single market read on offensive quality"),
    "game_totals": (
        r"^totals?$|over.?under|game.?total|team.?total",
        "the scoring environment a player sits in"),
    "sides": (
        r"^ml$|money.?line|spread|handicap|puck|run.?line",
        "what we already capture — listed so a run that finds ONLY these is "
        "visibly the status quo rather than a successful probe"),
}


#: Fields whose VALUE is a market's name, whatever level they sit at.
NAMING_FIELDS = ("key", "name", "market", "market_key", "marketname", "type",
                 "bet_type")


#: A node carrying one of these is a SELECTION — a side of a bet — not a market.
#: Shape, not vocabulary: `{"name": "Josh Allen", "point": 245.5}` is the player
#: on one side of a prop, and letting "Josh Allen" into the market list would put
#: every rostered player into the discovery bucket every single run.
PRICE_FIELDS = ("price", "odds", "point", "handicap", "line", "american",
                "decimal", "fractional")


def _walk(payload):
    """-> (named, containers, selections). Three lists; they are not equally trustworthy."""
    named, containers, selections = [], [], []
    seen_n, seen_c, seen_s = set(), set(), set()

    def add(bag, seen, v):
        s = str(v).strip()
        if s and s.lower() not in seen and len(s) <= 80:
            seen.add(s.lower())
            bag.append(s)

    def walk(node, depth=0):
        if depth > 12:
            return
        if isinstance(node, dict):
            # A NODE WITH A PRICE IS A SIDE OF A BET. Decided from the node's own
            # siblings rather than from a list of field names we expect, so a
            # provider that calls the field `american` instead of `price` still
            # has its selections recognised as selections.
            priced = any(str(k).lower() in PRICE_FIELDS for k in node)
            for k, v in node.items():
                if isinstance(v, (dict, list)):
                    add(containers, seen_c, k)
                    walk(v, depth + 1)
                elif str(k).lower() in NAMING_FIELDS:
                    add(selections if priced else named,
                        seen_s if priced else seen_n, v)
        elif isinstance(node, list):
            for v in node:
                walk(v, depth + 1)

    walk(payload)
    return sorted(named), sorted(containers), sorted(selections)


def market_keys(payload) -> list:
    """Every market name the payload mentions, deduped and sorted.

    WALKS THE WHOLE STRUCTURE rather than reading one expected path. The shape of
    this provider's odds response is not something we should assume: the capture
    reads it one way, the probe's job is to find out what is there, and a reader
    that only looks where it expects data reports absence for a payload that moved.

    ⚠ TWO KINDS OF STRING, AND ONLY ONE IS A MARKET NAME. My first version added
    every dict key with a structured value, so `bookmakers`, `markets` and the
    book's own name landed in `unclassified` beside the one real discovery — four
    entries where one was the finding. `unclassified` is the bucket that is
    supposed to hold "a market we did not know to ask for"; filling it with
    scaffolding makes it unreadable, which is the same as dropping it.

    So naming-FIELD values are market names, and CONTAINER keys are included only
    when they look like a market — a provider that keys markets by name
    (`{"markets": {"player_pass_yds": {...}}}`) is still discovered, and the
    scaffolding around it is not.

    ⚠ THE LIMIT, STATED RATHER THAN HIDDEN: an UNPRICED selection is
    indistinguishable from a market name by shape alone. `{"name": "BUF"}` with no
    price beside it reads as a market here. Real payloads price every outcome, and
    the shape rule keys on that — but if the first live run shows unpriced
    selections, `unclassified` will carry team names and this is why. The
    availability verdicts are decided by the FAMILY matches rather than by this
    bucket — and every matched key is printed in the report beside its family, so
    a name that matched a pattern by accident is visible rather than silently
    counted as a market.
    """
    named, containers, _sel = _walk(payload)
    hits = [c for c in containers
            if any(re.search(pat, c, re.I) for pat, _ in FAMILIES.values())]
    return sorted(set(named) | set(hits))


def structure_keys(payload) -> list:
    """The container keys, reported separately so the shape is auditable.

    Not classified and not counted — a human reading a null result should be able
    to see the skeleton the probe walked, in case the markets were somewhere the
    naming fields never described.
    """
    return _walk(payload)[1]


def selection_names(payload) -> list:
    """The sides of the bets — kept out of the market list, kept in the artifact.

    Reported rather than discarded because a props payload's selections ARE the
    player names, and "which players does this market actually price" is the next
    question after "do props exist at all".
    """
    return _walk(payload)[2]


def classify(keys, books=()) -> dict:
    """Group the observed market names into the declared families.

    ⚠ EVERY UNMATCHED KEY IS REPORTED, NOT DROPPED. A family list is a statement
    about what we went looking for; the keys that match nothing are the ones most
    likely to be the thing we did not know to ask for. Dropping them would turn a
    discovery tool into a confirmation tool.
    """
    out = {name: [] for name in FAMILIES}
    unclassified, books_seen = [], []
    # THE BOOKMAKERS WE OURSELVES REQUESTED ARE NOT DISCOVERIES. Filtered using
    # our own query rather than a guessed vocabulary — the same discipline as
    # storing the request beside the answer.
    want = {str(b).strip().lower() for b in (books or ())}
    for k in keys or []:
        if str(k).strip().lower() in want:
            books_seen.append(k)
            continue
        hit = [n for n, (pat, _) in FAMILIES.items() if re.search(pat, k, re.I)]
        if hit:
            for n in hit:
                out[n].append(k)
        else:
            unclassified.append(k)
    return {"families": out, "unclassified": unclassified,
            "books_seen": books_seen,
            "counts": {n: len(v) for n, v in out.items()},
            "unclassified_count": len(unclassified)}


def _fingerprint(payload) -> tuple:
    """What a response IS, for comparison — market names and how many prices.

    Compared on STRUCTURE, not on bytes. Two responses to the same event differ
    in timestamps and price movement between calls, so a byte comparison would
    report "different" for every pair and the ignored-parameter control would
    silently never fire. That is the failure the control exists to catch,
    reproduced inside the control.
    """
    keys = tuple(market_keys(payload))
    n = json.dumps(payload, sort_keys=True).count(":")
    return keys, n


def parameter_was_honoured(real, control) -> dict:
    """Did the provider READ our `markets` parameter, or accept and ignore it?

    THE QUESTION THAT DECIDES WHETHER ANY OTHER ANSWER MEANS ANYTHING. The as-of
    probe established that this class of API accepts unknown parameters, ignores
    them, and returns 200 — so an availability reading taken without this check is
    not a negative result, it is an unmeasured one.

    `control` is the same request with a deliberately nonsense `markets` value. If
    the two responses carry the SAME market names, the parameter changed nothing.
    """
    if real is None or control is None:
        return {"honoured": None,
                "note": "one of the two calls did not return — the parameter "
                        "question is UNANSWERED, which is not the same as the "
                        "parameter being honoured"}
    rk, _ = _fingerprint(real)
    ck, _ = _fingerprint(control)
    if rk == ck:
        return {"honoured": False, "real_keys": len(rk), "control_keys": len(ck),
                "note": "a nonsense `markets` value returned the SAME market names, "
                        "so the parameter is accepted and IGNORED. Every "
                        "availability reading in this run is VOID, not negative — "
                        "the same shape the as-of probe found on date bounding."}
    return {"honoured": True, "real_keys": len(rk), "control_keys": len(ck),
            "note": "the nonsense control returned a different market set, so the "
                    "provider does read the parameter and an absence below is "
                    "about the provider rather than about our query"}


def availability(classified, honoured) -> dict:
    """Per family: available / absent / VOID — never a bare boolean.

    THREE STATES, AND THE THIRD IS THE POINT. "Absent" is a claim about the
    provider and it is only earnable when the parameter was demonstrably read. If
    it was not, the honest answer is that we still do not know, and recording that
    as "absent" would close an open question with an artifact of our own query —
    exactly what `scan_touchdown_markets`' existing `unknown` verdict refuses to
    do, which is why nobody has been misled so far.
    """
    fams = (classified or {}).get("families") or {}
    if honoured.get("honoured") is not True:
        return {n: {"state": "unmeasured", "matched": fams.get(n) or [],
                    "why": honoured.get("note")} for n in FAMILIES}
    out = {}
    for n, (_, why_it_matters) in FAMILIES.items():
        hits = fams.get(n) or []
        out[n] = {"state": "available" if hits else "absent",
                  "matched": hits, "matters": why_it_matters}
    return out


def credit_cost(before, after) -> dict:
    """What the probe SPENT, from the provider's own counters.

    Reported as a delta between two reads of the rate headers rather than as a
    call count of ours: a request that costs two credits and a request that costs
    one are indistinguishable from our side, and the whole decision ("is this
    affordable daily?") turns on the provider's arithmetic, not ours.
    """
    def _n(h, *names):
        for k in (h or {}):
            if str(k).lower().replace("-", "_") in names:
                try:
                    return int(str((h or {})[k]).strip())
                except (TypeError, ValueError):
                    return None
        return None
    rem_b = _n(before, "x_ratelimit_remaining", "x_requests_remaining",
               "ratelimit_remaining")
    rem_a = _n(after, "x_ratelimit_remaining", "x_requests_remaining",
               "ratelimit_remaining")
    if rem_b is None or rem_a is None:
        return {"spent": None, "remaining": rem_a,
                "note": "the provider did not return a remaining-quota header on "
                        "one of the two reads, so cost is UNKNOWN rather than free"}
    return {"spent": rem_b - rem_a, "remaining": rem_a,
            "note": "measured from the provider's own remaining counter, not from "
                    "how many calls we think we made"}


def report(classified, honoured, cost, asked_markets, event_id=None,
           league=None) -> dict:
    """The whole answer in one object, including what was ASKED.

    THE QUERY TRAVELS WITH THE ANSWER. A recorded absence whose request is not
    recorded beside it cannot be re-read later — it is the same defect as an ADP
    price with no format, and it is the reason this probe exists at all: the daily
    capture's `markets` parameter was never in the artifact, so nobody could tell
    that the question had not been asked.
    """
    avail = availability(classified, honoured)
    actionable = [n for n, v in avail.items()
                  if v["state"] == "available" and n != "sides"]
    return {
        "_territory": "TERRITORY: C — written by external_odds_probe.py",
        "asked_markets": list(asked_markets or []),
        "event_id": event_id, "league": league,
        "parameter_honoured": honoured,
        "availability": avail,
        "observed_markets": (classified or {}).get("families"),
        # THE KEYS THAT MATCHED NOTHING, VERBATIM. Most likely to hold the thing
        # we did not know to ask for.
        "unclassified": (classified or {}).get("unclassified"),
        "credit": cost,
        "verdict": ("VOID — the parameter was not read" if honoured.get("honoured") is not True
                    else "ACTIONABLE — %s" % ", ".join(actionable) if actionable
                    else "NULL — the provider serves only what we already capture"),
    }


# ---------------------------------------------------------------------------
# egress — CI only
# ---------------------------------------------------------------------------

#: What to ask for. Sent as one comma-joined `markets` value and also tried
#: singly, because a provider that rejects an unknown member of a list may serve
#: the ones it knows when asked alone.
ASK = ("player_props", "player_pass_yds", "player_rush_yds", "player_receptions",
       "player_anytime_td", "totals", "season_wins", "outrights")

#: The control. Must be syntactically plausible and semantically impossible, so a
#: provider that validates the parameter rejects it and a provider that ignores
#: the parameter returns the default board.
CONTROL = "zzz_not_a_market_qqq"


def probe(api_key, league="usa-nfl", event_id=None, timeout=20):  # pragma: no cover
    """One event, three requests: default, asked, nonsense control."""
    import market_request as R                        # A's validator, imported not edited

    host = "https://api.odds-api.io"
    books = ",".join(R.RECREATIONAL_BOOKS[:2])
    out = {"league": league}

    if not event_id:
        url = R.build(host, "events", {"apiKey": api_key,
                                       "sport": "american-football", "league": league})
        events, headers, _ = R.fetch(url, timeout), None, None
        if isinstance(events, tuple):
            events = events[0]
        ev = list(events or [])
        out["events_listed"] = len(ev)
        event_id = (ev[0] or {}).get("id") if ev else None
        if not event_id:
            return {**out, "verdict": "UNMEASURED — the league listed no events, so "
                                      "no odds request could be made. A fact about "
                                      "the slate, not about the markets."}

    def _get(params, reason=None):
        u = (R.build(host, "odds", params) if not reason
             else R.build(host, "odds", params))
        try:
            r = R.fetch(u, timeout)
            return (r[0] if isinstance(r, tuple) else r), (r[1] if isinstance(r, tuple)
                                                           and len(r) > 1 else {})
        except Exception as e:                        # noqa: BLE001
            print("  odds probe call failed (%s: %s)" % (type(e).__name__, e))
            return None, {}

    base = {"apiKey": api_key, "eventId": event_id, "bookmakers": books}
    default_payload, h0 = _get(dict(base))
    real_payload, _h1 = _get({**base, "markets": ",".join(ASK)})
    control_payload, h2 = _get({**base, "markets": CONTROL})

    honoured = parameter_was_honoured(real_payload, control_payload)
    classified = classify(market_keys(real_payload if real_payload is not None
                                      else default_payload))
    rep = report(classified, honoured, credit_cost(h0, h2), ASK,
                 event_id=event_id, league=league)
    rep["default_markets"] = classify(market_keys(default_payload))["families"]
    rep.update(out)
    return rep


def main(argv=None):  # pragma: no cover
    import argparse
    import os
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--league", default="usa-nfl")
    ap.add_argument("--event-id", default=None)
    a = ap.parse_args(argv)
    key = os.environ.get("ODDS_API_KEY", "").strip()
    if not key:
        print("::error::ODDS_API_KEY not visible to this job — the probe cannot "
              "run. This is a fact about the job, not about the provider.")
        return 1
    rep = probe(key, league=a.league, event_id=a.event_id)
    OUT.write_text(json.dumps(rep, indent=1))
    print(json.dumps({k: v for k, v in rep.items()
                      if k in ("verdict", "parameter_honoured", "credit",
                               "availability", "unclassified")}, indent=1))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
