# CLAIM UNDER INDEPENDENT REVIEW — replacing outcome-persistence grading with decision-null grading

**Author: A. 2026-08-21. For an external reviewer with no repository access —
everything needed to judge the claim is in this file.**

Cory's instruction: *"We just need a more structured way to get this model
smarter and differentiate luck from skill and find edge... should we be grading
things this way? See how we have implemented this grading scale into our model,
did we make good change or was this dumb? How do we make better."*

---

## 0 · WHAT I AM ASKING YOU TO JUDGE

Four claims, in descending order of how much they would cost if wrong:

1. **That our existing skill-grading mechanism cannot work on our data**, for a
   reason of statistical power rather than taste.
2. **That the replacement I built measures what I say it measures**, and that
   its controls actually discriminate.
3. **That the effect size I report is real and correctly scoped** — in
   particular that I have not confused "beats random" (a low bar) with "is
   good", and that I have read the error bars correctly.
4. **That the generalisation I propose** (grade every decision type against a
   constructed null) does not have a defect I have failed to see.

**I do not want a redesign.** I want errors. Where the code does not do what I
say, where a number does not follow from the method, where an inference outruns
its evidence.

---

## 1 · THE SETTING

A 10-owner fantasy football league, 2023–2025 seasons, ~14 games/owner/season.
Weekly head-to-head: each owner starts 9 players from a ~16-player roster
(QB, RB, RB, WR, WR, TE, FLEX∈{RB,WR,TE}, K, DEF) and scores the sum of their
real-world fantasy points. We hold complete records: every roster, every
week, who was started, and every player's realised points.

## 2 · WHAT WE BUILT FIRST, AND WHY I CLAIM IT CANNOT WORK

Cory uploaded Getty, Li, Yano, Gao & Hosoi, *"Luck and the Law: Quantifying
Chance in Fantasy Sports and Other Contests"*, SIAM Review 60(4), 2018. The
paper lists four tests for distinguishing skill from chance (it attributes them
to Levitt, Miles & Rosenfield):

1. Do players have different expected payoffs?
2. Do predetermined observable characteristics predict payoffs?
3. **Do the ACTIONS a player takes have statistically significant impact on payoffs?**
4. Are returns correlated over time — persistence?

We implemented **only #4**: R\* = 1 − Var(T)/Var(S), the split-half persistence
metric, where first- and second-half win fractions are rotated into a
persistence axis S and a noise axis T. Significance from a Monte-Carlo null:
redraw every competitor's outcomes from the pooled distribution, take the
97.5th percentile.

**Measured on our league:** R\* = 0.682, m = 10, null 97.5 = 0.7309. Does not
clear. Reported honestly at the time as non-significant.

**MY CLAIM: this is not a close call that more seasons will resolve.** I ran a
power calculation the original work did not carry — synthetic leagues with a
KNOWN persistent skill spread, MC null per draw, 25 seeds per cell:

| true spread (best/worst owner's true win rate) | n=50 (today) | n=100 (~6 seasons) | n=150 (~9 seasons) |
|---|---|---|---|
| **0.10 ← ours** | **12%** | **16%** | **20%** |
| 0.15 | 32% | 52% | 68% |
| 0.20 | 60% | 88% | 96% |
| 0.25 | 68% | 96% | 100% |

Our observed all-play win-rate range is .366–.578, i.e. a spread of ≈0.106 —
the top row. **Nine more seasons would still leave us at 20% power.**

Context: the paper's own NFL dataset has **m = 190,562** players. We have 10.

**A first concern of mine was WRONG and I record it because it constrains the
claim:** I expected m=10 to be underpowered *by construction*. It is not. With
a large true spread and n=200, detection is 20/20 at m=10, 19/20 at m=5, 10/20
even at m=3; fair-coin controls detect 0/20 at every m. **Small m is not the
problem — our small EFFECT is.**

## 3 · WHAT I BUILT INSTEAD

The paper's **Test 3** answers the action question by comparing real players
against **a Monte-Carlo league of randomly drawn legal lineups**. The property
that matters for us: **the null is constructed per decision**, so statistical
power scales with the number of decisions, not the number of competitors. m=10
stops being the binding constraint.

`draft/backtest/start_sit_vs_random.py` implements this, **narrowed
deliberately**. The paper randomises the entire lineup from the whole athlete
pool, which mixes DRAFTING skill with START/SIT skill. We hold the roster
**fixed** — exactly the players that owner held that week — and randomise only
which of them start. This isolates one decision: *given the roster you own, did
you set a better lineup than chance?*

**Method per owner-week:**
1. Compute the actual starters' realised points.
2. Draw N=400 random legal lineups from the same roster (slots filled
   hardest-first so a scarce position is not consumed by FLEX).
3. Record the actual score's percentile within that null (ties split).
Pure chance ⇒ percentiles uniform on [0,1], mean 0.5. Skill ⇒ mean > 0.5.
Test statistic: mean percentile over all owner-weeks; null band for the mean of
n uniforms is 0.5 ± 1.96/√(12n).

**Controls, run on every invocation** (a run that cannot separate these cannot
separate skill from luck): a synthetic owner starting a RANDOM legal lineup
must land at ≈0.5; an ORACLE owner starting his best legal lineup must land
at ≈1.0. **Measured: 0.510 and 0.999.**

## 4 · THE RESULT

| | value |
|---|---|
| owner-weeks (2023–25) | **530** |
| mean percentile vs random | **0.8497** |
| null 95% band | **[0.4754, 0.5246]** |
| verdict | **above the band — actions matter** |

**The actionable form.** "Beats random" is a low bar — random benches your
stars. The gap that pays is to the oracle: points left on your own bench.

| owner | n | mean pct ± SE | pts left/wk ± SE | /season (14wk) |
|---|---|---|---|---|
| Jreis | 53 | 0.906 ± 0.020 | **12.06** ± 1.43 | 168.9 |
| mhagen | 54 | 0.891 ± 0.019 | 14.09 ± 1.48 | 197.3 |
| cashworth | 54 | 0.887 ± 0.021 | 14.92 ± 1.71 | 208.8 |
| **coryjsimms** | 52 | 0.853 ± 0.025 | **17.33** ± 1.68 | 242.6 |
| Sadbru | 53 | 0.850 ± 0.024 | 14.57 ± 1.67 | 204.0 |
| Richard2121 | 53 | 0.845 ± 0.030 | 14.35 ± 1.69 | 200.9 |
| Schmelley | 54 | 0.833 ± 0.029 | 17.60 ± 1.62 | 246.4 |
| B8T3S | 53 | 0.828 ± 0.033 | 15.24 ± 1.81 | 213.4 |
| ds7mmet | 54 | 0.813 ± 0.030 | 19.67 ± 1.90 | 275.4 |
| MarianSaar | 51 | 0.788 ± 0.033 | 19.31 ± 2.07 | 270.4 |

League mean: **15.90 points left on the bench per week.**

**I claim the RANK is not a finding** — adjacent rows sit inside one SE. I
claim the top-to-bottom gap is: Cory 17.33 ± 1.68 vs Jreis 12.06 ± 1.43 =
**5.27 pts/wk, combined SE ≈ 2.21, ≈2.4 SE**, about **74 points/season**.

For scale: the entire *drafting* edge measured for this tool this month ranged
from −9.4 to −188 points/season. **Start/sit is the same order of magnitude and
nothing was grading it.**

## 5 · A BIAS I FOUND AND FIXED — please check the fix, not just the finding

The first run refused any owner-week containing a player absent from our
position map. That lost 28 owner-weeks and lost them **unevenly**: roster_1
lost 10, roster_10 lost 8, four owners lost none. Cory's n came out 42 against
everyone else's 52–54, **which is the only reason it was visible.**

Six player ids cause all of it and they are bench filler (id 12530: rostered 10
times, **started zero**). An unplaceable player only blocks *legality*, so he is
now removed from the eligible pool rather than taking the week with him. The
week is still refused if an unmapped player was actually STARTED (7 owner-weeks;
counted in the output, not silently dropped). Balanced n; headline moved
0.8468 → 0.8497.

## 6 · WHAT I PROPOSE TO CHANGE, AND WHAT IS ALREADY WRONG IN OUR REPO

**The generalisation:** stop grading *outcomes* (did I win the week?) and grade
*decisions against a constructed null* (did I choose better than random?).

| decision | its null | status |
|---|---|---|
| start/sit | random legal lineup from the roster held | **built, this claim** |
| waiver claim | a random available player at that position | proposed |
| draft pick | a random legal pick from the board at that moment | proposed |
| trade | random swap of comparable roster slots | proposed |

**Three things in our repo are wrong today and I intend to correct them:**

1. `draft/ADAPTATION-POLICY.md` says *"any arm, tool, or edge with ≥20 graded
   outcomes reports R\* beside its mean."* **n≥20 is far too low** — at n=50
   and our spread, power is 12%. A threshold admitting n=20 manufactures
   non-significant results that then get quoted as "not skill", which is a
   false negative dressed as a finding.
2. **Nothing calls `skill_luck_r.py`.** No grader, no CI check, no workflow.
   It is a tool beside a policy sentence with no mechanism. By our own standard
   that is a rule that decays.
3. The 08-20 write-up presents the standings R\* as a measurement awaiting more
   seasons. Given §2 it should be retired as a certification and kept only as a
   descriptive prior carrying its non-significance.

## 7 · WHAT THIS DOES **NOT** ESTABLISH

* **Not drafting, waivers or trades.** Roster held fixed: start/sit only.
* **The oracle is hindsight** and unreachable; the target is not zero.
* **It does not say our league is skill overall.** It says one decision type
  beats chance. Tests 1 and 2 remain unimplemented.
* **It does not validate our projections.** It says lineup decisions made from
  whatever we believed beat random; it does not say those beliefs were good.
* **Low R\* power does not mean our league is luck** — we cannot tell, and
  R\*=0.682 stays consistent with real skill we cannot certify.

## 8 · SPECIFIC QUESTIONS

1. **Is the percentile-vs-random-legal-lineup statistic sound**, or does
   holding the roster fixed while randomising starters introduce a bias I have
   not named (e.g. bench players systematically injured/on-bye, so the null is
   weaker than a real alternative and 0.85 is inflated)?
2. **Is my power calculation for R\* correct in method**, and is "12% power at
   our spread" a fair characterisation, or have I mis-specified the alternative?
3. **Is the ≈2.4 SE gap being over-read?** Should I be reporting a paired
   comparison rather than two independent means, given all owners face the same
   weeks and the same player pool?
4. **Does the generalisation to waivers/draft picks inherit a defect** from
   this design that is not obvious at the start/sit case?
5. Anything else that is simply wrong.
