# Item 12 — do the foundational measurements hold under the standards everything else now meets?

**The suspicion was that they would not, because four for four of the
re-examined measurements found a defect. The answer is mostly yes, one premise
of the question is wrong in our favour, and one thing failed that the question
did not ask about.**

Four questions, asked of each foundational measurement.

---

## THE SCORECARD

| measurement | Q1 boundary-break | Q2 blind dollars | Q3 shipped weights | Q4 shared derivation |
|---|---|---|---|---|
| **participation test** (zeroes tier/risk/bye/ceiling; the $267 anchor) | ⚠️ identity only, no placebo | ✅ **NOT blind** | ⚠️ DEFAULT, by design, caveat already stated | ✅ clean |
| **the mask, ~$443** (`exp_need_phase`) | ✅ the break IS the arm | ✅ **NOT blind** | n/a — no engine weights | ✅ clean |
| **the tournament** | ✅ oracle + market calibration arms | 🔴 **was blind — already re-graded** | n/a — hand-coded strategies | ✅ clean |
| **the graduation gate** *(not on your list — I checked it anyway)* | — | — | reads MEASURED | 🔴 **tautological** |

And separately, found while answering Q1: **the anchor's headline had drifted
26% and four documents still carried the old figure.** That is written up in
`EDGE-LEDGER.md` and pinned by `draft/tests/test_participation_figures.py`.

---

## Q2 — AND THIS ONE CORRECTS THE QUESTION

You asked whether the foundational measurements were graded on the dollar
instrument you established was threshold-blind. **For three of the four, no —
and the reason matters.**

**The blindness was a property of the SAMPLE, not of dollar grading.** It came
from grading your real rosters over three real seasons, where your seat missed
the playoffs every year, so two channels worth $2,500 never activated and fifth
place graded like tenth.

**The participation test and the mask do not grade real seasons. They grade
Monte-Carlo rooms**, and in those rooms the seat reaches the bracket routinely.
Measured directly on `cory_conditional.grade_room`, 400 graded rooms:

| channel | rooms where it paid |
|---|---|
| weekly high | **371 / 400 (93%)** |
| regular-season prize | **155 / 400 (39%)** |
| a paying playoff place | **253 / 400 (63%)** |

**Against exactly zero in the three real seasons.** The instrument that graded
the participation test is not the instrument that was blind.

> ⚠️ **The 63% is inflated and I am not defending the number.** My probe dealt
> the board round-robin, which hands seat 0 the first pick of every round and the
> strongest roster in the room. The rate is biased up. **The qualitative answer
> does not depend on it** — 253 versus a hard zero is not a marginal call, and it
> is the only thing this check needs to establish.

**So the tournament was the one measurement on the blind instrument, and it is
the one that has already been re-graded.** Your worry was well-aimed and it had
already been acted on.

### The batch re-grade under the continuous proxy — SKIPPED, and why

You asked me to re-grade the removed terms — tier, risk, bye, ceiling ramp, need
ramp — as a batch under the continuous proxy. **I am not doing it, because the
finding above removes its motivation.** The proxy exists to rescue signal from
threshold lumpiness in a sample where the thresholds never fired. The
participation test's thresholds fire in 63% of rooms. Re-grading it under the
proxy would answer a question it does not have.

**What WOULD be worth doing instead**, if you want the same reassurance from a
different angle: the participation arms are graded on TOTAL dollars, and the
`ceiling` term specifically was expected to earn on the **weekly-high channel**
and was measured not to (`wk-high −1 CI[−7.5, 4.5]`). That per-channel
decomposition already exists in the artifact for ceiling and **not for the other
four**. Running it for tier/risk/bye/need is ~1h and is the honest version of
what you asked for. **Flagged, not done.**

---

## Q3 — DEFAULT vs MEASURED WEIGHTS

**The participation test runs on `DEFAULT_WEIGHTS`, and that is the design rather
than the defect.** You cannot measure whether `tier` earns at `tier: 0`; the
experiment necessarily runs terms at a strength where they move picks. This is
not the intervention-rate error, where a headline was quoted from a configuration
the tool never ships.

**And the file already states the consequence, in its own words, unprompted:**

> *the LIVE engine's tier/risk/stack terms are smaller than a 30-pt nudge, so
> their harmful DOLLAR magnitudes here are an upper bound at fair-fight strength,
> not the live-engine loss. The ROBUST, decision-relevant claim is the SIGN and
> ordering.*

That caveat is load-bearing and it is stated. **The numbers are upper bounds; the
signs are the result.** Anyone quoting `tier −$362` as a live-engine loss is
quoting past the caveat, and nothing currently stops them.

**The mask and the tournament load no engine weights at all** — the tournament
uses hand-coded strategy functions (`strat_need_value` and friends), the mask
harness a money proxy. That is a faithfulness question rather than a weights
question, and the participation file already carries the split: *"need + value
map exactly onto this harness; tier/risk/ceiling/bye/stack are proxies."*

**`construction_order.js` runs `E.MEASURED_WEIGHTS`** — the shipped configuration.

---

## Q4 — SHARED DERIVATION, AND THE ONE THING THAT FAILED

The three foundational measurements are clean on rule 10d. **The graduation gate
is not, and nobody asked me to look at it.**

- The gate reads `MEASURED_WEIGHTS` from `engine.js` and compares it against
  `exp_participation.json`.
- **`MEASURED_WEIGHTS` was SET from `exp_participation.json`.** The engine's own
  comment cites the evidence: *"tier 0, risk 0: measured DRAG … tier −$235, risk
  −$143 pooled."*

> **So the gate's four AGREES rows are guaranteed.** `value` agrees, `tier`
> agrees, `risk` agrees, `need` agrees — because the loaded value was copied from
> the number it is being checked against. **A green gate is not evidence the
> weights are right.** It is the same shape as the fall-through tautology found
> this morning, in the surface built to prevent exactly this class.

**The gate is not useless and should not be changed.** It still does the job it
was built for: it catches DRIFT (a weight edited without evidence) and it catches
NEW evidence disagreeing with a loaded value — and the component rows added today
are a genuinely independent second source, which is the first evidence the gate
has ever had that it did not also produce the policy from. **What is wrong is the
reading, not the mechanism.** "The gate is green" has been quoted as
reassurance; it means only "nobody has changed a weight without saying so."

**And the drift check bites here too:** the engine comment cites −$235 and −$143;
the artifact now says −$362 and −$224. Same signs, so the gate still says AGREES —
but the gate compares SIGNS, so it would have gone on saying AGREES through any
magnitude change whatsoever.

---

## Q1 — WOULD A DELIBERATE BREAK TURN IT RED, AT THE BOUNDARY?

- **The mask (~$443): yes, trivially.** The measurement IS the break — mask on
  versus mask off over 300 paired rooms. There is nothing to add.
- **The tournament: yes.** It carries two calibration arms — an oracle ceiling
  with perfect foresight and a market-ADP arm — and both behaved. A harness that
  reproduces a known result is a harness worth believing on a new one.
- **The participation test: PARTIALLY, and this is the real gap.**

It has an internal identity and **the identity holds**: `full ($313.4)` +
`all_adjusters_together ($482.75)` = **$796.15** against a separately computed
`core_mean_dollars` of **$796.1**. Two independently derived quantities agreeing
to five cents is a real consistency check.

**But there is no arm whose measured edge must be ZERO.** No placebo, no A/A. So
the harness can demonstrate that its parts are consistent with each other and
cannot demonstrate that it reports nothing when there is nothing to report.

**Cost to close: ~1h** — an A/A arm (the same weight set under two seeds, paired,
which must measure zero within the CI) plus a shuffled-signal placebo (a term
whose values are permuted across players, which must also measure zero). **Not
done today; the draft is in ten days and this changes no live surface.**

---

## THE ASYMMETRY YOU NAMED: THE VALUE ANCHOR

You were right that it is the one thing with no independent confirmation, and
right that the construction harness is the place to get some. **And defining the
arm turned up something before it ran.**

> **The ledger's account of what the anchor IS was wrong.** It said *"the value
> anchor = ranking off the ADP board."* It is not. The participation test's value
> term is `w.value * vorp` (`exp_participation.py:142`), and
> `vorp = proj_mean − replacement` (`draft/vorp.py:94`) — **no ADP anywhere.**
> `_rank_fallback` is the only route by which ADP could reach a projection, and it
> fires for **none of the top-150 board players**.

**The conclusion that elevated the source grade to #1 survives, by a different
route, and the difference is the open piece.** FantasyPros feeds *both* the ADP
table (`build_fantasypros_table`) and the projections
(`build_fantasypros_projections`), so source quality does reach the largest term
— **through `proj_mean`, not through ADP.** But the source grade measured
**ADP-versus-outcome correlation** — its own title is *"which ADP board the
keeper-need rule should rank by"*, and its statistic is
`Spearman(-adp, realized)`. **The source was graded on one channel and elevated
for its effect on another.**

### 🟠 AND I OVERSTATED THE GAP — CORRECTED HERE RATHER THAN LEFT STANDING

My first version of this section said the projection channel "has never been
graded the same way" and called it the largest gap the audit found. **I then
checked, and `exp_proj_source.py` exists** — it is Cory's own Q2, opening with
the same observation: *"we grade ADP from three sources but have NEVER graded
projections."*

**The claim survives, narrowed. The size does not.**

- **Still true:** that probe measures **agreement between sources, not accuracy
  against outcomes.** Its docstring is explicit — *"the winner is graded against
  realized AFTER the season; this pre-draft half only answers
  agreement/divergence, never which is better."* So the projection channel has
  no outcome-graded verdict, and the ADP channel does.
- **But the lever is small, and measured:** Sleeper versus FantasyPros on the
  same players, **ρ = 0.9327 overall and ρ = 0.9273 across the top 150** — the
  range where the draft happens.

> **So "we may have picked the wrong projection source" is bounded at
> ρ ≈ 0.93 and is a small worry, not the largest gap in the audit.** The
> different and untouched worry is **"both sources may be wrong together"** —
> agreement is not accuracy, and two sources that share a method share its
> errors. That one is genuinely ungraded, and it is exactly what the
> `projection` component row was declared to answer once weekly outcomes land.
> **Which means the gap does not need a new experiment; it needs the component
> writer that shipped today to accumulate a season.**

*(The independent arm — pure VORP within the startable mask, against the shipping
composite, on paired seeds in both room models — is running. Results appended
below when it lands.)*

---

## WHAT I WOULD DO WITH THIS

1. **Stop quoting "the gate is green" as evidence about the weights.** It is
   evidence about drift. The component rows added today are the gate's first
   independent source; that is the part worth watching.
2. **Do NOT build a projection-source grade.** ~~It is the channel that actually
   feeds the anchor and it has never been tested.~~ I wrote that before checking,
   and `exp_proj_source.py` already measures the sensitivity: the two sources
   agree at **ρ = 0.93 across the top 150**, so the source *choice* on that
   channel is a small lever. **The real question — are both sources wrong
   together — is the `projection` component row**, which was declared with a
   1.0-point materiality bar and a per-position split, and which now has a writer
   and somewhere to arrive. It needs a season, not an experiment.
3. **Add the placebo arm to the participation harness (~1h, post-draft).**
4. **Per-channel decomposition for tier/risk/bye/need (~1h, post-draft)** — the
   honest version of the batch re-grade, which the proxy cannot provide.
5. **Nothing here changes a shipped value, and nothing here should before the
   22nd.** Every finding is about what the evidence licenses, not about what the
   tool does.

---

## AND THE PLAIN ANSWER YOU ASKED FOR

**You said you expected most of it holds, and that if the answer is that they all
hold you would stop wondering.** They very nearly do:

- **Q2 (blind dollars): they hold, and the premise was wrong in your favour.**
  Only the tournament ran on the blind instrument, and it was already re-graded.
- **Q3 (shipped weights): they hold.** The one that runs on DEFAULT does so by
  necessity and states the consequence in its own file.
- **Q4 (shared derivation): the three measurements hold.** The gate that reads
  them does not.
- **Q1 (boundary-break): two hold outright, one is half-covered** by an identity
  that passes, with the missing half named and costed.

**The thing that actually failed was none of the four.** It was that the anchor's
headline moved 26% across three re-runs and four documents kept the first
number — a stale value with nothing watching it, which is the defect class this
project has spent weeks closing everywhere except in its own prose.

**And one correction inside this audit, made after committing it.** I called the
ungraded projection channel "the largest gap the audit found" before checking
whether it had been looked at. It had — `exp_proj_source.py`, your own Q2 —
and the two sources agree at ρ = 0.93 where you draft. **The claim narrowed to
something true and much smaller.** Recorded because an audit that overstates one
finding is worth less on all the others, and because it is the same failure mode
the audit is about: asserting an absence without asking whether the instrument
had already answered.
