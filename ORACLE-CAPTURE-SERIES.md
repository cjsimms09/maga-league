# TERRITORY: C
# THE ORACLE-CAPTURE SERIES — frozen method `oracle-capture/v1`, and its first three points

**One number per season: of the value that was on the board at Cory's picks, what
fraction did an arm capture.** Frozen the way the filters are frozen. If the method
must change, that is a NEW dated version, the old one is retained, and BOTH are
reported for at least one overlapping season.

---

## THE CAVEATS ARE PART OF THE DEFINITION, NOT PART OF THE FIRST REPORT

**These travel with every future quotation of these numbers. A reader in 2029 will not
have had the conversation that produced them.**

1. **VALID FOR THE BOARD, NOT FOR THE SEASON.** Only Cory's picks change; every other
   owner is held at what they actually did. So this measures **what was takeable from
   the board as it stood at each of his picks**. It is **NOT** a claim about the season
   that would have followed — every pick after the first divergence would have moved the
   room. That is what closed Route 2, and it applies here unchanged.
2. **ANY MARGIN OVER CORY'S ACTUAL ROSTER IS INFLATED BY AN UNKNOWN AMOUNT** once a tool
   arm exists. His drafts are in the weight tuning and in the board's ADP. The size of
   the inflation is not estimable, only its direction.
3. **THREE OBSERVATIONS ON POINTS; MUCH SHARPER ON SHAPE.** No significance is available
   on the points question and none is claimed. **The detectable-effect floor for a trend
   is not met and will not be met before ~2028.** A series that cannot yet distinguish
   improvement from noise says so on its own face rather than being read as flat.
4. **THE POINTS SOURCE UNDERSTATES THE CEILING.** League `players_points` covers only
   weeks a player was ON a roster, so a mid-season cut keeps partial weeks and a player
   nobody rostered scores nothing. Conservative: it can only shrink the measured
   opportunity.
5. **THE CEILING IS GREEDY, SO IT IS A LOWER BOUND ON THE TRUE CEILING.** Capture is
   therefore an OVER-estimate of skill, which is the direction that cannot flatter us.
   Cory beats the greedy ceiling at individual picks (2024 R13, −241), which is expected
   and is the proof it is not optimal.

**AND THERE IS NO TOOL ARM BEFORE 2026.** `recommend()` needs a board for the season it
replays. None exists for 2023–25: ADP and projection series are 2026-only, the board's
oldest revision is 2026-08-10, and **the repository's first commit is 2026-08-08**.
Substituting realized points for projections would make the tool identical to the oracle.
**These three points measure the size of the prize. The tool's share of it starts in
2026** — and only if the 2026 board is frozen at draft time.

---

## THE METHOD, v1

| element | definition |
|---|---|
| seat | roster_id 1 (`coryjsimms`) |
| decision slots | Cory's **non-keeper** picks. A keeper is not a decision. |
| board state | players taken by other owners are gone from their real pick; **players Cory really took stay available** to counterfactual arms |
| points | league `players_points`, summed over the season, the league's own scoring |
| **scored on** | **weekly-optimal legal starting lineup, summed over 18 weeks** — bench points are worth nothing, applied identically to every arm |
| position | inferred from the `starters` slot a player occupied; FLEX never assigns a position |
| **floor** | **next-off-the-board** — lowest still-available actual `pick_no`. Shape-blind. **NOT public ADP**, which does not exist for these seasons |
| **ceiling** | **slot-aware oracle** — the available player that most improves the starting lineup |
| **capture** | **(arm − floor) / (ceiling − floor)** |

---

## FIRST THREE POINTS

| season | capture | actual (start) | floor | ceiling | actual holes |
|---|---|---|---|---|---|
| 2023 | **14.1%** | 1882.7 | 1710.8 | 2928.4 | none |
| 2024 | **21.8%** | 2323.7 | 2162.6 | 2901.7 | none |
| 2025 | **9.9%** | 1673.1 | 1560.4 | 2703.7 | none |

**Cory beat the shape-blind floor in 3 of 3 seasons and filled every starting slot in 3
of 3.** The floor left holes in 2 of 3 (2024 TE, 2025 K).

**No trend is claimed. Three points, range 9.9–21.8, and the detectable-effect floor is
not met.**

---

## WHERE THE GAP CONCENTRATES

| season | top-3 picks' share | rounds ≤5 | rounds >10 |
|---|---|---|---|
| 2023 | 45% | 54% | 28% |
| 2024 | 66% | 46% | 3% |
| 2025 | 66% | 0% | 34% |

**The gap IS concentrated — but not in a consistent round.** 2023's single largest miss is
R1 (+238), 2024's is R3 (+347), 2025's are R7 (+241) and R10 (+186). So the value is
concentrated *and unpredictably located*, which is a different and weaker finding than
"attack round N".

---

## THE METHOD DEFECT FOUND BY RUNNING IT, AND WHY v1 IS NOT v0

**v0's ceiling was the available player with the most realized points**, exactly as
specified. Measured, it left TE, K and DEF unfilled in **all three seasons**, scored
BELOW Cory's actual roster in 2024 (2164.6 vs 2323.7), and landed within 2 points of the
floor — so the capture fraction divided by ~zero and **2024 read 7896%**.

A shape-blind maximiser is not a ceiling. The ceiling has to be the best ROSTER
obtainable, not the largest pile of points.

**And the same defect silently destroyed the concentration signal.** Measured against the
shape-blind oracle the top-3 share reads 25/30/33% — flat and unconcentrated. Against the
slot-aware ceiling it is 45/66/66%. **The broken instrument would have produced the
conclusion "draft-day value capture has no addressable structure in our room", which was
pre-declared as the falsifying outcome and would have been wrong.**

That is the argument for freezing a method only after running it once.

---

## PREDICTIONS, SCORED AGAINST THE PRE-DECLARATION

| # | prediction | result |
|---|---|---|
| P1 | oracle beats actual by 40%+ on total points | **CONFIRMED** — +85%, +74%, +130% |
| P2 | oracle's edge shrinks on starting points; fails a slot in ≥2 of 3 | **CONFIRMED, harder than predicted** — holes in 3 of 3, severe enough to invert the comparison |
| P3 | absolute gap largest in earliest rounds, declining monotonically | **WRONG** — not monotonic anywhere; 2025's gap is entirely R7+ |
| P4 | top 3 picks > 50% of the gap in ≥2 of 3 | **CONFIRMED** — 45%, 66%, 66% |
| P5 | floor finishes below actual in ≥2 of 3 | **CONFIRMED** — 3 of 3 |
| P6 | floor leaves a starting hole in ≥1 of 3 | **CONFIRMED** — 2 of 3 |

Five of six confirmed. **P3 is wrong and stays on the record.**
