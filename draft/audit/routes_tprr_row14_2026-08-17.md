# ROW 14 — routes TPRR measured: a real null, and the reason is collinearity

_TERRITORY: D — data stewardship. Written 2026-08-17, session D's fifth item._

Preregistration: `draft/backtest/ROUTES-TPRR-PREREG.md`, committed in its own
commit (`891c9e6`) **before** `routes_tprr_study.py` existed. Result:
`draft/backtest/routes_tprr_study.json`.

**TPRR does not clear the preregistered bar. It is a null for this
construction, and unlike the last four rows this one is a genuine finding
rather than a bookkeeping error** — all three of Rule 3d's questions are
answered with numbers, and the mechanism is measured rather than guessed.

**The weekly job keeps running.** Rule 3c, and this is not a close call.

---

> **⚠️ SUPERSEDED IN PART, SAME DAY — AMENDMENT 1.** The 2022→23 fold refused
> below was refused on a false premise: the scoring-fingerprint split is a
> float32/float64 artifact, not a different scoring table
> (`draft/audit/scoring_fingerprint_artifact_2026-08-17.md`). The fold is
> restored, giving **four** E2 folds; the restored fold returns **+0.142** and
> beats its null. **The verdict is unchanged — `clears: false` either way** — and
> everything below about collinearity being the mechanism still stands. The E2
> table in §1 is the original three-fold run, kept as the record.

## 1. THE RESULT

### E1 — persistence: TPRR carries, strongly

| transition | n | TPRR ρ | control (targets carryover) | null p95 | beats null |
|---|---|---|---|---|---|
| 2021→22 | 136 | **+0.671** | +0.673 | +0.144 | ✅ |
| 2022→23 | 143 | **+0.670** | +0.730 | +0.134 | ✅ |
| 2023→24 | 150 | **+0.653** | +0.689 | +0.138 | ✅ |
| 2024→25 | 154 | **+0.686** | +0.694 | +0.117 | ✅ |

Remarkably stable — four transitions inside a 0.03 band, all roughly 5× the
permutation null. The control is healthy, so the harness works.

### E2 — increment: it does not survive controlling for volume

| transition | n | partial ρ (TPRR \| targets) | control (points vs prior targets) | null p95 | beats null |
|---|---|---|---|---|---|
| 2021→22 | 136 | +0.128 | +0.423 | +0.127 | ✅ *by 0.0009* |
| 2023→24 | 150 | **+0.171** | +0.367 | +0.131 | ✅ |
| 2024→25 | 154 | **+0.026** | +0.381 | +0.141 | ❌ |

**`clears: false`.** The preregistered bar was positive **and** null-beating in
**all three** folds. One fold clears properly, one clears by nine ten-thousandths
— which is indistinguishable from the null, not a pass in any meaningful sense —
and the most recent transition is flat.

## 2. WHY — and this is the part worth keeping

**E1 looked like a strong result and is mostly inherited.** TPRR persists at
+0.67; targets persist at +0.69. Near-identical. That similarity is not in the
prereg's trigger list (I declared ρ > +0.75 as the suspicious band, and this is
below it) — **I ran the collinearity check anyway, because TPRR persisting at
exactly the control's rate is the constant-multiple smell even at +0.67.**
Recorded as a deviation in §5, in the direction of more checking.

| season | ρ(TPRR, targets) | ρ(TPRR, routes) |
|---|---|---|
| 2021 | **+0.736** | +0.340 |
| 2022 | **+0.796** | +0.424 |
| 2023 | **+0.820** | +0.439 |
| 2024 | **+0.787** | +0.304 |
| 2025 | **+0.819** | +0.433 |

**TPRR is 74–82% rank-explained by target volume alone, in every season, and is
only weakly related to its own denominator.** So:

- **E1's persistence is largely targets' persistence wearing a ratio.** TPRR
  carries because targets carry.
- **E2's null follows mechanically.** Residualise targets out and there is little
  left, because most of TPRR *is* targets.

**This directly contradicts the argument the store was built on.** The brief and
`capture_registry.py` both justify routes as *"the DENOMINATOR for
target-per-route-run: 60 targets on 300 routes is a different player from 60 on
600, and target share alone cannot separate them."* At season grain, measured:
**target volume alone separates 74–82% of it.** The denominator is doing far less
work than the argument assumed.

**That is a statement about TPRR at season grain, not about routes data.** Note
the second column: routes and TPRR are only +0.30–0.44 related, so **routes-run
as a volume measure is a genuinely different quantity that this study did not
test.** It remains the interesting untested part of the store.

## 3. RULE 3d ON MY OWN NULL — all three answered

The lane's standard applies hardest to its own results.

| | answer |
|---|---|
| **Q1 — did the input vary?** | **Yes, emphatically.** 203–215 distinct TPRR values among 209–216 qualifying players per season; sd ≈ 0.055; range 0.044–0.375, a **5.1×–8.3× spread**. Nothing resembling the ceiling defect. |
| **Q2 — did it arrive?** | **Yes, and exactly zero rows were lost.** 136/136, 150/150, 154/154 survive the join to the points store. The study **records this itself, per fold** (`population.lost_at_points_join`), because row 18 taught that a null over an unknown population is not a finding. |
| **Q3 — could the test have fired?** | **Yes, demonstrably, three ways.** E1 fired at +0.67 against a +0.13 null. E2's control fired at +0.37–0.42. And E2 itself produced +0.171 in one fold — the machinery produces positives when there is something to find. |

**All three answered ⇒ this is a finding, not a suspected defect.** After four
rows whose premises collapsed, it is worth stating plainly that this one is real.

## 4. THE DECISION AND THE TRIGGER

**Decision:** `routes_*` stays at lifecycle step 4 — **not wired** — with a
measurement behind it. Season-grain TPRR does not clear a preregistered bar, and
the mechanism is that it duplicates volume rather than complementing it.

**The trigger was declared in the prereg, before the number existed**, so it
cannot be reverse-engineered from a disappointing result:

> Re-test at **weekly grain, or per-position** — season TPRR pools a role change
> across 17 games and nothing in this design uses the store's weekly structure.
> And re-test **when a true routes feed exists**: this is an upper-bound proxy
> that counts a blocking tight end as a route-runner, so the measurement is
> attenuated by a known, unmeasured amount.

**One trigger is ADDED, and it comes from the measurement rather than from
hope:** the collinearity is the thing to attack. **Test `routes` as a volume /
participation measure rather than as a denominator** — ρ(TPRR, routes) is only
+0.30–0.44, so routes-run carries information the ratio throws away. That is the
next construction, and it needs no new data.

## 5. DEVIATIONS FROM THE PREREG — both stated, neither absorbed

1. **E1 landed at +0.65–0.69, above my declared expected band of +0.30–0.60.**
   Below the +0.75 "suspicious" line, so no trigger fired by the letter of the
   prereg. I ran the collinearity check anyway (§2), because TPRR persisting at
   the control's exact rate is the same smell at a lower number. **The check was
   decisive and the prereg's trigger threshold was set too high** — recorded so
   the next such prereg sets it at "matches the control", not at an absolute.
2. **The 2021→22 fold "beats" its null by 0.0009** (+0.1281 vs +0.1272). The
   prereg's rule is a strict inequality and I have applied it as written — that
   fold counts as a pass — but **it is noise and the write-up says so.** Had the
   third fold cleared, this one would have been the reason not to call it a
   result.

## 6. WHAT THIS DOES NOT COVER

- **One construction, one grain.** Season TPRR only. Weekly is untested.
- **Not a test of routes as volume** — see the added trigger. That is the part of
  this store most likely to carry something.
- **QBs excluded** (absent from the store by design).
- **No wiring claim.** Nothing installs from this either way; a wiring decision is
  A's and Cory's, post-08-22.
- **The proxy caveat is binding.** Routes here is an upper bound; a true feed
  could move every number in §1.

## 7. AND A STALE REGISTER ROW FOUND ON THE WAY

**Register row 10 says *"No weekly-points store for 2022 / 2021. The single
reason every own-model artifact grades exactly one season"*, owner **C**, status
IN HAND, next action *"Build `nflverse_weekly_points_2022.json`."*

**Both stores exist and are complete.**

| store | player-weeks | weeks | coverage | fingerprint |
|---|---|---|---|---|
| `nflverse_weekly_points_2021.json` | 5,401 | 18 | `complete: true`, no missing | `220bf4c671786351` |
| `nflverse_weekly_points_2022.json` | 5,351 | 18 | `complete: true`, no missing | `220bf4c671786351` |
| 2023 / 2024 / 2025 | 5,648 / 5,588 / 5,246 | 22 | `complete: true` | `bd8f3e50bd67a9ce` |

**So the row's first clause is false, and its diagnosis is therefore wrong.** The
real constraint is not absence — it is the **scoring-fingerprint boundary**:
2021-22 were scored under a different table, so they cannot be *pooled* with
2023-25. That is precisely why `weekly_volatility` refused those two seasons, and
it is the constraint this study navigated by refusing the 2022→23 fold.

**This one would have cost real work.** C is assigned to build a store that is
already committed — the same "check what exists before fetching" failure the
relay flagged to C on 08-17. Routed to C, and row 10 corrected.

**What is genuinely still open** is narrower and worth stating: a *second graded
fold* needs either a re-score of 2021-22 under the current table, or a study
design that keeps folds within a fingerprint — which this study demonstrates is
possible, and which gave E2 three folds instead of one.

## NOISE-FLOOR RE-READ (added 2026-08-17, after the floor was measured per-n)

The zero-trait p95 for the partial statistic scales sharply with sample size —
**+0.157 at n=100, +0.128 at n=150, +0.100 at n=300, +0.074 at n=400**
(`collinearity_check.noise_floor`). Every fold below is re-read against the floor
for **its own n**, which an earlier single-n figure got wrong.

| fold | n | partial | floor(n) | reads as |
|---|---|---|---|---|
| 2021→22 | 136 | +0.128 | +0.136 | **at/below floor** |
| 2022→23 | 143 | +0.142 | +0.132 | just above |
| 2023→24 | 150 | +0.171 | +0.128 | above |
| 2024→25 | 154 | +0.026 | +0.128 | **at/below floor** |

**The verdict does not change.** `clears: false` stands, and is now BETTER supported — two of the four folds sit at or below the floor for their n, so the apparent partial signal is thinner than the raw numbers suggested. The collinearity mechanism (ρ 0.74–0.82 with targets) remains the explanation.
