# SHUFFLE — the third and last owed null, extracted from four ad-hoc copies

_TERRITORY: D. `BLEND-SEARCH-DESIGN.md` §3's third null, after BEST-OF-K
(register DS9) and RANDOM-WEIGHT (register DS10). **All three now exist.**
Written 2026-08-18._

> *"a signal that is really a proxy for rank/scale — permute the arm's values
> across players within position"*

## 1. WHY THIS ONE WAS DIFFERENT TO BUILD

Unlike BEST-OF-K and RANDOM-WEIGHT, this idea already existed in the repo —
**four times, each hand-rolled inside a different study**: `asymmetric_env_arm.py`
and `opponent_arm.py` each built their own within-week placebo; `emergent_coverage.py`
built its own shuffle-null for a trend slope; `best_of_k.py` and
`random_weight_null.py` each permute internally as part of a different
statistic. None were reusable, and none matched the design doc's exact
contract — permute **within position**, not within week or globally.

This extracts the pattern **once**, so the next arm calls it in one line
instead of writing a fifth copy.

## 2. THE TWO FORMS

| function | tests | shape it fits |
|---|---|---|
| `signal_rank_null()` | raw Spearman(signal, actual) vs. within-position shuffle | an arm that IS a rating (rookie evaluator score, opponent index) |
| `mae_arm_null()` | best-fit-λ ΔMAE vs. the same fit run on a shuffled multiplier | an arm that multiplies a baseline (every weekly arm in this project) |

Both shuffle **within position only** — a QB's value landing on a kicker is
not this project's null, and a dedicated test verifies the multiset of values
inside each position group is unchanged after shuffling.

## 3. CALIBRATION — the noise floor for a zero-information signal

| n | p95 \|ρ\| |
|---|---|
| 50 | 0.2616 |
| 100 | 0.1972 |
| 200 | 0.1440 |
| 500 | 0.0930 |
| 1000 | 0.0611 |

Shrinks with n, as it must — the same shape `collinearity_check.py`'s
`noise_floor` already established for a related but distinct statistic
(partial correlation, not raw within-position shuffle). This is computed fresh
because the construction differs; the two are not interchangeable.

## 4. VALIDATION: RUN ON MY OWN PRIOR WORK, AS ESTABLISHED PRACTICE

`mae_arm_null()` cross-checked against `opponent_arm.py`'s own ad-hoc placebo
on a single-week RB slice (2023, week 10, 44 rows — illustrative only, far
smaller than DS8's pooled out-of-sample result):

```
observed_delta_mae   0.2076
null_delta_mae_mean  0.0329
null_delta_mae_p95   0.1932
p_value              0.0399
survives             True
gain_net_of_null     0.1747
```

**Agrees in direction and magnitude with the ad-hoc placebo already published
in register DS8** (RB was the one position with real signal). Because this
slice is a single position, the within-position shuffle degenerates to a full
shuffle here — it does not exercise the position-boundary behaviour, which the
dedicated unit test covers separately.

## 5. THE CONTROLS

| control | result |
|---|---|
| known-positive, `signal_rank_null` | detected |
| known-negative, 12 seeds | fired **0–2 of 12** |
| known-positive, `mae_arm_null` | detected |
| known-negative, 12 seeds | fired **0–2 of 12** |
| shuffle respects position boundaries | verified directly — multiset per group unchanged |
| refuses <10 total rows | raises |
| refuses a position group of size 1 | raises — cannot be shuffled at all |
| calibration shrinks with n | pinned |

## 6. WHAT THIS DOES NOT DO

- **It does not replace best-of-K or random-weight.** Three different failure
  modes: a lucky winner among many (best-of-K), free variance reduction from
  averaging (random-weight), and a scale/rank proxy dressed as a signal
  (this). An arm can pass one and fail another.
- **It does not enforce a leak protocol.** `mae_arm_null`'s grid is fit
  in-sample by design — leave-one-out or leave-one-season-out is the calling
  study's job, same as it always has been.
- **It is not retrofit onto the four existing ad-hoc copies.** Those studies'
  own published verdicts stand; this is the tool the *next* one should use.

## 7. `BLEND-SEARCH-DESIGN.md` §3 IS NOW FULLY BUILT

| null | status |
|---|---|
| RANDOM-WEIGHT | ✅ built, register DS10 |
| SHUFFLE | ✅ built, this document |
| BEST-OF-K | ✅ built, register DS9 |

Nothing wires anywhere. Step 2 (BEST-OF-K reporting in the Tuesday grader) and
step 3 (preregistered blends, 10-08) are the relay's and A's, not mine.
