#!/usr/bin/env python3
"""DAILY ADP SERIES — the append-only record that makes rate-of-change computable.

Cory's observation (2026-08-09): the board rebuilds nightly but OVERWRITES draft_data.json, so
we were keeping only the latest snapshot — git history was the sole series, and it was ~2 days
deep. Camp news moves boards fastest in the two weeks before an Aug-22 draft, so the velocity of
each player's ADP is worth having; but it can only be computed from a RETAINED series. This
starts one now (every un-retained day is unrecoverable before the draft), append-only, deduped
by date so a same-day re-run replaces rather than doubles.

Two things it powers, only ONE of which is answerable from what we have:
  * STALENESS / velocity (answerable, grows daily): how far and which way a player's ADP moved
    over the last N days. Feeds a staleness alarm — "your board's number for X is Δ off the live
    number" — the data-freshness protection Cory wants, not a strategy.
  * MOMENTUM PREDICTION (NOT answerable now): does a late-Aug rise predict outperformance vs the
    earlier price? Needs prior-SEASON daily series + realized outcomes; we have neither. Recorded
    as blocked, not attempted, so nobody mistakes a 2-week self-correlation for a tested edge.

Pure functions here (unit-tested in test_adp_series.py); build.py appends daily and stamps
adp_velocity/adp_stale on the board from it.
"""
from __future__ import annotations

MAX_DAYS = 60          # bound the series; 60 days spans the whole draft-season ramp
TOP_N = 300            # only the draftable region — deep-board ADP is noise and bloat


def append_snapshot(series, date, adp_by_id, top_n=TOP_N, max_days=MAX_DAYS):
    """series: [{date, adp:{id:adp}}] oldest→newest. Returns a NEW list with `date`'s snapshot
    added (or replaced if the date already exists), keeping only the top_n lowest-ADP players
    and the most recent max_days dates. Deterministic; no clock (date is passed in)."""
    trimmed = {pid: float(a) for pid, a in sorted(adp_by_id.items(), key=lambda kv: kv[1])[:top_n]}
    kept = [s for s in (series or []) if s.get("date") != date]
    kept.append({"date": date, "adp": trimmed})
    kept.sort(key=lambda s: s["date"])
    return kept[-max_days:]


def _asof(series, pid, back):
    """The player's ADP `back` snapshots before the latest (0 = latest). None if absent."""
    if not series or back >= len(series):
        return None
    snap = series[-(back + 1)]
    v = snap.get("adp", {}).get(str(pid))
    return float(v) if v is not None else None


def velocity(series, pid, days=None):
    """Signed ADP change over the window: (older ADP − latest ADP). POSITIVE = RISING (moving to
    an earlier pick, the market likes him more); negative = falling. None if we lack both ends.
    days=None uses the full retained window. ADP is a pick number, so 'rising' = the number goes
    DOWN, hence older − latest."""
    if not series:
        return None
    latest = _asof(series, pid, 0)
    span = (len(series) - 1) if days is None else min(days, len(series) - 1)
    older = _asof(series, pid, span)
    if latest is None or older is None:
        return None
    return round(older - latest, 2)


def stale_flag(velocity_val, days_span, threshold=8.0):
    """A board number is STALE for a player who moved materially recently. threshold in ADP
    slots (~a round in a 10-team draft). Needs at least a 1-day span to mean anything."""
    if velocity_val is None or days_span < 1:
        return None
    if abs(velocity_val) >= threshold:
        return {"direction": "rising" if velocity_val > 0 else "falling",
                "slots": abs(velocity_val), "days": days_span}
    return None


def span_days(series):
    """How many day-to-day steps the series supports (0 = single snapshot, no velocity yet)."""
    return max(0, len(series or []) - 1)
