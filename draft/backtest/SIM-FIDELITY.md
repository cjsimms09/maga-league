# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.3** runs per draft). The independent sampler produced **40%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 40% | 19.33 | 0.063 |
| 1.0 | 41% | 19.67 | 0.052 |
| 2.0 | 43% | 20.17 | 0.033 |
| 4.0 | 45% | 20.92 | 0.014 ← fitted |
| 8.0 | 50% | 22.17 | 0.032 |
| 16.0 | 55% | 24.29 | 0.09 |

**Fitted magnitude: 4.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 45%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.463 | 0.449 | ±0.05 | ✅ |
| runs_per_draft | 19.33 | 20.92 | ±1.5 | ❌ |
| mean_run_len | 3.15 | 3.22 | ±0.5 | ✅ |
| timing_q1_RB | 0.316 | 0.289 | ±0.15 | ✅ |
| timing_q1_WR | 0.468 | 0.371 | ±0.15 | ✅ |
| timing_q1_QB | 0.089 | 0.15 | ±0.15 | ✅ |
| timing_q3_RB | 0.329 | 0.294 | ±0.15 | ✅ |
| timing_q3_WR | 0.316 | 0.36 | ±0.15 | ✅ |
| timing_q3_QB | 0.127 | 0.146 | ±0.15 | ✅ |
| timing_q5_RB | 0.25 | 0.282 | ±0.15 | ✅ |
| timing_q5_WR | 0.325 | 0.358 | ±0.15 | ✅ |
| timing_q5_QB | 0.1 | 0.157 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

The simulator does not reproduce: **runs_per_draft**. Any experiment conditioning on these states is measuring the model, not the league — its result must be read as a model finding and its state reported as untestable, exactly as `run_pressure` should have been.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._