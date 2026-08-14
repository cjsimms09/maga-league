# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.7** runs per draft). The independent sampler produced **39%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 39% | 18.46 | 0.074 |
| 1.0 | 41% | 19.33 | 0.049 |
| 2.0 | 44% | 20.54 | 0.023 |
| 4.0 | 46% | 21.29 | 0.004 ← fitted |
| 8.0 | 50% | 22.5 | 0.044 |
| 16.0 | 56% | 24.04 | 0.097 |

**Fitted magnitude: 4.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 46%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.46 | 0.464 | ±0.05 | ✅ |
| runs_per_draft | 19.67 | 21.29 | ±1.5 | ❌ |
| mean_run_len | 3.16 | 3.27 | ±0.5 | ✅ |
| timing_q1_RB | 0.321 | 0.297 | ±0.15 | ✅ |
| timing_q1_WR | 0.457 | 0.361 | ±0.15 | ✅ |
| timing_q1_QB | 0.099 | 0.149 | ±0.15 | ✅ |
| timing_q3_RB | 0.309 | 0.297 | ±0.15 | ✅ |
| timing_q3_WR | 0.296 | 0.356 | ±0.15 | ✅ |
| timing_q3_QB | 0.123 | 0.15 | ±0.15 | ✅ |
| timing_q5_RB | 0.28 | 0.289 | ±0.15 | ✅ |
| timing_q5_WR | 0.305 | 0.35 | ±0.15 | ✅ |
| timing_q5_QB | 0.098 | 0.153 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

The simulator does not reproduce: **runs_per_draft**. Any experiment conditioning on these states is measuring the model, not the league — its result must be read as a model finding and its state reported as untestable, exactly as `run_pressure` should have been.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._