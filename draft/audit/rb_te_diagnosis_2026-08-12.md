# Why the tool takes 0.9 running backs and 3.6 tight ends

**Items 8 and 9. Cause, not cure.** Both fall out of one table, and they are the
same mechanism — which is not the mechanism I proposed this morning.

---

## THE TABLE THAT ANSWERS BOTH

Supply above replacement against league-wide demand, from the live board:

| pos | replacement | above repl | league demand | **surplus ratio** |
|---|---|---|---|---|
| QB | 341.7 | 10 | 10.0 | **1.00** |
| **RB** | 188.5 | 21 | 23.3 | **0.90** |
| WR | 172.7 | 29 | 23.3 | **1.24** |
| **TE** | 150.7 | 10 | 13.3 | **0.75** |
| K | 97.0 | 12 | 10.0 | 1.20 |
| DEF | 99.0 | 10 | 10.0 | 1.00 |

*(demand = 10 teams × starters, plus a third of the FLEX for each flex-eligible
position.)*

**RB and TE are the only two positions where the startable supply does not meet
the league's demand.** That single fact drives both numbers, in opposite
directions, and it is a property of **the board**, not of the scorer.

---

## ITEM 8 — RB AT 0.9: THE BOARD HAS NO RUNNING BACK LEFT TO TAKE

The demand side, measured at my actual picks. Top-20 by VORP, and the best
available at each position:

| my pick | top-20 mix | best RB | best WR | best TE |
|---|---|---|---|---|
| 33 | QB 3 · **RB 2** · WR 12 · TE 3 | +27.6 | +43.2 | +37.9 |
| 48 | QB 3 · **RB 2** · WR 8 · TE 3 | +23.6 | +28.8 | +24.2 |
| 53 | QB 2 · **RB 1** · WR 7 · TE 4 | +23.6 | +28.8 | +17.8 |
| 68 | QB 4 · **RB 0** · WR 1 · TE 3 | **−20.7** | +18.9 | +17.8 |
| 73 | QB 3 · **RB 0** · WR 0 · TE 1 | **−20.7** | −0.1 | +6.1 |

**By my fifth pick the best available running back is 20.7 points BELOW
replacement.** Every startable RB is gone. From pick 68 onward there is no RB on
the board worth a roster spot by our own valuation.

**So the tool is not neglecting running backs. There are none to take.** RB has
the second-lowest surplus ratio (0.90 — 21 startable against 23.3 demanded), and
I forfeit rounds 1–3 to keepers, so my first selection is pick 33. The positions
whose startable supply runs out first are exhausted before I ever choose.

**AND THAT IS WHY NO WEIGHT VECTOR MOVED IT.** MEASURED, MEASURED-without-floors
and DEFAULT all landed at 0.8–0.9, because **a weight cannot conjure an
above-replacement running back that is not on the board.** A coefficient changes
which available player you take; it cannot change which players are available.

**The risk you named is real and this sharpens it.** Henry + Walker + one is not
a choice the tool made — it is the board's answer to a seat that picks 33rd with
two backs already kept. The exposure is genuine and **the remedy is not in the
scorer**: it is either taking an RB earlier than VORP justifies (paying above
market for insurance, which is a roster-construction policy) or accepting that
the FLEX absorbs a WR when a back goes down.

---

## ITEM 9 — TE AT 3.6: THE SAME TABLE, THE OPPOSITE END

**TE has the LOWEST surplus ratio on the board — 0.75.** Ten tight ends above
replacement against 13.3 demanded.

A low surplus ratio with a **low replacement level** produces the opposite
symptom from RB's: because the TE replacement line sits at 150.7 while the top
tight ends project far above it, **a mid-tier tight end still shows positive VORP
at picks where a mid-tier running back is already negative.** Read the table
again at pick 68: best RB **−20.7**, best TE **+17.8**. At pick 73: best RB
−20.7, best WR −0.1, best TE **+6.1**.

**The tool takes tight ends late because they are the only players still showing
positive VORP.** That is the scorer doing exactly what it is told, on a board
where TE is the last position with anything above its own replacement line.

### AND THIS CORRECTS WHAT I SAID THIS MORNING

I attributed the onesie overdraft to the **ceiling-spread units problem** — raw
season points making a quarterback's `proj_ceiling − proj_mean` the largest
number on the board. **That explanation cannot account for TE**, whose spread
(p90 30.8) is the smallest of any skill position, and I said so at the time
rather than guessing.

**The supply table is the better explanation, and it is a different one.** But
the two are not in competition — **they operate in different branches**:

- **the STARTER branch** scores on VORP, and VORP is exactly what the surplus
  ratio governs. This explains TE, and it explains RB.
- **the BENCH branch** does not contain VORP at all. It ranks on the ceiling
  spread, and *there* the units problem is real and unfixed.

So: two mechanisms, two branches, and this morning I applied the bench branch's
explanation to a starter-branch symptom. **The ceiling normalisation scheduled
for 2026-08-23 is still the right fix for the bench branch** and would not have
touched the tight-end count, which the onesie cap bounded instead.

---

## WHAT NEITHER OF THESE IS

**Not a defect.** No fix is proposed and none is implied. The scorer is behaving
correctly on both counts; what produces the shape is the intersection of the
league's roster rules with the distribution of projected points, and that is a
property of the format.

**And it is a genuinely league-specific finding** — the surplus ratios are a
function of *our* starters, *our* scoring and *our* ten teams. That is the layer-1
specificity the advantage audit measured as the most influential thing in the
system, showing up in the roster shape rather than in a flip rate.
