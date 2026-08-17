<!-- TERRITORY: A -->
# PREREGISTRATION — GIVE THE BACKTEST HARNESS A REAL CEILING

**Committed BEFORE the change and before any re-run. No numbers in this commit.**

**Cory, 2026-08-17:** *"Find whatever other study would be void based off this
this info and redo it!!"*

---

## 1. THE PRODUCTION BOARD WAS FIXED. THE HARNESS STILL MANUFACTURES THE DEFECT.

`build_bundle.py` writes, for every player on every backtest board:

```python
"proj_sd":      round((pm or 0.0) * 0.25, 2),
"proj_ceiling": round((pm or 0.0) * 1.35, 2),
```

A **global** constant, not even a per-band one. So on a bundle board
`proj_ceiling` is `1.35 × proj_mean` exactly, and `engine.js`'s ceiling term —
`rawSpread = proj_ceiling − proj_mean` — is `0.35 × proj_mean`: **a fixed
multiple of the value term.** `lab_ceiling_degeneracy.js` measured Spearman
1.0000 and wrote the verdict this prereg exists to act on:

> *THE MEASUREMENT COULD NOT HAVE COME OUT ANY OTHER WAY.*

That is why `MEASURED_WEIGHTS.ceiling = 0`, and why the file says the zero
*"should stay until a real-ceiling board re-runs the experiment."*

**The production board now has a measured ceiling. The harness does not.** Every
weight experiment still runs against a board whose ceiling is the projection
rescaled, so re-running the ceiling experiment today would reproduce the
original result for the original reason. The harness is the blocker.

Three more fields are wrong in the same place, and two are simply **absent**:

| field | bundle board today | production today |
|---|---|---|
| `proj_ceiling` | `1.35 × mean`, global | measured p90 per (position, band) |
| `proj_sd` | `0.25 × mean`, global | measured sd ratio per cell |
| `proj_floor` | **absent entirely** | measured p10 per cell |
| `weekly_sd` | **absent entirely** | derived from `proj_sd` |

A board missing a field the engine reads is not a smaller board, it is a
different one — the same lesson this harness already learned when it dropped
23–34% of real picks.

## 2. THE CHANGE

Replace the two synthetic constants with `projection_error.proj_ceiling_for` /
`proj_floor_for` / `proj_sd_for` — **the same appliers production uses**, so the
harness board and the board Cory drafts from are built the same way. Attach
`proj_floor` and `weekly_sd`, which the engine reads and the bundle never
supplied.

**`status="unmeasurable"` writes NOTHING, never a fallback.** `proj_sd_for`'s
own docstring is explicit that a global fallback *"is exactly how `0.25 *
proj_mean` reached the board, and a consumer cannot tell a fitted number from a
filled-in one."* An absent field must stay absent, and the bundle's
`synthetic_not_sourced` notes must be rewritten to say what is now real, what is
still missing, and why — a notes block that goes stale is the defect the capture
registry exists to prevent, one directory over.

## 3. THE LEAK, AND HOW IT IS REFUSED RATHER THAN MANAGED

The calibration is fitted over 2021–2025. Using it to build a **2023** replay
board would put 2023's own realized outcomes into the board a 2023 drafter is
graded on — foreknowledge no drafter had, and exactly the leak that disqualified
Sleeper in exp33.

`calibrate(..., exclude_season=S)` already exists and **raises** if handed a
bundle from the excluded season. Every season's board will be built from a
calibration fitted with that season held out. Leave-one-season-out, enforced by
the fitter rather than by my remembering.

Order of operations, because it looks circular and is not: the calibration needs
only `proj_mean` and actuals, never dispersion. So bundles are built first,
calibrated leave-one-out second, dispersion attached third.

## 4. WHAT IS DECLARED IN ADVANCE ABOUT THE RE-RUN

**The collinearity will be REDUCED, NOT REMOVED, and I am saying so before I
measure it.** The bundle notes already predict this: *"A real per-player ceiling
measures 0.9745 against proj_mean, so fixing this would reduce the collinearity
WITHOUT removing it."* Production measures 0.9607 with 17 of 100 reordered.

The measured ceiling is still `proj_mean × a per-cell constant` — the
`constant_multiple_sweep` gate says so on the live board today. It varies
**between** cells and not **within** them. So:

- **A ceiling weight fitted on the fixed harness measures cross-band dispersion
  differences ONLY.** It cannot answer "should THIS player be taken for his
  upside", because no per-player dispersion signal is on either board yet.
- **The expected result is a null**, and a null is publishable. The effect being
  sought is small and the input is band-level.
- **If the re-run produces a non-zero ceiling weight, it does NOT ship before
  the draft.** Five days out, a weight that has been measured once is a worse
  instrument than a known one. Same rule as the phase-tuning prereg.

## 5. THE PASS/FAIL THAT MATTERS, DECLARED NOW

1. `lab_ceiling_degeneracy.js` on a rebuilt bundle must report Spearman
   **below 1.0** with a non-zero reordered count. If it still reports 1.0000,
   the change did not work and nothing downstream is interpretable.
2. `lab_term_degeneracy.js` must show the ceiling term taking **more than one
   distinct value** per cell boundary on the bundle board.
3. Existing bundle-consuming tests must still pass, or the board changed in a
   way beyond dispersion and that has to be explained before anything is graded.

**If (1) fails, the re-derivation is abandoned and reported as abandoned.**

## 6. WHAT MAY NOT HAPPEN

- No shipped weight changes from this work before 2026-08-22.
- `risk` stays UNMEASURED regardless of outcome — it is PARTIAL on the bundle
  board for a *different* reason (6 of production's 11–13 distinct values), and
  fixing the ceiling does not fix it. Reporting a risk optimum from this run
  would repeat the error being corrected.
- No re-fitting of `ADP_SD_RATE` rides along; that is a separate open decision
  (`adp_sd_ratchet_fired_2026-08-17.md`) and belongs to Cory.

**Refusal, "no evidence of a shift", and "abandoned at gate 1" are all valid
outcomes and need no further permission.**
