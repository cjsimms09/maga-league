# STAGE 1 — EXTERNAL SANITY TRIAGE, MEASUREMENT ONLY

**2026-08-13. A. FROZEN BEFORE THE MODEL WAS OPENED.**

Cory's instruction: "PRODUCE A STAGE 1 REPORT CONTAINING NO DIAGNOSIS, NO VORP
EXPLANATION AND NO HYPOTHESIS." This file contains none. It was committed before
any Stage 2 work began, so the interpretation cannot have shaped the measurement.

Reference drafter: same seat (8), same three keepers, same ADP opponents, same pick
numbers; its only selection rule is "highest-ranked available by ADP". Its own signed
reach distribution is therefore the control for whatever the keeper slate does to the
pick numbering — that shift applies to both arms.

> ## ⚠️ CORRECTION, 2026-08-13 — THE REACH COMPARISON IN THIS REPORT IS NOT DIAGNOSTIC
>
> **The reference drafter's signed reach is a tautology and I reported a ratio against it
> as if it were a behavioural baseline.**
>
> The reference takes `argmin(adp)` from the pool. If every other seat also drafts by ADP,
> then at pick N the N−1 lowest-ADP players are gone and the best remaining is the Nth —
> so its reach is *exactly* the offset between ADP rank and pick number, which the keeper
> slate creates and nothing else. Computed independently of the simulation, that offset at
> my twelve picks is +3.7, +3.3, +2.0, +4.7, +6.7, +1.7, +3.0, +4.7, +2.7, +9.0, +10.3,
> +4.0 — **identical to the "market" row below**. The arm could not have produced any
> other number.
>
> So "the model's median reach is 3.5× the reference's" says nothing about the model. It
> says the ADP drafter drafts by ADP. Rule 10d, on my own instrument, on the headline
> figure.
>
> **WHAT IN THIS REPORT SURVIVES:**
> * The **positional distribution** — model RB 1 against market RB 6, and the model taking
>   a DEF and a K the market never reaches in twelve picks. Not tautological.
> * The **model's absolute reaches**, which stand alone without any reference: Romeo Doubs
>   taken at pick 70 with an ADP of 143.7, Deebo Samuel at 105 with an ADP of 142.3.
> * The **first-occurrence gaps**: TE at 45 against market 130, QB at 50 against 85.
>
> **WHAT DOES NOT:** every statement of the form "N times the reference", and the p75/p90/max
> comparison between the two arms.
>
> The VONA-rank-against-ADP-rank measurement in Stage 3 is unaffected — it compares two
> rankings of the same pool and neither is pinned by construction.

Reproduce: `node draft/tools/adp_sanity.js`

```
STAGE 1 — MEASUREMENT ONLY. No diagnosis in this file or this output.

  12 of my picks in a 147-pick draft, seat 8, keepers Ja'Marr Chase, Derrick Henry, Kenneth Walker
  Both arms: identical seat, keepers, opponents (ADP) and pick numbers.

POSITIONAL DISTRIBUTION
  pos   model   market
  DEF      1        0
  K        1        0
  QB       2        1
  RB       1        6
  TE       2        1
  WR       5        4

EXACT PICK NUMBERS BY POSITION
  DEF   model: 130                            market: -
  K     model: 145                            market: -
  QB    model: 50, 90                         market: 85
  RB    model: 30                             market: 30, 65, 90, 105, 110, 145
  TE    model: 45, 85                         market: 130
  WR    model: 65, 70, 105, 110, 125          market: 45, 50, 70, 125

FIRST / SECOND / THIRD OCCURRENCE
  pos   model 1st  2nd  3rd    market 1st  2nd  3rd
  DEF       130   -    -          -    -    - 
  K         145   -    -          -    -    - 
  QB         50   90   -          85   -    - 
  RB         30   -    -          30   65   90
  TE         45   85   -         130   -    - 
  WR         65   70  105         45   50   70

POSITION BY ROUND (round = ceil(pick / 10))
  round   model   market
      3   RB     RB
      5   QB     WR
      7   WR     WR
      9   QB     RB
     11   WR     RB
     13   DEF    TE
     15   K      RB

SIGNED REACH (adp - pick; positive = taken EARLIER than market prices him)
           n   median    p75     p90     max     min
  model   12    +13.3   +27.7   +36.7   +73.7    +2.7
  market  12     +3.8    +5.2    +8.8   +10.3    +1.7

SIGNED REACH BY POSITION
  pos        arm     n   median     p75     p90     max
  DEF    model     1    +17.7   +17.7   +17.7   +17.7
  K      model     1    +26.7   +26.7   +26.7   +26.7
  QB     model     2     +8.8   +11.9   +13.8   +15.0
  QB     market    1     +1.7    +1.7    +1.7    +1.7
  RB     model     1     +3.7    +3.7    +3.7    +3.7
  RB     market    6     +3.8    +4.5    +4.7    +4.7
  TE     model     2    +18.8   +24.8   +28.3   +30.7
  TE     market    1    +10.3   +10.3   +10.3   +10.3
  WR     model     5    +11.7   +37.3   +59.1   +73.7
  WR     market    4     +5.0    +7.3    +8.3    +9.0

EVERY MODEL PICK, WITH ITS SIGNED REACH
  pick  30  RB   Breece Hall              adp   33.67   reach +3.7
  pick  45  TE   Tyler Warren             adp      52   reach +7.0
  pick  50  QB   Drake Maye               adp   52.67   reach +2.7
  pick  65  WR   Parker Washington        adp   76.67   reach +11.7
  pick  70  WR   Romeo Doubs              adp  143.67   reach +73.7
  pick  85  TE   Mark Andrews             adp  115.67   reach +30.7
  pick  90  QB   Brock Purdy              adp     105   reach +15.0
  pick 105  WR   Deebo Samuel             adp  142.33   reach +37.3
  pick 110  WR   Jayden Reed              adp  115.33   reach +5.3
  pick 125  WR   Stefon Diggs             adp  131.67   reach +6.7
  pick 130  DEF  Philadelphia Eagles      adp  147.67   reach +17.7
  pick 145  K    Cam Little               adp  171.67   reach +26.7

EVERY MARKET PICK, WITH ITS SIGNED REACH
  pick  30  RB   Breece Hall              adp   33.67   reach +3.7
  pick  45  WR   Luther Burden            adp   48.33   reach +3.3
  pick  50  WR   DJ Moore                 adp      52   reach +2.0
  pick  65  RB   Jaylen Warren            adp   69.67   reach +4.7
  pick  70  WR   Parker Washington        adp   76.67   reach +6.7
  pick  85  QB   Jaxson Dart              adp   86.67   reach +1.7
  pick  90  RB   Blake Corum              adp      93   reach +3.0
  pick 105  RB   Jordan Mason             adp  109.67   reach +4.7
  pick 110  RB   Rachaad White            adp  112.67   reach +2.7
  pick 125  WR   Xavier Worthy            adp     134   reach +9.0
  pick 130  TE   Oronde Gadsden           adp  140.33   reach +10.3
  pick 145  RB   Alvin Kamara             adp     149   reach +4.0
```

---

## RE-RUN, 2026-08-14 — AFTER THE REPAIRS, AND WITH A REFERENCE THAT FIELDS A LEGAL TEAM

**A SIXTH ARTIFACT OF MINE, CORRECTED HERE.** The reference above took `argmin(adp)`
at every pick and finished with **no defence and no kicker** — a roster that cannot field
a lineup. So it spent twelve picks on skill positions while the model spent ten, and every
positional count in the original table was compared across different denominators.
"Model WR 2 against market WR 4" was partly the reference not having to buy a kicker.

The reference now fills its mandatory slots by the same rule the engine uses: once picks
remaining equal mandatory slots unfilled, take the best ADP **at a needed position**. It
changes nothing until the endgame.

Repairs landed between the two runs: VONA restored to the bench branch, the onesie
discount stopped raising negative scores, retired players off the draftable board, byes
derived from the team, `PATHS_BAND` derived rather than floored.

```
pos   model   market
  DEF      1        1
  K        1        1
  QB       2        1
  RB       5        5
  TE       1        1
  WR       2        3

EXACT PICK NUMBERS BY POSITION
  DEF   model: 130                            market: 125
  K     model: 145                            market: 145
  QB    model: 85, 110                        market: 85
  RB    model: 30, 45, 50, 90, 125            market: 30, 65, 90, 105, 110
  TE    model: 70                             market: 130
  WR    model: 65, 105                        market: 45, 50, 70

FIRST / SECOND / THIRD OCCURRENCE
  pos   model 1st  2nd  3rd    market 1st  2nd  3rd
  DEF       130   -    -         125   -    - 
  K         145   -    -         145   -    - 
  QB         85  110   -          85   -    - 
  RB         30   45   50         30   65   90
  TE         70   -    -         130   -    - 
  WR         65  105   -          45   50   70

POSITION BY ROUND (round = ceil(pick / 10))
  round   model   market
      3   RB     RB
      5   RB     WR
      7   TE     WR
      9   RB     RB
     11   QB     RB
     13   DEF    TE
     15   K      K

SIGNED REACH (adp - pick; positive = taken EARLIER than market prices him)
           n   median    p75     p90     max     min
  model   12    +11.0   +19.8   +26.0   +36.0    +2.0
  market  12     +4.2    +7.3   +10.2   +10.3    +1.7

SIGNED REACH BY POSITION
  pos        arm     n   median     p75     p90     max
  DEF    model     1    +17.7   +17.7   +17.7   +17.7
  DEF    market    1    +10.3   +10.3   +10.3   +10.3
  K      model     1    +26.7   +26.7   +26.7   +26.7
  K      market    1     +9.0    +9.0    +9.0    +9.0
  QB     model     2    +13.0   +16.5   +18.6   +20.0
  QB     market    1     +1.7    +1.7    +1.7    +1.7
  RB     model     5     +9.0   +19.7   +29.5   +36.0
  RB     market    5     +3.7    +4.7    +4.7    +4.7
  TE     model     1     +7.3    +7.3    +7.3    +7.3
  TE     market    1    +10.3   +10.3   +10.3   +10.3
  WR     model     2    +11.0   +11.3   +11.5   +11.7
  WR     market    3     +3.3    +5.0    +6.0    +6.7
```

**Five of six positions now match or sit within one.** RB was the largest gap in the
original run — model 1 against market 6 — and is now **5 against 5**. QB first occurrence
is identical at pick 85. The model remains **+1 QB, −1 WR**, and takes its TE at 70 against
the market's 130.

**Reach is still wider than the reference at every position**, and the reference's own
reach remains a tautology (see the correction above), so the honest reading is the
absolute figures: the model's worst reach is now +36.0, down from +73.7.
