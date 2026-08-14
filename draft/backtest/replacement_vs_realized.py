# TERRITORY: C
"""DOES THE FLEX SPLIT THAT SETS REPLACEMENT MATCH WHAT ACTUALLY HAPPENED?

⚠ THIS DECIDES NOTHING AND CHANGES NOTHING. `vorp.replacement_levels` is A's and
the modelling call is A's. This is a MEASUREMENT that re-runs the same greedy
rule against REALIZED points instead of projections and reports the two answers
side by side. It emits no constant anything consumes.

WHY IT IS A MODULE AND NOT A ROUTED NUMBER. Measured 2026-08-14 the board split
the ten flex slots RB 21 / WR 29 while every realized season said RB 22-24 — but
the whole finding rests on where a TIER CLIFF happens to fall, and the board
rebuilds every morning. RB21 projected 189.02 and RB22 projected 169.82, a 19.2
point drop, so replacement was standing one slot from a discontinuity: the FIRST
flex slot moved was worth 16 draft slots to every RB and the next two were worth
1 and 5. A finding that sensitive to a projection that changes nightly is not a
fact to write down once, it is a thing to re-measure.

THE COMPARISON IS THE SAME RULE ON BOTH SIDES, which is the only reason the two
answers are comparable. `vorp.replacement_levels` walks the flex slots greedily,
handing each to whichever eligible position has the best next-man-up value.
`greedy_split` below does exactly that, and the only thing that changes between
the two calls is whether "value" means projected or realized points.

WHAT IT CANNOT SAY: which answer is RIGHT. A rule that disagrees with outcomes
may be wrong, or may be correctly refusing to chase noise in a 3-season sample.
Both readings are recorded on the result and neither is resolved here.
"""
from __future__ import annotations

import collections
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"

#: Positions a FLEX slot can absorb. Mirrors `config_schema.FLEX_ELIGIBILITY`
#: rather than re-deciding it — a second opinion about which positions are flex
#: eligible is exactly the two-definitions-that-drift shape.
FLEX_POSITIONS = ("RB", "WR", "TE")

#: ⚠ WHAT THIS AUTHORIZES, as a literal field on every result. Same discipline as
#: `sd_stability`: the instrument states its own standing so a reader who gets
#: the dict gets the constraint with it.
AUTHORIZES = ("nothing. This compares two answers from one rule and reports "
              "both. It does not set a replacement level, does not alter vorp, "
              "and does not license a change to draft/vorp.py — which is A's "
              "file. What it determines is whether the question is still live "
              "on today's board, not what to do about it.")


def season_totals(year, path=None) -> dict:
    """{player_id: realized season points} from the weekly store, our scoring."""
    p = Path(path) if path else (HERE / ("nflverse_weekly_points_%s.json" % year))
    doc = json.loads(p.read_text())
    tot = collections.defaultdict(float)
    for wk in (doc.get("weeks") or []):
        for pid, pts in (wk.get("points") or {}).items():
            # ⚠ PARSE BEFORE TOUCHING THE DICT, AND THAT ORDER IS THE WHOLE
            # POINT. Written as `tot[str(pid)] += float(pts)` this reads as a
            # skip, and it is not: Python evaluates `tot[str(pid)]` FIRST, which
            # creates the defaultdict entry at 0.0, and only then raises on the
            # bad value. So a player whose every week is unparseable was INVENTED
            # AT 0.0 — bottom of his position, dragging the replacement line down
            # — by the very code whose comment said he would not be.
            #
            # Found by strengthening a test the mutation gate reported SURVIVED:
            # the original assertion only checked a player who ALSO had a good
            # week, and for him the two versions are identical.
            try:
                v = float(pts)
            except (TypeError, ValueError):
                continue
            tot[str(pid)] += v
    return dict(tot)


def by_position(values: dict, positions: dict, wanted=FLEX_POSITIONS) -> dict:
    """{position: [value, ...] descending} for the flex-eligible positions."""
    out = {k: [] for k in wanted}
    for pid, v in (values or {}).items():
        pos = (positions or {}).get(str(pid))
        if pos in out:
            out[pos].append(float(v))
    for k in out:
        out[k].sort(reverse=True)
    return out


def greedy_split(ranked: dict, dedicated: dict, flex_slots: int) -> dict:
    """The same allocation `vorp.replacement_levels` performs, on any values.

    Each flex slot goes to whichever eligible position has the best NEXT-MAN-UP
    value. Deterministic, and it stops early if a position runs out of players
    rather than indexing past the end.
    """
    counts = dict(dedicated)
    for _ in range(int(flex_slots)):
        best, best_v = None, None
        for pos in sorted(ranked):
            i = counts.get(pos, 0)
            pool = ranked.get(pos) or []
            if i < len(pool) and (best_v is None or pool[i] > best_v):
                best, best_v = pos, pool[i]
        if best is None:
            break
        counts[best] = counts.get(best, 0) + 1
    return counts


def compare(board_ranked: dict, realized_by_year: dict, dedicated: dict,
            flex_slots: int) -> dict:
    """Board's split (projections) against each season's split (realized).

    ⚠ `agrees` IS PER-SEASON AND THE SUMMARY IS "INSIDE THE RANGE", not "equal to
    the mean". Three seasons is a small sample and averaging them into a single
    target implies a precision the sample does not carry; asking whether the
    board's answer falls inside the observed spread is the weaker claim the data
    actually supports.
    """
    board = greedy_split(board_ranked, dedicated, flex_slots)
    per_year, flex_to = {}, {}
    for year in sorted(realized_by_year):
        got = greedy_split(realized_by_year[year], dedicated, flex_slots)
        per_year[str(year)] = got
        for pos in got:
            flex_to.setdefault(pos, []).append(got[pos] - dedicated.get(pos, 0))
    board_flex = {p: board.get(p, 0) - dedicated.get(p, 0) for p in board}
    outside = {}
    for pos, seen in flex_to.items():
        lo, hi = min(seen), max(seen)
        got = board_flex.get(pos, 0)
        if got < lo or got > hi:
            outside[pos] = {"board": got, "realized_range": [lo, hi]}
    if not per_year:
        return {"status": "unmeasured", "authorizes": AUTHORIZES,
                "note": "no realized season was supplied, so the board's split "
                        "has nothing to be compared against — which is not the "
                        "same as the split being right."}
    return {
        "status": "measured",
        "authorizes": AUTHORIZES,
        "board_split": board, "board_flex": board_flex,
        "realized_split": per_year,
        "realized_flex_range": {p: [min(v), max(v)] for p, v in flex_to.items()},
        "outside_realized_range": outside,
        "seasons": len(per_year),
        "note": ("the board's flex split is INSIDE the range every realized "
                 "season produced" if not outside else
                 "the board's flex split is OUTSIDE the realized range for %s — "
                 "which says the rule and the outcomes disagree, NOT which of "
                 "them is right. A rule may correctly refuse to chase noise in "
                 "%d season(s)." % (", ".join(sorted(outside)), len(per_year))),
    }


def cliff(pool: list, at: int, window: int = 1) -> dict:
    """How far the value falls just past a replacement rank.

    ⚠ THE SENSITIVITY IS THE FINDING, NOT THE SPLIT. Measured 2026-08-14 the
    board's RB replacement sat at rank 21 projecting 189.02 with rank 22 at
    169.82 — a 19.2 point drop, so ONE flex slot either side moved every RB
    about sixteen draft places. A split that disagrees with outcomes matters
    much less when the neighbourhood is flat, and a split that AGREES with them
    can still be fragile if it is perched on a cliff. Reporting the disagreement
    without this reports half the risk.
    """
    if not pool or at < 1 or at > len(pool):
        return {"status": "unmeasured",
                "note": "rank %s is outside a pool of %d, so no drop can be "
                        "measured there." % (at, len(pool or []))}
    here = float(pool[at - 1])
    nxt = float(pool[at - 1 + window]) if at - 1 + window < len(pool) else None
    if nxt is None:
        return {"status": "unmeasured", "at": at, "value": round(here, 2),
                "note": "rank %d is the last player in the pool, so there is no "
                        "next man to fall to." % at}
    typical = [float(pool[i]) - float(pool[i + 1])
               for i in range(max(0, at - 6), min(len(pool) - 1, at + 4))]
    med = sorted(typical)[len(typical) // 2] if typical else 0.0
    drop = here - nxt
    return {"status": "measured", "at": at, "value": round(here, 2),
            "next": round(nxt, 2), "drop": round(drop, 2),
            "typical_drop_nearby": round(med, 2),
            # A CLIFF IS RELATIVE TO ITS NEIGHBOURHOOD, not an absolute number of
            # points. Ten points is nothing at the top of a board and enormous at
            # the replacement line.
            "cliff_ratio": None if med <= 0 else round(drop / med, 2),
            "note": "a drop of %.1f against a typical %.1f nearby" % (drop, med)}
