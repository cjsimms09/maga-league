# THE OBJECTIVE, AND EVERY QUANTITY AUDITED AGAINST IT

**2026-08-13. Cory's ruling, written up by A.**

---

## 0. THE TIMING CORRECTION — VERBATIM, AND IT GOVERNS EVERYTHING BELOW

> THE AUDIT MAY IDENTIFY QUANTITIES FOR DELETION, DEMOTION, REPLACEMENT OR
> REDESIGN. NONE OF THOSE ACTIONS OCCUR BEFORE AUGUST 22.
>
> THE DOCUMENT ESTABLISHES THE STANDARD. IT DOES NOT TRIGGER A REBUILD.

This file changes no code. It produces a September ruling list with Cory's
decision on each item. Nothing in it is a licence to touch the engine.

---

## 1. THE OBJECTIVE

> **MAXIMISE EXPECTED POINTS SCORED BY MY STARTING LINEUP OVER THE SEASON,
> GIVEN THE PICKS I HAVE LEFT, THE LEAGUE'S ROSTER, SCORING AND KEEPER
> CONSTRAINTS, AND WHAT THE ROOM IS EXPECTED TO DO.**

Not "starter-adjusted season value" — that introduces another undefined term.
This is closer to the actual thing being estimated.

Everything below answers to this sentence and nothing else.

### AND "EXPECTED" MUST BE OPERATIONALISED

Otherwise the audit becomes a labelling exercise.

> **EVERY QUANTITY CLAIMING TO BE AN OBJECTIVE TERM MUST HAVE A DEFENSIBLE PATH
> TO ESTIMATING EXPECTED STARTING-LINEUP POINTS. IF IT CANNOT DESCRIBE THAT
> PATH, IT IS NOT AN OBJECTIVE TERM REGARDLESS OF WHAT IT IS CALLED.**

Every row in §3 that claims OBJECTIVE TERM therefore carries its path, and a row
that cannot state one is reclassified on the spot rather than given the benefit
of its name.

**The path has a condition almost every candidate forgets: a player's points
only reach the objective IF HE STARTS.** A quantity that estimates his
production but not his probability of reaching the lineup has described half a
path.

---

## 2. THE FOUR-WAY DECLARATION

Every quantity that can reach a ranking declares **exactly one** of:

| | |
|---|---|
| **OBJECTIVE TERM** | estimates a component of expected starting-lineup points |
| **DECISION-STATE INPUT** | helps estimate what choices remain available. **NOT ITSELF VALUE.** |
| **DIAGNOSTIC** | flags possible model failure. **NEVER ENTERS RANKING.** |
| **UNDECLARED** | currently has no defensible declared role |

**And where a quantity ENTERS THE SCORE, the declaration must say what it
contributes to: VALUE, OPPORTUNITY COST, OR BOTH.**

An availability estimate can legitimately affect a decision **without becoming
player value**. ADP and reference-drafter information are the clearest case —
their defensible role is opportunity cost, not value.

> **CONFLATING THE TWO IS HOW THE CROSS-POSITION COMPARISON WENT WRONG IN THE
> FIRST PLACE.**

---

## 3. THE AUDIT

### OBJECTIVE TERMS (declared, and their status)

| quantity | live? | value / opp-cost / both | PATH TO EXPECTED STARTING-LINEUP POINTS |
|---|---|---|---|
| `proj_mean` | yes | value | his expected season points, which reach the objective **iff he starts**. The root estimate. |
| `vorp` | **not in score**; feeds board order + tiering | value | his points minus the marginal starter's — i.e. the lineup gain over doing nothing at that position. Path defensible; implementation under audit (§4). |
| `keeper` (w=1) | yes | both | lineup points of a retained player, net of the pick his retention costs. **The opp-cost half is not separately declared today.** |
| `vona` (w=1) | yes | **UNRESOLVED — see §4b** | **cannot currently state a path to lineup points.** Under §1 that disqualifies it as an objective term until the path is demonstrated. |

### DECISION-STATE INPUTS

| quantity | live? | declaration |
|---|---|---|
| `survival` | yes, inside VONA | probability a player is still available at my next pick |
| ADP (`adjusted_adp`, `raw_adp`) | yes, inside survival | the room's expected behaviour. **NOT a value estimate.** |
| `ADP_SD_*`, `RUN_*`, `WITHIN_POS_*`, `TENDENCY_*`, `DRIFT_*` | yes | shape parameters of the availability model |
| `nextPick`, `myPicksLeft`, `intervening` | yes | the picks I have left |
| roster legality / `applyRosterLegality` | yes (endgame only) | the roster constraint, enforced as a constraint |
| `needrule.withinCap` (the mask) | yes, **needrule card only** | startable capacity. **Does not reach the composite** — measured 2026-08-14 |

**ADP enters the score today through survival, inside VONA, and that contribution
has never been explicitly declared.** It is the largest undeclared channel in the
model. Recorded here as the finding it is; no action before Aug 22.

### DIAGNOSTICS (must never enter ranking)

| quantity | status |
|---|---|
| the four tripwires | **A TRIPWIRE CAN FLAG A RECOMMENDATION FOR INVESTIGATION. IT CANNOT CHANGE THE RECOMMENDATION.** Silence rule preserved: **invisible during live drafting, visible in mocks and post-draft.** |
| decisive-term readout | reports which term decided a pick; provably read-only (`decisive_readout.test.js`) |
| `unprojected_snapshot.json` | records what the board refused, so the refusal is gradeable |
| `refusal_matches_source` | two independent counts of the same thing |

### UNDECLARED

**These do not get a provisional objective role because they could theoretically
matter.** They are UNDECLARED unless a measurable relationship to the objective
has actually been established. This preserves the finding that
**intuition-based additions have repeatedly failed.**

| quantity | weight | measured |
|---|---|---|
| `tier` | 0 | **−235** |
| `risk` | 0 | **−143**, and its inputs are manufactured (§5, Class Three) |
| `bye` | 0 | **null** |
| `ceiling` | 0 | **−4.8 [−26, +17]** — a sign we cannot distinguish from zero; inputs manufactured |
| `need` | 0 | flips ~5% of picks; redundant with a mask **that the composite never calls** |
| `onesie` multiplier | n/a | **swings 8.9 — second-largest mover — and is not a declared weighted term** |
| `doctrine` tilt | 2.5, on | enters the score; appears in no component |
| `stack` | 1 | **a constant +6.0, not a coefficient** (§5, Class One) |

---

## 4. VORP — THE TEST CHAIN

**Classified as a CANDIDATE objective term whose conceptual role is defensible
and whose implementation is under audit.** Not as correct.

**Replacement level gets an explicit roster-derived declaration:**

> THE EXPECTED PRODUCTION OF THE MARGINAL PLAYER AVAILABLE TO FILL THAT
> POSITION'S STARTING DEMAND UNDER THIS LEAGUE'S ROSTER STRUCTURE.

**THE CHAIN IS SIX LINKS, AND THE LAST TWO ARE WHERE THE FAILURE ACTUALLY LIVES:**

> REPLACEMENT POPULATION → REPLACEMENT LEVEL → ARITHMETIC → CONSUMER →
> **SCORE CONTRIBUTION → RANKING**

VORP is computed correctly and then effectively removed from the score while
still influencing ordering. **That is not a computation failure — it is a
correctness failure at the consumer, and a chain ending at "arithmetic" would
have declared it fine.** My first draft of this document ended at arithmetic.

The chain, and where each link stands:

| link | status |
|---|---|
| **REPLACEMENT POPULATION** | **AUDITED 2026-08-13.** 1181 of 1759 board players carry `proj_mean` 0. Contaminated **in count** but **not at the cut point**: replacement is the Nth-ranked by `proj_mean` with N between 8 and 29, zeros sort last, so the marginal starter is never a zero at current depths. QB→Jayden Daniels 341.7, RB→Cam Skattebo 188.5, WR→Luther Burden 172.7, TE→Mark Andrews 150.7, K→Cameron Dicker 97.0, DEF→Jacksonville 99.0. **No zeros above N at any position.** |
| **REPLACEMENT LEVEL** | depths QB10 RB21 WR29 TE10 K8 DEF10. WR29 and RB21 include an iterative flex allocation (9 of 10 flex slots to WR). Whether that matches the declaration above is **UNAUDITED**. |
| **ARITHMETIC** | `vorp = proj_mean − replacement[pos]`. **No representation for "unknown"** — an absent projection becomes a position constant. See Class Three. |
| **CONSUMER** | **DEFECTIVE — see Class Two, §5.** VORP is read for board ordering and tiering. |
| **SCORE CONTRIBUTION** | **ZERO. Measured:** substituting a hardcoded replacement set changed 1,044 players' VORP and **0 scores** — replacement appears in both terms of `proj_mean − expectedBestAvailable` and cancels exactly. |
| **RANKING** | **NON-ZERO.** It still orders the board and assigns tiers. |

---

## 4b. VONA — NOT PREJUDGED

My first draft called it "misdeclared" and listed it under Class One. **That
reads as a verdict and it should be a question.** Cory's ruling:

> **VONA IS CURRENTLY MISLABELLED AND MISAPPLIED. ITS LEGITIMATE ROLE, IF ANY,
> MUST BE DEMONSTRATED AGAINST THE OBJECTIVE.**

**Within-position drop-off may be a perfectly good estimate of something.** It is
not an estimate of cross-position value, which is how it is being used. The audit
establishes what it legitimately estimates — **it does not start from the
assumption that the answer is nothing.**

### The hypothesis worth testing first

Under §2's value/opportunity-cost split, VONA looks less like a broken value
estimate and more like **a correctly-computed OPPORTUNITY COST wearing a value
label.**

`proj_mean − expectedBestAvailable(samePos, nextPick)` answers: *how much worse
is the man I get at this position if I wait?* That is a real and useful
quantity — it is **the cost of deferring**, not the value of acquiring.

Two consequences if that framing survives testing:

1. **It explains the one-start tilt without anything being miscomputed.**
   Deferring at a position with a steep top-end cliff and a high raw scale costs
   more than deferring at a deep one. At pick 8: QB 33.6, RB 24.0, TE 20.6,
   WR 12.7. Those are honest deferral costs. They are being summed as though
   they were lineup points, and they are not.
2. **Opportunity cost belongs in the decision, not in the value term.** You
   choose the pick that maximises value **net of** what deferring costs. Adding
   the two together is the arithmetic error, not the estimate.

**This is a hypothesis, not a finding.** What would settle it: does ranking on
(value − deferral cost) with the two kept separate produce a better estimate of
expected starting-lineup points than ranking on their sum? That is a September
question and it is the one the whole audit exists to make askable.

---

## 5. THREE FAILURE CLASSES, KEPT SEPARATE

They are three different diagnoses and must not be collapsed.

### CLASS ONE — the name or treatment promises what the arithmetic does not deliver

- **VONA is within-position drop used cross-position.** At pick 8: QB 33.6
  (1 starting slot), RB 24.0 (2), TE 20.6 (1), WR 12.7 (2 + flex). Board ranks
  1–5: QB RB TE WR RB. The numbers are compared as one currency and they are
  not. **The quantity is mislabelled and misapplied; whether it is WRONG is
  §4b's open question.**
- **ONESIE is a ranking mover without being a declared weighted term.** Swings
  8.9, decisive in 4 of 12 picks, and structurally cannot appear in the weights
  panel Cory reviews.
- **STACK is a +6.0 constant treated as a coefficient.** Three firings, exactly
  6.0 each. D10 was a ruling about a weight; the shipped object is a flag.

### CLASS TWO — pipeline failure

**VORP is not a bad quantity.** A declared value quantity is computed, **cancels
exactly out of the score**, and **still influences ordering** through board sort
and tiering. Measured: substituting a hardcoded replacement set changed 1,044
players' VORP and **zero** scores, because replacement appears in both terms of
`proj_mean − expectedBestAvailable` and cancels.

**That is a plumbing defect, not a conceptual one.**

### CLASS THREE — measurement status

The unmeasured weights are **not necessarily conceptually invalid**. Their inputs
are manufactured, so their contributions are not measured:

- `proj_sd = 0.25 × proj_mean` — synthetic
- `proj_ceiling = 1.35 × proj_mean` — synthetic, which makes `ceiling`
  rank-identical to value on any backtest board
- risk carries `age` and none of its other four inputs → PARTIAL, 6 of
  production's 11 distinct values

**Different problem, different fix.** C's usage module (2026-08-13) moves four of
five variance inputs to real data; two of five multipliers still cannot fire, so
a measured ceiling weight will be **real but not parity**.

---

## 6. THE LEARNING REQUIREMENTS — FOUR, KEPT DISTINCT

| requirement | status |
|---|---|
| **DECISION + STATE** | **MISSING, and it is not abstract:** the recommendation row must preserve the **exact `taken_player_ids` at the moment the recommendation was generated** — not reconstructed afterward, not a board summary. B's log records `drafted` and `board_left` as *counts*. |
| **OUTCOME** | **MISSING.** `component-grading-live` and `ledger-to-gate-path` both NOT MET. |
| **PERSISTENT JOIN KEY** | present — `player_id` |
| **PRIOR** | barely. **It matters because it lets us measure SURPRISE rather than merely ERROR** — "off by twelve points" and "off by twelve points on a player we were confident about" are different findings. |

> **A DECISION IS ONLY LEARNABLE IF IT CAN BE RE-SCORED LATER, AND RE-SCORING
> REQUIRES THE DECISION INPUTS, NOT MERELY THE DECISION OUTPUT.**

**Taken-player-ids are evidence architecture, not logging.** Therefore critical
path. Routed to B by Cory and by A independently.

---

## 7. THE ANTI-MISTAKE REQUIREMENTS — AS CONCLUSIONS, WITH THE INSTANCES

These are not principles chosen in advance. They are what this week's failures
demonstrated.

| conclusion | instance |
|---|---|
| **PROVENANCE TRAVELS WITH EVERY VALUE** | 1181 players at `proj_mean` 0 → `vorp` a position constant. Absence written as a number, indistinguishable from a measurement. |
| **TWO INDEPENDENT PATHS FOR EVERY QUANTITY THAT MATTERS TO RANKING** | `c1_agreement` forces two replacement implementations to agree; it is the only reason the derived path's flex-blindness and off-by-one were found. |
| **EVERY GUARD HAS A PASS ARM AND A FAIL ARM** | four "checks" this week were incapable of failing on the case they met: `git log -S` blind to in-place edits, a comment-stripper that read `* Math.max(…)` as a comment, a comparator that could never pass on an object, a refusal that crashed its consumers. |
| **EVERY REFUSAL RECORDS ITS COST** | refusing 1181 players is a decision; `unprojected_snapshot.json` exists so it can be graded rather than assumed. |

And the observation underneath all four:

> **EVERY INGESTION, LABELLING AND CLERICAL ERROR FOUND THIS WEEK WAS CAUGHT BY
> COMPARING TWO INDEPENDENT THINGS — NEVER BY CARE.**

`-S` dating against `-G`. A's sim against B's harness. Python against JS on the
same log. The mutation that had to fail by name.

---

## 7b. AUDIT VERSUS ACCEPTANCE TEST — KEEP THESE SEPARATE

**This document establishes the conceptual standard. B's six-run harness
establishes whether the implementation meets it.** They are different questions
and neither answers the other's.

| | asks |
|---|---|
| **THE AUDIT** | what is this quantity supposed to mean, and does that meaning correspond to the objective? |
| **THE HARNESS** | when we change the implementation, does the measured result improve under controlled board states? |

> **A FIX THAT PASSES THE HARNESS WHILE FAILING THE AUDIT IS A COINCIDENCE
> RATHER THAN A CORRECTION.**

This is not hypothetical. Three slot-aware attempts moved the tight-end count —
one of them to 1 — while none could state what quantity had become a better
estimate of anything. Under harness-only grading, the first of those would have
shipped.

**And the converse holds.** A change that satisfies the audit and fails the
harness is not automatically right either; it means the conceptual story is
clean and the implementation is not, which is a different repair.

---

## 8. HOW THIS CHANGES THE GRADING OF THE SLOT-AWARE FIX

**This is why the document is worth writing now rather than in September.**

"Did the tight-end count fall" becomes a **secondary diagnostic**. The primary
question becomes:

> **DID THE CHANGE PRODUCE A BETTER ESTIMATE OF EXPECTED STARTING-LINEUP POINTS
> UNDER THE ACTUAL ROSTER STRUCTURE?**

Three attempts failed with the symptom as the only available standard — a floor
that tied 1331 players, a crush that inverted negatives, a clamp that flattened
the tail. Each moved the symptom in some direction and none could say why.

> **A FIX THAT MOVES A SYMPTOM AND CANNOT SAY WHY IS A COINCIDENCE**, and we have
> shipped several.

Acceptance remains **B's harness**, six re-driven runs, fifteen picks. A's sim
stays retired until it reproduces a run B has already done, and **every number
quoted from it is labelled a proxy.**

---

## 9. THE SEPTEMBER RULING LIST

Cory's decision required on each. **No action before Aug 22.**

| # | item | class | proposed |
|---|---|---|---|
| 1 | VONA priced across positions without regard to lineup slots | One | REDESIGN |
| 2 | ADP's contribution to the score, undeclared | — | DECLARE |
| 3 | `onesie` as an undeclared ranking mover | One | DECLARE or DEMOTE |
| 4 | `stack` as a constant, ruled on as a coefficient | One | RE-RULE |
| 5 | VORP computed, cancelled, still orders the board | Two | FIX PLUMBING |
| 6 | replacement depth vs its roster-derived declaration | Two | AUDIT |
| 7 | `proj_sd` / `proj_ceiling` manufactured | Three | INGEST (C) |
| 8 | status-carrying inputs, null derived on absent | Three | INGEST (C) |
| 9 | `tier` / `risk` / `bye` / `ceiling` undeclared | — | DELETE or ESTABLISH |
| 10 | decision inputs unrecorded → nothing re-scorable | — | B, critical path |

---

*Written 2026-08-13. Establishes a standard. Triggers nothing.*
