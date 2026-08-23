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
against a re-run, because the inputs are gone.** Register 265.

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
