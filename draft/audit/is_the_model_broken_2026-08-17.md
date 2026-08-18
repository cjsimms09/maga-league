<!-- TERRITORY: A -->
# IS THE MODEL BROKEN? — THE DIRECT TEST — 2026-08-17

**Cory:** *"I'm very scared that our model is fucked btw"*

A fair fear after a day of finding defects. It is also a testable claim, so it
was tested rather than answered with reassurance.

## THE TEST

Corrupt each broken field on the live board — grotesquely, not subtly — and see
whether the top 25 recommendations at pick 33 move at all.

| corruption | top 25 |
|---|---|
| `proj_ceiling` × 3 | **IDENTICAL** |
| `proj_floor` → 0 | **IDENTICAL** |
| `proj_sd` × 5 | **IDENTICAL** |
| `weekly_sd` → 0 | **IDENTICAL** |
| `variance` → 9 | **IDENTICAL** |
| `proj_mean` × 1.05 *(control)* | **board moves** |

The control fires, so the harness works. **Every field that was broken had no
influence on a single recommendation.**

## WHY

Traced to their consumers:

- **`proj_sd`, `weekly_sd`** — zero live JS consumers. Not one.
- **`proj_floor`** — display only (the "floor N" line on the player card).
- **`proj_ceiling`** — the composite `ceiling` term (weight **0.0**), the bench
  branch (`wCeil = max(BENCH_CEILING_FLOOR, w.ceiling)` = **0**), and
  `CEILING_TIEBREAK`, which is live but reorders 16 of 5,333 same-tier pairs
  and does not move the top 25 even at 3× the ceiling.

**The board ranks on `proj_mean` through VONA and the value anchor, plus keeper
and stack.** Those are the three weights that are non-zero, and all three carry
`measured` provenance.

## THE UNCOMFORTABLE PART, WHICH IS ALSO THE REASSURING PART

The fields were broken **and** unused, and those two facts are connected. The
weight tests that zeroed `ceiling` were correct *about the field they tested* —
it carried no information, so it earned no weight. The immune response worked.

What it could not do was distinguish **"this concept is worthless"** from
**"this implementation is empty."** That is the whole defect, and it is now
fixed in both directions: the fields are measured, and three weights
(`ceiling`, `need`, `risk`) are marked VOID rather than settled, because each
was zeroed on a measurement of a broken or wrong-context input.

## WHAT IS ACTUALLY AT RISK

**Not the draft board.** Nothing that was wrong was being used.

**The opportunity cost.** `need` moves 25 of 25 recommendations and ships at
0.0, zeroed as redundant with a mask `recommend()` never calls. That is not a
board producing wrong answers — it is a board producing answers with one of its
strongest instruments switched off for a bad reason. The cost is what we did not
gain, not damage we took.

## STANDING VERDICT, UNCHANGED SINCE 08-15

A good calculator of this league's economics; a mediocre forecaster. Trust the
decision logic, distrust the projection inputs. Nothing found today moved that
verdict — the defects were all in the layer already flagged as untrusted, and
the layer carrying the load (VONA, replacement, keeper economics, the scoring
table) was not touched by any of them.
