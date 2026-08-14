# What each war-room number actually is

**TERRITORY: A.** Cory, twice: *"Before draft we also need to make 100% sure what
B is showing me on war room matches what model actually says and explains what
model is actually showing. **This could ruin whole draft.**"*

I said I would go first. This is my half: for each number that drives a pick,
**the exact quantity, what it excludes, and the sentence a reader could wrongly
take away.** B's half is what the pixels say. Where the two differ we have a
defect — regardless of whether the code is correct.

**Every claim here is asserted in `draft/tests/surface_contract.test.js` against
the live code**, so this document cannot drift into describing a model we no
longer run. That matters more than usual: two of the three defects found so far
were *documents and labels that had stopped being true.*

---

## Why this is not hypothetical

Three findings so far, all the same shape — **every number correct, correctly
computed, correctly rendered, and the sentence false.**

| surface | what it showed | what was true |
|---|---|---|
| doctrine banner | *"The plan — Early-QB Strike **+$353 season edge**"*, tilting live picks | the race that enrolled it had a control that fielded **no quarterback in 198 of 200 rooms** |
| doctrine picker | Late-QB Patience **last of nine**, −$21 | it ranks how *permissive* a plan is; 8 of 9 tied and the 9th was simply banned from the board leader |
| Why? panel | `high $X · entry $Y · RS $Z` | `entry` and `RS` are the same number scaled — ratio **exactly 1.600** for every player, forever |

None of those would be caught by a rendering audit or by a code review. They are
only visible by asking: **what sentence does a human read off this, and is that
sentence true?**

---

## The four that decide a pick

### 1. The score column on a rec row

**IS:** a weighted sum, in projection points, of the terms the tool currently
weights. Under the shipped weights (`MEASURED_WEIGHTS`, set at `app.js:52`) that
is **`value + keeper + stack`** and nothing else.

**IS NOT:** a dollar figure, a probability, or a season projection. It is not
comparable to the `$` numbers anywhere else on the screen.

**FIVE OF THE EIGHT TERMS ARE ZERO IN PRODUCTION** — `tier`, `need`, `risk`,
`ceiling`, `bye`. That is deliberate and it is the honest reading of the
measurement, not an oversight:

- `tier`, `need`, `bye` — **measured inert.** They were tested and moved nothing.
- `risk`, `ceiling` — **UNMEASURED.** `ceiling` came out at **−4.8 with a
  [−26, +17] interval**: unsignable. Weighting a term that measurement cannot
  sign is how a model starts drifting on noise.

**THE MISREAD TO WATCH:** a component breakdown listing eight terms invites "the
model considered all of these". It considered three. The engine already
multiplies each component by its weight before reporting it, so a zero-weight
term reports 0 rather than a number — **that is correct and must stay correct.**

### 2. VONA

**IS:** `proj_mean(p) − E[best available at p's position at MY next pick]`, in
projection points. **62% of what moves the composite.**

**IS NOT:** value over a *starter*, or over replacement. It is value over the
next player at that position I could realistically get instead — which is why it
is as meaningful for a bench pick as for a starter.

**THE KNOWN WEAKNESS, and it is live:** the expectation runs off `survival()`,
which reads **market ADP**. Our room takes quarterbacks **earlier than market at
every slot, 18 of 18 observations**. So VONA under-states the cost of waiting on
a QB, at the one position where this league differs most from the market. No
correction is fitted — three drafts give a direction, not a magnitude.

**As of today the draft grades this itself:** survival calls are resolved within
picks, scored by Brier against a base-rate forecaster.

### 3. The dollar figures

**IS:** `0.22 × (ceiling − mean) + 0.08 × mean + 0.05 × mean`. A **linear
rescaling of the projection**, with coefficients the code itself calls "ROUGH
placeholders… calibrated only for RELATIVE comparison".

**IS NOT:** a simulation of the pot, and not calibrated in absolute terms. "$74.8"
does not mean he is worth seventy-four dollars.

**ONLY TWO OF THE THREE TERMS CARRY INFORMATION.** `entry` and `rs` are both a
constant times the projection — one signal, shown twice, until today. Only the
boom term (ceiling over mean) is independent.

### 4. The paths panel

**IS:** up to four *directions* — one per position — each priced by what taking
that direction costs by the time I pick again.

**IS NOT:** a ranking of players, and **not a list of distinct arguments**. Until
today a position could appear twice ("RB for the cliff" and "RB for value"), and
at pick 33 the panel offered **TE / RB / RB** — TE Loveland, RB Swift, RB Etienne:
one option shown twice on a panel whose job is distinct options. Now one row per
position.

> **Corrected 2026-08-14.** This line first read **WR / RB / RB**. That trio came
> from `paths_offer_options.test.js`, which scored every context with
> `(D.defaults && D.defaults.weights) || undefined` — and `D.defaults` has never
> been a key on the artifact, so the whole file ran under `DEFAULT_WEIGHTS` while
> the app runs `MEASURED_WEIGHTS`. Under the app's real weights the top
> recommendation differs at **7 of Cory's 12 picks**, and — the part that matters
> here — the position-repeat defect occurs at **no pick at all** under
> `DEFAULT_WEIGHTS`. The bug is real and the board I quoted it from was the one
> board on which it is invisible. The suites now refuse rather than fall back.

**AT THE LAST PICK it correctly offers ONE direction** — there is no next pick,
so the look-ahead the panel is built on does not exist.

---

## Upside and keepers — what Cory asked for, and where it actually lives

*"Find the right times (when value is close) to draft upside and potential
keepers."*

- **Keepers ARE priced in the composite** — `keeper` weight 1.0, measured.
- **Upside is NOT priced in the composite** — `ceiling` weight 0, because the
  measurement could not sign it.
- **Upside acts as a TIEBREAK, which is precisely the ask**: same position, same
  tier, within 2 points, higher ceiling gets promoted. That is "when value is
  close, take the upside", implemented exactly as stated.

**The tiebreak is the one place the list is deliberately not in score order**, and
a reader who cannot tell a deliberate promotion from a broken sort stops trusting
the score column. Each promoted row carries `ceiling_tiebreak` naming the man it
passed. **Rendering that is B's, and it is routed.**

---

## What I have NOT audited yet

The dollar-gap hero line, the legality strip, the LRM strip, the stack card, the
movement line, the shadow projection, and the manager panel. Named so this
document cannot read as a completed sweep. Roughly 20 more surfaces carry a
number; four are covered here because those four decide a pick.
