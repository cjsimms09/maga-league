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
    return A.to_league_record(exports["league"], exports["rules"], exports["draftResults"],
                              league_id=league_id, **passthrough)


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
        "target": F.TARGET_MATCHED_LEAGUE_SEASONS,
        "meets_target": len(matched) >= F.TARGET_MATCHED_LEAGUE_SEASONS,
    }
    rep["verdict"] = _verdict_line(rep)
    return rep


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
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                out[name] = json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            out[name] = {"_error": "http %s %s" % (e.code, e.reason)}
        except Exception as e:
            out[name] = {"_error": "%s: %s" % (type(e).__name__, e)}
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
    fails = [str(v.get("reason") or "") for v in (verdicts or [])
             if F.reason_code(v.get("reason") or "") == "F4.fetch_failed"]
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
        readiness=None):  # pragma: no cover  (egress; CI only)
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

    records, outcomes = [], []
    for lid in league_ids:
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
        got = outcomes_fields(exports["rules"], extra["crosswalk"], weekly_rows or [],
                              int(year), gsis_to_ours or {}, board)
        outcomes.append(dict(got["outcomes"], league_id=str(lid)))
        records.append(build_record(lid, exports, crosswalk=extra["crosswalk"],
                                    has_weekly_outcomes=got["has_weekly_outcomes"],
                                    pre_draft_adp=adp.get("pre_draft_adp"),
                                    adp_observed_at=adp.get("adp_observed_at")))
    verdicts, _ = run_screen(records)
    rep = attrition_report(verdicts, requested=list(league_ids))
    rep["year"] = str(year)
    rep["outcomes"] = outcomes_summary(outcomes)
    rep["season_readiness"] = readiness
    rep["throttle"] = throttle_signal(verdicts)
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
