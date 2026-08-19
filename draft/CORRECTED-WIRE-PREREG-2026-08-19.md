# PREREGISTRATION — the waiver level, computed from the ROOM instead of from ADP

**A, 2026-08-19, committed BEFORE the run.** Cory asked whether total-drafted-by-
position should be applied on top. **It should not be applied on top — it IS the
waiver level, and ours was computed from the wrong denominator.**

## THE DEFECT

`draft_plan.js` sets the waiver level as *"the best player unrostered after 150
spots"*, **draining the board in ADP order**. This room does not drain by ADP.
Measured across its own three completed drafts:

```
WR 52.3   RB 47.3   QB 16.0   TE 14.0   K 10.3   DEF 9.7      per 150-pick draft
```

**ADP order takes MORE quarterbacks than this room really takes, so it leaves a
worse one on the wire than reality. It takes FEWER running backs, so it leaves a
better one.** Both errors are large and both point the same way:

| | our wire | the room's actual leftover | error |
|---|---|---|---|
| **QB** | 319.0 | **342.9** | **24 too LOW** |
| **RB** | 112.0 | **81.1** | **31 too HIGH** |
| WR · TE · K · DEF | 124 · 124 · 134 · 112 | 127.5 · 131.0 · 129.2 · 103.0 | small |

## THE CORRECTION

```
waiver_level(q) = proj_mean of the (N_q + 1)-th best player at position q
N_q             = mean number of q drafted per 150-pick draft, THIS LEAGUE, 2023-25
```

**Nothing else changes.** Same `P(start | available)`, same `C`, same form. **One
input, recomputed from the room's revealed behaviour instead of from an ADP
assumption.**

## PREDICTIONS

**P165 — the corrected wire flips the comparison that has survived nine arms.**
Evaluated at a mid-draft pick, the **4th RB out-values the 2nd QB by at least
2×**, where today it loses.

**FALSE if the ratio is under 2×.**

**P166 — and the average draft moves toward what Cory already knows.** Over the
same 300 simulated rooms, the mean roster has **QB ≤ 1.4** and **RB ≥ 3.0
drafted**, against today's **1.85** and **2.20**.

**FALSE if either misses.** ⚠️ **These are directional bars, not Cory's full
spec** — I am testing whether the correction moves the right way and by a real
amount, not declaring the model finished.

## CONTROLS

1. **The consumption counts come from `drafts[].picks`**, three seasons, and each
   season's total must be ~150.
2. **Every corrected level must be a real player's projection**, named in the
   output, not an interpolation.
3. **The four small positions must move by less than 15 points** — if correcting
   the denominator moves WR/TE/K/DEF a lot, the old levels were wrong for a
   different reason and this explanation is incomplete.
4. Unchanged: 300 differing rooms, same picks and keepers, source artifacts must
   have passed their own controls.

## GUARD

**REPORT ONLY.** `draft_plan.js` is not touched — it feeds `seat_plan.json`, which
the war room reads. **The corrected levels live in the diagnostic and the room
simulator only, and nothing ships before Saturday.**
