# The model, derived from the objective. No weights, no chosen constants.

**A, 2026-08-19.** Cory: *"I think we need to somewhat start from scratch here…
this equation is going to be complex but needs to make sense. we will know its
right when the outcomes match what we already know."*

---

## 1. THE OBJECTIVE — everything else is derived from this line

**You win by scoring more than your opponent, week by week. So a roster is worth
the points it puts in a STARTING LINEUP over the season.**

**A draft pick is therefore worth exactly one thing:**

> ### Δ(p) = E[season lineup points with p] − E[season lineup points without p]

**That is the whole model. Nothing else is a goal.** Not roster shape, not
positional balance, not upside — those are consequences, and if they do not fall
out, the derivation is wrong.

## 2. DECOMPOSING IT

Player *p* is at position *q*. If you roster him he becomes the **rank-*n*** body
you hold there. In any given week he either starts or he does not.

```
Δ(p) = Σ over the 17 weeks  P(he starts that week) × ( his points − the points of
                                                       whoever he displaces )
```

**Three quantities, and every one of them is a real, measurable thing:**

| | what it is | where it comes from |
|---|---|---|
| **W** | how many weeks he actually starts | **counted**, 540 team-weeks |
| **C** | his points per week **given that he started** | projection + spread |
| **R** | the points of whoever starts instead | **the alternative you actually have** |

```
Δ(p) = W(q, n) × ( C(p, n) − R(q, n) )
```

**Units: points-per-week × weeks = points.** Coherent end to end. **This is why
the shipped model cannot be repaired by tuning — it adds a probability to points,
and no coefficient fixes a unit error.**

## 3. W — EXPECTED WEEKS IN THE LINEUP

**Counted, not modelled.** From every lineup this league set in 2023-25, the
fraction of rostered weeks in which an owner's rank-*n* body at a position
actually started:

| | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---|---|---|---|---|---|
| RB | .869 | .713 | .490 | .273 | .155 | .074 |
| WR | .830 | .696 | .530 | .331 | .179 | .168 |
| QB | .693 | .427 | .407 | — | | |
| TE | .719 | .414 | .406 | — | | |
| K | .952 | .828 | — | | | |
| DEF | .823 | .484 | — | | | |

**W = 17 × that.** It contains injuries, byes, role changes and benchings without
modelling any of them. **It is the single most important input and it was a
positional injury constant until today.**

## 4. C — POINTS PER WEEK, CONDITIONAL ON STARTING

**This is where ceiling enters, and it is not a term you add.**

**A player who starts every week is worth his mean.** A player who starts a
quarter of the weeks starts *in the weeks he is good* — you bench him otherwise.
**So his conditional value is above his mean, and rises as his start rate falls.**

```
C(p, n)  =  W-share × proj_mean  +  (1 − W-share) × proj_ceiling      [per week]
```

- an every-week starter → **his mean**, ceiling contributes nothing
- a deep bench body → **near his ceiling**, because the only weeks that count are
  the ones where he broke out

**There is no 0.45 and no ramp constant. Ceiling gets louder as the roster fills,
because the start rate falls — the ramp IS the roster state.**

## 5. R — WHO HE DISPLACES. Two answers, and the argument I had with myself was false.

**I spent today treating VONA and waiver-replacement as competing. They are not —
they are the alternative at different roster ranks:**

| if p would be your… | the alternative you actually have | so R = |
|---|---|---|
| **starter** (n ≤ slots) | the best player still there **at your next pick** | **VONA** |
| **bench body** (n > slots) | the best player **free on the wire in week 6** | **waiver level** |

**That is why VONA looks right for early picks and the waiver level looks right
for late ones. Both were right, in their own half.**

⚠️ **And it settles the double-count**: `streamability` and the waiver level
answer the same question — *"could I have had this for free?"* — so multiplying
by both charges twice. **In this derivation streamability is not a separate
factor. It is already inside R.** That is the −9.3% arm, explained from first
principles rather than by inspection.

## 6. THE MODEL

```
Δ(p) = W(q, n) × ( C(p, n) − R(q, n) )

W(q, n) = 17 × measured_start_rate(q, n)                     counted, 540 team-weeks
C(p, n) = w̄ · proj_mean/17 + (1 − w̄) · proj_ceiling/17       w̄ = start rate
R(q, n) = VONA replacement  if n ≤ starting slots at q        from the live board
        = waiver level      if n >  starting slots at q        measured, 150 picks deep
```

**Take the highest Δ. That is the whole decision rule.**

**Nothing is weighted. Nothing is chosen. Every input is measured** — the start
rates from this league's lineups, the waiver levels from a 150-pick board, VONA
from the board, the projections from five sources.

## 7. WHAT SHOULD FALL OUT — the test Cory named

**We know it is right when the outcomes match what we already know.** Stated as
predictions before it runs, so it cannot be tuned toward them:

- **~1 QB.** QB's `W` collapses after one (.693 → .427) *and* its R is a
  319-point wire, so the second one has little weeks and little margin.
- **~1 TE**, for the same reason.
- **4–5 RB and 4–5 WR on the roster.** Their `W` stays high through four bodies
  (.273 / .331) and their wire is barren (112 / 124).
- **Exactly 1 K and 1 DEF, taken late.** `W` after one is .029 / .036 → the
  second is worth nothing; and early their *margin* is tiny, so they lose to
  everything until the alternative is nothing.
- **Ceiling only matters late**, because `C` is the mean while the slot is empty.
- **Ceiling never touches the first picks.**

**If any of those does not fall out, the derivation is wrong and I do not patch
it — I say which line failed.**

## 8. WHAT IS NOT IN IT, DELIBERATELY

**`keeper` and `stack` are gone from the score.** A keeper is a **cost** — a
forfeited pick — so it belongs on the price side, not in the value of a player.
Stacking is a **correlation between two players**, not a property of one, so it
cannot be a per-player term. **Both were additive terms with the same unit
problem, and neither has ever been graded.**

**`tier`, `risk` and `bye` are gone too** — all three ship at weight zero today
and none has ever been graded as non-zero.

## 9. THE ONE INPUT DEFECT THAT FEEDS THIS DIRECTLY

`proj_ceiling` on the live board is `mean + 1.28 × sd` — a Gaussian approximation
**labelled** `cross-source-p90`, and about **20% wider** than the published
construction (register 103). **§4 consumes it directly.** The form is right; the
ceiling number it eats needs the fix already filed.
