
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

---

## 13. PREREG — WAIVER-AWARE GRADING (`--grade-waiver`), committed before the run

Cory: the frozen-roster grading "fully excludes waiver pickups. That's terrible
and not realistic." Correct, and it applies to every arm symmetrically. Fix:
grade BOTH rosters under a streamed game — every starting slot is floored at
its position's measured weekly waiver level (season levels from
ROSTER-CONSTRUCTION-CALL.md §2, this room's own three drafts: QB 322.9 ·
RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0, divided by 17; flex floor
= the best flex-eligible level). Applied inside `bestLineup`, so actual and
skill arms both inherit it, both sides identically.

**Declared before running:** under waiver-aware grading, MLV-cap still beats
the owners on BOTH gradings (actual > 0, skill > 0), and its actual delta
stays inside the frozen arm's bootstrap CI [+10.0, +81.7]. If the edge
INVERTS under the realistic game, the frozen-grading result was an artifact of
ignoring waivers and every conclusion above is downgraded accordingly — filed
either way.

## 13b. P136 HONESTY NOTE — opponent reaction was measured WITHOUT a blind prereg

The `--react` arm ran before its bar was committed (implementation preceded
declaration). Labeled exploratory, not blind: actual **+32.7 (21/30)**, skill
**+14.9 (18/30)** — both call bars still cleared, the drop from the frozen
pool is −13.1/−14.4, and the actual WIN COUNT improved. Limit 5's answer:
opponent adaptivity costs ~13 points and does not change the verdict.

**§13 GRADED, SAME DAY: PARTIAL FALSE, AND CORY'S INSTINCT WAS RIGHT.**
Clause (a) holds: MLV-cap still beats the owners under waiver-aware grading —
**actual +2.6 (18/30), skill +2.1 (16/30)**, sign preserved on both. Clause
(b) FAILS: +2.6 is far outside [+10.0, +81.7]. **The downgrade applies: most
of the frozen-game +45.8 was an artifact of grading a streamed game as
frozen** — the floors raise exactly the weak slots that real waivers patch for
the humans. What survives, and it is the durable ordering: **MLV ≥ humans ≥
shipped curve under EVERY grading tried** (frozen, opponent-reaction,
waiver-aware, points-units). The shipped curve gets WORSE under the realistic
game: **−39.1 actual (12/30)** vs −20.4 frozen. The strongest robust claim in
this document is now: the shipped curve should not draft Saturday; MLV-cap is
the best measured rule; and its real-game margin over a good human is small.
