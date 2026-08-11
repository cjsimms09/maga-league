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


def fetch_league(league_id, year):  # pragma: no cover  (egress; CI only)
    """The three exports for one league. An error is RECORDED, never raised away."""
    import urllib.error
    import urllib.request
    out = {}
    for name, q in EXPORTS.items():
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


def league_passthrough(picks, mfl_players, board_index, series, year) -> dict:
    """Everything `to_league_record` needs that MFL's three exports do not supply.

    THE ADP SNAPSHOT HAS EXACTLY ONE OWNER, DELIBERATELY. `ExternalAsOfStore`
    already implements F5's "latest strictly before the draft" and raises when
    there is none. This does NOT re-derive that: it hands over every snapshot for
    the season and reports what the STORE chose, so `screen()`'s own F5 check
    becomes a CROSS-PATH CONSISTENCY CHECK on one fact rather than a second
    implementation of the rule (rule 11, requirement 4 — two paths compared).

    `has_weekly_outcomes` is deliberately left to the caller and is NOT invented
    here. We do not have a weekly-outcomes ingest yet, so the honest value is the
    absent one, and F4 will exclude every league for it — see the note in `run`.
    """
    from external_adp_capture import as_store_snapshots
    return {
        "crosswalk": A.crosswalk_picks(picks, mfl_players, board_index),
        "snapshots": as_store_snapshots(series, year),
    }


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
        series=None, has_weekly_outcomes=None):  # pragma: no cover  (egress; CI only)
    """THE FIRST REAL FETCH.

    A NOTE ON WHAT THIS WILL REPORT, WRITTEN BEFORE IT RUNS so the result cannot
    be narrated afterwards. `has_weekly_outcomes` defaults to None because THERE
    IS NO WEEKLY-OUTCOMES INGEST YET. F4 excludes whole leagues missing weekly
    outcomes — that is the registered filter and it is not being relaxed — so
    this run is expected to report ZERO matched leagues and `F4.no_weekly_outcomes`
    for every league that gets that far.

    That is the pipeline working, not failing. The attrition report will say
    precisely which prerequisite is absent, which is the entire guarantee the
    pre-registration buys, and the number it prints is the honest state of the
    program rather than a flattering one.
    """
    from external_replay import ExternalAsOfStore, policy_fingerprint
    from asof import TimeTravelError

    records = []
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
        records.append(build_record(lid, exports, crosswalk=extra["crosswalk"],
                                    has_weekly_outcomes=has_weekly_outcomes,
                                    pre_draft_adp=adp.get("pre_draft_adp"),
                                    adp_observed_at=adp.get("adp_observed_at")))
    verdicts, _ = run_screen(records)
    rep = attrition_report(verdicts, requested=list(league_ids))
    rep["year"] = str(year)
    if out_path:
        Path(out_path).write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep, indent=1))
    return rep
