# WEEKLY LAB — THE WEEK-ZERO FREEZE (committed before any 2026 outcome exists)

**A, 2026-08-18.** Cory ordered the weekly lab started ("lets get V7
rolling…", "which should we start with… if we do them quick enough" →
weekly lab first). This document freezes the three things that MUST be
fixed before a single 2026 week is scored, because each is a knob a
motivated grader could turn afterward to flatter us. Everything else
(cadence, tiers, nulls, order of work) is already governed by
`PROJECTION-PROGRAM-2027.md` and `BLEND-SEARCH-DESIGN.md` and is not
restated here.

## 1. START/SIT ACCURACY, mechanically — the metric of Cory's bar

Cory's bar says "start/sit accuracy" and no file defines it. Frozen now:

**Weekly pairwise start/sit accuracy** for a source S, position q, week w:
over all UNORDERED PAIRS (i, j) of players at q where

  * both players are projected that week by EVERY source being compared
    (the shared population — "same players and weeks", the 2027 goal's
    own clause);
  * both players have a REAL stat row that week (absent-not-zero: an
    inactive player is not a graded decision, per the assuming-no-
    injuries ruling — availability is graded separately, not smuggled
    into this metric);
  * |actual_i − actual_j| ≥ 3.0 points in OUR scoring (a "decision"
    between outcomes 0.4 points apart is a coin, not a skill — pairs
    below the floor are noise and excluded, count reported);

score 1 when sign(S_i − S_j) == sign(actual_i − actual_j), 0.5 when
S_i == S_j exactly, else 0. The position's accuracy is the mean over
pairs, POOLED across the grading window's weeks (not averaged per week —
a 4-pair week must not weigh like a 400-pair week).

**Measurability floor:** a position grades only with ≥ 200 qualifying
pairs in the window; below that its cell is `unmeasurable`, never a
verdict in either direction.

## 2. THE CORY BAR, as a computation

Over a grading window, OUR published weekly projection (`own_weekly`'s
champion column — whatever the promotion record says it is that week,
frozen per week at snapshot time) **beats a provider at position q** iff
our pairwise accuracy exceeds theirs on the IDENTICAL pair set. **The
bar is met** iff we beat BOTH Sleeper and FantasyPros at ≥ 3 of the 4
positions (QB/RB/WR/TE). Windows: first grade **09-15** (weeks 1–2),
then fortnightly CUMULATIVE (always season-to-date, so the number that
matters converges instead of bouncing). Implementation lands in
`weekly_own_grade.py` (A owes it before 09-15; D grades through it).

## 3. THE TIER-1 ARM ROSTER AT FREEZE — one arm per signal, with owners

| arm | signal | owner | prior art | blind prediction |
|---|---|---|---|---|
| `own_weekly` champion | the stack | D | promotion record | (is the baseline) |
| `sleeper`, `fantasypros`, `sleeper_fp_average` | providers | grader | already wired | — study arms |
| `wr_source_delta` | own-vs-market WR delta | **A** | V8 run one: per-game λ 0.75/0.61, CI>0 both folds — the program's only replicated positive | **P101** |
| `pos_scoped_tilt` | vegas tilt, per-position gate | **D** | D's weekly study: tilt HURTS RB, CI excluding zero | D files own P-row before first grade |
| `opponent_defense` | opponent softness | **D** | P56 gate split; P93 (never measured); SHUFFLE null REQUIRED | D's row 3 of D-INSEASON-TASK |
| `props_weekly_v1` | market props | A/D | committed; event-props capture live from 09-03 | graded as wired |

New arms after these enter through `BLEND-SEARCH-DESIGN.md` §2's rules
(one sentence per axis, prereg before grade). Blends: none before
10-08, per the design's own dates. BEST-OF-K attaches to every grade;
the >0.98 error-correlation costume gate (V7 run three's standing rule)
is reported for every arm from its first grade.

## 4. Blind predictions filed with this freeze (ledger P101)

1. **At the 09-15 first grade we do NOT yet meet the 3-of-4 bar** —
   two weeks of pairs is thin and the providers carry availability
   information we measurably lack (V8's decomposition).
2. **On the season-to-date grade at season end, we beat BOTH providers
   at WR** on the frozen metric — the one position where our per-game
   production signal replicated.
3. **We do not beat both providers at QB all season** — QB λ was dead
   in every study that looked.

## What was deliberately NOT frozen

Roster/lineup-specific grading (scoring only Cory's actual weekly
decisions) — considered and rejected for the bar: n per fortnight is
tiny and the decisions are endogenous to whichever source Cory already
trusts. B's start/sit verdict panel SHOWS the Cory-decision view for
legibility; the bar grades the pooled pairwise metric above.
