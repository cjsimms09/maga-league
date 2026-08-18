# PRE-REGISTRATION — the QB scoring-arbitrage historical arm

**TERRITORY: A. Written 2026-08-16, BEFORE the historical arm is run or graded.**
Committed in its own commit, ahead of the commit that carries the result. A
prediction that arrives with its outcome is not a prediction.

---

## 1. The claim under test

The board's own provenance records that the ADP feed pricing this league's draft
is built on a **4-point passing touchdown and a −1 interception**, while the
league pays **6 and −2**:

```
provenance.projections.scoring_gap_vs_adp_market
  market_overrides {"pass_td": 4, "pass_int": -1}
  QB      n=228  mean_gap_points 5.53  max_gap 56.0  gap_share_of_value 0.1184
  top12   n=12   mean_gap_points 43.67 mean_ours 354.89
  RB/WR/TE/K/DEF  mean_gap 0.0 at every position
```

The claim this file exists to test is the **structural-mispricing thesis**:

> Because ADP is set by a market paying 4 per passing TD and this league pays 6,
> quarterbacks are systematically underpriced by their draft position in this
> league, and a drafter should therefore take them earlier than ADP implies.

If that thesis is true of the world and not just of a spreadsheet, it should have
left a mark: in a league that has been paying 6 per passing TD for years, **QBs
should have out-returned their draft cost relative to other positions.**

## 2. What has already been established, so this arm is not scored twice

Steps 1–4 of this study (the 2026-board arms) are arithmetic on committed data
and are **not** part of this pre-registration; they are computed and reported
without a prediction because their answer is forced by identity, not by evidence:

```
gap(q)            = 2·pass_td(q) − 1·pass_int(q)        (exact identity)
VORP_ours(q) − VORP_market(q) = gap(q) − gap(R)          (R = the replacement QB)
```

The second line is the whole of the replacement question and it is a definition,
not a finding. It is stated here so that the historical arm cannot be read as
independent confirmation of something the arithmetic already settled.

**Prior art on this branch and on the unmerged relay branch is acknowledged
before the fact**, so that nothing below can be presented as a discovery:
`draft/backtest/lab_scoring_gap.py` (the measurement), `draft/backtest/
nflverse_qb_scoring.py` (crossover under both tables), and — on the unmerged
relay branch `claude/fantasy-football-research-926y6z` — `exp_scoring_gap_
correction.py` plus `draft/audit/scoring_gap_correction_backtest_2026-08-15.md`,
which already backtested a VORP-based correction and priced its decision flips
at $0.00. This arm asks a question none of those asked (did QBs out-return their
**price** in realized seasons), on data available on main.

## 3. The estimand, in words, before any code

For each completed season s ∈ {2023, 2024, 2025}, and each **live** (non-keeper)
pick in this league's real draft for that season:

- **price** = `pick_no`, the pick at which this room actually took the player.
- **return** = realized regular-season fantasy points, weeks 1–18, scored under
  the frozen table (`pass_td` 6, `pass_int` −2), minus that season's **realized**
  replacement level at the player's position, computed by `vorp.replacement_levels`
  from the league's own starter counts on the realized-points board.

The estimand is the **position residual**:

```
resid(pick) = realized_VORP(pick) − f(pick_no)
```

where `f` is the season's own board-wide price→return curve, fitted with an
isotonic (PAVA) regression of realized VORP on pick number **across all
positions in that season**. `f` absorbs the fact that early picks return more;
what is left is whether a position beat the price the room paid for it.

**Statistic:** `mean(resid | position = QB)` per season, and pooled.

## 4. The prediction, recorded before the run

The arbitrage thesis predicts **mean QB residual > 0** in each season, and
materially so — the thesis claims ~44 points of unpriced value on every starting
QB, which against a 2023–25 QB replacement level in the mid-300s would be a
double-digit positive residual.

**My prediction is the opposite, and I am recording it as the primary
pre-registered call:**

> **mean QB residual will NOT be reliably positive.** I predict its 95% bootstrap
> interval will straddle zero in at least two of the three seasons, and that the
> pooled QB residual will be indistinguishable from the RB/WR/TE residuals.

The reason is stated in advance so the result cannot be re-rationalised after the
fact: the +43.67 is a **level shift applied to every quarterback including the
replacement quarterback**, and VORP — which is what a pick is actually buying —
subtracts that level. Only the *dispersion* of the gap survives, and dispersion in
passing-TD volume across starting QBs is small.

**What would falsify my prediction and vindicate the thesis:** a QB residual
whose 95% interval excludes zero, on the positive side, in at least two of three
seasons, with a pooled point estimate above +15 realized points.

**What would be a null:** intervals straddling zero. A null is publishable and is
the expected outcome.

**What would be a reverse finding:** a reliably NEGATIVE QB residual — the room
overpaying for quarterbacks. This is live, and is what `VONA-ROOM-VS-MARKET`'s
18-of-18 "the room takes QBs earlier than market at every slot" observation
predicts. I am naming it in advance so that if it appears it is reported as a
pre-registered possibility and not as a surprise dressed up as a hypothesis.

## 5. Population, and the absent-vs-zero rule

- **Included:** live picks (`is_keeper` falsy) of players whose position is in
  {QB, RB, WR, TE} per `draft/data/player_positions.json`.
- **Excluded and COUNTED, never zeroed:** picks with no position on record; picks
  of K and DEF (the frozen weekly store is offence-only, so a kicker has no
  comparable realized row — this is missing data, not a zero); picks whose player
  has **no realized row at all** in that season's weekly store.
- **The direction of the bias this creates is stated in advance:** dropping
  drafted players who never recorded an offensive week removes busts, which
  inflates every position's realized return. It is reported as a count per
  position per season, and a sensitivity arm re-runs the whole comparison with
  unmatched picks entered at **0 realized points** (hence a strongly negative
  VORP) to bracket the effect. Neither arm is the headline alone; both are shown.
- Keeper picks are excluded from the residual because a keeper's `pick_no` is a
  contract slot, not a price the room set that year. Their count is reported.

## 6. Leakage control

- The price (draft pick) is fixed before the season; the return is realized after
  it. There is no fitted parameter that sees the outcome except `f`, which is
  fitted **within season, across all positions**, and is therefore identical for
  the QB rows and the comparison rows — it cannot manufacture a QB-specific
  residual.
- No 2026 board quantity enters the historical arm.
- The frozen scoring table is read from the committed store's own stamp
  (`fetch_component_stats.frozen_scoring_table()` on branches that carry it;
  on this branch, `nflverse_weekly_points_2023.json → weeks[0].scoring`, which is
  the identical object that function returns and is asserted equal to the league
  config's passing terms by test).

## 7. Sample size, said plainly in advance

Three seasons, ten teams, ~15 rounds. That is at most ~45 live QB picks in total
and often far fewer, since most teams draft one quarterback. **Three seasons is
not a sample from which a structural claim can be confirmed**; it can only fail
to show what a structural claim of this size should have made obvious. The
report will say so next to the numbers, and no interval from this arm will be
used to license a board change.

## 8. What ships regardless of the result

Nothing. No board change, no model change, no correction wired anywhere. If the
result is positive the deliverable is a `DECISIONS-NEEDED.md` item describing the
prepared diff; Cory rules. That is fixed here, before the number exists, so that
the result cannot decide how consequential the result is allowed to be.

## 9. Known deviation from the task as briefed

The brief asked the historical arm to use "whatever historical ADP exists
(`draft/backtest/archived_adp.py` — establish what is really there first)."
**Established, before running anything:** `archived_adp.py` is a pure URL-builder
for the Wayback CDX index. It performs no fetching (the workflow does), and this
branch carries **no committed historical-ADP store of any kind**; network egress
is closed in this environment (`CONNECT tunnel failed, 403`), so none can be
fetched. Historical *market* ADP therefore does not exist for this arm.

The substitute is the room's own realized draft board from
`draft/data/league_history.json` — the actual pick numbers from the 2023, 2024
and 2025 drafts. **This changes the question** from "was the market wrong about
QBs" to "was this room wrong about QBs", and that difference is material: the
room is already known to take QBs earlier than market at every slot. The
substitution is declared here rather than in the results, and the report will not
claim a market result from a room measurement.
