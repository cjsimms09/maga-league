# THE ANCHOR DOCTRINE — consensus is the prior; deviation must be paid for

Filed 2026-08-08 (Cory), complete text. An architectural principle for how
recommendations relate to the market, not a tweak to a slider.

> **Consensus ADP is the PRIOR. Every deviation from it must be paid for with
> evidence, and deviation size scales with evidence strength.**

> ## ⚠️ AMENDMENT (2026-08-09) — exp 36 INVERTED this doctrine's central shape
>
> This doctrine was written on a designed premise: **the market is efficient EARLY**
> (thousands of drafters agreeing on the first thirty picks) **and loose LATE**,
> therefore the anchor should **bind hard early and relax late**. **Experiment 36
> measured it over 255 board picks and found the OPPOSITE.**
>
> - Early-round ADP is a **weak** ranker: R1-3 RB efficiency **0.12**, WR **0.26**.
> - The market orders value best in the **MIDDLE** (R4-7 QB **0.58**, TE **0.62**)
>   and in **late WR** (R12+ **0.72**); late RB/QB anti-correlate (shrink 0).
> - **Pooled, NO position clears 0.5** (WR 0.49, RB 0.45, QB 0.38, TE 0.28) — ADP is
>   a weak ranker overall. Context for exp 34's "our ordering beats the market": **we
>   beat a WEAK benchmark**, not an efficient one. Say that plainly; do not let the
>   comparison flatter us.
>
> **The practical inversion:** we are most free to deviate exactly where the doctrine
> told us to be most careful (early), and most obligated to respect the market in the
> middle and late rounds where it is genuinely informative. The "bind hard early,
> loosen late" premise is **STRUCK** — it was a designed assumption refuted by
> measurement. **Anchor strength varies by round AND position per the exp-36
> reliability surface, not by any monotonic rule.**
>
> **THE STAGE-2 LINK, recorded so no future session hand-sets it:** if Stage 2 (a
> real market anchor) is ever built, its per-region binding function comes FROM the
> exp-36 reliability surface (`draft/backtest/exp36.json`, each cell's `shrink`
> weight), NOT from a threshold anyone picks. That is the whole point of measuring it.
>
> **THE PATTERN, noted because it is telling us something.** This is the THIRD time a
> designed shape has been inverted by data: the **phase-ceiling ramp** (refuted,
> deleted), the **upsideBonus endgame** (refuted, flagged for a gated sweep), and now
> the **anchor's early/late premise**. Three designed priors, three inversions. The
> lesson is not about any one term — it is about **how little to trust our own
> shape-of-the-world intuitions relative to a measurement**, and to register every
> such prior as a hypothesis to be tested, never a fact to be encoded.
>
> **Actionable on the surface TODAY, without waiting for Stage 2:** the deviation
> explainer can already say whether we are deviating in a region the market ranks
> **weakly** (cheap to deviate) or **well** (respect it). "ADP is a poor ranker here"
> is a real thing to know at pick 34 and it is available now from exp 36 — wire it
> into the deviation card. (Filed for the draft surface.)

## 1. Restructure the composite as market-anchored

**Start from the consensus rank**, then apply our terms as **evidence-weighted
shifts**, each scaled by its own **measured** reliability:

| term | reliability comes from |
|---|---|
| projections | **experiment 33** — the projection source bake-off |
| market efficiency by round/position | **experiment 36** — the ADP-efficiency audit |
| tier model | its calibration |
| survival model | its Brier score |

A term with weak evidence moves the needle a little; a term with strong evidence
moves it a lot. Where the market is measurably efficient, deviations shrink
toward zero **automatically**; where it is measurably wrong, they widen. Nobody
hand-tunes the shrinkage — it is read off the audits.

## 2. Deviation budget, displayed

> `Judkins at 68 (ADP 82, +14): tier cliff [strong evidence] +9, ceiling
> [moderate] +3, need [weak] +2.`

Every recommendation shows how far it sits from consensus **and what bought the
distance**, with each term's **evidence strength labelled**. Big deviations
require big evidence and say so. The flip side rides along — *if you don't
believe the cliff, he's a reach.*

**Unexplained big deviations are treated as BUGS, not insights.**

Same feature as the **ADP-deviation explainer** from the mock-#1 three-fixes
batch — one build, one compact line by default, detail on tap, nothing rendered
inside noise, Zone-1 sparseness preserved.

### ⚠️ One correction to the mock-#1 claim, because it changes what to build

Cory: *"mock #1's TE loop would have failed this test instantly — a huge
deviation with no evidence behind it."* **It would not have, and the reason
matters.**

The TE loop was caused by the seat-identity bug: the need term was reading
another team's roster, which had no TE. So the deviation *did* have an
explanation, and a confident one — `need [strong] +N`. An
"unexplained-deviation" detector would have stayed silent.

What would have caught it is the **other half** of §2: the explanation is
rendered against a state Cory can check. Seeing `need [strong] +9 — TE1 empty`
while Loveland sat on his roster is a one-glance contradiction. So the display
catches wrong beliefs by **making model state legible**, not by thresholding
unexplained magnitude.

Both checks are worth having, and they catch different failures:
- **unexplained magnitude** → a term firing with no attributable cause (a real
  bug class, just not this one);
- **legible belief** → a term firing for a stated reason the human can falsify
  at a glance. **This is the one that catches wrong-state bugs**, and it is the
  higher-value half.

Build both; do not expect the first to do the second's job.

## 3. Be unafraid when the evidence is real

**No artificial cap on deviation size.** If the tier cliff plus the money
function plus a validated dossier read say a player is worth 20 picks of reach,
recommend it **loudly, with the case attached**.

> The doctrine constrains **WHY** we deviate, never **HOW FAR**.

## 4. Default-to-market fallback

When our terms are weak, uncertain, or disagree — near-ties, the deep pool,
positions where we lack signal — the recommendation **collapses to consensus
order and says so**: *"no edge here — market order, take your guy."*

**Silence is a valid output.** (This is the same instinct as the doctrine
banner's neutral state, which already says *"plan not binding here — every
doctrine takes the same player"*, and as the dollar-gap panel's `even_money`
verdict. The Anchor Doctrine generalises it.)

## 5. Continuous scanning feeds this

The Lab keeps hunting edges. **Any edge that clears its gates enters as a new
evidence-weighted term with its measured strength attached.** The doctrine is
the pipe connecting discovered edges to draft-day deviations **at the right
magnitude** — which is what has been missing: until now an edge either got
installed at a hand-chosen weight or sat parked.

## 6. Robot

- fixture with **all terms weak** asserts **market order**;
- fixture with **one strong term** asserts a **proportional deviation with its
  explanation**.

---

# CONSENSUS QUALITY UPGRADE

The doctrine makes consensus the prior, so **the prior's quality now sets the
floor on the whole system.**

## 1. Multi-source anchor
Add **Underdog ADP** (public, best-ball, ceiling-weighted — the closest crowd to
our high-pool economy) and the **Sleeper board** alongside FFC. Weighted
composite anchor, **weights set by measured predictive quality (exp 36 run per
source), never by assumption.** Archive all sources daily.

**Verified state (2026-08-08):**
- FFC ✅ live (`adp_source: 'ffc'`, 205 players matched).
- Sleeper board — `sleeper_rank` **is already emitted by `build.py`** but is
  **null in the current artifact**; it populates on the next CI rebuild with
  Sleeper egress. Half-wired already.
- Underdog — **not sourced; feasibility unverified.** Confirm a stable public
  endpoint before promising this arm.
- Daily archive — the nightly rebuild (`draft-data.yml`, 08:00 UTC) commits the
  artifact, so **git history is already an ADP time series** (18 snapshots
  today). Usable now; a dedicated archive artifact is better and should replace
  the reliance on `git log -p` before the series matters.

## 2. Dispersion as a first-class signal
Wide dispersion = contested opinion → our terms deserve **more room to move
him** (evidence is cheap where the crowd is confused). Tight = settled →
deviate only on strong evidence. Cards read `ADP 42 ±11 — contested` vs
`ADP 42 ±2 — settled`.

**This is already instrumented and is mostly a DISPLAY task — with one trap.**
`adp_sd` exists on all 1764 players. But:

| pool | n | median `adp_sd` | meaning |
|---|---|---|---|
| real FFC ADP | **205** | **9.5** | genuine crowd dispersion |
| fallback (`search_rank`) | **1559** | **30.0** | a placeholder, not a measurement |

Rendering `±30 — contested` for a deep-pool player would present a missing
measurement as a strong signal — the exact inversion of the doctrine. **The
dispersion badge renders only where ADP is real, and the fallback pool says
"no market read" instead.**

## 3. Format matching
Our league: **10-team, half-PPR, 6-pt pass TDs.** Verify whether FFC/Underdog
expose format-filtered ADP; use the closest match, else apply and **document** a
format adjustment.

**Load-bearing and cheap:** 6-pt pass TDs systematically underprice QBs in
4-pt-sourced ADP, and **this compounds with the late-QB verdict (−$212 on the
complete money function).** If our anchor carries a 4-pt QB price, the market we
are anchoring to is wrong about QBs in a direction we have already measured
independently. Worth checking before the multi-source work, not after.

## 4. Recency weighting
Weight recent drafts far above stale ones (**7–14 day half-life, tuned by which
weighting best predicts final ADP**). Camp news moves boards fast. The snapshot
series exists (see §1) — currently shallow (n=18), which bounds how well the
half-life can be tuned; say so with the tuned value.

## 5. Measure the anchor itself
**Extend experiment 36** to grade **each source and the composite** against
realized outcomes by round and position: which crowd is right where, and **is
the composite better than its best member** — it usually is, but prove it.

## 6. Surface
Cards show the composite anchor plus a **one-tap source breakdown where sources
disagree materially.** Cross-crowd disagreement is **intel, not noise to average
away.**

---

## 🚧 BUILD SPLIT — what is gated and what is not

**The reliability weights ARE the mechanism.** Without measured reliability,
"evidence-weighted shift" degrades into "shift by a number I chose" — a fitted
parameter wearing a principle's clothing, which is what the install discipline
exists to refuse.

| input | status |
|---|---|
| survival Brier / calibration | ✅ measured (`replay.js calibration()`) |
| projection reliability (exp 33) | ❌ registered, not run |
| ADP efficiency by round/position/**source** (exp 36) | ❌ registered, not run |
| tier-model calibration | ❌ no instrument yet (bundled into 36) |

**GATED on 33 + 36 + tier calibration:** §1 composite restructure, §5 edge
intake at measured strength, and the consensus §1/§4 weightings. Installs
through the normal gates — null, leave-one-season-out CV, money-graded win over
the current composite. *A restructure this large does not get a pass because its
principle is sound.*

**BUILDABLE NOW, no reliability weights required:**
- **§2 deviation budget display** (merged with the mock-#1 ADP-deviation
  explainer) — reports the deviation the CURRENT composite already produces and
  decomposes it into causing terms. Makes today's deviations auditable, which is
  how we learn whether they were ever justified.
- **§4 default-to-market fallback** — "no edge here, market order" needs only
  the existing noise band, and it is the conservative direction by construction.
- **Consensus §2 dispersion badge** (real-ADP pool only) and **§3 format check**.
- **§6 robot fixtures** — both assertions run against the current composite.

## Pre-registered risk, stated before the work

If 33 says our projections beat the market and 36 says ADP is inefficient where
we deviate, the doctrine **widens** deviations and looks like a vindication. If
33 says our projections lose to a naive baseline, the doctrine **collapses
deviations toward ADP** and the tool becomes, largely, a well-presented
consensus board with a legality layer and a money function.

**Both outcomes are the doctrine working.** Written down now, because the second
one will be tempting to explain away later.
