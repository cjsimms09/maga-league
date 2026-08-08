# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.7** runs per draft). The independent sampler produced **44%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 44% | 21.17 | 0.017 |
| 1.0 | 45% | 21.12 | 0.01 |
| 2.0 | 47% | 21.71 | 0.009 ← fitted |
| 4.0 | 50% | 22.46 | 0.035 |
| 8.0 | 53% | 23.62 | 0.074 |
| 16.0 | 58% | 24.42 | 0.12 |

**Fitted magnitude: 2.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 47%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.46 | 0.469 | ±0.05 | ✅ |
| runs_per_draft | 19.67 | 21.71 | ±1.5 | ❌ |
| mean_run_len | 3.16 | 3.24 | ±0.5 | ✅ |
| timing_q1_RB | 0.321 | 0.265 | ±0.15 | ✅ |
| timing_q1_WR | 0.457 | 0.421 | ±0.15 | ✅ |
| timing_q1_QB | 0.099 | 0.128 | ±0.15 | ✅ |
| timing_q3_RB | 0.309 | 0.264 | ±0.15 | ✅ |
| timing_q3_WR | 0.296 | 0.41 | ±0.15 | ✅ |
| timing_q3_QB | 0.123 | 0.129 | ±0.15 | ✅ |
| timing_q5_RB | 0.28 | 0.257 | ±0.15 | ✅ |
| timing_q5_WR | 0.305 | 0.403 | ±0.15 | ✅ |
| timing_q5_QB | 0.098 | 0.136 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

The simulator does not reproduce: **runs_per_draft**. Any experiment conditioning on these states is measuring the model, not the league — its result must be read as a model finding and its state reported as untestable, exactly as `run_pressure` should have been.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._