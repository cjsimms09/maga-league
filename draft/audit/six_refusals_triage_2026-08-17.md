<!-- TERRITORY: A -->
# THE SIX REFUSALS ARE NOT ONE PROBLEM. THREE MAY BE REAL BOARD DEFECTS.

**2026-08-17.** Written before doing the "permanent regenerate fix" Cory asked
for, because **doing that fix as specified would have shipped a broken board.**

---

## THE INSTRUCTION AND WHY IT IS REFUSED AS WRITTEN

The plan was: register the artifacts behind the six failing tests, regenerate
them inside `draft-data.yml` between the build and the acceptance gate, publish.
That kills the whack-a-mole.

**It also kills the gate.** Two of the six are literally
`test_committed_artifact_matches_regeneration` and
`test_artifact_coverage_matches_board`. Regenerating an artifact immediately
before asserting that the committed artifact matches its regeneration makes the
assertion **vacuous by construction** — it can never fail again. That is not
fixing a check, it is deleting one and leaving the corpse green.

And the deeper problem: **the six were never one species.** Classified below.

## THE CLASSIFICATION

### 🟥 THREE THAT MUST BE INVESTIGATED, NOT REGENERATED

**1. `test_measured_ceiling::test_the_measured_ceiling_is_ON_and_its_sibling_is_not`
— the most serious.** It asserts `use_measured_ceiling is True` in
`draft/config/league_config.json`. **`build.py` REWRITES that file** — its own
comment says the committed config "is a CACHE of what the commissioner
confirmed". So the freshly built config appears to have come back **without the
measured-ceiling flag Cory explicitly ruled ON**:

> *"We absolutely need to change draft board if we aren't considering upside"*

If this had been regenerated to green, **Cory would have drafted on a board using
the Gaussian ceiling instead of the measured p90** — the exact thing the ruling
overturned. The test is not stale. It is doing precisely the job it was written
for.

**2. `test_constant_multiple_sweep::test_no_new_field_has_joined_the_constant_multiple_family`.**
It fires when a board field becomes a rescaled copy of another. **That is the
ceiling-defect class by name** — the one that cost this project a week and that
Cory called unacceptable. Its own message: *"a field that is a rescaled copy of
another cannot be weighted independently, and any study that tries will return a
null it did not earn."* A NEW participant appearing on the fresh board is a
finding, not noise.

**3. `test_qb_scoring_arbitrage::test_A_ZERO_BONUS_REPRODUCES_THE_BOARDS_OWN_RANKS`.**
No committed artifact is involved. It recomputes ranks from the board with a zero
bonus and asserts they equal the board's own `overall_rank`. A failure means
**the board's published ranks disagree with its own vorp ordering** — internal
inconsistency in the artifact Cory drafts from.

### 🟩 THREE THAT ARE GENUINELY DERIVED STALENESS

**4/5. `test_variance_inputs::{test_committed_artifact_matches_regeneration,
test_artifact_coverage_matches_board}`** — committed artifact vs a board that
moved 682 → 693 players. The classic committed-artifact-vs-regeneration species.

**6. `test_empirical_draft_value::test_board_replacement_constants_match_the_shipped_board`**
— hand-set constants (`BOARD_REPLACEMENT_2026`) against the live board's
replacement levels. Same **ratchet-against-today's-market** species as the ADP-sd
band tests, which are already `repo_parity`. Its docstring states the intent:
catch the case where *"the board's numbers move and these constants do not"*. So
a failure is a true statement that a study is now grading against a board that no
longer exists — real information, low urgency.

## WHAT THE PERMANENT FIX ACTUALLY IS

Not "regenerate everything." **Triage, then treat each class correctly:**

- **Derived staleness** (4, 5, 6) → belongs in the freshness registry with a
  `regenerate_command`, or `repo_parity`-marked for the ratchet species. Safe to
  automate, because regenerating them destroys no information.
- **Board assertions** (1, 2, 3) → must NEVER be auto-regenerated or marked, and
  must keep failing the publication gate. They are the only thing standing
  between a defective board and Cory's draft.

**The rule this yields, and it is the general one:** a check may be automated away
only if regenerating its subject cannot hide a defect. If regeneration would make
the assertion true regardless of the world, the check is load-bearing and the
failure is a message.

## WHAT I CANNOT DO AND WHO MUST

**I cannot confirm any of the three red ones.** Sleeper and FFC return HTTP 000
from the relay sandbox and the proxy refuses the preserved CI board with a 403, so
I cannot build or obtain the fresh board that would settle whether
`use_measured_ceiling` really came back false, which field joined the
constant-multiple family, or which ranks disagree.

**A must do this, and it is the first thing A should do today** — before any
regeneration, before any deploy:

1. Build a fresh board.
2. Run those three tests against it and read the actual values —
   `league_config.json`'s `use_measured_ceiling`, the sweep's new participant, the
   rank mismatch.
3. **If any is a real defect, the board must not publish until it is fixed.** The
   two-day freeze is not the emergency; publishing a board with the measured
   ceiling silently off would be.
4. Only then regenerate the three green ones and refire.
