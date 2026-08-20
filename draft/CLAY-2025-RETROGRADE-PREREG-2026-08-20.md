# PREREGISTRATION — grading Mike Clay's 2025 guide against what actually happened

**A, 2026-08-20, written BEFORE the file exists.** Cory: *"c is also uploading
his 2025 draft guide so we can grade it."*

## WHY THIS IS THE MOST VALUABLE FILE ANYONE HAS UPLOADED THIS YEAR

`projection_snapshot_2026.json` says it in its own `_why`:

> *"This project holds three seasons of actual weekly points and **ZERO
> past-season forecasts**, so 'which source is most accurate' and 'should we
> blend' are **unanswerable today**."*

**A 2025 guide ends that.** It is the first past-season forecast this project has
ever held, and it turns three standing questions from opinion into measurement:

- Cory's *"they have been most accurate"* about Draft Sharks — an **ungraded
  premise** carried all season (`CORY-ASKS.md` A19).
- The fantasyfootballanalytics.net question he asked on 08-20 — *"which
  projections are most accurate"* — which we could only answer by reading
  someone else's R source.
- `BLEND-SEARCH-DESIGN.md`'s whole problem, which exists because we have no
  outcomes to fit against.

**⚠️ It answers them for ONE source in ONE season. That is a foothold, not a
verdict, and this document will not let it be written up as one.**

---

## ⛔ THE TRAP THAT VOIDS EVERYTHING, AND IT IS NOT THE SCORING ONE

**Mike Clay updates his guide continuously.** The 2026 edition we already hold
says, in its own header, *"Updated: 8/19/2026"* — one day before we read it.

**If the 2025 file is a mid-season or end-of-season edition, it contains
information from games that had already been played, and grading it measures
NOTHING except our willingness to be impressed.** A November projection of a
running back who tore an ACL in Week 3 will be devastatingly accurate, and
devastatingly worthless as evidence about preseason skill.

**THE GATE, and it is a hard one:**

1. **C must report the guide's own printed `Updated:` date, verbatim, before any
   number is computed.** Not the file's mtime, not the upload date — the date
   the guide prints about itself, the same way the 2026 edition prints
   *Updated: 8/19/2026*.
2. **The 2025 NFL season's Week 1 was 2025-09-04.** An `Updated:` date on or
   after that is an **in-season** edition.
3. **If it is in-season, the accuracy grade DOES NOT RUN.** The file is still
   worth keeping and still worth ingesting — an in-season projection is a fine
   thing to have — but it is filed as `clay_2025_inseason` and **never quoted as
   evidence about preseason accuracy.**
4. **If the date is missing or ambiguous, treat it as in-season.** The
   conservative direction is the one that cannot manufacture a false result.

**⚠️ AND A PARTIAL VERSION IS THE SUBTLE CASE.** Clay's guide is ~82 pages and
the sections may carry different vintages. If the player tables and the team
pages disagree about their update date, the EARLIEST governs, and the
discrepancy is reported rather than resolved silently.

---

## THE POPULATION — Cory's ruling, and we have something better than ADP

His standing ruling (`projection_snapshot_2026.json._how_to_grade`, 2026-08-19):

> *"GRADE THE TOP 150 BY ADP ONLY. A source's error on player 400 is noise about
> a man nobody drafts, and including him lets a source win on players that never
> mattered."*

**We can honour that with a better instrument than a generic ADP list:
`league_history.json` holds THIS LEAGUE'S OWN 2025 DRAFT — exactly 150 picks —
plus all 18 weeks of 2025 results.** So the population is not "the top 150 by
some national average"; it is **the 150 players this room actually drafted**,
which is the exact set Cory's ruling is about.

**Primary population:** the 150 players drafted in this league's 2025 draft.
**Reported alongside, never instead:** all players Clay covered, so a coverage
effect cannot hide inside the primary number.

---

## THE COMPARATOR — a grade with nothing to beat is just a number

**We hold no other 2025 preseason forecast, so Clay cannot be compared to
Sleeper or CBS this year.** He can be compared to something better:

**THE ROOM'S OWN DRAFT ORDER.** `league_history.json` records the exact pick
number of every 2025 selection. That is the market's ranking, made by ten people
with money at stake, before the season. **The question becomes: does Mike Clay's
preseason projection predict 2025 fantasy points better than the order this
league actually drafted in?**

**That is the honest null and it is a hard one to beat.** ADP is a strong
predictor; most projection sources do not beat it.

---

## METRICS — fixed here, not after the numbers are seen

For each position (QB, RB, WR, TE) and pooled:

1. **Spearman rank correlation** between Clay's projected points and **actual
   2025 season points**, on the primary population.
2. **The same for draft order** (negated pick number), same players.
3. **MAE in points**, Clay only — the market has no points to compare.
4. **n reported for every cell.** A position with n < 15 is reported and NOT
   interpreted.

**Actual season points come from `draft/backtest/nflverse_weekly_points_2025.json`
— 18 weeks, keyed by sleeper id, already scored under this league's table with a
recorded scoring fingerprint.** Nothing is re-scored for this grade.

**⚠️ ACTUAL, NOT SKILL.** Cory's *"grade skill not luck"* ruling governs how we
grade OUR DECISIONS. This grades a FORECAST, and a forecast of a player who
missed nine games was wrong in the way that matters to whoever drafted him.
Availability is part of what a projection is claiming. **A skill-adjusted arm may
be reported as a secondary; the primary is actual.**

---

## PREDICTIONS — filed blind, before the file exists

**P241 — Clay's preseason projection does NOT beat this league's own draft order
at ranking 2025 outcomes.** Pooled Spearman for Clay **≤** pooled Spearman for
draft order, on the 150 drafted players.

**⚠️ I am predicting the source we just added to the blend FAILS its only
outcome test.** ADP aggregates every projection plus injury news plus beat
reporting plus ten people's judgement; a single projector rarely beats it. If
P241 is FALSE — if Clay beats the room — that is a genuinely important result and
it argues for weighting him ABOVE the other six rather than equally.

**P242 — the position ordering will be RB worst.** Clay's Spearman will be lowest
at RB of the four positions. Running back outcomes are the most injury-driven and
the most workload-contingent.

**P243 — coverage is not the story.** Clay's Spearman on his full covered set
will be within **0.10** of his Spearman on the 150-player primary population.
**FALSE means the headline number is a coverage artifact** and the primary
population is doing the work, not the source.

**No bar in this file moves after a number is seen.** All three are reported even
if only one fires.

---

## CONTROLS

1. **C1 — KNOWN POSITIVE, and it is not optional.** Before Clay is graded, run
   the identical harness on a source we already know the answer for: **the 2025
   draft order predicting 2025 points.** It must produce a clearly positive
   Spearman. If the harness cannot show that a real signal is real, its verdict
   on Clay means nothing.
2. **C2 — KNOWN NEGATIVE.** Run the same harness on **shuffled** Clay
   projections. Spearman must collapse to ~0. A harness that scores noise well
   is measuring its own joins.
3. **C3 — the id join is reported, not assumed.** How many of the 150 drafted
   players Clay covers, and who is missing, printed before any metric.
4. **C4 — the `Updated:` date gate above is checked FIRST and its result is
   printed at the top of the output**, whatever the answer.
5. **C5 — 2025 players who changed teams or retired.** The join is on sleeper
   player_id, which is stable; name-matching is not used.

---

## WHAT THIS CANNOT DO — stated now, so it is not claimed later

- **It cannot rank our six blend sources.** We hold no 2025 forecast for any of
  them. Clay vs the market is the only comparison available.
- **It is ONE season.** Three seasons of outcomes exist but only one year of
  Clay. `three_cluster_bootstrap` and D's G=3 standard apply with full force:
  **one season is n=1 at the cluster level, and a single Spearman is not a
  ranking of the projection industry.**
- **It cannot justify reweighting the blend before Saturday.** Nothing ships to
  the board from this. The draft is 08-22; this is a January-grade instrument
  arriving early.

## OWNERSHIP AND DATES

C uploads and ingests (same treatment as the 2026 guide: raw stat lines, our
table, identity join, known-positive control). **A owns the grade and this
document.** **Nothing from this reaches the board before the draft. recheck
08-27.**
