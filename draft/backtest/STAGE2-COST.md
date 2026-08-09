# WHAT A REAL STAGE 2 COSTS — a plan with a number

> **⚑ COST UNIT REVISED 2026-08-09 (Cory) — FORGONE VALUE, not spots or composite
> points.** The anchor's rule is: the market has set a price on this pick;
> deviating requires evidence that our player **clears that price**. The cost of a
> deviation = `value(ADP-preferred available) − value(our pick)` in projected
> points — comparable across rounds/positions/boards, and it prices tier cliffs for
> free. Evidence scaling by class (untested/weak/structural) applies to **whether
> the gap is cleared**, NOT to an arbitrary threshold — which is why the flat T=4.0
> cap was inert (4 composite points has no consistent relationship to cost). The
> re-weighting below is re-expressed in this unit; exp 34's forgone-value bands say
> how much of that gap our evidence has historically been able to justify, and that
> curve IS the binding function. (Caveat unchanged: correct pricing on top of
> unvalidated projections is still unvalidated — 33/34's job.)

_Written 2026-08-08 after `--diff` proved 0/300 picks changed identity: the tree
is a labeling layer, Stage 2 is not behavioral. This answers "what would it take
to make it real" concretely, not as options._

## The current mechanism, stated plainly

`recommend(ctx)` = `ctx.board.map(scorePlayer).sort(by score desc)`. The pick is
`argmax` of a composite `score = Σ wᵢ·termᵢ` (vona/vorp, need, tier, ceiling,
risk, keeper, bye, stack, + the Stage-3 doctrine tilt). **Consensus ADP is just
one input** (it feeds VONA via survival), not the anchor. The composite freely
reorders relative to ADP, which is the 73.7% deviation, 100% LEAN.

## 1. Mechanically, what changes — and which of the three it is

**It is a RE-WEIGHTING of the composite around an explicit consensus anchor,
inside `scorePlayer`.** Not a wrapper (a post-hoc re-sort is just another labeling
layer — the thing we are trying to stop), and not a from-scratch rewrite of
`recommend` (the sort → legality → rails → demotion → contested scaffolding is
correct and stays). Two concrete changes to the score assembly:

1. **An explicit anchor term.** Add a dominant `anchor = f(consensus rank)` so
   that, absent strong evidence, `argmax(score)` equals ADP order. The default
   answer becomes consensus.
2. **Evidence-scaled deviations.** Every non-anchor term is multiplied by its
   evidence class (already defined in `deviation.js` `EVIDENCE`): `untested`
   (value) × small, `weak` × small, `structural` (need) × full, `moderate`
   (ceiling/survival) × mid, `validated` × full. A term can move the pick off
   consensus only in proportion to the evidence behind it — the anchor doctrine's
   actual principle, applied to how the pick is CHOSEN, not just labeled.

The pick is still `argmax`, but of `anchor + Σ (class-scaled deviation)`, so it
starts at consensus and moves only when a well-classed term is genuinely strong.
That is behavioral: identity changes ≠ 0, and the rate drops because untested
`value` (any-count 221/221 today) can no longer buy a 17-pick reach.

## 2. How many days — honestly, in units

One substantial build unit ≈ one long session.

| unit | work |
|---|---|
| **1.0** | the anchor term + evidence-class scaling in `scorePlayer`; a `CFG.STAGE2` block for the class multipliers and anchor strength; wire Stage-3 doctrine tilt as one of the scaled terms |
| **0.25** | re-run the intervention rate; **re-freeze `stage2-baseline.json`**; the anchored-vs-composite `--diff` becomes the headline deliverable (how far did it move, and toward ADP?) |
| **1.0** | re-bless the tests/guards that asserted the old composite ordering (below) |
| **0.25** | re-check the Stage-3 doctrine band still holds relative to the anchor |

**≈ 2.5 units — call it 2 to 3 long sessions.** That is the honest number. The
"cheap version" (a post-hoc ADP re-sort wrapper) is ~2 hours and I am explicitly
NOT counting it, because it would be the sixth fake in the family.

## 3. What breaks

- **The pre-tree baseline stops being comparable — and that is the point.** It
  measured the un-anchored composite. A real Stage 2 changes picks by
  construction, so I freeze a NEW `stage2-baseline.json`; the OLD one stays as the
  "before". The diff between them IS the evidence that Stage 2 is behavioral.
- **robot-mock (145):** any scenario asserting a specific recommended player at a
  pick must be re-blessed against the anchored engine. Structural scenarios
  (legality, onesie demotion, keeper placement, seat identity) survive untouched.
  Estimate: a handful of pick-identity assertions.
- **engine.test.js (239):** term-level tests (vona, survival, tier, flex discount)
  survive; tests asserting a composite ordering or a specific top pick change.
  Estimate ~15–30% of the ordering assertions need re-blessing, none deleted.
- **intervention_rate.js + the `--diff`:** re-pointed at the new baseline; the
  tool itself is unchanged (it already measures identity and rate).
- **Stage-3 doctrine tilt:** becomes one scaled deviation term; its band guard
  stays but magnitudes are now relative to the anchor — the 0.25 re-check unit.
- **Deviation badge / `EVIDENCE_STATE`:** unchanged; it just fires far less,
  which is the intent.
- Calibration (exp 36) and the money grader are unaffected.

## 4. The smallest genuinely-behavioral version — the ~2-hour crude anchor

**Yes, there is one, and it beats the elegant fake.** A single evidence-gated
deviation cap in `recommend()`:

> After scoring, a player may only outrank a **lower-ADP** player when their net
> MATERIAL evidence-classed advantage — the same `D.drivers` the badge already
> computes — exceeds a threshold `T`. Otherwise, hold ADP order between them.

Concretely: sort by consensus rank, and permit a score-override to jump a player
only when `Σ material driver points ≥ T`. ~2 hours: a comparator in `recommend`
plus one threshold constant. It is **crude** (a hard bar, not proportional class
scaling) but **real** — a deviation now has to clear an evidence bar, so the rate
drops and identity changes ≠ 0. Ship this FIRST, measure it (re-freeze, diff),
then refine to the proportional class-scaled version.

## Sequencing with exp 34 (now unblocked, real ADP all 3 seasons)

**34 parameterizes the anchor's strength, so it runs before or alongside the
build.** If 34 says our deviations LOSE to real ADP on realized dollars, the
anchor should bind HARD (high `T` / small class multipliers) and Stage 2 stops
being a design preference and becomes the fix. If 34 says specific classes WIN,
the anchor binds loosely for exactly those classes. So: build the crude cap now
(honest and cheap), run 34, then set the binding strength from 34's per-class
measurement rather than a number chosen today — the same discipline as
PRE-REGISTRATION-34's "the size of small is not pre-registered".

**Recommendation:** approve the crude cap as a measured spike (2h, reversible,
its own baseline), keep the full re-weighting (2–3 sessions) gated on 34's result.
That way the 14-day decision is made against a measured anchor, not a guess.
