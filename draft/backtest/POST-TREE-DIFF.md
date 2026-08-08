# POST-TREE DIFF — the tree RELABELLED, it did not change behaviour

_Measured 2026-08-08, grind item #3. Regenerate: `node draft/tools/intervention_rate.js --diff 25`._

## The one question this answers

`pre-tree-baseline.json` was frozen **before** the decision-tree vocabulary
landed for exactly one purpose: to tell, after the fact, whether the tree
**changed** how the model deviates or merely **labelled** the deviations it was
already making. Those are different things, and a staged surface hides the
difference — "Stage 2 — consensus baseline" printed next to a pick reads like
the pick came from consensus even when the arithmetic never consulted a stage.

## The verdict: RELABELLED — byte-identical

Same board (`built_at 2026-08-08T08:51:41Z`), same seeds, same opponent model —
a fair diff of the tree, not the board.

| metric | baseline (93ad39b) | current (1d8667a) | Δ |
|---|---|---|---|
| deviation rate | 73.7% | 73.7% | **0.0** |
| per-draft mean | 8.84 | 8.84 | **0.00** |
| mean magnitude | 17.06 picks | 17.06 picks | **0.00** |
| reaches / falls | 212 / 9 | 212 / 9 | **0 / 0** |
| dead weight | bye, survival | bye, survival | same |
| lead-driver ranking | need > value > ceiling > keeper > stack | (identical) | same |

Every number is byte-identical. Nothing moved.

## Why — and it is structural, not a coincidence

`engine.js` and the recommendation path **never call `stages.js`.** The pick is
still whatever the composite `E.recommend` produces; `stages.js` is a legend
printed over it and wired only into the surface. So:

> **Stage 2 is a label, not an anchor.**

The commit that shipped the tree said so plainly ("The point is not new
arithmetic"). This diff is the mechanical proof of that claim: a real Stage-2
anchor would mean the default answer is consensus order and a deviation has to be
*earned* off it by a later stage — which would necessarily move the rate. It did
not move, so the anchoring was not built. The vocabulary shipped; the structure
did not.

## What this does NOT let anyone conclude

The tree is not worthless — a recommendation can now **name where it came from**,
so a disagreement has an address, and Stage 4 ships visibly unsized. That is a
real legibility win. But it must not be read as "we tamed the 73.7% rate." **The
73.7% rate is fully intact.** Reporting the tree as behaviour-shaping would be the
tier-voice failure one layer up: a label claiming a state the system is not in.

## The consequence — filed as D14

Making Stage 2 a *real* anchor would drop the rate by suppressing deviations —
and per this baseline's own contract, that is a **change to recommendations that
must be justified on its own evidence, not inherited from the restructure.** The
deviations most in need of justification are the ones bought by `value` (any-count
221/221, classed **untested** — our own projections, never raced against the
market, exp 33 unrun) and the reaches (212 of 221 interventions). The evidence
that would tell us *which* deviations deserve to survive an anchor — exp 33 and
34 — is blocked (D13). So anchoring now would suppress deviations on a guess. See
`DECISIONS-NEEDED.md` → **D14**.
