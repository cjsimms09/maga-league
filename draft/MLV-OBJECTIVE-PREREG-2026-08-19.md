
---

## 12. PREREG — EXACT DP (`--objective-dp`): the TRUE optimum, committed before the run

Cory: "why not do the montecarlo thing now?" In the harness the opponents are
the recorded picks — deterministic — so the stochastic DP collapses to EXACT
deterministic DP, and the true optimum of the construction problem is
computable. **This is a DIAGNOSTIC, not a shipping arm:** it bounds what ANY
construction rule of ANY complexity could achieve in this framework.

**Mechanism.** A position-sequence DP over (my pick slot, position counts),
exact by three reductions, each provable in the fixed-draft setting:
(1) within a position, always take the current best available — my k-th take
at slot r is exactly the (k+1)-th best of the position's opponent-surviving
list at r (exchange argument, proven in the fixed draft); (2) the single flex
slot is handled exactly by enumerating its source (RB/WR/TE/none — four
additive DPs, max taken); (3) keepers pre-occupy their position stacks at
their recorded values. K≤1/DEF≤1 cap and full legality enforced at the
terminal (illegal = −inf). Values in the harness's own rank units.

**Built-in control, non-negotiable:** the DP's internal objective must be
≥ MLV's achieved internal objective in EVERY seat — an "optimum" that any
greedy beats anywhere is a bug, and the run refuses.

**Declared predictions:**
- **Gap prediction: DP's internal-objective gain over MLV is < 5% in ≥ 25/30
  seats.** If true, construction is CLOSED — no equation, calculus or
  otherwise, has meaningful room above the greedy in this framework, and the
  answer to "can't you find a more complex equation" becomes a measurement.
- **Grading prediction: the DP-optimal rosters do NOT beat MLV's on the skill
  grading beyond noise** (internal-optimum ≠ graded-points optimum; chasing
  the last internal points buys noise). If DP DOES beat MLV on skill by > 10
  pts/season, MLV is leaving real value behind and the DP policy becomes a
  candidate arm — that outcome would be reported as eagerly as the other.
