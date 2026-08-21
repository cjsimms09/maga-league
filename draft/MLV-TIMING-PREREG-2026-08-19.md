# PREREGISTRATION — give MLV a sense of WHEN

**A, 2026-08-19, before the code.** Register 133.

> Cory asked whether MLV is a decent strategy. My answer was **yes for "who",
> and it is not an answer to "when"** — it has no survival term, so it would
> take the 5th-best back at 48 because he tops the flex, without noticing a
> comparable receiver will still be there at 73 and that back will not.

## THE CHANGE

MLV today scores `marginal(c) = lineupValue(roster+c) − lineupValue(roster)`.
The timing arm subtracts what the position will still offer next turn:

```
value(c) = marginal(c) − marginal( best at c's position at my NEXT pick )
```

That is **VONA applied to marginal lineup value** rather than to raw points —
"what do I lose by waiting on this position", measured in the only currency
that matters, points that reach the starting lineup.

⚠️ **In the harness this needs NO survival model.** The counterfactual is
fixed-opponent, so who is gone at the next pick is a fact of the recorded draft,
not an estimate. **That makes this a clean test of the IDEA, and it also means a
pass does not license shipping it live** — the live board would need
`survival.js`, which is an estimate, and that is a second question.

## PREDICTIONS

**P237 — it beats plain MLV on both gradings.** Actual **> +45.8** and skill
**> +29.3**.

**P238 — and it keeps what MLV won.** Positive in **all three seasons on both
gradings** — the bar only MLV has cleared.

**FALSE if any of the six cells goes negative**, even if the mean improves. A
timing term that trades a season for a mean is not an improvement.

**P239 — the mechanism shows up in behaviour, not just the score.** The arm
takes running backs **earlier** than plain MLV — mean RB pick falls — because
RB is the position that actually depletes (2025 cliff 96 against WR's 61).

**FALSE if RB timing does not move**, in which case the score change came from
somewhere other than the thing this is supposed to fix.

## CONTROLS

1. **C1 KNOWN POSITIVE** — the subtracted term must be non-zero for a real
   number of candidates, reported as a count. If next-pick availability never
   bites, the arm is plain MLV wearing a new flag.
2. **C2** — K/DEF handling unchanged (excluded; the legality gate seats them).
3. **C3** — per season, never a pooled mean alone.
4. **C4** — paired against plain MLV, with sd and a t stated as an **upper
   bound** (3 correlated clusters).
5. **C5** — both gradings.

## GUARD

**Report only.** Even a clean pass does not ship to the live panel before
Saturday: the live version needs `survival.js` estimates rather than the
harness's perfect foresight, and that substitution is untested. **If it passes,
it is a post-draft build.** Nothing about `mlv.js` changes tonight.
