# RED-ZONE/END-ZONE OPPORTUNITY TILT GRADED — FALSE, and the mechanism is a
# degenerate population mean, not a subtle miss

**Session D, 2026-08-21.** Grades the arm preregistered in
`draft/TARGET-QUALITY-PREREG-2026-08-21.md`, filed against `ROUTES.md`'s
2026-08-20 relay dispatch, ASK 2. Tooling: `draft/backtest/
target_quality_tilt.py` (new, TERRITORY: D), tests: `draft/tests/
test_target_quality_tilt.py` (**10/10 pass**), full machine-readable output:
`draft/backtest/target_quality_tilt.json`.

**Headline: the `rz_tilt` arm is roughly TWICE as inaccurate as the flat
baseline — pooled MAE 9.07 vs 4.57 — and worse in all 4 folds. The
mechanism is real and named, not "the signal doesn't exist":** the
position-mean red-zone opportunity rate this study normalizes against is
tiny (RB 0.56, WR 0.18, TE 0.14 opportunities/game, pooled 2024), so a
multiplicative tilt bounded only by a ×3 clip routinely triples a player's
baseline points the moment he has ANY recent red-zone role — 17% of graded
player-weeks (506/2,924, 2024) hit the clip ceiling outright. **The same
error class register 59/P260 already named for the bench-option objective:
a signal computed as a ratio-to-population-mean is not a safe multiplicative
SCALE when that population's mean is small and right-skewed** — most weeks,
most players are nowhere near their own baseline_pg's neighborhood after a
×2-×3 multiply, and the study's own MAE says so loudly.

---

## 1 · Data premise — confirmed clean before any MAE was computed

Per the prereg §0, checked directly rather than assumed:

* Receivers enter `target_quality.json`'s weekly dict on ANY target: **100.0%
  join rate** (4235/4235, 2024) against `component_stats_2024.json`'s own
  `tgt>0` rows.
* Rush-only players (no target that week) enter ONLY on a real inside-10
  carry: **27.7%** (108/390, 2024) — the other 72.3% are legitimately zero
  red-zone-carry weeks, not a join failure, and the tooling's `rz_opps_by_
  pid_week` correctly defaults an absent pid to 0 (tested,
  `test_rz_opps_by_pid_week_treats_ABSENCE_as_zero_not_missing`).

| target season Y | eligible pop. (RB/WR/TE, ≥4 games Y−1) | graded player-weeks | excluded (< MIN_PRIOR_WEEKS) |
|---|---|---|---|
| 2022 | — | 2,863 | 665 |
| 2023 | — | 2,879 | 630 |
| 2024 | — | 2,924 | 662 |
| 2025 | — | 3,081 | 696 |
| **pooled** | — | **11,747** | — |

All 4 folds usable (2021 excluded — `baseline_pg` needs a Y−1 season, same
reason as the sibling game-script study). The ~19-23% excluded per fold are
players still inside their first 3 weeks of the season (`MIN_PRIOR_WEEKS`),
not a data gap.

## 2 · The graded result, against the prereg's own bar

| fold | MAE baseline_pg | MAE rz_tilt | ΔMAE | direction |
|---|---|---|---|---|
| 2022 | 4.5421 | 9.7486 | **−5.2065** | worse |
| 2023 | 4.5332 | 9.0183 | **−4.4851** | worse |
| 2024 | 4.6072 | 8.9849 | **−4.3777** | worse |
| 2025 | 4.5820 | 8.5852 | **−4.0032** | worse |
| **pooled** | **4.5666** | **9.0744** | **−4.5078** | **worse, 0/4 folds positive** |

Bar required ΔMAE ≥ +0.10 in ≥3/4 folds. **Missed by roughly 45× the bar's
own magnitude, in the wrong direction, in every single fold — not a
borderline miss.**

**Correlation gate: clears, uninterestingly.** ρ(rz_tilt, baseline_pg) =
0.7403, ρ(rz_tilt, P286's already-graded `interaction` arm) = 0.7378
(n_overlap = 11,388 player-weeks) — both comfortably under the 0.98 ceiling.
**This is not a costume of an existing arm; it is a genuinely different,
genuinely worse signal.** Red-zone opportunity share and usage share
(target_share/opportunity_share) are correlated but clearly distinct
axes at 0.74, confirming the prereg's own premise that this is "a
genuinely new axis" — the axis is real, the SCALE this arm put on it is not.

## 3 · The mechanism, verified rather than guessed

Isolated the multiplier distribution directly (2024 fold, n=2,924):

* Mean multiplier 1.33, but **506/2,924 (17.3%) sit AT the 3.0 clip
  ceiling**, and 663/2,924 (22.7%) sit at the 0.0 floor — a bimodal,
  clip-dominated distribution, not a smooth adjustment around 1.0.
* Position-mean red-zone rate, the denominator every multiplier is built
  against: **RB 0.56, WR 0.18, TE 0.14 opportunities/game** (2024, means of
  the weekly position means). A player with even 1-2 recent red-zone looks
  per game is routinely 3-10× his position's own average, which the ×3 clip
  then hands straight to the tilt as a full baseline_pg TRIPLING.

**This is the same error class register 59 and P260 (bench-option v3, the
K2/DEF2 "exactness is the tell" finding) already named: a ratio-to-
population-mean instrument is not a safe absolute-scale multiplier when the
population mean is small.** `target_share`/`opportunity_share` (the game-
script study's signal) don't have this problem because target share is a
bounded fraction of a team's own pass plays with a healthy, non-degenerate
mean; a raw count of a rare weekly event (red-zone touches) does not share
that property, and dividing by its own tiny mean amplifies noise into a
multiplier the tilt then applies at full force.

## 4 · What this does and doesn't retire

**Retires: a multiplicative, position-mean-relative red-zone tilt at
`tilt_scale=1.0`.** Per the prereg's own `no_fit_guard`, this is filed as
loudly as a TRUE would be, and the bar the prereg fixed is not moved after
the fact.

**Does NOT retire the underlying axis.** The correlation-gate result (0.74
vs both baselines) says red-zone opportunity carries information usage
share doesn't already have — the SHAPE of this arm's formula is what
failed, specifically the ratio-to-degenerate-mean construction. A follow-up
arm using an ADDITIVE, bounded transform (e.g., a small fixed points-per-
red-zone-opportunity credit, in the same units as the outcome, rather than
a multiplicative scale on an already-noisy ratio) is the natural next
attempt — **not built here**, since changing the transform after seeing
this result would itself need its own prereg (the exact discipline this
program keeps enforcing on itself) rather than a same-session patch.

## 5 · Three-part filing standard

* **LEARNING TARGET:** whether red-zone/end-zone opportunity share is a
  worthwhile weekly-tilt input — answered NO for the multiplicative-scale
  formulation tested here; the axis itself remains open for an additive
  reformulation, not re-tested by this run.
* **SKILL DESIGN:** paired counterfactual against a Y−1-PPG baseline, a
  pre-declared minimum effect size, 4-fold directional consistency, and a
  correlation cross-check against an already-graded sibling arm (P286) —
  all four ran exactly as preregistered.
* **CONSEQUENCE ROUTE:** per the prereg — FALSE closes THIS formulation and
  is filed so nobody re-asks the multiplicative version without new data.
  The mechanism finding (ratio-to-degenerate-mean is not a safe scale) is
  routed to whoever next builds a rare-event-count-based tilt, so the same
  clip-dominated blowup isn't rediscovered from scratch.
