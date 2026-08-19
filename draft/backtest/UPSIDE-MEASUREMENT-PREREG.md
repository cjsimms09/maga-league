<!-- TERRITORY: A -->
# PREREGISTRATION — is there any UPSIDE signal our ceiling does not carry?

**Filed 2026-08-19 by A, BEFORE the study was built or run.** Ledger **P112**.
Grade-by **2026-08-26**.

Cory, 2026-08-19: *"upside late… how can we measure upside better?"*

---

## 1. Why the existing answer is suspect

Every late-upside conclusion this project holds — the barbell study's −1.49pp,
the endgame-ceiling grid that pulled the endgame ceiling from 1.4 down to 0.5,
P105's regret shape — was measured against `proj_ceiling`. And on today's board:

| `proj_ceiling_source` | players | player-specific? |
|---|---|---|
| `measured-2023-25-p90-x-player-cv` | 268 | **yes** |
| `measured-2023-25-p90` | 267 | no — per-(position,band) constant |
| `gaussian_z` | 74 | no — fallback |

**For 341 of 609 players the ceiling is a constant times the projection.** A
constant carries no information about which player booms. So *"acting on late
upside loses"* may be a true statement about a constant rather than about
upside — and the two are not the same finding.

## 2. What is already known, so this does not re-derive it

`weekly_volatility.json` (committed) establishes two things this study takes as
given rather than re-measuring:

- **Volatility persists.** Year-over-year Spearman on CV: **0.52 / 0.39 / 0.47**
  against a null band of ±0.13. It is forecastable.
- **Volatility varies WITHIN a projection band.** At mean 3–8, CV runs 0.63
  (p10) to 1.11 (p90) — a spread ratio of 1.78. Players our board prices
  identically are not equally volatile.

**So the question is NOT "does volatility exist or persist."** It is whether
there is an *asymmetry* signal — a right tail — that neither the mean nor the
CV already carries, because a symmetric spread measure cannot tell a boom
candidate from a bust candidate.

## 3. The three questions, in order

**Q-A — DESCRIPTIVE: is the right tail just `mean + k·sd` with one k?**
Compute `tail_z = (p90_week − mean) / sd` per player-season. If `tail_z` is
tight across players, every player has the same distribution shape, only
level and spread vary, and **our construct is already adequate** — the answer
to "measure upside better" would be "you cannot, and the ceiling column is
fine." If `tail_z` is widely spread, there is shape information nobody is using.

**Q-B — THE ONE THAT DECIDES IT: is the right tail PERSISTENT after
controlling for mean and CV?** Residualise `tail_z` on `mean` and `cv` within
season and position, then take the year-over-year Spearman of the residual
against the same permutation null `weekly_volatility.py` uses. **A signal here
is a real, forecastable upside dimension the board does not carry.** A null
means upside beyond level-and-spread is not predictable, and the late-upside
verdict stands for a better reason than it currently rests on.

**Q-C — DOES OUR SHIPPED CEILING CARRY ANY OF IT?** Correlate the board's
`proj_ceiling` (and `proj_ceiling / proj_mean`) against realised `p90_week`,
split by `proj_ceiling_source`. **Prediction stated as a check on my own
reasoning: the `-x-player-cv` rows should beat the band-constant rows, and if
they do NOT, then the 2026-08-17 dispersion fix did not do what it claims.**

## 4. Predictions, registered before the run

- **P112-a:** `tail_z` will be **widely spread**, not tight — interquartile
  range at least 0.30 — i.e. shape information exists.
- **P112-b:** the residual right tail will be a **NULL** — year-over-year
  Spearman inside the permutation null band. **This is the prediction I expect
  to be right and would most like to be wrong about.** Boom-week timing is the
  canonical unforecastable quantity; if it were forecastable at draft time
  somebody would already be selling it.
- **P112-c:** the `-x-player-cv` rows will correlate with realised `p90_week`
  **better** than the band-constant rows.

**AND THE DECISION RULE, FIXED NOW:**
- **b NULL** → the late-upside verdict is upheld on better evidence, and the
  honest answer to Cory is *"upside cannot be measured better from outcomes
  alone — the remaining hope is CROSS-SOURCE DISAGREEMENT, which is different
  information and is what the ffanalytics ingest is for."*
- **b SIGNAL** → a real per-player upside feature exists; it gets built,
  preregistered separately, and graded on the seat replay before it goes near
  the board. **A signal here does NOT license changing the ceiling weight.**
- **c FAILS** → register row against the 08-17 dispersion fix, because it
  would mean the player-CV rows are not better than the constant they replaced.

## 5. Population and mechanics

- Seasons **2021–2025**, committed `nflverse_weekly_points_*.json` only. No
  network, no new store.
- A player-season enters with **≥ 8 weeks with a stat row** and **mean ≥ 3.0** —
  the same floors `weekly_volatility.py` already uses, so this population is
  comparable with the persistence numbers quoted above rather than a new one.
- Weeks are **rows that exist**; an absent row is absence, not a zero. Scoring
  is ours, from the store's own fingerprint.
- Positions from `player_positions.json`; QB/RB/WR/TE only. K/DST are excluded
  and **that is a stated limit, not an oversight** — register 2e means their
  component coverage is still incomplete.

## 6. What this cannot say

- It measures **realised** upside, not **draftable** upside. Q-B is exactly the
  bridge between them and may well not hold.
- Five seasons is four year-over-year pairs. The permutation null is what
  keeps that honest.
- Survivorship: a player who busts out of the league leaves the population, so
  persistence is measured among survivors and is biased **toward** finding
  signal. Stated before the run, and it makes a NULL on Q-B stronger rather
  than weaker.
