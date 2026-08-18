<!-- TERRITORY: A -->
# THE PLAYER-PROJECTION PROGRAM — COMPONENT DATA, THE FANTASYPROS BAR, AND WHAT WAS EARNED — 2026-08-16

## 0. The mandate, verbatim, and the bar it moved

Cory, 2026-08-16:

> "If V4 is still inferior to fantasy pros projections why are we using it
> for anything. We need it to be better or it's of no use? I guess we could
> use it to just try to get data and get better. But I think we can start
> with a better model.. really dig into player projection and different data
> that has been proven to work and let's keep improving it. Player projection
> is the most important part of making a good model, good draft tool, good
> league analyzer, good waiver tool, etc!! It's everything."

And the same-day scope addendum:

> "I really think we need to look at integrating betting and things into
> projections or we won't get better results... betting market may really
> help in season week to week but maybe not as helpful pre draft. Maybe it's
> good for both. Also pace of play is something we should look into. Target
> share maybe.. let's find an edge here."

REC-3's beat-both-naive-baselines bar was scaffolding; **the real bar is
FantasyPros** — an expert aggregate whose measured edge over our strongest
naive baseline is 3–9 MAE points per position (the committed FP-archive
benchmark, `exp_fp_hist_proj.json`). This pass delivers: the component data
the last three autopsies asked for (fetched, trimmed, committed, pinned), a
preregistered component-native candidate (v5), a preregistered composition
(v6) that now holds the program's best cells at every position, the measured
answer to what each data source buys, and the honest distance that remains
to FP. Nothing ships in this pass; every diff below is prepared, not applied.

## 1. The data that landed (deliverable 1)

**Component stores** — `draft/backtest/component_stats_{2021..2025}.json`
(~780 KB each, fetched by the idempotent, re-runnable
`draft/backtest/fetch_component_stats.py`, provenance block in every file):
per-player weekly pass att/yd/TD/INT, carries/rush yd/TD, targets/rec/rec
yd/TD, 2pt conversions, fumbles lost, target share, **team** — regular
season, offense, gsis→sleeper crosswalked, unmapped players kept under
`gsis:` keys so team sums never shrink. Missing-vs-zero rule stated in every
`_note` and pinned by test: an absent player-week is MISSING (no stat row),
never a zero; inside a present row an absent stat key IS zero.

**Vegas lines store** — `draft/backtest/vegas_lines_2021_2025.json` (150 KB):
per-game closing `spread_line`/`total_line`, 2021–2025, with the sign
convention verified and the leakage rule in the store itself: a season-total
projector may read **week-1 lines only** (they close before any game of the
season); deeper weeks are in-season information.

**Parity, measured then pinned** (`draft/tests/test_component_stats.py`, 16
tests): component rows scored under the weekly points stores' own frozen
table reproduce the committed 2023/2024 points **exactly** (5,055 + 4,984
player-weeks, zero diffs) and cover every fantasy-position player-week the
harness grades in 2023–2025. So 2021/2022 points are computable under the
same rules — the training basis grew from ONE leak-free transition to TWO
(2023 and 2024), with 2025 still held out.

**A data-quality finding, pinned not fixed:** the committed 2025 points
store diverges from the official aggregation on 120 of 4,685 player-weeks
(<3%), one direction — its pbp-rebuild path never emitted 2pt conversions.
The committed store is the frozen graded truth of the whole v2→v6 protocol
and is NOT modified; the divergence is bounded and named by test.

**What the stores closed** — every named absence in the v2/v3/v4 autopsies:
usage volume (was: "points only"), TD counts separable from volume (was: "TD
luck unregressable"), team assignment history (was: "no team history on
disk"), pre-2023 seasons (was: "the one-year transition is the binding
limit").

## 2. What each data source buys — measured, not asserted

Feature-ablation ladder, grid-tuned per row under one fixed selection rule
on the two tuning folds (2021+2022→2023, 2022+2023→2024; 2025 never touched
during tuning). Cells are min-across-folds gains vs the best baseline
(MAE gain / Spearman gain); ✗ = no configuration in that row qualified
(beat both baselines, both metrics, both folds, strict):

| row (cumulative)                | QB              | RB              | WR              | TE              |
|---|---|---|---|---|
| availability regression (E[G])  | +0.19/−0.0170 ✗ | +0.70/−0.0107 ✗ | +0.60/+0.0025   | +0.56/+0.0002   |
| + xFP efficiency regression     | (no gain alone) | (no gain alone) | (no gain alone) | (no gain alone) |
| + rushing equity / started-G    | (no gain alone) | —               | —               | —               |
| + target-share-of-team          | —               | (no gain alone) | (no gain alone) | (no gain alone) |
| + pace regression (player-level)| —               | (no gain alone) | +0.67/+0.0016   | (no gain alone) |
| + Vegas week-1 lines            | +0.22/+0.0006   | +0.28/+0.0007   | +0.74/+0.0003   | (no gain)       |
| + league-draft market (full)    | —               | +2.55/+0.0039   | +0.97/+0.0008   | +0.76/+0.0004   |

Honest readings, including the addendum's three named features:

- **Availability + the league market carry most of the fold signal.** The
  component-volume features pay mainly *in combination*: beta>0 (xFP) is
  selected inside the RB/WR/TE winners but never qualified alone.
- **Betting lines (Cory's ask #1):** Vegas week-1 implied team totals are
  the difference between *no QB qualifier at all* and exactly one, and are
  worth +0.2–0.7 fold MAE elsewhere pre-draft. Context that must travel with
  every Vegas claim: EXP-WEEKLY-ENV measured a **perfect-foresight** team
  game-total ceiling of only ~+0.23 weekly MAE (tail-shaped) — the
  season-grain gains here are consistent with a small, real, non-magical
  signal, and any future in-season result *exceeding* a perfect-foresight
  ceiling is a leak flag, not a win.
- **Pace of play (ask #2):** the standing NULL was TEAM WEEKLY SCORES from
  league history — a different question, not re-litigated here. Player-level
  pace (team volume → opportunity), tested for the first time, buys +0.07
  MAE at WR over share-at-face-value and nothing elsewhere at the
  season-total grain. Its natural home is the weekly projector (§8).
- **Target share (ask #3):** has its own row by name. Share-of-team at face
  value bought nothing *alone* at this grain, but share mode IS selected
  inside the WR and TE winners (preferred over raw counts exactly as asked)
  once pace/vegas/market join.
- **The QB warning that came true:** the QB family produced exactly ONE
  qualifying configuration, min fold margins +0.22 MAE / +0.0006 ρ. The
  prereg called this "fragile evidence"; §3 shows it did not generalize.

## 3. Arm A — the independent candidate, graded (deliverables 2–3)

No fantasy-provider input anywhere: no Sleeper number, no FP number. The
league's own draft and public closing lines are preseason-frozen markets on
committed disk, not providers.

**v5** (preregistered `own_model_v5.py`, constants frozen on the two folds,
commit order the proof; single 2025 run, shared population identical to
every prior artifact — QB 58 / RB 99 / WR 150 / TE 84):

| pos | own_v5 | own_v4 (promoted) | naive_prev | recency_blend | REC-3 cells |
|---|---|---|---|---|---|
| QB | 73.30 / 0.7188 | **72.29 / 0.7225** | 78.89 / 0.7080 | 74.09 / 0.7213 | MAE ✓, ρ **✗** |
| RB | **37.54 / 0.7968** | 38.66 / 0.7957 | 42.37 / 0.7612 | 41.86 / 0.7682 | ✓ ✓ |
| WR | **33.63 / 0.7634** | 34.05 / 0.7530 | 37.72 / 0.7339 | 36.82 / 0.7344 | ✓ ✓ |
| TE | **23.33 / 0.7987** | 23.73 / 0.7920 | 26.73 / 0.7440 | 24.04 / 0.7871 | ✓ ✓ |

**v5 does NOT clear REC-3** — the QB Spearman cell (0.7188 vs the blend's
0.7213) fails, exactly the fragility the prereg named. The clean positive
inside the negative: v5 beats the PROMOTED v4 at RB/WR/TE on both metrics —
the component data measurably improved every position it had new information
for. The QB loss is also informative: the short-season block in the artifact
shows v5's harder availability regression priced the 2024-short *busts*
better than v4 and the 2024-short *breakouts* worse — rate × availability
from box scores still cannot tell Lamar-recovering from Watson-done.

**v6** (preregistered `own_model_v6.py`: v4's QB arm + v5's RB/WR/TE arms,
byte for byte, nothing tuned — the same move v4 made on v3; its cells were
arithmetically implied by the two committed artifacts and the run verified
them bit for bit):

| pos | own_v6 | vs own_v4 | REC-3 |
|---|---|---|---|
| QB | 72.29 / 0.7225 | identical (inherited) | ✓ ✓ |
| RB | 37.54 / 0.7968 | −1.12 MAE, +0.0011 ρ | ✓ ✓ |
| WR | 33.63 / 0.7634 | −0.42 MAE, +0.0104 ρ | ✓ ✓ |
| TE | 23.33 / 0.7987 | −0.40 MAE, +0.0067 ρ | ✓ ✓ |

**v6 CLEARS REC-3 at all four positions** and holds the program's best
committed cell everywhere. Multiple-shot honesty, stated in its prereg and
artifact: 2025 has now been read by three preregistered candidates in this
lineage (v4, v5, v6); each swap was licensed by the previous artifact's own
failure analysis, and the January 2027 grade is the first evaluation no
candidate has ever touched.

## 4. Against the FantasyPros bar — at the granularity the disk supports

Per-player FP comparison is **impossible from committed data**: the archive
experiment committed position-level summaries only, and api.fantasypros.com
is unreachable from this sandbox (probed 2026-08-16: no route; same for
api.sleeper.app). What the committed data honestly supports: FP's 2025
position cells vs the same baseline constructions on FP's own shared
population (n=57/88/141/83) beside ours (n=58/99/150/84). **Different
denominators — absolute MAEs are not comparable; margins vs the common
recency-blend anchor are the honest column,** and even those carry a
population caveat:

| pos | own_v6 margin vs blend | FP margin vs blend | remaining gap (margin terms) |
|---|---|---|---|
| QB | −1.80 MAE | −8.93 MAE | **~7.1 MAE** |
| RB | −4.32 MAE | −5.00 MAE | ~0.7 MAE |
| WR | −3.19 MAE | −3.81 MAE | ~0.6 MAE |
| TE | −0.71 MAE | −3.19 MAE | ~2.5 MAE |

Rank correlation, same caveat (v6 on ours / FP on theirs): QB 0.7225 vs
0.768; RB 0.7968 vs 0.7795; WR 0.7634 vs 0.7423; TE 0.7987 vs 0.7892 — at
RB/WR/TE the component model now *orders* players at least as well as FP
orders its own (different) population; pricing levels still trail.

**The honest headline for Cory:** the component data moved us from "6–9 MAE
behind FP everywhere" to "within ~0.6–0.7 MAE of FP's margin at RB and WR,
~2.5 at TE, still ~7 behind at QB." Three of four positions are now
competitive with the expert aggregate on committed evidence; QB is the
program's open problem.

## 5. The ceiling, discussed honestly

What beating an expert aggregate requires, position by position:

- **QB (the ~7-point gap).** FP's QB edge lives almost entirely in the
  drafted top tier (v3's autopsy: every committed model ranks the drafted-15
  at ρ ≤ 0.12) and in information no historical box score carries: camp
  reports, recovery timelines, coaching/scheme changes, declared starters.
  Rushing equity and per-game rate — now measurable — did NOT order that
  tier (v5's QB arm proved it on the season that mattered). The realistic
  next QB inputs are *forward-looking market data*: archived preseason ADP
  (the BBM machinery already in-repo reaches 2023-era archives), week-1
  lines (now committed, worth +0.22 fold MAE), and above all the provider
  archive now accumulating daily in `proj_series.json`.
- **RB/WR (0.6–0.7 margin-gap).** Within noise of FP's margin on these
  samples. Beating FP outright most plausibly comes from composition —
  own-model + market signals FP does not use (league-draft behavior, ADP
  momentum) — not from more box-score features.
- **TE (~2.5).** The thinnest position data-wise; FP's edge here is
  role/depth-chart knowledge (who actually starts). Depth-chart features
  exist on the live board but have no historical archive to backtest against
  — a named absence.
- **Structural caveats that cap ALL of these numbers:** the optimistic-side
  survivorship caveat applies to every cell equally (players projected but
  never fielded are excluded and counted); one held-out season is one
  sample; and 2025 has been read three times (§3).

## 6. Arm B — the composition candidate: named, not faked

Providers-as-features cannot be graded on ANY past season from committed
disk, and the receipts are in the v5 artifact's `arm_b_provider_history`
block: `proj_series.json` begins 2026-08-09 (13 snapshots, 2026 only,
Sleeper + FP); the FP-archive experiment committed summaries only (its
per-player rows were fetched under exp33's leak rules and deliberately not
committed); both provider APIs are unreachable from this sandbox. Building
an Arm B model with nothing to grade it on would be theater — none was
built. Its bar ("beat FP alone") first becomes measurable at the **January
2027 grade of the frozen 2026 proj_series**, which prices Sleeper, FP and
own_v6 on the same season, per-player, for the first time — and only that
grade can fit a composition weight on evidence. Until then the drafted board
for the 22nd stays Sleeper+FP, per REC-2, unchanged by anything here.

## 7. The prepared promotion diff (NOT applied — Cory's written decision)

v6 clears REC-3 and beats the promoted v4 at three positions with the QB arm
identical. Per the ratified rule this licenses a written promotion decision,
never an automatic flip. Nothing below is applied in this pass. The exact
diff acceptance would apply, v4's §7 shape:

**(a) `draft/data/model_update_recommendations.json` — REC-3's record:**

    recommendations[REC-3-own-model-stays-display-only]
      .promotion_bar.candidates += {
        "own_model_v5": <promotion_bar of model_accuracy_v5.json, verbatim —
                         clears: false, QB Spearman cell fails>,
        "own_model_v6": <promotion_bar of model_accuracy_v6.json, verbatim —
                         clears: true, all eight cells true>
      }
      .status: "applied-2026-08-16 (own_model_v4)"
        → "cleared-by-own_model_v6-2026-08-16 — awaiting Cory's written
           acceptance; own_v4 remains the live proj_ownmodel until then"
      .evidence += ["draft/backtest/model_accuracy_v5.json",
                    "draft/backtest/model_accuracy_v6.json",
                    "draft/audit/projection_program_2026-08-16.md"]

**(b) `draft/own_projections.py` — the algorithm behind `proj_ownmodel`:**
`compute_own_projections()` keeps its entire v4 pipeline (v2 fit → v3
ensemble/market → v4 QB correction) and adds the v5 component layer for the
RB/WR/TE arms: after `build_v4`, compute
`comp = own_model_v5.comp_opinion(season, (y2, y1), positions, ages,
implied)` and `proj = own_model_v6.build_v6(v4_pred,
own_model_v5.build_v5(v3_pred, comp, blend, corr, mrank, curve, positions),
positions)`. The `implied` argument reads
`fetch_component_stats.implied_team_totals(season, 1, 1)`; **deployment
prerequisites, named:** the vegas store must be refetched to carry the
deployment season's week-1 lines (the fetcher's SEASONS tuple extends by
one line) and the component store for y1 must exist (2025's is committed).
Until week-1 lines post, the vegas tilt degenerates to 1.0 by construction
— the no-lines arm is the pre-lines deployment shape, and the diagnostics
block must say which arm priced. Board label: `proj_ownmodel (own_v4)` →
`proj_ownmodel (own_v6)`.

**(c) What this diff deliberately does NOT do:** it does not put any own
model into `proj_mean`'s composition against Sleeper+FP. That remains
evidence-blocked until the January 2027 grade (REC-2) regardless of v6's
clear — same boundary v4's promotion respected.

**Caveats that travel with the decision:** 2025 read three times in this
lineage; the RB/WR/TE margins over v4 (−0.40..−1.12 MAE) rest on one
held-out season; the v5 fold margins at WR/TE ρ were themselves thin
(+0.0008/+0.0004); the vegas tilt uses last-season team assignment
(offseason movers mispriced — measured limitation, named in the prereg).

## 8. The staged path forward

**Now (this pass, done):** component + vegas stores committed with parity
pinned; v5/v6 graded; v6's promotion decision prepared for Cory; v4 stays
live until his word.

**This season (separate gated changes, not built here):** the in-season
WEEKLY projector is where betting features plug in first with the fastest
feedback — the Thursday player-projection cron already emits weekly
forecasts graded by the closed loop (arms `ours` and `sleeper`); a
Vegas-informed weekly arm (weekly implied totals from the same lines store,
which carries ALL weeks for in-season use) can run as a THIRD graded arm and
accumulate real grades week by week — Cory's "helps in-season" hypothesis
priced by the loop instead of argued. Player-level pace belongs in the same
weekly arm. Each is its own prereg.

**January 2027 (the grade everything waits on):** the frozen 2026
proj_series prices Sleeper, FP and the own model per-player on the same
season. That unlocks: REC-2's composition question with a real Sleeper
number; Arm B (providers as features) with its first gradeable season; the
first FP comparison on OUR population at per-player grain; and the first
evaluation of this program no candidate has ever read.

**Next season's data adds:** 2026 components → a THIRD tuning transition
(2024+2025→2026) and a fresh held-out season for v7; a second year of
provider snapshots; a full season of weekly-arm grades for the betting
features. The fetch script re-runs idempotently; extending SEASONS by one
line per year is the entire maintenance cost.

## 9. Suites and discipline

Prereg before results at every step — commit order: stores (6eee30ee) →
v5 prereg (cafd3092) → v5 artifact (10d65d01) → v6 prereg (647fcd62) → v6
artifact (329d3be6) → this doc. Leakage: predicting season Y consumed
nothing from Y (week-1 lines close before any Y game; the leak guard raises,
its fail arm is a test). No shipped file, engine CFG, or v2/v3/v4 file
modified; REC-3's record untouched. Both suites green before every commit
(pytest 2356→2371 passed as the pass grew; js-sweep 282 all green
throughout).

## 10. ADDENDUM (2026-08-17) — the v7 feature queue, with evidence attached

§8 named v7 only by its held-out season (2026 components → a third leak-free
transition). This addendum is where v7's CANDIDATE FEATURES queue with their
measured evidence, so "remember this for the next model" stops being a memory.
Nothing here is built; each entry is an ordered feature for the v7 prereg.

**v7-1 · EFFICIENCY-REGRESSION-TO-DECLINE (ordered from
`empirical_draft_value_2026-08-16.md` §8.1–8.2, n = 1,152 player-seasons
2023–25, FDR-surviving, three seasons same sign).** Prior-season efficiency
(points per opportunity) predicts the residual DECLINE above naive
carry-forward: WR **−0.284 [−0.368, −0.189]**, TE **−0.294 [−0.463, −0.094]**,
RB **−0.213 [−0.323, −0.061]**; while volume predicts the LEVEL about as well
as prior points and ~2× efficiency (opportunity/game ρ: WR 0.704 [0.629,
0.766], TE 0.712 [0.622, 0.782] vs efficiency 0.322 / 0.126-noise). **This is
NOT v5's xFP move** — v5 regresses a player's efficiency toward the league
mean inside the level estimate; v7-1 is a *signed negative term on prior
efficiency in the residual*: an efficient-on-modest-volume receiver is a worse
bet than his points say, an inefficient-on-heavy-volume one a better bet.
Independently corroborated by the all-seats replay diagnosis ("own_v6
overprices declining veterans" — DRAFT-WEEK-BRIEF.md, the note that first
named a v7 decline term).

**v7-2 · AVAILABILITY, AS A LEVEL INPUT ONLY (ordered from the same study's
Addition A, §15).** The ingredient exists — availability persists for
established players at RB 0.274 [0.132, 0.413], WR 0.243 [0.088, 0.385], TE
0.310 [0.122, 0.481], 3/3 seasons, and NOT at QB (0.215 [−0.050, 0.441]) —
and its ceiling is known in advance: a full-health counterfactual lifts
starter rates **+10.8 to +15.6pp in every round band**, a level effect, not a
late-round fix. So v7-2 is a weak per-player games-expected input at RB/WR/TE
only, replacing the hand-set positional `EXPECTED_GAMES` constants, and its
prereg must grade against exactly that measured level effect. Store
discipline: computed from the COMPONENT stores (the 2025 weekly-points store
drops zero-point rows — A's 2026-08-17 ruling routes all games/rate consumers
to components; `late_trajectory.py` already follows it).

Both entries wait on the v7 prereg and the January 2027 grade like everything
else in §8 — queued here so the evidence travels with the feature instead of
with whoever read the study.
