# THE ADAPTATION POLICY — how the in-season models tinker without fooling us
<!-- TERRITORY: relay (the policy); D owns its execution in the Tuesday grader.
     2026-08-20. Cory, verbatim: "Our in season prediction models should adapt
     quickly, keep tinkering with what works, if something doesn't work, try new
     things, never stop trying to improve." This file makes that a MECHANISM with
     thresholds committed before week 1, so speed never turns into result-chasing. -->

**The tension this resolves:** adapt-quickly and preregister-everything pull
against each other. The resolution is to preregister the ADAPTATION RULES
rather than freezing the arms — the rules below are committed before any
graded week exists, so no threshold can be invented after a result.

## The three rules, thresholds committed now

1. **QUICK-KILL — ⚠️ NOT IMPLEMENTED, and this line used to claim it was
   automatic.** As written: any published arm grading below the champion for
   3 consecutive graded weeks is BENCHED, automatically, with the Tuesday
   grader printing the verdict. **Measured 2026-08-21 (register 199):
   `weekly_own_grade.py` contains 49 mentions of `promot` and ZERO of
   bench / quick-kill / demote / retire; `own-weekly-grade.yml` has none
   either. There is no `decide_bench()`.** So a published arm that degrades
   keeps publishing indefinitely and can only be displaced from below by a
   challenger under rule 2 — **promotion is machine-enforced and benching is
   not.** Left stated rather than deleted because the rule is wanted; A has
   the ruling open (implement it, or say benching is manual and by whom).
   **Until then, treat this rule as a stated intention, not a mechanism.**

2. **QUICK-PROMOTE — RESTATED 2026-08-21 TO MATCH THE CODE (A's ruling,
   register 199).** This rule previously said *"beats the champion for 3
   consecutive graded weeks AND clears the best-of-K null"*. **Both halves
   were wrong about the shipped rule**, and the doc was the simpler of the
   two, so the DOC moved: the code's rule is strictly richer, and
   *3 consecutive* silently dropped two live conditions. A shadow arm is
   PROMOTED when **all four** of these hold:

   a. at least **`PROMOTION_MIN_WEEKS` = 3** graded weeks in common with the
      champion;
   b. it beats the champion in **3 of the last 4** common weeks —
      `PROMOTION_RECENT_WINS` of `PROMOTION_RECENT_WINDOW`, **consecutive not
      required**;
   c. it leads on **cumulative MAE** across the whole common span; and
   d. its cumulative **Spearman** is not worse than the champion's by more
      than **`PROMOTION_SPEARMAN_TOLERANCE` = 0.02** — a non-regression
      guard, so an arm cannot buy MAE by wrecking the ordering.

   **AND it must clear the best-of-K null, which now GATES rather than being
   attached** (A's ruling (3)). The only stated reason it did not gate was a
   comment in `decide_promotion()` claiming the rule was *Cory-ruled
   verbatim*; **that was traced and is FALSE — the thresholds are `3a4a2805`'s
   own design (08-16) and no Cory ruling on these numbers exists on either
   side.** A blocked promotion is recorded on the ledger under
   `blocked_promotions` with its reason, because a block recorded nowhere is
   indistinguishable from a week when no arm qualified.

   ⚠️ **KNOW WHAT THE GATE BUYS, AND WHAT IT COSTS — both measured, not
   assumed.** Register 211: the rule as shipped promotes a **skill-free arm in
   95.0% of seasons**; gating best-of-K cuts that to **17.9%**, but reaches
   only **22.7%** power at a realistic −15% MAE edge and **54.8%** at −40%.
   This is an improvement, not a solved gate. And the gate is **UNREACHABLE at
   small n** — with 2 active arms even a perfect challenger scores p=0.2584 at
   3 weeks, 0.1279 at 4, 0.0710 at 5, and first clears at **6 weeks**; with 4
   arms it first clears at 4. **So gating raises the EFFECTIVE minimum from 3
   weeks to six when only two arms are active.** `decide_promotion()` reports
   that case as *cannot pass at this size* rather than as a verdict on the
   arm, because those are different statements and only one is evidence.

   One promotion per week maximum — two arms clearing at once means the
   better margin goes first and the other waits a week (churn is its own
   failure mode).

   ⏰ **TIMING, which is why this landed on 08-21:** no graded week existed
   yet, so aligning doc and code was not a post-result threshold move. After
   week 1 it would be exactly that, and `no_fit_guard` forbids it.
3. **NEVER-EMPTY:** every Tuesday, each of D/E (and C for capture health)
   files at least one of: a new blind P-row · a graded P-row · a line reading
   `NOTHING — <reason>`. The ledger's OPEN floor (≥6) already guards the
   program pipeline; this guards each LANE's pulse. The relay sweeps every
   Wednesday and files the miss as a ROUTES item, named.

## What the rules do NOT allow

No threshold moves after a result it would affect (the no_fit_guard clause).
No arm edits mid-week — an improved arm is a NEW shadow arm with its own
P-row, never an in-place patch to a published one (in-place patches are how
a graded history stops meaning anything). Weekly re-fits are fine INSIDE an
arm only where its prereg declared a walk-forward fit (the one stacker rule,
BLEND-SEARCH-DESIGN §Tier-2).

## Cadence, one line

Tuesday: grade everything → print bench/promote/hold per arm → file the
P-rows → change what the rules say to change → Wednesday: relay sweeps.

---

## THE THREE-PART FILING STANDARD — Cory's ruling, 2026-08-20, verbatim

> "Everytime we predict and grade something we need to make sure we are
> predicting the right things to learn, grading it the right way to actually
> capture skill not luck and using that info to either explore new ideas or if
> we found an edge, implement it.."

Every NEW ledger row filed from this date states, inside the claim cell:

1. **THE LEARNING TARGET** — the decision this grade changes. A row whose
   grade would change nothing is not filed (the ledger check already fails
   "a grade that moved nothing"; this moves the test to FILING time).
2. **THE SKILL DESIGN** — what separates skill from luck in the grading:
   a paired counterfactual, a persistence/naive null, a baseline arm, or a
   pre-declared chance rate. A raw outcome with no comparison is a weather
   report, not a grade. (House precedents: Cory's skill-not-luck replay
   ruling; best-of-K; the RANDOM-WEIGHT null; P144's persistence null.)
3. **THE CONSEQUENCE ROUTE, PRE-DECLARED** — TRUE routes to (implement:
   named surface/owner) and FALSE routes to (explore: named next question),
   or the reverse. "Interesting either way" without a route is how findings
   die in registers.

The relay's Wednesday ledger sweep checks new rows against all three and
bounces non-conforming rows back to their lane with the missing part named.
Exemplar filed the same day: **P282** (the bench-option weekly waiver
valuation), written to be copied.

### Amendments to the standard from the SIAM skill-luck paper (Cory's upload, 08-20)

* ~~**The skill-design menu explicitly includes split-half persistence**:
  any arm, tool, or edge with ≥20 graded outcomes reports R* beside its mean.~~
  **⚠️ SUPERSEDED 2026-08-21 — THE ≥20 THRESHOLD WAS FAR TOO LOW AND THE RULE
  HAD NO MECHANISM.** Two defects, both measured:

  **(a) n≥20 prescribes on the wrong quantity.** Power for R* is driven by the
  size of the real EFFECT, not by the outcome count. Measured on synthetic
  leagues with a known persistent spread (25 seeds/cell, MC null per draw), at
  our league's own spread of ≈0.106 (observed all-play range .366–.578):

  | true spread | n=50 (today) | n=100 (~6 seasons) | n=150 (~9 seasons) |
  |---|---|---|---|
  | **0.10 ← ours** | **12%** | **16%** | **20%** |
  | 0.20 | 60% | 88% | 96% |

  A threshold that admits n=20 manufactures non-significant numbers that then
  get quoted as *"not skill"* — **a false negative dressed as a finding**,
  which is exactly rule 3e's shape. Nine more seasons still leaves us at 20%.
  Corrected: **R* is not required of any arm, and is not to be run on league
  standings as a certification at all.** It stays available as a descriptive
  instrument, and its null band remains mandatory whenever it IS quoted.

  **(b) NOTHING CALLED `skill_luck_r.py`.** No grader, no CI check, no
  workflow — a tool sitting beside a policy sentence with no mechanism behind
  it. By this file's own enforcement principle that is a rule that decays, and
  it had already begun to: the sentence was written on 08-20 and was still
  unwired on 08-21.

* **⭐ WHAT REPLACES IT — GRADE THE DECISION AGAINST A CONSTRUCTED NULL, NOT
  THE OUTCOME AGAINST OTHER OWNERS.** Getty et al.'s paper carries FOUR tests
  and we had implemented only the fourth (persistence). Its **third** — *"do
  the ACTIONS a player takes have statistically significant impact on
  payoffs?"* — is answered by comparing the real decision against a Monte-Carlo
  null of random LEGAL alternatives. **The null is built PER DECISION, so power
  scales with the number of decisions rather than the number of competitors**,
  and a ten-owner league stops being the binding constraint.

  Demonstrated, not asserted: `draft/backtest/start_sit_vs_random.py` grades
  530 owner-weeks of start/sit against random legal lineups from the same
  roster. **Mean percentile 0.8497 against a null band of [0.4754, 0.5246]** —
  a decisive answer from the same league and seasons where R* could not
  produce one. Controls run on every invocation: random-lineup owner 0.510,
  oracle owner 0.999.

  **THE STANDARD, AS THE SKILL-DESIGN MENU'S FIRST ENTRY:** a graded decision
  states the null it was graded against and that null must be CONSTRUCTIBLE —
  random legal lineup, random available player at the position, random legal
  pick from the board at that moment. A grade with no constructible null is a
  weather report.

  **AND REPORT THE MARGIN IN THE UNIT THAT PAYS, NOT THE PERCENTILE.** "Beats
  random" is a low bar — random benches your stars. The number that moves a
  decision is the gap to the perfect-hindsight choice: **the league leaves 15.90
  points on the bench per week; Cory 17.33 ± 1.68, the best owner 12.06 ± 1.43,
  a gap of ≈2.4 SE worth ~74 points a season.** Ranks between adjacent owners
  are inside one SE and are NOT findings; say so wherever the table is shown.
* **Quick-kill creates a quitting-boundary bias in our own records** (the
  paper's boundary-layer finding, pointed at ourselves): benching an arm after
  3 bad weeks truncates its record at its worst and flatters every survivor.
  Cross-arm comparisons must include benched arms' records to the bench date,
  or state the truncation. The Wednesday sweep checks comparisons for this.

### Enforcement, made mechanical (Cory, 08-20: "do we need to do something more strict")

`prediction_ledger_check.js` (CI) now enforces the three-part standard:
**every row from P283 fails the build immediately** if its claim lacks the
labeled LEARNING TARGET / SKILL DESIGN / CONSEQUENCE ROUTE; the **88-row open
back-catalog is under a grace window — warnings until 2026-09-10, FATAL
after** (Cory's back-audit order: existing processes change to meet the
standard, on a clock, without redlining every lane in one hour). Owner
burn-down counts routed in ROUTES; the relay's Wednesday sweep reports the
remaining count until it is zero.

### Audit ruling (Cory, 08-20, verbatim)

> "anything regarding this and our predicting, grading and its process also
> needs to be sent to openAi auditor. at least if it is a structural change,
> not every prediction or grade but initial builds should be"

**STRUCTURAL changes to the prediction/grading process** (a new gate, a new
grading instrument, a change to the standard itself, an initial build of a
grading harness) **go to the OpenAI auditor via A before they are relied on.
Individual rows and routine grades do not.** The 08-20 loop-governance
package (this standard, the CI gate, `skill_luck_r.py`) is the first
submission under this ruling — routed in ROUTES the same day.

**AMENDED BY CORY, 08-21, verbatim: "Every audit cost money!! Once you think
we're too a point you can correct then stop sending."** Operationalized (the
judgment call is A/relay's, per B's correct read): a structural change is
submitted only when **(a)** it is a NEW CLASS of change the auditor has not
yet confirmed, or **(b)** internal review has a named disagreement it cannot
settle. Once a class is audit-confirmed AND our own gates demonstrably catch
that class's mistakes, submissions of that class STOP. The evidence standard
is the gate catch-record, not a feeling — 08-20/21 already shows it working
twice (the relay's ledger pipe-split and A's defect re-instance, each caught
by our own gates in one run). The queued 08-20 consolidated package
(bench-option + loop governance + the friction three-run study) completes
its round-trip as those classes' confirmation; after it, same-class changes
go internal-first.

## THE CROSS-PROPAGATION RULE (Cory, 08-21: "Make it a rule!")

Cory's question, verbatim: *"if one prediction is graded and finds a
correlation or pattern, should the others try to use it as well? Or does this
contaminate everything?"* Ruled: **propagate, mandatorily — but through the
ledger, never directly.** The contamination risks have names (selection noise
— the P3/P4 killer; correlated failure — shared priors end the mutual-catch
culture; data reuse — a pattern "confirmed" on the data it came from), and one
hop of quarantine defeats all three:

1. **A graded finding propagates as a HYPOTHESIS, never as an edit.** When a
   grade surfaces a pattern, the relay (rule 3g owner) routes it to the other
   lanes as NEW preregistered prediction rows — "this pattern, applied to tool
   Y, will do Z, grade by DATE." Nothing is written into another tool's
   weights, thresholds, or logic on the strength of the first grade.
2. **A pattern must win TWICE ON DIFFERENT DATA before it ships.** Only the
   second, out-of-sample grade in the destination tool's own context earns
   implementation. The first grade nominates; the second grade decides.
3. **A frozen no-learning baseline runs forever.** One arm that never absorbs
   any propagated pattern (the BEST-OF-K-family null BLEND-SEARCH-DESIGN
   already owes) is graded alongside the learning-enabled arms. If learning
   cannot beat the arm that ignored every finding, the loop is circulating
   noise, and the /admin/loop page should show that comparison the day the
   first cross-propagated prediction grades.

**Enforced, not promised** (effective from P298, post the 08-21 renumber):
`prediction_ledger_check.js` fails the build on any row whose *what changed*
cell claims an implementation (the IMPLEMENT token) without naming its
second grade (`second-grade:P<n>`), declaring it pending
(`pending-second-grade`), or carrying a labeled exemption (`exempt:
<reason>` — e.g. a pure capture with nothing to cross-validate). A false
positive costs one explicit marker; a silent direct-edit is exactly the
contamination Cory asked about.

**Audit note:** this is a new structural class under the 08-20 audit ruling;
it rides with A's queued consolidated package rather than a fresh
submission (Cory 08-21: "Every audit cost money!!").


## GRADING-POLICY.md SUPERSEDES THE SKILL-DESIGN MECHANICS (A, ruled by Cory, 08-21)

The three-part filing standard stands unchanged — but the SKILL DESIGN part of
any DECISION-type row now means the four requirements of `GRADING-POLICY.md`:
the decision and its moment · a CONSTRUCTIBLE null of the legal alternatives ·
two controls that run every time and gate the exit code (a control that cannot
fail is worse than none) · the margin in the unit that pays. The 08-20
split-half/R* rule is WITHDRAWN as a skill instrument (12% power at our
measured spread); R* is descriptive only. Captures stay exempt but must say so
in the SKILL DESIGN cell. Cory's escalation, verbatim: "make sure everyone
implements including for things we've already started!!" — rows and
instruments with an ACTIVE grading design convert now; dormant back-catalog
rows convert on the existing 2026-09-10 clock. The relay's Wednesday sweep
enforces the four requirements in place of the withdrawn n>=20 rule.
