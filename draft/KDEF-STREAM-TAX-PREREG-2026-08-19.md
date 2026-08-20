# PREREGISTRATION — should the FIRST kicker and defence pay the streaming tax?

**A, 2026-08-19, written BEFORE the code and BEFORE the run.** Draft 08-22.
Register 127.

## THE DEFECT, MEASURED

With `ROSTER_SHAPE` on — shipped tonight on Cory's ruling — the model takes:

| | K | DEF |
|---|---|---|
| model, mean pick | **96** | **83** |
| the league's humans | **126** | **128** |

**30 and 45 picks early.** Across 30 real seat-years, so this is not one room.

## THE CAUSE, AND WHY IT IS STRUCTURAL RATHER THAN A TUNE

```
w = CORY_CURVE[pos][held]                      … and then
    × (1 − streamability[pos])   ONLY IF held ≥ S_EFF[pos]
```

For the **first** kicker, `held = 0 < 0.996`, so the tax is skipped and
`w = 1.0`. The first kicker is priced as an **unmissable starter**.

**But measured streamability says K 0.966 and DEF 0.925 — the two most
replaceable positions on the board.** The rule's premise is *"an empty starting
slot must be filled at any price."* For a position you can refill off the wire
in any week, that premise is simply false. A kicker is not scarce; he is
abundant and interchangeable, and the slot being empty does not change that.

**The fix is to delete an exception, not to add a parameter:**

```
w = CORY_CURVE[pos][held] × (1 − streamability[pos])   for K and DEF, always
```

RB/WR/TE/QB/TE keep the existing rule — for them the empty-slot exemption is
right, because a starting running back genuinely is not replaceable from the
wire (RB streamability 0.311, WR 0.252).

⚠️ **This is a one-line deletion of a special case, using a number already
measured and already in the file. No new constant is introduced.**

## PREDICTIONS

**P218 — K and DEF move to where the league takes them.** Mean pick for K
**≥ 118** and for DEF **≥ 115**, up from 96 and 83.

**FALSE if either misses.** ⚠️ **And FALSE if they go past 148**, Cory's last
pick — a term that pushes them off the board entirely has overshot, and the
K/DEF fill rule would then be the only thing seating them, which is not a fix
but a different failure.

**P219 — every roster stays legal.** Zero of 30 seat-years finishes without a
K or a DEF. The fill rule already forces them; this must not fight it.

**FALSE if any seat ends short.**

**P220 — the points do not get worse.** Mean builder-minus-owner delta on
**both** gradings is **≥ its current value** — actual ≥ −20.4, skill ≥ +7.9.

**FALSE if either drops.** ⚠️ **This is the one that decides shipping.** Taking
a kicker later is only worth doing if the pick it frees is worth more than the
kicker lost. If the deltas fall, the early kicker was buying something and I
was wrong about the mechanism.

## CONTROLS

1. **C1 — KNOWN POSITIVE (rule 3e).** The change must actually move the two
   positions it targets. If `w` for the first K is unchanged, the edit did not
   take, and every downstream number is uninterpretable. Assert `w(K, 0)` falls
   from 1.000 to 0.034 and `w(DEF, 0)` from 1.000 to 0.075.
2. **C2 — it must touch NOTHING ELSE.** `w` for QB, RB, WR and TE at every
   holding must be **bit-identical** to before. A "fix" that quietly reshapes
   the skill positions is a different change wearing this one's name.
3. **C3 — same rooms, same seats, same everything.** The comparison is paired
   across the identical 30 seat-years; only `startProb` differs.
4. **C4 — both gradings reported.** Actual and skill, per Cory's standing
   ruling that we grade skill not luck. Neither replaces the other.

## GUARD

**It ships to `engine.js` ONLY if P218, P219 and P220 all hold.** If P220 fails
the defect stays open and `ROSTER_SHAPE` keeps its current behaviour — a known
defect with an off switch beats an unmeasured change two days before a draft.

**`no_fit_guard`: no threshold in this document moves after the number is seen.**
Three predictions were left FALSE tonight at bars they nearly cleared; this one
gets the same treatment.
