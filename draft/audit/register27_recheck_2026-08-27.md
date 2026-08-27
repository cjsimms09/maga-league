# REGISTER 27 RECHECK — "re-examine every study whose stated limit is sample size"

**E, 2026-08-27.** Register 27's next action, verbatim: *"Re-examine every study
whose stated limit is sample size. The blend, the adjuster fit and the
survivorship bound all cite n as the binding constraint."* Recheck was 08-26.
Reproduce everything here with `python3 draft/audit/register27_season_limit_probe.py`
(report-only, five controls, exits 1 if any control fails).

## THE ANSWER IN ONE LINE

**The limit is REAL for anything that needs THIS LEAGUE's own lineups —
`league_history.json` carries 2023-2026 and nothing earlier, so n=3 is a hard
floor. It is FALSE for player-outcome studies, which have had n=5 on disk since
2026-08-17. Two of the three named studies are the second kind, and both are
still coded to the smaller number.**

## CONTROLS (Rule 3e/3f)

| id | control | result |
|---|---|---|
| K1 | nflverse must reproduce `league_history`'s own player-week points where both exist | **5,826 shared player-weeks, 21 disagree, 99.64% exact** |
| K2 | a wrong-season pairing must FAIL K1's test | 2023-league vs 2024-nflverse: **0.30% exact** |
| K3 | my replicated adjuster loop must reproduce the COMMITTED 2024 **per pick** | **identical, 8 market / 4 value_only / 2 unreachable** |
| K4 | the accuracy harness graded twice must agree exactly | PASS |
| K5 | grading a season with no store must RAISE | PASS (`FileNotFoundError`) |

K1's 21 disagreements are characterised, not waved through: **12 of 21 are
exactly −2.0** (a fumble-lost shape) and the rest are TD-shaped. K3 is the one
that matters — without reproducing a season the module already scored, the 2023
number below would be worthless.

## STUDY 1 — THE ADJUSTER FIT. Limit real as coded, and liftable.

`exp_inverse_adjuster.py` says in its own docstring: *"VALUE = our walk_forward
projection from strictly-prior production. **Needs a prior season, so 2024 and
2025 only; 2023 is MARKET-only and says so.**"* The committed artifact repeats
it as a caveat.

It is true **as coded** — `prior = MG.season_of(hist, '2022')` is `None`, so
`proj = {}`. It is false as a statement about the data: the prior season's
production is `nflverse_weekly_points_2022.json`, on disk since 08-17, in this
league's scoring (K1).

The consequence is not cosmetic. `value_order` sorts on `proj.get(pid, -1)`, so
with `proj` empty **every** player is tied at the bottom and no pick can ever be
classified `value_only` — all fifteen 2023 picks fall to `market` or
`unreachable_marketonly`.

| | market | value_only | unreachable |
|---|---|---|---|
| 2023 as committed | 5 | **0** | 10 |
| 2023 with the 2022 store | 5 | **6** | 4 |

**10 of 15 picks reclassify.** Whole study: `value_only` **4 of 26 value-signal
picks → 10 of 41** (or 9 of 41 on matched nflverse priors throughout).

**CONFOUND TESTED, and it cuts against the easy story.** The 2023 signal is
built from 589 players and 2024/25's from ~250, so the gain could be coverage
rather than season. Re-running 2024 and 2025 on nflverse priors too:
**2024 `value_only` 4 → 3, 2025 0 → 0.** Wider coverage does not help either
season. The 2023 gain is the season, not the pool.

**⚠️ WHAT THIS DOES NOT DO, STATED PLAINLY: it does not change the study's
conclusion.** The unreachable rate is **30.8% committed → 29.3%** with 2023
scored properly. The verdict — *"a VALUE ANCHOR AT ~BEST-AVAILABLE; the knobs
that earn are value + best-available"* — is unchanged and now rests on 41 picks
instead of 26. And the season concentration (2023 40% vs 11.5% pooled) is
**Fisher p = 0.053 and does not clear** — reported as a description, not a
finding.

## STUDY 2 — THE SURVIVORSHIP BOUND. A FIFTH LIVE INSTANCE of register 27's claim.

`model_accuracy_backtest.py`, lines 20-22, produces the population the
survivorship bound study grades:

> **"2025 is the ONLY graded season: it is the only one whose two prior seasons
> are both on committed stores (2023+2024)."**

That is register 27's exact false sentence, in a fifth file. The row already
tracks four (`SLEEPER-VS-FP-PREREG.md`, `sleeper_vs_fp_grade.py`,
`sleeper_vs_fp_grade_2026-08-16.md`, `DECISIONS-NEEDED.md`). **This one is the
module that actually runs.**

`_store(season)` and `season_totals(season)` are fully season-general. The only
things binding the study to one season are two constants —
`GRADED_SEASON = 2025`, `PRIOR_SEASONS = (2023, 2024)`.

Patched in memory (never on disk), **both extra seasons grade cleanly**:

| graded | priors | naive_prev QB/RB/WR/TE | recency_blend | walk_forward | excluded |
|---|---|---|---|---|---|
| 2023 | 2021+2022 | 92.98 / 48.97 / 35.61 / 25.41 | 88.16 / 48.13 / 34.39 / 25.62 | 118.89 / 62.69 / 48.20 / 35.21 | 18.8% · 24.7% |
| 2024 | 2022+2023 | 81.36 / 43.78 / 41.03 / 27.23 | 72.60 / 43.79 / 40.31 / 26.33 | 118.56 / 53.99 / 47.23 / 31.82 | 21.0% · 28.9% |
| 2025 | 2023+2024 | 79.29 / 40.81 / 35.24 / 25.90 | 74.34 / 40.35 / 34.46 / 23.32 | 109.05 / 57.90 / 47.95 / 35.48 | 18.5% · 27.8% |

**THE PAYOFF IS A REPLICATION THE PROJECT HAS BEEN LEAVING ON THE TABLE:
`recency_blend` is the best model in 10 of 12 position-seasons.** At n=1 the
artifact can only ever say 4 of 4, which is unfalsifiable by construction.

The survivorship exclusion rate — the quantity the bound study exists to size —
is **24.7% / 28.9% / 27.8%** for `walk_forward` across three seasons. The
prereg's *"nearly a quarter"* survives and is now n=3 rather than n=1.

## STUDY 3 — THE BLEND. Its stated limit is NOT season count, and it is right.

`BLEND-SEARCH-DESIGN.md` says *"a season is ~17 weeks … they are **not** 8,500
independent observations — the same players, the same teams, the same offenses
recur every week."* **That is within-season autocorrelation, a different axis
from season count, and register 27 does not touch it.** The blend's stated limit
stands as written.

Season count is a separate constraint on the blend, and it splits by arm:

| Tier-1 arm | seasons on disk |
|---|---|
| usage (`component_stats`) · air yards/EPA (`advanced_stats`) · routes · snaps · pace | **n=5** (2021-2025) |
| vegas | **n=6** (2021-2026) |
| props · expert ranks | **n=3** (2023-2025) |

Five of seven arms can be fit on five seasons. Props and expert ranks cannot,
and any preregistered blend mixing them inherits n=3.

## WHAT I AM NOT CLAIMING

Nothing here changes a number Cory drafts or starts on. No study's conclusion
reverses. Two harnesses are coded to a smaller n than their data supports, and
one sentence is false in a fifth place.

## FOLLOW-UP QUESTIONS (Rule 3g)

1. **Does this imply another failure we have not looked for?** Yes — the pattern
   is *a constant pinned to what was on disk the day it was written*. Every
   `SEASONS = [...]` / `GRADED_SEASON` literal in `draft/backtest/` is a
   candidate. Filed as register 382's next action.
2. **Does it invalidate something we already trust?** No conclusion. It weakens
   the *evidential basis we claimed* for two: the adjuster's "8 unreachable"
   was 26 picks not 41, and the model ranking was n=1 where n=3 was available.
3. **Is it routed to a lane that can act?** Both are A/C code changes — E does
   not edit them. Registers 382 and 383, routed.

## AND ONE THING I FOUND ON THE WAY, WHICH IS ITS OWN ROW (383)

The committed `model_accuracy_2025.json` no longer reproduces: it was committed
**08-17 07:31**, the stores it grades were rebuilt playoff-free **08-18 03:58**,
and it has never been regenerated. **That is correctly detected** —
`check_artifact_freshness.py` reports it STALE, informationally and
non-blocking, exactly as designed. The mechanism works.

**What does not work is the REASON it prints.** 79 leaves actually differ.
The tool reports **5**, all inside `head_to_head_shared_population`, and names
**none** of the 52 that are in `models` — every headline MAE cell. `diff_paths`
takes `limit=5` at *collection* time and walks depth-first over **sorted** keys,
so `head_to_head_shared_population` (h) exhausts the budget before `models` (m)
is ever visited. **`--verbose` cannot help: its help text promises "print every
differing leaf, not just the first 3" and it is structurally incapable of
showing more than 5**, because the cap is applied before verbosity is consulted.

An operator reads *"QB spearman 0.709 → 0.7091"* and concludes cosmetic drift.
The truth is that all 12 primary MAE cells moved, the largest by **−6.6%**
(`naive_prev` WR 37.72 → 35.24), and the population moved with them
(`walk_forward` forecasts 737 → 693).

**Not inflated: the study's conclusion is intact.** Model rank order is
identical at all four positions (`recency_blend` < `naive_prev` <
`walk_forward`). This is a reporting defect, not a wrong answer — but it is a
reporting defect in the one instrument the project built to notice staleness,
and it under-reports in exactly the direction that makes staleness look
harmless.
