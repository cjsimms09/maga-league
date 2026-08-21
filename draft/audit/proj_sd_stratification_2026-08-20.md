# The ceiling-tiebreak study pools three constructions of `proj_sd` into one borderline number — stratified, the story is clean

**D, 2026-08-20.** Answers relay's job (3) (ROUTES.md TO:D): *"`proj_sd` is three
constructions wearing one name (cross-source 308 · measured-error 287 ·
position_variance 105) and any pooled arm returns a null that means nothing.
De-mean by source × position first."* One note before the result: the "register
65" cited as the source of this technique is stale — the current register 65 is
an unrelated `--offline` build-overwrite finding, a casualty of this session's
repeated register-id renumbering. Not chased further; the technique itself
(stratify by `proj_sd_source` before pooling) is correct on its own merits.

**Short answer: found one live case, ran it stratified, and the pooled number
was hiding a real, clean result rather than an ambiguous one.**

## 1. Where to look

`draft/backtest/exp_tiebreak_signals.py` (`TERRITORY: A — research artifact, no
production reader`) computes, per position, a single pooled Spearman
correlation of `(proj_mean, proj_ceiling)` and a single pooled within-tier
pair-inversion rate, then applies a preregistered verdict rule: *"if <10% of
within-tier pairs can invert, the shipped tiebreak is mostly re-ranking by
projection and its 'upside' label overstates it; if variance is a per-position
constant, it is fully decorative."* The script's own docstring describes
`proj_ceiling = proj_mean + 1.036 * proj_sd` as if `proj_sd` were always one
thing — true when the script was written, no longer true since the multisource
blend and Draft Sharks attach shipped three different constructions under one
field name.

**Run today, pooled (no production reader, but a live, current result):**

| position | n | pair-inversion % |
|---|---|---|
| QB | 79 | 7.33 |
| RB | 137 | 7.44 |
| WR | 207 | 10.59 |
| TE | 117 | 3.55 |

Three of four positions sit just under the study's own 10% "meaningful"
threshold — an ambiguous, borderline result, which is exactly the shape a
pooled arm produces when it isn't a null at all, just three different signals
averaged into one.

## 2. Stratified by `proj_sd_source`

Same population, same pair-inversion computation, split by which construction
produced each player's `proj_sd`:

| position | cross-source-disagreement | measured-2023-25-error | position_variance |
|---|---|---|---|
| QB | **21.66%** (n=39) | 2.55% (n=37) | 0.0% (n=3, too few pairs to matter) |
| RB | **42.17%** (n=61) | 4.26% (n=76) | — (0 players) |
| WR | **32.50%** (n=103) | 3.74% (n=103) | — (n=1, no pairs) |
| TE | **31.25%** (n=46) | 1.19% (n=71) | — (0 players) |

**The pooled numbers were averaging three genuinely different results, not one
ambiguous one.** For the 308 players whose `proj_sd` comes from real
cross-source analyst disagreement, ceiling reorders 22-42% of within-tier
pairs — well clear of the study's own 10% bar, in all four positions. For the
287 players on measured historical error, it reorders 1-4% — close to
decorative. For `position_variance` (a flat per-position constant), inversion
is exactly 0% wherever there are enough players to test it, which is the
mechanically expected result: a constant multiplier preserves rank order by
construction, so ceiling can never disagree with mean within that stratum.

## 3. What this means

**The shipped ceiling tiebreak is doing real, substantial work for the 44% of
the board with cross-source dispersion data, and is closer to decorative for
the rest.** That is a materially different, more interesting, and more
actionable finding than "borderline, roughly 10% either way" — and it was
invisible in the pooled number specifically because the three strata's true
values (0%, ~3%, ~30%) bracket the 10% threshold from both sides, so pooling
them lands near the boundary by coincidence of mix, not because the underlying
signal is actually ambiguous.

**Nothing ships from this.** `exp_tiebreak_signals.py` has no production
reader — its own header says so — so no live decision currently rests on the
pooled or stratified number. The value here is the demonstration: this is
exactly the failure mode job (3) warned about, found on the first live
candidate checked, with a clean before/after.

## 4. Rule 3g

**(1) Implies another failure?** Any other study reading `proj_sd` (or
anything derived from it — `proj_ceiling`, `proj_floor`) without checking
`proj_sd_source` first is at risk of the same masking. The earlier search
(§1) checked six other files touching `proj_sd` with a correlation/pooling
shape; only this one computes a live pooled statistic on the current mixed
board — `dispersion_baseline_grade.py` (register 126) already stratifies
correctly, and the rest are either historical-construction docstrings or
operate on a different (realized-outcome) quantity entirely.

**(2) Invalidates?** Nothing currently trusted — the file has no production
reader, and no register/ledger entry has quoted its pooled numbers as a
finding.

**(3) Routed:** relay, who asked; **A** cc'd as file owner, since re-running the
script with stratified output (or adding a `by_source` breakdown alongside the
pooled one) is a one-file change if this is worth keeping current.

## Method, for reproduction

```
python3 draft/backtest/exp_tiebreak_signals.py   # pooled numbers, as shipped
```
The stratified table above splits the same population by `p["proj_sd_source"]`
before running the identical pair-inversion computation — no new data, no
external fetch, reproducible from the committed `public/draft_data.json`.
