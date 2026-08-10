#!/usr/bin/env python3
"""PRESEASON PROJECTION SNAPSHOTS — the frozen record that makes a CLEAN projection grade possible.

The exp33 lesson (Cory, 2026-08-10): a projection source graded retroactively is LEAKED if its
endpoint updates in-season — Sleeper's 0.69/0.82 was disqualified for exactly that. The only honest
grade of a projection source is against a PRESEASON-FROZEN snapshot taken before any games. We have
never frozen one, so we have never cleanly graded projections at all.

This freezes them, append-only, dated, deduped by (date, source) — same shape as the ADP series.
The board already carries the Sleeper preseason projection as `proj_baseline`; FantasyPros
projections are fetched in CI. Snapshot NOW (preseason), grade after the 2026 season. Every
un-frozen day before Sleeper's endpoint drifts in-season is a clean grade we can never recover.

Pure functions here (unit-tested); the CI probe fetches FP and the build appends the snapshots.
"""
from __future__ import annotations

MAX_SNAPS = 400          # bound the archive; plenty for weekly preseason snapshots across sources
TOP_N = 400              # only the draftable region carries signal


def append_snapshot(series, date, source, proj_by_id, top_n=TOP_N, max_snaps=MAX_SNAPS):
    """series: [{date, source, proj:{id:points}}] oldest->newest. Returns a NEW list with this
    (date, source) snapshot added or REPLACED (a same-day re-run of the same source overwrites,
    never doubles), keeping the top_n highest-projection players and the most recent max_snaps.
    Deterministic; no clock (date is passed in)."""
    trimmed = {str(pid): round(float(p), 2)
               for pid, p in sorted(proj_by_id.items(), key=lambda kv: -kv[1])[:top_n]}
    kept = [s for s in (series or []) if not (s.get("date") == date and s.get("source") == source)]
    kept.append({"date": date, "source": source, "proj": trimmed})
    kept.sort(key=lambda s: (s["date"], s["source"]))
    return kept[-max_snaps:]


def latest(series, source):
    """The most recent snapshot dict {id:points} for `source`, or {} if none."""
    for s in reversed(series or []):
        if s.get("source") == source:
            return s.get("proj", {})
    return {}


def _ranks(proj):
    """id -> 1-indexed rank by projection (highest = 1)."""
    order = sorted(proj, key=lambda pid: -proj[pid])
    return {pid: i + 1 for i, pid in enumerate(order)}


def divergence(a, b, pids=None):
    """How differently two projection sources rank the SAME players. On the shared id set (or the
    given `pids` that both cover), returns Spearman-style rank agreement and the biggest rank
    disagreements — so 'does the source choice move picks' is a number, not a vibe. No outcomes
    here; this compares two sources to each other, not to realized (that grade waits for the season)."""
    shared = [pid for pid in (pids or set(a) & set(b)) if pid in a and pid in b]
    if len(shared) < 3:
        return {"n": len(shared), "rank_corr": None, "top_disagreements": []}
    ra, rb = _ranks({p: a[p] for p in shared}), _ranks({p: b[p] for p in shared})
    n = len(shared)
    # Spearman on the shared set
    import math
    ma = sum(ra[p] for p in shared) / n
    mb = sum(rb[p] for p in shared) / n
    num = sum((ra[p] - ma) * (rb[p] - mb) for p in shared)
    da = math.sqrt(sum((ra[p] - ma) ** 2 for p in shared))
    db = math.sqrt(sum((rb[p] - mb) ** 2 for p in shared))
    rho = round(num / (da * db), 4) if da and db else None
    diffs = sorted(shared, key=lambda p: -abs(ra[p] - rb[p]))[:15]
    return {"n": n, "rank_corr": rho,
            "top_disagreements": [{"id": p, "rank_a": ra[p], "rank_b": rb[p],
                                   "proj_a": a[p], "proj_b": b[p]} for p in diffs]}
