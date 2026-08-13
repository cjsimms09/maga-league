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

#: The fields a snapshot is SUPPOSED to carry, declared rather than derived. Derived
#: from the rows, a field that stops being written simply stops existing and the
#: population record cannot tell you it is gone — which is the failure mode, not a
#: detail of it.
#: A day-over-day drop of at least this many players earns a note. Declared, not
#: tuned: ~5% of a ~700-player board, the size of the drop that prompted this.
ROW_DROP_FLOOR = 30

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
TRUNCATION_SEL_PCT = 50.0


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
    """
    lo, hi = row.get("min_pick"), row.get("max_pick")
    n = row.get("drafts")
    base = {"sd": None, "n": None, "basis": "range/d_n", "truncated": None,
            "status": None, "note": None}
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
        return len(s.get("dispersion") or {})

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
        return {"last_pick": None, "teams": teams, "rounds": rounds, "note": note}
    return {"last_pick": teams * rounds, "teams": teams, "rounds": rounds,
            "note": note}


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
    days = sorted(s["observed_at"] for s in ser if str(s.get("year")) == str(year))
    counts = [s.get("row_count") or 0 for s in ser if str(s.get("year")) == str(year)]
    # Day-over-day row movement. One snapshot cannot show movement, so the largest
    # drop is None rather than 0 — 0 would read as "measured, and stable" (rule 13f).
    deltas = [counts[i] - counts[i - 1] for i in range(1, len(counts))]
    worst = min(deltas) if deltas else None
    drop_note = None
    if worst is not None and worst <= -ROW_DROP_FLOOR:
        drop_note = (
            "the board LOST %d players in a day (%s). More drafts with fewer priced "
            "players is not self-explanatory: check whether MFL's CUTOFF is a "
            "percentage of drafts rather than a count, which would raise the bar as "
            "drafts accumulate." % (abs(worst), " -> ".join(str(c) for c in counts)))
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

#: A player is kept only if the source published at least one BOUND. `drafts` and
#: `sel_pct` alone do not describe a spread, and a row of all-None on disk is
#: indistinguishable from a measured zero.
DISPERSION_BOUNDS = ("min_pick", "max_pick")


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
        if all(r.get(k) is None for k in DISPERSION_BOUNDS):
            continue
        out[str(pid)] = {k: r.get(k) for k in DISPERSION_FIELDS}
    return out


def fetch_mfl(year):  # pragma: no cover  (egress; CI only)
    """One day's MFL ADP board AND the key that decodes it.

    Returns `(rows, players, total_drafts, note, dispersion)` — `rows` is
    {mfl_id: adp}, `players` is {mfl_id: {name, position, team}}, `dispersion` is
    {mfl_id: {min_pick, max_pick, sel_pct, drafts}}.

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
    import mfl_adp as MFL

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

    parsed = MFL.parse(adp_text, players_text)
    rows = {r["mfl_id"]: r["adp"] for r in parsed}
    players = {r["mfl_id"]: {"name": r.get("name"), "position": r.get("position"),
                             "team": r.get("team")}
               for r in parsed}
    # Only players the source actually gave a spread for. A row with every field
    # None would be indistinguishable from a measured zero once it is on disk.
    dispersion = dispersion_of(parsed)
    try:
        total = int(((json.loads(adp_text) or {}).get("adp") or {}).get("totalDrafts"))
    except (TypeError, ValueError):
        total = None
    return rows, players, total, note, dispersion


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
    series = append_snapshot(load(path), year, observed_at, rows, total,
                             source_note=note, dispersion=dispersion)
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
