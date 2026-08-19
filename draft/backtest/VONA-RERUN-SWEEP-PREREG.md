# PRE-REGISTRATION — re-running the conclusions that were measured on the broken VONA

**Filed 2026-08-19 by A, BEFORE the sweep ran.** Ledger: **P109**.
Grade-by **2026-08-26**.

Cory, 2026-08-19: *"I feel like we need to run more tests using correct vona
calc. Test our roster building, our adjusters etc."*

---

## 1. Why this exists, and how big it actually is

Register 56 / P107: `vona()` priced the cost of waiting on a player over a pool
that **excluded him**, which asserts `P(he survives to my next pick) = 0` for
every player on the board. Fixed and shipped 2026-08-19 on Cory's ruling, worth
+114.1 points per seat-season.

**A fix to the primary decision metric is retroactive.** Measured, not
estimated: **33 harnesses** in `draft/tools/` and `draft/backtest/` drive
`recommend()` / `scorePlayer` / `vona()`. Every conclusion any of them produced
— the adjuster ablations, the roster-construction shapes, the stack tilt, the
barbell and late-upside verdicts, the intervention rate, the strategy arms —
was measured on the broken metric.

**This is Rule 3g's second question, asked about our own biggest finding: does
it invalidate something we already trust?** The answer cannot be assumed in
either direction. A conclusion that survives is stronger than it was this
morning; one that does not was never a conclusion.

## 2. Method

`draft/tools/vona_arm_preload.js` sets the arm in the module cache before the
study's own `require` resolves, so **each study is byte-identical between arms**
and one thing differs. No study is edited. Arms:

| arm | configuration |
|---|---|
| **a0** | the pre-fix engine — `VONA_INCLUDE_SELF: false` |
| **a1** | the shipped engine — `VONA_INCLUDE_SELF: true` |

Each study is run under both, its stdout captured, and the two compared. The
sweep is **REPORT-ONLY**: it changes no weight, ships no configuration and
selects nothing (`no_fit_guard`).

## 3. What counts as a result, fixed in advance

For each study, exactly one of:

- **HOLDS** — the study's stated conclusion is the same under a1. Its numbers
  may move; the *claim* is what is graded.
- **MOVED** — the conclusion changes sign, crosses its own stated threshold, or
  the study's own summary sentence would now read differently.
- **UNREADABLE** — the study does not state a conclusion its output can be
  checked against, or it fails/times out under both arms. **This is a finding
  about the study, not about VONA**, and it is reported rather than dropped.

## 4. Predictions, registered before the sweep

**P109-a.** **A MAJORITY OF STUDIES WILL HOLD.** Most of these measure whether a
TERM participates or which SHAPE a roster takes, and the VONA fix rescales one
term rather than reordering the board wholesale — 9 of Cory's 15 picks moved,
not 15. I predict **≥ 60% HOLD**.

**P109-b.** **THE ONES MOST LIKELY TO MOVE ARE THE ONES ABOUT ONESIES AND THE
LATE ROUNDS**, because that is where the defect was largest: the excluded-self
error grows with survival, and survival is highest for kickers, defenses and
anyone the room drafts far later than our board ranks him. Specifically I
predict `variance_portfolio` / barbell-family and any endgame-ceiling study are
over-represented among MOVED.

**P109-c.** **AT LEAST ONE STUDY WILL COME BACK UNREADABLE** — no stated
conclusion, or a conclusion its own output cannot confirm. With 33 harnesses
built over weeks, a clean sweep would itself be the surprising result.

⚠️ **AND THE ANTI-PREDICTION, so this cannot be graded as a success either way:
if EVERY study holds, that is evidence the fix is smaller than P107 measured,
and it should be reported as tension with the +114.1, not as reassurance.**

## 5. What this sweep cannot say

- **It compares OUTPUTS, not TRUTH.** A study that holds under both arms is a
  study whose conclusion is robust to this change — not a study that is right.
  Most of these harnesses are simulators graded against the board's own
  projections; register 49's circularity caveat applies to every one of them
  that asks a market-vs-tool question.
- **Studies that never touch `vona()`** — the Python replay-money work, the
  weekly-projection program, the regret-by-round study — are out of scope here
  and are NOT cleared by this sweep. Their scope is their own.
- **Timing out is not holding.** A study too slow to run under both arms inside
  the sweep's budget is UNREADABLE, and saying so is the point.

## 6. Standing constraint

Nothing in this sweep changes a weight, a flag or the board before Cory's draft
on 2026-08-22. If a conclusion MOVES, the deliverable is a register row naming
what we no longer know — not a new configuration shipped on a re-run.
