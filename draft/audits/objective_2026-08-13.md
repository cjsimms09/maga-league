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

---

## 2. THE FOUR-WAY DECLARATION

Every quantity that can reach a ranking declares **exactly one** of:

| | |
|---|---|
| **OBJECTIVE TERM** | estimates a component of expected starting-lineup points |
| **DECISION-STATE INPUT** | helps estimate what choices remain available. **NOT ITSELF VALUE.** |
| **DIAGNOSTIC** | flags possible model failure. **NEVER ENTERS RANKING.** |
| **UNDECLARED** | currently has no defensible declared role |

**The value-versus-decision-state split is the one that matters.** ADP and
reference-drafter information do not estimate player value. Their only
defensible role is estimating future availability and opportunity cost — and
**if that enters the score, the contribution must be explicitly declared.**

---

## 3. THE AUDIT

### OBJECTIVE TERMS (declared, and their status)

| quantity | live? | declaration | status |
|---|---|---|---|
| `proj_mean` | yes | expected season points for the player | the root estimate; everything descends from it |
| `vorp` | **not in score**, feeds board order + tiering | **CANDIDATE objective term: conceptual role defensible, implementation UNDER AUDIT** | see §4 |
| `keeper` (w=1) | yes | value of a retained player under the keeper rules | declared; measured |
| `vona` (w=1) | yes | **MISDECLARED — see Class One, §5** | it is the score, and it is not what its name says |

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

The chain, and where each link stands:

| link | status |
|---|---|
| **REPLACEMENT POPULATION** | **AUDITED 2026-08-13.** 1181 of 1759 board players carry `proj_mean` 0. Contaminated **in count** but **not at the cut point**: replacement is the Nth-ranked by `proj_mean` with N between 8 and 29, zeros sort last, so the marginal starter is never a zero at current depths. QB→Jayden Daniels 341.7, RB→Cam Skattebo 188.5, WR→Luther Burden 172.7, TE→Mark Andrews 150.7, K→Cameron Dicker 97.0, DEF→Jacksonville 99.0. **No zeros above N at any position.** |
| **REPLACEMENT LEVEL** | depths QB10 RB21 WR29 TE10 K8 DEF10. WR29 and RB21 include an iterative flex allocation (9 of 10 flex slots to WR). Whether that matches the declaration above is **UNAUDITED**. |
| **ARITHMETIC** | `vorp = proj_mean − replacement[pos]`. **No representation for "unknown"** — an absent projection becomes a position constant. See Class Three. |
| **CONSUMER** | **DEFECTIVE — see Class Two, §5.** |

---

## 5. THREE FAILURE CLASSES, KEPT SEPARATE

They are three different diagnoses and must not be collapsed.

### CLASS ONE — the name or treatment promises what the arithmetic does not deliver

- **VONA is within-position drop treated as cross-position value.** At pick 8:
  QB 33.6 (1 starting slot), RB 24.0 (2), TE 20.6 (1), WR 12.7 (2 + flex).
  Board ranks 1–5: QB RB TE WR RB. The numbers are compared as one currency and
  they are not.
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
| **DECISION + STATE** | **MISSING.** B's log records the recommendation but the board as *counts* (`drafted`, `board_left`), never which players were taken. |
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
