# STATUS — unattended run

_Read this first. Updated after every completed item._

## BACKTEST — CONCLUDED: projection stand-in too crude to grade the engine → DEFAULT STANDS

Three real leaks found and fixed (all caught by the pre-registered round-1
alarm): board coverage (66-77%→100% join), cross-season points overwrite, and
the raw-points QB metric. After all three, the alarm STILL fires under value
grading too (round-1 +130; B3-B0 -157/pick). Root cause is the one the
pre-registration named: B3 runs on our CRUDE walk-forward projection while B0
runs on the real market's ADP — the projection floated Carson Wentz to round 1.
The backtest measures composite-on-crude-projection vs the market; the
projection confounds it, exactly as the spec foresaw ("not a test of projection
accuracy").

**VERDICT (pre-registered boring outcome): the backtest cannot select a strategy
or fit a parameter on this projection. DEFAULT STANDS.** No strategy install, no
adp_sd fit, no Section-A exploitation fit — all would be fitting projection
noise. See DECISIONS D1.

**Still valid and PROCEEDING (projection-independent):** KOV verdict (item 4b),
and Exploitation Section B intel (mines actual picks vs ADP + outcomes, no
projection involved — the 'richest vein' survives).

The backtest report LANDED (`63f1e44`), and its own pre-registered round-1
alarm FIRED. Per the pre-registration and the standing rule, that halts every
item that would trust or install off these numbers: **item 4 (calibration/KOV
fits), item 5 (strategy install), item 6 (exploitation fits) are FROZEN** until
the leak is explained. A report under a bug alarm is a bug report, not a result.

The four sections, in your reading order, VERBATIM:

**1. Round-1 row (READ FIRST):**
```
round  n   mean gain   95% CI
    1  12    220.53    +/- 25.52     ** BUG ALARM ** past the 8-pt threshold
    2  15    368.56    +/- 63.99
    3  20    176.20    +/- 97.28
    4  30    -13.69    ...
   (rounds 4-12 mostly negative)
```
A +220-point round-1 edge is impossible on a real board where B0 and B3 both
take an elite — the report says so itself: "more likely a leak than an insight."

**2. Survival calibration:**
```
bucket    predicted  actual  error
0-10%       0.05     0.41    +0.36
10-20%      0.15     0.63    +0.48
20-30%      0.25     0.68    +0.43
...
90-100%     0.95     0.95     0.00
```
Monotonic, severe: players the model is ~sure are gone actually SURVIVE ~40-70%
of the time. This is the signature of a board that never depletes — if pick ids
do not join board ids, nobody is ever removed, so everyone "survives".

**3. Disagreement subset:** B3 != B0 on 307/317 picks (96.8%); win rate 40.1%;
mean gain -40.60 +/- 23.42. (96.8% disagreement is itself a smell — a working
composite agrees with ADP far more often than it disagrees.)

**4. Headline:** B0(ADP) 220.76 · B1(proj) 353.44 · B2(VORP) 176.64 ·
B3(composite) 181.44. B3-B0 = -415.44/draft +/- 226.79 (n=30). BELOW THE BAR.

**Board leak FIXED** (join now 100%, board ~800 players). But the round-1
alarm STILL fires, and the round-1 detail traced it to a deeper cause: **B3
drafts QBs in round 1** (Josh Allen, even Carson Wentz), and grading on RAW
per-pick points rewards QB raw totals (elite QBs legitimately score 450–560 in
this scoring). B0/ADP sends QBs late; B3's composite over-drafts them; raw
grading crowns the QB in round 1 while the roster craters (−571/draft overall).
This is a metric-vs-spec conflict → **DECISIONS-NEEDED D1** (raw points vs
value-over-replacement). My rec: value-over-replacement (the tournament's
yardstick). Implementing it as a SECOND reported cut; NO install off either
until you rule. The six >450 'smells' are all real QBs, not a data bug.

**Correctly gated, and worth noting:** 2025 recovery was REFUSED — the pbp
rebuild disagreed with the library on 2024 by 11 pts (tolerance 0.5). The
cross-validation gate did its job. So 2025 grades nothing; the selection rule
tightens to win-both at N=2 by data availability, not choice — once the leak is
fixed.

_(original STATUS continues below)_


_Read this first. Updated after every completed item._
_Last update: master-execution-order run, start._

## One-line readiness
**NOT YET** — robot mock green in CI; attribution wired; backtest report re-running (run 5 succeeded but its report was lost to a push race, now fixed).

## 🔑 K0 — KEEPER DECISION: SETTLED (D2 answered (b) = top_picks_flat)

**DECISION: keep all 3 — Ja'Marr Chase, Derrick Henry, Kenneth Walker.** This
matches my current Sleeper designation; the optimizer confirms it is optimal.
Every keeper has positive surplus and surplus rises with each, so keep the max.
Deadline (optimizer output by Aug 19, lock Aug 20) met on Aug 7.

```
K0 KEEPER OPTIMIZER — real roster, cost_model=top_picks_flat (PROVISIONAL pending D2 top_picks_flat)
artifact built_at 2026-08-07T09:08:24Z · adp_source ffc

RECOMMENDED: keep 3 — Derrick Henry, Ja'Marr Chase, Kenneth Walker  (total surplus 54.9)

every option (surplus = keeper VORP minus what the forfeited pick returns):
  keep 0: (draft normally)                         surplus    +0.0
  keep 1: Ja'Marr Chase                            surplus    +8.4
      Ja'Marr Chase      WR  VORP 108  costs R1  pick returns 100  -> surplus +8
  keep 2: Derrick Henry, Ja'Marr Chase             surplus   +26.1
      Ja'Marr Chase      WR  VORP 108  costs R1  pick returns 100  -> surplus +8
      Derrick Henry      RB  VORP 86  costs R2  pick returns 68  -> surplus +18
  keep 3: Derrick Henry, Ja'Marr Chase, Kenneth Walker surplus   +54.9
      Ja'Marr Chase      WR  VORP 108  costs R1  pick returns 100  -> surplus +8
      Derrick Henry      RB  VORP 86  costs R2  pick returns 68  -> surplus +18
      Kenneth Walker     RB  VORP 67  costs R3  pick returns 38  -> surplus +29
```

**HUGE draft-day consequence:** under top_picks_flat, keeping 3 forfeits my
rounds 1, 2 and 3. **My first pick is now 34 (round 4), not 7** — my picks
become 34, 41, 54, 61, 74, 81 (was 7, 14, 27, 34, 47, 54 under the old wrong
model). Every earlier board analysis assumed the wrong pick numbers. The
production artifact must be REBUILT under top_picks_flat so its adjusted_adp,
true pick order and my-pick numbers are correct — rebuild triggered.

What's implemented (D2=(b)): top_picks_flat added to the optimizer (positional
cost, tested), to build_true_pick_order (forfeits rounds 1..N, tested), to KOV
(composite.js), and to config validation. cost_model set to top_picks_flat.

## Test suite
- JS suites: engine 192, mcts 63, keepers 38, keeperlock 41, reconcile 12, update 41, betlogic 134, ledger 41, sync 26, backtest 17, strategies 13, attribution 10 — **all green**
- Python: 112 — **all green**
- Robot mock in CI: **GREEN, 37/37** (full draft from all 10 seats + 5 regression scenarios); wired into new ci.yml on every push

## In flight
- Backtest **run 6** (`ec2ff03`) — re-run after run 5 SUCCEEDED but its report was lost: CI's `git push || true` swallowed a non-fast-forward when my own pushes landed first. Commit-back now rebases and fails loudly. Run 5 succeeding means the projection fix worked and the sanity gate PASSED — the report is real, just needs to land.
- Runs 1–5: two crashes, two real bugs the sanity gate caught (7/200 join, flat projection), one success-with-lost-report. No wrong number ever reached the record.

## Queue progress
| # | item | state |
|---|---|---|
| 0 | **K0 keeper decision** | **SETTLED — keep Chase/Henry/Walker; artifact rebuild under top_picks_flat triggered** |
| 1 | Stabilization sprint | Phase 1 attribution WIRED (`pending`); robot mock GREEN |
| 2 | Small fixes (onesie / rail budget / config_confirmed) | PENDING |
| 2b | Draft-day experience | AUDITED, pending |
| 2c | Cutting-edge data | AUDITED, pending (mostly ABSENT) |
| 3 | Backtest completion | DONE — verdict: projection too crude, Default stands |
| 4 | Calibration fixes | KOV CLOSED (connected, item 17 settled); adp_sd default stands (can't fit, projection-confounded) |
| 5 | Strategy selection | CONCLUDED — Default stands (backtest cannot select) |
| 6 | Exploitation | Section A fits CANNOT proceed; Section B intel VALID, pending |
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
