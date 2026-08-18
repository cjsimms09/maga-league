# DRAFT NIGHT RUNBOOK — Saturday 2026-08-22 (one page, print it)

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
   > All six are **morning** CDT, so an evening draft does not overlap them —
   > but **no start time is recorded anywhere** (not in `league_config.json`,
   > not here, not in the brief), so that is an assumption and not a check. If
   > the draft starts before ~09:00 CDT, disable these for the day.

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
