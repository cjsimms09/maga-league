# PLAYER-SPECIFIC UPSIDE — preregistered, 2026-08-17, BEFORE any number exists

**Nothing here has been run.** Written the night register row **4j** was measured,
so the arms, the population, the primary metric and the decision rule are all
fixed before anyone can see which way the answer falls. That ordering is the
whole point; it is the thing that went wrong in the `ceiling` history this
document exists to correct.

---

## THE FINDING THIS ANSWERS

**Measured 2026-08-17 (register 4j): 0 of 535 players share a `proj_mean` and
differ on ANY dispersion field.** `proj_ceiling`, `proj_floor`, `proj_sd`,
`weekly_sd` and `variance` are pure deterministic functions of
`(position, proj_mean)`. Within position, `Spearman(proj_mean, ceiling)` runs
**.984–.9994**; `proj_floor` for WR is **exactly 1.0000**.

**This is NOT the old constant-multiple bug** — ratios genuinely vary now
(RB 1.43–1.89, QB 1.09–1.48), so the measured p90/p10 calibration is real work
and an improvement. **What it is not is player-specific.** Carnell Tate (rookie
WR, ADP 72) and Courtland Sutton (established, ADP 91) both project 144.8, so
the board gives them the identical ceiling 190.75, identical floor, identical sd.

> **The board cannot answer "who has more upside than his projection suggests."**
> That question is most of what Cory means by edge.

## THE QUESTION — one sentence, fixed

> **Does adding a player-specific term to dispersion predict realized outcome
> spread better than the projection-level calibration alone?**

**Graded against realized spread, never against the draft.** A ceiling is a
claim about the top of a player's outcome distribution, so the ground truth is
what he actually did — not where he went.

## ARMS — fixed here, before any fetch

| arm | definition |
|---|---|
| **BASE** | today's calibration: `ceiling = f(position, proj_mean)`. **The incumbent, and it must be beaten, not tied.** |
| **+EXP** | BASE × a fitted function of `years_exp` — **617/617 coverage, 19 distinct values** |
| **+AGE** | BASE × a fitted function of `age` — 587/617, 22 distinct |
| **+MARKET** | BASE × a fitted function of **`adp_sd`** — ⚠️ **DOWNGRADED 08-17, SAME DAY, BEFORE ANY RUN: `PARTIAL` and probably unusable.** The 617/617 coverage is real and the 131 distinct values are real, **but 369 players sit at exactly `30.0` and 108 at exactly `15.0`, and the per-position MAD is 0.0000 for QB, WR and TE.** Only RB carries a distribution. **I named this the arm to watch off a distinct-count without checking the shape — the exact post-hoc reasoning a prereg exists to prevent, committed inside the prereg.** Register 4n. It stays as an arm only if 4n shows the saturation is real market behaviour rather than a default fill. |
| **+ROLE** | BASE × a fitted function of `target_share` — 446/617, 164 distinct ⚠️ `PARTIAL` |
| **SHUFFLE** | the winning arm's player-specific term **randomly permuted across players within position**. **KNOWN-POSITIVE CONTROL.** |

**Coverage is quoted from the live board, measured 08-17, not assumed.**
`snap_pct` is **0/617** and is therefore NOT an arm — naming it would have been
a fifth arm that could never run.

**⭐ WHY `+MARKET` IS THE ONE TO WATCH, stated in advance so it cannot be a
post-hoc story:** `adp_sd` is the market's own disagreement about a player. It
is **already on every board row, at 100% coverage, and reaches nothing**. If
player-specific upside exists anywhere in data we already hold, this is the
cheapest place it can be.

## THE CONTROL, AND IT IS A GATE

**`SHUFFLE` MUST LOSE.** If permuting the player-specific term across players
performs as well as the real assignment, then the term is not carrying
player-specific information — it is carrying a distributional rescale, and the
arm has reproduced the exact defect 4j describes **one level up**. **SHUFFLE
winning or tying ⇒ VOID, not a positive.**

This gate exists because it is precisely what nobody ran on the original
ceiling: a field can look measured, vary continuously, and still contain no
per-player signal.

## POPULATION — one matched set

A player is scored only if **every arm has a value for him** and he has realized
points in the graded season. **`+ROLE` will shrink the matched set; if it drops
the set below 80% of the BASE-eligible population, `+ROLE` is reported `PARTIAL`
and cannot win** — the same trap the ADP study names, and the same rule.

**Seasons: 2023, 2024, 2025**, walk-forward. **A season's calibration may never
see that season's outcomes** — the leak that would make any of this meaningless.

## METRICS — primary named first

1. **PRIMARY: calibration of the p90.** Over the population, what share of
   players actually exceeded their predicted ceiling? A perfect p90 is **10%**.
   Score is `|observed_exceed_rate − 0.10|`, lower is better.
2. **SECONDARY: Spearman(predicted dispersion, realized |error|)** within
   position — does the arm rank *who was volatile* correctly?
3. **REPORTED ALWAYS, never a winner:** `Spearman(proj_mean, ceiling)` within
   position, i.e. **4j's own number.** An arm that improves prediction while
   staying at .99 collinear with the mean has not fixed the thing this document
   is about, and the table must show that.

## THE DECISION RULE — before the numbers

**An arm wins only if it beats BASE on the PRIMARY metric in at least 2 of 3
seasons, AND is not `PARTIAL`, AND `SHUFFLE` loses.** Anything else is
**NO SEPARATION**, and the board keeps the projection-level calibration.

**Ties on primary break on the SECONDARY metric** — never on arm order in this
table. (The blend run had two weights tie on wins and the winner was decided by
the order somebody typed the grid; that is a defect, not a tiebreak.)

## GATES

1. **Walk-forward or VOID.** Any arm whose fit saw the graded season's outcomes
   is void, not merely optimistic.
2. **`SHUFFLE` must lose** — see above.
3. **Egress failure is VOID, not negative.** A fact about the runner.
4. **Coverage before accuracy**, per arm, reported first.
5. **If the winning arm's improvement is smaller than the gap between BASE's two
   worst seasons, report it as NOISE**, not as a win.

## WHAT SHIPS

**NOTHING BEFORE 2026-08-22, and this one is not close.** Dispersion feeds
`proj_ceiling`, `proj_floor`, the bench branch, `champodds` and the money proxy
— a wider blast radius than the projection swap or the ADP swap. The most this
licenses is *"adopt for 2027 and re-test next preseason."*

**AND IT DOES NOT TOUCH THE 08-17 CEILING RULING.** Cory ruled
`MEASURED_WEIGHTS.ceiling = 0.45` and that shipped (`09f94f99`). This asks a
different question — what the ceiling FIELD contains, not how much the composite
WEIGHTS it. Confusing the two is how row 2c ended up prescribing a test that
could not work.

## OWNER

**A** rules on what the result means. **D** owns whether the loop grades it.
The relay wrote this and owns nothing else about it.
