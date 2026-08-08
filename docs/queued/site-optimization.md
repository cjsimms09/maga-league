# SITE OPTIMIZATION & SIMPLIFICATION PASS — two phases, placement deliberate

Filed 2026-08-08 (Cory). Phase 1 rides with the already-specced **B-5 perf
budget** pre-draft; Phase 2 is the real pass, **post-draft (Aug 23+), after the
freeze lifts.**

## PHASE 1 — pre-draft (zero structural change)

1. **MEASURE first** — optimizing unmeasured code is guessing:
   - Lighthouse-class audit on **war room + home + dashboard**, desktop AND
     phone viewports
   - function cold-start timings
   - bundle-size inventory
   - API-call waterfall on page load
   - **numbers to STATUS as the baseline.**
2. **ZERO-RISK wins only:** asset compression, cache headers, deferring
   non-critical script loads, image sizing — **nothing that touches logic.**

## PHASE 2 — post-draft, Aug 23+ (the real pass)

3. **REDUNDANCY HUNT:**
   - duplicate computations of the same derived fact (the spine audit's cousin,
     applied to code — anything computed twice gets ONE home)
   - repeated API fetches that should share a cache
   - copy-pasted logic blocks that should be one function
   - dead code and vestigial flags from superseded specs — **grep the
     graveyard:** the retired keeper badges, pre-correction waiver logic, the
     old payout assumptions.
4. **LOGIC SIMPLIFICATION:**
   - collapse special-case branches the **authority doctrine** and single-path
     rules made unnecessary
   - consolidate config sprawl
   - flatten any module whose complexity outlived its reason
   - **each simplification cites WHY the complexity existed and why it's now
     safe to remove** — constants carry reasoning; so do deletions.
5. **THE BEHAVIOR LOCK — non-negotiable:**
   - BEFORE the pass: capture **golden-master snapshots** — board output for a
     fixture state, all money tables, brief output, key page renders.
   - Every refactor commit must show **ALL suites green** (robot 78+, engine,
     py) AND **golden-masters byte-identical**. A refactor that changes any
     output is a bug by definition — **reverted on sight.**
   - Small commits, one concern each, so any regression bisects in minutes.
6. **⚠️ TRUNCATED IN TRANSMISSION** — the directive ended mid-item at "(6) D".
   Captured through item 5 verbatim; **resend item 6's tail** and it lands
   here. (Filed per the established truncation protocol — best-effort capture,
   flagged for resend, never silently dropped.)

## Phase-1 baseline (measured 2026-08-08, sandbox)
See STATUS.md "PERF BASELINE" entry — asset inventory + script counts recorded;
Lighthouse/waterfall runs need the deployed site and land with B-5's live run.
