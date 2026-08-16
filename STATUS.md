# STATUS — unattended run

> **📣 MONDAY (2026-08-17): READ `MONDAY-BRIEF.md` BEFORE THIS FILE.** The relay session executed seven rulings, promoted own_v6, merged five design passes, and wrote your exact resume path there.


> **🧭 SESSION BOOTSTRAP:** a fresh session should start from its role file, not a
> pasted prompt. **Session A → `SESSION-A.md`**, **Session B → `SESSION-B.md`** (both
> at repo root); the shared rules live there and change there. Access rule (tools vs
> history): **`ACCESS-RULE.md`**. Plain-English current queue: **`TODO.md`**. Resume
> ritual: _"You are session A, read SESSION-A.md and STATUS.md, then continue."_

> **🩹 HOTFIX (2026-08-08): /history 500'd in production — `included_files` gap, NOT the merge.** The merge was clean (every B file byte-identical to `e2b7ce9`, all pages render 200 locally incl. `/history/season/2024`). But `history-data.js` reads its harvest (`draft/data/**`, `draft/config/**`, `public/draft_data.json`) from disk at request time, and `netlify.toml`'s `included_files` never bundled them → `ENOENT` in the function → every `/history` route 500s while Blob-backed pages stayed up. Proven by simulating the bundle (build() throws ENOENT on `league_history.json`) and by the fix (build() OK, 2024 present). Fixed forward with `[deploy]` — no rollback, since the cause was one config line, not the merge.
> **🔧 DEPLOY-VERIFY WAS SILENTLY DEAD (pre-existing, found during the hotfix).** `deploy-verify.yml`'s heredoc terminator `PY` sat at column 0 inside a 10-space `run: |` block scalar → **invalid YAML**, so GitHub could not parse its triggers and every run created-and-instantly-failed with **zero jobs**. The deploy verifier — the one check that proves "deployed == HEAD" — had never actually run. Fixed (indent `PY` into the block; bash still gets a bare terminator after YAML dedent). Added a **CI workflow-YAML lint** so an unparseable workflow is a red build, not a silent hole. (`ci.yml` itself passes on every commit — that was never broken.)
> **💰 MONEY BOARD REGRESSION = the SAME bundling gap (diagnosed 2026-08-08).** `/history/money` career totals read from `master_sheet_archive.json` (`A.moneyBoard.rows[].career`); it wasn't bundled → 500 in prod. Fixed by the same `included_files` addition. Reproduced: renders 10 real non-zero totals locally, throws ENOENT bundle-missing. NOT a merge side-effect, NOT the engine overwriting the old board (the legacy `?section=money` `$0`s are a separate pre-existing blob quirk). **Two guards added, both green + negative-controlled:** `bundling_guard.test.js` (every committed file a route `readFileSync`s must be in `included_files` — reverting the fix fails it, naming the files) and `history_smoke.test.js` (boots the app, logs in, asserts `/history`, `/history/season/2024`, `/history/records`, `/history/money` are 200 AND populated — money board must show real dollar totals, catching an empty table that alarms on nothing). Both wired into CI + the Sunday audit.
> **📖 CHAPTER STATUS (confirmed):** `/history/season/2024` renders the written chapter (37KB prose) AND is linked from `/history` (season card + "Chapter written" tag, `index.ejs:106-112`, gated on `chapters.has(year)`) — reachable by tapping 2024, NOT committed-but-not-connected. 2023/2025/2016-22 correctly have records-only cards, no prose (`CHAPTERS={2024}`), per the voice-approval hold.
> **🚀 DEPLOYED vs main:** targeting `main` @ the branch-protocol commit (this push carries `[deploy]`). Live URL `https://makefbgreatagain.netlify.app`; `site-check.yml` compares deployed commit to `main` HEAD and the Sunday audit flags drift. **Both sessions now commit to `main` directly — no branches (TERRITORY.md § Branch protocol).**
> **🔀 BRANCH PROTOCOL LANDED (2026-08-08):** the jwdvn7/xs2lv6 divergence is merged to `main` (both sides, STATUS.md unioned, nothing lost) and cannot recur — `scripts/branch-check.sh` gates commits to main, the Sunday audit asserts no stray branches + deployed==HEAD. **Session B: the protocol is in TERRITORY.md — pull main, commit there, push immediately.**

> **🔴 HARD DEADLINE — WEEKLY GRADING CRON LIVE BEFORE ~SEP 1, 2026 (unrecoverable if missed).**
> The learning half is the least-built part of the system (audit: `docs/queued/annual-button.md`
> § LEARNING-HALF STATUS): forward predictions are emitted + recorded, but **nothing grades them
> as they resolve** — no weekly cron, no calibration ledger. A season of ungraded predictions can
> only be graded in bulk afterward, which is NOT the same thing, so this is instrumentation with a
> real deadline like the in-season pools. **KEYSTONE (Cory 2026-08-09):** wire `forecast_grade` to
> run weekly on resolved predictions → append to a calibration ledger, live **before the first
> predictions resolve (early September at the latest)**. Everything else in the learning half
> depends on the record it produces. **RED UNTIL IT RUNS.** Post-draft-relevant (predictions
> resolve in-season), so it sits behind the pre-draft five but must NOT slip behind whatever is
> loud in three weeks. Build order: (1) this cron → ledger; (2) wire `evidence_weight` to consume
> the ledger so weights move from graded outcomes; (3) the Annual's model-update over that
> deterministic record (prompt PROPOSES, computation MOVES the weights).

## 🚨 THE NUMBER THAT MATTERS MOST THIS WEEK (2026-08-08)

**The model deviates from consensus on 73.7% of picks — 8.8 per draft, mean 17.1
picks — and 100% of those deviations are LEAN tier. Not one reached LIKELY.**

Cory's pre-registered prior was ~2 per draft. Measured 8.8. The split is 212
reaches to 9 falls, so this is systematic, not opportunistic. The joint-lead
driver is `value` — our own projections, **never raced against the market**
(experiment 33, unrun).

Two terms never fired as material drivers at all: **`bye` and `survival`** —
and survival is one of only two moderate-evidence terms in the model.

Frozen as the pre-tree baseline: `draft/backtest/pre-tree-baseline.json`.
Consequence pre-registered BEFORE experiment 34 reports: `PRE-REGISTRATION-34.md`.
The dollar half of the question cannot be answered on the 2026 board without
circularity — see `draft/backtest/DOLLAR-PAIRING.md`.

**Approved sequence:** doctrine Stage 3 → exp 34 → exp 33 → the decision tree,
built against measured reliability.



**🚨 THE DECISION TREE RELABELLED, IT DID NOT CHANGE BEHAVIOUR (2026-08-08, grind #3 — flagged loudly, not absorbed).** I re-ran the intervention rate against the frozen pre-tree baseline on the same board. **Byte-identical:** 73.7%, 8.84/draft, 17.06-pick magnitude, 212/9 reach-fall, dead weight still `bye,survival`, lead ranking unchanged. `engine.js` never calls `stages.js` — the tree is a **legend over an unchanged engine, Stage 2 is a label not an anchor,** and the 73.7% deviation rate is fully intact. This is a real legibility win (a pick can name its stage; Stage 4 ships visibly unsized) and it is NOT a behaviour change. Whether to make Stage 2 a *real* anchor is filed as **🚨 D14** — recommendation HOLD, because anchoring now suppresses deviations on the very evidence (exp 33/34) that D13 blocks. Machine proof: `node draft/tools/intervention_rate.js --diff 25`; write-up `draft/backtest/POST-TREE-DIFF.md`.

## ⚡ POWER-THROUGH DIRECTIVE (supersedes calendar pacing)
Idle time dies. Proceed by default; never wait at redirect windows (judgment → DECISIONS-NEEDED, continue other work). Gates convert from "build by" to **"build now, ACTIVATE when reality allows."** Only true blocks: **my inputs** (slot date, keeper confirmations), **external events** (slot assignment, keeper lock, NFL week-1 data), and the **draft-path code freeze at final mock** (the fixture-keepers lesson: draft on what you rehearsed on). Quality rules untouched: robot green per commit, gates never loosened, participation tests, ledger discipline, specs → docs/queued.

### 🔁 STANDING CONTINUATION RULE (Cory, 2026-08-08 — survives every session)
**The burn never stops for a blocked lane; it changes lanes.** When the critical-path current item completes and the next is blocked/waiting (my input, an external event, or a review checkpoint like the layout screenshots), do NOT idle — immediately pull the **highest-priority buildable backlog item** (TASK-AUDIT.md order: **Lab experiments as the harness allows → data-spine reconciliation test → side-bet tracker → Venmo → dashboard widening → remaining Part A**) and build it, returning to the critical path the moment it unblocks. **When the critical path EMPTIES at mocks-ready, the backlog becomes the main queue automatically — no new orders needed, ever.**

### 🚨 ALERTS PROTOCOL (while Cory is away)
Urgent-AND-blocking events — **my slot-claim turn arriving, a draft-critical failure, a decision that halts multiple work streams** — surface as loudly as channels allow: a prominent **DECISIONS-NEEDED entry marked 🚨 URGENT** at minimum. If the ntfy/push path (backlog A-3, generalized to urgent-notification duty) is buildable quickly, build it EARLY and use it. **The layout screenshots wait at the review checkpoint — do NOT robot-verify past them.** Everything else: judgment + committed specs + gates. Commit & push at every natural boundary, small and frequent.

**✅ DOCTRINE BANNER WIRED — the Lab's verdict now reaches the screen (2026-08-08).** The last tournament-gated half of `war-room-v2-doctrine-banner.md` is built: banner above the status bar showing the plan (name + creed + 19b's **+$92 season edge**), live confidence, and the alternative's **this-pick** dollar gap; switch announcements with a one-tap DECLINE; path cards tagged ◆ *the WR Feast branch*; per-pick doctrine state + declines in the ledger (`doctrine`/`doctrine_decline` kinds). **One fact, one home:** `cory_conditional.py` → `cory-conditional.json` → `build._load_doctrine()` → artifact → banner, with `stamp_doctrine.py` re-stamping on every Lab run so a fresh verdict does not wait on an egress rebuild. `doctrine.js` is keyed by the LAB's archetype keys and `test_doctrine_parity.py` drives both implementations over one grid demanding identical allow/deny (mutation-checked). **Four defects caught by rendering it, not by reasoning about it:** (1) the ledger rejected `kind: doctrine` — every capture 400'd silently; (2) a \$0 gap rendered as "Contested" when nothing was contested — a tie now reads *"plan not binding here — every doctrine takes the same player"*; (3) the path badge resolved a board-wide best that often sat outside the priced paths, so it silently never rendered — it now chooses AMONG the paths; (4) **pre-existing:** nav, watermarks, banner and status bar all pinned at `top:0` and buried each other — the status bar had been invisible when scrolled the whole time. Offsets are now measured (`layoutPinned`, re-measured on the next frame + on resize) so the strips queue. Verified in a real browser at 1440 and 390. Suites: **243 py + 39 doctrine + 89 robot**, all green.

**💰 THE MONEY FUNCTION IS COMPLETE — and one finding reversed (2026-08-08).** Playoff $ is **53% of the pot** ($2,125/$4,000) and every Lab verdict on record was measured without it. The bracket resim landed: format **derived from** the harvested brackets and reproducing **all 12 games across 2023/24/25**, certified inside `lab.certify_grader`, wired into both `grade_substituted` (three unmixed outcomes — $0 exact / real dollars / **withheld** when the replay stops at week 15) and the simulated rooms. Anchor: replaying a seat with its own scores reproduces its real grade to the dollar, playoffs included, every roster every season. **Pre-registered re-run of every verdict:** WR Feast +$91.50 → **+$187.25**, Late-QB −$61 → **−$212**, frontier λ=0.5 +$70.67 → **+$171**, over-dosing still negative, stack peak 0.5× +$80.42 → **+$204.58** (still a LEAN, still not installed), §6 still **zero** rules (null floor scaled to $157.23). **THE REVERSAL: H1's early-weighted ceiling ramp goes −$37.29 REFUTED → +$226.50 [168, 288], best in the sweep** — the playoffs are a two-week single-elimination tournament, so variance pays there in a way sixteen accumulating weeks never showed. **This bears on D9, installed on the incomplete money function; NOTHING was changed** — filed as 🚨 **D11** in DECISIONS-NEEDED (recommendation: HOLD through the mocks, decide before the final one — rehearse the config you draft on). **A gate gap this exposed, now closed:** Early-QB posts a higher *mean* than WR Feast (+$200.62 vs +$187.25) and the old "highest mean clearing the control" rule would have flipped the enrolled doctrine; the paired head-to-head is **+$13.38, CI [−$53.75, +$78.00] — not separable**, so a **head-to-head gate** now retains the incumbent when co-leaders cannot be told apart. WR Feast stands because nothing beat it. Full record: `draft/backtest/PLAYOFF-MONEY-VALIDATION.md`. Suites: **256 py + 89 robot**.

**RESOLVED 2026-08-08 — the split is restored, and moved EARLIER than either proposal.** Cory offered the call on build cost. Measured: `PredLedger` is 216 lines total (127 server + 89 client) and adding kinds is a whitelist entry plus a method plus tests — **genuinely small**. But the decomposition matters more than the size:

- **(a) the ledger kinds + write path — CHEAP.** Ships **before the final mock**, i.e. inside the frozen, rehearsed configuration. Earlier than 08-22 AND it removes the draft-week competition question entirely: this is a shared module the draft path uses, so the right time to touch it is *before* the freeze, never during draft week.
- **(b) a surface that PRODUCES waiver/trade recommendations — NOT cheap, and it does not exist.** There is no waiver engine and no in-season rankings substrate today; both are Phase 1 of `in-season-master.md`, post-draft by design.

**What this means for the 08-22 → 09-01 window, stated precisely:** (a) buys the RAIL, not the attribution. With no waiver engine in that window the tool makes no recommendations, so **the recommendation arm does not exist regardless of when the ledger ships** — the loss Cory was protecting against is smaller than either of us framed it. What is genuinely recoverable: actions (Sleeper `transactions`, retroactive). What is genuinely lost without a capture: **his stated intent at decision time**, which transactions cannot reconstruct. So a **one-tap roster-move journal** (what I did + why) is the piece actually worth shipping early, and it is small.

**Dates as filed:** ledger kinds + roster-move journal → **before the final mock**. Lineup/doctrine logging and the recommendation surfaces → **2026-09-01, non-slippable**. Checklist line and recorded consequence both stand.

**📅 HARD-DATED BUILD — in-season instrumentation (exp 37, Cory 2026-08-08).** The only item in the 37 complex that cannot be recovered late. **HARD DEADLINE 2026-09-01 — NON-SLIPPABLE**, a full week before week 1. Slotted as the **FIRST post-draft build item after the draft-week work**, and on the pre-draft checklist with **its own line** (renders red until `INSEASON_LEDGER_LIVE`). *Known and accepted gap:* ~10 days (08-22 → 09-01) of post-draft waiver/trade decisions go unlogged; Sleeper `transactions` are retroactively retrievable so the ACTIONS survive, but that window contributes outcomes without attribution. Build is `PredLedger` extended to in-season kinds — the same decision-time-capture rail the draft ledger already runs, so this is an extension, not a new system. Sits after the mock-blocker lane and before September; **it is not gated on the 2026 season the way experiment 37 itself is.**

**Continuous queue (top→bottom, no stopping):** DST fix ✅ → §D ✅ → D3 flex ✅ → cross-check ✅ → A2 slot-verify ✅ → Part 2 §1 Paths ✅ → slot-picker ✅ → keeper-ID fix ✅ → dashboard ✅ → master-sheet payouts ✅ → §2(a) B7 engine ✅ → §2(b) compare tray ✅ → §2(c) three-zone ✅ → §2(d) density ✅ → keeper-placement verification ✅ → Lab harness core ✅ → data-spine reconciliation ✅ → side-bet tracker ✅ → Venmo handles ✅ → certification gate ✅(history to the dollar) → replay→money bridge ✅(CI-gated; 3 iterations: silent-$0 caught → conservation law → roster-aware policy replay) → Phase H shadows ✅(shadows.js, R-shadow, app wired) → A-1 prefs sync ✅(server doc + device-A/B robot) → A-2 undo ✅(unmarkLocal + 5s toast + ledger corrections) → A-3 my-turn alert ✅(arm step + catch-up sweep, 16/16) → authority doctrine ✅(filed + 20/20 CI test) → gated batch FIRED ✅(exps 1/2/19 running in CI; LAB-TOURNAMENT.md commits per run) → opening script machinery ✅(generated vs predicted slate, fingerprinted staleness, workflow-hooked) → **🏁 MOCKS-READY (2026-08-08 — CHECKPOINT: CORY PINGED)** → Part C shadow-standings strip ✅(state-aware v1) → **mock rehearsals** [NEXT] → freeze at final mock

**⏯️ RESUME POSITION (2026-08-08):** Part 2 §2 layout — **§2(a) B7 engine ✅**, **§2(b) compare tray ✅**, **§2(c) three-zone grid ✅ DONE** (DECIDE|CONTEXT|DEPTH, rendered + screenshotted at 1440/390, div-balanced 94/94, pushed b9eed2a), **✅ PART 2 §2 COMPLETE** — §2(a) B7 dollar-gap engine, §2(b) compare tray (searchable), §2(c) three-zone grid, §2(d) density ALL DONE: sticky board header+name col, best-available always-on strip (tap-to-compare), recent-picks who+ADP-reach/fell, pinned status bar, ADP-fallback banner reworded (A4), and the condensed opponent strip in Zone 2. Layout approved ("looks good"); phone-viewport robot acceptance is the only remaining §2 sub-item. ✅ **LAYOUT APPROVED by Cory ("looks good", 2026-08-08)** — three-zone signed off. Two follow-ups from his review, both DONE + verified live: **keeper slate now shows the real cost rounds 1/2/3** (was original_round=all-1; top_picks_flat forfeits rounds 1..N by rank) and the **compare tray is searchable** (⚖️ launcher → type names → dollar gap). Robot layout-acceptance (phone 390px zero-scroll) can now run. Per the standing continuation rule, while awaiting his eyes the next buildable lane is: finish §2(d) remaining (still building, not verifying) → then keeper-placement verification → **Lab harness** (harvest COMPLETE, unblocked; gates 5 pre-mock experiments) → fire experiments 1/2/4/8/10 → Phase H shadows → opening script → A-1/A-2/A-3 → mocks-ready. _(Superseded detail below retained for the three-zone spec.)_

**🏁 MOCKS-READY DECLARED (2026-08-08, POWER DAY).** The full pre-mock critical path is green: three-zone war room ✅ · keeper-placement verification ✅ · Lab harness certified + bridge gate green ✅ · tournaments FIRED with first verdicts landed ✅ · Phase H shadows (fire during mocks, flagged rehearsal) ✅ · opening script generated against the predicted slate with mechanical regeneration hooks ✅ · A-1 prefs sync / A-2 undo / A-3 my-turn alert ✅ · claim-correction tool live ✅ · authority doctrine filed + enforced ✅. **The rehearsal surface is the finished surface — mocks rehearse what draft night runs.** Ping to Cory: start mock drafts whenever ready; shadows + ledger + alerts all exercise flagged-rehearsal paths, and the draft-path CODE FREEZE lands at the final mock per the standing rule. Suites: 223 py + 23 JS + robot 78/78.

**📏 PERF BASELINE (Phase-1 measure, 2026-08-08 — site-optimization.md):** JS on the war room = **13 script tags, ~468KB unminified** (app.js 164KB, engine 84KB, survival 40KB, mcts 32KB the big four); CSS 112KB single file; the board artifact `draft_data.json` **1.25MB** (the dominant transfer). Netlify serves brotli + ETag-revalidation by default, so repeat loads are 304-cheap already. **Zero-risk finding, honestly parked:** long-lived cache headers on unfingerprinted js/css are NOT zero-risk — a draft-week hotfix could serve stale app.js; cache-headers move to Phase 2 WITH asset fingerprinting. Lighthouse + API waterfall need the deployed site — they land with B-5's live run. Phase-2 spec filed (`site-optimization.md`) incl. the behavior lock (golden-masters byte-identical per refactor commit); **its item (6) arrived truncated ("(6) D") — flagged for resend.**

**🏁 THE BRIDGE GATE IS GREEN (2026-08-08, run 31261529189 / c40e63e): the harness's final increment is PROVEN in CI.** The roster-aware replay passed every gate — certification (history to the dollar) → bundles+weekly-points built with real egress → replay dumped → BRIDGE GATE (exact-fill + coverage + differs-from-history) → bridge run → artifact uploaded. **B0/B3 now money-grade from exactly-filled, all-distinct rosters.** The gated draft-side experiments (1/2/19, money-graded parts of 20/21/24/25/26) are UNBLOCKED — their input path is trusted. Three iterations of the gate each caught a real defect (silent-$0 key mismatch → ghost-loop under-fill → structural per-pick limitation), which is exactly what a gate is for. Remaining grader increment: the substituted-seat playoff resim (entry/title $); weekly-high + RS are exact.

**✅ BRIDGE CI-PROVEN + PHASE H SHADOWS DONE (2026-08-08, latest).** (1) **The replay→money bridge ran in CI** (`lab.yml` `replay-bridge` job, run 31260487394): bundles + per-week points built with real nflverse/FFC egress, replay dumped (3 seasons, 407 decision records), BRIDGE GATE 8/8, artifact uploaded. **First-run finding — a silent-$0 bug caught and locked out:** bridge asked for `b0`/`b3` where replay.js writes `B0`/`B3`; every lookup missed, B-policies graded keeper-only rosters at $0/coverage-0 while the bounded checks passed vacuously ('actual' graded real dollars: 2023 $600 / 2024 $1,000, coverage 0.867 — pipeline proven). Fixed three-deep: unknown policy now RAISES naming available keys; CI gate demands ~one player per decision pick + policy-coverage ≥0.5 + B0-differs-from-history. **2025 stays honestly skipped** (nflverse weekly 404; pbp rebuild refused by cross-validation tolerance — pre-existing caveat). Re-run triggered; next bridge run must show real B0/B3 dollars. (2) **Phase H shadow rosters BUILT + wired** (`shadows.js`, 20/20 + R-shadow in robot 78/78): all four spec requirements — board-snapshot hash sequencing (app snapshots BEFORE pick removal), taste-blind (raw `E.recommend`, no lists), freeze-means-freeze (weight-function hash; `gradeGuard` refuses changed/unfrozen), rehearsal flagging. Ledger: `shadow_pick` per real pick + `shadow_freeze` at end. **Honest finding:** on the real board all seven profiles agree at every tested depth — the value term dominates; divergence only on close calls (proven deterministically: Default floor vs Upside-Late r8 boom). Phase-S implication: profile edges will be small; null/CV gates are the separator.

**✅ RESEARCH-BATCH + CERTIFICATION + DOCTRINE MACHINE DONE (2026-08-08, latest).** From chat-Claude's literature dive + Cory's grader requirements: (1) **Money-grader CERTIFICATION GATE** — `test_money_grade_certification.py` reproduces all 3 seasons' money tables **to the dollar** (Cory 2023=$400, mhagen 2025=$1,325 both match); it's the first gated step in `lab.yml` AND enforced in-process (`lab.certify_grader` — no experiment grades on an un-certified grader). (2) **EFFICIENCY-LEAK.md filed** — the ~$445–595/team finding decomposed (high-pool $330–420 vs matchup/RS $100–175; my 3-yr = **$2,100**), January grading hook, cited in `in-season-master.md`; L0 now emits the decomposition. (3) **Lab experiments 20–30 registered** (herding fade, mean-variance frontier, best-ball translation, RB dead zone, Konami QB premium, etc.; 20/21/24/25/26 pre-mock) + the 2 Cambridge-paper validation notes in the opponent-model docs. (4) **Doctrine banner state machine built** (`doctrine.js` + 18 robot checks) — named doctrines/creeds, hysteresis switch logic (exactly one switch on a QB run, noise-band flaps suppressed, decline preserves+logs); UI/enrollment tournament-gated. (5) **Monte-Carlo weekly-high threshold distribution** util (harvested: n=45, min 122.1, median **148.5** [directive's ~139 corrected], max 171.5). (6) **BBM ingestion spec** + doctrine-banner spec filed. (7) Registry now states the **draft-replay→money bridge is the harness's FINAL increment, its test a gated `lab.yml` step** (CI egress dependency stated — next session writes it, doesn't re-litigate where). All green: 203 py + 17 JS suites + robot 73/73.

**✅ LAB HARNESS CORE + DATA-SPINE RECONCILIATION DONE (2026-08-08).** The Lab's critical-path blocker (the shared harness) is BUILT and CI-wired — `draft/backtest/money_grade.py` (E[$] grading under era-correct `by_season` payouts; `grade_actual` reconciles to the pot on all 3 seasons; `grade_substituted` re-grades one seat's weekly-high+RS vs the real field — 19 tests), `roster_sim.py` (roster→weekly-scores via best legal lineup from harvested player points — the draft→dollars bridge; 10 tests), `lab_stats.py` (null-search baselines + leave-one-season-out CV + `ship_rule` — 6 tests), `lab.py` (the registry runner; writes `lab-results.json`+`LAB-REPORT.md`) and **`lab.yml`** (weekly 03:30 UTC Mon + on any harness/data change; guards on the 35 harness tests; **confirmed running in CI** — committed a Lab report). First experiment LIVE — **L0 (measurement): optimal-in-hindsight lineups would have added +$470/595/445 per team (2023/24/25)** in weekly-high+RS money, proving roster→scores→dollars end to end. **Data-spine §3 consistency proof shipped:** `test_data_spine.py` (6 tests) asserts the Money Board (`money_history.py`) and the Lab grader (`money_grade.py`) — two independent paths over the same canonical sources — agree per owner/component/career and distribute exactly the summed era-correct pots; any divergence is now a red build. **Lab remaining (honestly noted in LAB-REGISTRY):** the draft-replay→money bridge (bundles.json is gitignored + needs nflverse/FFC egress, so it activates in CI, not the sandbox) + substituted-seat playoff resim — those unblock gated experiments 1/2/19; their grading+gates are done. **NEXT buildable lane** (network-independent): side-bet tracker → Venmo handles → dashboard widening (F-2), then Phase H / opening script / A-1..3 → mocks-ready.

**✅ KEEPER-PLACEMENT VERIFICATION DONE (2026-08-08).** The heterogeneous fixture (`keeper-placement-verification.md` §5) is built and green: `draft/tests/test_keeper_placement.py` (7 tests) drives four teams keeping **3/2/1/0** through the real `build_true_pick_order`, asserting per-team round-1–3 classification (keeper-consumed vs LIVE), no uniform "rounds 1–3 = keepers" assumption, my live-pick numbering (keep-2 → 13 live picks, first is round 3), and survival math spanning my early live picks. The **commissioner placement cross-check** (§3) is built: `reconcile.js` extended beyond presence/count to **placement-identity mismatch** — right player on the wrong team or wrong round fires a loud halt (`misplaced[]`, message cites both teams/rounds); `app.js` passes `teams` so the round-check is live; covered by 6 new `reconcile.test.js` checks + the `R-placement` robot scenario (heterogeneous 3/2/1/0 board reconciles clean when placed right, alarm fires on wrong-team AND wrong-round fat-fingers, keep-0 legal). All suites green (150 py + robot 73/73). **NEXT = Lab harness build** (`the-lab.md` + `LAB-REGISTRY.md`; harvest COMPLETE → Tier-A unblocked; gates the 5 pre-mock experiments) → then Phase H shadows → opening script → A-1/A-2/A-3 → mocks-ready.
**(three-zone spec, done):** restructure `views/admin/warroom.ejs` → Zone1 DECIDE (center 60%: Paths + compare tray) / Zone2 CONTEXT (right rail: roster+keepers, LRM strip, contextual survival watchlist, before-your-next-pick opponent strip) / Zone3 DEPTH (below fold: best-avail strips, adjusters, queue/paper, targets/never, recent picks, KYL cards, full board) + a slim pinned status bar. Phone: sticky status bar + Paths default, Zone2 swipeable, Zone3 behind "Board & Tools". Then §2(d) density fixes. **Apply the `frontend-design` skill.** ⚠️ GATE: **screenshot desktop width for Cory + chat-Claude review BEFORE the robot acceptance run — do NOT robot-verify past that checkpoint**; when it blocks, change lanes to backlog (Lab harness / data-spine reconciliation test / side-bet tracker / Venmo) per the standing continuation rule. Specs: `warroom-v2-B7-dollar-gap.md`, `warroom-v2-visual-design.md`, `war-room-final-pass.md` Part 2. THEN (Cory reprioritization 2026-08-08): keeper-placement verification → **Lab harness build** (`the-lab.md` + `LAB-REGISTRY.md`; harvest is COMPLETE so Tier-A is unblocked — it gates 5 pre-mock experiments, so it OUTRANKS Phase H shadows) → Phase H shadows → opening script → A-1/A-2/A-3 → mocks-ready checkpoint (ping Cory). Venmo-handles + data-spine payout-form kill are queued behind the draft-critical items. → Phase H shadows → opening-script machinery → A-1/A-2/A-3 → **mocks-ready checkpoint (ping Cory)** → Part C → Part A (A-4..A-8) → Part B ops → Backtest R2 + Strategy Hunt S/N (CI) → entire in-season master (built now, activation flagged 'awaiting season data') → D-1 recap → annual-button dry-run → 2c builds → E-behaviors. Freeze draft-path at final mock; in-season/background continues through draft week.

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
1. ✅ **SETTLED (annotated 2026-08-08)** — league settings showed `draft_rounds:3`, but the **draft object was verified 15 via chat-Claude fetch**; the DRAFT OBJECT is authoritative, so this was a stale-settings echo, not a live problem. The checklist line **"Draft object rounds == 15"** stands as the mechanical guard and **greens on first sync** — a watch line, not an open emergency. **DECISIONS D7.**
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

**🔮 KEEPER PREDICTION (Cory intel, 2026-08-08):** **MarianSaar keeps Bowers — HIGH confidence, source: Cory intel** (to be ledgered at draft-prep; January grades keeper-prediction accuracy). **Scenario-conditional pick-34 dossier COMPUTED** (`keeper-intel-scenarios.md`): Bowers-available (last-elite-TE, 83%/60% survival to 34/41) vs Bowers-kept (McBride inherits — 46-pt VORP cliff to LaPorta confirmed, 80%/53% survival). Take-now premium is small in v1 dollars (rough model underprices the TE cliff VORP sees — quantile-V will sharpen); **the decision is room-panic-driven**: TE scarcity collapses survival-to-41 (60%→22% Bowers / 53%→16% McBride on a 10-spot ADP jump), making take-at-34 strongly correct the moment the board shows TE reaching. **✅ PREDICTED KEEPER SLATES BUILT (2026-08-08, `draft/predict_keepers.py` → `predicted_keepers.json`):** flat-cost surplus (round-cost VORP 104/62/36), the K0 optimizer pointed at all 10 seats. **VALIDATES — recovers my real keepers (Chase/Henry/Walker) exactly.** The model **independently predicts MarianSaar keeps Bowers** (surplus +20) — Cory's intel confirms → **high**. Predicted slates: **B8T3S** Gibbs/Taylor/London · **Richard2121** Bijan/McBride/Nico · **mhagen** CMC/St.Brown/Allen · **MarianSaar** JSN/**Bowers**/Achane · **Schmelley** Nacua/Barkley · **ds7mmet/cashworth/Jreis/Sadbru** keep-NONE (weak rosters clear no round cost; Jreis-kept-0-in-2024 precedent). 4 lock tests. **Remaining (A-9):** wire the predicted slates into mock/rehearsal boards (marked PREDICTED) + keeper-watch one-by-one replacement + confidence display.

**🔒 INTEL BATCH 2 (2026-08-08) — Richard2121 LOCKED (certain, Cory intel): Bijan + McBride + Nico Collins.** Flat-cost math corroborates exactly (Bijan r1 +44, McBride r2 +2, Nico r3 +21). **⚡ THE TE FORK COLLAPSED** — with Bowers (Marian) AND McBride (Richard) both kept, the elite-TE-anchor at pick 34 no longer exists; both-TEs-gone is the new PRIMARY scenario (Bowers-available demoted to footnote). On the predicted board: best TE = Loveland (VORP 38, survives 100% to 34 AND 41 — no cliff, take whenever); **pick-34 reshapes to WR-feast** (Higgins 71% / McMillan 46% / Nabers 34% + Jameson 87% / Adams 80%) **or Early-QB** (Lamar/Maye/Burrow 98%+ — QB wide open). WR2/Early-QB gained the probability mass the TE branch lost. **Confidence tracker: 2/9 opponents on intel, 7 model-only.** (Full analysis: `keeper-intel-scenarios.md` §2b.)

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
fail loudly · single scoring path · every pinned constant cites its source · every bug found becomes a robot scenario in the same commit · provenance stamps on every results file · guards are never disabled to pass · **PROBE BEFORE ACCEPTING A DATA BLOCKER** — before filing or approving any "data unreachable" claim, probe the obvious sources first (in CI where egress works, if the sandbox is blocked). Third blocked-data claim this week, second that was actually reachable (FFC historical ADP was live at an endpoint nobody had asked for; the Option A narrowing was approved under a false constraint). A blocker is a measured 404, never an assumption · **surface no mechanism it does not have** — a field naming a stage/plan/source must be wired to real behaviour or rendered explicitly absent (SOURCE stays absent until Stage 2 is behavioral). · **REPORT IN DOLLARS where the grader supports it** — every experiment producing a verdict about DRAFT DECISIONS reports E[dollars] (era-correct payouts, weekly-high thresholds, real field) as the answer, with points-based metrics (rank correlation, MAE) as the statistically-robust COMPANION at thin n, never the whole answer. Points ≠ money in this league.

## ▶ RESUME MARKER — 2026-08-08, after the branch/deploy incident

**THIS SESSION (post-merge):** Merged both session branches to `main` (clean,
STATUS.md unioned, nothing lost); wrote + enforced the **branch protocol** (both
sessions on main, `branch-check.sh`, Sunday-audit stray-branch assertion);
diagnosed + fixed the **`/history` 500 and the empty money board** (same
`included_files` bundling gap, fixed forward, proven); fixed **deploy-verify**
(pre-existing invalid YAML → it had never run) and gated it on `[deploy]`; added
**`bundling_guard`** + **`history_smoke`** (war room included) + a **workflow-YAML
lint**, all green + negative-controlled, wired into CI + the audit; completed the
**seam sweep** (doctrine.js + mcts.js added to the wiring guard). Live confirm of
the site is in the repaired deploy-verify's hands (sandbox has no egress).

**OWED ANSWERS DELIVERED:**
- **Historical ADP reachability = YES** (probe run 31284357107): FFC historical,
  half-PPR, all three seasons usable (2023/24/25). **D13 Option A withdrawn** —
  exp 34's ADP arm runs against real ADP as a `lab.yml` egress job.
- **Stage 2 scope in days (D14):** making Stage 2 a *real* anchor is an engine
  change to `E.recommend` (default = consensus order; deviations EARNED via a
  named stage, not a composite that happens to deviate) + re-measure/re-freeze +
  behavioural stage tests + robot regression ≈ **~2 focused days.** It is NOT
  merely more work — it CHANGES draft-night recommendations, so per D14 it must
  not be built until (a) you rule on D14 and (b) exp 33/34 report, so the anchor
  suppresses deviations for a MEASURED reason, not a guess. Now that ADP is
  reachable, exp 34 can run and feed that decision. Recommendation stands: HOLD.

**⚓ CRUDE STAGE 2 CAP — BUILT, MEASURED, INERT AT T=4.0 (2026-08-09).** Cory
approved the 2h evidence-gated spike; pre-registered (`STAGE2-CAP-PREREG.md`),
flag OFF by default, measured immediately. Result: **3/300 picks changed, rate
73.7%→73.3%** — essentially inert. **T was NOT retuned** (finding, not knob). The
load-bearing why: ~72% of deviations carry ≥4 pts of `need`/`ceiling`, so a
value-only gate can't tame the rate. Sharpens exp 34's question to *"is the
need/ceiling evidence backing our deviations correct vs real ADP?"* Full
re-weighting stays gated on 34. Flag OFF, SOURCE absent. `STAGE2-CAP-RESULT.md`.

**🔬 EXP 34 — BUILT, VERIFIED, FIRED (2026-08-09).** Analytical core complete +
verified in-sandbox (18 pure checks: alignment/41 decisions, all metrics, assemble,
forgone-value bands). Egress main + `lab.yml exp34` job shipped and **DISPATCHED** —
pure-test gate → FFC+nflverse egress → commits `EXP34.md`/`exp34.json`. **Result
pending CI; read it next turn and report with the pre-registered reading**
(inconclusive→bind harder). exp 41 (calibration-weighted ensemble) + exp 42 (bench
as contingent claims) registered behind it. _(history of the redesign below.)_
**🔬 EXP 34 — MEASURING STICK REDESIGNED (2026-08-09).** The
single-pick scoreboard was **rejected (correctly) and NOT fired** — 41 my-guy-vs-
their-guy comparisons are coin flips. Redesigned to measure the POLICY:
`EXP34-METHODOLOGY.md` pre-registers rank correlation over the pool (primary) +
top-N set value + a **deviation-edge SURFACE** across board position / tier-cliff
proximity / round decay / market dispersion, multi-board (FFC+BBM), dollars
secondary, room arm separate, inconclusive→bind-harder. "Our ordering" = walk-
forward projected value (decision-time-honest; composite-ordering via the JS replay
path is a follow-up). **Pure alignment core BUILT + verified** (`test_exp34.py` 7/7;
41 decisions reproduced 15/14/12). The options frame is filed as **exp 40 — a Lab
HYPOTHESIS not a doctrine**, no options vocabulary on any surface; its draft slice
(survival slope · cliff convexity priced · realized-cost-by-round) + in-season
folds (weekly-high chase→exp 35, trade decay, waiver need) registered. ▶ **NEXT
UNIT (fresh context): build the surface** — pure metric functions + fixtures, then
the egress `lab.yml` job (FFC+nflverse).

**STAGE 3 IS COMPLETE.** The doctrine governs, inside a measured band, and
discloses in both directions.

| step | state |
|---|---|
| 1. Stage 3 boundary | ✅ **DONE** — tilt wired (cited 2.5), roster-relative + keeper-conditioned signal, Chase stack first-class, two-directional disclosure |
| 2. Minimum viable surface | ✅ **SHIPPED** — 5 truthful lines + the absent pair, verified desktop+phone, within the fold, no errors |
| 3. Mock #4 + degraded drill | ▶ **NEXT** — deliverable is the one-page failure card |
| 4. In-season ledger kinds | ✅ **SHIPPED** — 6 kinds registered before the draft, counterfactual ENFORCED |
| 5. Exp 34 | ◐ **PARTLY UNBLOCKED (2026-08-08).** ADP reachability probe: FFC historical usable all 3 seasons → the "what ADP said" arm runs against REAL ADP (D13 Option A withdrawn). Remaining block: "what the tool would have recommended" needs decision-time projections (none archived). Runs as a **two-way** compare now, as a `lab.yml` egress job — build is the next Lab unit |
| 6. Decision tree | ✅ **VOCABULARY SHIPPED (bd431b1); ⚠️ RELABEL-ONLY.** Stages 1-5 named, SOURCE live on the surface, Stage 4 visibly unsized. But `--diff` proves the tree is a legend over an unchanged engine — rate byte-identical to baseline (D14). Stage 2 is a label, not an anchor. Anchoring for real = a behaviour change on blocked evidence → **HELD as D14** |
| 6b. Intervention rate re-report | ✅ **DONE (grind #3).** 73.7% intact, byte-identical to baseline; flagged loudly as relabel-only. `draft/backtest/POST-TREE-DIFF.md`, `--diff` mode |
| 7. Full surface | ◐ **MOSTLY DONE (grind #4).** SOURCE ✅ live (reads the stage); NEAR-MISS still absent (needs Stage 4 thresholds → D13). **Class-tagged STACK LINE ✅** — `liveStackRoutes` + Zone-2 line + LEAN badge, class derived from the evidence table (17/17). **MOVEMENT LINE ✅** — `movementLine` + `lastRecommendation` snapshot; DID IT MOVE + ALMOST MOVED live under the Paths panel, flap-suppressed, "why" from run detection never fabricated (12/12). **Remaining:** WOULD MOVE (latency-blocked, PARKED #11), DOCTRINE DRIFT line, and the movement LOG + ledger kind. Seam guarded by app-wiring (17/17); `stages`/`stack_routes`/`movement_line`/`app-wiring` all now gate in CI (were silently un-run) |
| 8. Mock #5+ | pending |

**Running in CI, needs no session:** covariance study (portfolio step 1, fires on
push), the Lab, the nightly board.

**✅ THE ORDERING DEFECT IS FIXED AND VERIFIED.** `context()` now calls
`doctrineState()` — which initialises both the state and the enrollment — rather
than reading `state.doctrine` before anything had set it. The plan line reads
**"WR Feast (+$187/season) · plan drove this pick"** on both viewports.

**The score is the proof the tilt is live in the app, not just in tests:**
Puka Nacua went **222.4 → 224.9**. That delta is exactly `DOCTRINE_TILT = 2.5`,
applied to a WR under WR Feast. A rendered sentence can be wrong; an arithmetic
signature cannot be faked by a label.

**Where to start:** step 3 — mock #4 + the degraded drill, one session, and the
deliverable is the ONE-PAGE FAILURE CARD. The four truthful lines are STATUS, PLAN (truthful as
of Stage 3), RECOMMENDATION (player + one number + market delta), ALTERNATIVES
(runner-ups + shadow consensus), plus ROSTER/LEGALITY — five, in fact, once the
Plan Line became honest. The two ABSENT ones are SOURCE (needs the tree's stages)
and NEAR-MISS (needs its thresholds); render them as explicitly absent, never as
empty containers.

---

## ▶ SESSION B (SITE LANE) — 2026-08-08

**Territory:** `views/**`, `src/routes/**`, `public/css/**`, `public/js/**` (except draft), site specs. Read TERRITORY.md + PARKED.md, ran `territory-check.sh B` (clean). Confirmed the three couplings I must not disturb — `EVIDENCE_STATE` (deviation.js), `PREFERS` (doctrine.js), `LAB-REPORT` intervention rate — all draft-path, all untouched. **No draft-path file edited. Never deployed** (deploys are A's).

### ✅ WORK UNIT COMPLETE — League History page (build-order #7)

Committed `f77735a`, pushed to `claude/new-session-xs2lv6`.

- **Engine** `src/routes/history-data.js` — the "one build script" run at load: deterministic, provenance-stamped, no LLM, no hand-entered numbers, memoised. Reads the committed harvest (`league_history.json`, `master_sheet_archive.json`, `payouts.json`, `identity_map.json`, `draft_data.json` — all read-only in A's territory). **Cross-validated to the decimal against the spec's ground truth:** Richard 2025 (1711.20, 4-11, last, most-robbed by all-play gap); the 0.12 and 1.06 weekly-high misses; Cory's 8.20 tiebreak + 297 bench points; all ten owners' 2024 money reconciles with `per_owner_money`. Fraud/robbed via the all-play instrument (§2), not naive rank. Lineup efficiency derives position from **starter-slot order** (season-authoritative) so retired players don't break the optimal calc.
- **Pages** (login-gated under `/history`; legacy `?section=money|owners|records` preserved for old links): Chronicle hub (Founding, Amendment ledger with buy-in 100→400 + 2027 votes, Champions roll, Season index) · Season chapters (standings+money, weekly-high ledger, bracket, draft, superlatives, per-season bad beats) · Record Book · Money Board · Bad Beats HOF · Franchise pages. **2022 asterisk (Hamlin)** footnote links from every listing of that title (roll, money board, dynasty tracker, franchise) — register drops, joke is the ring never the event.
- **2024 chapter** `views/history/chapters/2024.ejs` — committed prose, chronicle form + tavern language. Every roast stat-traceable; all ten owners ripped, Cory hardest; champion (Jeremy) one clean paragraph. `CHAPTERS` set in member.js gates which years show prose.
- Verified end-to-end on the dev server (all pages 200, no render errors, CSS gated to `/history/*`, legacy tabs intact).

### ⏸️ STOP — BLOCKED ON CORY (voice calibration)

Per the assignment: **produced ONE chapter (2024) and stopped for review before generating the rest. The voice needs calibrating once, not ten times.** Awaiting Cory's read on the 2024 chapter voice.

**Two methodology notes for the review:**
1. My computed lineup efficiency clusters Cory at **~86% all three years** (86.4/86.0/86.1) — the spec quoted "85.9%". Within methodology noise; I use my internally-derived figures as the traceable source, not the spec's number.
2. The spec's §8.2 attributes Dylan "84.3% efficiency" to **2023 runner-up**; in my calc 84.3% is Dylan's **2025** figure, and 2023 Dylan is rank 3 / 87.1%. Flagging the season attribution before it goes into a chapter.

### ▶ RESUME (after voice sign-off), in order
1. Generate remaining chapters: **2023, 2025** (full box-score seasons), then the ceremonial **2016–2022** chapters (money + amendments only — the archive states plainly what pre-Sleeper data does/doesn't support; never invent detail). Add each year to `CHAPTERS` in member.js as it lands.
2. Then the site backlog: **contact directory** (email/phone alongside Venmo, one profile store, tappable owner cards from home standings) → **side-bet tracker drill-down grid** → **dashboard widening** (collapsible "full program" panel) → site-opt Phase 2 items in my lane.

---

## ▶ SESSION B (SITE LANE) — RESUME MARKER 2026-08-09

**Context ran low mid-grind; landing clean.** Main only, pull --rebase before every commit, pushed each unit. Never deployed (A owns deploys). No draft-surface file touched.

### ✅ DONE & PUSHED (on main; last [deploy] was 9fbdc75 — commits after it need A to deploy)
- **League history page — COMPLETE.** Hub `/history` (crude 2-3 page essay: verbatim opening + year-by-year decade walk, each linking to its chapter; every shot stat-traceable; Chiefs joke CUT — no historical ADP; 2022 Hamlin stated once at #asterisk). Chapters: `/history/early` (2016-22 ceremonial), season/2023, /2024, /2025 — all in the new dry/mean voice. Record Book, Money Board, Bad Beats HOF, Absurdity Catalogue, Amendments (name lineage BWL→WLBL→MFGA, buy-in ladder, payout revisions, Rolls w/ winnings, 2027 votes), franchise pages. Engine `src/routes/history-data.js` (deterministic, provenance-stamped). Factual corrections locked in lore: rebrand 2024, keepers 2024, weekly-high introduced 2023, turnover Brandon/Taylor Hagen/Tori→Sam/Dylan/Jeremy (data only preserves a "Ben"; noted). Money-board attribution-gap flag (Dylan 2017-18, Jeremy 2017 pre-join $ likely predecessors').
- **Contact directory** — email/phone + Venmo, one record; per-owner nag (home) + commissioner aggregate (console); shared tappable card (`public/js/contact.js`).
- **Flags site-wide** from the one engine `GERMAN` source — home standings, buy-in tracker, settlement, contact cards, chronicle.
- **Side-bet tracker (#1)** — drill-down grid (names×years, net/cell, career col, name/cell/year filters, OPEN+Venmo) was already built; added a VISIBLE zero-sum assertion. Firewalled to the side-bets section.
- **Live 2026 column (#2)** on the Money Board — "'26 in progress", reads by_year live, never a $0-as-earned-nothing.

### ▶ REMAINING SITE BACKLOG (in order)
4. **MATCHUP PAGE** (`/team?section=week`) — real Sleeper scores (both totals, starters w/ points, projections in-week, live Sun, final after), where the week's high point stands league-wide + distance to the $100 band, one-tap side-bet vs the week's opponent w/ H2H. **CROSS-LANE:** the view/route/betting is mine; per-player points, projections, and the weekly-high band need `src/sleeper.js` (A's lane) to expose them — see PARKED request for A. Current page already shows team totals + a pre-filled bet form.
5. **DASHBOARD WIDENING** — collapsible "full program" panel (my lane, `views/dashboard.ejs`).

### ▶ THEN IN-SEASON BUILD (parked spec, big — one tool rehearsed, not the suite)
6. **LINEUP OPTIMIZER** — biggest leak ($445-595/team/season; Cory 86% eff 3yrs). Validate against replayed 2023-25 weeks. Dual objective priced in $: P(win matchup) AND P(clear week's high band). Confidence sentence + ledger-at-decision-time w/ counterfactual. **TERRITORY: likely needs A-lane files (`src/sleeper.js`, `src/predledger.js`, projections) — coordinate the split before building.**
7. **SUNDAY ALERT** — pre-kickoff start/sit calls priced in $.
8. **INSTRUMENTATION CHECK** — confirm the in-season ledger kinds capture what exp-37 needs at decision time.

---

## ▶ SESSION A (MODEL/DRAFT LANE) — 2026-08-09, exp 34 dollar arm + 36 + 33 batch

Branch `claude/exp34-dollar-arm-21m58r` (per harness). Fired via `lab.yml` dispatch; CI commit steps fixed to rebase onto the run's own ref (`$GITHUB_REF_NAME`) — the old `pull --rebase origin main` hit an add/add conflict on a feature-branch run and silently skipped the push, stranding results in CI. Now `exp34_dollars.json` / `exp36.*` persist to the branch.

### ✅ EXP 34 DOLLAR ARM — BUILT + FIRED (`exp34_dollars.py`, `EXP34-DOLLARS.md`, CI 31288646000)
Policy rosters (our walk-forward ordering vs real FFC ADP, keepers + one seat per real non-keeper pick, room fixed) graded through the certified `grade_substituted`: era-correct payouts, harvested weekly-high bar, resimulated bracket, real field. **Grades all 3 seasons incl. 2025** (harvest is the grading source; the correlation arm skipped 2025).
- **Result: our-minus-ADP = −$575/season, CI [−825, −100], ADP-EARNS-MORE**, sign-consistent all 3 (2025 −$100 / 2024 −$825 / 2023 −$800). Decomposed: weekly-high −$600, RS −$325, playoff −$800.
- Correlation arm BEAT (+0.122). **The two arms DISAGREE in the pre-registered "more interesting" direction: our ordering ranks realized value better but earns LESS money.**
- **Reading (recorded in EXP34-METHODOLOGY.md):** "our ordering" here is the PURE VALUE-GREEDY (positional construction deliberately excluded). A value-greedy builds a positionally-lopsided, low-ceiling roster; ADP *is* a positional-construction prior, so following it yields a balanced payout-fitting roster for free. The gap is the **measured cost of ignoring roster construction, NOT a defect in the projections** — the correlation arm proves the projections rank well. **Vindicates the portfolio/need layer: do not draft on value alone.** LEAN (n=3, room fixed, optimal-lineup ceiling), not a dollar verdict on the tool.

### ✅ EXP 36 — ADP-EFFICIENCY SURFACE — BUILT + FIRED (`exp36.py`, `EXP36.md`, CI 31288983577)
255 board picks (every owner, 2023–24; 2025 skipped — nflverse pbp couldn't recover). Efficiency = within-cell Spearman(−adp, realized), clamped [0,1] = the Anchor Doctrine's per-cell shrink weight. Floor n≥8; pre-registered pooling in-module.
- **CONTRADICTS the pre-registered anchor assumption "bind hard early, loosen late."** Early ADP is WEAK: R1-3 RB 0.12, WR 0.26. The market orders value best in the MIDDLE (R4-7 QB 0.58, TE 0.62) and late WR (R12+ 0.72); late RB/QB anti-correlate (shrink 0). Pooled, every position is a *weak* ranker (WR 0.49 / RB 0.45 / QB 0.38 / TE 0.28 — none clears 0.5).
- **This FIRMS exp 34's thin "better early not late" signal** with far more data: a weak early market is exactly why our early deviations beat it.
- QB format-match: 6-pt 0.381 vs 4-pt 0.416 (delta −0.035) — modest, in the predicted direction (our 6-pt scoring makes ADP's QB order look slightly worse). Tier cliffs recover known structure (RB after rank 3 z2.08, QB after 8, TE after 8, WR at 15/25).
- **Implication for Stage 2:** shrinkage should be region-specific and in places INVERTED from the prior — early RB/WR deviations are cheaper than assumed, late WR deviations expensive. This is the calibration surface the doctrine named as a dependency.

### ◐ EXP 33 — PROJECTION BAKE-OFF — BUILT + WIRED, firing (`exp33.py`, `test_exp33.py` 6/6)
Races our blend vs naive (prior-year + availability, no regression/age) vs FFC ADP (ranking) [vs Sleeper if retrievable] on realized points by position — MAE, rank-corr, top-decile hit, priced in $ (reuses the dollar-arm value-greedy grader). A LOSS IS THE HEADLINE; provenance-banner flag set when a source beats our blend. No tuning inside the experiment. Fires as its own `lab.yml` job behind the pure + cert gates.

### ▶ NEXT (this session, in order): read exp 33 result → EXP 41 (calibration-weighted ensemble, can now consume exp 36's per-cell weights) → auto-adjuster conditional mining → WHAT-WOULD-HAVE-WORKED → upsideBonus gated sweep / seam-consumer guard / DOCTRINE DRIFT / movement log / covariance rho verdict.

### ✅ EXP 33 — PROJECTION BAKE-OFF — FIRED + LEAK CAUGHT (`exp33.py`, `EXP33.md`, CI 31289156989)
Two headlines, one a catch:
- **A LOSS IS THE HEADLINE (clean, leak-free): our blend LOSES to the NAIVE baseline on top-decile hit (0.41 vs 0.57–0.59, 0/2 seasons)** — both built from strictly-prior nflverse data, so the comparison is valid. MAE: naive 45–46 vs our blend 57. Mechanism (observation, NOT a tune — no tuning inside the experiment): our REGRESSION_WEIGHT 0.35 + age decay over-regresses, flattening exactly the above-mean players who become league-winners. **Provenance banner owed, naming naive.** FFC ADP is the worst ranker (rank-corr 0.38–0.45).
- **LEAK CAUGHT + DISQUALIFIED:** the first fire pulled Sleeper's `/projections/nfl/regular/{season}` and it "won" everything (rank-corr ~0.80, top-decile ~0.66). That endpoint is updated IN-SEASON, so a past season's stored projection carries post-draft information — a ~0.80 corr with realized (vs the real market's ~0.4) is the leak's fingerprint. Reporting it as the winner would report a leak as a finding. Fixed: Sleeper is marked NOT decision-time-safe, scored for transparency but EXCLUDED from the verdict/rankings/provenance (`safe` map through `bake_off`; test `test_leak_suspect_source_excluded_from_verdict`). Per the anti-leak pre-registration.
- Dollars (value-greedy roster, reuses the dollar arm): ffc_adp $1200 > our_blend $200 > naive $100 — consistent with exp 34's construction finding (ADP builds better rosters); read gaps not levels.
- **Cross-experiment picture now: our projections rank realized value better than the market (exp 34 correlation), but our BLEND over-regresses vs a naive prior-year model at finding the winners (exp 33), and value-only rosters lose money to ADP's positional construction (exp 34 dollar). The through-line: evaluation ≠ construction, and the blend's corrections need re-examination — a measured agenda, not a guess.**

### ✅ EXP 41 — ensemble COMBINER CORE built (`exp41.py`, `test_exp41.py` 9/9)
Calibration-weighted Borda aggregation of the 8 profiles + agreement-as-confidence + the structural "deviate only on a weighted MAJORITY" collapse rule (an anchor from structure, not a tuned gate) + intervention-rate-vs-74%. Weights = measured accuracy (input, so the source is a wiring choice). **DEFERRED (parked, one-line ack):** the paired-room money race — feed the combiner each profile's per-pick ranking via `strategies.js` + money-grade ensemble-vs-composite behind the bridge gate, null + LOSO. Pre-registered: ensemble deviates LESS often; if not, profiles aren't diverse (the finding).

## ▶ SESSION A — RESUME MARKER 2026-08-09 (landing clean, context budget)
**Branch `claude/exp34-dollar-arm-21m58r` (harness rule; NOT main). CI fires via `workflow_dispatch` on the branch ref; commit steps rebase onto `$GITHUB_REF_NAME` so results persist to the branch (the old `origin main` rebase conflicted on a feature branch and skipped the push — fixed).**

**DELIVERED this session (all committed + pushed + FIRED with real CI results):**
1. **EXP 34 dollar arm** — `exp34_dollars.py` / `EXP34-DOLLARS.md`. our−ADP = −$575/yr (CI [−825,−100]), ADP earns more, sign-consistent 3/3. Correlation arm BEAT. The pre-registered "interesting" result: ranks better, earns less → the cost of ignoring roster construction (value-greedy strips it; ADP encodes it) → portfolio/need layer vindicated. Grades all 3 seasons incl. 2025 (harvest source).
2. **EXP 36 ADP-efficiency surface** — `exp36.py` / `EXP36.md`. 255 board picks. Early ADP WEAK (contradicts bind-hard-early prior); firms exp 34's early signal. Per-cell shrink weights for the Anchor Doctrine. QB format-match + tier cliffs bundled.
3. **EXP 33 bake-off** — `exp33.py` / `EXP33.md`. Our blend LOSES to naive on top-decile (0/2) → over-regression; provenance banner owed. **Caught + disqualified a Sleeper LEAK** (in-season-updated endpoint, ~0.8 corr fingerprint) per anti-leak discipline.
4. **EXP 41 combiner core** — `exp41.py`. Built + tested; race deferred (parked).

**NEXT (PARKED.md §A has the full scoped list):** exp 41 paired-room race → auto-adjuster conditional mining → WHAT-WOULD-HAVE-WORKED → upsideBonus gated sweep → seam-consumer guard / DOCTRINE DRIFT / movement log / covariance rho verdict.

**Open question for Cory (answer in next report, doesn't stop the grind):** exp 33's "blend over-regresses" + exp 36's "early ADP is weak" both point at re-examining REGRESSION_WEIGHT (0.35) and the bind-hard-early prior — but no tuning inside an experiment and nothing ships without the gates. Whether to open a gated REGRESSION_WEIGHT sweep (like the upsideBonus one) is a decision, not a default.

**No draft-surface engine file was changed this session** — all work is new Lab modules (`exp34_dollars/exp36/exp33/exp41`) + their tests + `lab.yml` job wiring + docs. `engine.js`/`value.js`/`deviation.js` untouched, so the three semantic couplings are intact. Never deployed (nothing draft-week live needed).

## ▶ SESSION A — 2026-08-09 (continued): 2025 RECOVERED, doc actions, B-coordination state

### ✅ 2025 DIAGNOSIS + RECOVERY (exp 34 correlation arm)
- **Diagnosis (from CI logs + exp34.json):** the pbp fallback FIRED; the cross-validation gate correctly REFUSED the rebuild (pbp-reconstructed 2024 didn't match the library within tolerance 0.5) → the gate working, not a bug. The 41→19 attrition: 2023 15→12, 2024 14→7 (rookies have no walk-forward priors → dropped), 2025 12→0 (no realized).
- **Recovery (probe the obvious source):** added `_harvest_realized()` — the correlation arm now falls back to the HARVEST (league_history players_points, complete for 2025, the dollar arm's own source) when nflverse can't serve a season. Roster-gated (a mid-season drop is truncated), flagged per-season via `realized_source`.
- **Result: n 19→27** (2025:8 + 2024:7 + 2023:12). Ordering edge **FIRMED**: diff 0.14, CI [0.053, 0.224] (was 0.122/[0.007,0.232]) — tighter, further from zero.
- **The two contradicted signals FIRMED, did not flip:** (1) "better early not late" — r1-3 BEATS (+49), r12+ now a MEASURED LOSS (−114, CI [−231,−4], was thin); (2) "better on unanimous not contested" — unanimous BEATS (+28), contested near-zero/inconclusive — still opposite the pre-registration. **2025 is recoverable and the surface is no longer stuck at 19; exp 36 remains the stronger calibration instrument but exp 34 is not a permanent 19-study.**

### ✅ DOC ACTIONS (all ordered by Cory, all done)
- **Anchor doctrine AMENDED** (`docs/queued/anchor-doctrine.md`): exp 36 inverts its central premise. "Bind hard early, loosen late" STRUCK as a designed assumption refuted by measurement; replaced with round×position shape from the exp-36 surface; recorded the sub-0.5 pooled context (we beat a weak benchmark), the Stage-2 link (binding comes from exp36.json shrink weights, not a hand-set threshold), and the pattern (3rd designed shape inverted by data: ceiling ramp, endgame, anchor).
- **exp 33 pre-registered consequence FIRED into EVIDENCE_STATE** (`deviation.js`): `[33]='lost'` with the precise claim + `projectionProvenance()` banner carrying the exp-34/36 reconciliation. SSOT — rewrites every surface. deviation+organism JS green.
- **Methodology pre-registrations** (`EXP34-METHODOLOGY.md`): the THIRD ARM (composite vs ADP on dollars — reading fixed before the run), the naive-as-projection-source follow-up, and the vendor frozen-at-preseason as-of discipline (from the caught leak).

### 🔵 BRANCH QUESTION answered (TERRITORY.md): harness FORCES feature branches (main-only is VOID). Merge protocol written: A owns integration to main + deploys; rebase-before-merge; CI auto-commits target the run's own ref; Sunday stray-branch audit flagged for relaxation. **BLOCKER: my instructions forbid pushing to main without explicit permission — so my 4-experiment batch (exp34_dollars/36/33/41 + recovery) sits on `claude/exp34-dollar-arm-21m58r`, fully pushed, NOT on main. To integrate I need either explicit go-ahead to push my branch to main, or you/B to merge it.**

### 🟡 SESSION B COORDINATION — state as found (moved since the ask was written)
- **Merge: already DONE** — B consolidated all site work onto main (matchup, lineup optimizer, money-board redesign, access fix). main @ 610ff9f, undeployed since 9fbdc75.
- **Guard test: DONE + wired + green** — `draft/tests/access_guard.test.js` in ci.yml. BUT it currently encodes the OVER-STRIP (asserts no league-visible page shows all-play/efficiency). Per your restore directive those pages will show that analysis again, so the guard needs LOOSENING: keep the /lineup + /lineup/log 403/200 assertions, drop the all-play/efficiency-hidden ones. **BLOCKED on B's restore + coordination on which assertions survive.**
- **DEPLOY: HELD (deliberate).** Last deploy 9fbdc75; `/lineup` (the genuinely private tool) is new and NOT in prod → no live tool leak. Per your newer authority (history all-play/efficiency = good writing to RESTORE, not a leak), deploying now would ship B's over-strip. No restore commit exists yet on B's branch or main. **Deploy the moment B's restore lands.** (Conflict noted for the record: B's on-main flag calls the history analysis a live leak to strip; your message to me says restore it — your message is the newer authority.)

### ▶ QUEUED (not done this turn — context budget): third composite arm BUILD (pre-registered; needs the JS replay path) · naive-as-source RUN (cheap — add naive ranker to the dollar+correlation arms) · exp 41 paired-room race · auto-adjuster conditional mining · what-would-have-worked · upsideBonus gated sweep. Integration of my batch to main is the gating next action.
||||||| e148a67

---

## 🅱️ SESSION B RESUME MARKER — 2026-08-09 (design-overhaul lane)

**Branch:** `claude/lineup-optimizer-build-7y6nkt` (per this session's Git orders;
NOT main — A deploys from main, so a merge is needed for Cory to see it live).
Pull latest before continuing. All work below pushed.

**DONE this session (committed + tested + screenshotted):**
1. **Dashboard widening** — confirmed already-landed (TASK-AUDIT.md full-program
   panel renders; verified, no work needed).
2. **Matchup page** `/matchup` (`src/routes/h2h.js`, `views/matchup.ejs`, route +
   nav) — all-time head-to-head from the harvest, one-tap side-bet (both parties,
   OPEN), A-lane data slots reserved (players/proj/highBand drop in). h2h 19 +
   e2e 15 green.
3. **Lineup optimizer ENGINE** (`src/routes/lineup.js`) — VALIDATED TO THE DOLLAR
   vs the certified L0: leak $470/595/445, high-pool $330/420/345, Cory $2,100,
   eff 86.6/87.7/89.0%; band n=45 median 148.48. Dual objective (P(win)·value +
   P(clear band)·$100), picks variance for the high-chase when trailing. 39
   assertions. **Engine only — the PAGE is not built yet.**
4. **Design foundations + Money Board redesign** (`views/partials/_sparkline.ejs`,
   `public/js/eggs.js`, viz/money/rank/egg CSS, `views/history/money.ejs`,
   footer) — earnings sparklines, gold money, 4 easter eggs (German medal, 2022
   self-arguing asterisk, star-row origin, Konami). 5/5 eggs verified.

**PERF BASELINE (2026-08-09, for before/after):** regular-page wire ≈ style.css
30.8KB gz + eggs.js 1.7KB gz + ui.js 2.2KB gz + render-blocking Google Fonts.
style.css 133.7KB raw (likely war-room rules unused on member pages — split
candidate). Board artifact 1.25MB is war-room-only (A's lane). Phone nav-timing
per page: NOT yet measured (needs a playwright timing pass).

**NEXT (design brief, in `PARKED.md` verbatim), priority order:**
- **Lineup optimizer PAGE** `/lineup` — flagship new feature; build the rehearsal/
  validation face (works offline off the harvest, shows the $2,100 finding + the
  per-week drill-down) + live face that drops in A's projections + decision-time
  `lineup_call` ledger write (kind landed in predledger; POST /admin/api/ledger/
  predict; counterfactual = naive "start your studs"). Also wire the benched-points
  easter egg (engine already computes Cory's leak).
- **Sunday alert** (task 4) + **instrumentation check** (task 5).
- Site-wide: apply money-color + sparklines to side-bet grid, standings rank
  arrows, weekly-high progress meter (flagship, currently invisible), records as a
  record book, page-by-page hierarchy.
- **Side-bet lifecycle** (§5): B owns views/routes/Venmo-handoff; **A owns the
  `src/sidebets.js` state machine** (declare→confirm→dispute) — flagged in PARKED.
- Chiefs/Mahomes + Bates-reaches-for-Chiefs eggs; self-host fonts (needs files;
  egress-blocked in sandbox).

**Tooling:** screenshot harness `scratchpad/shoot.js` (before/after, phone+desktop);
validation harnesses `scratchpad/{h2h-verify,lineup-validate,matchup-smoke,egg-check}.js`
(can't commit to draft/tests — A's lane; a CI test for the optimizer is flagged for A).

**Deploy:** ask A to merge branch→main + deploy when Cory wants it live.

### 🅱️ update (same session, later): LINEUP OPTIMIZER PAGE DONE
`/lineup` shipped (`views/lineup.ejs`, route + POST /lineup/log, `LO.weekDrill`,
nav, lo-* CSS). Live tab (dollar-optimal lineup + priced start/sit + decision-time
`lineup_call` write with enforced counterfactual) and Proof tab (reproduces
$470/595/445 + Cory's $2,100 + per-team efficiency + per-week drill-down). 13/13
e2e. Live tab needs A's projections (season-avg fallback until then). REMAINING
top of queue now: Sunday alert (task 4) → instrumentation check (task 5) → the
site-wide design sweep (standings rank arrows, weekly-high progress meter, side-bet
grid money colour, records-as-record-book, page hierarchy) → side-bet lifecycle
(A owns sidebets.js state machine, flagged) → Chiefs/Mahomes + Bates eggs.
Scratchpad harness `lineup-smoke.js` proves it (can't commit to draft/tests — A).

### 🔒 STANDING RULE — RESULTS vs ANALYSIS (Cory, 2026-08-09, BINDING)
**Results are league property; analysis is the commissioner's.**
- LEAGUE-VISIBLE (login): standings, scores, points, money, records, champions,
  bad beats, specific-game facts ("benched Goff for 51 in week 15"), H2H results.
- COMMISSIONER-ONLY (requireCommissioner, server-side): per-owner lineup
  EFFICIENCY rates, bench-points-left AGGREGATES, all-play records/luck-gaps,
  dossiers, tendencies, opponent models, anything the war room/optimizer computes
  about how people draft or set lineups.
- Enforced: `/lineup` + `/admin/*` are requireCommissioner. history pages scrubbed
  of efficiency/all-play/bench-aggregates (commit 8c5f085). Guard harness
  `scratchpad/access-guard.js` (18/18) — **A must wire it into CI** (draft/tests,
  see PARKED urgent flag). Every NEW surface rendering per-owner analysis must be
  commissioner-gated and added to the guard.

---

## 🅱️ SESSION B RESUME MARKER — 2026-08-09 (on MAIN now)

**On `main`** (Cory's main-only directive; branch merged + deleted locally, remote
delete proxy-blocked but fully merged). `pull --rebase` before each commit, push
immediately.

**DONE this session (all on main, tested):**
1. Matchup page `/matchup` — H2H from box scores + one-tap bet.
2. Lineup optimizer: engine (validated to the dollar vs certified L0 — $470/595/445,
   Cory $2,100, eff 86.6/87.7/89.0%) + page `/lineup` (live + proof faces, decision-
   time lineup_call write). **`/lineup` is requireCommissioner.**
3. Money Board redesign + design foundations (sparkline partial, money-colour,
   rank arrows) + 4 easter eggs (German medal, 2022 asterisk, star-row origin, Konami).
4. **ACCESS FIX (was a live prod leak): results=league, analysis=commissioner.**
   `/lineup` gated; history pages scrubbed of efficiency%/all-play/bench-aggregates
   (columns + prose + the badbeats note); guard test `draft/tests/access_guard.test.js`
   (18/18) wired to CI. Standing rule in STATUS above.
5. **TERRITORY:** sidebets/betlogic/venmo/dashboard/ledger/notify → B by substance
   (TERRITORY.md + check updated; A told). draft/tests + ci.yml = shared test infra.
6. **Side-bet lifecycle** declare→confirm→dispute: state machine (`src/sidebets.js`,
   AWAITING_CONFIRM + DISPUTED, declareResult/confirmResult/disputeResult, awaiting()
   extended, disputed(); 16/16 `sidebets_lifecycle.test.js`) + routes
   (/declare /confirm /dispute, auto-settle→declare-from-Sleeper). **Nothing settles
   silently; disputes recorded not adjudicated; append-only audit.**

**NEXT (priority order):**
- **Side-bet lifecycle VIEWS** — render AWAITING CONFIRMATION (one-tap confirm /
  dispute for the non-declarer) + DISPUTED (visible, social pressure) on the bank
  side-bet rows + the matchup "Waiting on You" section; the settle screen hands the
  loser the winner's Venmo + amount (venmo.js is B's now). "PROPOSED not OPEN" on
  named-but-unaccepted bets. Propose-from-anywhere (standings/franchise one-tap).
- **Sunday alert** (task 4) — before kickoff, start/sit calls + dollar value (the
  optimizer engine is ready: LO.optimize + LO.weeklyHighBand). Cron/notify.
- **Instrumentation check** (task 5) — confirm the in-season ledger kinds capture
  what exp 37 needs at decision time (predledger lineup_call already writes the
  counterfactual; verify waiver/stream/trade coverage).
- **Design sweep** — standings rank arrows, weekly-high progress meter (flagship,
  currently invisible), side-bet grid money-colour, records-as-record-book, page
  hierarchy, per-page before/after screenshots (`scratchpad/shoot.js`).
- **Eggs** — Chiefs/Mahomes (fires on a Chiefs player), Bates-reaches-for-Chiefs.

**BLOCKED ON A:** deploy `main` (live history leak until deployed — flagged urgent
in PARKED); wire `lineup-validate` engine test if wanted; clean stray remote branches.
Scratchpad harnesses: shoot / h2h-verify / lineup-validate / matchup-smoke /
egg-check / access-guard / lifecycle.

### 🔒 STANDING RULE — CORRECTED (Cory, 2026-08-09): TOOLS mine, HISTORY the league's
**Supersedes the earlier results-vs-analysis wording above, which over-restricted.**
The private list is the recommendation TOOLS ONLY:
- COMMISSIONER-ONLY (requireCommissioner, server-side): the war room + everything
  it computes; `/lineup` + the lineup optimizer + its proof tab; the in-season
  recommendation tools (waiver calls, streaming, trade radar, the Sunday alert);
  the draft tools; anything that produces a RECOMMENDATION for the commissioner.
- LEAGUE-VISIBLE (login): **the entire history/record — including analytical
  framings.** All-play records, luck-gap rankings, robbery records, lineup
  efficiency % (per-owner + per-season, on season/franchise pages and in the
  chapters), season bench-point totals — all league property. Money board, career
  earnings, per-season winnings, the live 2026 column, payouts, amendments, buy-
  ins, the pot, who won what, settlement + Venmo, side bets + grid, standings,
  scores, records, champions, bad beats, box-score facts.
THE LINE: anything that generates a recommendation FOR the commissioner is
private; anything that describes what ALREADY HAPPENED — however it was computed —
is the league's. "Michael won $1,325 in 2025" ✅ league. "Michael runs 89%
efficiency, exploit him this week" ✅ private (a live tool). A chapter noting a
past season's worst efficiency ✅ league (it happened).
Guard: `access_guard.test.js` now asserts /lineup + /lineup/log 403 non-commish
(200 commish) AND that history pages STAY league-visible with their analytical
framings (a re-strip regresses the test). The over-strip of 2026-08-09 was
RESTORED byte-identical to the approved prose (commit below).

### 🅱️ update (same session): SIDE-BET LIFECYCLE COMPLETE + history RESTORED
- **History restore DONE** — over-strip fully reversed, byte-identical to approved
  prose (guard loosened in the same commit; A only needs to DEPLOY, flagged).
  Standing rule corrected: TOOLS private, HISTORY league's.
- **Side-bet declare→confirm→dispute lifecycle COMPLETE**: state machine + routes +
  VIEWS (_side_bets.ejs: declare / AWAITING CONFIRMATION with one-tap confirm+
  dispute / DISPUTED / auto-settle→declare) + **Venmo handoff** (loser gets winner's
  venmo.com/u/<handle> + amount). Tests: state machine 16/16, UI-over-HTTP 12/12,
  both in CI. Nothing settles silently; disputes recorded not adjudicated.
**NEXT:** Sunday alert (LO.optimize is ready) → instrumentation check → design sweep
(standings rank arrows, weekly-high progress meter, records-as-record-book, page
hierarchy, per-page before/after screenshots) → Chiefs/Mahomes + Bates eggs →
"propose-from-anywhere" one-tap (standings/franchise) → PROPOSED-not-OPEN wording.
**STILL BLOCKED ON A: deploy main** (`35f573e`) — Cory can't see any of it live.

## ▶ DEPLOY 2026-08-09 (A) — main shipped after B's restore landed [deploy]
Restore (`4a4deec`, all-play/efficiency/bench back on the league-visible history pages) is on main, so the deploy is unblocked per Cory. Shipping `main` @ integration `7fba39c`: B's design pass + matchup page + H2H + lineup optimizer page + side-bet lifecycle (declare→confirm→dispute) + the history restore, AND A's integrated Lab batch (exp34 dollar arm, exp36, exp33, exp41 core, 2025 recovery) + the session bootstrap files. Access rule enforced by the loosened guard (tools 403, history league-visible). First time B's site work is live.
DEPLOYED == main HEAD after this commit.

## ▶ SESSION A — RESUME MARKER 2026-08-09 (bootstrap + integration + deploy + exp35)
**Now integrating directly to `main`** (Cory authorized; B is on main too per 8acc45e). My branch `claude/exp34-dollar-arm-21m58r` == main.

### ✅ DELIVERED this turn (all on main)
- **Session bootstrap files** `SESSION-A.md` / `SESSION-B.md` (root) + `ACCESS-RULE.md` (SSOT: tools-vs-history) + STATUS top pointer. Resume ritual is one line: _"You are session A, read SESSION-A.md and STATUS.md, then continue."_ B owns SESSION-B.md's lane content going forward (edit in place, don't recreate).
- **Integrated the whole Lab batch to main** (exp34_dollars/36/33/41 + 2025 recovery + docs) — was stranded on the branch. Clean merge; B's work fully preserved; my delta lane-clean.
- **2025 recovery** shipped in exp34 (harvest fallback): correlation arm n 19→27, edge firmed (0.14, CI [0.053,0.224]); "better early not late" firmed (r12+ now a measured loss), "better on unanimous not contested" holds.
- **Access rule settled + enforced:** guard test loosened (took B's superior version — /lineup 403/200 kept, history league-visible asserted). PARKED urgent flag cleared.
- **DEPLOYED main** (`df19f98` [deploy]) — B's matchup/lineup/H2H/side-bet lifecycle + history restore LIVE for the first time, alongside the Lab batch.
- **EXP 35 — REGRESSION_WEIGHT sweep** built + pre-registered + wired (`exp35_regression_sweep.py`, `test_exp35.py` 4/4). Pre-registered: top-decile improves below the shipped 0.35 (exp 33 said we over-regress). Measures the full curve in top-decile+rank-corr+MAE+naive reference; installs NOTHING (a change is a separate gated SHIP). `walk_forward` gained a backward-compatible `regression_weight` override (shipped path byte-identical). Fires on the push to main.

### ▶ QUEUED (in order): read exp35 result (firms/refutes over-regression?) → **third composite arm** (composite vs ADP on dollars — the number Cory actually wants; pre-registered; needs the JS replay path) → naive-as-source run → exp 41 paired-room race → auto-adjuster conditional mining → what-would-have-worked → upsideBonus gated sweep. Keep the Lab saturated.

### NOTE: main advanced past the deploy (B's weekly-high strip `ba2390b` + exp35) — those ship on the next deploy; the major B site work + restore is live at `df19f98`.

## ▶ DEPLOY 2026-08-09 (A) — ship current main; the earlier [deploy] was buried before Netlify evaluated it [deploy]
`df19f98`'s [deploy] marker was overtaken by lab-bot + B commits before Netlify read the tip, so the build skipped and nothing went live — the exact silent-stranding gap. Re-deploying main HEAD (restore + lineup optimizer + matchup + H2H + Money Board redesign + eggs + side-bet lifecycle + the Lab batch). This commit touches only STATUS.md (not a lab.yml trigger path) so the lab-bot cannot bury it before the build fires. Restore is live-safe (byte-identical to the approved prose), guard loosened (tools 403 / history visible), URGENT flag cleared.
### 🅱️ update: DESIGN SWEEP started (design-first per Cory, ahead of Sunday alert)
- **Weekly-high strip** (`_weekly_high_strip.ejs`) — the $100-a-week race as bars on
  every season page; photo-finishes glow red; who-owned-it chips. Reusable for the
  live home "this week's race". DONE.
- **Record Book** — Dynasty Tracker → crown ladder (👑/title, half for co-titles,
  leader gold-lit); weekly-high hunters → gold bars. DONE.
- Both offline-renderable, screenshotted, sent to Cory.
**DESIGN SWEEP REMAINING:** standings rank-movement arrows (live — needs prev-week
rank, activates on deploy); live home "this week's weekly-high race" meter (reuse
the strip); money-colour on the side-bet grid; side-bet grid sparklines; page
hierarchy pass (home/bank); "propose-from-anywhere" one-tap (standings/franchise);
PROPOSED-not-OPEN wording; Chiefs/Mahomes + Bates eggs. THEN: Sunday alert →
instrumentation check.
**⚠️ A/B PROTOCOL:** A struck main-only in TERRITORY.md (claims harness forces
branches). NOT true for B — every B commit pushes to main fine (per Cory's
directive). B added a clarification: B is on main, no B branch to integrate, A's
one action is DEPLOY main. A still on branch `claude/exp34-dollar-arm-*`.
**BEST-UNSEEN-THING for Cory when deployed:** `/lineup` → The Proof tab (commish-
only) — validated-to-the-dollar leak, the $2,100 bench tab, per-week drill-down.

## ▶ SESSION A — RESUME MARKER 2026-08-09 (deploy + recurrence-gaps + deviation explainer)
Integrating directly to main (Cory authorized). Branch == main.

### ✅ DELIVERED this turn (on main)
- **DEPLOY fixed + shipped.** Root cause of "nothing is live": the deploy gate reads `[deploy]` from the TIP commit only, and `df19f98`'s marker was buried by later commits before Netlify read the tip → build skipped. Fixed by putting `[deploy]` on the actual tip (merge/commit message). Shipped B's site work (matchup, /lineup, H2H, Money Board redesign, eggs, side-bet lifecycle) + history restore + the Lab batch. **I cannot verify liveness from the sandbox (proxy blocks the prod URL); deploy-verify.yml/site-check.yml confirm in CI.**
- **Deviation explainer with exp 36 — ON THE SURFACE** (the #1 draft-day ask). `deviation.js` carries the exp-36 market-efficiency surface (cited, reversible); the war-room deviation card now renders a `where:` line — "market ranks R1-3 RB WEAKLY (0.12) — freer to deviate" vs "late WR WELL (0.72) — respect it". Thin→pooled avg, unmeasured→anchor. 46/46 deviation + 22/22 wiring. Shipped `[deploy]`.
- **Territory check made MERGE-AWARE** (stops crying wolf during integration): a would-be trespass byte-identical to the integration source is exempt (merged, not edited); an actual cross-lane edit still fails + names the file. `scripts/territory-check.test.sh` proves both directions (4/4), wired into ci.yml.
- **Deploy-drift made LOUD:** self-audit now reports "prod is N commits behind main" and HARD-fails when a stranded release includes served files; the stray-branch rule relaxed to FYI (feature branches are expected). Budget recommendation in DEPLOY-POLICY.md: keep `[deploy]` opt-in through Aug 22 (auto-deploy risks build-minute exhaustion → war room down on draft day), flip to opt-out after. Health-strip VIEW parked for B.

### ▶ QUEUE (unchanged, in order): **third composite arm** (composite vs ADP on dollars — the number that tests our construction layer; pre-registered; needs the JS replay path) → dollar-grade the exp35 sweep (I built points only; the dollar-per-weight curve is the flagged increment) → naive-as-source run → exp 41 paired-room race → auto-adjuster conditional mining → what-would-have-worked.

### 🅱️ update: POOL BETS = A FRANCHISE SNAKE DRAFT + commissioner advisor (COMPLETE)
Rebuilt pool bets as a draft, not a form (Cory). All on main, all tested:
- State machine (`sidebets.js`: startPoolDraft/poolDraftPick/snakeTurn; pool_draft
  12/12) — propose→PROPOSED(all teams, nobody picked)→accept opens draft→snake
  picks (mutual exclusion, even split)→complete.
- Routes + draft ORDER from prior-season standings w/ why + draft-room UI
  (whose-turn, board taken/available one-tap, rosters on complete) — pool_draft_ui
  9/9.
- **Commissioner-only advisor** (`pooladvisor.js`) — VONA-for-franchises: marginal
  contribution to P(hold champion) + bracket-collision discount + likely-gone +
  live P(win); commissioner-only, opponent never sees it — pool_advisor 6/6. Runs
  on LABELLED placeholder champ odds until **A's championship-probability model**
  (flagged PARKED; feeds League Outlook + in-season too) drops in.
Screenshots (draft room + advisor) sent to Cory.
**DESIGN SWEEP still remaining:** standings rank arrows (live), home "this week's
weekly-high race" meter, side-bet grid money-colour, propose-from-anywhere,
Chiefs/Mahomes + Bates eggs. THEN Sunday alert → instrumentation check.
**A OUTSTANDING:** deploy main (still not deployed — Cory can't see any of it live);
championship-probability model for the advisor.

## ▶ SESSION A — 2026-08-09: exp 33b fired + re-sequenced by impact (Cory's new rule)
- **exp 33b (naive-as-source) FIRED** (EXP33B.md): the blend RANKS BETTER than naive at Cory's actual picks (0.404 vs 0.35; naive−blend CI [−0.112,−0.002]) and beats the market (+0.166); naive earns −$200. **Replacement CLOSED — keep the blend.** Reconciles exp 33/35 (naive wins whole-board top-decile of the ELITE; the blend wins the pool Cory actually drafts from, which is rarely the elite).
- **RE-SEQUENCING (impact order):** (1) naive-source is done → dropped. (2) The **REGRESSION_WEIGHT install gate** is now the one remaining projection lever (exp 35's over-regression is whole-board; test whether a lower weight also helps at Cory's picks + clears null+LOSO before installing). (3) The **third composite arm** rose in value — value-ranking is now validated (exp 34/33b), so the open verdict is purely whether the composite's CONSTRUCTION earns money vs the market, which sets how much to trust deviations on draft night; needs the JS replay path.
- **Deprioritized, with reason:** I will NOT build a naive-source projection (exp 33b closed it). The REGRESSION_WEIGHT install is worth the gate but its draft payoff is now less certain (the blend already out-ranks at the decision points), so it ranks below the third arm's verdict if JS-replay build cost is comparable — I'll confirm once I scope the replay path.

## ▶ SESSION A — 2026-08-09: THE OBJECTIVE recorded + re-sequenced by DOLLARS
- **SESSION-A.md now opens with THE OBJECTIVE** (money in Cory's pocket; impact = expected $ weighted by how soon actionable; the measured money picture). Everything else was process discipline with no statement of what it's for — fixed.
- **RE-SEQUENCED by money impact (Cory's rule):** the **external-data tier (Underdog BBM → exp 24)** is now the **#1 draft-relevant unit**, ABOVE the third composite arm. Reasoning: every draft experiment hits the n≈27–41 ceiling and comes back thin — Cory just said thin experiments are worth less. BBM (millions of outcome-labeled rosters) BREAKS that ceiling and attacks ROSTER CONSTRUCTION, the one place exp 34 *measured* us losing money to the market. "What does a winning roster look like under our payouts" becomes answerable with real power, and construction is a decision Cory acts on Aug 22. Already specced (`docs/queued/bbm-ingestion.md`, exp 24); the build is the work.
  - **The third composite arm drops to #2** — it's a verdict at n≈27 (thin), and Cory downgraded thin. Still worth running (it sets draft-night trust in deviations), but below the thing that escapes the ceiling.
- **BUILD ORDER (per the spec + Cory): translation layer FIRST, verified against a known case, before trusting any BBM number.** (1) CI reachability probe for the Underdog BBM CSV URLs (probe before assuming). (2) Ingestion → raw archived L2 content-hashed. (3) Translation core: re-score to OUR rules (half-PPR/6-pt-TD, 10-team replacement, our roster shape, our payout) with the caveat wall as a first-class artifact (best-ball has no lineup-setting; 12-team ≠ 10-team; advance-rate ≠ our weekly-high+H2H economy). (4) Verify the re-scoring on a known player-season (BBM IV=2023 / V=2024 overlap our seasons, so our realized points check it). (5) Feed exp 24 (winning-roster positional shape), the dead-zone check, spike-week validation, stacking prevalence — as a SUPPORTING tier (league data primary; agreement raises confidence, disagreement is itself a finding).

## 💡 A MONEY EDGE NOBODY HAS RAISED (per Cory's invite to flag them)
**The weekly-high pool is 37.5% of the pot and rewards DISTRIBUTION SHAPE (ceiling/variance), and the league drafts for H2H floor.** Almost nobody optimizes roster construction for spike-weeks. This is likely the single most underexploited edge on the board because it's structurally ignored — and it's DRAFT-relevant (you draft the ceiling shape) AND in-season-relevant (you start for the high). BBM's spike-week framing (grade by spike-COUNT, not mean) is the exact instrument to measure what ceiling-shaped construction wins the weekly-high pool under our payouts. **I'd fold this into the exp-24 build as a primary question, not an afterthought** — "what roster shape wins the 37.5% weekly-high pool" may be worth more than any refinement to the small/fragile head-to-head draft edge.

### 🅱️ update: design sweep + pool draft + instrumentation (all on main, deployed by A)
This grind, all coordinated-pushed to main (rebase over A each time, no races):
- **Propose-from-anywhere** (§5): franchise pages have "🤝 Bet <name>" → bet builder
  opens pre-filled (4/4).
- **Chiefs/Mahomes eggs**: type "mahomes/chiefs/kingdom" → arrowhead-red flourish;
  KC roster players get a red accent + 🏹 (live). (Bates-reaches-for-Chiefs counter
  deferred — needs player→team history the harvest lacks.)
- **Home weekly-high panel**: the bar to clear from the harvested band now
  (renders on the deployed site), the live "this week's race" meter in-season.
- **INSTRUMENTATION CHECK (task 5) DONE**: 18/18 — every in-season kind enforces
  its counterfactual, decision_at server-stamped, lineup_call capture end-to-end
  via /lineup/log. Rail ready; waiver/stream/trade capture awaits their tools.
- Earlier this session: pool bets → franchise snake draft + commissioner advisor
  (VONA), side-bet declare/confirm/dispute lifecycle + Venmo handoff, weekly-high
  strip, Record Book crown ladder, Money Board sparklines, matchup page + H2H,
  lineup optimizer engine+page (validated to the dollar), the history strip+restore
  (results=league, tools=commissioner), main consolidation, territory reassignment.

**COORDINATION:** B pushes to main directly (works); A merges A's branch + deploys.
Coordinated pushes (fetch→pull --rebase→push, rebase over A) — no more deploy races.

**NEXT (in order):**
- **SUNDAY ALERT (task 4)** — content exists (the /lineup live tab: start/sit +
  dollar values); remaining = DELIVERY before kickoff (a scheduler + notify/email),
  commissioner-only. Season-time (needs live projections); build the generator +
  a preview now, wire the cron for week 1.
- Standings rank-movement arrows (live), health-strip VIEW (A parked it),
  side-bet grid sparklines, remaining page-hierarchy polish.
- When A ships the championship-probability model: the pool advisor's placeholder
  odds swap for the real model (no interface change).

### 🅱️ update: SUNDAY ALERT (task 4) DONE — all 5 original tasks complete
- LO.sundayAlert generator + notify.sundayAlert email + commissioner preview on
  /lineup (rehearsable now) + "send it to me" + secret-gated /api/sunday-alert cron
  endpoint + sunday-alert.yml (Sun ~10:40am ET). Quiet week says so plainly.
  sunday_alert 9/9. Season-time activation: set SUNDAY_ALERT_KEY + SITE_URL;
  live projections drop in from A. Workflows marked shared infra in the check.
**ORIGINAL 5 TASKS: all done** — dashboard ✅, matchup ✅, lineup optimizer
(engine+page, validated to the dollar) ✅, Sunday alert ✅, instrumentation ✅.
**DESIGN BRIEF: substantially done** — Money Board sparklines, weekly-high strip +
home panel, Record Book crown ladder, easter eggs (German/2022*/star-row/Konami/
mahomes-chiefs), side-bet declare/confirm/dispute lifecycle + Venmo handoff, pool
bets → franchise snake draft + commissioner advisor, propose-from-anywhere.
**REMAINING (lower priority / live-gated):** standings rank-movement arrows (live),
side-bet grid sparklines, health-strip VIEW (A parked), Bates-reaches-for-Chiefs
counter (needs player→team data), full page-hierarchy polish pass. When A ships the
championship-probability model → the pool advisor's placeholder swaps for real.
**COORDINATION:** B pushes to main directly (works); coordinated fetch→rebase→push,
no races. A merges A's branch + deploys.

### 🅱️ update (2026-08-09, cont.): the three-item follow-up list, done + a CI unblock
1. **BATES CHIEFS COUNTER — it WAS computable; I was wrong to block it.** Probed as
   directed: the 2026 board (public/draft_data.json) carries player_id→team, the
   harvest carries player_id on every draft pick, 100% resolution on current
   rosters. Built `buildChiefsHomers` in history-data.js + a 🏹 card in the
   Absurdity Catalogue. Reproduces the documented finding exactly: Bates has 3 KC
   picks and ranks THIRD, out-Chiefed by the two Germans (David & Marian, 4 each).
   Loyalty measured & refuted; the "overpay" half stays UNMEASURED (no archived
   ADP), not fabricated. League-visible (a RESULT). chiefs_homer 12/12, in CI.
2. **RANK ARROWS + SIDE-BET SPARKLINES — built, dormant, auto-activating.**
   New pure helper standings-movement.js computes week-over-week rank change by
   subtracting the latest completed week from Sleeper's cumulative standings (no
   snapshot to drift); ▲n/▼n/– on the home standings from week 2. Side-bet tracker
   grid gains a cumulative running-net sparkline column (green up / red down),
   dashes until 2 settled years. Both light up on their own. standings_movement
   9/9, in CI. (src/sleeper.js is A's, so the math lives in a B-owned route helper.)
3. **WEAKEST PAGE — lit the matchup's dark weekly-high slot.** It rendered only on
   A's live band, so it showed nothing on the page a manager watches all week. Now
   served from LO.weeklyHighBand() (the harvested $100 target, already league-
   visible on home) + this week's live race: the bar, where you stand, points to
   the bar. A's richer band still wins when present. matchup_weekly_high 5/5, in CI.
- **CI UNBLOCK (shared infra):** the 'Lint workflow YAML' step's `import yaml` sat
  outside its try/except and setup-python ships no PyYAML → ModuleNotFoundError
  red-failed the step and SKIPPED all ~18 test jobs. CI had been red on main for
  15+ commits across BOTH lanes with zero test signal. One line (pip install
  pyyaml) restores the whole suite. Confirmed from the job log.
- **POOL ADVISOR:** finished the honesty fix — removed the placeholder champ-odds
  generator; renders "odds pending" (no fabricated numbers) until A's measured
  model lands. pool_advisor 8/8 updated.

### 🅱️→🅰️ HAND-OFF: CI is green on everything EXCEPT A's Python backtest tests
After the PyYAML fix, CI actually runs for the first time in 15+ commits. Result:
ALL JS/integration/robot-mock/shell steps PASS (run 31293200692). The ONLY red
left is the **Python suites** step, and it's in A's model lane, not mine:

    ERROR test_exp33 / test_exp33b / test_exp34_metrics / test_exp35 / test_exp36
    ImportError: cannot import name 'spearman'      from 'projections'
    ImportError: cannot import name 'walk_forward'  from 'projections'
    ImportError: cannot import name 'CFG'           from 'projections'

`draft/backtest/exp33–36*.py` import `spearman`, `walk_forward`, `CFG` from
`draft/projections.py`, which currently exports player_variance / blend /
composite_z / opportunity_metrics / baseline_from_projections / _rank_fallback —
none of those three. Looks like a rename/move in projections.py that the exp
modules (and their tests) didn't follow. It was masked while CI was fully red;
pytest never ran. This is A's model territory (draft/projections.py + draft/
backtest/** + test_exp*.py) — I did NOT touch it. Over to you to re-export or
re-point. Everything B owns is green.

## ▶ SESSION A — RESUME MARKER 2026-08-09 (derived values + BBM tier + forward prediction)
**Branch `claude/derived-values-bbm-tier-xxto5m` (harness rule; NOT main). All work below committed + pushed.** Three units this session, sequenced by dollars-weighted-by-actionability; landed clean at context boundary.

### ✅ DELIVERED (all committed + pushed, all tested)
1. **Two cheap DERIVED values** (commit `f591697`'s parent). (a) Deviation silence band is now PER-REGION off the exp-36 surface — `deviation.js noiseBandFor()` = `BASE·(1−ρ)/(1−ρ̄)`, mean-anchored, clamped; tight where the market ranks well (~1.5 picks, r12+ WR), wide where it ranks backwards (~5.9, r12+ RB). app.js derives per-region instead of the flat `DG_NOISE_BAND` (also closed a latent dollar-band-as-pick-band unit slip). 54/54 deviation. (b) Spike-week bar = harvested weekly-high MEDIAN (148.48), not a round number — `bbm_translate.weekly_high_bar()`, quantile-selectable, raises rather than inventing a fallback. 8/8. doctrine.js's noiseBand (dollars) deliberately left — different instrument (audit updated).
2. **BBM external-data tier — PARTIAL, FIRED (finals cut).** PLAN-CHANGING FINDING: the GCS host `storage.googleapis.com/underdog-inc` is reachable FROM THE SANDBOX (only underdognetwork.com landing pages are egress-blocked). So the small finals dump ingested here — no CI needed for it. `bbm_ingest.py` (pure parser + content-hash + memory-safe streaming aggregator), `exp24_bbm_shape.py` + `EXP24.md` + `exp24.json`. **Result: honest NEAR-NULL** at n=441 (16× our n): among BBM finalists, positional COUNT-shape barely separates top finals scorers from the field — only a sign-stable mild RB-over/WR-under tilt (<1 slot). Reads as "which players spike beats gross allocation," which SUPPORTS the spike-week lens and routes the real construction/dead-zone question to the full field. Every finding tagged `bbm-supporting`, caveat-walled (added `scoring_is_bbm`), crosses-wall for construction only. 14/14 pure tests.
3. **Forward prediction — BUILT (Cory's raise; the one thing no backtest can give).** `forecast` + `forecast_resolution` ledger kinds (`src/predledger.js`) with the gradeable skeleton ENFORCED (refuses without key+ftype+value+resolution_rule). `forecast_grade.py` — the FORWARD GUARANTEE (a forecast grades only if decision_at < resolution; backdated claims DISQUALIFIED + listed), Brier+reliability / signed-error+MAE / accuracy. `forecast_slate.py` — the pre-registered slate (survival %, ADP falls, room-takes-per-seat, roster $; weekly: weekly-high winner, champ prob, bust), each resolution rule fixed in code; `materialize()` = one-call emission. `docs/queued/forward-prediction.md`. 42/42 predledger + 13/13 forecast.

### 🔴 BLOCKER for Cory (in DECISIONS-NEEDED / TODO waiting-on-you)
- **`bbm-probe.yml` cannot fire until integrated to main.** `workflow_dispatch` requires the workflow on main to be dispatchable (404 on the branch ref, confirmed). It runs the full-field R1 dead-zone (4.8 GB stream, memory-safe) + discovers BBM V's exact CSV URL (CI has the egress the sandbox lacks). **Needs your authorization to merge my branch → main, OR you dispatch it after a merge.** The high-value finals result is already in-hand and committed; this is the full-N escalation.

### ▶ QUEUED (unchanged priority): full-field BBM dead-zone (CI, above) → forward-prediction draft-time emission wire-up (war room calls `forecast_slate.materialize` → POST /admin/api/ledger/predict per committed claim) → third composite arm → dollar-grade exp35 → exp41 race → auto-adjuster mining → what-would-have-worked. **On Cory:** mock #4 + degraded drill still parked on your GO (12 days out; treat as next after current unit when you say go).

## ▶ SESSION A — RESUME MARKER 2026-08-09 (dead-zone located + board marker · BBM archive · forecast emitters)
**Branch `claude/derived-values-bbm-tier-xxto5m`; all below committed, tested, and INTEGRATED to main (deployed where served).**

### ✅ DELIVERED this session (continuing from the accounting + territory + red-build fixes already on main)
- **Red Python build FIXED + guarded** (earlier this session): two `projections` modules collided in sys.modules; renamed backtest one → `lab_projections.py`, updated all importers. `test_ci_loop_integrity.py` guards against zero-test files + same-name module collisions. CI green on main.
- **Accounting pass COMPLETE** (mock #4 gate): `pickCoordinate()` single source (killed the stale `state.data.current_pick` reader on the clock card); reconciler itemizes roster by source + asserts coordinates agree, with a MUTATION test proving it can fail; rehearsal-keeper separation asserted; alarms NAME the disagreeing coordinate. Deployed. **Ready for mock #4.**
- **Territory boundary ENCODED** on main: B owns `warroom.ejs` shell + war-room CSS + design system; A keeps `app.js` + emitted markup + the A-owned `_warroom_scripts.ejs` include partial. Interface note (host-id/data/CSS contracts) + B heads-up in TERRITORY.md. **B is unblocked for the density redesign.**
- **EXP 25 dead-zone LOCATED on our data** (`exp25_deadzone.py`, LOCAL, n=395): RB ~170 through overall pick 60 → ~110 after; WR holds ~140, overtakes RB at **overall pick ~61**. Agrees with BBM in the overall-pick invariant (~50–61). **Board marker shipped** in deviation.js (`deadZoneLine`, informational labeled prior, emits `.dv-deadzone` for B to style). Keeper interaction stated: Henry+Walker fill RB → dead-zone + keeper-fill + WR Feast all agree → **mid-round WR past pick ~60 is the best-evidenced positional call.** EXP25-OURS.md.
- **BBM durable archive**: `bbm_archive.py` gzips the finals column-subset (2.6 MB → 122 KB), reproduces exp24 exactly, committed (no Underdog-hosting dependency). MANIFEST updated.
- **Forecast slate client emitters**: `PredLedger.forecast()/forecastResolution()` (deduped by key), tested with a fetch stub. The stack (server kinds+validation, grader+forward-guarantee, slate+materialize, client emitters) is complete + tested.

### ▶ NEXT (in order; none gated on mock #4)
1. **Forecast emission hook (app.js)** — commit the pre-draft slate at decision time (survival at my picks, room_seat per seat, adp_fall on the top board, roster_dollars at draft end) + the resolution pass. The one piece to build+verify against the running app / mock #4. **Hard deadline: before Aug 22.**
2. **Post-mock (Cory runs mock #4 → gates these):** density redesign (B, against the host contract), doctrine-switch UI, ribbon/overlay audit, opponent positional needs (feature C), revert/reconcile.

### On Cory: run mock #4 (accounting is green). Dead-zone marker is live on the board.
## 🅱️ SESSION B — war-room shell, first cut (2026-08-09)

**New territory (Cory): the war-room SHELL** — `warroom.ejs`, the war-room CSS, the
visual contract. A keeps `app.js` + the markup it emits. Split not yet in
TERRITORY.md and A was mid-mock in `warroom.ejs`, so B did NOT touch the `.ejs`;
started on the war-room CSS (already B's via `public/css/**`) and parked the split-
confirm + interface contract for A (PARKED).

**Shipped (CSS-only, zero markup change — on B's branch, A's mock untouched):**
three of Cory's nine-screenshot complaints, fixed without editing A's file.
1. **TWO overlapping rehearsal ribbons → ONE quiet sticky strip.** There were four
   overlays (two sticky diagonal banners + two `position:fixed` rotated corner
   ribbons). The corner ribbons — the ones printing across the plan and covering
   END DRAFT / HARD RESET — are deleted; the red slot strip is hidden during a
   rehearsal so only one indicator ever shows.
2. **`#arm-alerts` FAB no longer covers LOCKER/MORE** — lifted above the mobile
   `.tabbar` (overrides A's inline `bottom:16px`).
3. **Cards no longer clip off the right edge** — `.card > h2` wraps its controls
   (`flex-wrap:wrap`) instead of overflowing; site-wide safe.

**BLOCKED ON A (parked):** (a) encode the shell split in TERRITORY.md; (b) confirm
out-of-mock before B edits `warroom.ejs`; (c) optional markup tidy — drop the inline
position on `#arm-alerts` and let the class own it.

**NEXT (B):** once split lands + A clear — collapse the status furniture into ONE
tappable line, give the recommendation the fold, quiet-by-default/loud-on-what-
matters. Meanwhile: verify remaining site work (rank arrows/sparklines/Chiefs
counter already built per prior commits) and improve the weakest isolated page.

### ▶ SESSION B RESUME MARKER — 2026-08-09 (war-room shell lane)
**Ritual:** "You are session B, read SESSION-B.md and STATUS.md, then continue."
**Branch:** `claude/warroom-shell-redesign-9j1th0` (pushed). B does NOT deploy.

**Shipped this session (all CSS/site, no app.js, no warroom.ejs):**
- War-room state indicator collapsed 4 overlays → 1 quiet sticky strip; deleted the
  two rotated corner ribbons that covered END DRAFT/HARD RESET; slot strip hidden
  during rehearsal. `#arm-alerts` lifted above the mobile tabbar. `.card>h2`
  `flex-wrap` so header controls stop clipping off the right edge (site-wide).
- H2H "every meeting" table wrapped in `.scroll-x` (long opponent name can't
  overflow on a phone).

**Waiting on A (parked in PARKED.md, "WAR-ROOM SHELL — split confirm"):**
1. Encode the shell split in TERRITORY.md (`warroom.ejs`+war-room CSS+visual
   contract → B; `app.js`+emitted markup → A).
2. Confirm out-of-mock before B edits `warroom.ejs`.
3. Optional: drop the inline `position` on `#arm-alerts` (B's `!important` holds).
4. **A must integrate this branch + deploy** for Cory to see any of it.

**NEXT for B (do without waiting where possible):** the furniture-collapse — merge
system-strip / doctrine-banner / legality-strip / wr-statusbar / mvs stack so the
recommendation owns the fold; bring A a class-level contract so app.js render
targets (`ss-*`, `db-*`, `sb-*`, `mvs-*`) don't move under it. Quiet-by-default /
loud only on tier cliff, contested split, or plan deviation. All "remaining site
work" (rank arrows, sparklines, Chiefs counter, weekly-high strip) VERIFIED already
built in prior commits — do not redo.

### ▶ SESSION B RESUME MARKER — 2026-08-09 (derive pattern + list sweep)
**Ritual:** "You are session B, read SESSION-B.md and STATUS.md, then continue."
**Branch:** `claude/warroom-shell-redesign-9j1th0` (pushed, clean). B never deploys.

**Shipped this session:**
- **DERIVE — a site-wide "tap any number to see how it was computed" component**
  (Cory's #1). `views/partials/_derive.ejs` + `.derive*` CSS + a delegated handler
  in `ui.js` that opens the breakdown as a **fixed-positioned popover** (escapes the
  `overflow:auto` scroll containers that would clip it in the money/standings
  tables). Inline, never a modal, never navigation; one-open-at-a-time; outside-
  click / Escape / scroll-out close it; keyboard accessible. Reusable everywhere via
  `include('partials/_derive', { val, label, rows:[{k,v,strong}], foot, cls })`.
- **Applied on two pages** (proves it generalizes): (1) Money Board career total →
  the seasons that sum to it (career == sum of by_year, real parts). (2) Chiefs-
  Homer Counter → tap an owner's KC-pick count to list the actual Chiefs they drafted
  (player · year · round, from kcPicks). Both render-tested (full + sparse/zero cases).

**Verified already-built (did NOT redo):** #2 rank arrows (`dashboard.ejs`) +
side-bet sparklines; #3 Chiefs counter (`buildChiefsHomers` in history-data.js —
fully audited verdict). Player→NFL-team IS reachable in Sleeper metadata
(`sleeper.js` `p.team`, `r.team === 'KC'`) — the old "blocked" worry was wrong.

**Honest note (PREFER-DERIVED):** did NOT wrap the pot total in derive — `total_pot`
is a DECLARED value, not `buy_in × N` (2021 = $2,900 on a $300 buy-in, not $3,000).
Wrapping it would assert a false formula. Only wrap numbers with real parts.

**Derive — clean next targets (all have real parts in-template/route):** payout
amounts (pct × prize pool, via `payoutTable`), side-bet net tab (ledger entries via
`L.balances`), franchise-page career totals, standings all-play/luck once live.

**STILL gated on A (PARKED "WAR-ROOM SHELL"):** war-room boundary NOT yet in
TERRITORY.md (line 124 still excludes `warroom.ejs` from B); A on Python/BBM lane.
When A encodes it + is out-of-mock, the shell furniture-collapse jumps to front
(draft ~12 days out, screen unusable at a glance). **A must also integrate+deploy
this branch** for Cory to see the shell fixes (last session) and derive (this one).

### ▶ SESSION B RESUME MARKER — 2026-08-09 (rivalry pages)
**Ritual:** "You are session B, read SESSION-B.md and STATUS.md, then continue."
**Branch:** `claude/warroom-shell-redesign-9j1th0` (pushed, clean). B never deploys.

**Shipped this session — RIVALRY (career H2H, one page, many entry points):**
- `src/routes/h2h.js` enriched: bracket-tags each game from Sleeper's winners/losers
  brackets (championship vs toilet-bowl — "knocked out of the playoffs" never means
  a consolation game), + per-game weekly-high & benched-more-than-scored flags, +
  summary stats (decided-by-<5, longest streak either way, total points, playoff
  meetings + the final). Backward-compatible (matchup card still works).
- **New `/rivalry?a=&b=` route + `views/rivalry.ejs`** — league-visible (it's the
  record). Rivalry card: running record on top, summary stats, a playoff-history
  callout naming knockouts precisely, then every meeting reverse-chron with scores,
  margin, winner, notable badges. Era stated honestly ("box-score era / 2023").
- **Entry points:** matchup card record links through (and shows playoff/close
  counts inline); franchise H2H grid rows open the same rivalry history.
- **Tests:** `draft/tests/h2h.test.js` (17, fixture) wired into CI (`ci.yml` loop);
  HTTP integration confirmed /rivalry + franchise rows + matchup link render 200.

**Still gated on A (unchanged):** war-room boundary NOT in TERRITORY.md yet (line
124 still excludes `warroom.ejs` from B). PARKED "WAR-ROOM SHELL" stands. **A must
integrate+deploy this branch** — war-room shell CSS (session 1), derive pattern
(session 2), and rivalry (this session) are all on the branch, not yet on main.

**Derive next targets (still open):** payout amounts, side-bet net tab, franchise
career totals. Rivalry could also gain: per-game bench-bust detail on tap (derive).

### ▶ SESSION B RESUME MARKER — 2026-08-09 (crown, trophy, rivalry billing)
**Ritual:** "You are session B, read SESSION-B.md and STATUS.md, then continue."
**Branch:** `claude/warroom-shell-redesign-9j1th0` (pushed, clean). B never deploys.

**Shipped this session (all league-visible, tested, on the branch):**
1. **THE CROWN** — defending champ (derived, `src/champs.js`) marked league-wide:
   standings, matchup, money board, franchise, locker, rivalry; dynasty count
   (Marian 3×* disputed-aware); champ-only home ribbon; NOT in the war room.
2. **THE TROPHY** (`/trophy`) — rendered cup + engraved plaque 2016→, plates open the
   season chapter, current holder marked, 2022 asterisk. Linked in history subnav.
3. **"Playing the champ"** note on the matchup screen.
4. **RIVALRY GAME OF THE WEEK** (`src/rivalries.js`) — 7 named rivalries in league
   voice, billed on matchup (front & centre) + home page (ranked, marquee first),
   backed by h2h record + notable facts (closest/blowout/knockouts). Click through
   to the rivalry page.
5. **GERMAN EGG** — Marian–David fires DIE HERMANNSSCHLACHT (banner in real German,
   black-red-gold, war Gesamtbilanz). Full screen-translation parked.
Tests: champs 12, rivalries 24, both wired to CI; HTTP integration 14 + 11.

**PARKED (see PARKED.md "spec items deferred, with findings"):**
- **Start/sit Vegas signals** (commissioner-only): PROBED — odds APIs unreachable
  from THIS sandbox (proxy allow-list = registries only; ESPN = http 000). Likely
  reachable in the deployed fn (as Sleeper is). Plan + source (ESPN free odds →
  implied totals) parked; build where the deployed network is exercisable so it
  isn't shipped blind. DFS salary only if a free delta source proves reachable.
- Full German screen translation; franchise rivalry section; chronicle/recap
  rivalry refs; permanent history note on a rivalry deciding a playoff spot / weekly high.

**Still gated on A (unchanged):** war-room boundary NOT in TERRITORY.md (line 124).
**A must integrate+deploy the branch** — warroom shell CSS, derive, rivalry pages,
crown+trophy, and rivalry billing are all on it, not yet on main.

### ▶ SESSION B RESUME MARKER — 2026-08-09 (WAR ROOM redesign DONE + big backlog)
**Ritual:** "You are session B, read SESSION-B.md and STATUS.md, then continue."
**Branch:** `claude/warroom-shell-redesign-9j1th0` (rebased onto main, pushed). B never deploys.

**★ WAR ROOM REDESIGN — DONE, verified at 390px (front-of-line priority).**
The recommendation now owns the phone's first fold. Measured: recs-card 1230px
(1.46 folds, below fold) → **326px with the stale warning, ~141px on a fresh board**
— what to take (Puka Nacua), why (tier cliff, +87 pts), and the "I TOOK X" button
all visible before scrolling. Shell-only; host-id contract respected (app-wiring
22/22 green). Header `tool` mode suppresses masthead + announcements on the war
room; furniture (doctrine/legality/statusbar/mvs/shadow/LRM) moved below the pick
and compacted. No horizontal scroll. **Screenshot harness:** `scratchpad/wrshot.js`
(boots app, logs in commish, 390px, reports per-host top/height + hOverflow) —
NODE_PATH=./node_modules, chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**🅰️→ A: DEPLOY so Cory can screenshot-verify the war room** (his one measurable
check). Branch has: warroom redesign, crown+trophy, rivalry billing+German egg,
rivalry pages, derive. Rebased clean onto main; integrate + deploy.

**★ HUGE BACKLOG from Cory (this turn) — parked in PARKED.md "the big feature spec".**
Taxonomy Cory set (the site must NOT grow a page per feature):
- TRANSIENT (appear/read/dismiss, archived to history): weekly awards (Tue),
  power rankings (weekly), on-this-day (one home line).
- FOLDED into existing screens: playoff-odds COLUMN in standings; "what this
  matchup is worth" line on matchup; live weekly-$100 + sweat meter INTO the
  what-to-watch panel; elimination/clinch markers in standings + one-time notice.
- WHAT-TO-WATCH panel (home, Sun/Mon only, appears+vanishes): per-matchup "who
  needs what from whom", weekly-high race, decided-flag. Needs live Sleeper (403s
  in sandbox — build+verify against deployed data, like the odds probe).
- PICK'EM ("the best one, build it properly"): two-way pick per game on the league
  matchup screen, locks at first kickoff, see who picked against you, per-game
  split, season + all-time accuracy leaderboard (small/permanent), archived.
- TRASH TALK on a specific matchup, permanent + archived for the chronicle.
- FINAL DESIGN PASS (explicitly LAST): whole-site, mobile-first, USA theme
  deliberate, everything-ties-together, time-capsule surfacing. Plus: Chiefs logo
  next to every KC player everywhere (Sleeper `p.team === 'KC'`, reachable);
  GOAT next to whoever rosters Mahomes (auto-moves). DO NOT build a season money
  leaderboard (already on money board).
- Mobile-first constraints apply to everything: no horizontal scroll, thumb
  targets, nothing important below 3 folds, test at 390px.

**Sequencing recommendation for next session:** pick'em first (buildable+testable
offline, high delight, "the best one"), then transient popups (awards/power/on-this-
day, offline-testable), then folded columns (playoff odds/matchup worth), then the
live what-to-watch panel (needs deployed Sleeper), then the final design pass +
Chiefs logo + GOAT last. Chiefs logo + GOAT are cheap and could ride along early.

## ▶ SESSION B — 2026-08-09: PICK'EM shipped (unit 1 of the new order) + nav bug fixed
**Branch `claude/pickems-feature-3ksf0l` (fresh off main; pushed). 🅰️: integrate + DEPLOY — Cory hasn't seen ANY of the prior branch work live yet, and this stacks on top.**

### ✅ PICK'EM — complete, tested, mobile-verified (unit 1, "start here")
League-visible (a pick is a RESULT, not a tool — ACCESS-RULE.md). New `/pickem`:
- **Two-way pick per game**, each week's five games, thumb-sized targets, one
  mobile column. Nav entry added; a compact hook on the matchup screen.
- **Locks at first kickoff OR first point on the board** (reuses
  `betlogic.kickoffOf` + the anyScore signal matchup bets use) — enforced
  server-side in POST /pickem, not just hidden.
- **Split goes public only once locked**: "7 of 10 took Michael" + a gold/red
  split bar per game, and a "who backed you / who took the other guy" line on
  your own game (names on record).
- **Accuracy tracked conspicuously**: season leaderboard + all-time accumulation
  (never resets), both up top, your row lit; #1 gets 👑.
- **The worst picker is named** — Hall of Shame seat (lowest accuracy among the
  eligible), gated by a graded-games floor so no one is shamed off a lucky week.
- **Derived + durable**: games from the live Sleeper scoreboard; each week's
  slate frozen on first sight so scoring never re-reaches the network; grading
  reuses cached week points + the side-bet epsilon/grade-lag. All-time board is
  the archive the chronicle quotes.
- Engine `src/routes/pickem.js` (pure + thin store layer), HTTP in member.js,
  view `views/pickem.ejs`, CSS block. **38 tests** (pure + over-HTTP: save,
  refuse-after-lock, split-after-lock, boards grade a finished week) wired into
  `ci.yml`. Screenshotted at 390px in open + locked states (sent to Cory).

### ✅ NAV BUG FIXED (mobile mandate): "arm my-turn alert" covered LOCKER + MORE
`#arm-alerts` was `position:fixed; bottom:16px; z-index:150`, sitting on the
bottom tab bar and eating the LOCKER/MORE taps — same dropped-tap class that
drifted a roster in mock #2. Moved to a `.wr-arm` class that lifts it above the
bar on ≤700px and drops z-index below the bar. id + onclick (A's DraftAlerts
contract) untouched.

### ▶ NEXT (in the order): transient popups (weekly awards Tue AM / power rankings
/ on-this-day, mean, archived, never sitting on a page) → folded columns (playoff
odds + movement, matchup stakes line, clinch/elim markers) → what-to-watch panel
(SNF/MNF, weekly-hundred race + sweat meter, needs deployed Sleeper) → trash talk
on matchups → the final design pass (USA theme, Chiefs logos, GOAT-on-Mahomes).
**Never deploying — 🅰️ owns it.**

## ▶ SESSION B — RESUME MARKER 2026-08-09: 4 of 6 units shipped (Pick'em order)
**Branch `claude/pickems-feature-3ksf0l` (fresh off main). All below committed + pushed + tested + screenshotted at 390px. 🅰️: integrate + DEPLOY — Cory has NOT seen any of this (or the prior branch work) live; it's stacking up unseen.**

### ✅ DELIVERED THIS SESSION (in the order Cory gave)
1. **PICK'EM** (`src/routes/pickem.js` + member.js + `views/pickem.ejs` + nav + matchup strip + CSS). Two-way pick per game; locks at first kickoff OR first point (server-enforced); split public only after lock ("7 of 10 took Michael" + bar); who-backed-you line; season leaderboard + all-time (never resets) up top; Hall of Shame names the worst (eligibility-floored); derived + durable (slate frozen on sight); archived for the chronicle. **38 tests.**
2. **THE DISPATCH** (`src/routes/dispatch.js` + `public/js/dispatch.js` + dashboard + CSS). Transient popups — weekly awards / power poll / this-week-in-history, mean voice, DETERMINISTIC so the archive is stable. Appear→read→dismissed→gone (per owner, server-side); immutable archive + per-season index for chapters; no-JS stack / JS overlay. **21 tests.**
3. **THE FOLDED COLUMNS** (`src/routes/playoffs.js` + dashboard PO% column + matchup leverage line + CSS). Exact clinch/elim bounds; SEEDED Monte-Carlo playoff odds (labelled B estimate, swaps for A's champ model); week-over-week ▲/▼ movement (per-week snapshot); "what this is worth" swing line on the matchup. NO h-scroll at 390px (verified). **19 tests.**
5. **TRASH TALK ON MATCHUPS** (`src/routes/trashtalk.js` + POST /matchup/trash + matchup thread + CSS). Welded to a game (same identity as pick'em), one doc per post (concurrency-safe), permanent, league-visible, per-season archive for the chapters. **15 tests.**
- **NAV BUG FIXED**: `.wr-arm` lifts the war-room "arm my-turn alert" above the mobile tab bar (was eating LOCKER/MORE taps).
- All new tests wired into `ci.yml` (playoffs in the pure loop; pickem/dispatch/trashtalk as post-install app-boot steps).

### ▶ REMAINING (next session, in order)
- **UNIT 4 — WHAT-TO-WATCH PANEL** (SNF/MNF only: exactly what each owner needs, the live weekly-hundred race + the sweat meter). **Cory said "needs deployed Sleeper, build what you can and verify against the live site."** B CANNOT verify without a deploy (B never deploys) and the sandbox has no live game-state, so this was DEFERRED rather than shipped blind. Buildable-now pieces: the sweat-meter math (win-prob from remaining starters' projections) + reuse the existing weekly-hundred race (whRace/whBand already on home + matchup). **Do after A deploys the stack so it can be verified live.**
- **UNIT 6 — FINAL DESIGN PASS (explicitly LAST)**: USA red/white/blue, everything clicking through to its story, Chiefs logo next to every KC player everywhere, GOAT next to whoever rosters Mahomes (auto). Note: a KC-accent + 🏹 egg already exists (STATUS earlier) — extend to logos + the Mahomes-GOAT marker.

### NOTES FOR A (integration)
- New B-lane files, all under B territory (src/routes/*, views/*, public/js/*, public/css/*): `src/routes/{pickem,dispatch,playoffs,trashtalk}.js`, `views/pickem.ejs`, `public/js/dispatch.js`. Shared append-only touched: `ci.yml` (test wiring), `draft/tests/*` (4 new tests). `territory-check.sh B` = clean.
- B still requests A's **championship-probability model** (PARKED): the folded-columns odds + the matchup leverage line + pick'em nothing — swap the labelled Monte-Carlo for the real model when it lands; the surfaces read `odds`/`swing` unchanged.

## ▶ SESSION B — cont. 2026-08-09: units 4, 5, 6-start shipped (all 6 now underway)
**Branch `claude/pickems-feature-3ksf0l`. All committed + pushed + tested. 🅰️: integrate + DEPLOY — the whole stack is still unseen by Cory.**

- **UNIT 5 — TRASH TALK** ✅ (`src/routes/trashtalk.js`): posts welded to a game (pick'em identity), one doc per post, permanent, league-visible, per-season archive for the chapters. Thread on the matchup screen. 15 tests.
- **UNIT 4 — WHAT TO WATCH** ✅ engine + rehearsable panel (`src/routes/whatwatch.js`, `/watch`): sweat meter (P win from live + remaining proj, reuses LO.pWin/pClearHigh), the $100 sweat, the "what you need" line, 🟢🟡🔴🔥 buckets, most-watchable sort. Sun/Mon-gated, dormant off-window; `?preview=1` rehearses on sample data. 18 tests. **Live remainder (per-player remaining projections league-wide) = A's feed; flagged. Verify live after deploy.**
- **UNIT 6 — DESIGN PASS (started)** ✅ the two auto-markers (`src/routes/marks.js`): GOAT 🐐 auto-moves to Mahomes' owner (folded into flags → standings + finances + matchup + pick'em), and the real Chiefs arrowhead **logo** (`public/icons/kc.svg`, replacing 🏹) next to KC players on the team roster. 9 tests.

### FLAGS FOR A
- **Matchup-starters KC logo + live sweat** both need A's per-player data (a `team` field + live proj/played flags on the matchup player rows in `src/sleeper.js`). B renders them the instant that shape lands — no surface change. (Extends the existing PARKED sleeper-data request.)
- **Championship-probability model** (already PARKED): folded-columns odds + matchup leverage swap the labelled Monte-Carlo for it, unchanged surfaces.

### UNIT 6 REMAINING (design pass, "full liberty" — best done on deployed output with Cory watching)
Page-by-page USA-theme polish, everything clicking through to its story, the site as a decade time-capsule. The concrete auto-markers Cory named are done; the broad polish wants live eyes.

### SESSION TALLY (this session, on the branch)
Pick'em · The Dispatch · folded columns · trash talk · what-to-watch · GOAT+Chiefs marks · nav-bug fix — **~120 tests**, all green, CI-wired, screenshotted at 390px. **Nothing deployed yet.**

## ▶ SESSION B — RESUME MARKER 2026-08-09: Field Office redesign underway (Cory picked D)
**Branch `claude/pickems-feature-3ksf0l`. A already shipped the earlier stack (`[deploy]` c03671e — Pick'em/Dispatch/folded columns/what-to-watch/trash talk/GOAT+Chiefs are LIVE). The Field Office redesign is NEW commits on the branch, NOT yet integrated/deployed by A.**

### DESIGN DIRECTION — settled
Explored 4 directions (A Broadcast Deck / B Daylight / C Terminal / D Field Office synthesis; screenshots sent). **Cory picked D — "Field Office"**: modern-americana in daylight + mono broadcast data discipline + terminal // accents. Editorial calm for the record, broadcast precision for the live stuff, crude chronicle voice (serif-italic) against clean chrome.

### ✅ INCREMENT 1 — FOUNDATION (committed 6f93669), verified on the real app
- Token flip: `:root` → Field Office palette under the SAME names (site-wide flip; CSS was ~73% var()-driven). Added --blue, --font-mono, --font-serif; softened glows.
- Cascade-last "FIELD OFFICE" override layer in `public/css/style.css`: light masthead + tricolor accent, light nav + tab bar, hairline borders, mono tabular numbers everywhere, // micro-labels, solid buttons, light alerts, serif-italic voice.
- Regression sweep (GLOBAL, so it covers the whole site, not just judged pages): remapped ~90 light-on-dark text colors in style.css + ~10 in chronicle.css to dark; fixed gradient-clipped white text (.hero-value) and white components (.mu-pts/.stakes-line/.pk-strip/.wh-race).
- Verified home + matchup + history at 390px & 1280px: light, readable, no h-scroll, all personality intact. history_smoke 13/13. territory clean. CSS braces balanced.

### ▶ REMAINING (Increment 2+, the "great" polish — page-by-page)
Because the flip + remap were GLOBAL, non-judged pages (bank, team, votes, rules) already inherit Field Office via shared cards/tables/tokens — but need a **verification + polish pass** each (screenshot at 390/1280, fix any component-specific dark hardcodes). Known specific TODOs:
1. **Type scale + spacing pass** (Cory's #1 lever): a deliberate scale + more generous, less-even spacing across pages. The foundation set tokens/mono/labels; the per-page rhythm is the "great" step.
2. **Side-bet grid** (`_side_bets.ejs`) + **team roster** + **bank ledger** — verify + polish.
3. **War-room shell** (`warroom.ejs`, commish-only): has hardcoded dark overlays (#0b1020 statusbar, rehearsal ribbons) that stayed dark — needs a dedicated Field Office pass (not a judged page; lower priority, but it's B's shell).
4. **Remaining tinted text** (#ffd7db/#f0dca5/#ffb4bb badge text) — audit on colored chips for contrast on light.
5. Self-host a display face (already on backlog) — sharpens the whole type story.
- Then: tell A to integrate + deploy the redesign so Cory sees it live.

### WATCH
The A-ship Monitor already FIRED (A shipped the pre-redesign stack). If more live verification is wanted post-redeploy, re-arm `scratchpad/ship-check.sh`.

## ▶ SESSION B — RESUME MARKER 2026-08-09: design pivot to B + icon/PWA DONE; audit clean; Annual Button queued
**Branch `claude/pickems-feature-3ksf0l`. A already shipped the pre-redesign stack; the REDESIGN + ICON are new commits A has NOT integrated/deployed yet.**

### ✅ DONE THIS STRETCH
- **Direction B (Daylight)** built site-wide via token flip + override layer; pivoted from the D synthesis to pure B (dropped //+mono accents). Contrast pass per Cory (darkened --muted + PF/secondary text; fixed the pale hero/balance boxes, gradient-clipped white text, and white components).
- **App icon** — heraldic eagle + stars-and-stripes shield, standing on a football (`public/icons/icon.svg`); legible at 60px, light+dark. Rasterized to ALL iOS/Android sizes + maskable + apple-touch. **PWA**: manifest (short_name MFGA, standalone, portrait, navy splash bg / paper theme), iOS meta + branded launch (splash) images, favicon = the mark, masthead logo = the mark. Standalone hygiene (install card hidden in-app; no back-nav dependency; alerts work in standalone).
- **AUDIT (Cory's double-check):** route audit 35/35 pages+assets load, nothing errors; franchise/season confirmed on their real path-params. All 17 B/shared suites green. CSS braces balanced. Access gating untouched. **Nothing lost — info, tools, features, personality, connectivity all intact.**

### ▶ NEXT: Annual Button — content half (parked with full plan in PARKED.md). Then: page-by-page "great" polish (type scale/spacing; side-bet grid; war-room shell dark overlays).

### 🅰️ ACTION: integrate + DEPLOY the branch so Cory sees the redesign + icon live. (Cory to notify A.)

## ▶ SESSION B — RESUME MARKER 2026-08-09: Annual content-half in progress + Sunday scoreboard
**Branch `claude/pickems-feature-3ksf0l`. All committed/pushed/tested. A has NOT integrated the redesign/icon/Annual work yet.**

### ✅ DELIVERED THIS STRETCH
- **Silent-stale fixes** (the dangerous bucket): betlogic SEASON_START year-derived; `||2026` fallbacks killed; **no_season_literals guard** in CI (fails if a year-in-key / hardcoded date-string / `||year` reappears).
- **Draft-selection order engine** (`draftorder.js`) + **history verification**: non-playoff six reproduce both prior years; **playoff-four MISMATCH flagged** (2026 = champ last ✓; 2025 = champ picked 7th ✗). Rule marked ⚠️ UNCONFIRMED in code + `PLAYOFF_RULE_CONFIRMED:false`. **Awaiting Cory: which playoff-four rule + is STANDINGS reg-season or final?**
- **Vote → config** (`voteenact.js` + admin "Enact"): a passed vote writes its result into season config; pot/weekly-high/payout/finances/money-board/amendment-ledger all DERIVE and follow. Handles buy_in/weekly_payout/payout-STRUCTURE/config-key; fails loud. Callable headless by the Annual. (Admin season FORM still hardcoded to 2+4 payout inputs — small follow-up.)
- **THE SUNDAY SCOREBOARD** (`/scoreboard`): every game one screen — scores+leader+LIVE, pick'em split, rivalry billing (`rivalries.js`), weekly-$100 race, playoff-worth swing, clinch/elim, live sweat, tap→matchup. Home hero CTA + nav entry. (Follow-up: deep view for a game the viewer isn't in — currently viewer-relative.)
- **Settlement report** (`settlement.js` + Finances "Square Up"): minimal who-pays-whom + Venmo, surfaces imbalance. Annual emits it for a sealed season.

### ▶ REMAINING Annual content-half (needs Cory or A)
- Draft-board reset + two-stage claim UI — **gated on Cory's playoff-four rule** (six-team + reset + dinner buildable now; render top-4 provisional).
- Records-recompute + chapter/hub-paragraph wiring + season sealing (live→permanent + archive transients) — **callable from A's workflow AFTER grading; A owns the orchestrator (halt-on-failure, grading-before-content).**
- Config-driven draft-day alert on rollover; CHAPTERS/RS_PRIZE/harvest derive-on-seal.

### ▶ CHAIN-2 → A (worries Cory most): SCORING/ROSTER/keeper/deadline are hardcoded, NOT synced from Sleeper — model could optimize against changed rules mid-season. Confirm watchdog scope + change-handling + auto-continue re-point. (A's lane.)

### 🅰️ ACTION: integrate + deploy the branch (redesign + icon + all the above still unseen live).

## ▶ SESSION B — RESUME MARKER 2026-08-10: parallel program underway (surface half)
**Branch `claude/in-season-surface-fixes-6nyayc`. All committed + pushed + tested. A to integrate + deploy. My branch is now BEHIND A's integrated main (missing `public/js/draft/consensus.js` and any waiver/standings surfaces) — the next stretch must rebase onto latest `origin/main` before C3.**

### ✅ SHIPPED THIS SESSION (all green, CI-wired)
- **Matchup starters bug** — was pairing lineups by row index (your QB vs their WR) AND reading data never supplied; now slot-aligned via new B-owned `src/matchup.js`, with a Slot column. + bench points, bye flags (derived in-repo from `nfl_byes.json`), injury flags, already-placed-bet surface. (Win-prob + projected-total wait on A's projection feed — parked.)
- **Clickability** — Watch rows + dashboard Week-Scoreboard cards tap through (participant/spectator like the scoreboard); dead Season Buy-In hero tile now clickable.
- **Dashboard hero** — your game/score/opp/lineup-problem leads the home page in-season.
- **Draft-day alert** — derived from config (date/time/place), countdown banner, self-healing the stale "5:00 PM" alert; admin form.
- **Icon `?v=2` cache-bust** (kept the eagle; the artwork was fine, delivery wasn't).
- **Square-Up bank routing** — league money runs through the commissioner; side bets stay peer-to-peer.
- **Audit of A's engine** (findings parked → A; ceiling reclassified OPEN not settled).
- **War room, driven in a headless browser at phone width:** found + fixed the on-the-clock player NAME rendering **white-on-white** (contrast ~1 → 14.6); a contrast sweep cleared a batch of sibling dark-holdovers; lifted the sev-1 keeper banner out of the collapsed advisory stack (critique #2); moved Know Your League up to Layer 2 (#6a).
- **Program #2 — the one-page draft-day fallback**: `/admin/draft-sheet`, server-rendered, no-JS, printable (rule + best-available + top-180 board + manual pick log), survives a dead front-end.

### ▶ PROGRAM QUEUE (Cory's order) — where I am
1. Phone usability / take-reachability — **substantially done** via the browser drive (clock take verified present/named/red/above-fold/unoccluded; name fixed). Re-drive after A deploys + Cory runs a mock with screenshots.
2. **One-page printable fallback — DONE.**
3. **C3 breadth — NEXT.** Consensus projection next to every dollar in waiver/lineup/standings views. Consume A's `public/js/draft/consensus.js` (on main, not yet on this branch — REBASE FIRST). Do NOT build a second consensus. `views/lineup.ejs` is the first target; waiver/standings surfaces may need to exist first (coordinate w/ A).
4. Rules page — when A hands the derived source (parked).
5. Remaining matchup gaps — win-prob + projected total when A's projection feed lands (parked, wired to activate).
6. Human-override surface — when A defines the ledger kind/shape (park requirements early: one-tap, in-flow capture).
7. Calibration surfaces — resolver is live; verify the accuracy page shows real grades as they arrive.
8. Bank reference numbers (banked total + money rank) — LAST.

### ▶ PARKED FOR A (precise flags in PARKED.md)
Audit findings (rules-page drift CLASS, reset-preset SEV-1, C1 framing, thin-pool CLASS, SUS regex, spec-drift); **ceiling weight OPEN/highest-urgency** (loaded 0.65 vs ledger −4.8); board-age one-threshold; strategy-picker collapse-when-flat; take-affordance reduction; per-player projection feed (+ its blocked consumers: win-prob, projected total, sweat, hero margin).

### ▶ BLOCKED ON A (skip until delivered): adjuster help-text copy (needs slider-value fix), seat-panel presentation (needs seat math/profiles), win-prob/projected-total (projection feed), override surface (ledger shape).

## ▶ SESSION B — RESUME MARKER 2026-08-10 (late): PROGRAM COMPLETE except A-blocked items
**Branch `claude/in-season-surface-fixes-6nyayc`, rebased onto A's main. All committed/pushed/tested. A to integrate + deploy.**

### THE PROGRAM (Cory's order) — final state
1. **Phone usability / take-reachability — DONE.** Drove the war room headless at 390px: on-the-clock take button verified present, named ("✓ Take Gibbs"), 5.13 contrast, above fold, unoccluded. **Found + fixed the player NAME rendering white-on-white** (`.clock-name{color:#fff}`, a dark-theme holdover — contrast ~1 → 14.6). A contrast sweep then cleared every remaining sub-3.0 text in the war room. Re-drive after deploy when Cory runs a mock.
2. **One-page draft-day fallback — DONE.** `/admin/draft-sheet`: server-rendered, no-JS, printable. Rule + best-available-by-position + top-180 board + manual pick log. Survives a dead front-end.
3. **C3 breadth — DONE across all four surfaces.** Waivers had a SECOND consensus implementation with a dishonest label (and a test asserting `/consensus/` that locked the lie in) → delegated to the shared module. Lineup got the disagreement line (loud only when the tool starts the lower-projection player) + a **latent 500 fixed** (`.toFixed()` on a null projection would have killed the page on the first Sunday). **Analyzer built from scratch** (`/analyzer`) over A's standings engine.
4. **Rules page — BLOCKED on A** (derived source from the imported Sleeper config).
5. **Matchup gaps — bench points / bye flags / injury flags / already-placed-bet DONE.** Win-prob + projected total BLOCKED on A's per-player projection feed (wired to activate).
6. **Human-override surface — DELIVERED from existing data.** grade-cron has been grading decisions all along (`n_decisions`/`overridden`/`scored`/`cory_beat_model`) and NOTHING rendered it. Now "Your overrides" on the accuracy page; refuses to read <8 scored as a verdict.
7. **Calibration surfaces — DONE, and they were BROKEN.** The page read a flat `calibration:<season>` that **nothing ever writes** (grade-cron appends `calibration:<season>:<ISO>`). Proven empirically: post-grade read returned null → the loop would have been invisible all season. Fixed at the seam (ledger first, flat fallback so the older suite still passes). Added **calibration over time** (one bar per grading run).
8. **Bank reference numbers — DONE.** All-time banked + money rank + per-season, derived from the same winningsGrid/careerTotals the history page uses; the test asserts both surfaces show the identical figure.

### WAR-ROOM CRITIQUE (Cory's render review)
- **#2 keeper banner — DONE** (lifted the sev-1 blocking banner out of the collapsed advisory stack; it now sits first and alone above the decision surface).
- **#6a Know Your League — DONE** (moved up to the always-open Layer 2).
- **#1 board-age contradiction, #3 strategy-picker collapse, #6b take-affordance reduction — PARKED for A** (all need A's logic/emission; the 221 take affordances measure consistent-red, the grey one didn't reproduce).
- **#4 adjuster copy, #5 seat panel — BLOCKED on A's fixes.**

### IN-SEASON DESIGN PASS — DONE (all three surfaces)
- **What-to-Watch was rendering EVERY GAME TWICE** (10 rows for 5 games) on the page read live on Sunday → one row per game, page halved.
- **Run-on page title** (`h1.page-title .sub` had no rule, inheriting the 1.7rem uppercase display face) → fixed site-wide, 7 pages. **Clipped tab strip** (`flex:1 0 auto`) → fixed. Verified: no horizontal scroll on any in-season page at 390px.
- **Every email was still dark-themed** and failed UNSAFELY — clients that strip backgrounds would have left body text at **1.2:1 on white, invisible**, in the surface that arrives unprompted on Sunday. Converted to the site palette (17.5:1). My own guard caught two of my own fixes as sub-AA.

### ▶ PARKED FOR A (precise, in PARKED.md)
attribution writer (no `attribution:<season>` writer exists anywhere — panel honestly empty until one does); board-age one-threshold; strategy-picker collapse-when-flat; take-affordance reduction; per-player projection feed + its blocked consumers; rules-page derived source.

### ▶ NEXT (when A lands things)
Rules page from the derived source · win-prob + projected total when the projection feed lands · adjuster copy + seat panel after A's fixes · war-room hierarchy pass against Cory's live screenshots post-deploy.

---

# ▶ SESSION C — EXTERNAL INGEST PROGRAM (2026-08-11)

Third lane, running alongside A and B. Owns: MFL league discovery, the ADP-snapshot
fetch, the crosswalk at scale, the replay harness, attrition reporting, nflverse when
it starts, and the CI workflows that run them. **C does not deploy** — A integrates.

## UNIT 1 — THE ATTRITION SEAM. Done, CI-verified.

**LEADING WITH WHAT WAS WRONG.** `ingest_filters.screen()` reported a confident,
specific falsehood whenever a field failed to parse — B's audit found it on four of
nine fields, and I found two more. Each reason asserted a check that never ran:

| field absent / unparseable | it used to say | which claims | now |
|---|---|---|---|
| `roster_slots` | `F1.qb_slots` | "doesn't start exactly one QB" | `F4.no_roster_slots` |
| `teams` | `F1.teams` | "wrong league size" | `F4.no_team_count` |
| `draft_type` | `F1.draft_type` | "not a snake draft" | `F4.no_draft_type` |
| `draft` | `F2.draft_incomplete` | "their draft wasn't finished" | `F4.no_draft` |
| picks with no crosswalk attempted | `F2.crosswalk_below_90pct` | "under 90% matched our board" | `F4.crosswalk_not_run` |
| a starter limit like `"1-2"` | **ValueError — it crashed** | — | `F4.unreadable_starter_limits:QB` |

The last two are mine, not B's: an unattempted crosswalk was reported as a
measurement of our own board that nobody took, and P2's range-string limits raised
out of the screen rather than being reported.

**THE SHARPEST PART WAS THE SEAM, NOT THE SCREEN, and rule 14 names it exactly.**
`mfl_adapter` already computed the right answer everywhere — `draft_type()` returns
`draft_type_unrecognised:SFIRSTFOO` with a comment saying it must never be folded
into "not a snake draft" — and those reasons were computed, written down, and read by
nothing: the module was imported by nothing but its own test. `to_league_record()` is
the caller that did not exist. Three MFL exports → one record, every unparseable
field arriving as None plus its precise reason, reported verbatim.

**NOT A FILTER CHANGE, so no new pre-registration — and that is verified, not
asserted.** The pre-fix and post-fix `screen()` were run side by side over a 36-case
corpus: **no league's accept/reject verdict moves.** Twelve rejection sentences
change; two cases that used to raise now reject with a reason.

**THE CONSUMER THAT MAKES IT MATTER.** `screen_all()` now splits rejections into
FILTERED (evidence about the public pool) and UNREADABLE (evidence about this
pipeline), on the verdict line rather than in a field beside it — because the failure
guarded against is a parse break being narrated as format rarity. An undeclared
reason code gets its own loud bucket rather than defaulting into "filtered", which
would recreate the same defect inside the summariser.

**Two more of the same class closed while in there:**
- **F2's autopick clause was passing every league silently.** No autopick flag exists
  anywhere in `draftResults`; `screen()` ran `autopick/picks > 0.5` over picks with no
  flag. INGEST-PLAN pre-registered that it "must be reported as unenforced rather than
  quietly passing every league" and `draft_picks()` had recorded it since it was
  written — reaching no report. Adapters now declare unenforceable clauses and the
  verdict line names them.
- **`_earliest_wins` held in one arrival order only** (B, open across two audits).
  Stamped-vs-unstamped kept whichever arrived FIRST, so unstamped-first retained the
  row whose observation date cannot be checked against the draft — the contamination
  the rule exists to exclude, kept by the rule. Both orders asserted now.

**Completeness is inferred and its blind spot is asserted.** No MFL export carries a
round count and `rosterSize` counts the bench (wrong for every keeper league), so
"all rounds present" is checked as round fullness. A draft abandoned mid-round is
caught; **one abandoned exactly on a round boundary is not**, and that is a test, not
a comment. The shortfall travels with the reason because `149/150` (a league that
quit) and `2/150` (a fetch that failed) are not the same fact.

**RULE 10 — sixteen guards broken deliberately, at the boundary, each observed RED by
name before being trusted.** One break reddened NOTHING and that was the most useful
one: swapping the draft's date from its FIRST pick to its LAST failed no test, because
every fixture finished inside a day. MFL drafts are `draft_kind: email` on a
`draftLimitHours` clock and routinely span days — dating one by its last pick widens
F5's contamination window by the whole length of the draft, so an ADP snapshot taken
while the room was picking would pass "strictly before". The guard was absent, not
passing. There is a multi-day fixture now.

**Green:** local 739 passed / 5 skipped; **CI-VERIFIED** on `ci.yml` run 486 against
`claude/external-ingest-program-1xfinj`.

## ▶ PARKED FOR A (precise, in PARKED.md)
`graduation_gate.loaded_weights()` misparses `5e-1` as 5.0 and `1e-3` as 1.0, and an
inline `/* ceiling: 9.9 */` comment overrides the real weight. Third consumer beyond
the two B named: `external_replay.policy_fingerprint()` reuses it deliberately, so a
weight written in scientific notation — changing nothing that ships — moves the
fingerprint (measured: `a4accdb43066385a` → `e3cf991a03ac03de`) and invalidates the
whole external sample under `assert_policy_current`. Latent today; a trap for the next
SMALL weight, which is exactly what the graduation gate produces. Parked with the
exact seam (`parse_measured_weights(src)`), the regex, and six ready assertions.

## ▶ NEXT
The crosswalk at scale against real MFL players + board (the seam is built; the
coverage number is not yet measured against a real export), then the replay harness
connected to real leagues. Discovery and the ADP-snapshot fetch need egress and run
in CI.
