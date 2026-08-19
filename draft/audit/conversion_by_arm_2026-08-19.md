# P127 graded early: both A13 arms buy their points ENTIRELY by conversion — and only one of them fixes the roster

**A, 2026-08-19.** Prereg: **P127**, filed this morning with its metric fixed in
advance. Lab: `draft/backtest/conversion_by_arm_lab.py` →
`conversion_by_arm_lab.json`. Three controls, all passing.

**Graded 17 days early on purpose.** Cory rules A13 by **Friday 08-21 6pm**, and
A13 is exactly *"points or roster shape"*. An answer that arrives on 09-05 is an
answer to nobody.

---

## 1. THE RESULT — the gap does not just close, it overshoots

Conversion = lineup points ÷ roster points, `optimal` estimand, 30 seat-seasons.

| arm | 2023 | 2024 | 2025 | gap vs owners |
|---|---|---|---|---|
| **owners** | 0.828 | 0.826 | 0.834 | — |
| **shipped** | **0.740** | 0.815 | **0.771** | −0.087 · −0.011 · −0.062 |
| **need1** | **0.876** | **0.849** | **0.829** | **+0.049 · +0.023 · −0.004** |
| **slot_s1** | **0.878** | 0.825 | 0.815 | +0.051 · −0.000 · −0.018 |
| auto | 0.882 | 0.861 | 0.812 | +0.054 · +0.035 · −0.022 |
| bye1 | 0.740 | 0.815 | 0.771 | *identical to shipped* |
| slot_s0 | 0.740 | 0.815 | 0.771 | *identical to shipped* |

**P127 is TRUE.** Its prediction was that a `need` arm *"closes a majority of the
conversion gap"*. It closes **all** of it and overshoots in two of three seasons.

**`bye1` is bit-identical to shipped**, which independently reproduces register
69 — the bye arm's weight was applied and the term it multiplies contributed
zero at every pick.

## 2. THE DECOMPOSITION, WHICH IS THE ACTUAL NEWS

Points per seat-season against shipped:

| arm | **lineup** points | **roster** points |
|---|---|---|
| **need1** | **+68.6** | −267.9 · +38.6 · −67.7 (**mean −99.0**) |
| **slot_s1** | **+58.2** | −285.3 · +99.2 · −65.0 (**mean −83.7**) |
| auto | +16.9 | mean −156.7 |

**Both A13 arms ACQUIRE LESS RAW VALUE than the shipped configuration and win
anyway.** `need1` holds 99 fewer points on its roster and starts 68.6 more of
them. **The entire gain of both arms is conversion. Neither is buying points by
drafting better players.**

That is register 87 confirmed from the opposite direction: the shipped engine's
defect is what it can start, and the arms that gain points are precisely the
ones that fix starting.

## 3. THE CONTROL THAT MATTERS MOST FIRED BY ACCIDENT, AND IT IS THE STRONGEST

**This lab independently reproduces BOTH of A13's committed headline numbers to
the decimal — `need: 1.0` at +68.6 and slot-aware at +58.2 — from a code path
written today that shares no logic with the dispatch that produced them.**

I did not design that as a control; I noticed it when the numbers came out.
Two independent constructions agreeing to 0.1 points on 30 seat-seasons is
stronger evidence that both are computing the intended quantity than any
assertion either could make alone.

The three deliberate controls also passed:

| control | result |
|---|---|
| `slot_s0` is the shipped config under the slot-aware harness — must reproduce it exactly | ✅ identical, all three seasons |
| owner conversion cannot depend on which engine arm ran | ✅ identical across all six arms |
| conversion ∈ (0, 1] | ✅ 18 of 18 |

## 4. AND THE PART THAT DECIDES A13 — conversion and "normal roster" ARE NOT THE SAME OBJECTIVE

Mean positional counts, 30 seat-seasons, against this league's winners:

| | QB | RB | WR | TE |
|---|---|---|---|---|
| **top-3 teams (15-pick seasons)** | **1.33** | **3.83** | **5.17** | **1.83** |
| shipped | 2.07 | 4.77 | 5.10 | **1.00** |
| **need1** | 1.63 | **5.83** ⛔ | 4.33 | 1.13 |
| **slot_s1** | 2.00 | **4.63** ✅ | 4.87 | **1.47** ✅ |
| auto | 1.80 | 5.43 | 4.37 | 1.33 |

**`need: 1.0` fixes conversion by drafting a FULL EXTRA RUNNING BACK** — 4.77 →
5.83, against a winners' mean of 3.83. Running backs are flex-eligible, so a
pile of them starts well; it converts beautifully and looks nothing like a
winning roster. **That is Cory's *"too many RB"* complaint, made worse, by the
arm with the bigger number.**

**`slot_s1` is the only arm that moves BOTH positions toward the winners at
once** — RB down (4.77 → 4.63) and TE up (1.00 → 1.47). **It is also the only
thing that breaks the degenerate TE constant** register 87 found: exactly one
tight end in 30 of 30 shipped rosters, and no arm but slot-aware moves it
meaningfully. No arm reaches the winners' 1.83.

### So the choice has a price tag now, not a preference

**The 10.4 points per seat-season between `need1` (+68.6) and `slot_s1` (+58.2)
is what a roster resembling the winners' costs.** That is the whole of A13,
stated as a number, and it is well inside the ±41.8 detection floor — **so the
two arms are NOT distinguishable on points, and the shape difference is the only
thing that separates them that this instrument can actually see.**

## 5. WHAT THIS DOES NOT DO

**It selects nothing.** `no_fit_guard`: six arms graded on a metric fixed before
the run, output routed to the person whose decision it is. **My recommendation to
Cory is unchanged from before I ran this — ship slot-aware, hold `need` at 0 —
and that matters: the measurement did not move my advice, it gave it a reason.**

**Engine-on-bundles**, which hands the engine strictly less than the live board:
risk age-only, injury/depth/opportunity declared absent, walk-forward projections
rather than the shipped multi-source mean.

**And the shape target is itself thin** — 6 top-3 team-seasons on the matched
15-pick cut, where neither RB nor TE clears p < 0.05 (register 71). **The
direction is better evidenced than the magnitude, and nobody should read 3.83 as
a target to hit.**

## 6. RULE 3g

**Implies another failure?** Yes: **`auto` converts BEST of all arms (+0.054 /
+0.035 / −0.022) and gains the FEWEST points (+16.9)** — it fixes starting while
losing 157 roster points per seat-season. The war room's Auto adjuster is what
Cory drafts behind by default if he rules nothing, so its acquisition cost is now
a live question nobody has asked.

**Invalidates something we trust?** It sharpens rather than invalidates A13: the
row's framing of *"points versus shape"* survives, but *"the bigger graded number
belongs to the arm that makes the roster worse"* is now explained rather than
merely observed — both arms are shape fixes, and they differ in **which** shape.

**Routed?** A13 in `CORY-ASKS.md`, updated with this table. E owns whether the TE
target makes football sense.
