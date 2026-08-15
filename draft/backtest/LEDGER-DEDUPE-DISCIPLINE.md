<!-- TERRITORY: A -->
# LEDGER DEDUPE & RE-RUN DISCIPLINE — one page, so the next loop doesn't invent a fifth (2026-08-15)

The loop review found FOUR re-run protection patterns across the emit/resolve
rail, each correct in isolation, none documented, and every new cron so far
has re-derived its own. This page is the discipline; deviations should cite a
reason here, not reinvent.

## The invariant every pattern serves

`predledger` is APPEND-ONLY and the graders join `forecast` ↔
`forecast_resolution` by `forecast_key`, keeping the EARLIEST row per key
(`pair()`; earliest-commitment for decisions). So duplicates are never
*wrong* — they are bloat and noise. The question each pattern answers is only:
**how much duplicate mass does a re-run append before the grader's join
absorbs it?**

## The four shipped patterns, by writer

| writer | protection | class |
|---|---|---|
| claims-cron weekly claims (emit) | none at emission; deterministic keys + grader earliest-per-key | **backstop-only** |
| analyzer-cron checkpoints (emit) | none at emission; deterministic keys + FIXED seed (a re-run appends an identical row) | **backstop-only** |
| player-projection-cron (emit) | `playerproj:emitted:<season>:<week>` marker doc + deterministic keys + backstop | **marker + backstop** |
| claims-cron player rows (resolve) | `playerproj:resolved:<season>:<week-1>` marker doc + backstop | **marker + backstop** |
| claims-cron decisions (resolve) | resolved-set recomputed from the ledger each run (`unresolvedDecisionEntries`) | **ledger-derived dedupe** |
| analyzer-cron resolution pass | ledger-derived (`pendingAnalyzerForecasts`, forecast_key join) + own-emissions-excluded | **ledger-derived dedupe** |

## The discipline (what a NEW emitter/resolver should do)

1. **Deterministic keys always.** A key that embeds season/week/subject/arm is
   the contract that makes every other layer work. Non-negotiable.
2. **Small batches (≤ ~40 rows/week): backstop-only is fine.** Weekly claims
   and analyzer checkpoints append ≤ ~15 rows; a duplicate re-run costs
   nothing the grader can't absorb. Do not add markers where the failure they
   prevent is invisible.
3. **Large batches (hundreds of rows): marker doc + backstop.** The player
   loop appends ~300 rows a side; an unmarked double-run costs 300 blobs and a
   slower Tuesday read forever after (the ledger is append-only — bloat is
   permanent). Marker key shape: `<loop>:<stage>:<season>:<week>`.
4. **Resolutions should prefer ledger-derived dedupe over markers** where the
   read is already in hand (the decisions and analyzer passes): the ledger
   itself is the truth about what is resolved; a marker can lie after a
   partial failure (marker written, append crashed — the player-resolution
   marker is written AFTER the appendBatch for exactly this reason; keep that
   order).
5. **A job never settles or grades a row it wrote in the same run.** Emit /
   resolve / grade live in separate scheduled jobs (Thu / Sun / Tue), and the
   analyzer's resolution pass excludes its own run's emissions by key. This is
   the one rule with no size exemption.

## Unification proposal (design, NOT applied)

The two marker users could share one helper (`markerGuard(store, key, fn)`
in predledger or a sibling module) and the two ledger-derived resolvers
already share the forecast_key join idiom via their pure cores. The gain is
small (two call sites); the cost of NOT unifying is documentation drift —
which this page now covers. Recommendation: adopt the helper the NEXT time a
marker user is added; do not churn the two existing call sites before the
season starts.
