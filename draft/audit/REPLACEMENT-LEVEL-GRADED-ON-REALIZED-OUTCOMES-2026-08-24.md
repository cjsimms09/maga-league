# The board Cory drafted from priced every RB 29.6 and every WR 23.7 VORP points above every TE

**E (red team), 2026-08-24.** Reproduce with
`python3 draft/audit/replacement_vs_realized_2026-08-24.py` from the repo root —
18 controls, all of which must print OK or the script voids its own output and
exits 1.

This started as **P24** (*"the TE replacement level is correctly set"*, my row,
due 08-27). Checking P24's confound found a live defect that is larger than P24
and that P24 cannot see, because it is not a tight-end problem — tight end is
its victim.

---

## 1. What happened, in one paragraph

At **2026-08-22 03:51:53Z**, ~14 hours before the 6:00 PM CDT draft, the
`draft-bot` rebuild `4750fbce` picked up the keeper lock and **removed all 23
kept players from `draft_data.players`**. `apply_vorp` then ran on that
draftable pool while `starter_counts` stayed at its **league-wide** values —
RB 20, WR 30, TE 10, QB 10. Every keeper starts, so the counts had to fall by
the same 23 and did not. Replacement level is *"the Nth-best projection"*, so
removing 12 RBs and 9 WRs from the list while still reading off rank 20 and rank
30 walked the marker 12 and 9 places deeper into each position.

| | shipped 08-22 03:51 → today | correct | error |
|---|---|---|---|
| RB replacement | **147.8** | 181.1 | **+33.3** |
| WR replacement | **142.9** | 170.3 | **+27.4** |
| TE replacement | **138.0** | 141.7 | **+3.7** |
| QB replacement | **347.8** | 350.8 | **+3.0** |

`vorp = proj_mean − replacement`, so an **understated replacement overstates
every VORP at that position**. The distortion is proportional to how many
keepers a position lost — 12 RB, 9 WR, 1 TE, 1 QB — which makes it a
**cross-position** error, not a harmless constant:

> **Relative to tight end, the shipped board carried every RB +29.6 and every WR
> +23.7 VORP points, and every QB −0.7.**

That is a full round of value or more, on the board Cory actually drafted from,
and `overall_rank` is a sort on `vorp`.

## 2. Why this is a defect and not a design choice

Replacement level is *the last player who still starts somewhere in the league*
(`vorp.py`'s own first line). Kept players start. Ja'Marr Chase occupies a WR
starting slot for the whole season; removing him from the pool does not create a
new WR starting slot for someone else to fill.

Removing keepers from the **draftable board** is right — you cannot draft them.
The bug is that the **starter counts were not reduced to match**. Both readings
of the fix produce the identical answer, which is the control:

- **(A)** rank the **full** pool (keepers included) at league-wide counts → RB 181.1 · WR 170.3 · TE 141.7
- **(B)** rank the **non-keeper** pool at counts reduced by keepers (RB 20−12, WR 20−9, TE 10−1, +flex) → RB 181.1 · WR 170.3 · TE 141.7

They agree to the decimal because **all 23 keepers rank above their position's
replacement rank** (23/23, checked, control C5). Two derivations that could have
disagreed and did not.

## 3. Four independent references say the corrected split is right

The bug also flipped the FLEX allocation to a corner. `vorp.py`'s greedy hands
each of the 10 flex slots to the best next-man-up; on the shrunken pool it gave
**all ten to WR**. Corrected, it gives **RB +4 / WR +6 / TE +0** — and so does
everything else that is not the current board:

| reference | RB | WR | TE |
|---|---|---|---|
| corrected greedy, today's full pool | +4 | +6 | +0 |
| same greedy on **realized** 2025 points | +4 | +6 | +0 |
| same greedy on **realized** 2024 points | +7 | +3 | +0 |
| same greedy on **realized** 2023 points | +5 | +5 | +0 |
| what owners **actually started**, 420 team-weeks | +4.1 | +5.6 | +0.1 |
| the board itself, 08-19 → 08-22 03:35 (pre-lock) | +4 | +6 | +0 |
| **the shipped board, 08-22 03:51 → now** | **+0** | **+10** | **+0** |

The shipped value is the only outlier in the table, including against the board's
own value from sixteen minutes earlier.

**I filed the 0/10 split as a defect of its own first, and then withdrew it.** It
is a symptom of §1 and it disappears under the fix; the register carries one row
for one cause, not two. Recorded because the withdrawal is the useful part.

## 4. The near-miss that let this ship

`build.py:1963` already measured this exact mechanism on **2026-08-20** and ruled
on it:

> *"MEASURED ON THE LIVE BOARD: Cory's three keepers implied replacement RB 170.47
> / WR 171.85 while the board published RB 168.60 / WR 170.10 … About 1.8 points,
> ~2-3%, so it flips no pick on its own"*

That ruling was correct **when three keepers were out of the pool**. Two days
later twenty-three were, and the same mechanism went from 1.8 points to 33.3.
**A "too small to matter" ruling has no expiry date attached to the condition
that made it small.** Nobody re-measured it after the lock — including me: I
audited the post-lock board that morning for slate integrity, keeper leakage and
pick 33, and never looked at the `replacement` block.

## 5. What this settles elsewhere

- **Register 275** — Cory finished with the worst starting TE in the league by 52
  points. This is a **sufficient mechanism** for it and it is a board defect, not
  a draft-execution one: at every pick the board told him RBs and WRs were worth
  ~24-30 VORP more than they were, relative to TEs.
- **The roster-shape lab's "both boards draw exactly ONE tight end in 30 of 30
  rosters"** and **register 59's RB-heavy draws** have the same cause available
  to them and should be re-run against a corrected board before anything else is
  concluded from them.
- **`DUPLICATE-A-REAL-MODEL-2026-08-19.md`'s open 🟠** — our RB24/WR26 against the
  scaled `ffanalytics` convention's RB29.2/WR30.0, *"nobody has graded it"*. It
  is graded here: realized outcomes say RB 24-27 and WR 23-26 across three
  seasons, and owners' own lineups say RB 24.1 / WR 25.6. **Ours was right and
  the scaled convention is too deep at RB.** That 🟠 can close.
- **P248** (mine, *"our board's +46-rank TE tilt"*) — the premise does not
  reproduce on today's board (top-150 median tilt: WR +29.3, TE +21.7, i.e. TE
  ranked *later* than WR relative to market). But today's board is the buggy one,
  so **P248 must be re-measured after the fix, not before**, and its 09-15 grade
  is now blocked on that.

## 6. P24's own verdict: FALSE, and it splits in two

P24 asked whether the TE replacement level is correctly set relative to WR. It
is two claims and they grade differently.

**The RANK is correct.** TE takes **zero** flex slots — in all three realized
seasons, in 420 team-weeks of owners' actual lineups (0.1 of 10), in the
corrected greedy, and in the scaled reference convention (TE13 in a 12-team
league = TE10.8 in ours). *TE10 is the right rank and nothing here disturbs it.*

**The LEVEL is not**, for a second reason independent of §1. Realized totals
cannot be compared to a season projection directly — they drop bye weeks, injury
weeks and any week a player sat unrostered. Normalising to **points per week
played** removes that confound entirely, and the diagnostic becomes **implied
games**: `board proj_mean(rank r) ÷ realized points-per-week(rank r)`, whose hard
ceiling is a 17-game season.

```
pool = players logging >= 12 of 14 weeks
pos      r1     r2     r3     r4     r6     r8    r10    r12    r16    r20    r24    r30
QB     14.5   15.8   15.6   17.0   18.2   18.6   21.5      -      -      -      -      -
RB     10.9   12.2   13.1   13.9   14.1   14.8   14.9   14.9   14.6   14.2   15.2   16.4
WR     11.6   13.5   14.0   14.4   15.2   16.1   16.6   16.6   17.0   17.8   17.7   18.1
TE     16.3   16.4   16.7   16.2   18.8   21.9   25.5      -      -      -      -      -
```

**RB and WR never breach 17 at any rank. QB breaches from ~r8, TE from ~r6, and
TE at its own replacement rank implies 25.5 games.** The same table at an
`>= 8 of 14` pool threshold gives TE 17.3 / 19.6 / 21.3 at r6/r8/r10, so the pool
filter is not the story. For the board's TE10 projection to be right, the tenth
tight end would have to play half a season more than a season contains.

So **P24 is FALSE**: the level is not correctly set. But its stated fix — *"the
replacement constant is re-fit from realized outcomes"* — **is aimed at the wrong
object**, and I am saying so rather than executing it. Replacement is not a
constant; it is `proj_mean` at rank N. You cannot fix an inflated replacement
level by editing the replacement level when the inflation is in the projections
that produce it. §1 is a mechanics bug with a one-line fix; §6 is a
projection-calibration finding at QB and TE that belongs to the 2027 projection
program, not to `build.py`.

## 7. Limits, stated rather than buried

- **n = 3 seasons, one league.** The realized flex split varies (RB +4/+7/+5); the
  *direction* is stable across every reference in §3, the magnitude is not tightly
  estimated. §1 does not depend on this — it is arithmetic on today's artifact.
- Realized ranks are **ex-post order statistics** and a mean projection *should*
  be flatter than a realized draw. That is why §6 uses an absolute ceiling
  (17 games) and not a spread comparison — shrinkage cannot manufacture a
  25.5-game season.
- The **QB/TE pools are small** (11-13 clearing 12 weeks), so rank 10 is deep in
  them and its denominator is the noisiest cell in the table. The §6 conclusion
  does not rest on r10: TE breaches 17 at **r6**, where the pool is comfortable.
- §6 compares a **2026** projection to **2023-25** outcomes. If tight ends are
  genuinely scoring more, the board could be right — but it would need TEs at
  ranks 6-12 to score ~50% more per game than in any of the last three seasons.
- The 7 unmapped starter ids in 420 team-weeks (0.28%) are dropped, not imputed.

## 8. Asks

**ASK (A):** reduce `starter_counts` by kept-players-at-position before
`apply_vorp` — equivalently, compute replacement over the full pool — and add a
test that fails when `sum(starter_counts) != teams * starters` minus keepers.
**EVIDENCE:** §1-3, 18 passing controls, four independent references.
**RECOMMENDATION:** fix and rebuild; then re-run the roster-shape lab, register
59 and P248 against the corrected board before drawing anything from them.
**DEFAULT if silent:** the row stays 🔴 OPEN and every VORP-derived number
published from 08-22 03:51 onward — waiver board, trade board, `overall_rank` —
carries the caveat in §1.

**ASK (A/D):** register 284's implied-games table goes to the 2027 projection
program as a calibration target, not to `build.py`.
**DEFAULT if silent:** it sits in the register against the 09-15 blend grade.
