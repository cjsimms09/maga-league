# GO — what happens when Cory says it

**Cory, 2026-08-30, verbatim:** *"I need you to setup a workflow where I just
have to send go to you and everything that needs to be captured and done gets
done.. figure this out, be the project manager.. make sure everything is
organized between sessions, get everyone caught up and into in season mode."*

This file is that workflow. "go" (or "continue", or silence while a session
holds the relay role) means: run the loop below, top to bottom, acting at each
step, and report ONE compact status at the end. No step asks Cory anything
unless it hits a genuine money/scope decision.

## THE LOOP

**1. `python3 draft/tools/go_status.py`** — the mechanical sweep. Its red list
IS the agenda: every scheduled capture's last run (from the Actions API),
both ledger gates (run locally), and board freshness. A capture missing from
its WATCHED list is invisible to "go" — adding the line is part of shipping
any new capture.

**2. Act on every red, in this order:**
   - **A capture that failed** → read the failing step's log (get_job_logs /
     the API), classify: *broken* (fix or route with the log line quoted) ·
     *world-moved* (the register-385 class — the job asserts a condition the
     season has outgrown; retire or re-scope it) · *refusing correctly*
     (e.g. weekly-proj-snapshot refusing to write an empty week before the
     provider populates — record the re-green condition and move on).
   - **A red gate** → grade, close, park [2027]-with-trigger, or roll WITH a
     reason, per the audit discipline. Bulk-roll only what a published
     proposal + silence-consent covers.
   - **A stale board** → the acceptance-gate blockers are the cause; census
     them from the gate log and keep A's ROUTES thread current.

**3. Sweep the mailboxes:** new `TO: relay` items get dispositions; items
whose DEFAULT date passed get their default executed; `CORY-ASKS` rows in
CORY status get surfaced to him ONLY if truly blocked on his word.

**4. The dated calendar (next 7 days):** chase every owner whose date is
inside the window — a chase is one ROUTES line with ASK/EVIDENCE/REC/DEFAULT.

**5. Report to Cory:** outcome first, at most five bullets, money items
always named. What got fixed, what got routed, what needs him (usually
nothing).

## IN-SEASON MODE — what "caught up" means per lane

Every session's first act in any lane: read `CLAUDE.md`'s era banner, then
this file, then your `TO:` section top-down. You are caught up when:

- **A** — THE EXECUTIVE (Cory's 08-31 ruling, OPERATING-MODEL Rule 3b): outputs
  are RULINGS, SEND-BACKS, AUDITS, MERGES — never first drafts. Caught up =
  every decision-shaped item in A's inbox answered in a line; the gate
  publishes because A ruled and merged, not because A burned hours.
- **B** — the owner site's week-1 surfaces (lineup, matchup, wire, The Book)
  survive a Sunday: register 324's partial-score family closed or ruled.
- **C** — every capture in go_status's WATCHED list green or its refusal
  explained in the run log; data-readiness table current.
- **D** — weekly arms preregistered before folds are read; the props
  hydrator's folds graded; three-part parts on every open row before 09-10.
- **E** — red team pointed at what owners SEE on a live Sunday, not at the
  draft engine.
- **relay** — this loop run recently enough that go_status is green or its
  reds are all routed with owners.

## STANDING DATES THE LOOP CHASES

week 1 kickoff **09-10** · Bovada free-props auto-grade **09-10** (P299) ·
capture-content hand-checks **09-13/09-15** · first blend grade vs Cory's
edge bar **09-15** · Odds API renew-or-free decision **09-14** (register
421) · keeper grader + instruction sweep **09-20** (registers 289/290).

*Filed 2026-08-31 by the relay on Cory's order. Amend through a commit that
changes behavior, never only in chat.*
