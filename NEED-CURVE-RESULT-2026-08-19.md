# You were right, and the bug is one line: `need` was asking about ONE WEEK

**A, 2026-08-19.** Cory: *"if 1 QB and TE has been drafted the need should drop
significantly … meanwhile on WR and RB the need should not drop as much until you
have 3-4 of each … figure it out"*

**The function already existed** (`draft_plan.js:307`) **and your first half was
already right. Your second half was not, and here is why.**

---

## 1. THE BUG

`pNeedNth` computes **P(n of your starters are out simultaneously, IN ONE WEEK)**.
The question is **"will I need this body in ANY of seventeen weeks"** — and byes
make it certain every starter misses at least one. **The shipped function cannot
see a bye at all.**

```
q(pos)  = (17 − games_expected + 1) / 17      measured from the board, +1 is the bye
          QB 0.147 · RB 0.224 · WR 0.176 · TE 0.188
weekly  = P(at least k of S starters out in a week)
season  = 1 − (1 − weekly)^17
```

## 2. THE CURVE, BEFORE AND AFTER — flex credited to RB

| | held 1 | held 2 | held 3 | **held 4** | held 5 |
|---|---|---|---|---|---|
| **QB** shipped | 0.140 | 0 | 0 | 0 | 0 |
| **QB corrected** | **0.933** | 0 | 0 | 0 | 0 |
| **RB** shipped | 1.000 | 1.000 | **0.627** | **0.191** | 0.022 |
| **RB corrected** | 1.000 | 1.000 | **1.000** | **0.902** | 0.174 |
| **WR** shipped | 1.000 | 0.360 | 0.040 | 0 | 0 |
| **WR corrected** | 1.000 | 0.999 | 0.416 | 0 | 0 |
| **TE** shipped | 0.220 | 0 | 0 | 0 | 0 |
| **TE corrected** | **0.971** | 0 | 0 | 0 | 0 |

**RB need at your fourth back goes from 0.191 to 0.902.** That is your *"should
not drop as much until you have 3-4"*, and the shipped curve was collapsing a
full two bodies too early.

## 3. ⭐ BUT THE HALF THAT MAKES YOUR RULE WORK IS NOT THE PROBABILITY

**Look at QB corrected: 0.933.** Season-long, you almost certainly WILL need a
second quarterback — his bye alone guarantees a week. **So need does NOT drop for
QB, and my first instinct that it should was wrong.**

**What drops is the VALUE, because you can stream one.** Priced as
`need × (last starter's points − the waiver level)`, with the waiver levels
`draft_plan.js` already measures (QB **319** · RB 112 · WR 124 · TE 124):

| | held 1 | held 2 | held 3 | held 4 |
|---|---|---|---|---|
| **QB** | **29.2** | 0 | 0 | 0 |
| **TE** | **16.9** | 0 | 0 | 0 |
| **RB** | 41.6 | 41.6 | **41.5** | **37.5** |
| **WR** | 58.4 | 58.4 | **24.3** | 0 |

> ### **2nd QB 29.2 · 2nd TE 16.9 — against 3rd RB 41.6 · 3rd WR 58.4**

**P143 TRUE. Your rule, quantified: a second quarterback has to clear a
41.6-point bar to be worth taking over a third running back. That is "only if the
value was incredible", with a number on it.**

**And it takes BOTH terms.** The probability says you need a QB2 (0.933). The
wire says he is nearly free, because the QB pool is 319 points deep where the RB
pool is 112. **Neither term alone produces your rule — the shipped model has the
wire term and a broken probability, which is why it kept drafting backs and
missing the shape.**

## 4. WHAT DID NOT WORK — P142 FALSE, on receivers only

I predicted RB **and** WR need ≥ 0.25 at both the 3rd and 4th body. **RB clears
it (1.000, 0.902). WR does not — 0.416 then 0.000.**

**The reason is legitimate and not a modelling failure: the FLEX belongs to
exactly one position.** This run credits it to RB, so RB has 3 slots and WR has
2, and whoever does not own the flex collapses one body earlier. **That is
correct football — you cannot start a third receiver while a back is in your
flex.**

⚠️ **The honest limit: at pick 33 you do not yet know who will own your flex.**
The curve above is one of two, and the WR column is the pessimistic one. **This
is the piece your rule still needs and it is not solved here** — filed as
register 110, post-draft.

## 5. WHAT I DID NOT DO

**`draft_plan.js` is untouched.** It feeds `public/seat_plan.json`, which the war
room reads at `app.js:867` — **changing the need curve three days out would move
what you see on draft night**, and that is what the freeze exists to stop. All of
the above is a new module, `draft/tools/need_curve.js`, report-only, five
controls passing including one that reproduces the shipped curve exactly.

**Run it: `node draft/tools/need_curve.js`.**
