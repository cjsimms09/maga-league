# EXPERIMENT 25 (league-conditional) — the RB dead zone, LOCATED on our data

_Companion to EXP25-DEADZONE.md (the BBM full-field prior). Run:
`python3 draft/backtest/exp25_deadzone.py` → `exp25_deadzone.json`. LOCAL, no
egress: harvested drafts + `roster_sim` realized + board positions, 96-97% of
non-keeper picks resolve both. n=395 picks over 2023-25 (125/124/146)._

## Why this run

BBM proved the shape at 200k picks/cell: **RB collapses after round 4, WR barely
declines.** But BBM is 12-team and we are 10-team — the shape transfers, the exact
round does not. **Overall pick is the invariant across league sizes** (Cory), so
this locates the collapse in OUR draft, in overall-pick numbers.

## What we found (n=395, thin — read with the caveat)

Mean realized points by overall-pick band (non-thin cells, n≥8):

| overall pick | RB | WR |
|---|---|---|
| 31–40 | 182.5 | 133.1 |
| 51–60 | **166.1** | 133.3 |
| **61–70** | **126.0** ⬇ | **142.5** |
| 71–80 | 101.6 | 130.2 |
| 81–90 | 130.3 | 103.2 |
| 91–100 | 104.8 | 91.0 |

- **RB averages ~170 through overall pick 60, then drops to ~110–126 after** — the
  largest non-thin adjacent drop is **51–60 → 61–70 (166→126, −40)**.
- **WR holds ~130–145 through pick 80** and **overtakes RB at overall pick 61.**
- So the located boundary is **overall pick ~61 (our round 7 in a 10-team draft)**,
  and past it WR is the better realized value.

## Agreement with BBM — in the invariant coordinate

BBM's cliff is "after round 4" in a **12-team** draft = overall pick **~49–60**.
Ours is at overall pick **~61**. **Expressed in overall picks they land in the same
neighborhood (~50–61)** — which they would NOT if compared by round (round 5 vs
round 7). The two independent samples — one massive, one ours — agree in direction
(RB collapses mid-draft, WR holds) AND in overall-pick location. That is exactly
what the external tier is for: BBM supplies the power, our data confirms and places
it in our coordinates.

**Honesty:** our n is ~400 across three seasons and the per-band cells are noisy
(some thin cells excluded). This CORROBORATES and LOCATES the BBM prior; it does not
independently prove a cliff, and it installs no re-weighting on its own.

## The keeper interaction — three independent things agree (Cory's #3)

Cory holds **Henry and Walker at RB**, so his RB starting slots are filled and
additional RB value is **flex-marginal**. Compounding:

1. **The dead zone** says overall picks ~61+ are where RB realized value collapses
   and WR holds — a mid-round RB is the board's worst-evidenced value there.
2. **Keeper fill** — RB slots already covered, so the marginal RB is worth less to
   *this* roster than to a team still needing backs.
3. **WR Feast** (the enrolled doctrine) already leans mid-round WR.

Three independent lines — an external+league-conditional value surface, a roster-
structural fact, and the enrolled doctrine — point the same way. **The mid-round WR
lean (past overall pick ~60) is the best-evidenced positional call Cory has going
into this draft.** Stated explicitly because three-way agreement is worth more than
any one of them alone.

## On the board (shipped)

The deviation explainer now carries an **informational dead-zone line** (labeled
prior, like the exp-36 market-reliability surface — not a re-weighting): an RB at
overall pick 61+ reads "INSIDE the RB dead zone … prefer WR"; 51–60 reads
"ENTERING"; a WR there reads "WR HOLDS … the best-evidenced mid-round lean." Cited
(exp 25 + BBM), reversible (regenerate the boundary from `exp25_deadzone.json`). A
board re-weighting still waits on the money-graded gate.
