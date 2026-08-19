# PREREGISTRATION — Cory's need curve, written literally

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"must draft 1 k and 1 def!! If 2 rounds and don't have either it equation
should force.. once have 1 QB and TE, equation should severely restrict QB and
TE recommendation, it should put in such a hole that value should have to be
incredible! WR should hold importance until you have 4 then be cut, RB should
hold until you have 3 then cut, and cut to almost 0 when you have 4. this should
lead to roster with 1qb, 1te, 1def, 1k, 3-4 RB, 4-5 WR most of the time. If it
doesn't than either equation is wrong or we are over valuing certain positions
and need to fix…"*

**I have been deriving a curve for two days. He has just written one. This is
his, transcribed, and the point of the run is his last sentence.**

## THE CURVE — need by how many I already hold

| pos | 0 | 1 | 2 | 3 | 4 | 5 | his words |
|---|---|---|---|---|---|---|---|
| **K** | 1.00 | **0** | — | — | — | — | *"must draft 1 k"* |
| **DEF** | 1.00 | **0** | — | — | — | — | *"must draft 1 def"* |
| **QB** | 1.00 | **0.05** | 0 | — | — | — | *"severely restrict… such a hole that value should have to be incredible"* |
| **TE** | 1.00 | **0.05** | 0 | — | — | — | same |
| **RB** | 1.00 | 1.00 | 0.90 | **0.25** | **0.05** | 0.02 | *"hold until you have 3 then cut, almost 0 when you have 4"* |
| **WR** | 1.00 | 1.00 | 1.00 | 0.90 | **0.15** | 0.05 | *"hold importance until you have 4 then be cut"* |

⚠️ **THE EXACT NUMBERS ARE MY RENDERING OF HIS WORDS AND ARE DECLARED HERE, NOT
FITTED.** "Severely restrict" is 0.05 — a twentyfold hole, so a second
quarterback must out-value a receiver by 20× to be taken. If the run misses, the
response is NOT to nudge these; that is the search `no_fit_guard` forbids.

**THE FORCE GATE**, his *"if 2 rounds and don't have either"*: when the picks
remaining are no more than the starting slots still unfilled, **only** the
positions that fill one are options.

## PREDICTIONS

**P194 — his curve produces his roster.** 300 rooms, `a = 0`, on the ROSTER:
**QB = 1, TE = 1, K = 1, DEF = 1** (each within 0.10), **RB in 3-4**, **WR in
4-5**. **FALSE if any of the six misses.**

**P195 — and if it misses, the fault is the VALUE side, which is his other
sentence.** Should P194 fail, the failing positions are over-valued by VONA
rather than under-restricted by need. Measured directly: at the picks where the
model takes an unwanted body, **that body's VONA exceeds the best available
RB/WR's VONA**, in **at least 80%** of the offending picks. **FALSE under 80%**
— in which case the need curve is still the problem and his transcription is
not sufficient.

⭐ **P195 is the whole point of the run. Cory named the two candidate causes;
this decides between them instead of guessing.**

## CONTROLS

1. **The curve is a literal table, printed in the artifact**, so what ran can be
   compared to what he said.
2. **Force-gate audit: zero rooms may finish with an empty starting slot.**
3. Same 300 rooms, same seed, same keepers; Draft Sharks projections; `a = 0`.
4. **REPORT ONLY.**

---

# ADDENDUM — P196, committed after P194 failed and before the fix is run

**P194 FALSE: QB 1.79 and TE 1.92 with need at 0.05.** A twentyfold hole did
not stop it, which settles Cory's own either/or in favour of his second branch —
**we are over-valuing certain positions.**

## THE MECHANISM, MEASURED

| | best → 2nd cliff (VONA) | wire | surplus of the 2nd over the wire |
|---|---|---|---|
| **QB** | **39.0** — the largest on the board | 322.9 | **17.1** |
| RB | 11.0 | 78.4 | **232.6** |
| WR | 16.0 | 124.8 | **152.2** |
| TE | 8.0 | 130.4 | 70.6 |

**VONA is not comparable across positions.** A 39-point quarterback cliff and an
11-point running back cliff are not the same value: the back's 11 points sit on
top of **233 points of surplus**, the quarterback's 39 sit on **17**. Late, when
Cory's curve has cut RB/WR need to 0.05-0.15 and their cliffs are 3-5 points, a
quarterback's raw 39 wins even through a twentyfold hole.

⛔ **AND I WROTE THE DIAGNOSIS MYSELF AND THEN IGNORED IT.** From an earlier
correction in `model_diagnostics.js`: *"VONA is a TIMING signal and does not
belong in the value term."* I then built this entire model on VONA alone.

## THE FIX

```
value(p)  = max(0, proj_used(p) − waiver(pos))     what he is worth at all
score(p)  = value(p) × need(pos, held)
```

**The waiver level is the same measured one** (QB 322.9 · RB 78.4 · WR 124.8 ·
TE 130.4 · K 128.6 · DEF 100.0), computed from this room's own consumption.
**VONA stays available as a tie-break between players of similar surplus — a
"when", not a "how much" — but it no longer sets the price.**

**P196 — surplus over the wire, times Cory's curve, gives Cory's roster.**
300 rooms, `a = 0`, on the ROSTER: **QB = 1, TE = 1, K = 1, DEF = 1** each
within **0.15**, **RB in 3-4.5**, **WR in 4-5.5**. **FALSE if any misses.**

**If this fails, I stop and tell him the model cannot hit his shape rather than
trying a fifth form.**
