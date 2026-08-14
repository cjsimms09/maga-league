# VONA reads a market that is not our room

**TERRITORY: A.** Measurement only. **Nothing is wired; production is unchanged.**

Cory: *"if vona is our main strategy this year we need to triple verify our VONA
calculations and values are correct or we will ruin our predictions and the
draft."* This is the first of the three checks — the INPUT.

## What VONA is, and where it can go wrong

```
VONA(p) = proj_mean(p) − E[best available at p's position at my NEXT pick]
```

The arithmetic of `expectedBestAvailable` is sound: it accumulates
`P(p is best) = P(p survives) × ∏P(better q gone)` in descending projection
order, with an honest fallback for leftover probability mass. **Structure is not
the risk.** The risk is `survival()`, which is driven by **ADP** — and ADP is a
statement about *some* market, not about *our* room.

VONA is **62% of what moves the composite score** (measured over the top five
candidates at each of Cory's twelve picks). If survival is wrong, the primary
decision metric is wrong.

## Finding 1 — our room drafts quarterbacks earlier than the market, always

Gap between where the Nth QB actually went in our league and where current
market ADP prices him. Negative = **our room takes him earlier**. Three complete
150-pick drafts, each shown separately.

| slot | draft A | draft B | draft C | all same sign | spread |
|---|---|---|---|---|---|
| QB1 | −5.7 | −3.7 | −5.7 | **YES** | **2** |
| QB2 | −14.7 | −8.7 | −17.7 | **YES** | 9 |
| QB3 | −7.7 | −4.7 | −29.7 | **YES** | 25 |
| QB4 | −7.0 | −4.0 | −19.0 | **YES** | 15 |
| QB5 | −9.3 | −9.3 | −24.3 | **YES** | 15 |
| QB6 | −10.0 | −3.0 | −22.0 | **YES** | 19 |

**18 of 18 observations negative.** QB1 is the tightest number here — three
drafts, three years, spread of 2 picks.

## Finding 2 — TE is NOT the same story, and my first reading was wrong

| slot | draft A | draft B | draft C | all same sign |
|---|---|---|---|---|
| TE1 | +1.0 | −14.0 | −13.0 | **no** |
| TE2 | +5.3 | +9.3 | −7.7 | **no** |
| TE3 | −5.7 | −0.7 | +2.3 | **no** |
| TE4 | −5.7 | −7.7 | −5.7 | YES |
| TE5 | −8.3 | −21.3 | −14.3 | YES |
| TE6 | −3.3 | −8.3 | −14.3 | YES |

A median over the three drafts showed "TE1 −13.0" and read like a bias. **Per
draft the sign flips.** Some years this room takes an elite tight end at 7 and
some years it does not. Only TE4+ is consistent, and by then the pick is cheap.

**RB and WR show no bias at all** — signs flip, magnitudes ~1 pick. The market
is a good model of our room at RB and WR.

## Finding 3 — the control, which does not use market ADP for our column

Cumulative quarterbacks taken by pick *N*:

| by pick | our drafts (A/B/C) | market ordering |
|---|---|---|
| 24 | 2 / 1 / 3 | 1 |
| 36 | 2 / 2 / 5 | 2 |
| **48** | **4 / 4 / 6** | **3** |
| 60 | 7 / 6 / 9 | 6 |
| 90 | 8 / 9 / 9 | **11** |

Our room takes roughly **double** the QBs the market implies through pick 48,
then **fewer** by pick 90 — because they are already gone. Front-loading, with
the crossover between 60 and 90.

**Cory picks at 33, 48, 53, 68, 73.** Every early pick he owns sits inside the
window where this room has taken 4–6 quarterbacks and the model expects 3.

## The mechanism, end to end

1. Our league pays **6 points** for a passing TD; the market's consensus is set
   by **4-point** leagues. (No public ADP source prices 6-point passing TDs —
   FFC's format axes are `standard/ppr/half-ppr/2qb/dynasty`, all
   reception-scoring or roster shape. This is structural, not a source choice.)
2. Our room knows the rule and drafts accordingly.
3. `survival()` reads market ADP → believes a QB is still available.
4. He was taken 4–15 picks earlier.
5. `expectedBestAvailable` over-states what remains at that position.
6. **VONA under-states the cost of waiting on a quarterback.**

At 62% of the composite, that is the model advising patience at the one position
where patience is most expensive in this league.

## What this does NOT establish

**A correction.** No shift is fitted here and none should be until:

- **The year confound is addressed.** These are 2023–25 drafts against **2026**
  market ADP; there is no historical ADP series to match years with. The gaps
  therefore mix our room's bias with any market drift. The reason QB survives
  that objection at all is that QB1 reads −5.7 / −3.7 / −5.7 across three
  different years against one fixed baseline — drift would trend, and that is
  flat. **QB3's spread of 25 does not survive it**, and must not be fitted.
- **The deep slots are separated from the shallow ones.** QB1 (spread 2) and
  QB3 (spread 25) are not the same quality of measurement and cannot carry the
  same weight.
- **The arm is run.** Corrected survival against shipped, on Cory's twelve
  picks, showing exactly which picks move — before anything ships.

Three drafts is a thin sample. The direction is established; the magnitude is
not. Fitting a curve to six noisy slots and calling it a correction is how a
confident wrong number reaches a draft board.

## Reproduce

`draft/tests/vona_room_vs_market.test.js` re-derives every table above from
`league_history.json`, `player_positions.json` and the live board, so the claims
move when the data moves rather than being remembered.
