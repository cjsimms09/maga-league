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
SNAPSHOT_FIELDS = ["year", "observed_at", "rows", "total_drafts", "row_count"]

# The header the shipped client sends; FFC 403s Python's default. Kept in step
# with `draft/adp.py` by test, not by trust.
USER_AGENT = "mfga-league-draft-tool/1.0"


def append_snapshot(series: list, year, observed_at: str, rows: dict,
                    total_drafts=None) -> list:
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
        "row_count": len(rows or {}),
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


def as_store_snapshots(series: list, year) -> list:
    """The stored series -> `ExternalAsOfStore`'s input shape, for one season.

    THE READER, BUILT WITH THE WRITER (rule 14). It deliberately does NOT
    implement "latest strictly before the draft" — `ExternalAsOfStore.board()`
    owns that rule, and a second implementation here is how two derivation paths
    for one F5 decision would come to disagree.

    ⚠️ KNOWN DEFECT, PARKED FOR A — THIS PASSES FOREIGN IDS THROUGH. ⚠️
    The fix is written and tested on `claude/external-ingest-program-1xfinj`
    (commit `c35d0f2`): a REQUIRED `ids` argument, `crosswalk_map` to build it,
    and `ingest_run.adp_id_map` to raise rather than translate to nothing. It is
    NOT here because the change breaks `draft/tests/test_survival_grade.py`,
    which TERRITORY.md rules is A's, and a correctly-firing territory guard is
    not something to override for a two-line fixture. See PARKED, "THE ADP
    ARCHIVE'S IDS ARE NOT OUR IDS". Nothing consumes this before the draft.

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

    `crosswalk_map` below already builds the id map this needs, offline, and is
    tested — so the missing half is the call site, not the machinery.
    """
    return [{"observed_at": s["observed_at"],
             "rows": [{"player_id": pid, "adp": adp}
                      for pid, adp in (s.get("rows") or {}).items()]}
            for s in _series_of(series) if str(s.get("year")) == str(year)]


#: How many unmatched names to NAME in the crosswalk report. Same rule as
#: MISSING_DAYS_LISTED: the count is exact, only the list is capped.
UNMATCHED_LISTED = 12


def crosswalk_map(players: dict, board: list) -> tuple:
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
    import sys as _sys
    _draft = str(Path(__file__).resolve().parent.parent)
    if _draft not in _sys.path:
        _sys.path.insert(0, _draft)
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
    return ids, report


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
    out = {
        "year": str(year), "snapshots": len(days),
        "first": days[0] if days else None, "last": days[-1] if days else None,
        "min_rows": min(counts) if counts else 0,
        "max_rows": max(counts) if counts else 0,
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


def fetch_mfl(year):  # pragma: no cover  (egress; CI only)
    """One day's MFL ADP board AND the key that decodes it.

    Returns `(rows, players, total_drafts, note)` — `rows` is {mfl_id: adp},
    `players` is {mfl_id: {name, position, team}}.

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
    try:
        total = int(((json.loads(adp_text) or {}).get("adp") or {}).get("totalDrafts"))
    except (TypeError, ValueError):
        total = None
    return rows, players, total, note


def capture(year, observed_at, path=None):  # pragma: no cover  (egress; CI only)
    rows, players, total, note = fetch_mfl(year)
    if not rows:
        # A FETCH THAT RETURNED NOTHING IS NOT A DAY WITH NO ADP. Writing an empty
        # snapshot would put a date in the archive with no board behind it, and
        # `board()` would later hand a replay an empty market and call it frozen.
        raise RuntimeError(
            "capture for %s on %s returned ZERO rows — refusing to write an empty "
            "snapshot, because a dated empty board is indistinguishable from a real "
            "one downstream (%s)" % (year, observed_at, note))
    series = append_snapshot(load(path), year, observed_at, rows, total)
    save(series, path, players=players)
    rep = coverage(series, year)
    key = load_players(path)
    named = sum(1 for v in key.values() if not FP._is_absent((v or {}).get("name")))
    print(json.dumps({"captured": len(rows), "total_drafts": total, "coverage": rep,
                      # HOW MANY OF TODAY'S IDS THIS ARCHIVE CAN ACTUALLY RESOLVE.
                      # Printed beside the capture count because the two failed
                      # independently for two days and only one of them was visible.
                      "decode_key": {"ids_held": len(key), "named": named,
                                     "todays_rows_resolvable":
                                         sum(1 for pid in rows if not FP._is_absent(
                                             (key.get(pid) or {}).get("name")))}},
                     indent=1))
    return rep
