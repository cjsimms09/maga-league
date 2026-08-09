# EXPERIMENT 25 — the RB dead zone, at BBM's full-field N

_External-data tier. Source: BBM IV (2023) full-field regular-season dump
(`_r1_...`, ~4.8 GB), STREAMED in CI (`bbm-probe.yml`) through the memory-safe
`bbm_ingest.stream_positional_by_round` — never written to disk, never committed.
Run 31293416392 (2026-08-09), ~100 s to stream. Raw output in the run artifact
`bbm-results` (`bbm_deadzone.json`)._

## The question

Our three seasons cannot resolve whether mid-round RBs systematically
underperform — too few picks per round. BBM's regular-season field has **hundreds
of thousands of picks per (position × round)**, so the dead-zone prior (exp 25) is
finally measurable with real power.

## The result — mean player points by draft round (BBM IV full field)

| round | RB mean pts (n) | WR mean pts (n) |
|---|---|---|
| 3 | **137.7** (221,586) | 131.1 (272,026) |
| 4 | **136.8** (197,657) | 108.6 (371,184) |
| 5 | **80.2** (192,850) | 106.4 (303,362) |
| 6 | **62.6** (202,576) | 104.5 (350,172) |

**The RB dead zone is real and severe.** RB production holds through round 4 (~137)
then **falls off a cliff — 80.2 in round 5, 62.6 in round 6, a ~54% collapse from
round 4 to round 6.** WR declines gently and almost linearly (131 → 109 → 106 →
105). The crossover is stark: **RB ≥ WR in rounds 3–4, then WR far exceeds RB in
rounds 5–6.** At n ≈ 200k per cell this is not noise.

Read for the board: **take RBs in rounds 3–4 or commit to WR value in 5–6** — a
round-5/6 RB is, on this evidence, the worst allocation on the board.

## Discipline (caveat wall — this is a PRIOR, not an install)

- **BBM-scored** (half-PPR, 4-pt passing TD); RB/WR comparison is robust to that.
- **12-team / 18-round**: BBM's round-N talent is deeper than our 10-team round-N,
  so the round BOUNDARIES do not map 1:1 to ours — the SHAPE (a post-round-4 RB
  cliff) transfers as a directional prior; the exact round where our cliff sits
  must be located on OUR data.
- **best-ball, no lineup-setting**: minimal here — this measures each player's own
  production by draft slot, not a lineup decision.
- Tagged `bbm-supporting`. **Big foreign data proposes; our data disposes** — this
  must clear a league-conditional, money-graded test (exp 25 on our harness) before
  it changes the board. It powerfully CORROBORATES the long-standing dead-zone
  prior; it does not install it.

## Next

- Run the league-conditional exp 25 on our three seasons + this prior as the
  high-N corroboration; if our (thin) data agrees in direction, the confidence
  rises sharply (agreement across independent samples is the whole point of the
  external tier).
- The `bbm_deadzone.json` full table (every position × round) is in the run
  artifact; fold the RB/WR crossover into the war-room round-context once the
  league-conditional test clears.
