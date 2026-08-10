# The composite Stage-2 washout — why every weight profile grades to ~$0

_Synthesis from data already committed (`LAB-TOURNAMENT.md`, `bridge-results.json`
via the run log). No new run — this reads the divergence columns the tournament
already emits. It is the diagnosis behind three separate nulls, and the
pre-registration for the one build that would change them._

## The three nulls it explains

1. **B3 (full composite) vs arch:balanced control: +$0.00, 0.0 divergent picks/draft.**
   The composite with default weights reproduces the balanced control exactly.
2. **Every weight profile ≈ $0** in the tournament: `profile:upside_late` +$0
   (0th pctile), `profile:tier_hunter` +$5 (34th), all others $0 or −$5.
3. **B3 in the bridge earns near-nothing** ($0 / $100 pooled) at sub-1.0 coverage,
   while **B0 (pure ADP) is the only candidate that clears the null** (+$55, 100th).

## The mechanism — measured, not asserted

The tournament emits, per candidate, **how many decisions per draft actually
differ from the control** and the position mix of those flips. Reading it:

| candidate | divergent picks / draft (2023·2024) | flip mix | pooled $ |
|---|---|---|---|
| profile:upside_late | 3.3 · 1.7 | QB×17/9/16 | +0 (0th) |
| profile:tier_hunter | 2.8 · 0.5 | RB-heavy | +5 (34th) |
| profile:value_anchor | 2.3 · 0.3 | RB/WR | +0 |
| profile:scarcity | 0.4 · 0.5 | DB/FB noise | +0 |
| profile:keeper_builder | 0.8 · 0.1 | TE | +0 |
| B3 (default weights) | 0.0 · 0.0 | — | +0 |

Across ~15 decisions per draft, **a weight profile flips at most 0.5–3.3 of them**,
and the profile that flips the most (`upside_late`) spends those flips almost
entirely on **QBs** — which do not clear the weekly-high band, so the dollar edge
is zero. The composite's recommendation is **dominated by the value/ADP consensus
term**; the weight vector is a marginal tie-breaker, not a behavioral driver. This
is the same failure mode the dead-weight audit found in `stages.js` (0/300 picks
changed), one layer up: the machinery exists, but it is behaviorally near-inert at
the point where money is made.

## Why this matters (and what it does NOT say)

- It says the **composite-vs-ADP third-arm read is unavailable** as built: B3 can't
  express a strategy strongly enough to be graded against B0. The honest current
  answer to "is the composite worth more than following ADP?" is **"not measurable
  yet — and on the evidence so far, ADP-follow (B0) is the only thing that pays."**
- It says the **ensemble (exp 41) is blocked** for the same reason: an ensemble of
  eight profiles that each move ≤3 picks can't diverge more than its members.
- It does **NOT** say the composite is wrong to track consensus — a 10-team league
  with a deep board rewards not-reaching, and B0 (don't reach; fade the RB dead
  zone) winning is consistent with that. The washout is a statement about
  **sensitivity**, not correctness.

## Pre-registered next build (needs the replay egress; gated as the tournament is)

A **behavioral Stage-2**: after the consensus sort, apply the weight/doctrine tilt
with enough authority to move a measurable, money-relevant number of contested
picks — then race it through the SAME gates (arch:balanced control, 200-draw
outcome-shuffle null p95, leave-one-season-out, decision-divergence, bridge
dollars). **Success criterion, pre-registered:** the tilted Stage-2 must (a) raise
divergence into the range where an edge is even detectable AND (b) clear the null
in dollars. If it moves more picks but still doesn't clear the null, **that is the
finding** — consensus-tracking is the ceiling and the doctrine is a UI/comfort
layer, not a dollar lever. Nothing installs before that gate; `stages.js` re-loads
only when `E.recommend` actually starts at consensus and tilts from there.
