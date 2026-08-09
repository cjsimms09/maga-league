# EXPERIMENT 24 — the winning ceiling SHAPE, from BBM finals rosters

_External-data tier. Source: Underdog Best Ball Mania IV (2023) Round-4 finals
pick-by-pick dump (`draft/data/bbm/`, sha256 in MANIFEST.json). Run:
`python3 draft/backtest/exp24_bbm_shape.py <csv> draft/backtest/exp24.json`.
Result JSON: `exp24.json`._

## The question (the one the league structurally ignores)

Our weekly-high pool is **37.5% of the pot** and pays **distribution shape —
ceiling, not floor** — while nine of ten owners draft for head-to-head floor.
So: **what positional construction separates a roster that WINS the top of the
pool from one that merely qualifies?** Our three seasons cannot answer it
(n≈27 of Cory's picks, no counterfactual rosters). BBM can — the finals dumps are
hundreds of outcome-labelled elite rosters, each an 18-man best-ball build whose
total score decided a real \$2M tournament.

## Why finalists isolate ceiling

Every one of the 441 finals rosters already survived from ~700k entries through
three advancement rounds. So **top finishers vs typical finalist isolates pure
ceiling** — which is exactly the signal our weekly-high pool rewards, at a sample
our league will never reach.

## The result (BBM IV finals, n=441, each roster exactly 18 players)

Top-decile finals scorers vs the typical finalist, as a **fraction of roster**
(fractions so an 18-man BBM build and our 15-man build are on one axis):

| position | winner−field (Δ fraction) | sign-stable across 5/10/25% cuts? |
|---|---|---|
| **RB** | **+1.0%** (≈ +0.2 slots) | ✅ stable (over-weight) |
| **WR** | **−1.3%** (≈ −0.2 slots) | ✅ stable (under-weight) |
| TE | +0.6% | ❌ flips |
| QB | −0.3% | ❌ flips |

**Headline: at the elite ceiling, positional COUNT-shape barely separates finals
winners from the field.** The only sign-stable directions are a *mild RB-over /
WR-under tilt, both under a single roster slot.* This is a near-null — and a
near-null is itself informative and is what an honest instrument returns (a
fixture that could not fail would not produce one; cf. the three self-agreeing
backtests this month).

## What the near-null means (and where the money question actually lives)

The finals is a single three-week window (weeks 15–17), so a roster's finals
score is dominated by **which players spiked those specific weeks**, not by how
many of each position it drafted. Read straight, exp 24 says: **at the top of the
pool, WHICH players boom beats gross positional allocation** — which *supports*
the spike-week / individual-ceiling thesis over a count-shape thesis, and tells us
the construction edge is in **QUALIFYING** (the full regular-season field), not in
finals variance.

That fuller question needs the **full-field regular-season dump** (BBM IV R1,
~4.8 GB — reachable but larger than the sandbox disk allowance), where every
entry has an outcome and a contemporaneous ADP. It runs in CI
(`bbm-probe.yml`): the **dead-zone at full N** (do rounds-3–6 RBs underperform?)
via the memory-safe streaming aggregator, plus full-field winning shape and
BBM-ADP-vs-outcome. That is the higher-power construction result; this finals cut
is the cheap, in-hand first read.

## Discipline (the caveat wall — all attached to the finding in `exp24.json`)

BBM is **12-team, 18-round, no-keepers, BBM-scored (half-PPR, 4-pt passing TD)**.
So the transferable object is the **direction and the per-position fraction**,
never a literal count to copy. The finding is tagged `bbm-supporting`,
`crosses_wall: true` (drafting a shape is *construction*, not the lineup-setting
*execution* best ball removes), and carries `scoring_is_bbm` (rankings are robust
for shape but a QB-value finding would not cross). **Big foreign data proposes;
our data disposes** — this is a prior for a league-conditional, money-graded,
null+CV test, not a board install.

## Verdict

- **KEEP as a supporting prior**, weighted dynamically (`combine_tiers` /
  `evidence_weight.py`), not installed.
- **The count-shape lever is weak at the ceiling** — do not chase a positional
  quota for the weekly-high pool; the near-null says allocation isn't the edge.
- **Escalate to the full field (CI)** for the dead-zone and qualifying-shape — the
  higher-power questions this cheap cut points at.
- **The spike-week instrument** (`bbm_translate.spike_weeks`, bar now derived from
  the harvested winning-score median) is the better ceiling lens than count-shape,
  consistent with this near-null. Pursue it on per-week data.
