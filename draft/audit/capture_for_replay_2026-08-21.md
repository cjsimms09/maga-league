# CAN WE REPLAY THIS SEASON NEXT YEAR? — capture audit, 2026-08-21

Cory: *"make sure we are capturing everything we need to be able to run monte
carlo simulations on this year for next year. and simulate every decision and
entire season in the best way possible… set the basis to help for next year any
way we can."*

The question is not "do we have tools" — it is **will the data exist**. A
simulator can be written any time; a season can only be recorded once. So this
audits STORES and, for each one, whether anything fires on its own to fill it.

---

## The headline

**One thing was genuinely at risk, and it was the one that cannot be redone.**
The draft-night pick capture existed, was rehearsed, and **fired only if a human
remembered to start it and paste a Sleeper draft_id under time pressure.** It is
now self-starting and resolves its own id. Everything else needed for a
season-long replay is captured and on a schedule.

---

## 1. The draft — happens once, tomorrow

| need | store | state |
|---|---|---|
| every pick, joined to what we believed at that moment | `draft/data/draft_pick_log_2026.jsonl` | **created tomorrow** — see below |
| what was AVAILABLE at each pick | `draft/data/pre_draft_freeze_2026.json` | ✅ 885 KB, committed |
| the locked keeper slate (all 10 starting rosters) | `draft/config/keepers.json` | ✅ locks 18:00 tonight |
| the policy that made each recommendation | `draft/baseline/*.json` | ✅ 62 versions, newest `v32` |

**What was wrong.** `draft-night-sync.yml` had `workflow_dispatch` only and
`draft_id: required: true`. Two runs in its lifetime, both dry runs. The
machinery is good — it was dry-run verified end to end on 08-15 against a real
historical draft, and doing that found a genuine `bash -e` bug that was
swallowing errors — but **a rehearsed capture nobody starts is the same as no
capture**, and the draft cannot be re-run.

**Fixed, two ways, both removing the human:**

- `log_draft_picks.py --sync` now resolves the draft_id itself from
  `league_config.json`'s `league_id`. Rule 3e governs the design: a *wrong* id
  looks exactly like a right one — the sync would poll a real draft that is not
  ours, log nothing, exit clean, and nobody would know until it was over. So it
  **refuses rather than guesses**: prefers this season's draft (a Sleeper league
  keeps its history, and silently returning last year's id is precisely that
  failure), falls back to the league's only draft if Sleeper stops stamping
  `season`, and raises — naming what it saw — if it cannot resolve exactly one.
  9 tests; the ones that matter are the refusals, plus the wiring (a bare
  `--sync` used to be an unguarded `IndexError`) and the guarantee that an
  explicit id still wins.
- The workflow **self-starts**: `cron: '45 22 22 8 *'`. Draft is 2026-08-22
  6:00 PM CDT = 23:00 UTC; this fires 15 minutes early for scheduler slack and
  polls until the draft completes. `inputs.*` is empty on a scheduled run, so
  `max_minutes` and `dry_run` needed defaults — without them the cron path would
  have silently no-opped, the same failure wearing a schedule.
- It now also **runs the pick-logger suites before it starts polling** (39
  checks: the 150-pick rehearsal across 7 edge cases, the chaos drill, the
  log-path override, the discovery refusals). A broken logger fails the job
  while the draft is still ahead of us.

---

## 2. The season — every decision, every week

| need | store | fires on its own? |
|---|---|---|
| our weekly projections, pre-kickoff | `draft/data/weekly_own/` | ✅ `own-weekly-proj` Thu 14:00 UTC |
| provider projections (Sleeper, FantasyPros) | `draft/data/proj_series.json` (1.4 MB) | ⚠️ **PRESEASON ONLY — see the correction below** |
| actual weekly points | `nflverse_weekly_points_*.json` | ✅ via `weekly-grade` Tue 13:30 |
| **lineups actually started** | `draft/data/league_history.json` | ✅ 2023/24/25 all carry **18 weeks × 9 starter slots**; 2026 empty only because week 1 has not happened |
| transactions / waivers / trades | `waiver_transaction_history.json` + 3 | ✅ |
| injury · practice · depth at decision time | `roster_state_series.json` | ✅ nightly via `draft-data` |
| Vegas lines at decision time | `vegas_lines_*.json`, `bovada_lines*` | ✅ `odds-capture`, `bovada-lines-capture`, `kalshi`, `market-capture` |
| expert ranks weekly | — | ✅ `fp-expert-ranks-weekly-capture` Wed 12:30 |
| snap counts | — | ✅ `weekly-snap-counts` Wed 11:00 |
| opponent behaviour / manager profiles | `opponent_need_2026.json`, profiles | ✅ built by `draft-data` |
| grading + adaptation | — | ✅ `own-weekly-grade` Tue 06:00, `weekly-grade` Tue 13:30 |

**17 of 21 capture/grading workflows are scheduled.** The four manual-only ones
are `bdl-schedule-capture`, `fp-expert-ranks-capture` (the *preseason* one — its
weekly sibling is scheduled), `game-weather-capture` and
`projection-spread-capture`. None is unrecoverable: schedules are static,
historical weather is retrievable after the fact, and weekly expert ranks are
covered by the scheduled job. They are a coverage nicety, not a one-shot loss.

---

## 3. Two probes of mine were wrong, and both are why this is trustworthy

- My first audit reported **"weekly PROVIDER projections — NOT FOUND"**. False:
  they are in `draft/data/proj_series.json`, 1.4 MB, carrying `fantasypros` and
  `sleeper`. My glob simply looked in the wrong place, and a null from a probe
  that has never returned a positive is a bug report, not a finding.

- ⚠️ **AND THEN I OVERCORRECTED, WHICH IS THE WORSE OF THE TWO ERRORS.** Having
  found those rows I marked provider capture ✅ and moved on — while my own probe
  had printed `weeks: [None]` on the same line. Every row in that file is a
  **PRESEASON** snapshot. Counted afterwards: `fantasypros` 11 rows and `sleeper`
  12 rows, **all with `week=None`**, and **zero rows whose source ends in
  `_weekly`** — which is exactly what the grader selects on
  (`provider_weeklies()` filters `source == "fantasypros_weekly"` AND
  `week == week`).

  So Cory's headline 2027 goal — *our projection beats BOTH Sleeper and
  FantasyPros* — currently cannot be graded on the FantasyPros half at all.
  Another lane traced it end to end the same day and filed it 🔴🔴 (register 223,
  owner C, first read 09-15, week 1 ~09-10): the archive writes the FP column
  somewhere the grader never looks, and the function's own docstring says *"the
  FP half starts the day C's weekly archive carries it"* — it does carry it, in a
  different file.

  The evidence was on my screen and I read past it. `week=None` on every row is
  the finding; I treated it as a formatting detail.
- It also read **`2026 weeks: 0`** for lineups and nearly reported that starts
  are not captured. Checking prior seasons showed 18 weeks each with 9 starter
  slots — the store shape is right and 2026 is empty because the season has not
  started. "Absent" and "not yet" are different answers.

---

## 4. What this makes possible next year

With the pick log plus the freeze, every draft decision becomes replayable: at
each of Cory's twelve picks we will have *what was on the board*, *what the tool
said*, and *what he did* — which is the counterfactual a Monte Carlo needs.
With `league_history` weeks plus provider and own projections, every start/sit
is scoreable against the alternatives that were legal at the time. That is the
input `start_sit_vs_random.py` already consumes (530 owner-weeks, mean
percentile 0.8497 against a null band of [0.4754, 0.5246]) — 2026 simply joins
the series.

**Nothing here builds the simulator.** It ensures that when it is built, the
year it needs is on disk. The simulator itself is task #9, post-draft.
