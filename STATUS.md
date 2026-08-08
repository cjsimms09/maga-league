# STATUS — unattended run

_Read this first. Updated after every completed item._

## 🚀 DEPLOY STAMP (repo ↔ live)
- **Repo main HEAD:** `28131c0` at time of the audit (this commit advances it — see `git log`).
- **Live site:** https://makefbgreatagain.netlify.app — Netlify auto-deploys `main` on push.
- **Repo var:** set `SITE_URL` to the above (workflows fall back to it hardcoded until then).
- **Live verification is CI-only:** this build sandbox's egress policy **blocks netlify.app** (proxy 403), so the live hash cannot be checked from here. Two CI workflows close the gap: `site-check.yml` (asset/board freshness) and the new **`deploy-verify.yml`** (polls **`/api/health`** after each push and **fails loudly** if the live commit never matches the pushed SHA).
- **Public `/api/health`** (no auth, no league data) returns `commit`, `build_at`, and **`storage_backend`** — so CI verification and the pre-draft checklist never need credentials. deploy-verify also **asserts production is on durable `blobs`** (a `file` backend live would mean ephemeral storage → silent redeploy data loss). `/api/version` kept as an alias.

### Deployment audit (2026-08-08) — CLOSED
1. **Repo vs live:** HEAD==origin/main, 0 unpushed. Live hash unverifiable from the sandbox (egress-blocked); now covered by `deploy-verify.yml` in CI. ✅ mechanism in place
2. **Subtree sync:** N/A — work commits directly to `github.com/cjsimms09/maga-league` `main`; no subtree split to lag. ✅
3. **Ledger persistence across redeploy:** ✅ **CONFIRMED PERSISTENT.** Prod uses durable Netlify Blobs; `ensureBackend()` **throws loudly** on Netlify rather than silently falling back to the ephemeral function FS. Ledger+archive survive redeploys; also in the weekly backup now. The draft-night-disaster scenario is structurally prevented.
4. **Deployed-build stamp:** ✅ this section, refreshed on deploy.

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
true pick order and my-pick numbers are correct.

**REBUILD DONE & VERIFIED (Aug 7).** The served board (`public/draft_data.json`,
built_at 2026-08-07T23:28:30Z) now carries `keeper_rules.cost_model=top_picks_flat`,
`kept_player_ids=[3198 Henry, 7564 Chase, 8151 Walker]`, `forfeited` rounds 1/2/3,
and `pick_order.my_picks = [34, 41, 54, 61, 74, 81, 94, 101, 114]`
(my_picks_before_keepers started at slot 4 = pick 4). First real pick is 34.
The pick-34 board supersedes every earlier pick-7 analysis. K0 is complete
end to end — decision + implementation + verified artifact — well ahead of the
Aug 19 output / Aug 20 lock deadline.

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
| 0 | **K0 keeper decision** | **✅ DONE — keep Chase/Henry/Walker; artifact rebuilt & VERIFIED under top_picks_flat; first pick 34** |
| 1 | Stabilization sprint | Phase 1 attribution WIRED (`pending`); robot mock GREEN |
| 2 | Small fixes (onesie / rail budget / config_confirmed) | **✅ DONE — all 3 shipped, tested, pushed (e134ac0/9b18eaa/0f4520f)** |
| 2b | Draft-day experience | AUDITED, pending |
| 2c | Cutting-edge data | AUDITED, pending (mostly ABSENT) |
| 3 | Backtest completion | DONE — verdict: projection too crude, Default stands |
| 4 | Calibration fixes | KOV CLOSED (connected, item 17 settled); adp_sd default stands (can't fit, projection-confounded) |
| 5 | Strategy selection | CONCLUDED — Default stands (backtest cannot select) |
| 6 | Exploitation | Section A fits CANNOT proceed; Section B intel VALID, pending |
| 7 | Final verification | PENDING |
| 8 | Freshness for draft day | PENDING |
| 9 | Close the record | PENDING |

## 🎯 DRAFT-NIGHT DEADLINE BOARD (Aug 22 — these cannot fall off)
Two mid-run specs inserted. Priority is by DEADLINE, not queue order. L1 and H
are HARD-GATED on Aug 22: if not live + robot-tested by draft night, the data is
lost forever.
| id | item | deadline | state |
|----|------|----------|-------|
| **L1** | Prediction ledger — append-only, decision-time writes, contamination rule (grading reads, never writes) | **Aug 22 HARD** | **✅ DONE, LIVE-VERIFIED, ALL 4 DEMANDS MET** — see check-off below |
| **L2** | Raw-forever storage — complete draft (all teams) + season archived raw | **Aug 22 HARD** | **✅ DONE** — immutable, content-hash-deduped archive (`src/rawarchive.js`); full Sleeper pick stream + board build snapshotted on sync; +12 unit checks |

### L1 check-off — the four verification demands (all met)
1. **Immutability probe** ✅ — every store path tried against entry 1: second append gets a new seq (never overwrites), a held reference can't mutate the stored prediction, the module exposes no update/delete/edit, a direct re-write is refused (`append-only`). (`predledger.test.js`)
2. **Coverage across kinds** ✅ — all six kinds (recommendation, pick, survival, override, lrm, run) write, each with its own `method` tag; all six wired into the client at their decision moments.
3. **Robot draft writes the ledger** ✅ — R7: a full simulated draft produces 2 entries/my-pick with **monotonic seq, zero gaps**, decision_at + method on every entry. (`robot-mock.js`, 43/43)
4. **Retention** ✅ — `pred:`/`raw:` added to the weekly backup; server-integration test proves the entry persists in the backing store and **survives a simulated redeploy**, and that backup enumerates both keyspaces.

Plus: **method/model_version tag** on every entry (LRM = `survival-snapshot-v0`, distinct from future `lrm-v1`) so a mid-season model upgrade never blurs grading.

_Note: the TE-TE top of board at pick 34 (Bowers 126.5 > McBride 74.6, 52-pt gap) — logged as a lead for the pick-34 dossier (Backtest-2 §3.4) to confirm/kill against history: is the last elite TE the scarcest asset after 30 keepers vanish?_
| **H** | Shadow rosters — every surviving strategy drafts live & silently; needs robot scenario | **Aug 22 HARD** | PENDING (after L1, before mocks) |
| **BT2** | Backtest Round 2 — Phase 1 (2025 recovery via pbp category diff) → corrected boards | pre-Sep | PENDING — launch in CI (background); prereq for S/N |
| **S** | Exhaustive strategy search (weight sweep, sequencing, counterfactual mining, oracle gap) | Sep certify | PENDING — CI compute; runs on BT2's corrected boards |
| **N** | Luck baseline — ≥500 permutation null searches; candidate must beat null-95th | Sep certify | PENDING — CI compute; embarrassingly parallel, shardable |
| L3–L6 | Calibration auto-refresh / dossier append / the Annual (cron) / hypothesis ledger | Sep-class | Capture hooks wire NOW; analysis waits |
| **AB** | Annual Button — SELF-IMPROVE.md + one-tap workflow that runs the gated improvement cycle & opens PRs | Phase 4 / Sep-class | **DRY-RUN GATED ON L2** — run the full dry-run acceptance test the moment L1–L2 are done, to prove the machinery before January (`docs/queued/annual-button.md`) |

**Pre-registered framing (locked):** the search RANKS and ELIMINATES; only the
Phase-N null baseline and Phase-H live shadow grading CERTIFY. Ledger writes at
decision time only. Nothing installs off a raw backtest ranking.

## 📅 SEASON READINESS — IN-SEASON MASTER calendar gates (starts Aug 23)
The in-season arsenal (`docs/queued/in-season-master.md`) is appended to the END
of the queue. **Do not start before the draft-critical items are locked and the
draft has happened (Aug 22).** On Aug 23 it becomes the master queue, worked
phase by phase, calendar-gated. Countdowns from today (2026-08-08):

| gate | date | ~days out | deliverable | state |
|------|------|-----------|-------------|-------|
| G1 | **Sep 8** | ~31 | Phase 1: in-season rankings 1.1 + waiver Lite 1.2 + Weekly Brief 1.3 + opponent capture 1.4 — live & robot-tested (week-1 waivers) | not started (gated) |
| G2 | **Sep 15** | ~38 | Phase 2: lineup optimizer v1 (2.1) + streaming engine (2.2) — live (week-2 lineups) | not started (gated) |
| G3 | **Sep 22** | ~45 | 2.3 playoff odds + leverage, 3.1 trade radar — live (week 3, panic window opens) | not started (gated) |
| G4 | **Oct 6** | ~59 | 3.1 full trade engine + 3.2 Vegas layer + 3.3 fragility/handcuff — live (week 5) | not started (gated) |
| G5 | Sep–Jan | — | Phase 4 compounding: quantile V, learning loop, watchdog, playoff-weeks mode; the Annual on a Jan cron | not started (gated) |

**Gate rule:** anything at risk of missing its gate ships the honest LITE version
at the gate, upgraded behind it — "a crude tool on Tuesday beats a perfect tool
on Thursday; waivers don't wait." Acceptance test for the whole phase: by week 6,
my routine is four touches (~10 min/wk) — Tuesday brief, waiver card, Thursday
micro-brief, Sunday alert. If a tool demands more, the surface is wrong.

**Dependency flag (2026-08-08):** of the four "committed specs" the in-season
master says to re-read, only **in-season rankings** exists as a doc. **Season-
readiness kit, Part 11, Part 12 are MISSING as documents** (see
`docs/queued/README.md`). Not a blocker — the master is its own fallback spec —
but flagged now, before their phases begin. This session's three master specs
are now committed under `docs/queued/` so a reclaimed container can't lose them.

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
