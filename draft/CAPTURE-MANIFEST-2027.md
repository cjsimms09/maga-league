# THE 2027 CAPTURE MANIFEST — EVERYTHING NEXT AUGUST'S RERUN NEEDS, VERIFIED AGAINST WHAT ACTUALLY COMMITS

**Relay, 2026-08-20, on Cory's order: *"can we make sure we capture everything
and do everything we can do be able to do this next year!!!!"* Every row below
was checked against the workflow files and the committed stores TODAY — nothing
here is assumed from a doc. Status legend: ✅ ACCRUING (job exists, commits,
verified) · 🔴 LEAKING (job runs, output never committed — unrecoverable daily
loss) · 🟡 VERIFY (probably fine, one named check owed) · 🔵 RECOVERABLE-LATER
(public archive; fetch any time, schedule it so it happens).**

The consumer this list serves: re-running the whole 2026 program next year with
a FOURTH replay season (40 seat-years), the variance Monte-Carlo if we choose
to build it, re-measured wire levels/friction, and the projection-program
grades.

| # | input (what 2027 needs) | store | capture | status |
|---|---|---|---|---|
| 1 | **Weekly lineups (starters+bench), all 10 teams** — conversion studies, wire availability by complement | `league_history.json` (2026 row live) | `draft-data.yml` nightly, in `$PATHS` ✓ | ✅ ACCRUING |
| 2 | **Every transaction with FAAB bid** — realized adds, wire friction re-measurement, P145's price curve | `league_history.json` | same job | ✅ ACCRUING (see V1) |
| 3 | **The 2026 draft, pick by pick** — the 4th replay season | `draft_pick_log_2026.jsonl` | `draft-night-sync.yml` (dry-run verified 08-15, bash -e bug fixed) | ✅ READY (fires Saturday) |
| 4 | **Keeper designations + final freeze** | `pre_draft_freeze_2026.json`, keepers.json | freeze re-take after Friday 18:00 lock (A's wiring, register 151 plan) | 🟡 VERIFY (V2) |
| 5 | **Pre-draft board snapshot** (projections, ADP, dollar model as-drafted) | `public/draft_data.json` + `adp_series.json` + `proj_series.json`, all in `$PATHS` | nightly + draft-morning rebuild | ✅ ACCRUING |
| 6 | **Weekly depth-chart / injury state** — absence-rate re-measurement at player level | `roster_state_series.json` | `build.py` calls `capture()` nightly — **and the file is NOT in `$PATHS`; it has never reached main. Register 155, filed 08-20, STILL OPEN. Every night since 08-17 is already gone.** | 🔴 **LEAKING** |
| 7 | **Weekly realized points (nflverse)** — outcome curves, variance-MC calibration | `nflverse_weekly_points_2026.json` (does not exist yet) | no workflow — but nflverse is a public archive; 2026 is fetchable in full any time after the season | 🔵 RECOVERABLE (V3 schedules it) |
| 8 | **Our weekly projections + Sleeper + FP** — projection-error distributions, the 09-15 grades | weekly archives | `weekly-projection-archive.yml`, `sleeper-proj-archive.yml`, `weekly-proj-snapshot.yml`, `fp-expert-ranks-capture.yml` (all had their own $PATHS-class gaps FIXED this week) | ✅ ACCRUING |
| 9 | **Vegas lines / totals** — game-script features | `vegas_lines_2021_2026.json` + `sgo_latest` | `odds-capture.yml` | ✅ ACCRUING |
| 10 | **Snap counts / participation** — opportunity features | weekly snap store | `weekly-snap-counts.yml` | ✅ ACCRUING |
| 11 | **Our own decisions + the models' picks** — grading US, not just players | shadow ledger + `predledger` (every model's pick on the record before the pick, 5206f167) | draft-night shadow ledger + in-season capture routes | ✅ READY |

## The verify list (owners, deadlines)

* **V1 (C, by 09-07 — first waiver week):** confirm `league_history`'s
  transaction capture includes FAILED waiver claims and their bids, not only
  successful ones — friction measurement wants the contested-claim rate, and a
  store of winners only would overstate wire liquidity exactly the way v1 of
  the bench-option model did. One league API call to check.
* **V2 (A, Friday):** the post-lock freeze re-take (register 151's plan) also
  commits the final keeper state — confirm the re-take's output lands in a
  committed path, not only in the alarm's memory.
* **V3 (relay, files a one-shot reminder for 2027-01-10):** fetch
  `nflverse_weekly_points_2026.json` + the 2026 rosters/byes once the season
  ends. Recoverable-later is only recoverable if someone remembers — the
  ledger row IS the memory.
* **V4 (C, by 09-07):** the in-season crons (pull-list item 5's weekly
  refresh) keep `league_history` refreshing after the draft — verify the
  first in-season Tuesday actually appends week 1 rather than assuming the
  nightly does it.

## The one thing that cannot wait: row 6

`roster_state_series.json` is the register-155 leak: the capture runs every
night, writes real depth-chart and injury state, and the workflow's commit
step does not name the file, so the runner discards it. The fix is ONE LINE
(add the path to `$PATHS`). It has been open with an 08-21 recheck since
yesterday morning; **every additional night is a permanent hole in next
year's absence model** — the exact data the bench-option objective just
proved valuable. Escalated to A in ROUTES with a default: if unclaimed by
Friday 10:00, the relay ships the one-line `$PATHS` addition itself — it is a
capture list, not board logic, and the loss is irreversible while the change
is trivially revertable.

## ADDENDUM 2026-08-21 — Cory's simulation order, verbatim: "we need to be able to simulate everything we can about this year so we need to be capturing in a way that allows us to do that and makes sure it stays safe!!!"

Three additions so EVERY decision type is simulable with its at-the-moment
state (the thing no backfill can recover), plus the safety upgrade:

| # | input | store / capture | status |
|---|---|---|---|
| 12 | **The Tuesday WIRE as it stood** — who was available when each claim was made; makes the waiver decision-null exact forever | new Tuesday cron (C's in-season queue #1, default 08-27 relay-builds) | 🟡 BUILD THIS WEEK |
| 13 | **Trades WITH both rosters at accept-time** — the trade null's only food (history holds 6 trades; useless) | C's in-season queue #2 | 🟡 BUILD BEFORE WEEK 1 |
| 14 | **Waiver PRIORITY ORDER, weekly** — this league is ROLLING PRIORITY, so claim-vs-wait cannot be simulated without the queue as it stood each Tuesday; derivable-in-part from claim sequences but exact only if captured | rides the same Tuesday cron as row 12, second payload | 🟡 WITH ROW 12 |

**SAFETY, upgraded this same day:** `mailbox_deletion_guard.js` mode 2 now
covers `draft/data/` and `draft/backtest/` `.json`/`.jsonl` stores as well as
every `.md` — a capture emptied to zero bytes or removed without
`[mailbox-prune]` fails the build (the fd33cd15 class, which zeroed 15
documents unnoticed; a zeroed JSONL is a season of decisions gone).
Regenerated stores are always nonzero, so nightly rebuilds never flag.

**THE ONE LEAK (row 6) IS NOW THE WHOLE ORDER'S CRITICAL PATH:** nightly
roster/injury state has NEVER reached main (register 155) — every night since
08-17 is unrecoverable. Its fix rides A's first green CI run, which is hours
away after the keeper-lock alarms clear. Escalated to A with Cory's order
attached: the first green run must carry the $PATHS fix, not follow it.

**Row 15 (added 08-23, from Cory's own post-draft catch, register 259):** the room-vs-national ADP gap is now a MEASURED −9.1 mean / −18.6 late-round bias on the 2026 draft. Everything needed to fix it for 2027 is already captured (pick log, board ADP snapshot, keeper slate, league shape) — no new capture required; this row exists so the 2027 build remembers to SHOW room-adjusted ADP on player cards instead of raw national. ✅ ACCRUING via existing rows 1/2/5.
