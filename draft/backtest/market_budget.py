#!/usr/bin/env python3
"""RATE BUDGET — spend the allowance deliberately, and stop BEFORE the cap.

Two rules, both learned the expensive way on this project:

  1. **Establishing the cost must not consume the budget.** The source probe was
     spending ~34 authenticated calls a run against a 100/hour limit — a third of
     the hour to re-answer questions already answered. Discovery is a one-time
     cost; once discovered it becomes a CONSTANT, not a call.

  2. **Stop before the ceiling; never retry into it.** A failure is the moment a
     naive loop does the most damage: it retries immediately, each attempt may
     bill, and the allowance is gone in seconds. Measured on odds-api.io a 400
     did not bill, but that is established for ONE error class only — an earlier
     uncontrolled sequence including 404s suggested otherwise. So this assumes
     failures DO bill. Assuming the cheaper case is how you find out you were
     wrong by losing the day.

THE RESERVE IS THE WHOLE IDEA. Running to exactly zero leaves nothing for the
retry a flaky week needs, so a floor is held back and the job declines to start a
capture it cannot finish. Refusing early is recoverable; being rejected mid-slate
leaves a half-captured snapshot, which for Signal C is worse than no snapshot —
a partial slate silently becomes the baseline that later movement is measured from.
"""
from __future__ import annotations


class BudgetExhausted(RuntimeError):
    """Refused BEFORE spending, not rejected after."""


class RateBudget:
    """Tracks remaining allowance from the provider's own headers.

    The provider is the authority: `x-ratelimit-remaining` is read from every
    response rather than counting locally. A local counter drifts the moment
    anything else uses the key, and drifts silently.
    """

    # Held back so a failure has somewhere to go. Not a guess at a good number —
    # it is one full slate capture (1 events call + ~16 odds calls) plus slack.
    DEFAULT_RESERVE = 20

    def __init__(self, limit=100, remaining=None, reserve=None):
        self.limit = int(limit)
        self.remaining = int(limit if remaining is None else remaining)
        self.reserve = int(self.DEFAULT_RESERVE if reserve is None else reserve)
        self.spent = 0
        self.reset_at = None

    # ── the provider is the source of truth ─────────────────────────────────
    def observe(self, headers) -> None:
        """Update from a response's headers. Unknown headers change nothing.

        ABSENT IS NOT ZERO: a response without the header does not mean no
        allowance remains, so the last known value is kept rather than
        overwritten with a coerced number.
        """
        h = {str(k).lower(): v for k, v in dict(headers or {}).items()}
        rem = h.get("x-ratelimit-remaining")
        lim = h.get("x-ratelimit-limit")
        rst = h.get("x-ratelimit-reset")
        if rem is not None:
            try:
                self.remaining = int(rem)
            except (TypeError, ValueError):
                pass
        if lim is not None:
            try:
                self.limit = int(lim)
            except (TypeError, ValueError):
                pass
        if rst:
            self.reset_at = str(rst)

    # ── spend deliberately ──────────────────────────────────────────────────
    def affordable(self, cost: int) -> bool:
        """Can `cost` calls be made and still leave the reserve intact?"""
        return (self.remaining - int(cost)) >= self.reserve

    def require(self, cost: int, what: str = "operation") -> None:
        """Refuse BEFORE spending. The exception names the arithmetic."""
        if not self.affordable(cost):
            raise BudgetExhausted(
                f"{what} needs {cost} calls; {self.remaining} remain and {self.reserve} "
                f"are reserved, so at most {max(0, self.remaining - self.reserve)} are "
                f"spendable. Refusing to start rather than stopping part-way"
                + (f" (resets {self.reset_at})" if self.reset_at else "")
            )

    def note_call(self, ok: bool = True) -> None:
        """Record a call locally too.

        Counts FAILURES as spends. On this provider a 400 was measured not to
        bill, but that is one error class; assuming failures are free is the
        assumption that empties the bucket when it turns out to be wrong.
        """
        self.spent += 1
        self.remaining = max(0, self.remaining - 1)

    def snapshot(self) -> dict:
        return {"limit": self.limit, "remaining": self.remaining,
                "reserve": self.reserve, "spendable": max(0, self.remaining - self.reserve),
                "spent_this_run": self.spent, "reset_at": self.reset_at}


# ── backoff ─────────────────────────────────────────────────────────────────
# Exponential, capped, and FINITE. The cap matters as much as the growth: an
# unbounded schedule turns a dead provider into a job that never exits, and the
# finite attempt count is what stops a retry loop from eating the allowance.
BACKOFF_SECONDS = (2, 8, 30)


def backoff_plan(attempt: int):
    """Seconds to wait before `attempt` (1-indexed), or None when out of attempts.

    None means STOP — not "retry immediately", which is what a bare loop does and
    what makes a failure the most expensive moment in the run.
    """
    i = int(attempt) - 1
    if i < 0 or i >= len(BACKOFF_SECONDS):
        return None
    return BACKOFF_SECONDS[i]


def should_retry(status, attempt: int) -> tuple:
    """(retry?, why). Distinguishes what a retry could possibly fix.

    A 4xx that is not 429 is OUR request being wrong — retrying it is the rule-13
    failure with a cost attached, since each attempt may bill and the request is
    identical every time.
    """
    if backoff_plan(attempt) is None:
        return False, "attempts exhausted — stopping rather than retrying into the cap"
    try:
        code = int(status)
    except (TypeError, ValueError):
        return True, "transport error — may be transient"
    if code == 429:
        return True, "rate limited — back off"
    if 500 <= code < 600:
        return True, "server error — may be transient"
    if 400 <= code < 500:
        return False, (f"HTTP {code} is our request, not the provider's state — "
                       "retrying spends budget to get the same answer")
    return False, f"HTTP {code} needs no retry"
