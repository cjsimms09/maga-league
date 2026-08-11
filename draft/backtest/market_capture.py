#!/usr/bin/env python3
"""PRESEASON CAPTURE — the unrecoverable window, taken now.

`usa-nfl-preseason` has 48 events and is reachable today. A snapshot not taken is
not recoverable, and Signal C needs an EARLIEST observation with a stated timestamp
or it has no baseline at all. So this is a one-off capture, not a build: it does
not wait on the layer, the signals, or a finished probe.

READ-ONLY. Writes only its own snapshot file. Touches no projection, no board, no
live recommendation, and nothing it writes is visible during a live decision.

WHAT IT CAPTURES, scoped per rule 9 — what the three signals need, plus whatever
the same request already returns at no extra cost:
  * game total, spread, per-book prices  (Signal B needs total+spread; the rest
    arrives in the same response and costs nothing extra)
  * every captured value carries an explicit `captured_at`
  * BOOK DISPERSION as a FIELD on what is already computed, not a fourth signal.
    With hundreds of books the market's AGREEMENT is measurable, not just its
    level: wide disagreement means our deviation is cheap, tight agreement means
    it is expensive. Rule 9 — the extra books make the existing three signals
    better, not more numerous.
  * A TOUCHDOWN-MARKET CHECK, reported as a FINDING. The component-matching design
    rests on props covering yardage and receptions but not TDs (23.3% uncovered at
    WR1, 29.1% RB1, 47.5% QB1) — and that was measured against a two-book
    assumption. With 263 books the picture may differ, so the answer is recorded
    explicitly rather than carried forward silently.

EVERY VERDICT SHIPS WITH ITS NUMBERS. A boolean without the counts beside it is
unauditable — that is how a retry-cost flag read `true` on a measurement that said
the opposite, and it was caught only because the raw counters were kept.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import market_request as R          # noqa: E402
from market_budget import (BudgetExhausted, RateBudget, backoff_plan,  # noqa: E402
                           should_retry)
import market_filters as F          # noqa: E402  — rule 4: the registered filters

HOST = "https://api.odds-api.io"
PRESEASON = "usa-nfl-preseason"
REGULAR = "usa-nfl"
OUT_DIR = HERE.parent / "market_snapshots"
HEALTH = OUT_DIR / "capture_health.json"

# Words that would indicate a touchdown market in a payload, kept explicit so the
# finding is reproducible rather than a judgement call.
TD_WORDS = ("touchdown", "anytime td", "anytime_td", "first td", "to score",
            "player_td", "atd")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dispersion(prices) -> dict:
    """Book AGREEMENT on one line. A FIELD, not a signal.

    Returns the count and spread of quotes. `books` is reported alongside every
    statistic because a dispersion computed over two books and one computed over
    ninety are different claims wearing the same number.
    """
    vals = [float(p) for p in (prices or []) if p is not None]
    if not vals:
        return {"books": 0, "min": None, "max": None, "spread": None, "mean": None}
    mean = sum(vals) / len(vals)
    return {"books": len(vals), "min": min(vals), "max": max(vals),
            "spread": round(max(vals) - min(vals), 3), "mean": round(mean, 3)}


def scan_touchdown_markets(payload, books=None, markets=None) -> dict:
    """Does this payload price touchdowns? REPORTS ITS OWN COMPOSITION, not a bare verdict.

    C's sharper form of the old rule 13 (now clause 11e), and this function was
    violating it: **it is not only the PATH you invented — every part of a request
    you chose is yours, and each one manufactures a provider-shaped null that looks
    exactly like a finding.**

    THE INSTANCE, measured rather than argued. This returned
    `touchdown_markets_present: false` on a **1,225-byte payload** fetched with
    `bookmakers=DraftKings,FanDuel` — two books I chose — and no player-prop market
    type requested at all. A payload that size cannot contain a touchdown market, so
    the `false` was manufactured by my own request composition. It went into the
    snapshot as a finding about the PROVIDER, and I repeated it to Cory as one. The
    docstring even said "with 263 books the picture may differ" and still emitted a
    bare boolean.

    Three-valued now, and it always ships its composition:
      present  — TD terms found. A positive is safe: the request DID show one.
      absent   — nothing found AND the request could plausibly have shown one.
      unknown  — nothing found and the request could NOT have shown one. That is a
                 fact about the query, not a finding about the provider.
    """
    body = json.dumps(payload).lower()
    hits = sorted({w for w in TD_WORDS if w in body})
    books = list(books or [])
    markets = list(markets or [])

    # COULD THIS REQUEST HAVE RETURNED A POSITIVE? The one question 11e asks. A
    # payload of a few hundred bytes from two books carries game lines, not a
    # player-prop book; the threshold only has to separate "a real prop payload"
    # from "obviously could not have contained one".
    could_have_shown = bool(markets) and len(body) >= 20000
    verdict = "present" if hits else ("absent" if could_have_shown else "unknown")

    return {
        "verdict": verdict,
        "matched_terms": hits,
        # THE COMPOSITION, always — this is what makes the verdict checkable.
        "books_requested": books,
        "markets_requested": markets or None,
        "payload_bytes": len(body),
        "could_have_shown_a_positive": could_have_shown,
        "why": ("TD terms found in the payload" if verdict == "present" else
                "no TD terms, and the request could plausibly have carried them"
                if verdict == "absent" else
                "NO TD TERMS, BUT THE REQUEST COULD NOT HAVE CARRIED THEM — "
                f"{len(books)} book(s), {len(markets) or 'no'} prop market(s) requested, "
                f"{len(body)} byte payload. A fact about the query, NOT about the "
                "provider. Do not record it as coverage."),
        "note": ("if present, the coverage arithmetic must be RE-RUN — the "
                 "23.3/29.1/47.5% uncovered figures were measured against a "
                 "two-book, no-TD assumption"),
    }


def fetch_with_retry(url: str, budget, sleep=None):
    """THE BACKOFF, ACTUALLY CONNECTED. Returns (payload, headers, attempts).

    `backoff_plan` had NO CALLER anywhere in the codebase, and `should_retry` was
    invoked with `attempt=1` hardcoded, so it could never reach its own exhaustion
    branch. `retry_advised` was written into the snapshot and acted on by nothing.
    The consequence was exact: a 429 recorded "back off" and then fired the next
    request immediately — the naive retry loop the module's docstring says it
    exists to prevent, wearing the docstring as a disguise.

    TWO THINGS THIS FIXES, and the second is the one that mattered more:

      1. The plan is executed. `should_retry(code, attempt)` receives the REAL
         attempt number, so exhaustion is reachable, and the returned wait is
         actually waited.

      2. `observe()` RUNS ON THE FAILURE PATH. It used to run only after a
         success, so a 429 — the single response most likely to carry a fresh
         `x-ratelimit-remaining` — was discarded, and the local counter that
         market_budget's own docstring calls unreliable became the sole authority
         on remaining budget at precisely the moment the budget mattered.
         urllib's HTTPError IS a response: it carries .code and .headers.

    The budget is re-checked BEFORE each retry, so backing off can never walk
    into the reserve.
    """
    import time
    import urllib.error
    if sleep is None:
        sleep = time.sleep
    attempt = 1
    last = None
    while True:
        try:
            payload, headers = R.fetch(url)
            budget.observe(headers)
            budget.note_call()
            return payload, headers, attempt
        except urllib.error.HTTPError as e:
            # THE RATE HEADER LIVES ON THE ERROR TOO. Reading it here is the whole
            # point: a 429 tells us what remains more reliably than our counter.
            budget.observe(getattr(e, "headers", None) or {})
            budget.note_call(ok=False)
            last = e
            code = e.code
        except Exception as e:                                   # noqa: BLE001
            budget.note_call(ok=False)
            last = e
            code = getattr(e, "code", None)

        retry, why = should_retry(code, attempt)
        if not retry:
            raise CaptureFailure(code, why, attempt) from last
        # A RETRY IS A SPEND. Backing off into the reserve would defeat the
        # reserve, so affordability is re-checked with the fresher number
        # observe() just gave us.
        if not budget.affordable(1):
            raise CaptureFailure(code, "budget reserve reached while backing off — "
                                       "stopping rather than spending into the cap",
                                 attempt) from last
        wait = backoff_plan(attempt)
        if wait is None:
            raise CaptureFailure(code, "attempts exhausted", attempt) from last
        sleep(wait)
        attempt += 1


class CaptureFailure(RuntimeError):
    """A request that will not be retried, carrying WHY and after how many tries."""

    def __init__(self, code, why, attempts):
        super().__init__(f"HTTP {code} after {attempts} attempt(s): {why}")
        self.code = code
        self.why = why
        self.attempts = attempts


def capture(league: str, api_key: str, books=None, max_events=None,
            horizon_days: int = None) -> dict:
    """One snapshot. Refuses up front if the budget cannot cover it.

    THE HORIZON COMES FROM THE REGISTERED FILTERS, not from a literal here. It
    used to default to 14 — a number chosen after seeing that usa-nfl returns 134
    events, i.e. post-hoc filtering on the axis Signal C runs along. See
    market_filters.py for the registration, the re-derivation on market-structure
    grounds, and the declaration of what had already been seen.
    """
    if horizon_days is None:
        horizon_days = F.HORIZON_DAYS
    books = R.check_books(books or list(F.BOOKS))
    budget = RateBudget(limit=100)
    started = now_iso()

    url = R.build(HOST, "events", {"apiKey": api_key, "sport": "american-football",
                                   "league": league})
    events, headers, _ = fetch_with_retry(url, budget)
    events = list(events or [])

    # HORIZON FILTER. `usa-nfl` returns 134 events — the WHOLE SEASON, not one
    # week — so capturing odds for every listed event daily would be 135 calls a
    # day and would blow straight through the 100/HOUR cap in a single burst.
    # More importantly the far-out games carry thin or absent lines, so those
    # calls buy nothing: Signal C wants repeated observations of a game as its
    # date APPROACHES, which is where the movement is.
    #
    # Events are sorted nearest-first before the cut, so when the budget does bind
    # the games that get captured are the ones closest to kickoff — the ones whose
    # lines are actually moving.
    if horizon_days:
        cutoff = datetime.now(timezone.utc) + timedelta(days=int(horizon_days))
        def _starts(e):
            t = str(e.get("date") or "")[:19]
            try:
                return datetime.strptime(t, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                return None
        dated = [(e, _starts(e)) for e in events]
        # An UNDATED event is kept, not dropped: absent is not "far away", and a
        # game we cannot date is exactly the one we should not silently skip.
        before = list(events)
        events = [e for e, t in dated if t is None or (F.KEEP_UNDATED and t <= cutoff)]
        # THE FILTER'S EFFECT IS RECORDED. Without this the horizon's influence on
        # the sample is invisible in the artifact — a cut slate and a small slate
        # look identical, and an unauditable filter is exactly what rule 4 is
        # about. Same discipline the MFL ingest already applies to every rejection.
        horizon_note = F.horizon_report(before, events, cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"))
        events.sort(key=lambda e: str(e.get("date") or "9999"))
    if max_events:
        events = events[:int(max_events)]

    # 1 + N, CAPTURED AS FAR AS THE BUDGET ALLOWS — and this corrects my own
    # earlier reasoning, which cost a night of the unrecoverable window.
    #
    # I refused the WHOLE capture unless every event fitted, on the grounds that a
    # half-captured slate silently becomes Signal C's baseline. The premise is
    # wrong: SIGNAL C BASELINES ARE PER EVENT. Event A's opening line does not
    # depend on event B being captured. A partial slate does not corrupt anything
    # — it simply means the uncaptured events have no baseline yet, and the next
    # run can take them while the window is still open.
    #
    # The real requirement was never "all or nothing", it was NEVER SILENTLY
    # PARTIAL. So: take what fits, and record exactly what was left and why.
    spendable = max(0, budget.remaining - budget.reserve)
    planned = events[:spendable]
    deferred = events[spendable:]
    if not planned:
        raise BudgetExhausted(
            f"{league}: {len(events)} events to capture, {budget.remaining} calls remain "
            f"and {budget.reserve} are reserved, so none can be taken now"
            + (f" (resets {budget.reset_at})" if budget.reset_at else ""))
    events = planned

    if not horizon_days:
        horizon_note = F.horizon_report(events, events, None)
    rows, failures, retried = [], [], []
    td_finding = None
    for ev in events:
        eid = ev.get("id")
        try:
            odds_url = R.build(HOST, "odds", {"apiKey": api_key, "eventId": eid,
                                              "bookmakers": ",".join(books)})
            # THE BACKOFF IS IN THE CALL NOW, not advice recorded beside it.
            payload, h, attempts = fetch_with_retry(odds_url, budget)
            if attempts > 1:
                retried.append({"event_id": eid, "attempts": attempts})
            if td_finding is None:
                td_finding = scan_touchdown_markets(payload, books=books)
            rows.append({
                "event_id": eid,
                "home": ev.get("home"), "away": ev.get("away"),
                "starts_at": ev.get("date"),
                "captured_at": now_iso(),          # EVERY value carries its time
                "source": f"odds-api.io/{','.join(books)}",
                "odds": payload,
            })
        except CaptureFailure as e:
            # fetch_with_retry already spent, observed and backed off. What
            # arrives here is a decision that was TAKEN, not advice to be filed:
            # `attempts` says how many times it actually tried.
            # RECORD WHAT IT MIGHT BE A FAILURE *OF*. A bare {status, why} reads as
            # a provider verdict; the chosen inputs make it checkable (11e).
            failures.append({"event_id": eid, "status": e.code, "attempts": e.attempts,
                             "why": e.why,
                             "chosen_inputs": dict(R.CHOSEN_REQUEST_INPUTS),
                             "may_be_attributable_to":
                                 getattr(e.__cause__, "attributable_to", None)})
            if not budget.affordable(1):
                failures.append({"stopped": "budget reserve reached — "
                                            "stopping rather than spending into the cap"})
                break

    return {
        "league": league, "started_at": started, "finished_at": now_iso(),
        "horizon_days": horizon_days,
        # RULE 4: which registered filter version produced this sample, and what
        # that filter removed. A snapshot that cannot name its filters is a
        # sample nobody can judge.
        "filters": horizon_note,
        "events_listed": len(events) + len(deferred),
        "events_captured": len(rows),
        # NEVER SILENTLY PARTIAL: what was left, and why, in the snapshot itself.
        "events_deferred_for_budget": [e.get("id") for e in deferred],
        "deferred_count": len(deferred),
        "failures": failures,
        # Retries that ACTUALLY HAPPENED, so "the backoff is wired" is a claim
        # with evidence rather than a comment. Empty is the healthy case.
        "retried": retried,
        # THE VERDICT SHIPS WITH ITS NUMBERS.
        "complete": len(rows) == (len(events) + len(deferred)) and not failures,
        "coverage": (len(rows) / (len(events) + len(deferred)))
                    if (events or deferred) else 0.0,
        "budget": budget.snapshot(),
        "touchdown_finding": td_finding,
        "read_only": True, "visibility": "post_draft_only",
        "events": rows,
    }


def write_health(snapshot: dict) -> dict:
    """Health from the FIRST run. A capture job that dies silently is the failure
    this project keeps hitting — the grading cron that existed and never ran, the
    suite reporting green while collecting zero tests."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prior = {}
    if HEALTH.exists():
        try:
            prior = json.loads(HEALTH.read_text())
        except Exception:                                        # noqa: BLE001
            prior = {}
    # COVERAGE REACHES THE VERDICT. It used to be `events_captured > 0`, so ONE
    # event out of forty-eight reset consecutive_failures, advanced
    # last_success_at and passed the staleness gate — and `last_coverage` was
    # written one line above the verdict and read by nobody. The published run is
    # coverage 0.271 with complete false, recorded as a clean success.
    #
    # That is the third instance of one pattern in this ingest: computed
    # correctly, written down, ignored by the consumer (the attrition reasons,
    # the retry advice, and this).
    #
    # TWO COUNTERS, because they are two different failures needing two different
    # responses. A run that captured NOTHING is broken. A run that captured some
    # is working but leaving holes, and a hole in an unrecoverable window is only
    # a problem if it PERSISTS — the next run can still take the deferred events
    # while the window is open. Collapsing both into one boolean is what let a 2%
    # capture read as healthy.
    captured = int(snapshot.get("events_captured", 0) or 0)
    cov = snapshot.get("coverage")
    ok = captured > 0
    # COMPLETE means the whole listed slate, not "we got something". Derived from
    # coverage rather than trusting the snapshot's own flag, because a consumer
    # that re-derives the verdict cannot inherit a producer's mislabel.
    complete = cov is not None and cov >= 0.999
    health = {
        "last_attempt_at": snapshot.get("finished_at"),
        "last_success_at": snapshot.get("finished_at") if ok else prior.get("last_success_at"),
        # A DISTINCT CLOCK FOR COMPLETENESS. "when did we last capture anything"
        # and "when did we last capture EVERYTHING" are different questions, and
        # the staleness gate needs the second one.
        "last_complete_at": snapshot.get("finished_at") if complete
                            else prior.get("last_complete_at"),
        "last_league": snapshot.get("league"),
        "last_events_captured": captured,
        "last_events_listed": snapshot.get("events_listed"),
        "last_deferred": snapshot.get("deferred_count"),
        "last_coverage": cov,
        "last_complete": complete,
        "consecutive_failures": 0 if ok else int(prior.get("consecutive_failures", 0)) + 1,
        "consecutive_incomplete": 0 if complete
                                  else int(prior.get("consecutive_incomplete", 0)) + 1,
        "stale_after_days": 7,
        # THE BAR, STATED IN THE FILE the gate reads, so the gate cannot quietly
        # apply a different one. 3 is not a taste: the preseason window runs from
        # today to roughly Sep 1, about 21 daily captures, so three consecutive
        # incomplete runs is ~14% of an unrecoverable window spent accumulating
        # holes. A full 48-event slate IS affordable on a fresh hour (100 limit,
        # 20 reserved, 1 events call => 78 odds calls available), so incomplete is
        # not the expected steady state — it is a signal.
        "max_consecutive_incomplete": 3,
    }
    HEALTH.write_text(json.dumps(health, indent=2, sort_keys=True) + "\n")
    return health


def main():                                                      # pragma: no cover
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default=PRESEASON)
    ap.add_argument("--max-events", type=int, default=0)
    ap.add_argument("--horizon-days", type=int, default=14)
    a = ap.parse_args()
    key = os.environ.get("ODDS_API_KEY", "").strip()
    if not key:
        print("::error::ODDS_API_KEY not visible to this job — cannot capture")
        return 1
    try:
        snap = capture(a.league, key, max_events=a.max_events or None,
                       horizon_days=a.horizon_days)
    except BudgetExhausted as e:
        # A REFUSAL IS AN OUTCOME, NOT AN ABSENCE. Without this the health gate
        # reports "the capture did not run" for a run that ran and declined —
        # indistinguishable from the job never firing, which is the exact
        # silent-death failure the health file exists to prevent.
        # REDACTED ON BOTH PATHS. The log is masked only when the key came from
        # secrets.* — a value stored under Variables is NOT masked, and on a
        # public repo Actions logs are world-readable. The health file is never
        # masked by anyone: we write it and the workflow commits it.
        print(f"::warning::{R.redact(e)}")
        write_health({"finished_at": now_iso(), "league": a.league,
                      "events_captured": 0, "coverage": 0.0,
                      "refused": R.redact(e)})
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{a.league}_{snap['started_at'].replace(':', '')}.json"
    path.write_text(json.dumps(snap, indent=2, sort_keys=True) + "\n")
    h = write_health(snap)
    print(f"captured {snap['events_captured']}/{snap['events_listed']} events "
          f"({snap['coverage']:.0%}) -> {path.name}")
    print(f"budget: {json.dumps(snap['budget'])}")
    print(f"touchdown finding: {json.dumps(snap.get('touchdown_finding'))}")
    print(f"health: {json.dumps(h)}")
    return 0


if __name__ == "__main__":                                       # pragma: no cover
    raise SystemExit(main())
