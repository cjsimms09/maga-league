# The pairing claim was wrong, and the measurement that showed it was circular

**Result against `pairing_claim_prereg_2026-08-12.md`, which was committed before
the numbers existed.** Preregistered outcome **3 — the ordering moved.** I was
wrong, and two documents I wrote this morning need correcting rather than
qualifying.

Three findings, and **the second is larger than the one I set out to test.**

---

## 1. THE CLAIM: FALSIFIED

What I wrote this morning, defending the construction-order results against a
defect I had just found in the room model:

> `greedy_end_state` beats the composite by the same margin in a room with no
> tail as it would in one with a tail, because both arms face the identical
> board.

| room | shipped | greedy vs shipped | lookahead_2 vs shipped |
|---|---|---|---|
| **adp** (n=200) | 1989.9 | **+7.9 ± 1.5** | −0.1 ± 1.8 |
| **adp** (n=60, reproduction control) | 1989.4 | **+7.9 ± 3.0** | −0.2 ± 3.3 |
| **profiled** (n=25) | 2208.2 | −13.6 ± 11.4 | −99.6 ± 26.2 |
| **profiled** (n=30) | 2212.2 | −11.3 ± 9.7 | −92.9 ± 24.0 |
| **profiled** (n=60) | 2219.3 | −11.0 ± 7.3 | −80.4 ± 15.2 |
| **profiled** (n=200, matched to the ADP run) | 2225.6 | **−9.4 ± 4.6** | **−87.7 ± 8.4** |

**At matched n = 200 the two rooms give +7.9 ± 1.5 and −9.4 ± 4.6.** The
preregistration set the resolution at roughly ±2.7 for n = 60 and the observed
shift is six times that, so this is not a sampling artifact and it is not read as
one. The margin declines slightly in magnitude as n grows (−13.6 → −9.4) — the
small-n runs overstated it, which is the direction to expect and worth saying.

**The margin does not survive the room change — it changes SIGN.** Greedy wins by
7.9 in one room and loses by ~11 in the other, and the two intervals do not come
close to overlapping. "Pairing biases the LEVELS, not the DIFFERENCES" is false
as stated.

**The reproduction control did its job**: the same code that produced the
profiled numbers reproduces `+7.9` in the ADP room to the decimal, so the flip is
a room effect and not something I broke while adding the flag.

### What that costs, precisely

- **`room_model_tails_2026-08-12.md` § "What this does not change" is wrong** and
  is corrected below rather than softened.
- **`composite_shape_2026-08-12.md`'s headline is room-conditional.** "A direct
  end-state maximiser beats the additive composite by 0.4%" holds in the ADP room
  and reverses in the profiled one. The *practical* conclusion — **do not rewrite
  the composite** — survives, and in fact survives more comfortably, because the
  shipped composite is the best arm in the profiled room. But it now rests on
  "the rewrite's advantage is not robust to the room model" rather than on "the
  advantage is real but small," and those are different arguments.
- **The lookahead result strengthens.** −0.1 in one room and −80 to −100 in the
  other. The external review's prescribed version does not merely buy nothing; in
  a room whose behaviour it mis-forecasts it is catastrophic. Its internal model
  is "the board drains by ADP" — true by construction in the ADP room, false in
  the profiled one. **A lookahead is only as good as its survival forecast, and a
  wrong forecast is worse than no forecast.** That is a sharper answer to item 11
  than the one I gave, and it points the same way.

### AND I CHECKED THE OBVIOUS ARTIFACT FIRST

`lookahead_2` left a starting slot empty in 44 of 60 drafts. Before reading that
as a finding I looked at how a draft can end short and found a bare
`catch (e) { break; }` around the arm call — **an arm that throws ends the draft
early, the roster ends short, and the missing slots score as HOLES.** "The arm
chose badly 44 times" and "the arm crashed 44 times" would print as the same
number in the same column.

**Checked: `short-draft causes: NONE`.** No arm threw, no arm returned nothing.
The holes are choices. The catch is now loud and every run states its short-draft
causes even when there are none — because the holes column is unreadable without
that line.

---

## 2. THE LARGER FINDING: THIS MORNING'S 0/40 WAS A DEFINITION, NOT A MEASUREMENT

The whole tail investigation rested on this table:

| room model | drafts containing an elite fall-through |
|---|---|
| adp-with-jitter | 0 / 40 |
| profiled | 40 / 40 |

An elite fall-through was defined as **a top-3-at-position player still available
40+ picks past his ADP**. The ADP room selects each pick from **the eight
best-ADP players available**.

**Measured directly, over 200 drafts × 150 picks — 30,000 picks — the deepest any
player was taken past his own ADP in that room is 22.8.** Against a threshold of
40.

> **The 0/40 was not rare. It was unreachable.** The metric is defined against the
> same ADP the room orders by, so the room cannot produce the event at any sample
> size. **Rule 10d: a fixture deriving from the thing under test always agrees.**

I wrote that morning's note *applying rule 13g to the profiled room's 100%* —
asking what a suspicious number was really telling me — and did not apply it to
the 0%. **Rule 13g says to read a negative as closely as a positive, and I read
one of the two.** The instrument could not have produced anything else, which is
exactly the question 13f says to ask first.

So "the ADP room has no tail" is still true, but it is true **by construction and
was never in evidence**, and the 40/40 for the profiled room mostly says that the
profiled room does not order by ADP. Neither number licensed the mixture design I
proposed off the back of them.

---

## 3. THE NON-CIRCULAR REPLACEMENT — AND THE REAL TRACES C FOUND

**C corrected a claim of mine that was load-bearing.** I wrote that the raw pick
sequences are not retained in this repository, having checked
`manager_profiles.json` — which holds only derived profiles — **and generalised
from one file to the repo.** `draft/data/league_history.json` retains **480 real
picks in order across three completed drafts.** The claim was false. A mixture
parameter chosen from first principles, when a measurement was sitting on disk,
is the error that correction prevented.

`draft/tools/room_tail_calibration.js` scores the synthetic rooms against those
drafts. It **requires the room functions from `construction_order.js` rather than
copying them**, so the harness doing the scoring cannot drift from the harness
whose results are being defended.

**The statistic deliberately needs no ADP** — a contemporaneous 2023–25 ADP does
not exist here, and scoring old drafts against the 2026 ADP would measure three
years of career trajectory and report it as room behaviour. Instead: the
**longest positional drought**, counted only after the position opens, as a ratio
to that position's mean gap.

```
                      QB max/ratio/n   RB max/ratio/n   WR max/ratio/n   TE max/ratio/n
REAL 2025             28/3.14/15       10/2.99/45       14/4.80/50       19/2.20/15
REAL 2024             23/2.78/16       17/5.12/45       14/5.16/53       31/2.86/14
REAL 2023             39/4.62/17       10/3.24/46       21/7.09/51       31/2.78/13

SIM adp      (n=40)   17/2.85/23       11/3.34/45        9/3.44/56       21/3.00/20
SIM profiled (n=40)   27/3.30/17       11/3.67/49       10/3.79/56       26/2.97/17
SIM reachy   (n=40)   21/3.65/23       13/3.95/45       10/3.74/56       23/2.99/19
SIM qb_early (n=40)   12/3.47/45       13/3.61/39       10/3.24/49       26/3.10/15
SIM rb_run   (n=40)   22/2.79/16        8/4.03/72       11/3.59/47       27/2.93/14
```

**Two controls, and both changed a conclusion:**

- **Keepers removed.** Pre-assigned picks are not room behaviour. The TE verdict
  — every room "WILD" — **flips to "in" without them**, so it is an artifact of
  the keeper layout and is not reported as a finding. QB flips for two rooms.
  **The WR verdict survives both ranges.**
- **Counts printed.** A ratio is only scale-free if the counts match. For WR they
  do (real 50–53, sim 47–56), so the WR result is not a count artifact.

### THE ONE ROBUST RESULT — AND IT IS UNANIMOUS

> **Every synthetic room is FLAT on wide receiver.** Real drafts leave receivers
> sitting **4.70–7.09×** the mean gap. Not one of the five rooms exceeds **3.79**.
> This survives keeper removal and is not a count artifact.

**Real rooms clump on receivers far harder than any model we have.** That is not
an adp-vs-profiled distinction — it is shared by all five, so it is a property of
how every room we build drafts, and no mixture of them fixes it.

### AND A SEPARATE FAILURE THE RATIO CANNOT SEE

**The ADP room over-drafts the onesies.** It takes a median of **23 quarterbacks
where real drafts took 15–17**, and **20 tight ends where real drafts took
13–15** — roughly 40% and 33% too many.

**This bears directly on the 22nd.** The onesie cap, the QB3→QB2 / TE3→TE2 shape
result, and the elite-fall-through exception were all measured in a room that
takes half again as many quarterbacks as this league actually does. That room
makes QB and TE look scarcer than they are, which is the direction that flatters
a cap. **Not a refutation — the cap's exception was validated separately on a
constructed elite-faller case — but the shape numbers are measured against a room
we now know is mis-calibrated on exactly the two positions the cap governs.**

---

## 4. THE LIMIT UNDER ALL OF IT: HALF THE DRAFT IS INVISIBLE TO THE METRIC

The modal pick shape — collected by this harness since it was written and
**never printed until today (rule 14, in my own tool)** — showed
`greedy_end_state` ending its draft with a wall of quarterbacks, and
`lookahead_2` taking nine of them.

That is not a strategy. It is a **tie-break**. The objective is starting-lineup
points with the bench worth zero, so once the six open starting slots are filled,
**every remaining pick scores exactly zero** and each arm falls through to
whatever it breaks ties on. Greedy breaks ties on highest raw projection, and
quarterbacks have the highest season totals.

**Measured and now printed every run: ~48% of each arm's twelve picks move the
objective by nothing at all.**

> **Every margin in `composite_shape_2026-08-12.md` is decided by about six picks
> and is silent about the other six.** A metric that cannot tell a six-quarterback
> bench from a good one is not a metric that should adjudicate roster
> construction on its own.

---

## WHAT I WOULD DO WITH THIS

1. **Do not rewrite the composite** — unchanged, and now better supported. The
   shipped composite is the best arm in the tail-bearing room, and the rewrite's
   advantage reverses with the room model.
2. **Do not build the ADP/profiled mixture I proposed this morning.** Its
   motivating measurement was circular and its two endpoints are both flat on the
   one position where the real drafts disagree with every model.
3. **Fix the receiver clumping instead** — it is the single calibration failure
   that is unanimous, survives its controls, and is measured against real drafts
   rather than against another model. **Post-draft.**
4. **Before the 22nd, treat the QB/TE simulation results as measured in a room
   that over-drafts both.** No change to the shipped cap is proposed here; the
   caveat is recorded so the numbers are not quoted without it.
5. **Give the harness a second objective that can see the bench**, or stop
   reading its margins as roster-construction verdicts. Post-draft.

---

## LIMITS, STATED BEFORE THEY ARE ASKED FOR

- **Three real drafts is the entire sample.** The "real range" is a range over
  n=3: a room landing inside it has cleared a low bar; a room landing outside it
  has failed a wide one. **OUTSIDE is informative here, INSIDE is weak.** The WR
  result is an OUTSIDE result, unanimously, which is why it is the one I trust.
- **Positions are assumed stable across seasons** to resolve historical ids
  against the current board. 2.2% of picks do not resolve and are counted.
- **The profiled room remains an overshoot** on its own terms. It is not "the
  real room"; it is a differently wrong one, and the sign flip in §1 says the arm
  comparison is room-sensitive — **it does not say which room is right.**
- **Silence rule (15) holds throughout.** Simulation and history only. Nothing
  here renders and nothing is visible during a live decision.
