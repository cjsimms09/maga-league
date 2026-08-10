# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.7** runs per draft). The independent sampler produced **43%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 43% | 20.46 | 0.031 |
| 1.0 | 44% | 20.62 | 0.022 |
| 2.0 | 45% | 20.71 | 0.011 ← fitted |
| 4.0 | 48% | 21.29 | 0.015 |
| 8.0 | 53% | 23.04 | 0.066 |
| 16.0 | 58% | 24.5 | 0.118 |

**Fitted magnitude: 2.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 45%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.46 | 0.449 | ±0.05 | ✅ |
| runs_per_draft | 19.67 | 20.71 | ±1.5 | ✅ |
| mean_run_len | 3.16 | 3.26 | ±0.5 | ✅ |
| timing_q1_RB | 0.321 | 0.26 | ±0.15 | ✅ |
| timing_q1_WR | 0.457 | 0.436 | ±0.15 | ✅ |
| timing_q1_QB | 0.099 | 0.131 | ±0.15 | ✅ |
| timing_q3_RB | 0.309 | 0.254 | ±0.15 | ✅ |
| timing_q3_WR | 0.296 | 0.429 | ±0.15 | ✅ |
| timing_q3_QB | 0.123 | 0.132 | ±0.15 | ✅ |
| timing_q5_RB | 0.28 | 0.247 | ±0.15 | ✅ |
| timing_q5_WR | 0.305 | 0.421 | ±0.15 | ✅ |
| timing_q5_QB | 0.098 | 0.139 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

Every measured statistic reproduces within tolerance. This does NOT mean the sim is faithful in general — only that these statistics are.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._