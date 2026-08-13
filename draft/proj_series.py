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
# 700, RAISED FROM 400 ON C's MEASUREMENT (2026-08-13). "Only the draftable
# region carries signal" was the wrong reason for the wrong cut: 9 snapshots
# across 08-09..08-13 all truncated to EXACTLY 400, against a board where 576
# players carry proj_mean > 0 — so the cap was binding on every capture and
# discarding 176 priced players.
#
# The discarded band is the one worth grading. C measured the deep bands as
# where the projection is MOST WRONG (proj_rank 33+ runs ~2x high at QB and TE
# against ~1.1-1.45 early), and a component grade needs the errors, not just the
# comfortable head of the distribution.
#
# AND IT EXPIRES, which is why it is not deferred past the draft. A PRESEASON
# projection is observable only before the season; a retroactive fetch leaks
# (exp33). Grading against actuals first becomes possible in January 2027, off
# this archive or not at all — so a band not captured now is not late, it is
# gone.
#
# Cost is the whole argument against and it is small: 5.2 KB/snapshot today,
# ~1.0 MB more at the MAX_SNAPS ceiling, which is 400 snapshot-days away.
TOP_N = 700


def append_snapshot(series, date, source, proj_by_id, top_n=TOP_N, max_snaps=MAX_SNAPS,
                    week=None):
    """series: [{date, source, proj:{id:points}}] oldest->newest. Returns a NEW list with this
    (date, source, week) snapshot added or REPLACED (a same-day re-run of the same source and
    week overwrites, never doubles), keeping the top_n highest-projection players and the most
    recent max_snaps. Deterministic; no clock (date is passed in).

    WEEK, ADDED 2026-08-11 FOR THE IN-SEASON SNAPSHOT, and it is part of the dedupe key rather
    than a label. THE WINDOW THIS EXISTS FOR: a shadow strategy's choice is a function of
    (roster, projections). Sleeper returns the roster retroactively; providers OVERWRITE weekly
    projections in place, so the projections a strategy would have read are gone the moment the
    week turns. That makes the weekly snapshot the only input with a real deadline — the shadow
    layer itself is recomputable in January, and is not being built.

    `week=None` is the PRESEASON record and is unchanged in shape, so every existing snapshot and
    every existing reader keeps working. A None week is written as absent rather than null,
    because a field that is present-and-empty on 5 preseason rows and meaningful on 80 in-season
    ones is read wrong exactly once.
    """
    trimmed = {str(pid): round(float(p), 2)
               for pid, p in sorted(proj_by_id.items(), key=lambda kv: -kv[1])[:top_n]}
    kept = [s for s in (series or [])
            if not (s.get("date") == date and s.get("source") == source
                    and s.get("week") == week)]
    snap = {"date": date, "source": source, "proj": trimmed}
    if week is not None:
        snap["week"] = int(week)
    kept.append(snap)
    # Sort key must not compare None to int — preseason rows carry no week.
    kept.sort(key=lambda s: (s["date"], s["source"], s.get("week") if s.get("week") is not None else -1))
    return kept[-max_snaps:]


def week_snapshot(series, season_week, source=None):
    """The snapshot dict {id:points} taken FOR a given in-season week.

    The reader half of the deadline: January asks "what did the projections say
    in week 5", and this answers it or returns {} rather than falling back to a
    nearby week. A silent fallback to the adjacent week's numbers would grade a
    shadow strategy against inputs it never saw, which is the leak exp33
    disqualified Sleeper for, arriving one level down.
    """
    best = None
    for s in series or []:
        if s.get("week") != season_week:
            continue
        if source is not None and s.get("source") != source:
            continue
        if best is None or s.get("date", "") > best.get("date", ""):
            best = s
    return (best or {}).get("proj", {})


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
