# CLAIM UNDER REVIEW — the draft-path changes on main since the 05:33Z freeze

**Author: A — the session that also RULED on most of these changes, which is
why the review is commissioned. Second submission: the first (run
32174867145) was rightly BLOCKED because I reviewed an overlay branch whose
test evidence could not support the claim. This one reviews `main` itself:
the diff is everything since the freeze base, and the suites you run ARE the
evidence — no imported numbers.**

## Scope

The SUBJECT of this claim is three files inside the larger diff:
`public/js/draft/app.js`, `public/js/draft/composite.js`,
`public/js/draft/engine.js` — the draft-path code the tool's owner picks
from at 8s/pick on 2026-08-22. Everything else in the diff (mailbox
markdown, workflows, other lanes' surfaces) is context; route it to
`unknown` freely if truncation bites, but spend your attention on these
three.

## What changed in the three files (each shipped with suites in draft/tests)

1. **dispersionCaveat reword + appliedCohort guard re-size** (app.js): the
   caveat stopped calling the full-universe repricing a defect after a
   population ruling; the cohort-recovery guard moved from absolute to
   relative (4x closer than any other cell) because per-player CV made
   within-cell ratios non-constant.
2. **A third dispersion-source form** (`…-x-player-cv`) distinguished so 268
   per-player-tail players are not described as cohort-constant.
3. **The restore pin v1 → v27** (app.js): `BASELINE_VERSION = 'v27'`, the
   localStorage key rotates with the pin — one tap can no longer silently
   revert the owner-ruled ceiling (0→0.45) and stack (0.5→1.0) weights.
4. **Six renders moved into `safeRender`** so the health strip can report
   its own failure; the cockpit refresh kept beside them.
5. **`dollarGap` QB refusal** (engine.js): cross-position dollar comparisons
   involving a QB refuse on-screen (the D10a K/DEF shape extended).
6. **Keeper machinery** (composite.js): the negative-KOV bar floor beneath
   the finite-vorp incumbent filter.

## What the author asserts (verify against YOUR OWN suite run, not my word)

The suites in `draft/tests/` covering these behaviors pass on this tree.
Run them yourself — `scripts/js-sweep.sh` and `python3 -m pytest
draft/tests -q` — and treat YOUR results as the only test evidence.

## What this does NOT prove, and where to press

- The relative-only appliedCohort guard: a board shape with two close cell
  medians could name a wrong cohort confidently.
- The bar floor composing with the onesie discount and the ceiling-bench
  bonus on one player in one roster state.
- Ordering dependencies among the six safeRender-migrated renders and the
  cockpit refresh.
- Any client path still reading the old `?version=v1` or the old
  localStorage key on a cached bundle.

## Next step

Findings triaged by A tonight; real ones become register rows before
Friday's 6pm keeper lock. A clean verdict retires the self-review concern
for these files.
