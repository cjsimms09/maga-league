# PREREG — are some experts better than others, and can we use that?

TERRITORY: A — written 2026-08-18, BEFORE any expert is scored. Cory's question,
verbatim: *"we should be using expert rankings for our model!! The question is
what is best way? Are some experts better than others? Are some better at
certain things? Or certain positions or certain teams?"*

Companion to `EXPERT-SPREAD-CEILING-PREREG.md` — same captures
(`fp_expert_ranks_{2023,2024,2025,2026}.json`, all committed), same realized
stores, same offline harness. That prereg asks whether expert DISAGREEMENT is a
ceiling; this one asks whether expert IDENTITY is a signal.

## 1. The questions, in decreasing order of statistical reachability

1. **Is there persistent skill at all?** Score every expert-season; does an
   expert's 2023 skill predict their 2024 skill, and 2024 → 2025? If skill does
   not persist year over year, questions 2–4 are unanswerable from three
   seasons and the honest answer to Cory is "experts differ by luck".
2. **Does skill-weighting the consensus beat the flat consensus?** Walk-forward
   only: 2025's weights come from 2023–24 skill, never from 2025.
3. **Position-specific skill** (QB-whisperers, RB-whisperers): same persistence
   test within position. N per expert-position-season is small; expected to be
   underpowered — saying so now, so a null is reported as "unmeasurable at this
   sample", not "no".
4. **Team-specific skill:** ~3 relevant players per team per expert per season.
   DECLARED UNMEASURABLE IN ADVANCE at three seasons of captures — recorded as
   a question the 2027 capture archive can answer, not this one.

## 2. Scoring an expert-season — fixed now

Per expert e, season S: take every player e ranked, compute e's POSITIONAL
ordering (derived from e's own overall ranks). Skill = Spearman(e's positional
order, realized points order) **minus** Spearman(consensus order, realized
order) on the SAME players — an expert is only skilled if they beat the
consensus they contribute to, on the players they actually ranked. Ranking the
easy top of the board correctly earns nothing.

- Realized points: committed `nflverse_weekly_points_<S>.json`, league scoring.
- Minimum 30 commonly-graded players per expert-season, else that expert-season
  is EXCLUDED BY NAME (register 4s discipline: no silent drops).
- Ties in ranks: average-rank Spearman, both sides.

## 3. The null, fixed now

Permutation control: shuffle expert identities across the rank-columns within a
season (marginals preserved) and re-run the persistence correlation 400 times.
Observed year-over-year skill correlation must clear the 95th percentile of the
shuffled distribution, both transitions (2023→24, 2024→25), or Q1 is a null.

## 4. Ship rule

Nothing reaches the board from this line before 08-22 (same clause, same
reason as the companion prereg). If Q1 clears and Q2's walk-forward
skill-weighted consensus beats flat consensus on 2025, the 2026 board's
expert-derived fields (ceiling arms included) may be re-weighted by 2023–25
skill — as a Cory decision with the numbers in front of him, after the draft
or before it only if he explicitly moves the date.

## 5. What would kill it

- Skill correlation across years ≤ shuffle null → experts differ by luck;
  use the flat consensus and stop asking.
- Q2 improves in-sample but not walk-forward → overfit; report and stop.
- Fewer than ~40 experts survive the min-N screen in all three seasons →
  underpowered; recorded, revisit with 2027 captures.

Owner: relay builds (same harness as the spread grading — build once, answer
both). A rules. Recheck 08-24.
