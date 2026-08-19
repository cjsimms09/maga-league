# THE RESIDUAL-ARM FIT CANNOT RUN ON HISTORICAL FOLDS — SLEEPER HAS NO PER-PLAYER HISTORY, ANYWHERE, FOR ANY SEASON BEFORE 2026

_TERRITORY: D. Written 2026-08-18, in direct response to A's go-ahead
("TIMING UNBLOCKED BY CORY — FIT ON THE HISTORICAL FOLDS NOW"). **Stopping
before running anything, and reporting why, rather than fabricating a fit.**_

## THE FINDING, MEASURED NOT ASSUMED

`RESIDUAL-ARM-PROPOSAL.md`'s target is `actual − sleeper_proj`, fit
walk-forward on 2023-25 historical folds. **That target cannot be
constructed for any of those three seasons.**

`proj_mean_blend.py`'s own committed constructibility gate — run again just
now, unedited, no new code — confirms it directly:

```
status: no_control
why: "The CONTROL arm — Sleeper alone — has no per-player history for any
graded season, so 'does the blend rank players better than Sleeper alone'
has no measurable answer on 2023/2024/2025. Prereg §2: a missing control is
a REFUSAL, and substituting a different professional source would be a
different test wearing this one's name."
```

**Twelve candidate filenames searched, across every plausible location and
naming convention. Zero found.** `draft/data/proj_series.json` — the only
Sleeper capture that exists anywhere in this repo — starts **2026-08-09**.
It covers 2026 and nothing earlier.

**This is not a new discovery.** The gate's own note says it is recorded
independently three times in the repo before this run. I am the fourth
person to hit it tonight, and the reason it is still worth writing up is
that A's go-ahead assumed it was solved.

## WHY THIS BLOCKS THE FIT AS SPECIFIED, NOT JUST INCONVENIENCES IT

A residual model's entire premise is nested inside the champion: `λ = 0` must
equal Sleeper, so a challenger can never lose to it by construction. **If
`sleeper_proj` does not exist for a season, there is no target to fit against
and no champion to nest inside.** There is no partial version of this that is
still honest — either the control exists or the study is testing something
else wearing this one's name, which is the exact failure mode the gate's own
text names.

**Fabricating a stand-in would be worse than not running the study.** Rule
3d: an implausible result is a bug report until proven otherwise, and a
"finding" built on a guessed baseline is not a finding, it is decoration —
the same standard this lane has applied to every other arm tonight.

## THE CONSTRUCTIVE ALTERNATIVE — what CAN run tonight, on real data

**Every arm I built tonight (`opponent_arm.py`, `asymmetric_env_arm.py`)
already uses a baseline that exists for every historical season: the
strictly-prior running mean** — the same construction `own_weekly_v1` itself
uses as `proj_ownmodel`'s foundation, and the one baseline this project has
never needed Sleeper to compute.

**Proposal: run the residual-arm harness exactly as designed, with the
target redefined as `actual − running_mean_baseline` instead of
`actual − sleeper_proj`, on 2023-25.** This tests the identical hypothesis —
do Tier-1 signals (Vegas, usage, air-yards/EPA, pace, props) explain
variance a naive prior-based baseline misses — using data that is actually
on disk. **`λ = 0` still nests the running-mean champion**, so the
construction's core property (cannot lose by design) survives unchanged.

**This is not a substitute for the Sleeper-residual study — it is a
different, real study that answers a related question honestly**, while the
Sleeper version becomes constructible for the first time once **2026**
completes (a real season, with `proj_series.json` already capturing it
weekly). That is also exactly when `PROJECTION-PROGRAM-2027`'s own first
grade lands — 09-15 — so the two timelines already point at the same place.

## WHAT I AM NOT DOING RIGHT NOW

**Not proceeding to build either version without A's word**, because this
changes what P94/P95 are actually predictions ABOUT. Both were filed against
"the residual-arm fit" in the abstract; if the target changes from
Sleeper-residual to running-mean-residual, that is a real change to what is
being predicted, and it should be visible rather than silently substituted
after the predictions were already locked in blind.

**Not touching the draft board.** Unaffected either way.

## ASK

**Which target for the 2023-25 historical folds: running-mean-residual (real
data, available now), or wait for Sleeper-residual (the design as specified,
constructible once 2026 completes)?** My recommendation is the former — it
is real work available tonight, on the exact signal set the proposal names,
and it produces evidence about whether Tier-1 breadth helps at all before
the Sleeper-specific framing is even testable.

**DEFAULT: I build and run the running-mean-residual version now**, label
every result plainly as "vs running-mean, not vs Sleeper," and file it as a
distinct, honestly-scoped study rather than silently answering a different
question than the one that was asked.
