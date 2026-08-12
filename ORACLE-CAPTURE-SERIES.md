# TERRITORY: C
# THE ORACLE-CAPTURE SERIES — frozen method `oracle-capture/v1`, and its first three points

**One number per season: of the value that was on the board at Cory's picks, what
fraction did an arm capture.** Frozen the way the filters are frozen. If the method
must change, that is a NEW dated version, the old one is retained, and BOTH are
reported for at least one overlapping season.

---

## WHAT THIS IS, WRITTEN INTO THE RESULT AND NOT INTO A CAVEAT

**THIS IS AN OPPORTUNITY-SIZE MEASUREMENT. IT IS NOT A TOOL EVALUATION, AND IT CANNOT
BE ONE.** It answers *how much value was available in this room at Cory's picks*. It
does **not** answer *what share of it the tool takes* — there is no tool arm before 2026,
because no board exists for 2023–25. Any sentence that reads these numbers as a verdict
on the engine is reading a claim that is not here.

---

## THE ANSWER: THE PRIZE IS LARGE

Perfect-foresight, slot-aware drafting against the same board, in the same seat, with
every other owner's picks held fixed:

| season | added starting points | per week | as a share of an average weekly score |
|---|---|---|---|
| 2023 | +1045.7 | **+58.1/wk** | **+54%** |
| 2024 | +578.0 | **+32.1/wk** | **+29%** |
| 2025 | +1030.6 | **+57.3/wk** | **+53%** |

Average weekly score in this league is 107.6 / 112.5 / 108.1. **A perfectly drafted
roster would have scored a third to a half again as much, every week, all season.** That
is not a marginal lever — it would win essentially every matchup, and 37.5% of the pot
pays weekly.

**So draft-day value capture is a BIG lever in this league.** The whole draft-side
programme is competing for a prize that demonstrably exists. What fraction of it is
reachable *without hindsight* is precisely the question this exercise cannot answer, and
the one the 2026 four-arm run begins to.

**And shape discipline alone — Cory versus a shape-blind drafter — is already worth
+9.5, +8.9 and +6.3 points per week** (8.9%, 8.0%, 5.8% of a weekly score). That is a
typical matchup margin, earned before any tool.

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
4. **THE POSITION-COVERAGE GAP IS SYSTEMATIC, AND MEASURED RATHER THAN LEFT AS A
   WORRY.** Position is inferred from the starting slot a player occupied, so a drafted
   player who NEVER started has no position and cannot be considered by the slot-aware
   ceiling. That is 13% / 11% / 19% of drafted players. **Measured, they are not a random
   sample — they are late and they are bad:**

   | | unknown | known |
   |---|---|---|
   | mean draft round | 10.2–11.5 | 6.3–7.6 |
   | mean realized points | 34.7–40.1 | 162.1–169.3 |
   | **best single unknown** | **138.9 / 199.9 / 171.4** | 12th-best known: **326.9–328.4** |

   **The best invisible player in any season scored less than the TWELFTH-best visible
   one.** So no excluded player was ever a candidate the ceiling would have chosen, and
   the direction is knowable: a ceiling that cannot see them is understated by ~nothing,
   which makes capture over-stated by ~nothing. **This is a characterised gap, not an
   unknown one**, and it is the reason the ceiling can be trusted despite the inference.

5. **THE POINTS SOURCE UNDERSTATES THE CEILING.** League `players_points` covers only
   weeks a player was ON a roster, so a mid-season cut keeps partial weeks and a player
   nobody rostered scores nothing. Conservative: it can only shrink the measured
   opportunity.
6. **THE CEILING IS GREEDY, SO IT IS A LOWER BOUND ON THE TRUE CEILING.** Capture is
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

## P2 IS INDEPENDENT CONFIRMATION OF THE STARTABLE-CAPACITY MASK

**Cory named P2 as the prediction he most wanted tested, because the mask is the single
largest measured term in the system (~$443) and its entire justification is that raw
value maximisation leaves a roster you cannot start.**

**P2 HOLDS, in 3 of 3 seasons, and harder than predicted.**

| season | shape-blind oracle, starting pts | Cory's actual | holes left by the oracle |
|---|---|---|---|
| 2023 | 2074.4 | 1882.7 | TE, K, DEF |
| 2024 | **2164.6** | **2323.7** | TE, K, DEF |
| 2025 | 1839.2 | 1673.1 | TE, K, DEF |

**In 2024 a value-maximising oracle WITH PERFECT FORESIGHT scored 8.8 points per week
LESS than Cory did**, because it had no tight end, no kicker and no defence. Across all
three seasons it left the same three slots empty every time.

**That is confirmation of the mask from a direction nothing has tested.** Not a model
argument and not a simulation: perfect knowledge of realized points, spent without shape
discipline, produces a roster that loses to a human who filled his slots. The mask's
premise is that raw value maximisation leaves you unable to field a lineup. Measured, it
does exactly that, and the penalty is large enough to erase a perfect-foresight advantage
of 74% on total points.

**The one thing this does NOT do is price the mask.** It confirms the direction and the
magnitude is large; it does not independently produce $443, and no reading here should be
quoted as validating that figure.

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
