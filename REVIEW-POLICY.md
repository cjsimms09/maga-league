# INDEPENDENT-REVIEW POLICY — when the OpenAI audit earns its cost

_Written 2026-08-15 on Cory's ruling: **"It should audit but also not be over
used as it cost money everytime."** Mechanism: `tools/independent_review.py`
via `.github/workflows/independent-review.yml` (manual dispatch only, GPT-5,
key in the `Review_ChatGPT` environment). Each run costs one large-context
GPT-5 call plus CI minutes — single-digit dollars, not pennies: a real line
item at per-commit frequency, a rounding error at per-decision frequency._

## THE RULE IN ONE LINE

**Review DECISIONS, not commits.** The audit's value is an independent set of
eyes on something a human will ACT on; its cost is per-run. So it fires at the
moments where a wrong claim would propagate — and never as a habit attached to
routine work our own suites already gate.

## FIRE A REVIEW (these earned it, with receipts)

1. **A claim Cory will decide on** — anything feeding a ship/no-ship ruling,
   an anchor change, a certified number. *Receipt: the review of the
   bench-wire claim returned BLOCK on the prose-only version and forced the
   committed simulator + artifact that now underpin the VONA_WIRE_BENCH
   decision file.*
2. **A change to a certified or scoring-adjacent number** — the L0 leak
   figures, grader outputs, projection composition. *Receipt: the L0-fix
   review caught a dollars-vs-points units error and a wrong claim about an
   inclusive count that was actually exclusive. Both were mine, both real.*
3. **The whole-branch pre-handoff audit** — ONE review of the full diff with
   a claim file, immediately before A (or Cory) is asked to accept a body of
   work. This is the batching rule: ten commits, one review. *Receipt: the
   relay branch's whole-branch review against
   `draft/audit/relay_branch_claim_2026-08-15.md`.*
4. **A dispute** — when two lanes (or a lane and its own earlier claim)
   disagree about what is true and the disagreement moves a number. Cheaper
   than letting Cory arbitrate blind.

## DO NOT FIRE A REVIEW FOR

- routine commits that suites already gate (test-green fixes, refactors)
- documentation, data archives, CI plumbing
- work a re-run of our own tests can verify (that is what the tests are for)
- a second review of the same claim after fixing the findings — fold the
  response into the claim file's REVISION HISTORY and let the next
  *scheduled* moment (the pre-handoff audit) re-cover it, unless the fix
  itself changed a certified number (rule 2 applies fresh)
- reassurance. A review fired "to be safe" on work nothing disputes is the
  overuse Cory named.

## HOW TO FIRE ONE (the parts that make the money worth it)

- **Always pass a claim file** (`claim_path`) with the six sections: what ran
  / what came back / what it proves / what it does NOT prove / uncertainty /
  next step. A review without a claim grades the diff against nothing and
  returns generic caution — that run is wasted money. Existing examples:
  `draft/audit/*_claim_*.md`, `draft/audit/relay_branch_claim_2026-08-15.md`.
- **Record the verdict** in the claim file's REVISION HISTORY (verbatim quote
  of what it caught or approved), so the next session doesn't re-fire to
  learn what the last run said.
- **Answer a BLOCK with evidence, not prose** — the bench-wire BLOCK was
  answered with committed code, data, and a simulator; that is the pattern.
- `self_test: true` (grading the reviewer against a known-null diff) is a
  calibration tool: run it when the reviewer's judgment is itself in doubt,
  roughly monthly, not per-review.

## THE BUDGET FRAME

Expected cadence under this policy: ~1 review per handed-off body of work +
~1 per Cory-decision claim + rare disputes — single digits per week, versus
the dozens/week that per-commit firing would produce. If a week ever needs
more than ~5, the queue of decisions is the problem to fix, not the review
budget.
