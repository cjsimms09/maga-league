# PREREGISTRATION — VONA · normal roster · upside LATE, with upside calculated correctly

**A, 2026-08-19, filed and committed BEFORE the model runs.** Draft 08-22.

**Cory, verbatim:** *"PLEASE MAKE ME A MODEL THAT USES VONA, AND DRAFTS A NORMAL
ROSTER AND DRAFTS UPSIDE LATE (FIND A WAY TO CALC UPSIDE CORRECTLY!!!!!"*

---

## 1. THE MODEL, IN FOUR RULES. NO WEIGHTS, NOTHING SUMMED.

```
SEATS      my picks are assigned to starting slots by exact optimisation
           (draft_plan.js's DP — reused, not reimplemented)

STARTER    value = VONA = proj(best available at pos NOW)
seats            − E[proj(best available at pos at my NEXT pick)]
           ties broken toward the LOWER-uncertainty player

BENCH      shortlist = top N by bench value
seats                = P(need at pos) × (proj − what is FREE on waivers)
           CHOOSE FROM THE SHORTLIST BY UPSIDE, not by value

ONESIES    K/DEF only in the last two seats — and they price negative on
           their own, so this is a check, not a rule
```

**Why this shape and not a composite:** the reference implementation
(`ffanalytics`) emits `rank`, `floor_rank` and `ceiling_rank` as **three
separate rankings and never adds them together**, and the textbook says
starters want *low* uncertainty while benches want *high*. **This is that
prescription implemented literally.** Our shipped engine instead sums
`VONA + 0.45 × ceiling` on every player at every pick, which is the thing Cory
objected to. Registers 99, 104.

## 2. ⭐ UPSIDE, CALCULATED CORRECTLY — the definition and why the obvious ones fail

**Three candidate definitions, all measured on the live board before choosing:**

| definition | correlation with `proj_mean` | verdict |
|---|---|---|
| raw `proj_ceiling` | **+0.9951** | it IS value. useless. |
| cross-source spread (`ceiling − mean`) — **what we ship at 0.45** | **+0.70** (TE +0.91) | 70% a second copy of value |
| **residual upside** — spread MINUS the typical spread at that player's own level and position | **+0.04** | **orthogonal. this one.** |

**DEFINITION USED:**

```
spread(p)  = proj_ceiling(p) − proj_mean(p)          [cross-source only]
upside(p)  = spread(p) − median{ spread(q) : q same position,
                                 |posrank(q) − posrank(p)| ≤ 7 }
```

**In words: how much more uncertainty does he carry than players as good as he
is?** A 250-point receiver with a 60-point spread is a real swing; a 250-point
receiver with a 20-point spread is not, and today's model cannot tell them apart
because it rewards the raw number.

⚠️ **ABSENT, NOT ZERO.** `spread` exists only where a player has cross-source
disagreement. **A player with no spread gets NO upside score and falls back to
bench value, and the report says which picks that happened on.** Fabricating a
zero would silently rank unknown players as "average upside", which is the
`opportunity_adj` failure mode (register 101) in a new place.

⚠️ **AND THE TRAP, STATED BEFORE IT BITES:** residual upside alone drafts
terribly — it ranks a backup QB above a starting RB, because uncertainty is
highest where a player is unproven. **That is exactly why it selects only WITHIN
a value shortlist and never sets the shortlist.**

## 3. PREDICTIONS

**P137 — the roster is normal.** On Cory's real twelve picks with his real three
keepers, the 15-man roster has **≥2 QB, ≥2 TE, ≤6 RB, ≥4 WR, exactly 1 K and 1
DEF.** FALSE if any bound is missed.

**P138 — upside actually changes the bench, and only the bench.** The
upside-selected bench differs from `draft_plan.js`'s value-selected bench on
**at least 2 of the bench picks**, while the **starter picks are identical**.
FALSE either way: if the benches match, the upside term does nothing and the
model is `draft_plan.js` with extra machinery; if a starter moves, the shortlist
rule leaked into the seats and the design is wrong.

**P139 — the upside picks are not just worse players.** The upside-selected
bench players' median **ADP is later** than the value-selected ones (they are
cheaper), and their median `proj_mean` is **within 15%** of the value picks'.
FALSE if upside is buying materially worse projections — that would mean the
shortlist N is too wide.

## 4. CONTROLS — void if any fails

1. **Seat identity.** The starting-slot assignment must match `draft_plan.js`'s
   exactly. This model reuses that DP; if it disagrees, it has reimplemented it.
2. **Orthogonality, re-measured on THIS board, not quoted.** |Spearman(upside,
   proj_mean)| < 0.25 across priced players. If our upside is really a second
   copy of value the model must refuse to run.
3. **Shortlist discipline.** Every bench pick must appear in that pick's own
   value shortlist. An upside pick from outside the shortlist is the trap of §2.
4. **Absence is reported.** The count of picks where no upside score existed is
   emitted, not silently defaulted.
5. **Roster legality.** Exactly 15 players, every starting slot fillable in at
   least one week.

## 5. THE GUARD

**REPORT ONLY. It writes no board field, changes no weight and ships nothing.**
`no_fit_guard` holds: **N (the shortlist width) and the ±7 window are declared
HERE, before the run, and are not to be tuned by looking at the output.** If the
roster looks wrong the answer is a new preregistered definition, not a nudged
constant — that is how `need`, `ceiling` and `opportunity_adj` each went wrong.
