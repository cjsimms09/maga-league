# Is the additive composite the right shape for the draft-side score?

**Item 11, and the answer is measured rather than argued.** Two answers, because
the question contains two claims and only one of them is about shape.

---

## THE MEASUREMENT

`draft/tools/construction_order.js` — **200 PAIRED rooms**, same seed across every
arm, valuation held fixed, only the construction ORDER varying. Objective:
projected points of the **starting** lineup. Bench is worth zero.

| arm | mean | vs shipped (paired) | p10 | p50 | p90 | holes |
|---|---|---|---|---|---|---|
| **shipped** (the additive composite) | 1989.9 | — | 1980 | 1990 | 1997 | 0 |
| **greedy_end_state** (maximises the metric directly) | 1997.8 | **+7.9 ± 1.5** | 1996 | 2000 | 2000 | 0 |
| scarcity_per_turn | 1953.3 | −36.5 ± 1.8 | 1941 | 1955 | 1962 | 0 |
| need_filter (calibration) | 1957.4 | −32.5 ± 1.6 | 1952 | 1956 | 1963 | 0 |

**THE CALIBRATION ARM BEHAVED**, which is what licenses reading the rest:
`need_filter` is strict fill-first, the rule the Lab already measured losing to
the startable-cap mask. It loses here too, by 32.5 points. A harness that
reproduces a known result is a harness worth believing on a new one.

---

## ANSWER ONE — ON SHAPE: THE COMPOSITE IS FINE, AND THE REWRITE BUYS 0.4%

**A formulation that DIRECTLY maximises the end-state starting lineup beats the
additive composite by 7.9 points out of 1990. That is 0.40%.**

Set against your published prior — 1656 floor, ~1875 autodraft, 1961 optimal, so
**~86 points (4.6%) between naive slot-filling and optimal** — ours reads:

- naive (`need_filter`) → greedy: **40.4 points, 2.0%**. About half the published
  spread, and the difference is explainable rather than mysterious: our seat
  forfeits three rounds to keepers, so twelve picks are being compared rather
  than fifteen, and three of the strongest slots are already filled.
- **and the shipped composite already captures 32.5 of those 40.4 points — 80%
  of the available construction gain.**

**So the sequential expected-end-state formulation is not worth rewriting the
composite for.** You asked me to say plainly if the additive shape is a
reasonable approximation and the sequential version buys little. **It is, and it
does — 0.4%, about four points a season, against a rewrite that re-opens every
number on the board.**

### AND ONE THING FELL OUT THAT I DID NOT EXPECT

**`greedy_end_state` contains NO SURVIVAL MODEL AT ALL.** It looks only at the
current roster and the available player; it has no VONA, no survival curve, no
window. **And it wins.**

That is a real finding about the survival machinery: on the end-state metric, the
entire VONA/survival apparatus is **not paying for itself** — a rule that ignores
it entirely scores 7.9 points higher. Not proof it is worthless (it prices things
this metric cannot see, and the metric is projections we did not produce), but it
is the first direct measurement of that stack against an outcome, and the sign is
not the one the architecture assumes.

---

## ANSWER TWO — AND THIS IS THE PART THAT MATTERS: THE REWRITE WOULD NOT FIX THE FOUR ZEROS

You framed the question from four measurements: room mixture 0.0%, ADP adjustment
0.0%, manager profiles 1.4%, weekly-high term 0.7%. And you are right that my
diagnosis was the same every time — an additive term against a dominant quantity
cannot move a decision.

**But "is the ordering near-optimal" and "can a room signal reach a decision" are
different questions, and the sequential formulation answers only the first.**

**THE SEQUENTIAL VERSION INHERITS THE PROBLEM WHOLE.** "Expected end-state given
what survives to each of my remaining picks" needs survival probabilities. The
room signal enters by shifting those probabilities. **Measured: turning the room
mixture off moves all 60 per-player pick probabilities by at most 0.00128** — a
tenth of a percentage point. An end-state calculation weighted by probabilities
that differ by 0.13pp produces an end state that differs by approximately
nothing. **Same zero, one layer down, and now inside a much more expensive
computation.**

So the honest statement is not "the composite is structurally incapable of
expressing half of what we compute". It is narrower and worse:

> **THE ROOM SIGNAL IS SMALL RELATIVE TO VORP IN ANY FORMULATION THAT ENDS IN
> POINTS.** The composite is not the reason it cannot move a decision. Its
> magnitude is.

**That is the largest open design question in the system** — you asked me to name
it as one if it was, and it is — **but it is not the question you posed.** The
answer is not a different scoring shape. It is either a room signal an order of
magnitude larger than the one we can measure from three drafts, or an admission
that nine specific people are not modellable at our sample and the layer should
be deleted rather than rewritten.

---

## WHAT I WOULD DO WITH THIS

1. **Do not rewrite the composite.** 0.4%, and the rewrite re-opens every number.
2. **Take the 7.9 points a cheaper way if at all.** The gap is greedy-vs-composite
   at the ORDERING margin; a lookahead of one or two picks inside the existing
   scorer would capture most of it without changing the shape. Worth a candidate,
   not a project.
3. **The survival finding is the one to chase.** A rule with no survival model
   beat the one with it. That is measurable again, cheaply, and it bears directly
   on whether the winter room-through-survival design is worth starting at all —
   because if survival is not paying for itself on end-state strength, routing the
   room through it inherits that.
4. **This is discovery.** Under the three filters it earns a preregistration, not
   a promotion. The metric is projected points from public consensus, and a
   construction order tuned to it is optimising against a number we did not
   produce.

---

## THE LIMITS, STATED BEFORE THEY ARE ASKED FOR

- **200 paired rooms, one room model** (ADP with jitter). The room variations —
  by seat, and against a reaching room, a QB-early room and an RB run — were
  specced and are the next run; they are not in these numbers.
- **The 150-pick geometry**, with only my three keepers on the board. The absolute
  means will move when the slate confirms; the paired differences are far more
  robust to that than the levels.
- **Projected points, not realized.** A stronger projected lineup is better only
  if the projections are right.
