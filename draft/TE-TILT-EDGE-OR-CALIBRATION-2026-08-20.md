# The TE tilt is a calibration fault, not a demonstrated edge — measured against 2025 outcomes

**E, 2026-08-20, answering register 150's routed question** (*"is the TE
tilt a real edge or a calibration fault? Compare our TE ordering against
2025 outcomes before quoting it as either."*). Register 150 found our board
ranks TEs a median 46 overall-rank places earlier than ADP. This measures
whether that tilt is earning its keep.

## THE TEST

Two separate questions, both against real 2025 realized weekly points
(`draft/backtest/nflverse_weekly_points_2025.json`, 18 weeks, joined to the
board by player_id), both restricted to players with ≥8 games played:

1. **Within-position skill**: among TEs alone, does our board's ordering
   correlate with realized 2025 output better than ADP's does?
2. **Cross-position value**: in the exact overall-rank band where the tilt
   pushes TEs (60-160, per register 150's own examples — Strange, Johnson,
   Hockenson), do the TEs sitting there deliver value comparable to the
   RB/QB our board is passing over at those same slots?

## RESULT 1 — NO SKILL EDGE WITHIN THE POSITION

| position | n | board-rank vs realized (Spearman) | ADP vs realized |
|---|---|---|---|
| TE | 80 | 0.875 | 0.870 |
| RB | 88 | 0.901 | 0.901 |
| WR | 142 | 0.876 | 0.864 |
| QB | 37 | 0.771 | 0.783 |

**Statistically indistinguishable at every position, TE included.** Our
board is not identifying better tight ends than the market — it agrees
with ADP almost exactly on WHO the good TEs are. Whatever the tilt is
doing, it isn't picking winners the market misses.

## RESULT 2 — NEGATIVE VALUE WHERE THE TILT ACTUALLY BITES

Replacement level set from realized 2025 totals (TE13 = 133.0 pts, RB35 =
118.2, matching the reference model's replacement ranks found in
`DUPLICATE-A-REAL-MODEL-2026-08-19.md`). Realized points-over-replacement
for every skill player whose 2026 board overall-rank falls in 60-160 —
the band register 150 itself named as where the tilt stacks tight ends:

| position | n | mean realized VOR | median |
|---|---|---|---|
| **TE** | 24 | **−30.9** | **−31.8** |
| RB | 18 | +28.4 | +19.5 |
| QB | 15 | +25.7 | +38.5 |
| WR | 31 | −6.7 | −2.8 |

**17 of 24 TEs in that band delivered BELOW replacement level in 2025.**
The RBs and QBs our board is pricing lower to make room for them delivered
solidly positive value at the same draft-capital level. This is not a
handful of outliers — the full list (sorted by board rank):

```
+22.2 Kelce    +22.1 Goedert   +14.1 Ferguson   +15.8 Henry
 +8.4 Johnson   +3.7 Schultz    +0.0 Kittle
-11.7 Barner   -26.0 Andrews  -26.1 Gadsden   -26.4 Kincaid
-31.8 Kraft    -37.0 Okonkwo  -38.0 Strange   -39.9 Freiermuth
-40.3 Otton    -45.7 Hockenson -55.2 Engram   -56.3 Waller
-63.3 Helm     -76.3 Gesicki  -83.2 Dulcich   -84.8 Likely
-86.4 T.Ferguson
```

**These are the same names flagged this morning** (job 1's implausibility
sweep, this session, same day): Waller, Gesicki, Strange, Hockenson,
Freiermuth, Otton, Helm all appeared on both lists independently. Two
different measurements, on two different questions, converging on the
same players.

## READING

Register 150 asked which it is. **This measures as calibration fault, not
edge.** The mechanism register 150 already named — `vorp.py` setting TE
replacement from starter-slot count rather than actual draft depth,
under-pricing RB/WR replacement by ~72/~31 points relative to TE — has a
visible symptom here: the position isn't just ranked higher, the specific
players filling that higher rank are, on average, replacement-or-worse in
real outcomes.

## THE HONEST CAVEAT, STATED RATHER THAN BURIED

**This is not a clean walk-forward test.** These are 2026 board ranks for
the SAME players being checked against their own 2025 output, and our
projection blend is partly built from recent performance — so there is
real circularity, and it runs in the direction that should make our board
look BETTER on this test, not worse (a player who had a great 2025 gets
projected well for 2026 by construction). **The tilt still reads negative
even with that bias helping it.** That is what makes the result worth
taking seriously rather than a coincidence of one bad TE class — the test
was stacked in the board's favor and it still lost.

**What this does NOT test**: whether 2026's specific TE rookie/breakout
class (Bowers, McBride, Loveland, Warren — the top of the position) repeats
this pattern. Those names mostly sit ABOVE the 60-160 band this measures
and were excluded from it by construction. This finding is about the
MIDDLE and TAIL of the position, exactly where register 150's examples
(Strange, Johnson, Hockenson) live — not about whether elite tight ends
are worth a premium, which is a different and probably true claim.

## FOLLOW-UP QUESTIONS (rule 3g)

- **Does this imply another failure we have not looked for?** The same
  replacement-level mechanism (starter-slots vs actual draft depth)
  register 150 named for TE likely runs the same direction for K/DEF,
  which register 138/139 already demoted correctly on other grounds — this
  finding is consistent with, not contradictory to, that separate fix.
- **Does it invalidate something already trusted?** It narrows register
  150's own open question from "edge or fault, unresolved" to "reads as
  fault, measured" — register 150 explicitly asked for exactly this
  follow-up and said not to quote either answer before it existed.
- **Is it routed to the lane that can act?** A owns `vorp.py`'s replacement
  calculation; register 150 already routed the mechanism question there.
  This file answers the "should we act" half; the "how" half stays A's,
  same as register 150 left it — **not recommending a repricing before
  Saturday**, same discipline register 150 itself used.
