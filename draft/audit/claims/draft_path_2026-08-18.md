# CLAIM UNDER REVIEW — the draft-path engine changes since the 05:33Z freeze

**Author: A (the session that also RULED on most of these changes — which is
exactly why this review is being commissioned; the fallback reviewer and the
ruler are the same agent today, and Cory has asked for independent eyes).**

## What ran

This branch overlays exactly three files onto the 05:33Z freeze-era base
(`b3772bfc`): `public/js/draft/app.js`, `public/js/draft/composite.js`,
`public/js/draft/engine.js` — the ruling-bearing draft-path files as they
stand on `main` tonight, four days before the draft (2026-08-22, ten-team
half-PPR keeper league, the tool's owner picks at 8s/pick off these files).

The changes bundled here, each shipped with suites that are green on main
(full battery: all JS suites, 4,388 Python):

1. **dispersionCaveat reword + appliedCohort guard re-size** (app.js): the
   on-screen caveat stopped calling the full-universe repricing a "known
   defect" after a population ruling, and the cohort-recovery guard moved
   from an absolute tolerance to a relative one (4x closer than any other
   cell) because per-player CV made within-cell ratios non-constant.
   Measured to recover exactly nine ruled repricings on the v27 board.
2. **A third dispersion-source form** (`…-x-player-cv`) distinguished in the
   caveat so 268 players with per-player tails are no longer described as
   carrying a cohort-constant multiple.
3. **The restore pin v1 → v27** (app.js): `BASELINE_VERSION = 'v27'`, the
   localStorage key rotating with the pin, so the one-tap "restore the
   measured core" can no longer silently revert the ceiling (0→0.45, owner-
   ruled) and stack (0.5→1.0) weights.
4. **Six renders moved into `safeRender`** (app.js) so the health strip can
   report its own failure, with the cockpit refresh kept beside them.
5. **`dollarGap` QB refusal** (engine.js): cross-position dollar comparisons
   involving a QB refuse with the reason on screen (the D10a K/DEF shape).
6. **Keeper machinery** (composite.js): the negative-KOV bar floor
   (`Math.max(0, …)`) beneath the `Number.isFinite(vorp)` incumbent filter.
7. **The ceiling tiebreak refusal** (`moreUpsideThanTheCellExplains`) and the
   onesie/backup pricing paths as they interact with the above.

## What came back

Every named suite green; the deploy probe verified the served bundle matches
HEAD; a dress rehearsal is scheduled (once now, once after Friday's keeper
lock).

## What it proves

The changes behave as their tests state on the current board (v27-era data).

## What it does NOT prove

That the INTERACTIONS are sound. Specific worries the author cannot
independently check (the author wrote or ruled on all of them):

- The relative-only appliedCohort guard: is there a board shape where the
  4x-relative rule names a WRONG cohort confidently (e.g., a position with
  only two measured cells whose medians sit close together)?
- The bar floor composes with the onesie discount and the ceiling-bench
  bonus: can a roster state make `keeperOptionValue` and the onesie pricing
  disagree about the same player in a way the rendered list shows?
- The safeRender migration: do any of the six moved renders have ordering
  dependencies on the cockpit refresh that the try/catch order silently
  changed?
- The v27 pin: is any client path still reading the OLD localStorage key or
  the `?version=v1` route (a cached-bundle scenario on draft night)?

## Uncertainty

The diff is ~4.2k inserted lines across three files; if truncation triggers,
route unseen code to `unknown` per protocol — do not report "no issue" on
code you did not see.

## Next step

Findings triaged by A tonight; anything real lands as register rows before
Friday's lock. A "no findings" verdict is also useful — it retires the
self-review concern for these files.
