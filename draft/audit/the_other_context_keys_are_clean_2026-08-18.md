# E's twenty-second sweep — the four remaining context keys, and a clean negative

**Session E (red team), 2026-08-18.** Sweep 21 enumerated all 20 keys
`app.js:context()` supplies, found `wireWeekly` (E22), and **explicitly left four
unswept**: `doctrine`, `ceilingAllStages`, `drift`, `myPickIndex`, each passed by
only ~7 of 29 engine-driving suites. This closes that gap.

**THE RESULT IS NEGATIVE. All four are correct, and this file states the method
so the negative is checkable rather than reassuring.**

---

## 1. `myPickIndex` — 18 suites fall to the guess, and the guess is unreachable

`app.js:2035` warns that without it, `pickIndexOf` falls back to a **GUESS**
(`13 - myPicksLeft`), *"so every roster-relative weight was evaluated at an
estimated position in the plan."* That reads alarming, and 18 of 29 suites land
there.

**The fallback chain is better than the warning implies.** Branch 2 —
`totalMyPicks - myPicksLeft + 1` — is exact, not a guess; the guess fires only
when `totalMyPicks` is *also* absent.

**And it does not matter, because `pickIndexOf` has exactly ONE consumer:** the
doctrine tilt (`engine.js:1543`), which returns 0 before reaching it whenever
`ctx.doctrine` is falsy. **Of the 18 suites landing on the guess, exactly one
(`doctrine-governance.test.js`) passes a doctrine at all** — and that is a
mechanism suite on synthetic rows. In the other 17 the guess is never evaluated.

**Inert. No change made.**

## 2. `doctrine` — 22 suites omit it, and null is what production has

Verified end to end rather than assumed:

- `build.py:1787` **does** write `"doctrine": _load_doctrine()`.
- `_load_doctrine` reads `draft/backtest/cory-conditional.json`, which exists and
  carries `enrolled: "balanced"`.
- **`"balanced"` is the CONTROL** (`control: "balanced"` in the same file), and
  by construction the control never appears in a leaderboard of challengers —
  the seven rows are `late_qb, zero_rb, hero_rb, wr_anchor, robust_rb, early_qb,
  elite_te`. So the winner lookup finds nothing and the function returns None,
  printing *"nothing enrolled (no archetype cleared its gate)"*.
- The board therefore carries `doctrine: null`, and
  `DraftDoctrine.enrollment(null)` reports *"no doctrine enrolled — running the
  control"*.

**Every link says the same true thing.** The module's own rule — *"an un-raced
doctrine must never render as a verdict"* — is honoured.

**A COVERAGE NOTE, NOT A DEFECT:** with a doctrine enrolled the tilt is potent —
`doctrine: 'zero_rb'` moves **406 of 630 scores** at pick 53
(`DOCTRINE_TILT = 2.5`). So the 22 suites omitting it would not catch a
doctrine-tilt regression. That is a limit of the current coverage and is only
reachable once an archetype clears its gate.

## 3. `ceilingAllStages` — inert under the shipped weights, and measurably so

| weights | scores changed by `ceilingAllStages: true` |
|---|---|
| `MEASURED_WEIGHTS` (ceiling **0.0**) | **0 of 630** |
| `DEFAULT_WEIGHTS` (ceiling 0.65) | 551 of 630 |

**Omitting it is correct for production**, and the contrast row proves the check
could have fired. (If the ceiling weight ever ships non-zero — Brief §7b holds it
at 0 through the draft deliberately — this flips from inert to material, and the
22 suites omitting it become a real gap on that day.)

## 4. `drift` — potent in general, negligible for the fixtures that omit it

`drift` is a **live, mid-draft** quantity: `updateDrift()` builds it from
`state.recentPicks`, so pre-draft it is null in production too.

With a genuinely drifting room (8 picks ahead of ADP) it is the largest
single-key effect I have measured: **549 of 630 scores change.** So the question
is whether the fixtures that omit it are entitled to.

**They are, and it is self-consistency rather than luck.** The market-follow
fixtures deplete the board in ADP order, so the room they simulate is drafting
*at* ADP. Measuring `adpDrift` over that exact sequence returns an offset of
**−0.039 picks** with `message: null`. Passing that object instead of `null`:

- **189 of 630 scores change**, by at most **0.027 points**
- **0 top-10 name slots move**

**Correct as written. No change made.**

## THE METHODOLOGICAL CATCH, RECORDED BECAUSE IT NEARLY FOOLED ME

My first `drift` test passed a **guessed shape**, `{qb: 2, rb: -2}`, and returned
**0 of 630 changed**. I nearly filed that as "inert". The real object is
`{n, applied, offset, sdScale, meanSigned, mad, message}` — and with it, 549
scores move.

**A wrong-shaped fixture reads exactly like an inert input.** That is the same
trap as `|| undefined` weights, `(vorp || 0)`, and the missing pick board: the
run completes, nothing errors, and the number is confidently wrong. It is worth
recording that the trap caught the person sweeping for it, twice in two days.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It measures at one pick on one board.** `ceilingAllStages` and `drift` were
   measured at pick 53; the doctrine tilt likewise.
2. **It does not re-examine the keys sweep 21 already cleared**, nor the 23
   suites deliberately left without a pick board (E21).
3. **`preDraftPrep` is untested beyond reading its gate** — `engine.js:2568`
   returns the board unchanged unless it is set, and its default is the live
   path, so omitting it matches production. Not measured.

### → **A** — no action required

```
ASK:      None. Reporting a negative so the gap I named in E22 is closed
          rather than left hanging.
EVIDENCE: myPickIndex's guess is unreachable without a doctrine (17 of 18
          suites); the doctrine chain is coherent end to end and honestly
          labelled; ceilingAllStages moves 0 of 630 at ceiling weight 0.0
          and 551 at 0.65; drift moves 549 with a real drifting room but 189
          by <=0.027 points and 0 top-10 slots for the market-follow
          fixtures that omit it.
REC:      Two dated notes rather than actions. (1) If the ceiling weight ever
          ships non-zero, the 22 suites omitting ceilingAllStages become a
          real gap that day. (2) If an archetype ever clears its gate, the 22
          omitting `doctrine` would not catch a tilt regression that moves
          406 of 630 scores.
DEFAULT:  Nothing. No code changed by this sweep.
```
