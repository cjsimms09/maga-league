# THE SCORING-FINGERPRINT BOUNDARY IS A FLOAT-PRECISION ARTIFACT

_TERRITORY: D — data stewardship. Written 2026-08-17._

**2021/2022 and 2023-25 were scored under the SAME table.** The differing
`scoring_fingerprint` values are a float32-vs-float64 serialisation artifact.
Rounding the older table to six decimal places reproduces the newer fingerprint
**exactly**.

That artifact has cost, so far: **`weekly_volatility` two seasons and half its
transitions**, **the pace study its registered second graded fold**, and **my own
routes study a fold I refused this morning.** It is quoted as settled fact in the
brief, in a prereg, in an artifact, and in code I wrote today.

**I am correcting my own work first, because I made the same mistake on the same
day I was auditing others for it.**

---

## 1. THE MEASUREMENT

The fingerprint is computed in `build_weekly_points_from_components.py:94`:

```python
blob = json.dumps(scoring, sort_keys=True, separators=(",", ":"))
return hashlib.sha256(blob.encode()).hexdigest()[:16]
```

**A sha256 of the SERIALISED dict.** Any change in how a float renders changes
it, whether or not the number changed.

Both tables have **44 keys, identical names, and exactly three unequal values:**

| key | 2021-22 (`220bf4c671786351`) | 2023-25 (`bd8f3e50bd67a9ce`) |
|---|---|---|
| `pass_yd` | 0.03999999910593033 | 0.04 |
| `rec_yd` | 0.10000000149011612 | 0.1 |
| `rush_yd` | 0.10000000149011612 | 0.1 |

**Every one is exactly `float32` of the newer value** — verified:
`float(np.float32(0.04)) == 0.03999999910593033`, and likewise for both 0.1s.
Almost certainly because the older stores were rebuilt offline from parquet
columns typed `float32`.

### The proof, not the inference

```
old table rounded to 6dp  ->  fingerprint bd8f3e50bd67a9ce
the 2023-25 fingerprint   ->  bd8f3e50bd67a9ce            MATCH
```

Both stored fingerprints also recompute exactly from their own stored dicts, so
this is the same function the stores used, not a reimplementation.

### The maximum distortion, if anyone had pooled them anyway

| key | delta per yard | over a big season | in points |
|---|---|---|---|
| `pass_yd` | 8.94 × 10⁻¹⁰ | 5,500 yd | **4.9 × 10⁻⁶** |
| `rec_yd` | 1.49 × 10⁻⁹ | 2,000 yd | **3.0 × 10⁻⁶** |
| `rush_yd` | 1.49 × 10⁻⁹ | 2,200 yd | **3.3 × 10⁻⁶** |

**Five millionths of a point on a season total.** Not "small enough to accept" —
below any rounding anything downstream does.

## 2. WHAT THE CLAIM SAYS, AND WHERE

`DRAFT-WEEK-BRIEF.md` §3, on `weekly_volatility`:

> *"It is 2023-25 because 2021, 2022 were REFUSED, not because that is all we
> have. Those two seasons carry a different `scoring_fingerprint` — **they were
> scored under a different table** — and pooling them would produce per-player
> totals that never existed under either table, with … nothing in the arithmetic
> to complain."*

**The reasoning is exactly right and the premise is false.** "Nothing in the
arithmetic to complain" is the correct worry about a genuine table change; it
just is not this. And the cost is stated in the brief itself: *"That refusal
costs two seasons and leaves only two transitions, which is why the coefficient
below is directional rather than precise."*

| where | what it cost |
|---|---|
| `DRAFT-WEEK-BRIEF.md` §3 + `VOLATILITY-WIRING-PREREG.md` | **2 of 4 seasons**; the persistence coefficient is called directional for this reason |
| `pace_arm.json` / `pace_arm.py:40-42` | its **registered second graded fold** — though its *stated* reason was that the 2022 store doesn't exist, which is also false (`row17` audit) |
| `ROUTES-TPRR-PREREG.md` + `routes_tprr_study.py` | **a fold, refused by me this morning** |
| `DEFECT-REGISTER` 10, 17, 27 | the constraint I proposed as the *real* one after disproving the first |

**Register 27 says the n=1-season limit is false because the stores are
populated. It is false for a second, independent reason: the boundary that would
still have separated them is not real either.**

## 3. I GOT THIS WRONG TOO, AND HERE IS THE CORRECTION

**`ROUTES-TPRR-PREREG.md` refused the 2022→2023 fold**, and I asserted the
refusal at runtime, wrote it into the study docstring, pinned it with a test,
described it in the audit, and put it in the commit message — six places, on a
premise I had not checked. I found the same failure in five other rows today
while committing it myself.

**AMENDMENT 1 restores the fold.** Both verdicts are reported, because a prereg
amended after seeing results is worthless unless the reason is a *fact*, not a
preference:

| fold | partial ρ (TPRR \| targets) | null p95 | beats |
|---|---|---|---|
| 2021→22 | +0.128 | +0.127 | ✅ *by 0.0009 — noise* |
| **2022→23** | **+0.142** | **+0.128** | **✅ (restored)** |
| 2023→24 | +0.171 | +0.124 | ✅ |
| 2024→25 | +0.026 | +0.122 | ❌ |

**`clears: false` either way.** The verdict is unchanged on four folds instead of
three, which is the only reason the amendment is safe to make: it could have
rescued my own result and did not.

**And the guard is now correct rather than removed.** `_same_table_at_6dp()`
compares the tables; a genuine rule change still refuses. Its test carries a
known-positive control that injects a real scoring change and requires detection,
so "the tables agree" is a claim that can fail.

## 4. WHAT THIS UNBLOCKS — for other lanes, not mine

I have **not** touched any of these. Each is someone else's file.

1. **`weekly_volatility` gains 2021 and 2022** — 4 transitions instead of 2. The
   brief's own words say the coefficient is *"directional rather than precise"*
   **because** of the missing seasons. This is the single highest-value
   consequence, and `weekly_volatility` is the top post-draft wiring item (brief
   §7.1).
2. **The pace study's registered fold is fully clear.** My row-17 route to A
   offered three options; **option 3 is now answered — a differently-scored prior
   does not distort the feature, because it is not differently scored.** Option 2
   (redesign inside one fingerprint) is unnecessary. The fold just works.
3. **Register 27's advice is safe to act on**, and I nearly filed the opposite. I
   was drafting a caveat warning E *not* to pool 2021-22 across the boundary.
   **That caveat would have been wrong**, and it would have re-entrenched the
   artifact under a new owner.
4. **`position_weight_transfer.py` is vindicated.** It already used 2021/2022 as
   priors against 2023-scored outcomes and licensed them with an exact
   reproduction check. Its limitations list names the rebuild licence and *not*
   the fingerprint — which reads as an omission and turns out to be correct.

## 5. WHAT THIS DOES NOT COVER

- **The rebuild licence is a separate question and stays open.** 2021/2022 are
  `rebuilt_offline: true`. This audit shows the SCORING TABLE is the same; it says
  nothing about whether the offline rebuild reproduces what a live capture would
  have. `position_weight_transfer.py` claims an exact 2023 reproduction over
  5,371 player-weeks as that licence — **I have not re-verified it**, and anyone
  pooling 2021-22 should lean on that check, not on this one.
- **No claim that pooling is always safe.** It is safe *here*, for these five
  stores, today. A future season scored under a genuinely changed table must
  still be refused — which is why the guard was fixed rather than deleted.
- **I did not re-run `weekly_volatility` or the pace study.** Both are other
  lanes' files. Routed, not reached into.

## 6. THE LESSON, AND IT IS ABOUT THE CHECK, NOT THE PEOPLE

**A fingerprint over a serialised structure answers "is this byte-identical",
and it was read as answering "is this the same rule".** Those differ exactly when
representation changes without meaning changing — which is common, silent, and
here cost two seasons of a study the project considers its most promising signal.

**The check was not wrong; the question it was asked was.** A fingerprint
mismatch is a reason to *look*, never a finding on its own. Every use of one in
this repo should compare the underlying values before concluding anything, and
`_same_table_at_6dp()` is the pattern.

That is the same shape as the day's other findings, one level down: **not a bad
measurement — a true statement answering a question nobody restated.**
