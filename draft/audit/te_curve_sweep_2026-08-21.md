# THE TE-CURVE SWEEP — 0.50 WAS NEVER SPECIAL; THE SHIPPED 0.05 IS THE OUTLIER, AND EVERY VALUE IN A WIDE PLATEAU BEATS IT

**Session D, 2026-08-21.** Completes the first half of register 132's own
stated next action — *"sweep TE\[1\] across a range rather than the single
tested 0.50"* — filed the day that row came due (recheck 08-21, before the
keeper lock). **REPORT ONLY. Nothing ships; `no_fit_guard` holds through
Saturday.** A's `draft/tools/roster_builder_replay.js` and
`draft/data/roster_builder_replay.json` are byte-identical to HEAD after
this work, verified by diff.

---

## 0 · HOW IT WAS RUN, AND WHY NOTHING OF A'S WAS TOUCHED

`roster_builder_replay.js` is **`TERRITORY: A`**, and the shipped `--te-boost`
flag is binary (0.50 vs 0.05) — a sweep needs the value parameterised. On the
eve of the draft, that edit was made to a **temporary sibling copy** in
`draft/tools/`, run, and deleted; A's file was never modified. Exactly one
line differed:

```
-  TE: TE_BOOST ? [1.00, 0.50, 0] : [1.00, 0.05, 0],
+  TE: [1.00, process.env.TE1 !== undefined ? parseFloat(process.env.TE1) : (TE_BOOST ? 0.50 : 0.05), 0],
```

**A side effect worth naming, because it is register 58's shape:** the tool
writes the committed `draft/data/roster_builder_replay.json` on *every* run,
so the first sweep passes silently overwrote it. Caught by `git status`,
restored, and the temp copy's output was repointed to a throwaway path for
the remaining runs. **A study that clobbers a committed artifact as a side
effect of measuring is a real hazard, and it bit here before it was noticed.**

**Verified clean before trusting any number:** the `TE_MEASURED`,
`--te2-only` and `--rb-measured` overrides can each replace `W.TE`
wholesale, which would have made the swept parameter inert. None was passed;
and the sweep produces different results at different values, which is the
positive proof the parameter is live.

## 1 · THE CONTROL — the harness reproduces BOTH already-recorded points

Rule 3f: before quoting any new value, the harness was run against the two
points register 132 already recorded.

| TE\[1\] | ACTUAL | SKILL | register 132 recorded |
|---|---|---|---|
| 0.05 (shipped) | −20.4 (14/30) | 7.9 (16/30) | −20.4 (14/30), +7.9 (16/30) ✓ |
| 0.50 (`--te-boost`) | +33.8 (18/30) | +29.2 (19/30) | +33.8 (18/30), +29.2 (19/30) ✓ |

**And the control extends to the per-season deltas**, which is the stronger
check: 0.05→0.50 moves ACTUAL by **+38 / +7 / +118** for 2023/2024/2025
against the row's recorded **+37.8 / +7.0 / +117.9**. Both endpoints and all
three season deltas reproduce, so intermediate values are trustworthy.

## 2 · THE SWEEP

| TE\[1\] | ACTUAL | SKILL | SKILL by season 23/24/25 | ACTUAL by season 23/24/25 |
|---|---|---|---|---|
| **0.05** *(shipped)* | **−20.4** (14/30) | **7.9** (16/30) | −31 / −0 / 55 | −62 / −61 / 62 |
| 0.10 | +7.9 (16/30) | 28.4 (18/30) | 17 / −4 / 72 | −22 / −59 / 104 |
| 0.15 | +13.1 (16/30) | 30.9 (18/30) | 17 / −4 / 79 | −22 / −59 / 120 |
| 0.20 | +16.6 (17/30) | 25.4 (18/30) | 17 / −21 / 80 | −22 / −47 / 118 |
| **0.25** | **+34.4** (17/30) | **32.1** (19/30) | 17 / −18 / 97 | −22 / −55 / 180 |
| 0.30 | +31.7 (18/30) | 30.6 (19/30) | 17 / −22 / 97 | −21 / −64 / 180 |
| 0.40 | +30.7 (18/30) | 28.0 (19/30) | 9 / −22 / 97 | −24 / −64 / 180 |
| **0.50** *(the one value tested)* | +33.8 (18/30) | 29.2 (19/30) | 9 / −19 / 97 | −24 / −54 / 180 |
| 0.65 | +8.1 (17/30) | 21.9 (20/30) | 13 / −14 / 67 | −16 / −42 / 81 |
| 0.80 | +16.6 (17/30) | 23.3 (21/30) | 30 / −27 / 67 | +22 / −54 / 81 |
| **1.00** | **−20.8** (10/30) | **1.3** (16/30) | 34 / −29 / −1 | −1 / −15 / −46 |

## 3 · WHAT THIS CHANGES ABOUT REGISTER 132'S FINDING

**(a) 0.50 is not a discovered optimum — it is one point on a wide plateau.**
Every value from **0.10 to 0.50** clears both of the call doc's bars (>+2.5
actual, >+7.9 skill), with SKILL between 25.4 and 32.1. The single tested
value was neither the best (0.25 leads on both metrics) nor distinguishable
from its neighbours.

**(b) The real finding is the SHIPPED value, not the boosted one.** Almost
the entire effect arrives by **0.10** — the first step off 0.05 moves ACTUAL
−20.4 → +7.9 and SKILL 7.9 → 28.4. The file's own comment explains the
mechanism: at 0.05 a second tight end is *"a twentyfold hole"*, i.e. an
effective prohibition. **0.05 is an outlier, and nearly any non-trivial value
is better than it.** That is a stronger and cheaper claim than "0.50 works,"
and it was invisible from a two-point test.

**(c) There IS a real interior optimum — the direction does not extrapolate.**
At **1.00** the arm collapses to ACTUAL −20.8 (10/30), SKILL 1.3 — no better
than the shipped curve. So "more TE is better" is false; the honest shape is a
plateau with bad ends.

**(d) An independent corroboration, WITH the caveat that nearly tripped me.**
`measured_need_curve.json`'s TE row is `[0.719, 0.414, 0.406, 1.0]`, so the
measured second-TE value is 0.414 — which *looks* like it lands inside the
plateau. **It is not directly comparable:** that curve's first value is 0.719
while `CORY_CURVE.TE[0]` is 1.00. On the comparable RATIO basis the measured
curve implies a second TE worth **0.576** of the first, against the shipped
**0.05**. That sits at the plateau's upper edge (between 0.50, good, and 0.65,
degrading). **The two methods agree emphatically that 0.05 is far too low and
disagree only about how far up to go** — which is the honest reading, and
quoting 0.414 as if it were on the same scale would have been a Rule 3i error.

## 4 · WHAT DID *NOT* GET ANSWERED — stated plainly

Register 132's next action had **two** parts. The sweep is done; **"look at
which specific 2024 pick(s) drive the skill loss" is NOT done.** The tool
prints no per-seat roster and its artifact carries `seat_years` as a count,
not rosters, so isolating the picks needs instrumentation beyond a one-line
parameter change — not something to build in A's file the day before a draft.

**And the sweep makes that question sharper rather than answering it: 2024
SKILL is negative at every value except the shipped 0.05** (−0, −4, −4, −21,
−18, −22, −22, −19, −14, −27, −29). Register 132 recorded this as a quirk of
0.50; it is systematic across the whole range. **Whatever 2024 is doing, it is
not an artifact of the one value tested**, and it is the single best reason
not to treat the plateau as a shippable number yet.

**Also visible across the range and worth stating: the arm's own ACTUAL level
stays NEGATIVE in 2023 and 2024 at every swept value** (2023 −22 to −24, 2024
−47 to −64 through the plateau) — only 2025 is positive, at +180. Register
132's "3/3 seasons agree in SIGN" was about the *improvement* from baseline,
which reproduces exactly; it was never a claim that the arm wins in three
seasons, and this table should not be read as one.

## 5 · ROUTED

**No ASK, nothing blocking, nothing shipped.** Register 132 stays open with
its recheck moved and this file as its evidence. The remaining work — the
2024 pick attribution — needs a per-seat roster dump, which is A's file to
extend and a post-draft job. **(1) Implies?** Any other single-value "flag
tested, it clears" result in the roster-construction family deserves the same
sweep before it is believed — a two-point test cannot distinguish a discovered
optimum from a plateau, and here it did not. **(2) Invalidates?** Nothing:
register 132's numbers all reproduce. It reframes them — the effect belongs to
escaping 0.05, not to reaching 0.50. **(3) Routed:** Cory/A still own whether
to pursue this; this file is the sweep they asked for before that call.
