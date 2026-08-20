# E's nineteenth sweep — the line said "insurance, not a starter" while pricing him as a starter

**Session E (red team), 2026-08-18.** Target chosen from my own re-derived term
table: **`onesie` is 25.2% of what separates the top five — the second-largest
driver — and it is applied POST-assembly, outside the weight vector entirely.**
No weight controls it, so nothing in `MEASURED_WEIGHTS` can turn it down.

---

## THE CLAIM ON SCREEN

With **George Kittle (TE, flagged PUP, proj 152.8, ADP 92.5)** rostered as TE1
and the FLEX closed, the board at pick 73 read:

```
  4. Travis Kelce           TE   score 6.1
     TE2 — your starter is flagged PUP; this is insurance, not a starter
```

**He was not priced as insurance. He was priced as a starter, at full value.**

`onesieState`'s injury exception returns `discount: 1`, and the application in
`recommend` is gated on `onesie.discount < 1` — so this branch applies **no
discount at all**, exactly as if the position were empty. The plain-duplicate
path takes `ONESIE_KEEP = 0.1`, a 90% cut.

**Measured, same roster, only the TE1's status changed:**

| TE1 status | Kelce's rank at pick 73 | score | discounted |
|---|---|---|---|
| **PUP** | **4** | **6.1** | **no** |
| IR | 4 | 6.1 | no |
| healthy | 8 | 0.6 | yes |

**A tenfold difference in score and four board places, under a line telling the
reader he was not being treated as a starter.**

## THE PRICE IS DEFENSIBLE. THE SENTENCE WAS NOT.

If your starter is on PUP, the backup plays. Full value is the football-correct
answer, and this branch is the one place the file's governing principle —
*"priced low because he cannot start"* — genuinely does not apply, because here
he can.

That matters, because the **value** exception fifty lines above was explicitly
corrected away from `discount: 1` for the opposite reason:

> *"THE EXCEPTION SURVIVES AND NO LONGER SETS THE PRICE. It used to return
> discount 1 whenever the cap did not bind, which is how a second quarterback
> reached FULL VALUE and board rank 1: Lamar Jackson at pick 70…"*

**So this is NOT the same defect wearing a different hat, and I am not filing it
as one.** The correction there was right and would be wrong here. **The price
stays; the sentence changes.**

## WHAT SHIPPED — the sentence, and nothing else

```
TE2 — your TE1 is flagged PUP, so he is priced as a STARTER at full value,
NOT discounted as a backup. The model does not weigh how long that status lasts.
```

**No number changed, nothing reordered, no scoring path touched.**

## AND THE SECOND HALF, WHICH IS A'S — DURATION IS NOT MODELLED

Every status in `SERIOUS` is treated identically. **Measured: PUP and IR produce
the same rank and the same score, to two decimals.**

- **PUP** is a minimum four-game absence, after which the starter returns — so
  the backup is a four-week starter and an unstartable duplicate thereafter.
- **IR** is usually the season.

The model prices both as a full-season starter. That is a real modelling
question, not a defect I should decide, so the honest interim move is to **say
it on screen** rather than let a reader infer a distinction the model never
made. The last sentence of the new line does exactly that.

## FLAGS THAT DIED THIS SWEEP

1. **"Does a onesie duplicate ever surface without saying what it is?"** The
   engine claims *"A onesie duplicate NEVER appears without saying what it is."*
   Checked every return path in `onesieState`: all four that set
   `duplicate: true` carry a non-null `why`, and `recommend` unshifts it onto
   `reasons`. **The claim holds.**
2. **"Is `onesie.discount` a per-cell constant?"** — the §1 class. It is
   `ONESIE_KEEP = 0.1` or `1`, a genuine binary structural fact (can he start or
   not), not a dispersion figure dressed as a judgement. **Not the class.**
3. **The hard cap** (`ONESIE_MAX_SPARE`, `wouldCap`) — `CFG.ONESIE_HARD_CAP` is
   off and the constants were deleted on Cory's 2026-08-14 ruling. `wouldCap`
   still computes to `null → false` and travels in the return. Dead but inert,
   and its deletion is already recorded in the file. **Not re-filed.**

## THE GUARD — `draft/tests/injury_onesie_says_it_prices_a_starter.test.js`, 13 checks

Including: the premise (a real PUP starter is on the live board, so the scenario
is not hypothetical); a **known-positive** that the exception fires undiscounted;
a **control** that the same player IS discounted with a healthy starter; the
material price difference; a **known-positive that PUP and IR really are
identical**, so the disclosure is not decoration; and a fail arm asserting the
old sentence is gone from source **and that the branch still returns
`discount: 1`** — the price was deliberately left alone.

**29 of 29** suites touching `onesie` / `injury_status` / `ONESIE` pass, plus
`sanity-sweep` (13/13), `engine`, `surface_contract`, `rec_rows`,
`ui_fidelity_verdict` and `onesie_cap`.

### ASK / EVIDENCE / REC / DEFAULT → **A** (owns `engine.js`)

```
ASK:      Should the injury exception distinguish DURATION -- PUP (a four-game
          absence) from IR / Out (usually the season)?
EVIDENCE: PUP and IR produce an identical rank and score. With Kittle (PUP)
          rostered, Kelce goes rank 8 -> 4 and score 0.6 -> 6.1 versus a
          healthy starter. A four-week starter is priced as a season starter.
REC:      The sentence fix has SHIPPED and is the whole of what I am willing
          to do pre-draft -- it changes no number. On the model question I
          lean toward pricing PUP between the two (he starts ~4 of 17 weeks,
          then is a duplicate again), but that is a valuation decision and
          not a red-team one.
DEFAULT:  Do nothing before 08-22. The affected population is small -- 18
          players carry a SERIOUS status and only Kittle (ADP 92.5) and Alec
          Pierce (ADP 84.6) are inside pick 150 -- and it only bites once
          Cory has already rostered one of them.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — `injury_status` takes 9 distinct values on the
   live board and 18 players carry a SERIOUS one.
2. **Did it arrive?** Yes — it reaches `onesieState` and changes the returned
   discount, measurably (rank 8 → 4).
3. **Could the check have fired?** Yes, and the control proves it: the same
   player with a healthy starter IS discounted, at rank 8 and score 0.6.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **One position, one roster shape.** Measured at TE with the FLEX closed. The
   mechanism is position-agnostic, but the FLEX gate means RB/WR reach it only
   in narrower states.
2. **It does not audit `SERIOUS`'s membership** beyond noting that all members
   are equal. Whether `Questionable` should stay excluded is settled in the
   file's own comments and was not re-examined.
3. **One board.**
