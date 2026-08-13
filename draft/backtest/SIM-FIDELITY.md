# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**46%** of real picks sit inside a run, **19.7** runs per draft). The independent sampler produced **39%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 39% | 18.92 | 0.069 |
| 1.0 | 41% | 19.54 | 0.05 |
| 2.0 | 42% | 19.96 | 0.037 |
| 4.0 | 45% | 20.88 | 0.01 ← fitted |
| 8.0 | 50% | 22.42 | 0.035 |
| 16.0 | 57% | 24.75 | 0.106 |

**Fitted magnitude: 4.0** — the value whose run frequency best matches the real drafts (real 46% vs fitted 45%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.46 | 0.45 | ±0.05 | ✅ |
| runs_per_draft | 19.67 | 20.88 | ±1.5 | ✅ |
| mean_run_len | 3.16 | 3.23 | ±0.5 | ✅ |
| timing_q1_RB | 0.321 | 0.294 | ±0.15 | ✅ |
| timing_q1_WR | 0.457 | 0.351 | ±0.15 | ✅ |
| timing_q1_QB | 0.099 | 0.169 | ±0.15 | ✅ |
| timing_q3_RB | 0.309 | 0.296 | ±0.15 | ✅ |
| timing_q3_WR | 0.296 | 0.343 | ±0.15 | ✅ |
| timing_q3_QB | 0.123 | 0.165 | ±0.15 | ✅ |
| timing_q5_RB | 0.28 | 0.286 | ±0.15 | ✅ |
| timing_q5_WR | 0.305 | 0.342 | ±0.15 | ✅ |
| timing_q5_QB | 0.098 | 0.174 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

Every measured statistic reproduces within tolerance. This does NOT mean the sim is faithful in general — only that these statistics are.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._