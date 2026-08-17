<!-- TERRITORY: A -->
# THE DATA COMPLETENESS PLAN — 2026-08-17

**Cory:** *"give me a more thorough option that pulls in all data we can, retains
it and everything we could possibly need. Maintains that historical data doesn't
get mixed in with this years data. Rerun all things we need to that was lacking
data (any ceiling data would be corrupt, we were normalizing ceiling for
everyone of course it made no difference) are we getting all fantasy pros data
that we can? Are we sure it's all normalized your 6 point QB td, 0.5 ppr
league?"*

---

## 0. THE SCORING QUESTION, ANSWERED FIRST — MOSTLY YES, WITH ONE DELIBERATE NO

Config verified: `pass_td 6.0`, `rec 0.5`, `rec_yd 0.1`, `pass_yd 0.04`,
`pass_int -2.0`, 44 scoring keys.

| number | in our scoring? | how |
|---|---|---|
| `proj_mean` / `proj_baseline` | **YES** | Sleeper serves **stat lines**; `baseline_from_projections` scores them through `cfg["scoring"]`. We never take a provider's points. |
| `proj_fantasypros` | **YES** | same path — FP stat lines re-scored; `our_pts` on retained rows |
| `nflverse_weekly_points_*` | **YES** | `frozen_scoring_table()`, one fingerprint across all five seasons |
| **ADP** | **NO, AND CORRECTLY SO** | the feed is built on a **4-point passing TD** |
| `fp_fpts` (FP's printed number) | **NO** | FP's own scoring — retained for gates only, never graded |

**The ADP exception is deliberate and must stay.** ADP is not a projection, it is
a forecast of *what the room will do*, and the room drafts off the public
4-point-pass-TD market. Normalising it would make it a worse predictor of the
only thing it predicts. The scoring gap between "what ADP assumes" and "what we
pay" is exactly the QB arbitrage — measured at **+43.67** to a top-12 QB and
**+4.00 after replacement**, which is why it changes no pick.

**Residual risk, named:** normalisation only works on rows that carry a stat
line. Any row where a provider serves points-only cannot be re-scored, and
`grading_mode: points_only_rank_order` is the flag for it. FP's graded years ran
at `statline_coverage: 1.0`, so this is currently a non-issue — but it is the
thing to check on every future pull, not assume.

---

## 1. CORY'S CEILING POINT IS RIGHT, AND IT VOIDS A COMMITTED CONCLUSION

> *"any ceiling data would be corrupt, we were normalizing ceiling for everyone
> of course it made no difference"*

Exactly right, and the consequence is bigger than the field. `proj_ceiling` was
`mean + 1.036 × sd`, and once REC-1 made `sd` a per-**band** ratio, the ceiling
became `mean × (1 + 1.036 × band_ratio)` — a **monotone transform of the mean,
identical for every player in a cell.** It could not carry information about a
player *by construction*.

**So the measurement that zeroed the ceiling weight was measuring a field that
could not possibly have earned it.** `WEIGHT_PROVENANCE` records
`ceiling: 'UNMEASURED — collinear with value on the backtest board'` — the
collinearity was real, and it was a property of the *formula*, not a finding
about upside. **That conclusion is VOID and must be re-derived, not inherited.**

### The rerun list — every result that consumed a corrupt ceiling

| study / conclusion | consumed `proj_ceiling`? | status |
|---|---|---|
| `ceiling: 0.0` in `MEASURED_WEIGHTS` | **YES** | **VOID — rerun required** |
| engine.js bench-branch ranking (`proj_ceiling − proj_mean`) | **YES** | live, and ranking on a mean restatement |
| `exp_participation` all-terms test (which zeroed the weight) | **YES** | **VOID for the ceiling arm only** |
| barbell / `upside_class.js` | **NO** — reads calibration p50/p90 directly | **STANDS**; its header names the defect as the reason it avoided the field |
| `empirical_draft_value`, `tiered_outcome` | **NO** | stands |

**The barbell null is not confounded.** That agent found this bug independently
and routed around it, which is why "draft for upside late loses, ten arms for
ten" survives. What the corrupt field actually damaged: the ceiling column a
human reads, the bench branch, and the weight test.

---

## 2. WHAT WE ARE STILL NOT CAPTURING — the sweep, extended

### 2.1 Computed, consumed, and then discarded (the fifth instance today)

`projections.opportunity_metrics` documents a return of eight fields. Measured
on the live board:

    target_share      445 / 682 rows
    wopr              445 / 682
    opportunity_share 445 / 682
    rz_share            0 / 682   <- COMPUTED (line 181) and CONSUMED (line 209)
    snap_share          0 / 682
    air_yards_share     0 / 682
    adot                0 / 682
    xfp_delta           0 / 682

**`rz_share` is derived from play-by-play and feeds the opportunity composite,
and it reaches no artifact.** So nothing downstream can use it and no study can
grade it — which is precisely why `opportunity_inheritance` had to report
"red-zone vacancy is not measured at all". It *was* measured. It was not kept.

The other four are named in the contract and absent from the board. Either they
are not computed or they are dropped at attach; both are the same defect from a
consumer's seat.

### 2.2 Still bare floats

`adp_series.append_snapshot` stores `{pid: 1.33}`, 300 players. `proj_series`
was fixed this morning; **its sibling was not.** Same hole, still open.

### 2.3 Permanently lost

Pre-2026 `depth_chart_order`, `injury_status`, `sleeper_rank`. No fetch recovers
them; retroactive sources leak.

### 2.4 Gradeable ≠ available

Sleeper serves historical projections for 2023/2024/2025 and they are genuinely
per-season distinct (identical fraction 0.011). **Only 2025 clears the leak
gates** — the endpoint is the same live URL the app reads in week 12. That
verdict has been sitting in a CI log since 2026-08-16 because the run was
dispatched from a feature branch.

---

## 3. THE PLAN — pull everything, keep everything, keep the years apart

### Principle: RETENTION and GRADEABILITY are different decisions

This is the discipline the whole inventory was missing. We repeatedly declined to
*keep* data because it could not be *graded*. Those are not the same question. A
leaked year is still evidence about a source's behaviour, still useful for
coverage and vocabulary checks, and impossible to re-fetch later. **Keep it;
label it; refuse to grade it.**

### The separation Cory asked for, made structural

> *"Maintains that historical data doesn't get mixed in with this years data."*

Three mechanisms, two of which already exist and one of which is the gap:

1. **`season_stamp`** already classifies every board field as
   `2026 / current / <year>` and an unstamped field is a violation. Working; it
   caught the draft-capital column this morning.
2. **File-level separation** — historical pulls land in `*_hist_*` /
   `*_{season}.json` and never in the live board's own stores.
3. **THE GAP: a per-row `as_of` and `applies_to`.** A retained historical row
   needs both *when we fetched it* and *which season it describes*, because the
   leak question is exactly whether those two differ by more than they should. A
   2023 projection fetched in 2026 is not the same object as one frozen in 2023,
   and today only the filename says so.

### Phase 1 — stop the bleeding (hours, do first)

| # | action | why now |
|---|---|---|
| 1 | `adp_series` carries situation + `n_offered`, like `proj_series` | live state expires daily |
| 2 | Attach `rz_share`, `snap_share`, `air_yards_share`, `adot`, `xfp_delta` to the board | already computed; pure retention |
| 3 | Weekly roster-state snapshot (depth chart + injury) | makes `VAR_BACKUP`/`VAR_INJURED` measurable for 2027 |
| 4 | Stamp `as_of` + `applies_to` on every retained historical row | the separation Cory asked for |

### Phase 2 — pull what we have never pulled (days)

| # | action | unblocks |
|---|---|---|
| 5 | nflverse **snap counts** + **routes run**, 2021-25 | the biggest remaining gap; opportunity is what this league runs on |
| 6 | Fire `exp-fp-hist-proj` **from main** with retention on | the blend control arm; per-player FP rows, league-normalised |
| 7 | Fire `sleeper-hist-proj` **from main** so the verdict commits | recovers an answer already computed twice |
| 8 | FP `rank_min`/`rank_max`/`rank_std` | a free **per-player** uncertainty signal — the thing §1 proved we lack |

### Phase 3 — rerun what a corrupt ceiling contaminated (after phases 1-2)

| # | action |
|---|---|
| 9 | Re-derive the `ceiling` weight against a ceiling that can actually carry information (measured p90 × per-player spread) — the current 0.0 is void |
| 10 | Re-fit the variance modifiers with pooled seasons and a regression rather than cell splits (the fit was underpowered at 2 cells, not refuted) |
| 11 | Re-run the blend study now that a control arm exists |

**Phase 3 cannot precede phase 2**, and none of it precedes the draft. Every
phase-3 item is a *model* change, and the standing verdict — trust the decision
logic, distrust the projection inputs — is unchanged by any of it.

---

## 4. WHAT THIS DOES NOT FIX, STATED PLAINLY

The room's own draft order already captures **82-87% of perfect hindsight**, and
the entire remaining prize is **14.2 pts/team/week**. Better data raises the
ceiling on how much of that 14.2 we can take; it does not make the pot bigger. A
complete data pipeline is worth building because the alternative is being unable
to answer questions at all — which is the actual cost we have been paying, four
times over, in refused studies.
