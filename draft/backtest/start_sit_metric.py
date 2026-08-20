# TERRITORY: A
"""PAIRWISE START/SIT ACCURACY — the frozen metric of Cory's bar,
implemented once, imported everywhere it is graded.

THE DEFINITION IS FROZEN in WEEKLY-LAB-FREEZE-2026.md §1 (committed
2026-08-18, before any 2026 outcome existed) and this module implements
it VERBATIM — any divergence between this file and that freeze is a bug
in this file, by declaration:

  * pairs at one position, one week, where BOTH players are projected by
    EVERY compared source AND both have a real stat row;
  * |actual_i − actual_j| >= DECISION_FLOOR (3.0 our-scoring points) or
    the pair is excluded as noise (excluded count reported);
  * score 1 when the source orders the pair like reality, 0.5 on an
    exact projection tie, else 0;
  * POOLED across the window's weeks, never averaged per week;
  * a position cell is `unmeasurable` under MIN_PAIRS (200).

The Cory bar (`meets_cory_bar`): our champion beats a provider at a
position iff accuracy is strictly higher ON THE IDENTICAL PAIR SET; the
bar is met iff we beat BOTH providers at >= 3 of the 4 positions.
"""
from __future__ import annotations

from itertools import combinations

DECISION_FLOOR = 3.0
MIN_PAIRS = 200
POSITIONS = ("QB", "RB", "WR", "TE")


def qualifying_pairs(week_rows):
    """[(pid_i, pid_j, actual_i, actual_j)] per the freeze, for ONE week.

    `week_rows`: {pid: {"pos": str, "actual": float|None,
                        "proj": {source: float}}} — a pid with actual None
    (no real stat row) never enters a pair; a pid missing ANY compared
    source's projection never enters a pair.
    """
    sources = None
    for r in week_rows.values():
        s = set(r.get("proj") or {})
        sources = s if sources is None else sources  # sources fixed by caller
    out, excluded_floor = {q: [] for q in POSITIONS}, 0
    by_pos = {}
    for pid, r in week_rows.items():
        if r.get("actual") is None:
            continue
        if sources and not sources <= set(r.get("proj") or {}):
            continue
        if r.get("pos") in POSITIONS:
            by_pos.setdefault(r["pos"], []).append(pid)
    for q, pids in by_pos.items():
        for a, b in combinations(sorted(pids), 2):
            da = week_rows[a]["actual"] - week_rows[b]["actual"]
            if abs(da) < DECISION_FLOOR:
                excluded_floor += 1
                continue
            out[q].append((a, b))
    return out, excluded_floor


def _pair_score(pa, pb, aa, ab):
    if pa == pb:
        return 0.5
    return 1.0 if (pa - pb) * (aa - ab) > 0 else 0.0


def pairwise_accuracy(weeks, sources):
    """{source: {pos: {"accuracy", "n_pairs", "status"}}} pooled over weeks.

    `weeks`: [{pid: {"pos", "actual", "proj": {source: float}}}] — one dict
    per graded week. Every pid entering a pair must carry every source in
    `sources` (the shared-population clause); rows missing one are
    dropped from pairing entirely (never scored asymmetrically).
    """
    tally = {s: {q: [0.0, 0] for q in POSITIONS} for s in sources}
    excluded = 0
    for week_rows in weeks:
        # enforce the shared population across the REQUESTED sources
        shared = {pid: r for pid, r in week_rows.items()
                  if set(sources) <= set(r.get("proj") or {})}
        pairs, exc = qualifying_pairs(shared)
        excluded += exc
        for q, plist in pairs.items():
            for a, b in plist:
                aa, ab = shared[a]["actual"], shared[b]["actual"]
                for s in sources:
                    sc = _pair_score(shared[a]["proj"][s], shared[b]["proj"][s],
                                     aa, ab)
                    cell = tally[s][q]
                    cell[0] += sc
                    cell[1] += 1
    out = {"_excluded_below_floor": excluded, "sources": {}}
    for s in sources:
        out["sources"][s] = {}
        for q in POSITIONS:
            hits, n = tally[s][q]
            if n >= MIN_PAIRS:
                out["sources"][s][q] = {"accuracy": round(hits / n, 4),
                                        "n_pairs": n, "status": "measured"}
            else:
                out["sources"][s][q] = {"accuracy": None, "n_pairs": n,
                                        "status": "unmeasurable"}
    return out


def meets_cory_bar(acc, ours, providers):
    """The bar as a computation. Returns the full working, not just a bool."""
    per_pos, beaten = {}, 0
    for q in POSITIONS:
        mine = acc["sources"][ours][q]
        if mine["status"] != "measured":
            per_pos[q] = {"status": "unmeasurable"}
            continue
        beats = {}
        for pr in providers:
            th = acc["sources"][pr][q]
            beats[pr] = (th["status"] == "measured"
                         and mine["accuracy"] > th["accuracy"])
        both = all(beats.values()) and len(beats) == len(providers)
        per_pos[q] = {"ours": mine["accuracy"],
                      **{pr: acc["sources"][pr][q]["accuracy"]
                         for pr in providers},
                      "beats_both": both}
        if both:
            beaten += 1
    return {"per_position": per_pos, "positions_beating_both": beaten,
            "bar_met": beaten >= 3,
            "bar": "beat BOTH providers at >=3 of 4 positions "
                   "(WEEKLY-LAB-FREEZE-2026.md §2)"}
