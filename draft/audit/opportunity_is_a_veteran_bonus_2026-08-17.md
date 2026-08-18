# E's fifth sweep — the board's only per-player signal is one a rookie cannot earn

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`, 682 players.

The first four sweeps were structural. This one is the plain football read
`SESSION-E.md` asks for — the top of the board, player by player, against the
market — and it found the mechanism behind something the project has already
measured in dollars and could not explain.

---

## FINDING 7 — `opportunity_adj` rises monotonically with experience, and it is the only per-player term the board has

Sweep 2 established that `proj_mean = proj_sleeper × (1 + opportunity_adj)`, that
`proj_baseline == proj_sleeper` for 427 of 427, and that `opportunity_adj` is
therefore **the only per-player thing the board adds to a raw Sleeper number**.

`opportunity_z` is built from `wopr`, `target_share` and `opportunity_share` —
**all prior-season usage.** So the board's single per-player signal is, by
construction, a reward for having already had a role.

Top-150 skill players (RB/WR/TE), grouped by experience:

| years_exp | n | median `opportunity_adj` | at the 0.15 cap | `adj == 0` | median (ADP − board rank) |
|---|---|---|---|---|---|
| **0–1** | 13 | **+0.0783** | **0** | 2 | **−14.0** |
| 2–3 | 24 | +0.1166 | 8 | 0 | +0.0 |
| 4–5 | 21 | **+0.1454** | 9 | 0 | **+4.0** |
| 6+ | 21 | +0.1377 | 9 | 0 | +2.7 |

**The adjustment rises monotonically with experience, and not one player with 0–1
years reaches the cap while 26 of 66 established players do.** The board's
disagreement with the market is ordered the same way: it sits below the market on
the young and above it on the old.

### The extremes, with full rows

```
                       ovr    adp     gap   yrs   opp_z  opp_adj    wopr
TreVeyon Henderson  RB 147   51.7   -95.3     1    0.62   0.0462   0.083
Carnell Tate        WR 142   71.7   -70.3     0     0.0   0.0000    None
Cam Skattebo        RB  83   37.0   -46.0     1    0.11   0.0085   0.066
Luther Burden       WR  93   51.0   -42.0     1    0.02   0.0012   0.178
Jeremiyah Love      RB  46   26.3   -19.7     0     0.0   0.0000    None
```

against the other end:

```
Hunter Henry        TE 112  150.3   +38.3    10    2.09   0.1500   0.380
Mark Andrews        TE  86  116.3   +30.3     8    1.96   0.1468   0.363
Travis Kelce        TE  72   97.3   +25.3    13    2.61   0.1500   0.445
Mike Evans          WR  36   61.7   +25.7    12    1.07   0.0801   0.373
```

**Two players inside the top 150 carry no usage data at all** — `wopr: null` —
and both are rookies, and both receive `opportunity_adj` of exactly **0.0000**:
**Jeremiyah Love** (market ADP 26.3, board 46) and **Carnell Tate** (market ADP
71.7, board 142). Their `proj_mean` is raw Sleeper with nothing added, while
Travis Kelce's carries the full +15%.

**This is the same trap the volatility prereg was written to avoid**, pointed at
a different group. Brief §7 item 1 fixes that *"a player with NO volatility keeps
his CELL constant — never the positional mean, which would hand the steadiest
reading to the injury-return group."* The opportunity term hands its **weakest**
reading to the no-prior-role group, and nothing declares that as a decision.

### Why this is not just "the market disagrees"

**The market is not truth, and I am not claiming the board is wrong because it
differs from ADP.** What makes this a finding rather than a difference of opinion
is that **the project has already measured this cost, in dollars, and did not
have a mechanism for it:**

- The 08-16 league benchmark found **rookie rate and rookie profit** to be one of
  the two separators between the top-3 drafters and the tool.
- A **rookie draft-capital prior CLEARED its preregistered bar at +25.1, which
  the study itself put at 38% of Cory's pooled gap** — its single largest
  measured improvement.
- `DECISIONS-NEEDED.md` already carries a prepared, gated diff noting that **0 of
  153 rookies carry a `proj_ownmodel` value**.

That study measured the symptom. **This is a mechanism for it:** the only
per-player term on the board is structurally unavailable to the population the
study found the tool loses money on.

### Honest limits, stated before anyone asks

- **n = 13** in the 0–1 group. Small. The full gap distribution, so the median is
  not hiding a couple of outliers: `−95.3, −70.3, −46.0, −42.0, −25.7, −19.7,
  −14.0, −0.7, +2.7, +6.0, +7.3, +8.3, +18.3` — **8 of 13 below market**, with
  the tail running one way.
- **Experience and usage are genuinely correlated in the world.** A veteran WR1
  really does have more established opportunity than a rookie. The question is
  not whether the correlation is real but whether the board should carry it as
  its *only* per-player adjustment, uncapped in one direction and floored at zero
  in the other.
- **I have not measured what a fix would be worth.** That is a prereg and a
  measurement, and it is A's to order.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      Should the opportunity term stay the board's only per-player
          adjustment, given it cannot fire for players with no prior-season
          role?
EVIDENCE: median opportunity_adj +0.0783 / +0.1166 / +0.1454 / +0.1377 by
          experience band; 0 of 13 young players at the cap vs 26 of 66
          established; two top-150 rookies at exactly 0.0000 with wopr null;
          median board-vs-market gap -14.0 for 0-1yr vs +4.0 for 4-5yr.
          The rookie draft-capital prior already CLEARED its bar at +25.1,
          38% of Cory's pooled gap, which is the same finding from the
          dollar side.
REC:      A rules. I am not proposing a formula. The narrow observation is
          that the rookie prior already measured as the largest single
          improvement available, and this says WHERE the gap comes from --
          so the two should be considered together rather than as separate
          items.
DEFAULT:  Filed. Nothing ships before 08-22 and I am not asking for it to.
          Recorded so the rookie prior decision, which is already queued in
          DECISIONS-NEEDED.md, is made with the mechanism visible.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — `opportunity_adj` has 97/156/85 distinct values
   at RB/WR/TE.
2. **Did it arrive?** Yes — `projections.py:441`, on every skill-position row.
3. **Could the check have fired?** Yes — the experience bands differ 0.078 to
   0.145 and the cap counts 0-of-13 against 26-of-66, so the comparison
   discriminates. Had the term been experience-neutral, the four medians would
   have been flat.

---

## FINDING 8 — on the QB board, FantasyPros and the market agree with each other and disagree with Sleeper

More evidence for the A2 / register 21 source ruling, and more legible than
sweep 2's aggregate correlations.

| QB | Sleeper | FP | market | board ovr |
|---|---|---|---|---|
| Josh Allen | QB1 | QB1 | QB1 | 16 |
| Lamar Jackson | QB2 | QB2 | QB2 | 34 |
| Drake Maye | QB3 | QB3 | QB3 | 41 |
| Joe Burrow | QB4 | QB4 | QB4 | 49 |
| Dak Prescott | **QB5** | QB7 | QB9 | 58 |
| Brock Purdy | **QB6** | QB10 | **QB14** | 62 |
| Jalen Hurts | **QB8** | **QB5** | **QB6** | 77 |
| Jayden Daniels | **QB10** | **QB6** | **QB5** | 84 |

**The top four are unanimous. Then the two sources split, and FantasyPros lands
on the market's side both times.** Sleeper ranks Prescott and Purdy above Hurts
and Daniels; FantasyPros and ADP both invert that. The board follows Sleeper, so
**Jayden Daniels sits at overall 84 against a market price of 59, and Brock Purdy
at 62 against a market price of 106.**

**A hunch, labelled as a hunch because I cannot test it from the board:** the four
QBs Sleeper is relatively high on are pocket passers and the two it is low on are
the league's highest-rushing-floor starters, which is the shape of a projection
that under-weights QB rushing. **The board carries no per-stat QB projection, so
I cannot check this** — `proj_series.json` stores one scalar per player
(register 22). If FP's per-stat projections are ever captured, that is the test:
compare rushing yards and rushing TDs per QB between the sources. **Until then it
is a pattern with a plausible story and no measurement, and it should be read as
exactly that.**

**Routed to A** as evidence for the source ruling. Not a recommendation — register
20 says the measurement that would settle Sleeper-vs-FP does not exist.

---

## DIED — the depth chart disagreeing with usage, and `vorp == 0.00`

**14 pairs inside the top 250 where `depth_chart_order` contradicts the board's
own `wopr`** — e.g. `JAX WR: Parker Washington depth 1, wopr 0.397 (ovr 50)`
against `Brian Thomas depth 2, wopr 0.483 (ovr 57)`; `KC WR: Rashee Rice depth 1,
wopr 0.216` against `Xavier Worthy depth 2, wopr 0.381`; `NYG RB: Cam Skattebo
depth 1, wopr 0.066` against `Tyrone Tracy depth 2, wopr 0.146`.

**This explains itself and is not a defect.** `depth_chart_order` is Sleeper's
*live* depth chart and `wopr` is *prior-season* usage, so a player who has just
ascended to the top of his depth chart correctly shows a low prior-season figure.
Every one of the eight largest disagreements is exactly that player. The two
fields are measuring different seasons, and the disagreement is the signal rather
than the error — **which is precisely how I arrived at Finding 7.** A flag that
dies can still be the thing that points at the real one.

**`vorp == 0.00` for exactly 10 players** — one per position, plus five tied
kickers who all project 97.0. Each is the replacement-level player at his
position (`Cam Skattebo 189.1 = RB replacement 189.10`, `Jayden Daniels 341.7 =
QB replacement 341.72`, `Mark Andrews 151.9 = TE replacement 151.95`). Zero VORP
at replacement level is the definition working, not a clamp.

---

## RUNNING TALLY, FIVE SWEEPS

**Filed (8):** band-edge dispersion misread (`NO DEFAULT — BLOCKED`) ·
opportunity-cap saturation · non-mean-preservation and QB exclusion ·
source-ruling evidence · live PUP/IR status reaching no availability number ·
the inverted single-source caveat · the opportunity term as a veteran bonus ·
the QB source split.

**Died (10):** draft-slot arithmetic · bye completeness · tier construction ·
`injury_status` unused · `games_expected` undocumented · `adp_stale`
one-sidedness · `search_rank` reaching a draftable pick · K/DEF ranking ·
depth-chart-vs-usage · `vorp == 0.00`.

**Still uncovered:** registers 2 and 3, which concern the *fresh* 693-player
board. Every sweep here has read the published 682-row board because that is what
Cory drafts from; a fresh build needs Sleeper/FFC egress this session does not
have.
