# LATE-ROUND PRECISION — what the engine's tie bands claim vs what three seasons could measure — 2026-08-17

**TERRITORY: A · REPORT ONLY. Nothing in this document changes behaviour.**
The proposal at the end is config-gated OFF and ships nowhere without A+Cory.

## 0. Why this exists

`empirical_draft_value_2026-08-16.md` §5/§7/§10 measured, three seasons out of
three: **rounds 1–6 are the draft** (~55 points per pick over rounds 7–15),
and **within rounds 7–15 no round separates from any other** — nine rounds
interchangeable in expectation, with a median positional-cell 95% interval of
**79.0 season points**, wider than almost any difference anyone would act on.
Cory's standing mandate is that measured findings live in the model, not in
memory. This one touches DECISION behaviour (how confidently the war room
speaks late), so per the bake rules it is REPORTED with a prepared proposal
rather than baked.

## 1. What the engine currently claims, in its own units

`engine.js` CFG (composite pts; `value` weight is 1.0, so one composite point
≈ one season point of VORP at the dominant term):

| constant | value | what it asserts |
|---|---|---|
| `TIE_THRESHOLD` | 2.0 | gaps under 2.0 are a tie (`contested`) |
| `COIN_FLIP_GAP` | 1.0 | confidence "coin-flip" under 1.0 |
| `CLOSE_GAP` | 3.5 | ≥ 3.5 renders **LOCK** — "clearly ahead" |
| `PATHS_BAND` | 4.0 | the band the board admits it cannot resolve |

These constants are **round-blind**: a 3.5-point gap prints LOCK at pick 12
and at pick 140 alike.

## 2. The measurement (committed board, 2026-08-17, ADP-ordered pool)

Successive candidate gaps in `vorp` (the value term's own currency) and the
REC-1 **measured** projection-error sd, by ADP band:

| band | n | median successive gap | mean | median measured `proj_sd` |
|---|---|---|---|---|
| R1–3 (picks 1–30, keeper rounds) | 30 | 2.50 | 3.92 | 91.6 |
| R4–6 (31–60) | 29 | 1.10 | 2.24 | 76.5 |
| R7–10 (61–100) | 37 | 1.45 | 2.31 | 77.7 |
| R11–15 (101–150) | 49 | 1.77 | 3.85 | 64.2 |

Across R7–15 (86 successive pairs): **66 (76.7%) sit inside the 2.0 tie band**,
76 inside `PATHS_BAND` 4.0, and 10 are ≥ 4.0.

## 3. The verdict of the comparison

**The engine is already honest about most late picks** — three out of four
adjacent late-round pairs are inside `TIE_THRESHOLD`, so the chip correctly
reads TOSS-UP and (once the prepared tie-break patch lands) prints the one
measured lean instead of false confidence. The tie machinery did not need this
study to call the modal late pick a coin flip.

**Where the claim and the measurement part company is the residual quarter.**
When a late gap is 3.5–30 composite points the ladder renders LEAN or LOCK —
but the measured error sd of a single late player is **64–78 season points**,
and the study's cell intervals (median width 79.0) plus the flat R7–15
expectation say realized outcomes cannot ratify a separation of that size:
a LOCK at pick 120 asserts a distinction at roughly **5% of one player's own
measured error sd**, in a region where three seasons of outcomes found no
round-level structure at all. The chip's words ("clearly ahead") encode
early-round precision the late board does not have. Note the asymmetry with
§2's R1–3 row: early gaps are *larger* AND the study's band separations there
are CI-clear (74.4% vs 51.1% starter rate, non-overlapping) — the round-blind
constants are approximately right early and only overclaim late.

## 4. The proposal — widened late-round tie bands, config-gated OFF

One gate in `league_config.json` (same reversibility pattern as
`opportunity_cap` / `use_measured_ceiling`): e.g. `late_tie_bands: false`.
When ON, from round 7 of the live draft the confidence ladder's thresholds
(`TIE_THRESHOLD`, `COIN_FLIP_GAP`, `CLOSE_GAP`) scale by a single multiplier
derived from the measured error (for instance anchored to the ratio of the
band's median measured `proj_sd` to the early bands', capped; the exact form
is for the prereg, not this page). Effect: late chips degrade toward
TOSS-UP/LEAN, which (a) matches §3's measurement and (b) gives the ONE
measured tie-breaker — the trajectory lean, ruled applied 2026-08-17 — more
surface exactly where the board cannot separate names.

**Not shipped, and the bar for shipping is stated now:** paired-room sim +
the 2023–25 replay harness must show the widened bands are FREE (no
CI-clear loss in $ or weekly points) before the flag defaults on; a chip that
says TOSS-UP more often changes what Cory reads at the table, so the flip is
his and A's, not a lane's. Until then the constants stand exactly as shipped.

## 5. Suites

No behaviour change → no new behavioural test. The measurement above is
reproducible from the committed board artifact (`public/draft_data.json`) and
this page's numbers; the tie-band constants quoted are pinned where they live
(`engine.js` CFG, exercised by `ui_fidelity_verdict.test.js`'s gap-axis
sweeps).
