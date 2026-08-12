"""THE PRE-REGISTERED FILTERS MUST DO WHAT THE PRE-REGISTRATION SAYS.

Two jobs. First, prove each filter actually rejects what it promised to reject —
a pre-registration whose implementation quietly admits everything is worse than
none, because it carries the authority of having been written down. Second, assert
the CODE and the DOCUMENT still agree: INGEST-PLAN.md is the artifact rule 4
demands, and prose drifting from the build it governs is rule 6's exact failure.

These run with no network, which is the point — the filters get settled and proven
BEFORE any data arrives, which is the order rule 4 requires.

Run: python3 draft/tests/test_ingest_filters.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
import ingest_filters as F  # noqa: E402

fails = []


def ck(name, cond, detail=""):
    if cond:
        print("PASS " + name)
    else:
        fails.append(name)
        print("FAIL " + name + ((" -> " + str(detail)) if detail else ""))


def league(**over):
    """A league that PASSES every filter, so each test can break exactly one thing."""
    base = {
        "teams": 10,
        "scoring": {"rec": 0.5},
        "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1, "BN": 6},
        "draft_type": "snake",
        "draft": {"status": "complete",
                  "picks": [{"crosswalked": True, "team": i % 10, "autopick": False}
                            for i in range(150)]},
        "has_weekly_outcomes": True,
        "pre_draft_adp": {"1": 1.0},
        "adp_observed_at": "2025-08-20",
        "draft_at": "2025-08-25",
    }
    base.update(over)
    return base


ck("a fully-conforming league is ACCEPTED", F.screen(league())[0], F.screen(league()))

# ── F1 format ───────────────────────────────────────────────────────────────
ck("14 teams is rejected", F.screen(league(teams=14))[1] == "F1.teams")
ck("12 teams is ACCEPTED (both sizes qualify)", F.screen(league(teams=12))[0])
ck("full PPR is rejected", F.screen(league(scoring={"rec": 1.0}))[1] == "F1.scoring_not_half_ppr")
ck("standard (no PPR) is rejected", F.screen(league(scoring={"rec": 0.0}))[1] == "F1.scoring_not_half_ppr")
# ── F1 v2: scoring is PER-POSITION (MFL has no scalar `rec`) ────────────────
# v1 read one number. MFL's scoring is per-position, so a 0.5/WR + 1.0/TE league
# would have passed as half-PPR by reading a scalar that does not exist. v2 is
# STRICTER: every skill position independently inside the band.
ck("TE premium is rejected (v1 would have ADMITTED it)",
   F.screen(league(scoring={"rec_by_position": {"RB": 0.5, "WR": 0.5, "TE": 1.0}}))[1]
   .startswith("F1.te_premium_or_split_ppr"))
ck("...and the reason names the offending position and its value",
   "TE=1.0" in F.screen(league(scoring={"rec_by_position": {"RB": 0.5, "WR": 0.5, "TE": 1.0}}))[1])
ck("genuine per-position half-PPR is ACCEPTED",
   F.screen(league(scoring={"rec_by_position": {"RB": 0.5, "WR": 0.5, "TE": 0.5}}))[0])
ck("a uniform out-of-band league is 'not half PPR', NOT 'TE premium'",
   F.screen(league(scoring={"rec": 1.0}))[1] == "F1.scoring_not_half_ppr")
ck("scoring we could not retrieve is its OWN reason, not a PPR failure",
   F.screen(league(scoring={}))[1].startswith("F4.no_scoring_rules"))
ck("a position with no reception rule is UNKNOWN, never 0.0",
   F.screen(league(scoring={"rec_by_position": {"RB": 0.5, "WR": 0.5}}))[1]
   .startswith("F4.no_scoring_rules"))
ck("superflex flagged by the adapter is rejected (MFL has no SUPER_FLEX slot)",
   F.screen(league(superflex=True, scoring={"rec": 0.5}))[1] == "F1.qb_slots")
sf = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "SUPER_FLEX": 1, "K": 1, "DEF": 1}
ck("superflex is rejected (it swamps QB scarcity)",
   F.screen(league(roster_slots=sf))[1] == "F1.qb_slots")
ck("2QB is rejected", F.screen(league(roster_slots={"QB": 2, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1}))[1]
   == "F1.qb_slots")
ck("auction is rejected", F.screen(league(draft_type="auction"))[1] == "F1.draft_type")

# THE DELIBERATE NON-FILTER. Keeper count is a covariate, not a screen.
ck("a REDRAFT league is accepted (keepers are a covariate, never a filter)",
   F.screen(league(keepers=0))[0])
ck("a 3-keeper league is accepted too", F.screen(league(keepers=3))[0])

# ── F2 draft validity ───────────────────────────────────────────────────────
ck("an incomplete draft is rejected",
   F.screen(league(draft={"status": "in_progress", "picks": []}))[1] == "F2.draft_incomplete")
thin = {"status": "complete",
        "picks": [{"crosswalked": i < 100, "team": i % 10} for i in range(150)]}
ck("below 90% crosswalk is rejected",
   F.screen(league(draft=thin))[1].startswith("F2.crosswalk_below_90pct"))
ck("...and the reason carries the RATE, matching the adapter's own verdict string",
   F.screen(league(draft=thin))[1] == "F2.crosswalk_below_90pct:0.667",
   F.screen(league(draft=thin))[1])
edge = {"status": "complete",
        "picks": [{"crosswalked": i < 135, "team": i % 10} for i in range(150)]}
ck("exactly 90% crosswalk is accepted (the bar is inclusive)", F.screen(league(draft=edge))[0])
auto = {"status": "complete",
        "picks": [{"crosswalked": True, "team": (0 if i < 20 else 1 + i % 9),
                   "autopick": i < 20} for i in range(150)]}
ck("a team autopicking a majority of its picks rejects the league",
   F.screen(league(draft=auto))[1] == "F2.autopick_majority")

# ── F4 partial data — whole-league exclusion, no partial credit ─────────────
ck("no weekly outcomes rejects the whole league",
   F.screen(league(has_weekly_outcomes=False))[1] == "F4.no_weekly_outcomes")
ck("no pre-draft ADP rejects the whole league",
   F.screen(league(pre_draft_adp=None))[1] == "F4.no_pre_draft_adp")

# ── F5 contamination — the one that must not be loosened ────────────────────
ck("ADP observed AFTER the draft is rejected",
   F.screen(league(adp_observed_at="2025-08-26"))[1] == "F5.adp_not_strictly_pre_draft")
ck("ADP observed ON the draft date is rejected (STRICTLY before)",
   F.screen(league(adp_observed_at="2025-08-25"))[1] == "F5.adp_not_strictly_pre_draft")
ck("missing timestamps are rejected, never assumed",
   F.screen(league(adp_observed_at=None))[1] == "F5.missing_timestamps")

# ── THE BOOLEAN AND THE REASON MUST NEVER DISAGREE ──────────────────────────
# Every rejection check above reads `screen(...)[1]` — the reason string. NOT ONE
# of them reads [0], and [0] is the half that decides admission: `screen_all`
# builds `matched` from it, and `ingest_run.run_screen` and `external_replay_run`
# unpack it the same way.
#
# MEASURED 2026-08-11 by mutation sweep: TEN separate `return False, "<reason>"`
# lines in `screen()` could each be flipped to `return True` and this entire suite
# stayed green. The league would then be ADMITTED to `matched` while the attrition
# table counted it under its own rejection reason — F7's numerator and denominator
# disagreeing about the same league, with nothing anywhere to notice. That is the
# consumer-reads-a-field-its-author-believed-in defect again, and this time it was
# in the tests rather than in the code they were guarding.
#
# `screen()` has ONE accept path and it returns (True, "ok"); every other return
# is (False, <reason>). So the invariant is exact, and one assertion over the
# fixtures kills all ten mutations: ok IFF why == "ok".
sf = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "SUPERFLEX": 1}
REJECTED = [
    ("14 teams", league(teams=14)),
    ("full PPR", league(scoring={"rec": 1.0})),
    ("standard", league(scoring={"rec": 0.0})),
    ("TE premium", league(scoring={"rec_by_position": {"RB": 0.5, "WR": 0.5, "TE": 1.0}})),
    ("scoring unreadable", league(scoring={})),
    ("superflex", league(superflex=True, scoring={"rec": 0.5})),
    ("superflex slot", league(roster_slots=sf)),
    ("2QB", league(roster_slots={"QB": 2, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1})),
    ("auction", league(draft_type="auction")),
    ("draft_type absent", league(draft_type=None)),
    ("draft incomplete", league(draft={"status": "in_progress", "picks": []})),
    # DISTINCT from the row above, and the reason it needs its own fixture: an
    # empty-picks league that is also in_progress never reaches the picks check.
    # `F2.no_picks` was the one reject path with no fixture at all, and it was the
    # last survivor of the sweep after the ok-IFF-ok invariant killed the other nine.
    ("complete draft with NO picks", league(draft={"status": "complete", "picks": []})),
    ("crosswalk short", league(draft=thin)),
    ("autopick majority", league(draft=auto)),
    ("no weekly outcomes", league(has_weekly_outcomes=False)),
    ("no pre-draft ADP", league(pre_draft_adp=None)),
    ("ADP after the draft", league(adp_observed_at="2025-08-26")),
    ("ADP on the draft date", league(adp_observed_at="2025-08-25")),
    ("timestamps missing", league(adp_observed_at=None)),
]
_disagree = [(n, F.screen(lg)) for n, lg in REJECTED if F.screen(lg)[0] is not False]
ck("EVERY rejected league returns ok=False, not just a reason string",
   not _disagree, _disagree)
ck("a complete draft with no picks is F2.no_picks, not F2.draft_incomplete",
   F.screen(league(draft={"status": "complete", "picks": []}))[1] == "F2.no_picks",
   F.screen(league(draft={"status": "complete", "picks": []})))
ck("the reason and the boolean agree on every fixture, both directions",
   all(F.screen(lg)[0] == (F.screen(lg)[1] == "ok")
       for _, lg in REJECTED + [("accepted", league())]))

# ── the pre-registered EDGES, which are where a band is actually decided ────
# The sweep survived three boundary mutations because no fixture sat ON a bound.
# PPR_RANGE, MAX_AUTOPICK_SHARE and the F7 target are all pre-registered numbers,
# and an off-by-one in any of them changes who is admitted while every interior
# fixture keeps passing.
ck("PPR at the band's LOWER edge (0.4) is accepted — the bound is inclusive",
   F.screen(league(scoring={"rec_by_position": {p: F.PPR_RANGE[0] for p in F.SKILL_POSITIONS}}))[0])
ck("PPR at the band's UPPER edge (0.6) is accepted — the bound is inclusive",
   F.screen(league(scoring={"rec_by_position": {p: F.PPR_RANGE[1] for p in F.SKILL_POSITIONS}}))[0])
ck("PPR just BELOW the lower edge is rejected",
   F.screen(league(scoring={"rec_by_position": {p: 0.39 for p in F.SKILL_POSITIONS}}))[1]
   == "F1.scoring_not_half_ppr")

# EXACTLY half autopicked is not a MAJORITY. `> MAX_AUTOPICK_SHARE`, not `>=`.
# 16 picks per team, alternating by ROUND so the share is 8/16 for every team —
# alternating by pick index instead correlates with `i % 10` and hands the even
# teams a share of 1.0, which is a different test wearing this one's name.
_half = {"status": "complete",
         "picks": [{"crosswalked": True, "team": i % 10, "autopick": (i // 10) % 2 == 0}
                   for i in range(160)]}
ck("a team exactly at the autopick share is ACCEPTED (majority is strict)",
   F.screen(league(draft=_half))[0], F.screen(league(draft=_half)))
# ...and ONE more pick tips it. Team 0 gets 9 of 16 — the flip has to land in an
# ODD round, because every even round is autopicked already and `or i < 10` would
# have added nothing at all.
_over = {"status": "complete",
         "picks": [{"crosswalked": True, "team": i % 10,
                    "autopick": (i // 10) % 2 == 0 or i == 10}
                   for i in range(160)]}
ck("one pick PAST half is a majority and is rejected",
   F.screen(league(draft=_over))[1] == "F2.autopick_majority",
   F.screen(league(draft=_over)))

# ── F3 player-seasons: absent is DROPPED AND COUNTED, never zero ────────────
keep, dropped = F.usable_player_seasons([
    {"pid": "a", "weekly": {1: 10.0}},
    {"pid": "b", "weekly": {}},
    {"pid": "c"},
    {"pid": "d", "weekly": {1: 0.0}},          # a REAL zero — kept
])
ck("player-seasons without a weekly series are dropped", len(keep) == 2, keep)
ck("and counted rather than silently vanishing", dropped == 2, dropped)
ck("a genuine ZERO week is KEPT (zero is an outcome, absent is not)",
   any(r["pid"] == "d" for r in keep))

# ── F6 pooled vs local, fail-closed ─────────────────────────────────────────
ck("a poolable parameter may pool", F.may_pool("positional_replacement_curve"))
ck("manager tendencies may NOT pool", not F.may_pool("manager_tendencies"))
ck("opponent survival conditioning may NOT pool", not F.may_pool("opponent_survival"))
ck("an UNCLASSIFIED parameter defaults to LOCAL (fail closed)",
   not F.may_pool("some_parameter_nobody_thought_about"))

# ── Attrition is reported by cause, and a short sample changes NOTHING ──────
rep = F.screen_all([league(), league(teams=14), league(teams=14),
                    league(adp_observed_at="2025-08-26")])
ck("attrition is attributed by reason", rep["rejected_by_reason"].get("F1.teams") == 2,
   rep["rejected_by_reason"])
ck("matched count is reported", rep["matched"] == 1, rep)
ck("a short sample is declared INSUFFICIENT", not rep["meets_target"])
ck("and says it changes NOTHING rather than relaxing a filter",
   "changes NOTHING" in rep["verdict"], rep["verdict"])

# F7's bar is EXACTLY 200 and it is INCLUSIVE. Every fixture above sits far below
# it, so `>=` could be narrowed to `>` with the whole suite green — and a run that
# matched exactly 200 leagues would then report INSUFFICIENT against a target it
# had met. The bound is pre-registered; assert the bound, not the interior.
_at = F.screen_all([league()] * F.TARGET_MATCHED_LEAGUE_SEASONS)
ck("EXACTLY the target is sufficient — the pre-registered bar is inclusive",
   _at["meets_target"] and "sufficient" in _at["verdict"], _at["verdict"])
_under = F.screen_all([league()] * (F.TARGET_MATCHED_LEAGUE_SEASONS - 1))
ck("one short of the target is INSUFFICIENT", not _under["meets_target"])

# A CLAUSE THAT CANNOT FIRE IS NOT A CLAUSE THAT FOUND NOTHING, and the note
# saying so is deduplicated across leagues. Inverting that `not in` reported the
# note only when it was already present — i.e. never — and the verdict lost the
# sentence entirely while every count stayed identical.
_un = {"source_meta": {"unenforced": ["F2.keeper_count unreadable in this export"]}}
_rep2 = F.screen_all([league(**_un), league(**_un), league(teams=14, **_un)])
ck("an unenforceable clause is reported ONCE, not per league",
   _rep2["unenforced_filters"] == ["F2.keeper_count unreadable in this export"],
   _rep2["unenforced_filters"])
ck("and it reaches the verdict line where it cannot be missed",
   "could NOT be enforced" in _rep2["verdict"], _rep2["verdict"])

# ── "WE COULD NOT READ IT" IS NOT "IT FAILED THE CHECK" (B's audit, 2026-08-11)
# The table below is the whole finding, as a test. Each row states the sentence
# the report USED to produce and the one it produces now, and asserts BOTH: the
# new reason is right AND the old lie is gone. The `ok` column is asserted too,
# and every row is False — which is the point: this changed no league's verdict,
# only the sentence explaining a rejection that already happened, so it is a
# reporting fix and NOT a filter change requiring a new pre-registration.
NO_QB = {"RB": 2, "WR": 2, "TE": 1, "FLEX": 1}
RANGE_QB = {"QB": "1-2", "RB": 2, "WR": 2, "TE": 1, "FLEX": 1}
BAD_RB = {"QB": 1, "RB": "two", "WR": 2, "TE": 1, "FLEX": 1}
NO_XWALK = {"status": "complete", "picks": [{"team": i % 10} for i in range(150)]}
RELABELLED = [
    # (what broke,              league,          what it USED to do,   what it says now)
    # Two rows did not lie, they RAISED: `int("1-2")` and `int("two")` threw
    # ValueError out of the screen. Recorded as what actually happened rather
    # than tidied into the same shape as the other eleven.
    ("teams absent", league(teams=None), "F1.teams", "F4.no_team_count"),
    ("teams unparseable", league(teams="10"), "F1.teams", "F4.no_team_count"),
    ("roster_slots empty", league(roster_slots={}), "F1.qb_slots", "F4.no_roster_slots"),
    ("roster_slots absent", league(roster_slots=None), "F1.qb_slots", "F4.no_roster_slots"),
    ("no QB slot parsed", league(roster_slots=NO_QB), "F1.qb_slots", "F4.no_qb_slot_count"),
    ("QB limit is a RANGE STRING", league(roster_slots=RANGE_QB), "ValueError (crash)",
     "F4.unreadable_qb_slot_count:1-2"),
    ("a skill limit unparseable", league(roster_slots=BAD_RB), "ValueError (crash)",
     "F4.unreadable_starting_slots:RB"),
    ("draft_type absent", league(draft_type=None), "F1.draft_type", "F4.no_draft_type"),
    ("draft_type empty", league(draft_type=" "), "F1.draft_type", "F4.no_draft_type"),
    ("draft absent", league(draft=None), "F2.draft_incomplete", "F4.no_draft"),
    ("draft empty", league(draft={}), "F2.draft_incomplete", "F4.no_draft"),
    ("draft has no status", league(draft={"picks": [{"crosswalked": True}]}),
     "F2.draft_incomplete", "F4.no_draft_status"),
    ("the crosswalk never ran", league(draft=NO_XWALK), "F2.crosswalk_below_90pct",
     "F4.crosswalk_not_run:150/150 picks"),
]
for what, lg, old, new in RELABELLED:
    got_ok, got = F.screen(lg)
    ck("%s -> rejected as '%s' (was: %s)" % (what, new, old),
       got_ok is False and got == new and F.reason_code(got) != old, got)
    ck("...and '%s' is classified as UNREADABLE, not as evidence about the pool" % what,
       F.is_unreadable(got), got)

# THE ADAPTER'S OWN REASON SURVIVES. `mfl_adapter.draft_type()` returns
# `draft_type_unrecognised:SFIRSTFOO` precisely so an unknown code is its own
# attrition reason; the seam used to receive a bare string and discard it.
ck("an adapter reason reaches the report VERBATIM",
   F.screen(league(draft_type=None, unreadable={"draft_type": "draft_type_unrecognised:SFIRSTFOO"}))[1]
   == "F4.draft_type_unrecognised:SFIRSTFOO")
ck("...and without one the generic reason still tells the truth",
   F.screen(league(draft_type=None))[1] == "F4.no_draft_type")

# THE CONVERSE LIE. Over-reporting parse failures would hide real format rarity.
ck("a league we DID read still reports the real filter failure",
   F.screen(league(teams=14))[1] == "F1.teams" and not F.is_unreadable("F1.teams"))
ck("a readable non-snake draft is still F1.draft_type",
   F.screen(league(draft_type="auction"))[1] == "F1.draft_type")
ck("F5's strictly-before check is a REAL check, not an unreadable",
   not F.is_unreadable("F5.adp_not_strictly_pre_draft"))
ck("F5's missing timestamps IS an unreadable (we lack the dates)",
   F.is_unreadable("F5.missing_timestamps"))

# ── the split, and the bucket that stops it being silently incomplete ───────
mixed = F.screen_all([league(), league(teams=14), league(teams=None), league(draft_type=None)])
ck("the report splits UNREADABLE from FILTERED",
   (mixed["rejected_filtered"], mixed["rejected_unreadable"]) == (1, 2), mixed)
ck("and says so on the VERDICT LINE, where it cannot be skimmed past",
   "UNREADABLE" in mixed["verdict"] and "NOT about how many public leagues" in mixed["verdict"],
   mixed["verdict"])
ck("a clean run carries no such warning (one that always fires is never read)",
   "UNREADABLE" not in F.screen_all([league(), league(teams=14)])["verdict"])

_real_screen = F.screen
F.screen = lambda lg: (False, "F9.a_reason_nobody_declared")
_undeclared = F.screen_all([league()])
F.screen = _real_screen
ck("an UNDECLARED reason is binned nowhere rather than silently counted as filtered",
   (_undeclared["rejected_unclassified"], _undeclared["rejected_filtered"]) == (1, 0), _undeclared)
ck("...and the verdict says the split is incomplete until it is declared",
   "UNDECLARED reason code" in _undeclared["verdict"], _undeclared["verdict"])
ck("every reason the filters can emit is declared",
   all(F.is_classified(F.screen(lg)[1]) for _, lg, _, _ in RELABELLED)
   and all(F.is_classified(r) for r in F.FILTERED_REASONS + F.UNOBTAINED_REASONS))

# ── RULE 6: the code and the pre-registration must not diverge ──────────────
plan = (ROOT / "INGEST-PLAN.md").read_text()
ck("INGEST-PLAN.md exists and is the dated pre-registration",
   "PRE-REGISTERED FILTERS" in plan and "2026-08-10" in plan)
ck("the doc's team sizes match the code",
   all(str(t) in plan for t in F.TEAMS_ALLOWED))
ck("the doc's crosswalk bar matches the code",
   ("%d%%" % int(F.MIN_CROSSWALK_RATE * 100)) in plan.replace("≥", ""))
ck("the doc's stopping rule matches the code",
   str(F.TARGET_MATCHED_LEAGUE_SEASONS) in plan)
ck("the doc still states keepers are a covariate, not a filter",
   re.search(r"covariate.{0,60}never used as a filter", plan, re.S | re.I) is not None)
ck("the doc still states the fail-closed local default",
   "LOCAL" in plan and "FAIL-CLOSED" in plan.upper())
# The attrition VOCABULARY is part of the pre-registration now, because the whole
# guarantee F4 provides is that we know why leagues were dropped. A reason code
# that exists in the build and not in the document is rule 6's exact failure.
_undocumented = [r for r in F.FILTERED_REASONS + F.UNOBTAINED_REASONS if r not in plan]
ck("every reason code the filters can emit is documented in INGEST-PLAN.md",
   _undocumented == [], _undocumented)
ck("the doc records that the relabelling moved no league's verdict",
   "REPORTING fix, NOT a filter change" in plan)
ck("the doc still names F2's autopick clause as UNENFORCED",
   re.search(r"autopick clause is still UNENFORCED", plan) is not None)


def test_all_checks_passed():
    assert not fails, fails


if __name__ == "__main__":
    print("\n%d failed" % len(fails))
    sys.exit(1 if fails else 0)


def test_the_ppr_decision_has_EXACTLY_ONE_implementation():
    """`mfl_adapter.ppr_verdict` made this decision a second time and gave a
    different answer — a uniform full-PPR league came back
    `F1.te_premium_or_split_ppr`, which is false. It had NO CALLER outside its own
    test, so the two could disagree indefinitely with nothing going red.

    MUTATION: reintroduce a second implementation anywhere. This asserts the name
    is gone AND that `screen()` routes through the surviving one."""
    import mfl_adapter as A
    assert not hasattr(A, "ppr_verdict"), \
        "a second implementation of an F1 decision is back"
    uniform = {"RB": 1.0, "WR": 1.0, "TE": 1.0}
    assert F.ppr_reason(uniform) == (False, "F1.scoring_not_half_ppr")
    lg = {"teams": 10, "scoring": {"rec_by_position": uniform},
          "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1}}
    assert F.screen(lg)[1] == "F1.scoring_not_half_ppr", \
        "screen() must give the SAME answer as the function it calls"


def test_screen_checks_F1_BEFORE_everything_else():
    """`passed_f1` INFERS format-pass from the absence of an F1 reason, which is
    only valid because `screen()` runs F1 first and returns on first failure. D7's
    population rests on that ordering, so it is asserted rather than assumed.

    A league that is FORMAT-BAD and also draft-bad must report the FORMAT reason:
    if the order ever flips, this goes red here instead of silently widening D7's
    pool to include dynasty and superflex leagues."""
    bad_both = {"teams": 14,                      # F1: wrong size
                "scoring": {"rec_by_position": {"RB": .5, "WR": .5, "TE": .5}},
                "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1},
                "draft_type": "snake",
                "draft": {"status": "incomplete", "picks": []}}   # F2: also bad
    assert F.screen(bad_both)[1] == "F1.teams"
    assert F.passed_f1("F1.teams") is False


def test_a_league_we_could_not_READ_the_format_of_does_not_count_as_passing_F1():
    """Absent is not a pass. A league whose scoring we could not retrieve must not
    enter D7's format-matched pool on the strength of not having failed."""
    assert F.passed_f1("F4.no_scoring_rules:TE") is False
    assert F.passed_f1("F4.draft_type_unrecognised:SFIRSTFOO") is False
    # But a league that FAILED LATER got past F1 and belongs in the pool.
    assert F.passed_f1("F2.draft_incomplete") is True
    assert F.passed_f1("F4.no_pre_draft_adp") is True
    assert F.passed_f1("ok") is True


def test_a_league_we_NEVER_FETCHED_has_not_passed_F1():
    """MEASURED, and it made a whole measurement vacuous. `passed_f1` returned True
    for `F4.fetch_failed`, so the nine leagues that 429'd counted as F1-passing and
    D7's format-matched pool came back as 9 leagues carrying 0 of 6,649 picks. The
    run then reported "NO LEAGUE CARRIES A DATED FIRST PICK", which reads as a fact
    about MFL's timestamps and was a fact about this predicate.

    Absent is not a pass. We did not read their format; we read nothing."""
    assert F.passed_f1("F4.fetch_failed:league: http 429 Too Many Requests") is False
    assert F.passed_f1("F4.parse_failed:AttributeError") is False
    # And the leagues that genuinely got past F1 still do.
    assert F.passed_f1("F2.draft_incomplete") is True
    assert F.passed_f1("F5.adp_not_strictly_pre_draft") is True
    assert F.passed_f1("ok") is True


# ── the 2026 question: which leagues wait only on the calendar? ─────────────
def _rec(**kw):
    """A league that passes everything, so each test below removes ONE thing."""
    from test_attrition_seam import record
    return record(**kw)


def _rec_teams(n, **kw):
    """Team count lives in the LEAGUE export, not in the record kwargs — reaching
    for it as a kwarg silently passes it to `to_league_record`, which does not take
    it, and the test fails on a TypeError instead of on the thing it is testing."""
    from test_attrition_seam import record, mfl_league
    return record(league=mfl_league(teams=str(n)), **kw)


def test_the_OUTCOMES_CHECK_RUNS_LAST_and_passed_pre_outcome_rests_on_it():
    """`passed_pre_outcome` reads `F4.no_weekly_outcomes` as "cleared everything
    else", and that is only true if the check is LAST. Asserted directly rather
    than left true by accident — the same discipline `passed_f1` needs from F1
    being first.

    MUTATION: put the outcomes check back before F5. A league with contaminated ADP
    reports `F4.no_weekly_outcomes`, `passed_pre_outcome` calls it outcome-ready,
    and the 2026 readiness count includes leagues whose ADP was observed AFTER
    their draft."""
    # Contaminated ADP *and* no outcomes: F5 must win, because it is the finding.
    r = _rec(adp_observed_at="2025-08-26", has_weekly_outcomes=False)
    ok, why = F.screen(r)
    assert ok is False
    assert why == "F5.adp_not_strictly_pre_draft", why
    assert F.passed_pre_outcome(why) is False

    # Wrong format *and* no outcomes: F1 must win.
    r2 = _rec_teams(14, has_weekly_outcomes=False)
    assert F.screen(r2)[1] == "F1.teams"


def test_a_league_waiting_ONLY_on_the_season_reports_exactly_that():
    """The 2026 case, and the number worth having a year early. 2026's ADP is being
    captured cleanly right now — it is the only season F5 can be satisfied for
    without an archive — and its outcomes arrive in January."""
    r = _rec(has_weekly_outcomes=False)
    ok, why = F.screen(r)
    assert ok is False and why == "F4.no_weekly_outcomes"
    assert F.passed_pre_outcome(why) is True


def test_passed_pre_outcome_is_NOT_a_filter_and_admits_nothing_else():
    """It relaxes nothing: F4 still excludes these leagues whole. MUTATION: make it
    true for any F4 code, and leagues with no ADP at all are counted as ready for a
    season they could never be replayed in."""
    assert F.passed_pre_outcome("ok") is True
    for code in ("F4.no_pre_draft_adp", "F5.adp_not_strictly_pre_draft", "F1.teams",
                 "F2.draft_incomplete", "F4.fetch_failed", "F4.no_weekly_data",
                 "F4.parse_failed", "F4.no_scoring_rules"):
        assert F.passed_pre_outcome(code) is False, code


def test_an_admitted_league_is_still_admitted_after_the_reorder():
    """The reorder is an ORDERING change, not a relaxation. If this fails, every
    test above is measuring a screen that stopped accepting our own format."""
    assert F.screen(_rec()) == (True, "ok")
