# EXPERIMENT 34 — the measuring stick, PRE-REGISTERED before it fires

_Redesigned 2026-08-09 after Cory rejected the single-pick comparison (correctly)
and specified the policy-level metrics and the sensitivity surface. The flawed
version was **NOT fired.** Expectations are registered here, per dimension, BEFORE
the numbers exist — the same discipline as PRE-REGISTRATION-34 and the cap._

## The principle: measure the POLICY, not the pick

41 single-pick comparisons (my guy vs their guy) are 41 coin flips dominated by
which specific player broke out, on one noisy board. That is not a test of the
model. The question is: **does our ordering of the available pool predict realized
value better than the market's ordering — and WHERE on the board have we earned
the right to deviate?**

## "Our ordering" — the one architectural decision, stated honestly

For the value-ranking metrics, **our ordering = our walk-forward projected points**
(`projections.py:walk_forward`, strictly prior-seasons-only, the decision-time-safe
projection the tournament's B3 already uses). Rationale: (a) decision-time honest —
no leakage; (b) it isolates *value prediction* from *roster need* — the composite's
need/tier tilts are about MY roster, not about who is better, and folding them in
would confound a value-prediction test; (c) it is buildable in Python without the
JS engine. **The composite-ordering variant** (the full `E.recommend` ranking via
the JS replay path) is a labelled follow-up, not this run. The blocked third spec
arm — "what the tool would recommend" — remains blocked for the same reason it
always was: no archived decision-time composite.

## THE PRIMARY METRICS (reported together)

1. **RANK CORRELATION over the available pool** _(primary)_. At each of my 41 real
   picks, over every player actually on the board: Spearman(our projection,
   realized ROS points) and Spearman(ADP, realized). Report both with bootstrap
   CIs (resampling over the 41 picks) and **their difference**. Turns 41 decisions
   into thousands of pairwise comparisons; measures whether our ranking beats the
   market's ranking, robust to single-player noise.
2. **TOP-N SET VALUE**. Mean realized points of our top-5/top-10 vs ADP's
   top-5/top-10 of the available pool, per pick, aggregated. A rec is not wrong
   because #1 busted if #2 and #3 hit — the honest "would following us have been
   better."
3. **REALIZED DOLLARS** _(secondary read)_. The points result translated through
   the money grader, carrying its assumptions — per-pick dollar attribution is
   approximate, so points lead and dollars annotate.
4. **ROOM-REVEALED ARM** _(its own comparison)_. Same metrics with the ROOM's
   actual draft order as the "market" instead of ADP: did we beat these nine
   humans, not just the national board.

## THE DELIVERABLE — the deviation-edge surface (named plainly, no options costume)

Not a pass/fail. A surface: **the deviation edge as a function of four measurable
dimensions**, each a CURVE with intervals, each with n flagged where thin. This
surface *is* Stage 2's calibration — binding strength as a function of where we are
and what the market's confidence looks like, from data instead of one guessed T.
(The cap's inertness at a flat T=4.0 is the symptom this explains: one gate on a
board whose right gate varies by an order of magnitude.)

The options frame (Cory) is the LENS that says what to measure — it is **not a
doctrine and gets no options vocabulary on any surface.** "Delta/theta" on a draft
card would be the ceremonial-voice problem in a costume. Measure the quantities;
name them plainly:

| dimension | measure | **pre-registered expectation (to test, not assume)** |
|---|---|---|
| **board position** | deviation edge by pick-region (early / middle / late rounds) | ADP is tight & efficient early (thousands of drafters, first ~30), loose late → **bind HARD early, LOOSEN late.** |
| **tier-cliff proximity** | hit-rate on deviations that CROSS a tier boundary vs stay INSIDE one | crossing a cliff is the expensive bet → **if we lose anywhere it is crossing cliffs; anchor stronger near cliffs, relaxed inside tiers.** |
| **round / draft decay** | realized COST of a bad deviation by round (early picks recover, late don't) | **a miss at 34 is absorbed by later picks; a miss at 141 is a wasted spot** → cost of a bad deviation rises late; interacts with board position. |
| **market dispersion** | edge on CONTESTED (high ADP stdev) vs UNANIMOUS players (FFC published stdev where available, fitted sd otherwise) | our deviation is cheap where the market disagrees with itself → **if we have an edge it concentrates in contested players, narrow but real.** |

## MULTI-BOARD BASELINE — no single ADP is truth

Run every metric against each reachable market view and report whether the verdict
is **stable across boards**: FFC half-PPR (confirmed, all 3 seasons) · Underdog BBM
`projection_adp` (per-season, identified — reachable **iff we hold the files**;
probe by looking, not curling) · any other reachable source. A verdict that flips
with the board is not a verdict.

## Discipline (binding)

- **Pre-registered expectations above; not tuned after the numbers.** Where a curve
  contradicts an expectation, that is the finding.
- **Report intervals everywhere; flag thin n loudly.** 3 seasons × pick-regions ×
  tiers × dispersion buckets is a lot of cells on ~41 decisions — most cells will
  be too thin to support a curve. Say so; do not smooth over it. Pooling rules
  (by round-band, by position group) are declared before the numbers, per exp 36.
- **Inconclusive → the anchor binds HARDER, not looser** (PRE-REGISTRATION-34),
  everywhere the CI spans zero.

## Build status (2026-08-09)

- ✅ **Pure alignment core built + verified in-sandbox** (`exp34.py` helpers,
  `test_exp34.py` 7/7): Cory's roster_id resolved per season (his slot moves),
  keepers excluded, **41 non-keeper decisions reproduced** (2023:15 / 2024:14 /
  2025:12), ungradeable picks dropped not zeroed.
- ▶ **NEXT UNIT — the surface implementation** (fresh context): the five metrics +
  the four-greek surface as pure functions over per-pick pool records
  {player_id, our_proj, adp_by_source, realized, dispersion, tier}, unit-tested
  with fixtures; then the egress main assembles the pool from `walk_forward`
  projections + multi-board ADP + `rest_of_season_points` realized, and fires as a
  `lab.yml` job (FFC + nflverse egress). Points primary, dollars secondary, room
  arm separate. **The single-pick summary is superseded and will not be reported.**
