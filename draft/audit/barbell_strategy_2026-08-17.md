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
