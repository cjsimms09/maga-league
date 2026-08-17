<!-- TERRITORY: A -->
# PREREGISTRATION — ARE THE VARIANCE MODIFIERS REAL, AND WHAT ARE THEY WORTH?

**Committed BEFORE the runner exists and before any number is produced.** If a
result appears in the same commit as this file, that discipline broke.

**Cory, 2026-08-17:** *"The ceiling shouldn't be a calculated value?? It should
be different depending on the player."* → then, on fitting the modifiers against
realized data rather than guessing them: **"Do test"**.

---

## 0. WHAT IS ACTUALLY UNDER TEST

`projections.player_variance()` spreads players around their position's base
volatility using **five hand-set modifiers**:

    VAR_WORKLOAD_BELLCOW   -0.18     share >= 20% of team opportunity
    VAR_WORKLOAD_COMMITTEE +0.14     share < 8%
    VAR_ROOKIE             +0.22     no NFL usage history
    VAR_SECOND_YEAR        +0.10
    VAR_BACKUP             +0.16     depth_chart_order >= 2
    VAR_INJURED            +0.12     carrying a designation now
    VAR_AGE_CLIFF          +0.06     past positional peak

**None of these was ever measured.** They are priors with decimal points — the
same class of object as `opportunity_cap`, which was graded on 2026-08-16, found
to be neutral on ordering and *worse* on level with a shuffled control
performing identically, and switched off. That precedent is why this test
exists: the STRUCTURE (a player-specific ceiling) is right, and Cory's objection
established that. The MAGNITUDES are unearned.

**The composition that consumes them ships OFF** (`player_spread_in_sd`). This
study is what decides whether it comes on, and with which numbers.

---

## 1. WHAT CANNOT BE FITTED — DECLARED BEFORE LOOKING, NOT AFTER FAILING

Two of the seven modifiers are **structurally unmeasurable from committed data**
and will be reported as **REFUSED**, never as an estimate:

- **`VAR_BACKUP`** needs `depth_chart_order` as it stood *before* each historical
  season. Depth charts in this repo are live Sleeper state, 2026 only. The
  opportunity-inheritance study hit the identical wall and recorded it.
- **`VAR_INJURED`** needs the injury designation a player carried at draft time
  in a past season. Never captured; live state only.

Substituting an end-of-season proxy for either would be **grading hindsight** —
a player who ended the year on IR obviously had a wild season, and "injured
players are volatile" measured that way is circular. Declared here so that a
tempting proxy cannot be adopted later and called a measurement.

Fittable: **`VAR_WORKLOAD_*`** (`tgt_share` is in `component_stats_{2021..2025}`),
**`VAR_ROOKIE` / `VAR_SECOND_YEAR`** (`nfl_exp = Y − draft_season` from the
committed period-correct capital store), **`VAR_AGE_CLIFF`** (with limitation 3).

---

## 2. DESIGN

**Outcome.** These modifiers scale a **season-level** sd — how far a season total
lands from its expectation — not week-to-week noise. So the measured quantity is
the **dispersion of the realized/expected ratio** within a group.

**The expectation must be leak-free**, and no historical projection exists (the
Sleeper/FP gap recorded in four places). So:

> **Anchor = the player's PRIOR-season total.** Available before season Y by
> construction. Cells are **position × prior-season-rank band**, mirroring
> `projection_error_calibration`'s own structure so the fitted multipliers drop
> into the same slot the band ratios occupy.

**Graded seasons: 2023, 2024, 2025** (each needs a prior season; 2022 needs 2021,
which exists, so 2022 is included where the anchor allows).

**Statistic.** Within each cell, for a flag F:

    ratio_sd(F=1) / ratio_sd(F=0)

That is exactly the multiplier `player_variance` applies, so a measured value
drops straight in. `> 1` means the flag really does widen the distribution.

**Rookies get their own arm.** A rookie has no prior season, so he cannot enter
a prior-rank cell — the same structural exclusion the opportunity study
escalated. The rookie arm is anchored on **NFL draft capital tier** instead, and
is declared UNDERPOWERED in advance.

---

## 3. DECISION RULE, FIXED NOW

A modifier is **SUPPORTED** only if all three hold:

1. The pooled `ratio_sd` ratio's 95% bootstrap CI **excludes 1.0**, in the
   direction the hand-set sign predicts; **and**
2. it holds in **≥ 2 of 3** graded seasons individually; **and**
3. the **shuffled-flag control** (§4) does **not** also clear (1).

**SUPPORTED → adopt the MEASURED multiplier, not the hand-set one.** A modifier
that survives but measures 1.03 when the code says 1.22 has still failed to
justify 1.22.

**NOT SUPPORTED → that modifier goes to 0.0** (no spread contribution), the same
disposal `opportunity_cap` got. If every fittable modifier fails, the whole
composition stays off and `player_spread_in_sd` is deleted rather than left as a
dark flag inviting a future guess.

---

## 4. CONTROLS

- **Shuffled-flag control.** Permute the flag within each cell and refit. If a
  scrambled flag separates the dispersions as well as the real one, the effect
  was cell composition, not the flag. This is the control that decided the
  position-weight study and it decides this one.
- **A flag with no mechanism.** Assign a flag by player-id parity and confirm it
  measures ~1.0. A pipeline that finds an effect there is broken.
- **Survivorship, reported not corrected.** Players with no weekly rows in Y are
  excluded (absent ≠ zero), which biases every dispersion DOWNWARD — the wildest
  outcome, a season that never happened, is the one systematically missing.

---

## 5. LIMITATIONS, DECLARED BEFORE ANY RESULT

1. **Prior-season total is a cruder anchor than a projection.** It ignores
   everything the market knows about a changed situation, so measured dispersion
   here is an upper bound on the dispersion around a real projection.
2. **Survivorship** (§4) — biases all dispersions down, unevenly.
3. **Age is as-of-2026 minus an offset.** Not outcome data, cannot leak, but it
   is a reconstruction rather than a record.
4. **Rookie arm is underpowered** and pre-declared so: ~15 rd1 WRs per the
   capital study, fewer at other positions.
5. **2021/2022 weekly stores are REBUILT offline**, licensed by an exact
   reproduction of the committed 2023 store (0 disagreements, 5,371
   player-weeks). If that stops being exact this study is void.
6. **Fitting sd ratios on ~3 seasons of cells is thin**, and the deep bands that
   carry the most players are also the ones most distorted by survivorship.

---

## 6. WHAT GETS COMMITTED

`variance_modifiers.py`, `variance_modifiers.json`, an audit doc with the
verdict, and tests with every gate two-armed.

**Refusal is a valid outcome and needs no further permission.** Given
`opportunity_cap`'s fate and ten consecutive strategy nulls, a null here is the
outcome to expect, and the composition shipping OFF is already the safe default.
