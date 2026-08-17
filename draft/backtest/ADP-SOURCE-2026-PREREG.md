# ADP-SOURCE-2026 — which ADP predicts CORY'S room, preregistered

**Written 2026-08-17, BEFORE any number exists.** Cory, after the projection
verdict landed: *"lets try ADPs then."*

**This is the last T1 input still resting on a degenerate measurement.** The probe
that justified wiring FantasyPros as the board's ADP anchor built a map it *named*
`ffc_rank` out of the board's own `raw_adp` — which was already FantasyPros — and
compared it to a fresh FantasyPros pull. ρ came back **exactly 1.0000** because it
compared FP to itself (register 19). The verdict string then said the swap "MOVES
picks" for any ρ, which is backwards: ρ=1.0 means identical ordering (19b).

---

## THE QUESTION — and it is NOT the projections question

**ADP is not graded against points. It is graded against WHERE PLAYERS ACTUALLY
GOT DRAFTED.** That is the only thing the board uses it for: survival odds, VONA,
tier-cliff timing, and every "will he last until my next pick" call.

> **Which ADP source best predicts the real pick order in CORY'S ten-man league?**

**This is a better test than the projection one, because the ground truth is
exact.** A projection is graded against a noisy season; an ADP is graded against
a draft that either happened or did not. We hold three: 2023, 2024, 2025.

## ARMS — fixed here

| arm | definition |
|---|---|
| **FFC** | Fantasy Football Calculator consensus ADP |
| **FP** | FantasyPros consensus ADP — **what the board ships today** |
| **SLEEPER** | Sleeper `search_rank` — **what the board ACTUALLY uses below the top 150** |
| **BLEND-50** | the mean of the available consensus ranks |
| **LAST_YEAR** | the previous season's *final* draft order. **Known-positive control.** |

**`LAST_YEAR` must lose.** Cory's league drafts many of the same players in a
similar order year over year, so it is a genuinely strong baseline — if a paid
consensus source cannot beat "what this room did last time", the sources are not
earning their place and the run says so.

## THE POPULATION — one matched set, and the trap is different here

**A player is scored only if every arm has a rank for him AND he was actually
drafted in that year's real draft.** Undrafted players are excluded from all arms
equally.

**⚠️ THE TRAP THAT IS SPECIFIC TO ADP: COVERAGE IS NOT UNIFORM.** FP covers ~19%
of our board overall but 98% of the top 150. A source that only ranks the obvious
players will look accurate on a population restricted to players it ranks. **So
coverage is reported per arm BEFORE accuracy**, and any arm covering under 90% of
the matched set is reported as `PARTIAL` and cannot win.

## METRICS — primary named first

1. **PRIMARY: mean absolute pick error** — |predicted pick − actual pick|, in
   picks. Directly interpretable: "this source is wrong by N picks."
2. **SECONDARY: Spearman** on the drafted order.
3. **THE ONE THAT MATTERS ON DRAFT NIGHT: survival accuracy.** For each pick,
   did the source correctly predict whether a player would last until Cory's next
   turn? **This is what ADP is actually consumed for**, and a source can win on
   MAE while losing here.

## THE DECISION RULE — before the numbers

**A source wins only if it beats the others on the PRIMARY metric in at least 2
of the 3 seasons, AND is not `PARTIAL`.** Anything less is `NO SEPARATION` and
the board keeps its current anchor.

**Ties on primary break on survival accuracy, not on grid order** — the defect
found in the blend run, where two weights tied on win count and the winner was
decided by the order somebody typed the grid.

## GATES

1. **Real draft results must load for all three seasons**, with pick counts
   reported. Fewer than three usable seasons → the run reports what it has and
   says so; it does not silently grade on one.
2. **`LAST_YEAR` must lose.** If it wins, the harness or the crosswalk is broken,
   not the sources. VOID, per the blend run's precedent — a control that only
   ever passes is decoration.
3. **Egress failure is VOID, not negative.** A fact about the runner, never about
   a source.
4. **Coverage before accuracy.** See the trap above.

## WHAT SHIPS

**Nothing before 08-22.** Same cap as the blend: three seasons of one ten-man
league is a small sample, and the most this licenses is "adopt for 2026 and
re-test next preseason." **An ADP swap changes survival odds and grab-by timing
on every pick** — a larger blast radius than the projection swap, which is
exactly why the T1 rule wants it measured before it ships OR stays.
