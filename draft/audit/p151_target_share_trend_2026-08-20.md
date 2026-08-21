# P151 graded — Cory's own target-share-trend signal does not clear 1.5x, and the direction is negative in 3 of 3 gradable seasons

**Session D, 2026-08-20.** Grades PREDICTION-LEDGER.md P151, filed blind with
`CEILING-PROGRAM-PREREG-2026-08-20.md` §4: *among WR/TE with ≥30 targets in
season Y, the top quintile of late-season target-share trend (Δ = share weeks
10-17 − weeks 1-9) booms in season Y+1 at ≥1.5× the 10% base rate*, LOSO across
2021→22 … 2024→25. Tooling: `draft/backtest/p151_target_share_trend.py` (new),
tests: `draft/tests/test_p151_target_share_trend.py` (17/17 pass), full
machine-readable output: `draft/backtest/p151_target_share_trend.json`.

**Headline: the pooled lift is 0.53×, not ≥1.5×, and the top-quintile group
under-performed the rest of the eligible pool in EVERY ONE of the 3 gradable
year-pairs — not just failed to beat it.** This is a real finding about a
popular heuristic, filed exactly as loudly as the prereg said a sub-1.5×
result should be (§4, last line).

---

## 1. Data sources actually used, and their real shape (verified, not assumed)

| what | file(s) | verified shape |
|---|---|---|
| target share | `draft/backtest/component_stats_2021-2025.json` | `{weeks:[{week, players:{pid:{tgt, team, pos, tgt_share, ...}}}]}`. The store's own precomputed `tgt_share` field already sums to ~1.000 across a team's players in a given week (checked directly, 2022 wk1: LV 0.9999996, TEN 1.0000, JAX 1.0000, …). **We do NOT reuse that field directly** — we re-derive share as `sum(player tgt)/sum(team tgt)` over each 9/8-week half, because averaging the store's per-week ratios is sensitive to bye/inactive weeks in a way summed counts are not. `test_tgt_share_sums_to_one_per_team_week_raw_counts` pins the two constructions agree within 0.01 wherever both are defined. |
| draft pick number / historical ADP | `draft/data/league_history.json` (this league's own 150-pick drafts) | **Only seasons 2023, 2024, 2025 have a complete draft on disk** (`[s['season'] for s in seasons] == ['2026','2025','2024','2023']`) — 2021/2022 do not exist in the file at all. Cross-checked `draft/backtest/external_adp_historical.json` (FFC/FantasyPros): also 2023-2026 only. **No fantasy draft-pick or ADP data for 2021 or 2022 exists anywhere in this repo.** Pinned by `test_league_history_has_no_2021_or_2022_draft` and `test_external_adp_historical_also_starts_at_2023`. |
| realized season points | reused unmodified via `empirical_draft_value.season_totals()` (Rule 11) | 2023-2025 from the committed `nflverse_weekly_points_*.json` stores; 2021/2022 scored from `component_stats_*` under `frozen_table()` (`fetch_component_stats.frozen_scoring_table()` / `scored_weekly_points()`) — the exact construction `draft_replay_2025` already uses for 2021/2022 parity. |
| positions | `draft/data/player_positions.json` (reused via `EDV.positions_record()`) | one current position per pid, the same source every existing q1-q6 study in `empirical_draft_value.py` uses. |

**Consequence of the missing 2021/2022 pick data: the LOO pick-curve
expectation, and therefore the boom label, can only be computed for Y+1 in
{2023, 2024, 2025}. The 2021→22 pair is UNGRADABLE and is reported as such**
(`test_2021_to_22_pair_is_explicitly_ungradable`) — not silently dropped, not
faked with an interpolated curve. **3 of the 4 preregistered pairs are
gradable: 2022→23, 2023→24, 2024→25.**

**One methodology substitution, stated plainly:** the prereg's boom definition
calls for "an expected-points-vs-draft-pick-number curve per position." A raw
per-pick-number regression is too thin at this league's scale (150 picks / 4
positions / 15 rounds ≈ 2.5 players per position-round-season). We fit the LOO
expectation at the **round-band** granularity `empirical_draft_value.py`
already uses for its own Q2/Q3 hit-bust study (`ROUND_BANDS = 1-3, 4-6, 7-10,
11-15`) — same granularity the existing shipped hit/bust grading in this repo
already accepts, split additionally by position (the existing
`_loo_round_expectation` pools all four positions together in a round, which
is the wrong grain for "per position"; the new `loo_round_band_expectation`
is this module's one genuinely new piece of machinery).

## 2. Known-positive control — did NOT clear "above chance" as literally stated, but the join is independently verified sound

**Literal control (prereg §2's exact instrument check): 2024 breakout WRs
(top-decile residual, WR only) must show positive Δshare in 2023 at
above-chance rate.**

- 6 WRs boomed at WR in 2024 by our own machinery: Brian Thomas Jr, Ja'Marr
  Chase, Jaxon Smith-Njigba, Courtland Sutton, Jameson Williams, Terry
  McLaurin (names resolved by pid against `public/draft_data.json` +
  `nflverse_draft_picks.json` for sanity-checking, not used in the grade
  itself).
- Brian Thomas Jr has no 2023 delta-share (rookie, no 2023 NFL row) — correctly
  excluded, not zeroed. **n = 5 checkable.**
- **2 of 5 (40%) had positive Δshare in 2023 — below chance, not above.**
  Binomial two-sided p = 1.0 vs 0.5 (n=5 has essentially no power to reject
  anything).

**Rule 3f — the control needs its OWN control.** A control that fails once,
at n=5, could mean the join is broken (Rule 3e's stated concern) or could mean
n=5 has no power to say anything at all. We tested which:

1. **Join-health, verified independently of the control's own arithmetic.**
   The 6 names above are real, well-known, correctly-positioned 2024 WR
   breakouts, each with sane points/pick/expected-value numbers (e.g. Chase:
   318.9 realized pts vs 183.1 expected off his own pick 6, residual +135.8;
   Brian Thomas Jr: 226.7 pts, drafted pick 107, residual +138.5). Wrong pids,
   wrong seasons, or a broken crosswalk would not by coincidence produce
   correctly-named, sensible players at correct picks — **the join is not
   broken.**
2. **Power check on the literal n=5 control.** We shuffled the
   pid↔2023-Δshare mapping 1,000× (same value distribution, identity
   destroyed — a stand-in for "the join actually is broken") and recomputed
   the positive rate each time. Mean corrupted-join rate: **53.8%** (correctly
   lands near chance, confirming the shuffle mechanism itself works —
   `test_known_positive_control_shuffle_lands_near_chance`). But **85.4% of
   the 1,000 corrupted-join replicates matched or exceeded the real 40% rate**
   — meaning at n=5, a genuinely broken join and a genuinely working join are
   statistically indistinguishable here. **The literal control is
   underpowered, not failing.**
3. **A well-powered supplementary version of the same instrument**, pooling
   WR+TE breakouts (not WR-only) across all 3 gradable boom seasons —
   2023←2022, 2024←2023, 2025←2024 — for n=21 instead of n=5:

   | boom season | breakout WR/TE (n) | checked (has prior-yr Δshare) | positive Δshare | rate |
   |---|---|---|---|---|
   | 2023 | 8 | 8 | 4 | 50.0% |
   | 2024 | 8 | 6 | 3 | 50.0% |
   | 2025 | 8 | 7 | 4 | 57.1% |
   | **pooled** | 24 | **21** | **11** | **52.4%** |

   Consistently at chance across all three seasons, not scattered — this
   reads as a stable measurement, not noise, and it does **not** support
   "above-chance positive Δshare precedes a boom."

**Verdict: the join mechanics are sound (independently verified), but the
control's own substantive premise — that breakouts were visibly trending up
in target share the prior year — does not hold at above-chance rate even with
real power behind it (52.4% ≈ chance, pooled n=21).** We proceeded to the
full LOSO grade because the pipeline is verified intact, not because the
control passed; this caveat is carried forward into the result below rather
than buried.

## 3. Full LOSO grade — lift vs 10%, all 4 pairs, distributions not just a ratio

| pair | status | eligible Δshare pop. (WR/TE, ≥30 tgt) | quintile cutoff Δ | top-Q drafted in Y+1 (n) | top-Q booms | top-Q rate | rest-pool rate | **lift vs 10%** |
|---|---|---|---|---|---|---|---|---|
| 2021→22 | **UNGRADABLE** — no 2022 pick data | — | — | — | — | — | — | — |
| 2022→23 | graded | 147 | 0.0360 | 10 | 1 | 10.0% | 15.6% (n=45) | **1.00×** |
| 2023→24 | graded | 152 | 0.0423 | 12 | 0 | 0.0% | 13.0% (n=46) | **0.00×** |
| 2024→25 | graded | 153 | 0.0496 | 16 | 1 | 6.25% | 15.4% (n=39) | **0.625×** |
| **pooled (3 pairs)** | | | | **38** | **2** | **5.26%** | **14.6% (n=130)** | **0.53×** |

**Rule 3i — the distribution, not just the headline ratio:**
- In **all three gradable pairs**, the top-quintile trend group's boom rate
  is BELOW the rest of the eligible pool's boom rate (10.0% vs 15.6%; 0.0% vs
  13.0%; 6.25% vs 15.4%). This is directionally consistent, not a single
  pair's fluke.
- Attrition is large and worth naming: of the ~30-31 players in each season's
  top quintile, only 10-16 (32-52%) were drafted in this 10-team league the
  following season at all — the majority of "trending" WR/TE either weren't
  rostered highly enough to be drafted, or moved to a role that dropped them
  off this league's 150-pick board. The boom grade can only be computed for
  the drafted subset; this is a real, stated coverage limitation, not hidden.
- Top-quintile Δshare values themselves range widely within each season (e.g.
  2024→25: 0.050 to 0.248) — the group is not a tight cluster near the cutoff,
  so the null result isn't an artifact of a razor-thin quintile line.
- Position mix inside the top quintile is stable across pairs (roughly
  70%/30% WR/TE each year: 22/8, 19/12, 22/9).
- **Pooled shuffled-label null on the 38-player pooled top-quintile group**
  (5,000 stratified-by-pair reps, drawing the same per-pair group sizes at
  random from each pair's own gradable pool): null mean rate 12.4%, and the
  **observed 5.26% sits at the ~9.8th percentile of the null distribution**
  (one-sided p ≈ 0.098 for "as low or lower") — suggestive of the same
  negative direction seen in every individual pair, short of conventional
  significance at this sample size.

## 4. Shuffled-label null, per pair (the prereg's own required gate)

| pair | reps | null mean rate | empirical p(null ≥ observed top-Q rate) |
|---|---|---|---|
| 2022→23 | 2,000 | 14.4% | 0.826 |
| 2023→24 | 2,000 | 10.1% | 1.000 |
| 2024→25 | 2,000 | 12.7% | 0.930 |
| pooled (stratified) | 5,000 | 12.4% | 0.902 (i.e. p≈0.098 one-sided low) |

None of the individual-pair top-quintile rates are distinguishable from a
randomly-labeled subset of the same size at conventional significance — the
result is a genuine null (no detectable lift), not a small-sample fluke that
happens to look negative; the pooled check gets closest to a real signal and
still falls short of 0.05.

## 5. Correlation gate — not a costume

The prereg's "Draft Sharks band" / `proj_mean` correlation check could not be
run as literally specified: **no historical per-season `proj_mean` or
`proj_ceiling`/`proj_floor` snapshot exists for 2021-2025 anywhere in this
repo** — every `draft/baseline/*.json` and `public/draft_data.json` on disk is
a 2026-only board build. The closest available valuation proxy with real
per-player, per-season coverage is the player's own draft pick number the
FOLLOWING season (negated so "earlier pick" reads as "higher value," matching
the sign convention `proj_mean` would carry).

**Spearman ρ(Δshare(Y), −pick_no(Y+1)) = −0.034, n = 168 (pooled over the 3
gradable pairs).** Well under the 0.9 "costume" threshold — in fact
essentially zero, meaning Δshare is not simply restating next year's market
valuation. This is not "the signal is secretly proj_mean in disguise"; if
anything the near-zero correlation plus the null LOSO result together say the
feature carries little information about next year's outcome under either
lens.

## 6. Does it clear ≥1.5×? No — stated plainly

**Pooled lift is 0.53×, well below the 1.5× bar, and the direction is
negative rather than merely flat in all 3 gradable pairs.** Per the prereg's
own framing (§4, last sentence): *"if it grades below 1.5× lift, that is a
real finding about a popular heuristic and it is filed exactly as loudly."*
This is that filing. Cory named this signal himself as one of five
ceiling candidates (CEILING-PROGRAM-PREREG §0); on the data available, "a
player whose target share was already trending up late last year" is not a
reliable predictor of next year's season-level breakout in this measurement
— if anything it points the other way, though not at a level that clears
statistical significance on its own.

## 7. Files created, tests

- **New tool:** `draft/backtest/p151_target_share_trend.py` (TERRITORY: D) —
  `delta_share`, `loo_round_band_expectation`, `boom_labels`,
  `known_positive_control`, `grade_pair`, `pooled_grade`, `correlation_gate`,
  `main`.
- **New test file:** `draft/tests/test_p151_target_share_trend.py`
  (TERRITORY: D) — **17/17 pass** (`python3 -m pytest
  draft/tests/test_p151_target_share_trend.py -q`), pytest style with real
  `def test_*` functions per this repo's convention. Pins: the tgt_share
  re-derivation against the store's own field, the 2021/2022 data-gap claim
  against the actual files, WR/TE-only + ≥30-target eligibility, the LOSO
  leakage guard (`target_season not in fit_seasons`), the ~10%
  by-construction boom base rate, the 2021→22 UNGRADABLE status, the known-
  positive control's shuffle landing near chance, and the exact binomial
  p-values.
- **Output data:** `draft/backtest/p151_target_share_trend.json` — full
  machine-readable result (all 4 pairs including the ungradable one, pooled
  grade, correlation gate, known-positive control with its power
  demonstration).
- **This report:** `draft/audit/p151_target_share_trend_2026-08-20.md`.

**Not touched, per task scope:** `PREDICTION-LEDGER.md`, `DEFECT-REGISTER.md`,
`ROUTES.md`, `draft/data/register_id_watermark.json` — the calling session
hand-merges P151's row (status **GRADED**, result **FALSE — pooled lift 0.53×
vs the ≥1.5× bar, negative direction in 3/3 gradable pairs, 2021→22
ungradable for missing pick data**) and any register/routing follow-up from
here.
