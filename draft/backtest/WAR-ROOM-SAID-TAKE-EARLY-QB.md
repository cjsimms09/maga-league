# The war room said "take early QB". Here is why, and why it was wrong.

**TERRITORY: A.** Cory, 2026-08-14: *"Yes the last time I looked at war room it
said take early QB…"* He was reading it correctly. The panel said it, in two
independent places, and both were defects.

**This is the one pre-draft finding that was actively steering picks.** Draft is
22 August.

## The short version

| | what it said | why | status |
|---|---|---|---|
| **the banner** | "The plan — Early-QB Strike **+$353 season edge**" | the race that enrolled it had a control that could not field a quarterback in **198 of 200 rooms** | **race voided, nothing enrolled** |
| **the picker** | "Late-QB Patience trails by **$21**", last of nine | the panel ranks how *permissive* a doctrine is, not how good it is | **reports a deferral, not a ranking** |

Neither number was fabricated. Both were true measurements of the wrong
quantity — the recurring defect in this project, and the reason `early_qb` also
reached `doctrineTilt` and tilted live recommendations toward quarterbacks.

## Defect 1 — the enrollment was a lineup gap wearing a strategy's name

`cory-conditional.json` enrolled `early_qb` on **+$352.75, CI [306.0, 399.62]**
over 200 paired rooms, and `build.py` stamped it into the board where the banner
rendered it as a season edge.

The archetypes differ from the control by their constraints only. `early_qb`'s
roster differed from the control's by **exactly one player** (`divergence 1.0`)
and won by $353. One player, nine percent of the pot. That is the thread.

**The chooser and the grader use different currencies.**

```
my seat picks   max(allowed, key=vorp)              # cory_conditional.py
the grader scores sum(proj_mean of best startable lineup)   # team_week_params
```

VORP is *low* for quarterbacks precisely because they are replaceable — Josh
Allen 63.8 against Jahmyr Gibbs 156.0 — so a VORP-greedy seat never spends a
pick on one. `team_week_params` then builds the best lineup it can and **skips
the slot it cannot fill**: the team plays the season with no quarterback and is
docked the full ~350 points.

Measured across 200 rooms: the control could not field the mandatory lineup in
**198**, unfilled **QB in 182** and **TE in 130**.

So `early_qb` — the one archetype *forced* to buy a quarterback — collected that
entire gap and it was reported as a sequencing edge. `elite_te` (+$64.38) is the
same artifact at tight end. **Every row in that leaderboard was measured against
a roster that could not legally be fielded.**

### What changed

A **control-validity gate**. If the control cannot field the lineup it is graded
on in more than 10% of rooms, the race enrolls nothing and records why. This is a
**refusal, not a new belief** — it withdraws a verdict the design cannot support
and leaves the banner on the control, which is the null.

The board now carries `doctrine: null`; the banner reads *"no doctrine enrolled —
running the control"*, and `prefers('balanced', …)` is 0 at every position, so
the tilt is genuinely off rather than merely renamed.

### A second, smaller lie in the same file

`late_qb` scored **−45.88, CI [−71.00, −23.38]** and was labelled
**"parked: CI includes $0"**. That interval does not include $0. The test was
`lo <= 0`, which is true of *any* negative lower bound, so a result lying
entirely below zero read as inconclusive. Zero is inside `[lo, hi]` only when
`lo <= 0 <= hi`. Fixed, and the three interval cases are now pinned in tests.

## Defect 2 — the picker ranks permissiveness

`scoreBoard(k)` returns *the E[$] of the best board player doctrine k lets me
take right now*. The banner presented that as what a plan is worth.

On the live board at pick 33 (Cory's first):

```
  1. Balanced Value           $67.0      <- Lamar Jackson, the board leader
  2. Ceiling Chase            $67.0
  3. Zero RB                  $67.0
  4. Hero-RB Continuation     $67.0
  5. Robust RB                $67.0
  6. WR Feast                 $67.0
  7. Elite-TE Anchor          $67.0
  8. Early-QB Strike          $67.0
  9. Late-QB Patience         $46.0      <- best non-QB: Travis Etienne
```

Eight tie because none of their constraints binds there. The ninth differs
**only** because it is banned from the man topping the board. The ranking has one
degree of freedom — whose constraint happens to bite — and none about which plan
is better.

**This is algebra, not a property of this board.** At live pick `i < 8` the
`late_qb` pool is a strict subset of the unconstrained pool, so its score can
never exceed it under *any* pricing function. Late-QB Patience is structurally
incapable of leading this panel. Verified over 300 randomised boards × 7 live
picks: zero violations, with the constraint binding in a large share of them.

It held at every pick Cory owns, widening as the board thinned:

| pick | live idx | best available | Late-QB gap | its rank |
|---|---|---|---|---|
| 33 | 1 | QB Lamar Jackson $67.0 | −$21.1 | **9 of 9** |
| 48 | 2 | QB Drake Maye $66.2 | −$21.1 | 8 |
| 53 | 3 | QB Dak Prescott $64.6 | −$22.0 | 8 |
| 68 | 4 | QB Dak Prescott $64.6 | −$26.0 | 8 |
| 73 | 5 | QB Dak Prescott $64.6 | −$26.5 | 9 |
| 88 | 6 | QB Brock Purdy $63.1 | −$28.5 | 9 |

### And the cost is charged one-sided

Deferring a quarterback buys a better RB/WR **at this pick** and pays for it at a
**later** one. `forgone` sees only the decline. `slot_schedule.js` computes the
two-sided version — a DP over Cory's picks × 2⁶ slot states, verified against
brute force — and it puts the **QB at 73 and the TE at 33**, pricing a
quarterback at pick 33 at **11.1 points of starting lineup forgone**.

> **Correction, same day.** This section first cited "QB falls 103 points, TE
> 101, RB/WR 139" from that tool's header. Those numbers were measured over a
> **fifteen**-pick schedule that began at pick 8 — and picks 8, 13 and 28 are the
> rounds Cory *forfeited* for Henry, Chase and Walker. Over the twelve picks he
> owns (33 → 148) best-available falls **QB 69, RB 87, WR 72, TE 52**. The
> comparison still inverts, but by **4 points across the whole draft, not 36**.
> Details in the section below; the tool is fixed and now reads the schedule off
> the board.

### What changed

`scoreBoardDetail` marks a doctrine whose constraint **binds** and reports
`forgone` and the player declined. `update()` no longer offers a binding doctrine
as an alternative that "trails"; it reports it as a **deferral**, and the surface
says the cost *and* says what is missing from it:

> Late-QB Patience defers QB here (−$21 at this pick; what it buys later is not
> in that number)

Every one of Cory's first six picks now reads **doctrine-neutral**, which is what
an eight-way tie is.

**The fix does not price the other half.** That is `slot_schedule.js`'s job and
nothing on this surface reads it yet. Until it does, the honest sentence is
"cost here, gain not counted" — which is what it now says.

## Defect 3 — the plan spent three picks Cory does not own

Found while cross-checking defect 1's result. `slot_schedule.js` is the tool that
answers Cory's central question — *"when is the best time to take a QB or TE"* —
and its schedule was the literal

```js
const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
```

which is `pick_order.my_picks_**before_keepers**`. **Picks 8, 13 and 28 are the
rounds forfeited for Henry, Chase and Walker** — the board lists them by name
under `pick_order.forfeited`, and carries the corrected `my_picks` right beside
it.

The same keepers *were* subtracted from the starting **slots**, by derivation,
under a comment reading *"Derived, not typed: a hand-written list would drift the
moment the keepers change."* One side of the assignment knew about the keepers
and the other did not — and the sentence warning about exactly that failure sat
twelve lines below it.

**The brute force did not save us.** It agreed with the DP to the decimal, on the
wrong pick set. Two methods agreeing on the wrong question is not verification.

**It inverted the answer.**

| | old (15 picks, 3 forfeited) | real (12 picks) |
|---|---|---|
| TE | pick **13** | pick **33** |
| QB | pick **33** | pick **73** |
| total starting value | 1325.5 | 1178.4 |

The old plan's headline was a quarterback at 33. On the real schedule that
**costs 11.1 points** of starting lineup, and the tight end moves up to 33.

The old plan also printed *"THE ASYMMETRY FAVOURS US: the plan does not move at
all on the negative side"* unconditionally. That was true of a schedule starting
at pick 8 — too early for any plausible drift to reach — and is false of the real
one, which reshuffles on both sides. **That verdict is now computed from the
drift rows**, and when the plan moves it says so and tells the reader to carry
the slot *order* rather than the pick numbers.

## The rebuilt race — and the result that settles defect 1

With the chooser and grader in one currency (`best_by_marginal_value`, which
maximises the same startable-lineup mean the grader scores), the control fields a
legal lineup in **200 of 200 rooms** and the validity gate stays silent. Re-run:

| archetype | mean edge $ | 95% CI | divergence |
|---|---|---|---|
| hero_rb | +0.62 | [−0.62, 2.25] | 0.1 |
| zero_rb | +0.25 | [−0.75, 1.50] | 0.1 |
| **early_qb** | **+0.00** | **[0, 0]** | **0.0** |
| wr_anchor | −0.25 | [−0.75, 0.00] | 0.0 |
| elite_te | −18.50 | [−38.38, 0.38] | 2.2 |
| late_qb | −25.50 | [−56.25, 2.38] | 6.6 |

**`early_qb` now scores exactly $0.00 with zero divergence.** Its constraint
never binds: a chooser that actually maximises lineup value already takes a
quarterback by live pick 3 without being told to. **"Early-QB Strike" was not a
strategy — it was a description of what correct value-drafting does anyway**, and
its entire +$352.75 was the lineup gap.

**Nothing enrolls**, and this time because nothing cleared its gate on a *valid*
experiment rather than because the race was void. `late_qb` (−$25.50) and
`elite_te` (−$18.50) both lean negative with CIs straddling zero — not resolvable
at 200 rooms.

That makes the shipped state — no doctrine, pure value — **evidence-backed rather
than a fallback**, and it is exactly Cory's stated principle: *"Our model needs to
first and foremost be drafting for value."*

### The limitation that stops this being a QB-timing answer

The race cannot tell you *when* to take a quarterback. Every archetype uses the
same greedy chooser, and greedy-on-marginal-lineup-value takes the QB at pick 33
in 60 of 60 rooms — with **zero variance**, which is the tell. It is greedy
across picks: it correctly handles replacement level *within* a pick and has no
model of what will still be there later. That is the same one-step myopia as
VONA.

**So the two tools answer different questions and only one of them answers
Cory's.** The race says no *constraint* beats value-drafting. `slot_schedule.js`,
which optimises across all twelve picks at once, is the one that says when — and
it says TE at 33, QB at 73.

## What this does NOT establish

**That taking a quarterback early is wrong.** It establishes that *neither number
the war room showed was evidence about it.* The independent readings still
disagree with each other:

- **Against early QB:** the VOR board is flat after QB4 (QB1 +62.1, QB4 +24.4,
  then QB5 −1.7 through QB9 +9.5); at pick 33 the best RB is +58 against the best
  QB's +30; and our room already takes quarterbacks **4–15 picks earlier than
  market at every slot, 18 of 18** — so "take the edge before the room does" has
  no edge left to take. The room is already there.
- **For early QB:** the within-manager winners test says the seasons a manager
  drafted a quarterback earlier than his own norm are the seasons he finished
  better — but that effect is ~1 rank position, and four of six metrics clear the
  same threshold, which makes ~1 rank position the noise floor of that sample.

**So the honest state is no enrollment**, which is now what ships. The question
is settled by the rebuilt race — chooser and grader in one currency — not by
picking whichever of these readings we like.

## Reproduce

- `draft/tests/doctrine_permissiveness.test.js` (23 checks) re-derives the panel
  tables from the live board, proves the subset claim over randomised boards, and
  carries fail arms that reproduce both old sentences.
- `draft/tests/test_cory_conditional.py` (15 checks) pins the control-validity
  gate, the interval-label fix, and the rule that a void race leaves no row
  claiming a win.
- `python3 draft/backtest/cory_conditional.py --rooms 200` regenerates the
  artifact and prints the void banner.
