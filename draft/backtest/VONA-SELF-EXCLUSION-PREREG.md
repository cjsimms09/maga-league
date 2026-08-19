# PRE-REGISTRATION — the VONA self-exclusion fix (register 56)

**Filed 2026-08-19 by A, BEFORE any arm was run.** Grade-by **2026-09-01**.
Ledger: **P107**.

---

## 1. The defect, restated in one line

`vona()` asks *"what does it cost me to wait on this player?"* and computes the
answer over a pool that **excludes the player himself**:

```js
const samePos = board.filter(p => p.position === player.position
                             && p.player_id !== player.player_id);
const sameEba = expectedBestAvailable(samePos, nextPick, ctx);
return player.proj_mean - sameEba;
```

If you pass on him now, then at your next pick he is **one of the players who
might be available** — with probability `s = P(he survives)`. Removing him from
that pool asserts `s = 0` for every player on the board.

Measured on the live board at pick 48 (next turn 53): Los Angeles Rams DEF,
`survival_to_next = 0.9999999995`, `vona = 14.0`. He is certain to be there and
the model prices the wait at fourteen points.

## 2. The correct quantity

Let `pos` be the player's position and `nextPick` this seat's next turn.

```
E[best available at pos at nextPick | I pass now]
    = E[max proj over survivors of the WHOLE pool, INCLUDING him]
VONA = proj_j - that
```

For the **top** player at a position this collapses algebraically to

```
VONA = (1 - s_j) x (proj_j - E[best OTHER at pos])
```

which is the shape prototyped on 08-19 — the wait only costs you in the worlds
where he is actually gone. **Below** the top of a position the two formulas
differ, and the include-self form is the one that stays correct there, which is
why it is arm A1 and the rescale is only a diagnostic.

## 3. Arms

| arm | what it is | flag |
|---|---|---|
| **A0** | the shipping engine, unchanged | `VONA_INCLUDE_SELF: false` (default) |
| **A1** | the player is in his own next-pick pool | `VONA_INCLUDE_SELF: true` |
| **A2** | naive rescale `(1 - s) x straight`, applied to everyone | `VONA_SURVIVAL_RESCALE: true` |

**A2 is carried as a DIAGNOSTIC and is expected to lose.** It is in the design
because the 08-19 prototype showed it collapsing VONA toward zero for everyone
who survives — which hands the ranking to the leftover terms and promoted deep
backup QBs (C.J. Stroud, Bryce Young, Geno Smith) into a top-6. Recording that
as a measured arm is the difference between a rejected alternative and an
assertion that one was considered.

## 4. Instrument

`draft/backtest/replay_seats.js` + `replay_seats_grade.py` — the real
`engine.js` sitting in every owner's seat across 2023/2024/2025 under the
fixed-opponents counterfactual, graded from the committed weekly stores.
`MEASURED_WEIGHTS`, K/DEF mirrored, keepers as history recorded them.

**Why this harness and not `cory_conditional.grade_room`:** register 49 —
the room simulator draws weekly scores from the board's own `proj_mean`, so it
answers *"does the board agree with itself"*. Both arms here share a projection
set, so that circularity is weaker than for a market-vs-tool question, but the
seat replay grades against **realised** points and does not need the argument.

**Population:** every seat, every season the grade side can score. Same board,
same opponents, same keepers in both arms — the ONLY difference is one filter
clause in `vona()`.

## 5. Predictions, registered before the run

**P107-a (headline).** A1's mean seat value-points beats A0's, **or ties**:
`mean(A1 - A0)` will not be negative with a CI clear of zero.
- **TRUE** if `mean(A1 - A0) > 0` and the 95% CI excludes zero.
- **NULL** if the CI straddles zero — *the expected outcome, stated as such:* a
  correctness fix concentrated in K/DEF and late-ADP players should be a small
  effect inside twelve graded rounds.
- **FALSE** if `mean(A1 - A0) < 0` with the CI clear of zero. **A CI-clear
  negative BLOCKS the fix and means something else in the scorer is leaning on
  the bug** — that finding would be worth more than the fix.

**P107-b (mechanism).** A1's disagreements with A0 will be **concentrated in
high-survival players**: the mean `survival_to_next` of players A1 ranks lower
than A0 does will exceed the board mean. If the disagreements are spread evenly
across survival, my account of the defect is wrong even if the points move.

**P107-c (the pathology check).** A2 will promote at least one unstartable
backup into the top 10 of a realistic mid-draft state where A0 and A1 do not.
- Graded on the live board at pick 48, stated as a named-player check.

## 6. Decision rule, fixed in advance

- **NULL on P107-a + TRUE on P107-b** → ship A1. A correct formula that does no
  measurable harm is still the correct formula, and the alternative is knowingly
  shipping an expression that asserts `P(survives) = 0` for the whole board.
- **TRUE on P107-a** → ship A1 and say so plainly.
- **FALSE on P107-a** → **do not ship.** File what the scorer is compensating
  with, as a new register row.
- **A2 ships under no outcome.** It is a diagnostic.

**AND A HARD DATE GATE, WHICH IS MINE AND NOT NEGOTIABLE BY A GOOD RESULT:**
nothing here reaches `public/draft_data.json` or the War Room default before
Cory's draft on **2026-08-22**. The flag defaults to the shipping behaviour, the
board Cory studies tonight is the board he drafts from, and a change to the
primary decision metric three days out is exactly the class of edit this project
has been burned by. If A1 wins, it ships **after** the draft — or Cory overrules
that, in which case it is his call made on a measured result rather than my
hunch.

## 7. What would make this study wrong

- **The seat replay cannot see K/DEF.** They are MIRRORED by design (identical
  on both rosters, cancelling in the skill-only grading) — so the population
  where the defect is LARGEST is the population the headline cannot grade. This
  is stated here, before the run, because it is the single biggest reason a null
  on P107-a would be uninformative rather than reassuring. P107-b exists to
  measure the mechanism where the headline is blind.
- Twelve graded rounds, ~20 seat-seasons: this is a small-N instrument and the
  CI will be wide. A null is cheap to obtain here and means little on its own.
- Historical FFC ADP is name-matched against today's Sleeper list (inherited
  bundle caveat), so survival inputs in the replay are slightly noisier than the
  live board's.
