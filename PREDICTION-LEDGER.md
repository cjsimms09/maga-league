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
| P5 | **The ceiling composite weight should be non-zero.** Three preregistered runs, two independent seed sets, 3/3 seeds separably at every value 0.15–0.65. | 08-17 | **A** | 08-23 | GRADED | **TRUE, and Cory ruled it in.** `MEASURED_WEIGHTS.ceiling` 0 → **0.45**, shipped at `09f94f99`. Cory verbatim: *"IS THIS STUDIES? IF SO, YES"*. "Should it be higher" answered NO from evidence already on the books — FRONTIER exp 21 measured an inverted-U (λ=0.5 +$56 CI[33,78], λ=2 −$18, λ=3 −$27), so 0.45 sits at the measured peak. | **Live on the board Cory drafts.** Blast radius measured through `recommend()` at his real picks: 0 of the top-60 move at 33/48/68, 19 move at 108, 32 at 128, **top recommendation never changes** — a late-round bench-ordering change. Prereg deviation RECORDED not silent: Cory as owner overrode the no-change-before-08-22 hold. ⚠️ **Caveat travels unresolved:** the term saturates at `CEILING_MAX_BONUS` for ~67-79 players, near-binary at QB/TE; September's quantile re-run certifies or reverts → **P18**. |
| P6 | **The ADP-sd ratchet improves the board.** | 08-17 | **A** | **08-23** | OPEN | — | — awaiting Cory's decision per `DRAFT-WEEK-BRIEF.md`. |
| P7 | **The band split repairs the inverted ratio slope.** A ruled NO SHIP 08-17, but on a contaminated population (punters in, 30% of skill data out). | 08-17 | **C** builds, **A** rules | **08-26** | OPEN | — | — **UNBLOCKED 08-18: register 4s is fixed.** `projection_error_calibration.json` now carries `seasons [2023, 2024, 2025]`, **1,320 graded**, skill positions only. The re-run A owes can finally happen on a clean population. Date moved 08-23 → 08-26 with that reason. |
| P8 | **Rookie ceilings behave differently from veterans'** — Cory: *"we still haven't accounted for ceiling of rookies."* Prereg §8, filed by A. | 08-18 | **A** | **08-24** | OPEN | — | — the rookie slice is a REPORT, not a gate; three rookie classes may be underpowered and must say so rather than fake a verdict. P4's death does not close this: it is a question about the EXISTING ceiling, not about the expert arms. |
| P9 | **A rookie/no-history ceiling can be built from draft capital + landing spot + team pace.** | 08-18 | relay | **09-05** | OPEN | — | — ⚠️ **THE HIGHEST-VALUE OPEN ROW IN THE PROGRAM.** Measured on the live 08-18 board: per-player ceiling coverage is **100% at ADP 1-24 but 46% at 161-300, 24% at 300+, and 0 of 66 ROOKIES.** The volatility term needs realized weeks, so **the fix landed where the problem was smallest** — the deep bench and rookies, exactly where Cory drafts for upside, still get the cohort constant. |
| P10 | **Vegas season win totals / team totals improve team-context priors.** | 08-18 | relay | **09-19** | OPEN | — | — 3 seasons of real props already committed (`historical_props_*.json`, 6 markets). |
| P11 | **Weekly prop lines beat our weekly projection outright.** | 08-18 | relay | **10-03** | OPEN | — | — a market with real money, per player, per week. Task #43 has been PENDING for weeks; this row is what stops that. |
| P12 | **Alternate-line props give a genuine per-player DISTRIBUTION — the ceiling no source publishes.** | 08-18 | relay | **10-17** | OPEN | — | — P1 established no source STATES a ceiling; an over/under at multiple strikes IMPLIES a full CDF. Odds API key live, 75,681 credits. **This is the surviving candidate after P4 killed the expert route.** |
| P13 | **Kalshi adds signal beyond sportsbooks.** | 08-18 | relay | **10-31** | OPEN | — | — different participants, different pricing. `kalshi-capture.yml` exists and is ungraded. |
| P14 | **Pace of play / neutral-script plays predicts opportunity better than prior-year usage.** | 08-18 | relay | **11-14** | OPEN | — | — `opportunity_z` is a VETERAN BONUS built from last season, which a rookie cannot earn (`opportunity_is_a_veteran_bonus_2026-08-17.md`). Direct feeder for P9. |
| P15 | **Air yards / EPA / CPOE add to the mean projection.** | 08-18 | relay | **11-28** | OPEN | — | — the study ran and was never promoted; `wopr`/`adot` sit on the board unused by the projection. |
| P16 | **The weekly own-projection loop beats the preseason projection by week 4.** | 08-18 | relay | **10-10** | OPEN | — | — `own_weekly_v1` is live and ungraded against its own preseason baseline. |
| P17 | **Floor needs its own construction, not the ceiling's mirror.** | 08-18 | relay | **12-05** | OPEN | — | — floor is about missed games, ceiling is about role; sharing one construction is why `proj_floor` inherits every ceiling defect. |
| P18 | **The ceiling term's saturation is benign.** ~67-79 players sit at `CEILING_MAX_BONUS`, near-binary at QB/TE. | 08-18 | **A** | **09-26** | OPEN | — | — the caveat A shipped WITH the 0.45 weight, on the record and unresolved. September's quantile re-run certifies or reverts. |
| P19 | **THE PROGRAM GOAL: our published weekly projection beats BOTH Sleeper and FantasyPros, on this league's scoring, same players and weeks, at 3 of 4 positions, on start/sit accuracy.** | 08-18 | relay | **09-15** (first grade, then every 2 weeks to season end) | OPEN | — | — `PROJECTION-PROGRAM-2027.md` §1 defines every clause. Scoreboard exists (`/admin/model-scoreboard`); this is the bar it is now graded against. **The loop closes 17 times this season, not once.** |
| P20 | **The weekly→season rescale `1 + (weekly−1)/√G` produces plausible ceilings AND keeps per-player variation.** Born from today's blocking find (register 4w). | 08-18 | **A** rules, relay builds | **08-29** | OPEN | — | — √G is an UPPER bound on the reduction (weekly outcomes correlate through role and injury) so the exponent must be **FITTED, not assumed**. Sanity bound ships with it: no ceiling may exceed the best season ever recorded at that position. |
| P21 | **STANDING — we are still looking.** Every fortnight in season: at least **2 NEW** hypotheses filed and at least **1** existing one graded. | 08-18 | relay | **09-01** (then rolling fortnightly) | OPEN | — | — Cory: *"we need to be adding things and trying things and adapting… no stone unturned."* **Enforced mechanically, not by memory:** `prediction_ledger_check.js` fails the build if the OPEN backlog drops below `MIN_OPEN`. **You cannot satisfy this file by grading everything and stopping** — an empty backlog is itself the failure. |
| P22 | **TE-heavy drafting actually won in this league** — so our board ranking six TEs 65–126 spots above market is edge, not a replacement-level error. E's Q12. | 08-18 | relay | 08-19 | GRADED | **INCONCLUSIVE — AND THE REASON IS THE FINDING.** Ran it on real picks: 30 owner-seasons, 2023–25, 420 picks joined (60 positions unresolved), finish and `points_for` from `league_history.json` standings. ρ(early-TE, points_for) **+0.041, 66th percentile** of a 400-draw shuffle; ρ(early-TE, finish rank) −0.017. **But the cell that matters is n=2.** Owner-seasons by early-TE count: **0 TEs → 13, 1 TE → 15, 2 TEs → 2.** *This league essentially never drafts TE-heavy*, so the replay **cannot** separate the two hypotheses — there is almost nothing to learn from. | **THE TEST E WAS ASKED TO RUN CANNOT ANSWER THE QUESTION, and that is now on the record instead of being run again.** Consequence: **A must NOT treat the six-TE drift as validated edge on draft day** — it is neither confirmed nor refuted. The TE replacement level (151.95 vs WR 173.27) needs checking by a route that does not depend on our own league having tried it: cross-league data, or validating replacement directly against realized TE12/WR30 outcomes. **Filed as P24.** |
| P23 | **The young-RB gap has a model mechanism** (replacement level, a projection-source hole, or rookie/second-year handling) rather than being us simply wrong. | 08-18 | relay | **08-20** | OPEN | — | — Tuten −94, DJ Moore −86, Price −84, Tate −74, Sutton −53: five players, one shape, all below market with no stated reason. E's default said the relay takes it if E does not by 08-19 EOD; filed here so it cannot lapse quietly. **The prior is that WE are wrong, not the market.** |
| P24 | **The TE replacement level (151.95, vs WR 173.27) is correctly set.** The successor to P22, which could not be answered from our own league. | 08-18 | **E** owns · relay if E does not take it | **08-27** | OPEN | — | — must NOT use our own league's draft history — P22 proved it has n=2 TE-heavy owner-seasons. Validate replacement directly against realized TE12/WR30 season outcomes 2023–25, which needs no drafter to have tried the strategy. **This decides whether the TOP of Cory's board is wrong**, so it carries into 2027 regardless of Saturday. |

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
