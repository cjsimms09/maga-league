# VALUE POCKETS — the dead zone, generalised to every position (our data)

_Run: `python3 draft/backtest/exp_value_pockets.py` → `exp_value_pockets.json`.
Tests: `python -m pytest draft/tests/test_value_pockets.py -q` (4/4). LOCAL, no
egress: shares exp25's spine (harvested drafts + `roster_sim` realized + board
positions). n=395 picks over 2023–25._

## Why this run

exp25 located the **RB dead zone** (RB collapses after overall pick ~60, WR holds).
The mirror question is worth as much in dollars: **where is a position
SYSTEMATICALLY UNDERPRICED — still returning near its premium value deep in the
draft — so the plan can wait and pounce instead of reaching?** Same local data,
same overall-pick invariant.

## The instrument that FAILED (recorded, not smoothed)

First pass compared a position's realized points to the **band's cross-position
mean** (a proxy for "what that slot returns"). It **failed its pre-registered
sanity check**: it did not reproduce exp25's RB dead zone, because the cross-
position mean is **confounded by QB scale** — QBs score ~300+ raw regardless of
draft slot, so any band containing a QB has an inflated mean, making RB/WR read
overpriced everywhere and QB underpriced everywhere. The instrument was invalid,
so it was **replaced (not retuned)** by the within-position measure below.

## The instrument that PASSED (within-position persistence)

**Persistence** = a position's mean realized in a band ÷ that position's mean in
its OWN premium (earliest non-thin) band. Same-scale by construction, so QB cannot
confound. A LATE band is overall pick ≥ 51. Thin cells (n < 8) excluded.

- persistence ≥ 0.80 late → **UNDERPRICED pocket** (buy premium production at a
  late-round cost)
- persistence ≤ 0.60 late → **OVERPRICED dead zone** (value has collapsed)

**Pre-registered check (passed):** RB must read overpriced past pick ~60 — it does.

## What we found (n=395, thin — read with the caveat)

**Underpriced pockets (hold ≥80% of premium value late):**

| position | overall pick | persistence | n |
|---|---|---|---|
| QB | 111–120 | 1.00 | 10 |
| RB | 51–60 | 0.91 | 9 |
| WR | 61–70 | 0.86 | 13 |
| WR | 51–60 | 0.81 | 10 |

**Overpriced dead zones (≤60% of premium value late):**

| position | overall pick | persistence | n |
|---|---|---|---|
| RB | 101–110 | 0.52 | 14 |
| WR | 91–100 | 0.55 | 12 |
| RB | 71–80 | 0.56 | 10 |
| RB | 91–100 | 0.57 | 11 |

## Reading it

- **RB reproduces the exp25 dead zone** — holds through pick ~60 (0.91 at 51–60),
  then collapses to 0.52–0.57 across 71–110. Same shape, same coordinate, confirmed
  by a second, independent instrument. That is the pre-registered check clearing.
- **WR is the mid-round pocket** — it holds 0.81–0.86 of its premium at overall
  picks 51–70, exactly where RB is falling off. This is the same mid-round-WR lean
  exp25 surfaced, now shown as WR-specific persistence rather than a two-position
  crossover — corroboration from a different angle.
- **Late QB (111–120) reads as a full-value pocket (1.00)** — the streaming-era
  fact that a QB taken very late returns about what an earlier QB does. Consistent
  with the doctrine of not paying up for QB. **Thinnest cell (n=10) and one-band —
  treat as a hypothesis to price, not a finding to install.**

## Honesty / limits

n≈400 across three seasons; per-band cells are noisy and several are thin
(excluded, not imputed). Persistence is realized-vs-own-premium, **not ADP
dollars** — it locates where value holds or collapses; it does not price the
decision. This **corroborates and locates** (RB dead zone from a second
instrument; WR mid-round pocket; late-QB hypothesis). **It installs no
re-weighting** — a board change still waits on the money-graded gate. The board
already carries the RB/WR mid-round line from exp25; nothing new ships from this
run.
