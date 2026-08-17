# TERRITORY: A
# Rebuild-refusal diagnosis — run 31926152660 (draft-data.yml, relay ref, 2026-08-16T04:18Z)

**Question put to this diagnosis:** the nightly publication gate refused the
04:16Z candidate board, and the in-run diagnosis printed a replacement-
sensitivity "move" of +3.78 against "the pinned expectation is a STEP DOWN
< -5.0". Is the +3.78 correct arithmetic under the board's flex dynamics
(arm a — the pin is stale), or does the allocation code have a real defect
(arm b — fix the code, keep the pin)?

**Answer: arm (a), with one correction to the question's premise.** The
+3.78 is correct arithmetic — the smooth arm of a step function whose
boundary this board holds by 0.0036 projection points at the +2% probe
coordinate — and the stale pin was NOT in the characterization test (that
was re-derived to a scan on 2026-08-15, commit `b0455ee2`, and **PASSED in
this very run**). The stale pin survived in the diagnosis tool's message
(`draft/tools/diagnose_refused_board.py:90-92`), which still described the
retired +2%-coordinate expectation and thereby misnamed the sensitivity
probe as the blocker. The run's actual refusals were sixteen
artifact-parity / field-purpose failures (list below), none of them the
sensitivity test.

---

## 1. The CI evidence, verbatim

From the run log (job 95113946059), the diagnosis step:

```
== DIAGNOSIS: board built_at 2026-08-16T04:16:22Z, 677 players ==

-- dormant(): status=measured n=0 health=99.7% of market-priced rows carry a projection (floor 50%)
  Tom Brady          ABSENT from the board (pruned upstream — fine)
  [... all eight retirees ABSENT — pruned upstream ...]

-- replacement sensitivity (the characterization test's own probe):
   base RB replacement:   189.02   (allocation: {'starter_counts': {'RB': 21, 'WR': 29, 'TE': 10, 'QB': 10, 'DEF': 10, 'K': 10}, 'flex_slots_allocated': 10, 'replacement_points': {'RB': 189.02, 'WR': 173.22, 'TE': 151.95, 'QB': 341.72, 'DEF': 99.0, 'K': 97.0}})
   +2%-RB replacement:    192.80040000000002   (allocation: {'starter_counts': {'RB': 21, 'WR': 29, 'TE': 10, 'QB': 10, 'DEF': 10, 'K': 10}, 'flex_slots_allocated': 10, 'replacement_points': {'RB': 192.8, 'WR': 173.22, 'TE': 151.95, 'QB': 341.72, 'DEF': 99.0, 'K': 97.0}})
   move: +3.78   (the pinned expectation is a STEP DOWN < -5.0; + means the flex allocation behaved differently on this board)
```

The gate's own tally, same log:

```
16 failed, 2363 passed, 7 skipped in 80.99s (0:01:20)
*** REFUSING TO PUBLISH: the freshly built board fails the suite.
```

And the failing-test list the workflow itself posted to the tracking issue
(github.com/cjsimms09/maga-league/issues/5, created by this run at
2026-08-16T04:18:32Z — 14 unique names parsed by the issue step's grep from
16 failed test nodes):

```
draft/tests/test_board_purpose.py::test_EVERY_FIELD_ON_THE_LIVE_BOARD_HAS_A_DECLARED_PURPOSE
draft/tests/test_board_purpose.py::test_NO_EXPERIMENT_OUTPUT_REACHES_A_LIVE_ROW
draft/tests/test_board_purpose.py::test_the_detector_FIRES_on_a_field_nobody_declared
draft/tests/test_model_accuracy_backtest.py::test_the_COMMITTED_artifact_matches_regeneration
draft/tests/test_own_model_v2.py::test_artifact_matches_regeneration_and_names_what_is_missing
draft/tests/test_own_model_v3.py::test_artifact_matches_regeneration_and_reproduces_v2_baselines
draft/tests/test_own_model_v4.py::test_artifact_matches_regeneration_and_reproduces_v3_bit_for_bit
draft/tests/test_own_model_v5.py::test_artifact_matches_regeneration_and_reproduces_v4_bit_for_bit
draft/tests/test_own_model_v6.py::test_artifact_matches_regeneration_and_reproduces_both_parents
draft/tests/test_own_projections_v6_live.py::test_committed_board_carries_the_promoted_numbers
draft/tests/test_season_stamp.py::test_EVERY_BOARD_FIELD_HAS_A_PURPOSE_and_an_unknown_one_is_a_violation
draft/tests/test_season_stamp.py::test_EVERY_BOARD_FIELD_IS_CLASSIFIED_and_an_unknown_one_is_a_violation
draft/tests/test_season_stamp.py::test_the_LIVE_BOARD_carries_NO_experiment_data
draft/tests/test_source_weight_prior.py::test_artifact_equals_regeneration
```

**`test_replacement_sensitivity.py` is not on the list.** It is among the
2,363 that passed. The sensitivity story in the diagnosis output was the
tool's own unconditional probe printing a message written for the retired
pin — a misdiagnosis riding along with a genuine refusal.

## 2. The arithmetic (reproduced offline; delta to the candidate: none measurable)

The refused candidate (built 04:16:22Z) is downloadable only in CI. The
committed board (`public/draft_data.json`, built 2026-08-15T17:52:22Z, also
677 players) reproduces every number the CI diagnosis quoted **exactly** —
base RB replacement 189.02, +2% probe 192.8004, move +3.78, allocation
{RB 21, WR 29, TE 10, QB 10, DEF 10, K 10}, flex 10, and the full
replacement_points vector {RB 189.02, WR 173.22, TE 151.95, QB 341.72,
DEF 99.0, K 97.0} — so on the quantity under diagnosis the two boards are
twins and the delta is zero at the published precision. (They are not
byte-identical: the same tool run locally reports dormant() projection
health 99.4% vs CI's 99.7% — overnight fetch drift in rows unrelated to
the RB/WR replacement neighborhood; both measure dormant n=0.)

On this board (players ranked by proj_mean):

```
RB21 = 189.02   RB22 = 169.82   WR29 = 173.22   WR30 = 173.16
```

Base allocation: 10 flex slots split RB+1 / WR+9 / TE+0 → 21 RB starters,
so replacement = RB21 = 189.02. The marginal (10th) flex slot is held by
WR29 = 173.22; RB's next man up is RB22 = 169.82.

**The +2% probe (the smooth arm CI measured):**

```
RB22 x 1.02 = 173.2164  <  WR29 = 173.2200      (margin 0.0036 points)
```

WR keeps the marginal slot, the allocation holds at 21, and replacement is
the SAME player scaled:

```
move = RB21 x 1.02 - RB21 = 189.02 x 0.02 = +3.7804  ≈  +3.78  ✓ (CI's number)
```

The boundary's break-even scale is WR29/RB22 − 1 = **+2.0021%**. The old
probe coordinate (+2%) missed the flip by 0.0021 percentage points —
0.0036 projection points — on this board. That is the knife edge the
2026-08-15 re-derivation predicted when it retired the coordinate pin.

**The flip (the step arm, at the test's next scan point +2.5%):**

```
RB22 x 1.025 = 174.0655  >  WR29 = 173.2200     → RB takes the slot, 21 → 22
step = RB22 x 1.025 - RB21 x 1.020 = 174.0655 - 192.8004 = -18.7349 ≈ -18.73
```

Derived form: step = −gap × (1+pct) + smooth_increment
= −19.20 × 1.025 + 0.945 = −18.73, where gap = RB21−RB22 = 19.20 and
smooth_increment = RB21 × 0.005 = 0.945. Direction DOWN because the
inter-player gap dwarfs one increment of smooth drift; discontinuous for
the same reason. **All three characterized properties hold; the test passes;
the sign did not flip and the allocation code has no defect** — the greedy
allocation is behaving exactly as characterized. Arm (b) is excluded.

## 3. Where the stale pin actually lived, and when it broke

- **2026-08-14** (`f9fbec1d`): the finding pinned at its coordinate — "+2%
  flips a slot and steps −15.8". True of that day's board only.
- **Run 31897110098** (first fresh CI board): +2% did NOT flip; the
  coordinate pin refused a correct board. **This is when the pin broke.**
- **2026-08-15** (`b0455ee2`): test re-derived to scan +0.5%..+10% and
  assert the properties. Correct — but the diagnosis tool's message was
  not updated, and the test kept one residual hardcode (`step < -5.0`, the
  08-14 board's gap wearing a tolerance).
- **2026-08-16, run 31926152660**: the re-derived test PASSED on the fresh
  candidate while the tool's stale message reported the smooth arm as a
  violated expectation — turning a correct measurement into a false lead
  during a real refusal.

## 4. What changed (this commit)

1. **`draft/tools/diagnose_refused_board.py`** — the sensitivity section
   now runs the same scan as the test and **names the arm it took**:
   SMOOTH (allocation held; move = base × pct by construction, printed with
   its derivation and the boundary check) or STEP (flip located; measured
   step printed against the allocation-derived step), ending with an
   explicit verdict on whether the characterization test's properties hold
   on the board being diagnosed. Docstring corrected (the "two failures
   still blocking" framing is now dated history).
2. **`draft/tests/test_replacement_sensitivity.py`** — the residual
   `step < -5.0` hardcode replaced by the derivation from the allocation:
   the test now asserts rep-before and rep-at-flip each equal the
   count-th-ranked player scaled, that the measured step equals
   −gap × (1+pct) + smooth_increment, that the sign follows from
   gap × (1+pct) > smooth_increment (both sides measured on the present
   board), and that the step exceeds one whole smooth increment
   (discontinuity). A new test pins the OTHER arm — every scan point below
   the flip must move by exactly base × pct — which is precisely the
   arithmetic run 31926152660 measured at +2%.
3. **`.github/workflows/draft-data.yml`** — comment-only: the diagnose and
   preserve steps no longer describe the two historic blockers as current.

## 5. Honest status of the #1 pre-draft demand

This fix removes the misdiagnosis and the last stale pin of the
step-down expectation. It does **not** by itself make the rebuild publish:
run 31926152660's gate refused on the sixteen artifact-parity /
field-purpose failures listed above (visible failure mode in the log:
committed artifacts pin fetch-date-sensitive values — e.g.
`test_source_weight_prior` diffing `snapshot_dates` 2026-08-15 committed vs
2026-08-16 regenerated, and TE `median_gap` 11.78 vs 12.33 — so a nightly
run on any later day fails parity against the committed artifact). Those
are a separate, structural concern routed to A via ROUTES.md; the refire
of draft-data.yml after this merge will confirm the sensitivity/dormant
lanes stay clean and will show exactly what still stands between the gate
and a publish.

---

## 6. THE SIXTEEN, CLASSIFIED — and the gate rebuilt so it refuses BAD boards, not NEW ones (2026-08-16, second pass)

The structural concern §5 routed is now diagnosed and fixed. The full job
log (job 95113946059, retrieved via the GitHub API — the short summary the
issue grep parsed hides the assertion bodies) shows the 16 failures are
**not one failure mode but three**, and only one of them is the
by-construction date problem:

**(i) Seven `committed-artifact == regeneration` pins failed because THIS
RUN's earlier steps rewrote the regeneration's own inputs.** The graded
model modules regenerate from the tree: `own_model_v2.run()` reads
`public/draft_data.json` (ages crosswalk) and
`draft/data/player_positions.json`; `source_weight_prior.build_artifact()`
reads `draft/data/proj_series.json` + `player_positions.json`. The workflow
rebuilds all three before the gate runs, so regeneration moves with the
fresh board (log: v2 WR cell n 151→150, mae 33.87→34.08; source_weight_prior
`snapshot_dates` 2026-08-15→2026-08-16, TE `median_gap` 11.78→12.33) and the
committed artifact — correct yesterday, regenerated from yesterday's inputs
— mismatches BY CONSTRUCTION. These say the board is NEW, never that it is
BAD.

**(ii) Eight field-purpose failures were the gate WORKING.** All five
`test_board_purpose` nodes and all three `test_season_stamp` nodes failed on
one fact: the fresh board carries **`proj_sd_source`** (written
unconditionally by `draft/projections.py:310` since REC-1 landed,
`bb1d115a`, 2026-08-15T19:47Z) and `season_stamp`'s BOARD_FIELD_SOURCES /
BOARD_FIELD_PURPOSE maps do not declare it. The committed board predates the
wiring by two hours (built 17:52Z), which is the only reason these pass
locally. This is the `adp_sd_source` incident (2026-08-14) happening again,
and refusing it is the gate's exact purpose — nothing here gets excluded.

**(iii) One test refused every fresh board for reading the wrong provenance
HOME.** `test_committed_board_carries_the_promoted_numbers` asserted
`provenance.own_model.algorithm == "own_v6"` — but that top-level key exists
only because the v6 promotion (`ac40e383`) hand-stamped the committed
artifact; `build.py` writes the own-model diag at
`provenance.projections.own_model` (build.py:661 → :1533). So the CI
candidate failed with `{} == 'own_v6'` while genuinely carrying v6 under the
other key. (`ui_fidelity_own_model_label.test.js` already encodes this
dual-home fact for the JS surfaces.)

### The classification, one line each (16 nodes; C=gate keeps, P=gate excludes)

| # | node | class | why |
|---|------|-------|-----|
| 1 | test_board_purpose::test_the_detector_FIRES_on_a_field_nobody_declared | **SOUNDNESS-kept** | failed because the fresh board's row 0 really carries undeclared `proj_sd_source` — detector working, board unsound |
| 2 | test_board_purpose::test_EVERY_FIELD_ON_THE_LIVE_BOARD_HAS_A_DECLARED_PURPOSE[players] | **SOUNDNESS-kept** | 677 rows carry an unpurposed field; the adp_sd_source failure mode this test exists for |
| 3 | test_board_purpose::test_EVERY_FIELD_ON_THE_LIVE_BOARD_HAS_A_DECLARED_PURPOSE[kept_players] | **SOUNDNESS-kept** | same field on the 3 keeper rows — the shape the map originally missed |
| 4 | test_board_purpose::test_NO_EXPERIMENT_OUTPUT_REACHES_A_LIVE_ROW[players] | **SOUNDNESS-kept** | unmapped defaults to `experiment` BY DESIGN; a live surface may not act on an unvouched field |
| 5 | test_board_purpose::test_NO_EXPERIMENT_OUTPUT_REACHES_A_LIVE_ROW[kept_players] | **SOUNDNESS-kept** | same rule on the rows whose keeper cost decides which picks exist |
| 6 | test_season_stamp::test_EVERY_BOARD_FIELD_IS_CLASSIFIED_and_an_unknown_one_is_a_violation | **SOUNDNESS-kept** | season-provenance map has the same hole; the plant assertion surfaced the real undeclared field |
| 7 | test_season_stamp::test_EVERY_BOARD_FIELD_HAS_A_PURPOSE_and_an_unknown_one_is_a_violation | **SOUNDNESS-kept** | purpose map, scanned to the last row — found the same real field |
| 8 | test_season_stamp::test_the_LIVE_BOARD_carries_NO_experiment_data | **SOUNDNESS-kept** | unmapped-as-experiment fired on a genuinely unmapped field on the shipped shape |
| 9 | test_model_accuracy_backtest::test_the_COMMITTED_artifact_matches_regeneration | **PARITY-excluded** | `grade()` regenerates via the just-rebuilt board's crosswalk (WR n 151→150) — refuses NEW, not BAD |
| 10 | test_own_model_v2::test_artifact_matches_regeneration_and_names_what_is_missing | **PARITY-excluded** | `run()` reads board_ages() off the fresh board; committed artifact pinned yesterday's |
| 11 | test_own_model_v3::test_artifact_matches_regeneration_and_reproduces_v2_baselines | **PARITY-excluded** | same inputs one lineage up — inherits v2's drift bit for bit |
| 12 | test_own_model_v4::test_artifact_matches_regeneration_and_reproduces_v3_bit_for_bit | **PARITY-excluded** | same again; the bit-for-bit protocol identity makes any input drift total |
| 13 | test_own_model_v5::test_artifact_matches_regeneration_and_reproduces_v4_bit_for_bit | **PARITY-excluded** | same again |
| 14 | test_own_model_v6::test_artifact_matches_regeneration_and_reproduces_both_parents | **PARITY-excluded** | same again, against both parents |
| 15 | test_source_weight_prior::test_artifact_equals_regeneration | **PARITY-excluded** | regenerates from proj_series.json whose `snapshot_dates` the run just advanced; the VERDICT stays gate-checked by the unmarked `test_shipped_verdict_is_the_honest_negative` |
| 16 | test_own_projections_v6_live::test_committed_board_carries_the_promoted_numbers | **SPLIT** | every arm is soundness (board vs fresh v6 run from committed stores, zero fetch-date input) and ALL stay in the gate; the one repo-state pin — reading only the promotion's hand-stamped `provenance.own_model` home — was generalized to "every provenance home that declares an algorithm must declare own_v6, and at least one must", so a fresh build labeled by build.py passes, a failed attach or an older model's label still refuses |

Nothing failing was excluded on faith: 8 of 16 refusals stand exactly as
they were, 7 are excluded only where their comparison inputs were just
rewritten (and still run everywhere else), 1 was fixed to test what it
always meant to test.

### What changed (this commit)

1. **`draft/tests/conftest.py`** (new) — registers the `repo_parity`
   marker; the docstring is the distinction: anti-hand-edit parity vs
   candidate-board soundness.
2. **The seven parity tests** carry `@pytest.mark.repo_parity`, each
   docstring stating which rebuilt input breaks it in the gate and why the
   gate excludes it. They run — and pass — in every normal pytest
   invocation and in the workflow's advisory pre-build step, which
   deliberately keeps the full suite (there the tree is as committed, so
   parity is meaningful; that step is now the nightly anti-hand-edit home).
3. **`draft/tests/test_own_projections_v6_live.py`** — the dual-home
   provenance fix above; unmarked, fully in the gate.
4. **`.github/workflows/draft-data.yml`** — the acceptance gate runs
   `python -m pytest draft/tests -q -m "not repo_parity"` (yaml.safe_load
   verified); comments on both pytest steps state which question each asks.
5. **`draft/tests/test_gate_selection.py`** (new, 3 tests) — pins the
   marked set to an explicit 7-node list and proves, with pytest's own
   collector and the `-m` expression parsed out of the workflow file
   itself, that the gate's selection excludes exactly that set and nothing
   else; also proves the advisory step kept the full suite. A marker that
   spreads to a soundness test, falls off a parity test, or a gate
   expression that drifts — each fails a different assertion by name.

Suite state: `pytest draft/tests -q` → **2448 passed, 5 skipped** (was
2445/5; +3 gate-selection tests, all parity pins still running and green).
Gate selection `-m "not repo_parity"` → **2441 passed, 5 skipped,
7 deselected**.

### Honest status: what still stands between the gate and a publish

The gate now CAN pass on a fresh board — but the next refire will still
refuse, correctly, on class (ii): the fresh board will carry
`proj_sd_source` and the maps still do not declare it. The one-line-per-map
fix belongs to `draft/backtest/season_stamp.py` (TERRITORY: C, with the
documented TERRITORY-GRANT precedent from `adp_sd_source`): classify from
what WRITES it — `projections.py:310` emits a provenance string
(`"measured-2023-25-error"` | `"position_variance"`) in the same breath as
`proj_sd` itself, the exact sibling shape of `adp_sd_source`
(`"seasonal"` in BOARD_FIELD_SOURCES, `LIVE_FEED` in BOARD_FIELD_PURPOSE —
though `derived` is arguable for the purpose axis, since it names which
derivation produced `proj_sd`; both pass LIVE_ALLOWED, nothing downstream
moves). This pass did not reach into that lane; the declaration is routed
via ROUTES.md alongside the refire instruction. Once it lands, every known
by-construction refusal is gone and the refire answers the end-to-end
question for real.

---

## 7. THE EIGHT OF RUN 31948330004, CLASSIFIED — tonight's unclassified tests put through the §6 method (2026-08-16, third pass)

Run 31948330004 (workflow_dispatch on the relay ref, head `a6056125`, gate
at 12:58Z) refused a LIVE candidate with **8 failed / 2479 passed /
7 deselected**. Everything §6 classified passed — the seven parity pins
deselected cleanly, all eight §6 soundness keeps green (the fresh board now
declares `proj_sd_source`… or the C-lane declaration landed; either way that
lane is quiet). The 8 failures are tests ADDED on 2026-08-16 by parallel
crews (playoff SOS `cdff2290`, projection correctness `e993e1de`, weekly
own-projection `3a4a2805`, the ADP dispersion grade, and this fix's own
`test_gate_selection.py`) that were never classified parity-vs-soundness.
Evidence: issue #5's 12:58Z comment (the full 8-node list), the job-log tail
(job 95167799371; the API's ~316KB tail cap hides the early failure bodies
behind the playoff-SOS diff dumps — noted per node below where it bit), and
offline reproduction against the committed board where the log was out of
reach.

### The classification, one line each (8 nodes; §6 vocabulary)

| # | node | class | why |
|---|------|-------|-----|
| 1 | test_adp_sd_measured::test_MEASURE_each_ADP_band…[4 params] | **PARITY-excluded** | the ratio is keepers.py's shipped CONSTANT over the morning's freshly fetched FFC dispersion — no board value is asserted (the board's own adp_sd on measured rows IS the published number, taken as-is), so a market move refuses a sound board; it also failed on main's 08:42 run (31936912289), confirming market drift, not branch code; the 2026-08-14-calibrated ratchet stays enforced against committed state in every normal run + the advisory step. (Which band crossed 1.35 is unrecoverable from the capped log; all four params marked — they are one measurement over one fetch.) |
| 2 | test_gate_selection::test_the_workflow_gate_deselects_repo_parity… | **SOUNDNESS-kept**, exception-hardened | failed `ModuleNotFoundError: yaml` — the gate venv carries no pyyaml and `_gate_step()` imported it bare; the guard itself is right and stays in the gate, but a missing LIBRARY may never block a board, so the import is now `pytest.importorskip` (honest SKIP where yaml is absent; full enforcement everywhere else) |
| 3 | test_gate_selection::test_the_gate_selection_excludes_exactly_the_marked_set… | **SOUNDNESS-kept**, exception-hardened | same yaml import via `_gate_marker_expression()`; same importorskip; note the yaml-free marker-side pin (`test_the_marked_set_is_exactly_the_declared_nodes`) PASSED in this very run — the collector proof never went dark |
| 4 | test_own_projections_v6_live::test_committed_board_carries_the_promoted_numbers | **SPLIT** | the label and stale arms stay untouched; the value arm recomputed from `BOARD["players"]` ONLY — but build.py computes the column BEFORE the keeper split (build.py:660 vs :1382), so every fresh build's fit population also holds the 3 kept_players, and the v2 OLS fit is population-sensitive (measured on the committed board: folding the keepers in moves 159 rows, up to ~1.2 pts — the committed column matches the players-only run to 0 rows because the promotion hand-attached exactly that run). A second refuse-every-fresh-board trap in the same test §6 already fixed once. The rule now: the column must equal ONE honest population's fresh run WHOLLY (players-only or players+kept); hand-edits, mixes, and older algorithms match neither and still refuse. Fully in the gate, unmarked. |
| 5 | test_playoff_sos::test_committed_artifact_matches_a_fresh_run_of_the_tool | **PARITY-excluded** | `S.compute()` reads BOARD_PATH, which the gate just replaced with the fresh candidate — committed artifact vs regeneration whose own input the run rewrote, the exact §6(i) shape; anti-hand-edit parity keeps its home in the normal suite + advisory step |
| 6 | test_playoff_sos::test_every_board_skill_player_is_ranked_or_honestly_absent | **PARITY-excluded** | the ranked/absent partition is committed-artifact COVERAGE of the live board; the candidate carried 682 players vs the artifact's 677-player basis, so the ~5 new Sleeper signings are neither ranked nor absent BY CONSTRUCTION — refuses NEW players, not a bad board (it passed the 05:17 run, when the candidate was still 677 — the growth, not the tool, is what fired) |
| 7 | test_projection_correctness::test_board_provenance_records_the_correction | **SPLIT** (soundness kept, native stamp added) | asserted the promotion's HAND-stamped `provenance.projection_correctness_2026_08_16` — a key build.py never writes — so a fresh board running the FIXED code paths (its DEF/FP values correct, and the 12 sibling value tests all PASSED in this run) failed `assert None`; build.py now stamps the record natively at `provenance.projections.projection_correctness`, re-derived from the same payload the baseline was scored from (verified offline: the native derivation reproduces the hand record's 11 rows, old/new identical), and the test holds whichever home is present to its own soundness — a board carrying NEITHER still refuses |
| 8 | test_weekly_own_projection::test_own_weekly_workflow_yamls_parse_and_carry_dry_run | **PARITY-excluded** + importorskip | `ModuleNotFoundError: yaml`; it parses REPO WORKFLOW FILES, asserts nothing about the board, and pyyaml rides the dev env, not the gate venv — marked, and importorskip makes a yaml-less env an honest SKIP in any unmarked context |

Again nothing was excluded on faith: 2 of 8 keep refusing exactly as
before wherever their library exists, 2 were fixed to test what they always
meant to test (with the trap arm generalized, not deleted), and 4 are
excluded only where their comparison input — the board file or the day's
market fetch — was rewritten by the run itself, while still running
everywhere else. `test_FAIL_ARM_the_shipped_rate_IS_measurably_wrong`
(test_adp_sd_measured) is the same fetch-sensitive shape as node 1 in the
opposite direction and was deliberately NOT marked: it has refused no
board, and pre-excluding it without an observed failure is the on-faith
exclusion this method forbids. If a future market swing fires it in the
gate, classify it then, with its failure in hand.

### What changed (this commit)

1. **`draft/build.py`** (provenance stamp only) — the projection-
   correctness record is stamped natively into
   `provenance.projections.projection_correctness` (ruling, date, the two
   algorithms, and the DEF corrected rows re-derived from the same payload
   the baseline was scored from), so fresh boards carry the record without
   the hand stamp.
2. **`draft/tests/test_projection_correctness.py`** — dual-home acceptance
   (hand stamp held to its measured counts; native stamp held to ruling +
   algorithms + agreement with the board's own DEF baselines; neither
   present refuses).
3. **`draft/tests/test_own_projections_v6_live.py`** — dual-population
   value arm (players-only or players+kept_players, wholly; both-mismatch
   refuses with both counts named).
4. **Marks**: `test_playoff_sos` (2 nodes), `test_adp_sd_measured` (the
   4-param ratchet), `test_weekly_own_projection` (the YAML parse) carry
   `@pytest.mark.repo_parity` with per-test docstrings naming the run and
   the rewritten input.
5. **`draft/tests/test_gate_selection.py`** — REPO_PARITY_NODES pinned to
   the new 14-node set; the yaml import is importorskip; docstrings updated.
6. **`draft/tests/conftest.py`** — the marker's docstring now names all
   three species and the single membership test (could nothing but the
   world moving since commit time cause this failure on a fresh board?).

Suite state: `pytest draft/tests -q` → **2496 passed, 5 skipped** (every
marked pin still running and green against committed state). Gate selection
`-m "not repo_parity"` → **2482 passed, 5 skipped, 14 deselected**, and
`test_gate_selection.py` proves the deselection is exactly the pinned set.

### Honest status

Every one of the 8 is either deselected by the gate, skipped where its
library is absent, or fixed to pass on the population/provenance a fresh
build actually produces — against the committed board, both invocations are
green locally. What local runs cannot prove: the two dual-accept fixes (#4,
#7) against a REAL fresh candidate, and whether tomorrow's market keeps
band ratios inside test_FAIL_ARM's unmarked bounds. The refire of
draft-data.yml on the relay ref after this merges is the actual test; if it
still refuses, the failure list is the next §-numbered section of this
file, not a bypass.

---

## 8. THE ONE OF RUNS 31949909332 / 31950441042 — §7's dual-accept fix met a real fresh candidate and lost; the defect was in build.py's population (2026-08-16, fourth pass)

§7 predicted its own audit: "what local runs cannot prove: the two
dual-accept fixes (#4, #7) against a REAL fresh candidate." The two refires
after §7 merged (run 31949909332 at 13:28Z on head `99b84845` itself, job
95171686130; run 31950441042 at 13:39Z on head `1f9dc17c`, job 95172974638)
answered: everything else went green — the advisory full suite passed 2491/0
and 2522-passed gate otherwise clean, all 14/15 parity pins deselected, the
native correction stamp (#7) held ("projection-correctness: DEF TD
vocabulary corrected 11 rows (stamped in provenance.projections)") — and
exactly ONE test refused both candidates:

```
test_own_projections_v6_live::test_committed_board_carries_the_promoted_numbers
AssertionError: board rows disagree with a fresh own_v6 run from BOTH honest
populations (players-only: 352 rows; players+kept_players, build.py's
pre-split population: 352 rows) — e.g. ['9221','9509','9493','4034','6813','9488']
```

(The short ~1,357-line logs are the CLEANUP working, not a new early death:
one failure body instead of eight with full playoff-SOS diff dumps. The
job died at its normal place — the gate — with `1 failed, 2477 passed, 9
skipped, 14 deselected` at 13:34Z and `1 failed, 2522 passed, 9 skipped,
15 deselected` at 13:45Z.)

### The defect: build.py computed the column from a population the artifact does not publish

§7 node 4's premise was that build.py's compute population is "players +
kept_players (the pre-SPLIT population)", the soon-pruned rows being
harmless because they "carry no prior-season production and cannot enter
any store the fit reads." Both halves of that sentence were wrong:

- build.py attached the own model at load_players' mid-point, off the FULL
  draftable pool — the 13:42Z build log reads, in order: "1863 draftable
  players … own model (own_v6) 3rd source on **519** players … inactive:
  dropped 1178 … (685 remain)". Compute population 1,863; published
  population 685 (682 players + 3 kept).
- `dormant()` does not prune on production. It prunes on WHO VOUCHES
  (market ADP / proj_mean > 0 / rookie / keeper designation) — so a fringe
  2024/25 producer with no 2026 consensus projection and no ADP is pruned
  while sitting in `season_totals`, the v2 OLS fit, and v5's
  league-efficiency and availability means. ~90+ such rows were in the fit
  at build time and gone from the artifact at gate time.

Offline reproduction (committed board, zero network): recomputing own_v6
with the historical-position record's off-board QB/RB/WR/TE ids folded into
the population (simulating the 1,863-row pool) projects 514 (CI attached
519) and mismatches **351** of the board's rows against the pool-run vs
352 in CI — same failure, one row of drift from the 5 new signings. Values
move up to ~9.7 points (Gibbs 270.11 → 260.42, CMC 195.50 → 188.44).
Both CI counts being IDENTICAL (352/352) is the tell the §7 table lacked:
a population delta of 3 keepers moves 159 rows by ≤1.2, but a delta of
~1,180 pool rows swamps it identically from either honest population.

### The classification (§6 vocabulary): SOUNDNESS-kept — the test was RIGHT

This is the one node in four passes where the failing test stays untouched
in substance and the BUILD moves. A projection column whose values depend
on 1,178 rows the artifact does not carry cannot be audited from the
artifact by anyone, ever — which is precisely the "column can't silently be
an older model's numbers" property the test exists to enforce. Growing the
test a third population was rejected: a population the artifact cannot
reconstruct is not an honest population, it is unauditability with a name.

### What changed (this commit)

1. **`draft/build.py`** — the own-model compute/attach block moved from
   before the activity prune to immediately AFTER it, inside
   `load_players()`: the compute population is now exactly the rows the
   board publishes (players + kept_players; the keeper split happens later
   in `build()`), so the column is reproducible from the artifact alone —
   and it is the same population class as the promotion's accepted
   hand-attach (a board-rows-only run). The prune cannot see the change
   (`dormant()` never reads proj_ownmodel), and on the prune's refusal arm
   the full board ships, making the compute population that board — the
   contract holds on both arms. A pointer comment remains at the old site.
2. **`draft/tests/test_own_projections_v6_live.py`** — docstring only: the
   third trap recorded, the false "cannot enter any store the fit reads"
   claim corrected. The test's logic is unchanged — its pop-B arm is now
   the build's actual population.

Round-trip proof (offline, committed board): attach a post-prune-population
run the way build.py now does, then run the test's arms — pop A mismatches
159 (the keeper fold, expected), pop B mismatches **0**, stale arm clean.
Suite state: `pytest draft/tests -q` → **2550 passed, 5 skipped**; gate
selection `-m "not repo_parity"` → **2535 passed, 5 skipped, 15
deselected**.

### Honest status

The one known refusal standing after §7 is fixed at its root, and the fix
direction is the strict one: the build became auditable rather than the
test becoming lenient. What local runs cannot prove remains the same class
as before — a REAL fresh candidate (new signings, the day's market) through
the whole workflow. The refire after this merges is the actual test; if it
refuses, the list goes in §9, not in a bypass.
