"""EXTERNAL REPLAY HARNESS — the piece that makes the ingest worth building.

A pile of external drafts is backtest material. What we actually want is
DECISION-TIME-CLEAN OBSERVATIONS: for each matched league, freeze the board and
ADP as they stood before that league's draft, replay the draft under the policy
we SHIP, and emit the SAME forecast types we emit at home, so one grader serves
both samples and an external grade means the same thing a home grade means.

Two things Cory required travel with the harness, and both live here rather than
in a convention:

  1. THE CONTAMINATION RULES ARE ENFORCED, NOT ASSUMED. `ExternalAsOfStore`
     raises rather than returning a value when asked for something that did not
     exist before the league's draft. This mirrors `asof.AsOfDataStore` for the
     home league; the failure it prevents is the one that does not look like a
     failure. A backtest that peeks does not crash — it reports an edge nobody
     can collect, and the leak is invisible in the output.

  2. A POLICY DRIFT GUARD. The harness runs the shipped policy, so if the live
     policy changes and the harness does not, external grades quietly stop
     measuring what we ship — the two-places disease, at the level of a whole
     sample. Every emitted forecast carries a POLICY FINGERPRINT derived from
     `engine.js MEASURED_WEIGHTS`, and `assert_policy_current` refuses to grade
     observations minted under a different policy.

WHAT THIS MODULE DELIBERATELY DOES NOT DO. It does not fetch. Discovery and the
ADP-snapshot pull need egress the sandbox does not have (MFL is blocked here,
open in CI), so they are CI jobs that feed this. Keeping the harness pure is also
what makes it testable at all: every rule below is exercised by
`draft/tests/test_external_replay.py`, and each guard was deliberately broken
once and observed failing by name before being trusted (rule 10).
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The home-league as-of store already defines the exception this raises. Import
# it rather than declaring a second one, so a caller can catch ONE error type
# across both samples instead of learning which store it happens to be holding.
from asof import TimeTravelError  # noqa: E402


# 2001-09-09 to 2096-10-02. Wide enough for any NFL season we will ever ingest and
# narrow enough that milliseconds (13 digits) and years (4 digits) fall outside.
EPOCH_SECONDS_MIN = 1_000_000_000
EPOCH_SECONDS_MAX = 4_000_000_000


def _as_date(v) -> date:
    """Accept date, datetime, or ISO string. Reject anything else LOUDLY.

    A silently-coerced timestamp is how an off-by-one-day leak gets in: the
    whole contamination rule is a comparison between two dates, so a value that
    does not really carry a date must never reach that comparison.
    """
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).date()
        except ValueError:
            pass
        try:
            return date.fromisoformat(v[:10])
        except ValueError:
            pass
    # UNIX EPOCH SECONDS, which is what `draft_picks` emits for every pick. The
    # refusal above is right in spirit — a silently-coerced timestamp is how an
    # off-by-one-day leak gets in — but it was refusing the ONE type the producer
    # in this codebase actually uses, so `lead_days_spread` counted EVERY real pick
    # as undated and the per-pick staleness this seam was built for never once ran
    # on real data. It fell back to the league scalar and said so, which is honest
    # and is not what it was for.
    #
    # ACCEPTED WITH BOUNDS, not coerced: only a value in the plausible
    # epoch-SECONDS window is a date. A 13-digit value is milliseconds and a
    # 4-digit value is a year, and both are refused BY NAME rather than quietly
    # producing a date in 1970 or 53000.
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if EPOCH_SECONDS_MIN <= float(v) <= EPOCH_SECONDS_MAX:
            return datetime.fromtimestamp(float(v), tz=timezone.utc).date()
        raise TimeTravelError(
            "numeric timestamp %r is outside the plausible epoch-SECONDS window "
            "[%d, %d] — a 13-digit value is milliseconds and a 4-digit value is a "
            "year, and guessing which would move the date by decades"
            % (v, EPOCH_SECONDS_MIN, EPOCH_SECONDS_MAX))
    raise TimeTravelError(f"unusable timestamp {v!r} — refusing to guess a date")


class ExternalAsOfStore:
    """The only data an external replay is allowed to see.

    Constructed with a league's draft date and every ADP snapshot we hold for it.
    `board()` returns the frozen pre-draft board; anything that would require
    knowing the future raises.
    """

    def __init__(self, league_id: str, draft_date, snapshots: list, policy_fingerprint: str):
        self.league_id = str(league_id)
        self.draft_date = _as_date(draft_date)
        self.policy_fingerprint = policy_fingerprint
        # Snapshots are (observed_at, rows). Sorted once, here, so no caller has
        # to remember to; an unsorted "latest" is a leak waiting to happen.
        self._snaps = sorted(
            ({"observed_at": _as_date(s["observed_at"]), "rows": s.get("rows") or []}
             for s in (snapshots or [])),
            key=lambda s: s["observed_at"],
        )

    # ── the frozen board ────────────────────────────────────────────────────
    def board(self) -> list:
        """The market's pre-draft opinion, as of this league's draft.

        F5: the LATEST snapshot STRICTLY BEFORE the draft date. Strictly, not
        `<=`: a snapshot stamped the same day as the draft may have been taken
        after picks were already in, and ADP that has seen the draft it is being
        used to predict is worthless in the specific way that looks like skill.

        A league with no qualifying snapshot is EXCLUDED (F4), by raising. This
        is expected to be the largest single source of attrition and loosening
        it to gain sample is forbidden — so the refusal lives in code, where
        loosening it is a visible edit rather than a judgement call at 1am.
        """
        usable = [s for s in self._snaps if s["observed_at"] < self.draft_date]
        if not usable:
            raise TimeTravelError(
                f"league {self.league_id}: no ADP snapshot strictly before "
                f"{self.draft_date} — excluded under F4/F5, not back-filled"
            )
        return _earliest_wins(usable[-1]["rows"])

    def snapshot_date(self) -> date:
        usable = [s for s in self._snaps if s["observed_at"] < self.draft_date]
        if not usable:
            raise TimeTravelError(f"league {self.league_id}: no pre-draft snapshot")
        return usable[-1]["observed_at"]

    def lead_days(self, at=None) -> int:
        """How stale the frozen board was WHEN THE DECISION WAS MADE.

        PER-DECISION, NOT PER-LEAGUE, and the distinction is not cosmetic. MFL
        drafts are `draft_kind: email` on a `draftLimitHours` clock and routinely
        run for days, so `draft_at` — correctly the FIRST pick, because F5's
        admission needs a scalar lower bound that is clean for every pick — is
        the wrong reference for staleness. A day-five pick dated from day one
        understates the board's age by the whole length of the draft, on exactly
        the picks where it is stalest. Dating from the last pick inverts the same
        error onto day one. Neither scalar is right; the quantity is per-pick,
        and the per-pick timestamps already exist (`draft_picks` keeps them) —
        they were being collapsed at this seam, not missing.

        `at=None` falls back to the league's draft date. Callers that have a pick
        time must pass it, and `emit_forecast` records WHICH basis was used, so a
        fallback can never be read as a per-pick measurement.
        """
        ref = _as_date(at) if at is not None else self.draft_date
        return (ref - self.snapshot_date()).days

    def lead_days_spread(self, pick_times) -> dict:
        """min / median / max staleness across a draft's picks.

        A single number is right for one pick and wrong for the rest, so the
        league-level report carries the SPREAD. This is also what turns "do
        multi-day drafts even matter" from an assumption into a reported number.

        UNDATED PICKS ARE COUNTED, NEVER DATED FROM THE LEAGUE. A pick with no
        timestamp has unknown staleness; folding it in at the draft date would
        manufacture an observation out of an absence.
        """
        vals, undated = [], 0
        for t_ in (pick_times or []):
            if t_ is None:
                undated += 1
                continue
            try:
                vals.append(self.lead_days(t_))
            except TimeTravelError:
                undated += 1
        if not vals:
            return {"n": 0, "undated": undated, "min": None, "median": None, "max": None,
                    "span_days": None}
        s = sorted(vals)
        mid = len(s) // 2
        median = s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2
        return {"n": len(s), "undated": undated, "min": s[0], "median": median,
                "max": s[-1], "span_days": s[-1] - s[0]}


def _earliest_wins(rows: list) -> list:
    """EARLIEST TIMESTAMP WINS, enforced rather than assumed.

    A snapshot can carry the same player more than once — a re-publish, a merge
    of two pulls, a provider revising a row. A later revision is contaminated in
    a way that is invisible downstream: it may have been revised BECAUSE of news
    that also moved the draft. So when a player appears more than once, the
    observation with the earliest `observed_at` is authoritative and the rest are
    dropped. Rows with no per-row stamp are treated as belonging to the snapshot
    and keep first-seen order, which is the same rule.

    THE RULE HELD IN ONE ARRIVAL ORDER ONLY (fixed 2026-08-11, found by session B).
    Both branches of a stamped-vs-unstamped collision hit `continue`, so the winner
    was whichever row ARRIVED FIRST — neither "earliest wins" nor "stamped wins".
    Unstamped-first kept the UNSTAMPED row, which is precisely the contamination
    this function exists to exclude: the retained observation is the one whose date
    we cannot verify against the draft. The trigger is the one the docstring already
    anticipated — a merge of two pulls, one provider stamping rows and one not.

    Rule-10 note on how it survived: the order-independence test existed, for two
    STAMPED rows; the mixed case was tested in one direction only. The untested
    ordering was the broken one. Both directions are asserted now.
    """
    seen: dict = {}
    out: list = []
    for r in rows:
        pid = str(r.get("player_id"))
        stamp = r.get("observed_at")
        stamp = _as_date(stamp) if stamp is not None else None
        if pid not in seen:
            seen[pid] = (stamp, len(out))
            out.append(dict(r))
            continue
        prev_stamp, idx = seen[pid]
        # "Unknown" must not win a recency argument — in EITHER direction. An
        # unstamped row never displaces anything, and a stamped row always
        # displaces an unstamped one no matter which arrived first. Between two
        # stamped rows the EARLIER wins; between two unstamped ones the first
        # seen does, because a tie has no earlier.
        if stamp is None:
            continue
        if prev_stamp is None or stamp < prev_stamp:
            out[idx] = dict(r)
            seen[pid] = (stamp, idx)
    return out


# ── policy fingerprint + drift guard ────────────────────────────────────────
def policy_fingerprint() -> str:
    """A short, stable hash of the weights the tool ACTUALLY SHIPS.

    Parsed from `engine.js` by `graduation_gate.loaded_weights` — reused rather
    than re-implemented, because a second parser for the same numbers is exactly
    the disease this guard exists to catch.
    """
    from graduation_gate import loaded_weights

    w = loaded_weights()
    canon = json.dumps({k: round(float(v), 6) for k, v in sorted(w.items())},
                       separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()[:16]


def assert_policy_current(observations: list) -> dict:
    """Refuse to grade external observations minted under a different policy.

    THE FAILURE THIS PREVENTS. The harness implements the policy. Change a weight
    in `engine.js` and every previously-emitted external forecast is now a
    measurement of something we no longer ship — but it still grades, still
    aggregates, and still reads like evidence about the live tool. Nothing
    errors, the sample just quietly stops being about us.

    So a fingerprint mismatch is an ERROR, not a warning, and the resolution is
    to RE-REPLAY under the current policy — never to relabel the old grades.
    """
    current = policy_fingerprint()
    stale = sorted({str(o.get("policy_fingerprint")) for o in (observations or [])
                    if o.get("policy_fingerprint") != current})
    if stale:
        raise PolicyDriftError(
            f"external observations were minted under policy {stale} but the "
            f"shipped policy is {current} — re-replay, do not relabel"
        )
    return {"policy_fingerprint": current, "observations": len(observations or [])}


class PolicyDriftError(RuntimeError):
    """The harness and the shipped policy have diverged."""


# ── the forecast contract ───────────────────────────────────────────────────
# THE SAME CONTRACT THE HOME LEDGER ENFORCES (src/predledger.js). External
# observations are not a parallel schema — that is the entire point of the
# harness, and a divergence here would mean two graders and two meanings.
#
# The first cut of this file got the contract WRONG and the test caught it: it
# treated 'survival' and 'room_seat' as ledger KINDS. They are not. The kind is
# 'forecast'; `room_seat:r1p<seat>` is a forecast KEY prefix and survival/point/
# categorical live in `ftype`. Restating a contract from memory instead of
# reading it is how two schemas diverge on day one.
FORECAST_KINDS = ("forecast", "forecast_resolution")
FORECAST_TYPES = ("probability", "point", "categorical")


def emit_forecast(store: ExternalAsOfStore, key: str, ftype: str, value,
                  resolution_rule: str, extra: dict | None = None,
                  decided_at=None) -> dict:
    """One committed forecast, stamped with everything needed to judge it later.

    Mirrors `assertForecast('forecast', ...)`: a key to join a resolution on, an
    ftype, the committed value, and — before any outcome is known — the rule by
    which reality decides it. That last one is not bureaucracy: a forecast with
    no pre-stated resolution rule can be reinterpreted after the fact, which is
    precisely how a null becomes a success.

    `sample: external` is carried explicitly so an external observation can never
    be mistaken for a home one inside an aggregate — rule 1 labelling at the
    record level rather than in a README.
    """
    if ftype not in FORECAST_TYPES:
        raise ValueError(f"unknown ftype {ftype!r} — must match the home ledger")
    if value is None:
        raise ValueError("a forecast requires a committed value")
    if ftype == "probability" and not (0.0 <= float(value) <= 1.0):
        raise ValueError("a probability forecast needs value in [0,1]")
    if not resolution_rule or not isinstance(resolution_rule, str):
        raise ValueError(
            "a forecast requires a resolution_rule — how reality decides it, "
            "stated BEFORE the outcome so a null cannot be reinterpreted"
        )
    return {
        "sample": "external",
        "league_id": store.league_id,
        "kind": "forecast",
        "payload": dict(extra or {}, key=key, ftype=ftype, value=value,
                        resolution_rule=resolution_rule),
        # Provenance that makes the observation auditable after the fact.
        "policy_fingerprint": store.policy_fingerprint,
        "board_asof": store.snapshot_date().isoformat(),
        "draft_date": store.draft_date.isoformat(),
        # LABELLED, because a league-level fallback and a per-pick measurement
        # are different quantities and would otherwise be indistinguishable in
        # an aggregate — the coerced-value failure, one field over.
        "lead_days": store.lead_days(decided_at),
        "lead_days_basis": "pick" if decided_at is not None else "draft_start",
    }


if __name__ == "__main__":  # pragma: no cover - manual inspection only
    print("policy fingerprint:", policy_fingerprint())
