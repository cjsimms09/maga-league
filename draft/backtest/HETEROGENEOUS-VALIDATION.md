# HETEROGENEOUS-ROOM VALIDATION — do the landed verdicts survive real opponent variety?

_Pre-registered by Cory (2026-08-08) at the moment the dossier-driven opponent
model was ordered: **every verdict landed before this switch was measured
against HOMOGENEOUS rooms** — nine identical ADP-softmax agents. Re-running the
batch on per-seat models fitted from three seasons of real drafts is therefore a
validation of the current findings, not a new experiment. The question was
written down before the answer: **do WR Feast's +$86 and the inverted-U
survive?**_

## The room that replaced them

Ten seats, each fitted from `manager_profiles.json` (three seasons,
shrinkage-weighted, real ADP coverage — `reach_delta.proxy = false`):

| manager | sampling temp | strongest fitted tilts | picks fitted |
|---|---|---|---|
| Richard2121 | 7.94 | WR×1.10, TE×1.08 | 40 |
| ds7mmet | 7.10 | **TE×1.54, QB×1.38** | 40 |
| Schmelley | 6.76 | TE×1.12, RB×1.04 | 40 |
| Jreis | 6.72 | **RB×1.44**, DEF×1.28 | 44 |
| cashworth | 5.61 | QB×1.38, WR×1.10 | 42 |
| mhagen | 5.27 | TE×1.08, WR×1.01 | 39 |
| Sadbru | 5.25 | DEF×1.35, QB×1.20 | 42 |
| coryjsimms | 5.21 | TE×1.18, K×1.01 | 41 |
| B8T3S | 5.11 | K×1.21, WR×0.97 | 40 |
| MarianSaar | 4.96 | K×1.10, DEF×1.02 | 39 |

**An independent corroboration worth noting:** ds7mmet's documented round-5 QB
pattern shows up as **QB×1.38** — fitted from the picks alone, never told to the
model. The dossier and the data agree without being introduced.

## The verdicts, before and after

| finding | homogeneous rooms | heterogeneous rooms | survives? |
|---|---|---|---|
| **WR Feast** (19b winner) | +$86.00, CI [70, 103] | **+$91.50, CI [74, 109]** | ✅ **strengthens** |
| Early-QB Strike (runner-up) | +$65.25, CI [49, 82] | **+$67.62, CI [50, 87]** | ✅ holds |
| Late-QB | −$61.25 | **−$60.62** | ✅ holds (still burns) |
| **Inverted-U peak** (exp 21, λ=0.5) | +$55.50, CI [33, 78] | **+$70.67, CI [47, 95]** | ✅ **strengthens** |
| Inverted-U tail (λ=3) | −$26.83, CI excl. 0 | **−$26.33, CI excl. 0** | ✅ holds |
| Late-ramp ≪ early-ramp (exp 2 §5 H1) | +$5 vs +$56 | **+$2.50 vs +$64.83** | ✅ holds |
| **H1 phase-shape refuted** (exp 2 §5) | −$31.25, CI [−48, −16] | **−$37.29, CI [−60, −14]** | ✅ **refutation deepens** |
| §6 conditional rules clearing null | 0 | **0** (null p95 $65.83) | ✅ holds |

**Every landed verdict survived. Two strengthened.** The doctrine enrollment,
the D9 install, and the D10 stand-down all stand on the more realistic room.

## What the switch actually changed

- **Verdict magnitudes moved** (H1's refutation deepened −31 → −37; the frontier
  peak rose +56 → +71), so the room genuinely differs — this was not a no-op
  dressed as a validation.
- **A wiring bug was caught by the comparison itself:** `policy_tournament`'s
  room loop initially bypassed the new opponents and returned numbers IDENTICAL
  to the homogeneous run. Identical output across a real change is a defect
  signature; it is now routed through the same per-seat picker as every other
  experiment.
- **`run_pressure` remains testable** (85/120 rooms) and `thin_board_early` rose
  to the top of the conditional table — but still nothing clears the null.

## Standing limitations (unchanged by this build)

- **Platform adherence is NOT in the model.** Historical Sleeper rankings are
  not archived (exp 31's caveat), so adherence-to-platform-ordering cannot be
  fitted and is deliberately absent rather than guessed.
- **My-turn adjacency is still uninstrumented** — the model makes seats differ,
  but no state yet measures "who picks between me and my next pick".
- **Run STRUCTURE remains unvalidated:** frequency matches (see
  `SIM-FIDELITY.md`), but who runs and on what trigger is not proven.
- All money remains the **v1 proxy**; September's quantile re-run is
  pre-registered for every number above.
