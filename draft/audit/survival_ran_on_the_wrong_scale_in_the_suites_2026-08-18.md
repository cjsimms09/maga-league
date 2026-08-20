# E's twentieth sweep — survival ran on the wrong scale in 27 of 29 suites, and in two numbers I published myself

**Session E (red team), 2026-08-18.** Target chosen from my own re-derived term
table: **VONA is the largest term in the composite**, and it is built on the
survival model. So I went at survival.

**This sweep found a defect in my own two previous sweeps and corrects them.
That correction is the most important thing in this file.**

---

## THE MECHANISM

`survival.js:liveIndexOf` converts a **board slot** to a **live selection index**
through `ctx.pickBoard`. Keepers forfeit rounds, so the two scales differ: on
this board, `pick_order` has 150 rows of which **3 are keeper slots**, and board
slot 33 is live selection **30**.

When `ctx.pickBoard` is absent the function does not throw — it converts by
identity and increments a counter, and the module says exactly why:

> *"NOT a silent identity. keepers.py refuses here; refusing in the browser would
> blank the war room mid-draft, so this converts by identity AND records that it
> did, so a surface can say the scale is unconverted instead of quietly showing
> numbers from the wrong one."*

And its export comment:

> *"`SCALE` is the live evidence: unconverted > 0 with a pick board present means
> the context is not being threaded and **every survival number is on the wrong
> scale**, which is exactly how this defect survived until 2026-08-14."*

**The app is correct.** `app.js:2066` and `:6193` both thread
`pick_order.picks`. The gap is everywhere else.

## THE MEASUREMENT

At pick 33, production weights, Cory's keepers rostered, with and without the
pick board:

- **48 of 650 players (7.4%) shift survival by more than 0.05pp**
- among those, **median 1.4pp, max 12.5pp**
- the shifts are **concentrated in the ADP band around his next pick** — which is
  exactly the band where survival feeds VONA

| player | ADP | without | with | delta |
|---|---|---|---|---|
| Terry McLaurin | 52.4 | 80.2% | **92.8%** | +12.5pp |
| DJ Moore | 51.3 | 64.6% | 75.3% | +10.6pp |
| Zay Flowers | 34.4 | 21.1% | **12.1%** | −9.0pp |
| Tee Higgins | 36.1 | 21.3% | 12.8% | −8.5pp |

**Across Cory's twelve picks: the top recommendation differs at 2 of 12 —
including pick 33, his first — and 30 of 120 name slots move.**

## ⚠️ IT INVALIDATES TWO NUMBERS I PUBLISHED EARLIER TODAY

**1. The E19 headline figure.** I reported pick 33's production verdict as
*"LEAN Colston Loveland, gap 2.9"*. That was computed **without the pick board**.
The app reads **TOSS-UP Colston Loveland, gap 0.5**. The E19 conclusion is
unchanged — still **4 of 12 verdict words differ** — and the gap is in fact
**wider** than I claimed, but the figure was wrong.

**2. The term table I re-derived in `WAR-ROOM-SURFACE-CONTRACT.md`.** I published
`value 63.1 / onesie 25.2 / stack 11.6 / keeper 0.2`. On the app's scale it is:

| term | I published | actually |
|---|---|---|
| `value` (VONA) | 63.1% | **55.7%** |
| `onesie` | 25.2% | **27.5%** |
| `stack` | 11.6% | **16.6%** |
| `keeper` | 0.2% | 0.2% |

**The ORDER is unchanged, which is why every check still passed** — and it is why
the E18 conclusion (keeper was 14.3% because of a defect, and is really 0.2%)
survives intact. **The numbers were wrong and are corrected in the document**,
along with the roster-condition table and the two other places VONA's share
appears. A/B run under identical conditions, so the *comparisons* I drew were
valid; the *absolute* figures were not.

**I fixed the weights dimension of `ui_fidelity_verdict` this morning and missed
the pick-board dimension in the same file.** That is the same class I was filing,
in my own work, one dimension over.

## THE SPREAD — 27 of 29

Only **2 of 29** engine-driving suites threaded `pickBoard`. That included
**`survival_honesty.test.js`** — the suite about survival — which already read
`art.pick_order.picks` two lines above to build its intervening list and simply
never passed the same rows as the scale.

**Threaded in the four suites that claim production fidelity**, all of which stay
green:

| suite | why it earns the fix |
|---|---|
| `surface_contract.test.js` | re-derives the published term table |
| `rec_rows.test.js` | the canonical record of a fixture that did not match production |
| `sanity-sweep.test.js` | **the fourth fixture dimension in this file** — roster quality, board depletion and the weight vector are the three already recorded in its own comments |
| `survival_honesty.test.js` | it is the survival suite |
| `ui_fidelity_verdict.test.js` | fixed earlier today, and the pick board was the dimension I missed |

`sanity-sweep`'s reported open finding moves **47 → 50 → 53** bye-stacks across
the weight fix and this one. All four of its ENFORCED checks pass throughout.

## WHAT IS **NOT** DONE, AND IS THE JUDGEMENT FOR A

**23 engine-driving suites still do not thread it.** Most are mechanism suites on
synthetic rows where a pick board is meaningless — `engine.test.js`,
`needrule.test.js`, `no_nan_score.test.js` and the like — and forcing one in
would be inventing a fixture, not fixing one. **I did not touch them**, because
"does this suite claim to reflect production" is a judgement per file rather than
a rule I can apply mechanically, and getting it wrong in either direction is
worse than leaving it.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      None on the code -- five fixture fixes landed and no production
          code was touched. Two things to be aware of.
EVIDENCE: 48 of 650 survival numbers move up to 12.5pp; top recommendation
          changes at 2 of Cory's 12 picks; the published term table was on
          the unconverted scale and is corrected.
REC:      (1) The document numbers moved AGAIN and the override stamp at its
          head now covers both corrections -- please read it. (2) The
          remaining 23 suites need a per-file judgement, not a rule; most are
          mechanism suites where a pick board would be invented rather than
          threaded.
DEFAULT:  Leave the 23. Nothing before 08-22; no production code changed.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — board slot and live selection differ by 3 across
   the board (33 → 30, 148 → 145) because three keeper slots are forfeited.
2. **Did it arrive?** In the app, yes. In 27 of 29 suites, **no** — and
   `SCALE.unconverted` is the counter that says so.
3. **Could the check have fired?** Yes: `SCALE` exists for exactly this and reads
   `{converted: 0, unconverted: 1300}` on an unthreaded run.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It does not audit the survival MODEL** — only the scale its inputs are on.
   The three layers, the softmax temperature and the "interim model" caveat are
   unexamined.
2. **One board, one roster.**
3. **It does not thread the pick board into the 23 mechanism suites**, by choice,
   and says so above rather than implying full coverage.
