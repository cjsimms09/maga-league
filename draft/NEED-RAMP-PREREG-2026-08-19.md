# PREREGISTRATION — need should get LOUDER as the draft goes on

**A, 2026-08-19, committed BEFORE the run.**

**Cory:** *"I think we are actually missing a dynamic with need. the need doesnt
need to be that big of the equation at first, should get louder or weighted more
as the draft goes on. this way we are drafting value first and need becomes a
higher variable when it needs to.. ie will almost force draft a def and k in the
last 2 rounds"*

**He is right, and it also dissolves the double-count that killed P155** — early
in the draft, need should not be multiplying anything at all.

---

## THE FORM

```
value(p, t) = ( proj_mean(p) − waiver_level(pos) )
              × [ (1 − λ(t)) + λ(t) × need(pos, held) ]
```

**At `λ = 0` the bracket is 1 and the model is pure value.** At `λ = 1` it is the
need-weighted model. **Nothing is ever zeroed early**, which is Cory's *"never at
0 … or you miss extreme value"* applied to the schedule instead of to a position.

## ⭐ AND λ IS DERIVED, NOT TUNED — this is the part that matters

```
λ(t) = min( 1 , unfilled starting slots / picks remaining )
```

- **12 picks left, 6 starting slots open** → λ = 0.5 → need is half the story.
- **2 picks left, 2 slots open (K and DEF)** → **λ = 1.0 → need is everything**,
  and `need = 1.0` for a slot you cannot field. **That is Cory's "almost force
  draft a def and k in the last 2 rounds", falling out of the arithmetic.**
- **All slots filled** → λ = 0 → **pure value for the rest of the draft.**

**There is no constant here for me to choose.** λ is a ratio of two things the
roster already knows, and it is the honest statement of urgency: *how badly do I
still need bodies, relative to how many chances I have left.*

## WHY THIS FIXES P155'S DOUBLE COUNT

P155 charged for the wire twice — `(proj − waiver)` **and** `(1 − streamability)`
inside `need`, at every pick. **Here the need bracket is DAMPED by `λ` early, so
the second charge only arrives when it is actually the operative question.** The
wire discount stops being a permanent tax and becomes what it should be: the
reason a late K or a 5th receiver is cheap.

## PREDICTIONS

**P156 — it forces the onesies late without being told to.** K and DEF are both
drafted, and both in **the last four picks** (rounds 11+ on Cory's schedule).

**FALSE if either is taken earlier, or either is missed entirely.**

**P157 — and value is not sacrificed.** Total projected points **≥ P144's 2309.5**
— that is, at least as good as the best arm so far, not merely within a band.

**FALSE if it comes in below.** ⚠️ **This is a hard bar and I set it deliberately:
seven arms have now traded shape against value, and the whole claim of the ramp is
that you should not have to.**

⚠️ **NO SHAPE PREDICTION, on purpose.** Cory: *"i dont want 6 rb 5wr.. it may end
that way but thats not a set roster."* Whatever roster it draws, it draws.

## CONTROLS

1. **λ ∈ [0,1]** at every pick, and reported per pick so the ramp is visible.
2. **λ = 1 when picks remaining ≤ unfilled slots** — the forcing case, checked.
3. **λ = 0 once all starting slots are filled** — the pure-value case, checked.
4. Both source artifacts (`measured_need_curve`, `streamability`) must have
   passed their own controls, or the module refuses to run.
5. Keepers counted, twelve picks on `draft_plan.SCHED`, room drained by ADP —
   identical to every other arm.

## GUARD

**REPORT ONLY.** No board field, no cap, nothing ships before Saturday.
