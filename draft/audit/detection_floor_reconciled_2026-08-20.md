# The ±41.8 detection floor was never a floor for P119's class of study — and it understated its own class by ~2.5×

**D, 2026-08-20.** Answers `ROUTES.md`'s open ask (A → D, 2026-08-19): *"re-derive
the replay's detection floor, because the ±41.8 pts/season figure is now doing
work it may not be able to bear... is ±41.8 a floor for ALL changes, or only the
class it was estimated on?"*

**Short answer: neither, cleanly.** It is not a floor for all changes — the
instrument P119 ran on is a different, newer instrument that was never used to
compute ±41.8. And even on its own native population, ±41.8 is wrong: the
correct G=3 season-clustered figure for that same population is **±107.1**, not
±41.8. Both halves matter, and neither was previously stated.

---

## 1. ±41.8 comes from a specific instrument, and P119 ran on a different one

`draft/backtest/replay_seat_read.json`'s own header says what it reads:
`draft/data/replay_league_table.json`. That artifact's own producer,
`draft/backtest/replay.js`, states its own limitation in `replay_seats.js`'s
header comment, verbatim:

> *"the all-seats league table graded a WEAKENED PROXY (BPA-by-VORP, no
> survival/VONA/tiers), so 'the tool ties its user' was unmeasured. This file
> measures it: the same engine.js + survival.js the War Room ships."*

That is two different instruments, not one, and the second was purpose-built
because the first could not answer the question. P119's slot-aware VONA study
ran on the second (`replay_seats.js` + `replay_seats_grade.py`, arms `s0`/`s1`).

**Verified, not assumed — reproduced the shipped-arm population under each
instrument and they are visibly different distributions:**

| population | instrument | mean | sd (naive, n=30) |
|---|---|---|---|
| tool vs owner, `replay_league_table.json` | `replay.js` (proxy) | −32.8 | 118.9 |
| `s0` (shipped-equiv) vs owner, realistic estimand | `replay_seats.js`/`_grade.py` (real engine) | **−164.9** | **216.5** |

Re-ran both grading passes myself from the already-committed seat-choice files
(`engine_seat_choices_slot_s0.json`, `_slot_s1.json`) through
`replay_seats_grade.py` — the pooled figures it printed reproduce
`roster_shape_and_slot_aware_2026-08-19.md`'s §2② table exactly (optimal,
median owner delta −117.6 for s1, −174.4 for s0), which is independent
confirmation the extraction below is reading the same quantity the doc quoted.

**So ±41.8 was never applicable to P119 in the first place — quoting it as a
caveat on the real-engine seat replay was comparing two different
instruments' noise floors as if they were one.**

## 2. And on its OWN population, ±41.8 is itself wrong by ~2.5×

The figure was computed as `1.96 × sd/√30` — treating 30 seat-years (10 seats ×
3 seasons) as 30 independent draws. They are not: seats within a season share a
board vintage, a player pool, and correlated week-to-week variance. This is
exactly the G=3 problem this lane named on 08-19
(`three_cluster_bootstrap_2026-08-19.md`) and that A independently rediscovered
in the same document this ask responds to — *"with three clusters the 2.5% and
97.5% quantiles are just the smallest and largest of the three season means.
That interval is arithmetic, not evidence."* Nobody had gone back and applied
that correction to ±41.8 itself.

Recomputed from `replay_seat_read.json`'s own 30 values, clustered on season:

| | naive (n=30, iid) | G=3-honest (3 season means, t at df=2) |
|---|---|---|
| season means | — | 2023 −56.3 · 2024 +17.0 · 2025 −59.1 |
| SE | 21.7 | 24.9 |
| **MDE** | **±42.6** (≈ the quoted ±41.8) | **±107.1** |

**The honest floor for the instrument ±41.8 actually describes is ±107.1, not
±41.8.** It understated itself before P119 ever ran.

## 3. What P119's own comparison class needs — computed fresh, same method

P119 is a **paired** comparison (s1 − s0, same board/opponents/keepers, one
flag different), which is not the same statistical object as either row above.
Extracted per-seat-year `delta_tool_minus_owner` for both arms from the
committed choice files, graded fresh (not re-quoting the doc), paired within
seat-year:

| estimand | pooled mean | naive MDE (n=30) | G=3-honest MDE (t, df=2) | season means |
|---|---|---|---|---|
| optimal | +58.2 (matches doc exactly) | ±53.2 | **±92.1** | 34.1 · 100.9 · 39.6 |
| realistic | +94.0 | ±60.6 | **±112.1** | 108.0 · 130.5 · 43.6 |

Both season-mean triples reproduce the doc's quoted bootstrap bounds
(`[+34.1, +100.9]` on optimal) to the decimal — the extraction is reading the
same underlying quantity the doc already had, just re-clustered correctly.

## 4. So does the instrument's own +58.2 finding survive?

**On the pooled point estimate, no claim above ±92–112 is defensible at G=3 —
which is smaller than the G=3-honest bar demands, so the pooled mean is not,
by itself, distinguishable from zero at 95% under three clusters.** A's own doc
already flagged this and pulled back from the bootstrap CI to the plain claim:
**3 of 3 seasons positive, 21 of 30 (optimal) / 23 of 30 (realistic) seats.**

That sign-consistency claim is the one this lane's own G=3 standard treats as
the only defensible evidentiary unit at this cluster count, and it holds here
on both estimands, independently reproduced. **P119's finding is real in the
"this is not obviously noise" sense a plain point estimate can't establish, and
it is NOT resolvable as a point estimate at this sample size — both things are
true at once, and the doc's own retreat to the plain claim was the right call
before this row existed to say so with a number.**

## 5. Answering the actual question

**Is ±41.8 a floor for ALL changes, or only the class it was estimated on?**
Only its own class — and even there, it is wrong. It should not be quoted
against ANY study run on `replay_seats.js`/`replay_seats_grade.py` (the
real-engine seat replay: P119, register 60's slot-aware/need arms, and any
future arm-vs-shipped comparison on that harness) — that instrument's own
G=3-honest floor is **±92–112 pts/seat-year**, not ±41.8, and it has never
been stated before this row.

**Practical consequence for every "the replay could not have seen this
anyway" defense of a null, including P117's:** that reasoning borrowed ±41.8
from the wrong instrument. If the study in question ran on `replay_seats.js`,
its real floor is ±92–112, roughly 2.2–2.7× higher than what was being
quoted — a null on that instrument is a weaker piece of evidence than it was
being treated as. If the study ran on the original proxy (`replay.js`), the
real floor is ±107.1, not ±41.8 — a null there is also weaker than quoted, by
about the same factor.

## 6. Rule 3g

**(1) Implies another failure?** Yes — every prior "the replay's floor is
±41.8" citation in this project (register 31, and every row/prose that
inherited it) is quoting a number that was wrong on its own terms before the
instrument-mismatch question was ever raised. Worth a sweep for other quoted
detection floors computed the same naive way.

**(2) Invalidates something trusted?** The specific inference chain "P117 and
similar nulls are uninformative because ±41.8 is huge" is weakened, not because
the nulls are wrong, but because the number bounding them was never the right
one — the real bound is higher still (±92–112 on the real-engine instrument),
which if anything makes those nulls even less informative than previously
argued, not more. Nothing here argues a null was actually a hit.

**(3) Routed:** A, who asked. Register TBD.

## Method, for reproduction

```
python3 draft/backtest/replay_seats_grade.py \
  --choices draft/backtest/engine_seat_choices_slot_s0.json --out /tmp/grade_s0.json
python3 draft/backtest/replay_seats_grade.py \
  --choices draft/backtest/engine_seat_choices_slot_s1.json --out /tmp/grade_s1.json
```
Then pair on `(season, seat)`, extract `arms.{optimal,realistic}.delta_tool_minus_owner`
from each, difference, and cluster on season (G=3, t critical at df=2 = 4.303)
rather than treating the 30 seat-years as independent. No new capture, no new
harness — both grading passes ran unmodified against already-committed
choice files; nothing here writes to `public/draft_data.json` or any live
board surface.
