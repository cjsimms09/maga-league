"""The rate budget: stop before the cap, never retry into it.

The failure being prevented is not "we hit the limit" — it is the shape of the
failure. A naive loop retries the instant something breaks, each attempt may bill,
and a day's allowance is gone in seconds. Every assertion here is about refusing
EARLY rather than being rejected LATE.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import market_budget as B  # noqa: E402


# ── the provider is the source of truth ─────────────────────────────────────
def test_remaining_is_read_from_the_providers_headers():
    b = B.RateBudget(limit=100)
    b.observe({"x-ratelimit-limit": "100", "x-ratelimit-remaining": "63",
               "x-ratelimit-reset": "2026-08-11T01:21:08Z"})
    assert b.remaining == 63 and b.limit == 100
    assert b.reset_at == "2026-08-11T01:21:08Z"


def test_case_insensitive_headers():
    b = B.RateBudget()
    b.observe({"X-RateLimit-Remaining": "42"})
    assert b.remaining == 42


def test_a_response_without_headers_does_NOT_reset_the_count():
    """Absent is not zero, and it is not 'full' either. A missing header means we
    learned nothing, so the last known value stands."""
    b = B.RateBudget(limit=100, remaining=30)
    b.observe({})
    assert b.remaining == 30
    b.observe({"x-ratelimit-remaining": "not-a-number"})
    assert b.remaining == 30


# ── refuse before spending ──────────────────────────────────────────────────
def test_a_capture_that_would_breach_the_reserve_is_REFUSED_UP_FRONT():
    """Refusing early is recoverable. Being rejected mid-slate leaves a partial
    snapshot, which for Signal C is worse than none — a half-captured slate
    silently becomes the baseline later movement is measured from."""
    b = B.RateBudget(limit=100, remaining=25, reserve=20)
    assert b.affordable(17) is False
    with pytest.raises(B.BudgetExhausted):
        b.require(17, "weekly slate capture")


def test_a_capture_that_fits_within_the_reserve_proceeds():
    b = B.RateBudget(limit=100, remaining=90, reserve=20)
    assert b.affordable(17) is True
    b.require(17, "weekly slate capture")           # must not raise


def test_the_refusal_states_the_arithmetic():
    b = B.RateBudget(limit=100, remaining=25, reserve=20)
    with pytest.raises(B.BudgetExhausted) as e:
        b.require(17, "weekly slate capture")
    msg = str(e.value)
    assert "17" in msg and "25" in msg and "20" in msg
    assert "Refusing to start" in msg


def test_the_reserve_is_never_spent_down_to_zero():
    """Running to exactly zero leaves nothing for the retry a flaky week needs."""
    b = B.RateBudget(limit=100, remaining=20, reserve=20)
    assert b.affordable(1) is False


def test_failures_count_as_spend():
    """A 400 was measured not to bill on this provider, but that is ONE error
    class. Assuming failures are free is the assumption that empties the bucket
    when it turns out to be wrong."""
    b = B.RateBudget(limit=100, remaining=50)
    b.note_call(ok=False)
    assert b.remaining == 49 and b.spent == 1


# ── backoff, and knowing when to stop ───────────────────────────────────────
def test_backoff_grows_and_is_finite():
    assert B.backoff_plan(1) == 2
    assert B.backoff_plan(2) == 8
    assert B.backoff_plan(3) == 30
    assert B.backoff_plan(4) is None          # STOP, not "retry immediately"


def test_out_of_attempts_means_stop_not_retry():
    ok, why = B.should_retry(500, attempt=4)
    assert ok is False and "stopping rather than retrying" in why


def test_a_429_backs_off_rather_than_hammering():
    ok, why = B.should_retry(429, attempt=1)
    assert ok is True and "rate limited" in why


def test_a_5xx_is_retried_as_possibly_transient():
    assert B.should_retry(503, attempt=1)[0] is True


def test_a_4xx_IS_NOT_RETRIED_because_the_request_is_the_problem():
    """This is rule 13 with a price tag: the request is identical every time, so
    each retry spends budget to receive the same answer."""
    ok, why = B.should_retry(400, attempt=1)
    assert ok is False and "our request" in why
    assert B.should_retry(404, attempt=1)[0] is False
    assert B.should_retry(403, attempt=1)[0] is False


def test_a_transport_error_with_no_status_is_treated_as_transient():
    assert B.should_retry(None, attempt=1)[0] is True


# ── the snapshot a health check reads ───────────────────────────────────────
def test_the_snapshot_reports_spendable_not_just_remaining():
    b = B.RateBudget(limit=100, remaining=30, reserve=20)
    s = b.snapshot()
    assert s["spendable"] == 10 and s["remaining"] == 30 and s["reserve"] == 20


def test_spendable_never_goes_negative():
    b = B.RateBudget(limit=100, remaining=5, reserve=20)
    assert b.snapshot()["spendable"] == 0
