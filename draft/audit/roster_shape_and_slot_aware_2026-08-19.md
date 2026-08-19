# Roster shape, and the slot-aware flag that passed three conditions of four

**A, 2026-08-19.** Cory: *"Still need to run much more labs on roster building,
too many RB. Roster still not normal... Need to strive for top 3!"*

Preregs: `ROSTER-SHAPE-PREREG-2026-08-19.md` (P120) ·
`SLOT-AWARE-VONA-REPREG-2026-08-19.md` (P119). Both filed before either ran.

---

## 1. THE HEADLINE REVERSES THE COMPLAINT

Drafted position counts per team-season from this league's own three complete
seasons, joined to finishing rank, top-3 against the rest, within-season
permutation, 4,000 shuffles, seed 20260819:

| pos | top-3 | rest | diff | p |
|---|---|---|---|---|
| QB | 1.56 | 1.76 | −0.21 | 0.494 |
| **RB** | **4.44** | **4.52** | **−0.08** | **1.000** |
| WR | 5.00 | 5.48 | −0.48 | 0.461 |
| **TE** | **1.89** | **1.29** | **+0.60** | **0.0043** ⭐ |
| K | 1.00 | 0.95 | +0.05 | 1.000 |
| DEF | 1.00 | 0.95 | +0.05 | 1.000 |

**RB does not separate winners from losers in this league. At all.** The
observed gap is 0.08 of a running back and the permutation cannot distinguish it
from noise. Three seasons of actual finishes say the thing we have been chasing
since register 59 is not where the title is decided.

**TE does, and it is the only one.** Top-3 teams draft 1.89 tight ends; everyone
else drafts 1.29. That is the single position that survives the null.

**And the tool is short on exactly that position:**

| | QB | RB | WR | TE |
|---|---|---|---|---|
| **top-3 teams** | 1.56 | **4.44** | 5.00 | **1.89** |
| tool, `s0` (shipped) | 2.07 | 4.77 | 5.10 | **1.00** |
| tool, `s1` (slot-aware) | 2.00 | 4.63 | 4.87 | **1.47** |

The tool's RB count is **4.77** against a top-3 mean of 4.44 — a third of a back,
on the position nothing separates on. **The gap that matters is TE, where the
tool drafts one and the winners draft nearly two.**

### The RB10 number and this number are not the same measurement

Register 59 and my own probe report **RB10/WR1**. This lab reports **RB 4.77**.
Both are mine and they are not in conflict — they measure different things:

- **RB10** comes from the live-board probe, which drains the room in **strict ADP
  order** across 15 picks. Its own header says this is the engine's dependence on
  the adjuster, *not* what happens on the 22nd.
- **RB 4.77** comes from 30 seat-years of the seat replay against reassembled
  era-appropriate bundles and real opponents, ~13 drafted players per seat.

**The realistic instrument does not reproduce the alarming number.** I flagged
this when I dispatched the RB10 claim to B, and this is independent evidence for
the same doubt. **I am not retiring register 59 on it** — B's check on the real
war room is still what settles it — but *"the tool drafts too many RBs"* should
stop being repeated as established, **including by me**, until that lands.

---

## 2. The slot-aware flag: three conditions pass, one fails, and it does NOT ship

`SLOT-AWARE-VONA-REPREG-2026-08-19.md` set four conditions and said **all four,
or the flag stays off.**

**① Collapse — PASS.** The recorded reason the flag is off was that flooring the
flex marginal at 0 tied 1331 of 1686 players at exactly 0 (78.9%) and QBs won the
tie. Re-taken at Cory's pick 48: **modal share 0.9%, 458 distinct values of 562.**
Threshold was 5%. The control confirms the branch executed rather than the probe
reading a short-circuit.

**② Seat replay — PASS, and better than I predicted.**

| | s0 | s1 |
|---|---|---|
| optimal, median owner delta | −174.4 | **−117.6** |
| optimal, Cory delta | −188.4 | **−84.5** |
| status-filtered optimal, beats | 1/10 | **3/10** |
| status-filtered realistic, Cory | −126.9 | **+27.8** |

Paired per seat-year: **mean +58.2, median +41.8, s1 better in 21 of 30 seats,
7/10 in every one of the three seasons.**

> **THE CI IS WEAKER THAN IT LOOKS AND I AM SAYING SO BEFORE ANYONE QUOTES IT.**
> The season-clustered bootstrap returns [+34.1, +100.9], which excludes zero —
> but with **three clusters** the 2.5% and 97.5% quantiles are just the smallest
> and largest of the three season means. That interval is arithmetic, not
> evidence. The real claim is the plain one: **3 of 3 seasons positive, 21 of 30
> seats.**

**③ Un-fieldable weeks — NOT MEASURABLE, and that is a defect in my own prereg.**
I wrote a condition the instrument does not report: the grade file carries no
un-fieldable-week counter, because the `optimal` estimand constructs a legal
lineup every week by definition. **A condition that cannot be evaluated is not a
passed condition**, and writing one is the same error as measuring against an
instrument that could not have seen the effect.

**④ One-start pileup — FAIL.** The condition: *"s1 must not raise the QB+TE count
on the simulated roster above s0's."* It rose: **3.07 → 3.47.**

### Why I am not overriding my own condition

The rise is **entirely TE** (1.00 → 1.47); QB actually *fell* (2.07 → 2.00). And
§1 says top-3 teams draft **1.89** tight ends — so s1 moved toward the one target
this league's history supports.

**I think condition ④ was mis-specified.** It used QB+TE as a proxy for the
historic tie-collapse failure, and what happened instead is a move toward a
measured target.

**I am still not shipping on that reasoning.** Rewriting a failed condition after
seeing which way it failed is precisely the move the whole preregistration
discipline exists to prevent, and the fact that my rationalisation is *plausible*
is what makes it dangerous rather than what makes it fine. **The flag stays off
and the call goes to Cory** with every number above.

---

## 3. Grades

**P119 — (a) TRUE, (b) FALSE.** The collapse test passed as predicted. But I
predicted the seat replay would be a **NULL**, on the reasoning that
tail-of-board reordering is what that estimand is least sensitive to. **It was
+58.2 with 3/3 seasons positive. The instrument saw it.**

**That matters beyond this flag.** P117 rests on the same reasoning about the
blended board, and it is now weakened by a live counter-example: this estimand
*can* resolve a change I expected it to be blind to.

**P120 — (a) FALSE, (b) FALSE, (c) TRUE.** I predicted no position would
separate; TE did, at p = 0.0043. I predicted that if anything separated it would
be WR; it was TE, and WR was the second-*least* significant. (c) held: s1 sits
closer to the top-3 RB mean than s0 (4.63 vs 4.77 against 4.44).

**Two of my three roster-shape predictions were wrong, and the lab is more useful
because of it** — I filed it expecting to *remove* an objective and it produced a
specific, measured, actionable one instead.

---

## 4. Limits, stated

- **n is small and clustered.** 9 team-seasons in top-3, 21 in the rest, three
  seasons, ten teams. The within-season permutation is the right null and it
  does not manufacture power that is not there.
- **93.3% of drafted players resolved to a position** (32 unresolved, mostly
  2023-era players no longer on the 2026 board). Unresolved are counted as
  UNKNOWN and excluded from position counts, so rosters are slightly
  undercounted — evenly, about one per team-season.
- **2023 drafted 18 players per team; 2024–25 drafted 15.** The permutation is
  within-season, so this does not leak into the comparison.
- **TE at p = 0.0043 is one position out of six.** A Bonferroni-style correction
  across six would put it at ~0.026 — still under 0.05, but it is one test in a
  family and should be quoted that way.
