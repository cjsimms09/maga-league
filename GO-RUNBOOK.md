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

## THE CADENCE — the organism's week (Cory, 2026-08-31: "almost as its own
organism, following the rules, not lying to itself, but constantly learning
about fantasy, real football, this league and communicating with each
session, looking for edge")

Each firing is a scheduled session that reads this file first, does ONE
job, and reports. The rules that keep the organism honest are not optional
organs: the constitution bounds what installs itself, the controls culture
bounds what counts as a finding, the FALSE-successor rule bounds what dying
ideas leave behind, and NOTHING here spends money or changes weights — those
walls are load-bearing.

| firing | when (UTC) | the one job |
|---|---|---|
| **Daily GO** | 11:00 daily | this file's loop: captures, gates, sweep, defaults |
| **Tuesday grader's witness** | 13:00 Tue | verify grade-cron graded every arm incl. props; read the scoreboard; file/refresh blend hypotheses from the week's residuals; chase QUICK-KILL |
| **Wednesday audit** | 12:00 Wed | the register/ledger audit + per-lane burn-rate report |
| **Thursday pre-lock** | 19:00 Thu | verify the props fetch landed + the TNF alert fired; anything owner-facing broken before the week starts is the day's whole job |
| **Sunday pre-slate** | 13:30 Sun | verify the Sunday alert + lineup capture fired with real content; Cory's lineup page renders sane |
| **Weekly explorer** | 15:00 Mon | the curiosity organ: read the outside world (public analysis, market moves, our own residuals) and file at MOST three new preregistered hypotheses — file to the ledger ONLY, never touch a model; three good questions beat ten weak ones |

**📬 WHERE A FIRING'S WORK LANDS — read this before you push (relay, 2026-09-04).**
Each scheduled session is created with its OWN outcome branch (`claude/lucid-hawking-*`,
`claude/happy-faraday-*`, `claude/beautiful-pascal-*`, …) and **nobody reads those
branches**: the 09-02 Wednesday audit report, the 09-02/09-03 GO-sweep closes and a
fix for a crashing props writer all sat on them until the relay cherry-picked them a
day or two later. The rule that already governs every lane applies to a firing too —
**mailbox files (`ROUTES.md`, `CORY-ASKS.md`, `DEFECT-REGISTER.md`, `OPEN-QUESTIONS.md`,
`PREDICTION-LEDGER.md`, `A-DECISIONS.md`) and every report under `draft/audit/` push
STRAIGHT TO `main` (CLAUDE.md Rule 1b)**, with the rebase-retry loop and never a bare push:

```
for i in 1 2 3 4 5; do git fetch -q origin main; git rebase -q origin/main || { echo REBASE-CONFLICT; break; }
  if git push -q origin HEAD:main; then echo PUSHED; break; fi; sleep $((2**i)); done
git show origin/main:<file> | grep -c '<something you wrote>'     # verify before you report it done
```

A small, tested fix to a TOOL that is red on the sweep (the props writer's import,
09-03) may go to main the same way when it carries its test; anything larger — views,
engine, workflows — stays on your branch with a ROUTES row to A naming the branch and
sha. A report that only reached your branch is a finding nobody acted on — the relay's
own failure class.

**AND BEFORE YOU COMMIT: `python3 draft/tools/dirty_artifact_check.py`.** A full
`pytest draft/tests` run rewrites five committed artifacts, two of which the board
reads (register 489). They get swept into whatever commit comes next — that happened
three times in one evening on 09-05, and each time the only thing that caught it was
`git rebase` refusing to run with unstaged changes. The check names which are dirty
and prints the `git checkout --` that restores them.

**⏱ Two clock facts for the firings.** (1) The Tuesday witness fires 13:00Z; the
repo-side grade (`weekly-grade.yml`) runs 12:30Z, after Netlify's grade-cron at 12:00Z,
so the witness sees a finished grade — if it does not, that is the finding. (2) Week 1
opens WEDNESDAY night (2026-09-10T00:20Z); the Thursday 19:00Z firing is after that
kickoff, so a one-shot pre-lock fires 2026-09-09T21:00Z. The UTC crons do not move when
US clocks fall back on 11-01; every local time in this table is one hour later from then.

The explorer's discipline is the whole point: an organism that learns is one
that files falsifiable claims and lets the gates kill them, not one that
edits itself on enthusiasm. (The Learning Engine's residual-driven generator
— ratified item ② — joins this cadence when the 09-15 grades give it
residuals to chew.)

## STANDING DATES THE LOOP CHASES

week 1 kickoff **09-10** · Bovada free-props auto-grade **09-10** (P299) ·
capture-content hand-checks **09-13/09-15** · first blend grade vs Cory's
edge bar **09-15** · free props path confirmed on the 09-10 Thursday capture (P299; **no paid props — Cory's 09-01 standing ruling, CLAUDE.md**) · keeper grader + instruction sweep **09-20** (registers 289/290).

*Filed 2026-08-31 by the relay on Cory's order. Amend through a commit that
changes behavior, never only in chat.*


**🏈 FOOTBALL KNOWLEDGE LEDGER (added 09-02):** the Monday explorer's ≤3 arms now come from `FUTURE-PROOF-2027.md` §2's queue (E owns the queue, D measures, relay chases); process grade P362 on 12-15.

**🔎 MONTHLY FREE-SOURCE DISCOVERY (added 09-02, FUTURE-PROOF-2027 §6):** first Monday of each month the explorer spends one slot probing new free candidates for one data class, with controls (`free_props_census.py` is the template); finds enter `draft/data/source_registry.json` as fallbacks first. E picks the class; relay covers props/odds by default.
