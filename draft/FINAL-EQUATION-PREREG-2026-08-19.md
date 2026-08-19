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
