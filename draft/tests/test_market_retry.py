"""THE BACKOFF, CONNECTED — and asserted at the boundary rather than the extreme.

B's second ingest audit: `backoff_plan` had no caller anywhere in the codebase,
`should_retry` was always passed `attempt=1` so it could never reach its own
exhaustion branch, and `retry_advised` was written into the snapshot and acted on
by nothing. A 429 recorded "back off" and fired the next request immediately —
the naive retry loop the module exists to prevent. The logic was right; it was
simply not connected.

The other half was worse: `observe()` ran only on the success path, so a 429 —
the response most likely to carry a fresh rate header — was thrown away, leaving
the local counter that market_budget's own docstring calls unreliable as the sole
authority on remaining budget.

Every test here uses a FAKE clock. A real backoff of 2+8+30 seconds inside a test
suite is a 40-second test, and a slow guard gets deleted.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import market_budget as B    # noqa: E402
import market_capture as C   # noqa: E402
import market_request as R   # noqa: E402


class FakeHTTPError(Exception):
    """Shaped like urllib's HTTPError: carries .code and .headers."""

    def __init__(self, code, headers=None):
        super().__init__(f"HTTP {code}")
        self.code = code
        self.headers = headers or {}


class Clock:
    def __init__(self):
        self.waits = []

    def __call__(self, s):
        self.waits.append(s)


def patch_fetch(monkeypatch, responses):
    """Each element is either an exception to raise or a (payload, headers) pair."""
    seq = list(responses)
    calls = []

    def fake(url, timeout=30):
        calls.append(url)
        nxt = seq.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    monkeypatch.setattr(R, "fetch", fake)
    return calls


def _as_http(monkeypatch):
    """fetch_with_retry catches `urllib.error.HTTPError` BY TYPE, and it resolves
    that attribute at call time, so pointing the name at the fake routes these
    tests down the HTTPError branch — the one that reads headers off the error.

    Without this they would fall through to the generic `except`, which does NOT
    call observe(), and the header assertions would be testing nothing. That is
    load-bearing rather than plumbing: see the break note on
    test_the_429s_rate_header_is_READ_not_discarded."""
    import urllib.error
    monkeypatch.setattr(urllib.error, "HTTPError", FakeHTTPError, raising=False)


# ── the backoff is executed, not merely advised ─────────────────────────────
def test_a_429_actually_waits_before_retrying(monkeypatch):
    """The exact scenario the module's docstring says it prevents, and did not."""
    _as_http(monkeypatch)
    clock = Clock()
    patch_fetch(monkeypatch, [
        FakeHTTPError(429, {"x-ratelimit-remaining": "40"}),
        ({"ok": True}, {"x-ratelimit-remaining": "39"}),
    ])
    b = B.RateBudget(limit=100, remaining=80)
    payload, _, attempts = C.fetch_with_retry("https://h/x", b, sleep=clock)
    assert payload == {"ok": True}
    assert attempts == 2
    assert clock.waits == [B.BACKOFF_SECONDS[0]], "it must WAIT, not fire immediately"


def test_the_429s_rate_header_is_READ_not_discarded(monkeypatch):
    """observe() used to run only on success, so the one response carrying the
    freshest remaining count was the one thrown away."""
    _as_http(monkeypatch)
    patch_fetch(monkeypatch, [
        FakeHTTPError(429, {"x-ratelimit-remaining": "7", "x-ratelimit-reset": "T1"}),
        ({"ok": True}, {}),
    ])
    b = B.RateBudget(limit=100, remaining=90, reserve=0)
    C.fetch_with_retry("https://h/x", b, sleep=Clock())
    # 7 observed from the error, then two note_call decrements (the failure and
    # the success). The point is that it is anchored to 7, not to our own 90.
    assert b.remaining <= 7
    assert b.reset_at == "T1"


def test_should_retry_RECEIVES_the_real_attempt_number(monkeypatch):
    """THE FINDING ITSELF, asserted directly — and it took a break to find that the
    obvious test did not cover it.

    B's finding was precise: should_retry was invoked with attempt hardcoded to 1,
    so it could never reach its own exhaustion branch. Re-introducing exactly that
    (`should_retry(code, 1)`) left the whole first draft of this file GREEN,
    because `wait = backoff_plan(attempt)` uses the real number and raises on None
    a moment later. Two stop conditions, one of them dead, and the live one masking
    the dead one — which is the same shape as a guard that exists and does not
    guard.

    So the assertion is on the argument, not on the outcome. It sees 1, 2, 3, 4:
    the fourth is should_retry's OWN exhaustion branch, reached rather than
    bypassed."""
    _as_http(monkeypatch)
    seen = []
    real = C.should_retry

    def spy(status, attempt):
        seen.append(attempt)
        return real(status, attempt)

    monkeypatch.setattr(C, "should_retry", spy)
    patch_fetch(monkeypatch, [FakeHTTPError(503) for _ in range(6)])
    b = B.RateBudget(limit=100, remaining=90, reserve=0)
    with pytest.raises(C.CaptureFailure):
        C.fetch_with_retry("https://h/x", b, sleep=Clock())
    assert seen == [1, 2, 3, 4], f"should_retry saw {seen}"
    assert real(503, seen[-1])[0] is False, "the last call must be its exhaustion branch"


def test_exhaustion_is_REACHABLE(monkeypatch):
    """`attempt` was hardcoded to 1, so should_retry could never take this branch.
    Three waits then stop — never a fourth request."""
    _as_http(monkeypatch)
    clock = Clock()
    patch_fetch(monkeypatch, [FakeHTTPError(503) for _ in range(6)])
    b = B.RateBudget(limit=100, remaining=90, reserve=0)
    with pytest.raises(C.CaptureFailure) as e:
        C.fetch_with_retry("https://h/x", b, sleep=clock)
    assert list(clock.waits) == list(B.BACKOFF_SECONDS)
    assert e.value.attempts == len(B.BACKOFF_SECONDS) + 1


def test_a_4xx_is_not_retried_at_all(monkeypatch):
    """Rule 13 with a price tag: the request is identical every time."""
    _as_http(monkeypatch)
    clock = Clock()
    calls = patch_fetch(monkeypatch, [FakeHTTPError(400), ({"x": 1}, {})])
    b = B.RateBudget(limit=100, remaining=90, reserve=0)
    with pytest.raises(C.CaptureFailure):
        C.fetch_with_retry("https://h/x", b, sleep=clock)
    assert clock.waits == [] and len(calls) == 1


# ── BOUNDARY BREAKS: the reserve, tested one call either side ───────────────
#
# Rule 10's new clause. Breaking this by a mile only proves the mechanism fires.
# The question worth answering is whether the CEILING is in the right place, and
# only a break just past the threshold answers it.
def test_backing_off_stops_EXACTLY_at_the_reserve_not_past_it(monkeypatch):
    """remaining 21, reserve 20: after the failed call spends one, remaining is 20
    and affordable(1) is false. It must stop rather than retry into the reserve."""
    _as_http(monkeypatch)
    clock = Clock()
    patch_fetch(monkeypatch, [FakeHTTPError(429), ({"ok": True}, {})])
    b = B.RateBudget(limit=100, remaining=21, reserve=20)
    with pytest.raises(C.CaptureFailure) as e:
        C.fetch_with_retry("https://h/x", b, sleep=clock)
    assert "reserve" in str(e.value)
    assert clock.waits == [], "it must not even begin the backoff"


def test_one_call_the_other_side_of_the_reserve_DOES_retry(monkeypatch):
    """remaining 22: one spend leaves 21, affordable(1) is true by exactly one.
    The pair of tests is what shows the boundary is where it is meant to be —
    either alone would pass with the threshold off by one."""
    _as_http(monkeypatch)
    clock = Clock()
    patch_fetch(monkeypatch, [FakeHTTPError(429), ({"ok": True}, {})])
    b = B.RateBudget(limit=100, remaining=22, reserve=20)
    payload, _, attempts = C.fetch_with_retry("https://h/x", b, sleep=clock)
    assert payload == {"ok": True} and attempts == 2
    assert clock.waits == [B.BACKOFF_SECONDS[0]]


def test_a_transport_error_with_no_status_is_retried(monkeypatch):
    clock = Clock()
    patch_fetch(monkeypatch, [OSError("connection reset"), ({"ok": True}, {})])
    b = B.RateBudget(limit=100, remaining=90, reserve=0)
    payload, _, attempts = C.fetch_with_retry("https://h/x", b, sleep=clock)
    assert payload == {"ok": True} and attempts == 2


def test_backoff_plan_now_has_a_caller():
    """The finding was not that the logic was wrong — B's verdict was that it is
    right. It was that nothing called it. Asserted directly so a future refactor
    that disconnects it again fails here rather than in December."""
    src = (Path(C.__file__).read_text())
    assert "backoff_plan(" in src, "market_capture must CALL backoff_plan"
    assert "sleep(wait)" in src, "and must actually wait the returned interval"
