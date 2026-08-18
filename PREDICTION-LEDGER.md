# PREDICTION LEDGER — every claim, its grade date, and what it CHANGED

**Cory, 2026-08-18:** *"Still don't think we are making predictions, grading and
closing the loop. No one is in charge of it.."*

He is right about the ownership. Predictions were being made (preregs), some were
being graded, and **nothing connected the two or noticed when a grade never came.**
`DEFECT-REGISTER.md` has an enforced recheck date and
`draft/tools/register_recheck_check.js` fails the build on any open row past it.
Predictions had no equivalent. This is it.

## Who is in charge

**The relay owns this file.** Not "the lane that made the prediction" — that is how a
prediction goes quiet when its author moves on. The relay files the row, chases the
grade, and carries the consequence to whoever can act on it.

**`draft/tools/prediction_ledger_check.js` is what actually enforces it**, and it
fails the build on **two** things, not one:

1. a row past its **grade by** date that is still `OPEN` — the prediction nobody
   came back for;
2. a row marked `GRADED` whose **what changed** cell is empty — Cory, 2026-08-17:
   *"a grade that moved nothing"*. **A grade with no consequence is not a closed
   loop, it is a note.** `NOTHING — <reason>` is a legitimate consequence and passes;
   silence does not.

A row must carry an owner and a date. Rows with neither are themselves a defect.

## Status vocabulary

`OPEN` = predicted, not yet graded · `GRADED` = measured, consequence recorded ·
`ABANDONED` = deliberately dropped, with the reason in **what changed**.

---

| # | prediction (what would be true if we are right) | made | owner | grade by | status | result | what changed |
|---|---|---|---|---|---|---|---|
| P1 | **A source publishes a per-player point ceiling we can fetch.** Cory ruled the ceiling must come from outside; this is that ruling as a testable claim. | 08-18 | relay | 08-18 | GRADED | **FALSE.** Six endpoints probed (`ceiling-source-probe` run 32087333128), all reachable, none carries a ceiling/floor/high/low field at any depth: FP season projections (238KB/58 keys), FP weekly, Sleeper projections (2.9MB/124 keys), FP ECR, FP ADP. FP's projections API had already been captured on 08-16 (596 rows, unfiltered census) with the same result. | **Stopped the search.** `discovery_ceiling_sources.py` + workflow committed so the null is re-checkable rather than re-argued. Register 4t records it. Redirected to the best proxy any source does publish (P2/P3). |
| P2 | **Expert skill persists, so "use the experts who drafted better" is selectable.** Cory's idea, 08-18. | 08-18 | relay | 08-18 | GRADED | **PARTLY TRUE, AND IT DOES NOT MATTER.** Skill persists weakly — 2023→2024 ρ 0.121 (183 shared experts), 2024→2025 ρ 0.257 (160). Mean 0.189. | **Gate passed as MARGINAL, so the arm was built and tested (P3) instead of being taken on faith.** `expert_skill_persistence.py` committed with both controls (planted persistence detected; pure noise fails). |
| P3 | **A consensus built from the better experts beats the all-expert consensus.** The shipping form of Cory's idea. | 08-18 | relay | 08-18 | GRADED | **FALSE, and it fails its own null.** Selecting on 2023+2024, evaluating on 2025: top quartile 0.5249 (**36th percentile** of 200 random same-size subsets — below the median), top decile 0.5289 (70th), top half 0.5282 (72nd), vs all-expert 0.5240. Every margin under 1% of baseline and inside the noise. Mechanism: 2025 expert skill runs 0.359–0.579 with an IQR of ~0.04 — **no genius, no fool.** | **Arm killed before any board wiring existed.** Saved building a skill-weighted expert model that would have shown a plausible `+0.005` and delivered nothing. Recorded in prereg §9b. |
| P4 | **Expert disagreement predicts realized upside, so it can replace the cohort-p90 ceiling.** Prereg arms ECR-SPREAD / ECR-MIN / ECR-Q10. | 08-18 | relay | 08-18 | GRADED | **FALSE on both metrics.** 1,111 graded player-seasons. p90 within ECR band: pooled +18.5, **72nd percentile** of a 400-draw shuffle (p95 +38.3) — inside the null. P(top-12 at position): SPREAD −0.0134 (28th), MIN −0.0467 (15th), Q10 −0.0297 (19th) — **all negative, all below the shuffle median.** | **Whole line dropped; `proj_ceiling` and the board untouched.** Register 4t stays OPEN — the defect is real, this fix is not it. Lesson recorded in prereg §10: §6's screens (365 distinct spreads, ρ 0.855 not 1.0, rank_std 0.7–85.4) were all TRUE and the thing still predicts nothing. |
| P5 | **The ceiling composite weight should be non-zero.** Three preregistered runs, two independent seed sets, 3/3 seeds separably at every value 0.15–0.65. | 08-17 | **A** | **08-23** | OPEN | — | — held at 0 through the draft by the no-change-before-08-22 rule, which was fixed in all four preregs before any produced a number (brief §7b). **A rules after the draft.** |
| P6 | **The ADP-sd ratchet improves the board.** | 08-17 | **A** | **08-23** | OPEN | — | — awaiting Cory's decision per `DRAFT-WEEK-BRIEF.md`. |
| P7 | **The band split repairs the inverted ratio slope.** A ruled NO SHIP 08-17, but on a contaminated population (punters in, 30% of skill data out). | 08-17 | **C** builds, **A** rules | **08-23** | OPEN | — | — re-run blocked on register 4s: the clean refit silently lost 2025, moving ceilings ±36 points on a 200-point projection. |
| P8 | **Rookie ceilings behave differently from veterans'** — Cory: *"we still haven't accounted for ceiling of rookies."* Prereg §8, filed by A. | 08-18 | **A** | **08-24** | OPEN | — | — the rookie slice is a REPORT, not a gate; three rookie classes may be underpowered and must say so rather than fake a verdict. P4's death does not close this: it is a question about the EXISTING ceiling, not about the expert arms. |

---

## What P1–P4 cost, and what they bought

Four predictions, four grades, **four negatives**, all in one day, every one called
before the number existed. **Nothing shipped to the board from any of them** — which
is the point. The alternative history is a skill-weighted expert model and a
disagreement-based ceiling column, both live on Cory's board four days before a
draft, both delivering nothing, and neither one falsifiable after the fact because no
null was written down first.

**The three nulls did all the work:** the random-subset null killed P3, the shuffle
null killed P4, and the known-positive controls are what make "it found nothing"
mean something rather than "it cannot find anything."
