# THE IN-SEASON EDGE PROGRAM — waivers, lineups, trades, league analyzer
<!-- TERRITORY: relay (the program); each tool keeps its own territory. 2026-08-20. -->

**Cory, 2026-08-20, verbatim:** *"Let's move past the draft... most points are in
waivers and lineup setting! So let's make those tools the best they could
possibly be! How do we do that? What're the equations, what sources of info...
All hands on deck, find me edge with waivers, trades, lineup, league analyzer.
Use all the data we can, make predictions grade them, keep improving the tools
constantly."*

**And the measurement that says he is right** — two independent instruments,
same verdict:
* `engine_seat_replay`: in 2023/2025 the engine's rosters HELD more points than
  the owners' (+2.1%/+5.1%) and lost entirely on **conversion** (0.740/0.771 vs
  0.828/0.834) — value acquired that never reached a starting slot.
* `lineup_edge_backtest` (420 real team-weeks, 2023-25): the hindsight-optimal
  lineup averages **+15.3 pts/week over what owners actually played** (126.62 vs
  111.29) — a ~200 pt/season pool per team — while the tool's own fallback
  projections (leak-free season average) score **−14.5/week vs the humans**,
  beating them in only 19% of team-weeks.
* The exact-DP diagnostic (P142) closed the other door: draft construction has
  < 5% headroom in 30/30 seats. The draft is settled; the season is not.

**The organizing fact of this whole program: every tool below is an argmax
whose SOLVER is already proven, sitting on projections that are not.** The
assignment math in `bestLineup()` is exhaustively optimal (lineup_skill.test).
The marginal-value machinery is graded three experiments deep. What loses is
the number fed in. **Edge in = edge out; the program's spine is the weekly
projection blend (D) and the pre-kickoff capture (C), and every tool is a
consumer of it.**

---

## TOOL 1 — LINEUP SETTING (owner: B surface, D measurement)

**Equation (solver, already proven):**
`lineup* = argmax over legal assignments Σ E[pts_i | info ≤ kickoff]` —
exhaustive-optimal in `bestLineup()`.

**Equation (the upgrade, gated on P143):** when two candidates sit within the
projection's own noise (|ΔE| < ε from measured weekly error), break the tie by
game state: **favorite → higher floor; underdog → higher ceiling** (win prob
from the league analyzer; floor/ceiling from the calibration). The textbook
rule, applied only inside the noise band so it can never override a real
projection difference.

**The binding constraint, measured:** the fallback projection loses to human
judgment by 14.5/week. **P143 (D, grade by 09-01):** re-run
`lineup_edge_backtest` with the blend's leak-free weekly projections in place
of the season-average fallback; prediction: the edge vs actual flips positive
in ≥ 2 of 3 seasons. If FALSE, projection quality is NOT the binding
constraint and the program pivots to whatever the residuals say is.

**Grading loop:** every start/sit call captured at kickoff (`lineup_call`
route, live), graded weekly on the start/sit accuracy metric against Sleeper
and FP — Cory's bar (beat both, 3 of 4 positions) unchanged, first grade
**09-15**, then weekly on the scoreboard page.

## TOOL 2 — WAIVERS (owner: B surface, D signals, C data)

**Equation:**
`V(add, drop) = Σ_{w=now..17} [ P(add starts in w) × E[pts_add,w] − (same for drop) ] − blocked_value`
i.e. **marginal starting-lineup value over the remaining season** — the same
displacement idea that won the draft program, at weekly grain — where P(starts)
comes from the roster's own depth chart, weeks 15-17 carry the playoff
weighting (built), and the baseline is the **measured waiver replacement level**
(`waiver_supply.js`, 802 completed transactions of this league's own history:
what is actually free, not what is theoretically rostered).

**FAAB price:** `bid ≤ V × ($/point price curve measured from this league's
own FAAB history)` — C captures the bid history; D fits the curve. Overpaying
the measured curve is how the league's best claims still lose money.

**Signals (D's backtest, preregistered before grading):** which pre-claim
facts — prior-week snap/route/target deltas (component stats), depth-chart
promotion, Vegas movement — predicted the next-4-week points of the 802 real
adds. The claim card shows V, the bid ceiling, and WHICH signal fired.

**Grading loop:** every claim AND every pass captured (`waiver_claim` route,
live), graded at +4 weeks of realized starts. Tuesday alert (injury Monday →
claim ready Tuesday) is the speed layer.

## TOOL 3 — TRADES (owner: E design, A gate)

**Equation:** a player's value is roster-specific:
`worth(p → R) = ΔMLV(R, p)` over remaining season, playoff-weighted. A trade
is +EV when `ΔMLV(mine, get) − ΔMLV(mine, give) > 0` — and FINDABLE when the
same pair is also ≥ 0 for them (`ΔMLV(theirs)`), because surpluses differ:
their WR4 can be my WR2. The league analyzer's surplus/deficit table is the
pair scanner's input; E's opponent model says who actually answers trades and
what they overvalue, from three seasons of their real behavior
(`opponent_persistence.js` measures a related but different question — draft-pick
tendency, not weekly-starter tendency — and its own output reads as a TIE, not
demonstrated persistence: +0.8pp across 2 target seasons, "does NOT distinguish
the two worlds." Corrected here by E, 2026-08-20, same correction filed in ROUTES.).

**Grading loop:** every proposal logged with its predicted delta; graded on
realized starter points both sides, season's end.

## TOOL 4 — LEAGUE ANALYZER (owner: E model, B surface)

Weekly, per opponent: **predicted starters** (E's model, P249 — null to beat:
"last week's lineup minus injured", which is what persistence implies),
playoff odds (champodds, calibration graded at season end), all-play luck,
FAAB remaining, positional surplus/deficit (feeds trades), and **blocked
value** (what MY claim denies THEIR lineup — the second term waivers need).

**P249 (E, grade by 09-03):** leave-week-out on 2025, the starter-prediction
model hits ≥ 80% of slots AND beats the persistence null; if it cannot beat
"same as last week", the model is a costume and the null ships instead.

## DATA — the capture list (owner: C)

| store | status | feeds |
|---|---|---|
| Weekly pre-kickoff projections (Sleeper/FP/own) | **live** (dispatch verified 08-20) | everything |
| K/DEF realized scores | **built** (register 67, closed 08-20) | K/DEF calibration |
| Component stats incl. K/DST | dispatched (register 2e) | usage signals |
| Transactions + FAAB bid history, 3 seasons + weekly | **NEW ASK** | waiver price curve |
| Tuesday injury/depth-chart snapshot | **NEW ASK** | waiver speed, P(starts) |
| Vegas/props weekly (Kalshi adapter) | dispatched | projection context |
| Opponent lineup histories (weekly starters, 3 seasons) | derivable from `league_history.json` | E's model |

## THE LOOP (owner: relay — this is the charter)

Predictions before builds; grades weekly, Tuesday after MNF; every grade names
what changed or `NOTHING — <reason>`; the ledger check enforces successors.
Cadence: **capture (C) → project (D) → decide (tools) → capture the decision
(routes, live) → grade (scoreboard + ledger) → change the weights or say why
not.** The two 2027-goal bars stay the north star: beat Sleeper AND FP on
start/sit at 3 of 4 positions (first grade 09-15); predict opponents better
than persistence (P249).
