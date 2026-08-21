# WE IMPLEMENTED ONE OF THE PAPER'S FOUR TESTS, AND IT WAS THE ONE OUR DATA CANNOT SUPPORT

**A, 2026-08-21.** Cory uploaded Getty, Li, Yano, Gao & Hosoi, *"Luck and the
Law: Quantifying Chance in Fantasy Sports and Other Contests"*, SIAM Review
60(4), 2018, and asked: should we implement this, is it necessary, how do we
grade skill and get better.

**I had not read it before today. I have now.** Everything below is from the
paper's own text plus measurements on our league.

## 1 · The paper proposes FOUR tests. We built the fourth.

Quoting §1 (the paper attributes them to Levitt, Miles & Rosenfield):

1. Do players have different expected payoffs?
2. Do predetermined observable characteristics predict payoffs?
3. **Do the ACTIONS a player takes have statistically significant impact on payoffs?**
4. Are returns correlated over time — persistence?

`skill_luck_r.py` implements **#4 only** (R\*, split-half persistence). That is
the one our data supports worst. The paper's NFL dataset has **m = 190,562
players**; ours has **m = 10**. At our measured skill spread, R\* has **12%
power today and 20% after nine more seasons** (`SKILL-LUCK-R-POWER-2026-08-21.md`).
Our R\*=0.682 against a null topping at 0.731 was never going to resolve.

## 2 · Test 3 fits us, and it is why the answer is "yes, implement it"

The paper runs Test 3 by comparing real players against **a Monte Carlo league
of randomly-drawn legal lineups**. That construction is the whole point: **the
null is built per decision**, so power comes from the number of decisions, not
from how many competitors exist. m=10 stops mattering.

`draft/backtest/start_sit_vs_random.py` does this on our league, narrowed
deliberately: the paper randomises the whole lineup from the entire athlete
pool, which mixes DRAFTING with START/SIT. **We hold the roster fixed** — the
players an owner actually had that week — and randomise only which of them
start. That isolates one decision: *given the roster you own, did you set a
better lineup than chance?*

**Controls run on every invocation** (rule 3e): a random-lineup owner must land
at percentile ~0.5, an oracle owner at ~1.0. Measured: **0.510** and **0.999**.
A run that cannot separate those cannot separate skill from luck either.

## 3 · The result

| | value |
|---|---|
| owner-weeks (2023–25) | **530** |
| mean percentile vs random | **0.8497** |
| null 95% band | **[0.4754, 0.5246]** |
| verdict | **SKILL — decisively above the band** |

Where R\* on standings was inconclusive, the same league and the same seasons
give an unambiguous answer here. **That is the case for implementing the paper:
not a different conclusion, a test with the power to reach one.**

## 4 · The number that is actually actionable

Beating random is a low bar — random benches your stars. The gap that pays is
to the **oracle** (perfect hindsight lineup): points left on your own bench.

| owner | n | mean pct ±SE | pts left/wk | /season (14wk) |
|---|---|---|---|---|
| Jreis | 53 | 0.906 ± 0.020 | **12.06** ± 1.43 | 168.9 |
| mhagen | 54 | 0.891 ± 0.019 | 14.09 ± 1.48 | 197.3 |
| cashworth | 54 | 0.887 ± 0.021 | 14.92 ± 1.71 | 208.8 |
| **coryjsimms** | 52 | **0.853 ± 0.025** | **17.33** ± 1.68 | **242.6** |
| Sadbru | 53 | 0.850 ± 0.024 | 14.57 ± 1.67 | 204.0 |
| Richard2121 | 53 | 0.845 ± 0.030 | 14.35 ± 1.69 | 200.9 |
| Schmelley | 54 | 0.833 ± 0.029 | 17.60 ± 1.62 | 246.4 |
| B8T3S | 53 | 0.828 ± 0.033 | 15.24 ± 1.81 | 213.4 |
| ds7mmet | 54 | 0.813 ± 0.030 | 19.67 ± 1.90 | 275.4 |
| MarianSaar | 51 | 0.788 ± 0.033 | 19.31 ± 2.07 | 270.4 |

**League mean: 15.90 points left on the bench every week.**

**READ THE ERRORS, NOT THE RANK.** Adjacent rows sit inside one SE — the
ORDERING is not a finding. What survives its error is the top-to-bottom gap:
Cory 17.33 ± 1.68 against Jreis 12.06 ± 1.43 is **5.3 pts/week, ~2.4 SE**,
about **74 points a season**. For scale, the entire *drafting* edge measured
this month ranged from −9.4 to −188 points. **Start/sit is the same order of
magnitude as everything the draft tool does, and nobody was grading it.**

The oracle is hindsight and unreachable; the target is not zero, it is closing
part of a gap that three owners are already on the good side of.

## 5 · A bias found and fixed, worth recording

The first run dropped any owner-week containing a player missing from
`player_positions.json`. That cost 28 owner-weeks and **cost them unevenly** —
roster_1 lost 10, roster_10 lost 8, four owners lost none. Cory's n came out 42
against everyone else's 52–54, **which is the only reason it was visible.**
Six ids cause all of it and they are bench filler (12530: rostered 10 times,
started zero). An unplaceable player only blocks legality, so he is now dropped
from the eligible pool instead of taking the week with him; the week is refused
only if an unmapped player was actually STARTED (7 owner-weeks, counted in the
output). Balanced n, and the headline moved 0.8468 → 0.8497.

## 6 · What this does NOT cover, stated so nobody assumes it does

Roster held fixed, so this measures **start/sit only** — not drafting, not
waivers, not trades. Tests 1 and 2 remain unimplemented. The oracle is
hindsight. And this says nothing about whether our *projections* are good; it
says our *lineup decisions from whatever we believed* beat chance.

## 7 · Recommendation

**Keep R\*, stop asking it to certify the standings** — at 12% power that is a
false-negative machine, and the 08-20 doc's "≥20 graded outcomes" threshold is
far too low. **Grade decisions against constructed nulls instead**, which is
Test 3's shape and generalises: waiver claims vs a random-available-player null,
draft picks vs a random-legal-pick null, start/sit as above. Each one builds its
own null, so each has power our ten-owner league can actually deliver.
