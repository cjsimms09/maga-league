# The other 51 readers: tests. Zero contaminated — and register 345 named one module wrongly

**D, 2026-08-25. Register 357. Completes the sweep register 345 said it had not run.**

## Tests: 51 files, and the answer is clean

**12 SENSITIVE (3 of them controls) · 39 insensitive · 3 error in both arms · 1 timed out.**

The 39 "insensitive" verdicts are worth something only because the run carries a
**pytest-path control**. A pytest file invoked as a plain script exits 0 having
run nothing, and a `.js` file handed to python errors instantly — either way
the arm executes nothing and every test reports clean. That control exists
because the sibling **triage** script shipped exactly that bug: it had no
dispatch, ran all three flipping tests as the wrong interpreter, and reported
*"no difference"* for all three. A silent all-clear from a probe that never
ran is the failure this whole sweep was built to find, and it turned up inside
the sweep.

### The three tests that flip — all three are clean

`lineup_skill.test.js`, `pick_schedule.test.js` and
`test_own_projections_v6_live.py` pass with the season present and fail without
it. None is contaminated. All three fail through `draft_plan.js:130`, which
**refuses** rather than assuming:

> `draft_plan: cannot read reversal_round for this season from league_history.
> REFUSING to assume a plain snake — draft.type reads "snake" under a
> third-round reversal too, which is how 2023 would have been mis-ordered from
> round 3 on.`

That is correct behaviour, and it means **my counterfactual was too coarse.**

## The refinement, and the correction it forces

2026 is not one thing: it carries a **real completed draft** (150 picks) and
**180 zero owner-weeks**. Removing the whole season removes both, so a module
that moves under it might be reading phantom weeks *or* reading a legitimate
draft record. The sweep now has two modes — `whole` (the original) and
**`weeks`**, which strips only the zero owner-weeks and keeps every season and
draft record. Under `weeks`, all three flipping tests go **green**, which is
what settles them.

Re-running register 345's nine under `weeks` separates the two causes:

| verdict | modules |
|---|---|
| **genuinely zero-week contaminated** (6) | `measured_need_curve` · `exp25_deadzone` · `exp_value_pockets` · `flex_exposure` · `exp_stack_conversion` · `exp_inverse_adjuster` |
| **draft-record dependent, NOT contaminated** (2) | `opponent_profiles` (already flagged as a judgment call in 345 — that holds) and **`sim_validation`, which 345 got wrong** |
| **unmeasurable in `weeks` mode** (1) | `streamability` — its `C1_draft_join` and `C3_three_seasons` controls fail in *both* arms, because `weeks` leaves 2026 behind as an empty season |

**⚠️ CORRECTION TO REGISTER 345:** it listed *"`sim_validation` — the fitted
cascade constant 2.0 → 4.0"* among the contaminated. It is not. That constant
moves because the 2026 draft is a **fourth real draft**, not because of any
phantom week. The headline count is **six contaminated, not nine.**

**`streamability`'s inversion still stands** and does not rest on the
counterfactual at all: the clean run reproduces `P153 TRUE gap 0.278`, which is
the value `draft/STREAMABILITY-PREREG-2026-08-19.md` recorded on 08-19, to the
digit. That is independent corroboration, not a comparison of two arms.

## What the tools do about it now

`whole` mode finds everything that reads the current season; `weeks` mode
isolates zero-contamination. **Each mode carries its own positive control**,
because the season-list control is blind to `weeks` (which keeps every season)
— and it proved it by voiding the first `weeks` run rather than certifying a
mode it could not test. The artifact control now counts owner-week entries
instead of listing seasons, so one control is valid in both.

## Defects this work found in its own instruments

Every one was caught by a control or by a contradiction, none by inspection:

1. The file-snapshot included the store being swapped → everything SENSITIVE, including the negative control.
2. A timeout killed the first run and left the counterfactual store in the tree — `finally` does not cover SIGTERM.
3. The snapshot compared file **names**, not contents → an artifact-only difference read as insensitive.
4. The sweep's own exclusion filter swallowed the artifact control's output file — **twice**, under two different names.
5. The triage had no interpreter dispatch → all three flipping tests reported "no difference".
6. **The triage's `git checkout -- .` reverted its own uncommitted fix mid-run**, so the second arm ran the old code. A probe that edits itself out of existence reports a clean all-clear. The reset is now scoped to artifacts and explicitly excludes `draft/tools/`.
7. The pytest control, placed under `draft/tests/`, would have been collected by the normal suite and **turned `main` red** — it asserts something false about the shipped store on purpose. It lives under `draft/tools/` now and is passed to pytest by path.

## Follow-up questions (Rule 3g)

- **Another failure unlooked-for?** `draft/tools/` — 38 readers, still unswept.
- **Invalidates something we trust?** Register 345's own count. Corrected above and in the row.
- **Routed?** The correction is to my own row. The six confirmed contaminated modules stay with A.
