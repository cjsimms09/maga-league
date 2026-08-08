# FULL TASK AUDIT — 2026-08-08 (for chat-Claude review)

Point-in-time snapshot pulled from STATUS.md, DECISIONS-NEEDED.md, `docs/queued/`, and git state. Files are truth, not memory.

---

## 1. IN FLIGHT
- **Part 2 §2 — the zoned layout** (desktop three-zone + compare tray + density fixes). Part 2 **§1 (Paths panel)** is DONE (engine `computePaths` + render + chosen-path ledger, 221 engine / 69 robot green). §2 is the next build; it now absorbs two just-filed addenda: **B7 dollar-gap primitive** and the **visual-design directive** (money=gold, one-number-per-card, `frontend-design` skill, screenshot-before-robot-acceptance). Not yet started — several draft-critical interrupts (below) jumped ahead of it this session.

## 2. THE POWER-THROUGH QUEUE (exact order + status)
Draft-path items first; freeze at final mock.
1. DST fix — ✅ (32 DEF, R-DST green)
2. §D flow/safety (typed END-confirm, rehearsal watermark) — ✅
3. D3 flex-discount (installed + quantified at pick-34) — ✅
4. Two-analyst weekly-high cross-check — ✅ (zero disagreements)
5. A2 slot-verification machinery — ✅ (verified/site-claimed/manual, watermark, checklist, R-slot)
6. Part 2 §1 Paths panel — ✅ (computePaths + render + ledger, R-paths)
7. **Part 2 §2 layout (three-zone + compare tray + density + B7 + visual design)** — 🔄 IN FLIGHT (next)
8. Phase H shadow rosters — ⬜ (spec: `strategy-hunt-learning-seed.md`)
9. Opening-script machinery (regenerates on slot assignment) — ⬜
10. A-1 / A-2 / A-3 (prefs-sync, undo-everywhere, my-turn alert) — ⬜
11. **MOCKS-READY checkpoint — ping Cory** — ⬜ (the gate)
12. Part C draft-night (C-1..C-3) — ⬜
13. Part A (A-4..A-8) — ⬜
14. Part B draft-week ops — ⬜
15. Backtest R2 + Strategy Hunt S/N + **auto-adjuster tuning** (CI) — 🔒 (CI harvest completion)
16. In-season master (built now, activation-flagged) — 🔒 (awaiting season data)
17. D-1 recap → annual-button dry-run → 2c builds → E-behaviors — ⬜

**Draft-critical interrupts handled THIS session (jumped the queue, all ✅):**
- Slot-claim pipeline: site claim → config provenance ('site-claimed, Sleeper pending') + slot-value analysis (recommend highest open slot) — ✅
- Keeper-slate ID display bug → shared `PlayerRef` resolver (SSOT) — ✅
- Status Dashboard (`/admin/status`) — ✅

**Draft-critical, QUEUED next (spec filed):**
- **Keeper-placement verification** (heterogeneous keep 3/2/1/0, per-team round-1–3 classification, commissioner-placement reconciliation alarm, heterogeneous robot) — ⬜ `keeper-placement-verification.md`. Assumption-hunt already done: pipeline is per-team, no uniform rounds-1–3 bug.

## 3. CI / BACKGROUND (workflows on file)
Live run-state is on the Actions tab (linked from the Status Dashboard health strip). Workflows present:
- `draft-data.yml` — board rebuild + commit-back (the harvest/rebuild path)
- `analyse-drafts.yml` — draft analysis
- `backtest.yml` — backtest harness (Backtest R2 lives here)
- `data-inventory.yml` — nflverse/data reachability inventory
- `evidence-real.yml` — evidence bundle
- `self-audit.yml` — the Sunday self-audit (watchdog-for-watchdogs; E-1)
- `deploy-verify.yml` — deployed-vs-HEAD verification
- `site-check.yml` — site smoke
- `sleeper-check.yml` — Sleeper reachability (CI-only; egress-blocked from sandbox)
- `ci.yml` — test suite (JS + python)
**Outstanding CI harvest:** matchups×45, transactions, 2023 draft/bracket (item G, in flight); 2025 weeks 7–15 weekly-high winners (R2121/MarianSaar verification, pre-registered).

## 4. DECISIONS-NEEDED (awaiting Cory)
- **D1 — Backtest grading metric:** RESOLVED BY DATA; needs Cory's **acknowledgement** only.
- **D4 — Draft slot:** machinery BUILT (site-claimed provenance + Sleeper-verify auto-import); **blocked externally** on Sleeper draft-order assignment. Auto-resolves on placement.
- **D8 — IR config oddity:** low-priority; treat IR as 1 slot restrictive + a one-line in-season rejection check (that check not yet built — small).
- **3 open input placeholders** (needed for config, not blocking now): **2023 payout era** (did year-one use the current $400/$4,000 structure?), **pick timer** (untimed vs X-sec — `pick_timer=0` seen at source, confirm), **RS runner-up tiebreak** (set in `payouts.json`).
- (D2, D3, D6, D7 — RESOLVED.)

## 5. COMMITTED SPECS ON FILE (`docs/queued/`)
`annual-button.md` · `auto-adjuster-tuning.md` · `backtest-round-2.md` · `complete-backlog.md` · `in-season-master.md` · `in-season-rankings.md` · `keeper-placement-verification.md` · `league-history-page.md` · `money-function.md` · `part-12-watchdog.md` · `season-readiness-kit.md` · `strategy-hunt-learning-seed.md` · `war-room-final-pass.md` · `warroom-v2-B7-dollar-gap.md` · `warroom-v2-visual-design.md` · plus root `STATUS.md`, `DECISIONS-NEEDED.md`, `EVIDENCE-BUNDLE.md`, `TASK-AUDIT.md` (this file).

## 6. DEFERRED / GATED (with gates)
- **Part 12 watchdog build** (settings-hash with float-normalization) — `part-12-watchdog.md`; gated on build time.
- **Backtest R2 + Strategy Hunt S/N + auto-adjuster tournament** — CI-class; gated on the CI harvest completing + the shared replay harness.
- **In-season master** (waiver priority-economics, weekly brief, opponent capture) — built-now/activation-flagged; gate = **post-draft, ≥ Aug 23**, plus real season data.
- **League History page (Part F)** — post-draft idle-CI; gate = behind every in-season item; folds into the **Annual Button** (one January run, one PR set, hard ordering: corrections → then chapter).
- **September quantile-V** (exact E[$], BenchValue, dissolves the D3 flex approximation; all August dollar verdicts re-run and re-labeled) — gate = September + data.
- **2c advanced-data builds** (incl. FTN charting) — September.
- **Annual Button** (self-improve.md + workflow_dispatch + 4 season-end artifacts + rollover) — gate = January (dry-run buildable now).

## 7. RECENT COMPLETIONS (last 16, with commit refs)
- `db139fe` File 4 queued specs (B7, visual-design, keeper-placement, auto-adjuster)
- `a0929a4` Keeper-slate ID display bug → PlayerRef resolver (SSOT) + heterogeneous robot
- `b24d952` Slot-claim wiring (site-claimed provenance) + slot-value analysis
- `5a08a15` STATUS DASHBOARD (/admin/status)
- `c411e72` Sync audit CLOSED (2023 table, item-7 wk4 REJECTED, item 9 + settlement)
- `51b78d5` Strategy Hunt Phase $ money-grading refinements
- `8eaa1d4` Sync audit (on record vs missing)
- `464d144` League History banter voice + Annual-Button consolidation
- `a2f5538` Part 2 §1 Paths panel render + chosen-path ledger
- `68b5465` Part 2 §1 computePaths engine core
- `59bd6da` A2 slot-verification machinery
- `dfd1bdd` D3 pick-34 quantification + two-analyst cross-check
- `3b223cc` D3 flex-discount pricing
- `54504e4` League History Page spec (Part F)
- `6205b9d` Realized-dollars as top-level grading currency
- `127049a` Reconciliation pass: traceability matrix

## Flag — ordered but not in any file?
Nothing outstanding. Every directive this session has a commit or a filed spec: slot-claim (b24d952), keeper-ID (a0929a4), dashboard (5a08a15), Phase $ (51b78d5), League-History voice + Annual consolidation (464d144), B7 + visual-design + keeper-placement + auto-adjuster (db139fe). Two source-message **truncations** captured as best-effort and flagged for a resend: sync-audit **item 9** (captured = league-history spec ✅) and the **financial-settlement** description (captured into `annual-button.md` §1c(4)).
