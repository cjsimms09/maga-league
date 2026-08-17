<!-- TERRITORY: A -->
# THE WEEKLY OWN-PROJECTION LOOP — priced Thursday, graded Tuesday, adapting mechanically — 2026-08-16

## 0. The mandate, verbatim

Cory, 2026-08-16, emphatic:

> "We need to be making our own projections for every player, capturing,
> grading, and closing loop to learn!!"

Same-day addenda that shaped the build:

> "since we aren't making decisions using that data for this year, it needs
> to be quick to adapt and try new things if it's losing… Model needs to
> adapt and look for ways to try to beat current adjustments. Again closed
> loop system but since data isn't actionable this year we can adjust more
> often, no harm if we're wrong. I'd also like an alert or someway to know
> if model adapted and how."

> "A scoreboard of some sort of the models on the actual site for me only
> would be nice! Include sleeper and fantasy pro projections so I can see if
> any models bearing those. Also between sleeper and fantasy pros projections
> should we be switching those depending on who is winning for use in our
> actual waiver tools and lineup projector? Should we be averaging them?
> Should we study that as well?"

> "Make a way for me to easily switch between models in the site! … make
> this page look clean, make sure it's easily understandable for me …
> Maybe a hover button with more info that pops up."

Before this pass the repo had NO own weekly per-player number: own_v6 is a
season-total model driving the draft board; the in-season tools run on
provider numbers; `weekly_proj_snapshot.py` archives what PROVIDERS said.
This pass is the missing half. NFL week 1 is 2026-09-10; everything below
runs for real by then on the existing crons.

## 1. The v1 formula, stated plainly

For every QB/RB/WR/TE on the committed board with a `proj_ownmodel`
(own_v6 season total on the merged tree; whatever the board carries is what
gets priced — one source, no re-derivation):

    weekly_mean = proj_ownmodel / 17
                  * (1 + vg[pos] * (implied_team − mean_implied) / mean_implied)

- `vg` is IMPORTED from the graded `V5_CONFIG` in
  `draft/backtest/own_model_v5.py` (QB .5 / RB .5 / WR .5 / TE 0.0) — the
  constants that survived the v5 preregistration, not new inventions.
- `implied_team` comes from the captured SGO snapshot
  (`draft/data/odds/sgo_latest.json`, which already carries the full week-1
  slate with implied totals) with the committed vegas store
  (`vegas_lines_2021_2026.json`) as fallback; `mean_implied` is the league
  mean over teams WITH a line that week.
- Bye week ⇒ NO projection (absent, not zero). No line ⇒ tilt 1.0, player
  NAMED in diagnostics. Round 2dp. Version string `own_weekly_v1` travels in
  every snapshot and every grade.

Each Thursday snapshot also carries four NAMED challenger columns from the
same inputs (tilt ×1.5, ×0.5, no-tilt, /16) — the adaptation raw material.

## 2. What gets graded, when

- **Thursday 14:00 UTC** (`own-weekly-proj.yml`, after the 12:00 odds
  capture): `draft/weekly_own_projection.py` prices all arms and commits
  `draft/data/weekly_own/own_weekly_<season>_w<week>.json`. **The commit
  timestamp is the forward guarantee**; the writer refuses post-kickoff
  rewrites. Preseason/postseason dates are a clean skip, not a red run.
- **Tuesday 06:00 UTC** (`own-weekly-grade.yml`): `draft/weekly_own_grade.py`
  grades every committed, un-graded, finished week — our arms on one
  identical population, plus provider STUDY arms (`sleeper`, `fantasypros`
  where the provider archive carries them — today that is Sleeper only —
  and `sleeper_fp_average`) on their own and the shared populations,
  honestly labeled. Actuals come from the nflverse `stats_player_week`
  release through `fetch_component_stats.py`'s own fetch/crosswalk/scoring
  functions (reused, not re-implemented), scored under
  `frozen_scoring_table()`. Ledger: `grades_<season>.json` — per-player
  rows, per-position MAE + Spearman per arm, top-5 misses BY NAME with a
  miss-pattern sentence, promotion history.
- **Adaptation**: the mechanical promotion rule (README verbatim; ≥3 common
  weeks, ≥3 of last 4 weekly wins, cumulative MAE lead, ≤0.02 Spearman
  give-up) runs after grading; a promotion bumps the version, keeps the old
  champion as a challenger, may seed a further tilt variant, and **opens a
  GitHub issue** (emails Cory — the alert he asked for). `controls.json`
  pauses adaptation or pins an arm; manual switches are recorded and alerted
  the same way. Providers are never auto-promoted.
- **The scoreboard** (`/admin/model-scoreboard`, Cory-only): every number IS
  the ledger's number; champion + formula, week-by-week and cumulative MAE/ρ
  for all arms including providers, promotion history, top misses, ⓘ
  tooltips on every control and column (what/read/do), honest pre-season
  empty state ("no grades yet — first real grades ~Sep 15"). One live
  control: the in-season projection source (blend | sleeper | fantasypros |
  sleeper_fp_average), writing the `model_controls` doc whose ONE consumer
  is `src/proj_feed.js` — tested end to end at that seam.

## 3. Honest limitations, named

- **/17 ignores rest-of-season schedule strength** and everything else a real
  weekly forecast knows (opponent, weather, usage trend). Deliberate: v1 is
  graded weekly and earns complexity from its own misses.
- **Injuries enter only via absence** (bye or no stat row at grade time). An
  OUT player still gets priced Thursday; his zero-week shows up as a
  no-stat-row absence, not as model error — and also not as model skill.
- **The first real grade arrives ~Sep 15**; the earliest possible mechanical
  promotion is ~early October (three graded weeks). Until then the ledger is
  empty and the scoreboard says so rather than showing anything.
- **The week clock is a declared constant** (opener Thu 2026-09-10, weeks
  rolling Wednesdays). The mandate said to derive it from the vegas store's
  schedule dates, but the committed store carries week numbers and NO dates
  (checked); the constant is tested and one line to move.
- **Tuesday 06:00 UTC may beat the stats release** for MNF weeks: the grader
  refuses partial weeks (<200 players or <20 teams) by name and the next
  Tuesday (or a manual dispatch) catches up. A week can therefore grade up
  to 7 days late; it can never grade wrong-populated.
- **Provider grading is only as wide as the archive**: FP weekly numbers are
  not yet archived (Sleeper only, Sundays), so the `fantasypros` and
  `sleeper_fp_average` arms start grading the day the archive carries FP —
  the switch-or-average question gets its first evidence then. Extending the
  archiver is a one-source change in `weekly_proj_snapshot.py` (not touched
  here — it is another lane's file today).
- **2025 grading precedent caveat**: the frozen scoring table's 2025 pbp
  divergence (120/4,685 player-weeks, 2pt conversions) is a known, bounded
  store property; 2026 actuals come from the official aggregation path.
- **Sandbox honesty**: api.sleeper.app and sportsgameodds are unreachable
  from the sandbox and CI does the fetching; both workflows carry dry_run
  paths that write to $RUNNER_TEMP and commit nothing, and those exact env
  paths are unit-tested, so the relay can dispatch real dry runs post-merge.
- **Site controls that are NOT wired are not shown as knobs**: pausing
  adaptation / pinning a champion is a commit to `controls.json` (the Python
  loop provably reads it; tested). A site button for those needs a
  site→CI bridge (the sunday-alert keyed-endpoint pattern) that lives
  outside this pass's cleared files — the page says exactly that instead of
  showing a knob that lies.

## 4. Files and discipline

New: `draft/weekly_own_projection.py`, `draft/weekly_own_grade.py`,
`.github/workflows/own-weekly-proj.yml`, `.github/workflows/own-weekly-grade.yml`,
`draft/data/weekly_own/{README.md,controls.json}`,
`views/admin/model-scoreboard.ejs`, tests
(`test_weekly_own_projection.py` 24, `test_weekly_own_grade.py` 26,
`proj_feed_source.test.js` 13, `admin_model_scoreboard.test.js` 28).
Touched: `src/proj_feed.js` (source switch — A-lane), `src/routes/admin.js`
(scoreboard + one POST, appended before `module.exports`).
Imported byte-identical from the relay branch (import-only, never modified):
`own_model_v2..v5.py`, `model_accuracy_backtest.py`,
`fetch_component_stats.py`, `vegas_lines_2021_2026.json` — so this branch
runs standalone and the relay merge is a no-op on them.
Workflow YAML: yaml.safe_load-verified by test; two `-m` flags, never a
block-scalar commit message; dry-run-first; assignments inside if-tests.
Absent-not-zero at every layer, tested at every layer.

Three governance-test amendments, each a recorded exemption/declaration in
the mechanism those files themselves provide, never a weakened check:
- `test_core_needs_no_reviewer.py`: `config-check.yml` exempted from the
  no-reviewer-reference scan (pre-existing red on main tip — config-check is
  the secrets CENSUS; naming `OPENAI_API_KEY` is its function, not a
  dependency).
- `authority.test.js`: `/model-scoreboard/source` added to `SCORE_EXEMPT`
  (the substring scan trips on "score" in SCOREBOARD; the route enters no
  score anywhere).
- `data_separation.test.js`: `controls.json` DECLARED as a production input
  with its reason (Cory-only display of adaptation state; never a ranking
  input).
