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

## 31. CALIBRATION DRIFT — **BUILD, AND CORY FILED IT CORRECTLY. I DID NOT.**

**RETRACTION. An earlier version of this section claimed item 31 was misfiled and
belonged in Part One as a draft-critical defect, on the strength of a table whose
sign was backwards and whose magnitude was inflated about fivefold. Both errors
came from one place: I built on the sentence in the task list instead of reading
the source.**

Item 31 reads *"survival over-predicts by 15 to 57 percent"*. The repo's own
words, `src/calibration_drift.js`:

> the survival model over-predicts **DEPARTURES** — players are taken **less**
> often than it says

Over-predicting departures is UNDER-predicting survival. The correction RAISES
survival; my first table lowered it. And the magnitude error followed from the
same mistake — scaling survival by 0.43 moves RB survival from 0.775 to 0.33,
which is an enormous perturbation and is not what the measurement claims. The
correction actually claimed operates on the departure probability:

```
d_pred = 1 − surv_pred                 the model's departure probability
d_true = d_pred / (1 + bias)           departures over-predicted by `bias`
surv   = 1 − d_true
```

Faithful to the claim, and it stays inside [0,1] with no clipping — a scale-up on
survival would have hit the 1.0 ceiling hardest at K (0.986) and DEF (0.970),
silently flattening exactly the comparison being made.

**MEASURED AGAIN, CORRECTLY** (`draft/tools/survival_sensitivity.js`). Mean ΔVONA
for the best available player at each position across Cory's twelve picks.
NEGATIVE means VONA falls when the bias is corrected — the shipped model
OVER-states what waiting costs:

| departures over-predicted by | QB | RB | WR | TE | K | DEF | **spread** |
|---|---|---|---|---|---|---|---|
| 15% (best case) | −0.2 | −0.7 | −0.4 | −0.1 | −0.0 | −0.0 | **0.7** |
| 36% (the pinned midpoint) | −0.7 | −1.5 | −0.7 | −0.3 | −0.0 | −0.0 | **1.5** |
| 57% (worst window) | −1.0 | −2.0 | −1.0 | −0.4 | −0.0 | −0.1 | **2.0** |

Against `COIN_FLIP_GAP` 1.0, `TIE_THRESHOLD` 2.0, `CLOSE_GAP` 3.5.

**SO THE EFFECT IS REAL AND SMALL.** At the pinned midpoint the largest positional
spread is 1.5 points — enough to flip a coin-flip, not enough to reach
`TIE_THRESHOLD`. At the worst window it reaches 2.0, still well inside
`CLOSE_GAP`. It does not reorder the board.

The bound is tighter still: the CONTROL sets departures to nearly impossible and
`eba` at RB moves 159.6 → 163.4. **Under 4 points is the entire possible range of
this correction at the most sensitive position**, so no calibration figure in the
15–57% range can produce a large effect.

**DISPOSITION: BUILD, as a monitoring rail, in Part Four — which is where Cory
put it.** `src/calibration_drift.js` already exists and proposes rather than
applies, for the right reason (*"a self-correcting survival model would be
fitting itself to its own residuals, which is how a model stops being able to be
wrong"*). What it lacks is a caller and enough graded observations to propose on.

**AND THE OBSERVATIONS ARE NOT AVAILABLE YET, WHICH IS ALSO ALREADY DECLARED.**
`src/component_write.js`: *"3 real drafts are on disk (league_history.json)
against a declared minimum of 20 clusters, so this row reads too_thin even once
replay is wired."* The calibration cannot be re-established from our own drafts
before the 22nd. Mock calibration (`mock_calib.js`) is the only pre-draft source
and it grades within a session.

**AND THE ITEM-3 CANDIDATE IS WITHDRAWN.** The earlier version offered "K and DEF
are over-valued by ~9 points relative to RB" as a quantitative candidate for the
magnitude complaint. With the direction and magnitude corrected the K/DEF effect
is −0.0 to −0.1 points. **Survival calibration does not explain a kicker moving
140 rank positions.** Item 3 needs a different mechanism and this was not it.

*Three probes died before any of these numbers were believable: two monkeypatch
attempts that could not reach `survival.js`'s internal binding, both reporting a
confident "0 of 12 top picks change". The control — a perturbation must move
`eba` — caught both. It did not catch the sign error, because a sign error moves
things too; only reading the source did.*

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
intervention-rate drift, where the fix was to stop measuring the board. Item 31 supplied a candidate and it is WITHDRAWN — corrected, the survival
effect at RB is -2.0 points at the worst window, not the +11.3 the inverted table
claimed. RB is still the most survival-sensitive position, but 2 points cannot
produce a 0.8-to-0.9 shift. One measurement decides it; no build.

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

**The ordering, revised after the item-31 retraction:** the board fix first (one
change, five items), **then 24** — the value anchor everything rests on and the
only item with no blocker. 31 stays in Part Four where Cory filed it: real,
small, and un-measurable before the 22nd on 3 drafts against a minimum of 20.

I moved 31 to the front on a table whose sign was backwards. Correcting it moved
it back to exactly where the list already had it.
