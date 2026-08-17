# PREREGISTRATION — WIRING REALIZED WEEKLY VOLATILITY ONTO THE BOARD

**Committed BEFORE the study is built or run. No numbers in this commit.**

**Written 2026-08-17, to be RUN AFTER the 2026-08-22 draft.** Deliberately: no
weight or field ships before the draft, and a design written after seeing
results is not a design. Writing it while the measurement is fresh and no
outcome data exists is the only moment a preregistration is worth anything.

---

## 1. WHAT THIS IS FOR — the defect that started the day

Every dispersion field on the board is `proj_mean × (a per-band constant)`:
Spearman **1.0000** against the projection inside a cell, i.e. exactly zero
player-specific information. Three conclusions traced to that single fact — the
zeroed `ceiling` weight, the phase grid's unearned null, the unmeasurable
variance modifiers.

`weekly_volatility.py` measured the input that could fix it. Realized weekly
`cv = sd/mean`, 2023-25, one scoring table:

- within a fixed mean band, cv spreads **1.57×–1.88×** p10→p90
- year-over-year persistence **rho +0.482 and +0.605**, both clearing a 400-draw
  permutation null; control (mean carryover) +0.740 / +0.781

**Volatility persists at roughly two thirds the strength of scoring LEVEL.** So
the question this study asks is narrow and real:

> Does replacing the per-band dispersion constant with a PER-PLAYER one, derived
> from realized volatility, produce better draft outcomes?

## 2. THE CONSTRUCTION TO BE TESTED

`proj_ceiling` and `proj_floor` currently come from `projection_error`'s measured
p90/p10 **per (position, band)**. The candidate keeps that as the cell baseline
and modulates it by the player's own volatility relative to his cell:

```
player_ratio = cv_player / cv_cell_median
ceiling = proj_mean × p90_ratio[cell] × f(player_ratio)
floor   = proj_mean × p10_ratio[cell] / f(player_ratio)
```

**`f` must preserve the cell mean**, exactly as `player_spread_in_sd` already
does for the sd path — otherwise the change is a level shift wearing a
dispersion change's clothes, and the grid would measure the wrong thing. That
constraint is declared here, before fitting, and its verification (cell mean
before ≈ after) is a gate, not a diagnostic.

## 3. THE MISSING POPULATION IS THE HARDEST PART, AND IT IS DECIDED NOW

**17% of the draftable board has no volatility, and they are not random.** 131
of 157 have one; of the 26 without, only 8 are rookies — **the rest are veterans
who missed 2025**, including Nabers (ADP 32), Garrett Wilson (45), Daniels (59)
and Evans (62). Early picks, not deep fliers.

**Declared before any result: a missing volatility is ABSENT, and the player
keeps his CELL constant.** He is not given the positional mean, which would hand
the steadiest available reading to precisely the injury-return group; and he is
not dropped, which would silently remove four early picks from the board.

**And the board must SAY which he got.** `proj_ceiling_source` already
distinguishes constructions (`measured-2023-25-p90` vs `gaussian_z`); a
per-player ceiling needs its own value, or 2027 sees one field name holding two
quantities — the exact error the `_source` stamps were added to prevent.

## 4. ARMS

1. **Control** — the shipped board (cell constants), unchanged.
2. **Per-player dispersion**, as §2, on players who have a volatility.
3. **Per-player dispersion + a non-zero `ceiling` weight.** The composite's
   `ceiling` weight is 0 because it measured collinear with `value`; if arm 2
   works, the weight becomes measurable for the first time and must be re-fitted
   rather than assumed.

Run on the **fixed harness** (`build_bundle` now carries measured
leave-one-season-out dispersion, CI-verified) and the **corrected money proxy**
(the keeper `weekly_sd` literal was fixed 2026-08-17; the old one biased against
variance, which is adjacent enough to matter here).

## 5. THE PREDICTION, DECLARED BEFORE THE RUN

**I do not predict the sign, and I am not manufacturing one.** What is declared
is a falsifiable SHAPE:

- If a per-player ceiling helps, the gain should concentrate where cells are
  WIDE and players inside them differ most — the deep bands, where cv spans
  widest and the cell constant is the crudest approximation.
- **A uniform gain across all bands would be evidence the mechanism is NOT the
  claimed one** and will be reported that way.
- **A null is a real possibility and is publishable.** The board already ranks
  by `value`, `ceiling` ships at 0, and it is entirely possible that better
  dispersion changes no pick that matters.

## 6. WHAT MAY NOT HAPPEN

- **Nothing ships from a single run.** That is what the graduation gate is for.
- **`risk` stays untouched.** `weekly_sd` remains collinear with the mean;
  reporting a risk optimum here would repeat the error being corrected.
- **No re-running with a different `f` after seeing the first result.** The
  functional form is fixed before fitting or the study is an exercise in
  choosing the curve that wins.
- **Snap-share volatility is NOT substituted in** if this nulls. It measures a
  weaker proxy for the same thing (rho +0.19 against +0.48/+0.60); swapping it
  in after a null would be a second bite at the same hypothesis.

## 7. LIMITATIONS

1. **Two transitions only.** The scoring-fingerprint guard refuses 2021-22, so
   persistence rests on 2023→24 and 2024→25 — enough to refuse a null twice, not
   enough to call the coefficient precise.
2. **Realized, not projected, volatility.** Prospective use is licensed by the
   persistence in §1 and by nothing else.
3. **N=2 graded seasons in the harness**, because 2025 cannot be graded (no
   nflverse weekly data; see `pbp_rebuild_2pt_gap_2026-08-17.md`). Every
   room-study caveat about small N applies unchanged.
4. One board, one seat, one keeper slate.

**Refusal, "no evidence of a shift", and "the mechanism is not the claimed one"
are all valid outcomes and need no further permission.**
