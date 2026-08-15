# The self-directed edge program — first verdicts and the ranked agenda

_TERRITORY: A — research audit, this lane. Filed 2026-08-15._

_Mandate (Cory, verbatim): "the model should be trying to identify its own things to
study and predict that it thinks might provide edge. Specifically betting data, pace of
play, things that help us get more accurate predictions for players week to week as
well as full season." This document is the program: two studies run to leak-free,
preregistered verdicts on real history today, plus the ranked research agenda that
continues it. Everything here is research-lane only — no production surface reads any
artifact named on this page (`data_separation.test.js` enforces the wall)._

---

## STUDY 1 — PACE OF PLAY → WEEKLY PROJECTIONS. Verdict: **NULL, cleanly.**

Preregistration: `draft/backtest/EXP-WEEKLY-ENV-PREREG.md`, committed `5e89a131`
**before any results existed**. Results: `draft/backtest/exp_weekly_env.json`.
Runner: `draft/backtest/exp_weekly_env.py`. Mechanics tests:
`draft/tests/test_exp_weekly_env.py` (13/13 — including the structural proof that
perturbing eval-week data moves no non-oracle projection).

### WHAT RAN

2023 + 2024 NFL regular seasons, real play-by-play (verified reachable this session;
47,399 / 47,274 REG rows) and real weekly stat lines, scored under **this league's
actual scoring** (`league_config.json`: half-PPR, 6-pt pass TD) through the same
`grade.nflverse_weekly_to_scoring` → `scoring.score_stat_line` path the certified
graders use. 2025 excluded — the weekly loader 404s for it and the local 2025 harvest
carries no team mapping (stated in the prereg, not discovered after).

- **Baseline (the null model):** each player's strictly-prior in-season running
  average. Eval set: weeks 5–18, QB/RB/WR/TE, ≥3 prior appearances, prior mean ≥5.0
  pts. n = 2,179 (2023) + 2,259 (2024) player-weeks.
- **Pace arms:** projection × a multiplier from strictly-prior team plays/game and
  opponent plays-faced/game — raw and neutral-script variants (kneel/spike/`posteam`
  conventions inherited from `nflverse_pace.py`), each at dampening λ ∈ {1.0, 0.5}.
- **Null baseline:** 200 within-week permutations of the team→multiplier map (§6
  parity — the null faces the identical construction). Ship rule preregistered:
  beats null p95 AND ΔMAE > 0 in both seasons AND top-decile not degraded.

### WHAT CAME BACK

| arm | pooled ΔMAE (＋ = better) | beats null p95 both seasons | positive both seasons |
|---|---|---|---|
| pace_raw @1.0 | −0.013 | no | no |
| pace_raw @0.5 | −0.005 | no | no |
| pace_neutral @1.0 | −0.034 | no | no |
| pace_neutral @0.5 | −0.009 | no | no |

Baseline MAE is 5.67–5.74 pts/player-week (Spearman ≈ 0.50, top-decile ≈ 0.36–0.44).
Every pace arm is at or below zero; none clears any gate. Post-hoc diagnostic
(labeled: computed AFTER the verdict, to explain it, not to change it): prior-weeks
pace multipliers rank-correlate with the week's ACTUAL relative play volume at only
ρ ≈ 0.02–0.08 — a single game's play count is script noise, and half a season of
prior plays barely predicts it.

### WHAT IT PROVES

- Team/opponent pace from prior weeks, applied as a multiplier to a running-average
  weekly projection, adds **nothing** at this sample under our scoring — MAE, rank,
  and top-decile all flat-to-worse, in both seasons, against a parity null.
- The negative is clean: the harness's positive control (Study 2's oracle) DID
  improve, so the design can detect a real environment signal when one is present.

### WHAT IT DOES NOT PROVE

- That pace is useless everywhere. Prior-SEASON pace as a *season-long* projection
  feature (agenda R5) and pace as a *variance/tail* input rather than a mean
  multiplier (folded into R3's boom metrics) are different questions, unrun.
- That a better weekly baseline wouldn't change the answer — a multiplier on a bad
  baseline inherits its noise. R2 rebuilds the baseline first.
- Anything about 2025, which never entered the sample.

---

## STUDY 2 — SCORING ENVIRONMENT + THE VEGAS-TOTALS CEILING. Verdict: **naive arm actively HURTS; the perfect-information ceiling is real but small — and it is a TAIL signal more than a mean signal.**

Same prereg, harness, sample, and gates as Study 1.

### WHAT RAN

- **ENV-POINTS (the deployable arm):** multiplier from strictly-prior team
  points-for/gm and opponent points-allowed/gm — the best totals-flavored signal
  available without a sportsbook.
- **ORACLE-TOTAL (leaked BY DESIGN, labeled oracle everywhere, never shippable):**
  multiplier from the week's **actual** game total. This is the ceiling on what a
  *perfect* game-totals line could add, because a totals line is a forecast of
  exactly this quantity. It doubles as the harness's positive control.

### WHAT CAME BACK

| arm | pooled ΔMAE | Δ top-decile (2023 / 2024) | verdict |
|---|---|---|---|
| env_points @1.0 | **−0.192** | −0.021 / −0.021 | hurts, both seasons |
| env_points @0.5 | −0.063 | −0.017 / −0.000 | hurts |
| oracle_total @1.0 | +0.132 | **+0.070 / +0.018** | positive control PASSED |
| oracle_total @0.5 | **+0.228** | +0.065 / +0.041 | ceiling |

Three findings inside the numbers:

1. **Prior realized scoring environment is anti-signal as a multiplier.** Post-hoc
   diagnostic (labeled as such): prior-weeks env multiplier vs the week's actual
   total, ρ ≈ 0.08. A team's season-to-date scoring barely predicts this week's
   game total, and the running-average baseline already embeds the player's team
   environment — multiplying re-counts it and amplifies error.
2. **Even the ORACLE overshoots at full strength.** λ=0.5 beats λ=1.0 (+0.228 vs
   +0.132): player scoring is sub-proportional to the game total. Any future
   totals-derived feature must be dampened; that is now measured, not guessed.
3. **The ceiling lives in the tail, not the mean.** The oracle improves MAE ~2–4%
   but moves top-decile hit rate by up to +7 points (2023). Game environment
   information is worth more for *finding boom weeks* than for average accuracy —
   directly relevant to a league whose money concentrates in the weekly-high pool
   ($330–420/team/yr leak, per `EFFICIENCY-LEAK.md`).

### WHAT IT PROVES

- Backtested on real history: **the free proxy for a totals line is worthless-to-
  harmful**, and **the absolute maximum a perfect totals line could add** to this
  baseline is ≈0.23 MAE pts/player-week and a few points of top-decile. A real
  market line, forecasting the total imperfectly, collects some fraction of that.
  This caps the expected value of the betting-data channel BEFORE we spend a
  season capturing it — the calibration the forward test (R3) will be graded against.

### WHAT IT DOES NOT PROVE

- What fraction of the ceiling a real Vegas line captures — historical odds are not
  available on our tier (verified constraint, not assumption), so that is a
  **forward** question, preregistered as R3 below. "Backtested on history" and
  "preregistered forward test" are different claims and this program never blends
  them.
- Anything about player props, spreads/script effects, or availability — separate
  agenda entries.

---

# THE RANKED RESEARCH AGENDA (preregistered designs, not aspirations)

House rules apply to every entry: strictly-prior inputs only, parity nulls,
ship rule = beats null p95 AND survives leave-one-season-out (or both-seasons-positive
where only two seasons exist), measurements labeled as measurements, and **nothing
installs from a study — a positive routes to a separate gated SHIP decision.**
Ranking is by expected value = (plausible dollar impact through the money grader's
channels) × (probability the signal is real) ÷ cost, and the reasoning is stated
so a future session can re-rank honestly.

## R1 — TEAMMATE-ABSENCE OPPORTUNITY REDISTRIBUTION (weekly). **Rank 1.**

- **Hypothesis:** when a high-usage player (top-2 in team targets or carries over
  prior weeks) does not play in week w, his same-position teammates outscore their
  running average, by enough to move start/sit decisions.
- **Why rank 1:** the one weekly channel where the underlying real-world effect is
  KNOWN to be large (a lead back's 15 carries go somewhere), it is fully
  backtestable TODAY with data already cached (2023–24 weekly usage), and it feeds
  the lineup optimizer where the league's dollars actually are (weekly-high pool).
  Study 1/2's harness is reusable nearly unchanged.
- **Exact design:** for each eligible player-week, flag `beneficiary` if a top-2
  prior-usage same-position teammate is absent in week w. Arm: redistribute the
  absentee's prior target/carry share to teammates proportional to their prior
  shares; convert to points at the position's prior points-per-opportunity. Grade
  ΔMAE + top-decile on beneficiary weeks AND on the full set (an arm that helps
  beneficiaries but hurts globally is a filter, not a projection). Honesty note
  carried into the design: "absent in week w" must be restricted to absences
  knowable at lineup lock (inactives are announced pre-lock, so the flag is
  decision-time legal — but the report must say this is assumed, and the forward
  version uses actual report timestamps).
- **Data + availability:** in hand (cached weekly 2023–24; usage columns verified).
  Optional upgrade: `nfl_data_py` injuries/snap-count endpoints — availability
  untested, probe before designing around them.
- **Null baseline:** permute WHICH teammate benefits within the team-week; running
  average remains the projection null.
- **Ship rule:** beats null p95 on beneficiary-week ΔMAE, positive both seasons,
  full-set MAE not degraded.
- **Cost:** ~half a session. No egress beyond what is cached. No credits.

## R2 — A BETTER WEEKLY BASELINE (recency + opportunity). **Rank 2.**

- **Hypothesis:** the running average is beatable: (a) recency weighting
  (last-3-weeks weighted vs flat), (b) opportunity-based projection (prior
  targets/carries × prior efficiency, shrunk), (c) their blend, each strictly
  prior, reduce MAE and improve top-decile vs the flat running average.
- **Why rank 2:** every weekly study in this program grades against this baseline;
  sharpening it compounds through all of them (a multiplier on a bad baseline
  inherits its noise — Study 1's stated limitation). exp35 already showed
  regression weighting is a real lever at season scale.
- **Exact design:** same harness, same eligibility, same metrics as EXP-WEEKLY-ENV.
  Grid preregistered BEFORE running: recency half-life ∈ {2, 4, ∞} weeks ×
  opportunity blend ∈ {0, 0.5, 1.0}. The full curve is reported (house sweep
  style); no cell is tuned on the eval metric then re-graded on it — with only
  2023+2024 in hand, the winner in one season must hold in the other (that IS the
  held-out test, and its weakness is stated).
- **Data:** in hand. **Null:** the flat running average itself + a 200-draw label
  permutation on any claimed top-decile gain. **Ship rule:** house rule.
- **Cost:** ~half a session, zero egress, zero credits.

## R3 — MARKET GAME LINES AS WEEKLY FEATURES (forward preregistration; the betting-data mandate). **Rank 3.**

- **Status, stated precisely:** a *backtest* is IMPOSSIBLE — historical odds for
  2023–25 are not on our tier. This is a **preregistered forward test on the 2026
  season**, graded January 2027. Study 2 already priced its ceiling on history.
- **Hypothesis (two, ordered):** (a) the captured game total predicts the actual
  total far better than prior-weeks realized environment (benchmark to beat:
  ρ ≈ 0.08, measured in Study 2's diagnostic); (b) a dampened totals multiplier
  (λ = 0.5 — the dampening the oracle demanded) improves the live weekly
  projection's **top-decile / boom identification** more than its MAE. The tail
  metric is primary BY PREREGISTRATION, because Study 2 showed the environment
  channel is a tail signal, and the league's money is in the weekly-high pool.
- **Exact design:** each NFL week, archive one totals+spreads snapshot per game
  (capture spec below). In-season, compute the shadow projection (live weekly
  projection × dampened market multiplier) alongside the real one — SHADOW ONLY,
  never surfaced, per the data-separation wall. January grading: paired ΔMAE +
  Δtop-decile vs the no-market twin, permutation null over the team→line map,
  n ≈ 14 weeks × ~250 players.
- **Calibration, preregistered now:** the oracle cap says even a PERFECT line is
  worth ≈0.23 MAE pts and a few top-decile points; a realized fraction of a third
  to a half of that ceiling is a strong result; anything NEAR OR ABOVE the oracle
  is a leak (a line cannot out-predict the realized total it forecasts), and must
  be treated as contamination until the input path is audited.
- **Data + availability:** Odds-API capture infrastructure exists and runs daily
  (C's lane, `market_capture.py`; a regular-season event verified to carry
  ML/Spread/Totals 27 days out). **Zero credits were spent by this session** —
  nothing here needed a call today.
- **Minimal capture spec (a lane decision, not built here):** what — event id,
  kickoff, home/away, Totals and Spread with per-book prices, `captured_at`;
  when — twice weekly in-season (Wed ~18:00 UTC for the early read, Sun ~15:00 UTC
  for near-closing) — the Sunday snapshot is the one graded; where — the existing
  `draft/market_snapshots/` naming scheme, which the daily job already writes.
  If the daily `usa-nfl` capture simply continues through the season, the Sunday
  requirement is already ~met by the daily cadence; the only genuinely new ask is
  making sure in-season captures don't stop at the preseason boundary.
- **Null + ship rule:** as above; a shipped market feature additionally requires
  the following season's confirmation (n=1 season never certifies — house rule).
- **Cost:** ~2 credits/week within the existing budgeted job; grading is one
  session in January.

## R4 — PLAYER-PROP LINES AS THE MARKET'S WEEKLY PROJECTION (probe-gated forward test). **Rank 4.**

- **Hypothesis:** prop-implied player expectations (rec yds / rush yds /
  receptions over-unders) beat our weekly projection on MAE and top-decile — i.e.
  the market IS the better weekly projector, and the lineup optimizer should
  anchor to it where props exist.
- **Why rank 4 despite the highest per-unit value:** availability is UNVERIFIED on
  our tier for in-season player props (the preseason probe found partial TD-market
  coverage only), and coverage gaps (23–48% uncovered at some slots, measured
  2026-08) may gut it. Gated on a cheap availability probe.
- **Exact design:** Step 1 (≤2 credits, only when in-season props could exist):
  one listing probe for a week-1 event's player-prop markets; if props are absent
  on our tier, THE FINDING IS "unavailable — entry closed," recorded, no purchase
  on feel (exp 39's clause governs any paid upgrade). Step 2 if available: weekly
  capture (same snapshot rail), January grading identical in shape to R3, with
  props-covered players as the eval set and coverage reported beside every number.
- **Null:** our own live weekly projection. **Ship rule:** house rule + the
  exp-39 cost clause if any paid tier is involved.
- **Cost:** ≤2 credits for the probe; capture rides the existing job.

## R5 — SEASON-MODEL ENVIRONMENT FEATURES (full-season; exp-33's open flank). **Rank 5.**

- **Hypothesis:** prior-season team environment (neutral-script pace, offense
  points/gm, returning-QB continuity) improves the walk-forward season model's
  top-decile hit rate — its measured weak spot — without degrading MAE.
- **Why rank 5:** draft-relevant only for 2027 (the 2026 draft is in 7 days; no
  responsible install window), and Study 1's weekly null lowers the prior that
  pace transfers, though season-scale aggregation removes most script noise so
  the question is genuinely open, not answered.
- **Exact design:** extend `lab_projections.py`'s walk-forward with team features
  from seasons strictly before the projected one (pbp cached for 2023–24; 2022
  needed for the 2023 arm — availability must be verified first, else the 2023
  arm is dropped and stated). Grade per exp 33's exact metrics (MAE, rank corr,
  top-decile) on 2023/2024/2025 realized seasons; LOSO across the three.
- **Null:** the current walk-forward, plus exp 33's naive baseline (which the
  blend is known to lose to on top-decile — that remains the number to beat).
- **Ship rule:** house rule; any change to `own_projections.py` defaults is a
  separate gated decision.
- **Cost:** one session + one pbp season download.

## R6 — SCHEDULE-SPOT EFFECTS (post-bye, short-week, rest differential). **Rank 6.**

- **Hypothesis:** rest spots shift weekly scoring by a measurable, exploitable
  amount (post-bye up, Thursday short-week down).
- **Why last:** literature effects are small (±0.3–0.7 pts), our per-arm
  resolution at n ≈ 2,200/season is ~±0.1 MAE — powered, but the plausible edge
  rarely changes a start/sit, and schedule egress is partially blocked
  (habitatring 403; rest days must be derived from pbp game dates — availability
  of `game_date` in our cached columns must be verified first, and the design
  waits on that).
- **Design:** binary spot flags as additive adjustments (not multipliers), same
  harness, same nulls, same gates. **Cost:** ~quarter session once dates verified.

---

## Program notes (honesty section)

- **Deviations from the EXP-WEEKLY-ENV prereg:** none in the graded arms. Two
  post-hoc diagnostics (predictiveness ρ of prior-week multipliers) were computed
  AFTER the verdicts and are labeled post-hoc everywhere they appear.
- **Credits:** 0 of the ~96 remaining Odds-API credits were spent. Every agenda
  entry that would spend any names its budget in advance.
- **The referenced weekly baseline:** the running-average baseline class used here
  is the same class the house lineup work grades against; this program's studies
  are projection-accuracy studies and do not touch the dollar grader — pricing a
  weekly signal in dollars (through `money_grade.py`) is what a SHIP decision
  would require, deliberately left outside these designs.
- **Data separation:** every artifact this program wrote lives in
  `draft/backtest/` (`exp_weekly_env.json`, `exp_weekly_env_features.json`) and
  is read by no production surface. The forward tests specify SHADOW computation
  only; a market number reaching a decision surface would violate rule 15 and the
  research wall at once, and is not proposed.
