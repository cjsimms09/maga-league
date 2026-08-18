# PREREG — the game-total oracle's λ grid, and what damping an ORACLE means

_TERRITORY: D. Register 18b. Written 2026-08-18, **committed before
`oracle_lambda_sweep.py` exists.**_

## THE DEFECT BEING TESTED

`exp_weekly_env.py:50` — `DAMPENING = (1.0, 0.5)  # both reported, neither tuned`.

The game-total oracle scores **+0.2422 / +0.2138 ΔMAE at λ=0.5** and only
**+0.1412 / +0.1219 at λ=1.0**. λ=0.5 is the **grid minimum**, so:

1. the published **"+0.228 pooled ceiling" is a floor on the ceiling** — the
   optimum is unmeasured below 0.5; and
2. **an oracle that improves when shrunk toward no-op is the tell of a
   mis-specified form.** Perfect information about the week-w game total should
   not need to be halved. Something other than "game environment is weak" is
   producing that curve, and nobody has looked.

This matters beyond the oracle: `+0.23` is the number every Vegas-feature
decision in this project has been graded against, including D's own register-18
team arm.

## NO EGRESS, AND THE POPULATION IS ALREADY PROVEN TO MATCH

All inputs committed: team-game rows with realised points from
`exp_weekly_env_features.json`; outcomes from `nflverse_weekly_points_*.json`;
player→team from `component_stats_*.json`.

**`vegas_team_arm.py` already reproduces A's eval population exactly** — 2,179
(2023) and 2,259 (2024) rows, baseline MAE 5.6729 / 5.7369, both identical to
`exp_weekly_env.json`. This study reuses that path.

## GATE — the reproduction control, declared as VOIDING

**Before any new λ is read**, the sweep must reproduce A's published oracle
numbers at the two λ values that exist:

| | required |
|---|---|
| ΔMAE at λ=1.0 and λ=0.5, both seasons | within **±0.001** of `exp_weekly_env.json` |
| eligible rows, both seasons | exactly **2,179** and **2,259** |

**If the control fails the run is VOID and I report the discrepancy instead of
the sweep.** A grid extension that cannot reproduce the two points it extends is
measuring a different experiment.

## THE GRID

λ ∈ **{0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60,
0.70, 0.80, 0.90, 1.00, 1.25, 1.50}**

λ=0.00 is the baseline by construction (ΔMAE ≡ 0) and is included as an
arithmetic self-check. λ>1 is included so "interior" is testable from both
sides, not assumed.

## VERDICTS — written before the numbers exist

Let λ\* = argmax ΔMAE, required to agree in **both** seasons.

| verdict | condition | what it means |
|---|---|---|
| **INTERIOR** | λ\* strictly inside (0.05, 1.00) | the form is usable; the real ceiling is ΔMAE(λ\*), and **+0.228 was an underestimate**. Report the corrected ceiling. |
| **MONOTONE-TO-ZERO** | λ\* = 0.05, i.e. ΔMAE still rising as λ→0 | **the multiplicative form is MIS-SPECIFIED.** "+0.23" does not bound what game-environment information is worth; it measures how little of a wrong transform to apply. Register 18b's stated hypothesis. |
| **AT-OR-ABOVE-1** | λ\* ≥ 1.00 | the original grid was not the problem and 18b is withdrawn. |
| **DISAGREE** | the two seasons pick different λ\* | no interior optimum is claimed; report both curves and stop. |

**No verdict here licenses wiring anything.** The oracle is unshippable by
construction (it reads the outcome). This measures a CEILING and a functional
form, nothing else.

## THE MECHANISM DIAGNOSTIC, ALSO DECLARED IN ADVANCE

If the verdict is MONOTONE-TO-ZERO, one asymmetry is the obvious candidate and
is measured rather than guessed: **split ΔMAE by whether the team's oracle
multiplier is above or below 1.**

- damping helps **only on m>1** ⇒ a shootout does not lift every player on the
  roster proportionally (one player usually absorbs it), so the multiplicative
  form over-credits blowups;
- damping helps **on both sides** ⇒ the multiplier is simply too coarse a
  scalar, and the fix is per-position or per-role, not a smaller λ.

Recorded either way. The multiplier spread makes the first plausible in
advance — `min 0.07, max 2.006` — but plausible is not measured.

## WHAT THIS DOES NOT COVER

- **2023 and 2024 only** — the seasons `exp_weekly_env_features.json` holds.
- **The oracle arm only.** The three real arms (`pace_raw`, `pace_neutral`,
  `env_points`) are A's and are not re-graded here.
- **Not a claim about Vegas lines.** The oracle reads the REALISED total; a
  betting line is a forecast of it, and strictly worse.
- **No permutation null.** An oracle has no null — it is leaked by design. The
  reproduction control is what makes this run falsifiable.
