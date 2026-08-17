# THE 6-POINT PASSING TD IS NOT AN EDGE. DON'T MOVE A PICK FOR IT.

**TERRITORY: A. 2026-08-16. Draft is Saturday the 22nd.**
Module `draft/backtest/qb_scoring_arbitrage.py` · result
`draft/backtest/qb_scoring_arbitrage.json` · 26 tests in
`draft/tests/test_qb_scoring_arbitrage.py` · historical arm pre-registered in
`draft/backtest/QB-ARBITRAGE-PREREG.md`, committed **before** it was graded.

---

## THE ANSWER, IN ONE PARAGRAPH

Yes, the mispricing is real: the ADP feed that prices this board is built on a
4-point passing touchdown, this league pays 6, and that is worth **+43.67 points
to the average top-12 quarterback and exactly 0.00 to every other position.**
And it is worth **nothing at the table**, because it is worth +40 points to the
*replacement* quarterback too. A pick does not buy points, it buys points above
the man you'd have taken instead, and the 43.67 cancels almost entirely in that
subtraction. **Measured, not assumed: Josh Allen's arbitrage after replacement is
+4.00 points, against a VORP of 63.78 — about two picks, a fifth of a round.**
Three seasons of this league's own drafts show no sign of quarterbacks
out-returning what the room paid for them; if anything the point estimate leans
the other way. **Draft exactly as the board already says.**

---

## THE TABLE, IF YOU READ NOTHING ELSE

What each quarterback would need the arbitrage to be worth — after replacement —
to justify taking him **one round earlier than the board already has him**, and
what it is actually worth.

| QB | ADP | board VORP | board rank | needs dVORP of | = extra pass TDs over QB10 | actually measured |
|---|---:|---:|---:|---:|---:|---|
| Josh Allen | 20.7 | 63.78 | 16 | **+33.37** | 16.7 | **+4.00** |
| Lamar Jackson | 37.7 | 30.28 | 34 | +12.36 | 6.2 | not measurable |
| Drake Maye | 52.3 | 26.04 | 40 | +7.56 | 3.8 | not measurable |
| Joe Burrow | 51.7 | 20.40 | 48 | +6.81 | 3.4 | not measurable |
| Dak Prescott | 81.0 | 11.16 | 58 | +9.51 | 4.8 | not measurable |
| Brock Purdy | 106.7 | 8.48 | 60 | +10.51 | 5.3 | not measurable |
| Caleb Williams | 75.3 | 3.62 | 73 | +3.84 | 1.9 | not measurable |
| Jalen Hurts | 62.0 | 2.82 | 75 | +4.63 | 2.3 | not measurable |
| Trevor Lawrence | 85.7 | 1.70 | 77 | +5.31 | 2.7 | **+0.00** |
| Jayden Daniels | 59.3 | 0.00 | 84 | +4.92 | 2.5 | not measurable |
| Justin Herbert | 78.3 | −4.24 | 100 | +4.25 | 2.1 | not measurable |
| Bo Nix | 107.0 | −6.00 | 109 | +2.01 | 1.0 | not measurable |

**How to read the last two columns.** Because only two scoring terms differ, the
arbitrage is `2 × pass_td − 1 × pass_int` and nothing else — so "extra pass TDs
over QB10" is just the break-even divided by two. Josh Allen would have to
out-throw the tenth-best quarterback by **seventeen touchdowns** for the 6-point
rule to justify moving him up one round. He projects to out-throw Trevor
Lawrence — who sits 1.70 points off the replacement line — by **one**.

There is no "take by pick N" column, and that is the finding, not an omission.
**No quarterback on this board becomes correctly priced at a different pick
because of the scoring gap.**

**One frame check, because the brief asked "how many rounds earlier than ADP".**
The board *already* disagrees with ADP at quarterback — Josh Allen goes at 20.7
and the board ranks him 16th; Bo Nix goes at 107 and the board ranks him 109th.
That disagreement is `proj_mean` vs the market and it exists for reasons that
have nothing to do with the scoring gap. Every movement number above is measured
against **the board's own rank**, not against ADP, and it answers the only
question the arbitrage can answer: *does knowing about the 6-point passing TD
change where the board says to take him?* It does not. Cory should still draft
off the board's ranks rather than off ADP — but that was already true yesterday.

---

## THE ONE MISTAKE THIS STUDY EXISTS TO PREVENT

Take the 43.67 at face value, add it to every quarterback's VORP, and the board
tells you to move quarterbacks **one to seven rounds earlier**. That is the
number a reasonable person gets from the provenance line, and it is wrong:

| QB | naive (raw gap as VORP) | honest (dVORP after replacement) |
|---|---:|---:|
| Josh Allen | 1.2 rounds earlier | **0.2** |
| Lamar Jackson | 2.2 | **0.5** |
| Drake Maye | 2.4 | **0.5** |
| Joe Burrow | 2.9 | **0.5** |
| Dak Prescott | 3.3 | **0.7** |
| Jalen Hurts | 4.6 | **0.7** |
| Justin Herbert | 6.6 | **0.6** |
| Bo Nix | 7.2 | **1.3** |

*(The "honest" column is generous: it applies Josh Allen's +4.00 — the largest
measured dVORP on the board — to every quarterback. The true figures are smaller.)*

**Why the naive column is wrong, in one line of algebra:**

```
VORP_ours(q) − VORP_market(q)  =  [pts_ours(q) − R_ours] − [pts_mkt(q) − R_mkt]
                               =  gap(q) − gap(R)
```

The 43.67 is the *level* of `gap`. VORP subtracts the level. Only the *dispersion*
survives — how much more this quarterback throws than the replacement
quarterback — and that is small, because the position is deep and the league
starts one.

**And the mechanism cuts against the players you'd want to move.** The gap is
`2 × pass_td − pass_int`: rushing yards and rushing touchdowns are scored
identically in both worlds and contribute **zero**. So a rushing quarterback —
exactly the profile a drafter reaches for — gains *less* than the pocket passer
at replacement, and his corrected value goes *down*, not up.

---

## HOW THE +4.00 WAS MEASURED RATHER THAN ASSUMED

A built board carries only already-scored points, so per-player gaps are not
recoverable from `public/draft_data.json` — `lab_scoring_gap`'s docstring says
this and it is correct. Exactly **two** 2026 quarterbacks have their raw provider
stat line committed anywhere on this branch, in `draft/audit/rule12_statlines.json`,
captured for an unrelated audit. By luck they are the two the argument needs:

| | pass TD | INT | gap = 2·TD − INT | proj_mean | board slot |
|---|---:|---:|---:|---:|---|
| Josh Allen | 27.0 | 10.0 | **44.0** | 405.50 | QB1 |
| Trevor Lawrence | 26.0 | 12.0 | **40.0** | 343.42 | QB9 |

The QB replacement line on this board is **341.72**. **Trevor Lawrence sits 1.70
points above it.** He is, to within a rounding error, the replacement
quarterback — so `gap(R) = 40.0` is a measurement, not an estimate, and

```
dVORP(Josh Allen) = 44.0 − 40.0 = +4.00 points
```

Both gaps were computed twice — by the closed form and by running the shipped
`scoring.score_stat_line` under both tables — and agree exactly. A test asserts
the proxy stays within 10 points of the replacement line on future boards; if it
drifts, `gap(R)` stops being measured and this number must not be quoted.

*(The two raw rows were captured against the 2026-08-11 board; the shipped board
is 2026-08-15. Both projections are unchanged between them — Allen 405.50,
Lawrence 343.42 — so the join is clean.)*

### The adversarial sweep — run in the direction that would help the thesis

`gap(R) = 40.0` comes from a proxy 1.70 points above the line. The quarterback
*exactly* on the line is **Jayden Daniels, a rushing quarterback** — and rushing
contributes nothing to this gap, so his true gap is plausibly **lower** than
Lawrence's, which would make every pocket passer's arbitrage **larger**. That is
a real objection, so it was swept rather than waved away:

| if gap(R) were | that implies a replacement QB throwing | dVORP for QB1 | QB1 moves |
|---:|---:|---:|---:|
| 44 | 27 TD | +0.00 | 0.0 rounds |
| 40 *(measured)* | 25 TD | **+4.00** | **0.2 rounds** |
| 36 | 23 TD | +8.00 | 0.3 rounds |
| 32 | 21 TD | +12.00 | 0.5 rounds |
| 28 | 19 TD | +16.00 | 0.6 rounds |
| 24 | 17 TD | +20.00 | 0.7 rounds |

**The conclusion does not depend on the proxy.** Even at a replacement
quarterback throwing seventeen touchdowns — implausible for a passer projected at
341.72 points — Josh Allen still moves **less than one round**. Pinned by
`test_THE_CONCLUSION_HOLDS_ACROSS_EVERY_PLAUSIBLE_REPLACEMENT_GAP`.

**What could not be done:** the other ten quarterbacks' gaps are **unmeasurable
on this branch**. There is no raw 2026 stat line for them, no 2026 passing-TD
prop market in `draft/data/odds/`, and network egress is closed
(`CONNECT tunnel failed, 403`). Rather than multiply a position-average share by
`proj_mean` — which would erase precisely the per-QB dispersion the question is
about — this study **inverts the question into the break-even table above**,
which needs no per-player projection at all. That is why the deliverable is
"here is what it would take" rather than "here is each QB's number".

---

## DOES IT SURVIVE REPLACEMENT? NO. THAT IS THE FINDING.

Stated as plainly as the brief asked for:

> **The arbitrage washes out against replacement.** The 43.67 is an illusion of
> looking at raw points. QB replacement is high (341.72) precisely because ten
> teams start ten quarterbacks in a deep position, and the same +40-odd points
> that lift Josh Allen lift the man who replaces him. What is left — +4.00 points
> on the board's best quarterback, 6% of his VORP, two picks — is smaller than
> the noise in any projection that produced it. `proj_sd` for Josh Allen on this
> board is **110.54**.

---

## THE HISTORICAL CHECK — pre-registered, and it agrees

**Prediction recorded before the run** (`QB-ARBITRAGE-PREREG.md` §4): *"mean QB
residual will NOT be reliably positive… intervals will straddle zero in at least
two of the three seasons."*

**Result: they straddle zero in all three.** Realized regular-season points
(weeks 1–18, frozen table, `pass_td` 6 / `pass_int` −2), realized replacement
recomputed per season, priced at the pick number this room actually paid, with a
within-season isotonic price→return curve fitted across all positions.

| season | QB residual | 95% CI | n |
|---|---:|---|---:|
| 2023 | −18.45 | [−70.92, +30.89] | 17 |
| 2024 | +8.60 | [−45.49, +57.39] | 14 |
| 2025 | −24.40 | [−75.85, +23.97] | 14 |
| **pooled** | **−11.88** | **[−42.14, +16.46]** | **45** |

Permutation null (position labels shuffled within season, 4000 draws): the
observed QB mean is **ordinary**, fraction at least as extreme **0.19**.

The structural argument predicts quarterbacks should have been *systematically
underpaid* in this league for years. Three seasons show nothing of the kind, and
the point estimate leans the other way — consistent with `VONA-ROOM-VS-MARKET`'s
finding that this room takes quarterbacks earlier than market at every slot,
18 of 18 observations. **Three seasons is a small sample and is not evidence the
edge is absent**; it is evidence that an edge of the advertised size did not show
up where it should have been impossible to miss.

**Exclusions, counted, never zeroed:** keepers 0 / 23 / 20 — the committed 2023
draft records **no** keeper picks at all, which is stated as observed rather than
explained, since `league_history.json` exposes no previous-league link to confirm
2023 was the league's first year; K and DEF picks 20 / 19 / 21 (the weekly store is offence-only —
a kicker has no comparable row, which is missing data, not a zero); no position
on record 3 / 2 / 2; **no realized row 0 / 0 / 1**. The sensitivity arm re-runs
everything with unmatched picks entered at 0 points and moves the pooled QB
residual from −11.88 to −11.54 — the exclusion is not doing any work here.

**Exploratory, NOT pre-registered, and reported only because suppressing it would
be worse:** tight end shows a pooled residual of **+21.13, CI [+5.75, +36.40]**,
permutation fraction 0.03. Four positions were tested; at 95% one crossing by
chance is expected roughly one time in five, so this is a lead and nothing more.
It is unrelated to the scoring gap — TE gap is 0.00 — and belongs to whoever
picks up the roster-construction lane, not to this study.

---

## WHAT I COULD NOT DO

1. **Per-QB gaps for ten of the twelve.** No raw 2026 stat lines, no 2026 passing
   -TD props, no egress. The break-even table is the honest substitute.
2. **Historical *market* ADP.** Established before running anything (prereg §9):
   `draft/backtest/archived_adp.py` is a pure Wayback-CDX **URL builder** that
   fetches nothing, and this branch carries **no committed historical-ADP store**.
   So the historical arm prices picks at **this room's own draft slots**, which
   answers *"was this room wrong about QBs"* and **not** *"was the market wrong
   about QBs"*. That substitution is declared, and no market claim is made from it.
3. **Recompute the position-level gap myself.** `lab_scoring_gap.measure` runs
   inside `build.py` while the provider payload is still in hand; I am to stay out
   of `build.py` and cannot rebuild offline. I verified the shipped numbers
   (QB n=228, mean 5.53, top-12 43.67, every other position 0.00) and the frozen
   table's `pass_td` 6 / `pass_int` −2 stamp, but the 43.67 is read, not re-derived.
4. **Component-level history.** `component_stats_*.json` and
   `fetch_component_stats.py` are **not on main** — they live on the unmerged relay
   branch. On main the weekly stores carry already-scored points only, so realized
   seasons cannot be re-scored under the market's table. This does not affect the
   result: the historical arm's question is about our scoring, not theirs.

---

## PRIOR ART — this ground is not new, and the brief was wrong that it was

The task described this as "completely unexploited… nobody has turned it into a
draft decision." That is not accurate and it should be corrected in the record:

- `draft/backtest/lab_scoring_gap.py` (on main) is the measurement that produced
  the provenance line, and explicitly refuses to be a correction.
- `draft/backtest/nflverse_qb_scoring.py` (on main) already asks the crossover
  question under both tables, and its docstring already names the exact trap this
  study confirms: *"most of the naive version of this measurement is that
  omission: it hands back the raw scoring difference wearing a VORP label."*
- On the **unmerged relay branch** `claude/fantasy-football-research-926y6z`:
  `exp_scoring_gap_correction.py` and
  `draft/audit/scoring_gap_correction_backtest_2026-08-15.md` already backtested a
  VORP-based correction across three seasons, found raw gaps of +37…+46 collapsing
  to dVORP of 0…7.2, and priced every decision it would have flipped at **$0.00**.

**What this study adds** is the part that record explicitly left open — it noted
that its per-QB gaps rode a `share × proj_mean` approximation and that *"the next
board build will carry the real per-player measurement… re-checking the ladder
against it is cheap and should happen."* This does that check against exactly
measured raw rows, and converts the answer into a break-even a drafter can hold
at the table. **It is a confirmation, at higher resolution, of a conclusion this
project had already reached.**

---

## RECOMMENDATION

**No `DECISIONS-NEEDED.md` item is raised, and that is deliberate.** The standing
rule is that a real edge gets an item with a prepared diff for Cory to rule on.
This is not a real edge, so raising one would put a decision in front of him that
the evidence does not support. Concretely:

1. **Change nothing on the board or in the model.** No correction, no flag, not
   even off-by-default. The relay branch's backtest already recommended against
   wiring one before the 22nd; this raises the resolution of the measurement and
   reaches the same place.
2. **At the draft: ignore the scoring gap entirely.** It is already inside
   `proj_mean` — our projections have always scored quarterbacks at 6 — and the
   only thing it could additionally justify is a two-pick move on Josh Allen.
   Take quarterbacks when the board's VORP says to.
3. **If this comes up again**, the number to quote is **+4.00, not +43.67**, and
   the reason is `gap(q) − gap(R)`. That sentence is now pinned by
   `test_A_UNIFORM_GAP_IS_WORTH_EXACTLY_ZERO_AFTER_REPLACEMENT`.
