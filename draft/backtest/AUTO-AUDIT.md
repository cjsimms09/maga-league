# AUTO + PHASE-TOURNAMENT AUDIT — measured vs designed (2026-08-09)

Cory, 12 days out, drafting with Auto running for 3 hours: is its schedule MEASURED or
DESIGNED, and what did the phase tournament actually search? Honest answers from the code.

## Q1 — what the phase-shape tournament actually tested (policy_tournament.py)
- **Two phases only:** core = picks 1-6, end = picks 7+ (`CORE_PICKS=6`). NOT per-round; a
  2-boundary schedule, not 12.
- **Two terms only:** it moved `ceiling` tilt and `risk` penalty. It did NOT vary need,
  value, tier, stack, bye, or keeper by phase.
- **The shapes raced:** `defaults` (0.5/1.0 both phases), `h1_phase` (modest core 0.5/1.0 →
  **aggressive floor-free endgame 2.0/0.0**), `uniform_boom` (1.25/0.5), `floor_heavy`
  (0.0/2.0). PLUS a grid: core ceiling {0, 0.25, 0.5, 1, 2} × endgame ceiling {0, 0.5, 1,
  2, 3} at the phase's registered risk.
- **"More aggressive at the end" WAS tested** — that's exactly `h1_phase` and the endgame
  grid up to ceiling 3.0. Result: **endgame ceiling 0.5 is best (+$19, CI [7.5, 33]); 1.0 /
  2.0 / 3.0 all worse with CIs excluding zero.** The designed late-upside ramp was refuted;
  moderate won.
- **Scope (habit 9):** for **ceiling/risk by a 2-phase split**, this was a real sweep
  (~25 grid points + 4 shapes), decently powered — so the "aggressive endgame is worse"
  null is trustworthy for the ceiling term. What was NOT searched: shifting **need/value/
  tier/stack** by phase, **finer round boundaries**, and a schedule that shifts a *different*
  term late. So "a late posture shift in general" is largely untested — only the ceiling
  version is refuted.

## Q2 — what Auto actually does, round by round (engine.js autoWeights)
Four phases by round; the values it sets (defaults elsewhere):

| phase | rounds | need | tier | risk | ceiling | bye | keeper |
|---|---|---|---|---|---|---|---|
| Anchor | 1-2 | 0.35 | 1.35 | 1.1 | 0.45 | 0.5 | 0.9 |
| Build | 3-6 | 0.9 | 1.2 | 1.0 | 0.60 | 0.8 | (stack 1.1) |
| Fill | 7-10 | 1.45 | 1.0 | 0.9 | 0.80 | 1.4 | — |
| Endgame | 11+ | 1.3 | 0.8 | 0.6 | **0.5** | 1.1 | 1.6 |

Plus live overrides: **tight** (≤4 picks left with a hole → need +0.9, ceiling −0.3),
**run** (hot position → tier +0.35), and a starters-filled plan check.

**Measured or designed? Mostly DESIGNED. Exactly one cell is derived:**
- ✅ **Endgame ceiling 0.5 — MEASURED** (the exp2 §5 grid above; the one value the data set).
- ✅ **Core ceiling tilts (0.45/0.60/0.80) — tested, left at default on purpose** — the grid
  found every core tilt straddled the default ("no evidence of a shift" is the finding, not
  a license to nudge). So these are measured-as-unchanged.
- ❌ **Everything else is hand-built and never raced:** the `need` ramp (0.35→0.9→1.45→1.3),
  `tier`, `risk`, `bye`, `keeper` per phase, **and the round boundaries themselves (2/6/10)**
  — the comment says so directly: *"Not fitted — three prior drafts is [too little]."* The
  tournament only moved ceiling + risk, so the bulk of Auto's schedule is designed, not
  derived. The live tight/run overrides are sensible heuristics, also unraced.

## The honest bottom line + what it moves
Auto is a **reasonable designed schedule with one measured cell and its worst instinct
(aggressive-late ceiling) correctly tamed by measurement.** It is not dangerous — values
are moderate and the rails hold — but "measured" it is not. Drafting with it **on** is fine;
it is not demonstrably better than a fixed sensible preset for the unraced terms.

This **moves two things up the ledger** (as Cory anticipated): (1) the **participation
test** — if need + value are the only earners, Auto is mostly moving decoration on a
designed schedule and should say so; (2) a **real phase sweep** that varies `need` (the one
term with a strong prior AND a phase story — it ramps as slots fill) by finer boundaries,
which the tournament never tested. Both now rank above the smaller pre-draft work; both sit
below the FantasyPros third source (the largest edge) per EDGE-LEDGER.
