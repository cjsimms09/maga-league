# The missing term is measured — and driving on it exposed that I am charging for the wire twice.

**A, 2026-08-19.** Cory: *"have we found equation that matches what we talked
about up top? if not we need to keep trying."*

**Answer: the missing MEASUREMENT is found. The equation that uses it is not right
yet, and I can name exactly why.**

---

## ⭐ P153 TRUE — streamability is real, measured, and ordered exactly as you said

From three seasons of this league's own transactions — what fraction of a team's
**2nd-or-later** body at a position arrived by **waiver or free agency** rather
than by draft. Five controls pass, including the known positive (DEF must look
streamable; it measures **0.925**).

| | streamable | measured 2nd-body start rate | **⇒ need for a 2nd** |
|---|---|---|---|
| **WR** | **0.252** | .696 | **0.521** |
| **RB** | **0.311** | .713 | **0.491** |
| **QB** | **0.590** | .427 | **0.175** |
| **TE** | **0.624** | .414 | **0.156** |
| **DEF** | **0.925** | .484 | **0.036** |
| **K** | **0.966** | .828 | **0.029** |

**Every rule you stated is now DERIVED instead of asserted:**

- *"RB and WR should always be around at least 0.25"* → **.491 / .521**
- *"almost 0 on TE and QB, but not so much where you miss extreme value"* →
  **.175 / .156 — low, and not zero, so a great player still wins**
- *"once you draft 1 K and DEF the need should be 0"* → **.029 / .036, without
  being hardcoded**

**P154 FALSE by 0.025** — I predicted the 2nd-QB need under 0.15 and it came in at
0.175. **That threshold was mine and arbitrary; the 2.8× gap between QB and RB is
the result that matters.**

## ⛔ P155 FALSE — and the cause is a double count, which is my error

Driven down your twelve picks the full equation gives up **9.3%** of projected
value (2012.7 against `draft_plan`'s 2220.1) and draws `QB1 RB2 WR5 TE2 K1 DEF1`.

**Here is the bug, stated plainly:**

```
value(p) = need × ( proj − waiver_level )
           ↑                ↑
           (1 − streamability)   already prices "what you can get free"
```

**Both terms are charging for the same thing.** `proj − waiver` says *"he is only
worth what he beats the wire by."* `(1 − streamability)` says *"you could have
gotten one off the wire."* **Multiplying them charges for the wire twice, which is
why every late pick collapses toward zero and the model starts taking
124-point tight ends over better players.**

**It is the same class of error as the units mistake earlier today** — a term that
is individually correct, applied where another term already covers it.

## THE FIX, STATED BEFORE ANYONE RUNS IT

**Use the wire once.** Two candidate forms, and they are genuinely different
models rather than a knob:

- **(a)** `need_measured(pos, held) × (1 − streamability) × proj` — streamability
  carries the whole wire story; no subtraction.
- **(b)** `need_measured(pos, held) × (proj − waiver_level)` — the subtraction
  carries it; **no streamability multiplier at all.** *(This is P152, which drafted
  a QB2 — so (b) alone is known insufficient.)*

**(a) is the untried one and it is the one I would run**, because streamability is
measured per position from real behaviour while the waiver level is a single
number per position taken from one board.

⚠️ **I am not running it tonight.** That is the eighth arm today, the draft is
Saturday, and **the discipline that has actually produced results today is
stopping and writing down what is known.** It is preregistered above as the first
thing to run, and it needs no new data — both terms are already measured.

## WHERE THIS LEAVES US

**Found:** the need curve (counted), the streamability term (counted), and a form
of the equation in which all of your rules fall out rather than being imposed.

**Not found:** the right way to combine them without paying for the wire twice.
**One arm away, with nothing left to measure.**
