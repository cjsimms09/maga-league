# Age and opportunity as upside predictors — four folds, and the answer is no

**A, 2026-08-19.** Cory: *"Keep testing best ways to project upside!! Really need
to capture players that actually have it based on age or opportunity!"*

Prediction: **P122**, filed before the run.
Lab: `draft/backtest/upside_predictors_lab.py` · artifact:
`draft/data/upside_predictors_lab.json`.

---

## 1. Why this was worth running when two studies already said no

Neither of them asked this question.

| study | what it actually asked | answer |
|---|---|---|
| **P112** | does a player's OWN PAST right tail predict his FUTURE tail? | null, 4/4 |
| **P112** | does his own CV beat a positional constant? | null, 0/4 |
| **08-19 study** | do age/opportunity predict CROSS-SOURCE DISAGREEMENT? | null once the `cv = sd/mean` denominator is removed |
| **this** | **do age/opportunity predict A BIG SEASON, NEXT YEAR, OUT OF SAMPLE?** | ← the empty cell |

Cory was right to push. Forecaster disagreement is a proxy for upside, not
upside; a player's own past tail is a different question again. **The thing he
asked for had never been measured.**

## 2. The trap the design is built around

**Opportunity predicts POINTS trivially.** A 25% target share outscores a 5%
one, and reporting that as an upside finding would be a tautology in a costume.

So the outcome is a **residual**: realized weekly p90 with the player's own
**next-season volume projected out**, within position. What survives is only the
part of the tail that opportunity called *in advance* and that volume does not
already explain.

Absent weeks stay absent and are never zero-filled — a zero for a week a man did
not play is an injury encoded as a bad game, and it is the easiest way to
manufacture a fake volatility signal.

## 3. Result

**Known-positive control first (rule 3e): rho 0.900, p 0.000.** The instrument
detects a real effect when one is present, so the nulls below are nulls and not
blindness.

| fold | age | opportunity **level** | opportunity **trend** |
|---|---|---|---|
| 2021→22 (n=197) | +0.007 (p .938) | +0.050 (p .487) | −0.099 (p .160) |
| 2022→23 (n=204) | +0.034 (p .693) | +0.055 (p .449) | −0.017 (p .811) |
| 2023→24 (n=208) | +0.092 (p .223) | +0.100 (p .152) | −0.076 (p .265) |
| 2024→25 (n=206) | −0.103 (p .156) | **+0.178 (p .011)** ⭐ | +0.138 (p .047) ⭐ |

**Preregistered criterion — clears every fold at p < 0.05 with a consistent
sign. NOTHING CLEARS.**

**AGE IS DEAD.** Four folds, no fold under p = 0.15, and the sign flips. Age does
not tell you whose ceiling is real. It is already in the projection through the
age curve, and there is no residual left over.

**OPPORTUNITY TREND IS DEAD, AND IT WAS MY OWN MECHANISM.** P122 predicted trend
would clear — *"a young player whose snap/target share is RISING has upside a
point projection anchored on last season's volume structurally cannot carry."*
It is the **worst** of the three arms: negative in three folds of four. The story
was good and the data does not support it.

**OPPORTUNITY LEVEL IS THE ONLY THING STILL STANDING, AND IT IS A HINT, NOT A
FINDING.** Positive in **4 of 4** folds — and monotonically rising, +0.050 →
+0.055 → +0.100 → +0.178 — but clearing p < 0.05 in only the most recent one.
A sign test on 4/4 is p = 0.125 two-sided. **That is suggestive and it is not a
result**, and it must not be quoted as one.

> **And the monotone rise is itself suspicious.** It could be the NFL genuinely
> concentrating target share, or it could be that recent seasons have better
> data and more surviving players. **I cannot tell those apart from four folds,
> and the shape is exactly what a data-quality gradient looks like.** Named here
> so nobody later reads the trend as a discovery.

## 4. What this closes

Three independent routes to per-player upside have now been measured and closed:

1. **From outcomes** — P112: the right tail varies but does not persist.
2. **From structure** — age, opportunity level, opportunity trend: this document.
3. **From forecaster disagreement as a proxy** — the 08-19 study: denominator
   artifact.

**What is left standing is cross-source disagreement used DIRECTLY as
dispersion**, which is what shipped today and is graded by P113 in January. That
is not a happy accident of the ffanalytics capture — it is now the only
surviving candidate, which raises the stakes on P113 considerably.

## 5. One methodological note I owe

**The lab was extended from two folds to four AFTER seeing the two-fold result,
and that is written into the module.** What changed was the amount of data; the
decision rule (every fold, p < 0.05, consistent sign) came from P122 and was not
touched. Adding folds can only make a marginal result harder to sustain — and it
did: opportunity level looked like a possible signal on two folds and looks like
a hint on four.

**The cost, stated:** age at season is derived from the 2026 board's `age`, so
the 2021 fold only sees players still rostered five years later. That is
survivorship, it hits the **age** arm specifically, and it means a null on age in
the early folds is weaker evidence than the same null in the late ones. The age
arm's n falls to 104 in 2021 against 193 in 2024 for exactly this reason.

## 6. P122 graded

- *"AGE is a null"* — **TRUE**, and cleanly.
- *"OPPORTUNITY clears"* — **FALSE.** The arm I named, trend, is the deadest of
  the three.
- **Unpredicted:** opportunity *level* is the only consistent-sign survivor.

**One of two right, and the half I was most confident about is the half that was
wrong.**
