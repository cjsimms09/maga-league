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
6. **DELIVERABLE** (resent 2026-08-08, complete): before/after perf numbers,
   the **lines-of-code delta**, the **redundancy kill-list**, and **one honesty
   line — the three simplifications you were most tempted to make but didn't,
   and why.**

## Phase-1 baseline (measured 2026-08-08, sandbox)
See STATUS.md "PERF BASELINE" entry — asset inventory + script counts recorded;
Lighthouse/waterfall runs need the deployed site and land with B-5's live run.

## 📐 THE COMPLEXITY BUDGET — checked in the Sunday audit (Cory, 2026-08-08)

Four numbers, tracked weekly. Any growth without a cited reason raises an alert.

| # | metric | why |
|---|---|---|
| 1 | war-room bundle size | performance |
| 2 | artifact size (`draft_data.json`) | performance — the dominant transfer |
| 3 | page load time, phone viewport | performance |
| 4 | **independent derivations of shared state** (seat · pick position · roster · keepers · rounds · board version) | **the one that predicts bugs** |

**The fourth is the point.** The first three are ordinary performance hygiene.
Number four is the leading indicator: **every severity-1 this project has had
came from a shared fact derived in more than one place** — rounds, seat, keeper
seat, pick position, opponent identity. None was hard to fix; each was invisible
because the second derivation looked reasonable on its own.

**Enforced, not merely tracked:** `draft/tests/test_shared_state_audit.py` fails
the build when a canonical fact gains a derivation without a cited exemption,
and reports the counts for the Sunday audit. Budgets today: rounds **0**,
current_pick **2**, seat **10** (all writes or the single derivation, each
individually cited).
