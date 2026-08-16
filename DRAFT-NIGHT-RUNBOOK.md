# DRAFT NIGHT RUNBOOK — Saturday 2026-08-22 (one page, print it)

## Before the draft (Friday night / Saturday morning)
1. **Rebuild the board**: Actions → `draft-data.yml` → Run workflow. Wait for
   green. The draft sheet warns if the board is >6h old — heed it.
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
8. **Verify pick 1**: within ~2 minutes of the first pick, check that
   `draft/data/draft_pick_log_2026.jsonl` gained a row on GitHub and the
   commit pushed. If not, check the workflow log — it retries and rebases on
   its own; a loud failure means a second writer touched the pick log.
9. **Nobody else pushes to the repo during the draft.** The pick logger is
   the only writer.

## During the draft
10. War room on desktop; draft sheet printed as the dead-battery fallback.
11. Playoff-slate one-pager (`draft/audit/playoff_sos_2026.md`) at hand for
    tie-breaks. Tie-break facts also print in the war room on toss-ups.

## After the last pick
12. Confirm the log says N of N picks, freeze SHA matching step 2.
13. Let the workflow finish/commit; that JSONL + freeze are the season's
    immutable draft artifacts — never rebuilt from memory.
