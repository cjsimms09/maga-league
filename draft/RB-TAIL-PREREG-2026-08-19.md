# PREREGISTRATION — the RB tail is too thin, and it costs us EVERY year

**A, 2026-08-19, before the code and before the run.** Register 130.

> Cory: *"Beat humans for all 3 years! Study what the humans did, ask why
> tweak equation and make it better"*

## THE STUDY — what the humans did, and where we lose

Points HELD, builder minus owner, by position, per seat:

| season | QB | RB | WR | TE | K | DEF |
|---|---|---|---|---|---|---|
| 2023 | +20 | **−159** | −137 | +9 | +39 | +41 |
| 2024 | **−152** | **−107** | +95 | +19 | −14 | +33 |
| 2025 | −92 | **−122** | +18 | −25 | +82 | +49 |

**RB is negative in ALL THREE seasons — 159, 107, 122.** Nothing else is
consistent: WR swings −137 to +95, QB +20 to −152. **This is the only
cross-season loss on the board, which makes it the only one worth fixing on
three seasons of data.**

## WHY — three facts that point the same way

1. **The humans hold more backs.** All teams **4.73**, top-3 finishers **4.78**.
   Our builder holds **4.00**.
2. **RB is the MOST PREDICTABLE position we have** — persistence r = 0.572,
   and stable across all three seasons (0.49 / 0.67 / 0.57, range 0.18, n≈40).
   It is the one position where holding another good body is *capturable*
   rather than a coin flip.
3. **RB has the lowest waiver level on the board** (78.4 against WR 124.8), so
   the fall from a rostered back to a wire back is the steepest drop anywhere.

**And Cory's curve collapses exactly there:** `RB [1, 1, .90, .25, .05, .02]`.
The 5th back is worth 5% and the 6th 2%.

## THE CHANGE — a substitution, not a tune

Replace the RB row with the **measured** one that already exists and already
passed its own controls (`measured_need_curve.json`, 540 team-weeks):

```
Cory's    RB [1.000, 1.000, 0.900, 0.250, 0.050, 0.020]
measured  RB [0.869, 0.713, 0.490, 0.273, 0.155, 0.074]
```

RB4 barely moves (.250 → .273). **RB5 goes .05 → .155 and RB6 .02 → .074** —
the tail thickens, which is precisely the deficit. **Every other position keeps
Cory's row untouched.**

⚠️ **No number is chosen.** RB is also the one position whose measured curve is
backed by a stable r and n≈40, so it is the safest row in the file to trust.

## PREDICTIONS — Cory's bar, not mine

**P230 — POSITIVE IN ALL THREE SEASONS on the skill grade.** 2023 > 0, 2024 > 0
and 2025 > 0.

**FALSE if any season is negative.** ⚠️ **This is the bar that matters and it is
deliberately brutal.** Every arm measured tonight — mine and E's — is carried by
2025 and loses 2024. Cory asked to beat the humans in all three years; a mean is
no longer an acceptable answer.

**P231 — the RB hole actually closes.** Builder-minus-owner RB points held
improves in **all three** seasons, and mean RB drafted rises above **4.4**.

**FALSE otherwise** — then the row changed the score without changing the thing
it was aimed at.

**P232 — no legality regression.** 30 of 30 rosters legal.

## CONTROLS

1. **C1 KNOWN POSITIVE** — `w(RB,4)` must move 0.050 → 0.155 and `w(RB,5)`
   0.020 → 0.074, seen and reported.
2. **C2** — QB/WR/TE/K/DEF bit-identical at every holding.
3. **C3** — both gradings, per Cory's standing ruling.
4. **C4** — **report every season separately, never a pooled mean alone.** The
   pooled mean is what hid the 2025 concentration in the first place.

## GUARD

Ships only if **P230, P231 and P232** all hold. A mean that beats the humans
while losing a season does **not** count — that is the standard Cory set and it
is stricter than the one I have been using all night.
