# THE THREE DIVERGENCES THAT SURVIVE THE REPAIRS — AND NONE IS A PATHOLOGY

**2026-08-14. A.** After v13, against an ADP reference that fields a legal team, the model
sits within one player of the market at five of six positions. What remains is **+1 QB,
−1 WR, and a TE taken at 70 against the market's 130.** Each was traced rather than
assumed, and each turns out to be defensible drafting.

**This file exists so the remaining gaps are not read as unfixed defects.** Everything
that WAS a defect is listed at the foot.

---

## 1. THE SECOND QUARTERBACK IS A COIN FLIP THE BOARD ITSELF DECLARES

Pick 110, traced:

```
MODEL CHOSE     Jared Goff (QB, adp 116)      score 1.69
RUNNER-UP       Mark Andrews (TE, adp 115.7)  score 1.19
GAP TO BEAT     +0.50
```

**`CFG.COIN_FLIP_GAP` is 1.0.** A half-point gap is below the threshold at which this
engine is willing to say it has an opinion — the surface renders it as *"either"*, by
design, and it is right to. The reach is **+6.0**, ordinary.

So "the model takes two quarterbacks and the market takes one" is a tossup that landed
one way. It is not a preference for quarterbacks, and tuning anything to flip it would be
tuning a coin.

## 2. THE TIGHT END AT 70 IS A SMALLER REACH THAN THE MARKET'S OWN

The headline "model TE at 70, market TE at 130" reads as a 60-pick pathology. It is not:

| | player | pick | ADP | reach | projection | VORP |
|---|---|---|---|---|---|---|
| model | Sam LaPorta | 70 | 77.3 | **+7.3** | 168.5 | +17.8 |
| market | Oronde Gadsden | 130 | 140.3 | **+10.3** | 118.5 | −32.2 |

**Both took a tight end within striking distance of his own ADP, and the market's reach is
the larger of the two.** The difference is not timing discipline — it is that the model
bought a startable tight end and the reference bought a replacement-level one, because the
reference's only rule is "best ADP left" and by pick 130 that is what remains.

**50 points of projection separate them.** A model that pays pick 70 for LaPorta rather
than pick 130 for Gadsden is making an ordinary draft decision, and the comparison against
a pure-ADP drafter cannot see the difference because ADP is all it knows.

## 3. THE WIDE RECEIVER GAP IS THE ARITHMETIC OF THE OTHER TWO

Twelve picks. The model spends one more on QB and takes its TE earlier; the receivers are
what is left over. **WR 2 against 3 is one player**, and it follows from decisions 1 and 2
rather than from anything preferring or avoiding receivers.

Worth watching in a live mock — a thin receiver corps is a real risk with two starting
slots plus flex contention — but there is nothing here to fix in the objective.

---

## WHAT WAS ACTUALLY WRONG, AND IS NOW FIXED

Every one a defect, none a new term, and **three of the six are a constant overriding a
value the system had already derived or measured**:

| defect | mechanism |
|---|---|
| bench branch discarded VONA for half of every draft | a comment describing it as *"value over the next STARTER"*, which is not what `vona()` computes |
| duplicates crowded the top ten | `score * discount` on a **signed** quantity — the discount RAISED negative scores |
| retired players reached the top ten late | pool filter excluded only an explicit `active === false`, with no rank ceiling |
| the bye warning could not fire | 564 players with a team and no bye; silence is indistinguishable from no conflict |
| the paths menu | `PATHS_BAND` hardcoded 12 while its own comment derived `COIN_FLIP_GAP * 4` = 4.0 |
| the primary ADP crosswalk could lose a row | collisions overwrote silently; the accounting identity was unasserted |

## AND SIX MEASUREMENTS OF MINE THAT WERE ARTIFACTS

Stated because the pattern matters more than any single number: **the reach ratio** (the
reference cannot reach — tautology), **the VONA rank** (noise on a −71 median), **the
726-player band** (counted the board, not the panel), **the DEF/K magnitude claim**,
**the `expectedBestAvailable` tail**, and **the illegal reference roster**. Every one was
caught by re-measuring. None by review.
