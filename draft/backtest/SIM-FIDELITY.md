# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts

_run = ≥3 of one position inside a 5-pick window, computed identically on real and simulated sequences · 24 sim rooms per point_

## The finding that forced this

Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a **MODEL finding, not a league finding** — positional runs demonstrably occur in our real drafts (**42%** of real picks sit inside a run, **17.8** runs per draft). The independent sampler produced **37%**. Opponents drawing with uncorrelated noise never cascade; real runs ARE correlated — one reach triggers the next as humans watch a position empty.

## The cascade term (fitted to our own three seasons)

| cascade | sim run share | runs/draft | |err| vs real |
|---|---|---|---|
| 0.0 | 37% | 18.12 | 0.051 |
| 1.0 | 40% | 19.17 | 0.027 |
| 2.0 | 42% | 20.0 | 0.004 ← fitted |
| 4.0 | 43% | 20.33 | 0.009 |
| 8.0 | 48% | 21.92 | 0.056 |
| 16.0 | 52% | 23.17 | 0.097 |

**Fitted magnitude: 2.0** — the value whose run frequency best matches the real drafts (real 42% vs fitted 42%). Fitted from OUR data, not chosen for taste.

## Statistic-by-statistic: what the simulator can and cannot reproduce

| statistic | real | sim (fitted) | tol | reproduces? |
|---|---|---|---|---|
| run_share | 0.424 | 0.42 | ±0.05 | ✅ |
| runs_per_draft | 17.75 | 20.0 | ±1.5 | ❌ |
| mean_run_len | 3.11 | 3.14 | ±0.5 | ✅ |
| timing_q1_RB | 0.279 | 0.289 | ±0.15 | ✅ |
| timing_q1_WR | 0.404 | 0.354 | ±0.15 | ✅ |
| timing_q1_QB | 0.115 | 0.158 | ±0.15 | ✅ |
| timing_q3_RB | 0.267 | 0.299 | ±0.15 | ✅ |
| timing_q3_WR | 0.295 | 0.35 | ±0.15 | ✅ |
| timing_q3_QB | 0.114 | 0.154 | ±0.15 | ✅ |
| timing_q5_RB | 0.267 | 0.29 | ±0.15 | ✅ |
| timing_q5_WR | 0.324 | 0.344 | ±0.15 | ✅ |
| timing_q5_QB | 0.114 | 0.157 | ±0.15 | ✅ |

## ⚠️ STANDING LIMITATION — states these experiments CANNOT test

The simulator does not reproduce: **runs_per_draft**. Any experiment conditioning on these states is measuring the model, not the league — its result must be read as a model finding and its state reported as untestable, exactly as `run_pressure` should have been.

**Not measurable locally:** reach / ADP-deviation distribution — historical ADP lives in the CI-built bundles (egress); this comparison runs in the replay-bridge job.

_This section is standing: it re-runs with the Lab and any statistic that drifts out of tolerance becomes a new limitation entry. The measurement being structurally unable to see a thing is itself a finding._