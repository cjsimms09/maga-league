# VEGAS TEAM-LEVEL ARM — PREREGISTRATION (committed before the arm exists)

_TERRITORY: D. Register 18's recorded trigger. Written 2026-08-17._

## Why

The `+0.23 weekly MAE` stamped on `vegas_lines_2021_2026.json` as *"context every
Vegas feature must be read against"* came from a **game-total** oracle handed to
**both teams** — 208/208 games share one multiplier (register 18). It bounds a
team-blind channel, not the team-level implied total this store exists to
provide. Register 18's Q2 — did the input survive the join to player-week rows —
**has no answer**, because `exp_weekly_env` records no join counter for any arm.

**This arm answers both.** No egress: player→team comes from `component_stats_*`,
outcomes from `nflverse_weekly_points_*`, lines from the Vegas store.

## Construction

- `implied(team, week)` = `total/2 + spread/2` for home, `total − implied_home`
  for away. **The store's own formula**, not a new one.
- `m = implied(team, week) / league mean implied that week`.
- `proj = prior running mean × (1 + λ(m − 1))`, the same shape `exp_weekly_env`
  used, so the two are comparable.
- **λ ∈ {0.15, 0.25, 0.35, 0.50, 1.00}.** The original ran only {1.0, 0.5} and
  **0.5 — the grid MINIMUM — won**, so its optimum was never bracketed.
- Seasons **2023, 2024**; eval weeks 5–18; a player needs ≥3 prior appearances
  and a prior mean ≥5.0 (`exp_weekly_env`'s declared eligibility, reused).
- **These are REAL CLOSING LINES, not an oracle.** Strictly available before the
  game. Bounded above by a true team-level oracle, which this does not run.

## THE COUNTER IS THE POINT

**Every fold reports rows eligible, rows that found a team-week line, and the
survival rate.** A ΔMAE over an unknown surviving population is not a finding —
that is register 18's whole lesson, and this arm exists partly to supply the
number its predecessor omitted.

**ABSENT STAYS ABSENT.** A player-week with no line is excluded from the arm's
own population, never given `m = 1.0` — the silent-neutral default is exactly
what made the original unanswerable.

## Calibration — declared now

- **Expect |ΔMAE| < 0.3.** A real line is weaker than perfect foresight but
  better aimed than a game total; the net is genuinely unknown, which is why
  this is worth running.
- **Above +0.5 is a leak report**, not a result — check the line is not
  post-game.
- **A negative ΔMAE is a legitimate outcome** and would say the multiplicative
  rescale is the wrong transform, which the original's λ=0.5-beats-λ=1.0 result
  already hinted at.
- **Join survival below 90% invalidates the fold.** Declared before the number.

## Bar

ΔMAE > 0 in **both** seasons at the best λ, with survival ≥90% in both.
**Nothing installs either way** — wiring is A's and Cory's, post-08-22.
