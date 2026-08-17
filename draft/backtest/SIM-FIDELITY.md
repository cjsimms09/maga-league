# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.3** runs per draft). The independent sampler produced **39%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 39% | 18.58 | 0.076 |
| 1.0 | 41% | 19.33 | 0.055 |
| 2.0 | 42% | 19.71 | 0.044 |
| 4.0 | 45% | 20.75 | 0.017 ← fitted |
| 8.0 | 49% | 22.12 | 0.031 |
| 16.0 | 57% | 24.5 | 0.103 |

**Fitted magnitude: 4.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 45%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.463 | 0.446 | ±0.05 | ✅ |
| runs_per_draft | 19.33 | 20.75 | ±1.5 | ✅ |
| mean_run_len | 3.15 | 3.22 | ±0.5 | ✅ |
| timing_q1_RB | 0.316 | 0.297 | ±0.15 | ✅ |
| timing_q1_WR | 0.468 | 0.358 | ±0.15 | ✅ |
| timing_q1_QB | 0.089 | 0.153 | ±0.15 | ✅ |
| timing_q3_RB | 0.329 | 0.297 | ±0.15 | ✅ |
| timing_q3_WR | 0.316 | 0.36 | ±0.15 | ✅ |
| timing_q3_QB | 0.127 | 0.144 | ±0.15 | ✅ |
| timing_q5_RB | 0.25 | 0.287 | ±0.15 | ✅ |
| timing_q5_WR | 0.325 | 0.353 | ±0.15 | ✅ |
| timing_q5_QB | 0.1 | 0.153 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

Every measured statistic reproduces within tolerance. This does NOT mean the sim is faithful in general — only that these statistics are.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._