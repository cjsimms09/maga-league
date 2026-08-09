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

## Discipline / limits

- **Relative result is the robust one.** Both arms run the SAME rooms and the SAME
  weekly luck (paired), so the +$258 head-to-head is robust to shared harness biases.
  The absolute dollars vs balanced depend on the MC room model + VORP/proj inputs and
  should not be quoted as literal season dollars.
- Opponents are dossier-simulated (league-primary but not historical drafts); the
  finding is a decision rule, not a backtest claim. No install to the engine without
  the same gate the tournament applies — but the rule is cheap, mechanical, and
  low-risk (mask filled positions), so it's a strong candidate for the board now.
