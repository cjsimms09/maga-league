# Your ceiling ramp is right, our ceiling data is wrong — and that IS the Draft Sharks case

**A, 2026-08-19.** Cory: *"Keep working on equation!! Make it work"* and
*"C is working on getting projections from draft shark, it includes ceiling and
floor projections… they have been most accurate."*

**Those turned out to be one request, and I can now show it with a number
instead of an argument.**

---

## 1. THE RAMP YOU ASKED FOR, DERIVED

You said: *"the 0.45 ceiling seems dumb… I am wanting ceiling later in draft,
want it to ramp up. no reason to take ceiling by a random value?"*

**Here is the ramp with no random value in it.** A body who starts 17% of weeks
doesn't start in seventeen *average* weeks — **he starts in his best 17%**,
because that's what setting a lineup IS. So the number that belongs in his
valuation is the upper quantile of his own range at his own start rate:

```
price him at the (1 − start_rate / 2) quantile of his own distribution
```

- an every-week starter → quantile 0.50 → **exactly his mean**
- a backup who plays 17% → quantile 0.91 → **mean + 1.36σ**

**The ramp size is the start rate. Nothing is chosen. 0.45 appears nowhere.**
And the same transform goes on the replacement, so a player only gains if **his
own range is wider than the wire's** — a pure dispersion differential.

## 2. IT MADE EVERYTHING WORSE — P179 FALSE

| roster | before ramp | **with ramp** | you said |
|---|---|---|---|
| QB | 1.56 | **2.03** ❌ | 1 |
| RB | 4.36 | **5.36** ❌ | 4–5 |
| WR | 5.32 | **3.85** ❌ | 4–5 |
| TE | 1.76 | 1.76 | — |
| K / DEF | 1.00 / 1.00 | 1.00 / 1.00 ✅ | 1 |

**It bought MORE quarterbacks and FEWER receivers — the opposite of everything
you've asked for.**

## 3. ⭐ AND THE REASON IS THE DATA, MEASURED

My prereg claimed *"a backup QB behind a deep wire is a low-dispersion body; a
young receiver with a wide range gains a lot."* **I never checked it. Here is
what our board actually says, in the exact range the ramp acts (ADP 90–250):**

| pos | median σ | wire σ | **differential** |
|---|---|---|---|
| **RB** | 16.1 | 12.0 | **+4.1** |
| **QB** | 13.4 | 10.8 | **+2.6** |
| DEF | 11.8 | 10.5 | +1.3 |
| K | 24.0 | 25.0 | −1.0 |
| TE | 11.0 | 12.3 | −1.3 |
| **WR** | **11.0** | 13.5 | **−2.5** |

> ### **On our data, the mid-round WR has the NARROWEST band on the board.**

**That is why the ramp bought quarterbacks. It is doing exactly what it should
— rewarding wide ranges — and our data tells it receivers are the safe ones.**

## 4. WHY OUR CEILING IS THE WRONG QUANTITY — and this is the whole case

**`proj_ceiling` is `mean + 1.28 × sd across three projection sources.** It
measures **how much analysts disagree**, and the field is labelled
`cross-source-p90` as though it were a percentile of outcomes (register 103).

**Analyst disagreement and player volatility are not the same thing, and for a
receiver they are close to opposites:**

- A **WR30** has enormous week-to-week variance — boom, bust, boom — and every
  analyst agrees on his season total. **Narrow band, wild player.**
- A **backup QB or a committee back** is unproven, so analysts disagree wildly.
  **Wide band, and the width is about our ignorance, not his upside.**

**So the equation asks "who is volatile?" and our data answers "who are we
confused about?" That is the defect, and it is now measured rather than
suspected.**

## 5. SO YES — BUY THE DRAFT SHARKS DATA, AND HERE IS THE ONE CHECK I'D RUN

**Your instinct is right and this is the strongest reason for it: their floor
and ceiling are modelled outcome distributions, which is the quantity §1's
equation needs and the quantity we do not have.** The ramp is derived, it's
implemented, it's controlled, and it is sitting idle waiting for a real σ.

⚠️ **Two honest caveats, neither of them a reason to wait:**

**(a) "Most accurate" is checkable and I have not checked it.** We hold
2022–2025 outcomes. Before their projections replace `proj_mean`, they should
beat ours on this league's scoring on the same players and weeks — that's the
same grade `PROJECTION-PROGRAM-2027.md` already defines. **The floor/ceiling is
worth having regardless of how that grade lands, because §4 says we have no
substitute for it.**

**(b) Do not swap the live board this week.** Every number you've studied for a
week moves, three days out. **My recommendation: report-only arm now, graded,
and a live swap only on your explicit call.**

## 6. WHERE THE EQUATION ACTUALLY STANDS

**Solved:** K and DEF land on exactly 1.00, sd 0.00, in all 300 rooms — your
ruling. RB and WR both sit inside your 4–5 band on the pre-ramp arm, with WR
ahead, which is your flex argument working.

**Open:** the second quarterback, now twelve arms deep, and the tight end with
it. **They are one defect — the only two positions with a wire deep enough that
a backup still prices positive — and §4 says the tool that should fix them
(upside) is reading the wrong signal.**

**Nothing shipped.** `draft_plan.js`, `engine.js` and the war room are
untouched. `no_fit_guard` holds through Saturday.
