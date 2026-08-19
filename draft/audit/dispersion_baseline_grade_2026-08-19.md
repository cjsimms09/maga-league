# The band-constant baseline, graded — and it turns out there is a third live arm too

**Answers:** ROUTES.md, A → D, 2026-08-19, recheck 08-21 — *"THE CROSS-SOURCE
DISPERSION IS NOW ON THE BOARD AND NOTHING GRADES IT... grade the incumbent
first... that half is constructible today with zero new data."*

**It is constructible today, and the "incumbent" the ask names is not the only
thing already live.** `public/draft_data.json` (built 2026-08-19T08:52:22Z) is
not choosing between the fitted band constant and a future cross-source arm —
it is running **three** dispersion mechanisms simultaneously right now, keyed
by `proj_sd_source`:

| arm | n players | what it is | fit on outcome data? |
|---|---|---|---|
| `cross-source-disagreement` | 308 | spread across CBS/ESPN/FFToday/Sleeper's **2026** projections | no |
| `measured-2023-25-error` | 287 | `projection_error.py`'s fitted (position, band) constant | **yes — this exact realized data** |
| `position_variance` | 105 | hand-set Gaussian fallback for unmeasurable bands | no |

That three-way split is a natural experiment sitting on disk, not a
hypothetical the next rebuild creates. Graded here against
`realized_variance_store.json` (827 players, 2023-2025 measured weekly
volatility, C's committed store) via a new, reproducible, tested module:
`draft/backtest/dispersion_baseline_grade.py`, run against the exact committed
files (`python3 draft/backtest/dispersion_baseline_grade.py`).

## The asymmetry, stated up front

`measured-2023-25-error` was **fit on exactly the outcome data it is graded
against here** — `regenerate()` pools all of 2023-2025 with
`exclude_season=None` (projection_error.py's own docstring: *"this is the
PRODUCTION calibration... not a leave-one-out skill test"*). Its grade below
is **in-sample** and an upper bound, not an honest skill estimate.
`cross-source-disagreement` was fit on **neither** weekly volatility nor any
2023-2025 outcome — it is same-season provider disagreement on 2026 numbers —
so its grade is a genuine out-of-sample test. Read the two side by side, not
either alone.

## Two different questions, both graded

**LEVEL** — does the arm's weekly_sd magnitude match realized weekly
volatility (`ratio_board_over_realized`, board ÷ realized)?

**SHAPE** — within an arm, does a player predicted *more* volatile than his
positional peers actually turn out more volatile (Spearman rank correlation
of board CV vs realized CV, `weekly_sd / proj_mean` against `weekly_sd /
mean_points` — scale-free so positions pool honestly)? A level bias is a
correctable constant; a shape correlation near zero means the arm carries
**no per-player information at all**, which a scalar cannot fix.

## Results (n = 429 players graded; K/DEF and 105 `position_variance`
rookies/UDFAs excluded — see Limits)

| arm | n | ratio (board ÷ realized) | shape (CV Spearman ρ) |
|---|---|---|---|
| `cross-source-disagreement` | 225 | **3.44×** (too high) | **+0.22** |
| `measured-2023-25-error` | 204 | 0.84× (close — in-sample) | **−0.12** |

By position (ratio / ρ):

| | QB | RB | TE | WR |
|---|---|---|---|---|
| cross-source | 4.21× / 0.16 | 3.97× / **0.36** | 2.78× / 0.21 | 2.88× / **0.37** |
| measured-error | 0.58× / −0.30 | 1.05× / 0.02 | 0.77× / −0.03 | 0.90× / −0.13 |

## What this means

**The fitted band constant gets the level right (as it must — it was fit on
this data) and carries essentially zero per-player shape signal.**
`player_spread_in_sd` is **off** in `league_config.json`, so
`measured-2023-25-error`'s `weekly_sd` is architecturally `proj_mean × a
constant that is identical for every player in the same (position, band)
cell` — the near-zero (and slightly negative) ρ is the **expected, correct**
readout of a flat constant, not a surprise. It is a control, not a finding:
this module's own test suite (`test_dispersion_baseline_grade.py`) asserts
exactly this — a flat constant must not show strong rank correlation — so the
measured −0.12 validates the pipeline rather than being a bug in it.

**The cross-source arm, despite never seeing this outcome data, has real
(weak-to-moderate) positive shape signal** — 0.16 to 0.37 depending on
position, strongest at RB and WR. It substantially overstates the level
(2.8×–4.2×), which is a **correctable scale problem** (the same 2026-08-14
finding that the pre-REC-1 mechanism ran ~2.2× hot generalizes here, worse,
to the cross-source arm specifically — see Follow-up below), but a scale
problem is fixable with a multiplier; a shape correlation of zero is not
fixable with a multiplier.

**So "does cross-source spread beat the fitted band constant" does not have
one answer — it has two, and they point opposite ways.** On LEVEL, no: the
band constant wins by construction, because it was shown the answer.
On SHAPE — which is the dimension that actually matters for "who is the safer
floor play at this price," since a drafter comparing two similarly-priced
players needs to know which is *more* volatile than the other, not whether
the model's average is centered — the never-trained cross-source arm beats a
flat constant that, by the config as shipped, cannot distinguish players
within a band at all.

## Follow-up (rule 3g)

1. **Does this invalidate something we already trust?** Yes, partially — it
   supersedes the orphaned 2026-08-14 `projection_spread_vs_realized.json`
   (median ratio 2.21×, `player_variance`-only mechanism), which predates
   both REC-1's band-constant wiring (08-17) and the cross-source arm
   shipping entirely, and was never routed into ROUTES.md, DEFECT-REGISTER.md
   or PREDICTION-LEDGER.md (checked: zero hits in all three) despite its own
   commit message calling it "measurement only... routed rather than fixed."
   That is a finding that went nowhere for five days — an orphan, the exact
   failure rule 3g exists to catch, not something Cory or A ever ruled on.
2. **Does this imply another failure we have not looked for?** The 105
   `position_variance` players are unmeasurable here by construction — every
   one checked is a deep rookie/UDFA absent from `realized_variance_store`
   entirely (no 2023-2025 NFL history to have). That is not a defect, but it
   means roughly 15% of the board's dispersion numbers (the deepest, riskiest
   fliers — exactly where a drafter most wants a real volatility read) sit
   fully outside what any current instrument can grade.
3. **Is this routed to the lane that can act?** `proj_sd`/`proj_ceiling`/
   `proj_floor` are A's field (`draft/projections.py`), `cross-source-
   disagreement`'s construction is `multisource_blend.py` (routed A→A
   territory per the 08-19 mean-of-4 dispatch). Routed below, not fixed here.

## Recommendation (not applied — measurement only)

The scale correction the cross-source arm needs (÷3.44 pooled, or the
per-position ratio) is a one-line multiplier and cheap to apply if Cory rules
it should ship. Turning on `player_spread_in_sd` would give
`measured-2023-25-error` real per-player differentiation for the first time
— untested here, filed as a prediction below rather than assumed to help,
since "add player-specific signal" was exactly the reasoning that motivated
this measurement and deserves its own grade, not an assumption.

## Limits

- Weekly volatility only, not the season-total estimation error
  `sd_ratio` was originally fit to predict — `projection_error.py`'s own
  docstring names these different risks; `realized_variance_store.py`'s own
  docstring chose weekly volatility as the target anyway, deliberately, per
  the routing order that commissioned it, and this module follows that same
  operationalization rather than re-litigating it.
- `status: imputed` seasons are excluded, not averaged in.
- K/DEF are outside this board's three-arm split (their own calibration
  path) and are not graded here.
- 271 of 700 board players have no matching realized-store entry (mostly
  rookies/UDFAs/no 2023-2025 history) and are silently absent from every
  row above — an honest absence, not a fabricated zero, but it means this
  grade is conditional on having reached the NFL by 2023.

Reproduce: `python3 draft/backtest/dispersion_baseline_grade.py`. Tests:
`python3 -m pytest draft/tests/test_dispersion_baseline_grade.py -q`.
