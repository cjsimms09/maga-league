# RANDOM-WEIGHT — the second owed null, and it says our five arms cannot be blended

_TERRITORY: D. `BLEND-SEARCH-DESIGN.md` §3's second null, after BEST-OF-K
(register DS9). Written 2026-08-18. It existed nowhere — `grep` for
`random_weight` / `RANDOM_WEIGHT` returned zero hits._

> *"a stacker that beats the champion only because averaging reduces variance —
> draw random non-negative weights, rebuild, compare"*

## 1. THE TRAP, AND WHY IT NEEDS TWO QUESTIONS NOT ONE

Blending K arms reduces the variance of the blend's error **even when the
weights carry no information**. So a fitted stacker that beats the best single
arm may have bought that entirely with averaging — and its **weights**, the
thing anyone would write up, may be worth nothing.

| question | what it answers |
|---|---|
| does the blend beat the best single arm? | averaging **+** weights |
| **do the FITTED weights beat RANDOM weights?** | **weights alone** |

**Only the second is evidence the fit learned anything.** The module reports
both and splits the gain, and a test asserts the split reconciles.

## 2. THE CALIBRATION — free MAE gain from averaging, per unit of error sd

Indexed by **arm-error correlation ρ**, not by n, because that is what governs
the free lunch.

| K | ρ=0.0 | ρ=0.3 | ρ=0.6 | ρ=0.9 | ρ=0.99 |
|---|---|---|---|---|---|
| 2 | 0.1444 | 0.0931 | 0.0480 | 0.0086 | −0.0004 |
| 5 | **0.3195** | 0.1956 | 0.0970 | 0.0166 | **−0.0009** |
| 15 | 0.4835 | 0.2682 | 0.1266 | 0.0198 | −0.0019 |

**Five arms with independent errors hand a random blend 0.32 × sd for free.**
On our weekly error sd of roughly 7, that is **~2.2 MAE points — larger than
any effect this project has measured.** A blend program without this null would
report that as a finding.

**And at ρ=0.99 the same blend gets nothing.** Averaging copies of one thing
changes nothing, which is the cheap sharp control the tests pin.

## 3. WHAT IT SAYS ABOUT OUR ACTUAL FIVE ARMS — this is the actionable part

`own_weekly_v1`'s five arms are `v1`, `v1_tilt150`, `v1_tilt050`, `v1_notilt`,
`v1_pg16`. All are `proj_ownmodel / divisor × tilt` variants. Priced on the
live board for 2026 week 1 (463 players priced by all five):

| pair | sd of prediction difference |
|---|---|
| v1 vs v1_tilt150 | 0.181 |
| v1 vs v1_notilt | 0.363 |
| **v1_tilt150 vs v1_notilt** | **0.544** ← the most different pair |
| v1_notilt vs v1_pg16 | 0.526 |

**The two most different arms disagree by an sd of 0.54 points per week,
against a per-row error sd of roughly 7.**

> **Implied ρ ≈ 0.997.** And the conclusion does not depend on that error-sd
> assumption: at sd 3 it is 0.984, at sd 5 it is 0.994, at sd 10 it is 0.9985.
> **Every plausible value leaves ρ above 0.98.**

**At that correlation the averaging channel is CLOSED: −0.0009 × sd, i.e. about
−0.006 MAE points.** Not "small" — nothing.

> **Blending the current five arms cannot help.** Any blend of them that
> appears to beat the champion is measuring something other than the blend.

**This validates `BLEND-SEARCH-DESIGN`'s Tier-1 design and warns that today's
challengers do not satisfy it.** Tier 1 is *"one arm per signal"* — genuinely
different sources. The five arms in the grader are one signal at five
parameter settings, which is a sensitivity sweep, not a blend candidate set.
**The blend program needs arms that disagree before step 3 (10-08) is worth
running.**

## 4. THE CONTROLS

| control | result |
|---|---|
| **known-positive** — weights on the genuinely best arm | detected |
| **known-negative** — a random blend passed off as fitted, 12 seeds | fired **0–2 of 12** |
| **identical arms get no free gain** (ρ→1 ⇒ 0) | pinned at K=2, 5, 15 |
| gain grows with K, shrinks with ρ | both directions pinned |
| the split reconciles | `over_champion = averaging + fitted`, asserted |
| malformed panels | raises, rather than comparing different populations |

## 5. WHAT THIS DOES NOT DO

- **It does not fit anything.** It grades a stacker someone else fits.
- **It does not replace BEST-OF-K.** Different failure: BEST-OF-K kills a winner
  picked from many; this kills a winner made by averaging.
- **§3's ρ is estimated from prediction spread, not measured from errors** —
  2026 has no actuals yet. The bound is robust across error sds (§3) but it is
  a bound, and **re-measuring ρ directly from graded errors is the trigger**,
  available from the first Tuesday grade.
- **The third null, SHUFFLE, is still owed.** §3 lists three; two now exist.
  Saying so plainly so this is not read as closing the section.
