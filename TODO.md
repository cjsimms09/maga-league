# TODO — the real count, in plain English (regenerated 2026-08-15, mid-week; refreshed
# again later the same day — see "LATER THE SAME DAY" below the fold, read that first)

## ⭐⭐⭐ 2026-08-17 LATE — THE DATA PASS. Read this before anything below.

**Cory: "Above all!! Fix the data problem and make sure we don't have other
mistakes in our info!!"** This is what closed and what is still open.

### CLOSED

- **Snap counts pulled — the first per-player dispersion signal we have ever
  had.** 35,869 skill player-weeks, 2021-2025. Every existing dispersion field
  (`proj_ceiling`, `proj_floor`, `proj_sd`, `weekly_sd`) is `proj_mean x a
  per-cell constant`, i.e. Spearman 1.0000 against the projection and therefore
  ZERO player-specific information. That one fact is the shared cause of three
  dead ends: `ceiling` measuring collinear with `value`, the phase grid finding
  only that double-counting the projection hurts, and the variance modifiers
  coming back unmeasurable. Two-hop join (pfr -> gsis -> sleeper), 97.1-99.2%,
  loss reported per hop, `MIN_JOIN_RATE = 0.70` refuses rather than writes a
  partial store. **Effect size measured, not asserted: within-cell spread 8x,
  and year-over-year carryover clears a permutation null 4/4 (rho +0.19 to
  +0.33). Read that as WEAK-BUT-REAL — it must not be weighted as though it
  were strong.** Nothing consumes it yet, deliberately, five days out.
- **Weekly capture wired** (`.github/workflows/weekly-snap-counts.yml`,
  Wednesdays 11:00 UTC) + registered in `capture_registry.py` under the gate.
  Pre-week-1 exits green via a narrow `NotPublished` path; a real failure still
  goes red, and tests pin both directions.
- **`constant_multiple_sweep.py` — the search is now a run, not a lucky catch.**
  All four broken fields were found by accident in one day. This sweeps every
  numeric field pair for "a is a fixed multiple of b" WITHIN (position, band)
  cells. It carries a known-positive control and REFUSES to print a report if
  the control does not fire, because "none found" and "nothing works" otherwise
  look identical. Gate test fails on any NEW participant.
- **Playoff-SOS artifact regenerated** — my own board rebuild had added 5 deep
  Sleeper rows (ADP 502-919) the artifact predated, breaking its partition test.

### ⭐ THE HEADLINE OF 08-17: THE PER-PLAYER SIGNAL EXISTS, AND WE ALREADY HAD IT

`draft/backtest/weekly_volatility.py` + `weekly_volatility.json`.

Cory has asked all week to *"quantify why I think they have upside"*. The
answer: **yes — realized weekly volatility is a strongly persistent per-player
trait, and the data has been committed in this repo the whole time.**

`nflverse_variance.py` was written to measure exactly this and was **never run
and never consumed** — a module with no caller, the "computed and thrown away"
family the capture registry exists for. `nflverse_weekly_points_2021..2025.json`
were already here.

Measured on 2023-25 (`cv = sd/mean` of realized weekly points, our scoring):

| | result |
|---|---|
| within-band spread of cv | **1.57x-1.88x** p10→p90 (a `mean x constant` field has NONE) |
| 2023→2024 persistence | **rho +0.482**, null [-0.132,+0.150] — SIGNAL |
| 2024→2025 persistence | **rho +0.605**, null [-0.146,+0.140] — SIGNAL |
| control (mean carryover) | +0.740 / +0.781 |

**Volatility persists at ~two thirds the strength of scoring LEVEL.** It is
nearly as much a property of the player as how good he is — a different class of
finding from snap-share volatility (+0.19), pulled the same day.

**The scoring-table guard fired before any number was computed:** 2021-22 carry
a different `scoring_fingerprint` than 2023-25, so they are REFUSED, not pooled.
That costs two seasons and is the correct price — pooling would produce totals
that never existed under either table, and "nothing in the arithmetic would
complain".

**IT SETS NO WEIGHT AND CHANGES NO BOARD, and a test enforces that.** A signal
existing is not evidence that leaning on it pays; this repo learned that
difference expensively (the zeroed ceiling, the unearned phase-grid null).
Limits: only two transitions survive the guard — enough to refuse a null twice,
not enough to call the coefficient precise — and this is REALIZED volatility, so
prospective use is licensed by the persistence and by nothing else.

**QUEUE EFFECT:** wiring this is now the top post-draft item, ABOVE snap share,
which measures a weaker proxy for the same thing. Needs a prereg and a real
backtest before any weight moves.

### ALSO CLOSED, LATER THE SAME DAY

- **The backtest HARNESS was still manufacturing the ceiling defect.**
  `build_bundle.py` wrote `proj_ceiling = 1.35 x proj_mean` and
  `proj_sd = 0.25 x proj_mean` as GLOBAL constants on every bundle ever built,
  so re-running the ceiling experiment would have reproduced the original answer
  for the original reason. Now measured p90/p10/sd per (position, band) through
  production's own appliers, `proj_floor` attached for the first time,
  leave-one-season-out enforced by `calibrate(exclude_season=)` raising rather
  than warning. No fallback: an unmeasured cell writes nothing. **Known cost:**
  the calibration spans 2023-25 and the `1-3` band has n=9, so holding a season
  out drops it under min_n — the top three per position carry NO ceiling on a
  rebuilt bundle. That is a refusal, and it is the region where a fabricated
  number would do most harm. Real bundles build in CI; the pure functions and
  wiring are tested here, the full rebuild runs there.
- **THE MONEY PROXY HARDCODED KEEPER VARIANCE — and it biased today's headline.**
  `cory_conditional.load_world` read the board for pool rows and then used a flat
  `"weekly_sd": 8.0` for kept players. Cory's three keepers measure **17.63 /
  25.81 / 32.46**, so team weekly sd was understated **11.1%** (83.44 vs 93.81).
  Weekly high pays here, so understating variance UNDERSTATES THE VALUE OF
  VARIANCE — the proxy was answering "is upside worth paying for?" while tilted
  against upside. It feeds `policy_tournament`, `stack_sweep`, `frontier`,
  `exp_need_phase`, `exp_ceiling_replicate`, `sim_validation`.
  **Re-ran the tuning study on the corrected proxy: headline moved $1.17**
  (+65.50 → +64.33, CI [+35.67,+94.17]), every non-zero endgame ceiling still
  worse with CIs excluding zero. Correcting a bias that should have helped the
  upside arms did not help them, so the "upside late loses" result is now
  STRONGER, on its fourth independent line.
  (`draft/audit/retune_after_keeper_variance_fix_2026-08-17.md`)

### ⏰ DO THIS ON DRAFT DAY (2026-08-21/22) — RE-TAKE THE PRE-DRAFT FREEZE

`draft/data/pre_draft_freeze_2026.json` was written **2026-08-14** and it
**predates every fix from 08-17**. I first found three missing fields by hand;
the gate I then wrote (`draft/tests/test_freeze_not_stale.py`) found **fourteen**:

```
capital_tier        consensus_rank      depth_chart_order   is_nfl_rookie
nfl_draft_pick      nfl_draft_round     pool_rank           proj_ceiling_source
proj_floor_source   tier_rank           tier_size           variance
weekly_sd           years_exp
```

Every one of them is present on the LIVE board (603-682 rows each), so a fresh
freeze captures all fourteen — the declaration is right, the artifact is just
old. Its ceiling/floor are still the OLD Gaussian construction.

**The gate is self-maintaining:** it reads `freeze_pre_draft.PLAYER_FIELDS`
rather than carrying its own copy, so the next field added to the freeze fails
it until the freeze is re-taken, with no one needing to remember. Marked
`repo_parity` (same as the ADP-sd ratchet) so it does not block a board publish
— it is evidence awaiting a human action.

**This is NOT a draft-night problem.** The war room boots from live
`/draft_data.json` (`app.js:1230`), which carries all of today's fixes; the
freeze is not the draft board. It is the **learning-signal capture** — the one
thing Cory called irreversible, the record that lets January 2027 ask "did the
board say he'd be gone by pick 48, and was he?"

**That is exactly why the staleness matters.** A freeze describing the 08-14
board would grade a board Cory never drafted from — wrong ceilings, wrong
floors, no draft capital. The 2027 grade would be of the broken model.

**Not re-taken today, deliberately:** ADP moves daily, so a freeze taken on
08-17 is stale by 08-22 too. The right capture is as close to the draft as
possible.

**The procedure, because the module refuses to overwrite on purpose** ("an
overwrite that a script can perform is an overwrite a nightly run will
perform" — there is no `--force`):

```
rm draft/data/pre_draft_freeze_2026.json      # by hand, on purpose
python3 draft/freeze_pre_draft.py             # after the final board build
git commit                                    # SAY WHY in the message
```

The 08-14 freeze stays recoverable in git history either way.

### OPEN — AND ONE NEEDS CORY

- **DECISION FOR CORY: the ADP-sd ratchet fired.**
  `draft/audit/adp_sd_ratchet_fired_2026-08-17.md`. Shipped fitted rule is 1.39x
  FFC's published dispersion in the ADP 50-100 band. **Our constant did not
  drift — it reproduces to 0.1% across three days; the market tightened.**
  Blast radius inside the draft is ONE player (Oronde Gadsden, ADP 148), because
  a published dispersion wins wherever one exists. I refused both easy fixes
  (widening the bound; shipping the measured 0.11 unilaterally). **Recommend:
  leave it, revisit post-season.** Not a publish blocker — marked `repo_parity`,
  which the publication gate deselects.
- **The dispersion family is still `mean x per-cell constant`.** The measured-p90
  fix corrected the CONSTANTS; it did not make the fields per-player. Snap-share
  volatility is the input that could, and wiring it is the next real step — AFTER
  the draft.
- **Studies still to redo:** anything resting on the `risk` term (PARTIAL — 6
  values against production's 13, 46% of range on backtest boards); re-derive the
  composite `ceiling` weight (its zero was to stand "until a real-ceiling board
  re-runs the experiment" — **the harness is now fixed, so that board exists**).
- **UNLOCK 2025 IN THE BACKTEST — it would take every strategy finding from N=2
  to N=3**, the threshold the report's own selection rule is written against.
  Diagnosed 2026-08-17 (`draft/audit/pbp_rebuild_2pt_gap_2026-08-17.md`).
  **TWO defects, and both must be fixed or the gate still refuses:**
  (a) `grade.weekly_from_pbp` emits NO two-point-conversion field, while
  `pass_2pt`/`rec_2pt`/`rush_2pt` are each priced at 2.0 in our league — SEVEN
  of the eight worst top-200 disagreements are `2 x (2pt count)` exactly.
  Systematic, and harmless today only because the rebuilt path is REFUSED and
  nothing consumes it.
  (b) **LATERALS — the parser models none of them.** Jameson Williams has two
  lateral receptions in 2024 (wk11 9 yd, wk17 41 yd + TD): 9+41 = exactly the 50
  missing yards, and the wk17 play is exactly the missing TD (his id is in
  `td_player_id` and `lateral_receiver_player_id`, NOT `receiver_player_id` —
  the receiver there is St. Brown). nflverse ships 18 lateral columns; the
  string "lateral" appears in `grade.py` **zero times**. He has ZERO 2pt
  conversions, so (a) does not touch him — and because the gate is **worst-case** on the top 200, **fixing
  (a) alone will NOT unlock 2025.**
  Do NOT loosen the 0.5 tolerance: that is the ADP-sd refusal again.
- **`need` — CORRECTING MY OWN EARLIER FRAMING.** I described this as "shipping
  at 0.0 off a measurement taken with a malformed league object". That is wrong
  and the distinction matters. The malformed-object error was in MY bar audit
  (it hit `bye` and `tier`, not `need`); `need`'s zero rests on a SEPARATE,
  Cory-confirmed decision from 2026-08-14, and `engine.js` already records the
  half of it that was retracted — the "redundant with the lineup mask" reason is
  true of the needrule CARD and false of the composite list.
  **The state is real and unchanged:** `composite_roster_blindness.test.js`
  passes today — at pick 70, adding a QB and a TE drops the mask's admitted
  quarterbacks from 215 to ZERO and moves the composite top 70 by not one
  player. So the main recommendation list has no positional-fill awareness in
  the mid-draft. **Mitigation that already exists:** the needrule card beside it
  DOES apply the mask, so the war room does show fill-aware guidance — on a
  different surface. Turning `need` on is an open decision needing a real
  backtest (it is the strongest bar, 25/25 of the top 25 move), not a flip.
  **HOW TO MEASURE IT — scoped 2026-08-17, and it is cheaper than assumed.**
  I expected new machinery. It is not: `live_context.js:126` reads
  `weights: o.weights || engine.MEASURED_WEIGHTS`, so the room harness can
  already run a modified weight set by being handed one. `archetype_rooms.js`
  builds its ctx via `LC.liveContext({...})` and currently overrides only
  `ctx.wireWeekly`.
  So the work is a **weights axis, not a new arm**: add `--need-weight` to
  `archetype_rooms.js`, pass
  `weights: Object.assign({}, E.MEASURED_WEIGHTS, {need: X})`, and run paired
  seeds at need = 0 / 0.35 / 0.9 / 1.45 — the values the shipped presets already
  use (`engine.js:3353-3371`).
  **Not done here on purpose:** it needs a prereg first (this repo's rule, and
  the one that kept today's re-tune honest), and no weight ships before 08-22
  regardless. A measurement run once, late, on a tool being modified in the same
  pass is a worse instrument than the known one. Post-draft.
  **Checked while scoping:** `archetype_rooms.js`'s header claims it runs "under
  production MEASURED_WEIGHTS". Verified true via that `liveContext` default.
  Not a defect.
- Routes-run (the nflverse route-participation feed) not yet pulled — the second
  per-player opportunity signal after snap share. Post-draft.

### ✅ THE CONSTANT-STAND-IN SWEEP IS COMPLETE — every surface, one real find

Cory: *"what other data are we missing or calculating off a constant when we
shouldn't be"*. Answered across all four surfaces rather than left open:

| surface | how | result |
|---|---|---|
| production board | `constant_multiple_sweep.py` (cell-aware, known-positive control) | the dispersion family only — documented, gated |
| backtest harness | read `build_bundle.py` | **FIXED** — was `1.35x`/`0.25x` global constants |
| study code | grep for hardcoded dispersion fallbacks | **ONE REAL BUG** — money proxy's keeper `weekly_sd: 8.0` vs real 17.6/25.8/32.5 |
| live draft JS + `src/` | grep every per-player field for non-zero fallbacks | **CLEAN** |

**Live JS detail:** every hit across `public/js/draft/*.js` and `src/` is either
`|| 0` (honest absent) or a sort comparator. The only non-zero constant is
`games_expected || 15` (`engine.js:948`, `composite.js:252-253`) — and
`games_expected` is present on all 682 board rows with 6 distinct values, so it
never fires. Verified rather than assumed.

**Also checked and cleared, so nobody re-investigates them:**
- `archetype_rooms.js` / `engine_ablation.js` `weekly_sd: CH.CFG.WEEKLY_SD` —
  metadata fields recording which league sd a run used, not per-player writes.
- `weekly_sd or 6.0` in `exp_participation` / `cory_conditional` pool rows —
  reads the production board, which carries the field on all 682 rows.
- `source_weight_prior`'s RB/TE median_gap sign flip — its "sleeper" column is
  the `proj_series` snapshot built from `proj_baseline` (bit-identical to
  `proj_sleeper`), so the own_v6 blend did NOT contaminate it. Legitimate
  snapshot turnover; consumer is a Jan-2027 recommendation off the draft path.
- Ricky Pearsall, WR, ADP 111, `proj_mean 0` — he is on **IR**, so Sleeper
  serves no projection. Board correctly ranks him 541st; `engine.js:1057`
  surfaces "listed IR" so the reason is visible.

## ⭐⭐ SUPERSEDES THE 08-15 STATE BELOW — 2026-08-16/17 RESEARCH DAY, EIGHT NULLS AND FOUR REAL FIXES

**Read this first. The 08-15 entry below is still accurate about the branch's
shape; this is what happened to the MODEL since.**

### THE HEADLINE: the projection layer is close to tapped out

Three independent lines of evidence, none of which we had yesterday:

- **Sleeper is the best single source at all four positions** (2025, the only
  leak-free season): QB .7782 / RB .7976 / WR .7319 / TE .7990. It beats
  FantasyPros everywhere and **own_v6 won ZERO cells**. `proj_mean` stays on
  Sleeper — reached by measurement, not by default.
  (`draft/audit/sleeper_vs_fp_grade_2026-08-16.md`)
- **The room's own draft order already captures 82-87% of perfect hindsight.**
  The entire remaining prize is 14.2 pts/team/week, and own_v6, props and naive
  all sit FURTHER from hindsight than the market.
  (`draft/audit/empirical_draft_value_2026-08-16.md`)
- **Eight studies, eight nulls**: EPA/air-yards/CPOE, variance tilt, rookie
  capital prior, season-total props, every roster archetype, the projection
  blend, QB scoring arbitrage, tiered-outcome (OpenFPL-style) model.

**The decision logic is NOT the problem.** VONA (value over next available)
ranks picks, accounts for roster need, positional scarcity, what survives and
what will be gone, and **grades itself on Brier within a handful of picks**.
Distrust the inputs, not the engine.

### FOUR REAL DEFECTS FOUND AND FIXED

1. **The keeper optimizer could not see its own keepers.** Ran live and printed
   `RECOMMENDED: keep 0 — nobody`, best offer a KICKER at round 1. `build.py`
   moves designated keepers into `kept_players[]`; the tool indexed only
   `players[]` and a bare `continue` dropped them silently. Fixed; now
   recommends keep-3 at **+108.7**, independently matching the study's +108.6.
2. **`oddsFormat` was never sent** to the odds API, which defaults to DECIMAL.
   Anytime-TD values were wrong by **21-33x** (2,002 expected TDs vs 61 real).
   Fixed, guarded, and a values-plausibility check added — the coverage check
   passed the corrupt column because the ROWS were all there.
3. **`player_rush_tds` is a phantom market** — billed on every call, zero rows
   across 7,019 player-weeks. Replaced with `player_anytime_td`, which also
   prices receiving TDs the original design had no market for.
4. **STATUS.md's "both elite TEs kept" primary scenario is false.** Bowers and
   McBride are both UNDESIGNATED on live Sleeper. Corrected in place.

### THE LIVE DISTORTIONS A SHOULD KNOW BEFORE THE 22nd

- **The opportunity adjustment is noise-shaped scale.** Neutral on ordering
  (17/18 cells), worse on level (18/18, every CI clear), and a SHUFFLED control
  performs identically. QB/K/DEF carry exactly 0.0000 while RB/WR/TE reach
  +0.15, so it lifts three positions against three others. Turning it off moves
  51 of the top 60 ranks and QB1 from 16 to 10; CENTRING it moves QB1 by ONE.
  Nothing applied — the grade ran on reconstructed baselines that flatter it.
- **Replacement sits above realized at every position**, spread 16.3 pts, TE
  most inflated (+27.9) vs QB (+11.6). The differential distorts cross-position
  VORP; a uniform bias would not.
- **K and DEF are priced by machinery built for skill positions** — 32 and 44
  options run through replacement and uncertainty models calibrated on 152-238.
  The board already demotes them in the ranking view; the sd column does not.

### WHAT UNBLOCKED

**The 2021/2022 weekly-points stores now exist** (`build_weekly_points_from_
components.py`), rebuilt offline and licensed by an EXACT reproduction of the
committed 2023 store — 5,371 player-weeks, 0 disagreements. The standing
"own_v6 can only be graded on 2025" limit, which bound nearly every verdict
above, is gone.

### TWO BLOCKING CLAIMS FOUND STALE — treat every "we can't do X" as a hypothesis

- "Sleeper's historical skill is unmeasurable until Jan 2027" — asserted in
  FOUR committed records. All four were reasoning about a CAPTURE nobody made,
  not a FETCH nobody attempted. It fetches fine.
- "the pbp pull is egress-blocked" (`nflverse_pace.py`) — returns HTTP 200,
  20MB, all five seasons.

### CORY'S FOUR RULINGS OF 08-17, ALL EXECUTED

Verbatim: *"Remove 1, 3 don't show v6 but keep improving it and grading. Let's
test position weighted idea then."*

1. **`opportunity_cap` 0.15 → 0.0.** The adjustment is off. Disabled by value,
   not by deleted code — `_opportunity_cap_why` in `league_config.json` carries
   the grade, the measured effect and the one-value path back.
3. **K and DEF lost their cross-position rank** (`draft/vorp.py`,
   `ONESIE_POSITIONS`). This is what put the LA Rams at overall 35 against an
   ADP of 127. The board VIEW already did this (`demoteOnesies`); it now lives
   in the ARTIFACT, so `keeperui.js` — which sorts on `overall_rank` with no
   guard — inherits it instead of rediscovering it.
   **Not dropped:** real vorp, real pos_rank, real tiers, sorted among
   themselves. Only the cross-position slot changed, which is the only place the
   comparison was invalid.
- **v6 is hidden, not removed.** `DISPLAY_OWNMODEL=false` in `consensus.js`.
  build.py still attaches `proj_ownmodel`, `/admin/model-scoreboard` still shows
  it, every backtest still grades it. The three tests that asserted the opposite
  are INVERTED rather than deleted, so a silent re-entry fails.
- **Position-weighted idea: TESTED, NULL.**
  `draft/audit/position_weight_transfer_2026-08-17.md`. Weights fit on
  2023+2024, applied to 2025: per-position beat one global weight in 2 of 4
  positions, pooled delta **+0.0001** CI [−0.0008, +0.0011], and the **scrambled
  control scored the same 2 of 4**. 0 of 27 secondary pairs survived FDR.
  **Why:** the four positions all want a weight near 0.5 (0.503 / 0.552 / 0.529
  / 0.523) — inverse-MSE weighting between similar arms is too flat to grip.
  **The live follow-up this does NOT close:** Cory noticed Sleeper's WR **level**
  bias of +13.63; this measured **ranking** (Spearman), which is invariant to any
  level shift. A per-position **bias correction** is a different instrument and
  is untested.

### THE TRIPWIRE THAT WORKED

`test_position_weighted_arm_is_dropped_not_fitted_on_itself` asserted
`seasons_predictable_leak_free == [2025]` *specifically so* that rebuilding the
2021/2022 stores would fail it and force a deliberate re-evaluation. It fired,
the study above is that re-evaluation, and the test now pins the new truth
(A3 dropped for ONE reason, not two) rather than being relaxed. Copy this
pattern: **encode the reason a thing is blocked, not just the fact of it.**

### THE TWO STRATEGY STUDIES CAME BACK — both merged

- **Barbell** (`draft/audit/barbell_strategy_2026-08-17.md`): Cory's early half
  is CONFIRMED *and already implemented* (rounds 4–8 are 100% ANCHOR, 600/600
  picks). His late half is CONTRADICTED three ways — the middle is **flat, not
  dead** (+9.9 vs a held wire add, CI spans zero), the **LATE rounds are the
  dead band** (−27.8 [−52.5, −6.5]), and there is **no late upside tail**
  (P(league-winner) is *lower* late than in the middle). A barbell policy LOSES:
  champ −1.49pp [−1.94, −1.03]. **Ten strategy arms tested, ten losses.**
  One draft-night item: a **late-round backup QB is the worst pick on the board**
  (−76.1 [−147.3, −15.6]), because measured QB replacement (330.1) and the
  measured QB wire (330.8) are the same number.
- **Vacated/contingent opportunity**
  (`draft/audit/opportunity_inheritance_2026-08-17.md`): NULL on both arms.
  Departed volume above a player predicts his residual — but so does volume held
  by players who **stayed**, and departure-BLIND volume beats the vacated version
  in **12 cells of 12**. It is mean reversion wearing an opportunity costume.
  The handcuff arm died on a question the earlier audit never asked: **the
  inheritor is not identifiable in advance at any position** — not one interval
  excludes its own chance rate, and RB, where the whole thesis lives, is
  explicitly not forecastable.
  **Escalated scope correction:** the pick-61+ graded cell contains **zero
  rookies by construction** (it requires a prior-season stat row), so every
  "late-round" verdict ever graded there is about late-round **veterans**.

**Ten nulls now, not eight.** Both remaining strategy studies came back empty,
which closes the "the projections are tapped out but strategy might not be"
hypothesis. What is left that has NOT been tested is the level/bias instrument
above, and the war-room copy items in `DECISIONS-NEEDED.md`.

---

## ⭐ END-OF-DAY STATE, 2026-08-15 NIGHT — READ THIS FIRST, EVERYTHING ELSE IS HISTORY

**A's Monday is three commands and four decisions.** The branch
(`claude/fantasy-football-research-926y6z`) holds the entire day — 12 agent
worktrees merged, every merge suite-verified, then two independent Fable
review passes over the COMPOSED tree (cross-merge interactions re-measured:
all hold; one real defect found and fixed — two tests were overwriting the
real shipped board file in place).

1. `bash scripts/lane-start.sh A` → `bash scripts/inbox.sh A` (triaged: decisions first)
2. `bash scripts/verify-relay-session.sh` — 7/7 PASS at branch tip (suites
   2286 Python / 268 JS entry points; artifact-generator consistency; no CFG
   default moved; territory refusal pinned to the documented Override #5 set)
3. `bash scripts/merge-relay.sh` — the Override #5 bypass as a mechanism:
   re-verifies, merges into LOCAL main, runs both suites on the merged tree,
   and STOPS with the push printed (the push stays your deliberate act; an
   undocumented crossing aborts it). Merging DEPLOYS (served files
   changed; deploy policy is settled in DEPLOY-POLICY.md — the blanket
   [skip deploy] era is over). Post-merge the config-check workflow's last
   cell goes green (weights-read ships with the merge; Cory's key config is
   already verified on the GitHub side).

**THE DECISION QUEUE LIVES IN ONE PLACE: `DECISIONS-NEEDED.md` → "⚡ THE
QUEUE" (top section).** Four calls need Cory before the 22nd (wire-bench ·
scoring-gap ADP · KOV ramp · pick-33 headline), the standing older opens are
indexed under them, and today's already-settled rulings (REC-1 proj_sd live,
the pre-draft survival filter, the player-week loop) are listed as records so
the merge reads every applied change as intended. Everything here and in the
runbook footer is a pointer to that section, never a second copy.

**HONEST NEGATIVES FILED TODAY** (do not re-litigate without new evidence):
own-model v2 beats v1 everywhere but fails the promotion bar (QB + TE
rank-corr vs the recency blend) — display-only stands · the FP-archive
Week-1 source-weight prior failed its own preregistered error-scale gate —
flat start stands until January · the analyzer projection-prior hypothesis:
no detectable improvement pooled (the one good-prior season helped weeks
1-2; K≈1.5 diff proposal routed to B) · pace-of-play NULL · age tie-break
NULL.

**THE AUDIT INDEX for the day** (each self-contained, in draft/audit/):
macro_tool_audit · model_learning_audit · roster_construction_audit ·
composed_tree_review · loop_review · learning_loop_closure ·
league_wide_player_loop · projection_skill_backtest (FP archives: 3/3
authentic, FP beats naive everywhere — the projection layer's edge priced
at 3-9 MAE pts/position) · analyzer_prior_hypothesis ·
warroom_design_pass (in flight — war-room professional elevation with a
UI-fidelity gate per Cory: "the design is actually implementing and
explaining what the model says").

**IN FLIGHT AT WRITE TIME:** the war-room design pass (Fable agent;
screenshots for Cory's sign-off before merge); the in-season tools design
pass queued behind it (adopts the same design system).

_Regenerated from STATUS.md, PARKED.md, DECISIONS-NEEDED.md and this week's findings —
not from memory. Draft is **Aug 22** (7 days out). **A and B are both unreachable until
Monday** (weekly session limit) — everything below this line that isn't marked ✅ was
done by the research-relay session on `claude/fantasy-football-research-926y6z`.
Session B keeps the site/in-season half of this list separately._

**UPDATED policy, same day, Cory's call:** the relay session pushes anything with a
passing test straight to `main` — no pre-approval, no per-item check-in, EXCEPT
draft-scoring/weight changes (still held for a ruling). **⚠ CORRECTED, later the same
day: every commit now carries `[skip deploy]`, no exceptions — "no reason to deploy
til everything is done, I will tell you when to deploy" (Cory).** The earlier version
of this note said pushing to `main` never deploys on its own — THAT WAS WRONG, see the
🚨 entry immediately below. Batching is now enforced by the commit message, not by an
assumption about the gate.

**🚨 DEPLOY POLICY SETTLED (2026-08-15 evening, Cory: "fix the deploy freeze...
find the happy medium").** The blanket-`[skip deploy]` freeze is RETIRED — it was
fighting the opt-out gate and delivering both failure modes at once (fixes
stranded AND deploys leaking whenever an unmarked bot push topped the branch;
the macro audit found the live site current while policy said frozen).
**`DEPLOY-POLICY.md` is REWRITTEN and is now the single authority**; policy and
`netlify-ignore.sh` finally say the same thing. One-line version: served-path
changes deploy when they land on `main` and every deploy path is now verified
(deploy-verify on pushes; a new in-run poll in `draft-data.yml` for the bot's
board push, which was the one deploy nothing checked); Lab/docs/data commits
never build; `[skip deploy]` is reserved for a served change deliberately not
ready, with the reason in the commit; Aug 20–22 the draft-week build reserve is
untouchable and only draft-critical fixes deploy.

## LATER THE SAME DAY, 2026-08-15 — read this section first, everything below it is the morning/midday pass

Cory pushed hard on "actually fix things, in a way A will approve and push" and "we'll
deploy everything together in large sums." Real builds, all tested, all `[skip deploy]`,
all on `main` right now — check `git log`, don't re-derive from this prose.

**60-SECOND VERSION, for whoever reads this first.** Everything below is real, tested,
and already on `main` (or this branch — check which). In priority order:

1. **Fixed a real data-corruption bug that predates today** — every in-season capture
   form (`/lineup/log`, `/lineup/override`, `/waivers/*`, `/stream/*`) was silently
   mangling its own payload before this fix. See "🔴 A REAL BUG" below. If the site was
   used for real before this shipped, **run `draft/tools/ledger_corruption_check.js`
   against the live ledger** to check for damage — nobody with live access has done
   this yet; it's a 5-minute job, instructions in the tool's own header.
2. **Fixed a real bug in `draft-night-sync.yml`** (built today) that would have killed
   its retry logic on the FIRST Sleeper hiccup during the actual draft — found and
   fixed by firing the workflow for real, not by reading it. Verified working on real
   CI. Nobody needs to do anything here except trigger it for real when the draft opens.
3. **Own-model projections are live on the board**, additively, alongside Sleeper/FantasyPros.
4. **The core projection formula was already audited and found to LOSE** to a naive
   baseline (exp33) — a banner now surfaces this on the board. Read as: lean on tier
   structure, not the point projection itself.
5. Draft-night pick capture and in-season prediction capture (lineup/waiver/stream) are
   now real and wired — `trade_eval` is the one kind still genuinely uncaptured.
6. A dedicated security pass on everything built today came back clean — nothing to fix.
7. **Backtested whether the lineup optimizer actually gives an edge — it does not, yet,
   and found + fixed a real bug in the process that had been quietly deflating the
   "certified" leak numbers since the file was written.** See "🔴 SECOND REAL BUG"
   below. Short version: the tool's own fallback projection loses to what Cory actually
   played (-14 to -18 pts/week, beats actual play only ~15-22% of weeks, all 3 seasons)
   — the tool's live UI already says to "treat the dollar figures as directional" on
   this exact fallback path, so this backtest confirms and quantifies that caveat
   rather than contradicting it. Not shipped as an edge; not a regression either —
   nothing changed about the live recommender, only about how honestly its historical
   value is measured.
8. **Three things need Cory's judgment, not more engineering** — none built or changed:
   - `ONESIE_ENDGAME_PICKS` / the bench-branch VONA formula / `ONESIE_MAX_SPARE` —
     scoring-logic prototypes, fully evidenced, held per standing policy this close to
     the draft. Full writeups in `PARKED.md`.
   - `trade_eval` — needs a product decision (whose trades, priced how) before any code.
   - Whether `config-screen.js` is worth the same Playwright test `keeperui.js` just got
     (cheap now that the pattern exists, just not urgent).

**🔴 A REAL BUG, NOT A JUDGMENT CALL, FOUND AND FIXED: every in-season capture form
was silently corrupting its own payload.** `views/lineup.ejs` and `views/waivers.ejs`
built their hidden JSON fields as `JSON.stringify(...).replace(/"/g, '&quot;')` INSIDE
an EJS `<%= %>` tag — which already HTML-escapes by default. The manual replace ran a
SECOND time on top of that, so the real page contained `&amp;#34;` instead of `&#34;`.
A browser decodes HTML entities in one non-recursive pass, so the value it actually
SUBMITS still has the literal text `&#34;` where a quote belongs — not valid JSON.
`safeJson()` on the server silently falls back to storing the mangled raw string.
**This predates today** — it hit `/lineup/log`/`/lineup/override` (built earlier)
exactly as much as the `/waivers` and `/stream` forms built today, and
`override_capture.test.js` never caught it because it posts a hand-built body and
renders the form separately, never combining the two. Found only because a NEW
end-to-end test (render real HTML -> extract the real `value=` text -> POST exactly
that -> read the ledger back) was built for the stream forms and failed. Fixed in
7 places across 4 views; two new tests
(`draft/tests/waiver_stream_surface.test.js`, `draft/tests/lineup_capture_escaping.test.js`)
prove it round-trips correctly now, including with a player name carrying both an
apostrophe and a literal double quote. Full JS + robot-mock + Python suites green after.

**Follow-up, same finding: is any REAL captured data corrupted?** This sandbox has no
access to the live site's Netlify Blobs store, so it can't check production directly.
`draft/tools/ledger_corruption_check.js` is the one-command answer for whoever does:
log in as commissioner, visit the already-shipped `/admin/api/ledger/predict?season=
2026`, save the response, run the tool against it. It flags any entry whose
recommended/counterfactual/chosen/drop is a raw string instead of parsed JSON (the
exact signature the bug leaves) — deliberately NOT flagging `waiver_claim`'s
`counterfactual`, which is a hardcoded `'hold priority'` string by design, not a bug.
8/8 tests pass, including that exact false-positive trap. **Someone with real access
needs to actually run this** — not done here, can't be from this sandbox.

**🔴 SECOND REAL BUG, NOT A JUDGMENT CALL: `infer_positions()` was silently deflating
every hindsight-optimal lineup calculation, in both the JS and Python originals, since
before this session.** Found while directly answering Cory's question — "have we
retested the lineup optimizer to prove it's giving an edge or at least not hurting" —
by building `draft/tools/lineup_edge_backtest.js`, a leak-free replay of every real
2023-25 team-week using only strictly-prior information (no lookahead). Its first run
threw an impossible result: the TRUE OPTIMAL (perfect hindsight) scored LESS than what
was actually played in real weeks. Traced to `inferPositions()`/`infer_positions()`
(JS: `src/routes/lineup.js`, Python: `draft/backtest/roster_sim.py` — the JS is a
direct port of the Python): a player who only ever started via a FLEX-type slot never
got a position classified at all (its own docstring's excuse, "almost always caught in
another week's dedicated slot," is false for 36 real players across 3 seasons), so
`bestLineup()`/`best_lineup_points()` silently dropped him from any hindsight
recomputation whenever he'd actually, legally started. Fixed in both languages using a
remedy A already established for the identical defect class in `wire_level.js`: fall
back to `draft/data/player_positions.json`'s ground truth for exactly the ids the
starters-heuristic can't resolve.
**This changes EFFICIENCY-LEAK.md's "certified" L0 numbers, and only upward** — the
old figures were an undercount, not an overcount: leak $470/595/445 → **$520/637.50/520**
(2023/24/25), Cory's 3-yr total $2,100 → **$2,400**, efficiency ~89-90% →
**87-88%**. Regenerated via the file's own documented refresh (`python
draft/backtest/lab.py`), propagated to `EFFICIENCY-LEAK.md` (old numbers struck through,
not deleted), `LAB-REGISTRY.md`, `docs/queued/in-season-master.md`,
`draft/DECISION-LOGIC-SPEC.md`, `docs/POST-DRAFT-LABEL-AUDIT.md`, and the code comments
that cited the old figure. Full detail and what was deliberately left untouched (dated
log entries in `STATUS.md`/`LAB-RUN-STATE.md`) is in `ROUTES.md`'s `## TO: A` section,
2026-08-15 entry. New regression tests in both languages assert the per-row invariant
directly (`optimal >= actual` on every team-week, not just in aggregate) so this can't
silently regress. Full JS (256/256) and Python (2148 passed/6 skipped) suites green
after **in this sandbox — caveat added 2026-08-15: this sandbox cannot reach Sleeper
(confirmed 403 all session), so any test whose behavior differs live-vs-offline was
never actually exercised on its live path here. The independent OpenAI review's own
CI job (real network) caught exactly this: `h2h_agreement.test.js` red there. It
shares no code path with anything in this change (h2h/rivalry/Sleeper-id resolution,
nothing touching lineup/roster_sim/season_stamp), so it is very unlikely caused by
this diff, but "full suite green" claims made from this sandbox should be read as
"green on everything this sandbox's network can exercise," not an absolute
statement — worth a real-network re-run by whoever has one.**
**Then the actual question got answered, honestly, on the corrected numbers:** does
following the live tool's own fallback projection (season-running-average — the path
its own UI already flags as "directional, not precise" whenever it's not on a live
Sleeper projection) beat what Cory actually played? **No.** Edge vs. actual play, in
**FANTASY POINTS, not dollars — corrected 2026-08-15, caught by the independent
OpenAI review (below): `lineup_edge_backtest.js` never calls the money grader, it
only ever computed points, and the first write-up of this wrongly called them
dollars**: 2023 -11.45 pts/wk (beats actual 22% of weeks), 2024 -14.51 pts/wk (20%),
2025 -17.65 pts/wk (16%) — bye-week-corrected for 2023/24 via real nflverse schedule data
(`draft/backtest/build_historical_byes.py`), uncorrected (structurally pessimistic) for
2025 since nflverse doesn't have 2025 data yet. This is not a regression or a newly
discovered defect in the live tool — the assignment logic itself is separately proven
exhaustively optimal given a set of projections (`lineup_skill.test.js`, pre-existing);
the gap is entirely in projection quality on the fallback path, which the tool's own UI
already discloses. It quantifies an acknowledged limitation rather than revealing an
undisclosed one. Not shipped as a claimed edge; nothing to fix here without better
in-season projections, which is a separate, larger project.

**The single biggest finding of the day about the MODEL (as opposed to the bug above):
our core projection formula was already
audited and found to LOSE, and nobody was ever told.** Experiment 33 (`EXP33.md`,
reported 2026-08-09, six days before this was surfaced) — our blend loses to a naive
prior-year+opportunity model on every metric, both tested seasons: top-decile hit rate
0.41 vs 0.57-0.59 (the metric the experiment itself named as the one that matters),
worse MAE, worse rank correlation, and $200 vs naive's $100 vs raw FFC ADP's **$1,200**
through the money grader. `deviation.js` already had a complete, honest, carefully-
reconciled banner mechanism for exactly this (`projectionProvenance()`) — built,
correct, exported, **never called from anywhere**. Now wired into the board checklist.
See PARKED.md's "THE CORE PROJECTION FORMULA WAS ALREADY AUDITED" entry for the full
numbers. **Read as: lean on tier structure and scarcity, not on the point projection
itself — the model's own honest self-assessment, now actually visible.**

**Own-model projections are now live on the board, additively.** `draft/own_projections.py`
(extracted, shared, no more two-places-disease) attaches `proj_ownmodel` in `build.py`
the same way FantasyPros was added; `consensus.js` folds it into the displayed
consensus number automatically. Does NOT touch `proj_mean`/VORP/ranking — no clean
grade exists to justify a swap, and exp 33 (above) argues AGAINST swapping our
existing blend in as authoritative for anything, which is exactly why this stayed
additive. Full build.py run couldn't be verified end-to-end from this sandbox (Sleeper
blocked); the new attach block WAS verified against the real live board+config
directly, and the full test suite passed. Check the next real nightly build's log for
"own model 3rd source on N players".

**Draft-night pick capture — closed a real, dangerous gap.** `log_draft_picks.py`'s
`--sync` mode was fully built and rehearsed against a real 150-pick draft and NOTHING
ever called it during a live draft — grepped every workflow and doc, zero automation,
zero manual step. `.github/workflows/draft-night-sync.yml` now exists:
workflow_dispatch-triggered (start it by hand when the draft opens, paste the Sleeper
draft_id), polls every 20s, commits only on real change, stops when every pick is
logged. **Someone needs to actually trigger this when the draft opens Aug 22** — it is
not automatic, by design (a snake draft's start time isn't predictable).

**In-season prediction capture — genuinely confusing, resolved.** First pass (via
`loop_closure.js`) reported 5 kinds uncaptured (lineup_call, waiver_claim, stream_call,
trade_eval, inseason_override). **That tool had two real bugs** (no directory
recursion into `src/routes/`; blind to the server-side `predledger.append(store,
{kind:...})` capture shape) — both fixed. Re-run: `lineup_call` and `inseason_override`
were ALREADY captured (`src/routes/member.js`, `/lineup/log` + `/lineup/override`,
predate this session). Built client-side helpers for all 5 before discovering this,
then **reverted them** — wrong pattern, would never have been called. `waiver_claim`
was genuinely missing; built to match the proven `/lineup/log` pattern exactly
(`/waivers/log`, `/waivers/override` in `member.js` + `views/waivers.ejs`).
**Still genuinely open: `stream_call`, `trade_eval`** — no existing page to attach
either to, so this is small feature-design work, not a wiring gap.

**Weekly in-season projection snapshot — verified live, not just read.** `weekly-proj-
snapshot.yml` existed, had never fired (added the day before its first scheduled
Sunday). Triggered it manually to check: ran clean end-to-end in real CI, correctly
detected preseason and did nothing rather than writing a mislabelled snapshot. Real
verification of "will this work when the season starts," not an assumption.

**Two real bugs in test/tooling infrastructure, fixed while doing the above:**
`loop_closure.js` (directory recursion + capture-shape detection, above) and
`draft/tests/authority.test.js` (a structural check used a raw string-match that
returned the wrong shape, silently breaking its own exemption mechanism — the SAME
class of bug the two-line-up fix repaired, in a governance-sensitive file).

**Scoring-logic prototypes tested but NOT shipped, awaiting Cory's explicit ruling
(not swept into "fix everything" — these are judgment calls, not bugs):**
- `ONESIE_MAX_SPARE.TE: 1→0` — tested, looked clean on a 12-pick simulator, then
  found to conflict with 3 years of real draft history (TE2 happens 47% of the time)
  — WALKED BACK, see PARKED.md's correction.
- `CFG.ONESIE_ENDGAME_PICKS: 2→~4-5` — the better-evidenced replacement, matches
  when real duplicate QB/TE picks actually land (89-94% coverage vs ~44-50% today).
  Not shipped.
- A wire-compared bench-branch formula for `vona()` — prototyped in a scratch copy of
  `engine.js`, fixes the RB-wipeout bug when `VONA_SLOT_AWARE=true`, but has an
  unexplained gap (100% of sim rooms take a 2nd QB vs 57% in real history) that
  wasn't resolved before time ran out on it. Full write-up and numbers in PARKED.md.
- Random Forest / XGBoost for the core model — real precedent exists (`mattgilgo/
  fantasy_football`, `RESOURCES.md`), genuinely plausible, explicitly NOT for this
  draft (7 days, thin data, leak-free discipline gets harder) — flagged for the
  post-draft learning engine.

**A systematic sweep for other "built, exported, never called" gaps (the pattern
behind exp 33's banner and three earlier findings today) found one more, then went
clean.** Checked every `public/js/draft/*.js` module's exported API against the rest
of the codebase — the only unreferenced exports left are `PredLedger.pending/flush/
lastError`, already explicitly flagged in-code as "routed to B" for a status-UI
surface that doesn't exist yet, not a new discovery. **Separately found the SAME
class of bug right next to the exp33 fix**: the "In-season instrumentation live"
checklist item (`app.js` ~line 3289) read `window.INSEASON_LEDGER_LIVE`, which
nothing in the codebase ever set — it permanently reported "NOT LIVE" regardless of
what was actually captured. Fixed to report the real state (lineup/waiver/override
are logging; stream/trade aren't). **Also checked whether the other "spec, not run
yet" Lab experiments (34/35/36) had the same dormant-result problem as exp 33** —
they don't. All three have real result files, and unlike exp 33, all three are
already correctly wired: exp34's verdict is the same one already in `deviation.js`'s
`EVIDENCE_STATE`, exp35's finding is already accurately summarized in
`DECISIONS-NEEDED.md` #2, and exp36 is wired into `deviation.js`'s `MARKET_EFFICIENCY`
constants with its own CI regression test (`test_cited_constants.py`) guarding
against drift. Exp 33's dormant banner was the genuine exception, not a symptom of a
wider backlog — useful to have checked rather than assumed.

**Checked whether `stream_call`/`trade_eval` had a shortcut before writing them off
as a bigger build — they don't.** No K/DEF-specific logic exists anywhere to attach
a stream capture to (the whole waiver tool is built around priority-spending, a
different decision shape from a free matchup-based stream); no trade-evaluation
logic exists at all beyond one passing mention of the word "trade" in `analyzer.ejs`.

**`stream_call` — built, same day, after the plan above.** `POST /stream/log` +
`/stream/override`, mirroring the proven `waiver_claim` pattern with one real
difference: the counterfactual is a specific alternative (the K/DEF already
rostered) rather than a fixed phrase, because this page actually has one. No new
scoring logic — reuses the same tested `evaluateClaims` ranking, filtered to K/DEF,
honestly labelled on the page as season-value rather than matchup-tuned. Real-data
render tests (with and without a current K/DEF rostered), not just an EJS compile
check. Full suite green after.

**`trade_eval` remains genuinely unbuilt** — needs a real product decision first
(whose trades get evaluated, priced how), no evaluator exists to attach a capture
to. Belongs with the post-draft work, plan is in `PARKED.md`.

**The 4 new capture routes only had hand verification — same gap as `attach_own_model`
had, closed the same way.** `/waivers/log`, `/waivers/override`, `/stream/log`,
`/stream/override` were checked by syntax, an EJS render test, and the full suite
passing — never by actually POSTing to them and reading the ledger back.
`draft/tests/inseason_capture_routes.test.js` now does exactly that: boots the real
app, logs in as commissioner, hits all four, reads `predledger.readAll()` and checks
kind/method/payload on each (21 checks, all pass). Also fixed a stale line in
`app.js`'s "In-season instrumentation live" checklist — it still said `stream_call`
was NOT YET captured after `stream_call` had already been built earlier the same day;
now reads `lineup_call, waiver_claim, stream_call, inseason_override — logging` with
only `trade_eval` flagged open. Full JS + Python suites green after (2135 passed / 6
skipped, 0 failed).

**`consensus.js` (contract C3) had zero dedicated test file — found while looking for
more of the same class of gap.** It's the ONE shared projection-consensus derivation
Cory asked for so the draft board / waivers / lineup tools can never label or value
the same player differently. Only indirect coverage existed (`waivers.test.js`
exercises it through `src/routes/waivers.js`'s delegation); nothing tested
`proj_ownmodel` (today's third source) or `higherProjectionAlt()` at all.
`draft/tests/consensus.test.js` now hits the module directly — 23 checks, all pass
first run: 1/2/3-source averaging + honest labelling, the `proj_mean`+provenance
fallback, `cleanSource`, and `higherProjectionAlt`'s same-position-only /
self-exclusion / `withinTop`-window behavior.

**Checked the rest of `public/js/draft/*.js` for the same "zero test hits" pattern —
found two more, `config-screen.js` and `keeperui.js`.** First conclusion (below, then
corrected same day): both are DOM-only IIFEs with no `module.exports`, so closing this
looked like it needed a new jsdom-style test harness — not worth adding seven days
before the draft without checking first. **That was wrong, and cheap to find out:**
`draft/tests/rehearsal-mock3.js` already established Playwright + the pre-installed
Chromium as a working pattern in this exact project. `draft/tests/rehearsal-keepers.js`
now pins `keeperui.js`'s `guardFixture()` — the function that refuses to open the
keeper editor against synthetic/offline data — using that same pattern, self-contained.
6/6 checks pass, and building it found a real SECOND bug: `boot()`'s catch handler was
unconditionally clobbering `guardFixture()`'s specific refusal message with a generic
one the instant after it was written. Fixed in the same commit. `config-screen.js` got
the same treatment right after (`draft/tests/rehearsal-config-screen.js`, 13/13 —
proves the ★ CRITICAL scoring highlight actually discriminates and that a saved
override really does win over an imported value, the page's own stated design; no bug
found there, first real proof it works). **Every `public/js/draft/*.js` module the
original sweep flagged is now covered.** Full story, including the correction, in
`PARKED.md`'s "`config-screen.js` / `keeperui.js` HAVE ZERO TEST COVERAGE" entry.

**`draft-night-sync.yml` (built earlier today) had never actually been fired — checked,
and firing it blind wasn't safe, so this made it safe first.** Same "verify by
execution" discipline as `weekly-proj-snapshot.yml` earlier, but that workflow only
skips a write when it's not in season; this one, on a real trigger, `git commit`s +
pushes straight into `draft/data/draft_pick_log_2026.jsonl` — the real live pick log
this season's actual draft needs clean. Testing it blind, even against a completed
historical draft_id, would have corrupted that file with the wrong season's data. Added
a `dry_run` input that redirects `log_draft_picks.py`'s `LOG` constant (now
`DRAFT_PICK_LOG_PATH`-overridable, default unchanged) to a `$RUNNER_TEMP` scratch file
and skips the git block entirely, proven with 3 new tests
(`draft/tests/test_log_draft_picks_path_override.py`).

**Then actually fired it for real, twice, and found a genuine bug the first time.**
Run 1 failed in 13 seconds with only "Process completed with exit code 1" in the log —
GitHub Actions runs `run:` blocks under `bash -e`, and a bare `OUT="$(cmd)"` assignment
is not one of the contexts `-e` exempts (an `if cmd; then` is). So the very first
non-zero `--sync` exit killed the whole job before `echo "$OUT"` or the workflow's own
documented "will retry on next poll rather than abort the whole night on one bad
response" ever ran — dead code, invisible until fired for real. Same trap on the
`--status` call right after it (`status()` deliberately returns 1 on a real, designed
warning — a row joined to the wrong freeze — not a crash). Both fixed by moving the
assignment into the `if` test. **Run 2, after the fix: the retry logic actually fired
9 times over the full 3 minutes**, correctly logging "will retry" each time instead of
dying, and the real underlying message was finally visible in the log — a legitimate
`REFUSING: Sleeper returned no picks for draft ...` from `sync_live()`'s own `or []`
guard (this specific archived draft_id doesn't serve picks via Sleeper's live picks
endpoint; unrelated to anything touched here). `--status` printed correctly every
iteration, dry-run wrote only to the scratch path (zero git activity anywhere in the
log), and `max_minutes` gave up cleanly with the intended warning. **The actual
draft-night mechanics — polling, retry-on-failure, clean give-up — are now verified
working on real GitHub infrastructure, not assumed from reading the YAML.**

---

## THE FULL SWEEP, 2026-08-15 — every claimed-open item checked against real code

Cory asked for a systematic pass rather than reacting to items one at a time. This is
that pass, in one place, so "is X actually still open" never needs re-deriving:

**Confirmed ALREADY DONE, docs were stale (fixed in DECISIONS-NEEDED.md, no code
changed by finding this):**
- F4-excluded-league replay — ruled 2026-08-11, implemented, verified.
- Sunday alert cron timing — shipped, tested (`sunday_cron.test.js`).
- Stack weight (~0.5 vs 1.0) — resolved by D10, 2026-08-13, code was already right.
- Ceiling weight (0 vs 0.65) — deliberately settled at 0 twice (2026-08-10, 2026-08-14),
  not a gap.
- needrule-vs-composite reconciliation — already built (A10 "Two reads" guard).
- Position-normalized ceiling (units defect) — already shipped, 2026-08-13.
- Rule 10d self-referential-fixture clause — authorized 2026-08-11, already in
  `SESSION-A.md`. Its own follow-on extension (10d covers any measuring instrument,
  not just fixtures) is flagged for authorization there and is NOT yet in this file —
  a gap in the other direction, worth Cory's eyes.
- RB=0.9-per-draft and TE=3.6-per-draft — roster shape has reversed (see #0000/#00000
  for the numbers), **but the cause is genuinely unclear — see the correction inside
  those entries**, don't take the first pass at "why" as settled.
- Projection-source snapshot capture (#6, part a) — already running, 6 days of both
  sources in `proj_series.json`.

**Confirmed GENUINELY STILL OPEN (checked against code, not assumed):**
- D14 (Stage-2 as a real market anchor) — `CFG.STAGE2_CAP` is explicitly OFF by
  default in `engine.js`. Not built. Recommendation (hold) still stands.
- The offline survival-calibration grader (#5, mock-draft evidence) — no such tool
  found anywhere in `draft/`. Not built.
- The Lab experiment queue (exp41, third-arm dollars, exp35 dollar-grade) — all blocked
  on the same `sleeper_import.fetch_players()` 403, confirmed by direct execution, not
  assumption.
- DEF projection gap, WR/TE source disagreement, REGRESSION_WEIGHT dollar-arm — same
  network wall, ready-to-run commands left in `DECISIONS-NEEDED.md`.
- RB-concentration risk (single-team injury exposure) — smaller now that RB depth
  improved, not measured as zero.

**Actually built and shipped to `main` today (not just documented):**
- Seat-plan CSS ordering fix — recommendation was buried below the fold on phone;
  now visible immediately. Tested, screenshotted before/after.
- Doctrine-governance duplicate-pill fix — redundant clipped text removed. Tested.
- `draft/tools/decisions_drift_check.js` — new mechanical checker for exactly this
  class of staleness going forward.

**Before trusting anything in `DECISIONS-NEEDED.md`'s OPEN section:** run `node
draft/tools/decisions_drift_check.js`. Four "open" items today turned out already
resolved in code (F4, the Sunday alert cron, and two weight values in #3) —
three of those four were a literal quoted value that had drifted from the code, which
is now mechanically checked. It's advisory only (one confirmed false positive already,
matching the English word "value" in an unrelated sentence) — a clean run doesn't mean
an entry is current, but a flagged one is worth checking before acting on it.

---

## ALREADY SETTLED — DO NOT RE-DERIVE THESE

Found this week, each after real time spent re-discovering something already true in
the code. Listed here specifically so nobody (A, B, C, or a future me) burns another
hour on them:

- **The composite-vs-needrule disagreement is already reconciled.** `needrule.js` +
  the "Two reads" guard in `app.js` (~line 4169, spec A10, 2026-08-10) already handle
  it — deliberate, measured, working. `coherence.js` is a *different*, still-unwired
  feature (dead-zone/market-reliability/plan-adherence resolution for one candidate),
  not the fix for this.
- **The position-normalized ceiling fix (upsideBonus units defect) already shipped**
  — 2026-08-13, `computeCeilingScales` in `engine.js`. Don't re-propose the
  `group_by(pos)`-style normalization; it's built.
- **The F4-excluded-league replay question is CLOSED, not open.** Ruled 2026-08-11
  ("✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING ONLY"), implemented, verified
  end-to-end. A near-identical heading below it, marked SUPERSEDED, is kept only as
  an unedited historical record per this file's own audit discipline — reading only
  that section (a partial/tail read) makes it look open. It isn't. Mistakenly
  re-surfaced as a live decision on 2026-08-15; corrected same day.
- **Mid-draft need-blindness is a real, still-open gap** (not new) — already measured
  and dated 2026-08-14 in `engine.js` (~line 427, `composite_roster_blindness.test.js`).
  See the two 2026-08-15 PARKED.md entries on this for the full trail, including a
  correction — read those first, they already record two false starts on this exact
  question.

## THIS WEEK, in dependency order (no calendar gates — sequenced by risk and what unblocks what)

### 0. Zero-code — needs only Cory's ruling, unblocks everything else
- ✅ **GO for mock #4 — Cory ruled YES (2026-08-15).** Accounting green + deployed.
  Actually running it is a live event (needs real participants) — schedule with
  A/B, not something a session executes alone.
- ◻ **D14:** build the real Stage-2 anchor, or hold? Recommendation: hold, because
  wiring it now would suppress the exact deviations exp 33/34 need to measure
  cleanly. Still open as of 2026-08-15.
- ◻ **REGRESSION_WEIGHT install (0.35→0.1 or 0.0)?** Accuracy + overfitting gates
  cleared; dollar-arm sizing is the one remaining gate — in progress below.
- ✅ **F4-excluded league replay** — was ALREADY RULED 2026-08-11, before this week
  started (`DECISIONS-NEEDED.md`, "✅ RULED — F4 GATES OUTCOME-DEPENDENT GRADING
  ONLY"), fully implemented and verified. Mistakenly re-surfaced as open on
  2026-08-15 from a partial read of the file — corrected same day. Nothing to do.
- ◻ **Deploy policy after Aug 22** — low urgency, not blocking anything now.

### 1. Safe to build now — confirmed no network needed before starting (learned the hard way: check this first)
- ◻ TE-at-3.6-picks term-isolation diagnostic (board data only) — next up.
- ◻ What-would-have-worked audit vs the 3 historical drafts (uses `league_history.json`, local).
- ◻ Exp41 paired-room race — combiner core already built + tested; needs checking whether its
  race arm hits Sleeper before assuming it's clear.
- ◻ Third arm: composite vs ADP in dollars (JS replay) — needs checking whether it's local-data
  only or needs live rosters, before starting.
- ◻ Dollar-grade the exp35 sweep — same underlying grader as REGRESSION_WEIGHT below, so
  almost certainly blocked the same way; verify before spending time on it.

### 2. Blocked on live network access (Sleeper/FantasyPros egress, this sandbox can't reach either) — guidance written, needs A or any session with egress
- ◻ **DEF projections missing `def_fum_td` AND `def_kr_td`** (bigger than originally
  scoped — see `DECISIONS-NEEDED.md` #0, 2026-08-15 addendum, for the exact next step:
  pull raw rows for all 32 DEFs in one pass, not one alias at a time).
- ◻ **WR/TE projection-source ~20% disagreement** — see `DECISIONS-NEEDED.md` #000,
  2026-08-15 addendum, for a concrete first hypothesis (PPR-assumption confound in
  FP's raw data) before assuming it needs deeper novel diagnosis.
- ◻ **REGRESSION_WEIGHT dollar-arm sizing** — see `DECISIONS-NEEDED.md` #2, 2026-08-15
  addendum. Confirmed blocked at `sleeper_import.fetch_players()` specifically, not
  the rest of the pipeline (nflverse access works fine). One command to run once
  someone has Sleeper access: `python draft/backtest/exp35_regression_sweep.py --out
  draft/backtest`.

### 3. Higher-risk — needs real design + a full backtest cycle, not a date
These aren't calendar-gated; they're blocked on missing design work, and building that
design under this week's time pressure is exactly how the bench-branch anchor broke
before (documented, not hypothetical). Recommend treating these as genuinely
after-draft rather than squeezing them in — but that's a recommendation, not a rule;
override if you disagree.
- ◻ RB drafts 0.9 in every weight arm (`DECISIONS-NEEDED.md` #0000) — needs an unbuilt
  concentration/insurance term, not a coefficient tweak.
- ◻ `ONESIE_MAX_SPARE` cap re-evaluation now that the ceiling-units fix has landed —
  `draft/tests/onesie_cap.test.js`'s retirement check was still red as of last check;
  needs re-measurement against the fixed ceiling term before any design decision.

## WAITING ON THE WORLD (nothing to do, just read it when it lands)
- ◻ Covariance / portfolio rho verdict — runs in CI on push.
- ◻ Anything needing a live 2026 season (in-season tools, continuous re-grading).

## GENUINELY AFTER THE DRAFT (blocked on data that won't exist until then, not on a calendar preference)
- ◻ The learning engine (weekly re-grading) — needs live weekly outcomes.
- ◻ Site optimization Phase 2.
- ◻ Revisit deploy policy once the draft-week reserve is no longer live.

---

_Session B owns the site/in-season half — matchup page follow-ups, Sunday alert, the
lineup optimizer's in-season surfaces, the deployed-vs-main health strip, and the
design sweep. Regenerate that slice the same way when B is back._
