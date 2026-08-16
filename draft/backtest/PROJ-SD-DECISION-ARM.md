# Does `proj_sd` running low actually change a pick?

**TERRITORY: A.** Answers C's `proj_sd` finding
(`draft/backtest/PROJECTION-ERROR.md`) with a decision arm rather than an
argument. When first written, nothing here was wired and production was
unchanged. **DISPOSITION CHANGED 2026-08-15 — see the addendum at the bottom:
Cory's ruling landed ("We need to fix!!!"), the arm was RE-RUN on the fresh
86e42bc2 board and reproduced exactly, and REC-1 is now applied in
`projections.blend()`.**

## The question, and why it needed answering rather than acting on

C measured that the board's `proj_sd` runs **~1.28× below** what 2023–2025
actually did — 17 of 20 cells below, and still 1.28× in the 14 cells where the
walk-forward model behind the calibration was itself well calibrated, so the
confound explains 1.40 → 1.28 and no further. Three cells run the other way.
The measurement is careful and I am not re-arguing it.

C explicitly did **not** ask for a change: *"recalibrating `player_variance` is
not mechanical and not mine."* Right on both counts. But "we know a parameter is
off and we are not touching it" is only a defensible position once somebody has
measured **what it costs**, and nobody had.

`proj_sd` is not decorative. It reaches `draft_plan.js` through

```
optionValue(mu, sd, K) = (mu − K)·Φ((mu−K)/sd) + sd·φ((mu−K)/sd)
```

which prices every bench seat, and the seat solver weighs those against starter
value across all twelve picks. So the question has a crisp form:

> **Under the most aggressive defensible version of C's finding, does the plan
> for Cory's twelve picks change?**

## Method

Run `draft/tools/draft_plan.js` unmodified, twice, in an isolated copy of the
tree (`tar`-cloned to scratch; the repo is never written). Between runs, only
`proj_sd` / `weekly_sd` / `variance` on the board change.

Three arms, in increasing severity:

| arm | what it does |
|---|---|
| **uniform** | every `proj_sd` × 1.28 — C's headline number |
| **per-cell** | C's band ratios, including the three that run the *other* way |
| **measured** | `proj_sd := proj_mean × C's measured band sd`, used directly |

The **measured** arm is the one that matters. It is not a multiplier I invented;
it is C's own table applied as-is — and C states it is an **upper bound**,
because the walk-forward model's error inflates the observed spread. *If the plan
is stable under the upper bound it is stable under anything milder.*

**Control:** each arm asserts the board actually changed (530 rows differ under
the measured arm). An early version of this arm silently failed to modify the
board and printed a clean "IDENTICAL" — a perfect result produced by doing
nothing, which is exactly the shape this file exists to avoid claiming.

## Result

**Roles are identical at all twelve seats in every arm.** The plan never wants a
different *position* at any pick.

Players, under the **measured upper bound**:

| seat | role | baseline | measured-sd arm |
|---|---|---|---|
| 33 | TE | Colston Loveland | *unchanged* |
| 48 | FLEX | D'Andre Swift | *unchanged* |
| 53 | WR | Mike Evans | *unchanged* |
| 68 | bench | Rhamondre Stevenson | **Tony Pollard** |
| 73 | QB | Dak Prescott | *unchanged* |
| 88 | bench | Jayden Reed | **Courtland Sutton** |
| 93 | bench | Brock Purdy | **Jordan Love** |
| 108 | DEF | Los Angeles Rams | *unchanged* |
| 113 | K | Brandon Aubrey | *unchanged* |
| 128 | bench | Hunter Henry | *unchanged* |
| 133 | bench | Chris Rodriguez | *unchanged* |
| 148 | bench | Jayden Higgins | **Khalil Shakir** |

**Four of twelve seats change player. All four are bench seats. Zero starter
seats move, and no seat changes role.**

Under the **uniform 1.28×** arm, *nothing* changes at all — every seat keeps its
role, its player, and only bench *values* rise (total 1241.6 → 1252.0, +0.8%),
because option value grows with dispersion.

## 1.37× and 1.28× are the same finding, counted two ways

`proj_sd_arm.test.js` re-derives the gap from the live board and prints
**1.37×** (n=526). C's headline is **1.28×**. They do not disagree and neither
is wrong — they answer different questions:

- **1.28× is a median over 20 CELLS**, in the 14 where the walk-forward model
  was itself well calibrated. Each cell counts once, whether it holds 9 players
  or 403.
- **1.37× is a median over PLAYERS** — every board row with a `pos_rank`,
  weighted equally. The deep `33+` bands hold most of the players and most of
  the gap, so a per-player median sits higher by construction.

Recording it because a number that looks like a contradiction becomes one. It
is the same shape as C's `adp_sd` "94.8% of the board on two values", where the
denominator (the whole 1,841-row pool vs the draftable board) was what made the
figure mean something different than it appeared to.

Neither number changes the conclusion below: the arm was run at C's **measured
per-band dispersion**, which is more aggressive than either median.

## What this licenses, and what it does not

**It licenses leaving `player_variance` alone before 2026-08-22.** The entire
decision footprint of a parameter that is genuinely ~28% low is four bench
players, under a bound its own author calls generous. Recalibrating
`POSITION_VARIANCE` and nine modifiers eight days out would touch survival,
VONA, ceiling, floor and the upside term simultaneously — a large blast radius
bought for four backups.

**It does not say the finding is wrong or unimportant.** It is real, it is on
the record before the draft rather than after, and it is exactly the kind of
thing to fix in the September rebuild when a bad week costs a waiver claim
rather than a roster.

**One artifact worth knowing about if this is revisited.** In the per-cell arm,
the single seat that flipped did so at a *band boundary*: Purdy is QB rank 6
(×1.28) and Love is QB rank 17 (×2.45), so Love's dispersion nearly doubled
relative to Purdy's across a one-rank step. On option value at 2.45× Purdy still
leads Love 101.2 to 79.5 — the flip rode the discontinuity, not the magnitude.
**Any real recalibration should be smooth in rank**, or it will manufacture
exactly this kind of artifact at every band edge.

## Reproduce

```
node draft/tools/draft_plan.js                    # baseline
# then apply C's measured band sd to a COPY of public/draft_data.json and re-run
```

Guarded by `draft/tests/proj_sd_arm.test.js`, which re-derives the claim rather
than pinning the table above — a decision arm whose numbers are remembered
instead of recomputed is a screenshot, not evidence.

---

## ADDENDUM 2026-08-15 — the ruling landed, the arm was re-run, REC-1 is applied

Cory's ruling on the learning-loop audit, verbatim: **"We need to fix!!!"** That
is the ruling REC-1 (`draft/data/model_update_recommendations.json`) was
waiting on. But the table above was measured on the 08-13 board, and the 08-15
rebuild (`86e42bc2`, 677 players, first `proj_ownmodel` publish) moved the
board underneath it — so the arm was RE-RUN on the fresh board before anything
was wired, same protocol (isolated tree, `draft_plan.js` unmodified, C's
measured band table applied to a copy, control asserting 455/527 rows actually
moved).

**Result: identical to the original measurement.** Roles unchanged at all
twelve seats; zero starter seats move; the same four bench seats flip to the
same four players (68 Stevenson→Pollard, 88 Reed→Sutton, 93 Purdy→Love,
148 Higgins→Shakir); total value 1242.1 → 1261.7 (+1.6%, option value grows
with dispersion). The application condition held, so:

**WIRED:** `projections.blend()` now computes `proj_sd` via
`projection_error.proj_sd_for(cal, position, rank, mean)` — C's calibration
appliers finally have their production caller — with the `POSITION_VARIANCE`
path as fallback for every unmeasured cell (K, DEF, unranked). Each board row
declares which path priced it in `proj_sd_source`, `variance` is re-derived
from the applied sd so `proj_sd == proj_mean × variance` keeps holding, and
`variance_why` names the measured band. The board ships the measured table on
its next rebuild.

What the next rebuild does to a handful of named players (mean unchanged):

| player | pos rk | sd old→new | ceiling old→new | floor old→new |
|---|---|---|---|---|
| Josh Allen | QB1 | 89→111 | 498→520 | 345→331 |
| Jahmyr Gibbs | RB1 | 117→170 | 466→521 | 266→231 |
| Puka Nacua | WR1 | 84→69 | 385→369 | 241→251 |
| Jordan Love | QB17 | 71→185 | 396→514 | 275→198 |
| Tony Pollard | RB24 | 61→103 | 231→275 | 127→98 |

Nacua TIGHTENS — WR|1-3 is one of C's three cells that run the other way,
carried as measured. Love is the streaming-range QB case the uncertainty audit
named (ships ~70 against measured 145-185). The band-boundary caveat above
(smooth-in-rank) still stands and rides with REC-1's record; the banded table
is what was measured, so the banded table is what ships.
