# Four-Tool System — Build Plan & Integration Contracts

**Objective (Cory, 2026-08-10):** four tools — Draft, Waiver, Lineup, Roster
Analyzer — finished, working, connected, run over real data, logic written down,
every prediction graded, and verified to agree where they price the same player.

This document is the architecture an auditor reads. It sets the sequence, the
shared contracts, and — honestly — what is done, what is in progress, and what is
pending. It is updated as pieces land. A tool that looks finished and is not is
worse than one known pending, so this file states the true status of each.

---

## HONEST BOUNDARY — status as of 2026-08-10

| Tool | State | Note |
|------|-------|------|
| **Draft** | **exists, needs polish** | phone-usability, take-always-reachable, mock over-roster (DONE), QB-hoarding VORP root fix, roster-projection builder (new sub-feature) |
| **Waiver** | **does not exist** | largest gap; net-new build |
| **Lineup** | **exists; audit partly closed** | matchupValue derived from playoff equity (DONE this session); dual-objective deviation readout over 540 weeks (pending) |
| **Roster Analyzer** | **does not exist** | net-new; three tools consume it |
| **Consensus-alongside-dollars** | **partial** | Sleeper proj wired in lineup; needs multi-source consensus number shown next to every $ in all four |
| **Predict-and-grade** | **partial** | PredLedger + weekly grader exist for draft/lineup; waiver + standings predictions not yet emitted; consensus not yet graded alongside our valuation |

**Four finished-and-connected to the DONE standard is a multi-day build, not one
sitting.** What is committed today is real and verified; the rest is sequenced
below and built in order. Each boundary is reported.

---

## THE SHARED CONTRACTS (the part that makes it one system, not four tools)

### C1 — ONE VALUATION: startable-capacity marginal value
A player is worth **what he adds to startable capacity**, whoever holds him and
however he arrives (draft pick, waiver claim, trade). The primitive:

```
startableValue(player, roster, league) -> { value, fills, why }
```

- `fills ∈ {starter, flex, bench}` by the same rule the draft mask uses
  (needrule.js `startableCap`): dedicated slots first, then FLEX, then bench.
- `value` = VORP if he fills an empty starter slot; marginal-over-best-alternative
  if flex; discounted upgrade + injury insurance if bench.
- **RANK ON VORP, NOT proj_mean.** Raw projection is cross-position
  apples-to-oranges (QB passing ~400 pts vs RB/WR half-PPR ~290) and hoards QBs.
  VORP-vs-replacement-per-position is the single fix for BOTH the QB-hoarding recs
  bug AND the roster-projection builder taking Josh Allen in R2 instead of Bowers.

**Verification requirement:** a test that constructs one player and one roster
state and asserts the draft recommender, the waiver tool, and the lineup tool
return the *same* `value`. If they differ, that is a bug (Cory). This test is the
proof the system is one valuation, not three.

### C2 — ONE CONFIG / PAYOUT
`league_config` (6pt passTD, half-PPR, starter slots) and `payouts.json`
($2,125 playoffs top-4-of-10 + $375 RS + $100/wk weekly-high) are the single
source. Every tool reads them; if the payout structure changes, every tool
follows. matchupValue is DERIVED from this table (draft/backtest/matchup_value.py),
not guessed — $110, not the old $25 side-bet (side bets are outside fantasy and
never enter any tool).

### C3 — CONSENSUS PROJECTION ALONGSIDE EVERY DOLLAR
Every dollar figure in every tool shows, next to it, a **raw averaged consensus
projection** (Sleeper + FantasyPros + any free reachable source), clearly labelled
"raw consensus," NOT our valuation. Dollars stay the objective; the projection is
the sanity check on a long chain (projection → points → win prob → playoff odds →
payout) whose links rest on constants — we just found one wrong by ~2×. When the
tool recommends a lower-projection player, BOTH numbers must be on screen: that is
the moment the machinery is either finding something real or is broken, and one
number can't tell you which.

### C4 — EVERY TOOL PREDICTS, EVERY PREDICTION IS GRADED
Each tool, each time it advises, records what it expects — at that moment, with
the info it had — to the prediction ledger:
- Draft: survival, where the room goes.
- Waiver: what a claim is worth, whether someone else claims the player.
- Lineup: the matchup result, the weekly high.
- Roster Analyzer: the standings.
The weekly grader checks each against reality and writes the calibration ledger.
**Grade the raw consensus projection too**, alongside our valuation — if consensus
predicts as well as our machinery, that is the most important thing we could
learn, and it is invisible if we only grade ourselves. A tool that advises without
recording a prediction is **not finished**.

---

## SEQUENCE (by what unblocks the most)

Agreeing with Cory's instinct, with the shared valuation pulled to the front
because all four depend on it:

0. **C1 shared valuation module + C2 config wiring** — the connective tissue.
   Extract `startableValue` so draft/waiver/lineup call one function. Verify
   agreement (C1 test). *Unblocks all four; smallest, highest-leverage.*
1. **Roster Analyzer** — project every team's rest-of-season from real rosters →
   playoff odds, weekly-high chasers, desperate teams. *Three tools consume it.*
   Validate the projection math on historical seasons (predicted vs actual
   standings). Emit standings predictions (C4).
2. **Waiver Tool** — free-agent pool + my roster + C1 valuation → who to claim,
   who to drop, claim worth, need interaction. A claim is a late-round pick with a
   different pool, so it reuses C1 directly. Emit claim predictions (C4).
3. **Draft polish** — phone-usable, take always reachable, VORP root fix in recs
   (same C1), roster-projection builder, recs-vs-rule agreement.
4. **Lineup fixes** — dual-objective deviation readout over 540 real team-weeks;
   consensus-alongside-dollars; confirm predictions graded.

Cross-cutting C3 (consensus everywhere) and C4 (predict+grade) are applied to each
tool as it is built, not bolted on at the end.

---

## DONE STANDARD (per tool)
1. Runs over **real data**, not fixtures (the 540-week sweep found a bug every
   unit test missed — meet reality).
2. **Logic written down** plainly, the way the decision spec is; guessed numbers
   labelled with what would measure them.
3. **Connected + verified**: a constructed case where two tools price the same
   player, checked that they agree.
4. **Predicts + graded** (C4).

Only when all four hold is a tool "finished."
