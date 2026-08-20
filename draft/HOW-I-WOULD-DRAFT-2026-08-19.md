# If my life depended on it: what I would actually optimise, and why

**A, 2026-08-19.** Cory asked me to drop preconceived notions, start at the
beginning, and think about how I would draft. This is that, and then the test.

---

## 1. THE OBJECTIVE IS NOT THE ONE WE HAVE BEEN OPTIMISING

Every model in this repo maximises **points on the roster**. You do not score
points with your roster. You score them with **nine starters, seventeen times**.

**The largest measured deficit in this project is not acquisition — it is
conversion.** `seat_rank_and_the_conversion_gap` measured the engine's rosters
holding **MORE** projected points than the human owners' (+2.1%, +5.1% in 2023
and 2025) and still losing, because conversion ran **0.740 / 0.771 against
0.828 / 0.834**. Roughly a tenth of everything acquired never reached a
starting slot. **That is larger than any acquisition edge anyone has measured
here.**

So the objective is:

```
maximise   E[ Σ over 17 weeks  Σ over 9 slots  points of whoever I start ]
```

Everything below follows from taking that literally.

## 2. WHAT THAT CHANGES — FOUR CONSEQUENCES, NOT OPINIONS

**(a) A body is worth what he adds to the LINEUP, not to the roster.** His value
is the points he scores in the weeks he actually starts, minus the points of
whoever would have started instead. That "instead" is **my own next-best
available body that week** — not a league-wide wire constant. The wire is an
approximation of a roster-specific, week-specific quantity, and it is the
approximation that makes a 5th running back look like a 3rd.

**(b) FLOOR MATTERS FOR LOCKED STARTERS. CEILING MATTERS FOR OPTIONAL ONES.**
This is Cory's instinct and it is an order-statistic result, not a heuristic. A
first-round pick starts every week: I eat his bad weeks, so his downside is a
loss I cannot avoid. A late pick starts only when I choose to start him — I
capture his good weeks and bench the bad ones. **You get the maximum of what you
can choose between, and a maximum is convex in variance: on the bench, variance
is an asset. In a locked slot it is a tax.**

**(c) ⚠️ AND THAT ONLY HOLDS IF I CAN TELL WHICH WEEK HE WILL HIT.** If I set
lineups by season mean alone, I start the same men every week, I never capture
the boom, and **bench ceiling is worth exactly zero.** The value of upside is
entirely a function of weekly foresight. **Nobody in this project has ever
measured that foresight, and it is the hinge the whole ceiling question hangs
on.** It is the experiment below.

**(d) Injury risk is not a discount on a player. It is a demand for depth at his
position.** A starter's absence forces a replacement-level body into my lineup;
a bench body's absence costs nothing. So the same 40% risk is expensive on my
RB1 and free on my RB5 — and its real cost is set by **what I can get off the
wire at that position**, which is why RB depth is worth something (wire 78) and
QB depth is worth nothing (wire 323).

## 3. HOW I WOULD DRAFT, IN ONE PARAGRAPH

Fill the slots I am forced to fill with the highest-**floor** bodies I can,
because I will start them whatever happens and their bad weeks are unhedgeable.
Once every slot is covered, stop buying means entirely and buy **range** — the
widest outcomes I can find at the lowest price — because a bench body is a free
option and options are priced on variance. Never pay for depth at a position
whose wire is deep (QB, TE, K, DEF): that is buying insurance against a loss the
waiver wire covers for free. Pay for depth where the wire is barren (RB, and to
a lesser extent WR). Spread byes deliberately, because a bye is a guaranteed
zero in a slot and it is the one form of unavailability I can see in advance.

## 4. THE EXPERIMENT — because §2(c) is a claim and not a fact

I will build a 17-week lineup simulator: real bye weeks, injury absences drawn
from each player's own Draft Sharks risk, weekly scores drawn from his own
floor/proj/ceiling, and a manager who sets lineups from a **noisy signal** of
that week's outcome. The signal strength `rho` runs 0 (start by season mean, no
foresight) to 1 (perfect foresight).

**P203 — bench ceiling is worthless without foresight.** At `rho = 0`, a roster
built by drafting the highest CEILING available at every pick scores **no more**
starting-lineup points than one built on the highest MEAN — within 1%.
**FALSE if the ceiling roster wins by more than 1% at zero foresight.**

**P204 — and there is a foresight threshold where it flips.** There exists a
`rho` below 1.0 at which the ceiling roster starts beating the mean roster.
**FALSE if the mean roster wins at every rho** — which would say upside is never
worth buying at any achievable skill level, and would kill the ceiling adjuster
outright.

**P205 — floor beats ceiling in the LOCKED slots regardless.** Restricting the
comparison to the six forced starting slots, the high-FLOOR roster beats the
high-CEILING roster at every rho tested. **FALSE otherwise**, which would
overturn §2(b).

**Controls.** Same players, same seeds, same injury draws across arms; a
zero-variance control where every player scores his mean exactly must make all
three arms identical; bye weeks from the board, absences from each player's own
risk, and the number of players with no bye reported rather than defaulted.

**If P203 or P205 fails, §2 is wrong and I will say so and rebuild it.**
