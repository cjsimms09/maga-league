<!-- TERRITORY: A -->
# MODEL & LEARNING-LOOP AUDIT — 2026-08-15

Mandate (Cory, verbatim): *"want fable looking at our closed loop system and
grading for improvement and learning within the model and fix and solve issues.
Fable should double check our projected scoring to make sure it's accurate and
makes sense."* Three missions; every number below is from a command run today
in this worktree, at `origin/main` = `86e42bc2` (board built 2026-08-15).

---

## MISSION 1 — PROJECTED SCORING, DOUBLE-CHECKED INDEPENDENTLY

**VERDICT: CORRECT.** The pipeline applies the league's real scoring end to
end, every internal identity holds on all board rows, an independent
recompute reproduces the stored realized points to the cent, and the season
totals make football sense against real 2023-25 seasons scored under our
rules. Two findings ride along: a measured, ungraded source divergence at
WR/TE (not a defect — an open question the loop cannot answer yet, now
preregistered), and a re-confirmed honest negative on the own model.

### 1.1 The scoring rules, recomputed from the real config

`draft/config/league_config.json` (imported from Sleeper 2026-08-15):
half-PPR (`rec 0.5`), **`pass_td 6.0`**, `pass_yd 0.04`, **`pass_int −2`**,
`rush/rec_td 6`, `rush/rec_yd 0.1`, `fum_lost −2`, 2pt = 2, 10 teams, 1 QB,
15 rounds. `scoring.py:score_stat_line` is a dot product over shared keys —
provider points are never trusted, only raw stat lines rescored (module 1's
own contract, and it is honoured at every call site I traced).

### 1.2 Independent recompute — my arithmetic vs the committed store

I fetched the raw nflverse 2024 weekly stats myself and scored five players
with hand-typed constants (never importing `scoring.py`), weeks 1-17 REG,
then compared against `draft/backtest/nflverse_weekly_points_2024.json`:

| player | my arithmetic | committed store | diff |
|---|---|---|---|
| Josh Allen (elite QB) | 428.34 | 428.34 | 0.00 |
| Jayden Daniels (QB) | 401.60 | 401.60 | 0.00 |
| Chuba Hubbard (mid RB) | 220.10 | 220.10 | 0.00 |
| Rhamondre Stevenson (RB) | 159.40 | 159.40 | 0.00 |
| Trey McBride (TE) | 172.30 | 172.30 | 0.00 |

All three weekly stores carry scoring fingerprint `bd8f3e50bd67a9ce`, which I
recomputed from the live config: **match** — the stores were scored under
exactly today's table. **K and DEF are absent from the stores** (the
nflverse offense file carries no kicking/team-defense stats); their realized
points are unmeasurable offline and every consumer below says so.

### 1.3 The pipeline, end to end, on the shipped board

- `proj_baseline` = Sleeper's **2026** stat-line consensus (source live: 633
  nonzero rows — NOT the prior-actuals fallback) scored under OUR table.
- `proj_mean = proj_baseline × (1 + opportunity_adj)`, adj capped ±15%:
  **0 violations over all board rows.**
- `proj_sd = proj_mean × variance`, `ceiling = mean + 1.036·sd`,
  `floor = max(0, mean − 0.674·sd)`: **0 violations.**
- FantasyPros (`proj_fantasypros`, 458 rows) and the own model
  (`proj_ownmodel`, 630 rows) are both scored from raw stat lines under OUR
  table and attached **display-only** — `proj_mean` is single-source Sleeper.
  **There is no uncorrected averaging of unlike-scoring sources anywhere in
  the composition** — the concern in the mandate does not materialise.

### 1.4 The 6-point-TD question, projection side

The projections DO price it: the board's own provenance measurement
(`lab_scoring_gap.measure`, run inside today's build) shows our scoring vs
the 4pt-TD market on the SAME projected stat lines is **QB-only**:
top-12 QB **+43.67 pts** (mean ours 354.89), all-QB +5.53, and **0.00 at
RB/WR/TE/K/DEF** — structural to the position, exactly as first principles
predict. ADP is deliberately NOT corrected toward our scoring (the anchor
ruling, ROUTES 2026-08-14: ADP predicts the ROOM's behaviour, and the
ADP↔VORP gap *is* the edge). The projection side and the ADP side are
different quantities on purpose, and both are behaving as ruled.

### 1.5 Do the totals make football sense — derived, not guessed

Realized #1 seasons under OUR scoring (weeks 1-17, from the stores):
QB 425.6 / 485.4 / 412.6 (2023/24/25) · RB 357.8 / 338.8 / 354.9 ·
WR 308.7 / 259.1 / 289.5 · TE 184.9 / 193.7 / 242.9.

Board 2026 #1 projections: QB Allen **405.5** · RB Gibbs **344.9** ·
WR Nacua **297.9** · TE Bowers **232.9**. Every position's projected #1 sits
at or slightly below the realized-#1 range — conservative in the right
direction for a mean forecast. Sensible.

### 1.6 proj_sd / adp_sd — cross-referenced, not re-derived

- `proj_sd`: C measured it understated (median **1.38×** vs 2023-25 error;
  streaming-range QBs ship ~70 vs measured 145-185 —
  `BOARD-UNCERTAINTY-AUDIT.md`), and A's decision arm showed the 12-seat
  plan's roles don't move under the measured table
  (`PROJ-SD-DECISION-ARM.md`). Known, gated, now a concrete recommendation
  (REC-1 below) instead of a parked fact.
- `adp_sd`: 95% of the pool on two clamp values with the real dispersion
  capture landing via C's D3 work and `adp_sd_source` now declared — already
  in flight in C's lane; nothing re-derived here.

### 1.7 A measured source divergence nothing currently grades

On the top-150, same players, both sources scored under OUR rules:
**Sleeper runs a median +29-30 points hotter than FantasyPros at WR
(n=54) and TE (n=17)** and roughly flat at QB (−4.7) and RB (−2.2). The
opportunity adjustment (mean +7.6% on the draftable board) widens the shipped
gap to ~+47 at WR/TE. Within-position order still agrees (rho 0.93-0.97,
`exp_proj_source.json`), and a within-position level shift largely cancels in
VORP through the replacement line — so this is **not** a board-breaking
defect. It IS an ungraded fork: nothing measures which source is right, and
no pre-2026 projections were ever archived to grade them on. That is now
REC-2, preregistered (below), gradeable January 2027 from the daily
`proj_series.json` freeze that began 2026-08-09.

### 1.8 Leak-free accuracy backtest — what is measurable from disk, honestly

`proj_mean`'s sources cannot be backtested for 2023-25 (nothing archived; a
retroactive fetch leaks — exp33). What IS measurable offline, and now is
(`draft/backtest/model_accuracy_backtest.py`, preregistered in its header,
artifact `model_accuracy_2025.json`): season 2025 graded from strictly
2023+2024 stores, weeks 1-17, shared population, MAE / Spearman:

| pos | n | walk_forward (proj_ownmodel) | naive prev-season | recency blend 0.7/0.3 |
|---|---|---|---|---|
| QB | 58 | 103.9 / 0.671 | 78.9 / 0.709 | **74.1 / 0.721** |
| RB | 97 | 56.4 / 0.735 | 42.8 / 0.752 | **42.6 / 0.759** |
| WR | 149 | 46.7 / 0.687 | 37.4 / 0.729 | **36.7 / 0.729** |
| TE | 83 | 34.0 / 0.685 | 27.0 / 0.741 | **24.3 / 0.783** |

**The honest negative: the own model loses to a naive recency blend at every
position on both metrics.** It is display-only today (correctly), and REC-3
makes the negative standing so it cannot be quietly un-learned. Survivorship
caveat carried in the artifact (same as C's calibration). One-season n; K/DEF
and the provider sources reported unmeasurable by name.

---

## MISSION 2 — DOES THE CLOSED LOOP ACTUALLY LEARN?

**VERDICT: THE LAST ARC DOES NOT EXIST. Capture → resolve → grade all run;
grade → model does not.** The trace, reader by reader:

| grade artifact | written by | readers found | reader class |
|---|---|---|---|
| `calibration:{season}:{ISO}` snapshots (by_kind/by_week) | grade-cron (weekly) | routes/accuracy.js, routes/member.js, routes/standings.js | **human pages** |
| `evidence_weights:current` | grade-cron | **NONE** (grep: writer + one PARKED mention) | — |
| `projection_error_calibration.json` | projection_error.py (C) | its own tests; appliers `proj_sd_for`/`proj_ceiling_for` have **no production caller** | — |
| `component_grades.json` | component_write.js | standing_check.py, accuracy surface | monitor + human |
| `calibration_drift.js` proposals | (no readings yet) | standing_check escalates → a human | human |
| forecast_grade outputs | grade-cron / accuracy route | accuracy page | human |

No model parameter — engine.js CFG, `MEASURED_WEIGHTS`, `POSITION_VARIANCE`,
the projection composition — reads any grade artifact. **"Humans might look
at a page" is the entire learning mechanism.** That is the finding, and it
was nearly said out loud already: grade-cron's own step 2 writes weights "the
model can read", and the model never did.

### What was built (defaults untouched — enforced by test)

`draft/backtest/learning_loop.py` + committed artifact
`draft/data/model_update_recommendations.json` (`_territory` first key) +
`draft/tests/test_learning_loop.py` (7 checks, leak fail-arm included):

- **REC-1 — proj_sd from measured error** (`ready-for-ruling`): the exact
  20-cell sd_ratio table from C's calibration, with the three evidence
  citations and the one-line acceptance (blend() calls `proj_sd_for`,
  POSITION_VARIANCE as fallback for unmeasured cells). Not applied.
- **REC-2 — per-source per-position composition weights**
  (`blocked-until-2027-01`): the machinery is BUILT and preregistered NOW —
  forecast = last pre-2026-08-22 snapshot per source (post-draft snapshots
  structurally unselectable; fail-arm test), outcome = realized 2026 weeks
  1-17 under our scoring, inverse-MSE weights per position, MIN_N 10, thin
  sources get NO weight claim. In January the same function that the unit
  test drives produces the weights; acceptance is one reviewed composition
  change. The January run cannot be tuned to fit because the rule predates
  the data.
- **REC-3 — own model stays display-only** (`standing-negative`): the 1.8
  table above, recorded as a BLOCK on promotion, with a tripwire test that
  fires if a future regeneration reverses it.
- **REC-4 — evidence_weights has no reader** (`wiring-gap`): the trace
  above, recorded; which parameter a consumer should move is a design ruling
  and is deliberately not proposed here.

`test_learning_loop.py` pins: artifact == regeneration, `defaults_untouched:
true`, every recommendation carries an acceptance path, and REC-2 cannot
claim "measured" while `nflverse_weekly_points_2026.json` does not exist.

---

## MISSION 3 — A'S HARDEST OPEN PROBLEMS, SOLVED TO STANDARD

### 3.1 `frontier.py:105` — confident losses labelled inconclusive · FIXED

- **Reproduced:** the shipped `frontier.json` carried `flat_l2.0` CI entirely
  below zero under *"parked: CI includes $0"* (committed artifact:
  [-71.17, 4.33] genuinely straddled at 150 rooms, but the label expression
  `lo <= 0` provably files ANY negative lower bound as inconclusive —
  fail-arm test reproduces it on C's quoted [-109.33, −25.5]).
- **Fixed:** `verdict_for(lo, hi, mean)` extracted with the exact
  `cory_conditional.py:517` three-way logic (`hi < 0` → LOSER;
  `lo <= 0 <= hi` → includes $0; else band).
- **Artifact regenerated** with the production invocation (`--rooms 150`, on
  today's board): `flat_l2.0` [-99.5, −29.33] and `flat_l3.0`
  [-127.5, −54.0] now read **"LOSER — significantly worse than the
  control"**; the two genuine straddles keep the inconclusive label.
- **Pinned:** `draft/tests/test_frontier_verdicts.py` (5 checks) — the old
  expression's mislabel as a fail arm, the new mapping, and a shipped-artifact
  sweep asserting no entirely-negative CI ever carries the shrug again.
- The fixture that ENSHRINED the wrong pairing
  (`test_claim_integrity.py:115`) now carries the LOSER label plus a genuine
  straddle row, so the tier guard still exercises both shapes.

### 3.2 `standing_check.py` Signal-C — daily escalation on data that cannot answer it · FIXED

- **Reproduced:** all six snapshots on disk are `usa-nfl-preseason`; 36
  paired events ≥ bar 30 → the row escalated every day since 08-12 on
  preseason games, which cannot answer "does line movement have structure".
- **Judgement call, made and documented in the code:** C laid out
  gate-vs-leave and said "I would not silence it". The gate implemented does
  both halves: **ESCALATE counts only regular-season paired events** (slug
  from the event's own odds record, snapshot league as fallback), while
  preseason and unlabelled pairs stay **counted and printed** in the quiet
  detail — the mechanism's proof stays visible, its claim stops being false.
  An unlabelled event counts toward NEITHER side (absence of a label is not
  evidence of a season type). This is A's own threshold discipline — the bar
  and the question must be denominated in the same thing — applied to A's
  file.
- **Live result:** `quiet — regular 0/30 toward the bar; preseason 36 prove
  the pairing mechanism but cannot answer Signal C; unlabelled 0`. The row
  starts speaking truthfully when the first regular-season event enters the
  capture window (~08-27, per C's census).
- **Pinned:** two new tests (preseason-pairs-at-bar stays quiet + names the
  gate; unlabelled counts toward neither side) and the two existing
  Signal-C tests updated to regular-season fixtures. 29/29 pass.

### 3.3 MAIN WAS RED — three suites, one defect class, all fixed

`bash scripts/js-sweep.sh` on a **clean `origin/main` worktree** (verified,
exit 1 on all three): `pick_schedule`, `survival_scale`, `surface_contract`
red — so the integrate gate was refusing every lane. Not caused by any commit:
all three pinned an OBSERVED, board-dependent value and the 08-15 rebuild
moved the board under them. The class is the repo's own named one — a pin
wearing a band's clothes — and each fix replaces observation with
construction:

- **pick_schedule** — the fail-arm demanded the 147-vs-150 waiver-depth
  confusion bite somewhere on TODAY's board; today it bites nowhere (all six
  positions read the same level at both counts — an honest fact about today's
  ADP ordering). Rewritten CONSTRUCTED: slice just past the player the QB
  level is read from and the level must move to a different player — cannot
  go vacuous on any non-empty pool. 40/40.
- **survival_scale** — pinned Allen's survival at 4.0%, keepers.py's number
  from the 08-13 board; the rebuild moved his `adjusted_adp`/`adp_sd`
  (3.18%). The parity target is now DERIVED at test time (survival = 1−Φ at
  the LIVE index with the player's own spread, independent erf
  transcription), plus a new fail-arm proving the check discriminates the
  raw-pick scale. 19/19.
- **surface_contract** — asserted the term-share TOTAL ORDER
  value>keeper>onesie>stack; keeper (16.1→14.3) and onesie (13.9→16.8)
  swapped in the rebuild. The order among three 10-17% terms is a board
  property, not a model claim — the test now asserts the stable claims
  (value dominates — already banded — and every minor term ≥3% material),
  and `WAR-ROOM-SURFACE-CONTRACT.md`'s table now shows both boards' shares
  and says the sub-order trades places nightly. 51/51.

### 3.4 Justification of the pick set

The two named problems were both live (one mislabelling a shipped experiment
verdict, one training everyone to ignore an escalation channel eight days
before the draft). The third candidate class — anything harder — was Mission
1/2 itself: the own-model negative and the learning-arc gap are the two
highest-value open questions in the mandate's own words, and both are now
measured, pinned, and routed rather than open.

---

## WHAT THREATENS THE DRAFT (the one-line versions)

- **Nothing found in the projection pipeline threatens the 22nd.** Verdict
  CORRECT; the identities hold on today's board; the sources are composed
  knowingly, not averaged blindly.
- The WR/TE source divergence (+30 raw) does not move within-position order
  (rho ≥ 0.93) and largely cancels in VORP; no pre-draft action needed, and
  correcting ADP toward our scoring remains ruled OUT.
- proj_ownmodel must not be promoted into the composition on current
  evidence (REC-3) — it is not, and a test now guards the negative.

## SUITE RESULTS (after all changes, before commit)

- `python3 -m pytest draft/tests -q` — **2157 passed, 5 skipped, 0 failed.**
- `bash scripts/js-sweep.sh` — **248 entry points, all green** (main had 3
  red suites before §3.3's fixes; verified red on a clean `origin/main`
  worktree first, so the fixes clear a pre-existing gate blocker rather than
  papering over anything this audit introduced).
