# PREREGISTRATION — the flex body's replacement is not its own position's wire

**A, 2026-08-19, committed BEFORE the run.**

Cory: *"really should have more WR then RBs because they score more points on
average at least after the top 15 RBs are gone. So really once 2 starting RBs
are taken they're competing for flex and WR will almost always win that… WR 30
scores a lot more than RB 30. BUT. We still need at least 3 RBs due to injuries
and bye weeks. This equation will be somewhat complex but meeting this
requirements is how we will know we got the right equation."*

---

## ⚠️ FIRST — MY OWN P169 WAS A RULE 3i VIOLATION AND IT IS BEING CORRECTED HERE

**P169 reported "backs project higher" from the median of the top 36: RB 202.3
vs WR 186.1.** That window straddles the crossover. **Rank for rank, WR passes
RB at rank 23 and never gives it back** — +8.4 at rank 30, +49.0 at 45, +58.2 at
55 — and the median of ranks **25-50 is RB 136.2 / WR 146.0**, the other way.

**I quoted one median across a distribution that changes sign inside it, hours
after writing the rule against exactly that.** Cory's instinct put the crossover
at 15; the board says **23**. His direction was right and my summary was not.

**This does NOT overturn P168.** Steepness and level are different facts: the RB
curve still drops 92.1 points between demand rank and wire against WR's 47.0.
Both are true and the equation needs both.

## THE DEFECT, STATED EXACTLY

The equation prices every body as `P(start|available) × (C − R)` with
**`R = waiver_level(own position)`**. That is right for a body that fills a
**dedicated** slot and **wrong for the body that fills the FLEX** — because a
flex slot does not care what position fills it.

With `RB2 WR2 TE1 FLEX1`, the **3rd** running back does not occupy an RB slot.
He occupies the flex, and **his alternative is not RB #48; it is the best
flex-eligible body available.** The current rule credits him a 78.4 replacement
that he could never actually claim.

**At rank ~30, this is the whole disagreement:**

| | R used | RB3 margin | WR3 margin | winner |
|---|---|---|---|---|
| **shipped rule** | own-position wire | **75.2** | 37.1 | RB by 2.03× |
| **derived rule** | best flex-eligible wire | 23.2 | **31.5** | **WR by 1.36×** |

**This is Cory's mechanism, and it is derived from what a flex slot IS — not
chosen because it produced the roster he wants.** That distinction is the whole
reason this is a prereg and not a tuning pass.

## THE CORRECTION

```
R(q, n) = waiver_level(q)                        if body n fills a DEDICATED slot
        = max over flex-eligible q' of waiver(q') if body n fills the FLEX
        = waiver_level(q)                        if body n is BENCH
```

**No new constant, no fitted weight.** Which case applies is decided by the
league's own `starters` block and how many of that position are already held.

⚠️ **AND ONE INPUT I DISTRUST, FLAGGED BEFORE THE RUN (rule 3d).** The raw max
flex-eligible wire is **TE 130.4**, above WR's 124.8 — yet real teams flex a
tight end **1.7%** of the time. Either the TE wire rank (15) is too shallow or
TE projections sit high relative to receivers. **The conclusion is robust to it
either way — WR still wins the flex at 1.29× using WR's 124.8 — so the run uses
the derived max and reports both.** If the two ever disagree, that is a finding,
not a choice to make quietly.

## PREDICTIONS — CORY'S REQUIREMENTS ARE THE BARS, IN HIS WORDS

**P172 — "more WR than RB".** Over the same 300 simulated rooms, **mean WR
drafted exceeds mean RB drafted.** Today: RB 3.94, WR 3.55, the wrong way round.
**FALSE if WR ≤ RB.**

**P173 — "we still need at least 3 RBs due to injuries and bye weeks."** The
mean RB drafted is **≥ 3.0**, and **at least 90% of the 300 rooms take 3 or
more.** **FALSE if either misses.** ⭐ **This is the half that makes P172 mean
something — a change that gets more receivers by abandoning the backfield has
not met his spec, it has broken the other half of it.**

**P174 — the onesies are untouched.** QB, TE, K and DEF means all stay within
**0.25** of their current values (1.20 / 1.08 / 1.14 / 1.10). **FALSE if any
moves more.** A flex-slot correction has no business moving the quarterback, and
if it does, the mechanism is not what I claim it is.

## CONTROLS

1. **KNOWN POSITIVE (rule 3e).** Setting the flex replacement equal to the
   own-position wire must reproduce the P166 run **exactly** — QB 1.20 / RB 3.94
   / WR 3.55 / TE 1.08 / K 1.14 / DEF 1.10. If the "no-op" arm does not
   reproduce the committed artifact, the change did more than it claims and no
   other number counts.
2. **Slot assignment must be read from `league.starters`,** not hardcoded, and
   the run prints which slot each body was assigned so the classification can be
   audited rather than trusted.
3. **Both flex-replacement choices reported** — derived max (TE 130.4) and
   empirical (WR 124.8). Same verdict required for the result to stand.
4. Unchanged: 300 differing rooms, same picks and keepers, sources must have
   passed their own controls.

## ⚠️ THE HONEST RISK, NAMED BEFORE THE RUN

**Cory has told me the answer, and I am about to test a change against it.**
That is the shape of fitting. Three things hold it apart from tuning, and if any
fails the result should be discounted:

1. **The change is derived from the league's slot structure, not selected from a
   sweep.** There is no parameter to move.
2. **The bars are written down here, before the run, including P173 and P174
   which the change could easily FAIL** — a naive "prefer receivers" hack passes
   P172 and fails both.
3. **If P172 passes and P173 or P174 fails, I report the failure and the arm
   does not become the recommendation.**

## GUARD

**REPORT ONLY.** `draft_plan.js` and `engine.js` are untouched; the war room
reads `seat_plan.json` and nothing here writes it. `no_fit_guard` holds:
**whatever this says, nothing ships before Saturday.**
