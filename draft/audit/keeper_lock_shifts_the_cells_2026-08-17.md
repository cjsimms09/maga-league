# E's thirteenth sweep — keeper lock moves 46 players into a different calibration cell

**Session E (red team), 2026-08-17.** Keeper lock is **2026-08-20**; the draft is
08-22.

Register row **E1** carries a re-check trigger I wrote myself: *"re-check after
keeper lock 08-20 — the cells shift when keepers leave the pool."* I could not
wait for the date, so I computed what the shift will be.

---

## THE RESULT

Every player's dispersion cell is `(position, within-position projection rank)`.
Removing the other nine teams' keepers from the pool compresses every remaining
player's rank — and **14 of those keepers currently sit in the top 30**, so the
compression is severe rather than marginal.

**46 players change calibration cell at lock. 37 of them are inside the top 150.**

| | today | at lock | band |
|---|---|---|---|
| James Cook | RB5 | **RB1** | 4-8 → **1-3** |
| CeeDee Lamb | WR5 | **WR2** | 4-8 → **1-3** |
| Ashton Jeanty | RB8 | **RB3** | 4-8 → **1-3** |
| A.J. Brown | WR6 | **WR3** | 4-8 → **1-3** |
| Chase Brown | RB9 | RB4 | 9-16 → 4-8 |
| De'Von Achane | RB11 | RB6 | 9-16 → 4-8 |
| Chris Olave | WR11 | WR5 | 9-16 → 4-8 |
| DeVonta Smith | WR12 | WR6 | 9-16 → 4-8 |
| Zay Flowers | WR13 | WR7 | 9-16 → 4-8 |
| Ladd McConkey | WR14 | WR8 | 9-16 → 4-8 |
| Breece Hall | RB12 | RB7 | 9-16 → 4-8 |
| Omarion Hampton | RB13 | RB8 | 9-16 → 4-8 |
| Tetairoa McMillan | WR17 | WR11 | 17-32 → 9-16 |
| Emeka Egbuka | WR18 | WR12 | 17-32 → 9-16 |

Each cell carries its own measured p90/p10 ratio, so **every one of these 46
players gets a materially different `proj_floor` and `proj_ceiling` on 08-20** —
three days before Cory drafts, on the players he is most likely to take.

**Sweep 7 is what makes this bite.** `proj_ceiling` is `proj_mean × a per-cell
constant` (Spearman exactly 1.000000 within cell, 16/16). So a player's entire
dispersion identity **is** his cell membership. Change the cell, change the only
thing the field says about him. James Cook moving `4-8 → 1-3` is not a tweak; it
is the whole number.

## WHAT THIS MEANS FOR E1 — computed, after I first asserted it

**I first wrote that E1 "stays about three slots wide" and changes only which
nine players it lands on. That was an assertion, so I computed it, and it was
directionally right and numerically wrong.** Re-running E1's own comparison —
the band implied by the published rank against the band implied by `blend()`'s
rank basis — on both pools:

| | misreads | overlap with today |
|---|---|---|
| **today** (reproduces E1 exactly) | **9** | — |
| **after keeper lock** (predicted slate) | **11** | **1** |

**Today's nine, reproduced:** St. Brown, Chase Brown, Jefferson, McMillan,
Javonte Williams, Swift, Pierce, Mason, Monangai.

**After lock, eleven — and only Chase Brown is on both lists:**

```
ovr  13  Chase Brown        RB   published  3 (1-3)   vs blend  4 (4-8)
ovr  17  George Pickens     WR   published  3 (1-3)   vs blend  4 (4-8)
ovr  28  Jaylen Waddle      WR   published  8 (4-8)   vs blend  9 (9-16)
ovr  32  Kyren Williams     RB   published  7 (4-8)   vs blend  9 (9-16)
ovr  37  Travis Etienne     RB   published  8 (4-8)   vs blend 10 (9-16)
ovr  47  Terry McLaurin     WR   published 16 (9-16)  vs blend 17 (17-32)
ovr  71  Quinshon Judkins   RB   published 15 (9-16)  vs blend 17 (17-32)
ovr  83  Cam Skattebo       RB   published 16 (9-16)  vs blend 18 (17-32)
ovr 142  Carnell Tate       WR   published 32 (17-32) vs blend 33 (33+)
ovr 208  RJ Harvey          RB   published 31 (17-32) vs blend 33 (33+)
ovr 209  Chris Rodriguez    RB   published 32 (17-32) vs blend 34 (33+)
```

**So the correction to my own claim: the defect gets slightly WIDER (9 → 11), not
identical, and the turnover is near-total — 8 of today's 9 drop out and 10 new
players appear.** Five of the newcomers sit inside the top 50: Pickens (17),
Waddle (28), Kyren Williams (32), Etienne (37), McLaurin (47).

**The conclusion I drew stands and is now demonstrated rather than argued: fixing
E1 by naming today's nine rows would fix the wrong players.** Eight of nine would
be irrelevant by 08-20 and ten genuinely affected players would be untouched.
The mechanism is the only thing worth fixing.

## HONEST LIMITS — this is directional, not exact

**I used `predicted_keepers`, and that file says in its own header:**

> *"PREDICTED slates for MOCK/REHEARSAL ONLY — never applied to the live board
> (Cory, 2026-08-11: a prediction rendered indistinguishably from a fact IS a
> fact as far as behaviour is concerned)."*

So the 46 is **the magnitude to expect, not the roster to act on**. Two specific
gaps:

- **The prediction is not the designation.** `keeper_slate` reports **4 of 10
  teams designated and 8 keepers withheld**; my simulation removes **14**
  predicted keepers across the nine other teams. Those are different populations
  and I have not reconciled them — the real slate is not confirmed
  (`safe_to_treat_as_truth: false`, 6 teams undesignated).
- **I did not re-run `blend()`.** I recomputed the ranks and the band each rank
  falls in. The actual `proj_floor`/`proj_ceiling` deltas would come from the
  calibration's p90/p10 ratios per cell, which is A's code to run.

**What survives both limits:** the direction is certain (removing top-30 players
can only compress ranks downward) and the order of magnitude is robust — even
halving 46 leaves ~23 players changing cell in the range Cory drafts from.

## ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      none new -- this is evidence for E1, which is already open and
          already blocked on you.
EVIDENCE: 46 players change calibration cell when the other teams' keepers
          leave the pool, 37 inside the top 150, with four moving into the
          1-3 band. Sweep 7 established proj_ceiling is mean x a per-cell
          constant, so cell membership IS the dispersion figure. And
          re-running E1's own comparison post-lock gives 11 misreads against
          today's 9, with ONLY Chase Brown on both lists.
REC:      Fix E1's MECHANISM, not its nine named rows -- demonstrated, not
          argued: 8 of today's 9 would be irrelevant by 08-20 and 10
          genuinely affected players would go untouched, 5 of them inside
          the top 50. And treat the 08-20 re-check as required rather than
          tidy: any floor/ceiling figure noted from today's board is stale
          the moment the slate confirms.
DEFAULT:  Filed against E1's existing row. I have not touched anything and
          cannot re-run blend().
```
