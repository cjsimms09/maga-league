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
