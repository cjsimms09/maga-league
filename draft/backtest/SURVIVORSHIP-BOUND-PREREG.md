<!-- TERRITORY: A -->
# PREREGISTRATION — BOUND THE SURVIVORSHIP OPTIMISM IN THE MODEL SCOREBOARD

**Committed BEFORE the study is built or run. No numbers from it in this commit.**

**Written 2026-08-17, to be RUN AFTER the 2026-08-22 draft.** Same reason as
`NEED-WEIGHT-PREREG.md`: nothing ships this week anyway, and a design written
after seeing results is not a design. Now — while the context is fresh and the
study does not exist — is the only moment this is worth writing.

Opened by the coverage sweep (`draft/audit/coverage_guard_sweep_2026-08-17.md`
§4), which found the caveat honest, disclosed, and **unmeasured**.

---

## 1. THE CAVEAT IS LARGER THAN IT READS

`model_accuracy_backtest.py` says of every model:

> players forecast but absent from every graded week are excluded and counted
> here — **MAE is optimistic by an unmeasured amount**

Measured on the 2025 arm, from the shipped artifact:

| model | forecasts | excluded | share |
|---|---|---|---|
| **own_v6** (live) | 506 | 115 | **22.7%** |
| own_v2–v5 | 506 | 115 | 22.7% |
| walk_forward_v1 | 737 | 211 | **28.6%** |
| naive_prev / recency_blend | 582 | 115 | 19.8% |

**Nearly a quarter of the live model's forecasts are excluded from its own
accuracy score.** "Optimistic by an unmeasured amount" is doing a great deal of
work in that sentence.

**The exclusion itself is CORRECT and is not what this study questions.** A
player who never took a snap has no outcome to grade against, and scoring him 0
would conflate "did not play" with "played badly" — the absent-is-absent rule,
applied properly. What is missing is the SIZE of the resulting optimism, and for
a draft tool that size matters: a 200-point projection who never plays is a total
loss to the drafter, not a neutral non-event.

## 2. THE DESIGN — THREE TREATMENTS, ONE POPULATION

Re-grade the 2025 and 2024 arms under three treatments of an absent player:

- **A — DROP.** The shipped treatment. The reference, not the control.
- **B — SCORE ZERO.** Every excluded forecast contributes its full projection as
  error. This is a **BOUND, not an estimate**, and must be reported with that
  word attached everywhere it appears: it assumes a drafter got nothing, which is
  true of the roster spot and false of the waiver replacement.
- **C — ROSTERED ONLY.** Score 0 for players who were on an NFL seasonal roster
  that year and never appeared; drop players who were not in the league at all.
  This separates "we projected a man who was rostered and gave nothing" — a real
  projection failure — from "we projected a man who retired or was cut in
  August", which is a board-construction failure and a different question.

C is buildable because `import_seasonal_rosters` is now proven to cover
2021-2025 at 100% usable positions (`routes_position_source_2026-08-17.md`). It
was not available as a clean arm before today.

## 3. THE QUESTION THAT DECIDES SOMETHING

**Not "what is the true MAE" — that is unanswerable and B is not it.** The
decision-relevant question is:

> **Does the RANKING of models change under any treatment?**

The scoreboard's job is to say which projection model ships. If the ordering is
stable across A, B and C, the survivorship caveat is a statement about the
absolute level and can stay a disclosed caveat forever. If the ordering moves,
`own_v6` is live on a comparison that a defensible alternative treatment
reverses, and that is a finding that outranks everything else in the file.

## 4. THE PREDICTION, DECLARED BEFORE THE RUN, AND IT IS SHARP

**own_v2 through own_v6 all exclude exactly 115 forecasts out of exactly 506.**
Identical counts across five models is strong evidence they exclude the *same
players*, so any treatment of that set adds nearly the same quantity to each of
their errors. **Between the own_* models the treatment should very nearly
cancel, and I expect their ordering to be unchanged under all three arms.**

**The exposure is `walk_forward_v1`**, which excludes 211 of 737 — a different
count over a wider forecast population. It is the one model whose position can
move, and it is the one the ordering should be checked against first.

So: **a ranking change among the own_* models would be surprising and is the
result most worth reporting.** A ranking change involving walk_forward is the
expected shape if anything moves at all.

**B will raise every model's MAE. That is arithmetic, not a finding**, and may
not be written up as one.

## 5. PASS/FAIL, DECLARED NOW

1. **Report all three arms for every model, both seasons**, whatever they say.
2. **The excluded-player COUNT and its share must appear beside every number.**
   An MAE under treatment B without its denominator is a worse artifact than the
   caveat it replaces.
3. **Ranking stability is the headline**, stated as stable or not stable, per
   position cell and pooled — not left for a reader to infer from a table.
4. **B is labelled a BOUND in every table, caption and summary line.** If it ever
   appears as "MAE", the study has produced the misreading it exists to prevent.
5. The head-to-head shared-population block (`model_accuracy_backtest.py:186`)
   already matches denominators for A. **It must be extended to B and C or the
   comparison is not like-for-like** — that block is why §3's question is
   answerable at all.

## 6. WHAT MAY NOT HAPPEN

- **No model is promoted or demoted by this run.** It grades the GRADER. A model
  change needs the graduation gate, on its own evidence.
- **Treatment B does not become the shipped metric on the strength of being
  more conservative.** Pessimism is not accuracy; a bound adopted as a point
  estimate is the same error as the optimism being measured, facing the other
  way.
- **No re-derivation of `own_v*` rides along.** If a model looks wrong under a
  new treatment, that is a separate question with a separate prereg.

**"The ranking is stable and the caveat stays a caveat" is the expected outcome,
is a real result, and needs no further permission.**
