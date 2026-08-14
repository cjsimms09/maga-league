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

⚠ THE CRITERION IS FORMAT MATCH, NOT SOURCE COUNT (Cory, 2026-08-14), AND THE
BOARD'S OWN FORMAT SAYS NO SOURCE MATCHES. Our league scores `pass_td = 6.0`
against the market standard of 4.0 — measured, and it is the only one of our 44
rules that differs. FFC `half-ppr`, FantasyPros `HALF` and MFL are all 4-point
markets, so there is no format-matched ADP source to be had and NO AMOUNT OF
AGGREGATION FIXES IT: averaging ten more 4-point sources buys a more confident
estimate of a market that is not ours. Aggregation buys PRECISION; the error here
is BIAS.

WHAT ADP IS ACTUALLY FOR HERE, VERIFIED RATHER THAN ASSUMED — and it decides the
whole question. `adp` and `adp_sd` reach exactly one consumer:
`survival.js`'s `normalCdf(currentPick, adp, adp_sd)`. The only other path into
VALUE is `projections._rank_fallback`, and it is UNREACHABLE: 1,240 of 1,841 rows
carry `proj_baseline: 0.0` rather than None, so `base is None` is never true and
the ADP-decay cannot fire. ADP touches no projection, no VORP and no ranking.

SO ADP IS A PREDICTION ABOUT OUR ROOM, NOT A STATEMENT ABOUT VALUE. "Will he be
there at pick 48" is a question about what ten managers will do — and that flips
the criterion. We do not want the ADP that best reflects OUR scoring. We want the
ADP that best predicts OUR DRAFTERS. Our managers are not running the league's 44
rules in their heads; they are looking at mainstream rankings, which are
4-point-passing-TD standard. **A 4-point-TD market is plausibly a BETTER predictor
of this room than a format-corrected one would be.**

⚠ SO ADP MUST NEVER BE "CORRECTED" TOWARD OUR SCORING, and the gap between ADP and
VORP is not an error to be removed — IT IS THE EDGE. TE +25 means the market lets
tight ends fall past what our rules say they are worth. Correcting ADP to our
format would erase exactly the signal that finds them. The two numbers answer
different questions and reconciling them destroys both.

THE SOURCE CRITERION FOLLOWS: closest to how OUR ROOM DRAFTS, which format match
is a proxy for — a ten-team half-PPR market of real human drafts behaves more like
our room than a twelve-team superflex pool. That argues for ONE closest source as
the survival anchor and against a blend: averaging unlike markets buys a more
confident prediction of the wrong room.

SO THIS EARNS ITS KEEP ON TWO THINGS AND NOT ON A THIRD:

  DISPERSION      MFL is the only source publishing per-player min/max/selPct, and
                  the board's `adp_sd` is a clamp on two values across 94.8% of
                  rows. More observations genuinely improve a spread — BUT NOT
                  UNIFORMLY BY POSITION. A superflex pool's QB spread is a spread
                  about a different decision; its RB/WR/TE spreads are not. So
                  dispersion is transferable where the format does not bite and
                  must be treated per position, exactly as the mean is.
  DEEP COVERAGE   MFL crosswalks 433 players against FantasyPros's 337. The deep
                  board is where a single source simply stops.
  NOT THE MEAN    the survival anchor stays the single closest-format source. A
                  blended pick number is a more confident wrong answer.

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
        # ⚠ THE FRACTION IS COMPARABLE ACROSS SOURCES AND NOT ACROSS POSITIONS.
        #
        # `consensus_order` fixed a real defect by making the scale the SHARED
        # players every source prices, which is what lets two sources of different
        # depth be compared for ONE player. It does not make two POSITIONS
        # comparable: on the live 2026-08-14 archive the intersection is 25
        # quarterbacks and 76 receivers, so one rank step is 0.040 at QB and 0.013
        # at WR, and a fraction sorted across positions is ordered partly by how
        # many players each position has.
        #
        # MEASURED, NOT SUSPECTED: by fraction that table reads QB 0.083 against WR
        # 0.040 and looks like the sources argue about quarterbacks. In rank steps
        # it is WR 3.0, QB 2.1, RB 2.0, TE 0.0 — and the loudest single row moves
        # from Dallas Goedert to Alec Pierce, ten receivers apart. I nearly routed
        # the first reading; it was the denominator.
        #
        # BOTH TRAVEL. The fraction answers "how far apart as a share of this
        # position's board"; `rank_steps` answers "how many players apart", and the
        # second is the one a cross-position table may be sorted on.
        shared = sum(1 for r in rows if r.get("ranking_sources", 0) > 1)
        for r in rows[:int(top_n)]:
            if r.get("disagreement") is not None and r["ranking_sources"] > 1:
                out.append({"position": pos, "player_id": r["player_id"],
                            "consensus_rank": r["rank"],
                            "disagreement": r["disagreement"],
                            # (shared - 1), NOT `shared`: the fraction spans the
                            # GAPS between the shared players, so n of them give
                            # n-1 steps. My first version multiplied by n and the
                            # fixture caught it — a two-place swap came out 2.67
                            # steps at a four-deep position and 2.11 at a
                            # twenty-deep one, when both are exactly 2.
                            "rank_steps": r["disagreement"] * max(shared - 1, 1),
                            "shared_at_position": shared,
                            "ranks": r["ranks"]})
    out.sort(key=lambda r: -r["rank_steps"])
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


#: Below this many sources on one day there is no consensus to compute. Not a
#: tunable: two is the smallest number that can disagree, and one source wearing
#: the word "consensus" is the failure this module's docstring opens with.
MIN_SOURCES = 2


def latest_consensus(series: list, positions: dict, year, weights: dict = None) -> dict:
    """The most recent day TWO SOURCES BOTH REACHED, aggregated. -> the report.

    THIS FUNCTION EXISTS BECAUSE THE AGGREGATE HAD NO CALLER. `consensus_order`
    was built, tested thirteen ways and wired to nothing — found by sweeping this
    lane for functions with no production consumer, which is the same rule-14 gap
    that left `marginal_adp` inert this morning. Correct code connected to nothing
    looks exactly like correct code that is working, and this repo has now paid
    for that four times.

    ⚠ CHOOSING THE DAY IS NOT A DETAIL, and getting it wrong fails in the
    reassuring direction. The per-source archive holds one row per (source, day);
    both sources are captured in one run but `apply_results` records them
    INDEPENDENTLY, so a morning where FantasyPros 404s leaves an FFC-only day at
    the end of the archive. `consensus_order` will aggregate that single source
    quite happily — every row comes back `ranking_sources: 1` and `disagreements`
    returns an EMPTY LIST. An empty disagreement table reads as "the sources
    agree". It would actually mean one of them was gone.

    So the day is chosen as the latest with at least MIN_SOURCES, and a run with
    no such day is UNMEASURED with the lonely days counted rather than silently
    aggregating whatever was there.

    AND `coverage` TRAVELS WITH IT for the same reason: beside a corroborated
    count, an empty disagreement list is unambiguous — 4 of 4 corroborated and
    nothing to report means they agree, 0 of 4 means nothing was compared.
    """
    by_day: dict = {}
    for s in (series or []):
        if str(s.get("year")) != str(year):
            continue
        rows = {k: v for k, v in (s.get("rows") or {}).items() if v is not None}
        if not rows:
            continue
        by_day.setdefault(str(s.get("observed_at")), {})[str(s.get("source"))] = rows

    usable = sorted(d for d, srcs in by_day.items() if len(srcs) >= MIN_SOURCES)
    if not usable:
        lonely = len(by_day)
        return {"status": "unmeasured", "day": None, "sources": [],
                "single_source_days": lonely, "order": {}, "coverage": {},
                "disagreements": [],
                "note": "no day in %s carries %d sources — %d day(s) hold one "
                        "source only. Aggregating one source would return a full "
                        "consensus order with an EMPTY disagreement table, which "
                        "reads as the sources agreeing rather than as one of them "
                        "being absent." % (year, MIN_SOURCES, lonely)}

    day = usable[-1]
    srcs = by_day[day]
    order = consensus_order(srcs, positions, weights=weights)
    return {"status": "measured", "day": day, "sources": sorted(srcs),
            "single_source_days": len(by_day) - len(usable),
            "order": order,
            "coverage": coverage(order),
            "disagreements": disagreements(order),
            "note": None}


def in_draft_range(rows: list, board_adp: dict, limit: int = 150):
    """Keep only the arguments about players our draft can actually reach.

    -> (kept, dropped_count).

    FOUND BY REHEARSING THE REPORT, not by reasoning about it. Against the real
    board the disagreement table led with TE39 and TE40 — a 10x15 draft takes
    about a dozen tight ends, so the two players the sources argued about hardest
    were two nobody can draft. `disagreements` is right to be general: it ranks by
    how far apart the sources are, and depth is not its business.

    ⚠ THE BOARD PRICE IS USED ONLY TO ASK "CAN HE BE DRAFTED", NEVER TO ORDER
    ANYTHING, and that distinction is this whole module. Pick numbers are
    contaminated across formats and within-position order is not — so a price may
    gate a row's RELEVANCE and must never touch its RANK. Applying it to the
    REPORT rather than to the aggregate is what keeps that true: the consensus
    order is unchanged and only the printed table is scoped.

    AN UNPRICED PLAYER IS DROPPED, NOT KEPT. "The board has no price for him" is
    not evidence that he is reachable, and treating absence as inclusion puts
    every deep unpriced player back at the top of the table — the same report with
    an extra step. The count says how many went, so this is a scope, not a
    silence.
    """
    kept, dropped = [], 0
    for r in rows or []:
        a = (board_adp or {}).get(str(r.get("player_id")))
        try:
            reachable = a is not None and float(a) <= float(limit)
        except (TypeError, ValueError):
            reachable = False
        if reachable:
            kept.append(r)
        else:
            dropped += 1
    return kept, dropped
