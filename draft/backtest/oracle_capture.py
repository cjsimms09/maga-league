# TERRITORY: C
"""ORACLE CAPTURE FRACTION — THE FROZEN METHOD, v1 (2026-08-12).

ONE NUMBER PER SEASON: of the value that was on the board at Cory's picks, what
fraction did an arm capture, between a shape-blind floor and a perfect-hindsight
ceiling.

    capture = (arm - floor) / (ceiling - floor)

That normalisation is Cory's own framing: the gap to the oracle is the remaining
opportunity, the gap to the naive baseline is what the arm already earns. A raw
arm/oracle ratio would be dominated by the fact that ANY roster of fifteen NFL
players scores a lot, and would move for reasons that have nothing to do with
drafting well.
"""
import json
from collections import defaultdict

CORY_ROSTER = 1
METHOD_VERSION = "oracle-capture/v1 (2026-08-12)"


def load(path="draft/data/league_history.json"):
    return json.load(open(path))


def season(hist, year):
    for e in hist["seasons"]:
        if str(e.get("season")) == str(year):
            return e
    raise KeyError(year)


def realized_points(s) -> dict:
    """{player_id: season points}, summed from the league's OWN weekly scoring.

    NOT recomputed from stat lines: `players_points` is what this league actually
    awarded, under its own table, which is the quantity every arm is scored on.

    THE BIAS, NAMED: a player is only in `players_points` for weeks he was ON a
    roster. A drafted player cut in week 3 keeps only three weeks; a player nobody
    ever rostered has no points at all. That understates the ORACLE specifically,
    because the oracle is the arm most likely to want someone the room discarded.
    The direction is conservative — it can only shrink the measured opportunity.
    """
    tot = defaultdict(float)
    for _wk, rosters in (s.get("weeks") or {}).items():
        for r in rosters:
            for pid, pts in (r.get("players_points") or {}).items():
                tot[str(pid)] += float(pts or 0.0)
    return dict(tot)


def weekly_points(s) -> dict:
    """{week: {player_id: points}} — needed for a weekly-optimal starting lineup."""
    out = {}
    for wk, rosters in (s.get("weeks") or {}).items():
        w = {}
        for r in rosters:
            for pid, pts in (r.get("players_points") or {}).items():
                w[str(pid)] = float(pts or 0.0)
        out[str(wk)] = w
    return out


def all_picks(s) -> list:
    """Every pick across every draft that season, in board order.

    2023 ran TWO drafts — a 30-pick keeper draft and the 150-pick main. Both
    consume players, so both deplete the board and both must be walked.
    """
    picks = []
    for di, dr in enumerate(s.get("drafts") or []):
        for p in dr.get("picks") or []:
            q = dict(p)
            q["_draft"] = di
            picks.append(q)
    picks.sort(key=lambda p: (p["_draft"], p.get("pick_no") or 0))
    for i, p in enumerate(picks):
        p["_order"] = i
    return picks


def decision_slots(picks) -> list:
    """Cory's picks that were DECISIONS. A keeper is not a decision — scoring one
    as a choice credits or blames every arm for identical fixed rows."""
    return [p for p in picks
            if p.get("roster_id") == CORY_ROSTER and not p.get("is_keeper")]


def replay(picks, chooser) -> list:
    """Walk the board, substituting `chooser` at Cory's decision slots.

    THE COUNTERFACTUAL, STATED EXACTLY. Only Cory's picks change. Every other
    owner's pick is held at what it actually was, so:

      - a player another owner took is gone from the pick they really took him,
      - a player CORY really took is STILL AVAILABLE to a counterfactual arm at
        his later picks, because in this fiction he never took him.

    The boundary that fiction buys, and it is the whole validity claim: this
    measures WHAT WAS TAKEABLE FROM THE BOARD AS IT STOOD. It is NOT a claim
    about the season that would have followed — every pick after the first
    divergence would have moved the room, which is what closed Route 2.
    """
    taken, mine = set(), []
    for p in picks:
        pid = str(p.get("player_id"))
        if p.get("roster_id") == CORY_ROSTER:
            if p.get("is_keeper"):
                taken.add(pid)
                mine.append({"pick": p, "player_id": pid, "keeper": True})
                continue
            choice = chooser(p, taken)
            if choice is not None:
                taken.add(str(choice))
                mine.append({"pick": p, "player_id": str(choice), "keeper": False})
            continue
        taken.add(pid)
    return mine


def chooser_actual():
    def pick(p, taken):
        return str(p.get("player_id"))
    return pick


def chooser_oracle(points):
    """Perfect hindsight: the available player with the most realized points."""
    def pick(p, taken):
        best, bv = None, None
        for pid, v in points.items():
            if pid in taken:
                continue
            if bv is None or v > bv:
                best, bv = pid, v
        return best
    return pick


def chooser_next_off_board(picks):
    """NOT public ADP, and never labelled as such — none exists for these seasons.

    The room's own revealed ordering: the still-available player with the lowest
    actual pick number. Shape-blind, which is the property asked for, and
    contaminated by the room's reaction to Cory's real picks, which is why it is a
    weaker instrument than public ADP would have been.
    """
    order = {}
    for p in picks:
        pid = str(p.get("player_id"))
        order.setdefault(pid, p["_order"])

    def pick(p, taken):
        best, bo = None, None
        for pid, o in order.items():
            if pid in taken or o <= p["_order"]:
                continue
            if bo is None or o < bo:
                best, bo = pid, o
        return best
    return pick


# ── POSITION, INFERRED FROM THE DATA ITSELF ─────────────────────────────────
# There is no player reference for 2023-25 — the 2026 board covers current players
# only, and no historical one exists. But `starters` is ordered by
# `roster_positions`, so the slot a player occupied NAMES his position, from
# in-period data and nothing else.
#
# FLEX IS AMBIGUOUS BY CONSTRUCTION (RB/WR/TE), so a FLEX appearance never assigns
# a position — it only records that the player is flex-eligible. A player who ONLY
# ever started at FLEX keeps position None and is reported as unknown rather than
# guessed, because guessing here would silently fill a roster hole that is the
# whole point of the shape question.
FLEX_OK = {"RB", "WR", "TE"}


def positions(s) -> dict:
    """{player_id: 'QB'|'RB'|'WR'|'TE'|'K'|'DEF'|None}."""
    slots = s.get("roster_positions") or []
    named = [i for i, p in enumerate(slots) if p not in ("FLEX", "BN")]
    out = {}
    for _wk, rosters in (s.get("weeks") or {}).items():
        for r in rosters:
            st = r.get("starters") or []
            for i in named:
                if i < len(st) and st[i]:
                    out.setdefault(str(st[i]), slots[i])
    return out


def best_weekly_lineup(roster_ids, wk_points, slots, pos) -> float:
    """The best LEGAL lineup this roster could have started this week.

    Applied identically to every arm, so it is fair for comparison even though
    nobody sets a perfect lineup. Greedy by slot scarcity: the named slots first
    (a K can only fill K), FLEX last from whatever remains.
    """
    avail = {p for p in roster_ids if p in wk_points}
    total, used = 0.0, set()
    for slot in [x for x in slots if x not in ("FLEX", "BN")]:
        cands = [p for p in avail
                 if p not in used and pos.get(p) == slot]
        if not cands:
            continue
        best = max(cands, key=lambda p: wk_points.get(p, 0.0))
        used.add(best)
        total += wk_points.get(best, 0.0)
    for _ in [x for x in slots if x == "FLEX"]:
        cands = [p for p in avail
                 if p not in used and (pos.get(p) in FLEX_OK or pos.get(p) is None)]
        if not cands:
            continue
        best = max(cands, key=lambda p: wk_points.get(p, 0.0))
        used.add(best)
        total += wk_points.get(best, 0.0)
    return total


def starting_points(roster_ids, wkpts, slots, pos) -> float:
    return sum(best_weekly_lineup(roster_ids, w, slots, pos) for w in wkpts.values())


def shape(roster_ids, slots, pos) -> dict:
    """Counts by position, and WHICH STARTING SLOTS CANNOT BE FILLED.

    An unfilled slot is the finding, not a footnote: a roster that captured more
    total value while leaving a starting slot empty is worse, not better.
    """
    counts = defaultdict(int)
    for p in roster_ids:
        counts[pos.get(p) or "UNKNOWN"] += 1
    need = defaultdict(int)
    for sl in slots:
        if sl not in ("FLEX", "BN"):
            need[sl] += 1
    holes = {sl: n - counts.get(sl, 0) for sl, n in need.items() if counts.get(sl, 0) < n}
    flexable = sum(counts.get(p, 0) for p in FLEX_OK) + counts.get("UNKNOWN", 0)
    flex_need = sum(1 for sl in slots if sl == "FLEX")
    starters_used = sum(need.values())
    if flexable < sum(need.get(p, 0) for p in FLEX_OK) + flex_need:
        holes["FLEX"] = flex_need
    return {"counts": dict(counts), "holes": holes, "starting_slots": starters_used + flex_need}


def chooser_oracle_lineup(points, wkpts, slots, pos):
    """THE CEILING, CORRECTED — and the correction is the whole point.

    v0 of this took the available player with the most realized points. Measured on
    three seasons, that arm left TE, K and DEF unfilled EVERY year, and its
    starting-lineup total came in BELOW Cory's actual roster in 2024 (2164.6 vs
    2323.7) and within 2 points of the shape-blind floor.

    So it is not a ceiling. Normalising a capture fraction by it divides by nearly
    zero — 2024 read 7896%.

    A ceiling has to be the BEST ROSTER OBTAINABLE FROM THE BOARD, which means the
    pick that most improves the STARTING LINEUP, not the pick with the largest
    number attached. Greedy on marginal lineup value: still not the true optimum
    (that is a sequential assignment problem), so it is a LOWER BOUND ON THE
    CEILING — which keeps the capture fraction an over-estimate of skill rather
    than an under-estimate, and that is the direction that cannot flatter us.
    """
    def pick(p, taken, _roster=[]):
        base = [x for x in _roster]
        best, bv = None, None
        for pid in points:
            if pid in taken:
                continue
            v = starting_points(base + [pid], wkpts, slots, pos)
            if bv is None or v > bv:
                best, bv = pid, v
        if best is not None:
            _roster.append(best)
        return best
    return pick


def replay_stateful(picks, chooser):
    """`chooser` accumulates its own roster; reset between arms."""
    taken, mine = set(), []
    for p in picks:
        pid = str(p.get("player_id"))
        if p.get("roster_id") == CORY_ROSTER:
            if p.get("is_keeper"):
                taken.add(pid); mine.append(pid); continue
            c = chooser(p, taken)
            if c is not None:
                taken.add(str(c)); mine.append(str(c))
            continue
        taken.add(pid)
    return mine
