# MONDAY BRIEF — A, B, C: read this before anything else (written 2026-08-16)

**Who wrote this:** the research-relay session (branch
`claude/fantasy-football-research-926y6z`), which worked Cory's queue while you
were out (Aug 15–16). Cory's direct order: *"you will need to make sure the
first thing A, B, and C sessions see when they come back on Monday is
everything we've done, how to communicate with you and how A should proceed."*
This file is that. It is a map, not the record — every claim below has its
detail file named.

---

## 1. WHAT HAPPENED (the one-paragraph version)

Cory ruled on SEVEN gated calls and every one is EXECUTED with tests, baselines
and records — to be precise: zero GATED RULINGS remain open before the 22nd;
the standing RESEARCH items (projection-source disagreement, DEF def_fum_td
gap, STREAMABLE_LATE, and the rest of DECISIONS-NEEDED.md's OPEN section)
remain open on purpose and are listed there — 'clean queue' never meant
'no known issues' (list + verbatim rulings: `DECISIONS-NEEDED.md` § Settled).
**[UPDATED 2026-08-16, later session: the first two of those standing items —
#000 projection-source disagreement and #0 DEF def_fum_td — are now FIXED
under a further Cory ruling ("Don't agree with timelines we fix now");
records appended to both entries, evidence chains in
`draft/audit/projection_correctness_2026-08-16.md`, merge-ready item on
ROUTES TO:A. This paragraph kept as written per the no-delete habit.]** The
projection program replaced the own-model twice in one day under his written
acceptances (v4 then v6 — v6 = v4's QB arm + component-built RB/WR/TE arms,
cleared the REC-3 bar at all four positions). Five design/model passes ran as
agents and are merged on the relay branch: war room, in-season tools, member
site, side bets, draft-behavior. Betting-market capture is LIVE (SportsGameOdds,
Thu+Sun cron, first snapshot committed to main). A Cory-commissioned external
persistence audit (2026-08-16) found 3 HIGH + 3 MEDIUM app-storage defects —
all six are fixed red-then-green on the relay branch (lost-update races on the
ledger/owners docs, the standings editor silently saving partial draft-order
input, cron secrets in query strings, the seeding race, a starter-password
census; `draft/audit/persistence_hardening_2026-08-16.md`). The draft is
**Saturday the 22nd**; the weekly-grading cron deadline (~Sep 1) still stands
RED in STATUS.md.

## 2. WHERE THE WORK LIVES

- **Relay branch** `claude/fantasy-football-research-926y6z` — everything.
  Suites green at tip: ~2430 Python / 298 JS entry points;
  `scripts/verify-relay-session.sh` is 7/7 and is the branch's own proof.
- **Main** got only: board-rebuild fixes (authorised, recorded), config-check +
  key-probe workflows, and the odds capture (fetcher, workflow, tests,
  first snapshot). Nothing else was pushed to main.
- **The record files:** `TODO.md` (current state), `DECISIONS-NEEDED.md`
  (rulings + queue — ZERO gated rulings open before the 22nd; standing research items stay open in its OPEN section), `TERRITORY.md` Override #5 (+appendices,
  every one of the 45 B/C-lane crossings documented), audit docs under
  `draft/audit/*_2026-08-16.md` (one per pass, with before/after screenshots
  under `draft/audit/screens/`).

## 3. A — HOW YOU PROCEED (this is your Monday morning)

1. Read `ROUTES.md` **TO:A** items — each is a merge-ready handoff with its
   review recipe. The projection program's item explains v5/v6 and what to
   check.
2. The merge to main is YOUR deliberate act: `scripts/merge-relay.sh`
   (verify → local merge → suites on the merged tree → STOPS before push).
   The territory gate WILL refuse the branch — that refusal is correct and
   is pinned to exactly the 45 documented files (Override #5). Bypassing it
   knowingly for this branch is the documented, Cory-authorised path.
3. After merge: the relay keeps working per `RELAY-PROTOCOL.md` § post-merge —
   one-concern branches off fresh main, nothing lands without your review or
   Cory's word. Your lane is judgment and integration; the relay's is
   throughput and evidence.
4. Parked FOR you (your lane, the relay did not touch): per-player remaining
   feed for /watch (`remainKnown:false`), h2h harvest refresh (previews end at
   2025), proj_series continuity, and the RED weekly-grading cron deadline.

## 4. B and C — WHAT CROSSED YOUR LANES

- **B:** every crossing is in `TERRITORY.md` Override #5 appendices with the
  defect/directive that forced it, and each carries a test. New B-adjacent
  file for your review: `src/inseason_guide.js`. The design passes rewrote
  member-facing surfaces under Cory's verbatim charters (quoted in the
  appendices and `docs/queued/member-site-design.md`).
- **C:** your component-stats ask (ROUTES TO:C) was satisfied from A-lane —
  the stores are committed with parity pinned (`draft/backtest/
  component_stats_*.json`, 16 tests). The v6 promotion consumes them.

## 5. HOW TO TALK TO THE RELAY

`RELAY-PROTOCOL.md` is the contract; `ROUTES.md` is the wire (append-only
items, `CLAIM:` to take one; `scripts/inbox.sh` shows yours). The decision
queue lives ONLY in `DECISIONS-NEEDED.md`. Red main outranks everything.
The relay session is reachable by Cory directly; you reach it by leaving
ROUTES items — it checks the wire every session.
