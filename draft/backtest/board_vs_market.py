# TERRITORY: C
"""DOES OUR BOARD'S ADP AGREE WITH AN INDEPENDENT MARKET? — the pre-declared measurement.

REGISTERED IN PARKED.md BEFORE THE SAMPLE WAS INSPECTED (2026-08-12, "PRE-DECLARATION —
does the deployed board's ADP agree with an independent market?"). Nothing here chooses a
cut after seeing a result; the numbers below are the ones declared.

THE QUESTION, AND WHY IT IS NOT INTERNAL CONSISTENCY. Every check this board has ever
passed compared it to another artifact of ours. D3 now holds a SECOND, INDEPENDENT source
— MFL, a real market of drafts we did not build and cannot influence — so for the first
time our price can be compared to somebody else's. `mfl_live_probe` compared MFL to FFC.
It never compared MFL to `public/draft_data.json`, which is the board Cory actually drafts
off.

THE HEADLINE NUMBER IS DELIBERATELY ONE NUMBER: how many players does an independent
market take inside our draft range that OUR board has in the fallback tail — invisible to
the person picking, at the moment the market is spending a real pick on them.

WHY THIS IS A MEASUREMENT AND NOT A MECHANISM (rule 9). It reports and stops. It does not
adjust the board, it does not blend, and it emits no score anything downstream consumes.
If it finds nothing, the answer is "the board's pricing is sound where it matters" and this
file stops being run.

OFFLINE BY CONSTRUCTION. Both sides come from bytes we already hold — the archive's own
decode key and `public/draft_data.json`. The earlier version of this comparison could only
run against a live MFL, which meant it could never be re-run to check itself.
"""
from __future__ import annotations

import json
from pathlib import Path

import external_adp_capture as CAP
import positive_control as PC

#: The registered range. 10 teams x 15 rounds — the picks Cory can actually reach.
#: The shoulder is reported beside it because keepers and forfeited rounds move the
#: real edge, and it was declared at the same time rather than added on seeing a result.
DRAFT_RANGE = 150
SHOULDER = 200

#: A board price we did not make up. `search_rank` is the fallback and — measured on the
#: 2026-08-12 board — it is not a rank at all but the single constant 916.0 for all 1,419
#: players carrying it. Anything outside this set is unpriced, whatever the label says.
REAL_ADP_SOURCES = ("fantasypros", "ffc")

#: How many players to NAME. The counts are always exact; only the lists are capped.
NAMED = 20


def _board_rows(board) -> list:
    """Accept the artifact dict, its player list, or a path to it."""
    if isinstance(board, (str, Path)):
        board = json.loads(Path(board).read_text())
    if isinstance(board, dict):
        return list(board.get("players") or [])
    return list(board or [])


def market_ranks(archive, year) -> list:
    """The market's own ordering for one season: [(mfl_id, adp), ...] earliest first.

    FROM THE LATEST SNAPSHOT, not a blend across days. F5's reasoning applies to this
    comparison too — a curve averaged over a fortnight is nobody's board on any day, and
    the question is what the market thinks NOW versus what we are charging NOW.
    """
    snaps = [s for s in CAP._series_of(archive) if str(s.get("year")) == str(year)]
    if not snaps:
        return []
    rows = (sorted(snaps, key=lambda s: s["observed_at"])[-1].get("rows") or {})
    return sorted(((str(k), float(v)) for k, v in rows.items()), key=lambda r: r[1])


def controls(board_rows: list) -> dict:
    """POSITIVE CONTROLS, run before any finding is reported (A's scaffold, D-series).

    A zero from this probe has two readings — "the board and the market agree" and "my
    crosswalk is broken" — and they render identically. Both controls below exercise
    `crosswalk_map`, the SAME function the measurement calls, with answers fixed outside
    the code:

      THE KNOWN PAIR is fully external: one player, one board row, one expected match.
      THE ROUND TRIP feeds our own board back through the crosswalk. Every player must
      match himself, so the expected answer is the board's own size — an input, not
      something derived from the matcher, which is what rule 10d forbids. This is the
      control that fires if the matcher silently stops matching.
    """
    known_key = {"1": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"}}
    known_board = [{"player_id": "X1", "name": "Ja'Marr Chase",
                    "position": "WR", "team": "CIN"}]
    named = [r for r in board_rows if r.get("name")]

    def round_trip():
        # A CONTROL THAT CAN PASS ON AN EMPTY SET IS NOT A CONTROL. Written the
        # obvious way — expect `len(named)` — this returned 0 == 0 and went GREEN on a
        # board with no usable names at all, so a dead crosswalk certified itself and
        # the verdict read "the board's pricing is sound". Caught break-first, and it
        # is the same absent-is-not-zero failure `positive_control.run` refuses one
        # level up for an empty control LIST. Refusing here is the same rule applied
        # to an empty control INPUT.
        if not named:
            raise ValueError(
                "the board handed to this probe has no usable names, so the crosswalk "
                "cannot be checked at all — that is an unverified instrument, not a "
                "board with nothing on it")
        got = CAP.crosswalk_map(
            {"M%d" % i: {"name": p.get("name"), "position": p.get("position"),
                         "team": p.get("team")} for i, p in enumerate(named)},
            board_rows)[1]["crosswalked"]
        return got == len(named)

    return PC.run([
        ("a known player crosswalks to a known id",
         lambda: CAP.crosswalk_map(known_key, known_board)[0], {"1": "X1"},
         "hand-checked, external to this board"),
        ("our own board round-trips to itself",
         round_trip, True,
         "every player on our board must match himself, and there must BE some"),
    ])


def report(archive, board, year="2026", top_n=DRAFT_RANGE) -> dict:
    """The pre-declared comparison. Returns the numbers; prints nothing.

    UNMATCHED MARKET ROWS ARE COUNTED, NEVER DROPPED QUIETLY. A player the market drafts
    whom our crosswalk cannot place is not evidence that our board prices him badly — it
    is evidence about the crosswalk, and conflating the two would let a matcher failure
    read as a pricing failure. They are separate lines below and always both reported.
    """
    rows = _board_rows(board)
    ctrl = controls(rows)
    key = CAP.players_of(archive)
    ids, cw = (CAP.crosswalk_map(key, rows) if key else ({}, {}))
    by_id = {str(p.get("player_id")): p for p in rows}

    ranked = market_ranks(archive, year)
    # BY PICK NUMBER, NOT BY LIST POSITION. `ranked[:top_n]` was the first cut and it
    # is a different quantity: it takes the market's first 150 ROWS, so the comparison
    # silently depends on how many players the provider returned that day rather than
    # on the pick Cory can reach. The pre-declaration registered "the market takes them
    # inside 150 picks", which is an ADP threshold. On a full board the two nearly
    # coincide, which is exactly why the slice would have survived review.
    inside = [(i, a) for i, a in ranked if a <= top_n]
    shoulder = [(i, a) for i, a in ranked if a <= SHOULDER]

    def split(pairs):
        priced, fallback, unmatched = [], [], []
        for mfl_id, adp in pairs:
            ours = by_id.get(ids.get(mfl_id, ""))
            if ours is None:
                unmatched.append({"mfl_id": mfl_id, "market_adp": adp,
                                  "market_name": (key.get(mfl_id) or {}).get("name")})
            elif ours.get("adp_source") in REAL_ADP_SOURCES:
                priced.append((ours, adp))
            else:
                fallback.append((ours, adp))
        return priced, fallback, unmatched

    priced, fallback, unmatched = split(inside)
    s_priced, s_fallback, s_unmatched = split(shoulder)

    def name(pair):
        p, adp = pair
        return {"name": p.get("name"), "position": p.get("position"),
                "team": p.get("team"), "market_adp": round(adp, 1),
                "our_adp": p.get("adp"), "our_adp_source": p.get("adp_source"),
                "our_proj": p.get("proj_mean")}

    return {
        "declared": {"range": top_n, "shoulder": SHOULDER, "year": str(year),
                     "real_adp_sources": list(REAL_ADP_SOURCES),
                     "registered": "PARKED.md 2026-08-12, before the sample was inspected"},
        "controls": ctrl,
        "market": {"rows": len(ranked), "inside_range": len(inside)},
        "crosswalk": {"decode_key_ids": len(key), "matched": cw.get("crosswalked"),
                      "unmatched": cw.get("no_sleeper_match"),
                      "methods": cw.get("methods")},
        # THE HEADLINE, and it is one number.
        "inside_range": {
            "matched": len(priced) + len(fallback),
            "our_board_prices_them": len(priced),
            "our_board_has_them_in_the_FALLBACK_TAIL": len(fallback),
            "not_crosswalkable": len(unmatched),
            "fallback_named": [name(x) for x in fallback[:NAMED]],
            "fallback_named_truncated": len(fallback) > NAMED,
        },
        "shoulder_%d" % SHOULDER: {
            "matched": len(s_priced) + len(s_fallback),
            "our_board_prices_them": len(s_priced),
            "our_board_has_them_in_the_FALLBACK_TAIL": len(s_fallback),
            "not_crosswalkable": len(s_unmatched),
        },
    }


def verdict(rep: dict) -> str:
    """One sentence, guarded by the controls. A broken probe reports nothing.

    THE FALSIFICATION WAS DECLARED WITH THE SAMPLE: if the fallback tail holds no player
    the market takes inside the range, the board's pricing is sound where it matters and
    this says so plainly rather than reaching for a smaller effect.
    """
    n = rep["inside_range"]["our_board_has_them_in_the_FALLBACK_TAIL"]
    m = rep["inside_range"]["matched"]
    if not m:
        line = ("NO MARKET ROW INSIDE THE RANGE CROSSWALKED — this is a statement about "
                "the crosswalk, not about the board's pricing.")
    elif not n:
        line = ("THE BOARD'S PRICING IS SOUND WHERE IT MATTERS: of %d players the market "
                "takes inside %d picks, our board prices every one." % (m, rep["declared"]["range"]))
    else:
        line = ("%d of %d players the market takes inside %d picks are in OUR FALLBACK "
                "TAIL — priced at the constant, invisible to anything that sorts on ADP."
                % (n, m, rep["declared"]["range"]))
    return PC.guard(line, rep["controls"])


if __name__ == "__main__":  # pragma: no cover
    import sys
    arch = sys.argv[1] if len(sys.argv) > 1 else str(CAP.SERIES)
    brd = sys.argv[2] if len(sys.argv) > 2 else "public/draft_data.json"
    rep = report(json.loads(Path(arch).read_text()), brd)
    print(json.dumps(rep, indent=1))
    print()
    print(verdict(rep))


# ---------------------------------------------------------------------------
# SLEEPER'S OWN ORDERING vs THE MARKET'S PRICE
# ---------------------------------------------------------------------------

#: A Sleeper ordering is COLLAPSED when it carries fewer distinct values than this
#: fraction of the population. `search_rank` was once the single constant 916.0
#: for 1,419 players — the docstring at the top of this file records it — and a
#: field that stops being populated produces a beautifully tidy median of nothing.
COLLAPSE_RATIO = 0.25


def _avg_ranks(pairs) -> dict:
    """{key: rank}, ties sharing the MEAN of the positions they span.

    88 of the 146 players inside the top 150 share a `sleeper_rank` with somebody
    — 93 distinct values over 146 players. `sorted()` breaks those by input order,
    so a player's measured divergence depended on where they happened to sit in
    the JSON. With that many ties the arbitrary offset is a large fraction of the
    effect being measured, not a rounding detail.
    """
    order = sorted(pairs, key=lambda kv: kv[1])
    out, i = {}, 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and order[j + 1][1] == order[i][1]:
            j += 1
        avg = (i + j) / 2.0 + 1.0                     # 1-based mean of the span
        for k, _v in order[i:j + 1]:
            out[k] = avg
        i = j + 1
    return out


def sleeper_divergence(board, top_n=DRAFT_RANGE) -> dict:
    """Where does the PLATFORM our room drafts on disagree with the market price?

    Cory's hypothesis, and it is worth measuring rather than asserting: our league
    drafts on Sleeper, Sleeper shows its own ordering beside every player, and a
    room that leans on the default list will reach for whatever that list puts
    early. `sleeper_rank` is on every board row, so this is offline.

    ⚠ IT IS A MECHANISM CHECK, NOT A CAUSAL ONE, and the distinction has to survive
    into whatever reads this. `sleeper_rank` is Sleeper's SEARCH ordering — search
    and roster popularity — not a draft-position estimate. Quarterbacks being
    searched more than they are drafted is expected on its own. Agreement here
    makes the anchoring story plausible and gives it the right sign; it does not
    establish that anybody drafted off the list.

    BOTH SIDES RANKED OVER THE SAME POPULATION, which is the whole arithmetic:
    rank one side over the draftable 146 and the other over all 1,841 and the two
    numbers are not comparable while every intermediate value looks healthy. This
    project has already paid for that defect once, on ADP depth.

    Negative delta = Sleeper places the player EARLIER than the market does.
    """
    rows = [r for r in _board_rows(board)
            if r.get("adp") is not None and r.get("sleeper_rank") is not None]
    pool = [r for r in rows if float(r["adp"]) <= float(top_n)]
    n = len(pool)
    if n < 2:
        return {"status": "unmeasured", "ranked": 0, "unranked": 0,
                "by_position": {}, "rows": [],
                "note": "fewer than two priced players inside pick %s — nothing "
                        "to rank, which is a fact about the board rather than "
                        "about Sleeper" % top_n}

    # ── SENTINELS ARE NOT RANKS, AND THE TEST IS STRUCTURAL ─────────────────
    # Five players inside the top 150 sit at `sleeper_rank` 400.0 and every one is
    # a team DEFENCE; another 301 sit at 999.0. Sleeper parks what it does not
    # rank. Counting those as positions produced a reported "DEF +17 slots later"
    # that is a filler value being read as an opinion — null-as-absence, inside
    # the measurement built to check somebody else's.
    #
    # DERIVED, NOT A MAGIC LIST: a value shared by three or more players AND
    # larger than the population being ranked cannot be a position within it.
    counts = {}
    for r in pool:
        counts[float(r["sleeper_rank"])] = counts.get(float(r["sleeper_rank"]), 0) + 1
    # `> 2 * n`, NOT `> n`. A parked value sits far beyond the whole population
    # being ranked — 400 and 999 against 146 draftable players — which no genuine
    # position within that population can. A bare `> n` also flags an ordinary
    # shared rank just past the end of a small pool, which is a real rank.
    sentinels = {v for v, c in counts.items() if c >= 3 and v > 2 * n}
    live = [r for r in pool if float(r["sleeper_rank"]) not in sentinels]
    unranked = len(pool) - len(live)
    if len(live) < 2:
        return {"status": "unmeasured", "ranked": len(live), "unranked": unranked,
                "by_position": {}, "rows": [],
                "sentinels": sorted(sentinels),
                "note": "almost every player carries a parked sentinel rather than "
                        "a rank — Sleeper is not ordering this population"}

    distinct = len({float(r["sleeper_rank"]) for r in live})
    if distinct < max(2, int(COLLAPSE_RATIO * len(live))):
        return {"status": "collapsed", "ranked": len(live), "unranked": unranked,
                "distinct": distinct, "by_position": {}, "rows": [],
                "sentinels": sorted(sentinels),
                "note": "only %d distinct Sleeper ranks over %d players. A median "
                        "over that is tidy and meaningless — the same collapse "
                        "`search_rank` showed at a single constant for 1,419 "
                        "players." % (distinct, len(live))}

    by_adp = _avg_ranks([(r["player_id"], float(r["adp"])) for r in live])
    by_sl = _avg_ranks([(r["player_id"], float(r["sleeper_rank"])) for r in live])
    out = []
    for r in live:
        pid = r["player_id"]
        out.append({"player_id": pid, "name": r.get("name"),
                    "position": r.get("position"),
                    "market_rank": by_adp[pid], "sleeper_rank_in_pool": by_sl[pid],
                    "delta": round(by_sl[pid] - by_adp[pid], 1)})

    from statistics import median
    per = {}
    for x in out:
        per.setdefault(x["position"], []).append(x["delta"])
    return {
        "status": "measured",
        "ranked": len(live), "unranked": unranked, "distinct": distinct,
        "sentinels": sorted(sentinels),
        "top_n": top_n,
        # PER POSITION, because the effect is position-shaped. The two rankings
        # are a permutation of each other so the deltas SUM to zero — the mean is
        # zero by construction, and the median is only near it. Reporting the
        # overall figure alone therefore reports the one real finding on this
        # board (quarterbacks, a median 36 slots early) as no finding at all.
        # EVERY POSITION, WITH ITS n. A minimum-count filter would drop a thin
        # position silently, and this lane's whole complaint is about numbers that
        # vanish rather than declare themselves. `n` is right there to be read.
        "by_position": {k: {"n": len(v), "median": round(median(v), 1),
                            "mean": round(sum(v) / len(v), 1)}
                        for k, v in sorted(per.items())},
        "overall_median": round(median([x["delta"] for x in out]), 1),
        "rows": sorted(out, key=lambda x: x["market_rank"]),
        "note": "negative = Sleeper places the player EARLIER than the market. "
                "`sleeper_rank` is a SEARCH ordering, not a draft-position "
                "estimate: this makes an anchoring story plausible and gives it a "
                "sign, it does not establish that anybody drafted off the list.",
    }
