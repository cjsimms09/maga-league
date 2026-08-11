"""THE RUN'S DENOMINATOR — the attrition seam one level up.

A league we could not FETCH is not a league that failed a FILTER. Every mutation
named below produces a report that reads BETTER than the truth: a smaller pool
with a cleaner match rate, or a coverage figure computed over a denominator that
quietly excluded everything that went wrong.

Run: python3 -m pytest draft/tests/test_ingest_run.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import ingest_filters as F  # noqa: E402
import ingest_run as R  # noqa: E402

EPOCH = 1756141200                      # 2025-08-25T17:00:00Z


def mfl_exports(*, teams="10", span_hours=2, rounds=3, seats=None, draft_type="SFIRSTRANDOM"):
    # THE FIXTURE PREMISE: a 10-team league drafts with 10 seats. The first cut set
    # teams=10 and seats=4, so completeness inferred 12 of 30 picks and every
    # league was rejected as incomplete — a fixture whose premise is wrong proves
    # nothing about the code it exercises.
    seats = int(teams) if seats is None else seats
    picks = []
    for rnd in range(1, rounds + 1):
        order = range(seats) if rnd % 2 else reversed(range(seats))
        for j, seat in enumerate(order):
            i = len(picks)
            picks.append({"round": "%02d" % rnd, "pick": "%02d" % (j + 1),
                          "franchise": "%04d" % (seat + 1), "player": str(9000 + i),
                          "timestamp": str(EPOCH + i * span_hours * 3600), "comments": ""})
    league = {"league": {"id": "L1", "rosterSize": "16",
                         "franchises": {"count": teams,
                                        "franchise": [{"id": "%04d" % (i + 1)} for i in range(seats)]},
                         "starters": {"count": "8", "position": [
                             {"name": "QB", "limit": "1"}, {"name": "RB", "limit": "2"},
                             {"name": "WR", "limit": "2"}, {"name": "TE", "limit": "1"},
                             {"name": "FLEX", "limit": "1"}]}}}
    rules = {"rules": {"positionRules": [
        {"positions": "RB|WR|TE", "rule": [{"event": {"$t": "CC"}, "points": {"$t": "*0.5"}}]}]}}
    draft = {"draftResults": {"draftUnit": {
        "unit": "LEAGUE", "draftType": draft_type, "draftPick": picks}}}
    return {"league": league, "rules": rules, "draftResults": draft}


def good_record(lid="L1", rounds=3, **kw):
    # `rounds` goes to BOTH the fixture and the record, or completeness compares a
    # draft of one shape against a declaration of another and every league is
    # rejected as incomplete — the fixture-premise failure, twice in one file.
    ex = mfl_exports(rounds=rounds, **kw)
    rows, _ = __import__("mfl_adapter").draft_picks(ex["draftResults"])
    return R.build_record(lid, ex, rounds=rounds, pre_draft_adp={"1": 1.0},
                          adp_observed_at="2025-08-20", has_weekly_outcomes=True,
                          crosswalk=([{"overall": r["overall"]} for r in rows], {}))


# ── a fetch failure is its own family, never a filter verdict ───────────────
def test_an_ERRORED_export_produces_an_UNFETCHABLE_record_not_a_screened_one():
    """MUTATION: pass `{}` for the errored export. The adapter would happily build
    a record out of nothing and `screen()` would return a confident F1 reason
    about a league we never saw."""
    ex = mfl_exports()
    ex["rules"] = {"_error": "http 403 Forbidden"}
    rec = R.build_record("L9", ex)
    assert rec["unfetchable"] and "403" in rec["unfetchable"]
    assert "teams" not in rec, "an unfetchable record must not carry parsed fields"


def test_a_MISSING_export_is_unfetchable_too_not_silently_empty():
    ex = mfl_exports()
    del ex["draftResults"]
    rec = R.build_record("L9", ex)
    assert rec["unfetchable"] and "draftResults: absent" in rec["unfetchable"]


def test_an_unfetchable_league_SHORT_CIRCUITS_the_screen():
    """MUTATION: let unfetchable records fall through to `screen()`. It would
    return F4.no_team_count — true of the record, and a lie about the league,
    because we never fetched it at all."""
    rec = R.build_record("L9", {"league": {"_error": "timeout"}})
    verdicts, matched = R.run_screen([rec])
    _, ok, why = verdicts[0]
    assert ok is False
    assert F.reason_code(why) == "F4.fetch_failed" and "timeout" in why
    assert matched == []


def test_a_fetch_failure_is_classified_as_evidence_about_the_PIPELINE():
    assert F.is_unreadable("F4.fetch_failed:http 403")
    assert F.is_classified("F4.fetch_failed:http 403")


# ── the denominator ─────────────────────────────────────────────────────────
def test_a_league_that_NEVER_PRODUCED_A_RECORD_is_counted_not_vanished():
    """MUTATION: report over `verdicts` alone. `matched / examined` with an
    `examined` that quietly excludes everything that went wrong is a flattering
    number, not a coverage figure."""
    verdicts, _ = R.run_screen([good_record("L1")])
    rep = R.attrition_report(verdicts, requested=["L1", "L2", "L3"])
    assert rep["requested"] == 3 and rep["attempted"] == 1
    assert rep["never_attempted"] == 2 and rep["never_attempted_ids"] == ["L2", "L3"]
    assert "NEVER ATTEMPTED" in rep["verdict"]
    assert "denominator" in rep["verdict"]


def test_a_clean_full_run_carries_NO_denominator_warning():
    """A warning that always fires is a warning nobody reads."""
    verdicts, _ = R.run_screen([good_record("L1")])
    rep = R.attrition_report(verdicts, requested=["L1"])
    assert rep["never_attempted"] == 0 and "NEVER ATTEMPTED" not in rep["verdict"]


def test_the_verdict_LEADS_with_what_failed():
    """Rule 8, on the line itself rather than in a field beside it."""
    recs = [good_record("L1"), R.build_record("L2", {"league": {"_error": "http 500"}})]
    verdicts, _ = R.run_screen(recs)
    rep = R.attrition_report(verdicts, requested=["L1", "L2"])
    assert rep["fetch_failed"] == 1
    assert "could not be FETCHED" in rep["verdict"]
    assert "not about how many public leagues match our format" in rep["verdict"]


def test_a_short_sample_says_F7_CHANGES_NOTHING():
    verdicts, _ = R.run_screen([good_record("L1")])
    rep = R.attrition_report(verdicts, requested=["L1"])
    assert rep["meets_target"] is False
    assert "changes NOTHING" in rep["verdict"] and str(F.TARGET_MATCHED_LEAGUE_SEASONS) in rep["verdict"]


# ── the run must actually accept a conforming league ────────────────────────
def test_a_conforming_league_MATCHES_or_every_test_above_is_vacuous():
    verdicts, matched = R.run_screen([good_record("L1")])
    assert len(matched) == 1, verdicts[0][2]


def test_a_readable_league_that_fails_a_filter_is_still_FILTERED_not_unreadable():
    verdicts, _ = R.run_screen([good_record("L1", teams="14")])
    rep = R.attrition_report(verdicts, requested=["L1"])
    assert rep["rejected_filtered"] == 1 and rep["rejected_unreadable"] == 0
    assert rep["rejected_by_reason"].get("F1.teams") == 1


# ── the registered reporting addition ───────────────────────────────────────
def test_the_draft_duration_distribution_is_reported():
    """Registered 2026-08-11 as a reporting addition: free, because the
    timestamps are already parsed, and it converts 'do multi-day drafts matter'
    from an assumption into a number."""
    verdicts, _ = R.run_screen([good_record("L1", span_hours=12)])
    d = R.attrition_report(verdicts, requested=["L1"])["draft_duration_days"]
    assert d["n"] == 1 and d["max"] > 1.0 and d["over_one_day"] == 1


def test_a_same_day_draft_is_not_counted_as_multi_day():
    """THE BOUNDARY: over_one_day counts strictly over 24h, so a draft finishing
    inside a day must not be counted — the common case the multi-day work must
    not have broken. One round of ten picks two hours apart is 18 hours.

    The first cut of this fixture was 30 picks an hour apart and I called it
    same-day: that is 29 hours, 1.21 days, genuinely multi-day. The test was
    right and my arithmetic was wrong."""
    verdicts, _ = R.run_screen([good_record("L1", rounds=1, span_hours=2)])
    d = R.attrition_report(verdicts, requested=["L1"])["draft_duration_days"]
    assert d["over_one_day"] == 0 and d["max"] < 1.0


def test_a_duration_over_NO_matched_leagues_reports_nothing_rather_than_zero():
    verdicts, _ = R.run_screen([good_record("L1", teams="14")])
    d = R.attrition_report(verdicts, requested=["L1"])["draft_duration_days"]
    assert d["n"] == 0 and d["median"] is None


def test_the_unenforced_autopick_clause_still_reaches_this_report():
    """It survived the seam; it must survive the run's report too, or the clause
    goes back to passing every league silently one level up."""
    verdicts, _ = R.run_screen([good_record("L1")])
    rep = R.attrition_report(verdicts, requested=["L1"])
    assert any(u.startswith("F2.autopick_majority") for u in rep["unenforced_filters"])
    assert "could NOT be enforced" in rep["verdict"]


# ── the wiring that turns the spine into a pipeline ─────────────────────────
def test_the_ADP_SNAPSHOT_HAS_ONE_OWNER_and_screen_is_the_second_opinion():
    """`ExternalAsOfStore` implements F5's strictly-before and `league_passthrough`
    does NOT re-derive it — it hands over every snapshot and reports what the
    store chose. So `screen()`'s F5 check is a cross-path consistency check on one
    fact (rule 11, requirement 4) rather than a rival implementation.

    MUTATION: pick the snapshot inside `league_passthrough`. Then the two paths
    can disagree and nothing compares them."""
    import ast
    src = (HERE.parent / "backtest" / "ingest_run.py").read_text()
    fn = next(n for n in ast.parse(src).body
              if isinstance(n, ast.FunctionDef) and n.name == "league_passthrough")
    dated = [c for c in ast.walk(fn) if isinstance(c, ast.Compare)
             and any("observed_at" in ast.dump(p) for p in [c.left] + list(c.comparators))]
    assert not dated, "league_passthrough is choosing a snapshot — that is the store's job"


def test_adp_fields_reads_the_date_the_STORE_chose():
    import external_replay as X
    import ingest_run as IR
    snaps = [{"observed_at": "2026-08-09", "rows": [{"player_id": "1", "adp": 3.0}]},
             {"observed_at": "2026-08-10", "rows": [{"player_id": "1", "adp": 2.0}]}]
    store = X.ExternalAsOfStore("L1", "2026-08-12", snaps, "fp")
    f = IR.adp_fields(store)
    assert f["adp_observed_at"] == "2026-08-10"        # the store's choice, not ours
    assert f["pre_draft_adp"] == {"1": 2.0}


def test_the_passthrough_hands_over_EVERY_snapshot_for_the_season():
    import ingest_run as IR
    series = [{"year": "2026", "observed_at": "2026-08-09", "rows": {"1": 3.0}, "row_count": 1},
              {"year": "2026", "observed_at": "2026-08-20", "rows": {"1": 2.0}, "row_count": 1},
              {"year": "2025", "observed_at": "2025-08-09", "rows": {"1": 9.0}, "row_count": 1}]
    out = IR.league_passthrough([], {}, {}, series, 2026)
    assert len(out["snapshots"]) == 2, "the store must see both 2026 snapshots and pick"


def test_MISSING_WEEKLY_OUTCOMES_is_reported_as_itself_not_as_a_crosswalk_failure():
    """WRITTEN BEFORE THE FIRST REAL RUN. There is no weekly-outcomes ingest yet,
    so F4 will exclude every league for it — that is the registered filter working,
    and the attrition report must name that prerequisite rather than stopping at an
    earlier pipeline reason."""
    rec = good_record("L1")
    rec["has_weekly_outcomes"] = None
    verdicts, matched = R.run_screen([rec])
    assert matched == []
    assert verdicts[0][2] == "F4.no_weekly_outcomes"
    rep = R.attrition_report(verdicts, requested=["L1"])
    assert rep["rejected_by_reason"]["F4.no_weekly_outcomes"] == 1
    assert rep["rejected_unreadable"] == 1, "a missing prerequisite is about our pipeline"
