# You were right about the flex. And my counter-argument was wrong because my tool was hiding your keepers.

**A, 2026-08-19.** Cory: *"really should have more WR then RBs because they score
more points on average at least after the top 15 RBs are gone… once 2 starting
RBs are taken they're competing for flex and WR will almost always win that…
BUT. We still need at least 3 RBs due to injuries and bye weeks."*

**Six predictions, four false, and the biggest finding is a reporting bug of
mine that made this whole argument look different than it is.**

---

## 1. ⛔ EVERY ROSTER NUMBER I GAVE YOU TODAY WAS 2 RB AND 1 WR LIGHT

`average_draft.js` counted **drafted picks only.** You keep **Chase (WR), Henry
(RB), Walker (RB)** — held from pick one, never counted.

**So the arm I called "the closest any arm has come" is, on the roster:**

> ### **RB 5.94 · WR 4.55**
>
> ### That rounds to **6 RB, 5 WR** — *"i dont want 6 rb 5wr"*, word for word.

**You diagnosed the model's roster from the outside while my tool told me 3.94
and I called it close.** The acceptance gate had the same bug — it tested
`RB >= 4 && <= 5` against drafted counts, so it read **TRUE on a six-back
roster.** Re-graded on the roster, **P158 is FALSE.** Both columns print now and
the gate reads the roster.

## 2. YOUR CROSSOVER IS REAL — AND MY P169 WAS THE SAME KIND OF ERROR

I told you backs project higher. That came from the **median of the top 36**,
a window that straddles the crossover.

| rank | RB | WR |
|---|---|---|
| 15 | 212.5 | 192.4 |
| **23** | **WR takes the lead and never gives it back** | |
| 30 | 153.6 | **161.9** |
| 45 | 87.2 | **136.2** |
| 55 | 60.6 | **118.8** |

**Median of ranks 25–50: RB 136.2 / WR 146.0 — the other way.** Your instinct
put the crossover at 15, the board says **23**. Direction yours, number mine.

## 3. THE DEFECT YOU NAMED WAS REAL, AND MY FIRST TWO FIXES BOTH FAILED

**Your mechanism:** the 3rd RB isn't filling an RB slot, he's filling the flex,
so his alternative isn't RB #48 at 78.4 — it's the best flex-eligible body.

**Fix 1 (P172, FALSE).** I assigned slots by draft order. **The penalty hit
exactly one body and the next one escaped it at a *lower* replacement — RB3
130.4, RB4 78.4 — so the model dodged it by drafting more backs.** The draft
moved 0.05.

**Root cause: slots are assigned by QUALITY every week, not by draft order.**

**Fix 2 (P175 → P176).** So I measured it instead. **What share of the Nth
body's starts are flex starts?**

| | 1st | 2nd | 3rd | 4th | 5th |
|---|---|---|---|---|---|
| **RB** | 0.0 | 0.0 | 0.450 | **0.544** | 0.682 |
| **WR** | 0.0 | 0.0 | 0.435 | **0.551** | 0.882 |

**Exposure RISES with depth.** I predicted it would persist at ≥0.10 and it
persists at 0.55 — the order-indexed version had the shape backwards.

⭐ **And this half-answers your "at least 3 RBs due to injuries and byes":
about half of a 3rd/4th back's starts ARE injury-or-bye starts. Your reason is
real, roughly half the time. The other half he's just your flex.**

## 4. WHERE IT ENDED — three of five cells, and the two misses are one defect

| roster | shipped | **blend + your K/DEF rule** | you said |
|---|---|---|---|
| QB | 1.20 | **1.56** ❌ | 1 |
| **RB** | **5.94** ❌ | **4.36** ✅ | 4–5 |
| **WR** | 4.55 | **5.32** ❌ | 4–5 |
| TE | 1.08 | 1.76 | — |
| **K** | 1.14 | **1.00** ✅ | 1 |
| **DEF** | 1.10 | **1.00** ✅ | 1 |

**Your K/DEF ruling landed perfectly — exactly 1.00 each, standard deviation
zero, in all 300 rooms.** RB came home to 4.36 with a minimum of 3. **WR now
overshoots at 5.32 and the quarterback never moved.**

**P177 FALSE. I preregistered that I'd stop there and I'm stopping.**

## 5. ⭐ THE TWO MISSES ARE THE SAME DEFECT, AND IT HAS A DEEP WIRE BEHIND IT

**QB and TE are the two positions with a deep wire — QB 322.9, TE 130.4.** A
backup at either still prices positive, so he gets taken with a spare pick.
**That is the identical failure at both, and it is the eleventh arm in a row to
leave the second quarterback standing.**

**Why your K/DEF rule can't be copied across:** you genuinely never need a
backup kicker — you stream. But the measured lineups say you start your **2nd
QB 42.7%** of weeks and your **2nd TE 41.4%**, mostly on byes. **A hard zero
would be wrong at QB and TE, and that's why the rule that fixed K and DEF in
one line doesn't transfer.**

**Bar (d) was written to catch me tuning: "the K/DEF rule cannot possibly fix
the quarterback." It didn't — QB stayed at 1.56 to the decimal. The bar did its
job.**

## 6. WHAT I AM NOT DOING

**Nothing ships.** `draft_plan.js`, `engine.js` and the war room are untouched;
all of this lives in the diagnostic and the room simulator. Draft is Saturday
and `no_fit_guard` holds — **a fourth arm chosen after seeing three fail is a
search, not a fix.**

**What's genuinely open, narrowly:** the equation is right where the wire is
barren (RB) or you gave it an explicit rule (K/DEF), and wrong at the two
positions where a deep wire still leaves a backup priced positive. **QB and TE
are one problem, not two, and that's the post-draft job.**
