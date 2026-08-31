# The ~40 readers: swept. Nine studies move, two controls fired and printed anyway, and a published prereg result inverts on today's store

**D, 2026-08-25. Register 345. This is register 339's open half and register 340 ③'s named unswept set.**

## Method, and why not a grep

A static scan for a played-season guard would match on vocabulary — the exact
way a sweep for missing controls went wrong in this repo before. This runs
every `draft/backtest/` reader of `league_history` **twice**: once against the
store as shipped, once against a copy with every all-zero season removed. A
module is SENSITIVE when its output changes. How the guard is written does not
matter; whether the phantom season reaches the result does.

`draft/tools/league_history_contamination_sweep.py` (report-only, gates
nothing) with three controls that must pass or the run is void: a
stdout-positive, a negative, and an artifact-positive for modules whose only
output is a written JSON.

**70 modules swept. 17 SENSITIVE · 37 insensitive · 15 errored in both arms ·
2 timed out in both arms.**

## What the sweep is NOT

**The 17 unmeasured modules are not clean.** The 15 `ERRORS-BOTH` fail in this
container because Sleeper is unreachable through the proxy — `projection_error.py`
says so itself: *"VOID — Sleeper player index unreachable — a fact about the
runner, not about any historical season."* They need re-running where the
network works. The 2 timeouts need a longer budget. **Silence from those 17 is
absence of measurement, not absence of contamination.**

**And the counterfactual removes the WHOLE season**, while 2026 is mixed: it
has a real completed draft (150 picks) and 180 owner-weeks of zeros. So a
draft-based study reading 2026 is reading real data; a points-based one is
reading zeros. That distinction is made per module below, not by the harness.

## Contaminated — the study's own numbers move

| module | what moves |
|---|---|
| **`streamability.py`** | **its prereg's headline INVERTS**: `P153 ... FALSE gap 0.238` on today's store against **`TRUE gap 0.278`** without 2026 — and 0.278 is what `draft/STREAMABILITY-PREREG-2026-08-19.md` recorded on 08-19. QB streamability 0.481 → 0.590, RB 0.242 → 0.311 |
| **`measured_need_curve.py`** | the whole need curve. RB1 0.751 → 0.869, RB4 0.386 → 0.273; denominators 720 → 540 — **the 180 phantom owner-weeks, exactly** |
| **`exp25_deadzone.py`** | `n_picks` 462 → 338 (`"2026": 124`); the identified dead zone moves **band 61-70 → 71-80** and `our_drop` 39.9 → **50.5** |
| **`exp_value_pockets.py`** | `n_picks` 462 → 338; the ranked pocket list **reorders** — top pocket `QB/111-120/1.03` → `RB/51-60/1.07` |
| **`flex_exposure.py`** | exposure rates: RB 3rd body 0.303 → **0.45**, WR 5th 0.686 → 0.882; denominators 538 → 466 |
| **`exp_stack_conversion.py`** | `roster_weeks` 720 → 540, `stacked_roster_weeks` 87 → **51** |
| **`sim_validation.py`** | real `run_share` 42% → 46% and the **fitted cascade constant 2.0 → 4.0** — a fitted model parameter |
| **`exp_inverse_adjuster.py`** | value ranks across the pick log (46 → 57, 63 → 65, …) |
| **`opponent_profiles.py`** | `n_picks` 630 → 480 and **owner archetype labels change**: Jreis `QB-late` → `RB-early, QB-late, TE-heavy`; Sadbru `QB-late` → `QB-early`; coryjsimms `QB-late, RB-heavy` → `QB-late`. **This one is the judgment call, not a zero-contamination bug** — it reads pick POSITIONS, and the 2026 draft is real. The question is whether the season being modelled belongs in the profile that models it. Owner's call, not mine. |

## Benign — the guard reporting out loud

`start_sit_vs_random.py` (`skipped_unplayed_owner_weeks` 180 → 0, A's fix doing
exactly what it says) · `draft_pick_vs_random.py` (its *"seasons SKIPPED for
want of a weekly-points store"* line) · `keeper_vs_random.py` (same, and its
`_limits` already says *"2026 has no season yet"*) · `drop_vs_random.py`
(`skipped` 79 → 76) · `exp_stack_correlation.py` (adds a 2026 row at n=0/None;
the aggregate is untouched).

**One precise correction to register 340**, which matters only because it is a
strong claim someone may lean on: `waiver_vs_random` is **not** byte-identical.
`n_claims` 756 and `mean_percentile` 0.7116 are identical — the graded result
is genuinely untouched, which is 340's substantive point — but the artifact's
`skipped` field moves **12 → 8**. Result identical, file not.

## Requires the current season by design

`opponent_need_model.py` **crashes** without 2026 —
`next(s for s in history["seasons"] if s["season"] == "2026")` → `StopIteration`.
The counterfactual is invalid for it; it is not contaminated, it is
season-scoped on purpose.

## The finding underneath the findings

Three modules run a season-count control. **All three exit non-zero.** But:

- `archetype_need_curve.py` prints **`⛔ CONTROLS FAILED — refusing to report numbers`** and prints nothing else.
- `measured_need_curve.py` prints **`!! A CONTROL FAILED. Nothing below is a measurement.`** — and then prints the complete need-curve table, including `RB 4th: measured 0.386 vs my model 0.128`.
- `streamability.py` does the same, and the table it prints under that warning contains **`P153 … FALSE`**, the inverse of its own published result.

**The controls fired. They did not stop anything quotable.** A non-zero exit
protects CI; it does not protect a person reading the log and copying a number
out of it, and this project's failure mode is numbers travelling into prose
(register 5h, three times). A warning line above a full table is not a refusal.

This also corroborates register 344 from a second direction: contamination
turned a **TRUE** prereg result into a **FALSE** one. It suppressed a real
finding rather than manufacturing a false one.

## A label collision found on the way, unrelated to contamination

`streamability.py` and `draft/STREAMABILITY-PREREG-2026-08-19.md` call their
predictions **P153** and **P154**. `PREDICTION-LEDGER.md`'s P153 and P154 are
the **Gauntlet** rows (Best-Available-ADP finishing last; strict VONA ≤ BAV),
both GRADED 08-21, both about something else entirely. I nearly wrote *"a
graded ledger prediction is wrong"* off the module's output; it is not — the
ids collide. Filed rather than fixed, because renumbering is the relay's
protocol (register 186).

## Follow-up questions (Rule 3g)

- **Another failure unlooked-for?** The 17 unmeasured modules, and the same
  sweep over `draft/tools/` (33 readers) and `draft/tests/` (50) which I have
  not run.
- **Invalidates something we trust?** Any of these nine studies re-derived from
  the store since `c5ec97a5` is wrong. The **published** artifacts are mostly
  from before that and are fine — `streamability` is the demonstration: the
  published 08-19 result is correct and only a re-run today is wrong, which is
  the dangerous direction, because a re-run looks newer.
- **Routed?** Nine modules across three territories. Filed to A (owner of 339
  and 340) with the list, rather than nine separate edits by me.
