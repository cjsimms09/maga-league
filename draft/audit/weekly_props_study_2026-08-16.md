<!-- TERRITORY: A -->
# THE WEEKLY PROPS ARM — a study, not a verdict — 2026-08-16

## 0. Cory's directive, verbatim

> "sounds like we need to study different things. One for season projections
> for draft and another for weekly projections specific to that week?"

Confirmed correct split. A separate agent owns the SEASON-TOTAL props arm for
the draft board (own_v6 comparison, summed weekly props → one number per
player per season — `draft/tools/fetch_historical_props.py`,
`draft/backtest/props_season_projection.py`, `historical-props-fetch.yml`,
NOT this pass). **This document is the other half**: a WEEKLY props arm for
the in-season loop (`draft/audit/weekly_own_loop_2026-08-16.md`), predicting
THAT SPECIFIC WEEK's points directly from that week's prop lines — a
structurally cleaner signal than season-summing, gradable on every
player-week a market existed for rather than one row per player per season.

**Read `draft/audit/weekly_own_loop_2026-08-16.md` first** — this study adds
one arm to that exact system (champion `own_weekly_v1` + tilt challengers +
provider study arms, graded by `draft/weekly_own_grade.py`, mechanical
promotion, `/admin/model-scoreboard`). Nothing here builds a parallel loop.

## 1. The season-vs-weekly split, stated plainly

| | season-total props (sibling study) | weekly props (this study) |
|---|---|---|
| feeds | the draft board (`own_v6` comparison) | the in-season loop (`weekly_own_grade.py`) |
| shape | prop lines SUMMED across a season → one number/player/season | ONE week's lines → that week's number, no summing |
| sample for grading | one row per player per season (thin) | one row per player PER WEEK a market existed (rich — many player-weeks per season) |
| files | `fetch_historical_props.py`, `props_season_projection.py`, `historical-props-fetch.yml` | `fetch_weekly_props.py`, `weekly_props_arm.py`, `weekly-props-fetch.yml` |
| owner | a different agent | this pass |
| shared credit pool | **YES — same `ODDS_API_KEY`, same the-odds-api.com plan.** Coordinate before either fetch runs for real. |

## 2. Architecture

```
raw historical player-prop odds (the-odds-api.com, per event)
  -> fetch_weekly_props.extract_event_props        (median-of-BOOKS per player/market)
  -> fetch_weekly_props.implied_points              (markets combine additively,
                                                       scored under the league's
                                                       OWN frozen_scoring_table())
  -> fetch_weekly_props.board_index / match_player  (name -> board player_id,
                                                       disambiguated by the
                                                       event's two teams, every
                                                       miss NAMED not guessed)
  -> fetch_weekly_props.build_week_props / build_snapshot
  -> draft/data/props/weekly_props_<season>_w<week>.json      (committed)
  -> weekly_props_arm.load_props_arm                (pid -> implied points)
  -> weekly_own_grade.main() merges it into the SAME provider_proj dict
     `provider_weeklies()` already builds for sleeper/fantasypros
  -> grades_<season>.json: providers.props_weekly_v1 (own_population +
     shared_with_ours, exactly like every other study arm)
```

**Nothing here re-implements scoring, grading, MAE, Spearman, or the
promotion rule** — `weekly_own_grade.grade_week()` and `decide_promotion()`
are untouched in logic; the only change to that file is a four-line merge
in `main()` that adds `props_weekly_v1` to the dict already passed to
`grade_week`. `draft/weekly_own_projection.py`'s docstring gained one
paragraph pointing at this arm; its arm machinery (`DEFAULT_ARMS`,
`price_week`, `build_snapshot`) is untouched.

## 3. The explicit, honest fallback choice (preregistered)

**props_weekly_v1 prices ONLY the players a market was quoted for that
week. A player with no quoted market that week is ABSENT from the arm
entirely — never zero, and never blended down to the champion's
season-rate number.** This is a deliberate choice, stated here so it is
never mistaken for a bug:

- Blending would quietly make `props_weekly_v1` into "the champion arm,
  sometimes nudged by a prop line" — the comparison against the champion
  would then be measuring the blend's shrinkage weight, not the market's
  signal.
- The champion/challenger slot in `weekly_own_projection.py`
  (`DEFAULT_ARMS` → `challengers`) REQUIRES full-population coverage —
  every arm in that dict must price every player the champion prices, or
  `weekly_own_grade.grade_week`'s `_score()` call (`proj[p]` for every
  `p` in the champion's population) raises a `KeyError`. Props cannot
  honestly promise that.
- `weekly_own_grade.py` already has a slot built for exactly this
  shape: the PROVIDER study-arm pathway (`sleeper` / `fantasypros` /
  `sleeper_fp_average`), which grades a narrower, independently-populated
  arm on its OWN population (`own_population`) AND on the population it
  shares with the champion (`shared_with_ours`), honestly labeled, never
  auto-promoted. `props_weekly_v1` enters through that identical pathway.
  It is **not** a third-party feed — the label is a reuse of shape, not a
  claim about provenance — and this is stated in both
  `weekly_own_grade.py`'s header and `weekly_props_arm.py`'s header so a
  future reader is not confused.

**Consequence, also stated plainly:** because `props_weekly_v1` never
enters `active_arms`, `decide_promotion()` can never auto-promote it —
correct, since its real-world accuracy is entirely unmeasured today (see
§5). A future promotion decision, if the evidence earns it, is a human
ruling made with real numbers in hand, the same as every provider-arm
question in this system.

## 4. THE PREREGISTRATION — before any real grading

**The question:** does `props_weekly_v1` beat the champion arm
(`own_weekly_v1`, currently `v1`) on weekly MAE, and by how much, broken
out by position (QB / RB / WR / TE)?

**The population rule (fixed here, before any real data exists):** MAE and
Spearman for `props_weekly_v1` are computed ONLY over
`props_weekly_v1 ∩ actuals` (`own_population` in the ledger) — sample size
`n` stated on every graded week, per position where `n` supports it. The
apples-to-apples comparison against the champion is
`shared_with_ours` — the SAME population, both arms scored on it,
`own_champion` printed alongside `props_weekly_v1` in that block.

**What counts as evidence, stated before any real week grades:** a
promotion-relevant answer needs the same bar every other arm in this
system clears before a ruling is requested — multiple graded weeks (the
mechanical rule elsewhere in this system requires ≥3 common weeks before
even a same-population own-arm challenger qualifies; the same order of
magnitude applies here informally, since `props_weekly_v1` is graded but
never mechanically promotable regardless of `n`). A single week's MAE
comparison is a data point, not a verdict, and will be reported as one.

**Why this is gradable FAST, historically, rather than waiting for live
2026 games (the entire point of paying for history over the free forward
capture already wired into `own-weekly-proj.yml`):** once real weekly-prop
snapshots for 2023-2025 are committed, the SAME `weekly_own_grade.py` CLI
already scheduled for Tuesdays grades every historical week in one run —
no new harness, no waiting for Sundays.

## 5. Fixture-tested pipeline proof — done NOW, before any real fetch

`draft/tests/test_weekly_props_grading_roundtrip.py` runs the REAL modules
in the REAL order a real Tuesday would, on a synthetic fixture with KNOWN
injected answers, and recomputes every number independently rather than
re-trusting the code under test:

1. A raw two-event prop-odds fixture (one book each, so the median-of-books
   arithmetic is the single quoted point) — Patrick Mahomes
   `player_pass_yds` 275.0, CeeDee Lamb `player_receptions` 6.5, Justin
   Jefferson `player_receptions` 8.5. **Josh Allen appears on NEITHER
   event** — proving the absent-not-blended fallback with a real miss, not
   just an empty-input edge case.
2. `fetch_weekly_props.build_week_props` / `build_snapshot` price it —
   independently recomputed here as `point × frozen_scoring_table()` rate,
   asserted equal to the snapshot's own numbers.
3. `weekly_own_grade.main()` — the exact CLI the Tuesday workflow runs,
   pointed at the fixture via `PROPS_WEEKLY_DIR` — grades it.
4. The ledger's `own_arms.v1.mae` (**4.0**, hand-computed over all four
   players) and `providers.props_weekly_v1.own_population` (**n=3**, MAE
   hand-computed over the three props-covered players against the SAME
   known actuals) are asserted against independently-computed numbers, not
   against whatever the code happened to produce.
5. `shared_with_ours.own_champion` is separately hand-computed (**MAE
   13/3 ≈ 4.333** over the same three-player shared population) and
   compared, proving the apples-to-apples cell is not just re-copying
   `own_population`'s number under a different key.
6. A second test proves the null case: no props snapshot committed for a
   week → `props_weekly_v1` simply does not appear in that week's grade;
   the champion grades exactly as it always has.

`draft/tests/test_fetch_weekly_props.py` (24 tests) covers every pure
function in isolation, including the one bug class this kind of median
arithmetic invites: a bookmaker listing BOTH Over and Under at the same
point must not out-vote a bookmaker listing one side
(`test_median_is_per_book_not_per_outcome_row`). `draft/tests/
test_weekly_props_arm.py` (7 tests) covers the reader's absent/malformed/
empty cases. **83 tests total across the three files; full suite green.**

## 6. Credit cost — exact, and the coordination it requires

**The-odds-api.com's own documented pricing model** (the model itself, not
just this one endpoint's presence, is what's assumed — see §7): 10 credits
× (markets requested) × (regions requested), PER EVENT (game) CALL,
regardless of how many players' lines that call returns.

| | markets | regions | credits/event | events | **total credits** |
|---|---|---|---|---|---|
| one week (typical, 14-16 games) | 8 (default set) | 1 (`us`) | 80 | 14–16 | **~1,120–1,280** |
| full 2023-2025 backtest | 8 | 1 | 80 | 816 (272 games/season × 3) | **65,280** |

`estimate_credits()` in `fetch_weekly_props.py` computes this exactly (pure,
tested — `test_estimate_credits_matches_documented_pricing`,
`test_estimate_credits_default_market_set_matches_workflow_comment`, so the
workflow's comment and the code can never silently drift apart), and every
real-fetch run prints and records it in the snapshot's own provenance.

**Against the confirmed balance** (key-probe run 31967817943, 2026-08-16:
`x-requests-remaining: 99988` — very likely a 100,000-credit/mo plan): a
full 3-season, 8-market weekly backtest is **~65% of one month's budget in
a single dispatch.** Cheap levers if that is too much: narrow `--markets`
(dropping the four TD/INT markets to the four yardage/reception markets
roughly halves the cost), or `--limit` to smoke-test a handful of games
before committing to a full week or season.

**COORDINATION, stated because it is a real risk, not a formality: this
fetch and the season-total study's fetch (`fetch_historical_props.py` /
`historical-props-fetch.yml`) spend the SAME `ODDS_API_KEY` credit pool.**
Neither this session nor the season-total study's session has dispatched
either workflow for real as of this writing. Whoever dispatches first
should check the other study's spend (each snapshot records its own
`credits` provenance) before firing a large batch. `ROUTES.md` TO:A names
this explicitly as the coordination point.

## 7. The confirmed door, and what is honestly still an assumption

**Confirmed live** (key-probe run `31967817943` on `main`, 2026-08-16, job
`95215556739`, commit `f56c57c7`):

```
GET https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl
    /events/{event_id}/odds?apiKey=...&regions=us&markets=player_pass_yds
    &date=2024-09-08T17:00:00Z
-> HTTP 200
   historical PLAYER PROP odds (event 7a5e353202d40a844491fa5753bc3097,
   market player_pass_yds): HTTP 200
   bookmakers returned: 6; player_pass_yds market present: True
   x-requests-remaining: 99988
```

**What that probe actually printed** (verbatim from the job log, so this
document does not overstate it): a bookmaker COUNT and a market-key
BOOLEAN — `have_market = any(m.get('key') == 'player_pass_yds' for bk in
books for m in bk.get('markets', []))`. It never printed an outcome, a
price, or a point.

**So, precisely, what is confirmed vs. assumed, both recorded in every
committed snapshot's `provenance.markets_confirmed_live` /
`markets_assumed`:**

- CONFIRMED: the historical single-event-odds endpoint is live on this
  plan; `player_pass_yds` is a real, priced market on a real 2024 game;
  the response wraps the event under `data` (`(d.get('data') or {}).get(
  'bookmakers')` is exactly how the probe itself reads it, and
  `fetch_weekly_props.extract_event_props` reads it the same way).
- ASSUMED, not independently re-verified: (a) the other seven default
  market keys (`player_pass_tds`, `player_pass_interceptions`,
  `player_rush_yds`, `player_rush_tds`, `player_receptions`,
  `player_reception_yds`, `player_reception_tds`) exist on this same plan
  for the same endpoint — they are the-odds-api.com's own documented
  market-key naming convention, a conservative and reasonable assumption,
  not a probed fact; (b) the per-outcome field names this module reads
  (`name`, `description`, `point`) are the-odds-api.com's documented
  historical-odds shape, not literally re-printed by the probe.
- **Built defensively BECAUSE of that gap, not despite it:**
  `extract_event_props` treats a missing key, an unparseable point, or an
  unexpected market as an absence, never a crash and never a guessed
  value. A real fetch that hits an unconfirmed corner degrades to "fewer
  players matched, named in `unmatched`" — never a silently wrong number.
  The first real dispatch's own log is the cheapest possible confirmation
  of every remaining market, one `--limit 1` smoke call away.

## 8. Honesty statement — NO real verdict yet

**`draft/data/props/` is EMPTY on this branch.** No real fetch has been
dispatched by this session, by design (the assignment: "You CANNOT dispatch
the real fetch from this sandbox... DO NOT dispatch it yourself"). Every
number this document reports is either (a) independently confirmed by the
key-probe run cited in §7, or (b) a synthetic-fixture arithmetic proof
(§5) with known, injected answers — **never a real weekly MAE, never a
real Spearman, never a real "props beat the champion" claim.** The
preregistration in §4 exists precisely so that the first real grading run
is compared against a question fixed in advance, not one shaped to fit
whatever the first result turns out to be — the discipline
`draft/audit/league_benchmark_2026-08-16.md` §9 exists to enforce, after a
"CLEARS" claim there did not reproduce.

## 9. Files and discipline

New: `draft/tools/fetch_weekly_props.py`, `draft/weekly_props_arm.py`,
`.github/workflows/weekly-props-fetch.yml`, `draft/tests/
test_fetch_weekly_props.py` (24), `draft/tests/test_weekly_props_arm.py`
(7), `draft/tests/test_weekly_props_grading_roundtrip.py` (2 — the fixture
round trip).
Touched: `draft/weekly_own_grade.py` (header paragraph naming the new study
arm + a four-line merge in `main()` wiring `props_weekly_v1` into the same
`provider_proj` dict `provider_weeklies()` already builds — no change to
`grade_week()`, `decide_promotion()`, or any scoring arithmetic),
`draft/weekly_own_projection.py` (one docstring paragraph pointing at this
arm — no change to `DEFAULT_ARMS`, `price_week`, or `build_snapshot`).
Imported byte-identical, never modified: `draft/adp.normalize_name` (the
repo's one name matcher), `draft/weekly_own_projection.TEAM_NAME_TO_CODE`
(the repo's one team-name map),
`draft/backtest/fetch_component_stats.frozen_scoring_table` (the repo's
one scoring-table reader), `draft/scoring.score_stat_line` (the repo's one
scoring engine).
Absent-not-zero at every layer: a player with no quoted market that week
is absent from `players`, never a zero; a name the crosswalk cannot match
is named in `unmatched` with a reason, never dropped silently or guessed.

STAYED OUT OF (the season-total study's files, by name, per the
assignment): `draft/tools/fetch_historical_props.py`,
`draft/backtest/props_season_projection.py`,
`.github/workflows/historical-props-fetch.yml`. Neither file exists on
this branch as of this writing; if either lands before merge review, the
overlap is expected to be small (shared market-key vocabulary at most) and
reconciled by A at merge review, per the assignment.
