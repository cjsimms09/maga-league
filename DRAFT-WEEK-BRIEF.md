# DRAFT-WEEK BRIEF — read this first (written 2026-08-17, draft is 2026-08-22)

**Supersedes `MONDAY-BRIEF.md` as the entry point.** That file is still accurate
about 08-15/16 and is not deleted; this one covers 08-17, which changed the
model's foundations rather than its features.

**Who wrote this:** the research-relay session, branch
`claude/fantasy-football-research-926y6z`.

**Cory's order for the day, verbatim:** *"Above all!! Fix the data problem and
make sure we don't have other mistakes in our info!!"*

---

## 1. THE ONE THING TO UNDERSTAND

Every dispersion field on the board — `proj_ceiling`, `proj_floor`, `proj_sd`,
`weekly_sd` — was `proj_mean x (a per-band constant)`. Spearman **1.0000**
against the projection inside a cell: **exactly zero player-specific
information.**

That single fact caused three separate conclusions we had believed:

- the composite `ceiling` weight measured collinear with `value` and was zeroed
- the phase grid could only discover that double-counting the projection hurts —
  and that null was written up as *"upside late is REFUTED"*
- the variance modifiers came back unmeasurable

**One cause, three "findings".** Most of 08-17 was fixing that and re-running
what it invalidated.

## 2. WHAT IS FIXED

| | |
|---|---|
| **production ceiling/floor** | measured p90/p10 per (position, band), replacing a Gaussian over the mean |
| **the BACKTEST HARNESS** | `build_bundle.py` wrote `1.35 x mean` / `0.25 x mean` as GLOBAL constants — every weight experiment ever run on a bundle was collinear. Now measured, leave-one-season-out, absent off an unmeasured cell |
| **the money proxy** | `cory_conditional` hardcoded keeper `weekly_sd = 8.0`; real values are 17.63 / 25.81 / 32.46. Understated team weekly sd by 11.1%, **biased toward the conclusion it was being used to draw** |
| **snap counts** | 35,869 skill player-weeks pulled, 2021-25, weekly job, registry-gated |
| **playoff-SOS artifact** | regenerated (my board rebuild had added 5 rows it predated) |

## 3. WHAT IS NEW AND MATTERS MOST

**`draft/backtest/weekly_volatility.py` — the per-player upside signal exists,
and the data was committed here the whole time.** `nflverse_variance.py` was
written to measure it and was never run and never consumed.

Realized weekly volatility (`cv = sd/mean`, our scoring), 2023-25:

- within a fixed mean band, cv spreads **1.57x-1.88x** (a `mean x constant`
  field has none)
- year-over-year persistence **rho +0.482 and +0.605**, both clearing a 400-draw
  permutation null; control (mean carryover) +0.740 / +0.781

**Volatility persists at ~two thirds the strength of scoring LEVEL.** Compare
snap-share volatility at +0.19, pulled the same day.

**Its boundary is sharp and non-random.** 131 of 157 draftable players have it.
Of the 26 without, only 8 are rookies — **the rest are veterans who missed 2025**
(Nabers ADP 32, Garrett Wilson 45, Daniels 59, Evans 62). Any wiring that fills
a gap with a positional mean hands the steadiest reading to the injury-return
group. **Absent must stay absent.**

## 4. FOR CORY, BEFORE AND ON DRAFT DAY

**One decision is waiting on him** — `draft/audit/adp_sd_ratchet_fired_2026-08-17.md`.
The shipped ADP-sd rule is 1.39x FFC's published dispersion in the 50-100 band.
**Our constant did not drift** (reproduces to 0.1%); the market tightened. Blast
radius inside his 160 picks is **one player**. Both easy fixes were refused on
the file's own doctrine. **Recommendation: leave it, revisit post-season.**

**One action on draft day** — re-take the pre-draft freeze AFTER the final board
build. `draft/data/pre_draft_freeze_2026.json` is from 08-14 and is missing
**fourteen** declared fields. It is NOT the draft board (the war room boots from
live `draft_data.json`), it is the record 2027 grades against.
```
rm draft/data/pre_draft_freeze_2026.json    # by hand; the module refuses to overwrite
python3 draft/freeze_pre_draft.py
git commit                                   # say why
```

**His rookie-WR question is answered** —
`draft/audit/rookie_wr_upside_for_draft_day_2026-08-17.md`. Concepcion (NFL rd1
pk24) and Allen (NFL rd5 pk176) are 152 draft picks apart. Tail rate (150+ pt
season) by capital: rd1 **53.3%**, rd2 25.0%, rd3 0.0%, rd4-7 **1.8%**. His
instinct on Concepcion is supported; Allen is a different bet entirely.

**"Upside late" lost a fourth time** — and this run corrected a bias that ran in
its favour first (endgame ceiling 0.0 best, **+64.33** CI [+35.67, +94.17]; the
keeper-variance fix moved the headline $1.17). That refutes a BLANKET tilt, not
a targeted swing on an identified player — do not let the two be conflated.

## 5. THE GATES THAT NOW EXIST (and what they do NOT cover)

- `constant_multiple_sweep.py` — finds fields that are a rescaled copy of
  another, WITHIN (position, band) cells. Carries a known-positive control and
  **refuses to print a report if the control does not fire**.
- `test_freeze_not_stale.py` — every field the freeze DECLARES must appear in
  the artifact. Self-maintaining: reads `PLAYER_FIELDS`, not a copy.
- `weight_provenance.test.js` — re-aimed; now fails if a synthetic dispersion
  constant is REINTRODUCED to `build_bundle.py`.

**Honest limit:** of the four real defects found on 08-17, only two were caught
by machinery, and one of those was machinery written the same day. The gates
cover the shapes we know about. The rest are still found by reading.

## 6. THE SWEEP IS CLOSED

*"What else is calculated off a constant when it shouldn't be"* — answered on all
four surfaces: production board (dispersion family only, gated), harness
(fixed), study code (one real bug), **live draft JS + `src/`: clean** (every hit
is `|| 0` or a sort comparator; the one non-zero constant, `games_expected || 15`,
never fires — the field is on all 682 rows).

Four things checked and CLEARED are recorded in `TODO.md` so nobody
re-investigates them: the `CFG.WEEKLY_SD` metadata fields, the `weekly_sd or 6.0`
pool fallbacks, `source_weight_prior`'s sign flip, and Pearsall's zero projection
(he is on IR).

## 7. WHAT IS STILL OPEN, IN ORDER

1. **Wire realized weekly volatility** — top post-draft item, above snap share
   (which measures a weaker proxy for the same thing). Needs a prereg.
2. **Re-derive the composite `ceiling` weight** — the harness is honest now, so
   the experiment is RUNNABLE for the first time. Needs a CI bundle rebuild.
   Prereg exists: `HARNESS-DISPERSION-PREREG.md`.
3. **The `need` study** — preregistered (`NEED-WEIGHT-PREREG.md`). Cheaper than
   it looks: `live_context.js:126` already accepts a weights override, so it is a
   `--need-weight` axis on `archetype_rooms.js`, not new machinery.
4. **Routes-run** — the next per-player opportunity feed after snap share.
5. Studies resting on the `risk` term (PARTIAL on backtest boards).

**Nothing in 1-5 ships before 08-22.** A weight measured once, late, is a worse
instrument than a known one.

---

**Suites at hand-off:** Python publication gate (what CI runs) **3,271 passed,
7 deselected**; JS **309/309**. The deselected `repo_parity` set includes two
deliberate red flags — the ADP-sd ratchet and the stale freeze — which are
evidence awaiting a human, not broken builds.
