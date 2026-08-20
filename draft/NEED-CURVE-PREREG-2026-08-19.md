# PREREGISTRATION — the need curve Cory described, and why the existing one is wrong

**A, 2026-08-19, committed BEFORE the module runs.** Draft 08-22.

**Cory, verbatim:** *"Need should have some weight on pick recommendation. If 1 QB
and TE has been drafted the need should drop significantly so that you'd only
take one if the value was incredible, enough to make up for lack of need.
Meanwhile on WR and RB the need should not drop as much until you have 3-4 of
each due to injury and more starting spots… figure it out"*

---

## 1. THE FUNCTION ALREADY EXISTS AND IT HAS ONE IDENTIFIABLE BUG

`draft_plan.js:307`, `pNeedNth(pos, n)` — binomial `P(at least n of S starters
out)`, `S` = starting slots (+FLEX if this position owns it), `r` = measured
injury rate `{QB .14 · RB .28 · WR .20 · TE .22}`. Its shape today:

| pos | S | 1st extra body | 2nd | 3rd | 4th |
|---|---|---|---|---|---|
| QB | 1 | 0.140 | 0 | 0 | 0 |
| **RB (owns flex)** | 3 | 0.627 | 0.191 | **0.022** | **0** |
| **WR (owns flex)** | 3 | 0.488 | 0.104 | **0.008** | **0** |
| TE | 1 | 0.220 | 0 | 0 | 0 |

**Cory's first half is already right** — the QB/TE backup prices at 0.14/0.22
against the RB/WR backup at 0.63/0.49. **His second half is not: RB need is
0.022 at the third extra body and zero at the fourth, so the curve collapses at
exactly the depth he says it should still be holding.**

## 2. ⭐ THE BUG, NAMED: IT IS A ONE-WEEK SNAPSHOT OF A SEVENTEEN-WEEK QUESTION

`pNeedNth` computes **P(n of your starters are out simultaneously, in one
week)**. That is not the question. The question is **"will I need this body in
ANY week of the season."**

`P(2 of 2 RBs out right now)` = 0.078. `P(2 of 2 out in at least one of 17
weeks)` is an order of magnitude larger — **and byes make it certain that every
starter misses at least one week.** The existing function cannot see a bye at
all.

**That is a modelling error with a principled fix, not a constant to tune.**

## 3. THE CORRECTED FUNCTION

```
q(pos)   = per-week unavailability, MEASURED, from the board's own
           games_expected: q = (17 − games_expected + 1) / 17
           (+1 is the bye week, which is guaranteed and which the
            current function ignores entirely)

weekly   = P(at least k of S starters out in a given week)      [binomial]
season   = 1 − (1 − weekly)^17        "needed in at least one week"

need(pos, held):
    held <  S  ->  1.0            you cannot field the slot at all
    held >= S  ->  season(k = held − S + 1)
```

**And the second half, which already exists and must NOT be double-counted:**
a body you need is only worth what you cannot get free — `draft_plan.js`'s bench
equation already multiplies by `(his points − the waiver level)`, measured at
**QB 319 · RB 112 · WR 124 · TE 124**. **QB and TE are streamable and deep; RB
and WR are not.** That term, not the probability, is what should carry the
"you can just pick one up" half of Cory's intuition.

## 4. PREDICTIONS

**P142 — the corrected curve holds where Cory says it should.** With the season
basis, **RB and WR need at the 3rd and 4th held body is ≥ 0.25**, where today it
is 0.022 and 0.000.

**FALSE if** either stays below 0.25 — which would mean the one-week/season
distinction is not the cause and I have misdiagnosed it.

**P143 — and it still collapses for QB and TE, once the wire is priced in.**
Ranked by `need × (points − waiver level)`, **the second QB and second TE price
BELOW the third RB and third WR.** That is Cory's *"you'd only take one if the
value was incredible"* — the bar exists and is quantified.

**FALSE if** a second QB or TE outprices a third RB or WR, which would mean the
wire term does not carry the streaming intuition and something else is needed.

⚠️ **P143 is the one that can embarrass me:** the season basis *raises* need
everywhere, including at QB, and a QB's bye is guaranteed. If the wire discount
does not claw that back, the corrected curve argues for a QB2 — the opposite of
Cory's ruling this evening.

## 5. CONTROLS

1. **Reproduce the existing curve.** With `WEEKS = 1` and no bye term, the module
   must return `pNeedNth`'s numbers exactly. If it cannot reproduce what is
   shipped, its "correction" is not a correction.
2. **Monotone.** `need` must be non-increasing in `held`, for every position.
3. **Bounded.** `0 ≤ need ≤ 1` everywhere.
4. **`q` from the board, not from a constant** — read `games_expected`, and fail
   if the board does not carry it.
5. **Flex counted once.** The flex seat may be credited to exactly one position;
   crediting it to RB, WR and TE at once is the bug that once drafted three tight
   ends (`draft_plan.js:299`).

## 6. THE GUARD

**REPORT ONLY, and `draft_plan.js` IS NOT TOUCHED.** It feeds
`public/seat_plan.json`, which the war room reads at `app.js:867` — **changing it
three days before the draft would alter what Cory sees, which is exactly what
`no_fit_guard` and the draft-week freeze exist to prevent.** The corrected curve
is computed in a new module and reported beside the old one.
