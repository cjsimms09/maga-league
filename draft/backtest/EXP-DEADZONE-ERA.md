# The RB dead zone across three eras — real, but NOT universal (BBM IV/V/VI full-N)

_Source: `bbm_deadzone.json` (IV), `bbm_deadzone_v.json` (V), `bbm_deadzone_vi.json`
(VI), each streamed at full field (~100k–470k picks/cell) by `bbm-probe.yml`. This
is the current-era check on the exp25 dead zone — the finding that most shapes the
2026 draft, so it earns the strongest external data we can reach._

## Season-label premise (verify, do not assert)

BBM's canonical numbering: **IV = 2023, V = 2024, VI = 2025** NFL seasons. The GCS
path strings are storage labels (both V and VI live under a `2025_...` prefix), not
authoritative season tags. The shapes below are reported under the canonical
numbering; the cross-season *conclusion* does not depend on the exact year a given
curve is pinned to — it depends on the three curves being three distinct seasons,
which the differing player-level distributions confirm.

## RB mean best-ball points by round (full N)

| round | IV (2023) | V (2024) | VI (2025) |
|---|---|---|---|
| R1 | 166 | 144 | 222 |
| R2 | 123 | 201 | 187 |
| R3 | 138 | 183 | 150 |
| R4 | 137 | 95 | 143 |
| R5 | **80** | 158 | **81** |
| R6 | **63** | 166 | **79** |
| R7 | 109 | 141 | 73 |
| R8 | 106 | 80 | 76 |

## What holds and what breaks (reported honestly)

- **2 of 3 seasons (2023, 2025) show the mid-round RB collapse** the board line is
  built on — RB falls off a cliff at R5–6 and stays down. VI (2025), the most
  recent season, reproduces it cleanly (143 → 81/79/73).
- **2024 (V) BREAKS it.** RB was *strong* in R5–6 (158/166) and the anomaly is R1
  itself: R1 RB mean (144) sits **below** R2 (201). That is the elite-RB injury
  year (McCaffrey and other first-rounders lost most of the season), which depresses
  the R1 cell and flattens the mid-round penalty. It is a real season, and it does
  not show the dead zone.
- **The "WR holds" companion is era-dependent too.** In 2023 WR held ~130 through
  R6; in 2024–25 WR declines steadily from R1 (VI: 136→111→99→86→65). The
  mid-round WR *pocket* our value-pockets run found on OUR data (picks 51–70) is
  weaker in the recent BBM full field than in 2023.

## Implication for the board (tempering, not removing)

The dead-zone line shipped in `deviation.js` is an **informational, labeled prior**
(not a re-weighting), and it should stay — but its confidence is now correctly
**"robust tendency with a known exception,"** not a law. Two of three seasons
(including the most recent) back it; one strong recent season inverts it, driven by
RB injuries at the top. The honest read for 2026: **fading mid-round RB is a good
default, but it is a tendency an injury-scrambled year can flip — it is not a
guarantee, and it should never override a genuinely elite RB value on the board.**
A one-line honesty caveat is added to the board marker to say exactly that.

## Discipline notes

- Full N per cell (100k–470k), so within-season the means are precise; the
  cross-season *variation* is the finding, not noise.
- Nothing installs or re-weights from this — it only calibrates the confidence of
  an already-informational marker, downward from "the shape" to "a robust-but-
  breakable tendency."
