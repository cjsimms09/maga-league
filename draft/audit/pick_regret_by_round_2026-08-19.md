# WHERE THE DRAFT MONEY IS ACTUALLY LEFT — regret by round, and both blind predictions wrong

**A, 2026-08-19.** Cory: *"Are we sure we are extracting as much value as
possible while drafting full roster? … Are we looking for upside late?"*
Module `exp_pick_regret_by_round.py` (committed before first run), blind
predictions P105, artifact `exp_pick_regret_by_round.json`.

## The control failed first, and that is the most useful paragraph here

The oracle runs through the same instrument and must score ZERO regret by
construction. First run: **165.1 points per pick.** Cause: the baseline
scored "best available" over the position-capped pool in EVERY round,
including the late rounds where the tournament's own `_legality_first`
**forces** a required starter — so the oracle correctly took a mandated
kicker while the baseline credited a 300-point receiver still on the
board. The instrument was pricing the cost of the ROSTER RULES, not of
the policy, and it reported a confident, plausible ~200 points of regret
per pick in every round. Fixed by mirroring the legality rule; oracle
control now **0.0**. Without that control this study would have shipped a
number that was wrong in the same direction everywhere.

## The clean window is rounds 1–12, and the reason is register 2e

**All 77 kickers and defenses carry ZERO points in the weekly store**
(`fetch_component_stats` filters to QB/RB/WR/TE). Rounds 13–15 are the
forced K/DEF slots, so their regret is an artifact — including a
*negative* −39.6 at round 14, which is Cory taking a scoring player where
the forced legal set scored zero. **Rounds 13–15 are not interpretable
until the K/DST store gap closes** — the exact work dispatched to C
tonight (register 2e).

## Both P105 legs are FALSE

| round | regret/pick | share of available |
|---|---|---|
| 1 | 216.8 | 0.51 |
| 2 | 298.9 | 0.66 |
| 3 | 206.2 | 0.45 |
| 4 | 271.4 | 0.66 |
| 5 | 241.3 | 0.58 |
| 6 | 201.5 | 0.50 |
| **7** | **282.4** | **0.73** |
| **8** | **287.5** | **0.75** |
| 9 | 208.9 | 0.54 |
| 10 | 231.3 | 0.60 |
| 11 | 204.3 | 0.56 |
| 12 | 193.4 | 0.54 |

**(1) Absolute regret does NOT fall monotonically by round — it is
essentially FLAT at ~190–300 points per pick across all twelve.** I
predicted an early-heavy concentration on the reasoning that early picks
have the widest outcome spread. Wrong: a round-12 pick leaves nearly as
many hindsight points as a round-2 pick.

**(2) Relative regret is NOT largest late.** It peaks in the MIDDLE —
rounds 7–8 at 0.73/0.75 — and is *lowest* at round 3 (0.45) and round 12
(0.54). The middle rounds are where a policy most often misses the best
man still on the board.

## The finding that answers Cory directly

**Cory's actual picks and a pure follow-the-market policy produce the
same outcome in 31 of 32 picks in rounds 1–12.** He already drafts the
board. That is not a criticism — it is the behaviour the powered null
(P100, 54,000 worlds) says is optimal at his seat, and it means the
"extract more value" question cannot be answered by changing WHICH
archetype he drafts, because he is already at the measured optimum and
ten tested arms all lost.

**What this does NOT license:** reading the flat ~200-point regret as
recoverable money. It is HINDSIGHT regret against the realized best — no
drafter captures it. The shape is the finding; the level is not a target.
The one actionable reading is negative: there is no round where regret
collapses, so there is no round where the tool can safely coast, and no
round whose regret is so concentrated that a special-case policy is
justified. Ten strategy arms and the barbell study already found exactly
that, from the other direction.

## Consequences

* **"Upside late" is now answered from two independent directions**: the
  barbell study measured acting on it as a LOSS (champ −1.49pp; endgame
  ceiling 1.0/2.0/3.0 all worse with CIs excluding zero), and this study
  shows the late-round *opportunity* is not unusually large either.
  Endgame ceiling stays at the measured 0.5.
* **The middle rounds (7–8) are the honest place to look next**, not the
  late ones — and the next look must be a preregistered arm with a null,
  not a nudge.
* **Rounds 13–15 stay unmeasured** until C's K/DST store lands; this
  study is the second independent reason to want it.
