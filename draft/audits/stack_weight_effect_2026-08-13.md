# WHAT THE D10 CORRECTION ACTUALLY DID TO THE BOARD

**2026-08-13. A.**

> ## ⚠️ THIS FILE'S FIRST VERSION WAS WRONG AND IT IS RETAINED BELOW AS THE RECORD
>
> The version published earlier today claimed the stack term makes Joe Burrow the #1
> recommendation at pick 33, drops Tee Higgins 814 places, and lifts Sean Clifford 1,225.
> **Every one of those numbers is an artifact of a broken measuring context.** The corrected
> figures are in §2. I corrected a right answer with a wrong one and published it; this is
> the correction of the correction.

---

## 0. THREE ANSWERS, AND WHICH ONE IS TRUE

| attempt | instrument | answer |
|---|---|---|
| 1 (pre-compaction) | `roster: []` — **caught by me** | vacuous |
| 2 (pre-compaction) | keepers looked up in `players` | "doubling changes nothing in the top 10" |
| 3 (published, wrong) | keepers fixed, but ctx missing 11 of production's 17 keys | "stack puts Burrow at #1" |
| **4 (this file)** | **`draft/tools/live_context.js` — production's exact key set** | **doubling changes nothing in the top 10** |

**Attempt 2's ANSWER was right and its REASONING was not** — it reached the right conclusion
from an empty roster, where no stack bonus could apply to anyone. Attempt 3 fixed the roster,
found real stack terms, and then read rank consequences off a context missing `league`,
`totalPicks`, `myPicksLeft`, `myPickIndex`, `totalMyPicks`, `currentKeepers`, `intervening`,
`roundsLeft`, `doctrine`, `drift` and `runMultipliers` — while supplying five keys production
never sends. On that context scores are compressed near zero, so a ±6 constant dominates the
board. On the real one, scores span hundreds of points and ±6 moves a player a few places.

**That is the same failure class this whole week has been about, committed by me, four times,
while investigating it.** Rule 17's converse: a Lab probe that hand-builds a context has a
field the APP supplies silently absent from it. `live_context.js` now refuses to build a
partial context, and refuses invented keys too.

## 1. THE TERM DOES REACH THE BOARD — this part survives

Keepers: Ja'Marr Chase (WR, CIN), Derrick Henry (RB, BAL), Kenneth Walker (RB, KC). 64
draftable players sit on those teams; **18 carry a non-zero weighted stack term**. The
mechanism is coherent and unchanged: a bonus for QB↔pass-catcher correlation, a penalty for
same-position target competition.

The per-term magnitudes from the wrong version were also right — they are properties of the
term, not of the context:

| player | stack=0 | stack=0.5 | stack=1.0 |
|---|---|---|---|
| Joe Burrow (QB, CIN) | 0 | **+3** | **+6** |
| Tee Higgins (WR, CIN) | 0 | **−2** | **−4** |
| Sean Clifford (QB, CIN) | 0 | **+3** | **+6** |

## 2. AND IT CHANGES ALMOST NOTHING — the corrected result

Same players, ranks read off the **production-faithful** context:

| player | stack=0 | stack=0.5 | stack=1.0 | published claim |
|---|---|---|---|---|
| **Joe Burrow** | **#11** | **#11** | **#11** | ~~"#13 → #1"~~ **never #1, never moves** |
| **Tee Higgins** | #51 | #55 | **#56** | ~~"#33 → #931"~~ **five places, not 898** |
| **Sean Clifford** | #1512 | #1475 | **#1475** | ~~"#1329 → #104"~~ **37 places, not 1,225** |

Across four board states (picks 4, 33, 68, 108), moving stack from 0.5 to 1.0:

```
PICK   4   top-1 unchanged   top-10 positions differing: 0    board movers:  88
PICK  33   top-1 unchanged   top-10 positions differing: 0    board movers:  78
PICK  68   top-1 unchanged   top-10 positions differing: 0    board movers: 457
PICK 108   top-1 unchanged   top-10 positions differing: 0    board movers: 171
```

**The D10 correction is inert at the top of the board.** It moves players in the deep tail,
where scores are close enough for a ±6 constant to matter, and it changes nothing Cory will
look at. Every top-10 at every pick is identical at 0.5 and 1.0.

## 3. WHAT STANDS, AND WHAT I RETRACT

**Stands:**
* The term reaches 18 players and its magnitudes are ±3/±6 at 1.0.
* The mechanism (correlation bonus, target-competition penalty) behaves as designed.
* **The bonus is FLAT** — Sean Clifford (VORP −341.7) receives the same +6 as Burrow purely
  for being a CIN quarterback. That is still a defect in the term's shape, worth revisiting
  after the draft. It simply costs far less than I claimed, because a flat +6 against
  hundred-point score spreads moves a player tens of places, not a thousand.
* `stack` remains `soft` in the decision contract: priced against a **modelled** rho of 0.35,
  never a measured correlation. That was D10's original reason for standing it down and it is
  unchanged by anything here.

**Retracted in full:** the claim that stack, rather than value, decides the top recommendation
at pick 33. **It does not decide any top-10 position at any pick tested.** The sentence "the
stack term is what puts Burrow at #1" appears in commit `f946b4a`'s message and is false.

**Unchanged conclusion either way:** D10 stands, and the correction is safe — now for the
stronger reason that it demonstrably does not move the board Cory drafts from.

## 4. A LIMITATION I AM NOT HIDING

These states score picks 4/33/68/108 against a board where **nobody has been drafted** — the
pre-draft artifact is all we have. Real pick 108 has 107 players gone and a different top of
board. The A/B conclusion is robust to this (both arms see the identical state, only the
weight differs), but the absolute ranks are not a forecast of draft night. The K/DEF entries
in pick 108's top 10 are that artifact, not a finding.

**Reproduce:** `node draft/tools/stack_effect.js`. The tool builds its context through
`draft/tools/live_context.js`, refuses to run on a partial or invented one, and aborts if a
stack=0.0 vs stack=3.0 control produces identical scores.
