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

---

# RESPONSE TO REVIEW — run 32175940031, verdict ACCEPT_WITH_REQUIREMENT

The reviewer (gpt-5, artifact `independent-review` 9339300783) accepted the
claim with required actions. Each is answered here; the answers shipped in
the same commit as this section, so the trail and the fixes cannot drift
apart.

## Required action 1 — file:line citations for each enumerated change

Line numbers are as of this commit on `main`; each is the anchor line, not
the full extent.

1. **dispersionCaveat reword + relative appliedCohort guard** —
   `public/js/draft/app.js:10897`: `if (second) { if (best.d > 0.25 *
   second.d) return null; }` (the 4x-closer relative guard; the absolute
   fallback arm is the `else` on the next line).
2. **Third dispersion-source form** — `public/js/draft/app.js:6713` and
   `:6731` (the `/-x-player-cv$/` branches that stop describing the 268
   per-player-tail players as cohort-constant); the three-form census
   comment with the 268/267/161 counts is at `app.js:10911-10914`.
3. **Restore pin v1 → v27** — `public/js/draft/app.js:780`: `const
   BASELINE_VERSION = 'v27';` with `BASELINE_KEY` derived from it on the
   following line, so the localStorage key rotates with the pin.
4. **safeRender migration** — `public/js/draft/app.js:2409`:
   `safeRender('systemStrip', renderSystemStrip);` is the health strip's own
   guarded render; the other five migrated renders sit in the same block.
5. **dollarGap QB refusal** — `public/js/draft/engine.js:3306-3328`: the
   refusal branch ("1-QB league, QB replacement is 341.7 against 136-180
   elsewhere… QB-vs-other gap is a formula artifact; compare within
   position").
6. **Negative-KOV bar floor** — `public/js/draft/composite.js:288`: `const
   bar = Math.max(0, ranked.length >= slots ? ranked[slots - 1].kov : 0);`.

## Required action 2 — targeted JS tests that go red if each behavior regresses

Run any of these directly with `node <file>`; all are in the default
`scripts/js-sweep.sh` battery.

| Behavior | Suite that goes red |
|---|---|
| Relative guard: near-tie refusal + no false repricing | `draft/tests/floor_is_a_cohort_not_a_forecast.test.js` §6b (added by this commit — see action 3) and §8 (exact ruled-set match) |
| Player-cv source form not described as cohort-constant | `draft/tests/floor_is_a_cohort_not_a_forecast.test.js` (source-form sections) |
| v27 pin + key rotation | `draft/tests/restore_reverts_two_rulings.test.js`, `draft/tests/restore_measured_core_works.test.js` |
| safeRender wiring (health strip reports its own failure) | `draft/tests/floor_is_a_cohort_not_a_forecast.test.js` fail-arm wiring check; the render-order checks in the war-room suites |
| dollarGap QB refusal | `draft/tests/dollar_gap_kdef.test.js` |
| Bar floor beneath the incumbent filter | `draft/tests/keeper_bar_ignores_what_it_cannot_value.test.js`, `draft/tests/keeper_seeded_with_a_value.test.js` |

## Required action 3 — near-tie fail arm + calibration note, pinned by a test

Shipped in this commit as §6b of
`draft/tests/floor_is_a_cohort_not_a_forecast.test.js` (suite 16/16):

- **Fail arm**: two synthetic RB cells with modal ratios 0.30 and 0.34; a
  player at 0.32 is 4x-decisive for neither, and the check asserts the
  generic fallback renders with NO cohort named. This is exactly the "two
  close cell medians" press point from the claim's own where-to-press list.
- **Control**: the same board shape with the cells separated (0.05 apart)
  DOES name "17-32 COHORT" — the fail arm's null is demonstrated capable of
  going positive (rule 3e).
- **Calibration pin**: at the shipped 0.25 factor the guard recovers exactly
  the nine ruled full-universe repricings; loosening to 0.5 added two false
  positives (Ashton Jeanty RB6, Kyle Pitts TE8). The pin asserts those two
  players are NOT flagged on the live board. The factor is a refusal
  threshold, not a tuning knob.

## Reviewer's collateral finding, also fixed in this commit

The review run's own Python collection failed (numpy missing) because
`.github/workflows/independent-review.yml` installed `openai pytest` but not
`draft/requirements.txt` — the same venv-gap class the main CI probe
exists to catch. The Deps step now installs `-r draft/requirements.txt` and
runs `npm ci` so `scripts/js-sweep.sh` works in the review environment too.

## Verdict trail

- Dispatch 1 (run 32174867145): **BLOCK** — correct call; my overlay-branch
  harness made the claim unverifiable (base-era tree lacked the cited
  suites). The flaw was the harness, not the reviewer.
- Dispatch 2 (run 32175940031): **ACCEPT_WITH_REQUIREMENT** on `main`
  itself — requirements closed by this commit.
