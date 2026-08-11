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


# ── F3 WIRED IN: the seam between the crosswalk and the weekly series ───────
def _cw_rows(*pairs):
    """What `crosswalk_picks` actually returns: rows keyed on OUR id, carrying
    MFL's position as `position` — the matcher's input, not our board's answer."""
    return ([{"overall": i + 1, "player_id": sid, "matched_by": "name",
              "name": nm, "position": mfl_pos}
             for i, (sid, nm, mfl_pos) in enumerate(pairs)], {})


def _index(*pairs):
    """A board index in the shape `_board_by_id` reads it."""
    return {"by_name": {nm.lower(): [{"id": sid, "name": nm, "pos": pos, "team": "X"}]
                        for sid, nm, pos in pairs}}


def nfl_row(pid, week=1, **stats):
    """A weekly row in the shape the LOADERS actually serve: every mapped column
    present (mostly zero) and `season_type` populated. A fixture carrying only the
    columns a test cares about would let D5f's schema check and D5g's REG filter
    pass against a shape the live path never sees — and D5f exists because a
    loader renamed one of these columns."""
    import grade as GR
    row = {"player_id": pid, "season": 2025, "week": week, "season_type": "REG"}
    for c in list(GR._WEEKLY_MAP) + list(GR._FUM_LOST_COLS):
        row.setdefault(c, 0)
    row.update(stats)
    return row


RULES = {"rules": {"positionRules": [
    {"positions": "QB", "rule": [{"event": {"$t": "PY"}, "points": {"$t": "*0.04"}}]},
    {"positions": "RB|WR|TE", "rule": [{"event": {"$t": "CC"}, "points": {"$t": "*0.5"}}]}]}}


def test_the_POSITION_comes_from_OUR_BOARD_not_from_the_crosswalk_ROW():
    """MUTATION: read `r["position"]`. The row carries MFL's opinion and OUR id,
    so a pair the sources disagree about would be scored under the wrong table —
    and `crosswalk_picks` counts exactly those pairs as `conflicts` because that
    disagreement is the signature of a wrong match.

    Here MFL says the player is a WR and our board says QB. Under the QB table a
    300-yard passing week is 300 x 0.04 = 12.0; under the WR table it is 0.0,
    because a receiver's table has no passing term at all."""
    cw = _cw_rows(("77", "A Player", "WR"))
    rows = [nfl_row("G77", passing_yards=300)]
    got = R.outcomes_fields(RULES, cw, rows, 2025, {"G77": "77"},
                            _index(("77", "A Player", "QB")))
    assert got["has_weekly_outcomes"] is True
    assert got["outcomes"]["series"]["77"] == {1: 12.0}


def test_a_pick_that_never_CROSSWALKED_is_not_counted_AGAIN_as_a_missing_outcome():
    """F2 already counted him once. Counting him here would charge one league
    twice for one failure and make F3's coverage a function of F2's."""
    cw = _cw_rows(("77", "A Player", "QB"))          # one matched row; F2 counts the rest
    rows = [nfl_row("G77", passing_yards=300)]
    got = R.outcomes_fields(RULES, cw, rows, 2025, {"G77": "77"},
                            _index(("77", "A Player", "QB")))
    assert got["outcomes"]["f3"]["examined"] == 1
    assert got["outcomes"]["f3"]["drafted_without_outcomes"] == 0


def test_a_player_OUR_BOARD_cannot_POSITION_is_counted_not_defaulted():
    """No fallback to the row's position, and no default table. He lands in
    `unknown_position`, which is a count, and drops out of F3 as absent."""
    cw = _cw_rows(("77", "A Player", "WR"))
    rows = [nfl_row("G77", receptions=5)]
    got = R.outcomes_fields(RULES, cw, rows, 2025, {"G77": "77"}, {"by_name": {}})
    assert got["outcomes"]["unknown_position"] == ["77"]
    assert got["outcomes"]["f3"]["drafted_without_outcomes"] == 1


def test_the_run_no_longer_has_to_be_TOLD_whether_a_league_has_outcomes():
    """`has_weekly_outcomes` was a caller-supplied flag with no producer — the
    prerequisite `run()` pre-declared would fail every league. It now comes from
    the outcomes module, and the flag that reaches `screen()` is the one that
    module decided."""
    cw = _cw_rows(("77", "A Player", "QB"))
    got = R.outcomes_fields(RULES, cw, [], 2025, {"G77": "77"},
                            _index(("77", "A Player", "QB")))
    assert got["has_weekly_outcomes"] is False
    assert got["outcomes"]["reason"] == "F4.no_weekly_data:2025"
    assert F.is_unreadable(got["outcomes"]["reason"])


def test_MEAN_F3_COVERAGE_is_taken_over_SCORED_leagues_only():
    """MUTATION: fold a league with no coverage figure in as 0.0. Two leagues at
    100% and one refused for vocabulary would report 0.667 — a vocabulary gap in
    OUR pipeline printed as a season in which a third of the drafted players never
    took a snap. The count with no figure is printed beside the mean so the mean
    cannot be read as covering the run."""
    outs = [{"f3": {"coverage": 1.0}, "reason": "ok", "untranslatable": {}},
            {"f3": {"coverage": 1.0}, "reason": "ok", "untranslatable": {}},
            {"f3": None, "reason": "F4.scoring_untranslatable:QB=TGT_event_untranslatable",
             "untranslatable": {"QB": [{"why": "event_untranslatable", "event": "TGT"}]}}]
    s = R.outcomes_summary(outs)
    assert s["mean_f3_coverage_over_SCORED_leagues"] == 1.0
    assert s["leagues_scored"] == 2 and s["leagues_with_no_coverage_figure"] == 1
    assert s["census"]["by_event_code"] == {"TGT": 1}


def test_a_run_where_NOTHING_scored_reports_None_not_zero():
    s = R.outcomes_summary([{"f3": None, "reason": "F4.no_weekly_data:2025",
                             "untranslatable": {}}])
    assert s["mean_f3_coverage_over_SCORED_leagues"] is None
    assert s["reasons"] == {"F4.no_weekly_data:2025": 1}


# ── D5h: a run against an unplayed season must not read like a measurement ──
def test_an_UNPLAYED_season_says_IN_THE_VERDICT_that_it_measured_nothing():
    """`screen()` rejects a league with no weekly outcomes, so a 2026 run reports
    zero matched — the identical output to a broken fetch and to wrong filters.
    MUTATION: report the count without the state. Three states, one number, and
    the reader has no way to tell which one they are looking at."""
    ready = {"season": 2026, "state": "UNPLAYED", "why": "2026 served no weekly data "
             "while the control season 2025 served 18 REG weeks"}
    v = R.readiness_verdict(ready, {"matched": 0})
    assert v.startswith("THIS RUN MEASURED NOTHING ABOUT THE LEAGUES")
    assert "not a finding about the pool" in v
    assert "control season 2025" in v


def test_an_UNFETCHABLE_run_and_an_UNPLAYED_run_do_NOT_read_the_same():
    """The distinction A asked for: 2025 returning no_weekly_outcomes after the
    ingest lands is a DEFECT; 2026 doing so is the CALENDAR."""
    unplayed = R.readiness_verdict({"season": 2026, "state": "UNPLAYED",
                                    "why": "the fetch works and the season has not been played"},
                                   {"matched": 0})
    broken = R.readiness_verdict({"season": 2025, "state": "UNFETCHABLE",
                                  "why": "neither 2025 NOR the control season 2024 served weekly data"},
                                 {"matched": 0})
    assert unplayed != broken
    assert "has not been played" in unplayed and "neither 2025 NOR" in broken


def test_a_COMPLETE_season_gets_a_verdict_with_no_warning_in_it():
    """A verdict that always warns is one nobody reads."""
    v = R.readiness_verdict({"season": 2025, "state": "COMPLETE", "reg_weeks": 18},
                            {"matched": 37})
    assert "MEASURED NOTHING" not in v and "PARTIAL" not in v
    assert "COMPLETE (18 REG weeks); 37 matched" in v


def test_a_PARTIAL_season_is_labelled_rather_than_counted_as_a_season():
    v = R.readiness_verdict({"season": 2026, "state": "PARTIAL",
                             "why": "2026 has 6 of the control season's 18 REG weeks"},
                            {"matched": 3})
    assert v.startswith("PARTIAL SEASON") and "labelled as such wherever they travel" in v


# ── throttling: 150 leagues are 150 independent things ─────────────────────
def _v(reason):
    """A verdict IN THE SHAPE `run_screen` EMITS — a (record, ok, reason) tuple.

    THE POINT OF THIS HELPER, and it is the third instance today of the same
    defect: the first cut of `throttle_signal` read `v.get("reason")`, a dict
    shape that existed nowhere except the test written beside it. Every unit test
    passed and CI died on the real list. A test that invents its producer's output
    tests the author's belief about the shape, not the shape.

    So `_v` is checked against the real producer by
    `test_the_verdict_shape_here_is_the_one_run_screen_ACTUALLY_emits` below, and
    the throttle tests run through THAT."""
    return ({}, reason == "ok", reason)


def test_the_verdict_shape_here_is_the_one_run_screen_ACTUALLY_emits():
    """THE GUARD ON THE FIXTURE ITSELF. If `run_screen` ever changes what a
    verdict is, this fails here rather than in CI two steps downstream."""
    real, _ = R.run_screen([R.build_record("L1", {"league": {"_error": "http 403"}})])
    assert isinstance(real[0], tuple) and len(real[0]) == 3
    assert isinstance(_v("x"), tuple) and len(_v("x")) == 3
    assert R._verdict_reason(real[0]).startswith("F4.fetch_failed")
    # And the detector reads the REAL verdict, not just my stand-in.
    assert R.throttle_signal(real)["fetch_failures"] == 1


def test_an_UNRECOGNISED_verdict_shape_RAISES_rather_than_reporting_NO_FAILURES():
    """MUTATION: `return ""` on the unknown branch. A run that was entirely
    throttled would report "no fetch failures" — a reassuring wrong answer, which
    is worse than a crash because nothing anywhere contradicts it."""
    import pytest
    with pytest.raises(TypeError) as e:
        R.throttle_signal(["F4.fetch_failed:league: http 403 Forbidden"])
    assert "NO FETCH FAILURES" in str(e.value)


def test_IDENTICAL_fetch_failures_are_reported_as_THE_RATE_not_as_the_leagues():
    """MUTATION: count fetch failures without grouping by signature. 40 leagues
    that all 403'd would be reported as 40 unobtainable leagues, faithfully binned
    as UNREADABLE — and a reader would take it as pool coverage. Independent
    leagues do not fail with the same error string."""
    vs = [_v("F4.fetch_failed:league: http 403 Forbidden") for _ in range(9)] + \
         [_v("ok"), _v("F1.teams")]
    t = R.throttle_signal(vs)
    assert t["throttled_signature"] == "http 403 Forbidden"
    assert "not 9 unobtainable leagues" in t["verdict"]
    assert "must not be read as pool coverage" in t["verdict"]
    assert "not a relabelling" in t["verdict"]


def test_the_signature_strips_the_LEAGUE_SPECIFIC_tail_or_nothing_ever_groups():
    """Two leagues 403ing on different exports are the same KIND of failure.
    MUTATION: use the whole reason string — every failure becomes its own
    signature and a throttle is never detected."""
    vs = [_v("F4.fetch_failed:league: http 403 Forbidden"),
          _v("F4.fetch_failed:draftResults: http 403 Forbidden")]
    assert R.throttle_signal(vs)["throttled_signature"] == "http 403 Forbidden"


def test_SCATTERED_failures_are_NOT_called_a_throttle():
    """A detector that always fires is one nobody can act on."""
    t = R.throttle_signal([_v("F4.fetch_failed:league: http 404 Not Found"), _v("ok")])
    assert t["throttled_signature"] is None
    assert "no shared signature" in t["verdict"]
    assert "consistent with per-league failures" in t["verdict"]


def test_a_clean_run_says_so_without_a_warning():
    t = R.throttle_signal([_v("ok"), _v("F1.teams")])
    assert t["fetch_failures"] == 0 and t["verdict"] == "no fetch failures"


def test_the_throttle_check_does_NOT_reclassify_anything():
    """The leagues really were not fetched. `F4.fetch_failed` stays unreadable and
    stays counted; the signal is an explanation, never a relabelling that would
    make the denominator flattering."""
    vs = [_v("F4.fetch_failed:league: http 403 Forbidden") for _ in range(5)]
    R.throttle_signal(vs)
    assert all(F.is_unreadable(R._verdict_reason(v)) for v in vs)
    assert all(R._verdict_reason(v).startswith("F4.fetch_failed") for v in vs)


# ── the crosswalk at scale: F2's input, never reported until now ────────────
def _cwrep(**kw):
    """A crosswalk report in the shape `crosswalk_picks` actually returns."""
    base = {"picks": 100, "crosswalked": 95, "crosswalk_rate": 0.95,
            "unknown_mfl_id": 2, "no_sleeper_match": 3, "methods": {"name": 95},
            "conflicts": 0, "matched_sample": []}
    base.update(kw)
    return base


def test_the_two_kinds_of_crosswalk_MISS_are_kept_apart():
    """MUTATION: sum them into one `unmatched`. "Our board is missing players" and
    "we never fetched that id" are opposite actions and identical rejections."""
    s = R.crosswalk_summary([_cwrep(unknown_mfl_id=7, no_sleeper_match=1)])
    assert s["unknown_mfl_id"] == 7 and s["no_sleeper_match"] == 1
    assert "gap in what we fetched" in s["verdict"]


def test_CONFLICTS_lead_the_verdict_because_they_RAISE_the_rate():
    """A matched pair whose sources disagree on position is the signature of the
    WRONG PLAYER — and it counts as a success in every completeness figure."""
    s = R.crosswalk_summary([_cwrep(conflicts=4)])
    assert s["conflicts"] == 4
    assert s["verdict"].split("; and ")[1].startswith("4 MATCHED PAIRS DISAGREE")
    assert "RAISES the crosswalk rate" in s["verdict"]


def test_the_POOLED_rate_and_the_DISTRIBUTION_are_both_reported():
    """One league at 100% of 200 picks and one at 50% of 2 pool to 99.5% — which
    is true and hides that a league is below the F2 bar. Both, or neither."""
    s = R.crosswalk_summary([_cwrep(picks=200, crosswalked=200, crosswalk_rate=1.0),
                             _cwrep(picks=2, crosswalked=1, crosswalk_rate=0.5)])
    assert s["pooled_rate"] == 0.995
    assert s["leagues_clearing_F2_bar"] == 1 and s["leagues_below_F2_bar"] == 1
    assert s["rate_distribution"]["min"] == 50.0 and s["rate_distribution"]["max"] == 100.0


def test_a_league_with_NO_picks_does_not_enter_the_rate_distribution_as_zero():
    """Absent is not zero, in the denominator too: a league whose draft we could
    not read has no crosswalk rate, and counting it as 0% would report a parse
    failure as a board-coverage problem."""
    s = R.crosswalk_summary([_cwrep(), _cwrep(picks=0, crosswalked=0, crosswalk_rate=0.0)])
    assert s["leagues_with_picks"] == 1 and s["rate_distribution"]["n"] == 1


def test_the_hand_check_pairs_survive_into_the_report():
    """Rule 11: a bare rate cannot be audited. 447 of 702 says nothing about
    whether any of the 447 is the right player."""
    pair = {"mfl_name": "Bijan Robinson", "board_name": "Bijan Robinson",
            "mfl_pos": "RB", "board_pos": "RB", "method": "name"}
    s = R.crosswalk_summary([_cwrep(matched_sample=[pair])])
    assert s["matched_pairs_for_hand_check"] == [pair]


def test_ONE_LEAGUE_THAT_CANNOT_BE_PARSED_DOES_NOT_KILL_THE_RUN():
    """Measured: a single league whose `draftUnit` was a LIST raised 18 minutes
    into a 250-league run and took the other 249 with it — no report, no attrition
    table, nothing learned from any of them.

    A league we could not PARSE is that league's reason, never the run's death.
    MUTATION: remove the try/except. One malformed league deletes the evidence
    from every other league in the run."""
    # A shape that genuinely raises inside the adapter. NOTE the first attempt at
    # this fixture used a string `draftUnit`, which after the P5 fix no longer
    # raises — it comes back `draft_not_league_wide`. A test for the ISOLATION must
    # use an input that still explodes, or it proves nothing about isolation.
    exports = {"league": 12345, "rules": {}, "draftResults": {}}
    rec = R.build_record("L1", exports)
    assert rec.get("unfetchable", "").startswith("parse_failed:"), rec.get("unfetchable")
    assert F.is_unreadable("F4.parse_failed:AttributeError")
    # And the run keeps going: the bad league gets a verdict like any other.
    verdicts, _ = R.run_screen([rec, good_record("L2")])
    assert len(verdicts) == 2
    assert R._verdict_reason(verdicts[0]).startswith("F4.fetch_failed:parse_failed")


def test_the_parse_failure_keeps_the_EXCEPTION_TYPE_so_it_stays_diagnosable():
    """An anonymous drop is a defect nobody can find again."""
    exports = {"league": {"league": {"id": "L1"}}, "rules": {},
               "draftResults": {"draftResults": {"draftUnit": 12345}}}
    rec = R.build_record("L1", exports)
    assert "unreadable" in rec and "parse_failed:" in rec["unreadable"]["parse"]


# ── rule 6 for the REPORT, not just the reason codes ───────────────────────
def test_the_run_reports_EVERY_QUANTITY_THE_PLAN_SAYS_IT_REPORTS():
    """CAUGHT A REAL GAP. INGEST-PLAN's reporting addition says every run reports
    the draft-duration distribution AND the per-league lead-days spread. Only the
    first was there — a requirement this lane registered itself, quietly unmet.

    The reason-code registry has had a doc-drift guard since the attrition seam;
    the REPORT never did, which is why this one survived. A pre-registration that
    lives only in prose drifts from the build, and nobody notices because both look
    reasonable on their own — that is rule 6, and it does not stop at reason codes.
    """
    plan = (Path(__file__).resolve().parent.parent.parent / "INGEST-PLAN.md").read_text()
    rep = R.attrition_report(R.run_screen([good_record("L1")])[0], requested=["L1"])
    required = {
        # phrase the plan uses            -> key the report must carry
        "DRAFT-DURATION DISTRIBUTION": "draft_duration_days",
        "LEAD-DAYS SPREAD": "lead_days_spread",
    }
    for phrase, key in required.items():
        if phrase in plan:
            assert key in rep, (
                "INGEST-PLAN promises %r and the run report has no %r" % (phrase, key))


def test_the_lead_days_spread_counts_UNDATED_picks_rather_than_dating_them():
    """A pick with no timestamp has unknown staleness. Folding it in at the draft
    date would manufacture an observation out of an absence — and it would make the
    spread look tighter, which is the direction that flatters."""
    rec = good_record("L1")
    for i, p in enumerate(rec["draft"]["picks"]):
        if i % 2:
            p["timestamp"] = None
    # The verdict is forced to matched, deliberately: a league with half its picks
    # undated FAILS `screen()` on F5, which is correct and is a different check.
    # What is under test here is the SPREAD's handling of an absent timestamp, so
    # the record still comes from the real adapter and only the flag is set.
    sp = R._lead_spread([(rec, True, "ok")])
    assert sp["undated_picks"] > 0, "an undated pick was silently dated"
    assert sp["leagues"] == 1 and sp["max_of_max"] is not None


def test_a_run_with_NO_matched_leagues_reports_an_EMPTY_spread_not_a_zero_one():
    rep = R.attrition_report(R.run_screen([])[0], requested=[])
    sp = rep["lead_days_spread"]
    assert sp["leagues"] == 0 and sp["max_of_max"] is None
    assert sp["span_days"]["n"] == 0


def test_a_run_that_STOPS_EARLY_reports_an_INCOMPLETE_DENOMINATOR():
    """A run killed by the clock produces NOTHING — no report, no attrition table,
    nothing learned from any league it did reach. Stopping early is honest and
    being killed is not, and the machinery for it already existed: ids never
    reached are `never_attempted`, and the verdict says the denominator is
    incomplete rather than letting `matched / attempted` read as coverage.

    MUTATION: drop `requested` so the unreached ids vanish. `matched / attempted`
    over a silently shrunken denominator is a flattering number, not a coverage
    one — which is the failure this whole file is shaped around."""
    reached = [good_record("L1"), good_record("L2")]
    rep = R.attrition_report(R.run_screen(reached)[0],
                             requested=["L1", "L2", "L3", "L4", "L5"])
    assert rep["requested"] == 5 and rep["attempted"] == 2
    assert rep["never_attempted"] == 3
    assert sorted(rep["never_attempted_ids"]) == ["L3", "L4", "L5"]
    assert "NEVER ATTEMPTED" in rep["verdict"]
    assert "not a coverage figure" in rep["verdict"]
