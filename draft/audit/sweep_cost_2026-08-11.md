# The 199-second sanity sweep — measured, and the premise was inverted

## The tilt is not the cost. It is a saving.

Measured with the order reversed and both arms warmed, so neither JIT nor
ordering can explain the direction:

| | ms per state |
|---|---|
| `CONSERVE_SURVIVAL_ON = false` | 679 / 612 |
| `CONSERVE_SURVIVAL_ON = true` (shipped) | 406 / 378 |

**The tilt path is ~39% FASTER.** `conservedSurvival` fits the whole board once
per context and memoises it; the raw path recomputes survival per player per
call. Turning the tilt off would make the sweep slower, not faster.

The first measurement I ran said "tilt share −48%", which I did not report,
because a negative cost share is the shape of a measurement error rather than a
finding. Re-running it with the arms swapped is what turned it into a result.

## Where the 199 seconds actually goes

`SPECS × ROUNDS_TESTED(10) × DEPTHS(3)` ≈ 300 roster states, each running the
real `E.recommend` over all **1,760** players. CPU profile of the recommendation
path, self time:

```
 24.1%  conservedSurvival   [survival.js]
 16.9%  scorePlayer         [engine.js]
 12.8%  (anon)              [engine.js]
  9.7%  survival            [engine.js]
  8.8%  expectedBestAvailable
  7.5%  vona
  5.6%  (garbage collector)
  5.1%  tierCliffUrgency
```

`conservedSurvival`'s 24% is **one full-board fit per state**, not a memo miss:
`TILT_MEMO` is keyed on the board array with a descriptor string, so within a
state the first `scorePlayer` computes and the other 1,759 hit. Across states the
context genuinely differs. That is the design working, not a defect.

**So the cost is inherent to what the sweep is: 300 states × a full board.**

## The only real inefficiency, and why I am not taking it

`tierCliffUrgency` is 5.1% of the profile and its weight is **0.0** under
`MEASURED_WEIGHTS`. The same is true of `need`, `risk`, `ceiling` and `bye` —
all computed unconditionally, all multiplied by zero. Skipping them is the
obvious win and it caps out around 5–10%.

**I am not doing it, and the reason is the trade rather than the difficulty.**
Those terms are published in `components` and read by the deviation badge and
the why-panel, which display them regardless of weight — so a fast path means
either two scoring paths that can diverge, or losing the explanation. Both are
changes to the scorer, nine days before a draft, to save a couple of minutes of
CI. A silent change to what the tool recommends is not worth two minutes.

## What I would actually change, if anything — Cory's call

The one safe lever is the sweep's own dimensionality: `DEPTHS = [0, 6, 14]` and
ten rounds. Dropping a depth is a ~33% cut and it is a TEST change, not an engine
change, so it cannot alter a recommendation. The cost is coverage — this suite
exists because mock #3 produced advice no existing test caught, and thinning it
is exactly the trade that made it necessary.

**My recommendation: leave it.** 199 seconds is annoying, not blocking, and the
400-second per-suite cap already absorbs it. The thing that actually bit was my
integrator calling a 206-second suite a red at a 150-second timeout, and that is
fixed at the timeout rather than by making the suite smaller.
