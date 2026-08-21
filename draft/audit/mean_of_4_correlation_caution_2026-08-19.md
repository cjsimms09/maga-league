# The mean-of-4 candidate's sources are MORE correlated than the pair that already taught us averaging doesn't pay

_TERRITORY: D. Written 2026-08-19, on Cory's own priority ("mean projections
are coming... finding best model for draft"). Not a critique of the roster-shape
finding (`4cd9a24e`) — that effect is real and separate. This is about the
CENTRAL claim, "the 4-source mean predicts better," which the roster-shape
argument does not establish._

**The question this project already answered, applied to today's candidate: does averaging correlated sources ever beat picking the best one?**

## 1. The mechanism, already graded — not asserted here, quoted

`draft/audit/sleeper_vs_fp_grade_run_2026-08-18.md` (register 21, P1-P4 graded
blind): a three-way blend of Sleeper + FantasyPros + own_v6 on the real 2025
season. **Blend beat the better single source at WR and TE, tied at RB, LOST
outright at QB.** The prereg's own mechanism check, stated in advance and
confirmed after:

> Sleeper|FantasyPros error correlation on this population is 0.93–0.97 — the
> regime where two-way averaging pays nothing... own_v6's error correlation
> with each is 0.64–0.90, and every point of blend gain sits where own_v6 is
> close in solo skill... it pays only where own_v6 is close in skill and costs
> where it is not.

In plain terms: **averaging two ~0.95-correlated sources buys nothing —
they're wrong in the same direction, so the average is just as wrong.**
Averaging pays only when one source is wrong in a genuinely *different* way
(the 0.64–0.90 regime), and even then only where that source is competitively
skilled solo.

## 2. Measured just now: where do CBS/ESPN/FFToday sit on that same scale?

`draft/data/multisource_projections.json`'s own `agreement_spearman` block,
committed today alongside the mean-of-4 candidate:

| pair | ρ |
|---|---|
| CBS vs ESPN | 0.932 |
| CBS vs FFToday | 0.941 |
| ESPN vs FFToday | 0.969 |
| CBS vs Sleeper | 0.926 |
| ESPN vs Sleeper | 0.929 |
| FFToday vs Sleeper | 0.957 |

**Every pair is 0.926–0.969.** That is not just inside the "averaging pays
nothing" band register 21 identified — it is tighter than the Sleeper/FP pair
(0.93–0.97) that band was measured on, and there is no source in this set
playing own_v6's role (something in the 0.64–0.90 range, genuinely
disagreeing for a different reason). All four sources here look like they are
drawing on a highly overlapping information set — likely the same base depth
charts, same beat-writer consensus, same ADP-anchoring that makes public
projections converge.

## 3. What this does and does not say

**Does NOT say:** the mean-of-4 board is wrong, or that its roster-shape fix
(RB8/WR3 instead of RB10/WR1) is fake — that effect is real and independently
measured, and it does not depend on the mean being more ACCURATE, only on it
being DIFFERENT in a way that happens to diversify the build. Also does not
touch the ceiling/floor half — cross-source SD is a different quantity than
the mean, and P113 already covers it honestly (ungradeable until 2026 data
exists, filed blind).

**Does say:** the specific claim "the 4-source mean is a better CENTRAL
prediction than Sleeper alone" does not have the mechanism support that made
the WR/TE blend real in the one case we've actually graded. If anything, the
correlation structure argues the opposite direction from what intuition
suggests — "more sources" sounds like more information, but four sources
agreeing this tightly behave like one source with slightly less noise, not
four independent opinions.

## 4. What would actually test it — and why it can't run yet

The honest test is the same one register 21 already ran for Sleeper/FP/own_v6:
grade mean-of-4 against real outcomes, leak-gated, on a season where all four
sources have committed history. **CBS, ESPN and FFToday have zero historical
seasons in this repo** — `multisource_projections.json`'s `_note` and the
ffanalytics capture are both 2026-preseason-only. This is the same
constructibility gap `proj_mean_blend.py`'s `constructibility_gate()` already
names for Sleeper, one level further out: the new sources are newer than the
season they'd need to be graded against. Filed as the corresponding blind
prediction (P114) rather than left unmeasured and unmarked.
