<!-- TERRITORY: A -->
# "TURN UP UPSIDE LATE" WAS NEVER TESTED — 2026-08-17

**Cory:** *"tune the auto function for best draft. Ie turn up upside as draft
gets later rounds"*

That idea is already implemented, was already measured, and was recorded as
**REFUTED**. This document is why that verdict does not stand.

## WHAT EXISTS

`autoWeights` already ramps by phase — Cory's idea, built:

| phase | rounds | need | tier | ceiling |
|---|---|---|---|---|
| Anchor | 1–2 | 0.35 | 1.35 | 0.45 |
| Build | 3–6 | 0.90 | 1.20 | 0.60 |
| Fill | 7–10 | 1.45 | 1.00 | 0.80 |
| Endgame | 11+ | — | — | **0.50** |

The endgame value carries this note:

> *exp 2 §5's per-phase grid: endgame ceiling 0.5 is BETTER (+$19, CI [7.5, 33])
> while 1.0 / 2.0 / 3.0 are all WORSE with CIs EXCLUDING ZERO. The designed
> "swing at upside in the endgame" hypothesis is REFUTED — moderate wins,
> aggressive burns money.*

## WHY THAT VERDICT IS VOID

The grid tuned the weight on a `ceiling` term computed from
`proj_ceiling = proj_mean + 1.036 × proj_sd`, where `proj_sd` is a per-band
multiple of the mean. `projections.py`'s own comment states the consequence in
the strongest possible terms:

> *UpsideBonus was, by construction, a fixed multiple of proj_mean — **Spearman
> 1.0000 against proj_mean at every position on the real board**, with the ratio
> a literal constant. It was not measuring upside; it was re-weighting the
> projection signal already inside VONA, and the ×1.6 late-draft multiplier
> amplified the duplicate.*

So the grid was not testing "does upside pay late." **It was testing what
happens when you multiply the projection signal by 1, 2, or 3 on top of a term
that already contains it.** That double-counts `value`, and of course it
measured worse with intervals excluding zero — that is what double-counting a
signal does.

**The finding is true and the label is wrong.** It reads as "upside does not pay
late." It actually says "double-counting the projection does not pay late."
Cory's hypothesis was never on the table.

## THE PART THAT MAKES THIS A LOOP, NOT A GAP

Someone found this exact defect and fixed it. `player_variance` exists precisely
to break the constant — its comment says *"A committee back and a bell-cow with
equal projections should not have equal ceilings"* — and it spreads players on
workload, depth chart, rookie status, injury and age.

**REC-1's band-level `proj_sd` then overwrote that function for every player on
the board**, returning the ceiling to a constant multiple of the mean and
restoring the defect the fix had removed. Measured before today's change:
within-cell variation in relative upside **0.0006**.

So the sequence is: defect found → fixed → silently undone by an unrelated
improvement → the stale verdict left standing on top of it. Nobody did anything
wrong at any single step.

## WHAT IS NOW DIFFERENT

`proj_ceiling` is the measured p90 of realized outcomes and `proj_floor` the
measured p10. Spearman(ceiling, mean) is 0.9955 rather than 1.0000 — **still
high, and that matters**: the ratio is per-BAND, so it is constant within a
cell. A phase grid re-run today would be testing a term with cross-band
information and no within-band information.

That is better than a perfect duplicate and it is **not yet a per-player upside
signal**. The honest statement is that a re-run would measure something real for
the first time, and would still be measuring a coarse instrument.

## THE TWO REGIMES, WHICH ARE NOT THE SAME BOARD

Worth stating plainly because it affects how any re-run must be designed:

- **Manual (default, `autoWeights` off):** `MEASURED_WEIGHTS` — five of eight
  terms at zero, `ceiling` among them. The phase ramp never runs.
- **Auto (opt-in):** built from `DEFAULT_WEIGHTS`, per-phase, `ceiling` 0.45→0.80
  and `need` 0.35→1.45 — terms the manual regime holds at 0.0.

These are different models. A grid fitted in one does not transfer to the other,
and the shipped default is the one where the ceiling never fires at all.

## WHAT A REAL TEST NEEDS

1. **Re-run the per-phase grid** against the measured ceiling — the arms the
   original grid ran, so the comparison is like-for-like.
2. **`need` first, not ceiling.** It moves 25/25 recommendations and ships at
   0.0 on a measurement of the wrong object; it is the larger lever by a wide
   margin.
3. **Both regimes**, or an explicit decision to grade only the shipped one.
4. **The per-player signal is still missing.** Until snap counts and routes run
   are pulled, "this player has upside" cannot be expressed at all, and a phase
   grid can only ever tune how hard to lean on a band average.
