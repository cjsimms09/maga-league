<!-- TERRITORY: A -->
# THE BARBELL — is the middle of the draft dead weight? — 2026-08-17

> **STAGE 1 OF 2. This commit contains §§0–5 only: the inventory, the
> operational definition of "no upside", the tests, and the bar a barbell has
> to clear.** Every definition, threshold, phase boundary, arm and stopping
> rule below was fixed and committed BEFORE any result was computed. Stage 2
> appends §§6+ without editing a word of §§0–5. House precedent:
> `draft/audit/empirical_draft_value_2026-08-16.md`,
> `draft/audit/edge_hunt_2026-08-16.md`.
>
> **A NULL IS THE EXPECTED RESULT AND IS PRE-COMMITTED AS ACCEPTABLE.** The
> instrument this hypothesis is put to has rejected eight roster-construction
> archetypes in a row, including every one that a human would have bet on. A
> ninth rejection is the base rate, and it will be published at full volume
> without hedging.

## 0. Cory's hypothesis, verbatim (2026-08-17)

> "It almost feels like it's useful to draft middle tier players with no
> upside.. either they're a starter who is average or above (go in first 8
> rounds) or you need to draft upside or injury opportunity?"

Read as a BARBELL claim: **the middle of the draft is dead weight.** Take a
proven starter early, or take a genuine upside/opportunity swing late. A
middle-round "safe, no-upside" player is the worst use of a pick.

## 1. WHAT IS ALREADY MEASURED — the two ends, and only the two ends

`draft/audit/empirical_draft_value_2026-08-16.md` (three real seasons of
Cory's league, 450 picks, outcomes not models) established:

- Rounds 1–6 beat rounds 7–15 by **58.1 / 56.8 / 55.2** points per pick in
  2023 / 2024 / 2025 — the same gap, the same sign, all three years.
- **Within rounds 7–15, nothing separates.** Every round from 7 to 15 has a
  mean inside every other round's 95% interval.
- Sixteen (round × position) cells sit entirely below replacement; **twelve of
  them are RB or WR in rounds 8–15**. Round-15 RB is −142.1 [−163.3, −94.7].
- Starter rate by band: **74.4 / 51.1 / 33.9 / 21.5%** (rounds 1–3 / 4–6 /
  7–10 / 11–15) — the study's most solid single curve.
- Availability is a **uniform +11 to +16 point lift on every band**, not a
  late-round-specific effect (§15.2). It is not what makes late picks fail.

So both ENDS of Cory's sentence have support. **What is NOT established is the
sentence itself: that a barbell ALLOCATION beats the balanced one his engine
already produces.** That is what this document tests.

### 1.1 THE PRIOR IS AGAINST IT AND IS STATED FIRST

`draft/audit/roster_construction_2026-08-16.md` put eight construction
archetypes through 120 paired rooms × 4 model configurations from Cory's real
seat. **Its verdict was that no construction shape beats pick-level value.**
`robust_rb` was CI-clear worst in all four configurations (−4.1 wk, champ
−9.7pp); `market_adp` −2.4 wk; forcing QB timing lost in BOTH directions;
`zero_rb`, `te_early` and `seat_plan` were free at best and each went CI-clear
negative in at least one configuration. The one arm that beat the control
(`bpa_vorp`, +0.64 wk) was dismantled in §5 of that document as an artifact of
the season model's zero-replacement assumption.

**A barbell that also fails is the expected result.** This document is written
so that outcome is publishable without spin, and §5's bar is set before the
answer is known precisely so it cannot be moved afterwards.

## 2. INVENTORY — the instruments, with one correction to the brief

### 2.1 ⚠️ `proj_sd` IS MEASURED NOW. `proj_ceiling` IS NOT. That is the trap.

The brief for this pass carried a warning that `proj_sd` is
`proj_mean × variance`, a heuristic at `projections.py:241`. **That warning is
STALE on this branch for skill players, and the half of it that still bites is
a different field.** Verified by reading the shipped board and the code that
writes it:

| field | what it actually is today |
|---|---|
| `proj_sd` | **MEASURED.** `proj_sd_source == "measured-2023-25-error"` on **530 of 682** board rows, taken from `projection_error_calibration.json` via `projections.py:303` under Cory's REC-1 ruling. `variance` is then *re-derived* from the applied sd so the board identity `proj_sd == proj_mean × variance` keeps holding — which is why the field still LOOKS heuristic. The remaining 152 rows are 44 K + 32 DEF + **76 skill rows whose `proj_mean` is 0.0** (deep bench, ADP 919). |
| `proj_ceiling` | **NOT measured.** `mean + CEILING_Z × proj_sd` (`projections.py:318`) — a *symmetric Gaussian* ceiling laid over a distribution the calibration shows is violently right-skewed. |
| `variance` | a re-derivation of `proj_sd`, not an independent quantity. |

**The skew is the whole reason this matters.** The measured RB|33+ cell reads
p10 **0.021**, p50 **0.345**, mean **0.573**, p90 **1.434**. The median
late-round back returns a THIRD of his projection and the top-decile one
returns 1.4× it. No Gaussian ceiling can represent that shape, and "upside" is
precisely the quantity it flattens. **So this pass reads the measured ratios
directly and never goes through `proj_ceiling`.** That is a finding in its own
right and it goes to the queue in stage 2 regardless of how the barbell scores.

### 2.2 The two committed measurements this pass is built from

| artifact | what it gives | n |
|---|---|---|
| `draft/backtest/projection_error_calibration.json` | `realized / projected` distribution per (position × projection-rank band): `p10_ratio`, `p50_ratio`, `p90_ratio`, `sd_ratio` | 1,304 graded player-seasons, 2023–25, 20 cells, **0 unmeasurable** |
| `draft/backtest/empirical_draft_value.json` → `q6_allocation.realized_replacement_used` | OUTCOME-space replacement: pooled realized points of the player who finished at each position's starter rank | QB 330.1 / RB 170.8 / WR 155.0 / TE 124.1 |

Plus, for the middle-is-dead test: `draft/data/wire_level.json` (real
in-season acquisition value, 422 scored acquisitions 2023–25),
`draft/data/league_history.json` (three complete real drafts),
`draft/backtest/nflverse_weekly_points_{2023,2024,2025}.json` and
`component_stats_*` (realized outcomes), and
`draft/backtest/tiered_outcome_model.tier_labels` (the committed, tested
LEAGUE-WINNER definition — reused rather than reinvented).

### 2.3 The carried defects that bound what can be said

- **The 2025 weekly-points store drops zero-point rows** (empirical study
  §12.1): 884 skill player-weeks and 54 whole players missing relative to the
  component store. **Games are therefore counted from `component_stats_Y` for
  all three seasons**, per that study's own preregistration.
- **`player_positions.json` is missing pid `12530`** (2025 pick 64). Counted
  and named, never silently dropped.
- **Three seasons is a small sample.** Every number carries an n and a
  season-clustered CI, and anything whose CI covers the null is reported as
  "not distinguishable from noise" in those words.

## 3. PREREGISTRATION — "NO UPSIDE", OPERATIONALISED

Cory's phrase needs an operational form. This is it, and it is made of the two
measurements in §2.2 and nothing else. **Fixed here, before any result.**

For a board row with a position, a within-position projection rank and a
projection, let `R(pos)` be the outcome-space replacement level and let
`(p50, p90)` be the measured ratios for that row's (position, rank band):

| class | rule | Cory's words |
|---|---|---|
| **ANCHOR** | `proj_mean × p50 ≥ R(pos)` | "a starter who is average or above" — his MEDIAN season is a league starter |
| **SWING** | `proj_mean × p50 < R(pos) ≤ proj_mean × p90` | "upside or injury opportunity" — his median season is not a starter, but a top-decile season is |
| **DEAD** | `proj_mean × p90 < R(pos)` | **"no upside"** — even a top-decile season does not reach starter level |

DEAD is the load-bearing definition and it is deliberately strong. It does not
say "he probably will not hit". It says **the measured distribution of outcomes
for players priced like him does not contain a startable season at 1-in-10.**

### 3.1 Three things this definition refuses to do, each for a reason

1. **BOTH SIDES ARE IN OUTCOME SPACE.** `proj_mean × p50` is a realized-points
   quantity, because the ratio's denominator is the projection. So the
   threshold must be realized points too — which is why the board's own
   `replacement_points` (QB 341.72 / RB 189.10 / WR 173.27 / TE 151.95) are NOT
   used. Those are projection-space levels, and the empirical study measured
   the two spaces to differ by **+11.6 to +27.9 points depending on position**.
   Mixing them would build a positional bias of up to 16 points straight into
   the class boundary. Pinned by a CONTROL test that fails if the two ever
   coincide.
2. **UNMEASURED IS NEVER DEAD.** A row the calibration cannot price returns
   `UNMEASURED` and is neither sought nor banned by any arm. Every consumer
   here treats DEAD as a reason not to draft someone; an unpriced row silently
   labelled DEAD would let a coverage gap masquerade as a finding about
   players. On the shipped board this is exactly the 76 skill rows with
   `proj_mean == 0.0` — a zero projection is a MISSING projection.
   *(This assertion was written as `UNMEASURED === 0`, went red on first run,
   and the red was right. Recorded rather than quietly fixed.)*
3. **K AND DEF ARE `NA`.** The calibration is offence-only and onesie timing
   belongs to the engine's measured rails, not to a construction overlay.

### 3.2 Non-vacuity, declared before the prereg commit rather than after

The definition above was fixed on principle — measured median vs measured
top-decile vs measured replacement — and then run once against the shipped
board as a **mechanics check**, before this commit. It was NOT adjusted after
seeing the result. What it produced:

| ADP band | n | ANCHOR | SWING | DEAD |
|---|---|---|---|---|
| 1–30 | 27 | 100% | 0% | 0% |
| 31–60 | 31 | 90% | 10% | 0% |
| 61–90 | 30 | 70% | 30% | 0% |
| 91–120 | 26 | 35% | 54% | 12% |
| 121–180 | 53 | 11% | 45% | 43% |
| 181+ | 438 | 1% | 2% | 97% |

Board census: **ANCHOR 94 / SWING 59 / DEAD 377 / UNMEASURED 76 / NA 76.**

**The honest caveat that comes with that table, stated now rather than when it
is inconvenient: the class is nearly monotone in ADP.** An overlay built on it
is therefore *partly* a rank overlay, and a barbell result must be read against
that. It is not entirely one — the table shows SWINGs inside ADP 31–60 and
ANCHORs beyond 121 — and the rank-awareness is real (the same projection
classifies differently at different within-position ranks, because the measured
spread differs by band). But if the barbell arm wins, the first question asked
of it in stage 2 will be whether it is Cory's shape or a relabelled ADP sort.

## 4. PREREGISTRATION — THE FOUR QUESTIONS

### 4.1 Q1 — is the middle DEAD, or merely FLAT?

Flat means "no round in 7–15 beats another" — already established. **Dead means
"these picks return less than the alternative use of the roster spot."** Three
benchmarks, all preregistered, all reported even where they disagree:

- **(a) Replacement level**, outcome space, per position (§2.2). Value over
  replacement per (round-band × position), season-clustered bootstrap CI.
- **(b) The waiver wire — the benchmark that actually decides "dead".**
  `wire_level.json` measures what an in-season acquisition delivers, from 422
  scored acquisitions over 2023–25. Two levels are published there and **both
  are used, as a bracket, because they bound the truth from opposite sides**:
  - `ongoing.per_week` (QB 19.46 / RB 5.9 / WR 7.3 / TE 6.8) — the median of
    the three weeks AFTER acquisition, i.e. what a HELD wire add delivers.
    **Primary.** Its own caveat says it excludes weeks the player did not play
    and therefore slightly OVERSTATES a held add.
  - `per_week` (QB 23.38 / RB 7.8 / WR 11.1 / TE 11.6) — the acquisition-week
    median over adds that were actually started, i.e. what CHURNING the slot
    delivers. Selection-biased upward. **Upper bound.**
  Season-equivalent value of the roster spot = `wire × 17`. A pick whose
  realized season total sits below that returned less than leaving the spot
  open and streaming it. **The counterfactual is stated plainly because it is
  the arguable part: it assumes the spot could have been streamed from week 1,
  which is what "alternative use of the roster spot" means and is not what any
  manager literally does.** Both bounds are reported at every cell.
- **(c) Best available at the same pick.** For every real pick, the realized
  points of the best still-undrafted player at that pick number (hindsight
  ceiling), and the mean over the still-undrafted skill pool (blind-draw
  floor). The first measures regret; the second measures whether the picking
  at that slot carried any information at all. **A round where picks do no
  better than a blind draw is dead in a second, independent sense: not that
  the spot is worthless, but that choosing within it is.**

**And the barbell's own empirical shape, which is the crux:** the middle should
be dominated by BOTH ends. So, per round band, `P(LEAGUE-WINNER)` using
`tiered_outcome_model.tier_labels` (top ⌈K/2⌉ at the position — the committed,
tested definition), with Wilson intervals. **If the late band carries a
league-winner tail the middle band lacks, Cory is right about the shape of the
draft even if no allocation can exploit it.**

Arm E (exclude never-played) primary and Arm Z (zero them) secondary, per the
empirical study's §2.2. Any sign disagreement between arms is the finding.

### 4.2 Q2 — the definition

§3. Fixed.

### 4.3 Q3 — does a barbell allocation beat the shipped policy?

**In the SAME instrument that rejected eight archetypes** —
`draft/tools/archetype_rooms.js`, unmodified except that each pick now records
its upside class. Five new arms, all constraints on the engine's OWN ranked
candidate list, never a second draft brain:

| arm | constraint |
|---|---|
| `barbell` | rounds ≤ 8 seek ANCHOR; rounds ≥ 9 seek SWING; never DEAD at any round |
| `no_deadweight` | never take a DEAD candidate; engine order otherwise (the exclusion half alone) |
| `anchor_early` | rounds ≤ 8 seek ANCHOR only (the early half alone) |
| `upside_late` | rounds ≥ 9 seek SWING only (the late half alone) |
| `anti_barbell` | **CONTROL, PRE-DECLARED TO LOSE**: seek DEAD at every round |

**The phase boundary is round 8, from Cory's sentence verbatim, not fitted.**
It was not tuned against any simulation output. Cory's seat forfeits rounds 1–3
to keepers, so his live picks ARE rounds 4–15 and the boundary splits them 5/7.

Four halves are separated on purpose. If `barbell` pays and `no_deadweight`
does not, the payment is in the phase timing; if `no_deadweight` pays and
`barbell` does not, it is in the exclusion. A win that cannot be attributed to
half of Cory's sentence is not a usable answer.

**`anti_barbell` is not decoration.** An inert classifier produces five arms
that all tie the control and a comfortable "no effect" verdict that is really a
broken instrument. **If `anti_barbell` does not lose, this document reports
that the instrument is inert and reports NO arm result.** That refusal is fixed
now.

**Configurations: the same four, unchanged** — primary (measured opponents /
real designated keepers, 120 paired seeds), wire-floor replacement (120), noisy-
ADP opponents (40), mine-only keepers (40). Paired seeds throughout. Written to
`draft/data/archetype_rooms_barbell*.json` — **the four committed artifacts of
the roster-construction audit are never overwritten.**

### 4.4 Q4 — is the shipped policy ALREADY barbelled?

`DECISIONS-NEEDED.md` #0000 found the tool drafts 0.8–0.9 RBs in every arm
regardless of weights. So: measure the SHIPPED policy's own round-by-round
class and position profile, over the same 120 primary rooms. Every arm's pick
log now records `engine_top_cls` — the shipped recommendation's class at that
pick in that room — so this is readable without a second run and is identical
by construction on the control arm.

**Pre-declared reading:** if the shipped engine already takes ANCHORs early and
SWINGs late without being told to, **Cory's instinct is confirmed AND already
implemented**, and that is a real and satisfying answer, not a consolation
one. It is stated here so it cannot be presented as a discovery after a null.

## 5. THE BAR, AND THE LIMITATION THAT MAY DECIDE THE ANSWER

### 5.1 The winning bar — fixed now, in advance

A barbell arm **BEATS** the shipped policy only if:

1. its paired Δ champ probability CI **excludes zero and is positive in the
   PRIMARY configuration**, AND
2. it does **not** go CI-clear negative in **any** of the other three
   configurations, AND
3. the sign holds in **all three disjoint 40-seed batches** (1–40 / 41–80 /
   81–120).

This is the bar `bpa_vorp` failed (it flipped sign under the ADP room and
evaporated under the wire floor). Anything short of all three is reported as
**FREE AT BEST** or **NOT DISTINGUISHABLE FROM NOISE**, in those words.

### 5.2 ⚠️ THE INSTRUMENT MAY BE STRUCTURALLY UNABLE TO SEE A BARBELL — declared before the run

This is the most important sentence in the preregistration and it is written
before the answer is known.

**The season model's only channel from roster to outcome is MEAN weekly
points at a CONSTANT variance.** `archetype_season.standingsMC` takes one `sd`
for every team — the measured league constant 21.3 — and the roster-construction
audit's own limitation 3 says so in as many words: *"archetypes that differ
mainly in weekly VARIANCE (boom/bust builds) are not separable here."*

**A barbell's entire claim is about the outcome DISTRIBUTION, not the mean.**
"Take an upside swing instead of a safe middle player" is a trade of expected
points for right-tail mass. In an instrument that scores rosters by expected
points and then applies an identical variance to every team, that trade can
only ever show up as a LOSS.

Three consequences, all fixed now:

- **A negative barbell result in this harness is WEAK EVIDENCE against Cory's
  hypothesis, not strong evidence.** It will be reported that way. Per
  `SESSION-A.md` clause 13f — when a null confirms what you expected, first
  show the instrument could have produced anything else — **stage 2 must state
  what this harness WOULD have shown if a barbell were genuinely better, and
  if the answer is "nothing", the verdict is about the instrument.**
- **A POSITIVE barbell result is strong evidence**, because it would have had
  to arrive through the mean channel despite the variance channel being shut.
- **One secondary, explicitly post-hoc, explicitly unvalidated arm is
  permitted**: re-running the championship path with a PER-ROSTER weekly sd
  derived from the starters' own `weekly_sd` column, which `champodds.simulate`
  already accepts per team. The roster-construction audit declined to build
  this ("a new unvalidated instrument; deliberately not invented in draft
  week") and that judgement is respected: **it is reported as a mechanism
  probe, is labelled a new instrument at every mention, and NO VERDICT MAY
  REST ON IT.** If it is not run, stage 2 says so.

### 5.3 Stopping rule and what ships

- Every number in stage 2 is produced by one committed, tested module and one
  committed artifact. Nothing is hand-computed.
- **No board, model, config or policy change ships from this study.** Any real
  finding becomes a `DECISIONS-NEEDED.md` item with a described diff, and Cory
  rules. Restated here so stage 2 cannot drift.
- Reproduce:
  ```
  node draft/tests/barbell_policy.test.js
  python3 draft/backtest/barbell_middle.py
  python3 -m pytest draft/tests/test_barbell_middle.py -q
  node draft/tools/archetype_rooms.js --rooms 120 --seed 1 \
    --arms shipped,barbell,no_deadweight,anchor_early,upside_late,anti_barbell
  ```

---
---

# STAGE 2 — THE RESULTS

_Appended 2026-08-17. §§0–5 above are unchanged from the preregistration commit
`e4de31c5`. Produced by `draft/backtest/barbell_middle.py` →
`barbell_middle.json` (17 tests) and `draft/tools/archetype_rooms.js` → four
`archetype_rooms_barbell*.json` artifacts (43 tests), read by
`draft/tools/barbell_report.py`._

## 6. THE ANSWER, FIRST

**1. Cory's hypothesis is HALF RIGHT, and the half that fails is the half the
whole barbell rests on.** Measured against the alternative use of the roster
spot — the waiver wire, from 422 real scored acquisitions over 2023–25 — the
early phase of his sentence is confirmed and the late phase is contradicted by
its own outcomes:

| band | n | mean realized | vs a HELD wire add | verdict |
|---|---|---|---|---|
| 1–3 (keeper ledger) | 90 | 208.0 | **+78.3** [+55.3, +99.4] | ABOVE |
| 4–6 EARLY | 90 | 172.2 | **+22.4** [+2.1, +44.1] | **ABOVE** |
| **7–10 MIDDLE** | 115 | 133.9 | **+9.9** [−4.7, +24.3] | **at parity — not distinguishable from noise** |
| **11–15 LATE** | 93 | 133.0 | **−27.8** [−52.5, −6.5] | **BELOW** |

Under Cory's own phase split: **rounds 4–8 return +19.2 [+4.8, +33.2] over the
wire; rounds 9–15 return −15.1 [−31.4, −1.5].** Three seasons, same sign, both
bands. **"Proven starter in the first 8 rounds" is measured and true. "Draft
upside after that" is measured and false — the late rounds are where the dead
weight actually is.**

**2. THE MIDDLE IS FLAT, NOT DEAD, AND THE DIFFERENCE IS ENTIRELY IN WHAT YOU
COMPARE IT TO.** The empirical study's headline — sixteen (round × position)
cells below replacement, twelve of them RB/WR in rounds 8–15 — is correct, and
it reads as "these picks are worthless". It is not that claim. **Replacement is
the STARTER-RANK level; the alternative use of a roster spot is the waiver wire,
and the wire sits far below replacement at the deep positions.** The clearest
single cell:

> Middle-round RB (rounds 7–10, n = 39): **−44.3 below replacement** (CI-clear)
> and **+26.2 above the held wire** [−4.6, +58.2]. Both are true. Only the
> second is a reason not to spend the pick, and it does not say don't.

**3. There is no late-round upside tail. It runs the other way.**
P(LEAGUE-WINNER) — top ⌈K/2⌉ at the position over the season's full realized
field, the committed `tiered_outcome_model` definition, reused unmodified:

| band | n | league-winners | P(LEAGUE-WINNER) | per season |
|---|---|---|---|---|
| 1–3 | 90 | 44 | 0.489 [0.388, 0.590] | — |
| 4–6 | 90 | 26 | **0.289** [0.205, 0.390] | .367 / .300 / .200 |
| 7–10 | 115 | 16 | **0.139** [0.087, 0.214] | .154 / .128 / .135 |
| 11–15 | 93 | 10 | **0.108** [0.059, 0.187] | .065 / .125 / .133 |

**Late minus middle: −0.032 [−0.129, +0.068], negative in all three seasons.**
Not distinguishable from noise, and pointing the wrong way for the hypothesis.
By Cory's phase split it is starker: rounds 4–8 produce a league-winner
**24.3%** of the time, rounds 9–15 **10.7%**. **The upside is in the early
rounds too.** Nothing in three seasons of this league supports trading a round-9
starter for a round-9 lottery ticket.

**4. The most actionable single cell: a late-round quarterback is the worst pick
in the draft, and the reason arrived as a test going red.** Rounds 11–15 QB
returns **−76.1 [−147.3, −15.6]** against the wire — the only CI-clear-below
cell at any position:

| position | outcome-space replacement | a HELD wire add over 17 weeks | gap |
|---|---|---|---|
| QB | 330.1 | **330.8** | **−0.7** |
| TE | 124.1 | 115.6 | +8.5 |
| WR | 155.0 | 124.1 | +30.9 |
| RB | 170.8 | 100.3 | +70.5 |

**At quarterback the waiver wire IS replacement level.** The split is exactly
onesie-versus-deep: QB and TE need 10 starters in a 10-team league, so the wire
holds essentially replacement-quality players at both; RB and WR need 21 and 29,
so the wire is far below. **This is an independent third confirmation of the
early-QB withdrawal** (`WAR-ROOM-SAID-TAKE-EARLY-QB.md` voided it on a design
defect; `empirical_draft_value` §4.6 found no outcome support for it) — and it
extends the doctrine to the other end of the draft: do not spend a late pick on
a backup quarterback either.

**5. Choosing inside every band beat a blind draw, including the middle.** The
second, independent sense of "dead" — that picking in this range carries no
information — does not hold anywhere:

| band | mean pool still available | realized minus the pool mean | verdict |
|---|---|---|---|
| 1–3 | 494 | +137.1 [+117.2, +156.9] | ABOVE |
| 4–6 | 464 | +108.9 [+89.8, +129.2] | ABOVE |
| 7–10 | 430 | **+77.7** [+63.9, +91.6] | ABOVE |
| 11–15 | 396 | +83.7 [+56.5, +110.7] | ABOVE |

**6. A barbell allocation LOSES to the shipped policy in the same harness that
rejected eight archetypes — and the loss is entirely in the late half.** 120
paired rooms from Cory's real seat: **−0.50 weekly points [−0.688, −0.309] and
−1.49 points of championship probability [−1.94, −1.03]**, sign stable in all
three seed batches, CI-clear negative again under the wire floor. The
`upside_late` arm produced **byte-identical rosters to `barbell` in 120 of 120
rooms** — the phase timing is the whole strategy. **The harness's record against
roster-construction archetypes is now ten for ten.** §8.

**7. The shipped policy is ALREADY barbelled, and the measurement is exact.**
Over 1440 picks with nobody telling it to have a shape: **rounds 4–8 are 100%
ANCHOR, 600 of 600 picks**, and **2 picks in 1440 (0.14%) are DEAD**. The
`no_deadweight` and `anchor_early` arms produced rosters identical to the
control in **120 of 120 rooms** — there was never anything to exclude and never
an anchor it was not already taking. And from round 9 the tool leans the OTHER
way: at round 11 anchors are 31% of what is available and it takes one **61%**
of the time. **It is barbelled at the end where the barbell is right and
deliberately anti-barbelled at the end where the barbell is wrong.** §9.

**No board, model, config or policy change ships from this document.** §10 lists
what goes to `DECISIONS-NEEDED.md` for Cory's ruling.

---

## 7. Q1 IN FULL — DEAD, FLAT, OR NEITHER

### 7.1 The three benchmarks, and why the wire is the one that decides

"Flat" was already established: `empirical_draft_value` §5.1 found every round
from 7 to 15 has a mean inside every other round's 95% interval. **"Dead" is a
different claim and needs a different denominator.**

- **Replacement** (outcome space, the level at each position's starter rank) is
  what the empirical study used. It answers *"is this pick a starter?"*
- **The waiver wire** answers *"was this roster spot worth a pick at all?"* —
  which is the question Cory's hypothesis actually asks.
- **The remaining pool** answers *"did choosing here carry any information?"*

Both wire levels published in `wire_level.json` are used as a **bracket**,
because they bound the truth from opposite sides:

| | QB | RB | WR | TE | what it is |
|---|---|---|---|---|---|
| **held** (primary) | 19.46 | 5.90 | 7.30 | 6.80 | median of the three weeks AFTER acquisition — a held add. Its own caveat: excludes weeks the player did not play, so it slightly OVERSTATES. |
| **churned** (upper bound) | 23.38 | 7.80 | 11.10 | 11.60 | acquisition-week median over adds that were actually STARTED — selection-biased upward by construction. |

**THE COUNTERFACTUAL IS THE ARGUABLE PART AND IS STATED RATHER THAN BURIED.**
`wire × 17` assumes the spot could have been streamed from week 1. That is what
"alternative use of the roster spot" means, and it is not what any manager
literally does. Under the aggressive `churned` bound **everything from round 4
on is below the alternative**, the early band included (−34.4 [−56.1, −13.5]).
The honest reading is the bracket: the early band is above the wire on the
primary measure and below it on the upper bound; the middle band is at parity on
the primary and below on the bound; **the late band is below on both.** Only the
late band's verdict survives the whole bracket, and that is why it is the one
headlined.

K and DEF have no measured wire level (nflverse is offence-only). They are
**excluded from every wire comparison, not compared against zero** — a kicker
scored against a wire of 0.0 would read as a spectacular pick.

### 7.2 By round — the curve crossing the wire

Value over a held wire add, per round, 30 picks each where K/DEF do not thin it:

| round | n | mean | vs held wire | verdict |
|---|---|---|---|---|
| 1 | 30 | 208.3 | +97.5 [+68.0, +131.3] | ABOVE |
| 2 | 30 | 226.9 | +83.4 [+50.3, +119.6] | ABOVE |
| 3 | 30 | 188.7 | +54.0 [+14.1, +97.3] | ABOVE |
| 4 | 30 | 170.3 | +37.2 [−0.3, +71.8] | noise |
| 5 | 30 | 180.0 | +20.2 [−24.6, +54.2] | noise |
| 6 | 30 | 166.3 | +9.9 [−38.4, +46.8] | noise |
| 7 | 28 | 147.1 | +16.5 [−15.3, +43.6] | noise |
| 8 | 30 | 126.7 | +11.9 [−14.2, +39.3] | noise |
| 9 | 29 | 135.2 | +5.0 [−18.9, +31.4] | noise |
| 10 | 28 | 127.0 | +6.1 [−16.2, +29.5] | noise |
| 11 | 24 | 136.1 | +1.1 [−24.3, +29.7] | noise |
| 12 | 23 | 156.8 | −50.6 [−119.9, +5.4] | noise |
| 13 | 12 | 114.6 | −13.4 [−60.6, +39.6] | noise |
| 14 | 16 | 131.9 | −22.4 [−56.8, +12.5] | noise |
| 15 | 18 | 111.6 | **−51.7** [−75.7, −26.9] | **BELOW** |

**Round 15 is the only single round that is CI-clear dead.** Everything from 4
to 14 is individually indistinguishable from the wire — the same flatness the
empirical study found, now measured against the right denominator. The
BAND-level verdicts in §6 are sharper only because pooling four or five rounds
buys the n that 30 picks does not. **Read that honestly: at round resolution
this study cannot tell round 7 from round 14 either.**

### 7.3 By position — where the middle actually costs something

Value over a held wire add, by band × position (Arm E):

| cell | n | mean | vs held wire | vs replacement |
|---|---|---|---|---|
| 4–6 RB | 29 | 155.2 | **+54.9** [+19.3, +96.8] ABOVE | −15.6 noise |
| 4–6 WR | 34 | 151.1 | **+27.0** [+7.0, +54.2] ABOVE | −3.9 noise |
| 4–6 TE | 12 | 135.2 | +19.6 [−4.1, +41.3] noise | +11.1 noise |
| 4–6 QB | 15 | 282.4 | −48.4 [−108.9, +17.1] noise | −47.7 noise |
| 7–10 RB | 39 | 126.5 | +26.2 [−4.6, +58.2] noise | **−44.3 BELOW** |
| 7–10 WR | 57 | 129.4 | +5.3 [−8.3, +19.4] noise | **−25.6 BELOW** |
| 7–10 TE | 14 | 105.8 | −9.8 [−27.4, +16.7] noise | −18.3 noise |
| 7–10 QB | 5 | 320.7 | −10.1 [−96.9, +60.1] noise | −9.3 noise |
| 11–15 RB | 35 | 84.5 | −15.8 [−37.9, +10.6] noise | **−86.4 BELOW** |
| 11–15 WR | 26 | 105.9 | −18.2 [−46.3, +11.3] noise | **−49.2 BELOW** |
| 11–15 TE | 11 | 119.1 | +3.5 [−33.7, +32.1] noise | −5.0 noise |
| **11–15 QB** | **21** | **254.7** | **−76.1** [−147.3, −15.6] **BELOW** | **−75.3 BELOW** |

**Every RB and WR cell from round 7 on is CI-clear below replacement and NONE of
them is CI-clear below the wire.** That contrast is the whole of finding 2 in one
table. The only cell dead on both measures is the late quarterback.

### 7.4 Survivorship — both arms, and they agree

Exactly one drafted skill player in 450 never took a snap (Joe Mixon, 2025 pick
68). Arm E (exclude) and Arm Z (zero) therefore differ by almost nothing, and a
test pins it: every band's wire delta agrees in sign and moves by less than 15
points. Arm Z: early **+22.4** [+2.1, +44.1], middle **+8.9** [−5.2, +23.7],
late **−27.8** [−52.5, −6.5]. **Every finding in this section holds under both
arms.**

### 7.5 What Q1 could NOT answer

1. **Whether the wire counterfactual is the right one.** §7.1. It is a bracket,
   not a point estimate, and its two ends disagree about the early and middle
   bands.
2. **Anything at round resolution.** §7.2 — 30 picks a round is not enough.
3. **Anything about rounds 1–3 as a market.** 72 of those 90 picks are keepers
   (`empirical_draft_value` GAP 2). Reported, never pooled into a claim.
4. **Whether the wire itself is priced right.** `wire_level.json` is a median of
   real acquisitions, but which acquisitions a manager *could* have made depends
   on the room, and nothing here models that.
5. **QB and TE cannot be separated on the flat-vs-dead axis at all**, because at
   both positions the wire IS replacement (§6 finding 4). The distinction this
   study exists to draw only has room to operate at RB and WR.

---

## 8. Q3 — DOES A BARBELL ALLOCATION BEAT THE SHIPPED POLICY?

**No. It loses, CI-clear, in the primary configuration, and the loss is
entirely in the late half of Cory's sentence.**

### 8.1 THE INSTRUMENT CHECK FIRST — what the overlay could ever have done

§5.2 fixed this ordering in advance, and it turns out to carry the pass's most
useful single table. The mean class mix of the **engine's own top-25 candidate
slice** at each of my picks, primary configuration, 120 rooms:

| round | ANCHOR | SWING | DEAD | K/DEF |
|---|---|---|---|---|
| 4 | **25.0** | 0.0 | **0.0** | 0.0 |
| 5 | 24.9 | 0.1 | **0.0** | 0.0 |
| 6 | 24.5 | 0.5 | **0.0** | 0.0 |
| 7 | 20.0 | 5.0 | **0.0** | 0.0 |
| 8 | 18.1 | 6.8 | **0.0** | 0.0 |
| 9 | 13.4 | 11.6 | **0.0** | 0.0 |
| 10 | 11.0 | 14.0 | **0.0** | 0.0 |
| 11 | 7.8 | 17.2 | **0.0** | 0.0 |
| 12 | 6.4 | 18.5 | **0.1** | 0.0 |
| 13 | 4.1 | 18.5 | **0.7** | 1.7 |
| 14 | 0.2 | 0.1 | **0.0** | 24.6 |
| 15 | 0.1 | 0.3 | **0.5** | 23.8 |

**The engine's candidate list is essentially free of "no upside" players at
every round of the draft.** Out of 25 candidates it offers, the count classified
DEAD never exceeds 0.7 and is exactly 0.0 through round 11. Two consequences,
and the first is a limitation on this pass while the second is the answer to
Q4:

1. **`anti_barbell`, the pre-declared control, is UNDERPOWERED rather than
   informative** — it had almost nothing to seek. It diverged on 12 picks out of
   1440 and its champ delta is −0.0002 [−0.0006, +0.0002].
2. **The shipped engine already excludes dead weight, completely, without being
   told to.** §9.

### 8.2 ⚠️ A DECLARED DEPARTURE FROM THE PREREGISTRATION

§4.3 fixed this refusal: *"If `anti_barbell` does not lose, this document
reports that the instrument is inert and reports NO arm result."* **By the
letter, that refusal is triggered — `anti_barbell` did not lose.** The arm
results are reported anyway, and the override is recorded here rather than
glossed over.

The reason: that clause existed to catch an INERT CLASSIFIER, and the
classifier is measurably not inert. `barbell` diverged from the control on
**388 of 1440 picks**, gave up **79.2 points of VORP per room**, changed the
modal roster shape (QB1/RB6/WR4/TE2 against the control's QB1/RB6/WR5/TE1), and
moved championship probability by **−1.49 points, CI-clear**. An inert label
cannot do that. The control failed to be a control for a specific, measured
reason — the class it was told to seek is not on the engine's board — and that
reason is itself §9's finding.

**Stated plainly so a reader can disagree with the call rather than have it
hidden: the pre-declared condition fired, and I overrode it on the ground that
its purpose was served by stronger evidence.**

### 8.3 The paired deltas — four configurations

Paired seeds throughout: the same seed drives the same opponent randomness in
every arm, so a difference is attributable to the overlay and not to a
different room.

| configuration | arm | Δ weekly pts [95% CI] | Δ champ [95% CI] | Δ playoff |
|---|---|---|---|---|
| **PRIMARY** measured room / designated keepers / 120 seeds | **barbell** | **−0.50** [−0.688, −0.309] | **−0.0149** [−0.0194, −0.0103] | −0.0208 |
| | no_deadweight | **+0.00** [0, 0] | **+0.0000** [0, 0] | 0 |
| | anchor_early | **+0.00** [0, 0] | **+0.0000** [0, 0] | 0 |
| | upside_late | −0.50 [−0.688, −0.309] | −0.0149 [−0.0194, −0.0103] | −0.0208 |
| | anti_barbell | −0.01 [−0.018, +0.006] | −0.0002 [−0.0006, +0.0002] | −0.0005 |
| **WIRE FLOOR** streaming priced / 120 seeds | **barbell** | **−0.14** [−0.202, −0.081] | **−0.0044** [−0.0060, −0.0028] | −0.0075 |
| | no_deadweight / anchor_early | +0.00 [0, 0] | +0.0000 [0, 0] | 0 |
| | anti_barbell | +0.00 [0, 0] | −0.0001 [−0.0001, 0] | −0.0001 |
| **ADP ROOM** noisy-ADP opponents / 40 seeds | **barbell** | **−0.27** [−0.444, −0.089] | +0.0018 [−0.0145, +0.0181] | +0.0011 |
| | no_deadweight | −0.00 [−0.004, +0.001] | +0.0007 [−0.0006, +0.0020] | +0.0003 |
| | anti_barbell | −0.22 [−0.352, −0.081] | +0.0024 [−0.0105, +0.0152] | +0.0036 |
| **MINE-ONLY** unconfirmed keeper slate / 40 seeds | **barbell** | −0.21 [−0.549, +0.119] | −0.0048 [−0.0133, +0.0038] | −0.0048 |
| | no_deadweight / anchor_early | +0.00 [0, 0] | +0.0000 [0, 0] | 0 |
| | anti_barbell | −0.00 [−0.005, +0.002] | −0.0002 [−0.0006, +0.0002] | +0.0000 |

**The barbell's point estimate is negative in all four configurations and
CI-clear negative in both 120-seed ones.** The two 40-seed arms cover zero on
championship probability — 40 paired rooms cannot resolve a 0.5pp effect — but
the ADP room is CI-clear negative on weekly points, so it is not evidence in the
barbell's favour either.

### 8.4 The preregistered bar (§5.1), applied

**BEATS** requires all three of: champ CI-clear positive in the primary; not
CI-clear negative in any other configuration; the same sign in all three
40-seed batches of the primary.

| arm | champ-CI signs (primary / wire / ADP / mine-only) | primary batch diffs | verdict |
|---|---|---|---|
| **barbell** | **− − 0 0** | −0.0098 / −0.0184 / −0.0165 — stable | **LOSES** |
| **upside_late** | − − 0 0 | identical to `barbell` | **LOSES** |
| **no_deadweight** | 0 0 0 0 | 0.0 / 0.0 / 0.0 | **NO EFFECT — same rosters as the control** |
| **anchor_early** | 0 0 0 0 | 0.0 / 0.0 / 0.0 | **NO EFFECT — same rosters as the control** |
| anti_barbell | 0 0 0 0 | −0.0001 / +0.0001 / −0.0007 | **FREE AT BEST** (and underpowered, §8.1) |

**No arm beats the shipped policy. The harness's record against
roster-construction archetypes is now ten for ten.**

### 8.5 The mechanism, located

`barbell` and `upside_late` produced **byte-identical rosters in 120 of 120
rooms.** `no_deadweight` and `anchor_early` produced **byte-identical rosters to
the shipped control in 120 of 120 rooms.** So the four arms collapse to two
distinct policies, and the whole barbell effect is one thing:

> **In rounds 9–12, the barbell refuses the ANCHOR the engine wants and takes a
> SWING instead. That is the entire strategy, and it costs −0.50 weekly points
> and −1.49 points of championship probability.**

Divergent picks by round: **R9 117, R10 116, R11 101, R12 54** of 120 rooms
each. What the engine wanted at those picks: WR 219, RB 118, QB 33, TE 18. What
the barbell took instead: RB 237, WR 118, TE 28, QB 5.

**A third of the divergence is a quarterback the barbell will not take.** When
the engine's round-9 recommendation is a QB1 — an ANCHOR by definition, since
6-point passing TDs put a startable QB's median well above the 330.1 outcome-
space replacement — the barbell's "seek SWING" rule refuses him. That makes a
sizeable slice of this arm a rediscovery of `late_qb`, which
`roster_construction_2026-08-16.md` already measured at −1.33 weekly points.
**The two instruments agree, which is worth more than either alone.**

### 8.6 THE MECHANISM UNDERNEATH THE MECHANISM — why a swing cannot pay here

The preregistered variance probe (§5.2, run and reported below) turned up the
structural reason, and it is the most useful thing in this document.

**Cory's sentence assumes a TRADE-OFF: give up median to buy ceiling. On the
measured error distribution that trade-off does not exist at the two deep
positions.** A swing's ratio upside is larger — but it multiplies a smaller
projection, and the product loses:

| position | ANCHOR p90 range (realized points) | SWING p90 range | overlap |
|---|---|---|---|
| **RB** | 315.5 – 593.5 | 178.6 – 309.9 | **none** |
| **WR** | 254.4 – 439.1 | 167.8 – 219.4 | **none** |
| TE | 190.8 – 340.5 | 136.7 – 228.3 | 3 swings |
| QB | 452.3 – 498.8 | 355.0 – 478.7 | 2 swings |

**At running back and receiver, not one swing's top-decile season reaches even
the WEAKEST anchor's.** And the same holds for volatility itself: mean
`weekly_sd` is ANCHOR 31.1 against SWING 25.0 at RB, 21.2 against 19.4 at WR,
17.5 against 14.3 at TE. **An anchor is the safer pick AND the higher-ceiling
pick AND the more volatile pick.** Only at quarterback are swings genuinely more
volatile (40.7 against 33.3), which is the one place the barbell's instinct has
any measured footing — and it is the position where a wire add already returns
replacement level for free (§6 finding 4).

The classes are **ordered, not a menu.** That single fact explains every result
in this pass: why the barbell loses in the harness, why the late band produced
FEWER league-winners in three real seasons (§6 finding 3), and why "take upside
late" cannot work on a board where a lower projection compresses the whole
outcome distribution, ceiling included.

**Pinned by test**, with a QB control where the ordering does overlap, so the
RB/WR result cannot be passing for a trivial reason.

### 8.7 The variance probe — §5.2's requirement, discharged

The preregistration demanded this before the run: the harness's only channel is
mean weekly points at a constant league sd (21.3 for every team), a barbell
trades mean for right-tail mass, so a barbell losing there might be a fact about
the instrument rather than about the strategy.

**It is not.** `draft/tools/barbell_variance_probe.js` — ⚠️ *a new,
unvalidated instrument, explicitly post-hoc, no verdict rests on it*:

| | starting-lineup weekly sd (quadrature) | vs shipped |
|---|---|---|
| shipped / no_deadweight / anchor_early / anti_barbell | 67.70 | — |
| barbell / upside_late | 68.55 | **+1.3%** |

**A barbell roster carries 1.3% more weekly spread.** And when that spread is
priced — the champodds bracket re-run on the same final rosters, with every team
held at the SAME mean so the variance channel is isolated and the barbell's mean
penalty is discarded entirely, which is as generous as this can possibly be
made — it buys **+0.0001 championship probability [−0.0002, +0.0003].**

**The harness is not blind to the barbell. The barbell barely buys variance**,
for exactly the reason §8.6 gives. The −1.49pp loss is a mean-channel loss and
it is real inside the model.

---

## 9. Q4 — THE SHIPPED POLICY IS ALREADY BARBELLED, AND THE MEASUREMENT IS EXACT

This is the satisfying half of the answer and it was pre-declared as such
(§4.4) so it could not be presented as a discovery after a null.

The class of the shipped engine's own recommendation at each pick, 120 rooms,
1440 picks, nobody telling it to have a shape:

| round | picks | ANCHOR | SWING | DEAD |
|---|---|---|---|---|
| 4 | 120 | **100%** | 0% | **0** |
| 5 | 120 | **100%** | 0% | **0** |
| 6 | 120 | **100%** | 0% | **0** |
| 7 | 120 | **100%** | 0% | **0** |
| 8 | 120 | **100%** | 0% | **0** |
| 9 | 120 | 98% | 2% | **0** |
| 10 | 120 | 86% | 14% | **0** |
| 11 | 120 | 61% | 39% | **0** |
| 12 | 120 | 38% | 62% | **0** |
| 13 | 120 | 11% | 82% | **2** |
| 14 | 120 | 2% | 1% | **0** (98% K/DEF) |
| 15 | 120 | 2% | 1% | **0** (97% K/DEF) |

**Cory's instinct is confirmed and already implemented:**

- **Rounds 4–8: 100% ANCHOR, 600 picks out of 600, no exceptions.** "A starter
  who is average or above, in the first 8 rounds" is not a change to the tool —
  it is a description of what the tool already does, every time.
- **Dead weight: 2 picks out of 1440 (0.14%), both in round 13.** The
  `no_deadweight` arm produced rosters identical to the control in all 120
  rooms because there was never anything to exclude.
- The ANCHOR share then falls monotonically from round 9 (98%) to round 13
  (11%) as anchors leave the board.

### 9.1 How much of that shape is CHOSEN and how much is FORCED

This is the honest question and the slice census in §8.1 answers it.

**In rounds 4–6 the shape is FORCED.** The engine's top-25 slice is 25.0 / 24.9
/ 24.5 ANCHOR out of 25 — there is essentially nothing else on offer, so
"anchors early" is availability, not judgement.

The arithmetic behind that is worth stating on its own, because it reframes the
early half of Cory's sentence: **the 2026 board carries 94 ANCHORs for a
10-team league that makes about 90 picks in nine rounds.** The anchor supply
does not run out until somewhere around round 10 — the slice still holds 7.8 of
them at round 11. So *"take a proven starter in the first 8 rounds"* is not a
strategy anybody has to adopt in this format. **It is a description of what is
on the board.** You would have to work at it to do otherwise, and the
`anchor_early` arm's result — identical rosters to the control in 120 of 120
rooms — is that fact measured.

**From round 9 on it is CHOSEN, and it is chosen AGAINST the barbell.** At round
11 the slice holds 7.8 anchors and 17.2 swings — 31% of what is available is an
anchor — and the shipped policy's top recommendation is an anchor **61%** of the
time, twice its share of the board. At round 12 the slice is 26% anchor and the
top pick is one 38% of the time. **The composite ranks anchors above swings far
more often than availability alone would produce**, which is not mysterious —
composite value tracks projected points and an anchor has more of them — but it
means the shipped tool leans the OPPOSITE way to Cory's sentence in exactly the
phase where his sentence is a real choice, rather than merely taking what is
left. **That lean is what the barbell arm gives up to lose 1.49 points of
championship probability.**

So the full answer to Q4 is sharper than "already barbelled": **the tool is
barbelled at the end where the barbell is right, and deliberately anti-barbelled
at the end where the barbell is wrong.**

---

## 10. WHAT THIS CONTRADICTS, WHAT IT COULD NOT DO, AND WHAT GOES TO CORY

### 10.1 Contradicted, corroborated, and one thing sharpened

- **CORROBORATES `roster_construction_2026-08-16.md` at full strength.** That
  document's verdict — *no construction shape beats pick-level value* — now
  survives a ninth and tenth challenger. And the barbell's loss arrives partly
  through the same channel as `late_qb`'s (−1.33 wk there, and a third of this
  arm's divergence is a QB it refuses), so the two instruments agree.
- **CORROBORATES the early-QB withdrawal from a third direction, and extends
  it.** `WAR-ROOM-SAID-TAKE-EARLY-QB.md` voided the doctrine on a design defect;
  `empirical_draft_value` §4.6 found no outcome support for paying up early.
  This pass adds the other end: **a late-round backup QB is the single worst
  cell in the draft against the wire (−76.1 [−147.3, −15.6])**, because at
  quarterback the wire IS replacement level.
- **SHARPENS `empirical_draft_value` §10 rather than contradicting it.** Its
  "sixteen cells below replacement, twelve of them RB/WR in rounds 8–15" is
  correct and unchanged. What is added is the denominator: measured against what
  the roster spot could otherwise have returned, **none of those RB/WR cells is
  CI-clear dead** and the middle band as a whole is at parity with the wire.
  Below replacement and below the alternative are different statements.
- **CONTRADICTS the late half of Cory's hypothesis on three independent
  measurements** — realized value against the wire (rounds 9–15, −15.1
  [−31.4, −1.5]), realized league-winner rate (late below middle in all three
  seasons), and the room simulation (−1.49pp champ, CI-clear).
- **AGREES with the early half on two** — realized value against the wire
  (rounds 4–8, +19.2 [+4.8, +33.2]) and the shipped policy's own behaviour
  (100% ANCHOR in 600 of 600 picks).

### 10.2 What this pass could NOT do

1. **It could not test the barbell on a board where the trade-off exists.**
   §8.6 shows it does not exist at RB/WR on this board. Everything downstream of
   that is conditional on `proj_mean`'s ordering being roughly right — and
   `empirical_draft_value` §4.2 measured own_v6 as WORSE than the room's own
   draft order at all four positions. **If the projection is wrong about which
   players are anchors, the classifier is wrong in the same places.**
2. **The `anti_barbell` control never got to be a control** (§8.1–8.2). The
   class it was told to seek is not on the engine's board.
3. **It could not separate the barbell from a rank overlay as cleanly as it
   should.** §3.2 flagged in advance that the class is nearly monotone in ADP.
   It is not entirely — the shipped policy's late-round anchor preference
   operates on players the slice offers simultaneously — but a reader is
   entitled to read part of the barbell's loss as "took a worse player".
4. **Nothing here models in-season behaviour.** The wire comparison prices the
   ALTERNATIVE to a pick; it does not simulate actually working the wire, and
   `wire_level.json` cannot say which adds were reachable in a given room.
5. **Three seasons, 450 picks, one 10-team league.** Every band-level number
   rests on 90–115 picks and every round-level number on ~30. §7.2 is explicit
   that at round resolution nothing separates.
6. **The harness limitations carry over unchanged** —
   `roster_construction_2026-08-16.md` §7, all seven of them: conditioned on
   `proj_mean`, opponent-model fidelity, constant weekly sd, inflated absolute
   levels, an unconfirmed keeper slate, bench value only through byes, and the
   seat plan's positions rather than its names.

### 10.3 Going to `DECISIONS-NEEDED.md` — described diffs, Cory rules, nothing ships

- **(a) `proj_ceiling` is a symmetric Gaussian over a violently skewed measured
  distribution.** `projections.py:318` writes `mean + CEILING_Z × proj_sd`. The
  calibration that now supplies `proj_sd` also publishes `p10_ratio` and
  `p90_ratio` per (position × rank band), and they are wildly asymmetric —
  RB|33+ is p10 0.021 / p50 0.345 / p90 1.434 about a mean of 0.573. **Diff:
  write `proj_floor = proj_mean × p10_ratio` and `proj_ceiling = proj_mean ×
  p90_ratio` where a cell is measured, keeping the Gaussian path only where it
  is not.** This is the same REC-1 move already made for `proj_sd`, applied to
  the two fields beside it. **Consequence to weigh before ruling: `ceiling` sits
  at 0 in `MEASURED_WEIGHTS`, so nothing on the board consumes it today** — this
  is a correctness fix to a displayed field, not a scoring change, unless Cory
  also wants the weight revisited. Not proposed here.
- **(b) A late-round quarterback is the worst pick in the draft and the war room
  does not say so.** Rounds 11–15 QB: −76.1 [−147.3, −15.6] against a held wire
  add, the only CI-clear-below cell at any position, because measured QB
  replacement (330.1) and the measured QB wire (330.8) are **the same number**.
  **Diff: none proposed to the engine** — it already takes QB1 early enough that
  this rarely binds (§9's table shows QB anchors going in rounds 9–12). The
  question for Cory is whether the war room should carry a one-line rail at
  rounds 11+ saying a second QB costs a roster spot the wire fills for free.
  **This is the one finding in the pass with a plausible draft-night action.**
- **(c) The middle band is at parity with the wire, not dead.** No diff. It is
  a reading correction to how `empirical_draft_value` §10's below-replacement
  table should be quoted, and it matters because that table is the most
  quotable thing in that document.
- **(d) `upside_class.js` is Lab-only and should stay that way unless Cory wants
  it on the board.** The classifier is a genuinely new, measured, three-way
  label over the board. It shipped as a research module with no production
  reader, deliberately. If it were ever surfaced, the caveat in §10.2(1) travels
  with it: it inherits every error in `proj_mean`.

### 10.4 Rule 10, discharged this session

**Nine deliberate breaks, nine catches** — after one silence was found and
closed. Each was applied through `draft/tools/rule10_break.sh` (bounded,
trap-restored) and observed red by name:

| break | caught by |
|---|---|
| the wire reads the CHURNED level where it declares the HELD one | `test_wire_levels_are_the_committed_bytes_not_a_copy` |
| `board_state` never removes a taken player | `test_board_state_pool_shrinks_monotonically_within_a_season` |
| LEAGUE-WINNER cut off by one (`ceil` → `int`) | **initially a SILENCE** — see below |
| `classify` calls an unpriced row DEAD instead of UNMEASURED | `barbell_policy.test.js` |
| the class threshold reads projection-space replacement | `barbell_policy.test.js` CONTROL |
| `banClass` also bans UNMEASURED | `barbell_policy.test.js` |
| the phase boundary moves one round (8 → 9) | `barbell_policy.test.js` |
| a barbell arm silently runs the control with no classifier | `barbell_policy.test.js` |
| the driver stops passing `classOf` to the overlay | the run itself throws |

**The silence, recorded because it is the useful one.** Breaking
`tiered_outcome_model`'s `ceil(k/2)` to `int(k/2)` left the guard GREEN — the
test read the COMMITTED artifact, and nothing re-ran the producer. **A guard
that only checks a stored copy cannot see its producer drift.** Closed by
re-deriving the cut live, with a non-vacuity check that at least one position's
K is odd so ceil and floor actually differ. Re-broken afterwards: red by name.

**And three guards went red on their own, before any deliberate break, each
catching a real defect in this pass:**

1. `UNMEASURED === 0` on the shipped board — wrong; 76 skill rows carry
   `proj_mean == 0.0`, and calling them "no upside" would have been a coverage
   gap wearing a finding's clothes.
2. `_verdict` counted `max(positive, negative)` seasons instead of seasons
   agreeing with the POOLED sign, so a CI-clear positive with two negative
   seasons was being called replicated.
3. `replacement − wire > 20` at every position — wrong twice, at QB then TE, and
   the two reds together are §6's finding 4.

## 11. Reproduce

```
node draft/tests/barbell_policy.test.js
python3 draft/backtest/barbell_middle.py
python3 -m pytest draft/tests/test_barbell_middle.py -q
node draft/tools/archetype_rooms.js --rooms 120 --seed 1 \
  --arms shipped,barbell,no_deadweight,anchor_early,upside_late,anti_barbell
python3 draft/tools/barbell_report.py
node draft/tools/barbell_variance_probe.js
```

**No board, model, config or policy change shipped from this document.**
Everything new is Lab tooling (`draft/tools/upside_class.js`,
`barbell_report.py`, `barbell_variance_probe.js`, five arms in
`archetype_policy.js`, per-pick class/slice/give-up columns in
`archetype_rooms.js`), one backtest module (`draft/backtest/barbell_middle.py`),
committed research artifacts, tests, and this document. The four committed
artifacts of `roster_construction_2026-08-16.md` are untouched — the barbell
arms write to `archetype_rooms_barbell*.json`.
