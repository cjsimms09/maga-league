# DRAFT NIGHT RUNBOOK — Saturday 2026-08-22 (one page, print it)

## FRIDAY EVENING, AFTER THE 6:00 PM KEEPER LOCK — TWO ITEMS, BOTH A's

**Added 2026-08-18. These were dated, owned and tracked in
`draft/data/commitments.json`, and this file — the one Cory executes — did not
mention either. Found by asking whether every CI guard's failure path is
reachable; `commitments_check --today=2026-08-22` goes RED with both of these
OVERDUE.**

Both are blocked until the slate confirms, so they CANNOT be done earlier, and
both are on the critical path to a board that reflects the real draft:

- **`schedule-rerun-on-slate`** — *"every roster-construction result produced
  this week is re-run against the REAL pick schedule once the slate confirms."*
  There is no `draft/data/pick_schedule.json`; **two mutually exclusive schedule
  assumptions are in use** and this is what reconciles them.
- **`slate-exposure-rechecked`** — the withheld-slate exposure re-checked against
  the REAL slate rather than the predicted one. Today the board stands on
  **4/10 teams designated, with 8 keepers across 3 teams deliberately withheld**,
  so every exposure number is a prediction until this runs.

**⚠️ IF NEITHER IS DONE, CI IS RED ON DRAFT MORNING AND THE REASON IS THESE TWO
— not a broken build.** That is worth knowing before you see it at 08:00 on
Saturday and start diagnosing. `node draft/tools/commitments_check.js` names them
in one line.

**Neither blocks the draft itself.** The war room boots from the live board
either way; what they change is whether this week's roster-construction work and
the exposure numbers describe the real slate or the predicted one.

## Before the draft — ⚠️ SATURDAY MORNING, **AFTER 03:00 CDT**, NOT FRIDAY NIGHT

> **THE BOARD REBUILDS ITSELF OVERNIGHT AND WILL SUPERSEDE A FRIDAY FREEZE.**
> `draft-data.yml` runs on `cron: '0 8 * * *'` — **08:00 UTC = 03:00 CDT, every
> night, including draft morning** — and it commits `public/draft_data.json`.
> `freeze_pre_draft.py` reads that exact file and records its `built_at` as
> `source_artifact_built_at`.
>
> So a freeze taken Friday night is stale by breakfast, and step 1's own rule —
> *"Freeze THAT board, nothing older"* — is violated by a scheduled job rather
> than by anyone's mistake. **Do steps 1–2 on Saturday, after 03:00 CDT.**
> (Or dispatch `draft-data.yml` by hand first, and freeze what it produces.)
1. **Rebuild the board**: Actions → `draft-data.yml` → Run workflow. Wait for
   green — then verify THE BOARD ITSELF, not just CI: open `/admin/projections`,
   confirm `built_at` is today, provenance says own_v6, and the draft sheet
   shows no stale-board warning. Freeze THAT board (step 2), nothing older.
2. **Freeze**: confirm `draft/freeze_pre_draft.py` has run against THAT board
   and note the freeze SHA (it prints; also in the freeze artifact).

   > ✅ **THIS NOTE'S OWN ESCAPE HATCH HAS FIRED — A SHIPPED THE FIX, SO EXPECT
   > `CONFIRMED`, NOT `PROVISIONAL`. Rewritten 2026-08-19 (A).**
   >
   > The paragraph that stood here told you to expect **`PROVISIONAL … the keeper
   > lock has not passed`**, to know that sentence was false, and to take the
   > freeze anyway. It ended: *"If A ships it before Saturday, the freeze can
   > stamp `CONFIRMED` and this note stops applying — check which world you are
   > in by reading the printed status, not by assuming."*
   >
   > **A shipped it (register 5l, 08-18). You are in the second world, and being
   > told so here beats deducing it at 3am.**
   >
   > `build.py._keeper_lock_passed()` now derives the flag from **two independent
   > paths, either sufficient**: keeper PLACEMENTS existing on the draft, or the
   > configured deadline having passed — read from `league_config.json`, where
   > your ruling lives verbatim (*"Keepers will be set by 08/21 at 6pm"*). It is
   > wired at **all three** `assess_slate()` call sites, guarded by a test with a
   > proven fail arm.
   >
   > **VERIFIED BY DRIVING THE CLOCK rather than waiting for Friday** — the whole
   > point, since the correct behaviour otherwise first appears after the last
   > useful moment to learn it is wrong:
   >
   > | moment | `keeper_lock_passed` |
   > |---|---|
   > | Fri 08-21 17:59 CDT | `False` |
   > | **Fri 08-21 18:00 CDT** | **`True`** |
   > | **Sat 08-22 09:00 CDT (draft morning)** | **`True`** |
   >
   > **SO: on Saturday morning the freeze should print `CONFIRMED`. If it prints
   > `PROVISIONAL`, that is now REAL INFORMATION and not a known bug** — it means
   > the board you froze was built BEFORE Friday 6pm, i.e. step 1's rebuild did
   > not actually happen or did not commit. **Rebuild and re-freeze.** That is the
   > opposite of the old instruction, which was "do not re-run it hoping for a
   > different word", and following the old text would have hidden a real failure.
   >
   > **AND THE ALARM IS ALIVE AGAIN TOO.** `standing_check.py:531` reads
   > `keeper_slate.keeper_lock_passed` off the board and escalates on *"THE KEEPER
   > LOCK HAS PASSED AND THE FREEZE IS STILL {status}"*. It was gated on the dead
   > flag and could never fire; it can now. **The board also publishes
   > `keeper_lock_date` (2026-08-21) with your ruling verbatim beside it** —
   > register E25, so no reader has to hardcode the date again.
2b. **Re-check, and if needed regenerate, the two board-derived artifacts** (register 86):
   `variance_inputs_2026.json` and `playoff_sos_2026.json` are derived from the
   board and are NOT rebuilt by `draft-data.yml`. They have been hand-regenerated
   twice already in one day.

   > ⚠️ **CORRECTED WITHIN THE HOUR OF WRITING IT, BY TESTING MY OWN
   > INSTRUCTION.** This step first said step 1's rebuild *"silently invalidates
   > both"*. I then triggered a rebuild and **both drift tests PASSED** — because
   > a same-day rebuild off unchanged upstream inputs moves the board's
   > `built_at` without moving the values these two artifacts derive from.
   > **"Always goes stale" was wrong; "goes stale whenever the board's values
   > actually move" is right**, and Saturday's rebuild pulls fresh ADP and
   > projections, so it very likely WILL move them. **Do not skip this step on
   > the strength of one quiet rebuild — but do let the tests decide rather than
   > regenerating on faith.**

   > **Why this is a runbook step and not a code fix:** wiring the regeneration
   > into `draft-data.yml` is the real answer and it is deliberately deferred to
   > **after** the draft (register 86, recheck 08-26) — a workflow change on
   > draft morning is exactly the kind of thing that breaks the morning. **The
   > recurrence rate is once per rebuild and rebuilds are nightly, so this DOES
   > reach Saturday; the mitigation is doing it by hand, here, after step 1.**
   >
   > Run them after the rebuild commits, then confirm the board-drift tests pass
   > (`test_playoff_sos.py`, `test_variance_inputs.py`). If either is red, it is
   > telling you these were not regenerated against the board you just built.

3. **Netlify check**: dashboard → Usage → build minutes comfortably under cap.
   NO deploys Aug 20–22 except draft-critical fixes.
4. **Ledger check (5 min, Cory's browser)**: logged in as commissioner, visit
   `/admin/api/ledger/predict?season=2026`, save the JSON to a file, run
   `node draft/tools/ledger_corruption_check.js <file>`. Zero flags = clean;
   flags = list them, don't delete anything.
5. **Password census**: the commissioner surface lists any account still on
   the starter password — chase stragglers before draft chatter starts.

## The moment the Sleeper draft room opens
6. Get the **draft_id** from the Sleeper draft room URL.
7. Actions → `draft-night-sync.yml` → Run workflow → paste draft_id →
   dispatch. (Fallback if Actions is down:
   `python3 draft/log_draft_picks.py --sync <draft_id>` in a loop, any laptop.)
8. **Verify pick 1 — ON GITHUB, not in the workflow log**: captured, committed,
   and PUSHED are three different states; only the last one survives the
   runner. Within ~2 minutes of the first pick, refresh
   `draft/data/draft_pick_log_2026.jsonl` in the GitHub web UI and see the row. If not, check the workflow log — it retries and rebases on
   its own; a loud failure means a second writer touched the pick log.
9. **Nobody else pushes to the repo during the draft.** The pick logger is
   the only writer.

   > ⚠️ **THIS IS AN INSTRUCTION TO PEOPLE, AND SIX SCHEDULED JOBS DO NOT READ
   > IT.** These push on any given day, draft day included:
   > `draft-data.yml` 03:00 CDT · `kalshi-capture.yml` 06:00 ·
   > `external-adp-capture.yml` 06:20 · `standing-check.yml` 07:00 ·
   > `market-capture.yml` 08:00 · `inbox-health.yml` 08:17.
   >
   > All six are **morning** CDT. ~~but **no start time is recorded anywhere**
   > (not in `league_config.json`, not here, not in the brief), so that is an
   > assumption and not a check.~~ **SUPERSEDED 2026-08-18 — CORY RULED IT.**
   > Verbatim: *"Yes it's 6pm"*. `league_config.json` now carries a `draft`
   > block — **start 2026-08-22, 6:00 PM CDT** — with his words in it, kept
   > through the nightly rebuild by `preserve_local_rulings` and guarded by two
   > tests in `test_config_local_rulings_survive.py`.
   >
   > **SO THE OVERLAP QUESTION IS NOW ANSWERED RATHER THAN ASSUMED: the last of
   > the six fires 08:17 CDT, the draft starts 18:00 CDT — roughly ten hours of
   > clearance. Leave all six alone.** The old instruction ("if the draft
   > starts before ~09:00 CDT, disable these") is kept struck rather than
   > deleted because it is the right rule for any future year; it simply does
   > not fire this one.
   >
   > ⚠️ **The MEMBER DASHBOARD may still show the 6:00 PM as a FALLBACK rather
   > than a ruling** — it reads `world.config.draft_time` from the runtime
   > store, which is set at `/admin` and is not in git (registers 5m, ROUTES
   > `TO: A` item 000). Same number on screen either way; nothing here depends
   > on it.

## During the draft
10. War room on desktop; draft sheet printed as the dead-battery fallback.
11. Playoff-slate one-pager (`draft/audit/playoff_sos_2026.md`) at hand for
    tie-breaks. Tie-break facts also print in the war room on toss-ups.

## After the last pick
12. Confirm the log says N of N picks, freeze SHA matching step 2.
13. Let the workflow finish/commit; that JSONL + freeze are the season's
    immutable draft artifacts — never rebuilt from memory.

## If things break (contingencies)
- **Board rebuild fails**: the committed board + its freeze remain valid — draft
  on them; the sheet's staleness warning tells you the age you're accepting.
- **GitHub Actions down**: run the manual logger loop (step 7 fallback) from any
  laptop; commit + push by hand afterward.
- **Sleeper API down mid-draft**: keep drafting in the app; the logger backfills
  when Sleeper recovers — picks are Sleeper's record, the log is our copy.
- **End of draft**: before closing the laptop, confirm the LAST pick's commit is
  visible on GitHub (same check as step 8). The workflow now refuses to declare
  completion with unpushed commits, but verify with your own eyes anyway.

## Chaos-drill addendum (2026-08-16 — two operator checks changed)
- **A green sync run does NOT mean the draft was captured.** The workflow also
  ends green when `max_minutes` runs out (only a `::warning::` line differs).
  Judge completion by the LAST LOG LINE — it must say
  `draft complete — every pick logged, stopping.` — never by the green check.
- **Never re-freeze after the draft starts.** The logger now REFUSES to append
  the moment the freeze on disk stops matching the log's rows ("freeze changed
  mid-draft", both shas named). If the sync log starts printing that, someone
  rebuilt/re-froze the board mid-draft: restore the frozen file from git and
  the capture resumes by itself on the next poll.

---

## ✅ VERIFIED END-TO-END, 2026-08-18 (relay)

Every file, CLI flag, route, timing and contingency claim on this page was
checked against the code. **One defect found — the freeze timing above, register
5i — and everything else holds.**

- **Files/flags/routes:** `draft-data.yml`, `draft-night-sync.yml`,
  `freeze_pre_draft.py`, `ledger_corruption_check.js`, `log_draft_picks.py`
  (`--sync`, `--status`), `playoff_sos_2026.md`, the freeze, and both admin
  routes — all present. `draft_pick_log_2026.jsonl` does **not** exist yet and
  that is correct: `LOG.open("a")` creates it on the first pick.
- **Step 8 / addendum — the completion string is real and STRONGER than stated.**
  `draft complete — every pick logged, stopping.` prints only *after* the
  durability gate: if `git rev-list --count origin/…..HEAD` is non-zero the step
  re-pushes, and a failed final push `exit 1`s. **So that line cannot appear
  while the pick log is unpushed.**
- **Addendum — "a green run does not mean captured" is accurate.** The
  `max_minutes` path prints `::warning::` and falls through to a green step.
  Judge by the last log line, exactly as written.
- **Addendum — the freeze-swap guard is real.** `log_draft_picks.py` refuses at
  the moment of append, naming both shas: *"the freeze on disk (sha X…) is NOT
  the freeze this log's N existing rows are joined to (Y…)."*
- **Contingency — the staleness warning exists** with a real age and thresholds
  (amber ~6h, blocked ~18h).

- **Step 10 — the dead-battery fallback is sound.** `/admin/draft-sheet` reads
  the SAME `public/draft_data.json` as the war room, so the printed sheet cannot
  disagree with the screen. Simulated against the live board: **0 of 3 keepers
  leak into "best available"** (Chase, Henry and Walker are absent from
  `players[]` entirely, so the route's `kept` filter is redundant belt-and-braces
  rather than load-bearing), and the **best-available lists are VORP-sorted and
  monotone** — the documented past bug, where they were ordered by ADP and
  printed a below-replacement TE as "best available" under a value heading,
  stays fixed.

*Two of these read as MISSING on a first grep — the freeze message is split
across source lines, and the durability gate says "NOT pushed" rather than
"unpushed". Both were present. Grep the behaviour, not the sentence.*
