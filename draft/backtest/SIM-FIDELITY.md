# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**42%** of real picks sit inside a run, **17.8** runs per draft). The independent sampler produced **37%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 37% | 18.0 | 0.055 |
| 1.0 | 39% | 18.71 | 0.036 |
| 2.0 | 40% | 18.96 | 0.026 |
| 4.0 | 42% | 19.83 | 0.0 ← fitted |
| 8.0 | 47% | 21.96 | 0.05 |
| 16.0 | 55% | 24.21 | 0.122 |

**Fitted magnitude: 4.0** — the value whose run frequency best matches the real drafts (real 42% vs fitted 42%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.424 | 0.424 | ±0.05 | ✅ |
| runs_per_draft | 17.75 | 19.83 | ±1.5 | ❌ |
| mean_run_len | 3.11 | 3.2 | ±0.5 | ✅ |
| timing_q1_RB | 0.279 | 0.297 | ±0.15 | ✅ |
| timing_q1_WR | 0.404 | 0.347 | ±0.15 | ✅ |
| timing_q1_QB | 0.115 | 0.151 | ±0.15 | ✅ |
| timing_q3_RB | 0.267 | 0.296 | ±0.15 | ✅ |
| timing_q3_WR | 0.295 | 0.339 | ±0.15 | ✅ |
| timing_q3_QB | 0.114 | 0.154 | ±0.15 | ✅ |
| timing_q5_RB | 0.267 | 0.29 | ±0.15 | ✅ |
| timing_q5_WR | 0.324 | 0.336 | ±0.15 | ✅ |
| timing_q5_QB | 0.114 | 0.156 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

The simulator does not reproduce: **runs_per_draft**. Any experiment conditioning on these states is measuring the model, not the league — its result must be read as a model finding and its state reported as untestable, exactly as `run_pressure` should have been.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._