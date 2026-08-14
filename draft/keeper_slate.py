#!/usr/bin/env python3
"""KEEPER-SLATE RAILS — the board must never present a wrong/incomplete slate as CONFIRMED.

The failure this prevents (Cory, 48-hour Aug-20 window, unrecoverable): the confirmed
slate lands, something regenerates against a wrong or incomplete picture, and Cory drafts
off a board that looks completely normal and is wrong. Everything downstream — replacement
level, VORP, the dead zone, the keeper-need mask, survival — is conditional on the slate.

THREE RAILS, all here as a pure core (assess_slate); build.py stamps the result on the
artifact and the live-site check alarms on it.

  1. EMPTY-IS-NOT-NONE. Sleeper is truth. A roster with no keeper designation is UNKNOWN
     (not "keeps nobody") until the commissioner PLACES keepers on the draft (our format:
     keepers occupy forfeited rounds, placed by the commissioner). Undesignated teams
     count against completeness; they are modeled by prediction, never as zero.
  2. VERIFY-BEFORE-REGENERATE. `confirmed` is earned, not assumed: it requires the draft's
     keeper PLACEMENTS (picks flagged is_keeper) to exist for the expected teams AND to
     match their designations. Absent placements -> status `predicted`; partial -> `partial`.
     Downstream may only treat the slate as fact when status == 'confirmed'.
  3. PLACEMENT ALARM. Where a placement disagrees with a designation (someone designated
     X on our site / Sleeper roster but a different player was placed), that is a
     `mismatch` — surfaced loudly, never silently reconciled to our own copy.

Sleeper wins in every disagreement. Pure + unit-tested (test_keeper_slate.py); the egress
that fetches rosters + draft picks lives in build.py (CI).
"""
from __future__ import annotations


def assess_slate(expected_teams, designations, placements=None, keeper_lock_passed=False):
    """expected_teams: int (rosters in the league).
    designations: {team_id: [player_id,...]} from Sleeper roster.keepers (INTENTIONS).
      A team ABSENT from this dict is undesignated/unknown — NOT a team keeping zero.
    placements: {team_id: [player_id,...]} from the draft's placed keeper picks
      (is_keeper), or None if the commissioner has not placed keepers yet.
    keeper_lock_passed: has the lock date passed (used only to sharpen the reason text).

    Returns a status dict the board stamps and the site-check alarms on.
    """
    designations = {str(k): sorted(str(x) for x in (v or [])) for k, v in (designations or {}).items()}
    placed = placements is not None
    placements = {str(k): sorted(str(x) for x in (v or [])) for k, v in (placements or {}).items()} if placed else {}

    teams_designated = len(designations)
    teams_placed = len(placements)
    # undesignated = expected minus those with a designation. UNKNOWN, not zero.
    undesignated = max(0, expected_teams - teams_designated)

    # placement alarm: a team whose PLACED keepers differ from its DESIGNATION. Sleeper's
    # placement is truth; a mismatch means an intention was overridden — surface it.
    mismatches = []
    if placed:
        for team, des in designations.items():
            pl = placements.get(team)
            if pl is not None and pl != des:
                mismatches.append({"team": team, "designated": des, "placed": pl})

    # status
    if not placed:
        status = "predicted"
        confirmed = False
        # ⚠️ THIS WAS A STATIC STRING ASSERTING PIPELINE BEHAVIOUR, AND IT WAS
        # FALSE — twice over (2026-08-14).
        #
        # It read: "the board is built on PREDICTED opponent keepers; undesignated
        # teams are modeled, not assumed empty". Measured by injecting the
        # predicted slate as live designations and reading `kept_player_ids`:
        #
        #   injected            6 designating teams / 17 keepers
        #   keepers.json        holds all 6 / 17          (ingestion works)
        #   slate 'predicted'   kept_player_ids = 3       (MINE ONLY)
        #   slate 'confirmed'   kept_player_ids = 17
        #
        # The board is not built on predicted opponent keepers. It is built on NO
        # opponent keepers — `_keeper_map_for_board` withholds every designation
        # that is not mine until the slate confirms, which is Cory's own ruling of
        # 2026-08-11 and correct. The string described a mechanism that does not
        # exist, in the field a reader consults to find out what the board did.
        #
        # DERIVED FROM THE COUNTS, so it cannot describe a pipeline it is not
        # part of. What this function knows is designations and placements; what
        # the BOARD does with them is build.py's to stamp, and it does.
        reason = (
            "%d/%d team(s) have designated on Sleeper and NO keeper placements "
            "exist on the draft yet, so nothing here is confirmed. %d team(s) "
            "have not designated — unknown, not assumed empty."
            % (teams_designated, expected_teams, undesignated))
    elif teams_placed < expected_teams:
        status = "partial"
        confirmed = False
        reason = (f"only {teams_placed}/{expected_teams} teams have keepers placed on the "
                  "draft — incomplete; the rest are still predicted, not confirmed")
    elif mismatches:
        status = "mismatch"
        confirmed = False
        reason = (f"{len(mismatches)} team(s) placed keepers that differ from their "
                  "designation — Sleeper placement wins; reconcile before trusting the board")
    else:
        status = "confirmed"
        confirmed = True
        reason = "all teams' keepers placed on the draft and consistent with designations"

    return {
        "status": status,
        "confirmed": confirmed,
        "teams_expected": expected_teams,
        "teams_designated": teams_designated,
        "teams_placed": teams_placed if placed else None,
        "undesignated_teams": undesignated,
        "placements_present": placed,
        "mismatches": mismatches,
        "keeper_lock_passed": bool(keeper_lock_passed),
        "reason": reason,
        # the one line the board and the alarm both key on:
        "safe_to_treat_as_truth": confirmed,
    }


def draft_week_alarm(slate, days_to_draft):
    """The alarm the live-site check raises: as the draft approaches, an unconfirmed slate
    is a real hazard (drafting off predictions that may be wrong). Returns (level, message).
    """
    st = slate.get("status")
    if slate.get("mismatches"):
        return "alarm", (f"keeper slate MISMATCH: {len(slate['mismatches'])} placed keeper(s) "
                         "differ from designation — the board may be built on the wrong slate")
    if st == "confirmed":
        return "ok", "keeper slate confirmed against Sleeper placements"
    if days_to_draft is not None and days_to_draft <= 3:
        return "alarm", (f"draft in {days_to_draft}d and keeper slate is '{st}' "
                         f"({slate.get('reason')}) — the board is NOT built on the confirmed slate")
    if days_to_draft is not None and days_to_draft <= 7:
        return "warn", (f"draft in {days_to_draft}d and keeper slate is '{st}' — expect the "
                        "confirmed slate at keeper lock; the board will re-derive when it lands")
    return "note", f"keeper slate '{st}' (expected pre-lock): {slate.get('reason')}"
