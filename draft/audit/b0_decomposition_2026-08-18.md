# B0 DECOMPOSITION — the experiment answered a different question than it asked

**A, 2026-08-18. Task #6 (pre-draft). Preregistered in
`exp_b0_decomposition.py` (blind predictions + decision rule committed before
the first run), run at 200 paired rooms on the certified
`cory_conditional` harness. The headline is not the decomposition — it is a
finding about the INSTRUMENT, plus one stale artifact flagged.**

## What was asked

Is B0's ("follow the market") edge one edge or two — a general
market-following edge, or specifically its RB half (where rows 2c/2d/E32
show the board disagrees with the market most, through one source lever)?

## What the run showed, and the sign flip that mattered more

On today's world, every ADP-following arm LOSES to the VORP-greedy control:

| policy | mean $ vs balanced | ci95 |
|---|---|---|
| b0_pure | −263.00 | [−306.75, −219.88] |
| b0_need | −92.12 | [−122.75, −62.88] |
| value_depth | −63.75 | [−94.50, −34.75] |
| hyb_rb (B0's RB half only) | −0.62 | [−17.25, +15.50] |
| hyb_nonrb (B0's non-RB half) | −50.62 | [−80.00, −20.12] |

The committed `exp_keeper_b0.json` says b0_pure **+121** and b0_need
**+379** vs the same control. Same harness, same seed, opposite signs —
because the WORLD changed underneath it (the 08-17/08-18 board fixes:
repricings, real dispersion, ceiling 0.45; `balanced`'s average RB count
moved 2.0 → 3.0).

## The diagnosis — why neither sign answers "market vs tool"

`grade_room` simulates weekly scores from **the board's own
`proj_mean`/`weekly_sd`** (its header says so). So the money grade is
CIRCULAR with respect to the board: a policy that maximizes board-VORP is
graded by the board's opinion of itself, and any policy that deviates
toward the market is marked down exactly as much as the board disagrees
with the market. **This instrument cannot adjudicate market-vs-tool, in
either direction, on any world.** The new −92 does not show the tool beats
the market; the old +379 never showed the market beats the tool.

What the room CAN measure is **construction** — how a policy assembles a
legal roster — because construction errors hurt under any projection set.
And those results are stable across both worlds:

- `b0_need` beats `b0_pure` by **+170.88** [134.62, 211.12] — need-filtered
  market-following beats raw market-following (the keeper-conditional
  result, re-confirmed on the new world).
- `value_depth` beats strict fill-first by **+28.38** [4.75, 53.38].

The real market-vs-tool evidence remains the REPLAY on realized historical
outcomes, which is a different, non-circular instrument — and it says
"roughly a wash with Cory (−9.4), measured too noisily to rank anyone"
(`replay_best_drafter_claim_2026-08-18.md`).

## The preregistered predictions, graded honestly

- **P-dec1** ("hyb_rb carries the majority of b0_need's edge",
  `rb > 0.5 × b0`): grades TRUE mechanically — but **the inequality was
  written expecting a positive total edge and is VACUOUS under a negative
  one** (−0.62 > −46.06 says only that the RB half loses less). Recorded as
  MALFORMED-FOR-THIS-BRANCH, not as a win. The prereg lesson: state the
  prediction in a form that survives both signs.
- **P-dec2** ("hyb_nonrb alone is null"): **FALSE** — the non-RB half
  separates, negatively (CI excludes 0).
- **Decision rule**: does not fire. No new briefing sentence ships.

What the two grades jointly DO say, within the instrument's real
competence: on today's board, B0's disagreement-cost with the tool is
concentrated in its NON-RB half — its RB picks are the picks the board
itself nearly agrees with (−0.62 ≈ 0). That is consistent with E32
(the RB under-market outliers sit far outside the startable range where
rooms actually pick), and it is a statement about agreement, not accuracy.

## Consequences (rule 3g)

1. **`exp_keeper_b0.json`'s absolute vs-balanced numbers are STALE and were
   never market-vs-tool evidence.** Its RELATIVE results (need > pure;
   value_depth > fill-first) stand and are re-confirmed. Register row filed.
2. **Any future "policy X beats the tool" claim from a room-simulated
   grade is invalid by construction** — route those questions to
   realized-outcome instruments (replay, in-season grading).
3. **Draft-day instruction UNCHANGED**: B0-within-need remains the
   installed rule on the replay's evidence; no sharper RB sentence ships
   (the decision rule did not fire, and the instrument could not have
   justified it anyway).
