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
ck("below 90% crosswalk is rejected", F.screen(league(draft=thin))[1] == "F2.crosswalk_below_90pct")
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


def test_all_checks_passed():
    assert not fails, fails


if __name__ == "__main__":
    print("\n%d failed" % len(fails))
    sys.exit(1 if fails else 0)
