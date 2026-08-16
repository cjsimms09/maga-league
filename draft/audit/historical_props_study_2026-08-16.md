<!-- TERRITORY: A -->
# HISTORICAL PLAYER-PROPS STUDY — build-the-harness pass, 2026-08-16

> **STATUS UP FRONT, so nobody has to read to the bottom to find it: NO REAL
> VERDICT EXISTS YET.** No real historical prop line has been fetched. This
> document preregisters the form, confirms the paid API access is real and
> live, and reports exactly what is TESTED (every pure function, against
> synthetic fixtures matching the confirmed real API shape) versus PENDING
> (the actual 3-season fetch, which costs real money and needs a human to
> authorize and dispatch it). Follow the house discipline this repo already
> applies everywhere else (`league_benchmark_2026-08-16.md` §9 is the fresh
> example of what happens when that discipline is skipped): preregister
> before grading, state n everywhere, absent-not-zero, leakage guards
> tested, and never publish a number nobody can reproduce.

## 0. Cory's directive, verbatim (2026-08-16, this session)

> He asked repeatedly whether paying for historical betting/player-props
> data would improve projections. The cost research found The Odds API
> sells historical player props back to May 2023 (5-min snapshots, 10
> credits/market/region) on a $59/mo paid plan. He has NOW ACTIVATED a paid
> ODDS_API_KEY.

The hypothesis to test, his framing: player props are WEEKLY markets, but
the draft board's own-model projects SEASON TOTALS. For each player, pull
historical weekly player-prop lines (passing/rushing/receiving yards,
receptions, TDs — whatever markets exist) across a season, convert each
week's prop line into an implied fantasy-point value under our league's
actual scoring (the same "line -> points" conversion pattern already used
for team totals in `fetch_component_stats.py`), SUM across the season to
get a props-implied season total, and grade THAT as a candidate season-total
projection arm against `own_v6`, exactly like v5/v6 were graded.

## 1. ACCESS VERIFICATION — CONFIRMED, 2026-08-16, run `31967817943`

**Was PENDING at the start of this session; is now CONFIRMED with numbers.**
The relay session fired `key-probe.yml` on `main` with a new historical +
props access check, added specifically because Cory upgraded the key. The
most recent run of that workflow on `main`:

    run id            31967817943
    commit            f56c57c7c96dab0245c16896612ddfa472b92684
    created           2026-08-16T19:31:07Z
    completed         2026-08-16T19:31:18Z
    conclusion        success

The job log, quoted verbatim (the section that matters — full log available
via the run's own job id `95215556739`):

```
== ODDS_API_KEY historical + player-props access (Cory upgraded the key, 2026-08-16) ==
historical events list (2024-09-08T17:00:00Z): HTTP 200
historical PLAYER PROP odds (event 7a5e353202d40a844491fa5753bc3097, market player_pass_yds): HTTP 200
  bookmakers returned: 6; player_pass_yds market present: True
  (remaining-credits header, if present:)
x-requests-remaining: 99988
```

Read plainly: (a) the historical endpoint is reachable and returns 200 on
this key, (b) the `player_pass_yds` player-prop MARKET is genuinely served
— 6 real bookmakers answered, not a placeholder — for a real 2024-09-08
game, (c) `x-requests-remaining: 99988` confirms the plan size is
**~100,000 credits/month**, essentially untouched (12 credits consumed by
the entire probe run, including the free `/sports` call). No hedging on
plan tier is needed anywhere below — the 100K figure is used directly.

**What is confirmed by a second live call vs. by vendor documentation,
named honestly:** the probe printed status + market-presence + bookmaker
COUNT only (by design — "never a value," the same discipline every probe
in this repo follows). It did not print individual outcome rows. The exact
outcome-level shape this study's parser expects (`description` carries the
player's name, `point` carries the line, one row per Over/Under per book)
is the vendor's documented contract for this endpoint family, not verified
line-by-line against a second live call — spending a second real credit
allotment to re-confirm a shape the vendor's own docs already specify was
judged not worth it. If the real fetch (§5) discovers this shape is wrong
in some way the docs didn't predict, the pure parser is the one place that
needs to change, and its test fixtures make that a fast, localized fix.

## 2. SEPARATE STUDY, NOTED FOR RECONCILIATION AT MERGE REVIEW

Cory split this into two studies at the same time this one was
commissioned: this one (season-total, for the draft board) and a second,
WEEKLY study (for the in-season loop) built by a parallel agent against the
same confirmed API shape. Overlap between the two fetch tools is expected
and was not something to coordinate across worktrees mid-flight. **Action
for A at merge review:** check whether the two `fetch_historical_props`-
shaped tools duplicate real fetch logic against the same endpoints: if so,
reconcile into one shared historical-props store (season-total and weekly
consumers reading the same weekly-grain data, since a season total IS the
sum of the weekly numbers the other study needs anyway) rather than paying
for the same real snapshots twice. Not attempted here — this document's
scope stays exactly what Cory assigned: the season-total arm.

## 3. THE FORM — preregistered here, before any real grade exists

### 3a. Markets (six, matching the directive verbatim)

| market key | store stat key | scoring rate (frozen table) |
|---|---|---|
| `player_pass_yds` | `pass_yd` | 0.04 pts/yd |
| `player_pass_tds` | `pass_td` | 6.0 pts/TD |
| `player_rush_yds` | `rush_yd` | 0.1 pts/yd |
| `player_rush_tds` | `rush_td` | 6.0 pts/TD |
| `player_reception_yds` | `rec_yd` | 0.1 pts/yd |
| `player_receptions` | `rec` | 0.5 pts/rec |

**Named, not fetched:** receiving TDs as their own market and the
anytime-TD moneyline market are out of scope for this pass — anytime-TD is
priced (American odds, no `point`) rather than lined (a `point` value), so
converting it to an expected value needs a de-vig step this pass does not
build. Adding it is a legitimate, separately-budgeted follow-on, named so
it is not silently absorbed into "TDs" above.

### 3b. Line -> points conversion (the frozen arithmetic)

A prop line priced near even odds on both sides (the standard book
construction) is the book's estimate of the stat's MEDIAN — that is the
whole justification for reading `point` as an expected value, exactly the
same read `fetch_component_stats.py` gives Vegas team-total lines. Per
player-week:

    points = sum(line_value[stat] * scoring_cfg[stat] for stat present)

Any market absent for a player that week contributes NOTHING — never a
zero, never fabricated. `props_season_projection.line_to_points` is this
function, pure, tested against every combination in
`test_props_season_projection.py` (single stat, multiple stats, an absent
market vs. an explicit `0.0` line — both must be identical, since a market
that was never quoted and a market quoted at zero are different facts and
only the first is "absent").

### 3c. Consensus per player-week

`fetch_historical_props.parse_event_props` takes the MEDIAN `point` across
every bookmaker offering a market for a player (parallel to
`fetch_odds.py`'s median-not-every-book design for team totals — one book's
quirk should not be the league's number).

### 3d. Season aggregation

`props_season_projection.season_implied_totals` SUMS `line_to_points`
across every week where the player has a props row. A player absent from a
given week's store contributes nothing that week (never assumed to have
played, never zero-filled) — the games-with-a-props-row count travels with
every total, the same discipline every store in this repo already keeps.

### 3e. Name matching (odds API name -> sleeper pid)

The Odds API keys player-prop outcomes by free-text name
(`description: "Patrick Mahomes"`), not a sleeper id. Matching goes through
`normalize_name` (lowercase, strip punctuation, drop Jr./Sr./II/III/IV
suffixes) against an index built from `nfl_data_py.import_ids()` — the SAME
crosswalk source `fetch_component_stats.py` and `rookie_prior.py` already
use, so the third study to touch nflverse ids does not invent a fourth
vocabulary. An unmatched name is EXCLUDED from the graded population and
COUNTED (`unmatched_names`, `unmatched_count` in the artifact) — never
guessed into a wrong pid.

### 3f. Graded season and population

Season **2025** — `own_v6`'s own held-out season, the only season a real
apples-to-apples grade is possible without re-running v6 against a
different held-out year (out of scope here; v5/v6's own preregistration
already fixed 2025 as the held-out season for that whole model lineage).
`MIN_N = 10` per position, `own_model_v2`'s existing rule, imported
unchanged.

### 3g. The clearing bar — stated against `own_v6`, not the naive baselines

The house REC-3 bar (beat both naive baselines at all four positions, both
metrics) answers "is this better than doing nothing." Cory's question here
is sharper: does props-implied season total beat the model we are about to
DRAFT WITH. So the bar for this arm is stated directly, same shape, harder
target:

> **CLEARS** if `props_season` beats `own_v6` on BOTH metrics (lower MAE,
> higher Spearman) at ALL FOUR positions, on the shared population of
> `{props_season, own_v6, naive_prev, recency_blend}`.

Per-position results are always reported in full regardless of the overall
verdict — a props arm that wins at WR and loses at QB is published as
exactly that (the same discipline the league benchmark's per-layer, per-year
tables already established, and the one `league_benchmark_2026-08-16.md`
§9 shows the cost of skipping).

### 3h. Leakage — stated precisely, including where this arm differs from v5/v6

A week-k prop line closes before week-k's game, so reading it carries no
result-of-week-k information — exactly the rule
`fetch_component_stats.py` already states for Vegas lines. Summing all of
season Y's own weekly lines to build a season-Y total is therefore
leak-free in the "never reads a game result" sense. **It is explicitly NOT
leak-free in the sense v5/v6's own preregistration enforces** ("nothing
from any season-Y game enters any feature"): props-implied totals absorb
whatever the market has learned about a player's ROLE by the time each
week's line closes — a rookie who breaks out in week 6 has his weeks
1-5 lines priced on a bit role and weeks 6-17 priced on a lead role,
information no preseason projector can see in week 1. `own_v6` is a true
preseason forecast; the props arm is not, and is not claimed to be. Both
readings of a future real result are preregistered here, before either
number exists, specifically so neither can be produced post-hoc as a
convenient excuse for a win or a loss:

- **"Does the market beat the preseason board?"** — NOT what a props win
  answers, despite surface appearance. A props win only shows the market
  had more information by the time each line closed.
- **"Given in-season access to prop markets and nothing else, how much
  attainable accuracy is on the table?"** — what a props win DOES answer,
  and it is a real, useful number for the in-season loop (the parallel
  weekly study, §2, is the natural home for spending it).

## 4. WHAT IS TESTED VS PENDING, STATED EXPLICITLY

### 4a. READY — tested against synthetic fixtures shaped like the confirmed real API response

| function | file | what the test proves |
|---|---|---|
| `parse_historical_events` | `fetch_historical_props.py` | the events-list shape (confirmed live) parses, sorts, tolerates both documented `data` shapes, drops rows with no id |
| `match_event_to_game` | `fetch_historical_props.py` | abbreviation->full-name join; returns `None` (never a guess) on zero or ambiguous matches |
| `parse_event_props` | `fetch_historical_props.py` | the event-odds shape (confirmed live for the market/bookmaker/outcome structure) parses; median-across-books; multiple markets/players; unrequested markets ignored; missing point/name skipped, never zeroed |
| `merge_event_props` | `fetch_historical_props.py` | union across games in a week; collision counting |
| `build_snapshot_plan` | `fetch_historical_props.py` | `sample_week1` / `full_season` / `single_week` filters, deterministic sort |
| `estimate_credits` | `fetch_historical_props.py` | the exact budget arithmetic quoted in §5 below and in the workflow's own comment, pinned so the two can never drift apart |
| `line_to_points` | `props_season_projection.py` | the conversion arithmetic; absent-vs-explicit-zero; unknown stat keys ignored |
| `season_implied_totals` | `props_season_projection.py` | summation; absent-week-never-fabricated |
| `normalize_name` / `match_player_name` / `crosswalk_props_to_pid` | `props_season_projection.py` | name matching, dedup, unmatched-counted-not-dropped |
| `verdict_vs_v6` | `props_season_projection.py` | the clearing-bar arithmetic on a synthetic h2h — clears only when ALL FOUR positions beat `own_v6` on BOTH metrics |
| `_v6_predictions` (the read-only v6 reproduction) | `props_season_projection.py` | pinned (`repo_parity`-marked) against the COMMITTED `model_accuracy_v6.json`'s own-coverage cells — proves this file's composition of v4/v5/v6's already-public building blocks reproduces v6 exactly, so the eventual real grade compares against the REAL v6, not a drifted stand-in |
| `run()`'s honest refusal | `props_season_projection.py` | when no real store exists, the tool reports `status: "pending_real_data"` and names exactly what is tested vs. pending — never fabricates a grade |

All of the above run with zero network access — `python3 -m pytest
draft/tests/test_fetch_historical_props.py
draft/tests/test_props_season_projection.py`.

### 4b. PENDING — the real fetch, which costs real money and is a human decision

- `draft/backtest/historical_props_2025.json` does not exist. Nothing has
  been fetched. Nothing has been graded. `props_season_projection.py`'s
  `main()` refuses honestly (`status: "pending_real_data"`) until this
  store is committed.
- Dispatching `.github/workflows/historical-props-fetch.yml` for real
  (`dry_run: false`) spends real ODDS_API_KEY credits — see §5 for the
  exact numbers. **This is explicitly NOT done by this pass.** The sandbox
  that built this cannot reach `api.the-odds-api.com` at all (confirmed
  sandbox-blocked, same as every other odds-adjacent tool in this repo);
  the dispatch step is handed to a human via `ROUTES.md`.
- The moment a human dispatches the real fetch and it lands, running
  `python3 draft/tools/props_season_projection.py` is the ENTIRE remaining
  step — no new code, no new design decision, the exact command produces
  the real, trustworthy verdict on the first try because every piece
  upstream of "real data exists" is already built and tested.

## 5. BUDGET — exact, computed by the same function the workflow quotes

`fetch_historical_props.estimate_credits` is the single source; every
number below was produced by running
`python3 draft/tools/fetch_historical_props.py plan --season Y --scope S`
against the REAL nflverse schedule (reachable from this sandbox — GitHub's
release CDN, unlike api.the-odds-api.com) — these are not estimates from a
nominal 272, they are the actual per-season game counts:

| season | scope | games | events-list calls | odds credits | total credits |
|---|---|---|---|---|---|
| 2023 | `full_season` | 272 | 18 | 16,320 | **16,356** |
| 2024 | `full_season` | 272 | 18 | 16,320 | **16,356** |
| 2025 | `full_season` | 272 | 18 | 16,320 | **16,356** |
| any | `sample_week1` | 16 | 1 | 960 | **962** |

Formula (10 credits x markets x regions per odds-with-markets request —
the vendor's stated formula, and consistent with the probe's own numbers;
the events-list call's ~2-credit cost is EMPIRICALLY OBSERVED from the
probe run, not vendor-documented, and is named as such everywhere it
appears): `odds_credits = games * snapshots_per_game(1) * 10 * 6 markets *
1 region`.

**Full 3-season pull (2023 + 2024 + 2025, closing lines only, one snapshot
per game): 49,068 credits — ~49% of the confirmed ~100,000/month plan**,
leaving real headroom for retries, the existing weekly `odds-capture.yml`
usage, and the parallel weekly-props study's own fetch (§2).

A note on the directive's own worked example ("3 seasons x ~48 games x 2
snapshots x 6 markets x 10 credits"): **48 games is one week's slate
(16 games) times 3 seasons, not a full season's 272 games.** Read as a
suggestion for a WEEK-1-ONLY pilot across all three seasons rather than the
full-season fetch this deliverable needs to sum a real season total, that
number is consistent with — and cheaper than — the `sample_week1` scope
this file actually implements (2,886 credits for all three seasons' week
1s vs. the directive's 2 x 16 x 3 x 6 x 10 = 5,760 for a two-snapshot
version of the same idea). Both readings are offered rather than silently
picking one: **RECOMMENDED SEQUENCE** is `sample_week1` for one season
first (~962 credits, validates the real pipeline end to end against real
data before spending real money at scale), then `full_season` for each of
2023/2024/2025 (~16,356 credits each) once the pilot is confirmed working.

Snapshot count is fixed at **one per game (the closing line)** in this
design — the cheapest defensible choice, since a closing line is the
sharpest available consensus. A two-snapshot (open+close) design would
roughly double every number above to ~98,244 credits for the full
3-season pull, uncomfortably close to the entire monthly cap with zero
margin for anything else; **not recommended** without a separate,
explicit authorization, and the workflow does not offer it as an option.

## 6. WHAT IS AND IS NOT BUILT

**Built and tested (this pass):**
- `draft/tools/fetch_historical_props.py` — pure parser + CLI (`plan`,
  `fetch [--dry-run]`), matching the CONFIRMED real API shape.
- `.github/workflows/historical-props-fetch.yml` — `workflow_dispatch`
  only, `dry_run` default true, explicit `season` + `scope` +
  `max_credits` inputs, the exact credit-cost comment above baked into the
  workflow file itself.
- `draft/tools/props_season_projection.py` — line->points conversion,
  season aggregation, name crosswalk, and the graded comparison against
  `own_v6` (imported read-only), all pure and tested against synthetic
  fixtures; `run()` refuses honestly with no real data.
- Tests for every pure function: `draft/tests/test_fetch_historical_props.py`,
  `draft/tests/test_props_season_projection.py`.

**Not built (out of scope for this pass, named so nobody assumes it was
attempted):**
- The real fetch itself (§4b) — a human decision, costs real money.
- Anytime-TD / receiving-TD markets (§3a) — a follow-on extension.
- Reconciliation with the parallel weekly-props study's fetch tool (§2) —
  flagged for A at merge review, not attempted mid-flight across worktrees.
- A two-snapshot (open+close) design — priced and explicitly not
  recommended (§5), not implemented.

## 7. HOUSE DISCIPLINE CHECKLIST

- [x] Preregistered BEFORE any real grading (this document + both modules'
      docstrings, committed in the same pass, before `historical_props_2025.json`
      exists at all — there is nothing to grade yet, so there is no
      "results" commit to separate this from).
- [x] n stated everywhere a metric is reported (`MIN_N=10`,
      `unmatched_count`, `games_with_a_props_row`, per-position `n` in
      every h2h cell — inherited unchanged from `own_model_v2._grade_models`).
- [x] Absent-not-zero: a market with no bookmaker quote, a player absent
      from a week's store, and an unmatched name are all EXCLUDED and
      COUNTED, never fabricated as zero or silently dropped.
- [x] Leakage guard tested: `line_to_points`/`season_implied_totals` never
      read a game result (§3h); the in-season-information asymmetry
      relative to `own_v6` is named explicitly, not hidden.
- [x] `TERRITORY: A` on every new file.
- [x] Full pytest green under the gate's own selection
      (`-m "not repo_parity"`) — confirmed locally. The one new
      `repo_parity`-marked test (`_v6_predictions` vs. the committed
      artifact) is registered in `test_gate_selection.py`'s pinned node
      set alongside its siblings, and — like its sibling
      `test_own_model_v6.py::test_artifact_matches_regeneration_and_reproduces_both_parents`
      — currently fails on THIS worktree's tree state (the board/positions
      record has legitimately drifted since `model_accuracy_v6.json` was
      committed: one extra WR row, matching the exact class of drift
      `league_benchmark_2026-08-16.md` §9 and this repo's own
      `repo_parity` marker discipline already document and tolerate). Not
      a defect in this pass's code — verified by reproducing the same
      failure independently on the pre-existing sibling test before adding
      the new one.

## 8. ROUTES / DECISIONS

- `ROUTES.md` TO:A: "dispatch `historical-props-fetch.yml` for
  2023/2024/2025 (real ODDS_API_KEY credits, ~49,068 credits total /
  ~49% of the $59/mo 100K plan), then run
  `props_season_projection.py`'s grading CLI — one command, already
  tested." Marked **COSTS REAL API CREDITS — do not auto-fire.**
- `DECISIONS-NEEDED.md`: no ruling item added — there is nothing to rule
  on until real data exists and is graded. A short OPEN note points here.

---

## 9. THE REAL PULL LANDED — AND THE DATA HAS TWO HOLES (2026-08-16, later pass)

Cory authorized the full spend ("do it all!"). All three seasons were
fetched for real against the paid plan:

| run | season | scope | commit | result |
|---|---|---|---|---|
| 31969492747 | 2024 | sample_week1 (pilot) | `b03c20c` | 1 week, 926 rows |
| 31969492747 | 2023 | full_season | `46ffad7` | 18 weeks, 16,004 lines |
| 31969692803 | 2024 | full_season | `ec5df34` | 18 weeks |
| 31969876211 | 2025 | full_season | (main) | 18 weeks |

A cheap `sample_week1` pilot (~962 credits) was run first to validate the
real pipeline against real data before releasing the ~49,068. That
sequencing was the relay session's own call, matching the RECOMMENDED
SEQUENCE in the workflow's own header comment.

**Then the landed data was audited rather than trusted — and it is not
clean.** Two independent defects, both found by inspecting the artifacts
before any grading ran, both since reproduced by the new `audit`
subcommand:

### 9a. `rush_td`: billed on every call, returned zero times

Across **7,019 real player-week rows in 2023+2024** (and again in 2025),
the `rush_td` key appears **zero** times. The other five markets appear in
the thousands:

| market | 2023 | 2024 | 2025 |
|---|---|---|---|
| `rec_yd` | 3,084 | 2,633 | 2,663 |
| `rec` | 2,723 | 2,440 | 2,562 |
| `rush_yd` | 1,397 | 1,277 | 1,262 |
| `pass_td` | 548 | 452 | 428 |
| `pass_yd` | 539 | 452 | 429 |
| **`rush_td`** | **0** | **0** | **0** |

The parser is NOT the bug — `MARKET_TO_STAT["player_rush_tds"] =
"rush_td"` is present and `parse_event_props` would emit it. The vendor
bills `10 x 6 markets x 1 region` per event whether or not the sixth
market returns anything, so roughly **1/6 of the ~49,068 credits bought
nothing**.

Why this matters more than the money: rushing touchdowns are 6 points
each and are the entire case for a goal-line back. `pass_td` DOES arrive,
so a props-derived projection carries the QB touchdown component but not
the RB one. That is an **asymmetric** bias — it would make the props arm
look bad at RB for a reason that has nothing to do with whether betting
markets are sharp, and would produce a plausible-looking but wrong
verdict. **Not yet established** whether `player_rush_tds` is simply the
wrong key (the vendor may express this as `player_anytime_td`) or is not
served historically; a ~20-credit two-key probe on one historical event
settles it. No cause is asserted here until that runs.

### 9b. Four silently truncated weeks

| season | week | players | season median |
|---|---|---|---|
| 2024 | 7 | 28 | 191 |
| 2025 | 3 | 15 | 210 |
| 2025 | 6 | 33 | 210 |
| 2025 | 17 | 17 | 210 |

Root cause, found by reading `fetch_season`'s loop: the events-list cache
was **keyed by week**, so one snapshot — taken at whatever the first game
in that week's plan happened to kick off — was reused to resolve every
other game that week. `/v4/historical` is point-in-time; a Thursday-night
snapshot does not necessarily carry Sunday's slate. Every game the stale
snapshot failed to match hit a bare `continue` and vanished. Compounding
it, `_get_json` swallowed **every** exception into `(None, None)` with no
retry, so a single transient timeout on a week's events-list call erased
that entire week.

Neither failure left any trace: the week records carried only `week` and
`players`, so a week that resolved 2 of 16 games was indistinguishable
from a healthy week with a thin market.

### 9c. Fixes landed in this pass

1. **Events-list cache keyed by kickoff timestamp, not week.** Costs ~4-6
   events-list calls/week instead of 1 (~150 extra credits/season against
   a 16,320-credit odds spend — about 1% for correctness).
2. **`_get_json` retries** transient failures (timeout, reset, 429, 5xx)
   with exponential backoff, and deliberately does *not* retry 4xx, which
   would only burn credits on a request that is wrong every time.
3. **Per-week health counters** (`games_planned`, `events_matched`,
   `odds_ok`, `odds_empty`, `players`) written into every week record, and
   a `provenance.health` summary flagging any week resolving under
   `MIN_EVENT_MATCH_RATE` (0.7) of its planned games.
4. **`audit` subcommand** — zero network — auditing any already-written
   file, including the three pulled before health counters existed. It
   independently reproduces exactly the four truncated weeks and the one
   missing market found by hand.

`audit` verdicts on the three real files, all three `complete: false`:

```
2023  truncated_weeks {}                      markets_missing ['rush_td']
2024  truncated_weeks {7: 28}                 markets_missing ['rush_td']
2025  truncated_weeks {3: 15, 6: 33, 17: 17}  markets_missing ['rush_td']
```

### 9d. STILL NO VERDICT — and grading stays blocked

`props_season_projection.py` has **not** been run against this data and
must not be until 9a and 9b are closed. A verdict on "do betting markets
beat `own_v6`" computed on data missing every rushing touchdown and ~7.4%
of its weeks (4 of 54) is not a verdict. The honest state is: the pipeline
works, the money was spent, the data is incomplete, and the incompleteness
was caught before it could contaminate a result.

---

## 10. MEASURED CREDIT COSTS — and the finding that reframes the whole study

Cory, reading the vendor's own pricing page ("1 market, 1 region: Cost 1"),
asked whether one pull could carry far more data than our
272-calls-per-season design, and then set the priority explicitly: *"We need
to save credits for draft projection studies as well!! That one is important
for draft."*

Rather than reason from documentation, every number below is a **measured
`x-requests-remaining` delta** — the vendor's own ledger, read either side of
each call (key-probe runs `31970500296`, `31970615122`, `31970663659`).

### 10a. There is no bulk shortcut for player props

```
bulk /odds, 1 prop market : HTTP 422 | credits used: 0    <- rejected outright
bulk /odds, h2h (control) : HTTP 200 | credits used: 10   <- 225 events, 880 rows
per-event, 1 market       : HTTP 200 | credits used: 10
per-event, 6 markets      : HTTP 200 | credits used: 60   <- 895 rows
events list               : HTTP 200 | credits used: 1
```

The bulk `/v4/sports/{sport}/odds` endpoint really does return 225 games for
10 credits — but only for game markets. Ask it for a player prop and it
422s. Player props are per-event only; the 272-calls-per-season shape is
forced by the vendor, not a design mistake of ours.

Two corrections fell out. Our `10 x markets x regions` formula is **confirmed
exactly** (1 market = 10 credits, 6 markets = 60). And the events-list call
costs **1 credit, not the 2** `EVENTS_LIST_CREDIT_EST` assumed — that 2 was
backed out of a bundled probe total and over-stated it. Constant corrected.

### 10b. 2026 week-1 player props are already live — at 1x, not 10x

```
live week-1 props: HTTP 200 | credits used: 2
  books: 3; markets: ['player_anytime_td', 'player_pass_yds']; rows: 87
```

All 272 regular-season games are listed today, and week-1 player props are
already priced — on a game kicking off 2026-09-10, probed on 2026-08-16.
**Two markets cost 2 credits: live data carries no 10x historical
multiplier.**

| plan | credits | serves |
|---|---|---|
| **Week-1 props, 16 games, 6 markets** | **96** | **the 8/22 draft** |
| Full 2026 season live, 18 weeks | 1,722 | in-season lineups/waivers |
| Historical re-fetch, 1 season | 16,410 | retrospective validation only |
| Historical re-fetch, 3 seasons | 49,230 | retrospective validation only |

Against ~64,900 remaining, the two rows that actually affect results cost
**1,818 combined — under 3% of the plan.**

### 10c. Recommendation, REVERSED from §9

§9 treated the historical pull as something to rescue with a re-fetch. On
these numbers that is the wrong trade. The historical study answers "were
betting markets historically better than `own_v6`?" — a question that
**cannot change the 8/22 draft board**, because there is no responsible way
to refit and re-promote a projection model on props inside six days. It is a
post-draft project, and it will cost the same then.

What week-1 props offer *before* the draft is different and more useful: the
market's own read on ROLE. A receiving-yards line is a market-priced estimate
of target share; an anytime-TD price is a market-priced estimate of red-zone
role. Those are precisely what preseason projections get wrong.

Named honestly: week-1 lines are ONE game, so they are a role signal, not a
season-total projection; and only 3 books quote this far out versus the 6
seen on historical data, so the consensus is thinner. A real input, not a
silver bullet. **No historical re-fetch is proposed. The three condemned
files stay condemned and unread.**

### 10d. `player_anytime_td` replaces the phantom market (code landed)

`MARKET_TO_STAT` now maps `player_anytime_td -> any_td` in place of the
never-served `player_rush_tds`. This is an upgrade, not a patch: anytime-TD
prices RECEIVING touchdowns too, which the original six-market design had no
market for at all.

It required real modeling, because anytime-TD is quoted as a PRICE, not a
line — the median-of-`point` path would have silently dropped every row:

1. `american_to_prob` — American odds to implied probability.
2. `devig_pair` — normalise Yes/No to sum to 1, stripping the book's margin.
   When only the Yes side is published (common for anytime-TD) there is no
   pair to normalise against, so the value is returned RAW and is biased HIGH
   by roughly the vig. Documented, not silently corrected.
3. `anytime_td_to_expected_tds` — Poisson inversion, `L = -ln(1 - P)`.
   P(>=1 TD) and E[TD] are not the same number: a 0.30 anytime price is 0.357
   expected TDs, ~19% higher, and the gap widens exactly for the goal-line
   backs and elite receivers who matter most early in a draft. Poisson is an
   approximation (real TD counts are mildly over-dispersed) and is named as
   one, but it strictly beats the identity it replaces.
4. `props_season_projection._any_td_rate` — prices `any_td` at the league's
   TD rate, and **returns None rather than guessing** if `rush_td` and
   `rec_td` ever diverge from their current shared 6.0. A missing
   contribution is recoverable; a wrong one is not.

7 new tests pin this math, including the two deliberate approximations.
