# PREREGISTRATION — the equation, from Cory's five requirements

**A, 2026-08-19, committed BEFORE the run.**

**Cory's spec, verbatim:** *"need should ramp up in weight, pure value at
beginning, RB and WR should always retain some value, TE and QB need should tank
once you have one. K and DEF should be effectively 0 once you draft one and
should not be very loud until last few rounds."*

---

## ⭐ THE INSIGHT: I HAVE BEEN RAMPING THE WRONG TERM

Both previous forms ramped **all** of `need` uniformly — the linear blend
`(1−λ)+λ·need` and the exponent `need^λ`. **Neither can satisfy the spec, because
the spec asks two different things of two different quantities:**

| requirement | what it is really about |
|---|---|
| RB/WR retain value · QB/TE tank · K/DEF ≈ 0 after one | **DEPTH** — how fast need decays as you accumulate bodies |
| pure value early · K/DEF not loud until the last rounds | **URGENCY** — how badly an EMPTY slot needs filling, given picks left |

**Depth is a per-week start rate. It does not change with the calendar and must
NOT be ramped.** Urgency is entirely about the calendar and is the only thing that
should ramp. **Ramping them together is why every arm broke something.**

## THE EQUATION

```
value(p, t) = ( proj_mean(p) − waiver_level(pos) ) × weight(pos, held, t)

weight = λ(t)                     if held < S      ← EMPTY SLOT: urgency, ramped
       = depth(pos, held)         if held ≥ S      ← DEPTH: measured, never ramped

λ(t)   = min( 1 , unfilled starting slots / picks remaining )
depth  = measured_start_rate(pos, held+1) × ( 1 − streamability(pos) )
```

**Nothing new is introduced. Both pieces already exist and are both measured.**

## IT SATISFIES ALL FIVE, BY CONSTRUCTION

1. **Pure value early** — when slots are empty, every empty slot carries the *same*
   λ, so the comparison between them is **pure margin**.
2. **RB/WR always retain some** — `depth(RB,3) = 0.491`, `depth(WR,3) = 0.521`,
   **counted, and never ramped away.**
3. **QB/TE tank once you have one** — `depth(QB,1) = 0.175`,
   `depth(TE,1) = 0.156`.
4. **K/DEF effectively 0 after one** — `depth(K,1) = 0.029`,
   `depth(DEF,1) = 0.036`.
5. **K/DEF quiet until the last rounds** — an empty K slot weighs λ, but the K
   *margin* is only ~12 points, so early (λ≈0.4) it prices ~5 and loses to
   everything; late (λ=1.0) it prices ~12–20 and wins. **The quietness comes from
   the margin, the loudness from λ — neither is a rule.**

## P161

**Over the same 300 simulated rooms, the mean roster is `QB 1 · RB 4–5 ·
WR 4–5 · K 1 · DEF 1`.**

**Reported on BOTH readings** — drafted-only, and total including Cory's three
keepers — **because he has not yet said which he meant, and I am not guessing.**
**P161 is TRUE if EITHER reading satisfies all five bands.**

**FALSE if neither does.**

⚠️ **Fourth form. If it fails I stop proposing forms and report that the spec and
this board's value distribution are in tension**, because at that point three
independent shapes of the same idea will have failed and the honest conclusion is
about the board, not the algebra.

## CONTROLS

Unchanged from P158 — 300 differing rooms, `adp_sd` from the board, same twelve
picks and keepers, source artifacts must have passed their own controls, and the
deterministic run must fall inside the distribution.

**REPORT ONLY. No cap, no board field, nothing ships.**

---

# ADDENDUM — P162. Cory's rule is a GATE, not a weight.

**P161 FALSE** (QB 1.95, RB 2.20 drafted). Fourth form, fourth failure — and QB
came out **1.66–1.96 in all four**, which is an invariant, not noise.

**Then Cory said the thing that reframes it:**

> *"if value is best at RB and WR each round then we should take them until there
> are 4 picks remaining and we still need QB, TE, DEF, K… then RB and WR need goes
> to 0 and rest are only options then it should choose best value out of those.
> so picks remaining should have a role"*

## THAT IS A FEASIBILITY CONSTRAINT, AND I HAVE BEEN MODELLING IT AS A SOFT WEIGHT

**λ was always `unfilled slots / picks remaining`. I used it as a MULTIPLIER. Cory
is describing it as a SWITCH:**

```
mandatory = number of starting slots still unfilled

if picks_remaining <= mandatory:
      ELIGIBLE = only players at a position with an unfilled slot
      → RB/WR need is not "low", it is ZERO — they are not options
else:
      ELIGIBLE = everyone, best value wins

value(p) = ( proj − waiver ) × depth(pos, held)      [1.0 while the slot is empty]
```

**"Picks remaining should have a role" — it has exactly one, and it is
reservation.** You never let the number of things you MUST still fill exceed the
number of chances you have left.

## WHY THIS SHOULD FIX THE INVARIANT QB

The second quarterback wins on value only in the **101–150** band, where QB
margin (35) is the largest on the board. **Under the gate, those late picks are
reserved for unfilled slots — and QB is already filled, so a second one is not
eligible.** In the free window (picks 33–100) RB and WR margins are 96/58 against
QB's 58/43, so a backup QB never wins there either.

**The QB2 is squeezed out by the schedule, not by a penalty.** That is Cory's
sentence, implemented.

## P162

**Over the same 300 rooms, the mean roster is `QB 1 · RB 4–5 · WR 4–5 · K 1 ·
DEF 1`**, reported on both the drafted and the total-with-keepers reading.
**TRUE if either reading satisfies all five bands.**

**FALSE if neither does.**

## CONTROLS — one new, and it is the one that matters

**C6 — the gate must never make the roster illegal.** In every one of the 300
rooms, all six starting slots must be filled by the last pick. **If the gate ever
leaves a slot empty, the reservation arithmetic is wrong and the whole idea
fails.** Reported as a count, and the run fails if it is not zero.

Other controls unchanged. **REPORT ONLY. Nothing ships.**
