# WHAT THE D10 CORRECTION ACTUALLY DID TO THE BOARD

**2026-08-13. A. The weight was changed on 2026-08-13 under Cory's ruling and nobody had
looked at its effect on the live board. This is that look, and it corrects an earlier
answer of mine.**

---

## 0. THE EARLIER ANSWER WAS MEASURED WITH A BROKEN INSTRUMENT

Before compaction I reported that doubling `stack` from 0.5 to 1.0 changed **nothing** in the
top 10 at either pick tested, with "real keepers and 64 board players on keeper teams".

**That was wrong, and it was the third time this exact question was asked with a dead
instrument.** The first attempt passed `roster: []` — I caught that one myself. The second
looked up Cory's keepers by name **in `draft_data.json.players`**, and kept players are
*removed* from the draftable pool and held in a separate `kept_players` array. So the lookup
resolved to zero keepers, the roster was empty again, and no stack bonus could apply to
anybody. The probe printed a confident zero both times.

Rule 10d, and the reason it now covers **any measuring instrument**: a lookup that silently
resolves to empty produces exactly the null you were expecting.

The corrected probe carries a guard that scores the board at `stack = 0.0` and `stack = 3.0`
and **exits non-zero if the two produce identical top-50 scores** — so a comparison that isn't
reaching the engine reports itself as void instead of as agreement.

## 1. THE TERM DOES REACH THE BOARD

Cory's keepers are Ja'Marr Chase (WR, CIN), Derrick Henry (RB, BAL), Kenneth Walker (RB, KC).
64 draftable players sit on those three NFL teams; **18 carry a non-zero weighted stack term**,
largest contribution 6.00, median 4.00 — against #1-to-#2 score gaps of **1.46 / 2.22 / 5.78**
at picks 33 / 68 / 108. The term is decisive-sized, not decorative.

## 2. THE HEADLINE IS NOT THE DOUBLING — IT IS WHAT THE TERM WAS ALREADY DOING

At pick 33, tracking three CIN players as the weight moves:

| player | stack=0 | stack=0.5 | stack=1.0 |
|---|---|---|---|
| **Joe Burrow** (QB, CIN, adp 50.7, vorp +20.4) | #13 (term 0) | **#1** (term +3) | **#1** (term +6) |
| **Tee Higgins** (WR, CIN, adp 39, vorp +33.4) | #33 (term 0) | #117 (term −2) | **#931** (term −4) |
| **Sean Clifford** (QB, CIN, adp 916, vorp −341.7) | #1329 (term 0) | #1003 (term +3) | **#104** (term +6) |

**THE STACK TERM IS WHAT PUTS JOE BURROW AT #1.** On value alone he is the 13th
recommendation. The correlation bonus, not the value anchor, makes him the top pick at 33 —
and that was already true at 0.5. D10's correction did not create this; it deepened it.

Three things follow, and the third is the one I would not have predicted:

1. **The mechanism is coherent.** Stack rewards QB↔pass-catcher correlation (Burrow with
   keeper Chase) and penalises same-position target competition (Higgins, a WR competing with
   Chase for CIN targets). Both directions behave as designed.
2. **The penalty half is now large.** Higgins is a WR with ADP 39 and positive VORP — a
   plausible pick at 33 — and the doubled penalty moves him from #33 (unweighted) to **#931**.
   The board has effectively deleted him.
3. **THE BONUS IS FLAT AND DOES NOT SCALE WITH PLAYER VALUE.** Sean Clifford — a third-string
   QB with ADP 916 and VORP **−341.7** — receives the *same* +6 as Burrow, purely for being a
   CIN quarterback, and rises 1,225 places. He is not draftable at #104 so this costs nothing
   today. It is still a defect in the term's shape: a constant added to anyone sharing an NFL
   team with a rostered player, on a deep board where scores are compressed enough for a
   constant to be worth a thousand places.

Board-wide the change is not small: **581 / 1,245 / 488 players change rank** at picks
33 / 68 / 108. The top-1 pick is unchanged at all three, and the top 10 changes at pick 68
only (4 positions, Burrow entering at #7).

## 3. WHAT I AM AND AM NOT SAYING

**This is not an argument to reverse D10.** Cory ruled, the ruling stands, and the engine, the
test, the policy comment and the frozen baseline (v8) all agree on 1.0 now. `stack_sweep`
measured +$196 for this term and it is the one adjuster that earned.

**It is a flag on two things nobody had seen**, nine days from the draft:

* **Burrow at #1 on pick 33 is a stack call, not a value call.** If Cory sees that
  recommendation on the 22nd he should know the correlation bonus is carrying it. Under rule
  16 the explanation must say so — and it can, because `stack` is weighted non-zero, so
  `stack.reasons` are legitimately citable rather than being a dead term cited anyway.
* **The flat bonus is worth revisiting after the draft**, not before. Scaling it by the
  player's own value would stop it lifting replacement-level teammates, but that is a change
  to a live coefficient inside the freeze window and the current shape costs nothing at the
  top of the board.

**Calibration, carried with the number:** `stack` is `soft` in the decision contract — priced
against a **modelled** correlation (rho 0.35), not a measured one. That is precisely why D10
originally stood the change down, and it remains the honest caveat on everything above.

**Reproduce:** the A/B, the instrument guard, and the per-player trace are in
`draft/tools/stack_effect.js`.
