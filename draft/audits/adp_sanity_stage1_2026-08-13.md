# STAGE 1 — EXTERNAL SANITY TRIAGE, MEASUREMENT ONLY

**2026-08-13. A. FROZEN BEFORE THE MODEL WAS OPENED.**

Cory's instruction: "PRODUCE A STAGE 1 REPORT CONTAINING NO DIAGNOSIS, NO VORP
EXPLANATION AND NO HYPOTHESIS." This file contains none. It was committed before
any Stage 2 work began, so the interpretation cannot have shaped the measurement.

Reference drafter: same seat (8), same three keepers, same ADP opponents, same pick
numbers; its only selection rule is "highest-ranked available by ADP". Its own signed
reach distribution is therefore the control for whatever the keeper slate does to the
pick numbering — that shift applies to both arms.

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
