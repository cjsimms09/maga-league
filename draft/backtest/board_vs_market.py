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
#: Which `adp_sd_source` values are the PUBLISHER'S OWN number rather than a
#: constant we fitted. Measured on the 2026-08-14 board: 142 of the 146 rows
#: inside pick 150 are `ffc-published`; the clamps (`fallback-clamped`,
#: `clamped-linear`) live almost entirely beyond it.
_PUBLISHED_SD = ("ffc-published", "ffc")


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


# ── IS MFL'S BOARD DENOMINATED IN OUR LEAGUE'S FORMAT? ──────────────────────
#
# A's criterion 1 — "are the two ends of this comparison denominated in the same
# thing" — applied to the market side of every comparison above. Everything in
# this module treats MFL as "an independent market". MFL is not A market: it is
# EVERY draft on MFL's platform, pooled. Superflex, 2QB, dynasty, keeper, and
# team counts from eight to sixteen all land in one average.
#
# That was written down as a caveat and never measured. Measured on 2026-08-14 it
# is not a caveat, it is the largest single effect in the comparison — bigger than
# anything this module was built to find.

#: ⚠ RETIRED AS A VERDICT, KEPT ONLY AS A REPORTED REFERENCE LINE. Read Step 2.
#:
#: This was "one full round of our fifteen", declared as the bar a positional
#: shift must clear. Stress-testing it against a PERMUTATION NULL — market values
#: shuffled across the same players, which destroys position structure and keeps
#: both marginals — showed it measures nothing at quarterback: **56.9% of
#: structureless draws already clear it.**
#:
#: THE REASON IS THE SAME DEFECT THIS LANE KEEPS FINDING, TURNED INWARD. The null
#: is NOT centred at zero, because our board does not price the positions
#: uniformly. Quarterbacks sit at a mean board rank of 84.3 out of 145 against a
#: uniform 73.0 — LATE — so a market that ranked them at random still produces a
#: median delta of -11.8. A threshold of -9.7 sits inside that.
#:
#: The verdicts are now taken against the null itself (`_null_band`). This
#: constant survives only so the summary can print where the old line sat.
FORMAT_SHIFT_FRACTION = 1.0 / 15.0

#: How many permutations to build the null from, and the two-sided band. 2000 at
#: 5/95 resolves a p05 to about a slot on a 145-player board, which is finer than
#: the effect being judged and cheap enough to run every morning.
NULL_TRIALS = 2000
NULL_BAND = 0.05

#: ⚠ AND A VERDICT NEEDS A NULL THAT LOCALIZES ANYTHING. With three kickers the
#: null band spans -108 to -5 on a 145-player board — 103 slots — and calling a
#: median of +4.0 "outside" a band that wide is true and says nothing. So the
#: verdict is withheld when the band is wider than this share of the ranked
#: population. DERIVED FROM GEOMETRY, not fitted: a band covering half the board
#: cannot place an effect in either half of it.
NULL_MAX_BAND_FRACTION = 0.5

#: Above this, an age gradient among NON-quarterbacks is a dynasty/keeper
#: population rather than a redraft one. Non-QB is the whole point — a superflex
#: pool moves quarterbacks and leaves the age curve alone, so an age effect that
#: survives with quarterbacks removed cannot be superflex wearing a disguise.
#: ⚠ SAME TREATMENT. This one SURVIVED its stress test — 0.0% of null draws clear
#: +0.25 — but it is kept as a reference line for the same reason and the verdict
#: comes from the null. Worth recording that the age null is ALSO not zero: age
#: correlates with board rank at +0.204 among non-quarterbacks, so a structureless
#: market yields a median rho of -0.148, and the observed +0.425 is further from
#: the null than it looks against zero.
DYNASTY_AGE_RHO = 0.25

#: ⚠ AND A VERDICT NEEDS A POPULATION THAT IS ACTUALLY THE DRAFT. The threshold
#: above is a fraction of whatever got ranked, which is right — and which means a
#: crosswalk that decays to twenty players would drop the bar to 1.3 slots and
#: "detect" a format on noise. So the numbers are always reported and the VERDICT
#: is withheld below half the draft range: fewer than 75 of the 150 picks paired
#: is a fact about the crosswalk, and a format call taken over it would be a
#: statement about the players who happened to match.
MIN_RANKED_FRACTION = 0.5


def _spearman(xs, ys):
    """Rank correlation, ties averaged. None when either side is constant.

    NONE, NOT ZERO. A constant column has no correlation to report, and 0.0 would
    read as "measured, and there is no relationship" — the null-as-absence defect
    this lane has now paid for five times.
    """
    if len(xs) < 3:
        return None
    rx = _avg_ranks(list(enumerate(xs)))
    ry = _avg_ranks(list(enumerate(ys)))
    a = [rx[i] for i in range(len(xs))]
    b = [ry[i] for i in range(len(ys))]
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    if not den:
        return None
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / den


def _nulls(stats: dict, values, positions, board_ranks, trials=NULL_TRIALS,
           band=NULL_BAND, seed=20260814) -> dict:
    """{name: band} for every statistic, from ONE set of permutations.

    ⚠ WHY A NULL AT ALL, AND WHY IT IS NOT ZERO. A rank delta is
    `market_rank - board_rank`, so its null depends on where the thing being
    measured sits on OUR board. Our board prices quarterbacks late — mean rank
    84.3 of 145 against a uniform 73.0 — so a market that ranked every player at
    random still returns a QB median of -11.8. Judging that against zero, or
    against a round-number fraction, measures the board's own shape and reports it
    as the market's format. 56.9% of structureless draws cleared the fraction this
    replaced.

    PERMUTATION, NOT A PARAMETRIC GUESS: the market values are shuffled ACROSS the
    same players, which destroys any position- or age-shaped structure while
    keeping both marginal distributions exactly as observed.

    ⚠ ONE LOOP FOR EVERY STATISTIC, not one loop each. Six positions plus two
    verdicts meant eight independent permutation runs per day and eight more per
    archived day inside `format_trend` — seventy seconds on the test suite alone.
    Sharing the draws is also the more honest null: every statistic is then judged
    against the same structureless markets rather than eight different ones.

    Deterministic seed, so two runs on one day agree and a change in the band is a
    change in the data rather than in the dice.
    """
    import random
    from statistics import median as _m
    rng = random.Random(seed)
    vals = list(values)
    acc = {k: [] for k in stats}
    for _ in range(trials):
        rng.shuffle(vals)
        mr = _avg_ranks(list(enumerate(vals)))
        deltas = [mr[i] - board_ranks[i] for i in range(len(vals))]
        for k, fn in stats.items():
            got = fn(deltas, positions)
            if got is not None:
                acc[k].append(got)
    out = {}
    for k, v in acc.items():
        if not v:
            out[k] = None
            continue
        v.sort()
        lo = v[max(0, int(band * (len(v) - 1)))]
        hi = v[min(len(v) - 1, int((1.0 - band) * (len(v) - 1)))]
        out[k] = {"median": round(_m(v), 3), "p_lo": round(lo, 3),
                  "p_hi": round(hi, 3), "trials": len(v), "band": band}
    return out


def _verdict(value, nb, n, side):
    """(detected, too_wide) for a statistic against its null band.

    `side` is "low" or "high" — one-sided by construction, because the SIGN is
    part of every claim here. Quarterbacks going LATER than our board is the
    opposite composition, not a weaker version of the same one.
    """
    if nb is None or value is None:
        return False, False
    wide = (nb["p_hi"] - nb["p_lo"]) > NULL_MAX_BAND_FRACTION * n
    if wide:
        return False, True
    return (value < nb["p_lo"] if side == "low" else value > nb["p_hi"]), False


def _paired(archive, board, year, top_n, observed_at=None):
    """Crosswalked (our row, market adp, market dispersion) inside OUR draft range.

    THE POPULATION IS OURS, NOT THE MARKET'S. `report` above asks what the market
    reaches that we bury, so it selects on the market's adp. This asks whether the
    market's numbers mean what ours mean, so it selects on OUR board's adp — the
    players a decision actually gets made about on the 22nd. Selecting on the
    market's price here would answer the question over a population chosen by the
    thing under test.
    """
    rows = _board_rows(board)
    key = CAP.players_of(archive)
    ids, _ = (CAP.crosswalk_map(key, rows) if key else ({}, {}))
    by_id = {str(p.get("player_id")): p for p in rows}
    snaps = [s for s in CAP._series_of(archive) if str(s.get("year")) == str(year)]
    if not snaps:
        return [], "no %s snapshot in the archive" % year
    if observed_at is not None:
        snaps = [s for s in snaps if s.get("observed_at") == observed_at]
        if not snaps:
            return [], "no %s snapshot dated %s" % (year, observed_at)
    day = sorted(snaps, key=lambda s: s.get("observed_at") or "")[-1]
    disp = day.get("dispersion") or {}
    out = []
    for mfl_id, adp in (day.get("rows") or {}).items():
        ours = by_id.get(ids.get(mfl_id, ""))
        if ours is None or ours.get("adp") is None or adp is None:
            continue
        if float(ours["adp"]) > float(top_n):
            continue
        out.append({"row": ours, "market_adp": float(adp),
                    "dispersion": disp.get(mfl_id)})
    return out, (day.get("observed_at") if out else "nothing crosswalked inside "
                 "pick %s" % top_n)


def format_composition(archive, board, year="2026", top_n=DRAFT_RANGE,
                       observed_at=None) -> dict:
    """WHOSE GAME IS THE MARKET PLAYING? Positional and age shape of the shift.

    ⚠ RANKED OVER THE SHARED POPULATION, BOTH SIDES. Raw pick numbers from two
    markets are not comparable when the pools differ in size or in how many teams
    pick per round — a 10-team room reaches pick 100 a round and a half sooner
    than a 14-team one, so a raw delta would report that as an opinion. Ranking
    both sides inside the crosswalked intersection removes every global scale
    difference and leaves only what is POSITION- or AGE-shaped, which is the only
    part a format can produce. Reading raw deltas is the mistake `sleeper_rank`
    already cost this module once.

    TWO CONTAMINANTS, AND THEY ARE SEPARABLE — that is why both are reported:

      * SUPERFLEX / 2QB doubles the demand for quarterbacks and touches nothing
        else, so it is POSITION-shaped and indifferent to age.
      * DYNASTY / KEEPER pays for youth everywhere, so it is AGE-shaped and shows
        up with quarterbacks removed.

    A pool with both produces both signatures at once, and a reader who has only
    the QB number will explain the old-running-back shift with superflex and be
    wrong about which players are affected.

    NEGATIVE DELTA = THE MARKET TAKES HIM EARLIER THAN OUR BOARD PRICES HIM.
    """
    pairs, note = _paired(archive, board, year, top_n, observed_at)
    base = {"status": "unmeasured", "observed_at": None, "n": 0, "top_n": top_n,
            "by_position": {}, "superflex": None, "dynasty": None,
            "aged": 0, "no_age": 0, "rows": [], "note": note}
    if len(pairs) < 3:
        return base

    ours = _avg_ranks([(i, p["row"]["adp"]) for i, p in enumerate(pairs)])
    theirs = _avg_ranks([(i, p["market_adp"]) for i, p in enumerate(pairs)])
    per, rows = {}, []
    for i, p in enumerate(pairs):
        pos = str(p["row"].get("position") or "?").upper()
        d = theirs[i] - ours[i]
        per.setdefault(pos, []).append(d)
        rows.append({"player_id": p["row"].get("player_id"),
                     "name": p["row"].get("name"), "position": pos,
                     "age": p["row"].get("age"),
                     "board_adp": p["row"]["adp"], "market_adp": p["market_adp"],
                     "delta": round(d, 1)})

    from statistics import median
    # ── THE NULLS, BUILT ONCE FROM THIS DAY'S OWN BOARD ─────────────────
    from statistics import median as _med
    pos_list = [str(p["row"].get("position") or "?").upper() for p in pairs]
    ages = [p["row"].get("age") for p in pairs]
    # ⚠ THE DOMINANT CONTAMINANT WAS THE ONE THIS MODULE DID NOT LOOK FOR.
    # `format_census_series.json`, 114 readable MFL leagues: only 6.1% are
    # half-PPR like us and 55.3% are FULL PPR, against superflex at 21.1%. This
    # function tested superflex and dynasty and nothing else, so the LARGEST
    # divergence between that market and our board was unmeasured.
    targets = [p["row"].get("target_share") for p in pairs]
    board_ranks = [ours[i] for i in range(len(pairs))]
    market_vals = [p["market_adp"] for p in pairs]

    def _qb_stat(deltas, positions):
        d = [deltas[i] for i in range(len(deltas)) if positions[i] == "QB"]
        return _med(d) if len(d) >= 3 else None

    def _age_stat(deltas, positions):
        idx = [i for i in range(len(deltas))
               if positions[i] != "QB" and isinstance(ages[i], (int, float))]
        if len(idx) < 3:
            return None
        return _spearman([float(ages[i]) for i in idx], [deltas[i] for i in idx])

    by_pos = {k: {"n": len(v), "median": round(median(v), 1)}
              for k, v in sorted(per.items())}
    # ⚠ EVERY POSITION GETS ITS OWN NULL, because every one of them sits somewhere
    # non-uniform on our board. Measured 2026-08-14: QB -49.8 is outside its null
    # (p05 -33.8) and REAL; RB +16.5 (null p05..p95 -1.0..+27.0), WR +7.0
    # (-6.5..+17.0) and TE -5.0 (-34.5..+15.0) are all INSIDE theirs and are not
    # findings. Those three were reported to A as a table of shifts before this
    # test existed.
    def _pos_stat(_k):
        def f(deltas, positions):
            d = [deltas[i] for i in range(len(deltas)) if positions[i] == _k]
            return median(d) if len(d) >= 3 else None
        return f

    def _target_stat(deltas, positions):
        idx = [i for i in range(len(deltas))
               if positions[i] != "QB" and isinstance(targets[i], (int, float))]
        if len(idx) < 3:
            return None
        return _spearman([float(targets[i]) for i in idx], [deltas[i] for i in idx])

    stats = {("pos:" + k): _pos_stat(k) for k in by_pos}
    stats["qb"] = _qb_stat
    stats["age"] = _age_stat
    stats["target"] = _target_stat
    NB = _nulls(stats, market_vals, pos_list, board_ranks)

    for k, v in by_pos.items():
        nb = NB.get("pos:" + k)
        v["null"] = nb
        hit, wide = _verdict(v["median"], nb, len(pairs),
                             "low" if v["median"] < 0 else "high")
        # THE PER-POSITION TABLE IS TWO-SIDED — it reports WHERE a position sits,
        # and either tail is informative there. The VERDICTS below are one-sided,
        # because each of them names a direction.
        v["null_too_wide"] = wide
        v["outside_null"] = bool(hit)

    # THE FLOOR IS CHECKED ONCE AND APPLIES TO BOTH VERDICTS — one contaminant
    # detected off a decayed crosswalk is as wrong as the other.
    thin = len(pairs) < MIN_RANKED_FRACTION * float(top_n)

    qb = by_pos.get("QB")
    superflex = None
    if qb and qb["n"] >= 3:
        # ⚠ THE VERDICT IS "OUTSIDE THE NULL", NOT "PAST A ROUND NUMBER". The old
        # bar was one full round of our fifteen, and 56.9% of structureless draws
        # already cleared it — because our board prices quarterbacks LATE, so a
        # market that ranked them at random still returns a median of -11.8.
        # The declared line is still reported so the change is visible.
        nb = NB.get("qb")
        hit, wide = _verdict(qb["median"], nb, len(pairs), "low")
        thresh = FORMAT_SHIFT_FRACTION * len(pairs)
        superflex = {
            "qb_median_slots": qb["median"], "qb_n": qb["n"],
            "qb_median_fraction": round(qb["median"] / len(pairs), 3),
            # THE SIGN IS STILL PART OF THE CLAIM. Quarterbacks going LATER than
            # our board is the opposite composition, so only the LOW tail counts.
            "detected": bool((not thin) and hit),
            "null": nb,
            "null_too_wide": wide,
            "reference_line_slots": round(thresh, 1),
            "reference_line_fraction": round(FORMAT_SHIFT_FRACTION, 4),
            "reference_line_retired": "56.9% of permutation draws clear it; kept "
                                      "only to show where the old bar sat",
            "ranked_over": len(pairs),
        }

    # ⚠ AGE IS MISSING ON SOME ROWS AND MISSING IS NOT ZERO. A rookie with no age
    # recorded would be the youngest player on the board at 0, and the gradient
    # this is looking for is exactly the one an age of 0 would manufacture.
    aged = [r for r in rows if isinstance(r.get("age"), (int, float))]
    non_qb = [r for r in aged if r["position"] != "QB"]
    dynasty = None
    if len(non_qb) >= 3:
        rho = _spearman([float(r["age"]) for r in non_qb],
                        [r["delta"] for r in non_qb])
        # SAME TREATMENT, AND THIS ARM SURVIVED ITS STRESS TEST — 0.0% of null
        # draws clear +0.25. The null is still not zero: age correlates with board
        # rank at +0.204 among non-quarterbacks, so a structureless market yields
        # a median rho of -0.148 and the observed value is FURTHER from the null
        # than it looks against zero.
        nb = NB.get("age")
        hit, wide = _verdict(rho, nb, len(pairs), "high")
        dynasty = {
            "age_rho_non_qb": None if rho is None else round(rho, 3),
            "n": len(non_qb), "null": nb,
            "reference_line_rho": DYNASTY_AGE_RHO,
            # POSITIVE rho = older players go LATER on the market than on our
            # board, which is what paying for youth looks like from a redraft
            # board's side. Only the HIGH tail counts.
            "null_too_wide": wide,
            "detected": bool((not thin) and hit),
        }

    # ── RECEPTION SCORING: THE SIGNATURE THE CENSUS SAYS DOMINATES ──────────
    #
    # PREDICTION STATED BEFORE THE NUMBER WAS COMPUTED, because the sign IS the
    # claim and I have had a counterfactual backwards before. A market that is
    # 55.3% full PPR values a reception MORE than our half-PPR board does, so it
    # should price high-target players EARLIER than we do. `delta` is
    # market_rank - board_rank, so earlier means NEGATIVE, and the correlation
    # between target share and delta should therefore be NEGATIVE. **The LOW tail
    # counts**, as with superflex. A positive rho would be the opposite
    # composition — a market LESS reception-heavy than ours — and must not be
    # allowed to read as a weaker version of the same finding.
    #
    # ⚠ MISSING target_share IS NOT ZERO, for the same reason a missing age is not
    # a rookie aged 0: a player with no target share recorded would sit at the
    # bottom of the gradient this is looking for and manufacture it. Excluded.
    #
    # NON-QB ONLY. Quarterbacks catch nothing, their target share is 0 or absent
    # by construction, and leaving them in would put a large block at one end of
    # the x-axis whose position says nothing about reception scoring.
    # ⚠ ONE POPULATION, DEFINED ONCE. This built the set TWICE — a `tgt` list off
    # `rows` for the length guard and an `idx` list off `pos_list` for the
    # arithmetic — and the mutation gate proved they could drift: removing the QB
    # filter from one of them changed nothing the output could show, so the
    # mutation SURVIVED. Two definitions of one thing is rule 11, and here the
    # duplicate existed purely so a guard could count a set the maths never used.
    idx = [i for i in range(len(pairs))
           if pos_list[i] != "QB" and isinstance(targets[i], (int, float))]
    reception = None
    if len(idx) >= 3:
        rho = _spearman([float(targets[i]) for i in idx],
                        [rows[i]["delta"] for i in idx])
        nb = NB.get("target")
        hit, wide = _verdict(rho, nb, len(pairs), "low")
        reception = {
            "target_share_rho_non_qb": None if rho is None else round(rho, 3),
            "n": len(idx), "null": nb,
            "null_too_wide": wide,
            "detected": bool((not thin) and hit),
            "reads": "NEGATIVE rho = this market prices high-target players "
                     "EARLIER than our board. The EFFECT is real and survives "
                     "its permutation null; the CAUSE is not established.",
            # ⚠ MY FIRST EXPLANATION OF THIS ARM WAS REFUTED BY MY OWN CONTROL,
            # WITHIN THE HOUR. I attributed it to reception scoring — the census
            # says 55.3% of MFL's pool is full PPR against our 6.1% half-PPR — and
            # then ran the obvious control: FFC is half-PPR at 10 teams, our exact
            # format, and it shows the SAME gradient at the SAME magnitude.
            #
            #     MFL (format-pooled)      rho -0.301   n=112
            #     FFC (half-PPR, 10 team)  rho -0.321   n=112
            #
            # A format explanation predicts the effect DISAPPEARS against FFC. It
            # does not. So reception scoring does not explain this and the name of
            # this key is a historical accident kept only because renaming a
            # shipped field mid-session costs more than it buys.
            #
            # WHAT SURVIVES: two INDEPENDENT MARKETS OF REAL HUMAN DRAFTS agree
            # with each other and disagree with our board about high-target
            # players. Our board's `adp` is FantasyPros — EXPERT CONSENSUS, not
            # drafts — which is why FantasyPros itself yields a constant column
            # here and no rho at all. The live hypothesis is therefore
            # drafters-versus-rankers, not scoring, and it is UNTESTED.
            "cause": "NOT ESTABLISHED. The reception-scoring explanation was "
                     "REFUTED by control: FFC is half-PPR at our league size and "
                     "shows rho -0.321 against MFL's -0.301. A format cause "
                     "predicts the effect vanishes there; it does not.",
            "control_ffc_rho": -0.321,
            "surviving_hypothesis": "two markets of REAL DRAFTS agree and differ "
                                    "from our board, whose adp is FantasyPros "
                                    "EXPERT CONSENSUS. Drafters vs rankers, "
                                    "untested — do not act on it as a format "
                                    "correction.",
        }

    detected = [k for k, v in (("superflex", superflex), ("dynasty", dynasty),
                               ("reception", reception))
                if v and v.get("detected")]
    if thin:
        return dict(base, status="thin", observed_at=note, n=len(pairs),
                    by_position=by_pos, superflex=superflex, dynasty=dynasty,
                    reception=reception,
                    aged=len(aged), no_age=len(rows) - len(aged),
                    rows=sorted(rows, key=lambda r: r["delta"]),
                    note="only %d players crosswalked inside pick %s, under the %d "
                         "needed for a verdict. The shifts below are real for the "
                         "players in them; whether they describe the MARKET cannot "
                         "be said from a population this thin, and calling a format "
                         "off it would be a statement about who happened to match."
                         % (len(pairs), top_n, int(MIN_RANKED_FRACTION * float(top_n))))
    return dict(base, status="measured", observed_at=note, n=len(pairs),
                by_position=by_pos, superflex=superflex, dynasty=dynasty,
                    reception=reception,
                aged=len(aged), no_age=len(rows) - len(aged),
                rows=sorted(rows, key=lambda r: r["delta"]),
                note=("THE MARKET IS NOT DRAFTING OUR FORMAT (%s). Its adp is an "
                      "average over the leagues on its platform, so a shift this "
                      "shape is composition, NOT the market disagreeing with our "
                      "price. Do not read it as a mispricing and do not blend it "
                      "into a single-QB redraft board." % ", ".join(detected))
                if detected else
                "No format signature above the declared thresholds. That is not "
                "proof the pool is homogeneous — it is the absence of the two "
                "shapes looked for, on this day's crosswalked intersection.")


def spread_composition(archive, board, year="2026", top_n=DRAFT_RANGE) -> dict:
    """IS THE MARKET'S SPREAD THE SAME QUANTITY AS `adp_sd`? Measured, not assumed.

    THE OPEN QUESTION THIS CLOSES. The market's range-derived sd came in ~3x the
    board's `adp_sd` inside pick 150 and I would not say which was wrong, because
    an estimator and a published figure are not obviously the same quantity. Two
    explanations were killed by measurement before this one survived:

      * SKEW IN THE ESTIMATOR — REFUTED. The market's mean sits at 0.35-0.39 of the
        way through its own observed range rather than 0.50, so the pick
        distribution is genuinely right-skewed. But calibrated to that skew, the
        range estimator comes back essentially UNBIASED (x1.02 at n=125). Skew is
        real and it is not the cause. The earlier guess that it inflated the
        estimate by ~1.3x had the counterfactual backwards.
      * SUPERFLEX WIDENING QUARTERBACKS — REFUTED as the cause of the SPREAD, even
        though it is confirmed in the MEAN. If format mixing showed up as spread it
        would be worst at quarterback; QB is the position with the SMALLEST ratio
        (2.2 against 4.0 at receiver).

    WHAT SURVIVED. Both markets' spreads are PROPORTIONAL to the pick number — the
    coefficient of variation is flat across the range on both sides — and the
    market's coefficient is about 2.7x the board's. A proportional spread is what
    pooling rooms of different sizes produces mechanically: the same player at
    pick 100 of a 12-team draft is at pick ~83 in a 10-team one whatever anybody
    thinks of him.

    SO THE EXCESS IS REPORTED AS AN EXCESS AND NOT ATTRIBUTED. Subtracting in
    quadrature gives the part of the market's spread that the board's own
    within-format disagreement does not account for. It is NOT provable that all of
    it is composition — a rougher crowd would also disagree more — and what we hold
    cannot split those. What IS established is the consequence: the two numbers are
    not denominated in the same thing, so the market's sd must never be substituted
    for `adp_sd`, which drives `survival.js`'s `normalCdf(currentPick, adp, adp_sd)`
    and through it VONA.
    """
    pairs, note = _paired(archive, board, year, top_n)
    base = {"status": "unmeasured", "observed_at": None, "n": 0, "top_n": top_n,
            "market_cv": None, "board_cv": None, "ratio": None,
            "excess_cv": None, "excess_share_of_variance": None,
            "by_band": {}, "note": note}
    got = []
    for p in pairs:
        # THE BOARD SIDE MUST BE THE PUBLISHER'S OWN NUMBER. Our fallback clamp is
        # a constant we invented; comparing the market against it would measure our
        # clamp and report it as a fact about the market.
        r = p["row"]
        if r.get("adp_sd") is None or str(r.get("adp_sd_source")) not in _PUBLISHED_SD:
            continue
        est = CAP.spread_from_dispersion(p["dispersion"] or {})
        if est["status"] != "measured" or not p["market_adp"]:
            continue
        got.append({"position": str(r.get("position") or "?").upper(),
                    "board_adp": float(r["adp"]), "board_sd": float(r["adp_sd"]),
                    "market_adp": p["market_adp"], "market_sd": est["sd"]})
    if len(got) < 3:
        # ⚠ ONLY REPLACE THE REASON IF THERE WAS A PAIRING TO JUDGE. With no
        # snapshot for the year asked about, `got` is empty for a reason that has
        # nothing to do with published sds, and overwriting `_paired`'s note would
        # answer "your board and this market barely overlap" to somebody who
        # asked about a season the archive does not hold.
        return dict(base, note=(note if not pairs else
                                "fewer than three players carry BOTH a published "
                                "board sd and a measurable market spread"))

    from statistics import median
    m_cv = median(g["market_sd"] / g["market_adp"] for g in got)
    b_cv = median(g["board_sd"] / g["board_adp"] for g in got)
    # THE EXCESS IN QUADRATURE, and the assumption is stated where the number is:
    # this is the market's spread MINUS as much of it as the board's own
    # within-format disagreement can explain. Never below zero — a market tighter
    # than the board is a real answer and a negative "excess" would be arithmetic
    # noise wearing a result's clothes.
    excess = (m_cv ** 2 - b_cv ** 2) ** 0.5 if m_cv > b_cv else 0.0
    bands = {}
    for lo, hi in ((0, 25), (25, 50), (50, 100), (100, int(top_n))):
        g = [x for x in got if lo < x["board_adp"] <= hi]
        if len(g) >= 3:
            bands["%d-%d" % (lo, hi)] = {
                "n": len(g),
                "market_cv": round(median(x["market_sd"] / x["market_adp"] for x in g), 3),
                "board_cv": round(median(x["board_sd"] / x["board_adp"] for x in g), 3)}
    return dict(base, status="measured", observed_at=note, n=len(got),
                market_cv=round(m_cv, 3), board_cv=round(b_cv, 3),
                ratio=round(m_cv / b_cv, 2) if b_cv else None,
                excess_cv=round(excess, 3),
                excess_share_of_variance=(round(excess ** 2 / m_cv ** 2, 3)
                                          if m_cv else None),
                by_band=bands,
                note="The market's spread is %.0f%% wider per pick than the "
                     "board's published one and the excess is NOT attributed — a "
                     "pool of mixed room sizes and a rougher crowd both widen it "
                     "and this data cannot split them. The usable conclusion is "
                     "the denomination: this sd is NOT `adp_sd` and must not be "
                     "substituted for it in survival or VONA."
                     % ((m_cv / b_cv - 1) * 100 if b_cv else 0))


#: A day-over-day move this big in the QB shift is the pool's composition
#: CHANGING, not the same pool wobbling. Declared as a fraction of the ranked
#: population for the same reason the threshold above is: a slot count means
#: different things over different pools.
COMPOSITION_DRIFT_FRACTION = 1.0 / 30.0


def format_trend(archive, board, year="2026", top_n=DRAFT_RANGE) -> dict:
    """The composition on EVERY archived day, and whether it is moving.

    ⚠ THIS IS WHY THE DAILY CHECK IS A MECHANISM AND NOT A DASHBOARD (rule 9).
    Contamination is the steady state — the market has been a mixed pool every day
    we have looked, and a step that says so every morning is a number nobody
    diffs. What a reader actually needs before the 22nd is whether it CHANGED, and
    the archive already holds every day's rows, so the comparison costs nothing
    but this function.

    IT MATTERS THAT IT COULD CHANGE. MFL's pool in mid-August is not its pool in
    draft week: best-ball and dynasty startups run early and single-QB redraft
    rooms fill in late, so the mix genuinely drifts toward our format as the
    season nears. A market that stopped being contaminated would become usable,
    and finding that out on the 23rd is finding it out too late.

    ⚠ AND A FLAT WINDOW IS NOT EVIDENCE OF STABILITY. I called the composition
    "structural" on four days at drift 0.003 — three consecutive day-intervals,
    all mid-August. That supports HAS NOT MOVED YET and nothing stronger, and the
    mechanism above is precisely a reason to expect the flat part first. Linear
    extrapolation to the 22nd gives 0.011, under the bar; linear is the assumption
    the mechanism argues against. THE OBSERVATION THAT WOULD SETTLE IT is draft
    day against the first day over the same crosswalked population — which is a
    POST-DRAFT calibration question, and a second independent reason the Aug 22
    capture matters: no provider serves a past-dated board, so the 22nd is the
    last day that observation can be taken at all.

    ⚠ EVERY DAY IS RANKED AGAINST TODAY'S BOARD, deliberately. The question is how
    the MARKET moved, and comparing each day's market against that day's board
    would fold our own rebuilds into the answer — a board edit on the 13th would
    read as the market changing composition overnight.
    """
    days = sorted({s.get("observed_at") for s in CAP._series_of(archive)
                   if str(s.get("year")) == str(year) and s.get("observed_at")})
    series = []
    for d in days:
        f = format_composition(archive, board, year, top_n, observed_at=d)
        sfx, dyn = f.get("superflex") or {}, f.get("dynasty") or {}
        # THE THIRD ARM IS TRACKED THE DAY IT IS WRITTEN (rule 14). Adding a
        # detector to `format_composition` and not to the series that watches it
        # flip would leave the market's LARGEST divergence from our format
        # measured once a day and never compared across days.
        rcp = f.get("reception") or {}
        series.append({"observed_at": d, "status": f["status"], "n": f["n"],
                       "qb_median_slots": sfx.get("qb_median_slots"),
                       "qb_median_fraction": sfx.get("qb_median_fraction"),
                       "superflex": sfx.get("detected"),
                       "age_rho_non_qb": dyn.get("age_rho_non_qb"),
                       "dynasty": dyn.get("detected"),
                       "target_share_rho_non_qb": rcp.get("target_share_rho_non_qb"),
                       "reception": rcp.get("detected")})
    usable = [s for s in series if s["status"] == "measured"
              and s["qb_median_fraction"] is not None]
    base = {"days": series, "measured_days": len(usable), "drift": None,
            "drift_threshold": round(COMPOSITION_DRIFT_FRACTION, 4),
            "moving": None, "flipped": [], "status": "unmeasured",
            "note": None}
    if len(usable) < 2:
        # ONE DAY IS NOT A TREND, AND SAYING "no drift" FROM IT WOULD BE A CHECK
        # THAT CAN ONLY EVER SAY "nothing yet" — which is a check that has not
        # looked. It says so instead.
        return dict(base, note="only %d day carries a measurable composition, so "
                               "there is nothing to compare it against — that is "
                               "the archive's depth, not a stable market"
                               % len(usable))
    first, last = usable[0], usable[-1]
    drift = last["qb_median_fraction"] - first["qb_median_fraction"]
    flipped = [k for k in ("superflex", "dynasty", "reception")
               if first[k] != last[k]]
    return dict(base, status="measured", drift=round(drift, 4),
                moving=abs(drift) >= COMPOSITION_DRIFT_FRACTION,
                flipped=flipped,
                note=("THE MARKET'S COMPOSITION IS MOVING — the quarterback shift "
                      "went from %.3f to %.3f of the ranked board between %s and "
                      "%s%s. A comparison against this market is being taken "
                      "against a different pool than it was last week."
                      % (first["qb_median_fraction"], last["qb_median_fraction"],
                         first["observed_at"], last["observed_at"],
                         (" and %s flipped" % ", ".join(flipped)) if flipped else ""))
                if abs(drift) >= COMPOSITION_DRIFT_FRACTION or flipped else
                ("HAS NOT MOVED across %d day(s): the quarterback shift moved "
                 "%.3f of the board, under the %.3f that would mean a different "
                 "pool. ⚠ THAT IS NOT 'STRUCTURAL' AND MUST NOT BE READ AS ONE. "
                 "%d consecutive day-interval(s) in mid-August support 'has not "
                 "moved yet'; the mechanism proposed for the contamination "
                 "— dynasty and best-ball startups run early, single-QB redraft "
                 "rooms fill in late — predicts the pool converges toward ours as "
                 "the draft nears, so a flat mid-August window is exactly what a "
                 "curve that bends later looks like at its flat end. The "
                 "observation that would settle it is draft day against the "
                 "first day, and no provider serves a past-dated board, so it "
                 "cannot be taken afterwards."
                 % (len(usable), drift, COMPOSITION_DRIFT_FRACTION,
                    len(usable) - 1)))
