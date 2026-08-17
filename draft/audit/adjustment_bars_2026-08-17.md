<!-- TERRITORY: A -->
# THE ADJUSTMENT BARS — MEASURED, AND MY FIRST ANSWER WAS WRONG — 2026-08-17

**Cory:** *"All of our adjustment bars seemed to have no affect. Starting to
think it's because of things like this. We need to do a deep dive into all of
our adjustment bars."*

---

## THE ANSWER: NO BAR IS DEAD. MY TEST WAS.

Positions changed in the top 25 when each bar moves off its shipped value
(0 → 1.0, or doubled if already non-zero), at three real picks:

| bar | shipped | pick 33 | pick 75 | pick 120 |
|---|---|---|---|---|
| value | 1.0 | 18/25 | 6/25 | 4/25 |
| tier | **0.0** | 9/25 | 13/25 | 21/25 |
| **need** | **0.0** | **25/25** | **22/25** | **22/25** |
| risk | **0.0** | 16/25 | 24/25 | 14/25 |
| ceiling | **0.0** | 0/25 | 0/25 | 21/25 |
| keeper | 1.0 | 15/25 | 17/25 | 0/25 |
| bye | **0.0** | 4/25 | 0/25 | 0/25 |
| stack | 1.0 | 6/25 | 0/25 | 0/25 |

Every bar has real leverage somewhere. `ceiling` reading 0/0/21 is **not** a
defect — `CEILING_LATE_FROM = 0.6` gates that term to zero until 60% of the
draft, by design. Pick 120 of 150 is 0.8, so it fires there and nowhere earlier.

## THE ERROR I MADE, AND IT IS THE ERROR WE ARE HUNTING

My first pass reported **`tier` and `bye` as dead at every weight including
5.0.** That was wrong, and the cause was mine: I built the test's league object
as `{teams, roster_slots, scoring}`. The real one carries a **`starters`** key —
the normalised starters-only view — and `byeCollisionPenalty` and
`starterSlotMarginal` both read `league.starters`. With it missing, both terms
returned a constant 0 for every player and the bars looked inert.

**A crippled input made a live term measure as worthless.** That is exactly the
ceiling defect, reproduced by me, inside the audit meant to find it. With the
correct object, `tier` at 5.0 moves **18 of 25** positions.

Two things nearly went out on the strength of it: a claim that two bars were
structurally dead, and a claim that `byeCollisionPenalty` returns 0 in
production. The second was checked against the shipped artifact before it was
said — `public/draft_data.json` **does** carry `league.starters` — which is the
only reason it did not become a reported live bug.

## THE REAL FINDING: `need` IS THE STRONGEST BAR ON THE BOARD, AND IT IS OFF

`need` changes **25/25, 22/25, 22/25** — more than any other term, at every
stage — and it ships at **0.0**.

Its recorded reason for being zeroed:

> `need: 'measured (redundant with the lineup mask ON THE NEEDRULE CARD ONLY —
> the composite list never calls the mask and is blind to positional fill)'`

**That sentence contains its own refutation.** `need` was zeroed as redundant
with a mask that — by the same note, and verified here — `recommend()` never
calls. Grepping `withinCap` across engine.js returns nothing; the only hits are
comments saying so. So the redundancy was measured on the needrule CARD, and the
zero was applied to the COMPOSITE, which has no mask and is blind to positional
fill.

Same shape as the ceiling: a true measurement, applied to the wrong object.

`risk` is the third in the family, and its provenance already confesses it:
*"UNMEASURED — term is PARTIAL on the backtest board (age only, 6 of
production's 11 distinct values)."* It was graded on a board where five of its
eleven inputs were missing.

## WHAT IS AND IS NOT ESTABLISHED

**Established:** all eight terms produce real, non-degenerate values and all
eight have leverage on the live board. Three of the five zeros (`ceiling`,
`need`, `risk`) come from measurements taken on a broken or wrong-context input
and are therefore **void, not evidence**.

**NOT established, and I am not asserting it:** that the war-room SLIDERS are
correctly wired to these weights. Everything above was measured by calling
`recommend()` directly from node with explicit weight objects. Whether the UI
passes what it displays is a separate question and it is untested. If Cory moved
a slider and saw nothing, the cause could be here (a weight already at zero) or
there (a slider that does not reach the engine) and this audit does not
distinguish them.

**That is the next thing to check**, before any weight is re-derived — because
re-deriving a weight the UI cannot deliver would be another measurement of the
wrong object.
