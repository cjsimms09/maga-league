# DRAFT 2027 — what to fix, ranked by what we measured

**Session D, 2026-08-23.** Cory: *"look at everything from draft — its
recommendations, how we chose picks, our calculations — and try to be 10x better
next year. Goal is to draft me the best possible roster."*

Everything below is measured, with the measurement named. Where a number is
inherited rather than re-checked, it says so.

---

## 0 · THE HEADLINE: WE ARE NOT MEASURING WHAT WE SHIP

**Every number behind *"the tool finishes 8th of 10"* and the conversion gap was
measured with the roster-aware term switched OFF.**

* `seat_rank_and_the_conversion_gap_2026-08-19.md` was run **08-19 07:20**.
* `need` went **0 → 1.0** on **08-20 18:37**.
* The shipped constant today is `need: 1.0` (`engine.js`, read off
  `MEASURED_WEIGHTS`).

**Nobody re-ran the replay afterwards.** So the project's headline verdict on its
own drafting describes a configuration we no longer ship, and **we do not
currently know whether our biggest known defect is still a defect.**

~~**This is the first thing to do and it is cheap**~~ — ⚠️ **CORRECTED 08-23,
HOURS AFTER WRITING IT, BY TRYING TO DO IT. IT IS NOT CHEAP AND I COULD NOT RUN
IT AT ALL.** `replay_seats.js` reads `draft/backtest/bundles.json`, which is
**gitignored and has never been committed**; it is rebuilt by `cli.py`, which
needs Sleeper egress — verified by running it: *`RuntimeError: Sleeper
unreachable for /players/nfl: 403 Forbidden`*.

**So the replay runs only in CI, and even there it cannot REPRODUCE the 08-19
result** — rebuilding bundles yields today's bundles, not the ones the number was
measured on. **`8th of 10`, `−188.35` and the conversion table below are
unfalsifiable as they stand: they cannot be checked, and they cannot be compared
against a re-run, because the inputs are gone.** Register 266.

That does not make them wrong. It makes them **unverifiable at the weights we
ship**, and every ranked item below is provisional on a measurement nobody can
currently take.

## 1 · THE ROSTER PROBLEM IS REAL, AND IT IS SPECIFICALLY QUARTERBACKS

Verified in the audit's own table, not inherited:

| season | engine roster / lineup | conv | owner conv | roster vs owner | gap |
|---|---|---|---|---|---|
| 2023 | 20650 / 15286 | **0.740** | 0.828 | **+2.1%** | −0.087 |
| 2024 | 17990 / 14656 | 0.815 | 0.826 | −17.3% | −0.011 |
| 2025 | 21127 / 16300 | **0.771** | 0.834 | **+5.1%** | −0.062 |

**In two of three seasons the engine's roster holds MORE total points than the
owners' and still loses.** Every point of those losses is conversion — value
acquired that never reaches a starting slot.

**And the gap tracks the QB surplus monotonically and nothing else:** QB 1.9 →
0.740, QB 2.7 → 0.771, QB 1.2 → 0.815 where the gap nearly vanishes. **One 2023
seat drafted seven quarterbacks in a one-QB league.** Points on a backup QB's
bench line are unstartable by construction — they are not a projection error, a
ranking error, or bad luck.

**So "the best possible roster" is not mainly an acquisition problem.** We are
already good at buying points. We are bad at buying points *we can field*.

## 2 · THE CROSS-POSITION CALIBRATION IS OFF, AND IT IS CHECKABLE

Measured today off the live board, against the reference model `ffanalytics`
that `DUPLICATE-A-REAL-MODEL-2026-08-19.md` already says we should copy:

| pos | our players above replacement | ffanalytics | ratio |
|---|---|---|---|
| QB | 9 | 13 | 0.7× |
| **RB** | **19** | **35** | **0.5×** |
| WR | 29 | 36 | 0.8× |
| TE | 9 | 13 | 0.7× |
| K | 9 | 8 | 1.1× |
| **DEF** | **9** | **3** | **3.0×** |

**Our replacement level sits near rank ~9 for every position.** The correct
levels are not a constant — they follow how many of each position a league
actually starts. RB is set at half its proper depth and DEF at three times.

**Why this matters for roster shape:** replacement level *is* the zero point of
VORP. Set RB's bar too shallow and RB value collapses to zero early, which is
exactly when the board starts preferring other positions for reasons that are an
artifact of the bar rather than of football.

## 2b · AND HERE IS WHAT THAT CALIBRATION ACTUALLY COSTS — measured

Simulated on committed data only: opponents pick exactly as they did, and at
each of Cory's twelve picks the tool takes its own #1 off the corrected board.

| | WR | QB | TE | **RB** | K | DEF |
|---|---|---|---|---|---|---|
| **the tool** | 5 | **4** | 3 | **0** | 0 | 0 |
| Cory | 5 | 1 | 1 | **4** | 0 | 1 |

**Four quarterbacks in a one-QB league — three unstartable by construction — and
zero running backs in twelve picks.** Cory drafted four RBs. He was right and the
board was telling him not to be.

**The mechanism, at his real picks:** best available RB by VORP runs **+36** at
pick 33, **+28** at 48, **+5** at 53, then **−19** at 68 and 73. **By round six
every remaining back is below replacement**, so the board stops recommending the
position at all — while quarterbacks stay positive all the way down and it takes
four.

⚠️ **AND THEN I TESTED THE FIX AND IT FAILED — see §2c. Re-deriving the bars
from the league config makes the roster WORSE, and §2's *RB should be 35* was
borrowed from a model calibrated for a different league.**

**It also explains §1's conversion gap without needing the unrunnable replay** —
the 08-19 audit found the gap tracks QB surplus and nothing else, and a 2023 seat
drafting seven QBs. Same defect, different year, **reproducible from committed
files this time.**

⚠️ **Limits: one seat, one year, opponents fixed — and this is the RANKING alone.
It does not include `need`, which ships at 1.0 and exists to stop precisely
this.** So it measures how much work `need` is being asked to do, not what the
live engine drafts. Register 267.

## 2c · THE CALIBRATION FIX IS REFUTED — and that is the useful part

Derived from `draft/config/league_config.json` (10 teams; QB1 RB2 WR2 TE1 FLEX1
K1 DEF1), replacement = teams × starters with FLEX shared across RB/WR/TE:
**QB10 · RB24 · WR24 · TE12 · K10 · DEF10.**

Re-running the same twelve-pick counterfactual at those bars:

| bars | QB | RB | WR | TE |
|---|---|---|---|---|
| current | 4 | **0** | 5 | 3 |
| **league-derived** | 3 | 2 | **0** | **7** |

**Seven tight ends in a league that starts one, and now zero wide receivers. The
pile did not shrink — it moved.**

**Two corrections to §2, both mine.** `ffanalytics`'s QB13/RB35/WR36/TE13/K8/DST3
are correct for the league *that model* was calibrated on, not for a 10-team
league starting one QB — derived from our own config, RB is **24, not 35**, so
"RB's bar is at half its proper depth" was measured against a number that does
not apply here.

**What the test does establish is more useful than what it refutes: no placement
of the replacement bar produces a startable roster.** Cross-position VORP is
exquisitely sensitive to where each bar sits on that position's own curve — TE's
lands where the TE curve is flat, so TEs 2-12 all price just above it. **A
ranking with no notion of how many of each position you can START cannot build a
roster you can field, at any calibration.** That is the ceiling of the method,
not a bug in the bar.

**So the lever is not calibration. It is roster-slot awareness in the SELECTION**
— `need`, and register 60's flex rule, empty-slot insurance, slot-aware VONA and
wire bench rule, all built and all disconnected. **This measurement is the
argument for connecting them, and it makes register 60 the highest-value open row
in the project.**

## 3 · WHAT WENT WRONG ON THE NIGHT — capture, not the board

The board Cory drafted on was **fine**: zero K/DEF in its top 40, LA Rams DEF at
`overall_rank` 611. Two separate defects made the *record* of the night useless:

1. **The recommendations were computed from a freeze taken 08-17 15:11 — five
   days stale.** In it the Rams carry `proj_mean` 132.0 / `vorp` 29.0; on the
   real board, 107.9 / 7.4. The projection moved 24 points, replacement moved 2.5.
2. **The logger ranks on raw `vorp`,** justified in its docstring as *"what the
   shipped board ranks on"* — false since Cory's onesie ruling landed **08-17
   07:21**, eight hours before that freeze was taken. The ruling lives in
   `overall_rank`, which the logger never reads.

**Fixed today for the record we already have:** re-ranking the same frozen pool
with the shipped demotion takes gradeable decisions from **21 → 118**, and picks
led by a K/DEF from **101 → 0**. A sign test needed 15/21 (71%) and now needs
69/118 (58%); power at a true 60% edge goes **0.20 → 0.67**.
(`recover_shadow_recommendations.py`, 11/11 — a **reconstruction**, labelled as
such, and outcome-blind.)

## 4 · WE NEVER RECORDED WHY CORY OVERRODE THE TOOL

**Cory deviated from the recorded top recommendation on 11 of his 12 picks, and
not one reason was captured.** `is_mine` is `False` on all 150 records — including
all twelve of his own — and `my_deviation_reason` is empty everywhere. The schema
has the field. Nothing wrote it.

**This is the single highest-value missing input and it is unbackfillable.** Those
reasons existed only in his head on the night. A year of disagreements between
the tool and the person it is built for, and we kept none of the *why*.

## 5 · THE ORDER TO DO IT IN

1. **Re-run the seat replay at the shipped weights** (§0). Everything else is
   provisional until this exists. Cheap, and it may close or move §1 outright.
2. **Grade roster SHAPE, not just points.** The instrument should score a draft
   on startable points, not total points — the two diverge by 17-26% and only
   one of them wins weeks.
3. **Re-derive replacement from the league's actual starting requirements** (§2)
   rather than a near-constant rank, and re-measure §1 after.
4. **Capture the deviation reason at write time** (§4), and point the logger at
   the live board or a lock-time freeze, sorting on `overall_rank` (§3).
5. **Then, and only then, improve projections.** They are the most-worked part of
   this system and the least implicated by the evidence above.

## 6 · WHAT I AM NOT CLAIMING

* That the engine is bad at picking players. On the measured seasons it acquires
  **more** points than the owners it lost to.
* That §1 still holds at `need: 1.0`. It may not. That is §0.
* That the 118 recovered decisions are as good as a live capture. They are a
  reconstruction, valid for player evaluation and not for "what the tool showed".
* Anything about the 2026 season's outcome. None exists yet.


## 7 · THE READINESS LEDGER — Cory, 2026-08-24, verbatim: *"Make sure we do all
these things and do everything we can to be ready for this time next year!"*

§5's order was a list with no owners and no dates — the exact shape that decays.
This table is the enforceable version. **Every row names the mechanism that
fails loudly if it goes quiet**; nothing below survives on memory.

| # | commitment | owner | fed by | due | enforced by |
|---|---|---|---|---|---|
| 1 | Replacement levels keeper-corrected, with a counts-vs-pool test that makes the register-283 class unreintroducible | A | register 283 | fix + test 08-27 | register recheck 08-27; the test itself in CI forever after |
| 2 | Implied-games calibration as a STANDING per-source gate (no source ships a 2027 number that implies >17 games) | D + A | register 284 | first read 09-15, fortnightly | the blend grader's verdict lines; register 284 recheck |
| 3 | Roster-shape reconnection at MEASURED weights — `need`, flex rule, empty-slot insurance, slot-aware VONA, wire bench rule (register 60, "the highest-value open row in the project") | A (weights ruling) · D (the measurements that set them) | P143 (09-01, the projection-vs-following fork) + the season's weekly bench-leak/conversion tracking | weights proposal 2027-03-01 | register 60 recheck; P344 |
| 4 | Keeper choices from priced evidence, not August hunches | A (grader, register 289) · C (keeper-futures file, all season) | keeper_vs_random on 43 historical + 2026 decisions; futures pricing weekly | grader 09-20 · futures live 10-01 | register 289 recheck; C's queue default |
| 5 | The ROOM priced into the board — who reaches, who waits, what this league over/under-pays | D | P259 room-ADP prereg + the 150-pick log + drafter histories | grades 09-15 | P259 in the ledger |
| 6 | The wire-supply rule — the draft stops paying rounds 7-15 prices for what the wire provides free (late RB/WR below replacement; TE the only safe late pick) | 2027 board spec | empirical draft-value study + this season's realized `wire_level` | consumed by P344 | P344 |
| 7 | Deviation-reason capture AT WRITE TIME — §4's unbackfillable loss never happens again: the war-room asks WHY on every override, one tap, before 2027 mocks begin | B (surface) + A (schema is ready — `my_deviation_reason` exists, nothing writes it) | §4 | live by 2027-07-01 | ROUTES row to B, recheck 2027-06-01 |
| 8 | **THE JANUARY SYNTHESIS — the keystone.** One document that consumes every 2026 grade (blend verdicts, conversion/bench-leak, keeper grades, room model, wire supply, drop/waiver skill) and emits THE 2027 BOARD SPEC: sources and weights per position, roster-shape terms and their measured weights, keeper policy, round-by-round posture. Everything above feeds this; without it the season's grades are trivia. | relay (assembly) + A (ruling) + Cory (final call) | rows 1-7 | **2027-01-15** | **P345** — the ledger's CI check fails the build if it goes quiet |

**The honest boundary rides with the plan (market study, §-committed):** the room
already captures 82-87% of draft value. 2027's edge is calibration + shape +
keepers + room knowledge, not out-picking nine people — and §5's rule stands:
projections are improved LAST, because they are the most-worked and least-implicated
part of the system.
