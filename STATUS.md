# STATUS — unattended run

_Read this first. Updated after every completed item._
_Last update: master-execution-order run, start._

## One-line readiness
**NOT YET** ready for a human mock — stabilization in progress; robot mock being built as the safety net that gates the rest.

## Test suite
- JS suites: engine 190, mcts 63, keepers 38, keeperlock 41, reconcile 12, update 41, betlogic 134, ledger 41, sync 26, backtest 17, strategies 13, attribution 10 — **all green**
- Python: 112 — **all green**
- Robot mock in CI: **being built (item 1, Phase 3)**

## In flight
- Backtest **run 5** (`53bc711`) in CI — projection-correlation fix. Feeds queue items 3–6. Runs 1–4 all refused by guards (2 crashes, 2 real bugs the sanity gate caught: 7/200 join, then flat projection). No wrong number has ever reached the record.

## Queue progress
| # | item | state |
|---|---|---|
| 1 | Stabilization sprint | IN PROGRESS |
| 2 | Small fixes (onesie / rail budget / config_confirmed) | PENDING |
| 2b | Draft-day experience | AUDITED, pending |
| 2c | Cutting-edge data | AUDITED, pending (mostly ABSENT) |
| 3 | Backtest completion | BLOCKED on run 5 |
| 4 | Calibration fixes | BLOCKED on run 5 |
| 5 | Strategy selection | harness BUILT; BLOCKED on run 5 bundles |
| 6 | Exploitation pass | pre-registered; BLOCKED on run 5 |
| 7 | Final verification | PENDING |
| 8 | Freshness for draft day | PENDING |
| 9 | Close the record | PENDING |

## Addendum audit — BUILT / PARTIAL / ABSENT (before any building)
- 2b.1 Why line — **PARTIAL** (rec cards show reasons[0]; board rows have none; no tap-to-expand item-13 table per player)
- 2b.2 full board **BUILT**, sortable; next-up glance strip **ABSENT**; visual tier bands **ABSENT**
- 2b.3 search — **PARTIAL** (substring, not fuzzy; does not jump to a full card; drafted-player lookup partial)
- 2b.4 targets/DND — **PARTIAL** (TARGET_NUDGE +3 live, target/avoid lists live; DND-as-hard-exclusion, disagreement pricing, export/import **ABSENT**)
- 2b.5 on-the-clock — **BUILT** (clock-on/onTheClock/renderClock); collapse behaviour to verify
- 2b.6 LRM countdowns — **ABSENT**
- 2b.7 branch forecast — **BUILT** (branchForecast/renderBranches); render to verify
- 2b.8 run banner **PARTIAL** (recomputeRuns exists, render to verify); global ADP drift **ABSENT**; faller flags **ABSENT**
- 2b.9 roster panel/bye grid/rosterPlan **PARTIAL**; roster-shape declaration (Hero/Zero RB) **ABSENT**
- 2b.10 override logging — **ABSENT** (no logOverride path)
- TIE_THRESHOLD coin-flip display — **BUILT and wired**
- 2c.1–5 — **ABSENT** (years_exp field exists; no neutral-script, draft-capital boost, slope, xTD, or NGS)

## Blocked
- Items 3–6 blocked on backtest run 5 landing (in CI now).

## Decisions needed
- See DECISIONS-NEEDED.md (currently: none open).

## Standing rules in force
fail loudly · single scoring path · every pinned constant cites its source · every bug found becomes a robot scenario in the same commit · provenance stamps on every results file · guards are never disabled to pass.
