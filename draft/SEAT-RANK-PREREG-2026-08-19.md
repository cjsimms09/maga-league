# PREREGISTRATION — where would the tool have FINISHED, and why is 2024 so bad

**A, 2026-08-19. Filed before the rank is computed.** Draft is 08-22.

Cory: *"Once we get further along need to rerun our model to see how we would've
drafted compared to other owners. Need to strive for top 3!"*

---

## 0. THIS PREREG IS NOT BLIND, AND SAYING SO IS THE POINT

**I have already seen every per-seat delta in `draft/data/engine_seat_replay.json`.**
Rank is very nearly a deterministic function of those deltas, so I cannot
pretend not to know roughly how this comes out. What this document fixes is the
**metric definition, the comparison set, the controls and the decision rule** —
not my ignorance of the answer.

A prereg written after seeing the inputs is worth less than one written before.
It is worth more than none, because the thing it stops is the metric being
*chosen* to flatter the number, and that is the failure mode actually available
to me here. Recorded so no later reader mistakes this for a blind test.

## 1. WHY THIS IS BEING ASKED AT ALL — TWO STORES DISAGREE BY 180 POINTS

`CLAUDE.md` and three other files quote the tool as **"roughly a wash with Cory
(−9.4)"**. That number is `draft/data/replay_league_table.json` — **the PROXY**:
`own_v6_nomarket` projections with the proxy's own selection rule — and it is the
**realistic** arm, which that artifact's own honesty note says is *"the tool's
best case and is not the headline"*.

**The shipped engine has its own replay and nobody has quoted it.**
`draft/data/engine_seat_replay.json` runs the real `engine.js`/`survival.js` at
`MEASURED_WEIGHTS` through the same fixed-opponents counterfactual, and reports:

| | optimal (preregistered primary) | realistic |
|---|---|---|
| pooled `beats_n_of_10` | **0** | **0** |
| median owner mean delta | **−174.43** | **−181.54** |
| Cory mean delta | **−188.35** | **−181.61** |

**Verified, not read:** re-ran `replay_seats_grade.py` against the current
choices file (its git_head `1f74a747` differs from the graded store's
`b62b906d`, so the store looked stale). **Every pooled figure reproduced to the
decimal.** The store was current in its values; only two provenance strings
moved. So the −174 is a live measurement, not an artifact of a stale grade.

**That is the honest instrument for Cory's question, and it says something much
worse than the number he has been shown.** This prereg exists to state what
"top 3" means on it before I compute it.

## 2. THE METRIC — stated so it cannot be renegotiated afterwards

For seat *s* in season *S*, under the fixed-opponents counterfactual, the
comparison set is **the tool's roster in seat *s*, plus the nine OTHER owners'
real season totals**, all graded on the same arm. The seat's own owner is
replaced, not added.

- **`rank`** = 1 + (number of those nine whose total exceeds the tool's).
  Range 1–10.
- **`top3_rate`** = share of the 30 seat-seasons with `rank ≤ 3`.
- **Chance baseline is 30%** (3 of 10) — a tool with no skill lands there.
  **`top3_rate` is quoted against 30%, never alone.**
- Reported per arm and per season. **Never pooled without the per-season split**,
  because §4 predicts the seasons differ enormously.

## 3. THE SECOND QUESTION — is 2024 a strategy result or a blindness result?

Per-season medians: **2023 −106 · 2024 −389 · 2025 −21.** One season is four
times worse than another, in a harness whose configuration never changed.

The store's own honesty notes name a mechanism:

> *"rookies exist on the bundle board only where the room drafted them (fallback
> ADP behind FFC's last price); their projections are walk-forward and therefore
> **absent-or-zero**"*

**2024 is the season that punishes that hardest** — Nabers, Bowers, Bucky Irving,
Brian Thomas, Daniels, Nix. If the engine is structurally unable to price players
it has no history for, its 2024 rosters should be short of exactly those players
and the owners' rosters should be full of them.

**Operationalised WITHOUT a rookie table, because "rookie" is not the mechanism —
"invisible to a walk-forward projection" is.** A player is **first-appearing** in
season *S* if the committed weekly stores (`nflverse_weekly_points_2021..2025`)
record him **no points in any season before *S***. That is precisely the
population a walk-forward projection cannot price, whatever his formal status.

Reported per season, both roster sets: count of first-appearing players, and
**their share of the roster's graded points**.

## 4. REGISTERED PREDICTIONS

**P125 — `top3_rate` is BELOW the 30% chance baseline, on both arms.** The tool
beats 0 of 10 owners pooled; a thing that beats nobody pooled does not land top
3 at chance. **FALSE if `top3_rate` ≥ 0.30 on either arm.** I expect roughly
2025 carrying almost all of whatever top-3 finishes exist.

**P126 — the first-appearing gap explains a large share of 2024 and little of
2025.** Specifically: owners' 2024 rosters draw a **larger** share of their
points from first-appearing players than the engine's do, and **the 2024 gap in
that share is bigger than the 2025 gap.** **FALSE if the engine's first-appearing
point share is greater than or equal to the owners' in 2024**, or if 2024's gap
is not the larger.

**A FALSE on P126 is the more valuable outcome and I want that on the record.**
If the engine is NOT rookie-blind relative to the owners, then −389 in 2024 is
the tool drafting badly, the excuse I am reaching for is gone, and the headline
stands unmitigated.

## 5. WHAT THIS CAN AND CANNOT CONCLUDE — the limit stated first

**This cannot rank the tool against the room on Saturday.** The replay hands the
engine strictly less than the live board does: the risk term is age-only, the
injury/depth/opportunity inputs are *declared absent* by the bundle builder, and
the projections are a walk-forward reconstruction rather than the multi-source
mean now shipping. **A bad rank here is a bad rank for the engine-on-bundles, and
the honest statement of it must carry that clause every time.**

**It also cannot be used to select anything.** One configuration is graded — the
shipped one. No weight is swept, no arm is chosen. `no_fit_guard` holds by
construction. If the rank is bad, the output is a finding with an owner, not a
change to `MEASURED_WEIGHTS` three days before a draft.

## 6. CONTROLS — rule 3e, because "the tool ranks badly" is exactly what a broken
## ranker prints

Neither number is written down anywhere until all four pass:

1. **Rank ceiling** — inject a synthetic tool total above every owner in a
   season; the ranker must return **1**.
2. **Rank floor** — inject one below every owner; must return **10**.
3. **Rank is a permutation** — rank the ten REAL owners against each other by
   the same code; the result must be exactly `{1..10}`, no gaps, no repeats.
4. **First-appearance known-positive** — a 2024 rookie the store actually holds
   must be flagged first-appearing in 2024 and a long-tenured veteran must not.
   **If the flag fires on the veteran or misses the rookie, every share below is
   the probe.**
