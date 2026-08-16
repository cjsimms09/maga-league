# THE EFFICIENCY LEAK — dollars left on the table by lineup decisions

_Filed 2026-08-08, corrected 2026-08-15. Computed by the certified Lab
money-grader (`money_grade.py` + `roster_sim.py`); the [certification
gate](draft/tests/test_money_grade_certification.py) reproduces all three
seasons' actual money tables to the dollar, so the REALIZED side of this
finding is produced by the same machinery that is known-correct. Refresh:
`python draft/backtest/lab.py` (experiment **L0**)._

**2026-08-15 CORRECTION:** the original figures below understated the leak.
`roster_sim.infer_positions()` skipped any player who only ever started via a
FLEX-type slot (its own docstring called this "almost always caught in
another week's dedicated slot" — false for 36 real players across 2023-25),
so `best_lineup_points()` silently dropped them from the hindsight-optimal
recomputation whenever they'd actually started. Found while backtesting
whether the JS-side lineup optimizer (`src/routes/lineup.js`) gives a real
edge — a per-row invariant check (optimal must never be less than what was
actually played) caught an impossible violation, traced to this gap. Fixed
by falling back to `draft/data/player_positions.json`'s ground truth (the
same remedy A already used for `wire_level.js`'s identical defect class) in
both the JS port and this Python original. New per-row regression test:
`test_hindsight_ceiling_beats_realized_every_week` in `test_roster_sim.py` —
the pre-existing aggregate-only check passed throughout because the
undercounting was small relative to a whole season's sum. Old figures struck
through below for the record.

## The headline

Starting the **optimal-in-hindsight lineup** every week — the ceiling of a
roster, perfect bench decisions — would have earned each team, on average, this
much MORE than they actually collected, in **weekly-high + regular-season money
alone**:

| season | weekly-high leak /team | regular-season leak /team | total /team |
|---|---|---|---|
| 2023 | **$370** (was ~~$330~~) | $150 (was ~~$140~~) | **$520** (was ~~$470~~) |
| 2024 | **$450** (was ~~$420~~) | $187.50 (was ~~$175~~) | **$637.50** (was ~~$595~~) |
| 2025 | **$395** (was ~~$345~~) | $125 (was ~~$100~~) | **$520** (was ~~$445~~) |

**Weekly-high is where the money is** — ~70–75% of the leak. That is the direct
consequence of this league's economy: $1,500/season rides on posting the week's
top score, and one benched boom decides it. The regular-season leak is the record
you'd have earned starting your best lineup (more wins → the RS champ/runner-up
prizes shift).

## My three-year figure (coryjsimms)

**$2,400 left on the table across 2023–25** (weekly-high + RS; was ~~$2,100~~,
see the 2026-08-15 correction above). That is real money — the business case
for the in-season lineup optimizer stated in dollars, not points.

## What this is, precisely (the honest frame)

- Each team is graded **holding the rest of the field at their realized scores**
  (`grade_substituted`), so this is *"the value of optimal lineup-setting for one
  team, given everyone else played as they did"* — the right denominator for the
  lineup decision, because a manager controls their own lineup, not the field's.
- It is a **ceiling**, not a promise: nobody sets the perfect lineup every week.
  The realized recovery of a good optimizer is a fraction of this — but the
  fraction is the prize, and even a third of it dwarfs most draft-day edges.
- **Playoff dollars are NOT yet in this number.** The substituted-seat playoff
  re-simulation (reseed + bracket) is the harness's last increment; when it
  lands, the entry/title component joins the decomposition and the per-team
  totals grow. Until then these figures are a **lower bound** — weekly-high + RS
  only, both exact.

## Decomposition columns (per the money function)

- **high-pool** = weekly-high leak (the dominant term; $370–450/team/yr).
- **entry/title** = playoff leak — *pending the bridge*, currently $0 here.
- **matchup** = regular-season record leak ($125–187.50/team/yr).

## The January grading hook

This is the **lineup optimizer's report card.** In January, grade the optimizer's
**realized** 2026 recovery against this baseline: of the ~$520–637.50/team the
ceiling shows is available, how much did the dollar-denominated lineup optimizer
(in-season experiments 13/14) actually capture versus naive start-your-studs?
The optimizer earns its place only if realized recovery beats the naive policy on
held-out dollars — same ship rule as everything. This file is the number it is
measured against.

## Cited by

- `docs/queued/in-season-master.md` — the lineup optimizer's quantified business
  case (this leak is why the dollar-denominated optimizer exists).
- `LAB-REGISTRY.md` experiments 13 (lineup-policy tournament) and 14 (high-chase
  trigger) — this baseline is their target.
