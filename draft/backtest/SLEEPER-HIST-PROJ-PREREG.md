<!-- TERRITORY: A -->
# SLEEPER-HIST-PROJ — PRE-REGISTRATION

**Committed before the probe module exists, before the workflow exists, and
before anything is fetched from Sleeper.** Commit order is the proof.

## THE QUESTION

Cory, 2026-08-16: *"we still haven't answered why we're drafting are using
sleeper projections vs fantasy pros vs a blend of both..."*

The board's `proj_mean` is Sleeper-derived. FantasyPros and own_v6 attach as
display-only columns. The three have never been graded against each other,
and the blend attempt of 2026-08-16 refused at its constructibility gate
(`draft/audit/proj_mean_blend_2026-08-16.md`) on one claim:

> *"Sleeper's own historical skill remains structurally unmeasurable until
> Jan 2027."* — `draft/backtest/exp_fp_hist_proj.json`

**That claim has never been tested against the API.**
`draft/sleeper_import.py:139` — `fetch_projections(season, week="season")` — is
season-parameterized and probes three endpoint shapes. Nobody has asked it for
2023, 2024 or 2025. This preregistration fixes what will be asked and what each
possible answer means, *before* the asking.

## THE STRUCTURE — three steps, stop at the first that fails

**STEP 1 — FEASIBILITY.** Does Sleeper serve historical preseason projections
at all?

**STEP 2 — LEAKAGE.** If it serves something, is what comes back actually
PRESEASON, or a post-hoc revision (or a stat line) wearing a projection's name?

**STEP 3 — THE GRADE.** Only if 1 and 2 pass. **Step 3 is NOT preregistered by
this document.** It gets its own preregistration in its own commit, written
after step 2's verdict and before any three-way number exists. If step 1 or
step 2 refuses, step 3 is never written, and the refusal is the filed answer.

---

## STEP 1 — FEASIBILITY GATES

Called exactly as the repo already provides it, with no new endpoint shapes
invented for this probe:

    sleeper_import.fetch_projections(str(season))     # week="season"

for `season` in **2023, 2024, 2025**.

| gate | fires when | verdict |
|---|---|---|
| **F0 `no_fetch`** | every endpoint shape raised, or all returned an empty payload | nothing served |
| **F1 `no_rows`** | fewer than **50** rows returned | served, but not a projection set |
| **F2 `no_scored_rows`** | fewer than **50** rows score a **nonzero** total under the frozen scoring table | served rows carry no usable stat line |

`PROJ_ROWS_FLOOR = 50`, `SCORED_ROWS_FLOOR = 50` — the same floor
`EXP-FP-HIST-PROJ-PREREG.md` fixed for the same question about FantasyPros, so
the two probes are comparable.

**Scoring table:** `fetch_component_stats.frozen_scoring_table()` — the table
every committed weekly-points store was written under. Imported read-only. A
Sleeper projection row is scored with `scoring.score_stat_line`, the one scorer
in the repo. **Sleeper's own `pts_half_ppr` (or any provider-printed total) is
NEVER a graded number** — it encodes Sleeper's default league, not ours. It may
appear in the metadata census as a *count* and nowhere else.

**IF EVERY SEASON REFUSES AT STEP 1: STOP.** The `exp_fp_hist_proj` claim is
CONFIRMED rather than assumed, and that confirmation is the deliverable. No
step 2, no step 3, no grade.

### The 13g clause, stated before the run

**If Sleeper serves nothing, the instrument must be shown capable of showing
something.** The same `fetch_projections` call, against **2026** (the season the
board is built on, known to return a live projection set), runs in the same job
as a **positive control**. If the control returns nothing either, a null for
2023/24/25 is a fact about the probe, the runner or the proxy — **not about
Sleeper** — and the run is VOID rather than negative. Reported either way.

---

## STEP 2 — LEAKAGE GATES

**This is the crux and the bar is adversarial.** Sleeper's `regular/{season}`
projection endpoint is the same URL all season long; nothing about it promises
the numbers are the *preseason* ones. A projection revised in December and
graded against December's outcome is leakage, and it produces a spectacular,
worthless result.

Gates run in this fixed order on the graded season. **The first gate that fires
is the year's filed verdict, and NO accuracy number is reported for a refused
year** (the exp33/exp_fp_hist_proj rule, unchanged).

### The graded population, fixed here

For season `y`, a player is graded iff **all three** hold:

1. Sleeper's payload gives him a stat line that scores under the frozen table;
2. `component_stats_{y}.json` gives him a position in **QB/RB/WR/TE** (the
   modal position across his weeks);
3. `nflverse_weekly_points_{y}.json` carries **at least one** week-1..17 row
   for him.

**Absent is not zero.** A projected player with no position, or with no weekly
row at all, is **EXCLUDED AND COUNTED** — `excluded_no_position`,
`excluded_no_weekly_row` — never scored as 0. `MIN_N = 10` per position cell;
below that the cell is `unmeasurable`, not omitted.

### L1 — IDENTITY. Is it a stat line wearing a projection's name?

Over graded players with **realized ≥ 20.0 points** (so that a bench player's
0-vs-0 cannot manufacture a match), the fraction whose projection equals the
realized total within **0.5 points absolute**.

    IDENTITY_ABS = 0.5      IDENTITY_MIN_ACTUAL = 20.0      IDENTITY_FRAC_MAX = 0.05

> **fraction > 0.05 → `leaked_identity`.**

A genuine preseason forecast is essentially never within half a point of a
17-week total. **What the instrument would show if the thing were absent:** a
fraction at or near 0.00, which is what a clean year looks like.

### L2 — RANK CEILING. Is the ordering too good to be a forecast?

Spearman(projection, realized) per position, on the graded population.

> **ρ > 0.90 at WR or at RB → `leaked_rho`.**

    LEAK_RHO_MAX = 0.90     BINDING_POSITIONS = (WR, RB)

**Calibration, taken from this repo and fixed before the run.** FantasyPros'
genuine preseason numbers, graded under this same table on this same
population (`exp_fp_hist_proj.json`):

| year | QB | RB | WR | TE |
|---|---:|---:|---:|---:|
| 2023 | 0.8826 | 0.8710 | **0.9243** | 0.8971 |
| 2024 | 0.7927 | 0.7520 | 0.7917 | 0.7087 |
| 2025 | *(see artifact)* | | | |

**WR/RB are the binding arms and QB/TE are not**, deliberately: QB and TE are
shallow, top-heavy positions where a genuine forecast legitimately reaches the
high 0.8s, and 2023's WR 0.9243 is **already under suspicion in this repo for
exactly this reason** (`proj_mean_blend_2026-08-16.md` §1: *"a plausible
signature of a 2023 archive revised after the fact"*). QB/TE rho is reported
in full and gates nothing.

### L3 — PROVENANCE. Does the payload say when it was made?

A key census over the raw rows of every endpoint shape that returned data:
which keys exist, on how many rows, and — for low-cardinality keys only — the
distinct values with counts. **Counts and key names only. No payload, no row,
no player is ever printed.**

    TIMESTAMP_KEYS = (updated_at, last_modified, date, generated_at, created,
                      ts, week, season_type, category, company)

> **A generation/update timestamp at or after that season's week-1 kickoff
> (taken as `{y}-09-01T00:00:00Z`) → `leaked_timestamp`.**
> **A `week` marker that is a real in-season week number rather than a
> season/preseason marker → `leaked_timestamp`.**

> **NO timestamp key present at all → `no_timestamp`. This is UNDECIDABLE, not
> a pass, and it BLOCKS NOTHING** — the other gates decide. Recorded so a
> future reader does not mistake "the payload was silent" for "the payload
> said preseason." *Absence of evidence is entered as absence, not as a
> negative finding.*

### L4 — MARKERS. Does it still project a season that died?

Derived, not hand-picked, and **from the committed stores only** — no ADP
archive is needed, and none is retained per-player anyway:

- prior season `y-1` realized total **≥ 200.0** (he was a real fantasy asset);
- graded season `y` realized total **≤ 30.0** (his season died early or never
  started);
- position in QB/RB/WR/TE.

A genuine preseason file projects such a player at **full-season size**. A
post-hoc file already knows.

    MARKER_PRIOR_MIN = 200.0   MARKER_REALIZED_MAX = 30.0
    MARKER_FULL_SEASON_MIN = 100.0   MARKER_LEAK_MAX = 60.0

> any marker **missing from the payload** or scoring **< 60** → `leaked_markers`
> any marker in **[60, 100)** → `ambiguous_markers` (refuse — undecidable)
> **zero markers derivable** → `no_markers` (refuse — undecidable, not a pass)

2023's markers need a 2022 realized store. There is none in points form, so
2022 totals are built from `component_stats_2022.json` through
`fetch_component_stats.scored_weekly_points` under the **same frozen table** —
the store-parity path the repo already pins. If that build fails, 2023 files
`no_markers` and refuses; it does not silently skip the gate.

### L5 — GHOSTS. Was this file made from today's player database?

Projected, crosswalk-free (Sleeper pids throughout), players who recorded ≥ 1
week in season `y` but have **zero** rows in the 2025 store. A genuine archive
of an old season carries dozens of the since-departed; a file regenerated from
today's roster does not.

    GHOST_MIN = 10

> fewer than 10 → `regenerated` (refuse). **Not applicable to 2025 itself** —
> there is no later store to establish departure, and that is recorded as
> `not_applicable`, never as a pass.

### The step-2 decision rule, fixed

A season is **`clean`** only if L1, L2, L4 and L5 all pass (L3 `no_timestamp`
permitted, L3 `leaked_timestamp` refuses). Anything else is that gate's
refusal.

**IF 2025 COMES BACK LEAKED: STOP.** "Sleeper's published historical
projections are contaminated" is a real, publishable, question-closing finding,
and it is filed as the answer. **A leaked arm is not graded and its number is
not reported** — not in a footnote, not "for interest". Grading a leaked
forecast flatters it, and a flattering number about the source the board
already uses is the single most dangerous artifact this task could produce.

---

## WHAT THIS PROBE WILL NOT DO

- **Will not print any payload, row, player line or provider total.** Counts,
  key names, low-cardinality value histograms and aggregate metrics only.
- **Will not invent an endpoint shape.** It asks `fetch_projections` exactly as
  the repo already calls it. If a *different* URL would have served genuine
  preseason numbers, this probe cannot see it, and that limitation is stated
  in the verdict rather than hidden by a wider search.
- **Will not weaken, move or delete a threshold above after seeing a result.**
  A threshold that turns out to be wrong is recorded as wrong and the next
  preregistration writes a better one — the `proj_mean_blend` §4 rule.
- **Will not ship anything.** No model, board, `proj_mean`, VORP, dollar or
  ordering change comes out of this task under any outcome. A winner, if one
  is ever identified, becomes a `DECISIONS-NEEDED.md` item describing the
  prepared diff. Cory rules.

## PREDICTIONS, MADE BLIND

- **P1.** `/projections/nfl/regular/{season}` **serves something** for
  2023/24/25 — the path is season-parameterized and Sleeper's CDN does not
  usually 404 an old season. *(least confident of the three; it decides
  whether there is a step 2 at all)*
- **P2.** **What it serves is NOT preseason.** Sleeper serves projections as a
  live surface, not an archive; the same URL is what the app reads in week 12.
  I expect L1 or L2 to fire on 2025.
- **P3.** If anything survives to step 3, **Sleeper and FantasyPros land within
  noise of each other** and the blend does not beat the better single source —
  the ρ = 0.9327 / error-correlation 0.9439 regime already measured in
  `exp_proj_source.json` and `proj_mean_blend_2026-08-16.md` §5.

**A refusal at step 1 or step 2 is a SUCCESS of this task, not a failure of
it.** It converts a three-times-repeated assumption into a tested fact, and it
gives Cory a real reason instead of a hedge six days before the draft.
