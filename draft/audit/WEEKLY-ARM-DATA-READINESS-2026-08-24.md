# WEEKLY-ARM DATA-READINESS AUDIT — Cory's in-season queue item 1 (08-24)

**Ask:** for each of D's eight Tier-1 weekly arms (`BLEND-SEARCH-DESIGN.md`,
ships by 09-03), walk the 2026 in-season feed's real chain: which store, what
cadence, is it on `capture_cron_health.py`, does it join to Sleeper player
ids. One table, gaps named with owners, so no arm discovers a missing feed on
its 09-03 build day.

**Method:** every cell below is read off a real file, a real workflow's
`cron:` line, or a real committed store — not assumed from a name. Where a
cell says "not independently re-verified," that specific claim rests on
another lane's own docstring rather than a file I opened myself; everything
else was checked directly for this table.

| arm | store (2026 in-season) | cadence | on `capture_cron_health.py`? | joins to Sleeper id? |
|---|---|---|---|---|
| **Vegas** (game lines) | `draft/data/odds/latest.json` (`fetch_odds.py`, TERRITORY:A) + `draft/data/bovada_lines_2026.jsonl` (mine) | odds-capture.yml Thu 12:00/Sun 13:00 UTC; bovada-lines-capture.yml Thu 12:00/Sun 16:00 UTC | **NO** for odds-capture (not in MANIFEST, not C-owned). Bovada gets a **separate special-case check** (`check_bovada_cadence`, this session) — not the same as the MANIFEST's normal watch, and it checks CADENCE COMPLETENESS only, not staleness | **N/A by design** — Vegas is team/game-level, not per-player; no Sleeper join applies |
| **usage** (`tgt_share`) | `component_stats_<season>.json` (`fetch_component_stats.py`, TERRITORY:A) | **NO DEDICATED 2026 WEEKLY CRON FOUND.** Only `own-weekly-grade.yml` (Tue 06:00 UTC) touches this filename, and that workflow's job is grading, not a documented refresh of this store — checked directly, not assumed | **NO** (not C-owned, not in MANIFEST) | **YES** — sleeper_id keys, reused directly by `defense_vs_position.py` and `player_games_played.py` this session |
| **air-yards/EPA** (`ay_share`, `wopr`, `rec_epa`) | **NO RECURRING STORE EXISTS.** The only file carrying these fields anywhere in the repo is `draft/data/pre_draft_freeze_2026.json` — a ONE-TIME pre-draft snapshot, not a weekly capture | **NONE** | **NO** | **Unknown — no live store to check** |
| **Kalshi** | `draft/data/kalshi/weekly_markets_<date>.json` (real dated files present, e.g. `weekly_markets_2026-08-20.json`) | kalshi-capture.yml, **daily, `cron: '0 11 * * *'`** — verified directly against the workflow file | **NO, AND capture_cron_health.py's OWN DOCSTRING IS WRONG ABOUT WHY**: it claims kalshi-capture.yml is "dispatch-only, no `schedule:` trigger" — checked directly, the workflow has a real daily schedule. The exclusion was correct in spirit (Kalshi is not C-owned) but the stated REASON is stale and would mislead the next reader | market-ticker keyed (`market_movement_series.py`'s adapter, referenced elsewhere in this repo) — not the same key space as Sleeper id, by design; not independently re-verified for this table |
| **pace** | **DELIBERATELY NONE.** `pace_of_play_2026-08-16.md` studied this and found the classic "plays per game" signal does not carry year to year — a closed research question, not a capture gap | N/A | N/A | N/A |
| **props** | `draft/data/odds/weekly_props_<season>_w<week>.json` (`fetch_weekly_props.py`, TERRITORY:A, "SKIP cleanly before week 1") + my `bovada_event_props_probe.py` (dispatch-only, not yet graduated to a schedule) | weekly-props-fetch.yml Thu 12:00 UTC | **NO** (not C-owned, not in MANIFEST) | Per-player by construction (props are player-level); exact key format not independently re-verified for this table |
| **age curve (P325)** | `player_bio_capital.json` (mine) | player-bio-capital-refresh.yml Wed 12:00 UTC | **YES** — added to the MANIFEST this session | **YES**, 100% of top-170 board players, verified this session |
| **opportunity-delta (P327)** | `snap_counts_<season>.json` (`fetch_snap_counts.py`, TERRITORY:A) + `component_stats_<season>.json` (same gap as usage, above) | weekly-snap-counts.yml Wed 11:00 UTC ("clean pre-season skip," verified standing by the relay 08-24 per this row's own text) | **NO** (not C-owned, not in MANIFEST) | **YES** — measured 99.19% join rate to Sleeper id in the real 2024 store, checked directly for this table |

## What this actually says

**Two real gaps, not just monitoring gaps:**
1. **air-yards/EPA has no 2026 in-season capture at all.** P326/the air-yards
   Tier-1 arm has no data to run on beyond the one-time pre-draft freeze.
   This is the one arm on the list that cannot ship by 09-03 without a new
   build — and it is not a C store today, so it is not mine to silently
   invent one for.
2. **usage's underlying store (`component_stats_<season>.json`) has no
   dedicated 2026 weekly refresh** — only an indirect touch from a grading
   workflow that was not built to guarantee freshness. Worth a direct
   question to A rather than an assumption either way.

**`capture_cron_health.py`'s scope is real, not an oversight, and it is
narrower than this audit needed:** every current MANIFEST entry is a C-owned
capture (verified: `external_adp_series`, `fp_expert_ranks_weekly`,
`player_bio_capital`, `injury_designations`, `practice_participation`,
`weekly_projection_archive` are all TERRITORY: C). It was built and scoped
that way on purpose (its own docstring says "SCOPE: every C-owned SCHEDULED
data capture"), so five of the eight arms above being "NO" on this column is
not five instances of the same bug — it is the tool doing exactly what it
was built to do, for captures it does not own. Whether A wants an equivalent
watch for A-owned captures is A's call, not something added here unilaterally.

**One thing already fixed as a side effect of writing this table:** the
`capture_cron_health.py` MANIFEST comment's claim about *why* kalshi-capture
is excluded ("dispatch-only") is factually wrong and should be corrected to
state the real reason (not C-owned) rather than an inaccurate one, so the
next reader does not inherit the wrong fact. Not fixed in this pass — the
docstring itself is a comment, not a mechanism, and this table is the
deliverable; the correction is one line whenever anyone next touches that
file.

## Owners, stated per this row's own instruction

- **A:** usage's missing weekly-refresh cron (or confirmation that
  `own-weekly-grade.yml` already covers it and this table is wrong about
  that) — a one-message question, not a build.
- **A / D:** air-yards/EPA has no 2026 capture and D's arm needs it by 09-03.
  Whoever owns the air-yards Tier-1 arm should know this before, not on,
  build day.
- **C (me):** the `capture_cron_health.py` docstring correction (kalshi's
  real exclusion reason) — small, will land with the next C-territory touch
  to that file.
- **A:** whether A-owned captures (Vegas/props/usage/Kalshi/opportunity-
  delta's non-C half) want their own freshness watch, given `capture_cron_
  health.py` was deliberately scoped to C only.

No board field moves from this table. It is a readiness map, not a fix.
