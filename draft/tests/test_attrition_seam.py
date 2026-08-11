"""THE ATTRITION SEAM — a failure to READ must never be reported as a failure to QUALIFY.

B's ingest audit (2026-08-11) found `ingest_filters.screen()` telling a confident,
specific falsehood on four of nine fields: an absent `roster_slots` reported as
`F1.qb_slots` ("doesn't start exactly one QB"), an absent `teams` as `F1.teams`
("wrong league size"), an absent `draft_type` as `F1.draft_type` ("not a snake
draft"), an absent `draft` as `F2.draft_incomplete` ("their draft wasn't
finished"). Every one of those sentences asserts a check that never ran.

WHY THAT IS THE MOST IMPORTANT DEFECT IN THE INGEST. The entire guarantee the
pre-registration buys is that we know WHY leagues were dropped. A league that
fails to parse being indistinguishable from a league that fails the filters makes
every parse bug lie about attrition — and the two fields likeliest to break are
`roster_slots` and `draft_type`, the two that needed a schema probe to pin down.
A mass parse failure would have read as "no public league matches our format",
which is a conclusion someone might believe and act on.

THIS FILE TESTS THE SEAM, NOT THE PIECES. `mfl_adapter` already computed a precise
reason for every parse failure and `screen()` already knew how to report one — for
`scoring`, the single field the failure mode had been anticipated for. What did not
exist was the function joining them: the adapter was imported by nothing but its
own test, so its reasons were computed, written down and read by nothing (rule 14 —
name the caller). Everything below therefore runs from RAW MFL EXPORT SHAPES, in
the shapes the committed probe actually observed, all the way to the attrition
table `screen_all()` emits.

Run: python3 -m pytest draft/tests/test_attrition_seam.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import ingest_filters as F  # noqa: E402
import mfl_adapter as A  # noqa: E402

# ── fixtures in the shapes the PROBE observed, not invented ones ────────────
# mfl_schema_probe.json, runs 1-4: `league` and `draftResults` carry PLAIN
# STRINGS; only `rules` uses the {"$t": ...} wrapper. Both forms go through
# `t()`, and using the real shape here is what keeps this a test of the seam
# rather than a test of a fixture written to suit the implementation.
TEAMS, ROUNDS = 10, 15
DRAFT_EPOCH = 1756141200          # 2025-08-25T17:00:00Z — the first pick
DRAFT_DATE = "2025-08-25"
ADP_DATE = "2025-08-24"           # strictly before, so F5 passes


def mfl_league(*, teams="10", starters=None, keeper=None):
    pos = starters if starters is not None else [
        {"name": "QB", "limit": "1"}, {"name": "RB", "limit": "2"},
        {"name": "WR", "limit": "2"}, {"name": "TE", "limit": "1"},
        {"name": "FLEX", "limit": "1"}, {"name": "K", "limit": "1"},
        {"name": "DEF", "limit": "1"},
    ]
    node = {"id": "10466", "name": "probe fixture", "rosterSize": "16",
            "franchises": {"count": teams,
                           "franchise": [{"id": "%04d" % (i + 1)} for i in range(TEAMS)]},
            "starters": {"count": "9", "position": pos}}
    if teams is None:
        node["franchises"].pop("count")
    if keeper:
        node["keeperType"] = keeper
    return {"version": "1.0", "encoding": "utf-8", "league": node}


def mfl_rules(rec_by_pos=None):
    """TYPE=rules. P4: reception scoring is PER-POSITION, so half-PPR is not one number."""
    if rec_by_pos is None:
        rec_by_pos = {"RB": 0.5, "WR": 0.5, "TE": 0.5}
    return {"version": "1.0", "rules": {"positionRules": [
        {"positions": p, "rule": [{"event": {"$t": "CC"},
                                   "points": {"$t": "*%s" % v},
                                   "range": {"$t": "0-99"}}]}
        for p, v in rec_by_pos.items()]}}


def mfl_draft(*, draft_type="SFIRSTRANDOM", rounds=ROUNDS, drop_last=0):
    """`drop_last` picks removed from the END, i.e. a draft that stopped mid-round."""
    picks = []
    for rnd in range(1, rounds + 1):
        order = range(TEAMS) if rnd % 2 else reversed(range(TEAMS))
        for j, seat in enumerate(order):
            picks.append({"round": "%02d" % rnd, "pick": "%02d" % (j + 1),
                          "franchise": "%04d" % (seat + 1),
                          "player": str(10000 + len(picks)),
                          "timestamp": str(DRAFT_EPOCH + len(picks) * 60),
                          "comments": ""})
    if drop_last:
        picks = picks[:-drop_last]
    return {"version": "1.0", "draftResults": {"draftUnit": {
        "unit": "LEAGUE", "draftType": draft_type,
        "round1DraftOrder": ",".join("%04d" % (i + 1) for i in range(TEAMS)),
        "draftPick": picks}}}


def record(league=None, rules=None, draft=None, *, crosswalk_rate=1.0, **kw):
    """The seam under test: three exports -> one record `screen()` reads."""
    d = draft if draft is not None else mfl_draft()
    rows, _ = A.draft_picks(d)
    n = int(len(rows) * crosswalk_rate)
    fake_crosswalk = ([{"overall": r["overall"]} for r in rows[:n]], {})
    kw.setdefault("crosswalk", fake_crosswalk)
    kw.setdefault("pre_draft_adp", {"10000": 1.0})
    kw.setdefault("adp_observed_at", ADP_DATE)
    kw.setdefault("has_weekly_outcomes", True)
    return A.to_league_record(
        league if league is not None else mfl_league(),
        rules if rules is not None else mfl_rules(), d, **kw)


# ── the seam carries a conforming league through, end to end ────────────────
def test_a_conforming_MFL_league_is_ACCEPTED_through_the_whole_seam():
    """If this fails everything below is vacuous: a screen that rejects every
    league would 'pass' every honest-reason test for the wrong reason."""
    ok, why = F.screen(record())
    assert ok is True, why


def test_the_draft_date_comes_from_the_first_pick_not_a_league_level_guess():
    r = record()
    assert r["draft_at"] == DRAFT_DATE
    assert r["source_meta"]["timestamp_coverage"] == 1.0


def test_the_covariates_survive_and_keepers_are_NOT_filtered_on():
    """F1 records the keeper count as a covariate, never as a screen."""
    r = record(league=mfl_league(keeper="dynasty"))
    assert r["keeper_type"] == "dynasty"
    assert F.screen(r)[0] is True


# ── THE FOUR LIES, one test each ────────────────────────────────────────────
# Each asserts BOTH halves: the new reason is right, AND the old sentence is
# gone. Asserting only the new reason would pass against an implementation that
# reported both, which is still a report claiming a check it never performed.
def test_an_UNRECOGNISED_draft_code_is_not_reported_as_not_a_snake_draft():
    """THE SHARPEST CASE. `draft_type()` deliberately returns
    (None, 'draft_type_unrecognised:XYZ') with a comment saying it must never be
    folded into 'not a snake draft' — and `screen()` folded it anyway. MFL emits
    codes (SFIRSTRANDOM), so a new or rare code is the likeliest single break."""
    ok, why = F.screen(record(draft=mfl_draft(draft_type="WEIRDNEWCODE")))
    assert ok is False
    assert why == "F4.draft_type_unrecognised:WEIRDNEWCODE"
    assert why != "F1.draft_type"


def test_an_ABSENT_draft_type_is_not_reported_as_not_a_snake_draft():
    d = mfl_draft()
    d["draftResults"]["draftUnit"].pop("draftType")
    ok, why = F.screen(record(draft=d))
    assert (ok, why) == (False, "F4.draft_type_absent")


def test_an_UNREADABLE_roster_is_not_reported_as_a_QB_slot_failure():
    """P2's shape is a RANGE STRING ("1-2"). An unparseable limit used to vanish
    from the slot map, and a slot map missing entries read as "0 QB starters"."""
    bad = [{"name": "QB", "limit": "one"}, {"name": "RB", "limit": "2"},
           {"name": "WR", "limit": "2"}, {"name": "TE", "limit": "1"}]
    ok, why = F.screen(record(league=mfl_league(starters=bad)))
    assert ok is False
    assert why == "F4.unreadable_starter_limits:QB"
    assert why != "F1.qb_slots"


def test_a_PARTIALLY_unreadable_roster_is_not_reported_as_a_skill_slot_failure():
    """The quieter half of the same bug: one bad SKILL limit silently shrinks the
    starting-skill count, and 5 skill slots is outside F1's [6,8] band — so a
    parse failure manufactures a confident 'wrong number of starters' verdict."""
    bad = [{"name": "QB", "limit": "1"}, {"name": "RB", "limit": "two"},
           {"name": "WR", "limit": "2"}, {"name": "TE", "limit": "1"},
           {"name": "FLEX", "limit": "1"}]
    ok, why = F.screen(record(league=mfl_league(starters=bad)))
    assert (ok, why) == (False, "F4.unreadable_starter_limits:RB")
    assert why != "F1.starting_skill_slots"


def test_an_ABSENT_team_count_is_not_reported_as_the_wrong_league_size():
    ok, why = F.screen(record(league=mfl_league(teams=None)))
    assert (ok, why) == (False, "F4.no_team_count")
    assert why != "F1.teams"


def test_an_UNREADABLE_team_count_is_not_reported_as_the_wrong_league_size():
    ok, why = F.screen(record(league=mfl_league(teams="ten")))
    assert ok is False and why == "F4.unreadable_team_count:ten"


def test_an_ABSENT_draft_is_not_reported_as_an_unfinished_draft():
    ok, why = F.screen(dict(record(), draft=None))
    assert (ok, why) == (False, "F4.no_draft")
    assert why != "F2.draft_incomplete"


def test_a_CROSSWALK_THAT_NEVER_RAN_is_not_reported_as_a_thin_crosswalk():
    """F2's 90% bar is what stops 'the replay guessing'. Reporting it against
    work nobody did claims a measurement of our own board that was never taken."""
    r = record()
    r = A.to_league_record(mfl_league(), mfl_rules(), mfl_draft(),
                           pre_draft_adp={"1": 1.0}, adp_observed_at=ADP_DATE,
                           has_weekly_outcomes=True)          # no crosswalk=
    ok, why = F.screen(r)
    assert ok is False
    assert why == "F4.crosswalk_not_run:150/150 picks"
    assert not why.startswith("F2.crosswalk_below_90pct")


# ── the CONVERSE lie must not appear either ─────────────────────────────────
def test_a_league_we_DID_read_still_reports_the_real_filter_failure():
    """The fix must not over-report parse failures. A 14-team league is a fact
    about the public pool and must keep saying so."""
    assert F.screen(record(league=mfl_league(teams="14")))[1] == "F1.teams"


def test_a_readable_NON_SNAKE_draft_still_reports_F1_draft_type():
    """LINEAR is a code we DO recognise, so this is a genuine format mismatch."""
    assert F.screen(record(draft=mfl_draft(draft_type="LINEAR")))[1] == "F1.draft_type"


def test_a_readable_league_that_fails_a_LATER_filter_is_not_relabelled():
    ok, why = F.screen(record(rules=mfl_rules({"RB": 0.5, "WR": 0.5, "TE": 1.0})))
    assert ok is False and why.startswith("F1.te_premium_or_split_ppr")


def test_a_genuinely_thin_crosswalk_still_reports_F2_and_names_the_rate():
    ok, why = F.screen(record(crosswalk_rate=0.5))
    assert ok is False and why == "F2.crosswalk_below_90pct:0.500"


# ── completeness: inferred, with the inference stated and its limit named ───
def test_a_draft_abandoned_MID_ROUND_is_caught_and_the_shortfall_is_named():
    """One pick short of a full final round — the boundary, not an extreme break.
    An eight-hour email draft dies mid-round; that is the shape to catch."""
    ok, why = F.screen(record(draft=mfl_draft(drop_last=1)))
    assert ok is False
    assert why == "F2.draft_incomplete:round 15 has 9 of 10 picks"


def test_the_completeness_detail_distinguishes_a_partial_draft_from_a_FAILED_FETCH():
    """'F2.draft_incomplete' alone cannot tell 149/150 from 2/150. The first is a
    league that quit; the second is a fetch that failed, and calling that
    'their draft wasn't finished' is the same class of lie one level down."""
    ok, why = F.screen(record(draft=mfl_draft(drop_last=148)))
    assert (ok, why) == (False, "F2.draft_incomplete:round 1 has 2 of 10 picks")
    assert F.screen(record(draft=mfl_draft(drop_last=1)))[1] != why


def test_the_round_count_is_INFERRED_and_the_record_says_so():
    """No MFL export carries a round count, and rosterSize counts the bench — so
    the basis is stated rather than presented as something MFL supplied."""
    r = record()
    assert r["source_meta"]["rounds"] == ROUNDS
    assert r["source_meta"]["rounds_source"].startswith("INFERRED")
    assert "no round-count field" in r["source_meta"]["rounds_source"]


def test_the_LIMIT_of_the_inference_is_real_and_is_asserted_not_assumed():
    """A draft abandoned exactly ON a round boundary is indistinguishable from a
    shorter completed one. Asserted so the limitation is a known, tested property
    rather than a docstring nobody re-checks — and so a future round-count source
    has a test that changes when it lands."""
    ok, _ = F.screen(record(draft=mfl_draft(rounds=ROUNDS, drop_last=TEAMS)))
    assert ok is True, "documented blind spot: a boundary-aligned stop looks complete"


def test_a_supplied_round_count_overrides_the_inference_and_says_so():
    ok, why = F.screen(record(draft=mfl_draft(drop_last=TEAMS), rounds=ROUNDS))
    assert (ok, why) == (False, "F2.draft_incomplete:140/150")
    assert record(rounds=ROUNDS)["source_meta"]["rounds_source"] == "supplied by caller"


# ── the split the whole report rests on ─────────────────────────────────────
def test_screen_all_separates_UNREADABLE_from_FILTERED():
    corpus = [
        record(),                                              # matched
        record(league=mfl_league(teams="14")),                 # filtered
        record(draft=mfl_draft(draft_type="LINEAR")),          # filtered
        record(draft=mfl_draft(draft_type="WEIRDNEWCODE")),    # unreadable
        record(league=mfl_league(teams=None)),                 # unreadable
    ]
    rep = F.screen_all(corpus)
    assert rep["matched"] == 1
    assert rep["rejected"] == 4
    assert rep["rejected_filtered"] == 2
    assert rep["rejected_unreadable"] == 2
    assert rep["rejected_unclassified"] == 0
    assert rep["unreadable_by_reason"]["F4.draft_type_unrecognised:WEIRDNEWCODE"] == 1


def test_the_verdict_LINE_says_a_parse_failure_is_not_evidence_about_the_pool():
    """Rule 8, applied to the ingest: a number nobody reads prevents nothing, so
    the split is on the verdict sentence rather than in a field beside it."""
    rep = F.screen_all([record(draft=mfl_draft(draft_type="WEIRDNEWCODE"))])
    assert "UNREADABLE" in rep["verdict"]
    assert "NOT about how many public leagues match our format" in rep["verdict"]


def test_a_clean_run_does_NOT_carry_the_unreadable_warning():
    """A warning that is always present is a warning nobody reads."""
    rep = F.screen_all([record(), record(league=mfl_league(teams="14"))])
    assert "UNREADABLE" not in rep["verdict"]
    assert rep["rejected_unreadable"] == 0


# ── every reason this seam can emit is DECLARED ─────────────────────────────
def test_every_reason_the_seam_emits_over_the_whole_corpus_is_declared():
    """An undeclared reason is binned nowhere, and the honest split above would
    silently stop covering the sample."""
    cases = [
        record(), record(league=mfl_league(teams="14")),
        record(league=mfl_league(teams=None)), record(league=mfl_league(teams="ten")),
        record(league=mfl_league(starters=[{"name": "QB", "limit": "one"}])),
        record(draft=mfl_draft(draft_type="WEIRDNEWCODE")),
        record(draft=mfl_draft(draft_type="LINEAR")),
        record(draft=mfl_draft(drop_last=1)),
        record(rules={"error": {"$t": "Error - No League Scoring Rules"}}),
        record(rules=mfl_rules({"RB": 0.5, "WR": 0.5, "TE": 1.0})),
        record(crosswalk_rate=0.5), record(adp_observed_at="2025-08-26"),
        record(has_weekly_outcomes=None), record(pre_draft_adp=None),
        dict(record(), draft=None),
    ]
    undeclared = [F.screen(c)[1] for c in cases if not F.is_classified(F.screen(c)[1])]
    assert undeclared == []


def test_an_unretrievable_scoring_export_keeps_its_OWN_precise_reason():
    """P3: TYPE=rules answered {"error": "Error - No League Scoring Rules"} for
    part of the probe sample. 'We could not tell' and 'the rules had no reception
    line' are different facts, and both are different from 'not half-PPR'."""
    why = F.screen(record(rules={"error": {"$t": "Error - No League Scoring Rules"}}))[1]
    assert why == "F4.no_scoring_rules"
    why2 = F.screen(record(rules={"rules": {"positionRules": [
        {"positions": "WR", "rule": [{"event": {"$t": "FC"}, "points": {"$t": "*2"}}]}]}}))[1]
    assert why2 == "F4.no_reception_rule"
    assert not why2.startswith("F1.")
