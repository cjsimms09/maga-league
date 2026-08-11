# The settings registry claimed 19 imported. Four are.

**Date:** 2026-08-11 · **Scope:** `draft/config/sleeper_settings_registry.json` and
every consumer of Sleeper's `league.settings` · **Verdict:** the registry was wrong
about its own central claim, and its test could not have caught it.

## What was claimed

The registry was built earlier today so that no Sleeper setting could sit unread
and unnamed — the failure that let `waiver_type` go unlooked-at while the waiver
system was held by memory. It classified all 49 settings and marked **19
`imported`**, whose declared meaning is *read by our code*.

## What is true

Measured two ways, neither of them a grep for the name:

| | count | keys |
|---|---|---|
| **imported** — something reads it | **4** | `playoff_teams`, `playoff_week_start`, `max_keepers`, `type` |
| **imported_unread** — reaches `league_config.json`, read by nobody | **5** | `waiver_type`, `waiver_budget`, `waiver_clear_days`, `waiver_day_of_week`, `daily_waivers` |
| **read by nothing at all**, previously labelled imported | **10** | `disable_trades`, `draft_rounds`, `leg`, `num_teams`, `playoff_round_type`, `playoff_seed_type`, `reserve_slots`, `taxi_slots`, `trade_deadline`, `trade_review_days` |

And two of the four survivors survive on a technicality worth stating: `max_keepers`
and `type` are read **only** by `exp_discoverability.py`, which uses them to choose
which *public* leagues to sample. Nothing that models our league reads either one.
Meanwhile `sleeper_import` hard-codes `keepers.count = 3` beside a Sleeper field
that says 3 — two places for one fact, with the authority in the unread one.

## Why the guard did not guard

`sleeper_registry.test.js` checks that every key Sleeper emits is classified, that
no classified key is stale, that dispositions come from the declared vocabulary,
and that no entry lacks a `why`. All four are real checks. **None of them looks at
a consumer.** The disposition was a hand-written account of what the code does —
a declared value, which is the one thing the registry existed to stop. Pointed at
itself, the registry had the defect it was built to prevent.

## How it is measured now

**Path A — perturbation** (`draft/tools/settings_influence.py`). Change one
setting, re-run `import_league` offline, diff the config. A setting reaches the
config iff changing it changes the config. No reading of source text is involved.
Result: 7 of 49 reach it.

**Path B — read shapes** (`draft/tools/settings_access.py`). The web app never goes
through `league_config.json`; `src/routes/*` read `sData.league.settings.*` straight
off the cached season bundle. So a setting can be inert on path A and genuinely
used. This is source inspection and inherits rule 11e's weakness, so it was built
against the three things in this repo that defeat the naive version:

- `leg` — Sleeper's leg number, and also a side-bet **payment leg** in `sidebets.js`
- `draft_rounds` — Sleeper's setting, and also `config_schema.draft_rounds()`, *our*
  derivation, which exists **because** Sleeper's is wrong
- `draft_rounds` again, in an `app.js` comment recording that very fact

Comments are stripped first (preserving line numbers — the first run cited
`exp_discoverability.py:49` for a read on line 68), and a match must have the
**shape** of a read (`.get("k")`, `["k"]`, `x.k`) on a line that mentions settings.
Proximity alone was not enough either: `settings_readable = {..., "error":
type(e).__name__}` was cited as a read of `settings.type`, and is not one.

## What this changed in the model

Nothing yet, deliberately. The reclassification moved 15 entries and rewrote every
`why`, but no new setting was wired in. Five entries now carry a specific consequence:

- **`reserve_slots: 1` — an IR spot nothing can see.** `roster_slots_from()` counts
  `roster_positions`, which lists no IR entry. Every slot count in the tool says 15
  when the roster holds 16, so any "roster is full" arithmetic is off by one.
- **`playoff_round_type: 0`.** `money_grade.py` hard-codes one week per playoff round
  (`week = playoff_week_start + (r-1)`) without reading it. Two-week rounds would make
  the grading silently wrong for every playoff game.
- **`trade_deadline: 11`.** No in-season surface knows it. A buy/sell recommendation
  after week 11 is not an action anyone can take.
- **`trade_review_days: 2`.** A trade is not final for two days.
- **`playoff_seed_type: 0`.** The only seeding-adjacent field Sleeper holds, and the
  playoff cut is derived in several places without consulting it.

And one entry is now recorded as **unresolved rather than known**: `waiver_day_of_week:
2` matches the UI's "waivers clear 2 AM WED" only if Sleeper counts Monday as 0.
Nothing reads it, so nothing is wrong today — the entry now says it must not be read
until the convention is confirmed against a real clear.

## What is still not true of the waiver rule

`waiverPriorityDepletes()` turns `waiver_type` into `depletes: false`, and
`claimStoppingRule()` consumes that. Neither is called by anything but its own test,
and the imported `waiver_type` never reaches either. The rule and its input are both
built and not connected — which is why `waiver_type` is `imported_unread` and not
`imported`.

## The limit of the new guard (rule 10d)

The dispositions were written **from** this measurement, so on the day it lands
`test_settings_registry_truth.py` cannot fail — a fixture whose input derives from
the code under test always passes. Its job starts at the next change: a setting that
stops being read, one that starts being read, or a hand-edit of the registry now
diverges and goes red. All three directions were broken deliberately and each
discharged.

Three assertions in that file are exempt, because they check facts about the
**league** that nothing in this repo derives, and can fail today:

- `league.settings.draft_rounds` (3) still disagrees with `draft.settings.rounds` (15) —
  the disagreement is the entire reason `draft_rounds` is ignored
- `reserve_slots > 0` while `roster_positions` carries no IR entry — the gap that makes
  it a `should_import`
- `num_teams` (10) still equals the roster count — `num_teams` is ignored *because*
  `total_rosters` is used instead, which is safe only while they agree
