# PROPOSED DIFF — register 276, for A to accept or reject

**Session D, 2026-08-24.** Filed ahead of the row's 08-30 default, because the
before/after turned out to bear directly on a question Cory has already asked
once and been given an answer to.

**This is a proposal, not an edit.** All four files are TERRITORY: A and are
**unchanged on this branch**.

```
git apply draft/audit/proposed/register276_four_tools_seat_filter.patch
```

---

## What it fixes

Four tools open with `K = <board>.kept_players` and then build
`roster = K.map(k => ({...k, is_keeper: true}))`. **`K` *is* the starting
roster.** Since the 08-22 board rebuild (`4750fbce`) `kept_players` carries all
ten teams, so each of these tools believes Cory opens the draft holding:

| | roster the tool used | Cory's real roster |
|---|---|---|
| size | **23** | **3** |
| shape | QB1 **RB12** TE1 **WR9** | RB2 WR1 |

against **12 remaining picks** and starters 1QB/2RB/2WR/1TE/1FLEX/1K/1DEF.

Unlike register 269's three tools, **these do not throw.** They exit 0 and print
a plausible table.

## Why this one matters more than the other three

`position_share.js`'s own header calls it **"THE CLOSURE TEST FOR THE QB/TE
COMPLAINT"** — Cory's complaint. Its headline is the number that answered him.
Re-run on his real roster, the answer moves:

| | over-representation of QB/TE in the top 10 |
|---|---|
| shipped (23-man phantom roster) | **1.12×** |
| with the seat filter (real 3-man roster) | **1.27×** |

**Seven of his twelve picks change, and the late rounds invert:**

| pick | shipped | fixed |
|---|---|---|
| 33 | 1.47× | 0.59× |
| 53 | 1.18× | 0.89× |
| 73 | 1.17× | 0.88× |
| 88 | 0.89× | 1.18× |
| 128 | 1.15× | 0.57× |
| **133** | **0.00×** | **0.57×** |
| **148** | **0.00×** | **2.87×** |

The mechanism is legible: a phantom roster already holding a QB and a TE keeps
the `need` term satisfied all the way down, so QB/TE were suppressed at exactly
the late picks where Cory genuinely still needs one. At pick 148 the corrected
run puts **100% of the top ten** at QB/TE.

**So the artifact that closed his QB/TE complaint under-reported the effect.**
That is the finding; the diff is incidental to it.

## What the diff does

One line in each of four files: `kept_players` filtered to
`league.my_draft_slot`, with the meaning-change recorded in a comment above the
declaration.

**These four need no second leg.** Register 269's tools also needed a
`players`+`kept_players` union for the OPPONENT-keeper lookup; these four union
nothing and look up no opponent keepers — checked, not assumed.

## Verified, not asserted

| check | result |
|---|---|
| the four run clean before **and** after | exit 0 both ways — they never announced the fault |
| the filtered roster | **3** — Chase, Henry, Walker, set-equal to `keepers.json` slot 8 |
| the headline moves | **1.12× → 1.27×**, 7 of 12 picks change |
| the number survived a reformat of the patch | re-ran after rewriting the comment: **1.27×** |
| patch applies to main | `git apply --check` clean |

## STATED BOUNDARY

I re-ran **`position_share.js`** end to end. I did **not** re-run
`bench_floor_test`, `replacement_ladder` or `vona_vs_market` to completion, so I
am **not** claiming how far their numbers move — only that they read the same
wrong roster and will move.

I am also not claiming 1.27× is a *large* effect or that it settles Cory's
complaint. It is the corrected value of a number that was quoted at him, and the
late-round inversion is the part worth looking at.

`SEND BACK` is a complete answer if `K` is deliberately league-wide in these four
— in which case the variable wants a different name and the tools want a
different roster source, because `roster = K.map(...)` is unambiguous about
intent today.
