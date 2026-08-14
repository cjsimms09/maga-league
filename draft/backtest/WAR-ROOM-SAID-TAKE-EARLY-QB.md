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
two-sided version — a DP over 15 picks × 2⁶ slot states, verified against brute
force over 3,603,600 assignments — and the comparison **inverts** once you look
past the next pick: across the draft QB falls 103 points, TE 101, **RB/WR 139**.

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
