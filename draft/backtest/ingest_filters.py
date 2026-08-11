"""THE PRE-REGISTERED INGEST FILTERS, AS CODE.

INGEST-PLAN.md fixed these on 2026-08-10 before any league data was examined. This
is the same specification expressed as executable rules, and the pairing is the
point: a pre-registration that lives only in prose drifts from the build that
eventually implements it, and nobody notices because both look reasonable on their
own. That is binding rule 6 (the written rules and the running system must not
diverge) applied to the ingest before the ingest exists.

WHY THIS IS WORTH WRITING NOW, WITH NO NETWORK. The fetch needs egress and will run
in CI. Everything else — deciding which leagues qualify, which player-seasons are
usable, how attrition is counted — is pure logic over dictionaries, fully testable
today against synthetic cases. Building it now means the filters are settled and
proven BEFORE the data arrives, which is exactly the order rule 4 demands and the
opposite of the order that produces a confirmation machine.

EVERY REJECTION IS COUNTED AND ATTRIBUTED. A sample whose attrition is invisible is
a sample nobody can judge, and "200 leagues matched" means nothing without "and
1,400 were rejected, here is why". `screen()` returns the reason, never a bare
boolean.

AND THE REASON MUST BE TRUE. "We could not tell" is not "we checked and it did not
match" — B's audit (2026-08-11) found this module telling the second lie on FOUR of
nine fields: an absent `roster_slots` reported as `F1.qb_slots` ("doesn't start
exactly one QB"), an absent `teams` as `F1.teams` ("wrong league size"), an absent
`draft_type` as `F1.draft_type` ("not a snake draft"), an absent `draft` as
`F2.draft_incomplete` ("their draft wasn't finished"). A league that fails to PARSE
was indistinguishable from a league that fails the FILTERS, so every parse bug made
the attrition report lie about why leagues were dropped — and a mass parse failure
would have read as "no public league matches our format", which is a conclusion
someone might believe. Two mechanisms now stop that (see `_unreadable` and
`is_unreadable`): a field we could not read is its own reason, and the source
adapter's own precise reason survives to the report rather than collapsing here.

Filters v1 — see INGEST-PLAN.md for the reasoning behind each boundary. A change
here is a NEW version there, with v1 retained; never an edit in place. NOTE the
2026-08-11 relabelling is NOT such a change: no league's accept/reject verdict moves
(asserted by `test_the_matched_SET_is_unchanged_by_the_relabelling`), only the
sentence explaining a rejection that already happened.
"""
from __future__ import annotations

from collections import Counter

FILTER_VERSION = "v2 (2026-08-10) — F1.scoring per-position; v1 retained in INGEST-PLAN.md"

# F1 — format match
TEAMS_ALLOWED = (10, 12)
PPR_RANGE = (0.4, 0.6)
STARTING_SKILL_RANGE = (6, 8)
QB_SLOTS_REQUIRED = 1
DRAFT_TYPE_ALLOWED = ("snake",)

# F2 — draft validity
MIN_CROSSWALK_RATE = 0.90
MAX_AUTOPICK_SHARE = 0.50

# F7 — stopping rule
TARGET_MATCHED_LEAGUE_SEASONS = 200

SKILL_SLOTS = ("RB", "WR", "TE", "FLEX", "REC_FLEX")
# The positions F1 v2 checks reception scoring on, independently.
SKILL_POSITIONS = ("RB", "WR", "TE")


def _starting_skill(slots: dict) -> tuple[int, list]:
    """(starting skill slots, positions we could not read).

    ABSENT IS NOT ZERO, and the two absences are different: a slot key MISSING
    means the league does not have that slot (plenty of leagues have no REC_FLEX,
    and zero is the right count), while a slot key PRESENT with a value we cannot
    parse means we do not know the count. The second used to raise — `int("2-3")`
    — and before the adapter existed it would have crashed the screen; now it is
    reported as unreadable rather than silently counted as zero, which would have
    manufactured an `F1.starting_skill_slots` verdict out of a parse failure.
    """
    total, unreadable = 0, []
    for k in SKILL_SLOTS:
        v = slots.get(k)
        if v is None:
            continue
        try:
            total += int(v)
        except (TypeError, ValueError):
            unreadable.append(k)
    return total, unreadable


# ── "we could not read it" is not "it failed the check" ─────────────────────
# The adapter upstream computes a PRECISE reason for every way a field can fail
# to parse (`mfl_adapter.draft_type` returns `draft_type_unrecognised:SFIRSTFOO`
# with a comment saying it "must never be folded into 'not a snake draft'"). That
# detail reaches here in `league["unreadable"]` — {field: reason} — and is
# reported verbatim. Without this key the generic fallback still tells the truth;
# with it, the attrition report names the actual code MFL sent.
UNREADABLE_KEY = "unreadable"


def _unreadable(league: dict, field: str, fallback: str) -> tuple[bool, str]:
    detail = (league.get(UNREADABLE_KEY) or {}).get(field)
    return False, "F4." + str(detail or fallback)


def ppr_reason(by_pos: dict, band=None) -> tuple:
    """F1 v2's reception-value decision. (ok, reason). THE ONLY IMPLEMENTATION.

    Extracted from `screen()` on 2026-08-11 because there were TWO. `mfl_adapter.
    ppr_verdict` made the same decision with a different answer — it reported a
    uniform full-PPR league as `F1.te_premium_or_split_ppr`, which is false: 1.0 at
    every position is not TE premium. It had NO CALLER outside its own test, so the
    disagreement was invisible and would have stayed invisible until someone wired
    it up and got a reason that was wrong in a way nobody would question.

    That is the multi-derivation failure rule 11 exists for, sitting in this lane's
    own code, and the fix is not to reconcile the two — it is to have one.
    """
    band = band or PPR_RANGE
    missing = [p for p in SKILL_POSITIONS if (by_pos or {}).get(p) is None]
    if missing:
        # ABSENT IS NOT ZERO: a position with no reception rule is not "not PPR",
        # it is a position we could not read.
        return False, "F4.no_scoring_rules:" + ",".join(missing)
    vals = {p: float(by_pos[p]) for p in SKILL_POSITIONS}
    outside = [p for p in SKILL_POSITIONS if not (band[0] <= vals[p] <= band[1])]
    if not outside:
        return True, "ok"
    # TWO DIFFERENT REJECTIONS, kept apart because the attrition report is only
    # useful if its reasons are true. A league at 1.0 everywhere is FULL PPR, not
    # TE premium. Split scoring is the new exclusion F1 v2 adds; uniform-but-
    # outside is v1's, and still accurate.
    if len(set(vals.values())) == 1:
        return False, "F1.scoring_not_half_ppr"
    return False, "F1.te_premium_or_split_ppr:" + ",".join(
        "%s=%s" % (p, vals[p]) for p in outside)


def screen(league: dict) -> tuple[bool, str]:
    """Does this league-season qualify? Returns (ok, reason).

    Reason is ALWAYS populated — 'ok' on acceptance — so the caller can tally
    attrition by cause without re-deriving why anything was dropped. Every reason
    is a TRUE statement about the league: an `F1.*`/`F2.*` reason means we read
    the field and it did not qualify, an `F4.*` reason means we could not read or
    could not obtain it. `is_unreadable()` is the split.
    """
    scoring = league.get("scoring") or {}

    # ---- F1 format match ----------------------------------------------------
    teams = league.get("teams")
    if not isinstance(teams, int) or isinstance(teams, bool):
        # "We could not read the league size" is not "this league is the wrong
        # size". The second is a fact about MFL's public pool; the first is a fact
        # about our parser, and reporting it as the second is how a fetch bug
        # becomes a finding about format rarity.
        return _unreadable(league, "teams", "no_team_count")
    if teams not in TEAMS_ALLOWED:
        return False, "F1.teams"
    # F1.scoring — v2. v1 read a single scalar `rec`, which MFL DOES NOT HAVE:
    # its scoring is PER-POSITION, so a league can be 0.5/reception for WR and
    # 1.0 for TE. v1 would have admitted that TE-premium league by reading a
    # number that does not exist. v2 is STRICTER, not looser: every skill
    # position independently inside the band.
    #
    # A scalar `rec` is still accepted — Sleeper genuinely has one — but it is
    # expanded to all three positions rather than treated as a different rule.
    by_pos = scoring.get("rec_by_position")
    if by_pos is None and scoring.get("rec") is not None:
        by_pos = {p: float(scoring["rec"]) for p in SKILL_POSITIONS}
    if not by_pos:
        # "We could not tell" is NOT "we checked and it did not match". Conflating
        # them makes the attrition report claim a check it never performed. This
        # is the field the rule was already implemented for; the four fields
        # around it now work the same way.
        return _unreadable(league, "scoring", "no_scoring_rules")
    ok, why = ppr_reason(by_pos)
    if not ok:
        return False, why
    # Superflex changes QB scarcity so completely it would swamp every positional
    # finding, so it is excluded rather than controlled for. MFL has NO SUPER_FLEX
    # slot — it expresses superflex as a QB limit whose max exceeds its min — so
    # the adapter sets `superflex` explicitly and it is checked here too.
    slots = league.get("roster_slots")
    if not isinstance(slots, dict) or not slots:
        # `{}` used to read as "0 QB slots" -> F1.qb_slots, i.e. a confident
        # statement about a roster we never saw. Roster slots are one of the two
        # shapes that needed a schema probe to pin down (limits are RANGE STRINGS),
        # so they are also among the likeliest to break.
        return _unreadable(league, "roster_slots", "no_roster_slots")
    qb = slots.get("QB")
    if qb is None:
        return _unreadable(league, "roster_slots", "no_qb_slot_count")
    try:
        qb = int(qb)
    except (TypeError, ValueError):
        return _unreadable(league, "roster_slots", "unreadable_qb_slot_count:%s" % (slots["QB"],))
    if qb != QB_SLOTS_REQUIRED or slots.get("SUPER_FLEX") or league.get("superflex"):
        return False, "F1.qb_slots"
    skill, skill_unreadable = _starting_skill(slots)
    if skill_unreadable:
        return _unreadable(league, "roster_slots",
                           "unreadable_starting_slots:" + ",".join(skill_unreadable))
    if not (STARTING_SKILL_RANGE[0] <= skill <= STARTING_SKILL_RANGE[1]):
        return False, "F1.starting_skill_slots"
    draft_type = league.get("draft_type")
    if not isinstance(draft_type, str) or not draft_type.strip():
        # THE SHARPEST CASE B FOUND. `mfl_adapter.draft_type()` deliberately
        # returns (None, "draft_type_unrecognised:XYZ") because MFL emits codes
        # (SFIRSTRANDOM), not the word "snake" — and then this line received a
        # bare string and folded it into "not a snake draft", throwing away the
        # one thing the adapter had gone to trouble to preserve. An unrecognised
        # code now arrives in `unreadable["draft_type"]` and is reported as itself.
        return _unreadable(league, "draft_type", "no_draft_type")
    if draft_type.strip().lower() not in DRAFT_TYPE_ALLOWED:
        return False, "F1.draft_type"

    # NOTE: keeper count is deliberately NOT screened. It is recorded as a
    # covariate — our keeper structure is local, and excluding redraft leagues
    # would shrink the sample to chase a similarity we can control for instead.

    # ---- F2 draft validity --------------------------------------------------
    draft = league.get("draft")
    if not isinstance(draft, dict) or not draft:
        return _unreadable(league, "draft", "no_draft")
    status = draft.get("status")
    if status is None or not str(status).strip():
        # A draft record with no status is not a draft we watched fail to finish.
        return _unreadable(league, "draft", "no_draft_status")
    if str(status) != "complete":
        # MFL's draftResults carries NO status field, so the bridge INFERS
        # completeness and states the basis. The detail travels — "142/150" is a
        # partial draft, "2/180" is a fetch that failed, and an attrition table
        # that shows only "F2.draft_incomplete" cannot tell them apart.
        detail = draft.get("status_detail")
        return False, "F2.draft_incomplete" + ((":%s" % detail) if detail else "")
    picks = draft.get("picks") or []
    if not picks:
        return False, "F2.no_picks"
    # ABSENT IS NOT UNMATCHED. A pick carrying no `crosswalked` key at all means
    # the crosswalk never ran for this league; counting it as a miss reports
    # "we checked and under 90% of picks matched our board" about work nobody did,
    # and F2 says that bar is what stops "the replay guessing".
    unattempted = sum(1 for p in picks if p.get("crosswalked") is None)
    if unattempted:
        return _unreadable(league, "crosswalk",
                           "crosswalk_not_run:%d/%d picks" % (unattempted, len(picks)))
    matched = sum(1 for p in picks if p.get("crosswalked"))
    if matched / len(picks) < MIN_CROSSWALK_RATE:
        return False, "F2.crosswalk_below_90pct:%.3f" % (matched / len(picks))
    # An abandoned team is not an opponent; it is noise wearing a seat.
    by_team: dict = {}
    for p in picks:
        t = p.get("team")
        if t is None:
            continue
        e = by_team.setdefault(t, [0, 0])
        e[0] += 1
        if p.get("autopick"):
            e[1] += 1
    if any(a / n > MAX_AUTOPICK_SHARE for n, a in by_team.values() if n):
        return False, "F2.autopick_majority"

    # ---- F4 partial data ----------------------------------------------------
    # Whole-league exclusion. No partial-credit leagues.
    if not league.get("has_weekly_outcomes"):
        return False, "F4.no_weekly_outcomes"
    if league.get("pre_draft_adp") in (None, {}, []):
        return False, "F4.no_pre_draft_adp"

    # ---- F5 contamination ---------------------------------------------------
    # EARLIEST TIMESTAMP WINS. ADP must be observed STRICTLY BEFORE the draft.
    # Pre-declared as the largest expected source of attrition; loosening this to
    # gain sample is forbidden, so it is a hard reject rather than a warning.
    adp_at, draft_at = league.get("adp_observed_at"), league.get("draft_at")
    if not adp_at or not draft_at:
        return False, "F5.missing_timestamps"
    if str(adp_at) >= str(draft_at):
        return False, "F5.adp_not_strictly_pre_draft"

    return True, "ok"


# ── the split that makes the attrition report judgeable ─────────────────────
# Every reason code `screen()` can return, declared so the report can be read as
# a whole rather than as whatever happened to appear. A code may carry a ":detail"
# suffix (the offending value, the rate, the picks); `reason_code()` strips it.
FILTERED_REASONS = (
    # WE READ IT AND IT DOES NOT QUALIFY — evidence about the public pool.
    "F1.teams", "F1.scoring_not_half_ppr", "F1.te_premium_or_split_ppr",
    "F1.qb_slots", "F1.starting_skill_slots", "F1.draft_type",
    "F2.draft_incomplete", "F2.no_picks", "F2.crosswalk_below_90pct",
    "F2.autopick_majority", "F5.adp_not_strictly_pre_draft",
)
UNOBTAINED_REASONS = (
    # WE COULD NOT READ OR COULD NOT OBTAIN IT — evidence about our pipeline.
    # The first group are `screen()`'s own fallbacks; the second are the source
    # adapter's precise reasons, arriving through `league["unreadable"]`.
    "F4.no_scoring_rules", "F4.no_team_count", "F4.no_roster_slots",
    "F4.no_qb_slot_count", "F4.unreadable_qb_slot_count",
    "F4.unreadable_starting_slots", "F4.no_draft_type", "F4.no_draft",
    "F4.no_draft_status", "F4.crosswalk_not_run", "F4.no_weekly_outcomes",
    "F4.no_pre_draft_adp", "F5.missing_timestamps",
    "F4.unreadable_team_count", "F4.unreadable_starter_limits",
    "F4.draft_type_absent", "F4.draft_type_unrecognised", "F4.no_reception_rule",
    # A league we could not FETCH is not a league that failed a filter. Declared
    # here so `ingest_run` cannot bin one nowhere — the registry caught this code
    # arriving undeclared, which is exactly what it is for.
    "F4.fetch_failed",
    # F3/D5, from `external_outcomes`. All three are UNOBTAINED and not FILTERED,
    # and the distinction is the whole point of the split: a league whose scoring
    # uses a term our stat-line translator does not emit is a gap in THIS PIPELINE.
    # Binned as "filtered" it would read as "the public pool does not score like
    # us", which is a conclusion about the world drawn from a limitation of ours.
    "F4.scoring_untranslatable",     # a rule we cannot express as a per-unit multiplier
    "F4.scoring_range_exceeded",     # a rule's upper bound, checked against the data
    "F4.no_weekly_data",             # the FETCH served nothing for the season
    "F4.no_gsis_crosswalk",          # weekly is GSIS-keyed, our board is Sleeper-keyed
    "F4.stat_columns_absent",        # the DATA cannot serve a term the league scores
    "F4.no_season_type",             # REG and POST are indistinguishable in this data
    # A league whose export we could not PARSE. Its own reason, never the run's
    # death — one malformed league took a whole 250-league run with it once.
    "F4.parse_failed",
    # An export carrying several draft units, none league-wide (divisional drafts,
    # each with its own pick numbering). Merging them would manufacture an overall
    # pick number no drafter ever saw.
    "F4.draft_not_league_wide",
)


# D7's population is F1-passing leagues: dynasty and superflex ADP are different
# quantities, not noisier versions of the same one.
F1_FORMAT_UNREADABLE = (
    "F4.no_scoring_rules", "F4.no_reception_rule", "F4.no_team_count",
    "F4.unreadable_team_count", "F4.no_roster_slots", "F4.no_qb_slot_count",
    "F4.unreadable_qb_slot_count", "F4.unreadable_starting_slots",
    "F4.unreadable_starter_limits", "F4.no_draft_type", "F4.draft_type_absent",
    "F4.draft_type_unrecognised",
)


def passed_f1(reason: str) -> bool:
    """Did this league clear the FORMAT filter, whatever happened afterwards?

    RESTS ON `screen()`'s ORDERING, and says so: F1's clauses run first and the
    function returns on the first failure, so a league whose reason is F2/F5 or a
    non-format F4 necessarily got past F1. That assumption is load-bearing for D7's
    population, so `test_screen_checks_F1_BEFORE_everything_else` asserts it
    directly rather than leaving it to be true by accident.

    A league we could not READ the format of is NOT counted as passing — absent is
    not a pass, the same rule as everywhere else in this file.
    """
    code = reason_code(reason)
    # A LEAGUE WE NEVER FETCHED HAS NOT PASSED F1 — we never read its format at
    # all. Measured 2026-08-11: this returned True for `F4.fetch_failed`, so the
    # nine leagues that 429'd counted as "F1-passing" and D7's format-matched pool
    # came back as 9 leagues carrying 0 of 6,649 picks. The measurement was
    # VACUOUS and reported itself as "no league carries a dated first pick", which
    # reads as a fact about MFL's timestamps.
    #
    # Same absent-is-not-a-pass rule already applied to the format-unreadable
    # codes, missed for the one kind of absence that means we saw nothing at all.
    return not (code.startswith("F1.")
                or code in F1_FORMAT_UNREADABLE
                or code in ("F4.fetch_failed", "F4.parse_failed"))


def reason_code(reason: str) -> str:
    """Strip the ":detail" suffix. `F4.draft_type_unrecognised:SFIRSTFOO` -> the code."""
    return str(reason).split(":", 1)[0]


def is_classified(reason: str) -> bool:
    """Is this reason one we declared? An UNDECLARED reason must not be binned.

    A new adapter reason that nobody added to the lists above would otherwise
    default into "filtered" and be read as evidence about the public pool — B's
    exact finding, recreated one level up in the summariser. So it gets its own
    loud bucket instead of a silent home.
    """
    code = reason_code(reason)
    return code == "ok" or code in FILTERED_REASONS or code in UNOBTAINED_REASONS


def is_unreadable(reason: str) -> bool:
    """Did we FAIL TO READ this league, or did we READ it and reject it?

    THE DISTINCTION THE WHOLE REPORT RESTS ON. A rejection that means "we could
    not parse/fetch this" is evidence about OUR PIPELINE; a rejection that means
    "we read it and it is a 14-team TE-premium auction" is evidence about the
    PUBLIC POOL. Collapsed together, a mass parse failure reads as "no public
    league matches our format" — a conclusion someone might act on.

    Mechanically: everything in F4 (data we could not obtain or could not read)
    plus F5's missing-timestamps, which is the same thing wearing an F5 label.
    F5's `adp_not_strictly_pre_draft` is a real check on two dates we HAVE, so it
    counts as filtered.
    """
    return reason_code(reason) in UNOBTAINED_REASONS


def usable_player_seasons(rows: list) -> tuple[list, int]:
    """F3 — keep player-seasons with a realized weekly series; DROP AND COUNT the rest.

    Absent is not zero. Zero is a real outcome ("he played and scored nothing");
    absent means we do not know. Defaulting absent to zero drags every effect
    toward the null, which is the error the override grader also refuses.
    """
    keep, dropped = [], 0
    for r in rows:
        wk = r.get("weekly")
        if not wk:
            dropped += 1
            continue
        keep.append(r)
    return keep, dropped


def screen_all(leagues: list) -> dict:
    """Apply F1-F5 across a set and REPORT THE ATTRITION, by cause.

    THE HEADLINE SPLIT IS `rejected_filtered` vs `rejected_unreadable`, and it is
    reported before any format conclusion because the two support opposite
    actions. "1,400 rejected, 900 of them format mismatches" says the public pool
    is what it is; "1,400 rejected, 900 of them unreadable" says go fix the
    parser, and looks identical in a report that only counts rejections.
    """
    matched, reasons = [], Counter()
    unreadable = unclassified = 0
    unenforced: list = []
    for lg in leagues:
        # A FILTER THAT CANNOT FIRE IS NOT A FILTER THAT FOUND NOTHING. A source
        # adapter declares any clause it cannot enforce against its export, and
        # that declaration travels to the report — otherwise a clause passing
        # every league is indistinguishable from every league satisfying it.
        for note in ((lg.get("source_meta") or {}).get("unenforced") or []):
            if note not in unenforced:
                unenforced.append(note)
        ok, why = screen(lg)
        reasons[why] += 1
        if ok:
            matched.append(lg)
        elif not is_classified(why):
            unclassified += 1
        elif is_unreadable(why):
            unreadable += 1
    n, rejected = len(matched), len(leagues) - len(matched)
    filtered = rejected - unreadable - unclassified
    verdict = ("sufficient — %d matched league-seasons" % n) if n >= TARGET_MATCHED_LEAGUE_SEASONS \
        else ("INSUFFICIENT — %d of %d matched league-seasons; per the pre-registered stopping "
              "rule this changes NOTHING (no pooling, no shadow-field expansion) rather than "
              "relaxing a filter to reach the bar" % (n, TARGET_MATCHED_LEAGUE_SEASONS))
    if unreadable:
        # Stated on the verdict line itself, not buried in a field, because the
        # failure this guards against is a parse break being NARRATED as format
        # rarity — and a number nobody reads prevents nothing.
        verdict += ("; and %d of %d rejections are UNREADABLE (we could not parse or obtain "
                    "the league) — that is evidence about this pipeline, NOT about how many "
                    "public leagues match our format" % (unreadable, rejected))
    if unenforced:
        verdict += ("; and %d pre-registered clause(s) could NOT be enforced against this "
                    "source and passed every league: %s" % (len(unenforced), "; ".join(unenforced)))
    if unclassified:
        verdict += ("; and %d rejections carry an UNDECLARED reason code — they are binned "
                    "nowhere and the split above is incomplete until they are declared "
                    "in ingest_filters" % unclassified)
    return {
        "filter_version": FILTER_VERSION,
        "examined": len(leagues),
        "matched": n,
        "rejected": rejected,
        "rejected_filtered": filtered,
        "rejected_unreadable": unreadable,
        "rejected_unclassified": unclassified,
        "unreadable_share_of_rejections": (unreadable / rejected) if rejected else 0.0,
        "rejected_by_reason": dict(reasons),
        "unreadable_by_reason": {r: c for r, c in reasons.items() if is_unreadable(r)},
        "unenforced_filters": unenforced,
        "target": TARGET_MATCHED_LEAGUE_SEASONS,
        "meets_target": n >= TARGET_MATCHED_LEAGUE_SEASONS,
        # F7: a short sample REPORTS THE NUMBER AND CHANGES NOTHING. It does not
        # lower the bar to justify the build having happened.
        "verdict": verdict,
    }


# F6 — pooled vs local, fail-closed. Any parameter not named POOLABLE is LOCAL.
POOLABLE = {
    "positional_replacement_curve",
    "age_effect",
    "pace_effect",
    "market_efficiency_by_region",
    "format_value_shape",
}


def may_pool(parameter: str) -> bool:
    """Fail-closed: unclassified parameters are LOCAL, so foreign data cannot leak
    into one nobody thought to classify. Manager tendencies, opponent survival
    conditioning, room behaviour and our keeper structure are local by omission AND
    by intent."""
    return parameter in POOLABLE
