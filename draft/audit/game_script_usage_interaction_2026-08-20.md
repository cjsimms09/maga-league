# USAGE-CONDITIONED GAME SCRIPT GRADED — FALSE, and it fails in every fold, not just on average

**Session D, 2026-08-20.** Grades the interaction arm preregistered in
`draft/GAME-SCRIPT-USAGE-PREREG-2026-08-20.md`, filed against `ROUTES.md`'s
2026-08-20 row *"CORY, DIRECT: we're taking into account game script for our
weekly projections..."* Tooling:
`draft/backtest/game_script_usage_interaction.py` (new, TERRITORY: D), tests:
`draft/tests/test_game_script_usage_interaction.py` (**11/11 pass**), full
machine-readable output: `draft/backtest/game_script_usage_interaction.json`.

**Headline: the usage-conditioned interaction arm is WORSE than both baselines
— not just short of the bar, negative — and negative in ALL FOUR gradable
folds, not a mixed result. It also all but fails its own correlation gate
against `v1_tilt` (0.9957, versus a 0.98 ceiling).** This is filed exactly as
loudly as the prereg's own §4 said a miss should be.

---

## 1. Data premise — confirmed clean, exactly as reported before the run

Coverage was checked and written into the prereg BEFORE any MAE or
correlation was computed (population counts only). Re-stated here because
this audit is the record of what actually ran:

| target season Y | eligible pop. (RB/WR/TE, ≥4 games) | graded player-weeks | excluded (no line) |
|---|---|---|---|
| 2022 | 406 | 3,437 | 91 (2.6%) |
| 2023 | 403 | 3,400 | 109 (3.1%) |
| 2024 | 382 | 3,482 | 104 (2.9%) |
| 2025 | 378 | 3,649 | 128 (3.4%) |
| **pooled** | — | **13,968** | — |

All 4 folds usable (2021 has no prior season on disk, matching `p151`'s
2021→22 precedent — not a new gap). 0 unmatched ids in every fold's identity
crosswalk (component_stats is already Sleeper-id-keyed at fetch time; see
prereg §1 for why an identity crosswalk is correct here, not a shortcut).
**The data supports the study as scoped — this is not a "the join was too
thin to grade" finding.**

## 2. The graded result, against the prereg's own bar

| | no_tilt (own_v6 stand-in) | v1_tilt (live arm) | interaction (challenger) |
|---|---|---|---|
| pooled MAE (n=13,968) | 4.5148 | 4.5037 | 4.5243 |

**ΔMAE_vs_v1 = MAE(v1) − MAE(interaction) = −0.0207** (bar: ≥ **+0.10**)
**ΔMAE_vs_notilt = MAE(no_tilt) − MAE(interaction) = −0.0096** (bar: ≥ **+0.10**)

Both negative. The interaction arm is measurably WORSE than the flat,
game-script-blind baseline, and worse still than the live position-only tilt.

| season | ΔMAE vs v1 | ΔMAE vs no_tilt | sign |
|---|---|---|---|
| 2022 | −0.0306 | −0.0378 | both negative |
| 2023 | −0.0108 | +0.0233 | v1-comparison negative |
| 2024 | −0.0101 | +0.0068 | v1-comparison negative |
| 2025 | −0.0305 | −0.0293 | both negative |

**ΔMAE_vs_v1 is negative in 4 of 4 folds — 0/4 positive, against a bar that
required ≥3/4.** This is not a pooled average dragged down by one bad fold;
every single fold points the same direction against the harder baseline.

**Correlation gate:** ρ(interaction, v1_tilt) = **0.9957** (≥ the 0.98
ceiling — FAILS), ρ(interaction, no_tilt) = 0.9842 (clears). Needed BOTH
under 0.98; got one. **The interaction arm is nearly a relabeling of `v1_tilt`
population-wide** — consistent with, and explaining, why its MAE tracks so
close to v1's (4.5243 vs 4.5037, a 0.02 pooled gap) while still landing on
the wrong side of it.

**Result against the prereg's four-part bar (§4): 0 of 4 conditions hold.**
`clears: false`, verified in `game_script_usage_interaction.json`'s own
`pooled.clears` field, not asserted separately from what the tool computed.

## 3. What the population actually looked like (Rule 3i — not just the ratio)

`pos_mean_share` per fold (the interaction's own normalizing denominator) sat
in a tight, sane range across all 4 folds — RB 0.124–0.141, WR 0.101–0.110,
TE 0.069–0.076 — no fold's population was degenerate or a single-player
artifact. The mechanism itself was exercised for real: this is not a null
produced by a formula that never fires (the known-positive test in §5 below
independently confirms a real bell-cow/committee split produces a >0.5-point
prediction gap under the same formula run on synthetic-but-realistic inputs).
**The interaction ran on a healthy population and still lost** — that is a
substantive finding about the feature, not a wiring failure.

## 4. Why this direction is plausible, not just possible

`vegas_team_arm_2026-08-17.md` (register 18's successor, `clears: true` at
the time, later retracted by its own author for a badly-designed bar) already
found the real team-level Vegas signal "buys essentially nothing" at weekly
grain — best case +0.002 to +0.008 MAE, an order of magnitude below any
honest bar. **This study's own baselines corroborate that finding
independently**: `v1_tilt`'s pooled advantage over `no_tilt` here is
**+0.0111** MAE (4.5148 → 4.5037) — small, on the same order as register 18's
already-flagged non-signal, computed on an entirely different population
(this study's RB/WR/TE-only, ≥4-games eligible set, not register 18's
eligibility rule). **Layering a further usage-share conditioning on top of an
already-thin signal, using SHARE ESTIMATED FROM ONLY THE PRIOR SEASON (itself
noisy at the player level), is exactly the shape that adds variance without
adding accuracy** — the interaction term amplifies the position tilt for
high-share players and dampens it for low-share players, but if the
underlying position-level tilt is mostly noise to begin with, amplifying it
selectively just moves the noise around rather than correcting it.

## 5. Rule 3e — the mechanism control, independent of the substantive result

Because a null with no working-mechanism proof is indistinguishable from a
null caused by a disconnected formula (Rule 3e), the test file verifies the
interaction term DOES fire, on realistic synthetic inputs, before trusting
the real-data null above:

* `test_bellcow_and_committee_get_DIFFERENT_interaction_tilts_same_everything
  _else` — same position, `vg[pos]`, delta and `baseline_pg`; only usage
  differs (0.30 vs 0.05 share, pos mean 0.12). The interaction arm separates
  them by **>0.5 points**; `v1_tilt` (correctly) cannot tell them apart at
  all — the exact gap this study exists to close, mechanically confirmed.
* `test_multiplier_of_ONE_for_everyone_collapses_interaction_to_v1_EXACTLY` —
  the known-negative/fail-arm: at the no-information point (multiplier=1 for
  everyone) the interaction formula is algebraically IDENTICAL to `v1_tilt`,
  not merely close. A stray offset or a term wired independent of usage would
  fail this and did not.

**11/11 tests pass.** The mechanism is real and correctly wired; the real
2021-2025 data still says it does not help, and modestly hurts.

## 6. Rule 3g — the three follow-up questions

* **Does this imply another failure we have not looked for?** Yes, and it is
  named in §4 rather than newly discovered here: the entire team-level Vegas
  tilt channel (`vg[pos]`, `v1_tilt`) is thin (register 18 / `vegas_team_arm`,
  independently reproduced by this study's own no_tilt-vs-v1_tilt gap of
  +0.0111). **Any FUTURE arm that further conditions the existing tilt** — by
  usage, by home/away, by anything — inherits a weak base signal and should
  budget for the same risk this study hit: amplifying a thin signal by a
  noisy conditioning variable can easily turn a small positive into a small
  negative, as it did here.
* **Does it invalidate something we already trust?** No shipped arm changes.
  `v1` stays champion, unchanged, ungraded by this study (this study never
  touched `weekly_own_projection.py`, `own_model_v5.py`, or
  `nflverse_usage.py`, per task scope). It does soften confidence in any
  *future* proposal to layer more per-player conditioning onto the existing
  tilt without first asking whether the base tilt itself is worth
  strengthening — a two-part question this study answers the second half of.
* **Is this routed to the lane that can actually act?** Yes: FALSE routes per
  the prereg's own §5 CONSEQUENCE ROUTE — usage-conditioning is not worth the
  added complexity at this population size; the position-only `v1` tilt
  stands as the shipped answer to Cory's game-script question, and A gets
  this filing so the question does not get re-asked without new data. The
  ROUTES row's owner was **D (prereg) + A (ship/no-ship)** — A's call here is
  simple: nothing to ship, no code change proposed.

## 7. Files created, tests

- **New prereg:** `draft/GAME-SCRIPT-USAGE-PREREG-2026-08-20.md` (TERRITORY:
  D) — formula, gate, bar and null-definition, all fixed before this file's
  numbers existed.
- **New tool:** `draft/backtest/game_script_usage_interaction.py`
  (TERRITORY: D) — `eligible_population`, `week_deltas`, `usage_multiplier`,
  `arm_predictions`, `grade_fold`, `pooled_grade`, `spearman`, `main`.
  Imports `weekly_own_projection.implied_from_vegas_store` /
  `weekly_own_projection.VG` and `nflverse_usage.usage_shares` unchanged
  (Rule 11) — no logic reimplemented, no TERRITORY-marked file edited.
- **New test file:** `draft/tests/test_game_script_usage_interaction.py`
  (TERRITORY: D) — **11/11 pass** (`python3 -m pytest draft/tests/
  test_game_script_usage_interaction.py -q`). Known-positive (bell-cow vs
  committee separation under a real swing, both signs), known-negative
  (multiplier-of-one collapse to `v1_tilt` exactly), clip-bound pins, the
  leak-guard call-site check, the identity-crosswalk pin, `spearman`
  correctness pins, and a real-data smoke test on the 2023 fold.
- **Output data:** `draft/backtest/game_script_usage_interaction.json` — full
  machine-readable result (all 4 folds, pooled grade, correlation gate,
  `pooled.clears`).
- **This report:** `draft/audit/game_script_usage_interaction_2026-08-20.md`.

**Not touched, per task scope:** `PREDICTION-LEDGER.md`, `DEFECT-REGISTER.md`,
`ROUTES.md`, `draft/data/register_id_watermark.json`,
`draft/weekly_own_projection.py`, `draft/backtest/own_model_v5.py`,
`draft/backtest/nflverse_usage.py`, `public/draft_data.json` — the calling
session hand-merges this row (status **GRADED**, result **FALSE — pooled
ΔMAE −0.021 vs v1_tilt and −0.010 vs no_tilt, both below the +0.10 bar and
both negative; 0/4 folds positive vs v1 against a ≥3/4 requirement;
correlation gate fails against v1_tilt at 0.9957**) and any register/routing
follow-up from here.
