# Construction-order simulation — my read on the proposal

**Asked for a read, not an instruction.** Cost measured, arms assessed, framing
checked. Nothing built.

---

## 1 · THE FRAMING HOLDS, WITH ONE CORRECTION THAT CHANGES THE DESIGN

**The load-bearing claim is right.** "Which strategy makes more money" needs a
realized season and we get one a year. "Which position sequence produces the
strongest projected starting lineup" is a property of the board, the room and the
pick order, and it resolves the moment the simulation ends. The power analysis
killed the first question and does not touch the second. That reasoning is sound.

**AND IT IS NOT CIRCULAR, WHICH WAS MY FIRST WORRY AND IS WRONG.** I expected
rule 10d — grading the tool against the quantity it maximises. But the tool is
GREEDY PER PICK on a composite (VONA + ceiling + keeper + stack), while the
metric is the END STATE of twelve picks under a snake. A greedy rule is not
guaranteed to reach the best end state, because taking the best player now
changes what is available at your next four turns. **That gap is real, it is
measurable, and nothing has ever measured it.**

**THE CORRECTION: an arm that beats the shipping rule on projected starting
points may simply CARE about projected points more.** The tool deliberately
sacrifices some projected value for ceiling, keeper option value and stack
correlation. Scoring every arm on projected starters alone rewards exactly the
arm that ignores those terms, and the result would read as "the shipping rule
constructs badly" when it means "the shipping rule optimises something else".

**So the run needs a benchmark arm, and it is the most important arm in the set:**

> **GREEDY END-STATE.** At each of my picks, take the player who most increases
> the projected starting lineup — the direct greedy maximiser of the metric
> itself.

If the shipping rule sits close to it, the metric is nearly circular and the run
says little. If there is a gap, the gap is the finding and it is denominated in
projected points the current rule leaves on the table. **Either way that one arm
tells you whether the whole exercise is informative, which is why it goes first.**

---

## 2 · THE ARMS — TWO ARE STRAW MEN, ONE IS AN ABLATION, ONE ALREADY RAN

| proposed arm | my read |
|---|---|
| **Fill the scarcest starting slot first** | **ALREADY MEASURED.** `exp_keeper_b0.need_filter` is exactly this (strict fill-first) and it was compared against `startable_cap_filter`, the mask that ships. The mask won. **Keep it anyway as a CALIBRATION arm** — if the harness reproduces a known result, that is a non-vacuity check on the whole run; if it does not, the harness is wrong before any new arm is believed. |
| **Defer the flex until late** | **STRAW MAN, and ill-defined.** FLEX is not *taken*, it is *assigned* — whoever is left over fills it. There is no decision to defer. To be real it would have to mean "cap RB/WR/TE depth until round N", which is a different rule with a different name. |
| **Steepest projected drop-off to the next available** | **NOT AN ALTERNATIVE — THAT IS VONA.** `expectedBestAvailable` computes value over the next available at the position; it is the shipping rule's largest term. Running it is an ABLATION (VONA alone vs the composite), which is legitimate and worth one slot, but it must be labelled as such rather than presented as a rival policy. |
| **Never two of the same position consecutively** | **STRAW MAN.** An arbitrary constraint with no mechanism behind it. The thing it gestures at — don't over-concentrate — is handled better and already by the onesie discount and the startable cap. |

**BETTER ARMS, and they are better because today's run measured the defect they
target rather than because they sound plausible:**

1. **ONESIE CAP.** Never take a third QB or third TE. The modal simulated roster
   is **QB3 TE3 RB1** — six of twelve picks on two one-starter positions. This is
   the highest-contrast arm available and it is motivated by a measurement, not a
   hunch.
2. **POSITION-NORMALISED CEILING.** The bench branch ranks on
   `proj_ceiling − proj_mean` in RAW season points, and the p90 spread runs QB
   66.5 against TE 30.8 — a quarterback's upside is the biggest absolute number
   on the board almost by construction. Normalising it is the real fix for the
   shape, and this arm measures what it buys before it is promoted.
3. **SCARCITY-PER-TURN.** Take the position where *(viable players above
   replacement) ÷ (picks until my next turn)* is smallest. This is a TIMING rule
   rather than a value rule — it is the only proposed arm that routes through
   survival rather than through the score, which is the architectural direction
   the audit identified as the one that has not been tried.

---

## 3 · THE COST, MEASURED

**6.7 seconds per simulated draft**, single-threaded, on the live board.

| run | wall clock |
|---|---|
| 1,000 drafts × 1 arm | **111 min** |
| 1,000 drafts × 5 arms | **9.3 hours** |
| 200 drafts × 5 arms | **111 min** |

**1,000 × 5 is not cheap and it is not necessary.** Run the arms **PAIRED on the
same seed** — identical opponent behaviour, identical board evolution, the only
difference being my own rule. That removes almost all the between-room variance,
which is the variance that would otherwise force a large n. At n = 200 paired,
a difference of a couple of projected points per starting lineup is comfortably
resolvable.

**Recommendation: 200 paired rooms, five arms, ~2 hours.** Report the
distribution, not just the mean — Cory is right that a path which occasionally
produces a disaster is worse than a slightly weaker reliable one, and the paired
design makes the per-room difference readable directly.

---

## 4 · THE ROOM VARIATIONS ARE LOAD-BEARING, NOT A ROBUSTNESS NICETY

Worth saying plainly: **with opponents drafting to ADP, the "best construction
order" is largely a property of the ADP curve rather than of football.** The
optimal order is whatever exploits the depletion pattern the room model produces.
Change the room and the answer can change completely.

So the seat and room-shape variations are not a footnote — **they are the test of
whether there is an answer at all.** If the best order at slot 8 under a calm
room differs from slot 8 under a QB-run room, the finding is "construction order
is room-dependent", which is more useful than a single winner and is honest about
what one room model can support.

The recovery question ("can it adapt when three RBs go right before my pick") is
the sharpest of the three and I would run it even if the rest were cut.

---

## 5 · REPEATABLE JOB: YES, BUT AS ONE JOB, NOT TWO

Rule 9 does not say "run it once". It says the mechanism must be cheap. A
2-hour scheduled run producing an archived table is cheap; a recurring analysis I
have to interpret is not.

**But it must be the SAME job as the annual roster-construction gate, not a
second one beside it.** That gate is already specified to fire on keeper-slate
confirmation. The construction-order arms are additional COLUMNS on that run —
same harness, same trigger, same archive, one more section in the output. A
second scheduled job asking a neighbouring question about the same simulation is
the disease, and it is the same argument that gave C one row in the standing
check rather than a second checker.

**Gate on holes. Report on order.** The gate blocks a draft when a slot has no
completion path; the order table is discovery output and blocks nothing, because
a construction order that wins in simulation has earned a preregistration and
nothing more.

---

## 6 · THE FOURTH SESSION — RIGHT CALL, AND HERE IS ITS PRICE

Right, and for a sharper reason than separability: a session that measures code
it does not own produces reports somebody else has to integrate, and **integration
is already the bottleneck** — that is what the batching change was for.

**The cost you should price: declining the session means this queues behind the
draft-critical items and the September deadline in my lane.** That is the right
priority and it means the construction-order run happens after the 22nd unless
you say otherwise. "We declined a session" and "we accepted a delay" are the same
decision and only one of them is usually said out loud.

---

## 7 · WHAT I WOULD ACTUALLY RUN, IN ORDER

1. **GREEDY END-STATE benchmark** — 200 paired rooms, one arm, ~22 min. It
   decides whether the metric is informative before anything else is spent.
2. If the gap is real: **onesie cap** and **position-normalised ceiling**, paired,
   because they are the two arms attached to a defect already measured.
3. **Scarcity-per-turn**, as the one genuinely new mechanism.
4. **need_filter** as the calibration arm.
5. Room variations on the winner only, not on all five.

**Not before the 22nd.** The onesie cap is worth running sooner than the rest,
because it doubles as the validation for the pre-draft fix I have already
recommended.
