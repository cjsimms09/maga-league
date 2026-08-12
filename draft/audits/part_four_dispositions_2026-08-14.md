# PART FOUR — A DISPOSITION FOR EACH. NOTHING SILENTLY DEFERRED.

**Closure condition:** BUILD, RESEARCH FIRST, or REJECT WITH REASON.

**And the instruction that shapes every row below:** *"DO NOT RESPOND TO THIS WEEK
BY MAKING THE PROJECT MORE COMPLICATED. The evidence points at one pattern:
something is described one way, behaves another way, and nobody had a
verification boundary that compared the two. THE FIX IS NOT MORE MACHINERY."*

---

## THE ONE THING THAT DECIDES SIX OF THESE

Item 10 established that **the Lab's board is not the board we ship**.
`build_bundle.py` writes 12 player fields; production writes 48. On a bundle
board the `risk` term takes exactly ONE value (0.0) and `proj_ceiling` is a fixed
1.35× of `proj_mean`, making the ceiling term rank-identical to value
(Spearman 1.0000).

**Items 22, 25, 26, 27 and 30 all run on that board.** They are not eleven
independent questions; they are five questions waiting on one fix and six that
are not. Fixing `build_bundle.py` to carry the real fields is ONE change that
unblocks five items — which is the opposite of more machinery, and it is why the
dispositions below cluster rather than scatter.

> **THE BOARD FIX IS THE PREREQUISITE, NOT AN ITEM.** It is not on Cory's list
> because nobody knew it was needed until yesterday. Every "RESEARCH FIRST —
> BLOCKED" below resolves to BUILD the moment it lands.

---

## 31. CALIBRATION DRIFT — **BUILD, AND IT IS MISFILED**

**This is not a Part Four monitoring item. Survival is an input to the only term
that carries weight.**

```
VONA = proj_mean − expectedBestAvailable(samePos, nextPick)
expectedBestAvailable = Σ proj_j × surv_j × Π(1 − surv_i)
```

VONA is a survival-weighted expectation and `MEASURED_WEIGHTS.value = 1.0`.

Measured (`draft/tools/survival_sensitivity.js`), mean ΔVONA for the best
available player at each position across Cory's twelve picks:

| survival over-predicted by | QB | RB | WR | TE | K | DEF | **spread** |
|---|---|---|---|---|---|---|---|
| 15% | +1.5 | +2.0 | +1.0 | +0.9 | +0.5 | +0.4 | **1.6** |
| 40% | +4.8 | +6.4 | +3.1 | +3.2 | +1.1 | +1.5 | **5.3** |
| 57% (worst window) | +9.1 | +11.3 | +5.7 | +5.8 | +1.8 | +2.8 | **9.5** |

Against `COIN_FLIP_GAP` 1.0, `TIE_THRESHOLD` 2.0, `CLOSE_GAP` 3.5. **Even the
mild end exceeds coin-flip; the worst end is 2.7x close-gap.**

*The first version of this table measured four positions and reported the worst
spread as 5.6. Cory asked what it did for the others. K and DEF are mandatory
starting slots that get drafted, and they sit at the BOTTOM of the range — so
leaving them out did not just omit two rows, it understated the spread by 70%.
Measuring four of six and calling it a positional table is the same shape as a
signature that never called the surfaces it was scoring.*

**WHY K AND DEF BARELY MOVE, measured rather than assumed:**

| pos | proj of best | drop to 5th | drop to 10th | mean survival to next pick |
|---|---|---|---|---|
| QB | 406 | 26.4 | 61.4 | 0.841 |
| RB | 345 | 33.3 | 57.4 | 0.775 |
| WR | 298 | 15.6 | 29.7 | 0.751 |
| TE | 233 | 19.5 | 35.0 | 0.878 |
| K | 107 | 6.5 | **9.3** | **0.986** |
| DEF | 114 | 9.3 | **14.3** | **0.970** |

Sensitivity is the product of positional SPREAD and survival UNCERTAINTY, and
K/DEF are near the floor on both: everybody survives, and the tenth-best is 9-14
points off the best. `eba` is close to the best player's projection whatever the
scaling, so it barely moves. **The model is right that waiting costs nothing at
K and DEF.**

**AND THAT ROBUSTNESS HAS A COROLLARY THAT IS NOT GOOD.** Because correcting the
over-prediction lifts RB/QB by 9-11 points and K/DEF by 2-3, the CURRENT
uncorrected state over-values K and DEF by roughly **9 points relative to RB** —
2.6x `CLOSE_GAP`. That is a measured, quantitative CANDIDATE for item 3, the
magnitude complaint: *"a defence with a 15-point winnable surplus and a kicker
with 10 pulled forward 140 rank positions."* It is a candidate and not a
conclusion, because it is contingent on survival actually over-predicting by
something near that range — which is C's measurement from a different window and
has not been re-established on this board. VONA is
compared *across* positions to pick, so an uneven shift does not cancel — it
reorders the board.

**AND IT DOES NOT EXPLAIN THE QB/TE SYMPTOM — say so plainly.** Correcting the
over-prediction raises RB most (+11.3) and QB second (+9.1). It would widen RB
*and* QB against WR/TE. It is a real defect in the value term; it is not the
cure for the thing that started this, and claiming it was would be the
symptom-matching this project keeps rejecting.

*Three probes died before this number was believable: two monkeypatch attempts
that could not reach `survival.js`'s internal binding, both reporting a
confident "0 of 12 top picks change". The control — survival scaled to ZERO must
move something — caught both.*

## 24. THE FOUNDATIONAL RE-EXAMINATION — **BUILD. Highest value on the list.**

*"THE VALUE ANCHOR HAS NO INDEPENDENT CONFIRMATION — the mask has the oracle
test, the anchor has only the participation test."*

This was the sharpest item before yesterday and item 10 sharpened it further.
Of eight weights, **risk was degenerate and ceiling collinear on the board their
experiments ran on**. Value is now carrying the model nearly alone, with one
confirmation, and item 31 shows its input is miscalibrated. Everything else in
Part Four is downstream of whether this term is right.

## 22. CONSTRUCTION-STRATEGY SIMULATION — **RESEARCH FIRST — BLOCKED on the board**

200 paired rooms comparing construction strategies is a good design. Run on a
bundle board it compares strategies **inside a system we do not ship**: no risk
variance, ceiling ≡ value. The distribution it produces would be real and about
the wrong engine. Unblocks the day the board carries the real fields.

## 25. RE-GRADE THE REMOVED TERMS — **REJECT AS SPECIFIED. Re-grade is not possible yet.**

The removed terms *are* risk and ceiling. Re-grading them on the same board
**cannot return a different answer** — risk has one value and ceiling is a
monotone function of value, at any proxy, continuous or otherwise. This is not a
scheduling call; the experiment is arithmetically incapable. Reopens as BUILD
after the board fix, and the re-grade is then genuinely new evidence rather than
a second look at the same null.

## 26. THE RB FINDING (0.8 → 0.9 across all three arms) — **RESEARCH FIRST, cheap**

*Across all three arms including DEFAULT_WEIGHTS* means it is **weight-independent
and therefore board-driven** — the same diagnosis B reached for the
intervention-rate drift, where the fix was to stop measuring the board. Item 31
supplies a specific candidate: RB is the position most sensitive to survival
scaling (+11.3, the largest of the four). One measurement decides it; no build.

## 27. TE AT 3.6, UNEXPLAINED — **RESEARCH FIRST, and the ground has moved**

The ceiling-spread table it was unexplained by no longer exists in that form:
`computeCeilingScales` now normalises by **replacement level** rather than median
spread. Re-measure before theorising — and note the first version of that
normaliser was inverted and would have given QBs a 2.35× boost, so the old table
was not a reliable baseline to be puzzled by.

## 30. HISTORICAL DRAFT TRACES — **RESEARCH FIRST — BLOCKED twice over**

"ADP-plus-jitter understates the tails" is very likely true and worth fixing.
But it needs bundles (egress-blocked from this container) *and* it feeds the same
Lab board. Blocked on infrastructure, not on judgement.

## 23. ITEM 4b, ONESIE TIMING — **RESEARCH FIRST — partially answered, finish it**

`draft/tools/onesie_timing.js` exists and the signal was measured to **oscillate**.
Cory pre-registered that "K and DEF may have no meaningful crossover and that is
a valid result" — an oscillating signal is evidence for exactly that. What is
missing is the difference-of-differences against the best flex alternative under
*both* survival treatments, and item 31 says the two treatments now differ by
more than the effect being measured. Finish after 31, not before.

## 28. THE WAIVER STOPPING STRUCTURE — **BUILD, POST-DRAFT**

`whoElseNeeds` derives contested-ness and throws it away. **This is rule 14 —
produced and unread — in the waiver surface**, the identical class as
`games_missed_3yr`, and it should be counted as an instance of it rather than
treated as a feature request. It is in-season, so it costs nothing to do after
the 22nd and would cost draft-prep time to do before.

## 32. THE ANALYZER — **SPLIT: REJECT the claim surface, BUILD the caller**

- **REJECT** championship probability and expected dollars. It does not beat its
  own declared baseline — **28 of 36 against naive 27 of 36, CI spanning zero** —
  and a docstring claimed a quantity that does not exist. That is a pre-registered
  null and honouring it is the whole discipline. Shipping it anyway because it
  exists is the sunk-cost version of the self-description defect.
- **BUILD** the weekly `analyzerClaims` caller. It is a **dated commitment**
  (before Sept 1) and a claims rail with no caller is an intention with no
  trigger. Registering it in `commitments.json` is the closure.

## 29. HIERARCHICAL POOLING — **REJECT WITH REASON**

The most defensible reject on the list, and Cory wrote the reason himself. It is
a sophisticated statistical layer on top of a base whose measurements we
discovered yesterday were artifacts of the fixture. **Adding a pooling model now
would make a wrong number smoother, and a smoother wrong number is harder to
catch.** Reconsider only after 24 confirms the value anchor independently — and
if 24 fails, this stays rejected permanently rather than being rebuilt on a base
that failed.

---

## THE COUNT

| disposition | items |
|---|---|
| **BUILD** | 31, 24, 28, 32 (caller half) |
| **RESEARCH FIRST** | 22, 26, 27, 30, 23 |
| **REJECT WITH REASON** | 29, 25 (as specified), 32 (claim half) |

**11 items, 11 dispositions, 0 deferred without one.**

And the ordering that falls out, which is not the list's order: **31 first**
(it is a Part One defect wearing a Part Four label), **then the board fix**
(one change, five items), **then 24** (the anchor everything rests on). Nothing
else moves money before the 22nd.
