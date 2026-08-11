"""THE INGEST RUN — league ids in, an attrition report out.

The pieces have existed separately: `mfl_adapter.to_league_record` converts three
MFL exports into one canonical record, `ingest_filters.screen_all` counts why
leagues were dropped. Nothing walked a list of leagues through both, so the
"first real fetch" this program is for had no spine. This is it.

THE FAILURE THIS FILE IS SHAPED AROUND, because it is the attrition seam one level
up. A league we could not FETCH is not a league that failed a FILTER. If a request
times out, or MFL 403s, or an export comes back unparseable, the honest report
says "we could not obtain 40 of these" — and a run that silently drops them
instead reports a smaller pool with a cleaner-looking match rate. Worse, dropping
them makes the DENOMINATOR wrong: `matched / examined` where `examined` quietly
excludes everything that failed is not a coverage figure, it is a flattering one.

So every league id put in comes out somewhere, with a reason, and fetch failures
are their own family (`F4.fetch_failed:*`) that `is_unreadable()` already sorts
into "evidence about this pipeline" rather than "evidence about the public pool".

WHAT IS PURE AND WHAT IS NOT. Everything that decides anything is pure and tested
offline: `build_record`, `run_screen`, `attrition_report`. Only `fetch_league`
touches the network, and MFL is policy-blocked in the sandbox and open in CI —
the same split every probe in this lane already lives with.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import ingest_filters as F  # noqa: E402
import mfl_adapter as A  # noqa: E402
from adp_asof_probe import USER_AGENT  # noqa: E402

MFL_HOST = "https://api.myfantasyleague.com"


def build_record(league_id, exports: dict, **passthrough) -> dict:
    """Three exports -> one canonical record, or a record marked UNFETCHABLE.

    `exports` is {"league": ..., "rules": ..., "draftResults": ...}, each either a
    payload or an error marker {"_error": "..."}. A missing or errored export is
    NOT passed to the adapter as an empty dict: that would make an unfetched
    league indistinguishable from a league whose export was genuinely empty, and
    the record would then be screened on data we never had.
    """
    bad = {k: (v or {}).get("_error") for k, v in (exports or {}).items()
           if isinstance(v, dict) and v.get("_error")}
    missing = [k for k in ("league", "rules", "draftResults") if k not in (exports or {})]
    if bad or missing:
        why = "; ".join(["%s: %s" % kv for kv in sorted(bad.items())]
                        + ["%s: absent" % m for m in sorted(missing)])
        return {"league_id": str(league_id), "source": "mfl", "unfetchable": why,
                "unreadable": {"fetch": "fetch_failed:%s" % why}}
    try:
        return A.to_league_record(exports["league"], exports["rules"],
                                  exports["draftResults"], league_id=league_id,
                                  **passthrough)
    except Exception as e:                                       # noqa: BLE001
        # ONE LEAGUE MUST NOT KILL THE RUN. Measured 2026-08-11: a single league
        # whose `draftUnit` was a LIST raised AttributeError 18 minutes into a
        # 250-league run and took the other 249 with it — no report, no attrition
        # table, nothing learned from any of them.
        #
        # This is the attrition seam at the outermost layer: a league we could not
        # PARSE is that league's reason, not the run's death, and it must be
        # UNREADABLE (about this pipeline) rather than filtered. The exception type
        # and message are kept so the defect stays diagnosable instead of becoming
        # an anonymous drop.
        return {"league_id": str(league_id), "source": "mfl",
                "unfetchable": "parse_failed:%s: %s" % (type(e).__name__, e),
                "unreadable": {"parse": "parse_failed:%s" % type(e).__name__}}


def run_screen(records: list) -> tuple:
    """(verdicts, matched). A verdict for EVERY record, including unfetchable ones.

    An unfetchable league short-circuits before `screen()`, because screening a
    record built from nothing would produce a confident F1/F2 reason about a
    league we never saw — the exact lie the attrition seam was fixed to stop.
    """
    verdicts = []
    for r in records or []:
        if r.get("unfetchable"):
            verdicts.append((r, False, "F4.fetch_failed:%s" % r["unfetchable"]))
            continue
        ok, why = F.screen(r)
        verdicts.append((r, ok, why))
    return verdicts, [r for r, ok, _ in verdicts if ok]


def attrition_report(verdicts: list, requested: list = None) -> dict:
    """The report F4 exists to produce, with the denominator kept honest.

    `requested` is the id list the run was ASKED for. Leagues that never produced
    a record at all — the process died, a batch was skipped — are counted as
    `never_attempted` rather than vanishing, because `matched / examined` with a
    silently shrunken `examined` is a flattering number, not a coverage one.
    """
    from collections import Counter
    reasons = Counter(why for _, _, why in verdicts)
    matched = [r for r, ok, _ in verdicts if ok]
    unreadable = sum(1 for _, ok, why in verdicts if not ok and F.is_unreadable(why))
    unclassified = sum(1 for _, ok, why in verdicts if not ok and not F.is_classified(why))
    fetch_failed = sum(1 for _, ok, why in verdicts
                       if not ok and F.reason_code(why) == "F4.fetch_failed")
    seen = {str(r.get("league_id")) for r, _, _ in verdicts}
    never = sorted(set(map(str, requested or [])) - seen)

    durations = [d for d in (_duration(r) for r, ok, _ in verdicts if ok) if d is not None]
    base = F.screen_all([r for r, _, _ in verdicts if not r.get("unfetchable")])
    rep = {
        "requested": len(requested) if requested is not None else len(verdicts),
        "attempted": len(verdicts),
        "never_attempted": len(never),
        "never_attempted_ids": never[:50],
        "fetch_failed": fetch_failed,
        "matched": len(matched),
        "rejected": len(verdicts) - len(matched),
        "rejected_unreadable": unreadable,
        "rejected_unclassified": unclassified,
        "rejected_filtered": len(verdicts) - len(matched) - unreadable - unclassified,
        "rejected_by_reason": dict(reasons),
        "filter_version": F.FILTER_VERSION,
        "unenforced_filters": base.get("unenforced_filters") or [],
        # Registered as a REPORTING addition in INGEST-PLAN (2026-08-11): free,
        # because first_pick_at/last_pick_at are already parsed, and it turns
        # "does any of the pool cross a date boundary" from an assumption into a
        # number. `lead_days` is per-decision precisely because of this spread.
        "draft_duration_days": _distribution(durations),
        # THE OTHER HALF OF THE SAME REGISTERED REQUIREMENT, and it was missing.
        # INGEST-PLAN's reporting addition says every run reports the draft-duration
        # distribution AND the per-league LEAD-DAYS SPREAD. Only the first was
        # here — rule 6, the written rule and the running system diverging, on a
        # requirement this lane registered itself. `test_the_run_reports_EVERY`
        # `_quantity_the_plan_says_it_reports` now closes that gap generally.
        "lead_days_spread": _lead_spread(verdicts),
        "target": F.TARGET_MATCHED_LEAGUE_SEASONS,
        "meets_target": len(matched) >= F.TARGET_MATCHED_LEAGUE_SEASONS,
    }
    rep["verdict"] = _verdict_line(rep)
    return rep


def _lead_spread(verdicts) -> dict:
    """Staleness of the frozen board across each matched league's picks, pooled.

    Per-DECISION, not per-league: `draft_at` is the FIRST pick, which is the right
    scalar for F5 admission and the wrong one for staleness. A day-five pick dated
    from day one understates the board's age by the whole length of the draft, on
    exactly the picks where it is oldest.

    UNDATED PICKS ARE COUNTED, never dated from the league — the store raises
    rather than inventing a lead time, and that raise is what `undated` counts.
    """
    from external_replay import ExternalAsOfStore
    mins, meds, maxs, spans, undated, n = [], [], [], [], 0, 0
    for r, ok, _ in verdicts:
        if not ok:
            continue
        observed = r.get("adp_observed_at")
        picks = (r.get("draft") or {}).get("picks") or []
        if not observed or not picks:
            continue
        store = ExternalAsOfStore(r.get("league_id"), r.get("draft_at"),
                                  [{"observed_at": observed, "rows": []}], None)
        sp = store.lead_days_spread([p.get("timestamp") for p in picks])
        undated += sp["undated"]
        if not sp["n"]:
            continue
        n += 1
        mins.append(sp["min"]); meds.append(sp["median"])
        maxs.append(sp["max"]); spans.append(sp["span_days"])
    return {"leagues": n, "undated_picks": undated,
            "min_of_min": min(mins) if mins else None,
            "median_of_median": (sorted(meds)[len(meds) // 2] if meds else None),
            "max_of_max": max(maxs) if maxs else None,
            "span_days": _distribution(spans)}


def _duration(record: dict):
    """A matched league's draft span in days, from the picks' own timestamps."""
    picks = (record.get("draft") or {}).get("picks") or []
    stamps = [p.get("timestamp") for p in picks if p.get("timestamp")]
    if len(stamps) < 2:
        return None
    return (max(stamps) - min(stamps)) / 86400.0


def _distribution(vals: list) -> dict:
    if not vals:
        return {"n": 0, "min": None, "median": None, "max": None, "over_one_day": 0}
    s = sorted(vals)
    mid = len(s) // 2
    return {"n": len(s), "min": round(s[0], 2),
            "median": round(s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2, 2),
            "max": round(s[-1], 2),
            # The number that says whether multi-day drafts are a tail case.
            "over_one_day": sum(1 for v in s if v > 1.0)}


def _verdict_line(rep: dict) -> str:
    """Rule 8 applied to the ingest: the failures lead, on the line itself."""
    parts = []
    if rep["never_attempted"]:
        parts.append("%d of %d requested leagues were NEVER ATTEMPTED — the denominator "
                     "below is incomplete, not a coverage figure"
                     % (rep["never_attempted"], rep["requested"]))
    if rep["fetch_failed"]:
        parts.append("%d could not be FETCHED — evidence about this pipeline, not about "
                     "how many public leagues match our format" % rep["fetch_failed"])
    if rep["rejected_unreadable"]:
        parts.append("%d of %d rejections are UNREADABLE (parse or fetch), also about this "
                     "pipeline" % (rep["rejected_unreadable"], rep["rejected"]))
    if rep["rejected_unclassified"]:
        parts.append("%d rejections carry an UNDECLARED reason code and are binned nowhere"
                     % rep["rejected_unclassified"])
    if rep["unenforced_filters"]:
        parts.append("%d pre-registered clause(s) could NOT be enforced and passed every "
                     "league: %s" % (len(rep["unenforced_filters"]),
                                     "; ".join(rep["unenforced_filters"])))
    head = ("%d matched league-seasons of %d attempted" % (rep["matched"], rep["attempted"]))
    if not rep["meets_target"]:
        head += ("; INSUFFICIENT against the pre-registered target of %d — per F7 this "
                 "changes NOTHING (no pooling, no shadow-field expansion) rather than "
                 "relaxing a filter to reach the bar" % rep["target"])
    return head + ("". join("; and " + p for p in parts))


# ── the fetch, CI only ──────────────────────────────────────────────────────
EXPORTS = {"league": "TYPE=league", "rules": "TYPE=rules", "draftResults": "TYPE=draftResults"}


def fetch_league(league_id, year, delay=0.34):  # pragma: no cover  (egress; CI only)
    """The three exports for one league. An error is RECORDED, never raised away.

    `delay` is not politeness for its own sake. A sample of 150 leagues is 450
    requests, and if MFL throttles partway through, every subsequent league comes
    back `F4.fetch_failed` — which the attrition report would faithfully classify as
    UNREADABLE and which a reader would take as "a third of the public pool could
    not be obtained". The truth would be "we asked too fast", and the two are the
    same rows. Slowing down removes most of the risk; `throttle_signal` catches
    what is left.
    """
    import time
    import urllib.error
    import urllib.request
    out = {}
    for i, (name, q) in enumerate(EXPORTS.items()):
        if i and delay:
            time.sleep(delay)
        url = "%s/%s/export?%s&L=%s&JSON=1" % (MFL_HOST, year, q, league_id)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        # 429 IS NOT A LEAGUE THAT COULD NOT BE FETCHED. Measured: the first real
        # 60-league run took 24 of 60 as `http 429 Too Many Requests`, 100% of its
        # failures on one signature — `throttle_signal` caught it, which is the only
        # reason those 24 were not written down as unobtainable leagues. Backing off
        # and retrying is the remedy the verdict itself named. Retries are BOUNDED
        # and a still-failing league is still recorded as failed: this removes a
        # cause of failure, it does not hide one.
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=45) as r:
                    out[name] = json.loads(r.read().decode("utf-8", "replace"))
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 3:
                    # Honour Retry-After when the server sends one; it knows better
                    # than any constant chosen here.
                    wait = e.headers.get("Retry-After") if e.headers else None
                    try:
                        wait = float(wait)
                    except (TypeError, ValueError):
                        wait = 2.0 * (2 ** attempt)
                    time.sleep(min(wait, 30.0))
                    continue
                out[name] = {"_error": "http %s %s" % (e.code, e.reason)}
                break
            except Exception as e:
                out[name] = {"_error": "%s: %s" % (type(e).__name__, e)}
                break
    return out


def throttle_signal(verdicts) -> dict:
    """Are the fetch failures about THE LEAGUES or about THE RATE WE ASKED?

    THE DISCRIMINATOR IS NON-INDEPENDENCE, NOT A MAGNITUDE — deliberately, because
    a threshold ("more than 30% failed") is a tolerance band, and a tolerance band
    is a decision I would be making on the run's behalf with no basis for the
    number. What can be said without one: 150 leagues are 150 independent things,
    and independent things do not fail with the SAME ERROR STRING. A single
    signature covering most failures is a property of the endpoint or of our
    request rate, and those failures are not evidence that the leagues are
    unobtainable.

    Reported whenever two or more fetch failures share a dominant signature. The
    run states it and does NOT reclassify anything: the leagues really were not
    fetched, and a rerun is the remedy, not a relabelling.
    """
    from collections import Counter
    # THE SHAPE COMES FROM `run_screen`, WHICH IS THE ONLY PRODUCER: a verdict is
    # the TUPLE `(record, ok, reason)` that `attrition_report` already consumes.
    # The first cut of this function read `v.get("reason")` — a dict shape that
    # exists nowhere except in the test I wrote for it, so the unit tests passed
    # and CI died on the real list. Third instance of that today, which is why the
    # test now builds its verdicts BY CALLING `run_screen` instead of hand-writing
    # them, and why an unrecognised shape RAISES here: reporting "no fetch
    # failures" because the shape did not match is a reassuring wrong answer, and
    # those are worse than a crash.
    reasons = [_verdict_reason(v) for v in (verdicts or [])]
    fails = [r for r in reasons if F.reason_code(r) == "F4.fetch_failed"]
    n = len(verdicts or [])
    if not fails:
        return {"fetch_failures": 0, "examined": n, "throttled_signature": None,
                "verdict": "no fetch failures"}
    sigs = Counter(_signature(f) for f in fails)
    top, count = sigs.most_common(1)[0]
    share = count / len(fails)
    rep = {"fetch_failures": len(fails), "examined": n,
           "fetch_failure_share": round(len(fails) / n, 4) if n else None,
           "signatures": dict(sigs.most_common(6)),
           "dominant_signature": top, "dominant_share": round(share, 4),
           "throttled_signature": top if count >= 2 else None}
    if count >= 2:
        rep["verdict"] = (
            "%d of %d leagues FAILED TO FETCH and %d of those (%.0f%%) share ONE error "
            "signature (%s). Independent leagues do not fail identically — this is the "
            "ENDPOINT or OUR REQUEST RATE, not %d unobtainable leagues, and the counts "
            "below must not be read as pool coverage. The remedy is a slower rerun, not "
            "a relabelling: these leagues really were not fetched."
            % (len(fails), n, count, 100 * share, top, len(fails)))
    else:
        rep["verdict"] = ("%d of %d leagues failed to fetch, with no shared signature — "
                          "consistent with per-league failures" % (len(fails), n))
    return rep


def _verdict_reason(v) -> str:
    """A verdict's reason, from the shape `run_screen` actually emits.

    `(record, ok, reason)` is the contract; a dict is accepted because it is a
    natural thing for a caller to build, and ANYTHING ELSE RAISES rather than
    yielding "" — an empty reason bins as no-failure, and a throttle detector that
    silently reports "no fetch failures" because it did not recognise its input is
    worse than one that crashes.
    """
    if isinstance(v, (tuple, list)) and len(v) >= 3:
        return str(v[2] or "")
    if isinstance(v, dict):
        return str(v.get("reason") or "")
    raise TypeError(
        "a verdict is `(record, ok, reason)` as produced by run_screen, got %s. "
        "Returning no reason here would report NO FETCH FAILURES for a run that "
        "may have been entirely throttled." % type(v).__name__)


def _signature(reason: str) -> str:
    """The error's KIND, with the league-specific tail removed.

    `F4.fetch_failed:draftResults: http 403 Forbidden; league: http 403 Forbidden`
    and the same for another league must collapse to one signature, or every
    failure is its own kind and nothing is ever detected as shared.
    """
    detail = str(reason).split(":", 1)[1] if ":" in str(reason) else str(reason)
    parts = sorted({p.split(":", 1)[-1].strip() for p in detail.split(";") if p.strip()})
    return "; ".join(parts) or "unknown"


def league_passthrough(picks, mfl_players, board_index, series, year) -> dict:
    """Everything `to_league_record` needs that MFL's three exports do not supply.

    THE ADP SNAPSHOT HAS EXACTLY ONE OWNER, DELIBERATELY. `ExternalAsOfStore`
    already implements F5's "latest strictly before the draft" and raises when
    there is none. This does NOT re-derive that: it hands over every snapshot for
    the season and reports what the STORE chose, so `screen()`'s own F5 check
    becomes a CROSS-PATH CONSISTENCY CHECK on one fact rather than a second
    implementation of the rule (rule 11, requirement 4 — two paths compared).

    `has_weekly_outcomes` is decided by `external_outcomes.league_outcomes` and is
    still not invented here — see `outcomes_fields` below, which reads that
    module's answer and never manufactures one of its own.
    """
    from external_adp_capture import as_store_snapshots
    return {
        "crosswalk": A.crosswalk_picks(picks, mfl_players, board_index),
        "snapshots": as_store_snapshots(series, year),
    }


def outcomes_fields(rules_json, crosswalk, weekly_rows, season, gsis_to_ours,
                    board_index) -> dict:
    """F3 for one league: `has_weekly_outcomes`, plus the outcome record itself.

    THE CALLER RULE 14 ASKS FOR. `external_outcomes.league_outcomes` had exactly
    one consumer — its own test — until this function, and a producer whose only
    consumer is a unit test has never met the shapes the live path hands it. Two of
    those shapes are handled here and nowhere else, and the second one was wrong in
    the first draft of this function:

      * the DRAFTED SET is the crosswalk's MATCHED rows. A pick that never
        crosswalked is already counted, once, as a crosswalk miss; counting him
        again as "drafted with no outcomes" would charge one league twice for one
        failure and make F3's coverage a function of F2's.
      * POSITIONS COME FROM OUR BOARD, not from `row["position"]`. The crosswalk
        row carries MFL's position (it is the matcher's INPUT), and the id it
        carries is ours — so reading position off the row would join one source's
        opinion to another source's key. `crosswalk_picks` already counts the pairs
        where the two disagree, under `conflicts`, precisely because that
        disagreement is the signature of a wrong match; taking the board's own
        answer keeps the position and the id from the same place.
    """
    from external_outcomes import league_outcomes
    rows = (crosswalk or (None, None))[0] or []
    board = A._board_by_id(board_index) if board_index is not None else {}
    drafted, positions = [], {}
    for r in rows:
        sid = str(r.get("player_id") or "")
        if not sid:
            continue
        drafted.append(sid)
        pos = (board.get(sid) or {}).get("pos")
        if pos:
            positions[sid] = str(pos).upper()
        # NO FALLBACK to r["position"]. A player our board cannot position is
        # counted by `weekly_points` as unknown_position rather than scored under
        # a table chosen from the other source.
    out = league_outcomes(rules_json, drafted, weekly_rows, season, positions,
                          gsis_to_ours)
    return {"has_weekly_outcomes": out["has_weekly_outcomes"], "outcomes": out}


def adp_fields(store) -> dict:
    """`pre_draft_adp` and `adp_observed_at`, taken FROM THE STORE'S CHOICE.

    Reading the snapshot date off the store rather than picking one here is what
    makes `screen()`'s F5 check a second opinion on the same fact instead of a
    rival implementation of it.
    """
    board = store.board()
    return {"pre_draft_adp": {str(r["player_id"]): r.get("adp") for r in board},
            "adp_observed_at": store.snapshot_date().isoformat()}


def run(league_ids, year, out_path=None, *, players=None, board=None,
        series=None, weekly_rows=None, gsis_to_ours=None,
        readiness=None, league_delay=1.0,
        deadline_s=None):  # pragma: no cover  (egress; CI only)
    """THE FIRST REAL FETCH.

    WHAT THIS WILL REPORT, WRITTEN BEFORE IT RUNS so the result cannot be narrated
    afterwards. The earlier version of this docstring pre-declared ZERO matched
    leagues and `F4.no_weekly_outcomes` for every league that got that far, because
    `has_weekly_outcomes` was a caller-supplied flag with no producer. That
    prerequisite now exists (`external_outcomes`, registered as D5), so the
    pre-declaration is REPLACED rather than quietly dropped, and the new one is:

      * The binding constraint is expected to MOVE from "no outcomes ingest" to
        D5b — the scoring vocabulary. MFL leagues commonly score pass attempts,
        completions, targets and first downs; nflverse weekly carries those
        columns and `grade.nflverse_weekly_to_scoring` does not emit them, so
        those leagues come back `F4.scoring_untranslatable` with the event codes
        named. `untranslatable_census` is printed for exactly that reason: the
        remedy is a change in another lane and it should be asked for with a
        number attached.
      * Every one of those is UNREADABLE, not FILTERED. It is a gap in this
        pipeline's vocabulary, not evidence that public leagues do not score like
        ours, and `screen_all`'s split already keeps the two apart on the verdict
        line.
      * 2023-2025 remain F5-ineligible under D4 regardless of any of this. A
        league that scores cleanly here can still be excluded for its ADP, and the
        attrition report says which.

    AND POINT THIS AT A SEASON THAT HAS BEEN PLAYED. Measured 2026-08-11:
    `fetch_weekly(2026)` 404s from both loaders, so a 2026 run reports zero matched
    leagues — the identical output to a run whose fetch broke and to a run whose
    filters are wrong. That is a green that means nothing wearing the clothes of one
    that does. `readiness` (from `external_outcomes.season_readiness`, which needs a
    CONTROL season because the target's own result cannot distinguish the cases)
    leads the verdict so the three states are never one number.

    `weekly_rows` and `gsis_to_ours` are passed IN rather than fetched here so the
    season's data is fetched once for a whole run instead of once per league.
    """
    from external_replay import ExternalAsOfStore, policy_fingerprint
    from asof import TimeTravelError

    import time as _time
    started = _time.monotonic()
    records, outcomes, cw_reports = [], [], []
    pool_picks, league_dates = [], {}
    stopped_early = None
    for _i, lid in enumerate(league_ids):
        # A RUN KILLED BY THE CLOCK PRODUCES NOTHING. Measured: a 250-league run
        # spent 35+ minutes against a 60-minute job timeout, and a timeout would
        # have destroyed every league's evidence — the same failure the per-league
        # parse guard fixed one level down, at the level of the whole run.
        #
        # Stopping EARLY is honest and being killed is not, because the machinery
        # for an incomplete run already exists: the ids never reached become
        # `never_attempted`, which `attrition_report` counts and whose verdict says
        # "the denominator below is incomplete, not a coverage figure". A partial
        # run that says so beats a complete run that never happened.
        if deadline_s is not None and _time.monotonic() - started > deadline_s:
            stopped_early = ("stopped after %d of %d leagues at the %ds budget"
                             % (_i, len(league_ids), deadline_s))
            print("!! " + stopped_early)
            break
        if _i:
            # BETWEEN LEAGUES TOO, not only between exports. The measured 429 came
            # at roughly 1.8 requests/second; this run asks for well under one.
            _time.sleep(league_delay)
        exports = fetch_league(lid, year)
        rec = build_record(lid, exports)
        if rec.get("unfetchable"):
            records.append(rec)
            continue
        picks, _ = A.draft_picks(exports["draftResults"])
        extra = league_passthrough(picks, players or {}, board, series or [], year)
        draft_at = A.to_league_record(exports["league"], exports["rules"],
                                      exports["draftResults"], league_id=lid).get("draft_at")
        adp = {}
        try:
            store = ExternalAsOfStore(lid, draft_at, extra["snapshots"], policy_fingerprint())
            adp = adp_fields(store)
        except (TimeTravelError, Exception) as e:      # noqa: B014 - recorded, never raised away
            adp = {"pre_draft_adp": None, "adp_observed_at": None,
                   "_adp_note": "%s: %s" % (type(e).__name__, e)}
        cw_reports.append((extra["crosswalk"] or (None, None))[1])
        # D7's raw material, accumulated as we go: every pick with its OWN
        # timestamp and its league. Per-pick, because an email draft that started
        # early can contain picks made late.
        stamps = [p.get("timestamp") for p in picks if p.get("timestamp")]
        league_dates[str(lid)] = min(stamps) if stamps else None
        for p in picks:
            pool_picks.append({"league_id": str(lid), "player": str(p.get("player")),
                               "overall": p.get("overall"), "timestamp": p.get("timestamp")})
        got = outcomes_fields(exports["rules"], extra["crosswalk"], weekly_rows or [],
                              int(year), gsis_to_ours or {}, board)
        outcomes.append(dict(got["outcomes"], league_id=str(lid)))
        records.append(build_record(lid, exports, crosswalk=extra["crosswalk"],
                                    has_weekly_outcomes=got["has_weekly_outcomes"],
                                    pre_draft_adp=adp.get("pre_draft_adp"),
                                    adp_observed_at=adp.get("adp_observed_at")))
    verdicts, _ = run_screen(records)
    rep = attrition_report(verdicts, requested=list(league_ids))
    rep["stopped_early"] = stopped_early
    rep["year"] = str(year)
    rep["outcomes"] = outcomes_summary(outcomes)
    rep["season_readiness"] = readiness
    rep["throttle"] = throttle_signal(verdicts)
    rep["crosswalk"] = crosswalk_summary(cw_reports)
    rep["within_pool_adp"] = d7_feasibility(verdicts, pool_picks, league_dates)
    # PREPENDED, not appended. The existing verdict already leads with unreadable
    # attrition; this leads with whether the run could have measured anything at all.
    # THROTTLE FIRST, then readiness, then the filters. Ordered by how badly each
    # would mislead: a throttled run's counts are not about the pool at all.
    lead = readiness_verdict(readiness, rep)
    if rep["throttle"].get("throttled_signature"):
        lead = rep["throttle"]["verdict"] + " || " + lead
    rep["verdict"] = lead + " || " + str(rep.get("verdict", ""))
    if out_path:
        Path(out_path).write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep, indent=1))
    return rep


def crosswalk_summary(reports: list) -> dict:
    """THE CROSSWALK AT SCALE — the number F2 is applied on, never yet reported.

    F2 admits a league only at >=90% crosswalked, and until now the run applied
    that bar without publishing the quantity. A filter whose input nobody sees is
    a filter nobody can judge, and its failures are the ones that look most like
    facts about the world: "their league has players we cannot price" and "our
    board is built from a partial index" produce the same rejection.

    Four things, because they fail for different reasons and F4 requires exclusions
    counted BY REASON:

      RATE DISTRIBUTION   min/median/max, and how many leagues clear the F2 bar.
      TWO KINDS OF MISS   `unknown_mfl_id` is an id MFL gave us and we never
                          fetched (our players export); `no_sleeper_match` is a
                          player who exists in MFL and not on our board. Reporting
                          them together would say "our board is missing players"
                          when the truth may be "we never fetched them".
      METHOD MIX          how matches were made, so a systematic wrong-match (say
                          everything landing via loose initials) is visible as a
                          distribution rather than found one player at a time.
      CONFLICTS, IN FULL  matched pairs whose two sources DISAGREE on position or
                          team. Never a sample: cross-source disagreement on a
                          matched pair is the signature of the wrong player, and it
                          passes every completeness check ever written — the rate
                          goes UP when a bad match lands.
    """
    from collections import Counter
    rates, methods = [], Counter()
    picks = matched = unknown_id = no_match = conflicts = 0
    pairs: list = []
    for r in reports or []:
        if not r:
            continue
        if r.get("picks"):
            rates.append(r.get("crosswalk_rate") or 0.0)
        picks += r.get("picks") or 0
        matched += r.get("crosswalked") or 0
        unknown_id += r.get("unknown_mfl_id") or 0
        no_match += r.get("no_sleeper_match") or 0
        conflicts += r.get("conflicts") or 0
        methods.update(r.get("methods") or {})
        for p in (r.get("matched_sample") or [])[:2]:
            if len(pairs) < 30:
                pairs.append(p)
    n = len(rates)
    clear = sum(1 for x in rates if x >= F.MIN_CROSSWALK_RATE)
    return {
        "leagues_with_picks": n,
        "picks_total": picks,
        "picks_crosswalked": matched,
        # The POOLED rate, which is not the mean of per-league rates and is not a
        # substitute for the distribution beside it.
        "pooled_rate": round(matched / picks, 4) if picks else None,
        "rate_distribution": _distribution([100.0 * x for x in rates]),
        "leagues_clearing_F2_bar": clear,
        "leagues_below_F2_bar": n - clear,
        "f2_bar": F.MIN_CROSSWALK_RATE,
        "unknown_mfl_id": unknown_id,
        "no_sleeper_match": no_match,
        "methods": dict(methods.most_common()),
        "conflicts": conflicts,
        # BOTH SIDES OF THE MATCH, for hand-checking. A bare rate cannot be
        # audited: "447 of 702" says nothing about whether any of the 447 is the
        # right player, and a wrong-but-plausible match produces a real player and
        # never errors. The pair is what a human can check.
        "matched_pairs_for_hand_check": pairs,
        "verdict": _crosswalk_verdict(n, clear, unknown_id, no_match, conflicts, matched),
    }


def _crosswalk_verdict(n, clear, unknown_id, no_match, conflicts, matched) -> str:
    parts = []
    if conflicts:
        parts.append("%d MATCHED PAIRS DISAGREE across sources on position or team — that "
                     "is the signature of a wrong match, and it RAISES the crosswalk rate "
                     "rather than lowering it" % conflicts)
    if unknown_id:
        parts.append("%d picks carry an MFL id absent from OUR players export — that is a "
                     "gap in what we fetched, not a player their league invented"
                     % unknown_id)
    head = "%d of %d leagues clear the F2 crosswalk bar; %d picks matched, %d unmatched " \
           "against our board" % (clear, n, matched, no_match)
    return head + "".join("; and " + p for p in parts)


def d7_feasibility(verdicts, pool_picks, league_dates) -> dict:
    """D7's registered measurement: can earlier picks in the pool price a later draft?

    THE POPULATION IS F1-PASSING LEAGUES, as registered — dynasty and superflex ADP
    are different quantities, and the crawl measured `dynasty` at 5,642 term hits,
    so this is not a tail concern. `passed_f1` infers format-pass from `screen()`'s
    ordering, and that ordering is asserted by its own test rather than assumed.

    Reported for BOTH populations, because the difference between them is itself
    the answer to "does restricting to format-matched leagues leave anything".
    """
    from within_pool_adp import feasibility
    ok_ids = {str(r.get("league_id")) for r, _, why in verdicts if F.passed_f1(why)}
    fmt_picks = [p for p in pool_picks if p["league_id"] in ok_ids]
    meta = {str(r.get("league_id")): r for r, _, _ in verdicts}
    def _row(lid, ts):
        r = meta.get(lid) or {}
        return {"league_id": lid, "first_pick_ts": ts,
                # M4's covariates, carried from the record rather than re-derived.
                "teams": r.get("teams"), "keeper_type": r.get("keeper_type"),
                "draft_type": r.get("draft_type")}
    leagues = [_row(lid, ts) for lid, ts in sorted(league_dates.items()) if lid in ok_ids]
    out = {"population": "F1-passing leagues only (D7 as registered)",
           "f1_passing_leagues": len(ok_ids),
           "picks_in_format_matched_pool": len(fmt_picks),
           "picks_in_whole_pool": len(pool_picks),
           "format_matched": feasibility(leagues, fmt_picks)}
    # The unrestricted number beside it, LABELLED as inadmissible under D7, so the
    # cost of the format restriction is visible and nobody has to guess at it.
    allx = [_row(lid, ts) for lid, ts in sorted(league_dates.items())]
    out["whole_pool_INADMISSIBLE_under_D7"] = feasibility(allx, pool_picks)
    return out


def readiness_verdict(readiness: dict, rep: dict) -> str:
    """The line that stops a vacuous zero reading as a measurement.

    D5h, and it is the whole reason `run` fetches a CONTROL season it does not
    otherwise need. `screen()` rejects a league with no weekly outcomes, so a run
    against a season that has not been played reports ZERO MATCHED — the identical
    output to a run whose fetch broke, and to a run whose filters are wrong. Three
    very different states, one number.

    So the state leads, ahead of the count, and an UNPLAYED or UNFETCHABLE run says
    IN THE VERDICT that its zero measured nothing about the leagues.
    """
    state = (readiness or {}).get("state")
    n = rep.get("matched", 0)
    if state in ("UNPLAYED", "UNFETCHABLE"):
        return ("THIS RUN MEASURED NOTHING ABOUT THE LEAGUES: %s. Every league is "
                "F4.no_weekly_data, `matched=%d` is a consequence of that and not a "
                "finding about the pool, and no conclusion about format prevalence or "
                "filter tuning may be drawn from it"
                % ((readiness or {}).get("why", "season not ready"), n))
    if state == "PARTIAL":
        return ("PARTIAL SEASON: %s. Outcome totals here are partial-season totals; "
                "they are a real number about a different question than F3 asks, and "
                "must be labelled as such wherever they travel"
                % (readiness or {}).get("why", ""))
    return "season %s COMPLETE (%d REG weeks); %d matched league-seasons" % (
        (readiness or {}).get("season"), (readiness or {}).get("reg_weeks", 0), n)


def outcomes_summary(outcomes: list) -> dict:
    """F3 across the run: the census, and coverage over the leagues that SCORED.

    TWO DENOMINATORS, KEPT APART. Mean F3 coverage is computed over leagues that
    produced a series at all — a league refused at D5b has no coverage figure, and
    folding its absent one in as 0.0 would report a vocabulary gap as a season in
    which nobody played. The count of leagues with no figure is printed beside the
    mean so the mean cannot be read as covering the run.
    """
    from external_outcomes import untranslatable_census
    scored = [o for o in outcomes if (o or {}).get("f3")]
    covs = [o["f3"]["coverage"] for o in scored if o["f3"].get("coverage") is not None]
    census = untranslatable_census(outcomes)
    return {
        "leagues_examined": len(outcomes),
        "leagues_scored": len(scored),
        "leagues_with_no_coverage_figure": len(outcomes) - len(scored),
        "mean_f3_coverage_over_SCORED_leagues":
            round(sum(covs) / len(covs), 4) if covs else None,
        "reasons": _count([o.get("reason") for o in outcomes]),
        "census": census,
    }


def _count(values) -> dict:
    from collections import Counter
    return dict(Counter(str(v) for v in values if v is not None).most_common())
