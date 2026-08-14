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


def has_board(payload) -> bool:
    """Does this payload actually carry an odds board, or only its own labels?

    ⚠ RUN 3'S REFUSAL DID NOT FIRE AND MY OWN READER IS WHY. The check asked
    whether ANY market name was found — and the response's `sport` and `league`
    names (`American Football`, `USA - NFL Preseason`) arrive through the naming
    fields. Two names, zero markets, and a board-less payload read as non-empty.

    A real board always carries PRICED selections. That is the test, and it is the
    same shape rule that separates a market from a player above.
    """
    named, _c, selections = _walk(payload)
    if selections:
        return True
    return any(re.search(pat, k, re.I)
               for k in named for pat, _ in FAMILIES.values())


def all_names(payload) -> list:
    """EVERY name the payload uses — markets, selections and market-ish containers.

    ⚠ RUN 4 IS WHY THIS EXISTS. This provider's market names carry prices as
    siblings — `{"name": "ML", "price": -145}` — so the shape rule that keeps
    "Josh Allen" out of the market list also put `ML`, `Spread`, `Totals` and
    `Team Total Home` there. `market_keys` came back holding nothing but
    `American Football` and `USA - NFL Preseason`, the two strings that are
    identical in every response this provider will ever send, and the control duly
    reported the parameter ignored for a third time on a payload with a full board
    in it.

    THE CONTROL IS A CHANGE DETECTOR, NOT A CLASSIFIER. Whether a string is
    "really" a market is irrelevant to the question it asks — did the response
    change when we asked for something different — so it compares everything.
    `market_keys` stays the curated view for the discovery bucket, where
    precision is what makes it readable.
    """
    named, containers, selections = _walk(payload)
    hits = [c for c in containers
            if any(re.search(pat, c, re.I) for pat, _ in FAMILIES.values())]
    return sorted(set(named) | set(selections) | set(hits))


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
    keys = tuple(all_names(payload))
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
    # ⚠ TWO EMPTY RESPONSES ARE TRIVIALLY IDENTICAL, and run 31772127983 proved
    # it: the probe took `events[0]` of 136 listed for usa-nfl — an arbitrary game
    # months out and unpriced — got a payload with NO markets at all (not even the
    # ML and spread the daily capture pulls every day), and duly reported the
    # parameter as ignored. The control fired on an empty game and would have
    # fired no matter what the parameter did.
    #
    # That is exactly the failure this control exists to prevent, one level up: a
    # conclusion about the provider drawn from a fact about our own request. An
    # unpriced event cannot convict anybody.
    if not rk and not ck:
        return {"honoured": None, "real_keys": 0, "control_keys": 0,
                "note": "neither response carried any markets, so there was "
                        "nothing to compare — two empty payloads are identical "
                        "whatever the parameter does. UNMEASURED: the event was "
                        "probably unpriced, which is a fact about the game we "
                        "picked and not about the provider."}
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


#: Candidate paths for a SECOND question, each with the reason it is plausible.
#: `market_request.build` demands a reason for any unregistered path precisely
#: because "a 404 from an invented path is evidence about the query, not the
#: provider" — this list is short and declared so a null is readable as "these
#: four guesses did not answer" rather than as "the provider serves nothing".
DISCOVERY_PATHS = (
    ("/v3/markets",
     "the conventional sibling of /v3/odds on this API's own /v3 namespace — if a "
     "market catalogue exists anywhere it is the first place to look"),
    ("/v3/odds/markets",
     "the same catalogue nested under the endpoint it describes, which is the "
     "other common shape"),
    ("/v3/props",
     "named directly for the thing Cory asked about, in case props are a separate "
     "product rather than a market family"),
    ("/v3/outrights",
     "season win totals are futures, not game markets, so they may not live under "
     "an event-scoped endpoint at all"),
)


def events_census(events, now=None, horizons=(7, 14)) -> dict:
    """WHAT IS IN THE EVENTS WE NEVER ASK ABOUT — A's first-priority question.

    `events_before_horizon: 48 -> 32` out of a 134-event catalogue says sixteen
    went and nothing about WHAT they were. A cut slate and a small slate look
    identical in a difference, which is the complaint `horizon_report` was written
    to fix one layer down — and it still cannot say whether the dropped games are
    the ones that matter. Regular-season weeks are unrecoverable once they pass,
    so "102 dropped" needs a date range attached to be actionable.

    IT ALSO PRICES THE 7-vs-14 CHOICE IN GAMES rather than in preference:
    `marginal["7->14"]` is exactly how many extra events the wider window buys.

    UNDATED IS ITS OWN BUCKET, never "beyond". `KEEP_UNDATED` exists one file over
    for this reason — absent is not far away — and filing undated events under
    dropped would make the horizon look more expensive than it is while hiding the
    one game we genuinely cannot place.
    """
    rows = list(events or [])
    if not rows:
        return {"status": "unmeasured", "total": 0,
                "note": "the listing returned no events, so there is nothing to "
                        "measure. A fact about the call, not a league with no "
                        "games."}
    nowk = str(now or "")[:19]
    dated, undated, past = [], 0, 0
    for e in rows:
        t = str((e or {}).get("date") or "")[:19]
        if not t:
            undated += 1
        elif nowk and t < nowk:
            past += 1
        else:
            dated.append((t, (e or {}).get("id")))
    dated.sort()

    import datetime as _dt

    def _cut(days):
        if not nowk:
            return None
        base = _dt.datetime.strptime(nowk, "%Y-%m-%dT%H:%M:%S")
        return (base + _dt.timedelta(days=int(days))).strftime("%Y-%m-%dT%H:%M:%S")

    within, beyond = {}, {}
    for h in horizons:
        c = _cut(h)
        inside = [d for d in dated if c is None or d[0] <= c]
        out = [d for d in dated if c is not None and d[0] > c]
        within[str(h)] = len(inside)
        beyond[str(h)] = {
            "n": len(out),
            "first": out[0][0] if out else None,
            "last": out[-1][0] if out else None,
            # THE IDS, CAPPED AND SAID SO — enough to spot-check what got dropped
            # without pasting a whole season into an artifact.
            "ids": [d[1] for d in out[:20]],
            "ids_truncated": len(out) > 20,
        }
    hs = sorted(int(h) for h in horizons)
    marginal = {"%d->%d" % (a, b): within[str(b)] - within[str(a)]
                for a, b in zip(hs, hs[1:])}
    return {"status": "measured", "total": len(rows), "undated": undated,
            "already_started": past, "upcoming": len(dated),
            "now": nowk or None, "within": within, "beyond": beyond,
            "marginal": marginal,
            "span": {"first": dated[0][0] if dated else None,
                     "last": dated[-1][0] if dated else None},
            "note": "`within[h]` counts UPCOMING events inside h days. Undated "
                    "events are their own bucket and are never counted as beyond "
                    "the horizon; events already started are excluded from both."}


def discovery_report(results) -> dict:
    """What the candidate paths said — and what that does NOT prove.

    THE REFUSAL THAT MATTERS: a 404 from a path WE INVENTED is evidence about our
    spelling, not about the provider. `market_request.build` already states this,
    which is why it demands a reason for every discovery request; recording those
    404s as "props do not exist" would close Cory's question with our own guesses.

    Three verdicts, and the third exists because a step that never ran looks
    exactly like a step that found nothing (rule 13f).
    """
    rows = list(results or [])
    if not rows:
        return {"verdict": "not attempted", "proves_absence": False, "tried": [],
                "answered": [], "exists_but_forbidden": [],
                "note": "the discovery step did not run. Nothing was asked, so "
                        "nothing was learned — this is not a null result."}
    answered = [r for r in rows if int(r.get("status") or 0) == 200 and r.get("names")]
    return {
        "verdict": "answered" if answered else "no candidate path answered",
        # NEVER TRUE. Absence of a market can only be established on a path the
        # provider acknowledges, and every path here is one we made up.
        "proves_absence": False,
        # THE ERROR TEXT TRAVELS. A 404 says the path does not exist; a 403 says
        # IT DOES AND WE CANNOT READ IT ON THIS TIER — opposite conclusions, and
        # the second is a pricing decision rather than a dead end. The first
        # discovery run reported `status: 0` for all four candidates and the
        # artifact could not tell them apart.
        "tried": [{"path": r.get("path"), "status": r.get("status"),
                   "error": r.get("error")} for r in rows],
        # NAMED SEPARATELY, because it is the one outcome that changes what
        # anybody would do next.
        "exists_but_forbidden": [r.get("path") for r in rows
                                 if "403" in str(r.get("error") or "")
                                 or int(r.get("status") or 0) in (401, 403)],
        "answered": [{"path": r.get("path"), "names": list(r.get("names") or [])[:40]}
                     for r in answered],
        "note": ("one or more candidate paths returned a market list — see "
                 "`answered`. This is a lead, not a capture."
                 if answered else
                 "none of the candidate paths answered. That is a fact about our "
                 "guesses, not about the provider: every path here was invented "
                 "by us, and a 404 on an invented path proves only that we spelled "
                 "it wrong. The question stays OPEN."),
    }


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


def nearest_first(events, now=None) -> list:
    """Events sorted by kickoff, soonest first; undated LAST rather than dropped.

    THE FIX FOR RUN 31772127983. It took `events[0]` of 136 listed for usa-nfl and
    got a payload carrying no markets at all — not even the ML and spread the
    daily capture pulls every day — because an arbitrary game from a whole-season
    list is very likely months out and unpriced. Every verdict drawn from that run
    was about the game we happened to pick.

    Soonest-first is not a preference, it is the same market-structure fact
    `market_filters` registers its horizon on: lines are posted and actively
    traded through the week before kickoff, so the nearest game is the one most
    likely to carry a board at all.

    UNDATED SORTS LAST, NOT OUT. An event we cannot date is not "far away" — the
    same rule `KEEP_UNDATED` states one file over — so it stays available as a
    fallback rather than being silently discarded.

    ⚠ AND "NEAREST" MEANS NEAREST UPCOMING. Run 3 sorted ascending with no sense
    of now and duly picked 2026-08-13T23:00Z off a 48-event preseason list — a
    game that had already kicked off. A finished game has no live board, so the
    verdict that followed was about a played fixture rather than about the
    provider. Future ascending first, then undated, then the past most-recent
    first: a game that started an hour ago may still carry a board, one from last
    month will not.

    `now` is passed in rather than read from the clock, so the ordering stays
    testable — the same rule the archive logic follows one module over.
    """
    now = str(now or "")[:19]

    def key(e):
        t = str((e or {}).get("date") or "")[:19]
        if not t:
            return (1, "", "")                  # undated: not "far away", not a corpse
        if not now or t >= now:
            return (0, t, "")                   # upcoming, soonest first
        # PAST: most recent first, so a game that just kicked off beats last month
        return (2, "", _invert(t))
    return sorted(list(events or []), key=key)


def _invert(t: str) -> str:
    """Descending sort inside an ascending key, without a reverse pass."""
    return "".join(chr(0x7E - (ord(c) - 0x20) % 0x5F) for c in t)


def probe(api_key, league="usa-nfl", event_id=None, timeout=20):  # pragma: no cover
    """One event, three requests: default, asked, nonsense control."""
    import market_request as R                        # A's validator, imported not edited

    host = "https://api.odds-api.io"
    books = ",".join(R.RECREATIONAL_BOOKS[:2])
    out = {"league": league}

    import datetime as _dt
    if not event_id:
        url = R.build(host, "events", {"apiKey": api_key,
                                       "sport": "american-football", "league": league})
        events, headers, _ = R.fetch(url, timeout), None, None
        if isinstance(events, tuple):
            events = events[0]
        ev = nearest_first(
            events, now=_dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
        out["events_listed"] = len(ev)
        # ── A's FIRST-PRIORITY QUESTION, ANSWERED ON THE CALL WE ALREADY MAKE ──
        # "48 -> 32 of a 134-event catalogue: what is in the 102 we drop, and is
        # any of it regular season?" The listing is fetched anyway, so the census
        # costs nothing extra and prices the 7-vs-14 horizon choice in GAMES.
        out["census"] = events_census(
            events, now=_dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            horizons=(7, 14))
        # NEAREST KICKOFF, because the game most likely to carry a board is the
        # one closest to being played. Run 31772127983 took `events[0]` of 136 and
        # asked about an unpriced game.
        event_id = (ev[0] or {}).get("id") if ev else None
        out["event_date"] = (ev[0] or {}).get("date") if ev else None
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

    # ⚠ IF THE DEFAULT CALL CARRIED NO BOARD, THE RUN ANSWERS NOTHING. The daily
    # capture pulls ML, spread and totals from this same endpoint every day, so a
    # default response with no markets means the EVENT is unpriced — and three
    # empty payloads compared against each other convict whatever we point them
    # at. Reported as UNMEASURED with the next events named, rather than as a
    # finding about the provider.
    if not has_board(default_payload):
        nxt = [e.get("id") for e in ev[1:6]] if not event_id else []
        return {**out, "event_id": event_id,
                "asked_markets": list(ASK),
                "credit": credit_cost(h0, h2),
                "raw_shape": structure_keys(default_payload),
                "verdict": "UNMEASURED — the event carried no markets at all, not "
                           "even the sides the daily capture pulls from this same "
                           "endpoint. That is a fact about the game we picked, not "
                           "about the provider. Retry with --event-id from: %s"
                           % (nxt or "the next nearest events")}

    honoured = parameter_was_honoured(real_payload, control_payload)
    classified = classify(all_names(real_payload if real_payload is not None
                                    else default_payload),
                          books=R.RECREATIONAL_BOOKS)
    rep = report(classified, honoured, credit_cost(h0, h2), ASK,
                 event_id=event_id, league=league)
    rep["default_markets"] = classify(all_names(default_payload),
                                      books=R.RECREATIONAL_BOOKS)["families"]
    # THE SKELETON OF WHAT CAME BACK, ALWAYS — not only on the refusal path. Two
    # runs reported "no markets" and neither recorded what the payload actually
    # looked like, so each retry started blind. A probe that does not describe the
    # shape it walked cannot be corrected from its own artifact.
    rep["raw_shape"] = structure_keys(default_payload)
    rep["raw_names"] = all_names(default_payload)[:40]
    rep["selection_sample"] = selection_names(default_payload)[:10]
    # THE PROVIDER'S OWN `urls` NODE, VERBATIM. It showed up in run 4's raw_shape
    # and it is the one lead in this payload that is not a guess of ours — if the
    # API advertises its own endpoints anywhere, that is where.
    rep["provider_urls"] = (default_payload or {}).get("urls") \
        if isinstance(default_payload, dict) else None

    # ── THE SECOND QUESTION, ASKED ONLY ONCE THE FIRST IS SETTLED ────────────
    # Runs 2-5 established that `markets` is accepted and IGNORED, so props are
    # not reachable by parameter on this endpoint. Whether they live elsewhere is
    # a different question, and it is asked with declared reasons and a refusal to
    # read our own 404s as the provider's answer.
    disc = []
    if honoured.get("honoured") is not True:
        for path, reason in DISCOVERY_PATHS:
            try:
                u = R.build(host, path, {"apiKey": api_key}, discovery=True,
                            reason=reason)
                r = R.fetch(u, timeout)
                pay = r[0] if isinstance(r, tuple) else r
                disc.append({"path": path, "status": 200,
                             "names": all_names(pay)[:40]})
            except Exception as e:                    # noqa: BLE001
                disc.append({"path": path, "status": 0,
                             "error": "%s: %s" % (type(e).__name__, e)})
    rep["discovery"] = discovery_report(disc)
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
