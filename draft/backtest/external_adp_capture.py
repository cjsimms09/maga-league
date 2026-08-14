"""D3 — THE DAILY EXTERNAL ADP SNAPSHOT. The only recoverable copy of the 2026 curve.

WHY THIS EXISTS AND WHY IT IS URGENT. The as-of probe (runs 31458991195 /
31459812251) established two things about both providers:

  * NO candidate parameter bounds ADP to a past date — DAYS, START_DATE/END_DATE,
    AS_OF and FFC's `date`/`as_of` are all accepted and IGNORED (both providers
    silently swallow unknown parameters, which is why the probe judged on moved
    composition rather than status);
  * the year figure ACCUMULATES — 2025 complete reported 844 drafts against 2026
    in progress at 112 — so a finished season's ADP necessarily contains drafts
    LATER than any league that drafted in August, and cannot be that league's
    pre-draft board under F5.

Together: **the 2026 pre-draft curve is observable only while it is happening.**
Every day not captured is gone. That is the whole justification for a cron.

WHAT D3 REGISTERS, and this file implements exactly that and nothing more:
daily, the FULL board, no top-N truncation and no retention window, append-only,
deduped by date. It deliberately differs from `draft/adp_series.py` — A's HOME
staleness instrument, which caps at TOP_N=300 and MAX_DAYS=60. Those caps are
right for a staleness alarm and wrong for an evidence archive: a league's board
is the whole board, and a 60-day window would silently delete the early season.

RULE 4, ON WHY A DAILY CAPTURE IS NOT A FILTER. Capturing a superset is the
opposite of selection. The degree of freedom rule 4 governs is WHICH snapshot a
league uses, and F5 already registers that — the latest strictly before its
draft. Daily is the maximal-information cadence, the one choice that cannot be
tuned toward a result.

RULE 14, THE CONSUMER. `as_store_snapshots()` converts the stored series into the
exact shape `external_replay.ExternalAsOfStore` already consumes, so the reader
exists the day the writer does — and the strictly-before rule stays implemented
in ONE place rather than being re-derived here.
"""
from __future__ import annotations

import json
from datetime import date as _date
from datetime import timedelta as _timedelta
from pathlib import Path

import field_population as FP

SERIES = Path(__file__).resolve().parent.parent / "data" / "external_adp_series.json"
#: Anchored the same way as SERIES rather than to a module-local `HERE`, which
#: this module does not define — see `_draftable_picks`.
CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

#: The fields a snapshot is SUPPOSED to carry, declared rather than derived. Derived
#: from the rows, a field that stops being written simply stops existing and the
#: population record cannot tell you it is gone — which is the failure mode, not a
#: detail of it.
#: A day-over-day drop of at least this many players earns a note. Declared, not
#: tuned: ~5% of a ~700-player board, the size of the drop that prompted this.
ROW_DROP_FLOOR = 30

#: A day keeping less than this share of the previous day's board is a TRUNCATED
#: FETCH, not the feed moving, and it is refused BEFORE the write.
#:
#: DECLARED FROM THE FEED'S OWN OBSERVED MOVEMENT, not fitted to a failure: the
#: largest real day-over-day loss this archive has recorded is 36 of 708 rows,
#: 5.1% (`row_drop_note`, 2026-08-13). Half is ten times that, so this cannot
#: fire on drift — only on a board that mostly did not arrive.
#:
#: ⚠ IT IS A SEPARATE CONSTANT FROM `ROW_DROP_FLOOR` ON PURPOSE. That one is a
#: REPORTING threshold inside `coverage`, it runs AFTER the write, and 30 rows is
#: ordinary here. Reusing it would refuse a normal Tuesday.
COLLAPSE_KEEP_FRACTION = 0.5

#: What share of players may have a LOWER cumulative draft count than yesterday
#: before the two days stop being one cumulative series.
#:
#: ⚠ DECLARED, NOT DERIVED, AND SAYING SO IS THE POINT. This archive holds ONE
#: day of dispersion, so no day-over-day count movement has ever been observed
#: and there is nothing to derive from. The bar is set from the only related
#: figure that HAS been measured: MFL's own aggregation lag put 25 of 681 players
#: (3.7%) above `total_drafts` on 2026-08-14, so 5% sits just above the largest
#: same-day inconsistency the feed has shown. `cumulative_break` reports the
#: OBSERVED share every day precisely so this can be re-derived from real
#: movement once there is some.
CUMULATIVE_FALL_TOLERANCE = 0.05

SNAPSHOT_FIELDS = ["year", "observed_at", "rows", "total_drafts", "row_count",
                   "source_note", "dispersion"]

# The header the shipped client sends; FFC 403s Python's default. Kept in step
# with `draft/adp.py` by test, not by trust.
USER_AGENT = "mfga-league-draft-tool/1.0"


def append_snapshot(series: list, year, observed_at: str, rows: dict,
                    total_drafts=None, source_note=None, dispersion=None) -> list:
    """Add one day's board. Returns a NEW series; deduped by (year, date).

    NO TRUNCATION AND NO RETENTION WINDOW, deliberately — see the module note.
    A same-day re-run REPLACES rather than doubles, so a retried workflow cannot
    silently create two boards for one date and leave `board()` picking whichever
    sorted first.

    `rows` is {provider_player_id: adp}.

    THIS DOCSTRING USED TO SAY NAMES ARE NOT STORED, because "MFL ids are stable
    and the players export resolves them at replay time, so storing a name here
    would be a second copy of a fact that already has an owner." THAT REASONING IS
    WHY THE ARCHIVE WAS UNREADABLE. It is true only while MFL is up and still
    serving that season — which is precisely the window an archive of perishable
    days exists to outlive. The decode key now lives beside the rows, unioned by
    `merge_players` and written by `save`, and the "second copy" it costs is a few
    kilobytes against the whole point of the archive.
    """
    keep = [s for s in (series or [])
            if not (str(s.get("year")) == str(year) and s.get("observed_at") == observed_at)]
    keep.append({
        "year": str(year), "observed_at": observed_at,
        "rows": {str(k): float(v) for k, v in (rows or {}).items()},
        # COVERAGE TRAVELS WITH THE SNAPSHOT, not in a log. `total_drafts` is the
        # provider's own composition figure — the thing that showed the aggregate
        # accumulates — and a snapshot without it cannot be judged later.
        "total_drafts": total_drafts,
        # DISPERSION, BESIDE THE MEAN AND NOT INSIDE IT.
        #
        # MFL publishes minPick/maxPick/draftSelPct per player. The board's
        # MEASURED ON THE FIRST REAL SPREAD, 2026-08-14, AND IT CORRECTS
        # THIS JUSTIFICATION. Inside the draft range the board's `adp_sd` is NOT a
        # clamp: it is FFC-PUBLISHED for 142 of the 146 players priced inside pick
        # 150, with 38 distinct values across adp 0-50, 41 across 50-100 and 47
        # across 100-150. The saturation is real but lives ENTIRELY BEYOND PICK
        # 150 — 348 rows at 30.00 (`fallback-clamped`) and 122 at 15.00 — which is
        # the deep pool A's own comment calls a place where "nothing reaches a
        # decision today".
        #
        # So the capture is still worth having — a day's spread is perishable, MFL
        # is a genuine second opinion, and the deep pool IS content-free — but NOT
        # for the reason written below, which was true of the board as a whole and
        # false of the part that drafts get made from. Kept unedited so the
        # correction is visible rather than tidied away:
        #
        # `adp_sd` is a clamp that saturates in both directions — 15.00 for every
        # player at adp >= 100, and exactly 30.00 for the whole search_rank
        # fallback by construction — so it carries no player-specific information
        # while driving survival, and therefore VONA.
        #
        # A spread is a fact about a DAY, exactly as perishable as the mean it
        # sits next to, and it cannot be re-fetched afterwards. So it is captured
        # now. It is a SIBLING of `rows` rather than folded into it, because
        # `as_store_snapshots` and the replay both read `rows` as {id: adp} and
        # would start sorting dicts.
        #
        # None, not {}, when there is none: the days archived before this landed
        # (2026-08-11, -12) genuinely have no dispersion because the parser was
        # discarding it, and that is absence, not a measurement of zero spread.
        "dispersion": ({str(k): dict(v) for k, v in dispersion.items()}
                       if dispersion else None),
        "row_count": len(rows or {}),
        # WHICH MARKET PRICED THESE PLAYERS. `fetch_mfl` has always built this
        # string and it was always thrown away, so the archive held prices with no
        # record of the format that produced them — the decode-key defect one layer
        # up, and just as invisible.
        #
        # MEASURED, NOT HYPOTHETICAL: against FantasyPros on the same players, the
        # median MFL/FPROS ADP ratio is 0.98 at TE and 1.01 at DEF — and 0.514 at
        # QB, ranging 0.12 to 0.77 and varying with rank, because this pool includes
        # superflex leagues. No scalar correction repairs that. A grader reading
        # these snapshots as F5 evidence in 2027 would price quarterbacks off a
        # superflex market with nothing in the file to say so.
        #
        # It also carries the players-export failure flag, so a day whose ids may be
        # undecodable is marked in the archive rather than only in a CI log that
        # expires.
        "source_note": source_note,
    })
    keep.sort(key=lambda s: (s["year"], s["observed_at"]))
    return keep


def _series_of(obj) -> list:
    """Accept the series LIST or the ARCHIVE FILE it lives in. Refuse by name.

    THE TRAP THIS CLOSES, stepped in by its own author on 2026-08-11. `load()`
    unwraps `{"_note": ..., "series": [...]}` correctly, but a caller doing
    `json.load(open(SERIES))` by hand gets the WRAPPER — and iterating a dict
    yields its KEYS, so every snapshot became the string "_note" and the reader
    died on `'str' object has no attribute 'get'`.

    Loud, and it named itself, which is the only reason it cost minutes rather
    than a run. But the wiring that did it was mine, in the ingest workflow, and a
    reader that only works when the caller remembers to unwrap is a reader with a
    trap in it. Anything that is neither shape RAISES rather than returning [] —
    an empty series would report every league as `F4.no_pre_draft_adp`, which is a
    true-looking statement about the leagues and a false one about the archive.
    """
    if obj is None:
        return []
    if isinstance(obj, dict):
        return list(obj.get("series") or [])
    if isinstance(obj, list):
        return list(obj)
    raise TypeError(
        "external ADP series must be the series list or the archive dict, got %s. "
        "Returning an empty series here would report every league as having no "
        "pre-draft ADP, which is a statement about the leagues and not about this "
        "argument." % type(obj).__name__)


def as_store_snapshots(series: list, year, ids) -> list:
    """The stored series -> `ExternalAsOfStore`'s input shape, for one season.

    THE READER, BUILT WITH THE WRITER (rule 14). It deliberately does NOT
    implement "latest strictly before the draft" — `ExternalAsOfStore.board()`
    owns that rule, and a second implementation here is how two derivation paths
    for one F5 decision would come to disagree.

    `ids` MAPS THE SOURCE'S PLAYER ID TO OURS, AND IT IS REQUIRED. There is no
    default and deliberately no pass-through, because the pass-through is the
    defect this argument exists to end:

    THE ARCHIVE STORES MFL'S OWN IDS — that is correct for an archive, which
    should record what the source said and not what our crosswalk believed on the
    day. But this function used to hand those ids over under the key `player_id`,
    which every consumer downstream reads as OUR sleeper id. Nothing raised.
    Measured on the real 2026-08-12 capture: 15 of 708 MFL ids collide numerically
    with a board id and ALL FIFTEEN ARE FALSE MATCHES — MFL's #1 overall pick
    resolves to a fourth-string college tight end.

    The consequence is not a small board, it is a fictional one.
    `external_replay_run.decision_contexts` fills `taken` from the PICKS (our ids)
    and keys the board from here (MFL's), so `i not in taken` is always true and
    THE AVAILABLE SET NEVER SHRINKS. Every drafted player stays draftable for the
    whole replay and the baseline is graded against a draft in which nobody was
    ever picked. Reproduced: available goes 80 -> 66 -> 51 across 30 picks when the
    namespaces agree, and 80 -> 80 -> 80 when they do not.

    An id with no entry in `ids` is DROPPED, because a row our board cannot read
    is worse than an absent one. The count of those drops belongs to
    `crosswalk_map`, which is where the misses are actually known and reported —
    putting a number here would mean two places counting one thing.
    """
    if ids is None:
        raise ValueError(
            "as_store_snapshots needs an id map: the archive holds the SOURCE's "
            "player ids and every consumer reads `player_id` as OURS. Handing them "
            "over untranslated does not fail loudly — it produces a replay where no "
            "drafted player is ever removed from the board. Build one with "
            "crosswalk_map(archive, sleeper_index).")
    xw = dict(ids)
    return [{"observed_at": s["observed_at"],
             "rows": [{"player_id": xw[pid], "adp": adp}
                      for pid, adp in (s.get("rows") or {}).items() if pid in xw]}
            for s in _series_of(series) if str(s.get("year")) == str(year)]


#: How many unmatched names to NAME in the crosswalk report. Same rule as
#: MISSING_DAYS_LISTED: the count is exact, only the list is capped.
UNMATCHED_LISTED = 12


#: Expected range of n iid standard normals, d_n. Exact table where the sample is
#: thinnest and the Blom approximation is worst; the approximation above it.
_D_N = {2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704, 8: 2.847,
        9: 2.970, 10: 3.078}

#: Below this selection rate the observed min/max is cut by drafts simply ENDING
#: before the player was taken, so the range understates. Declared from the shape
#: of the thing rather than tuned: at 50% the median draft did not take him.
#:
#: ⚠ 50.0 IS ON THE PERCENT SCALE, which is an ASSUMPTION about MFL's feed and not
#: yet a measurement. See `sel_pct_units`.
TRUNCATION_SEL_PCT = 50.0

#: How far the implied rate may sit from the published one and still be called the
#: same quantity. MFL publishes `draftSelPct` rounded to whole percents ("70"), so
#: at a small denominator the rounding alone moves the ratio by several percent —
#: this is a UNITS test (1x vs 100x), not a precision one, and the band is wide on
#: purpose so it answers the question it was built for and no other.
SEL_PCT_UNITS_TOLERANCE = 0.15


def sel_pct_units(snapshot: dict) -> dict:
    """Is `sel_pct` a PERCENT or a FRACTION? Answered from the day, not assumed.

    THE ONE THING ABOUT THE FEED WE READ BUT NEVER CHECKED. `TRUNCATION_SEL_PCT`
    is 50.0 and the note prints `%.1f%%`, both of which read `draftSelPct` as a
    whole percent. That reading comes from ONE row quoted in a comment — no
    captured MFL response in this repo carries the field, and MFL is unreachable
    from here (the proxy 403s CONNECT), so it could not be verified before the
    first real capture.

    IT IS VERIFIABLE FROM WHAT WE ALREADY STORE, which is the point. The snapshot
    carries `drafts` (selections) per player and `total_drafts` for the report, so
    the rate is DERIVABLE — and a derived rate against a published one settles the
    scale on the first day rather than never.

    WHY THIS IS A LABEL CHECK AND NOT AN ALARM, stated so nobody reads it as worse
    than it is. `sd` does not use `sel_pct` at all: the estimator is
    `(max - min) / d_n`. A wrong scale mislabels `truncated` and prints a wrong
    figure in a note; it does not move a single number anyone drafts on. And the
    raw value is archived verbatim, so the interpretation can be corrected later
    over every day already captured. That is the design working — capture raw,
    interpret afterwards — and this makes the interpretation checkable instead of
    permanent.

    FOUR ANSWERS, and "unmeasured" is one of them rather than a quiet pass:

      percent      the published figure matches drafts/total_drafts * 100
      fraction     it matches drafts/total_drafts — every threshold here is 100x
                   wrong and every row would read as truncated
      disagrees    neither. `draftSelPct` is not the selection rate we think it
                   is, and NOTHING should be inferred from it until it is known
      unmeasured   no dispersion, no `total_drafts`, or no row with both — the
                   two days before the parser kept the spread are exactly this,
                   and they are not evidence of anything
    """
    out = {"verdict": None, "rows": 0, "median_ratio": None,
           "expected_percent": True, "note": None}
    disp = (snapshot or {}).get("dispersion") or {}
    total = (snapshot or {}).get("total_drafts")
    try:
        total = float(total)
    except (TypeError, ValueError):
        total = None
    if not disp or not total or total <= 0:
        return dict(out, verdict="unmeasured",
                    note="no dispersion or no total_drafts on this day — nothing "
                         "to derive the rate from")

    ratios = []
    for rec in disp.values():
        sel, n = (rec or {}).get("sel_pct"), (rec or {}).get("drafts")
        try:
            sel, n = float(sel), float(n)
        except (TypeError, ValueError):
            continue
        # A player with no selections cannot imply a rate, and a published zero
        # divides into nothing. Both are skipped rather than counted as agreement.
        if n <= 0 or sel <= 0:
            continue
        ratios.append(sel / (n / total * 100.0))
    if not ratios:
        return dict(out, verdict="unmeasured",
                    note="no row carried both a selection count and a published "
                         "rate — the scale is still unestablished")

    from statistics import median
    med = median(ratios)
    out = dict(out, rows=len(ratios), median_ratio=med)
    if abs(med - 1.0) <= SEL_PCT_UNITS_TOLERANCE:
        return dict(out, verdict="percent",
                    note="published rate matches drafts/total_drafts x 100 across "
                         "%d rows — TRUNCATION_SEL_PCT=%.1f is on the right scale"
                         % (len(ratios), TRUNCATION_SEL_PCT))
    if abs(med - 0.01) <= SEL_PCT_UNITS_TOLERANCE / 100.0:
        return dict(out, verdict="fraction", expected_percent=False,
                    note="published rate is a FRACTION, not a percent — "
                         "TRUNCATION_SEL_PCT=%.1f is 100x too high, so every row "
                         "reads as truncated and every note prints a rate 100x "
                         "too small. The stored spread is unaffected: `sd` does "
                         "not use sel_pct, and the raw value is archived, so this "
                         "is re-derivable over every day already captured."
                         % TRUNCATION_SEL_PCT)
    return dict(out, verdict="disagrees", expected_percent=False,
                note="`draftSelPct` is neither drafts/total_drafts nor 100x it "
                     "(median ratio %.4g over %d rows) — it is not the selection "
                     "rate we take it for. Infer NOTHING from it until this is "
                     "understood; `sd` is unaffected and the raw value is archived."
                     % (med, len(ratios)))


def _expected_range(n: int) -> float:
    """d_n — Blom's approximation above the exact table: 2 * Phi^-1((n-0.375)/(n+0.25)).

    Checked against the published table where both exist: n=10 gives 3.094 vs
    3.078, n=30 gives 4.081 vs 4.086. It is used only above n=10 for that reason.
    """
    if n in _D_N:
        return _D_N[n]
    from statistics import NormalDist
    return 2.0 * NormalDist().inv_cdf((n - 0.375) / (n + 0.25))


def spread_from_dispersion(row: dict, *, total_drafts=None) -> dict:
    """MFL's published min/max pick -> an estimated sd of that player's pick, or None.

    THE READER FOR TOMORROW'S DATA, and rule 14 on my own newest work. A's item #1
    is that 94.6% of the board's `adp_sd` sits on two values — 1,418 players at
    exactly 30.0 and 246 at exactly 15.0, 71 distinct values across 1,759 players.
    My answer was to capture MFL's real dispersion. CAPTURING IS NOT FIXING: the
    spread lands tomorrow and nothing reads it.

    THE ESTIMATOR IS THE RANGE ONE — sd ~= (max - min) / d_n — because min/max is
    what MFL publishes. Its weaknesses are real and are stated rather than buried:

      * IT IS DRIVEN ENTIRELY BY TWO OBSERVATIONS. One manager reaching four rounds
        early moves it as much as the other n-1 picks combined. It is the crudest
        defensible estimator, chosen because the alternative is the clamp.
      * n IS THE SELECTION COUNT, NOT THE DRAFT COUNT. MFL's bounds are over the
        drafts the player was SELECTED in. A player taken in 7 of 125 drafts has a
        range over SEVEN observations; charging him d_125 would divide by 5.1
        instead of 2.7 and halve every deep player's spread — reintroducing the
        flatness this exists to cure, while looking measured.
      * IT IS A LOWER BOUND FOR A RARELY-SELECTED PLAYER. He is observed only where
        he was picked; the drafts that would have taken him later simply ended, so
        the range is truncated. Without saying so, the deepest and least-known
        players would report the TIGHTEST spreads — the exact inversion this is
        meant to correct.

    A NUMBER MEANS A NUMBER; NULL MEANS THE THING NEEDED TO CALCULATE IT DOES NOT
    EXIST; STATUS SAYS WHY (A's invariant). One selection gives a range of zero,
    and returning 0.0 would assert the market is CERTAIN about a player it has seen
    once — the most confident number on the board resting on the least evidence.

    ⚠ THIS IS NOT `adp_sd` AND MUST NOT BE SUBSTITUTED FOR IT — measured, not
    asserted, and it is why `scale` and `comparable_to_board_adp_sd` ride on every
    row this returns rather than sitting in a docstring nobody copies. Inside pick
    150 this figure runs ~2.7x the board's FFC-published `adp_sd` PER PICK, on 144
    paired players (`board_vs_market.spread_composition`, 2026-08-14). Two
    explanations were killed before the honest one survived:

      * SKEW IN THIS ESTIMATOR — REFUTED. The provider's mean sits 0.35-0.39 of the
        way through its own observed range rather than at 0.50, so the pick
        distribution really is right-skewed; but calibrated to that skew the range
        estimator comes back essentially UNBIASED (x1.02 at n=125). Real, and not
        the cause.
      * SUPERFLEX WIDENING QUARTERBACKS — REFUTED for the SPREAD (it is confirmed
        in the MEAN, at a median 49.8 rank slots). Were format mixing showing up as
        spread it would be worst at QB; QB has the SMALLEST ratio of any position.

    What is left is a spread PROPORTIONAL to the pick number on both sides, with
    the provider's coefficient ~2.7x ours — the shape a pool of mixed room sizes
    produces mechanically. The excess is deliberately not attributed further: a
    rougher crowd widens it too and what we hold cannot split the two. The
    consequence stands either way — `survival.js` reads
    `normalCdf(currentPick, adp, adp_sd)`, and feeding this number into that
    denominator would triple every survival curve's width on a change that
    describes MFL's league mix rather than our room.
    """
    lo, hi = row.get("min_pick"), row.get("max_pick")
    n = row.get("drafts")
    base = {"sd": None, "n": None, "basis": "range/d_n", "truncated": None,
            "status": None, "note": None,
            # THE DENOMINATION TRAVELS WITH THE NUMBER. A consumer that reads
            # `["sd"]` and nothing else is the exact failure this lane has now
            # paid for repeatedly; a consumer that copies the dict carries the
            # refusal with it whether or not anybody read the docstring.
            "scale": "provider-internal picks (pooled formats and room sizes)",
            "comparable_to_board_adp_sd": False}
    if lo is None or hi is None:
        return dict(base, status="absent",
                    note="MFL published no min/max for this player — absent, not zero")
    try:
        n = int(n) if n is not None else None
    except (TypeError, ValueError):
        n = None
    if not n or n < 2:
        return dict(base, n=n, status="unmeasurable",
                    note="selected in one draft or fewer — a range needs two "
                         "observations, and 0.0 would claim certainty from the "
                         "thinnest evidence on the board")

    sd = (float(hi) - float(lo)) / _expected_range(n)
    sel = row.get("sel_pct")
    truncated = sel is not None and float(sel) < TRUNCATION_SEL_PCT
    return dict(base, sd=sd, n=n, truncated=truncated, status="measured",
                note=("selected in %.1f%% of drafts, so the observed range is cut by "
                      "drafts ENDING before he was taken — this sd is a LOWER bound"
                      % float(sel)) if truncated else None)


def integrity(archive) -> dict:
    """Is this archive internally consistent? Checked BEFORE a write, not after.

    THE ARCHIVE IS APPEND-ONLY AND ITS DAYS ARE UNREFETCHABLE, so a corrupt
    snapshot is permanent — there is no provider to re-ask, and "notice it later
    and fix it" is not available the way it is for a regenerable artifact. That is
    why this runs at write time and refuses, rather than reporting afterwards.

    FATAL vs REPORTED is the whole design, and getting it wrong in either
    direction is worse than not checking:

      FATAL — a code bug or corruption, and the day is wrong whatever we do with
        it. `row_count` disagreeing with `rows` (every instrument reads that
        count, so they would all describe a board nobody captured); two boards for
        one date (`board()` silently takes whichever sorts first); a pick number
        that is not a positive number; a spread for a player the day did not
        price, which is a join that went wrong.

      REPORTED — a fact about the FEED, not about us. MFL can price a player its
        own players export omits. Refusing the day over one unresolvable row would
        discard a whole unrefetchable board to protect a lookup: the alarm
        destroying what it watches, which this file has already learned once at
        the board-pin step.
    """
    ser = _series_of(archive)
    players = players_of(archive) if isinstance(archive, dict) else {}
    out = {"snapshots": len(ser), "fatal": [], "reported": [],
           "ok": None, "status": None}
    if not ser:
        # NOTHING TO CHECK IS NOT CLEAN. `ok: True` here would report a healthy
        # archive on the exact run where the file failed to load.
        return dict(out, status="unmeasured")

    seen = set()
    for s in ser:
        day = (str(s.get("year")), s.get("observed_at"))
        rows = s.get("rows") or {}
        if day in seen:
            out["fatal"].append({"kind": "duplicate_day", "day": day})
        seen.add(day)
        if s.get("row_count") != len(rows):
            out["fatal"].append({"kind": "row_count_mismatch", "day": day,
                                 "says": s.get("row_count"), "has": len(rows)})
        bad = [p for p, a in rows.items()
               if not isinstance(a, (int, float)) or isinstance(a, bool) or a <= 0]
        if bad:
            out["fatal"].append({"kind": "bad_adp", "day": day, "n": len(bad),
                                 "sample": sorted(bad)[:5]})
        orphan = [p for p in (s.get("dispersion") or {}) if p not in rows]
        if orphan:
            out["fatal"].append({"kind": "dispersion_orphan", "day": day,
                                 "n": len(orphan), "sample": sorted(orphan)[:5]})
        if players:
            unknown = [p for p in rows if p not in players]
            if unknown:
                out["reported"].append({"kind": "undecodable_id", "day": day,
                                        "n": len(unknown),
                                        "sample": sorted(unknown)[:5]})
    out["ok"] = not out["fatal"]
    out["status"] = "clean" if out["ok"] else "corrupt"
    return out


def blocking_fatal(ig, year, observed_at) -> list:
    """Of everything `integrity` found wrong, what may stop TODAY reaching disk.

    ONLY EVIDENCE ABOUT TODAY. `integrity` judges the WHOLE archive, and
    `capture()` was refusing to write whenever ANY day in it was fatal — so one
    corrupt day, from any cause, would have blocked EVERY SUBSEQUENT CAPTURE
    FOREVER. Not one day lost: all of them, silently, until a human noticed the
    workflow going red. The guard that exists to protect an unrefetchable archive
    was one bad row away from being the thing that emptied it.

    That is the board-pin lesson for the fourth time in this file, and it is the
    largest instance of it: the previous three could cost a day, this one could
    cost the rest of them.

    WHICH ERROR IS WORSE, THE SAME WAY IT IS DECIDED EVERYWHERE ELSE HERE. Today's
    board is perishable and unrepeatable. Yesterday's corruption is already on
    disk, already in git, and already caught by the standing CI check that runs
    `integrity` over the committed archive — refusing to write today does not
    unwrite it, does not fix it, and does not even report it any louder. It only
    adds a second, permanent loss to a recoverable one.

    A FINDING THAT CANNOT NAME A DAY DOES NOT BLOCK EITHER, for the same reason:
    it is not evidence about today. It is printed with the rest. Every fatal kind
    that exists today carries `day`; a future archive-wide check that does not
    must be able to say what it means for the day in hand before it is allowed to
    destroy one.

    Corruption in TODAY'S snapshot still refuses, unchanged — that is the case the
    check was built for, and it is the only one where refusing prevents anything.
    """
    today = (str(year), str(observed_at))
    out = []
    for f in ((ig or {}).get("fatal") or []):
        day = f.get("day")
        if isinstance(day, (list, tuple)) and tuple(str(x) for x in day) == today:
            out.append(f)
    return out


#: What `mfl_adp.parse` looks for when it extracts a spread. Named here so a
#: failure can be reported as a DIFF against what arrived, rather than as a
#: request to go and read the parser.
DISPERSION_SOURCE_KEYS = ("minPick", "maxPick", "draftSelPct", "draftsSelectedIn")


def dispersion_diagnosis(raw_rows, dispersion: dict):
    """No spread? Say which keys MFL actually sent. Returns None when it worked.

    MFL IS UNREACHABLE FROM THE DEV ENVIRONMENT — verified via the agent proxy,
    which reports `connect_rejected` / "gateway answered 403 to CONNECT" for
    api.myfantasyleague.com:443, while nflverse over GitHub is allowed. So the
    first contact between our field names and MFL's actual response happens in
    the scheduled run, and cannot be rehearsed.

    `dispersion_health` already fires once when nothing arrives. That says the
    parser never matched; it does not say what to change. On a feed whose days
    cannot be refetched, the gap between "we lost a day" and "we lost a day AND
    still have to guess" is another day — so the keys that DID arrive are
    recorded beside the ones we looked for, and the fix becomes a diff.

    An empty fetch is reported as an empty fetch. Pointing the reader at the
    parser when the response was blank wastes exactly the day this exists to save.
    """
    if dispersion:
        return None
    rows = list(raw_rows or [])
    if not rows:
        return ("NO SPREAD: the response carried no rows at all — this is a fetch "
                "failure, not a field-name mismatch; do not start in mfl_adp.parse")
    # EVERY ROW, NOT THE FIRST. MFL need not send identical keys for a kicker and
    # a quarterback, and the row that explains it may not be the one sampled.
    seen = sorted({k for r in rows if isinstance(r, dict) for k in r})
    return ("NO SPREAD from %d row(s). LOOKED FOR %s. MFL SENT %s. If the names "
            "differ, that is the whole fix — update mfl_adp.parse and the next "
            "capture carries it."
            % (len(rows), ", ".join(DISPERSION_SOURCE_KEYS), ", ".join(seen[:24])))


def spread_summary(dispersion: dict) -> dict:
    """A whole day's spreads — because the claim under test is about a DAY.

    "Does a real spread beat the clamp" is not answerable one player at a time. The
    board today carries 71 distinct `adp_sd` values across 1,759 players with 94.6%
    on two of them, so the number that decides whether tomorrow is any better is
    DISTINCT VALUES — not a mean, which a fully collapsed distribution reports
    perfectly healthily, and which is how the clamp survived this long.

    UNTIL TOMORROW THE ESTIMATOR IS UNVALIDATED AGAINST REAL DATA, and there is no
    stored feed carrying both a published sd and min/max to check it against. This
    is what makes the first real capture the validation instead of a hope.
    """
    rows = [spread_from_dispersion(v) for v in (dispersion or {}).values()]
    got = [r for r in rows if r["status"] == "measured"]
    out = {"players": len(rows),
           "measured": len(got),
           "unmeasurable": sum(1 for r in rows if r["status"] == "unmeasurable"),
           "absent": sum(1 for r in rows if r["status"] == "absent"),
           "truncated": sum(1 for r in got if r["truncated"]),
           "distinct": None, "median_sd": None, "status": None}
    if not got:
        # ZERO MEASURED IS NOT A FLAT SPREAD. It is nothing to measure, and
        # `distinct: 0` would read as a collapse we had observed.
        return dict(out, status="unmeasured")
    from statistics import median
    sds = [r["sd"] for r in got]
    return dict(out, status="measured",
                distinct=len({round(s, 6) for s in sds}),
                median_sd=median(sds))


#: The first day a capture COULD carry a spread — the day the dispersion change
#: landed. DECLARED, not derived, because it cannot be: a snapshot with no
#: dispersion looks identical whether MFL published none or our parser was
#: discarding it, and the three days captured before this date are the second case.
#: Judging them would make this alarm red on its own first run, which is how a
#: real alarm gets muted by its second.
DISPERSION_SINCE = "2026-08-14"


def dispersion_health(series: list, year) -> dict:
    """Did the spread arrive — and if not, is that our parser or MFL's feed?

    A COUNT OF ZERO HAS TWO CAUSES AND THEY POINT IN OPPOSITE DIRECTIONS. Zero on
    the first attempt is evidence about `mfl_adp.parse`: `minPick`, `maxPick`,
    `draftSelPct` are read from the same response dict as `averagePick`, which
    provably works, so the shape is right and only the field names are unproven.
    Zero after a fortnight of non-zero is evidence about the FEED. One number
    cannot say which, and it is the only thing worth knowing on the morning it
    breaks — so the state names the suspect.

    `dispersion_rows: 0` already prints in the capture log. That is a dashboard
    reading nobody diffs (rule 9). The spread is as perishable as the mean it sits
    beside; a silent zero costs a day per morning nobody looks.
    """
    ser = sorted((s for s in _series_of(series) if str(s.get("year")) == str(year)),
                 key=lambda s: s.get("observed_at") or "")
    judged = [s for s in ser if (s.get("observed_at") or "") >= DISPERSION_SINCE]
    base = {"year": str(year), "since": DISPERSION_SINCE,
            "judged_snapshots": len(judged), "rows": None, "adp_rows": None,
            "coverage": None, "state": None, "note": None}
    if not judged:
        return dict(base, state="unmeasured",
                    note="UNMEASURED — no snapshot on or after %s, the first day a "
                         "capture could carry a spread. The days before it have none "
                         "because the parser was discarding it, which is our history "
                         "rather than a fault to diagnose." % DISPERSION_SINCE)

    def n_of(s):
        # ROWS WITH A BOUND, not rows with anything. This alarm is about the
        # SPREAD arriving; counting selection-count-only rows would report full
        # coverage on a feed that sent no bounds at all — muting the escalation
        # that exists for precisely that case.
        return sum(1 for v in (s.get("dispersion") or {}).values()
                   if any((v or {}).get(k) is not None for k in DISPERSION_BOUNDS))

    latest = judged[-1]
    rows, adp_rows = n_of(latest), int(latest.get("row_count") or 0)
    out = dict(base, rows=rows, adp_rows=adp_rows,
               coverage=(rows / adp_rows) if adp_rows else None)
    if rows:
        return dict(out, state="present")

    earlier = [s for s in judged[:-1] if n_of(s)]
    if earlier:
        return dict(out, state="stopped",
                    note="the spread STOPPED arriving. It was last present on %s, so "
                         "the parser worked and something changed at MFL — look at the "
                         "feed, not at `mfl_adp.parse`."
                         % earlier[-1].get("observed_at"))
    return dict(out, state="never_captured",
                note="the spread has NEVER been captured in %d judged snapshot(s). "
                     "The parser has therefore never matched, so suspect the field "
                     "names in `mfl_adp.parse` — `minPick`, `maxPick`, `draftSelPct` "
                     "— before suspecting MFL. They sit in the same response dict as "
                     "`averagePick`, which works, so the shape is right and only the "
                     "names are unproven." % len(judged))


def cumulative_break(earlier: dict, later: dict) -> dict:
    """Are these two days ONE cumulative series? -> verdict, before any marginal.

    ⚠ THE GAP THIS CLOSES IS BETWEEN A PER-PLAYER GUARD AND A POPULATION ONE, and
    it is the shape this lane keeps finding. `marginal_adp` already refuses an
    INDIVIDUAL player whose count fell (`refused_count_fell`) — correct, and it
    handles MFL's aggregation lag, which moves a handful of players. It does NOT
    handle the case where the provider RE-SCOPES ITS SAMPLE: a rolling window
    advancing, a season boundary, a format filter changing. Then counts fall for
    MANY players at once, the per-player guard silently drops every one of them,
    and the marginal is computed from the survivors — a real-looking number over
    a population selected by the very thing that broke.

    `new = drafts1 - drafts0` is only "what today's drafters did" while the two
    counts are readings of the same accumulating total. That is an ASSUMPTION
    about the provider, it has never been checked, and tomorrow is the first day
    two dispersion days exist to check it with. Built before then on purpose: a
    guard that arrives after the day it was needed is a post-mortem.
    """
    e = (earlier or {}).get("dispersion") or {}
    l = (later or {}).get("dispersion") or {}
    shared = [k for k in l if k in e]
    base = {"status": "unmeasured", "shared": len(shared), "fell": 0,
            "fell_share": None, "worst_fall": None, "usable": None,
            "tolerance": CUMULATIVE_FALL_TOLERANCE,
            "total_drafts_fell": None, "note": None}
    if not shared:
        # ⚠ NOT "no falls, all clear". Two days with no player in common cannot
        # be judged, and the days before dispersion landed have no counts at all.
        return dict(base, note="the two days share no player carrying a draft "
                               "count, so nothing was compared — that is the "
                               "archive's shape, not a clean result")
    falls = []
    for k in shared:
        a, b = (e[k] or {}).get("drafts"), (l[k] or {}).get("drafts")
        if a is None or b is None:
            continue
        if b < a:
            falls.append((k, a - b))
    counted = [k for k in shared
               if (e[k] or {}).get("drafts") is not None
               and (l[k] or {}).get("drafts") is not None]
    if not counted:
        return dict(base, note="no shared player carries a count on BOTH days")
    share = len(falls) / float(len(counted))
    td0, td1 = (earlier or {}).get("total_drafts"), (later or {}).get("total_drafts")
    td_fell = (None if td0 is None or td1 is None else bool(td1 < td0))
    usable = share <= CUMULATIVE_FALL_TOLERANCE and not td_fell
    return dict(base, status="measured", shared=len(counted), fell=len(falls),
                fell_share=round(share, 4),
                worst_fall=(max(x for _k, x in falls) if falls else 0),
                usable=usable, total_drafts_fell=td_fell,
                note=("%d of %d shared players (%.1f%%) have FEWER cumulative "
                      "drafts than yesterday%s. Above the %.0f%% tolerance, so "
                      "these two days are not one accumulating series and "
                      "`new = drafts1 - drafts0` is not 'what today's drafters "
                      "did' — the marginal must not be derived across them."
                      % (len(falls), len(counted), 100.0 * share,
                         " and the provider's own total_drafts FELL" if td_fell else "",
                         100.0 * CUMULATIVE_FALL_TOLERANCE))
                if not usable else
                ("%d of %d shared players (%.1f%%) fell, within the %.0f%% "
                 "tolerance — consistent with the aggregation lag already "
                 "measured on this feed, and the two days read as one series."
                 % (len(falls), len(counted), 100.0 * share,
                    100.0 * CUMULATIVE_FALL_TOLERANCE)))


def marginal_adp(earlier: dict, later: dict) -> dict:
    """What TODAY'S drafters did — recovered exactly from two cumulative days.

    THE PROBLEM THIS SOLVES, MEASURED RATHER THAN ASSUMED. On 2026-08-14 the
    published ADP moved a median 0.17-0.21 picks a day inside the top 150, which
    reads as a market that has made up its mind. It is not: `total_drafts` went
    115 -> 119 -> 125, so a day's new drafts carry 3-5% of the weight and the
    published mean CANNOT move even if every new drafter behaved differently. The
    calm is arithmetic. Six days from a draft, the 3-5% is the only part anybody
    would act on, and it is the part the headline number averages away.

    A MEAN TIMES ITS COUNT IS A SUM, so two cumulative snapshots contain the
    interval between them exactly — no smoothing, no estimation, no window:

        new      = drafts1 - drafts0
        marginal = (adp1*drafts1 - adp0*drafts0) / new

    THE DENOMINATOR IS `drafts`, AND NEVER `sel_pct * total_drafts`. Both phrases
    say "the number of drafts he was selected in", which is exactly the coincidence
    A's first criterion exists to catch — say the comparison out loud and the two
    part company. MFL publishes `draftSelPct` rounded to whole percents, so its
    quantum is total_drafts/100: 1.25 drafts today, and ~50 at the 5011-draft depth
    MFL reported for a finished 2023. The daily increment does not grow with the
    season. The rounding error does. `draftsSelectedIn` is an exact integer sitting
    in the same row, and `dispersion_of` has been archiving it since 2026-08-14.

    RETURNS, per player kept:
      `marginal_adp`   the mean pick of the NEW selections alone
      `new_selections` the exact integer increment
      `published_move` adp1 - adp0, beside it rather than instead of it, because
                       the gap between the two IS the finding
      `outside_observed_range`  the falsification arm — see below

    THE ONE FALSIFIABLE CHECK THIS ADMITS, and it costs nothing. Every new
    selection is a real pick, so their mean must lie inside the LATER day's own
    observed [min_pick, max_pick], which already contains them. If it does not, the
    premise is false — `averagePick` is not averaged over `draftsSelectedIn`, or
    the two snapshots are not the same accumulation. That converts "MFL's fields
    mean what their names say" from an assumption into a measurement, on the first
    morning two snapshots exist. The offending row is REPORTED, NOT DROPPED
    (rule 17a): the number is the evidence, and deleting it leaves the alarm with
    nothing to point at.

    UNMEASURED IS A VERDICT, NOT A ZERO. Every day archived before 2026-08-14 has
    no dispersion, and calling their marginal move zero would make the entire
    back-archive look like a settled market.
    """
    a, b = earlier or {}, later or {}
    da, db = a.get("observed_at"), b.get("observed_at")
    # REFUSED, NOT SORTED. Swapping the arguments returns the exact mirror image
    # rather than failing, so a caller who reads them the wrong way round gets a
    # confident number for a day that ran backwards. Sorting internally would be
    # worse: it makes the argument order stop meaning anything, and
    # `published_move` would quietly describe a different pair than the caller
    # named.
    if da and db and str(da) >= str(db):
        raise ValueError(
            "marginal_adp(earlier, later): %r is not earlier than %r. Refusing "
            "rather than reordering — the sign of every move here depends on "
            "which day the caller believes is which." % (da, db))

    out = {"status": None, "earlier": da, "later": db, "rows": {},
           "skipped_no_new_selections": 0, "refused_count_fell": 0,
           "outside_observed_range": [], "note": None}

    dispa, dispb = a.get("dispersion") or {}, b.get("dispersion") or {}
    if not dispa or not dispb:
        which = [n for n, d in (("earlier", dispa), ("later", dispb)) if not d]
        return dict(out, status="unmeasured",
                    note="no `dispersion` on the %s snapshot, so the per-player "
                         "selection count that makes this exact is absent. Days "
                         "captured before %s have none, and their marginal move is "
                         "UNKNOWN rather than zero."
                         % (" and ".join(which), DISPERSION_SINCE))

    rowsa, rowsb = a.get("rows") or {}, b.get("rows") or {}
    for pid, recb in dispb.items():
        reca = dispa.get(pid)
        if reca is None or pid not in rowsa or pid not in rowsb:
            continue
        try:
            n0, n1 = int(reca.get("drafts")), int(recb.get("drafts"))
            adp0, adp1 = float(rowsa[pid]), float(rowsb[pid])
        except (TypeError, ValueError):
            continue
        if n1 < n0:
            out["refused_count_fell"] += 1
            continue
        if n1 == n0:
            out["skipped_no_new_selections"] += 1
            continue
        new = n1 - n0
        marginal = (adp1 * n1 - adp0 * n0) / new
        lo, hi = recb.get("min_pick"), recb.get("max_pick")
        outside = False
        try:
            # A bound the source did not publish cannot falsify anything, so a
            # missing one is skipped rather than treated as an open range that
            # always passes — the check has to be able to say "not checked".
            if lo is not None and marginal < float(lo) - 1e-9:
                outside = True
            if hi is not None and marginal > float(hi) + 1e-9:
                outside = True
        except (TypeError, ValueError):
            outside = False
        if outside:
            out["outside_observed_range"].append(pid)
        out["rows"][pid] = {
            "new_selections": new,
            "marginal_adp": marginal,
            "published_move": adp1 - adp0,
            # BOTH PRICES TRAVEL WITH THE ROW. A consumer that has to re-join
            # against `rows` to say what the board is charging is a second
            # derivation of a fact this function already held, and the re-join is
            # where the wrong day gets picked.
            "adp_earlier": adp0,
            "adp_later": adp1,
            "drafts": [n0, n1],
            "outside_observed_range": outside,
        }
    out["outside_observed_range"].sort()
    out["status"] = "measured"
    if out["outside_observed_range"]:
        out["note"] = (
            "%d player(s) derive a marginal ADP outside the LATER day's own "
            "observed [min_pick, max_pick]. A mean of real picks cannot do that, "
            "so the decomposition's premise is wrong — most likely `averagePick` "
            "is not averaged over `draftsSelectedIn`, or the two snapshots are not "
            "the same accumulation. Infer nothing from any row here until that is "
            "settled; the rows are kept because they are the evidence."
            % len(out["outside_observed_range"]))
    return out


#: Below this many new selections, the "mean of the new picks" is one person's
#: pick wearing the authority of an average. Declared from the cadence, not tuned:
#: `total_drafts` gained 4 and 6 over the two most recent days, so requiring 3
#: means a majority of the day's drafts took him. Rows below it are KEPT and
#: reported — they are simply not allowed to lead, because ranking by distance
#: from the price puts the thinnest player on the board first every morning.
MIN_NEW_SELECTIONS = 3


def _total_drafts(snapshot):
    """The report's own draft count, or None. NEVER 0 for a missing field: the
    window arithmetic below subtracts these, and a missing count read as zero
    would manufacture a window as wide as the whole season."""
    try:
        v = (snapshot or {}).get("total_drafts")
        return None if v is None else int(v)
    except (TypeError, ValueError):
        return None


def undecoded_inside_draft(report: dict, rows: dict, draftable=None) -> dict:
    """Of the players undecoded AT A ROSTERED POSITION, how many can we draft?

    ⚠ THE NUMBER THIS REFINES IS PRINTED EVERY MORNING AND GATED BY NOTHING.
    `_classify_undraftable` already does the hard part — it separates a keeper and
    an IDP from a player we actually lost, and its own docstring says the survivor
    count is "printed in the capture summary every morning and nobody could act on
    it". Measured on the live archive that count is 11, and ALL ELEVEN sit beyond
    our 150-pick draft; the shallowest is Travis Hunter at ADP 153.0.

    SO THE WHOLE-BOARD COUNT CANNOT BE GATED AT ZERO — it is 11 today and failing
    every morning over Drew Lock at ADP 444 would train everyone to ignore it.
    Restricted to the range this room actually drafts it IS zero, which makes it
    gateable, and the three-pick margin under Travis Hunter is the reason to gate
    it now rather than after the draft.

    This builds ON that classification and does not repeat it: I started writing a
    parallel classifier and it shadowed `rostered_positions`, broke six passing
    tests, and re-derived a finding this module's docstring already records. One
    definition, not two that drift.
    """
    ids = report.get("no_sleeper_match_draftable_ids") or []
    if draftable is None:
        return {"inside": None, "checked": len(ids), "players": [],
                "shallowest_outside": None, "margin": None, "verdict": "unknown",
                "note": "the draft range could not be read, so 'is any of them "
                        "draftable' has no answer. %d undecoded at a rostered "
                        "position." % len(ids)}
    # ⚠ A TRUNCATED LIST CANNOT SUPPORT A ZERO. The ids are capped at 40 by the
    # producer, so on a bad day the ones past the cap are exactly the ones nobody
    # would see — and "none of the 40 I was shown was draftable" would print as
    # "none was draftable" (rule 13f).
    if report.get("no_sleeper_match_draftable_truncated"):
        return {"inside": None, "checked": len(ids), "players": [],
                "shallowest_outside": None, "margin": None, "verdict": "unknown",
                "note": "the undecoded list is TRUNCATED at %d of %s, so a count "
                        "of zero inside the draft would be a statement about the "
                        "cap and not about the board."
                        % (len(ids), report.get("no_sleeper_match_draftable"))}

    def _adp(v):
        if isinstance(v, dict):
            for k in ("adp", "pick", "avg_pick", "average_pick", "rank"):
                if v.get(k) is not None:
                    try:
                        return float(v[k])
                    except (TypeError, ValueError):
                        return None
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    inside, outside, unpriced = [], [], []
    for pid in ids:
        a = _adp((rows or {}).get(str(pid)))
        if a is None:
            # ⚠ COUNTED, NOT SKIPPED — I wrote `continue` here first, which is the
            # same defect `drop_depth` was fixed for one commit earlier. A player
            # undecoded at a rostered position whose pick will not parse falls out
            # of BOTH buckets, and the verdict then reads `clear`: the most
            # reassuring answer, produced by the rows nobody could read.
            unpriced.append(str(pid))
            continue
        (inside if a <= draftable else outside).append((a, str(pid)))
    inside.sort(); outside.sort()
    shallow = outside[0][0] if outside else None
    if unpriced and not inside:
        return {"inside": None, "checked": len(ids), "players": [],
                "shallowest_outside": shallow, "margin": None,
                "verdict": "unknown",
                "note": "%d of %d undecoded player(s) carry no readable pick, so "
                        "whether they fall inside pick %d cannot be stated: %s"
                        % (len(unpriced), len(ids), draftable,
                           ", ".join(unpriced[:5]))}
    if inside:
        verdict = "undecoded_in_draft"
        note = ("⚠ %d player(s) priced inside pick %d are at a position this "
                "league rosters, are not kept, and did not decode — the shallowest "
                "at ADP %.1f. The board has no market price for a player this room "
                "can take." % (len(inside), draftable, inside[0][0]))
    else:
        verdict = "clear"
        note = ("%d undecoded at a rostered position and NONE inside pick %d. "
                "Nearest is ADP %s — %s picks outside the draft."
                % (len(ids), draftable,
                   "n/a" if shallow is None else "%.1f" % shallow,
                   "n/a" if shallow is None else "%.1f" % (shallow - draftable)))
    return {"inside": len(inside), "checked": len(ids),
            "players": [p for _a, p in inside],
            "shallowest_outside": shallow,
            "margin": None if shallow is None else round(shallow - draftable, 2),
            "verdict": verdict, "note": note}


def latest_marginal(series: list, year) -> dict:
    """The most recent derivable marginal day, chosen rather than assumed.

    THE TWO DAYS ARE FOUND BY (YEAR, SPREAD), NEVER BY `series[-1]`. Every
    ingredient of that mistake is already here: the series is sorted by
    (year, observed_at) so the newest rows are always the newest SEASON, and the
    days before 2026-08-14 carry no dispersion at all. Taking the last two rows
    works exactly as long as the tail happens to be complete, and a daily capture
    changes the tail every morning. `capture()` already carries this lesson in a
    comment; I still spent part of 2026-08-14 comparing a board file to itself.

    RANKED BY DISTANCE FROM THE STANDING PRICE — `marginal_adp - adp_later` — and
    not by how far the published average drifted. The drift is the damped number
    this whole path exists to see past: a player whose board price moved 1.0 pick
    while today's four drafters averaged 25 picks later than it is the finding;
    a player the market has ALREADY repriced is not.

    UNMEASURED UNTIL THERE ARE TWO SPREAD DAYS, and it says how many it found.
    Tonight's 12:02 capture is the first contact between `dispersion_of` and MFL's
    real response, so the first marginal day cannot exist before 2026-08-15. A
    report that printed nothing tonight would be indistinguishable from a broken
    one, six days before the draft.
    """
    days = [s for s in (series or [])
            if str(s.get("year")) == str(year) and (s.get("dispersion") or {})]
    days.sort(key=lambda s: str(s.get("observed_at")))
    if len(days) < 2:
        return {"status": "unmeasured", "spread_days_found": len(days),
                "rows": {}, "ranked": [], "ranking_excluded_thin": 0,
                "earlier": None, "later": None,
                "note": "only %d day in %s carries a spread, and a marginal day "
                        "needs two. The spread first reaches disk on %s, so the "
                        "first derivable day is one more capture away — this is "
                        "UNKNOWN, not a market where nobody moved."
                        % (len(days), year, DISPERSION_SINCE)}

    # DEFERRED IMPORT, and the cycle is the reason: `board_vs_market` imports THIS
    # module, so a top-level import here would not resolve. The range is not
    # re-declared for that convenience — rule 11 — because a second copy of "how
    # many picks Cory can reach" is exactly the kind of duplicate that goes stale
    # in one place only. It is imported WITHOUT a fallback: a report that silently
    # loses its scope is worse than one that fails and says so.
    from board_vs_market import DRAFT_RANGE

    # ── THE WINDOW WIDENS WHEN A SINGLE DAY CANNOT QUALIFY ANYBODY ──────────
    #
    # `MIN_NEW_SELECTIONS` was declared from a cadence of +4 and +6 drafts a day.
    # The first real capture gained TWO (125 -> 127). At +2 the most new selections
    # any player can have is 2, so not one can reach 3 and `ranked` comes back
    # empty with every row filed as "thin" — a correct-looking table with nothing
    # in it, on any morning the market is quiet, and no way to see why.
    #
    # THE THRESHOLD IS NOT LOWERED. Two drafters are two drafters however they are
    # labelled, and tuning a bar to reach a number is the move this project
    # refuses. Instead the comparison reaches back to the most recent earlier day
    # that makes a qualifying player ARITHMETICALLY POSSIBLE — which is
    # MIN_NEW_SELECTIONS drafts, derived rather than chosen, because below it no
    # player can qualify no matter how the drafters behaved.
    #
    # ONE DAY STAYS THE DEFAULT. Widening is a fallback: the instrument is about
    # the MARGINAL day, and reaching back further than necessary blends days that
    # could have been read apart.
    # ── THE WINDOW IS DECIDED BY PLAYERS QUALIFYING, NOT BY `total_drafts` ──
    #
    # `MIN_NEW_SELECTIONS` was declared from a cadence of +4 and +6 drafts a day;
    # 2026-08-14 gained two. At that width no player can reach three, `ranked`
    # comes back empty with every row filed as thin, and a quiet morning is
    # indistinguishable from a broken instrument. So the comparison reaches back.
    #
    # ⚠ BUT NOT ON `total_drafts`, WHICH IS NOT EXACT. Measured on that same
    # snapshot: MFL reports `totalDrafts = 127` while 25 players carry a
    # `draftsSelectedIn` above it — up to 130 — and `draftSelPct` up to 102.0.
    # Recovering the denominator from each player's own pair gives 127.0-128.4
    # across the 180 players with 100+ drafts, so the pool is ~127-128 and MFL's
    # aggregate disagrees with its own per-player counts by two or three.
    #
    # A FIELD WRONG BY THREE CANNOT DECIDE A THRESHOLD OF THREE. The per-player
    # `drafts` are exact integers, and whether anybody clears the floor is
    # directly computable from them — so the window widens until at least one
    # player does, and `total_drafts` is reported as context rather than consulted.
    later = days[-1]
    n_late = _total_drafts(later)
    earlier, out, qualifying, broke = None, None, 0, None
    for cand in reversed(days[:-1]):
        earlier = cand
        # ⚠ IS THIS PAIR ONE CUMULATIVE SERIES AT ALL, before deriving anything
        # from the difference between them. `marginal_adp` refuses an INDIVIDUAL
        # player whose count fell, which is right and handles MFL's aggregation
        # lag. It cannot see a provider RE-SCOPING its sample: then counts fall
        # for many players at once, the per-player guard drops every one of them,
        # and the marginal comes back as a real-looking number computed over
        # whichever players happened to survive the break.
        broke = cumulative_break(cand, later)
        if broke["status"] == "measured" and not broke["usable"]:
            continue
        out = marginal_adp(cand, later)
        qualifying = sum(1 for r in out["rows"].values()
                         if r["new_selections"] >= MIN_NEW_SELECTIONS)
        if qualifying:
            break
    n_early = _total_drafts(earlier)
    delta = None if n_late is None or n_early is None else n_late - n_early
    if not qualifying:
        return {"status": "unmeasured", "spread_days_found": len(days),
                "rows": {}, "ranked": [], "ranking_excluded_thin": 0,
                "ranking_excluded_out_of_range": 0,
                # WHY, NOT JUST THAT. "Nothing qualified" and "the series broke"
                # are different facts and only one of them is about the market.
                "cumulative_break": broke,
                "earlier": earlier.get("observed_at"), "later": later.get("observed_at"),
                "window_days": len(days) - 1, "window_qualifying": 0,
                "provider_total_drafts_delta": delta,
                "min_new_selections": MIN_NEW_SELECTIONS,
                "note": "no player gained %d new selections at ANY width back to "
                        "%s — there is no derivable marginal figure yet, which is "
                        "UNKNOWN rather than a quiet market."
                        % (MIN_NEW_SELECTIONS, earlier.get("observed_at"))}

    out = marginal_adp(earlier, later)
    out["window_days"] = days.index(later) - days.index(earlier)
    out["window_qualifying"] = qualifying
    # REPORTED, NOT CONSULTED. It is the only handle anyone has on the pool's
    # rough size, so dropping it would lose a measurement — but it is the
    # provider's aggregate and it disagrees with the provider's own per-player
    # counts, so it decides nothing here.
    out["provider_total_drafts_delta"] = delta
    out["provider_total_drafts_note"] = (
        "MFL's own aggregate, reported for context and NOT used to choose this "
        "window: on 2026-08-14 it read 127 while 25 players carried a higher "
        "per-player count, up to 130. The window is decided by how many players "
        "actually cleared %d new selections, which is exact."
        % MIN_NEW_SELECTIONS)
    thin = 0
    out_of_range = 0
    ranked = []
    for pid, r in out["rows"].items():
        if r["new_selections"] < MIN_NEW_SELECTIONS:
            thin += 1
            continue
        # EITHER END INSIDE, NEVER BOTH. A player the board prices at 291 whom
        # today's room took at 20 is the most actionable row this can produce, and
        # scoping on the price alone deletes him. So does scoping on the marginal
        # alone, to the player priced at 50 who quietly stopped going there.
        if min(r["adp_later"], r["marginal_adp"]) > DRAFT_RANGE:
            out_of_range += 1
            continue
        ranked.append({"player_id": pid,
                       "gap": r["marginal_adp"] - r["adp_later"],
                       "marginal_adp": r["marginal_adp"],
                       "adp_later": r["adp_later"],
                       "published_move": r["published_move"],
                       "new_selections": r["new_selections"],
                       "outside_observed_range": r["outside_observed_range"]})
    ranked.sort(key=lambda x: (-abs(x["gap"]), x["player_id"]))
    out["ranked"] = ranked
    out["ranking_excluded_thin"] = thin
    # NO SILENT CAPS. A morning where everything interesting sat outside the
    # draft range must say so, not look like a quiet day.
    out["ranking_excluded_out_of_range"] = out_of_range
    out["min_new_selections"] = MIN_NEW_SELECTIONS
    out["draft_range"] = DRAFT_RANGE
    return out


#: A qualifying board older than this is still F5-legal and still stale. Declared
#: from the capture cadence — daily, so two missed days is a pattern, not a blip —
#: and not tuned to what the archive currently shows.
F5_STALE_DAYS = 3


def f5_readiness(series: list, year, draft_date=None, today=None) -> dict:
    """Which snapshot OUR draft will actually use, and how long is left to feed it.

    `INGEST-PLAN.md:2453` records "board() for draft 2026-08-22 -> the 08-12
    snapshot, 708 rows". True when written, wrong now: the archive has since gained
    08-13 and that snapshot holds 672 rows. A fact copied into prose goes stale in
    silence — rule 9, a mechanism implemented as a note.

    AND IT SURFACES A DEADLINE NOBODY HAS STATED. F5 takes the latest snapshot
    STRICTLY BEFORE the draft, so a board captured on draft morning is worth nothing
    to it. **The last capture that can still matter is the day before the draft** —
    one day earlier than the date everyone has been working to, on an archive whose
    lost days cannot be refetched by any means.

    THE SELECTION IS NOT RE-DERIVED HERE. `ExternalAsOfStore.snapshot_date()`
    already implements strictly-before, and this module's header says that rule
    stays in ONE place. A second `<` written here is the multi-derivation defect
    this project keeps hitting, and the worst kind: both copies would go on
    returning valid-looking dates while disagreeing.

    The store is built, asked, and dropped — it never escapes. It is constructed
    from DATES for a DATE question; `board()` is deliberately not called, because
    the archive's rows are {id: adp} in the SOURCE's ids and `board()` expects the
    translated shape `as_store_snapshots` produces.

    `draft_date` has no default, for the same reason `last_pick` has none: the
    league's calendar is the consumer's, and our own Sleeper config has
    `draft.start_time: null` today, so there is nothing here to derive it from.
    """
    _draft_on_path()
    from backtest.external_replay import ExternalAsOfStore, TimeTravelError

    ser = [s for s in _series_of(series) if str(s.get("year")) == str(year)]
    base = {"year": str(year), "draft_date": draft_date, "snapshot_date": None,
            "rows": None, "lead_days": None, "age_days": None, "stale": None,
            "last_useful_capture": None, "days_until_last_useful": None,
            "days_until_draft": None, "verdict": None, "note": None}
    if not draft_date:
        return dict(base, verdict="unjudged",
                    note="UNJUDGED — pass draft_date; the league's calendar belongs "
                         "to the consumer and draft.start_time is null in our config")

    dd = _date.fromisoformat(str(draft_date))
    last_useful = dd - _timedelta(days=1)
    out = dict(base, last_useful_capture=last_useful.isoformat())
    if today:
        t = _date.fromisoformat(str(today))
        out["days_until_draft"] = (dd - t).days
        # TO THE LAST USEFUL CAPTURE, NOT TO THE DRAFT. Counting to the draft
        # overstates the remaining window by exactly one day, and it is the last
        # day — the one nobody can buy back.
        out["days_until_last_useful"] = (last_useful - t).days

    store = ExternalAsOfStore("ours", dd,
                              [{"observed_at": s["observed_at"], "rows": []}
                               for s in ser], "f5-readiness")
    try:
        picked = store.snapshot_date()
    except TimeTravelError:
        return dict(out, verdict="excluded",
                    note="NO SNAPSHOT STRICTLY BEFORE %s — this draft is excluded "
                         "under F4/F5. A later snapshot is not a substitute: it has "
                         "seen the draft it would be used to predict." % dd)

    by_day = {s["observed_at"]: s for s in ser}
    lead = (dd - picked).days
    # AGE IS AGAINST TODAY; LEAD IS AGAINST THE DRAFT, and conflating them makes an
    # alarm that is on by default. The first cut set `stale` from `lead`, so on
    # 2026-08-13 — snapshot captured that morning, nine days of captures still to
    # come — it reported stale, and would have every day until the week of the
    # draft. `lead` is a PROJECTION until the draft arrives: what F5 would see if
    # the draft were held on today's archive. Whether we are still CAPTURING is a
    # question about today, and it is the one worth an alarm now.
    age = None if not today else (_date.fromisoformat(str(today)) - picked).days
    note = None
    if age is not None and age > F5_STALE_DAYS:
        note = ("the newest qualifying board is %d day(s) old. The capture may have "
                "stopped, and a day not captured cannot be refetched." % age)
    elif age is None and lead > F5_STALE_DAYS:
        note = ("the qualifying board would be %d days old at the draft. Pass "
                "`today` to say whether that is a dead capture or simply a draft "
                "that has not arrived yet." % lead)
    return dict(out, snapshot_date=picked.isoformat(),
                rows=(by_day.get(picked.isoformat()) or {}).get("row_count"),
                lead_days=lead, age_days=age,
                stale=(None if age is None else age > F5_STALE_DAYS),
                verdict="ready", note=note)


def _draft_on_path():
    """Put `draft/` on sys.path so `adp` and `mfl_adapter` import.

    EXTRACTED BECAUSE `rostered_positions` WAS GREEN ONLY BY TEST ORDER. The path
    insert lived inside `crosswalk_map`, so any function called on its own raised
    ModuleNotFoundError — and the suite never saw it, because some earlier test
    always called `crosswalk_map` first and sys.path is process-global. It failed
    the moment it was used from a script, which is exactly where an ingest helper
    gets used.
    """
    import sys as _sys
    _draft = str(Path(__file__).resolve().parent.parent)
    if _draft not in _sys.path:
        _sys.path.insert(0, _draft)


def crosswalk_map(players: dict, board: list, kept=None, positions=None) -> tuple:
    """The archive's own decode key -> our board's ids. Returns (ids, report).

    OFFLINE, AND THAT IS THE WHOLE POINT. The id map used to be obtainable only by
    fetching MFL's players export live (`mfl_live_probe`), which means the archive
    decoded only while MFL was up and still serving that season — precisely the
    window an archive exists to outlive. Everything here comes from bytes we hold.

    NO NEW MATCHING LOGIC — AND THE FIRST CUT OF THIS FUNCTION BROKE THAT RULE AND
    WOULD HAVE SHIPPED A KNOWN DEFECT. It called `adp.match_player` directly, which
    skips the team-unit refusal `crosswalk_picks` performs first. MFL names a team
    unit "Bills, Buffalo", `_norm_name` turns that into "Buffalo Bills", and our
    Buffalo DEF carries the same full name — so the NAME MATCHES and the crosswalk
    scores a success for something that is not a player. Measured on the real run:
    TMQB -> DEF 65 times and TMPK -> DEF 38. Reaching for the authoritative matcher
    was not enough; the authoritative CALLER is what holds the guard.

    So this delegates the whole hop to `mfl_adapter.crosswalk_picks`, presenting the
    decode key as the pick list. Its report comes back unchanged — including the
    cross-source position disagreements, which are the signature of a plausible
    wrong match and the one thing a bare match rate cannot show.

    `board` may be our board's ROWS (a list) or an already-built matcher index, so
    a caller that has built one does not build a second that could disagree.
    """
    _draft_on_path()
    import mfl_adapter as A
    from adp import build_index

    if isinstance(board, dict) and ("by_name" in board or "by_initials" in board):
        index = board
    else:
        index = build_index({
            str(r.get("player_id")): {"full_name": r.get("name"),
                                      "position": r.get("position"),
                                      "team": r.get("team"),
                                      "search_rank": r.get("sleeper_rank")}
            for r in (board or []) if r.get("player_id") is not None})

    picks = [{"player": pid} for pid in sorted(players or {})]
    rows, report = A.crosswalk_picks(picks, players or {}, index)
    ids = {str(r["player"]): str(r["player_id"]) for r in rows}
    if kept is not None or positions is not None:
        report = _classify_undraftable(report, players or {}, ids, kept, positions)
    return ids, report


#: Roster entries that are SLOTS rather than positions. No player carries them.
NON_POSITIONS = frozenset({"FLEX", "SUPER_FLEX", "SUPERFLEX", "REC_FLEX", "WRRB_FLEX",
                           "IDP_FLEX", "BN", "TAXI", "IR"})


def rostered_positions(settings: dict) -> set:
    """Which positions this league can actually roster, from its own config.

    Slots are not positions: FLEX and BN match no player, and leaving them in makes
    every later statement about the set false while looking harmless.
    """
    _draft_on_path()
    from adp import _norm_pos
    out = set()
    for slot in ((settings or {}).get("roster_positions") or []):
        s = str(slot).upper().strip()
        if s in NON_POSITIONS:
            continue
        out.add(_norm_pos(s))
    return out


def position_is_rostered(pos, rostered: set) -> bool:
    """Is a SOURCE-vocabulary position one this league rosters?

    THROUGH `adp._norm_pos`, WHICH IS THE POINT. MFL says `PK` for a kicker and
    `Def` for a team defense; our roster says `K` and `DEF`. Comparing raw strings
    classifies every kicker and every team defense as unrosterable — which removes
    them from the draftable denominator and RAISES the rate, so the instrument would
    improve its own score by discarding the players it could not explain.

    `TMPK` is NOT a kicker: it is MFL's team KICKING UNIT, which our board refuses
    as a team unit and which no `K` slot can hold. It is deliberately absent from
    the alias table and must stay unrostered.
    """
    _draft_on_path()
    from adp import _norm_pos
    return _norm_pos(pos) in (rostered or set())


def _classify_undraftable(report: dict, players: dict, ids: dict,
                          kept, positions=None) -> dict:
    """Split `no_sleeper_match` into KEPT-so-undraftable and genuinely missing.

    THE MISS THIS EXISTS FOR WAS MINE, and it very nearly went to A as a defect.
    Measuring whether the D3 archive is usable, I found 31 of MFL's top 150
    unresolved — among them Ja'Marr Chase at ADP 4.72, Derrick Henry at 54.91,
    Kenneth Walker III at 39.51. Exhaustive search of the board's `players` list:
    no name, no id. Reproduced on a clean origin/main worktree, checked both
    active branches for a fix, and started writing the route.

    They are KEEPERS. `kept_players` holds exactly those three. They are off the
    draftable list because they CANNOT BE DRAFTED — the board being right.

    The report could not say so. `by_why` explains only `team_unit_not_a_player`;
    everything else is one undifferentiated `no_sleeper_match` in which "IDP this
    league cannot roster", "kept" and "genuinely missing from the board" are the
    same number. Two of those are correct behaviour and the third is an emergency,
    and at the TOP of the board — where keepers are — the benign case dominates,
    so the alarm is loudest exactly where it is least likely to be real.

    MATCHED BY NAME, DELIBERATELY, and not by id. The archive holds MFL's ids and
    `kept_players` holds ours; if the two could be joined directly there would have
    been no crosswalk to fail in the first place.

    AND BY `adp.normalize_name`, which is what `build_index` keys `by_name` on —
    so a keeper is recognised on EXACTLY the terms the miss was recorded on. Not
    `mfl_adp._norm_name`: that only reorders "Last, First" and leaves case and
    punctuation alone, so "Ja'Marr Chase" would have to agree byte-for-byte with
    the board's spelling. The apostrophe in that very name is the reason to use
    the matcher's own normaliser instead of a second one that merely looks close.
    """
    _draft_on_path()
    from adp import normalize_name

    out = dict(report)
    by_norm = {}
    for k in (kept or []):
        n = normalize_name(k.get("name") if isinstance(k, dict) else k)
        if n:
            by_norm[n] = k
    unresolved = [(pid, meta) for pid, meta in (players or {}).items()
                  if str(pid) not in ids]
    hits = [{"mfl_id": str(pid),
             "name": (meta or {}).get("name"),
             "position": (meta or {}).get("position"),
             "why": "kept_not_draftable"}
            for pid, meta in unresolved
            if normalize_name((meta or {}).get("name")) in by_norm]
    out["kept_not_draftable"] = len(hits)
    out["kept_rows"] = hits

    # POSITIONS THIS LEAGUE CANNOT ROSTER. The dominant reason a miss is not a
    # defect: MFL's board carries DE/DT/LB/CB/S and team-kicker units and this
    # league rosters QB/RB/WR/TE/K/DEF. With keepers alone the "draftable" rate
    # moved 0.6093 -> 0.6119, three players out of 709 — a name that promised to
    # exclude the undraftable while excluding one of the two reasons for it.
    unrostered = []
    if positions:
        unrostered = [{"mfl_id": str(pid),
                       "name": (meta or {}).get("name"),
                       "position": (meta or {}).get("position"),
                       "why": "position_not_rostered"}
                      for pid, meta in unresolved
                      if not position_is_rostered((meta or {}).get("position"), positions)]
    out["position_not_rostered"] = len(unrostered) if positions else 0

    # ONE SET, NOT TWO COUNTS. A keeper at an unrostered position belongs to both
    # lists, and subtracting both shrinks the denominator below the truth — which
    # inflates the rate, and in the limit pushes it past 1.0, where it reads as
    # better than perfect rather than as arithmetic that has gone wrong.
    excluded = {h["mfl_id"] for h in hits} | {u["mfl_id"] for u in unrostered}
    out["undraftable_excluded"] = len(excluded)

    # NOT a redefinition of `no_sleeper_match`. A's `board_vs_market.py` reads that
    # key; moving it would move A's numbers without A asking. The new figures sit
    # BESIDE the old one under names that say what they exclude.
    out["no_sleeper_match_excluding_kept"] = max(
        0, int(report.get("no_sleeper_match") or 0) - len(hits))
    out["no_sleeper_match_draftable"] = max(
        0, int(report.get("no_sleeper_match") or 0) - len(excluded))

    # ⚠ AND NAMED, NOT ONLY COUNTED. This figure is printed in the capture summary
    # every morning and nobody could act on it: computed by SUBTRACTION, the
    # players it counts were never identified. Trying to answer "which players did
    # the prune cost us market coverage on" — the count moved 6 to 11 across one
    # rebuild — my own ad-hoc enumeration disagreed with this module twice in a
    # session, once listing three of our own keepers as misses. A count of a set
    # nobody can enumerate is the shape this lane keeps finding elsewhere.
    #
    # THE SET IS ALSO A FREE CONTROL. The subtraction is only sound while every
    # excluded id is itself unresolved, and nothing checked that. Built directly,
    # its size and the subtraction become two independent routes to one number;
    # they disagree exactly when the exclusion sets drift out of the unresolved
    # population, which would inflate `crosswalk_rate_draftable` — and this class
    # of error always goes in the flattering direction.
    draftable_missing = [str(pid) for pid, _m in unresolved
                         if str(pid) not in excluded]
    out["no_sleeper_match_draftable_ids"] = draftable_missing[:40]
    out["no_sleeper_match_draftable_truncated"] = len(draftable_missing) > 40

    # THE RATE THAT ANSWERS THE QUESTION. `crosswalk_rate` is "how much of the
    # source can we decode"; what decides whether the archive is usable is "how
    # much of what we can actually DRAFT can we decode". A keeper is draftable by
    # nobody and neither is a linebacker in a league with no IDP slot.
    total = int(report.get("picks") or 0)
    draftable = total - len(excluded)
    out["crosswalk_rate_draftable"] = (
        (int(report.get("crosswalked") or 0) / draftable) if draftable > 0 else None)
    return out


#: How many absent dates to NAME. The count is always exact; only the list is
#: capped, and `missing_listed_truncated` says so when it bites. A cap that
#: silently shortens a list reads as "that was all of them".
MISSING_DAYS_LISTED = 14


def _gaps(days: list) -> dict:
    """Which calendar days between the first and the last were never captured.

    SEPARATE FROM `coverage` so it can be tested on dates alone, and because the
    parse failure has to be handled somewhere it cannot be mistaken for zero.
    """
    try:
        got = sorted({_date.fromisoformat(d) for d in days})
    except (TypeError, ValueError):
        # A DATE THIS FUNCTION CANNOT PARSE IS NOT A DAY WITH NO GAP. Returning
        # `missing: 0` here would report a clean capture off the back of a broken
        # one — the exact inversion this module exists to prevent. Rule 13f.
        return {"expected_days": None, "missing": None, "missing_days": [],
                "missing_listed_truncated": False, "complete": None,
                "gap_note": "UNCOUNTED — a date in this series is unparseable"}
    if not got:
        return {"expected_days": 0, "missing": 0, "missing_days": [],
                "missing_listed_truncated": False, "complete": None,
                "gap_note": "UNCOUNTED — nothing captured, so there is no span to check"}
    span = (got[-1] - got[0]).days + 1
    have = set(got)
    absent = [got[0] + _timedelta(days=i) for i in range(span)]
    absent = [d for d in absent if d not in have]
    return {
        "expected_days": span,
        "missing": len(absent),
        "missing_days": [d.isoformat() for d in absent[:MISSING_DAYS_LISTED]],
        "missing_listed_truncated": len(absent) > MISSING_DAYS_LISTED,
        "complete": not absent,
        "gap_note": None,
    }


def draft_last_pick(settings: dict) -> dict:
    """The draft's last pick, DERIVED TWICE from the league config.

    `dropped_inside` refuses to judge without a boundary, so something has to supply
    one, and the two candidates for doing it are both wrong. Hardcoding 150 makes the
    archive league-specific. Writing the arithmetic into the workflow YAML puts it
    where no test can reach it — this file already carries the scar: the gap alarm
    was written inline and shipped two defects nothing could catch, the runner's
    local clock and a truncated list used as a membership test.

    ⚠ `settings.draft_rounds` IS NOT THE DRAFT LENGTH. In our real config it is 3
    while the draft is 15 rounds — it tracks `max_keepers: 3`. It is the name you
    reach for, it holds a plausible integer, and reading it raises nothing. It would
    put the boundary at pick 30 and make `dropped_inside` report `clean` for every
    draftable loss between picks 31 and 150 — the recurring defect of this project in
    one line: a consumer reading the field name its author believed in.

    ⚠ AND `settings.num_teams` IS NOT THE TEAM COUNT EITHER — same trap, one field
    over. I reached for it, and `test_settings_registry_truth` caught it: the registry
    files it `ignored`, because it is a DECLARED TARGET and `sleeper_import` reads the
    actual rosters instead. It is 10 today and it is 10 only while the two agree. So
    the count comes from `len(owner_to_roster)`, which is a measurement of how many
    rosters exist — the source the registry itself names.

    So both numbers are derived from two independent places and a disagreement is
    reported rather than resolved (rule 11):
        teams  — len(owner_to_roster)        vs draft.settings.teams
        rounds — draft.settings.rounds       vs len(roster_positions)
    """
    # ── READ IT IF IT EXISTS. A, 4126a85: "if either of you computes a round
    # anywhere, it is wrong" — and this computed the LAST PICK, which is the same
    # class one field over. Reading the authoritative sequence stays right no
    # matter which way the keeper question goes, which is the whole argument for
    # reading rather than deriving: I got the MECHANISM wrong below and the READ
    # still returned the correct number.
    #
    # ⚠ TWO QUANTITIES, TWO NAMES, AND I CONFLATED THEM. I claimed keeper
    # forfeits are REMOVED from the sequence, so that a 3-keeper draft ran 147
    # picks. That was wrong — A's premise, checked into my lane by me, and
    # reversed after A replayed the league's own drafts. SLEEPER OCCUPIES A
    # FORFEITED PICK; IT DOES NOT REMOVE IT. Verified independently against
    # league_history: 2023 (0 keepers), 2024 (23) and 2025 (20) are ALL 150 picks
    # with round 4 opening at overall 31. A keeper sits in his slot flagged and
    # nothing after him shifts up.
    #
    #   pick_order.picks       150 — the BOARD. How many players leave the pool.
    #                          This is DEPTH, and it is what a boundary means
    #                          here: "was this player inside the draftable range".
    #   pick_order.live_picks  147 — how many SELECTIONS happen. 147 was never
    #                          the draft's length; it was the live count wearing
    #                          the wrong name.
    #
    # This function answers DEPTH, so it returns the board and reports the live
    # count beside it. Callers counting selections must ask for `live_picks`
    # explicitly rather than inheriting a number that happens to be close.
    po = ((settings or {}).get("pick_order") or {})
    picks = po.get("picks") or []
    if picks:
        overalls = [p.get("overall") for p in picks if p.get("overall") is not None]
        if overalls:
            live = po.get("live_picks")
            kept = sum(1 for p in picks if p.get("keeper_slot"))
            return {"last_pick": max(overalls), "teams": None, "rounds": None,
                    "basis": "pick_order.picks", "live_picks": live,
                    "keeper_slots": kept,
                    "note": "READ from pick_order.picks (%d rows, last overall %d)"
                            " — the BOARD, keeper slots occupied not removed"
                            "%s. This is DEPTH; %s counts SELECTIONS."
                            % (len(picks), max(overalls),
                               " (%d flagged)" % kept if kept else "",
                               "live_picks=%s" % live if live is not None
                               else "live_picks is absent, so nothing here")}

    ds = ((settings or {}).get("draft") or {}).get("settings") or {}
    slots = (settings or {}).get("roster_positions") or []
    rosters = (settings or {}).get("owner_to_roster") or {}

    def pair(a, b, name, src_a, src_b):
        vals = [v for v in (a, b) if v is not None]
        if not vals:
            return None, "UNDERIVABLE — no %s in %s or %s" % (name, src_a, src_b)
        if len(vals) == 2 and int(vals[0]) != int(vals[1]):
            return None, ("%s DISAGREE — %s says %s, %s says %s. One is wrong and "
                          "nothing here says which." % (name.upper(), src_a, vals[0],
                                                        src_b, vals[1]))
        return int(vals[0]), "%s=%s (%s, %s)" % (name, int(vals[0]), src_a, src_b)

    teams, tnote = pair((len(rosters) or None), ds.get("teams"), "teams",
                        "len(owner_to_roster)", "draft.settings.teams")
    rounds, rnote = pair(ds.get("rounds"), (len(slots) or None), "rounds",
                         "draft.settings.rounds", "len(roster_positions)")
    note = "%s; %s" % (tnote, rnote)
    if teams is None or rounds is None:
        return {"last_pick": None, "teams": teams, "rounds": rounds,
                "basis": "teams_x_rounds", "note": note}
    # NO pick_order TO READ. teams x rounds is the best available, and against
    # THIS league's four drafts it is exactly right: 10 x 15 = 150, and 2023,
    # 2024 and 2025 each ran 150 picks regardless of carrying 0, 23 and 20
    # keepers. I previously labelled this an UPPER BOUND on the premise that
    # forfeited picks are removed from the sequence; that premise was false and
    # the label was a warning about a thing that does not happen.
    #
    # It stays DERIVED rather than authoritative for a different and real reason:
    # it assumes every seat picks in every round, which a league with traded or
    # genuinely voided picks would break — and this function cannot tell those
    # apart from a config alone. So it says what it assumed instead of what it
    # feared.
    return {"last_pick": teams * rounds, "teams": teams, "rounds": rounds,
            "basis": "teams_x_rounds",
            "note": note + " — DERIVED, no pick_order.picks to read. Assumes "
                           "every seat picks in every round; a keeper OCCUPIES "
                           "his slot rather than removing it, so keepers alone do "
                           "not shorten a draft. Traded or voided picks would, "
                           "and nothing in a config shows them."}


def dropped_inside(series: list, year, last_pick=None) -> dict:
    """WHICH players left the board, judged against the last pick of the draft.

    `coverage.row_drop_note` says "the board LOST 36 players in a day". That is a
    reading, not an answer, and I had to go diff two snapshots by hand to learn what
    it meant: on 2026-08-13 all 37 losses sat at ADP 169+, and 19 of them were IDP
    (DE/DT/LB/CB/S) that a QB/RB/WR/TE/K/DEF league cannot roster at any price.

    That is the SOURCE CONVERGING, not a defect. MFL's CUTOFF=5 behaves as a
    percentage of drafts — `ceil(0.05 * drafts)` stepped 6 -> 6 -> 7 across the three
    captured days, and the board GREW on the day it did not step (705 -> 708) and
    fell 36 on the day it did. A percentage is a threshold on a player's SELECTION
    RATE, which is stable as the sample grows; it is not a ratchet that eats the
    board. Marginal players wash out and the survivors stay.

    So the count is the wrong instrument. Thirty-six deep IDP washing out and three
    draftable receivers vanishing nine days before a draft are THE SAME INTEGER, and
    the first case is the common one — an alarm keyed to the count gets ignored
    exactly when it starts being real.

    `last_pick` HAS NO DEFAULT, and that is deliberate. 10 teams x 15 rounds = 150 is
    today's setting and a config edit away from not being. Baking it in here would
    make this archive league-specific forever — the same line held in
    `nflverse_weekly_store`, where the store keeps weeks 18-22 and lets the CONSUMER
    cut at the league's scored boundary. Without a boundary this refuses to judge.

    A player who drops out and RETURNS is not a standing loss. What we draft off is
    the LATEST board; a round trip is churn and is reported as such, because a
    pairwise-accumulating count would climb all preseason and never come down.
    """
    ser = [s for s in _series_of(series) if str(s.get("year")) == str(year)]
    ser.sort(key=lambda s: s.get("observed_at") or "")
    base = {"year": str(year), "snapshots": len(ser), "last_pick": last_pick,
            "inside_ids": None, "inside_n": None, "outside_n": None,
            "churn_inside_n": None, "verdict": None, "note": None}

    if last_pick is None:
        # NO BOUNDARY, NO VERDICT. Guessing one would make every answer look
        # authoritative and be wrong for any league that is not this one.
        return dict(base, verdict="unjudged",
                    note="UNJUDGED — pass last_pick (teams x rounds); the draft's "
                         "boundary belongs to the consumer, not to this archive")
    if len(ser) < 2:
        # Rule 13f, in its dangerous direction: a capture that ran once would
        # otherwise report `clean` — a check that CANNOT fail reading as one that did.
        return dict(base, verdict="unmeasured",
                    note="UNMEASURED — a loss is a difference between two days and "
                         "this year holds %d snapshot(s)" % len(ser))

    latest = dict((ser[-1].get("rows") or {}))
    seen_before, vanished_once = {}, set()
    for s in ser[:-1]:
        rows = s.get("rows") or {}
        for pid in seen_before:
            if pid not in rows:
                vanished_once.add(pid)
        seen_before.update(rows)

    inside, outside, churn = [], [], []
    for pid, adp in seen_before.items():
        try:
            in_range = float(adp) <= float(last_pick)
        except (TypeError, ValueError):
            continue  # an unparseable price is not a player inside the range
        if pid in latest:
            if in_range and pid in vanished_once:
                churn.append(pid)
            continue
        (inside if in_range else outside).append(pid)

    inside.sort()
    return dict(base,
                inside_ids=inside, inside_n=len(inside), outside_n=len(outside),
                churn_inside_n=len(churn),
                verdict=("draftable_loss" if inside else "clean"),
                note=(None if not inside else
                      "%d player(s) priced inside pick %s are ABSENT from the latest "
                      "board (%s). F5 reads the latest snapshot before the draft, so "
                      "these carry no ADP into it: %s"
                      % (len(inside), last_pick, ser[-1].get("observed_at"),
                         ", ".join(inside[:12]))))


def _draftable_picks():
    """teams x rounds, READ from the league config. None if unreadable.

    None rather than 150: a depth verdict that says "none of them were draftable"
    on a guessed range is worse than no verdict, because it reassures. Same shape
    and same reasoning as `external_source_run._our_pass_td`.
    """
    # ⚠ THE CATCH IS NARROW ON PURPOSE, and this function is why. It first read
    # `HERE.parent / "config"`, and this module has no `HERE` — so every call
    # raised NameError, a bare `except Exception` swallowed it, and the verdict
    # came back "the league config could not be read". A coding error wearing the
    # costume of a missing file. `except Exception` around a path expression is
    # the same defect as `|| <fallback>`: it converts "this code is wrong" into
    # "proceed with something else" and reports success either way.
    #
    # Only the ways a FILE can genuinely fail are caught. A typo raises.
    try:
        cfg = json.loads((CONFIG_DIR / "league_config.json").read_text())
    except (OSError, ValueError):
        return None
    t, r = cfg.get("teams"), cfg.get("rounds")
    return int(t) * int(r) if t and r else None


def _adp_of(row):
    """The pick value in a snapshot row, whatever shape the row is.

    The archive stores a bare float today (`341.5`). It has stored dicts before
    and may again, and a depth measurement that silently reads None off every row
    would report "0 of 37 were draftable" — the most reassuring possible answer —
    on a schema it simply could not parse. So the shapes are enumerated and an
    unparseable row is counted, not dropped.
    """
    if isinstance(row, dict):
        for k in ("adp", "pick", "avg_pick", "average_pick", "rank"):
            if row.get(k) is not None:
                try:
                    return float(row[k])
                except (TypeError, ValueError):
                    return None
        return None
    try:
        return float(row)
    except (TypeError, ValueError):
        return None


def drop_depth(earlier: dict, later: dict, draftable=None) -> dict:
    """WHERE the players a snapshot lost were priced — not merely how many.

    ⚠ THIS EXISTS BECAUSE THE COUNT ALONE INVITES THE WRONG REACTION. The note
    below used to read "the board LOST 36 players in a day" and stop there. That
    sentence is true and it is alarming, and the alarm points at nothing a reader
    can act on: measured on 08-12 -> 08-13, ALL 37 lost players were priced
    beyond pick 169 (median 441, shallowest 169.2) and NOT ONE was inside our
    150-pick draft. The board did not lose anything our room can take.

    The mechanism makes that structural rather than lucky: MFL's cutoff removes
    the LEAST-DRAFTED players, and a player going inside pick 150 of a 10-team
    league appears in nearly every draft. But structural is not guaranteed, which
    is the whole reason to measure it every day instead of asserting it once.

    `draftable=None` means the league config could not be read, and the verdict
    is then `unknown` rather than a reassuring zero.
    """
    lost = [p for p in earlier if p not in later]
    vals, unparseable = [], 0
    for p in lost:
        v = _adp_of(earlier[p])
        if v is None:
            unparseable += 1
        else:
            vals.append(v)
    vals.sort()
    inside = None if draftable is None else [v for v in vals if v <= draftable]
    if draftable is None:
        verdict, note = "unknown", (
            "the league config could not be read, so 'was anything DRAFTABLE lost' "
            "has no answer here. %d player(s) left the board." % len(lost))
    elif unparseable:
        verdict, note = "unknown", (
            "%d of %d lost row(s) carried no readable pick value, so the depth of "
            "the loss cannot be stated. Reporting 'none were draftable' off rows "
            "that could not be parsed would be the most reassuring possible lie."
            % (unparseable, len(lost)))
    elif not vals:
        verdict, note = "none_lost", "no players left the board between these two days."
    elif not inside:
        verdict, note = "outside_draft", (
            "%d player(s) left the board and NONE was priced inside pick %d — the "
            "shallowest sat at %.1f, the median at %.1f. This does not touch any "
            "player our room can draft."
            % (len(vals), draftable, vals[0], vals[len(vals) // 2]))
    else:
        verdict, note = "inside_draft", (
            "⚠ %d of %d player(s) that left the board were priced INSIDE pick %d "
            "(shallowest %.1f). This one DOES reach the draftable range and the "
            "board is now missing players our room could take."
            % (len(inside), len(vals), draftable, min(inside)))
    return {
        "lost": len(lost), "gained": sum(1 for p in later if p not in earlier),
        "unparseable": unparseable,
        "draftable_picks": draftable,
        "lost_inside_draft": None if inside is None else len(inside),
        "shallowest_lost": vals[0] if vals else None,
        "median_lost": vals[len(vals) // 2] if vals else None,
        "verdict": verdict, "note": note,
    }


def coverage(series: list, year) -> dict:
    """What we actually hold for a season — reported, never assumed.

    THE CLAIM THIS DOCSTRING USED TO MAKE WAS FALSE, and it is worth recording
    rather than quietly deleting. It said this was "the one that makes a gap in
    the capture visible". It did not. A twelve-day window with three consecutive
    days lost reported `snapshots: 9, first: 08-11, last: 08-22,
    empty_snapshots: 0` — arithmetically indistinguishable from a complete
    capture, in the function whose stated job was making the gap visible.

    That matters more here than almost anywhere else in this project, because
    the days are PERISHABLE. `empty_snapshots` already catches a dated row with
    no board behind it. Nothing caught a day with no row at all, and a day with
    no row at all can never be refetched — MFL serves no as-of-date board, which
    is the measured finding this whole archive exists because of.

    ── WHAT IT CATCHES AND WHAT IT CANNOT, STATED RATHER THAN IMPLIED ────────

    `missing_days` finds INTERIOR gaps: the capture stopped and STARTED AGAIN.
    That is detectable here at the first moment it is detectable at all — the
    resumed run sees the hole its own outage made and names the dates.

    It CANNOT see a capture that stopped and stayed stopped. There is no
    interior gap in that case; `last` simply stops advancing, and a job that is
    not running cannot report that it is not running. Detecting THAT needs an
    instrument on a different clock, comparing `last` to today. This function
    deliberately does not take a clock — the module keeps date logic passed in
    so the archive stays testable — and it would be an overclaim to imply the
    dead-capture case is covered by anything below.
    """
    ser = _series_of(series)
    # ⚠ SORTED BY DAY, NOT BY ARCHIVE ORDER. `days` was sorted and `counts` was
    # not, so `row_deltas` was day-over-day movement only while the archive
    # happened to be appended in date order. It is today, and a single backfilled
    # snapshot would have turned every delta into noise with nothing saying so —
    # including `largest_drop`, which gates the note below.
    mine = sorted((s for s in ser if str(s.get("year")) == str(year)),
                  key=lambda s: str(s.get("observed_at")))
    days = [s["observed_at"] for s in mine]
    counts = [s.get("row_count") or 0 for s in mine]
    # Day-over-day row movement. One snapshot cannot show movement, so the largest
    # drop is None rather than 0 — 0 would read as "measured, and stable" (rule 13f).
    deltas = [counts[i] - counts[i - 1] for i in range(1, len(counts))]
    worst = min(deltas) if deltas else None
    drop_note = None
    depth = None
    if worst is not None and worst <= -ROW_DROP_FLOOR:
        # WHICH PAIR OF DAYS PRODUCED THE WORST DROP, so the depth measured below
        # is the depth of THAT drop and not of some other one.
        i = deltas.index(worst) + 1
        depth = drop_depth(mine[i - 1].get("rows") or {},
                           mine[i].get("rows") or {}, _draftable_picks())
        drop_note = (
            "the board LOST %d players in a day (%s). More drafts with fewer priced "
            "players is not self-explanatory: check whether MFL's CUTOFF is a "
            "percentage of drafts rather than a count, which would raise the bar as "
            "drafts accumulate. ── WHERE THEY SAT (%s -> %s): %s"
            % (abs(worst), " -> ".join(str(c) for c in counts),
               days[i - 1], days[i], depth["note"]))
    out = {
        "year": str(year), "snapshots": len(days),
        "first": days[0] if days else None, "last": days[-1] if days else None,
        "min_rows": min(counts) if counts else 0,
        "max_rows": max(counts) if counts else 0,
        # DAY-OVER-DAY MOVEMENT, because min/max cannot show a shrinking board.
        #
        # Observed 2026-08-13: total_drafts rose 115 -> 119 -> 125 while row_count
        # fell 705 -> 708 -> 672. `min_rows 672, max_rows 708` is true and says
        # nothing about 36 players vanishing in a day. The likely mechanism is
        # MFL's CUTOFF=5 behaving as a PERCENTAGE — a rising draft count raises the
        # bar and marginal players fall off — but that is unconfirmed from here, so
        # this SURFACES the movement rather than declaring a defect.
        "row_deltas": deltas,
        "largest_drop": (min(deltas) if deltas else None),
        "row_drop_note": drop_note,
        # THE DEPTH OF THE WORST DROP, as structure rather than only as prose, so
        # a consumer can branch on `verdict` without parsing a sentence. None when
        # no drop cleared the floor — NOT a zeroed dict, which would read as
        # "measured, and nothing was lost" (rule 13f).
        "drop_depth": depth,
        # A DAY WITH ZERO ROWS IS NOT A DAY CAPTURED. It is a failed fetch wearing
        # a date, and counting it would make a broken run look like coverage.
        "empty_snapshots": sum(1 for c in counts if c == 0),
    }
    out.update(_gaps(days))
    return out


def missed_yesterday(series: list, year, today: _date) -> bool:
    """Did the daily capture skip the run before this one — i.e. is TODAY a resume.

    THE ESCALATION CONDITION, AND IT LIVES HERE RATHER THAN IN THE WORKFLOW
    because the first draft of it lived in the workflow and had two defects that
    no test in this project could have reached: it read the runner's local clock
    instead of UTC, and it asked `missing_days` — a list capped at 14 — whether
    yesterday was absent, so a long enough historical gap would push yesterday
    off the end and silently stop the alarm firing. A cap turning into a mute is
    the exact failure this module keeps finding in other people's code, and it
    got written here the moment the logic was somewhere untestable.

    WHY THIS CONDITION AND NOT "the archive has a gap". A permanent historical
    hole cannot be repaired — MFL serves no as-of-date board — so escalating on
    it would make this job red every morning for ever, and a permanently red job
    gets muted and then ignored. This fires on the run that can FIRST see the
    loss and goes quiet by itself the next day.

    AND THE LIMIT, AGAIN, because it is the same one: a capture that stops and
    never resumes never reaches this function, because the job that would call
    it is the job that is not running.
    """
    days = {s.get("observed_at") for s in _series_of(series)
            if str(s.get("year")) == str(year)}
    days.discard(None)
    if not days:
        return False
    yday = (today - _timedelta(days=1)).isoformat()
    # A BRAND-NEW ARCHIVE HAS NOT MISSED ANYTHING. Without this, the first run
    # would escalate about the day before the archive existed.
    return min(days) < yday and yday not in days


def days_since_last(series: list, year, today: _date):
    """How far behind the archive's newest row is. None when nothing is captured.

    THE NUMBER THE RESUME ALARM SHOULD QUOTE, and it is not `coverage()['missing']`.
    Found by rehearsing the workflow end to end against a dead MFL: the alarm
    printed **"0 uncaptured day(s)"** while correctly firing, because `missing`
    counts INTERIOR gaps and a capture that has stopped has none yet — the hole
    only becomes interior once a later row lands on the far side of it.

    So the two numbers answer different questions and the alarm was quoting the
    wrong one: `missing` is "days lost inside the span I hold", this is "how far
    behind I am right now". A message about an unrecoverable loss that reports
    zero is worse than no message; it reads as a bug and gets ignored.
    """
    days = {s.get("observed_at") for s in _series_of(series)
            if str(s.get("year")) == str(year)}
    days.discard(None)
    if not days:
        return None
    try:
        return (today - _date.fromisoformat(max(days))).days
    except (TypeError, ValueError):
        return None


def resume_alarm(missing, stale_days) -> str:
    """The one sentence the escalation prints. Built here because it is CONDITIONAL.

    The two numbers describe different halves of the same outage and exactly one
    of them is zero in each case, so a fixed template always prints a nought:

        capture succeeded and resumed   stale_days 0, missing 6
        capture is dead, never resumed  stale_days 7, missing 0

    Both templates were accurate and both read as broken. An alarm for an
    unrecoverable loss that contains a stray zero gets skimmed, and a skimmed
    alarm is a missed one — so it says only what is true and non-zero.
    """
    parts = []
    if stale_days not in (None, "?", 0):
        parts.append("its newest row is %s day(s) old" % stale_days)
    if missing not in (None, "?", 0):
        parts.append("%s day(s) are already lost inside the span it holds" % missing)
    if not parts:
        # Neither number is positive, yet `missed_yesterday` fired. Say exactly
        # that rather than inventing a figure — the run still deserves to be red.
        return ("D3 capture MISSED AT LEAST YESTERDAY (the archive cannot say how "
                "many days — treat its span as unknown)")
    return "D3 capture MISSED AT LEAST YESTERDAY — " + ", and ".join(parts)


def load(path=None) -> list:
    p = Path(path or SERIES)
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("series") or []


#: What the decode key is SUPPOSED to carry, declared rather than derived, for the
#: same reason `SNAPSHOT_FIELDS` is: a field that stops being written must show up
#: as empty rather than simply ceasing to exist.
PLAYER_FIELDS = ["name", "position", "team"]


def load_players(path=None) -> dict:
    """The stored id -> {name, position, team} map. `{}` when there is none."""
    p = Path(path or SERIES)
    if not p.exists():
        return {}
    return json.loads(p.read_text()).get("players") or {}


def players_of(obj) -> dict:
    """The decode key out of whatever an archive was handed over as.

    Symmetric with `_series_of`, and for the same reason: callers legitimately
    hold the series LIST, the archive DICT or the path to it, and a reader that
    understands only one of the three silently returns nothing for the other two.
    A missing key here does not raise — the two days captured before the key
    existed genuinely have none, and that is a fact about those days.
    """
    if obj is None:
        return {}
    if isinstance(obj, (str, Path)):
        return load_players(obj)
    if isinstance(obj, dict):
        return obj.get("players") or {}
    return {}


def merge_players(existing: dict, incoming: dict) -> dict:
    """UNION the decode key, field by field. Never shrinks, never blanks.

    THE ARCHIVE IS APPEND-ONLY BECAUSE THE DAYS ARE PERISHABLE, and the key that
    decodes those days is perishable in exactly the same way. Two ways it would be
    lost, both silent, both handled here:

      A PLAYER FALLS OFF MFL'S ADP BOARD. Today's fetch does not mention him, so a
      replace would take his name with him — and every earlier day that priced him
      becomes a number against an id nothing can resolve. The union keeps him.

      MFL SERVES A BLANK. One day of `name: ""` would, under last-writer-wins,
      overwrite the archive's only copy of who an id is. `population` would go on
      reporting the field 100% present, because the key is still there. Absent is
      not zero and neither is empty, so an ABSENT incoming value never displaces a
      value we already hold.
    """
    out = {str(k): dict(v or {}) for k, v in (existing or {}).items()}
    for pid, rec in (incoming or {}).items():
        pid = str(pid)
        cur = out.setdefault(pid, {})
        for f, v in (rec or {}).items():
            if not FP._is_absent(v) or f not in cur:
                cur[f] = v
    return out


def save(series: list, path=None, players=None) -> None:
    p = Path(path or SERIES)
    p.parent.mkdir(parents=True, exist_ok=True)
    # THE DECODE KEY IS UNIONED WITH WHAT IS ALREADY ON DISK, NEVER TAKEN FROM THE
    # ARGUMENTS ALONE. `save` has more than one caller and the first one that does
    # not happen to hold the map would otherwise delete it for every day already
    # archived — leaving a file that still looks complete, because the dates, the
    # rows and the coverage are all still there.
    merged = merge_players(load_players(p), players or {})
    p.write_text(json.dumps({
        "_note": "D3 external ADP archive. Daily, FULL board, append-only, no retention "
                 "window. Not draft/data/adp_series.json (that is the HOME staleness "
                 "instrument, capped at 300 players / 60 days). See INGEST-PLAN.md D3.",
        # POPULATION TRAVELS WITH THE ARCHIVE (Cory, 2026-08-12). One line at write
        # time. `total_drafts` is the provider's composition figure and this module
        # already says a snapshot without it "cannot be judged later" — so the day it
        # starts coming back empty has to be visible HERE, in the file, rather than
        # discovered by whoever next tries to weight the series.
        "population": FP.of_records(series or [], fields=SNAPSHOT_FIELDS),
        # AND SO DOES COVERAGE, for the same reason one step along. Population
        # answers "which FIELDS of a row are empty". On an append-only DAILY
        # series there is a second hole shaped exactly like it and just as
        # invisible: a day with no row. `population` cannot see it — a day that
        # was never captured contributes no row to be counted as empty, so a
        # holed archive scores 100% on every field.
        #
        # Recorded per year, beside the rows, so the reader who picks this file
        # up as F5 evidence learns what it does NOT contain without having to
        # difference the dates themselves.
        "coverage": {y: coverage(series or [], y)
                     for y in sorted({str(s.get("year")) for s in (series or [])})},
        # THE DECODE KEY, BESIDE THE THING IT DECODES. The archive stores MFL's own
        # player ids, which is right — an archive records what the source said. But
        # for two days it stored ONLY those ids, and an id is not evidence: nothing
        # in this repo could resolve one without a live call to MFL, which is the
        # exact dependency the archive exists to outlive. Its population is recorded
        # for the same reason every other durable record here carries one.
        "players": merged,
        "players_population": FP.of_records(
            [dict(v, mfl_id=k) for k, v in sorted(merged.items())],
            fields=PLAYER_FIELDS),
        "series": series}, indent=1))


# ── the fetch, CI only ──────────────────────────────────────────────────────
#: One HTTP request stood between us and a day of the curve. A transient 5xx or a
#: reset at 11:20 UTC raised, failed the step, and lost an observation that cannot
#: be refetched — the same unrecoverable-day exposure as the push race, on the side
#: far more likely to fail, because it depends on a third party being up at a fixed
#: minute. Four attempts over ~18s, nowhere near the job timeout.
RETRY_ATTEMPTS = 4
RETRY_BACKOFF_S = 3


def retryable(exc) -> bool:
    """Is this error worth another attempt, or is it the server's ANSWER.

    PURE AND TESTED ON PURPOSE. `fetch_mfl` is `pragma: no cover` — it needs
    egress — so retry logic written inside it would be untested logic in the path
    that guards a perishable day. Today already produced one instance of that
    exact mistake (the escalation condition written inline in the workflow YAML,
    where two defects sat that no test could reach), so the decision lives here
    and only the socket call stays uncovered.

    A 429 or 5xx is the server saying "not now". A 404 or 403 is the server
    saying "no", and repeating the question does not change the answer — it just
    spends the window. Same distinction `archived-adp-probe.yml` already draws.
    """
    import urllib.error
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code == 429 or 500 <= exc.code < 600
    # URLError covers DNS, connection reset and TLS; socket.timeout arrives as
    # TimeoutError. All are "the network did not answer", not "the server said no".
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError))


def with_retry(call, attempts=RETRY_ATTEMPTS, backoff=RETRY_BACKOFF_S,
               sleep=None, note=None):
    """Call `call()`, retrying only what `retryable` allows. Re-raises the last error.

    `sleep` is injected so the tests exercise the real loop without waiting, and
    the BACKOFF IS BETWEEN ATTEMPTS ONLY — pausing before the first buys nothing
    and delays every healthy run.
    """
    import time
    sleep = sleep or time.sleep
    last = None
    for i in range(max(1, attempts)):
        if i:
            sleep(backoff * i)
        try:
            return call()
        except Exception as e:          # noqa: BLE001 — re-raised below if final
            if not retryable(e) or i == attempts - 1:
                raise
            last = e
            if note:
                note("attempt %d/%d failed (%s: %s) — retrying"
                     % (i + 1, attempts, type(e).__name__, e))
    raise last                          # pragma: no cover  (loop always returns or raises)


def _mfl_url(year, params) -> str:
    import urllib.parse
    return ("https://api.myfantasyleague.com/%s/export?" % year) + urllib.parse.urlencode(params)


ADP_PARAMS = {"TYPE": "adp", "PERIOD": "DRAFT", "IS_PPR": "1", "IS_KEEPER": "N",
              "IS_MOCK": "-1", "INJURED": "-1", "CUTOFF": "5", "FCOUNT": "12", "JSON": "1"}
PLAYERS_PARAMS = {"TYPE": "players", "JSON": "1"}


#: Which of MFL's per-player fields describe the SPREAD rather than the mean.
DISPERSION_FIELDS = ("min_pick", "max_pick", "sel_pct", "drafts")

#: What makes a row a SPREAD. `drafts` and `sel_pct` alone do not describe one, so
#: the health alarm and the spread summary count rows carrying at least one of
#: these — never rows carrying anything at all.
DISPERSION_BOUNDS = ("min_pick", "max_pick")

#: What makes a row WORTH KEEPING, which is a wider question than what makes it a
#: spread — and the two were the same test until `marginal_adp` arrived.
#:
#: `dispersion` had exactly one consumer when it was written, so "no bound" and
#: "nothing useful" were the same thing. The marginal day reads `drafts` — the
#: exact per-player denominator, available from no other field — off the same
#: record, and a player MFL counts but does not bound was being dropped carrying
#: the one number nothing else supplies.
#:
#: THIS IS NOT HYPOTHETICAL UNTIL THE FIRST REAL CAPTURE PROVES IT EITHER WAY:
#: `dispersion_health` says of these very fields that "the shape is right and only
#: the names are unproven". If `minPick`/`maxPick` turn out absent, the bounds-only
#: test drops EVERY row and the marginal day becomes silently underivable on a day
#: whose denominator did arrive.
DISPERSION_KEEP = ("min_pick", "max_pick", "drafts")


def dispersion_of(parsed: list) -> dict:
    """`mfl_adp.parse` rows -> {mfl_id: {min_pick, max_pick, sel_pct, drafts}}.

    PURE, AND SPLIT OUT ON PURPOSE. This used to live inside `fetch_mfl`, which is
    `pragma: no cover` because it needs egress — so the one transformation that
    decides whether a day's spread survives ran once a day, in CI, untested. A bug
    there would not fail loudly: it would capture the mean and silently drop the
    spread again, which is precisely the defect the capture change was made to end,
    reintroduced where nothing is looking.

    Same split this file already made for the row extraction, and for the same
    reason: the fetch goes on one side, the transformation on the other.

    A player the source gave NO bound for is OMITTED rather than stored as a row of
    nulls. Nulls on disk read as a measurement of nothing, and they would inflate
    `dispersion_rows` until it stopped being a coverage figure and became a copy of
    `row_count`. One bound is enough to keep him — partial is not absent.
    """
    out = {}
    for r in (parsed or []):
        pid = r.get("mfl_id")
        if pid is None:
            continue
        # KEPT IF IT CARRIES ANYTHING A CONSUMER NEEDS, dropped only if it says
        # nothing — a row of all-None on disk is a measurement of nothing wearing
        # the shape of one.
        if all(r.get(k) is None for k in DISPERSION_KEEP):
            continue
        out[str(pid)] = {k: r.get(k) for k in DISPERSION_FIELDS}
    return out


def fetch_mfl(year):  # pragma: no cover  (egress; CI only)
    """One day's MFL ADP board AND the key that decodes it.

    Returns `(rows, players, total_drafts, note, dispersion)` — `rows` is
    {mfl_id: adp}, `players` is {mfl_id: {name, position, team}}, `dispersion` is
    {mfl_id: {min_pick, max_pick, sel_pct, drafts}}.

    THIS IS THE EGRESS AND NOTHING ELSE. Everything after the two HTTP reads is
    `assemble_day`, which is pure and tested; only the parts that genuinely
    cannot run outside CI stay behind this `pragma: no cover`.

    DISPERSION IS PART OF THE PERISHABLE DAY. MFL publishes minPick, maxPick and
    draftSelPct per player; `parse` discarded them until 2026-08-13, so the two
    days already archived have the mean and nothing else. The board's `adp_sd` is
    meanwhile a clamp saturating at 15.00 (any adp >= 100) and at exactly 30.00
    for the whole search_rank fallback — no player-specific content at all, in a
    field that drives survival and therefore VONA.

    TWO ENDPOINTS, BECAUSE ONE OF THEM IS NOT EVIDENCE ON ITS OWN. This fetched
    only TYPE=adp for its first two days and archived {mfl_id: adp}, which nothing
    in this repo can resolve without asking MFL again — the exact dependency a
    perishable-day archive exists to outlive.

    THE ROW EXTRACTION IS NO LONGER WRITTEN HERE. `mfl_adp.parse` already joins
    these two exports and is unit-tested; this file had a second, hand-rolled
    version of the same read that silently differed by dropping the join. That is
    the multi-derivation failure rule 11 governs, and a crosswalk is exactly where
    it hides. Only `totalDrafts` is read directly, because it is a property of the
    ADP report rather than of a row and `parse` does not surface it.

    A FAILED PLAYERS FETCH DOES NOT COST THE DAY. The ADP curve is the perishable
    thing; names are near-static and the archive's map is a union, so yesterday's
    key still decodes almost every id. The run continues with an empty map and says
    so loudly, rather than throwing away an observation that cannot be refetched.
    """
    import urllib.request

    def get(params, what):
        req = urllib.request.Request(_mfl_url(year, params),
                                     headers={"User-Agent": USER_AGENT})

        def once():
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        return with_retry(once, note=lambda m: print("fetch_mfl(%s): %s" % (what, m)))

    adp_text = get(ADP_PARAMS, "adp")
    note = "mfl PERIOD=DRAFT IS_PPR=1 FCOUNT=12"
    try:
        players_text = get(PLAYERS_PARAMS, "players")
    except Exception as e:                                       # noqa: BLE001
        print("fetch_mfl: PLAYERS EXPORT FAILED (%s: %s) — capturing the day's ADP "
              "anyway; the stored decode key keeps yesterday's names, and any id "
              "first seen today will be unresolvable until the next good fetch"
              % (type(e).__name__, e))
        players_text, note = "{}", note + " (players export FAILED this run)"

    return assemble_day(adp_text, players_text, note)


def assemble_day(adp_text, players_text, note=""):
    """The two MFL exports -> one day's board. PURE, SO THE GUARDS CAN BE PROVEN.

    Returns `(rows, players, total_drafts, note, dispersion)` — the same tuple
    `fetch_mfl` has always returned, because this IS the second half of
    `fetch_mfl`, moved out from behind `pragma: no cover`.

    WHY IT MOVED, AND IT IS THE SAME REASON `dispersion_of` MOVED. Everything
    below the two HTTP reads is a transformation with no egress in it, and it was
    living inside a function nothing can execute — so the standing invariant this
    module tests everywhere else, A GUARD MAY NEVER COST THE DAY, was checked for
    every helper `capture()` calls and for NONE of the helpers `fetch_mfl` calls,
    while the riskiest line in the whole path sat in here.

    THE THREE ROLES ARE THE SAME ONES `capture()` ALREADY NAMES:

      SOURCE   `mfl_adp.parse` — if it fails there is no board, so raising is the
               only honest outcome and the caller must not paper over it.
      GUARD    `dispersion_of`, `dispersion_diagnosis` — enhancements. Neither
               existed before 2026-08-13 and the archive was worth keeping
               without them, so neither may stop a day reaching disk.
      REPORT   the note. Never load-bearing.

    The ADP curve is the perishable thing. Names, spread and diagnosis are all
    recoverable or optional; the mean as of a past date is not, and no provider
    serves it again.
    """
    import mfl_adp as MFL

    parsed = MFL.parse(adp_text, players_text)
    rows = {r["mfl_id"]: r["adp"] for r in parsed}
    players = {r["mfl_id"]: {"name": r.get("name"), "position": r.get("position"),
                             "team": r.get("team")}
               for r in parsed}
    # Only players the source actually gave a spread for. A row with every field
    # None would be indistinguishable from a measured zero once it is on disk.
    #
    # ⚠ GUARDED, BECAUSE THE SPREAD IS AN ENHANCEMENT AND THE DAY IS NOT.
    # An ADP day cannot be refetched. `dispersion_of` is pure and tested, but
    # 2026-08-14 is the FIRST contact between it and MFL's real response — MFL is
    # unreachable from here, so no amount of care rehearses that — and an
    # unexpected shape in one row would raise, abort the capture, and cost a day
    # that no later run can recover, in exchange for a field we did without
    # entirely until yesterday.
    #
    # The diagnosis two blocks down already carries this rule in its own comment:
    # "must never cost the capture". This line did not, and it is the one most
    # likely to meet something new. Failing to a spread of NOTHING is honest —
    # `dispersion_health` already reports an absent spread by name, and the note
    # says which exception it was, so the fix is a diff rather than a second
    # unrefetchable day of guessing.
    try:
        dispersion = dispersion_of(parsed)
    except Exception as e:                          # noqa: BLE001
        dispersion = {}
        note = note + (" | DISPERSION PARSE FAILED (%s: %s) — the day's ADP is "
                       "captured, the spread is not" % (type(e).__name__, e))
        print("assemble_day: dispersion parse FAILED (%s: %s) — capturing the "
              "day's ADP anyway" % (type(e).__name__, e))
    # IF THE SPREAD DID NOT ARRIVE, SAY WHY IN THE SAME BREATH. MFL cannot be
    # reached from the dev environment (the agent proxy 403s CONNECT to
    # api.myfantasyleague.com:443), so the scheduled run is the first contact
    # between our field names and MFL's real response and cannot be rehearsed.
    # `dispersion_health` reports that nothing arrived; this reports WHAT DID, so
    # the fix is a diff rather than a second unrefetchable day of guessing.
    try:
        raw_node = ((json.loads(adp_text) or {}).get("adp") or {}).get("player") or []
        if isinstance(raw_node, dict):
            raw_node = [raw_node]
        diag = dispersion_diagnosis(raw_node, dispersion)
    except Exception as e:                          # noqa: BLE001
        # The DIAGNOSIS must never cost the capture — same rule as everything
        # else after the fetch in this file.
        diag = "dispersion diagnosis itself failed (%s)" % type(e).__name__
    if diag:
        note = note + " | " + diag
    try:
        total = int(((json.loads(adp_text) or {}).get("adp") or {}).get("totalDrafts"))
    except (TypeError, ValueError):
        total = None
    return rows, players, total, note, dispersion


def collapse_verdict(now: int, series, year, observed_at) -> dict:
    """Is today's board a TRUNCATED FETCH rather than the feed moving? -> verdict.

    EXTRACTED FROM `capture` SO IT IS REACHABLE AT ALL. `capture` is egress and
    carries `pragma: no cover`; a guard living inside it can only be tested by
    reimplementing its arithmetic in the test file, and a test that reimplements
    the thing it checks passes no matter what the shipped code does. THE MUTATION
    GATE PROVED THAT ON THE FIRST CUT OF THIS GUARD: changing the real condition
    inside `capture` left every test written for it green.

    `refuse: False` WITH A `status` SAYS WHICH KIND OF PASS IT IS. The season's
    first capture has no yesterday, and that is `first_day` rather than a clean
    bill — a check whose only possible answer is "nothing to compare" has not
    looked (rule 13f).
    """
    prior = [s for s in _series_of(series)
             if str(s.get("year")) == str(year)
             and (s.get("observed_at") or "") < str(observed_at)]
    if not prior:
        return {"refuse": False, "status": "first_day", "now": now, "was": None,
                "kept": None, "floor": COLLAPSE_KEEP_FRACTION,
                "note": "no earlier day for %s, so nothing was compared — that is "
                        "the archive's age, not a judgement on this board" % year}
    was = len((sorted(prior, key=lambda s: s.get("observed_at") or "")[-1]
               .get("rows") or {}))
    if not was:
        return {"refuse": False, "status": "prior_empty", "now": now, "was": was,
                "kept": None, "floor": COLLAPSE_KEEP_FRACTION,
                "note": "the previous day holds no rows, so a share of it is not "
                        "a quantity — nothing was compared"}
    kept = now / float(was)
    return {"refuse": kept < COLLAPSE_KEEP_FRACTION, "status": "measured",
            "now": now, "was": was, "kept": kept, "floor": COLLAPSE_KEEP_FRACTION,
            "note": "kept %.1f%% of yesterday's %d rows" % (100.0 * kept, was)}

def capture(year, observed_at, path=None):  # pragma: no cover  (egress; CI only)
    rows, players, total, note, dispersion = fetch_mfl(year)
    if not rows:
        # A FETCH THAT RETURNED NOTHING IS NOT A DAY WITH NO ADP. Writing an empty
        # snapshot would put a date in the archive with no board behind it, and
        # `board()` would later hand a replay an empty market and call it frozen.
        raise RuntimeError(
            "capture for %s on %s returned ZERO rows — refusing to write an empty "
            "snapshot, because a dated empty board is indistinguishable from a real "
            "one downstream (%s)" % (year, observed_at, note))
    # ⚠ A TRUNCATED BOARD IS THE ONE BROKEN RESPONSE THAT LOOKS LIKE A GOOD DAY.
    # Measured by breaking the wire nine ways against this exact function: a
    # connection error, a 404, a 403, an empty body, garbage and a zero-player
    # export ALL raise and leave the archive untouched. A 200 carrying 20 of 681
    # players in a perfectly valid MFL shape wrote a 20-row day with no complaint
    # — into an APPEND-ONLY archive whose days cannot be refetched, where every
    # later coverage figure counts it as a captured day.
    #
    # `if not rows` above catches only ZERO. This catches the collapse.
    #
    # WHY REFUSE RATHER THAN MARK, given this file's own rule that a lost day is
    # permanent and a corrupt one is recoverable: a truncated day is NOT
    # recoverable-by-noticing. A 20-row day reads as a 20-row day forever, and
    # nothing downstream can tell it from a market that priced 20 players. The
    # day is also not lost — this workflow takes `workflow_dispatch`, and three
    # of its seven runs to date were dispatches, so a refused morning is re-run
    # rather than gone.
    # ⚠ AND THE GUARD MUST NOT BE ABLE TO KILL THE DAY EITHER — the fourth time
    # this file has had to say so, and the standing classification test caught me
    # not saying it. REFUSING BECAUSE THE BOARD COLLAPSED is the point; ABORTING
    # BECAUSE THIS CODE THREW is the alarm destroying what it watches. So the
    # measurement sits in a `try` and only the VERDICT propagates.
    verdict = {"refuse": False, "status": "guard_failed"}
    try:
        verdict = collapse_verdict(len(rows), load(path), year, observed_at)
    except Exception as e:                                       # noqa: BLE001
        print("collapse guard COULD NOT RUN (%s: %s) — the truncation check did "
              "not happen and the day is being written unjudged. That is a fact "
              "about this guard, not about the board." % (type(e).__name__, e))
    if verdict["refuse"]:
        raise RuntimeError(
            "capture for %s on %s returned %d rows against %d yesterday — %s, "
            "under the %.0f%% floor. Refusing to write: a truncated 200 is "
            "indistinguishable downstream from a market that priced this many "
            "players, and this archive cannot refetch the day to correct it. "
            "Re-dispatch the workflow (%s)"
            % (year, observed_at, verdict["now"], verdict["was"],
               verdict["note"], 100.0 * verdict["floor"], note))

    series = append_snapshot(load(path), year, observed_at, rows, total,
                             source_note=note, dispersion=dispersion)

    # INTEGRITY BEFORE THE WRITE, NOT AFTER IT. The days are unrefetchable, so an
    # archive already written corrupt is permanently corrupt — there is no second
    # chance to be careful. Checking after `save()` would put the bad day on disk
    # and in git before anyone saw the complaint.
    #
    # This refuses only FATAL findings (see `integrity`): a code bug or corruption.
    # An id the decode key cannot resolve is REPORTED and written, because
    # discarding a whole board to protect a lookup is the alarm destroying what it
    # watches — the lesson this file already carries at the board-pin step.
    # ⚠ AND THE CHECKER MUST NOT BE ABLE TO KILL THE DAY EITHER. The refusal below
    # is deliberate for CORRUPTION — but this guard also stands between a good
    # board and the disk, so a BUG IN THE CHECKER would silently cost a day no
    # provider will serve again. That is the board-pin lesson for the third time in
    # this file, and I introduced this instance myself while fixing the second.
    #
    # WHICH ERROR IS WORSE is not close. A possibly-corrupt day is RECOVERABLE: the
    # standing CI test runs `integrity` against the committed archive and would
    # catch it, and the file can be corrected. A lost day is PERMANENT. So a
    # checker that cannot RUN reports loudly and does not block; a checker that
    # runs and finds corruption in TODAY'S SNAPSHOT still refuses.
    #
    # ⚠ AND IT IS SCOPED TO TODAY — see `blocking_fatal`. `integrity` judges the
    # whole archive, so refusing on `ok` meant one corrupt day anywhere would have
    # blocked every future capture until someone noticed, turning one recoverable
    # loss into an unbounded permanent one.
    #
    # BOTH GUARD CALLS SIT IN ONE `try`, deliberately. `blocking_fatal` is the
    # second thing standing between a good board and the disk, and it would have
    # been the fourth guard in this file able to destroy what it protects if a bug
    # in it were allowed to propagate.
    try:
        ig = integrity({"series": series, "players": merge_players(
            load_players(path), players or {})})
        blocking = blocking_fatal(ig, year, observed_at)
    except Exception as e:                          # noqa: BLE001
        ig = {"ok": True, "fatal": [], "reported": [], "status": "check_failed"}
        blocking = []
        print("INTEGRITY CHECK ITSELF FAILED (%s: %s) — WRITING THE DAY ANYWAY. A "
              "bug in the guard is not evidence the data is bad, and the day cannot "
              "be refetched. The standing check on the committed archive still runs."
              % (type(e).__name__, e))
    # LOUD ABOUT WHAT IT IS NOT REFUSING FOR. An older day going fatal is a real
    # finding and must not become quiet just because it no longer stops the write.
    older = [f for f in (ig.get("fatal") or []) if f not in blocking]
    if older:
        print("⚠ THE ARCHIVE HAS %d FATAL FINDING(S) ON OTHER DAYS — WRITING TODAY "
              "ANYWAY, because refusing does not unwrite them and today's board "
              "cannot be refetched. FIX THE ARCHIVE: %s"
              % (len(older), json.dumps(older, default=str)[:400]))
    if blocking:
        raise RuntimeError(
            "REFUSING TO WRITE — integrity check failed for %s on %s: %s. The "
            "archive is append-only and its days cannot be refetched, so a corrupt "
            "snapshot would be permanent."
            % (year, observed_at, json.dumps(blocking, default=str)[:400]))

    save(series, path, players=players)

    # ── THE DAY IS SAFE FROM HERE. EVERYTHING BELOW IS REPORTING. ───────────
    #
    # THE LESSON THIS FILE'S WORKFLOW ALREADY CARRIES IN CAPITALS, one layer down.
    # `external-adp-capture.yml` says at the board-pin step: THE PIN MUST NOT BE
    # ABLE TO KILL THE SNAPSHOT — a failure in the recoverable artifact was
    # destroying the unrecoverable one. The same shape was live right here and
    # unnoticed: `save()` runs, then a summary line evaluates `len(dispersion)`.
    # Hand that a None and it raises AFTER the archive is written but BEFORE the
    # function returns, so the step fails; the commit step is gated on
    # `steps.cap.outcome == 'success'`; and the day sits on the runner's disk and
    # never reaches git. A cosmetic print, deleting a perishable day.
    #
    # Not reachable today — `dispersion_of` always returns a dict — and one edit
    # to `fetch_mfl` away from being reachable, in a function that is
    # `pragma: no cover` precisely because nothing watches it.
    #
    # LOUD, NOT SILENT. The failure is printed rather than swallowed: a report
    # that suddenly cannot read what MFL returned is itself a finding about the
    # shape of the feed, and it must not become quiet just because it is no
    # longer fatal.
    rep = None
    try:
        rep = coverage(series, year)
        key = load_players(path)
        named = sum(1 for v in key.values() if not FP._is_absent((v or {}).get("name")))
        print(json.dumps({"captured": len(rows), "total_drafts": total, "coverage": rep,
                          # NAMED, because a dispersion count of zero after this landed
                          # means MFL stopped publishing it — not that spreads are zero.
                          "dispersion_rows": len(dispersion),
                          # THE SCALE OF `sel_pct`, ANSWERED FROM TODAY'S OWN DAY.
                          # `TRUNCATION_SEL_PCT` reads MFL's figure as a whole
                          # percent on the strength of one row quoted in a comment.
                          # Printed here because this is the first surface anyone
                          # reads on the morning it first matters — a check whose
                          # answer nobody sees is rule 14 in the other direction.
                          # Found by (year, date) rather than taken as `series[-1]`:
                          # today IS appended last, and depending on that is how a
                          # report ends up describing a different day than the one
                          # it names.
                          "sel_pct_units": sel_pct_units(next(
                              (s for s in series
                               if str(s.get("year")) == str(year)
                               and s.get("observed_at") == observed_at), {})),
                          # HOW MANY OF TODAY'S IDS THIS ARCHIVE CAN ACTUALLY RESOLVE.
                          # Printed beside the capture count because the two failed
                          # independently for two days and only one of them was visible.
                          "decode_key": {"ids_held": len(key), "named": named,
                                         "todays_rows_resolvable":
                                             sum(1 for pid in rows if not FP._is_absent(
                                                 (key.get(pid) or {}).get("name")))}},
                         indent=1))
    except Exception as e:                          # noqa: BLE001
        print("REPORT FAILED (%s: %s) — THE SNAPSHOT IS SAVED AND INTACT. This is "
              "a reporting failure, not a capture failure, and the day must not be "
              "discarded for it." % (type(e).__name__, e))
    # `uncounted`, matching this module's convention elsewhere: a coverage figure
    # that could not be computed is not a coverage figure of zero.
    return rep if rep is not None else {"year": str(year), "uncounted": True,
                                        "note": "coverage not computed — see "
                                                "REPORT FAILED above"}


#: How far MFL's per-player `draftsSelectedIn` may exceed its own `totalDrafts`
#: before the disagreement stops being the aggregation lag we have measured and
#: becomes a different fact. DERIVED FROM THE OBSERVATION, not chosen to pass:
#: on 2026-08-14 the worst excess was 3 on a pool of 127 (2.4%), so the bound is
#: set at 5% of the pool with a floor of 5 — comfortably above what MFL does and
#: far below anything that would indicate the two fields describe different
#: populations.
#: The day the two constants below were derived from a real snapshot. Named
#: rather than written into prose, so a note can say WHEN it was calibrated
#: without claiming those were this morning's numbers.
DRAFTS_EXCESS_CALIBRATION = "2026-08-14"

DRAFTS_EXCESS_TOLERANCE = 0.05
DRAFTS_EXCESS_FLOOR = 5


def snapshot_audit(snapshot: dict) -> dict:
    """Is this day trustworthy? -> {ok, fatal, observed, checked}.

    WRITTEN TO A DIRECT REQUEST (Cory, 2026-08-14): *"the daily data capture
    process needs to be correct... the data itself needs to be accurate and we
    need understand what it means so we don't misuse it."*

    TWO CATEGORIES, AND CONFLATING THEM IS HOW A REAL ALARM GETS MUTED.

    **FATAL** — arithmetically impossible, so either our pipeline or MFL's export
    is broken and nothing on the day may be used. `min_pick <= adp <= max_pick` is
    the strongest of these: a mean pick outside the range of the picks it averages
    cannot happen, and the marginal-ADP derivation assumes exactly that those
    fields describe one population.

    **OBSERVED** — MFL disagreeing with itself, every day, in a way that is now
    measured and bounded. On 2026-08-14: 25 of 681 players carried a
    `draftsSelectedIn` above `totalDrafts` (127), the worst by 3, and 12 carried
    `draftSelPct` above 100 — up to 102.0. Recovering the denominator from each
    player's own pair gives 127.0-128.4 across the 180 with 100+ drafts, so the
    pool really is ~127-128 and MFL's aggregate simply lags its own counts.

    ⚠ THE CONSEQUENCE, WHICH IS THE POINT OF SAYING ANY OF THIS: `total_drafts`
    IS NOT AN EXACT BOUND AND MUST NOT DECIDE ANYTHING. `latest_marginal` used to
    choose its window on `total_drafts` deltas — a field wrong by up to 3 deciding
    a threshold of 3 — and now decides on per-player `drafts`, which are exact.
    Anything else reading `total_drafts` as a hard denominator is wrong by ~2%.

    AND THE TOLERANCE IS ITSELF CHECKED. Bounded is the reason the second category
    is tolerated at all; an excess of 40 on a pool of 127 is not the lag we
    measured, so it is promoted to FATAL rather than inheriting the tolerance
    granted to an excess of 3.
    """
    # ⚠ AN ABSENT DAY IS NOT A CORRUPT DAY, AND THIS REPORTED IT AS ONE. Handed
    # {} — which is what a caller asking about a year the archive does not hold
    # gets — every check below ran against an empty dict and the first one fired:
    # "row_count says None and the day holds 0 rows", FATAL, with a note about a
    # permanent record contradicting its own contents. The archive was fine; there
    # was no day. FOUND BY EXECUTING THE WORKFLOW STEP RATHER THAN READING IT,
    # which is the whole reason that sweep exists.
    if not snapshot:
        return {"status": "unmeasured", "ok": None, "fatal": [], "observed": [],
                "checked": [], "players": 0,
                "note": "no snapshot was handed to the audit — that is a fact "
                        "about which day was asked for, not about the archive, "
                        "and it is NOT a clean bill of health"}
    rows = (snapshot or {}).get("rows") or {}
    disp = (snapshot or {}).get("dispersion") or {}
    td = (snapshot or {}).get("total_drafts")
    fatal, observed, checked = [], [], []

    def fail(kind, note, **extra):
        fatal.append(dict({"kind": kind, "note": note}, **extra))

    checked.append("row_count")
    if (snapshot or {}).get("row_count") != len(rows):
        fail("row_count_mismatch",
             "row_count says %s and the day holds %d rows. Every coverage figure "
             "downstream reads row_count, so the archive would carry a permanent "
             "record whose own summary contradicts its contents."
             % ((snapshot or {}).get("row_count"), len(rows)))

    checked.append("dispersion_keys_in_rows")
    orphan = [k for k in disp if k not in rows]
    if orphan:
        fail("dispersion_orphan",
             "%d dispersion row(s) have no priced player — the two halves of the "
             "day describe different populations." % len(orphan),
             ids=orphan[:10])

    checked.append("adp_within_min_max")
    outside = []
    for pid, v in disp.items():
        lo, hi, adp = (v or {}).get("min_pick"), (v or {}).get("max_pick"), rows.get(pid)
        if adp is None or lo is None or hi is None:
            continue
        if not (float(lo) <= float(adp) <= float(hi)):
            outside.append({"player_id": pid, "min": lo, "adp": adp, "max": hi})
    if outside:
        fail("adp_outside_range",
             "%d player(s) have an ADP outside their OWN observed pick range. A "
             "mean of picks cannot fall outside the picks it averages, so "
             "`averagePick` and min/max are not describing the same population — "
             "and the marginal-ADP derivation assumes they are." % len(outside),
             examples=outside[:5])

    checked.append("min_pick_at_least_1")
    bad_lo = [pid for pid, v in disp.items()
              if (v or {}).get("min_pick") is not None and float(v["min_pick"]) < 1]
    if bad_lo:
        fail("min_pick_below_one",
             "%d player(s) report being drafted before pick 1." % len(bad_lo),
             ids=bad_lo[:10])

    # ── OBSERVED: MFL against itself, measured and bounded ──────────────────
    if td:
        checked.append("drafts_vs_total_drafts")
        over = [(pid, v["drafts"] - int(td)) for pid, v in disp.items()
                if (v or {}).get("drafts") is not None and v["drafts"] > int(td)]
        if over:
            worst = max(x for _p, x in over)
            bound = max(DRAFTS_EXCESS_FLOOR, DRAFTS_EXCESS_TOLERANCE * int(td))
            entry = {"kind": "drafts_above_total", "n": len(over),
                     "worst_excess": worst, "total_drafts": int(td),
                     "bound": round(bound, 1),
                     # ⚠ DERIVED FROM TODAY, NOT FROM THE DAY THIS WAS
                     # CALIBRATED. This note used to read "Measured 2026-08-14: 25
                     # players, worst excess 3 on a pool of 127" — frozen prose
                     # sitting beside three fields computing the same quantities
                     # live. On the 20th it would still have said 25 and 3.
                     "note": "MFL's aggregate lags its own per-player counts: %d "
                             "player(s) today, worst excess %d on a pool of %d. "
                             "`total_drafts` is therefore NOT an exact bound and "
                             "must not decide anything."
                             % (len(over), worst, int(td)),
                     # THE CALIBRATION KEPT AS PROVENANCE, clearly dated and
                     # clearly not a claim about this run.
                     "bound_calibrated_on": DRAFTS_EXCESS_CALIBRATION}
            if worst > bound:
                fail("drafts_above_total_UNBOUNDED",
                     "worst excess %d exceeds the measured lag bound of %.1f — "
                     "that is no longer the aggregation lag we understand, and "
                     "it must not inherit the tolerance calibrated on %s."
                     % (worst, bound, DRAFTS_EXCESS_CALIBRATION), **{k: v for k, v in entry.items()
                                          if k not in ("kind", "note")})
            else:
                observed.append(entry)

    checked.append("sel_pct_above_100")
    hot = [(pid, v["sel_pct"]) for pid, v in disp.items()
           if (v or {}).get("sel_pct") is not None and v["sel_pct"] > 100]
    if hot:
        observed.append({"kind": "sel_pct_above_100", "n": len(hot),
                         "worst": max(x for _p, x in hot),
                         # SAME FIX: the numbers come from `hot`, not from the
                         # afternoon this was first observed.
                         "note": "the same lag seen from the other side: a player "
                                 "counted in more drafts than the aggregate knows "
                                 "about exceeds 100%%. Today: %d player(s), worst "
                                 "%.1f." % (len(hot), max(x for _p, x in hot)),
                         "calibrated_on": DRAFTS_EXCESS_CALIBRATION})

    return {"status": "measured", "ok": not fatal, "fatal": fatal,
            "observed": observed, "checked": checked, "players": len(rows)}
