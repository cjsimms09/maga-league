# SEASON-FORWARD SIMULATOR — built, certified, baseline run (task 9)

**A, 2026-08-18.** Cory un-gated the post-draft queue. Module
`draft/backtest/season_forward_sim.py`, tests
`test_season_forward_sim.py` (6/6), baseline artifact
`season_forward_baseline.json` (2,000 worlds × 3 seasons).

## What it is

Many-worlds resampling over the harvested seasons: schedule permutation
(who you face) × week bootstrap (when you score what you score), dollars
per world through the CERTIFIED money layer (`money_grade.py`)
unmodified. Scores are REALIZED weekly points only — never projections —
so register 49's circularity (a sim that draws from the board cannot
judge the board) is structurally excluded. Playoff-week scores are
bootstrap draws from each seat's own RS distribution, declared.

## Controls, all live in the suite

* **Identity world == `grade_actual`, cent-exact, every seat, all three
  seasons** — the plumbing is the certified plumbing.
* **Money conservation per world** (a leaking payout path raises, tested
  with a planted world-dependent leak).
* **Exactly four seats seed every bracket** (tested with a planted
  3-seat bracket).
* **Worlds vary** (a sim frozen on the realized world is just the replay
  again) and **a substituted 250-a-week super-seat dominates** — the
  substitute path's known positive.

## What the baseline already shows

Expected dollars track realized with honest spread — and the gap IS the
instrument: 2025 seat 6 carried E[$] ≈ 604 across worlds and realized
$100 (schedule-lucked out); 2024 seat 1 E[$] ≈ 849, realized $400. The
single-world replay could not see any of this, which is why every policy
variant graded $0 = $0 on the channels that pay 53% of the pot.

## What happens next (and deliberately not tonight)

The FLOOR/CEILING/policy re-grade re-enters through
`simulate(substitute=(seat, weekly_series))` against payout channels
that now activate — **behind its own prereg with a blind prediction**,
because it is a graded question and tonight's build is an instrument,
not a verdict. The prior on it stays the EDGE-LEDGER's honest null
(shape tilts moved playoff-window points ~equally — generic noise), and
the prereg must state what would count as overturning that.
