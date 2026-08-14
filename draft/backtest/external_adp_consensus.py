#!/usr/bin/env python3
# TERRITORY: C
"""MULTI-SOURCE ADP — aggregated in the ONE space where the sources are comparable.

Cory: "We need an aggregate!! The more data aggregated the better the info. But
needs to be done methodically and accurately."

THE BOARD IS EFFECTIVELY ONE SOURCE TODAY. Measured on the shipped artifact:
FantasyPros prices 334 rows, FFC contributes 4 as gap-fill, and 1,503 sit on
Sleeper's popularity rank. MFL is captured daily into `external_adp_series.json`
and reaches the board not at all.

⚠ AND THE OBVIOUS AGGREGATE — average the ADPs — IS WRONG. Measured, MFL against
FantasyPros on the 314 players both price, restricted to the draftable board:

    QB  median MFL/FP ratio 0.494     spread 0.13 .. 1.02
    RB                      1.388            0.87 .. 5.17
    WR                      1.189            0.75 .. 1.86
    TE                      0.993            0.66 .. 1.27

That is ONE mechanism, not four. MFL's `PERIOD=DRAFT IS_PPR=1 FCOUNT=12` pool
includes SUPERFLEX leagues; quarterbacks go roughly twice as early there, and
everyone else is displaced later to make room. Our league is half-PPR, ten teams,
single-QB. A mean over those pick numbers would price quarterbacks off a format we
do not play, and no scalar correction repairs it — the QB spread runs 0.13 to 1.02
and varies with rank.

THE MEASUREMENT THAT DECIDES THE DESIGN. The same two sources, compared on ORDER
WITHIN A POSITION instead of on pick number:

    QB rho 0.980   RB rho 0.974   WR rho 0.960   TE rho 0.939   (draftable only)

The format changes WHERE A POSITION SITS IN THE DRAFT. It barely touches WHO IS
BETTER THAN WHOM INSIDE that position. So within-position order is the space where
these sources genuinely agree, and it is the only space in which averaging them is
defensible.

HOW THIS AGGREGATES, therefore:

  1. each source -> WITHIN-POSITION RANK (RB1, RB2, ...), which is format-robust
  2. ranks combined across sources, weighted, into a consensus order per position
  3. the consensus order mapped BACK onto our league's pick scale using ONLY the
     FORMAT-MATCHED anchor, because deciding when the first TE goes is exactly the
     judgement the contaminated source cannot make

WHAT THIS DELIBERATELY DOES NOT DO. It does not average pick numbers across
formats; it does not let a contaminated source move a position's cross-over; and
it does not turn one source into a consensus — a player priced by a single source
is reported as `sources: 1` and is NOT a consensus, however confident the number
looks.

NOTHING HERE IS WIRED INTO THE BOARD. `draft/adp.py` and `draft/build.py` are A's,
and choosing what prices the board is A's call. This produces the aggregate and
the disagreement report; the decision to consume it is routed, not taken.
"""
from __future__ import annotations

from statistics import median

#: Positions this league can roster and therefore the only ones worth ranking.
#: K and DEF are excluded because no source publishes a usable draft-order signal
#: for them and both go in the last two rounds by convention rather than by market.
POSITIONS = ("QB", "RB", "WR", "TE")

#: A source whose pick numbers are NOT in our league's format may still contribute
#: ORDER. This records which is which, so the distinction cannot be lost by a
#: later caller passing the wrong thing.
#:
#:   format_matched=True   the pick numbers are in OUR format at OUR league size,
#:                         so they may set where a position lands in the draft
#:   format_matched=False  order only. Its pick numbers are never averaged.
COMPARABLE = "format_matched"


def within_position_ranks(rows: dict, positions: dict) -> dict:
    """{player_id: adp} -> {position: [player_id, ...]} in ascending ADP order.

    THE FORMAT-ROBUST PROJECTION. A superflex pool disagrees violently about when
    a quarterback goes and barely at all about which quarterback is better; this
    keeps the second and discards the first.

    A player with no position is dropped rather than bucketed as "unknown" — an
    unknown-position bucket is not a position and ranking inside it means nothing.
    """
    by = {}
    for pid, adp in (rows or {}).items():
        pos = (positions or {}).get(str(pid))
        if pos not in POSITIONS or adp is None:
            continue
        by.setdefault(pos, []).append((float(adp), str(pid)))
    return {pos: [pid for _, pid in sorted(v)] for pos, v in by.items()}


def _scale_position(i: int, ruler: list):
    """Where index `i` sits among the SHARED players, as a fraction in [0, 1].

    THE COMMON SCALE, AND IT IS PIECEWISE FOR A REASON. `ruler` holds the indices
    the shared players occupy in THIS source's own order. The fraction returned is
    a player's position among THOSE — k of K — which is by construction the same
    quantity in every source, because the shared set is the same set.

    ⚠ INTERPOLATING BETWEEN THE ENDPOINTS ALONE WOULD NOT BE ENOUGH. That assumes
    the shared players are evenly spread through each source's list; if one source
    clusters them at the top and another spreads them out, the middle is mapped
    wrongly and the error looks like disagreement. So this brackets `i` between the
    two shared players either side of it and interpolates between THEIR ordinals.

    Outside the shared range the value is projected past 0 or 1 rather than
    clamped, because clamping piles every deep single-source row onto one value
    and destroys the extra order MFL is being included for.

    None when there is no scale to speak of: fewer than two shared players means
    nothing to measure against, and inventing a fraction there is exactly the
    derived-from-a-different-thing error this replaced.
    """
    K = len(ruler)
    if K < 2:
        return None
    if i <= ruler[0]:
        # Before the first shared player. Extrapolate on the first segment's slope.
        span = ruler[1] - ruler[0]
        return round((i - ruler[0]) / span / (K - 1), 6) if span > 0 else 0.0
    if i >= ruler[-1]:
        span = ruler[-1] - ruler[-2]
        return round(1.0 + (i - ruler[-1]) / span / (K - 1), 6) if span > 0 else 1.0
    # BRACKET: find the shared players either side and interpolate their ordinals.
    lo_k = 0
    for k in range(K - 1):
        if ruler[k] <= i <= ruler[k + 1]:
            lo_k = k
            break
    a, b = ruler[lo_k], ruler[lo_k + 1]
    within = 0.0 if b == a else (i - a) / (b - a)
    return round((lo_k + within) / (K - 1), 6)


def consensus_order(sources: dict, positions: dict, weights: dict = None) -> dict:
    """Combine several sources' within-position orders into one.

    `sources` is {name: {player_id: adp}}. Returns
    {position: [{player_id, rank, sources, ranks, disagreement}, ...]}.

    THE STATISTIC IS THE MEDIAN OF RANKS, not the mean, and that is deliberate.
    Three sources where two agree at RB4 and one says RB19 should return RB4 and
    report the disagreement — a mean returns RB9, a rank no source holds and no
    reader can defend. The outlier is the interesting part and it is preserved in
    `ranks` rather than blended away.

    `sources` COUNTS, AND ONE IS NOT A CONSENSUS. A player nobody else priced is
    carried with `sources: 1` so a consumer can require corroboration. Dropping
    him would lose real coverage; hiding the count would let one source's opinion
    wear the word "consensus".
    """
    weights = weights or {}
    ranked = {name: within_position_ranks(rows, positions)
              for name, rows in (sources or {}).items()}

    out = {}
    for pos in POSITIONS:
        # ⚠ THE DENOMINATOR MUST BE THE SAME POPULATION IN EVERY SOURCE, and my
        # first version's was not. Ranking each player as a fraction of HIS OWN
        # SOURCE'S depth compares two different quantities: FantasyPros lists 44
        # tight ends (a curated consensus) and MFL lists 69 (everyone drafted in
        # 125 drafts). A player both rank #30 came out at 0.674 and 0.426 — an
        # apparent disagreement of 0.248 produced entirely by list length, growing
        # with rank, and systematically making the DEEPER source look optimistic
        # about everybody.
        #
        # So the scale is the SHARED PLAYERS — the intersection every source
        # prices. Depths are then equal by construction and the fractions are
        # derived from the same thing. A player outside the intersection is placed
        # by INTERPOLATION against his own source's shared ranks, which is a
        # monotone map onto that same scale rather than a second one.
        #
        # MY TEST FOR THIS PASSED FOR THE WRONG REASON. Its fixture put the player
        # LAST in both lists, and fractions always agree at the endpoints — 1.0
        # either way — while diverging maximally in the middle. It tested the two
        # points where the bug is invisible.
        orders = {name: (by_pos.get(pos) or []) for name, by_pos in ranked.items()}
        orders = {k: v for k, v in orders.items() if v}
        if not orders:
            out[pos] = []
            continue
        shared = set.intersection(*(set(v) for v in orders.values())) if len(orders) > 1 \
            else set(next(iter(orders.values())))

        per_player = {}
        for name, order in orders.items():
            idx = {pid: i for i, pid in enumerate(order)}
            # The shared players, in THIS source's order. This is the common ruler.
            ruler = sorted((idx[p] for p in shared if p in idx))
            for i, pid in enumerate(order):
                per_player.setdefault(pid, {})[name] = (
                    _scale_position(i, ruler), i + 1, len(order))
        rows = []
        for pid, seen in per_player.items():
            fracs, w = [], []
            for name, (frac, r, n) in seen.items():
                # ⚠ A SOURCE THAT LISTS ONE PLAYER AT A POSITION CANNOT RANK HIM.
                # One item has no position within a list. It still PRICED him, so
                # it counts in `sources`; it contributes no ORDER, so it is
                # excluded from `ranking_sources`, from the consensus and from the
                # disagreement. My first version counted it in `sources` alone,
                # which reported two-source corroboration for a player exactly one
                # source had ranked.
                if frac is not None:
                    fracs.append(frac)
                    w.append(float(weights.get(name, 1.0)))
            rows.append({
                "player_id": pid,
                "consensus": _weighted_median(fracs, w) if fracs else None,
                "sources": len(seen),
                "ranking_sources": len(fracs),
                "ranks": {k: v[1] for k, v in sorted(seen.items())},
                "depths": {k: v[2] for k, v in sorted(seen.items())},
                "disagreement": (round(max(fracs) - min(fracs), 4)
                                 if len(fracs) > 1 else None),
            })
        # UNRANKABLE ROWS SORT LAST AND KEEP THEIR PLACE. Dropping them would lose
        # a player somebody prices; giving them a consensus of 0.0 would put a row
        # nobody ranked at the top of the board.
        rows.sort(key=lambda r: (r["consensus"] is None,
                                 r["consensus"] if r["consensus"] is not None else 0.0,
                                 r["player_id"]))
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        out[pos] = rows
    return out


def _weighted_median(values, weights):
    """Median that respects weights, with the unweighted case EXACT.

    ⚠ THE EVEN CASE IS THE COMMON CASE AND MY FIRST VERSION GOT IT WRONG. It
    walked the sorted values and returned the first whose cumulative weight
    reached half — which for two equal-weight sources returns the LOWER of the
    two. `_weighted_median([0.0, 1.0])` gave 0.0, so a player ranked first by one
    source and third by the other came out at the very top of the board. Every
    two-source consensus was biased optimistic, and two sources is what we have.

    With equal weights this is now `statistics.median` — which averages the middle
    pair — and that is not a retreat from "the median, not the mean": for exactly
    two observations the median IS their mean, and the distinction this module
    cares about only exists from three sources up, where an outlier can be
    outvoted instead of averaged in.
    """
    if not values:
        return None
    ws = list(weights) or [1.0] * len(values)
    if len(set(ws)) <= 1:
        return round(median(values), 6)
    pairs = sorted(zip(values, ws))
    total = sum(w for _, w in pairs)
    if total <= 0:
        return round(median(values), 6)
    acc = 0.0
    for i, (v, w) in enumerate(pairs):
        acc += w
        if acc > total / 2.0:
            return round(v, 6)
        if acc == total / 2.0:
            # EXACTLY HALF — the crossing lands between two observations, which is
            # the even case again. Average them rather than silently taking the
            # lower one.
            nxt = pairs[i + 1][0] if i + 1 < len(pairs) else v
            return round((v + nxt) / 2.0, 6)
    return round(pairs[-1][0], 6)


def to_pick_scale(order: dict, anchor: dict, positions: dict) -> dict:
    """Map the consensus ORDER back onto OUR league's pick numbers.

    `anchor` is {player_id: adp} from a FORMAT-MATCHED source only — FFC at
    `half-ppr?teams=10`, or FantasyPros at HALF. This is the step the contaminated
    source may not influence: deciding when the first tight end goes is precisely
    the judgement a superflex pool cannot make, and it is where a naive aggregate
    does its damage.

    THE MECHANISM: within each position, take the anchor's own ADPs, sort them,
    and re-assign them in CONSENSUS order. The set of pick numbers the position
    occupies is exactly what the format-matched source says it is — only WHO
    occupies which one is decided by the aggregate.

    A position the anchor does not price at all is returned untouched with
    `status: "unanchored"`. Inventing a pick scale from a contaminated source is
    the failure this whole module exists to avoid, and doing it silently on one
    position would be worse than doing it openly on all four.
    """
    out = {}
    for pos, rows in (order or {}).items():
        slots = sorted(float(a) for pid, a in (anchor or {}).items()
                       if (positions or {}).get(str(pid)) == pos and a is not None)
        if not slots:
            out[pos] = {"status": "unanchored", "rows": rows,
                        "note": "the format-matched anchor prices nobody at this "
                                "position, so there is no scale to map onto"}
            continue
        placed = []
        for i, r in enumerate(rows):
            if i < len(slots):
                placed.append(dict(r, adp=slots[i], adp_basis="anchor slot %d" % (i + 1)))
            else:
                # DEEPER THAN THE ANCHOR PRICES. Extrapolating past the last real
                # observation would manufacture a number; the row keeps its
                # consensus order and says it has no pick.
                placed.append(dict(r, adp=None, adp_basis="beyond the anchor's depth"))
        out[pos] = {"status": "anchored", "rows": placed,
                    "anchor_depth": len(slots)}
    return out


def disagreements(order: dict, top_n: int = 40) -> list:
    """Where the sources disagree most, inside the part of the board that matters.

    THE POINT OF AN AGGREGATE IS NOT A SMOOTHER NUMBER. It is knowing which
    players the market is arguing about — a player two sources rank 30 places
    apart is a different decision from one they agree on, and the mean hides
    exactly that.
    """
    out = []
    for pos, rows in (order or {}).items():
        for r in rows[:int(top_n)]:
            if r.get("disagreement") is not None and r["ranking_sources"] > 1:
                out.append({"position": pos, "player_id": r["player_id"],
                            "consensus_rank": r["rank"],
                            "disagreement": r["disagreement"],
                            "ranks": r["ranks"]})
    out.sort(key=lambda r: -r["disagreement"])
    return out


def coverage(order: dict) -> dict:
    """How much of this aggregate is actually corroborated.

    `sources: 1` is not a consensus, and a report that does not separate the two
    lets single-source coverage inflate the apparent evidence — the same defect as
    a count that mixes measured and fitted values.
    """
    out = {}
    for pos, rows in (order or {}).items():
        # CORROBORATED MEANS RANKED BY MORE THAN ONE SOURCE, not priced by more
        # than one. A source that lists a single player at a position priced him
        # and ranked nothing.
        multi = [r for r in rows if r["ranking_sources"] > 1]
        out[pos] = {"players": len(rows), "corroborated": len(multi),
                    "single_source": len(rows) - len(multi),
                    "median_disagreement": (
                        round(median([r["disagreement"] for r in multi]), 4)
                        if multi else None)}
    return out
