# KEEPER-CONDITIONAL B0 — the draft-day rule is "follow the market WITHIN NEED"

_Run: `python3 draft/backtest/exp_keeper_b0.py --rooms 200` → `exp_keeper_b0.json`.
Tests: `python -m pytest draft/tests/test_keeper_b0.py -q` (3/3). Reuses
`cory_conditional.py`'s certified seat+keeper room, dossier opponents, `grade_room`
money function, and PAIRED seeds + bootstrap null — no new money function._

## The question (pre-registered, both directions)

B0 (follow ADP) is the only draft policy that clears a real null — but it was graded
from an average/empty seat. Cory keeps **Chase (WR), Henry (RB), Walker (RB)**: both
RB starter slots and a WR are pre-filled. ADP encodes construction for the AVERAGE
drafter, so pure ADP-following should over-draft RB for Cory specifically. The rule
that actually applies is **"follow the market among players who fit my roster."**
Pre-registered: if `b0_need` beats `b0_pure` past the null, the draft-day rule is
follow-within-need and the tool must mask filled positions; if they tie, pure ADP
already handles his construction.

## Result (200 rooms, Cory's seat, keepers locked)

| policy | vs balanced (VORP-greedy control) | 95% CI | avg RB on my roster |
|---|---|---|---|
| b0_pure — follow ADP, ignore roster | +$121.12 | [67.6, 176.9] | **4.55** |
| b0_need — follow ADP within need | +$379.12 | [326.0, 431.4] | 3.48 |

**Head-to-head (paired): b0_need − b0_pure = +$258.00, CI [206.5, 309.3] — clears $0.**

## Reading it

- **"Follow the market within need" beats pure ADP-following by ~$258/season** from
  Cory's keeper seat, and the result is not fragile (tight paired CI over 200 rooms).
- **The mechanism is the fourth-RB problem, confirmed by `avg_RB`:** pure ADP drafts
  **4.55 RB** (2 kept + ~2.5 more) because ADP doesn't know his RB slots are full;
  within-need drafts 3.48 and spends those picks on WR/TE/QB/flex — the positions he
  actually needs. Exactly the over-draft Cory predicted.
- Both ADP arms crush the VORP-greedy control from this seat, consistent with the
  broader finding that ADP-following beats our construction layer.

## What it changes (it reaches the pick-34 screen)

The draft-day instruction is now settled and specific: **recommend the best-ADP
player AMONG UNFILLED STARTER NEEDS** (QB1 RB2 WR2 TE1 K1 DEF1 + 1 FLEX of RB/WR/TE);
once starters+flex are full, best-ADP overall for the bench. The recommendation
engine / one-voice resolver must **mask positions Cory's keepers+roster already
fill** before ranking. This is the concrete rule the tool speaks at pick 34, and it
supersedes an unqualified "follow the market." Wiring it into the board is the
follow-on (with the resolver, task #10).

## THE NEED DEFINITION — this IS the strategy now (read it)

`need_filter(board, roster)` — the exact rule the board executes:
1. **Starters first.** Slots: **QB1 RB2 WR2 TE1 K1 DEF1** (dedicated) **+ 1 FLEX (RB/WR/TE)**.
   A position is *needed* while `count(pos) < starters(pos)`. The pick is the
   **lowest-ADP player among needed positions**.
2. **Flex next.** Once all dedicated starters are full, if the flex is open
   (RB/WR/TE overflow `< 1`), pick the lowest-ADP RB/WR/TE. **This is where a 3rd RB
   earns its keep and a 4th does not** — the 3rd fills flex; the 4th only ever
   reaches the board through step 3.
3. **Bench = best available.** Starters + flex full → no mask, lowest-ADP overall.
4. **Onesies (K/DEF)** are "needs" from pick 1, but their late ADP means the
   lowest-ADP-among-needs rule only takes them late — and if they're the *only*
   unfilled starters at the end, they get drafted (mandatory endgame). Correct
   by construction, no special case.
- **NOT modeled (known limitation):** bye-week coverage — after QB1/TE1 fill, the
  rule deprioritizes QB/TE until bench, so it won't proactively draft a bye
  handcuff. Streaming covers most of this in a 10-team league; flagged for the
  board copy so Cory knows the rule doesn't handle byes.

## Robustness (stress-tested, 120 rooms/cell) — it holds everywhere

`python3 draft/backtest/exp_keeper_b0.py --robust` → `exp_keeper_b0_robust.json`.
The +$258 headline is **not fragile**:
- **Across all 10 seats:** need−pure = **$214–$347, every CI clear of $0.** Holds
  from any draft slot (Cory's is unassigned). Pure ADP over-drafts RB at every seat
  (~2 more RB than within-need).
- **Opponent model:** holds under both the dossier room ($289) and the uniform
  sampler ($249) — not an artifact of the dossier fits. (True frozen fixed-sequence
  opponents still need the replay harness; the uniform room is the available proxy.)
- **Alternate keeper slates:** holds under all tested ($234–$328). Honest correction
  to my pre-registration: I predicted the margin would shrink monotonically with
  fewer RB kept — it does **not** (it tracks the full need structure, not RB count
  alone), but it stays large and positive in every slate.
- **Where it would weaken:** nowhere in the tested space. The one caveat is the seat
  sweep assumes a full 15 picks (it doesn't subtract keeper-consumed picks), so its
  absolute `avg_RB` (~6) is inflated vs the real keeper-reduced roster (~4.5) — the
  *relative* need−pure margin is unaffected.

## Fill-first vs value-depth — the board should allow value-depth (+$51)

Cory's follow-up: `b0_need` proved don't over-draft FILLED positions; it did NOT
settle whether an UNFILLED slot must be filled before taking depth elsewhere. Added a
third arm, same harness/seat/keepers/paired null:
- **b0_need (STRICT fill-first, was installed):** mask to unfilled starter needs;
  never take a filled-position player until starters are covered.
- **value_depth:** take best-ADP among positions under STARTABLE capacity (dedicated
  starters + 1 flex share for RB/WR/TE), letting a great-value flex/depth player jump
  ahead of a weak starter slot; still capped so it never re-opens the 4th-RB trap.

**Result: value_depth − fill_first = +$50.75, CI [16.75, 88.12] — clears $0.** Modest
vs the $258 keeper-need result, but real. Mechanism (avg composition): value_depth
**defers QB (1.47 vs 1.88) and DEF (1.40 vs 1.74)** and takes more flex-eligible
depth (RB 3.90 vs 3.48, TE 2.46 vs 1.89) — and STILL fills every starter (no holes),
just later from a worse tier. That is exactly the position-specific answer the
market-reliability surface predicts: **ADP prices QB/TE well in the middle rounds, so
waiting on the onesie starters is cheap; concentrate early value in flex-eligible
depth.**

**Refined board rule (supersedes strict fill-first):** recommend the best-ADP player
among positions **under startable capacity** (starters + flex depth for RB/WR/TE),
which (a) never over-drafts a filled position — the $258 rule — and (b) lets a strong
flex/depth value jump ahead of a weak starter, **deferring QB/DEF to their cheaper
mid/late ADP**. Never leave a starter slot empty at the end; onesies fill by their own
late ADP. This is what the resolver wires to the pick-34 screen.

## Discipline / limits

- **Relative result is the robust one.** Both arms run the SAME rooms and the SAME
  weekly luck (paired), so the +$258 head-to-head is robust to shared harness biases.
  The absolute dollars vs balanced depend on the MC room model + VORP/proj inputs and
  should not be quoted as literal season dollars.
- Opponents are dossier-simulated (league-primary but not historical drafts); the
  finding is a decision rule, not a backtest claim. No install to the engine without
  the same gate the tournament applies — but the rule is cheap, mechanical, and
  low-risk (mask filled positions), so it's a strong candidate for the board now.
