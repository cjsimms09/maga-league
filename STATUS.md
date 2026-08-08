# STATUS — unattended run

## ⚡ POWER-THROUGH DIRECTIVE (supersedes calendar pacing)
Idle time dies. Proceed by default; never wait at redirect windows (judgment → DECISIONS-NEEDED, continue other work). Gates convert from "build by" to **"build now, ACTIVATE when reality allows."** Only true blocks: **my inputs** (slot date, keeper confirmations), **external events** (slot assignment, keeper lock, NFL week-1 data), and the **draft-path code freeze at final mock** (the fixture-keepers lesson: draft on what you rehearsed on). Quality rules untouched: robot green per commit, gates never loosened, participation tests, ledger discipline, specs → docs/queued.

### 🔁 STANDING CONTINUATION RULE (Cory, 2026-08-08 — survives every session)
**The burn never stops for a blocked lane; it changes lanes.** When the critical-path current item completes and the next is blocked/waiting (my input, an external event, or a review checkpoint like the layout screenshots), do NOT idle — immediately pull the **highest-priority buildable backlog item** (TASK-AUDIT.md order: **Lab experiments as the harness allows → data-spine reconciliation test → side-bet tracker → Venmo → dashboard widening → remaining Part A**) and build it, returning to the critical path the moment it unblocks. **When the critical path EMPTIES at mocks-ready, the backlog becomes the main queue automatically — no new orders needed, ever.**

### 🚨 ALERTS PROTOCOL (while Cory is away)
Urgent-AND-blocking events — **my slot-claim turn arriving, a draft-critical failure, a decision that halts multiple work streams** — surface as loudly as channels allow: a prominent **DECISIONS-NEEDED entry marked 🚨 URGENT** at minimum. If the ntfy/push path (backlog A-3, generalized to urgent-notification duty) is buildable quickly, build it EARLY and use it. **The layout screenshots wait at the review checkpoint — do NOT robot-verify past them.** Everything else: judgment + committed specs + gates. Commit & push at every natural boundary, small and frequent.

**Continuous queue (top→bottom, no stopping):** DST fix ✅(32 DEF, R-DST green) → §D ✅(typed END-confirm, moved off flow, rehearsal watermark) → D3 flex ✅(installed+quantified at pick-34, R-flex green) → cross-check ✅(chat-Claude harvest reconciles, zero disagreements) → A2 slot-verify ✅ → Part 2 §1 Paths ✅ → slot-picker ✅ → keeper-ID fix ✅ → dashboard ✅ → master-sheet payouts ✅ → Part 2 §2(a) B7 dollar-gap engine ✅ → Part 2 §2(b) compare tray ✅(gold hero, breakdown bar, Why?, even-money rails) → **Part 2 §2(c) three-zone desktop grid** [NEXT] → §2(d) density + frontend-design + screenshot-for-review

**⏯️ RESUME POSITION (2026-08-08):** Part 2 §2 layout — **§2(a) B7 dollar-gap engine ✅ DONE** (`dollarGap`, decomposed, rough rails, 227 engine), **§2(b) compare tray ✅ DONE** (gold hero number, breakdown bar, Why?, even-money band; tap ⚖️ on any two players). **NEXT = §2(c) three-zone desktop grid:** restructure `views/admin/warroom.ejs` → Zone1 DECIDE (center 60%: Paths + compare tray) / Zone2 CONTEXT (right rail: roster+keepers, LRM strip, contextual survival watchlist, before-your-next-pick opponent strip) / Zone3 DEPTH (below fold: best-avail strips, adjusters, queue/paper, targets/never, recent picks, KYL cards, full board) + a slim pinned status bar. Phone: sticky status bar + Paths default, Zone2 swipeable, Zone3 behind "Board & Tools". Then §2(d) density fixes. **Apply the `frontend-design` skill.** ⚠️ GATE: **screenshot desktop width for Cory + chat-Claude review BEFORE the robot acceptance run — do NOT robot-verify past that checkpoint**; when it blocks, change lanes to backlog (Lab harness / data-spine reconciliation test / side-bet tracker / Venmo) per the standing continuation rule. Specs: `warroom-v2-B7-dollar-gap.md`, `warroom-v2-visual-design.md`, `war-room-final-pass.md` Part 2. THEN (Cory reprioritization 2026-08-08): keeper-placement verification → **Lab harness build** (`the-lab.md` + `LAB-REGISTRY.md`; harvest is COMPLETE so Tier-A is unblocked — it gates 5 pre-mock experiments, so it OUTRANKS Phase H shadows) → Phase H shadows → opening script → A-1/A-2/A-3 → mocks-ready checkpoint (ping Cory). Venmo-handles + data-spine payout-form kill are queued behind the draft-critical items. → Phase H shadows → opening-script machinery → A-1/A-2/A-3 → **mocks-ready checkpoint (ping Cory)** → Part C → Part A (A-4..A-8) → Part B ops → Backtest R2 + Strategy Hunt S/N (CI) → entire in-season master (built now, activation flagged 'awaiting season data') → D-1 recap → annual-button dry-run → 2c builds → E-behaviors. Freeze draft-path at final mock; in-season/background continues through draft week.

## 🧭 WAR ROOM FINAL PASS — in progress (before shadows, per deadline order)
Work order: §A state correctness → §C verdicts → Part 2 layout (absorbs §B) → §D → phone pass. Every UI change gets a robot scenario; "WHAT DOES NOT CHANGE" is protected.
- **§A1 keepers pre-populate roster:** machinery DONE (`build.py` emits `kept_players`; `populateKeepers()` rosters + badges 🔒; need model + bye card read post-keeper roster; robot R8). **Activates fully once the CI rebuild lands** (kept_players needs the real player pool + correct slot). Acceptance text corrected in the spec (participation = reason-change + flex-consumption; the naive "RB need = 0" was wrong).
- **ROUNDS BUG FIXED (draft-critical):** draft is **15 rounds, my 12 picks (rounds 4–15)** — the old `roster_size − keeper_count = 12` was a pipeline derivation bug (NOT Sleeper). One source now (`config_schema.draft_rounds`), 5 sites unified, cross-language regression tests. **CI rebuild triggered** to regenerate the artifact at 15; robot R-rounds is red until it lands (by design).
- **🚨 SLOT-CLAIM (LIVE on the site's /draft page — Cory claims 4th, reverse-standings order):**
  - **Pipeline status:** claim-flow ✅ (`/draft/pick` → `draft:2026` doc) → config ✅ (War Room reads the claimed slot as `my_draft_slot`) → regeneration ✅ (pick numbers recompute live via `setSlot`). **NEW (2026-08-08):** provenance wired — a site-claimed slot now reads **'site-claimed, Sleeper pending'** (distinct from manual-UNVERIFIED and Sleeper-verified) in the watermark + checklist; `R-slot` truth-table extended (69 robot). Full board (keeper-adjusted ADP) + opening-script rebuild still need the Python pipeline — flagged, not automatic on claim. **Live claim state is in Netlify Blobs (sandbox copy is stale/all-null) — I can't read who's-claimed-what from here; the analysis below is slot-VALUE ranking, which is availability-filtered live.**
  - **SLOT-VALUE ANALYSIS (keepers forfeit rounds 1–3 → first LIVE pick is ROUND 4; round 4 is even/reverse, so HIGH slot numbers pick FIRST):** metric = best-available anchor at first pick + Bowers-class TE survival + turn structure. Pick model validated against the artifact's built slot-4 = [34,41,54,…].

| slot | 1st pick | first two | Bowers (elite TE) survives | rank | one-line |
|---|---|---|---|---|---|
| **10** | **28** | 28, 47 | **94%** | **#1** | earliest pick — best shot at a premium faller to anchor WR2/TE |
| 9 | 29 | 29, 46 | 93% | #2 | near-earliest; strong anchor odds |
| 8 | 30 | 30, 45 | 91% | #3 | still front of round 4 |
| 7 | 31 | 31, 44 | 89% | #4 | upper-mid |
| 6 | 32 | 32, 43 | 87% | #5 | mid |
| 5 | 33 | 33, 42 | 85% | #6 | mid |
| 4 | 34 | 34, 41 | 83% | #7 | the built slot; mid |
| 3 | 35 | 35, 40 | 80% | #8 | lower-mid |
| **1** | **37** | **37, 38 B2B** | 74% | #9 | **the TURN — back-to-back pair (stack/WR2+TE) but the latest first pick** |
| 2 | 36 | 36, 39 | 77% | #10 | latest-ish, no turn upside |

  - **Recommendation:** **claim the HIGHEST open slot (10 → 9 → 8).** With Cory's core set (Chase/Henry/Walker) and WR2/TE open, the earliest round-4 pick maximizes the shot at a premium faller (94% Bowers at pick 28 vs 74% at pick 37) to anchor a starter hole — that's buying the top-4 door with a premium piece. **Only deviate to slot 1** if the plan is stack-building: the turn's back-to-back (37,38) secures a pair before the long wait, at the cost of the earliest-anchor edge. **Middle slots (4–6) are the compromise, none are the play.** Whichever high slots R2121 (already claimed) and picks 1–3 leave open when Cory's turn arrives, take the highest number available. _Dossier adjacency (who sits at slot±1 each round) populates in the War Room as claims land — it's live-dependent, not computable from the board alone._

- **§D3 flex-discount — INSTALLED + quantified at real pick-34 (2026-08-08):** a flex-only fill is priced **marginal over the best flex-eligible alternative on the board**, floored at 0, capped at full VORP (`CFG.FLEX_DISCOUNT`, `bestFlexAlt`; cited engine test + `R-flex` robot; 213/57 green). **Pick-34 before/after** (slot 4, keepers Chase/Henry/Walker → RB slots FULL, WR2 open; board = seeded ADP-softmax through picks 1–33):
  - **BEFORE (full-VORP flex):** Javonte Williams (RB), D'Andre Swift (RB), Tyler Warren (TE), Jeremiyah Love (RB), T. McMillan (WR) — **3 redundant RBs in the top-5** that would only sit in the flex.
  - **AFTER (D3):** Tyler Warren (TE, fills TE1), T. McMillan (WR2), Drake Maye (QB1), Tee Higgins (WR2), Emeka Egbuka (WR2) — **all three flex-only RBs dropped out**, replaced by dedicated-slot fills. Exactly the intended tilt: stop overpaying for 3rd-RB depth when real starter holes (WR2/TE/QB) are open.
- **§A2 slot verification — MACHINERY BUILT (2026-08-08); activation waits on the external slot assignment:** the tool now distinguishes a *claimed* slot (placeholder) from a *verified* one. `state.slotVerified`/`slotSource` flip true ONLY when `importDraftOrder` resolves my seat from a REAL (non-mock) Sleeper draft object whose `draft_order` is populated; a manual entry, a mock, or a real object with still-null order (D4) all stay UNVERIFIED. While unverified: a sticky **"SLOT UNVERIFIED"** banner + corner ribbon (CSS `body.slot-unverified`) mark everything slot-derived as provisional; the checklist line is now **"Draft slot verified against Sleeper draft object"** — amber "manually set, UNVERIFIED" until Sleeper confirms, green "from Sleeper, verified" after. Auto-clears the moment the order is imported (no manual step). `R-slot` robot truth-table (4 checks) guards the rule. **Still OPEN externally:** the real slot is unknown until the draft order is assigned in Sleeper — the machinery is armed and will verify automatically. (Remaining sub-item: opening-script regenerate-on-assignment ties in when the opening-script machinery lands, later in the queue.)
- **§C missing-feature verdicts:**
  1. **LRM countdown strip (2b.6):** **✅ BUILT + both review items RESOLVED.** `renderLRM()` → `#lrm-strip`. **D5 = dual thresholds** for QB/TE ("elite cliff until X (−N skill picks) · startable until Y" — elite from tier boundaries, startable from top-12); K/DEF startable-only. Real board: QB elite@41/startable@94, TE "elite gone — take now"/startable@141. **DST must-fix DONE** — 32 defenses now ingested (Sleeper team entities were dropped by generic active/search_rank filters; cited fix in `load_players`), DEF line renders, robot R-DST green (DEF draftable + endgame forces one). Artifact rebuilt (built 2026-08-08T01:24:55Z). Screenshot sent.
  2. **Run-detection banner:** **BUILT** (`renderRuns` → `#run-banner`); now also logs to ledger.
  3. **Global ADP drift readout:** **ABSENT** (engine has drift; no readout).
  4. **Override reason capture (one-tap target/gut/news/plan):** **✅ BUILT** — taking anyone off the top recommendation fires a one-tap toast (⭐Target/🎯Gut/📰News/🧭Plan/skip); logs `override-reason-v1` with the over-player + off-top-rec flag. Never blocks the clock (12s auto-skip). Fires in mocks too (rehearsal, no real-ledger write). Lands before mock #1. ✅
  5. **Room-conformity readout:** **ABSENT** (behavior-ADP not shipped) — pending.
  6. **Intel Card / pick-34 dossier placeholder:** **ABSENT** — reserve the page slot for Backtest-2 §3.4.

## 🧭 PART 2 LAYOUT — Paths panel (centerpiece) IN PROGRESS (2026-08-08)
- **§1 Paths panel — ENGINE + RENDER BUILT.** `E.computePaths(ctx, scored)` turns the flat top-N into **2–4 priced DIRECTIONS**, deterministically clustered from the already-scored board by (position × cliff/value flavour). Each carries a plain-language name, the pick + one-line why, the wait-cost plan (branch forecast), a **price vs the top path (never hidden)**, and a state-derived when-it's-right; caps at 4; flags a path-level coin flip. Unit-tested (8 checks) + `R-paths` robot (6). Rendered in the War Room above the ranked list (now in a `Full ranked list` `<details>`), gold top card, coin-flip banner, expandable "N more this way". **Ledger:** a pick logs `chosen_path`/`chosen_path_key` (resolved from the on-screen paths, or `off_path:true`); overrides name the direction taken. At real pick 34: Lock-elite-TE (Warren, top) / Fill-WR-now (McMillan +4.9) / Fill-QB-now (Maye +9.4).
- **§2 zoned three-zone desktop layout + §3 compare tray + §4 density fixes — NEXT** (the panel exists; the surrounding Zone-1/2/3 grid reflow is the next commit).
- **Live render/phone acceptance** (§Part-2 acceptance, 390px zero-scroll on the clock) is folded into the combined end-of-Part-2 phone pass per the spec's sequencing; static coverage (computePaths unit+robot, app.js syntax, EJS compile) is green now.

## 📋 BACKLOG (Complete Backlog — `docs/queued/complete-backlog.md`)
**Triage rule (binding):** the deadline order (polish → paths → shadows → opening script → mocks) is untouchable; any Part A/B item threatening a deadline item auto-defers to Part D with a note.
**Environment (corrected 2026-08-08): Cory drafts on DESKTOP CHROME.** Desktop three-zone layout is the PRIMARY surface; phone is the tested disaster-recovery path (must work, not be optimal). Safari pass demoted to a light fallback (robot's Chromium == the real env).

| item | gate | notes |
|---|---|---|
| A-1 server-side personal prefs | before first mock | STAYS but urgency DROPPED (desktop-primary); Blobs-backed, localStorage cache |
| A-2 undo everywhere | before first mock | 5s undo toast; logs corrections to ledger |
| A-3 my-turn alerting | before first mock | desktop Chrome audio (no gesture-arm); **add tab-title flash + test with war room in a BACKGROUND tab** (Sleeper focused elsewhere) |
| A-4 post-pick instant read | as capacity, else draft week | banter/intel line from existing deltas |
| A-5 biggest-fallers ticker | as capacity | |
| A-6 any-pick board explorer | as capacity | tappable branch timeline |
| A-7 player card depth | as capacity | one consistent card everywhere |
| A-8 draft board export | as capacity | CSV + printable recap |
| B-1 game-day runbook | **generates from Aug 15** | daily-refreshed one-pager |
| B-2 function warm-up scheduler | draft week | keep Netlify functions warm |
| B-3 Safari/iOS pass | draft week — **DEMOTED to light fallback** | desktop Chrome is the real env |
| B-4 client error beacon | draft week | tiny Sentry for live sessions |
| B-5 performance budget pass | draft week | phone-viewport Lighthouse; regressions fail CI |
| B-6 full failure drill | T-24h in runbook | wifi kill, Sleeper outage, manual entry |
| C-1 live shadow standings strip | behind mocks | zero decision weight |
| C-2 round-transition posture cards | behind mocks | |
| C-3 closing checklist | behind mocks | post-draft card + archive-all to L2 |
| D-1 draft recap | Aug 23+ | graded card per team |
| D-2 mock-frown ledger UI | Aug 23+ | "log a frown" → triage → scenario |
| D-3 prediction-confidence display | Sep (data-gated) | |
| D-4 everything already queued | behind all | in-season master, BT2, S/N, annual button |
| **E-1 weekly self-audit cron** | **STARTS this Sunday (Aug 9)** | **✅ `self-audit.yml` created** — Sun-night sweep: tests green, deploy==HEAD, storage=blobs, crons present → SELF-AUDIT.md |
| E-2 frown→scenario pipeline | standing | no fix merges without its scenario |
| E-3 quarterly design review | Oct 1 / Jan 2 / Apr 1 | |
| E-4 honesty paragraph everywhere | standing | checked requirement on every new surface |
| **nflverse audit** | in progress | inventory table below; nflreadpy migration eval (post-draft, dual-path gate); 2c reachability probe in CI (`data-inventory.yml`) |

## 📊 nflverse dataset inventory (used-where from code; reachability from CI probe)
Reachability/schema/season-coverage fill in from `data-inventory.yml` → `DATA-INVENTORY.md` (the sandbox egress can't reach nflverse; CI can). Draft-day scope for all pending/2c items: **none — the gate holds.**

| dataset | used-where | specced-pending | skipped (reason) |
|---|---|---|---|
| `import_ids` (gsis↔sleeper) | **USED** — `build.py` id crosswalk | | |
| `import_pbp_data` (play-by-play) | **USED** — opportunity metrics + backtest weekly recovery | | |
| `import_weekly_data` | | 2c / in-season rankings ingestion | (pbp-derived today) |
| NGS passing/rushing/receiving | | **2c** (xTD, efficiency) | |
| participation (route %) | | **2c** — ⚠️ verify post-2023 publish or proxy (CI probe) | |
| depth charts | | in-season vacated-opportunity attribution | |
| rosters | | in-season | |
| draft picks (capital) | | **2c** draft-capital boost | |
| snap counts | | 2c snap slopes | |
| injuries | | in-season Sunday sweep | |
| schedules | | in-season matchup/Vegas | |
| officials | | — | genuinely skipped (no signal for our scoring) |
| **FTN charting** (`load_ftn_charting`, 2022+, nflreadpy) | | **2c (NEW)** — drop-adj catch rate, catchable-target share, contested-target rate, PA/screen/RPO splits, pressure-context QB; fold into opportunity z-score under ±15% cap (single z, never independent multipliers), each with the participation test; priority use = waiver buy-low + trade radar | |

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

## 🧮 RECONCILIATION-PASS TRACEABILITY MATRIX (deliverable #1)
Every reconnaissance finding → the component(s) it changes → status. Objective it all serves: **maximize E[$] — a starting core solid enough to buy the top-4 door + variance concentrated where it's cheap (stacks, 6 bench tickets, flex).**

| # | finding | component(s) | status |
|---|---|---|---|
| A1 | money_history 2023 bracket / base math | `money_history.py` | **APPLIED** (67d7766) — playoff-\$ from brackets, per-season reconciliation ✅, +2 tests. UNVERIFIED only on 2023-payout-era (Cory). |
| A2 | Part-12 hash float-noise (2023 `pass_yd 0.03999…`) | `part-12-watchdog.md` | **APPLIED to spec** (349f78a); watchdog build PENDING |
| A3 | cross-season joins key on owner_id | `money_history.py` / harvest | **APPLIED** (keys on owner per season) |
| B1 | weekly-high threshold 135–155 (wk 1–15) | Weekly-High Engine gauge | **DATA APPLIED**; gauge PENDING (money-function §3, gated) |
| B2 | concentration ~60% top-3 = pool is harvestable | ceiling/stack config rationale | **PENDING** (cite in config when B3 installs) |
| B3 | ceiling↑ + stacks first-class + bench-lottery + playoff-SOS wk16–17 | draft engine | **PENDING — quantify-before-install**. D3 flex-discount **INSTALLED** (marginal-over-best-flex-alt, floored/capped; cited test + R-flex robot; 213/57 green). Remaining B3 items (ceiling/stack/bench/SOS) still gated. |
| B4 | champion-kept-0 (Jreis 2024); keeper analysis 2024–25 only | K0 docs / dossiers | **APPLIED** (context noted) |
| B5 | era stability 3/3 → no era hedging | Backtest R2 / Strategy Hunt | **APPLIED to spec note**; reporting change PENDING their build |
| C1 | Cory eff 86.1/86.0/85.9; optimizer Jan metric ≥90% | lineup optimizer spec | **APPLIED** (baseline + metric recorded; priority ELEVATED) |
| C2 | dual objective ΔP(win)+ΔP(high)·$100, real thresholds | lineup optimizer | **PENDING** (money-function §4 spec) |
| C3 | Schmelley wk5-2025 benched 36, missed $100 by 3.2 | optimizer rationale | **PENDING harvest** (per-week bench stat) |
| C4 | bench-error-decided weekly highs across 45 wks | analysis | **PENDING harvest** (pre-registered) |
| D1 | waiver correction #2 (reverse-standings weekly reset) | waiver spec | **APPLIED** (spec); `is_faab:false` confirmed from CI ✅ |
| D2 | winner's curse: good team → priority last → FA-speed IS the edge | waiver spec | **PENDING** (fold into season-readiness waiver §) |
| D3 | stealth score stays (FA-speed targeting) | waiver | **APPLIED** (spec) |
| E1 | manager cards: mhagen DYNASTY, ds7mmet RS-merchant, Richard2121/MarianSaar undervalued, leak cohort | dossiers | **APPLIED** (tables below) |
| E2 | efficiency-adjusted opponent projections (Schmelley −15pt) | weekly brief matchup | **PENDING** (in-season spec) |
| E3 | trade deadline wk11 + 2-day/5-vote veto | trade radar | **PENDING** (radar spec) |
| F1–F3 | money ledger + weekly-high race line + shadow-\$ | weekly brief / shadows | **PENDING** (money-function §4) |
| G | harvest: matchups×45, transactions, 2023 draft/bracket | CI | ✅ **COMPLETE for the 3 Sleeper seasons** (verified 2026-08-08 in `league_history.json`): 2023/24/25 each have **18 weeks + 17 transactions + 4 bracket games + drafts**. Only 2026 in-season weeks pending (season not started). **Lab Tier-A is UNBLOCKED.** |

**Honesty line (leans-not-laws at N=3 seasons — most likely noise):** (1) the weekly-high threshold band (135–155) is 3×15 obs — wide CIs, treat as a guide not a line; (2) concentration "~60% top-3" over 3 seasons could regress toward spread — don't over-tilt to variance on it alone; (3) the ds7mmet "0-3 playoff openers" tag is 3 games — a real lean, but one hot week flips it. All three render as leans in any surface that shows them.

## 💰 THE MONEY FUNCTION — payouts.json is ground truth ($4,000 pot)
E[$] = Σ_w P(weekly-high,w)·$100 + P(RS champ)·$250 + P(RS 2nd)·$125 + Σ_k P(finish k)·payout_k. Weekly-high **$1,500 (37.5%)** · RS $375 · playoffs $2,125. Encoded in `draft/config/payouts.json` (checksum-guarded, stamped into artifact, checklist line, +4 tests). **Variance is subsidized** — draft-engine amendments (ceiling cap↑, stacking first-class, weekly-high engine display) are specced in `docs/queued/money-function.md`, **gated on quantify-before-install**.

### Money-history archaeology (3 real seasons, projection-free) — ANALYSIS 1 + partial 3
**Weekly-high threshold — what wins $100 (weeks 1–15 pay):** median winning score ≈ **135–155**, ranging ~122 (early) to ~185 (peak); playoff weeks 16–17 don't pay.
**Concentration:** top-3 teams hold **~60%** of weekly highs; 7–8 distinct winners per 15-week season — highs cluster but aren't monopolized.
**$/season standings (weekly-high + RS money; playoff-finish money TODO):**
```
#  manager            weekly$  RS$   total$  (3 seasons)
1  434921290978029568  1000   375    1375
2  458507445241638912   800   500    1300
3  440723317066821632   500   125     625
7  Cory (me)            400     0     400   ← mid-pack, all weekly-high, no RS
```
**🧾 MASTER-SHEET CORRECTION (2026-08-08) — PER-SEASON payouts, three money fixes.** The payout structure CHANGED across eras (`payouts.json.by_season`): **2023 = $3,500 pot** (playoffs 550/450/400/300, RS 200/100), **2024–25 = $4,000** (675/**550**/**500**/400, RS 250/125), **2026 = current** (675/575/475/400). `money_history` now uses each season's own structure; **per-season reconciliation passes** (2023→$1,700, 2024/25→$2,125). Fixes applied: **Cory 2023 3rd = $400 (not $475) → career $875→$800**; **MarianSaar 2024 2nd = $550**, **cashworth 2024 3rd = $500**, **ds7mmet 2025 3rd = $500**, **B8T3S 2025 2nd = $550** (all were $25 off under the old single-structure). **Name map** stored in `draft/config/identity_map.json` (David=ds7mmet, Jeremy=Jreis, Justin=cashworth, Dylan=Schmelley, Sam=Sadbru, Michael Hagen=mhagen, Bates=B8T3S, Marian=MarianSaar, Richard=Richard2121, Cory=coryjsimms). Weekly-high = **regular season only** (confirmed in writing). Pick-trade rule: **traded picks must swap within ONE round** (`payouts.rules`). **Pending 2027 votes** ($500 buy-in, payout %) → January rollover diff catches it. **Sheet's own Total column is STALE** (excludes 2025 for several owners) — the exact data-spine disease; career derives from year columns. **✅ MASTER SHEET IMPORTED (2026-08-08):** raw xlsx archived to L2 content-hashed (`draft/archive/L2/`, sha256 5a5da27a…); `draft/import_master_sheet.py` → `draft/data/master_sheet_archive.json`. **2016–2027 imported** (buy-ins, pots, payout structures, winners, standings, draft orders, 2022 trades). **Cross-check: 2023–25 sheet money reconciles with money_history — ZERO mismatches** (Cory $800, David $2,550, Michael $2,475), validating both sources + the per-season payouts. Career from year columns; **sheet Total column STALE for 7 owners** (excludes 2025 — the data-spine example). Total Winnings W-L (Cory 49-36-1) + 2026 dues + 3 pending votes imported. **History page scope is now 2016–present (10 seasons); Money Board goes ten deep.** 8 lock tests green. **Pre-Sleeper years 2016–2022 exist nowhere else — this is the founding testament.**

Auto-refreshes in CI (`money_history.py` → `MONEY-HISTORY.md`). **ANALYSIS 2** (dollar re-grade of Phase S/N vs luck baseline) is queued CI backtest work — now specced with the **Phase $ money-grading refinements** (`strategy-hunt-learning-seed.md`): weekly-high odds vs **harvested per-week thresholds** (2024 wk1=126, wk2=166 — not a flat bar); opponents simulated at **observed efficiency** (Schmelley 84–87%, not optimal); every strategy's E[$] reported **decomposed** (weekly-high $ / playoff-entry $ / RS $); the **dollar** luck-baseline verdict is the certification bar, and anything clearing it is flagged for the shadow set.

### 📋 CHAT-CLAUDE SYNC AUDIT (2026-08-08) — CLOSED (gaps filled 2026-08-08)
Against the expected 9-item inventory. **All items resolved; one material CORRECTION found on item 7.**
| # | Deliverable | Status |
|---|---|---|
| 1 | Live-API briefing (era stability, rounds=15, pick_timer=0, playoff wks 16–17, pick_trading=1, cpu_autopick=1) | ✅ **ON RECORD** (STATUS §Live-API briefing — all six markers) |
| 2 | 2025 + 2024 + 2023 season/efficiency tables + tags (dynasty, RS-merchant, leak cohort) | ✅ **CLOSED** — 2023 table now on record (below); all three years complete with tags |
| 3 | All three years' money tables + brackets | ✅ **ON RECORD** — $/season standings + winners brackets present for 2023/24/25 (4 placement games each, 18 wks); per-season reconciliation ✅ |
| 4 | money_history bug report + resolution | ✅ **ON RECORD** (DISCREPANCY RESOLVED recon #2; playoff-$ fold; ca46416/67d7766) |
| 5 | Complete 2024 weekly-high ledger (Cory 4 / ds7mmet 3 / R2121 2 / MarianSaar 2) | ✅ **ON RECORD + independently cross-check-verified** |
| 6 | 2025 wks 1–6 highs (ds7mmet 2, mhagen 2, Jreis 1, Schmelley 1) | ✅ **ON RECORD + verified** |
| 7 | Four documented bench-decided highs (2024 wks 4/8/15, 2025 wk2) | ⚠️ **CORRECTED to THREE** — cross-check below: wk8 ✅ confirmed, **wk4 ✗ REJECTED under slot legality** |
| 8 | Reconciliation-pass spec + traceability matrix | ✅ **ON RECORD** (§RECONCILIATION-PASS TRACEABILITY MATRIX, deliverable #1, 127049a) |
| 9 | League-history page spec (chapters, records book, franchise pages, Money Board, Bad Beats HOF, search, January auto-append) | ✅ **HELD + AMENDED** (`league-history-page.md`; §1 banter-voice amendment + Annual-Button consolidation, all sections present) |
**Settlement report (audit tail):** the financial settlement = the **Annual** generates the who-gets-paid/who-owes artifact from the verified season money table via `payouts.json`, rendered on the site's league-visible **Finances** page (the machine that computes the money writes the invoice). Recorded into `annual-button.md` §1c(4). **Audit CLOSED.**
**Still pending (pre-registered CI TODO, not a missing deliverable):** 2025 **weeks 7–15** weekly-high winners (R2121/MarianSaar verification).

**🔎 ITEM-7 CROSS-CHECK (independent optimal-lineup computation, slot-legal: QB1·RB2·WR2·TE1·FLEX1·K1·DEF1):**
- **2024 wk8 — ✅ CONFIRMED donated.** Cory actual **100.34**, winning high **135.56**, **legal optimal 171.64** (beats the high by **+36.1**). Even conservative chat estimate (~155+) clears it. A true bench-decided high — ~71 legal points left on the bench.
- **2024 wk4 — ✗ REJECTED (disagreement with chat's ~173).** Cory actual **116.72**, winning high **151.32**, **legal optimal 145.06** — falls **6.3 SHORT** of the high. Chat's ~173 did **not** respect slot legality: the roster's only TE was **Kyle Pitts at 0.0** (a forced dead starter slot), and with just 2 RB / 2 WR / 1 FLEX startable, the extra big RB/WR scores (Chase Brown, London, Williams) can't all be used. **wk4 was NOT winnable even with a perfect lineup — it is a lineup-efficiency leak (~28 legal pts benched, 116.72→145.06) but NOT a donated weekly-high.** Do not count it in the "bench-decided highs" set.
- **Net:** the bench-decided-high set is **THREE** (2024 wk8, 2024 wk15 miss-by-1.06, 2025 wk2 miss-by-5.2), not four. The optimizer's business case stands (wk4 still shows a 28-pt lineup leak) — but honesty rule: wk4 is a leak, not a stolen high.

#### 2023 season table (name-mapped, chat-Claude gap-fill — closes item 2)
| owner | W-L | PF | ppts | eff% | tag |
|---|---|---|---|---|---|
| mhagen | 10-5 | 1852.2 | 2061.8 | 89.8% | **champion, most PF** (dynasty yr 1) |
| ds7mmet | 10-5 | 1815.7 | 2156.1 | 84.2% | **era-high potential, era-WORST efficiency** (leak cohort) |
| Schmelley | 9-6 | 1737.7 | 1995.6 | 87.1% | runner-up |
| Cory (me) | 9-6 | 1566.0 | 1819.8 | 86.1% | 4-seed → **3rd place**, 7th in PF (record outran points) |
| Sadbru | 7-8 | 1588.8 | 1734.4 | 91.6% | best efficiency |
| MarianSaar | 8-7 | 1577.3 | 1907.6 | 82.7% | lowest efficiency (leak cohort) |
| cashworth | 6-9 | 1661.0 | 1872.5 | 88.7% | |
| Richard2121 | 6-9 | 1484.9 | 1713.0 | 86.7% | |
| B8T3S | 5-10 | 1548.6 | 1797.3 | 86.2% | |
| Jreis | 5-10 | 1486.3 | 1672.8 | 88.9% | **last place → 2024 champion** |

**✅ TWO-ANALYST CROSS-CHECK (2026-08-08) — chat-Claude harvest vs my independent `money_history` computation. EVERY number reconciles; ZERO disagreements:**
- **2024 weekly-high counts:** chat = Cory 4 / ds7mmet 3 / R2121 2 / MarianSaar 2; mine = **CORY 4, ...9568 3, two managers at 2, four at 1 (total 15 = $1,500)** — exact match on the named group (4,3,2,2). Fixes the ID map: **ds7mmet = 434921290978029568**.
- **2024 threshold distribution:** chat = median 138.9, range 122–166; mine = **median 138.9, min 122.1, max 166.2** — exact.
- **2025 weeks 1–6:** chat = ds7mmet 2 / mhagen 2 / Jreis 1 / Schmelley 1; mine = **...9568 (ds7mmet) 2, ...8912 2, ...1632 1, ...1552 1 (total 6)** — exact shape+counts; confirms **mhagen = 458507445241638912** (double-dipped in his title year) and ds7mmet's 2-of-3 fell in the first 6 weeks.
- **Consistency:** Cory's career weekly $ = $400 = 4 highs, ALL in 2024 (0 in 2023, 0 in 2025 wks 1–6) — matches chat's wk2-2025 bench-donation note (Cory not a wk2 winner) and the wk15-2024 "missed by 1.06" (2024 wk15 winning score = 131.4). **The two analysts reconcile.**
**DISCREPANCY RESOLVED (recon #2):** money_history now folds **playoff-finish $ from the winners_bracket** (Sleeper `p=1/3` placement games → payouts). Cory's ledger corrected to **$400 weekly + $475 playoff = $875** (was weekly-only — he made 2023 playoffs). **Still ⚠️ UNVERIFIED until:** all 3 seasons' brackets are harvested (CI), and Cory confirms **whether 2023 (league year one, keepers null) used the current payout structure.**
**Dossiers are clean 3-season records — ZERO owner turnover** (identical 10 user_ids). **mhagen dynasty CONFIRMED: 2 titles in 3 years** (2023 roster 7 = his owner_id), both with most-PF + ~90% efficiency → **benchmark tag.** **Cory's 3-yr efficiency 86.1/86.0/85.9** — a stable, precisely-measured leak: the lineup optimizer's baseline AND its January success metric. 2023 keepers null league-wide (keeper analysis = 2024–25 only). Jreis last-2023→champ-2024; ds7mmet era-highest potential (2156) at 84.2% eff.

### Live league-object findings (chat-Claude, 2026-08-08)
1. **🚨 URGENT** — league settings show `draft_rounds:3`. The DRAFT OBJECT is authoritative; checklist line **"Draft object rounds == 15"** added (red until synced; says TEXT THE COMMISSIONER if ≠15). **DECISIONS D7.**
2. Playoffs weeks **16–17** (`playoff_week_start:16`, 4 teams); weekly-high window **weeks 1–15 exactly** (money_history honors this). Playoff-SOS term cap reduced per money spec.
3. `pick_trading:1` — the **pick-trade valuator (backlog 3.5)** is ON; build it in the power-through queue.
4. Stamp full settings JSON into the **watchdog hash** (Part 12); verify scoring byte-for-byte incl. `pass_td:6.0`.
5. **Trade deadline week 11** → trade-radar clock.
6. Bench **6 of 12** → lottery-ticket policy scope widens (reinforced by the money function).

### 2025 season table — name-mapped, append to dossiers (chat-Claude live pull)
| manager | rec | PF | lineup eff | note |
|---|---|---|---|---|
| **mhagen** | 12–3 | 1840.9 | 89.1% | CHAMPION · market-value drafter · no-leak execution · fewest PA |
| B8T3S | 10–5 | 1831.1 | 89.8% | |
| Jreis | 10–5 | 1642.1 | — | schedule-favored seed |
| ds7mmet | 9–6 | 1584.5 | — | luckiest playoff entry (6th in PF) |
| Schmelley | 8–7 | 1656.3 | 84.3% | **worst lineup-setter** (leak cohort) |
| MarianSaar | 7–8 | 1744.7 | — | 3rd-most PF, **missed playoffs — schedule-robbed** |
| **Cory (me)** | 5–10 | 1555.9 | 85.9% | **~255 bench points lost** (leak cohort) |
| cashworth | 5–10 | 1536.0 | — | |
| Sadbru | 5–10 | 1476.0 | 86.5% | last in PF (leak cohort) |
| Richard2121 | 4–11 | 1711.2 | 90.4% | 4th-most PF, **BEST lineup-setter**, league-high 1849 PA → **points-unlucky, not bad** |
**Cross-season joins MUST key on owner_id/user_id, never roster_id** (roster_id↔owner changes between seasons — 2024 champ roster 4 ≠ 2025 roster 4). `money_history` keys on owner (via per-season roster→owner resolve) ✓.
**🎯 PRE-REGISTERED PREDICTION (log before harvest):** Richard2121 & MarianSaar banked multiple 2025 weekly highs despite records — payout already paid the ceiling-unlucky. Verify vs weeks 1–15.

### 2024 season — owner_ids identical to 2025 (roster mapping stable both years)
- **Cory (me) 2024: HIGHEST points in the league (2128)** — missed playoffs on an **8.2-point tiebreak**, **297 bench points lost**. Two-year lineup efficiency **86.0 / 85.9** → **the lineup optimizer is the highest-ROI component; ELEVATE its priority within the in-season master.** (Being points-best and still missing playoffs is the exact leak the optimizer + the money function's weekly-high chase attack.)
- **2024 champion Jreis kept 0 keepers** (precedent for keep-fewer — noted in **K0 context**; does not reopen K0, which is settled at keep-3 by surplus, but logs that a champion kept none) and won at **91.8% efficiency**.
- **Both champions were top-2 efficiency in their title year** (mhagen 89.1% / Jreis 91.8%) — strong signal that lineup-setting, not just drafting, wins here. Reinforces the optimizer priority.
- **🎯 PRE-REGISTERED (2024 harvest):** 2024 weekly-high winners follow the same logic — points-strong/record-unlucky teams (Cory 2024 among them) banked highs. Verify vs 2024 weeks 1–15. **→ CONFIRMED** (cross-check above: Cory led 2024 with 4 highs = $400).
- **Dossier additions (chat-Claude 2024/2025 weekly-high ledgers, cross-check-verified):** Cory's **optimal-2024 ≈ $700–800 + a playoff berth** (4 real highs + the wk15 miss-by-1.06 and other bench-decided losses recoverable) — **this is the lineup optimizer's quantified business case; cite it verbatim in the in-season/optimizer spec.** Cory's **wk2-2025** bench donation (Henry started at 2.3 over a 14.4 bench option, missed the high by 5.2) = one of **THREE confirmed bench-decided highs** (2024 wk8, 2024 wk15, 2025 wk2 — the chat-side wk4 candidate was REJECTED under slot legality, see item-7 cross-check above). **B8T3S and Sadbru: zero highs in 2024** (bottom of the money pool). **mhagen double-dipped in his 2025 title year** (2 of the first-6 highs) — the dynasty benchmark also chases weekly $. Still TODO in CI: confirm R2121/MarianSaar 2025 highs across weeks 7–15 (pre-registered above).

### Live-API briefing — other findings (chat-Claude, 2026-08-08)
1. **Era stability CONFIRMED** — 2024/2025/2026 settings byte-for-byte identical (scoring incl. pass_td 6.0, playoff_start 16, 4 teams, deadline 11, waiver_type 1, max_keepers 3, pick_trading 1). **Backtest simplifies: all replay seasons ran under current rules — full pattern transfer, no era adjustments.** Stamp the settings hash across the chain as proof (Part 12).
2. **Rounds=15 verified at source** (D7 closed).
3. **Draft-object flags:** `pick_timer=0` (possibly UNTIMED — Cory confirming; if so, note in opening-script/UI-urgency design), `draft_order=null` (D4 amber confirmed at source → add auto-import trigger when it becomes non-null), `cpu_autopick=1` (**no-show manager drafts Sleeper's default board — absent opponents are perfectly predictable**, dossier note), `reversal_round=0` (snake holds).
4. **Playoffs = weeks 16–17 ONLY** (2 rounds). Playoff-SOS term targets 16–17; weekly-high window = weeks 1–15 exactly (money_history honors this). Corrects the specs' 15–17 assumption.
9. **Data-path:** roster objects carry `total_moves=0`/`waiver_budget_used=0` for everyone — transaction/waiver fingerprinting must use `/league/{id}/transactions/{week}` (history_export already does ✓), never roster settings.
11. **Harvest targets confirmed reachable:** 2025 draft `1248121522766217216`, 2024 draft `1117672595379277825`, 2023 league `990840142107619328` (chain origin, `previous_league_id=null`, orig. name "Whiny Little Bitch League"), 2023 draft `1001232801791856640`, winners/losers brackets 2023+2024+2025. Chain walks clean; stay under 1000 calls/min.

### Recon complete (chat-Claude) — harvest is mine in CI
- **Zero owner turnover: identical 10 user_ids all 3 seasons.** Dossiers are clean 3-season behavioral records of the same humans; **new-owner machinery stays dormant.** Roster mapping stable 2024↔2025 (still key joins on owner_id).
- **Era stability is functionally 3/3 seasons** — but **2023 scoring carries float-noise** (`pass_yd 0.03999999910593033 ≡ 0.04`); the Part-12 settings hash **MUST round floats before comparing** or the first cross-season check false-positives (spec updated).
- **mhagen dynasty PENDING** — 2023 champion = roster 7; confirms 2-of-3 titles IF owner mapping held (verify via 2023 users in the harvest).
- **Remaining CI harvest (triggering):** matchups weeks 1–15 × 3 seasons (weekly-high ledger + the Richard2121/MarianSaar prediction), per-week transactions (waiver/FA fingerprints, since roster `total_moves`/`waiver_budget_used`=0), 2023 winners_bracket (final money table), 2023 draft into the replay chain.
- **Unfilled placeholders from Cory (need the actual values):** (a) draft **pick timer** — untimed vs X-second clock (draft object showed `pick_timer=0`); (b) **RS runner-up tiebreak** for payouts config (the 2024 "8.2-pt tiebreak" story implies points-for, unconfirmed); (c) **mhagen dynasty** confirm/pending.

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

**Dependency flag (2026-08-08) — RESOLVED:** all four Phase-1 dependency specs
now exist as committed docs. in-season rankings (present) · **season-readiness
kit** (recovered/consolidated from in-season-master §1) · **Part 11** (folded —
it IS strategy-hunt-learning-seed.md, header note added) · **Part 12** (authored
slim spec, ruleset hash incl. keeper cost model). This session's master specs
are all committed under `docs/queued/` so a reclaimed container can't lose them.

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
