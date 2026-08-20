# P107 — the VONA self-exclusion fix, graded

**A, 2026-08-19.** Prereg: `draft/backtest/VONA-SELF-EXCLUSION-PREREG.md`
(filed and committed at `40ed723f`, before any arm ran). Register row 56.
Choice files: CI run **32206775148**, commit `829f0a1f`.

---

## Headline

**A1 — putting the player back into his own next-pick pool — is worth
+114.1 points per seat-season, CI95 [+48.0, +180.1], and it replicates in
all three seasons.**

| arm | pooled optimal Δ vs A0 | CI95 | seats better |
|---|---|---|---|
| **A1** include-self (the fix) | **+114.1** | **[+48.0, +180.1]** | **24 / 30** |
| A2 flat `(1-s)` rescale (diagnostic) | −23.8 | [−92.8, +45.2] | 13 / 30 |

**Season-clustered, which is the CI that should be believed** — ten seats
inside one season share a board and the same opponents, so thirty seat-seasons
are not thirty independent draws:

| arm | 2023 | 2024 | 2025 | clustered mean | CI95 | seasons positive |
|---|---|---|---|---|---|---|
| **A1** | +182.7 | +49.3 | +110.1 | **+114.1** | **[+38.5, +189.6]** | **3 / 3** |
| A2 | −39.9 | −3.4 | −28.1 | −23.8 | [−44.8, −2.7] | 0 / 3 |

Per-season seats improved by A1: **9/10, 7/10, 8/10**. Cory's own seat gains
**+188.5 / +164.8 / +155.5**.

Seats the engine BEATS, A0 → A1: 2025 **1/10 → 5/10**, 2023 **0/10 → 2/10**,
2024 0/10 → 0/10. Status-filtered pooled, optimal: A0 −189.6 → A1 **−111.1**
median owner delta, Cory −286.8 → **−87.3**.

## The three legs as registered

**P107-a — TRUE on the preregistered primary.** `optimal` (hindsight-optimal
legal lineup, skill slots, both rosters frozen, opponents fixed) is the
estimand `replay_seats_grade.py` names as primary, and A1 clears zero on it
both pooled and season-clustered.

⚠️ **AND THE HALF THAT MUST BE SAID IN THE SAME BREATH: the `realistic` arm is
a NULL.** +12.4 [−49.0, +73.9] status-blind, −16.4 [−69.7, +36.8]
status-filtered. Under start-of-week-information lineups the gain does not
survive. That file's own rule is *"never quote the realistic arm alone"*, and
the mirror of that rule applies here: **the honest sentence is that A1 builds a
better ROSTER, and that at n=30 the improvement does not yet show through the
noise of actually setting lineups from it.**

**P107-b — FALSE. My account of the mechanism was wrong, and the measurement
says so.** I predicted the players A1 pushes DOWN would carry above-board-mean
survival. Measured on the live 08-19 board at pick 48: demoted 0.9738,
promoted 0.9896, board 0.9911 — the demoted set is if anything the LOWER-
survival one. Scoped post-hoc to the top 50, where a pick is actually decided,
there is no separation either: demoted 0.9166 vs promoted 0.9136 across 47
movers.

**Why I was wrong, stated so the next person does not repeat it.** VONA is
NEGATIVE for everyone below the top of his position — he is being priced
against men who are better than he is. Survival-weighting shrinks a negative as
readily as a positive, so A1 pushes the whole deep tail UP toward zero while
pulling the top-of-position few down. A board-wide mean over those two opposite
motions says nothing. **The defect is still exactly what register 56 says it
is** — a certain survivor priced at 14 points of urgency is wrong arithmetic —
but the way it propagates into a RANKING is not the simple demotion I claimed.

**P107-c — TRUE, and with the names.** Under A2 at pick 48 on the live board,
**Joe Flacco enters the top 10 from rank 449 and Josh Johnson from rank 460**,
both at survival 1.000. Under A0 and A1 neither appears. A2 simultaneously
guts the real board: Terry McLaurin 18 → 471, Jayden Daniels 32 → 485, Davante
Adams 44 → 487.

**THOSE ARE THE SAME TWO NAMES THE ENGINE'S OWN COMMENTS ALREADY RECORD** from
the 2026-08-14 `VONA_SLOT_AWARE` flooring attempt: *"the sim then spent rounds
9 and 10 on Josh Johnson and Joe Flacco."* A flat rescale and a floor at zero
are different edits that collapse VONA's ordering the same way and produce the
same two quarterbacks. That is corroboration, not coincidence, and it is why
A2 was carried as a runnable arm instead of a remembered anecdote.

## What A1 actually changes, on the board Cory drafts from

`draft/tools/vona_arm_board_probe.js`, live board built 2026-08-19T00:54:18Z,
Cory's real pick schedule, MEASURED_WEIGHTS, room drained in ADP order.

**This is not a cosmetic correction. It changes the first pick.**

| | pick 8 | first QB | 15-pick roster |
|---|---|---|---|
| A0 | **QB Josh Allen** | round 1 | WR3 RB10 QB1 TE2 K1 DEF1 |
| A1 | **RB James Cook** | pick 108 (Goff) | WR2 RB12 TE1 QB1 K1 DEF1 |

In the seat replay the engine's first-QB round moves 2023 r10→r4,
2024 r3→r10, 2025 r6→r4 — mixed, not a uniform wait.

## What would make this wrong

- **The seat replay MIRRORS K/DEF.** The population where this defect is
  largest is the population the headline cannot grade. Stated in the prereg
  before the run, and it is still the biggest limit on the number above.
- **Three seasons is three clusters.** The clustered CI is honest about that
  and still clears zero, but 3/3 replication over three seasons of one league
  is not the same as a broad result.
- **`realistic` is null.** Repeated here because it is the caveat most likely
  to be dropped when this gets quoted.
- Historical FFC ADP is name-matched against today's Sleeper list (inherited
  bundle caveat), so the replay's survival inputs are noisier than the live
  board's.
- A0's own numbers are bad in absolute terms — the engine loses to the median
  owner in every season under both arms. **A1 is a large improvement to a
  configuration that is still losing this replay.** It closes roughly a third
  of the gap; it does not close it.

## Decision

The prereg's rule for a TRUE headline was *ship A1* — with a date gate that a
good result does not unlock: **nothing reaches Cory's board before 2026-08-22
without his explicit call.** `VONA_INCLUDE_SELF` therefore stays `false` in the
shipped engine and the decision goes to Cory with these numbers, because
changing the primary decision metric — and the first-round pick with it —
three days before a draft is his call to make, not mine to make quietly on one
study.
