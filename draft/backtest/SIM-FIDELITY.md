# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.7** runs per draft). The independent sampler produced **40%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 40% | 18.96 | 0.065 |
| 1.0 | 42% | 19.71 | 0.044 |
| 2.0 | 44% | 20.33 | 0.025 |
| 4.0 | 46% | 21.21 | 0.002 ← fitted |
| 8.0 | 50% | 22.58 | 0.041 |
| 16.0 | 56% | 24.42 | 0.1 |

**Fitted magnitude: 4.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 46%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.46 | 0.458 | ±0.05 | ✅ |
| runs_per_draft | 19.67 | 21.21 | ±1.5 | ❌ |
| mean_run_len | 3.16 | 3.24 | ±0.5 | ✅ |
| timing_q1_RB | 0.321 | 0.294 | ±0.15 | ✅ |
| timing_q1_WR | 0.457 | 0.354 | ±0.15 | ✅ |
| timing_q1_QB | 0.099 | 0.167 | ±0.15 | ✅ |
| timing_q3_RB | 0.309 | 0.294 | ±0.15 | ✅ |
| timing_q3_WR | 0.296 | 0.35 | ±0.15 | ✅ |
| timing_q3_QB | 0.123 | 0.163 | ±0.15 | ✅ |
| timing_q5_RB | 0.28 | 0.285 | ±0.15 | ✅ |
| timing_q5_WR | 0.305 | 0.343 | ±0.15 | ✅ |
| timing_q5_QB | 0.098 | 0.174 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

The simulator does not reproduce: **runs_per_draft**. Any experiment conditioning on these states is measuring the model, not the league — its result must be read as a model finding and its state reported as untestable, exactly as `run_pressure` should have been.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._