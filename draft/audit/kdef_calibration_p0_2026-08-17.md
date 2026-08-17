# P0 — K/DEF calibration cells: the ask cannot be executed, and the reason is better news than that

_TERRITORY: D — data stewardship. Written 2026-08-17. **Keeper lock is 08-20.**_

A's order: *"extend the calibration to K/DEF from the same 2023-25 stores that
graded the skill positions, same leave-one-season-out method, honest
unmeasurable-cell refusals where the data is too thin."*

**Those stores contain zero K and zero DEF.** So the ask as written has no input.
But the reason splits the problem cleanly, and one half is cheap:

- **K is a DROP-IN.** The data is in the file we already fetch, with an exact
  one-to-one mapping to our scoring table. **We filter it out ourselves, with no
  recorded reason.**
- **DEF is a BUILD.** No team-defense rows exist in the player file at all. It
  needs a team-level construction that does not exist today.

**Recommendation: K is recoverable before 08-20 if C moves today. DEF is not, so
A's exclusion default should stand for DEF regardless.**

---

## 1. THE PREMISE, VERIFIED FIRST

Five of six rows this lane worked today had a premise that did not hold, so:

| claim | verified |
|---|---|
| the calibration carries zero K/DEF cells | ✅ **20 cells = 4 positions × 5 bands.** None are K or DEF |
| *"nobody wrote down that they were not measured"* | ✅ **`cells_unmeasurable: 0`.** They were not measured-and-refused; they were **never in the universe** |
| the board prices K/DEF anyway | ✅ **44 K + 32 DEF, every one with a non-null `proj_ceiling`** |
| on a different construction | ✅ **all 76 carry `proj_ceiling_source: "gaussian_z"`**; skill positions carry `measured-2023-25-p90` |

**The board already stamps the truth and nothing reads it.** `proj_ceiling_source`
correctly marks all 76 rows as the unmeasured Gaussian construction — that is
register row 8b (`playerDollars` reads the field, not the stamp). **The
information needed to refuse them honestly exists today and is unused.**

## 2. WHY THE CELLS ARE MISSING — it is not the calibration's fault

`projection_error.py` has **no position filter.** It fits whatever the bundles
carry. The gap is upstream, in the graded stores:

| season | scored ids | K | DEF |
|---|---|---|---|
| 2023 | 586 | **0** | **0** |
| 2024 | 603 | **0** | **0** |
| 2025 | 585 | **1** | **0** |

DEF units are keyed by team abbreviation in Sleeper; the 2024 store contains
**zero non-numeric ids**, so no defence unit is present at all.

**And our scoring table prices both.** 44 keys, including `fgm_0_19`,
`fgm_20_29`, `fgm_30_39`, `fgm_40_49`, `fgm_50p`, `fgmiss`, `xpm`, `xpmiss`,
`sack`, `def_td`, `def_st_td`, `def_pr_td`, `def_kr_td`, `def_st_fum_rec`.

**So the league scores K and DEF, the board ranks 76 of them, and nothing has
ever graded one.**

## 3. THE ROOT CAUSE IS ONE LINE, AND IT IS OURS

`draft/backtest/fetch_component_stats.py:104`

```python
POSITION_GROUPS = ("QB", "RB", "WR", "TE")
```

applied at `:213` — `df = df[df["position_group"].isin(POSITION_GROUPS)]`.

**There is no comment giving a reason.** Kickers sit in `position_group ==
"SPEC"`, so that line drops them wholesale.

This is the routes-2025 defect exactly — *a gap of ours filed as a gap of
theirs* — except here it was never filed at all.

## 4. WHAT THE SOURCE ACTUALLY SERVES — probed 2026-08-17

Response codes from attempts made today, per the lane's standard:

| URL | code |
|---|---|
| `…/stats_player/stats_player_week_2024.parquet` (**the file we already fetch**) | **200** |
| `…/stats_team/stats_team_week_2024.parquet` | **200** |
| `…/pbp/play_by_play_2024.parquet` | **200** |
| `…/stats_player/stats_player_kicking_week_2024.parquet` | 404 (no such asset) |

Schema probe of the file we already fetch (downloaded to scratch, read, deleted —
no store written): **18,983 rows, 2024.** `position` counts include **K: 569
rows, 43 distinct kickers, weeks 1-22.**

### The mapping is one-to-one. Every one of our eight kicker keys has a column.

| our scoring key | pts | source column | non-null K rows |
|---|---|---|---|
| `fgm_0_19` | 3.0 | `fg_made_0_19` | 569 |
| `fgm_20_29` | 3.0 | `fg_made_20_29` | 569 |
| `fgm_30_39` | 3.0 | `fg_made_30_39` | 569 |
| `fgm_40_49` | 3.0 | `fg_made_40_49` | 569 |
| `fgm_50p` | 5.0 | `fg_made_50_59` **+ `fg_made_60_`** | 569 |
| `fgmiss` | 0.0 | `fg_missed` | 569 |
| `xpm` | 1.0 | `pat_made` | 569 |
| `xpmiss` | −1.0 | `pat_missed` | 569 |

> ⚠️ **The one trap, and it is silent.** `fgm_50p` must absorb **both**
> `fg_made_50_59` **and** `fg_made_60_`. The source splits them; our table does
> not. Mapping `fgm_50p = fg_made_50_59` alone drops every 60-yard field goal —
> a small, plausible, undetectable understatement of exactly the kickers whose
> value is upside.

### DEF is a different problem

The player file carries individual defenders (`DB` 4,165, `DL` 3,268, `LB`
3,110), **not team defence units**. DST fantasy scoring needs team-level
aggregation — sacks, interceptions, fumble recoveries, return TDs and points
allowed, per team-week. `stats_team_week` (200) or pbp can support it, but it is
a construction that does not exist, not a filter to relax.

## 5. WHAT I RECOMMEND, AND THE HONEST DEADLINE

**K — recoverable before 08-20, but not by me.** Fetching is C's lane
(`fetch_*.py`). Parked in `ROUTES.md` → TO: C with the exact column mapping and
the 60-yard trap called out. Once the store carries K, the calibration re-run is
mechanical and this lane can do it same-day: `projection_error.py` needs no
change, because it never filtered positions.

**DEF — not recoverable by 08-20, and I will not pretend otherwise.** A
team-defence construction, validated, graded and calibrated in three days, five
days before a draft, is exactly the "new instrument, measured once, late" the
brief warns against.

**NO INTERIM HAIRCUT ANYWHERE.** A's order says a guessed discount is fitting,
and I agree — with an addition: **the honest refusal is already available for
free.** Every K/DEF row is stamped `proj_ceiling_source: "gaussian_z"`. A
consumer that reads the stamp instead of the field can exclude them today,
without inventing a number. That is register 8b, and it is the cheapest correct
action available before keeper lock.

## 6. WHAT THIS DOES NOT COVER

- **I did not fetch or build anything.** The parquet probe was read and deleted;
  no store was written, no calibration re-run.
- **No claim about what the K cells will say once measured.** They may well come
  back thin and honestly `unmeasurable` at `MIN_N = 8` per band — 43 kickers
  across 5 bands is not many. **That is a legitimate outcome and it is still
  strictly better than the current state**, because "measured and refused" and
  "never asked" are different objects, and only one of them is what the board is
  doing now.
- **The survivorship caveat carries over.** The calibration's own `caveat` says
  every band is optimistic by an unmeasured amount; K/DEF cells would inherit it.

## 7. THE TEST

`draft/tests/test_calibration_covers_every_board_position.py` — **red today,
deliberately**, marked `repo_parity` so it can never block a board publish.

Every position the board prices must either have a measured calibration cell or
be declared, in the calibration artifact, as not measured **with a reason**.
`cells_unmeasurable: 0` beside 76 priced-but-ungraded players is the
absent-vs-zero defect at the artifact level: the file reports that nothing was
unmeasurable, which is true only because K and DEF were never asked.

**Known-positive control:** the same detector must find the four positions that
*are* calibrated, so a pass can never mean "the checker found nothing to check".
