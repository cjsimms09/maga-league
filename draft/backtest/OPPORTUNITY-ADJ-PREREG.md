<!-- TERRITORY: A -->
# OPPORTUNITY-ADJ — PREREGISTRATION (fixed BEFORE any accuracy number exists)

_Written and committed before the grading runner (`opportunity_adj_grade.py`)
produced a single metric. Every arm, metric, population rule, control and
decision rule below is frozen here. A number in the eventual artifact that this
document did not license does not count. Precedents:
`draft/audit/edge_hunt_2026-08-16.md`,
`draft/audit/advanced_metrics_study_2026-08-16.md`,
`draft/backtest/EXP-FP-HIST-PROJ-PREREG.md`._

## 0. The thing being graded

`draft/projections.py:blend()` multiplies every projection by the opportunity
adjustment before anything downstream ever sees it:

    proj_mean = proj_baseline × (1 + opportunity_adj)
    opportunity_adj = clamp(±cap, (opportunity_z / 2) × cap),  cap = 0.15
    opportunity_z   = within-position z-score of
                        WR/TE: wopr = 1.5·target_share + 0.7·air_yards_share
                        RB:    opportunity_share × 10 + rz_share
                      built by `opportunity_metrics()` from nflfastR play-by-play
                      for seasons [Y−1, Y−2], recency weights [0.7, 0.3]

`proj_mean` is the sole input to `vorp.apply_vorp()`, which produces `vorp` →
ordering → tiers → dollars. On the live 2026 board this multiplier is worth up
to +44.98 points on a single top-5 projection.

**Prior validation, searched for before this document was written.** Repo-wide
search of `draft/audit/**`, `draft/audits/**`, `draft/backtest/**` on both this
branch and `claude/fantasy-football-research-926y6z`:

- `draft/audits/value_frameworks_2026-08-13.md` **characterises** it (359/576
  non-zero, median move 1.5 pts, p90 20.8, max 45.0; cap binds asymmetrically)
  and explicitly leaves *"is ±15% the right cap"* as an **open empirical
  question**. No grade.
- `draft/audit/rule12_result_2026-08-11.md` proves the **arithmetic**
  (`proj_mean = proj_baseline × (1 + opportunity_adj)`, 11/11 exact). Not skill.
- `draft/audit/engine_ablation_2026-08-16.md` has an `opportunity` arm and
  classifies it **EARNS** — but its own §6 states the delta is *"partly graded
  by the layer it removes — the delta is biased TOWARD keeping the layer"*
  (the season ruler scores with the opportunity-adjusted `proj_mean`), and its
  replay cell reads **"not period-computable (lookahead)"**.
- `model_accuracy_v2..v6.json` grade own_model arms. None touches this layer.

**So: no grade against realized points exists.** This document is that grade.

## 1. CONSTRUCTIBILITY GATE — established BEFORE any metric, and it is mixed

Checked first, as the brief required. Two halves, opposite answers:

**1a. The ADJUSTMENT is exactly reconstructible, leak-free. GATE PASSES.**
`opportunity_metrics()` is a pure function of an nflfastR play-by-play frame.
`play_by_play_{2021..2024}.parquet` are reachable from this environment
(nflverse releases; verified downloaded) and carry every column the function
reads (`season, posteam, pass_attempt, play_type, receiver_player_id,
air_yards, yardline_100, rusher_player_id`). Run on real 2022+2021 pbp the
shipped function returns 793 players with the documented field set. The
gsis→sleeper rekey uses `nfl_data_py.import_ids()` — **the identical call
`draft/build.py:_id_crosswalk()` makes** (6,162 pairs here). So for graded
season Y the adjustment is computed from pbp [Y−1, Y−2] only: **the shipped
code path, the shipped constants, no lookahead.** This contradicts
`engine_ablation_2026-08-16.md`'s "not period-computable (lookahead)" for this
layer — that verdict is about its *simulation* replay frame, not about the
projection layer, which is computable and is computed here.

**1b. The SHIPPED BASELINE is NOT reconstructible. GATE REFUSES.**
`proj_baseline` is Sleeper's preseason season-projection scored under our
table. **No Sleeper preseason projection was ever archived before 2026-08-09**
(`draft/data/proj_series.json` — first snapshot 2026-08-09; the point is made
in `model_learning_audit_2026-08-15.md` and REC-2). FantasyPros' historical
archive — the one authenticity-gated substitute, PASSED for all three years in
`exp_fp_hist_proj.json` — is **unreachable from this environment**
(`www.fantasypros.com` and `api.fantasypros.com` both return proxy 403; the
fetch is CI-only by design). No archived preseason ADP for 2023–25 exists on
disk either (`external_adp_series.json` is 6 rows, all 2026).

**Consequence, stated plainly and carried into every headline:** what follows
is **NOT a grade of the shipped `proj_baseline → proj_mean` step**. It is a
grade of the shipped *adjustment* applied to three reconstructed baselines. The
adjustment is the shipped code; the baseline is a reconstruction, and the
reconstruction is named on every number.

**The direction this biases.** All three reconstructed baselines carry *less*
usage information than a professional preseason projection does (a projection
source prices usage as most of its job). An adjustment that adds usage
information will therefore look **BETTER** here than it can be on the shipped
Sleeper baseline. **Every positive result below is an upper bound. A negative
result is not.** That asymmetry is the reason this study is still worth
running: it can refute, more strongly than it can confirm.

## 2. ARMS — frozen

Per graded season Y ∈ {2023, 2024, 2025}, per position ∈ {RB, WR, TE}, per
baseline B ∈ {naive_prev, recency_blend, market_curve}:

| arm | value |
|---|---|
| `base` | B |
| `adj` | B × (1 + a) — **the shipped transform**, a from `projections.blend`'s formula, byte-identical constants |
| `shuffled` | B × (1 + π(a)), π a uniform random permutation of `a` within (season, position) — Cory's brief's control |
| `rank_surrogate` | B × (1 + s), s = the same multiset of `a` values re-assigned in **descending baseline order** — i.e. the best-possible purely-baseline-rank-driven adjustment with the identical magnitude distribution |

`rank_surrogate` is added because it is the control the live board demands:
`rho(opportunity_z, proj_baseline)` is **+0.756 RB / +0.762 WR / +0.845 TE**
(MEASURED on `public/draft_data.json`). If the adjustment beats `base` but not
`rank_surrogate`, it is a convex re-scaling of the baseline wearing a usage
metric's clothes, and it carries no independent player information at all.

**QB, K and DEF are excluded and that is a finding, not a scoping choice.**
`composite_z()` computes a composite for WR/TE and RB only and `continue`s on
every other position, so `opportunity_adj` is **exactly 0.0000 on all 88 QB,
44 K and 32 DEF board rows (MEASURED)**. The layer is structurally a
RB/WR/TE-only multiplier.

## 3. POPULATION — frozen

- **Position** from `nfl_data_py.import_seasonal_rosters([Y])` — the position
  the player held **in season Y**, never the 2026 board's (no 2026
  survivorship in the position label).
- **Realized** = sum of `nflverse_weekly_points_{Y}.json` weeks **1–17**, the
  repo's standing `LAST_SCORED_WEEK`, scored under the frozen table.
- **Included** iff: position ∈ {RB,WR,TE} in Y, baseline value **> 0** under
  that arm's B, and **≥1 scored week row in Y**.
- **Survivorship, declared:** players with a baseline but no Y week row are
  excluded and counted. MAE is optimistic by an unmeasured amount — the same
  declaration `exp_fp_hist_proj.py` carries.
- **`opportunity_z` is computed ONCE per (Y, position)** over *every* player
  carrying opportunity metrics with a known position in Y — **not** over the
  graded subset, and never re-z-scored for a subset. This mirrors the board
  (which z-scores over its whole player list) and removes the degree of
  freedom of choosing the z population per arm.
- **Draftable subset**, reported separately: top-48 RB, top-48 WR, top-24 TE
  by that arm's `base`, the region a 10-team board actually drafts.

## 4. METRICS — ordering and error reported SEPARATELY and in that order

Per (Y, position, B):

1. **ORDERING — PRIMARY. Spearman rho(arm, realized).** Reported first,
   alone, and never pooled with an error metric. Today's start/sit study
   measured rank agreement of only rho=+0.20 between MAE and decision quality
   across ten arms; an adjustment that improves MAE while hurting ordering is
   actively bad for a draft board and a pooled score would hide it.
2. **MAE** and **bias** (mean signed arm − realized). Secondary.
3. **top-12 / top-24 / top-48 precision** — |top-K by arm ∩ top-K by realized|
   / K within position. A cell with graded n < K reports `n/a`.

**Δ is always (arm − base) on the identical player set.**

**CIs.** Paired bootstrap over players, **2,000 resamples**, seasons pooled as
blocks (resample players within (Y, position), recompute Δ, pool the three
seasons by graded-n weighting). 95% percentile interval. n=3 seasons is small
and every interval is reported with that caveat attached.

**Decision rule, frozen:** for a position and baseline, the adjustment
**HELPS** if the pooled 95% CI on Δrho excludes 0 above; **HURTS** if it
excludes 0 below; **NEUTRAL** otherwise. MAE never overrides ordering; a
split verdict is reported as split.

## 5. THE DIRECTION DECOMPOSITION (brief §3)

- **Shuffled control**: 200 permutations per (Y, position, B). Report mean
  Δrho_shuffled and the fraction of permutations with Δrho_shuffled ≥
  Δrho_actual (a one-sided permutation p).
- **Rank-surrogate control**: as §2. Report Δrho_actual − Δrho_surrogate.
- **Partial-rank test, baseline-free**: Spearman between (rank of
  `opportunity_z` residualised on rank of base) and (rank of realized
  residualised on rank of base), within (Y, position). This asks directly
  whether the usage signal knows anything about the residual the baseline
  leaves — with no dependence on the baseline's calibration, only its
  ordering.

## 6. THE CROSS-POSITION LEVEL EFFECT — measured, not graded

Because the layer is RB/WR/TE-only and its magnitude rises with baseline rank
(mean adj by baseline decile, MEASURED: RB +0.126 → −0.039), it moves value
*between* positions through `vorp.replacement_levels()`. Measured by rebuilding
VORP and dollars from a board copy with `proj_mean := proj_baseline`
(read-only; `draft/vorp.py` imported, never edited). Reported as a magnitude,
with **no** claim about whether the transfer is right — grading a cross-
position dollar allocation needs the money history, not this instrument.

## 7. WHAT THIS CAN NEVER ANSWER

- Whether the adjustment helps **on Sleeper's own preseason baseline**. That is
  structurally unmeasurable until January 2027 (REC-2, already armed).
- Whether ±0.15 is the right cap. This grades the shipped cap, not a sweep.
- Anything about QB, K or DEF, where the layer is identically zero.
- Three seasons. Where an effect sits inside its CI, the answer is "inside
  noise", written as such.

## 8. WHAT SHIPS

**Nothing.** No model, board, config or scoring change. A finding becomes a
`DECISIONS-NEEDED.md` item with the prepared diff described. Cory rules.
