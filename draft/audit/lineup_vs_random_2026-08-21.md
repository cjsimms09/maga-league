# THE ARM HAS SKILL AND STILL LOSES TO THE OWNERS — the start/sit decision-null P143 was graded without

**Session D, 2026-08-21.** Builds the instrument `GRADING-POLICY.md`
requirement 2 names for a start/sit decision — *"a random legal lineup from
the roster held that week"* — for the **arm**, which nothing could do before.
Tooling: `draft/tools/lineup_vs_random.js` (new, TERRITORY: D), an additive
`onWeek` hook on `draft/tools/lineup_edge_backtest.js`, tests
`draft/tests/lineup_vs_random.test.js` (**23/23**), artifact
`draft/backtest/lineup_vs_random.json`. **REPORT ONLY — nothing ships.**

---

## 1 · WHY IT DID NOT EXIST

Two harnesses each had half of it.

* `start_sit_vs_random.py` (A) builds the null correctly and grades **owners**
  — but it chooses and scores from one `pts` dict, so it cannot score an arm
  that chooses on projections.
* `lineup_edge_backtest.js` (D) chooses on projections, scores on actuals and
  already computes perfect hindsight — but had **zero mentions of `random`**.
  It compared the tool to the **humans**, which is the outcome-vs-owners shape
  the 08-21 policy replaces, and which P143's conversion failed its NULL
  requirement for.

The missing piece was small and specific: the backtest's rows carry points, not
**choice sets**, so nothing downstream could see what the arm was choosing
from. `onWeek` hands out that week's roster, eligible ids, positions, actual
points and slots. Omitted, it is a no-op — the same guarantee the P143
`projectFn` addition carries.

## 2 · THE RESULT

420 owner-weeks, 2023-25, 200 null draws each.

| | points left vs hindsight | percentile vs the null |
|---|---|---|
| the arm | **29.87 / wk** | **0.6272** |
| the owners | **15.33 / wk** | **0.8629** |
| a random legal lineup | — | 0.5000 |

**The arm has real skill: 0.6272 is comfortably above the null's centre.** That
is a thing P143 could not say in either direction — it measured the arm against
the humans and lost, which is consistent with skill, with no skill, and with
anti-skill alike.

**And it is roughly half way from random to the owners**, who are the ones
actually leaving 15.33 points a week on the bench. In the unit that pays, the
arm gives back **14.54 points a week more than the humans do**.

## 3 · TWO CROSS-CHECKS, NEITHER OF WHICH COULD BE ARRANGED

* **−14.54 reproduces `lineup_edge_backtest`'s own `edgeVsActual` exactly.**
  Two paths through the same history agreeing to the cent.
* **The owners' 0.8629 lands beside A's independent Python measurement of
  0.8497** (`start_sit_vs_random.py`, 530 owner-weeks, its own population).
  The two implementations share no code and are written in different
  languages. Pinned as a test, so a future divergence is a failure rather
  than a footnote.

## 4 · THE CONTROLS, AND THE ONE THAT FAILED FIRST

Five, all gating the exit code (register 198).

1. **known-negative** — an independently drawn random agent lands at the null's
   centre. Drawn from `SEED_NEGATIVE`, never from the sample it is scored
   against; the policy records why in its own words.
2. **known-positive (a)** — no null draw beats perfect hindsight, any week.
3. **known-positive (b)** — hindsight sits at the top of the null (≥ 0.99).
4. **known-positive (c)** — hindsight ≥ both the arm and the human, every week.
5. **non-degenerate null** — no week's draws are all identical.

**⚠️ The known-positive failed on its first run, and the CONTROL was wrong, not
the arm.** It asserted that perfect hindsight sits at percentile **1.0**.
Measured instead of argued with: **in 133 of 420 weeks (31.7%) at least one
random legal lineup TIES the oracle**, because a roster with few legal
permutations lets a blind draw stumble onto the optimum, and `percentile()`
counts ties as half. A further 26 draws of 84,000 read as *strictly above*
hindsight — **max excess 5.7e-14**, floating-point summation order, now handled
with an explicit epsilon rather than a rounding step that would have hidden it.

The check that replaced it still fails for every real reason the old one would
have: invert the percentile and (b) collapses; align hindsight to the wrong
week, break the solver's optimality, or draw the null from a different roster,
and (a) or (c) goes red. Each is exercised red in the test file.

**Check 5 is the one neither of the others would catch.** A null whose draws
are all identical makes every percentile meaningless while looking normal from
outside — hindsight still tops it, and a random agent still ties at the centre.
It is register 198's boom-baseline break in a second harness.

**And the fixture had the same disease.** The legality assertions were first
written against `slots` as an ARRAY; `bestLineup` iterates its keys, so it
returned an EMPTY lineup and three assertions passed while testing nothing.
Caught only because a fourth check — *the draw explores more than one legal
lineup* — went red beside them.

## 5 · WHAT THIS UNBLOCKS

* **P314** (P143's successor) gets its instrument. The question it asks —
  structural ceiling of leak-free in-season history, or a missing real-time
  channel — is now askable in skill terms rather than only in points.
* **P298** (the frozen no-learning baseline) gets the one the cross-propagation
  rule needs: the frozen arm and the learning arm score against the **same**
  null, so the question becomes the difference of their margins rather than a
  comparison of one arm to the other.

## 6 · THREE-PART FILING

* **LEARNING TARGET:** whether the lineup arm carries any skill at all, which
  the outcome-vs-owners comparison structurally could not answer.
* **SKILL DESIGN:** decision-vs-constructed-null (Getty et al. Test 3), the
  null drawn through the solver's own legality rules rather than a second
  implementation, five controls gating the exit code, margin reported in
  points before percentile.
* **CONSEQUENCE ROUTE:** report-only. The number that would move something is
  the arm-vs-frozen-arm difference under P298, not this level; filed so that
  comparison has a shared yardstick.
