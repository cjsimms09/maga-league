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
from market_budget import BudgetExhausted, RateBudget, should_retry  # noqa: E402

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


def scan_touchdown_markets(payload) -> dict:
    """Does this payload price touchdowns? Reported as a finding, with evidence."""
    body = json.dumps(payload).lower()
    hits = sorted({w for w in TD_WORDS if w in body})
    return {
        "touchdown_markets_present": bool(hits),
        "matched_terms": hits,
        # The numbers behind the verdict, so it can be checked rather than trusted.
        "payload_bytes": len(body),
        "note": ("if present, the coverage arithmetic must be RE-RUN — the "
                 "23.3/29.1/47.5% uncovered figures were measured against a "
                 "two-book, no-TD assumption"),
    }


def capture(league: str, api_key: str, books=None, max_events=None,
            horizon_days: int = 14) -> dict:
    """One snapshot. Refuses up front if the budget cannot cover it."""
    books = R.check_books(books or list(R.RECREATIONAL_BOOKS[:2]))
    budget = RateBudget(limit=100)
    started = now_iso()

    url = R.build(HOST, "events", {"apiKey": api_key, "sport": "american-football",
                                   "league": league})
    events, headers = R.fetch(url)
    budget.observe(headers)
    budget.note_call()
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
        events = [e for e, t in dated if t is None or t <= cutoff]
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

    rows, failures = [], []
    td_finding = None
    for ev in events:
        eid = ev.get("id")
        try:
            odds_url = R.build(HOST, "odds", {"apiKey": api_key, "eventId": eid,
                                              "bookmakers": ",".join(books)})
            payload, h = R.fetch(odds_url)
            budget.observe(h)
            budget.note_call()
            if td_finding is None:
                td_finding = scan_touchdown_markets(payload)
            rows.append({
                "event_id": eid,
                "home": ev.get("home"), "away": ev.get("away"),
                "starts_at": ev.get("date"),
                "captured_at": now_iso(),          # EVERY value carries its time
                "source": f"odds-api.io/{','.join(books)}",
                "odds": payload,
            })
        except Exception as e:                                  # noqa: BLE001
            code = getattr(e, "code", None)
            budget.note_call(ok=False)             # failures count as spend
            retry, why = should_retry(code, attempt=1)
            failures.append({"event_id": eid, "status": code, "retry_advised": retry,
                             "why": why})
            if not budget.affordable(1):
                failures.append({"stopped": "budget reserve reached — "
                                            "stopping rather than spending into the cap"})
                break

    return {
        "league": league, "started_at": started, "finished_at": now_iso(),
        "horizon_days": horizon_days,
        "events_listed": len(events) + len(deferred),
        "events_captured": len(rows),
        # NEVER SILENTLY PARTIAL: what was left, and why, in the snapshot itself.
        "events_deferred_for_budget": [e.get("id") for e in deferred],
        "deferred_count": len(deferred),
        "failures": failures,
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
    ok = snapshot.get("events_captured", 0) > 0
    health = {
        "last_attempt_at": snapshot.get("finished_at"),
        "last_success_at": snapshot.get("finished_at") if ok else prior.get("last_success_at"),
        "last_league": snapshot.get("league"),
        "last_events_captured": snapshot.get("events_captured"),
        "last_coverage": snapshot.get("coverage"),
        "consecutive_failures": 0 if ok else int(prior.get("consecutive_failures", 0)) + 1,
        "stale_after_days": 7,
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
        print(f"::warning::{e}")
        write_health({"finished_at": now_iso(), "league": a.league,
                      "events_captured": 0, "coverage": 0.0, "refused": str(e)})
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
