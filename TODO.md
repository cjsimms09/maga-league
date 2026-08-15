# TODO — the real count, in plain English (regenerated 2026-08-15, mid-week)

_Regenerated from STATUS.md, PARKED.md, DECISIONS-NEEDED.md and this week's findings —
not from memory. Draft is **Aug 22** (7 days out). **A and B are both unreachable until
Monday** (weekly session limit) — everything below this line that isn't marked ✅ was
done by the research-relay session on `claude/fantasy-football-research-926y6z`,
committed and pushed, **nothing merged to `main`, no deploys**. A has final say on all
of it. Session B keeps the site/in-season half of this list separately._

**🚨 CHECK FIRST, BEFORE ANYTHING ELSE:** `DECISIONS-NEEDED.md`'s top entry — the
build-minute budget numbers are stale (a week old) with the draft-week reserve
(Aug 20-22) five days away. Re-verify the real number before deploying anything.

---

## ALREADY SETTLED — DO NOT RE-DERIVE THESE

Found this week, each after real time spent re-discovering something already true in
the code. Listed here specifically so nobody (A, B, C, or a future me) burns another
hour on them:

- **The composite-vs-needrule disagreement is already reconciled.** `needrule.js` +
  the "Two reads" guard in `app.js` (~line 4169, spec A10, 2026-08-10) already handle
  it — deliberate, measured, working. `coherence.js` is a *different*, still-unwired
  feature (dead-zone/market-reliability/plan-adherence resolution for one candidate),
  not the fix for this.
- **The position-normalized ceiling fix (upsideBonus units defect) already shipped**
  — 2026-08-13, `computeCeilingScales` in `engine.js`. Don't re-propose the
  `group_by(pos)`-style normalization; it's built.
- **The F4-excluded-league replay question is CLOSED, not open.** Ruled 2026-08-11
  ("✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING ONLY"), implemented, verified
  end-to-end. A near-identical heading below it, marked SUPERSEDED, is kept only as
  an unedited historical record per this file's own audit discipline — reading only
  that section (a partial/tail read) makes it look open. It isn't. Mistakenly
  re-surfaced as a live decision on 2026-08-15; corrected same day.
- **Mid-draft need-blindness is a real, still-open gap** (not new) — already measured
  and dated 2026-08-14 in `engine.js` (~line 427, `composite_roster_blindness.test.js`).
  See the two 2026-08-15 PARKED.md entries on this for the full trail, including a
  correction — read those first, they already record two false starts on this exact
  question.

## THIS WEEK, in dependency order (no calendar gates — sequenced by risk and what unblocks what)

### 0. Zero-code — needs only Cory's ruling, unblocks everything else
- ✅ **GO for mock #4 — Cory ruled YES (2026-08-15).** Accounting green + deployed.
  Actually running it is a live event (needs real participants) — schedule with
  A/B, not something a session executes alone.
- ◻ **D14:** build the real Stage-2 anchor, or hold? Recommendation: hold, because
  wiring it now would suppress the exact deviations exp 33/34 need to measure
  cleanly. Still open as of 2026-08-15.
- ◻ **REGRESSION_WEIGHT install (0.35→0.1 or 0.0)?** Accuracy + overfitting gates
  cleared; dollar-arm sizing is the one remaining gate — in progress below.
- ✅ **F4-excluded league replay** — was ALREADY RULED 2026-08-11, before this week
  started (`DECISIONS-NEEDED.md`, "✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING
  ONLY"), fully implemented and verified. Mistakenly re-surfaced as open on
  2026-08-15 from a partial read of the file — corrected same day. Nothing to do.
- ◻ **Deploy policy after Aug 22** — low urgency, not blocking anything now.

### 1. Safe to build now — no network, no live-scoring change, no deploy
- ◻ REGRESSION_WEIGHT dollar-arm sizing — in progress.
- ◻ TE-at-3.6-picks term-isolation diagnostic (board data only, no network) — ~1hr, not started.
- ◻ Third arm: composite vs ADP in dollars (JS replay) — feeds the D14/deviation-trust verdict.
- ◻ Dollar-grade the exp35 sweep.
- ◻ Exp41 paired-room race (combiner core already built + tested).
- ◻ What-would-have-worked audit vs the 3 historical drafts.

### 2. Blocked on live network access — guidance written, needs A or any session with egress
- ◻ **DEF projections missing `def_fum_td` AND `def_kr_td`** (bigger than originally
  scoped — see `DECISIONS-NEEDED.md` #0, 2026-08-15 addendum, for the exact next step:
  pull raw rows for all 32 DEFs in one pass, not one alias at a time).
- ◻ **WR/TE projection-source ~20% disagreement** — see `DECISIONS-NEEDED.md` #000,
  2026-08-15 addendum, for a concrete first hypothesis (PPR-assumption confound in
  FP's raw data) before assuming it needs deeper novel diagnosis.

### 3. Higher-risk — needs real design + a full backtest cycle, not a date
These aren't calendar-gated; they're blocked on missing design work, and building that
design under this week's time pressure is exactly how the bench-branch anchor broke
before (documented, not hypothetical). Recommend treating these as genuinely
after-draft rather than squeezing them in — but that's a recommendation, not a rule;
override if you disagree.
- ◻ RB drafts 0.9 in every weight arm (`DECISIONS-NEEDED.md` #0000) — needs an unbuilt
  concentration/insurance term, not a coefficient tweak.
- ◻ `ONESIE_MAX_SPARE` cap re-evaluation now that the ceiling-units fix has landed —
  `draft/tests/onesie_cap.test.js`'s retirement check was still red as of last check;
  needs re-measurement against the fixed ceiling term before any design decision.

## WAITING ON THE WORLD (nothing to do, just read it when it lands)
- ◻ Covariance / portfolio rho verdict — runs in CI on push.
- ◻ Anything needing a live 2026 season (in-season tools, continuous re-grading).

## GENUINELY AFTER THE DRAFT (blocked on data that won't exist until then, not on a calendar preference)
- ◻ The learning engine (weekly re-grading) — needs live weekly outcomes.
- ◻ Site optimization Phase 2.
- ◻ Revisit deploy policy once the draft-week reserve is no longer live.

---

_Session B owns the site/in-season half — matchup page follow-ups, Sunday alert, the
lineup optimizer's in-season surfaces, the deployed-vs-main health strip, and the
design sweep. Regenerate that slice the same way when B is back._
