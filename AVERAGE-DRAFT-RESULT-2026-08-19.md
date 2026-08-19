# The real test, run: 300 rooms. We are NOT there — and now the miss is exact.

**A, 2026-08-19.** Cory: *"so are we good, have we tested?"* · *"we know it right
when its **average draft** is 1QB, 4-5RB, 4-5WR, 1k, 1 def"*

**Straight answer: no, and everything I graded today was n = 1.** Nine arms, each
one deterministic drive down one board. **Your criterion is the distribution.
Here it is, over 300 simulated rooms** — the order players leave the board drawn
from `adp` jittered by the board's own `adp_sd`, so no two rooms are alike (57
distinct players ever gone by pick 33; the n=1 run falls inside the range). **All
five controls pass.**

## THE AVERAGE DRAFT

| | **mean** | sd | range | **you said** | |
|---|---|---|---|---|---|
| **QB** | **1.96** | 0.69 | 1–4 | **1** | ⛔ **one too many, every draft** |
| **RB** | **3.75** | 0.79 | 2–6 | **4–5** | ⛔ short |
| **WR** | **3.25** | 0.89 | 1–5 | **4–5** | ⛔ short |
| TE | 0.90 | 0.60 | 0–3 | *(not stated)* | reported for your ruling |
| **K** | **1.21** | 0.50 | 0–3 | **1** | ✅ |
| **DEF** | **0.93** | 0.27 | 0–2 | **1** | ✅ |

**P158 FALSE on three of five.**

## ⭐ AND THE THREE MISSES ARE ONE MISS

**QB is +0.96 over target. RB+WR is 7.00 against your 8–10.** The extra
quarterback is eating almost exactly the receiver depth you are short of. **Fix
the QB and RB/WR move up by a pick — it is one defect, not three.**

## ⛔ I KILLED MY OWN PROPOSED FIX BEFORE SPENDING ANYTHING ON IT

An hour ago I wrote: *"the narrow question is whether `waiver_level(QB) = 319` is
right… if the real streamable QB is better, the margin shrinks and the QB2
disappears on its own. That is one measurement, not another arm."*

**I ran that measurement. The best quarterback still on the board after 150 picks
is Tyler Shough at ADP 157, projecting exactly 319.0.**

**319 is not approximately right, it is exactly right. That hypothesis is dead**
— and it was the only "small tweak" I had.

## WHAT IS ACTUALLY CAUSING IT — a tension inside the ramp itself

At pick 93 the ramp values Brock Purdy at:

```
margin 35  ×  [ (1 − λ) + λ × need ]   =   35 × [ 0.50 + 0.50 × 0.175 ]  =  20.6
                 ↑
        this half is POSITION-BLIND
```

**The `(1 − λ)` term is your "draft value first", and it does not know whether you
can field the player.** A second quarterback's 35 points over replacement are real
arithmetic — **and almost entirely notional, because he starts 17% of weeks.** The
`need` term knows that. **The `(1 − λ)` bypass lets half of it through anyway.**

**That is a genuine tension in the design, and it is in your half of it, not
mine** — which is why I am putting it to you rather than patching it. **"Draft
value first" and "value you cannot field is not value" are both true, and at a
one-slot position they collide.**

**The candidate fix, stated and NOT run:** let the value-first term see
fieldability — i.e. the bypass applies at full strength only while a position's
starting slots are unfilled. **I am not running it tonight**; it is the tenth arm,
it changes your design rather than mine, and it should be your call.

## SO: ARE WE GOOD?

**No — and we are closer than nine arms of me saying "FALSE" made it sound.** You
were right to push back on that framing. The state is:

- **The equation's structure is right** and every term in it is now measured from
  your league rather than assumed.
- **K and DEF land exactly where you want**, from arithmetic, with no rule.
- **One systematic defect remains, worth about one pick per draft**, and it lands
  on the position you care least about while costing you the depth you care most
  about.
- **It is not the waiver level.** That is checked and eliminated.

⚠️ **And none of this is graded against OUTCOMES yet** — it is roster shape and
projected points. `roster_robustness.py` is the instrument for the real thing and
it is a post-draft run.
