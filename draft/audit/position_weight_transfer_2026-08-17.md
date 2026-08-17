<!-- TERRITORY: A -->
# POSITION-WEIGHTED PROJECTIONS — THE VERDICT — 2026-08-17

**Cory, 2026-08-17:** *"Let's test position weighted idea then."*

**Preregistration:** `draft/backtest/POSITION-WEIGHT-TRANSFER-PREREG.md`,
committed at `2510e4b0` — **before** the runner existed and before any number
was produced. **Runner:** `draft/backtest/position_weight_transfer.py`.
**Artifact:** `draft/backtest/position_weight_transfer.json`. **Tests:** 21 in
`draft/tests/test_position_weight_transfer.py`, every mechanism gate two-armed.

---

## THE ANSWER, FIRST

**NULL. Position-specific weighting is worth 0.0001 rho, and the scrambled
control does just as well.**

Weights fitted on 2023+2024 and applied to 2025, headline pair
`own_v6 × recency_blend`:

| | QB | RB | WR | TE |
|---|---|---|---|---|
| own_v6 alone | .7225 | **.7968** | **.7663** | **.7987** |
| recency_blend alone | .7213 | .7682 | .7370 | .7871 |
| equal weight (0.5) | .7249 | .7866 | .7563 | .7947 |
| **one global weight** | .7251 | .7873 | .7570 | .7957 |
| **per-position weights** | **.7252** | .7879 | .7569 | .7957 |
| *scrambled control* | *.7246* | *.7874* | *.7571* | *.7947* |
| *answer key (LEAKS)* | *.7251* | *.7880* | *.7580* | *.7957* |

Per-position beat global in **2 of 4** positions. Pooled difference **+0.0001**,
95% CI **[−0.0008, +0.0011]**. The scrambled control beat global in **2 of 4** —
the same score. Across all 28 pairs, **0 of 27** secondary pairs survived FDR at
q = 0.10, **not one** confidence interval anywhere excluded zero, and the
largest effect in either direction was **±0.0011**.

All three preregistered clauses had to fire. Two did not.

---

## 1. WHY IT IS NULL — THE MECHANISM, NOT THE LUCK

This is not "we lacked power to see a small effect". The reason is visible in
the fitted weights themselves:

    global weight, headline pair:  0.523
    per-position:  QB 0.503   RB 0.552   WR 0.529   TE 0.523

**The four positions want almost the same weight.** The total spread across all
four is 0.05. Across all 28 pairs the median spread is **0.031** and the largest
is **0.082**, and every global weight in the study sits between **0.442 and
0.597** — i.e. every fit, global or per-position, lands near 0.5.

Inverse-MSE weighting between two forecasters of similar accuracy is a very flat
function. Moving the weight from 0.523 to 0.552 changes a blended projection by
about 3% of the gap between the two arms, which is far below the noise in the
ranking. **There is nothing for the per-position refinement to grip.**

That is why the negative control settles it so cleanly. Grading each position
under *another* position's weight costs almost nothing, because the other
position's weight is nearly the same number.

## 2. THE CONTROL IS THE FINDING

Prereg §4 named this in advance as the check that would decide the study:

> *If scrambled weights do as well as the real assignment, then what looked like
> "position-specific information" is just "a weight that isn't 0.5".*

Measured: mean per-position wins **1.36 / 4**, mean scrambled-control wins
**1.18 / 4**, and in **18 of 28 pairs the control did as well as or better than
the real assignment.** The gap between knowing which position a weight belongs
to and not knowing is inside the noise.

## 3. A COMMITTED PREDICTION, NOW CHECKED — AND WRONG

Amendment 2 (b) declared, as a precaution, that a fitted-on-itself position
weight *"would be the strongest-looking number in this study and would mean
nothing."* Reason (2) dissolving made that checkable rather than merely
asserted, so the answer-key arm was run and reported as a labelled ceiling.

**It is not the strongest-looking number.** Over 112 cells its gain on the
honest out-of-sample arm has a **median of 0.00000**, a maximum of **+0.0058**,
and it is *negative* in places (min **−0.0024**) — at QB it actually loses to
the honest arm.

The precaution was still correct to take: you cannot know a leak is worthless
until you have measured it, and a design that reports a leaking arm as evidence
is broken regardless of the size. But the specific fear was misplaced, and for
the same reason as everything else here — **the weighting is too insensitive for
even the answer key to exploit.**

## 4. THE BIGGER RESULT, WHICH WAS NOT THE QUESTION

Look at the table again. **Blending loses to `own_v6` alone at RB, WR and TE.**
The best blended arm beats the better parent only at QB (+0.0027), and gives
back −0.0089 at RB, −0.0094 at WR and −0.0030 at TE.

Across all 112 cells, the best of the three honest blend arms beat the better
parent in **35** of them — 31%. This reproduces the finding from
`proj_mean_blend_2026-08-16.md` (31 of 112) on a stricter holdout and with a
season-transfer design rather than a within-season one.

**So the position question was downstream of a question already answered.** You
cannot improve a blend by weighting it better when the blend itself is losing to
its own best component. In this data the thing that works is picking the better
single source, and against `own_v6` the arms available here are not better.

## 5. WHAT THIS DOES AND DOES NOT SETTLE

**Settled:** the idea that a per-position weight carries transferable
information is dead *for inverse-MSE weighting between two similar forecasters*,
which is the form the idea was proposed in. The blocked Sleeper/FantasyPros
series is no longer worth chasing *for this purpose* — if it arrived tomorrow,
the mechanism it would feed has been shown not to work on data where we hold
everything.

**NOT settled — and this cuts against the null, so it is stated plainly:**

1. **Cory's original observation is untouched.** Sleeper's WR bias of **+13.63**
   is a *level* bias, and this study measured *ranking* (Spearman), which is
   invariant to any monotone level shift. A per-position **bias correction** is
   a completely different instrument from a per-position **blend weight**, and
   nothing here tests it. It is also the instrument that would actually address
   what he noticed. **That is the live follow-up, and it is not this study.**
2. **Our parents are ~0.94 error-correlated** — the hostile case for blending.
   Prereg §5 declared in advance that this makes a null *weaker* evidence than
   it looks. Two genuinely independent professional forecasts might have a
   spread worth weighting; ours share `recency_blend` internally.
3. **Two fit seasons, one graded season.** The design minimum, with no degrees
   of freedom left to check the fit's stability. A weight that transferred once
   has transferred once.
4. **`board_ages()` is as-of-2026 for every season**, so the age feature is
   misspecified worse in the fit seasons than in the graded one. Not outcome
   data — it cannot leak — but it is real, and it works *against* transfer.

## 6. WHAT SHIPPED

**Nothing touching the board.** Prereg §0 declared before the run that no
outcome here could change `proj_mean`, and none did.

Two committed records were corrected, which is the durable output:

- `proj_mean_blend.py`'s `constructibility_gate` no longer asserts that A3 is
  dropped for two reasons. It records that reason (2) **dissolved** on
  2026-08-17, that reason (1) still binds, and that reason (2) was then tested
  separately and came back null. A gate that keeps citing a block which has
  already been removed teaches a future reader something false.
- `test_position_weighted_arm_is_dropped_not_fitted_on_itself` — the tripwire
  that fired and caused this study — now pins the **new** truth rather than
  being deleted or relaxed. It was doing its job: it existed specifically so
  that a second gradeable season would force a deliberate re-evaluation, it
  fired the moment one appeared, and this document is the re-evaluation.

## 7. THE LICENCE

`season_models()` is `proj_mean_blend._probe_models()` with the season
un-hardcoded. That claim is checked, not asserted: rebuilding 2025 through the
new parameterised path and diffing against the committed probe compares **8
models over 4,441 values** with **0 disagreements**. `run()` refuses to report
any number if that check fails. Without it, every 2023 and 2024 arm here would
be a different model wearing the same name.
