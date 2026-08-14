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
weights — `value + keeper + stack` under the shipped weights (`MEASURED_WEIGHTS`,
`app.js:52`) — **plus two adjustments applied AFTER that sum, which are not in the
weight vector at all.**

**THE "AND NOTHING ELSE" IN THIS LINE WAS FALSE UNTIL 2026-08-14, AND IT IS THE
THIRD INSTANCE OF THE CLASS THIS DOCUMENT EXISTS TO CATCH — found in the document
itself.** `onesie` (a duplicate-position discount that buries a second QB/TE once
the slot is full) and `doctrine` (the plan tilt) are applied post-assembly and
published as deltas in `components.weighted`. Measured share of what separates the
top five candidates, over Cory's twelve picks, with his real keepers and the
roster accumulating as the model picks:

| term | share of movement |
|---|---|
| `value` (VONA) | **59.3%** |
| `keeper` | 16.1% |
| **`onesie`** | **13.9%** |
| `stack` | 10.6% |

**`onesie` is the third-largest driver of the recommendation and a reader of the
old sentence would not have known it exists.**

**⚠ AND THE MEASUREMENT ONLY WORKS WITH A ROSTER.** Run on the empty-roster
harness the suites used, the same decomposition returns `value 77.9% / keeper
22.1%` with **`stack` and `onesie` at exactly 0.0%** — both score a relationship
to players already held, so with nobody held they are structurally zero. Two of
the four terms vanish and VONA's share inflates by 19 points. **A term reading
0.0% on an empty roster is unmeasured, not inert**, and that distinction is the
same one this document draws about `ceiling`.

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
projection points. **59% of what moves the composite** — the largest single term
by a factor of three, re-measured today over the top five at each of his twelve
picks with the roster accumulating from his real keepers.

> This figure read **62%** and was carried in prose with no computation behind it
> anywhere in the repo. Re-derived, it is 59.3% — so the number was approximately
> right, and it is recorded here because *checking it was worth it anyway*: the
> same run is what surfaced `onesie` as a 13.9% driver missing from §1 entirely.
> An unreproducible number that happens to be correct is still unreproducible.

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

---

## Two more, audited 2026-08-14

### 5. The legality strip

**IS:** which starting slots your roster fills, and — for slots that are *not*
streamable — whether the picks remaining can still fill them.

**IS NOT:** a statement about your week-1 lineup. **The draft is not the lineup
deadline.** The draft is 22 August and week 1 is mid-September, so an empty DEF
or K at the final pick is filled off the wire in between; `exitSummary` already
emits that as the plan ("claim Tuesday; wire targets pre-loaded"). This is why an
open onesie **never** reads ILLEGAL however few picks remain, and that rule is
correct rather than merely preferred.

**IT IS NOT FREE, THOUGH, AND THE STRIP DOES NOT SAY SO.** The roster is 15
(9 starters + 6 bench), so claiming two onesies into a full roster costs two
drops. `priceOnesie` prices exactly that — "the bench slot is the real cost" —
but the strip does not surface it.

**WHAT WAS ACTUALLY BROKEN:** the hard branch of the line appended `· N picks
left`; **the streamable branch appended nothing.** So DEF/K open produced the
identical sentence at twelve picks left and at zero. On Cory's real board that
same text appeared at picks 88, 93, 108, 113, 128 and 133 while the count ran 7
down to 2. The clock is now on both branches, and `softCount` / `onesieSqueeze`
are published so a consumer can tell the endgame from the middle without
recomputing it. **The status enum is untouched** — four `PROTECTED` assertions in
`legality.test.js` now stop a future reader "fixing" the rule on the same wrong
intuition I had.

### 6. The dollar-gap hero line (the compare tray)

**IS:** two players priced against each other in the same rough dollars as §3,
plus a **next-pick echo** — what taking A costs you at B's position by your next
turn, minus the symmetric cost.

**IS NOT:** a decomposition into independent reasons. **`entry` and `rs` are one
signal, and the always-visible bar chart plotted them as two bars until today.**
Measured over 40 real pairs on the live board: `entry_diff / rs_diff` deviates
from exactly 1.6 by **1.7e-14**, and the two bars point the same direction in
**39 of 39** cases. They are arithmetically incapable of disagreeing, so a reader
seeing `high-pool +16.7 · top-4 entry +8.7 · RS +5.4` counted three agreeing
reasons where there are two.

**THIS IS THE SAME DEFECT AS §3 AND I HAD ALREADY FIXED HALF OF IT.** The
`<details>` body was rewritten to one season line; the chart ten lines above it
was not. **The half I fixed is the half you have to click.** Now one `season`
bar carrying the sum, with the fixed split named.

### 7. The LRM strip ("last responsible moment")

**IS:** for each onesie position, the latest of *my own* future picks at which
somebody in the pool still survives with probability ≥ **0.85**. For QB and TE it
runs twice — once over a 12-deep startable pool, once over the top tier — and
shows both lines when they diverge.

**IS NOT:** a promise. "Safe until pick 73" means *85% safe*: roughly one time in
seven the man is gone. The word "safe" is doing more work than the threshold
supports, and that is unresolved rather than fixed.

**WHAT WAS BROKEN:** it passed `state.runMults` — a bare multiplier map — where
`survival()` expects a context. The multipliers applied (that shape is accepted
deliberately), but with no `currentPick` the call took the **unconditional**
branch while every other survival reader on the page conditions on *"given he is
available now"*. One player, two survival numbers, one screen.

**THE ERROR HAD ONE SIGN.** Conditioning can only *raise* survival, so the strip
could only ever say the window closes sooner than it does. Measured: the 12-deep
pool absorbs it (**0 of 12** deadlines move), the 3-man elite pool does not
(**2 of 12**, both later) — including **"elite tier gone" for TE at pick 88 when
the conditioned answer is safe until 93.**

**NOT CHANGED:** the 0.85 threshold, and Layer 2 (opponent needs) stays off for
this strip — that is a larger behavioural change with no measurement behind it.

### 8. The stack card and the ⚡ badge

**IS:** live QB↔pass-catcher pairings on the board, each priced by the **same
`correlationAdjustment` the composite scores** — as of today, one derivation.

**IS NOT:** an installed edge. It carries its class from the evidence table
(`weak` → "LEAN, not installed"), and it was lead-driver on **5 of 221**
interventions. That label is derived, not typed: flip the table and the card
follows.

**WHAT WAS BROKEN:** the badge scored routes off the pairing bonus alone and
skipped the same-team competition penalty, on the reasoning that competition is
"a penalty, not a route to complete" — true of whether a route *exists*, false of
what it is *worth*. With Chase, a real keeper, on the roster:

| roster | badge | composite `stack` |
|---|---|---|
| Chase + Burrow, 2nd CIN receiver | ⚡ | **+2** |
| + Higgins, 3rd CIN catcher | ⚡ | **−4** |
| + Gesicki, 4th | ⚡ | **−6** |

So the card said *"extends Burrow stack"* on picks the model was docking, along
the exact path it recommends. The route value is now the composite's number and a
non-positive route is not offered.

**⚠ `stack` IS NOT ONLY STACKING.** `correlationAdjustment` carries three effects:
the pairing bonus, the same-team competition penalty, and **a playoff-schedule
bump from round 6** worth up to ±4 × sos — which nobody would guess from the term
name, and which the §1 table counts inside `stack`'s 10.6%. It has **never
fired**: `playoff_sos` is null on all 686 board rows. Asserted, so the day that
field lands the suite goes red instead of the behaviour appearing in a pick.

### 9. The movement line

**IS:** a diff between two snapshots of the top of the board, taken at two
different picks. Either the top changed ("Shifted to X"), or it held while the
runner-up closed to within 3.0 points having shrunk the gap by at least 0.5.

**IS NOT:** a causal explanation, and **it read as one.** Three defects, one root
— the "why" was passed in as an opaque pre-formatted string:

1. **Grammar, in production only.** The app sent `"WR run on"`; the almost branch
   wrapped it as `' on the ' + reason`, so the live line read *"closed to within
   1.5 pts **on the WR run on** — didn't pass."* The suite never saw it because
   the suite passed `"WR run"` — **a different format from the one production
   uses.** Two call sites owning half a sentence each.
2. **False causality.** The reason named *every* running position, joined by an
   em-dash, which is causal in English: *"Shifted to Colston Loveland — RB run
   on."* attributes a TE rising to an RB run it has nothing to do with. The app's
   own comment said "factual co-occurrence, not a causal claim" — true of the
   code, false of the sentence.
3. **Unknown top read as same top.** The moved branch required both ids non-null,
   so a null id **fell through** and narrated a runner-up gap while the top had
   actually changed.

**NOW:** the caller passes `runs` (positions) and the snapshot carries positions,
so phrasing lives in one place. A run **at the position that moved** earns the
causal em-dash; a run elsewhere is an aside (*"Shifted to Loveland. RB run also
on."*). Identity falls back to names when an id is missing, and says **nothing**
when it is genuinely unknowable.

### 10. The shadow projection ("N of 7 → X")

**IS:** seven alternative weight vectors run over the same board, each reporting
the player it would take. `contested` fires when the leader is under a 75%
supermajority.

**IS NOT — and this is the sharpest finding of the audit — SEVEN INDEPENDENT
VOTES.** Measured at **pick 33, Cory's first pick**, all on one screen:

| surface | says |
|---|---|
| rec list #1 | **Colston Loveland** (TE), 17.3 |
| shadow strip | **"7 of 7 → Zay Flowers"**, no contested flag |
| Flowers's actual rank in that rec list | **4th** |

All seven shadows were driven by `need`, at driver values **42.7 / 21.3 / 42.7 /
85.4 / 42.7 / 64.0 / 42.7** — one `need` computation times each strategy's `need`
weight. **Seven "independent strategies" are seven multiples of one number**, and
`need` is weighted **0** on the board he drafts from. Same shape as `entry`/`RS`
in §3: indicators that *cannot* disagree, presented as confirmations.

"7 of 7" is the strongest agreement this surface can express. Unqualified, it
read as the safest pick on the screen while pointing at the tool's fourth choice.

**THE MODEL ALREADY KNEW.** `consensus()` has always returned `lead_driver`,
`driver_is_artifact` ("a 7/7 driven by `need` is the artifact flag"), `runner_up`
and `gap_to_second` — and **all four were read by nothing.** The panel now renders
them, the artifact flag is generalised to *any* zero-weighted driver (five of the
eight qualify, `need` was never special), and each strategy row shows its own
driver. **No shadow, weight or pick changed** — they are meant to differ from
production. Only the sentence did.

**`contested` does not catch this**, by construction: it measures name-split, and
this failure is unanimous. That is why it is a separate signal rather than a
widening of that flag.

### 11. The manager panel and the reach tell

**IS:** per-opponent tendencies from **three** prior drafts, ~40 picks each,
shrunk toward the league mean (`shrinkage_weight` 0.6).

**IS NOT:** a magnitude you can act on, and it was **stated as one.** *"Reaches
~7 picks early… 1.4 rounds before the league"* — from three drafts, with
`reach_delta.sd` of **134.2** sitting in the same object. Over 40 picks that is a
standard error of ~21: **~7 is not distinguishable from zero.**

| manager | mean | sd | mean/SE | tell says |
|---|---|---|---|---|
| ds7mmet | +7.3 | 134.2 | **0.34** | *reaches* |
| Richard2121 | +12.9 | 141.2 | **0.58** | *reaches* |
| MarianSaar | −7.0 | 20.7 | **−2.10** | near market |
| B8T3S | −5.9 | 18.3 | **−2.05** | near market |

**Only two of ten exceed two standard errors, and neither is one the tell calls a
reacher.** One or two huge outliers drag the mean past the threshold, so on this
board the "reaches early" flag is **anti-correlated with the evidence for
reaching.** It also contradicts this document's own standard in §2 — *"three
drafts give a direction, not a magnitude"* — quoted here to one decimal place.

**⚠ THIS IS NOT DISPLAY-ONLY.** `reach_delta.mean` feeds `withinPrecision` in
`survival.js`, shaping the opponent softmax → Layer 2 survival → VONA → 59% of
the composite. The two least-supported estimates get the largest adjustment
(`−0.02 × mean`).

**NOTHING WAS RE-FITTED.** The tell still fires, with the same text and weight,
and `withinPrecision` is untouched. Several corrections are defensible — shrink
by *t*, gate on SE, use a robust centre — and **none is measured**; fitting one
eight days out would move survival on a suspicion. What changed is that the tell
and the panel now publish `se`, `support_t` and `well_supported`, so a reader can
discount it and a future experiment has the quantity to test.

---

## What I have NOT audited yet

**The eleven surfaces that decide or time a pick are now covered.** What remains
is the long tail: roughly a dozen panels that carry a number without driving a
pick — the queue, the bye grid, the picks feed, the accounting note, the
checklist, the threat strip, and the rest. Named so this document cannot read as
a completed sweep of *everything*; it is a completed sweep of **what moves a
pick**, which is what the audit was for.
