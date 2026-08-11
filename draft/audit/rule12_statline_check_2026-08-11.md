# Rule 12, the check the sample could not do: projections against the source stat line

**Date:** 2026-08-11 · **Sample:** the same 11 players, from the selectors
predeclared in `rule12_sample.json` before any value was computed, re-evaluated
against the shipped board rather than carried forward as a name list ·
**Result: 11/11 exact, and one defect found in the eleventh.**

## Why this was still open

The 17:17 run verified seven transformations, and **every one of them starts at
`proj_baseline`.** T1 proved `proj_mean = proj_baseline × (1 + opportunity_adj)`
exactly — and would have proved it just as exactly if `proj_baseline` were
nonsense. That is the difference between *consistently derived* and *correct*,
and it is the whole of Cory's question.

`proj_baseline = score_stat_line(provider_stats, scoring)`. Checking it needs the
provider's stat line, which Sleeper serves and which is 403 from this sandbox. A
workflow fetched the raw rows and **deliberately did not score them** — the
conversion is the thing under audit, so the file that fetches the inputs must not
produce the answer.

## The independent arithmetic

Not `score_stat_line`. Not `projections.py`. `sum(stat[k] × scoring[k])` over the
keys both carry, written fresh, then compared. Term by term for the three most
load-bearing:

**Jahmyr Gibbs — the number Cory named.**

| stat | value | × | points |
|---|---|---|---|
| rush_yd | 1251 | 0.1 | 125.100 |
| rush_td | 12 | 6.0 | 72.000 |
| rec_yd | 533 | 0.1 | 53.300 |
| rec | 63 | 0.5 | 31.500 |
| rec_td | 3 | 6.0 | 18.000 |
| rush_2pt | 1 | 2.0 | 2.000 |
| fum_lost | 1 | −2.0 | −2.000 |
| | | **total** | **299.90** |

`proj_baseline` says **299.9**. Then `299.90 × (1 + 0.1500) = 344.88`, and the
board's `proj_mean` is **344.88**. Then `344.88 − 188.53` (the RB replacement,
itself re-derived in the 17:17 run) `= 156.35`, and the board's `vorp` is
**156.35**. **Gibbs at 156.3 is correct**, from the projected stat line forward.

**Josh Allen.** `pass_yd 3650 × 0.04 = 146.000`, `pass_td 27 × 6 = 162.000`,
`pass_int 10 × −2 = −20.000`, `rush_yd 535 × 0.1 = 53.500`, `rush_td 11 × 6 =
66.000`, `rush_2pt 1 × 2 = 2.000`, `pass_2pt 1 × 2 = 2.000`, `fum_lost 3 × −2 =
−6.000`. Total **405.50**, `opportunity_adj` 0.0000, replacement 341.72 →
**63.78**. Board agrees on all three.

**All eleven**, to the cent: Aubrey 107.00, Bowers 202.50, Skattebo 187.50,
Gibbs 299.90, Allen 405.50, Jacobs 186.10, Rams 114.00, Burden 173.00, Nacua
259.00, Odunze 173.90, Lawrence 343.42.

## THE DEFECT — the eleventh value, and it is C's alias class again

The Los Angeles Rams projection row carries **`def_fum_td: 2.0`**. The league
scoring table has **no such key**. It has `def_td: 6.0` and `fum_rec_td: 6.0`,
and neither appears in any sampled row.

`score_stat_line` iterates the SCORING keys and skips any the stat line does not
carry. So `def_td` is skipped, and **two projected defensive fumble-return
touchdowns score zero.** That is 12 points.

| | value |
|---|---|
| Rams `proj_baseline` as shipped | 114.00 |
| with `def_fum_td` scored at 6 | 126.00 |
| Rams `vorp` as shipped | 15.00 |
| with the correction, before replacement moves | 27.00 |

This is **structurally identical to the defect C found in `pass_int`**: the
provider renamed a stat, the scorer skipped a key it could not find, and the loss
was silent because skipping is correct behaviour for a genuinely optional bonus.
Different vocabulary — Sleeper projections rather than nflreadpy weekly — same
shape, and it landed on the position nobody looks at closely.

**AND THE FIX HAS THE SAME TRAP C HIT.** Our table carries `def_td` *and*
`fum_rec_td`, both at 6.0. Mapping `def_fum_td` to both would score 12 per
touchdown — turning a silent undercount into a silent overcount, which is worse.
And if the provider also emits `def_int_td` for other teams, that is a genuine
COMPONENT of `def_td` and must accumulate, while the fumble alias must not. That
distinction is the whole content of C's fix and it applies here unchanged.

**Not fixed here, deliberately.** Correcting it moves every defense's projection,
which moves the DEF replacement level, which moves every DEF `vorp` — a board
change eleven days out, on the strength of one sampled row. Rule 12's scope rule
says document value eleven rather than sweeping the surrounding system. So it is
documented with its arithmetic and its trap, and the decision is Cory's.

## An observation, NOT a finding

The Rams row carries only `pts_allow_0: 1.0` of the seven points-allowed buckets,
and `gp: 1.0` beside season-scale counting stats (52 sacks, 15 interceptions).
Our table pays `pts_allow_1_6` 7, `pts_allow_7_13` 4 and `pts_allow_14_20` 1, and
none of those buckets appears at all. Whether that is a provider convention, a
partial row, or a second gap **cannot be determined from one defense**, and
guessing from one row is what the scope rule forbids. Recorded so it is not lost.

## What this does not cover

Eleven players on one board. The check is *provider stat line → our scoring →
`proj_baseline`*; it says nothing about whether the provider's stat line is a
good projection, which is a forecasting question and not an arithmetic one. Layer
2 and 3 survival, the mask, and the zero-weighted terms remain as bounded in the
17:17 result.
