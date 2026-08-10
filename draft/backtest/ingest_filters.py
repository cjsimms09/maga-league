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

Filters v1 — see INGEST-PLAN.md for the reasoning behind each boundary. A change
here is a NEW version there, with v1 retained; never an edit in place.
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


def _starting_skill(slots: dict) -> int:
    return sum(int(slots.get(k) or 0) for k in SKILL_SLOTS)


def screen(league: dict) -> tuple[bool, str]:
    """Does this league-season qualify? Returns (ok, reason).

    Reason is ALWAYS populated — 'ok' on acceptance — so the caller can tally
    attrition by cause without re-deriving why anything was dropped.
    """
    slots = league.get("roster_slots") or {}
    scoring = league.get("scoring") or {}

    # ---- F1 format match ----------------------------------------------------
    teams = league.get("teams")
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
        # them makes the attrition report claim a check it never performed.
        return False, "F4.no_scoring_rules"
    missing = [p for p in SKILL_POSITIONS if by_pos.get(p) is None]
    if missing:
        return False, "F4.no_scoring_rules:" + ",".join(missing)
    vals = {p: float(by_pos[p]) for p in SKILL_POSITIONS}
    outside = [p for p in SKILL_POSITIONS if not (PPR_RANGE[0] <= vals[p] <= PPR_RANGE[1])]
    if outside:
        # TWO DIFFERENT REJECTIONS, kept apart because the attrition report is
        # only useful if its reasons are true. A league that is 1.0 at every
        # position is full PPR — not "TE premium". Split scoring is the NEW
        # exclusion v2 adds; uniform-but-outside is v1's, and still accurate.
        if len(set(vals.values())) == 1:
            return False, "F1.scoring_not_half_ppr"
        return False, "F1.te_premium_or_split_ppr:" + ",".join(
            f"{p}={vals[p]}" for p in outside)
    # Superflex changes QB scarcity so completely it would swamp every positional
    # finding, so it is excluded rather than controlled for. MFL has NO SUPER_FLEX
    # slot — it expresses superflex as a QB limit whose max exceeds its min — so
    # the adapter sets `superflex` explicitly and it is checked here too.
    if int(slots.get("QB") or 0) != QB_SLOTS_REQUIRED or slots.get("SUPER_FLEX") \
            or league.get("superflex"):
        return False, "F1.qb_slots"
    skill = _starting_skill(slots)
    if not (STARTING_SKILL_RANGE[0] <= skill <= STARTING_SKILL_RANGE[1]):
        return False, "F1.starting_skill_slots"
    if (league.get("draft_type") or "").lower() not in DRAFT_TYPE_ALLOWED:
        return False, "F1.draft_type"

    # NOTE: keeper count is deliberately NOT screened. It is recorded as a
    # covariate — our keeper structure is local, and excluding redraft leagues
    # would shrink the sample to chase a similarity we can control for instead.

    # ---- F2 draft validity --------------------------------------------------
    draft = league.get("draft") or {}
    if (draft.get("status") or "") != "complete":
        return False, "F2.draft_incomplete"
    picks = draft.get("picks") or []
    if not picks:
        return False, "F2.no_picks"
    matched = sum(1 for p in picks if p.get("crosswalked"))
    if matched / len(picks) < MIN_CROSSWALK_RATE:
        return False, "F2.crosswalk_below_90pct"
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
    """Apply F1-F5 across a set and REPORT THE ATTRITION, by cause."""
    matched, reasons = [], Counter()
    for lg in leagues:
        ok, why = screen(lg)
        reasons[why] += 1
        if ok:
            matched.append(lg)
    n = len(matched)
    return {
        "filter_version": FILTER_VERSION,
        "examined": len(leagues),
        "matched": n,
        "rejected": len(leagues) - n,
        "rejected_by_reason": dict(reasons),
        "target": TARGET_MATCHED_LEAGUE_SEASONS,
        "meets_target": n >= TARGET_MATCHED_LEAGUE_SEASONS,
        # F7: a short sample REPORTS THE NUMBER AND CHANGES NOTHING. It does not
        # lower the bar to justify the build having happened.
        "verdict": ("sufficient — %d matched league-seasons" % n) if n >= TARGET_MATCHED_LEAGUE_SEASONS
        else ("INSUFFICIENT — %d of %d matched league-seasons; per the pre-registered stopping "
              "rule this changes NOTHING (no pooling, no shadow-field expansion) rather than "
              "relaxing a filter to reach the bar" % (n, TARGET_MATCHED_LEAGUE_SEASONS)),
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
