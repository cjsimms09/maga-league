#!/usr/bin/env python3
"""VALIDATED REQUESTS — rule 13, made operational instead of remembered.

Rule 13 fired THREE TIMES inside the file that defines it: an invented `/sports`
path, sharp bookmakers picked alphabetically, and a lowercase `draftkings`. The
rule was written, known, and still not applied under momentum. A habit you have to
recall while moving fast is not a control.

So the control moves into the call itself. A request is either:

  * against a REGISTERED endpoint, whose required parameters are declared and
    checked BEFORE the call is sent — a missing parameter raises locally instead
    of spending budget to be told; or
  * explicitly marked `discovery=True` WITH A REASON, which is allowed, recorded,
    and makes the guess visible as a guess.

The point is not to forbid guessing. It is to make a guess impossible to mistake
for knowledge afterwards, and to stop the cheap errors — wrong parameter, wrong
casing, missing required field — from ever reaching the wire.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request


class UnvalidatedRequest(RuntimeError):
    """Refused before sending. The failure names what was missing."""


# Everything discovery established, with its REQUIRED parameters declared. A call
# to one of these is checked against this table first.
ENDPOINTS = {
    "events": {
        "path": "/v3/events",
        "required": ("apiKey", "sport"),
        "note": "returns the whole slate in ONE request (134 for usa-nfl)",
    },
    "odds": {
        "path": "/v3/odds",
        "required": ("apiKey", "eventId", "bookmakers"),
        "note": "PER EVENT — eventId is required, so a slate costs 1 + N",
    },
    "leagues": {"path": "/v3/leagues", "required": ("apiKey", "sport")},
    "bookmakers": {"path": "/v3/bookmakers", "required": ()},
    "sports": {"path": "/v3/sports", "required": ()},
}

# Verified to exist by name in /v3/bookmakers. "draftkings" was REJECTED — the API
# wants the exact string it returns, casing and all — so these are the returned
# strings, not our idea of them.
RECREATIONAL_BOOKS = ("DraftKings", "FanDuel", "BetMGM", "Caesars", "Bet365")


def build(host: str, endpoint: str, params: dict, *, discovery: bool = False,
          reason: str = "") -> str:
    """Validate, then build the URL. Raises rather than sending a bad request."""
    if discovery:
        if not reason:
            raise UnvalidatedRequest(
                "a discovery request must state a REASON — an unexplained guess is "
                "indistinguishable from knowledge once it is in the log")
        path = endpoint
    else:
        spec = ENDPOINTS.get(endpoint)
        if spec is None:
            raise UnvalidatedRequest(
                f"unknown endpoint {endpoint!r}. Registered: {sorted(ENDPOINTS)}. "
                "Pass discovery=True with a reason to probe an unregistered path — "
                "a 404 from an invented path is evidence about the query, not the provider")
        missing = [p for p in spec["required"] if not params.get(p)]
        if missing:
            raise UnvalidatedRequest(
                f"{endpoint} requires {list(spec['required'])}; missing {missing}. "
                "Refused locally rather than spending budget to be told")
        path = spec["path"]
    # Encode every value. A bookmaker name with a space produced an unencodable
    # URL whose exception then leaked the API key into a committed artifact.
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None},
                               quote_via=urllib.parse.quote)
    return f"{host}{path}?{q}"


def check_books(names) -> list:
    """Reject book names that are not the exact strings the API returns.

    Two consecutive failures came from this: sharp books chosen alphabetically
    (403, paid tier) and a lowercase name (400, invalid bookmaker). Both were
    facts about my input.
    """
    ok, bad = [], []
    for n in names or []:
        (ok if n in RECREATIONAL_BOOKS else bad).append(n)
    if bad:
        raise UnvalidatedRequest(
            f"not verified recreational book names: {bad}. Known-good: "
            f"{list(RECREATIONAL_BOOKS)} (exact strings from /v3/bookmakers)")
    return ok


# EVERY PART OF THE REQUEST I CHOSE, NAMED IN ONE PLACE so a failure is
# attributable to it. C's sharper form of the old rule 13 (now clause 11e): it is
# not only the PATH you invented — the error handling, the headers and the timeout
# are yours too, and each one manufactures a PROVIDER-SHAPED NULL that looks
# exactly like a finding.
#
#   USER_AGENT — invented. Providers 403 unknown agents as policy, so a 403 here
#     may be a fact about this string and nothing about the account or the tier.
#   TIMEOUT — chosen. A slow-but-working endpoint becomes a transport error, which
#     `should_retry(None)` calls "may be transient" — wording that reads as the
#     provider's fault for a limit I set.
CHOSEN_REQUEST_INPUTS = {
    "user_agent": "mfga-market-capture",
    "timeout_seconds": 30,
}


def fetch(url: str, timeout: int = None):
    """The only place a request is actually sent. Returns (payload, headers).

    Raises with the chosen inputs ATTACHED, so a caller recording a failure records
    what it might be a failure OF rather than a bare provider verdict.
    """
    if timeout is None:
        timeout = CHOSEN_REQUEST_INPUTS["timeout_seconds"]
    req = urllib.request.Request(
        url, headers={"user-agent": CHOSEN_REQUEST_INPUTS["user_agent"]})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8")), dict(r.headers)
    except Exception as e:                                       # noqa: BLE001
        # Not swallowed and not re-shaped — annotated. The exception still
        # propagates with its code, so retry logic is unchanged.
        setattr(e, "chosen_inputs", dict(CHOSEN_REQUEST_INPUTS))
        code = getattr(e, "code", None)
        if code == 403:
            setattr(e, "attributable_to",
                    "a 403 may be the invented user-agent, not the account tier")
        elif code is None:
            setattr(e, "attributable_to",
                    f"no HTTP status: this may be MY {timeout}s timeout, not the provider")
        raise
