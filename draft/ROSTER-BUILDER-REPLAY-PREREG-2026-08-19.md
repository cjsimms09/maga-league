# PREREGISTRATION — does the ROSTER EQUATION beat the humans?

**A, 2026-08-19, written BEFORE the code and BEFORE the run.** Draft 08-22.

> Cory: *"how else can we improve the model, can we run things through 22-25
> sleeper drafts and test roster builder and see how it wouldve compared to our
> league"*

## WHAT IS AND IS NOT AVAILABLE

**Blocked:** other people's Sleeper drafts. Sleeper is **403 at CONNECT** — a
policy answer, never retried.

**Available and committed:** this league's **three real drafts** — 2023, 2024,
2025, 480 recorded picks — plus **18 weeks of actual player points** per season
and final standings. No network.

## THE EXPERIMENT, AND WHY IT IS BETTER THAN THE SEAT REPLAY FOR THIS QUESTION

The seat replay is blocked on era-appropriate projections. **But the roster
equation's job is not projection — it is SHAPE.** So hold player evaluation
constant and vary only the construction rule:

```
for each of 30 seat-years:
    walk the REAL draft in pick order
    at every pick that seat owned:
        our builder chooses from the players ACTUALLY still on the board
        value signal = THE MARKET'S OWN ORDER (the draft itself)
        shaping      = the roster equation, W x (1 - streamability) on bench bodies
    grade the resulting roster on ACTUAL weekly points, best legal lineup per week
    compare against WHAT THAT OWNER ACTUALLY DID in that seat
```

**Why the market's own order is the right value signal here, and not a
handicap.** It is era-correct by construction, contains no hindsight, and — the
point — **it is the same information the human owner had.** Both sides evaluate
players identically. **The ONLY difference between the two rosters is the
construction rule**, which is precisely the variable Cory asked about.

⚠️ **THIS CANNOT TEST PROJECTIONS AND MUST NEVER BE QUOTED AS IF IT DID.** It
answers "is our roster equation better than a human's roster instinct". It says
nothing about whether Draft Sharks beats CBS.

## PREDICTIONS

**P215 — the roster equation beats the humans on points.** Mean
builder-minus-owner season total, best-legal-lineup, across 30 seat-years, is
**> 0**, and the builder wins in **≥ 18 of 30** seats.

**FALSE if either misses.** ⚠️ **And FALSE is the more useful outcome**, because
the equation is what we would then be shipping on a shape argument alone.

**P216 — it wins on CONVERSION, not on acquisition.** The engine's recorded
failure is that it held MORE projected points than the owners (+2.1%, +5.1%) and
converted 0.740/0.771 against 0.828/0.834. So the builder's **starter-share of
its own roster's points** must exceed the owner's in **≥ 20 of 30** seats, even
where the total does not.

**FALSE if conversion does not separate.** If the builder wins on totals but not
on conversion, the shape story is wrong and something else is doing the work.

**P217 — the roster equation is what does it, not the market order.** A control
arm running **the same market order with the roster equation OFF** must be
**WORSE than the equation-on arm in ≥ 20 of 30 seats.**

**FALSE otherwise** — if best-available-by-ADP does just as well, the equation is
decoration and this whole line of work is unsupported.

## CONTROLS

1. **C1 — KNOWN POSITIVE (rule 3e).** Replay each seat with the builder replaced
   by **the owner's own recorded picks**. The graded season total must reproduce
   that owner's actual best-legal-lineup total **exactly**. If the harness cannot
   reproduce a roster it was handed, every delta it reports afterwards is
   uninterpretable.
2. **C2 — no hindsight.** The builder may only see the board as it stood at that
   pick. Actual points enter **only** at grading. Asserted by construction: the
   choice function receives no points argument at all.
3. **C3 — legality.** Every graded roster fills QB/RB/RB/WR/WR/TE/FLEX/K/DEF or
   the seat is REPORTED as unfillable, never silently scored short.
4. **C4 — keepers as recorded.** `is_keeper` picks stay with their real owner in
   every arm; the builder does not get to re-choose them.
5. **C5 — the comparator is not a straw man.** The equation-OFF arm still takes
   best-available; it is not crippled into drafting twelve kickers.

## GUARD

**REPORT ONLY.** Writes `draft/data/roster_builder_replay.json`. Ships nothing
and changes no live board. **`no_fit_guard`: no arm may be selected from this,
and if P215 is FALSE that is reported as plainly as a pass.**
