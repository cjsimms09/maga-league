# TERRITORY: C
# CANDIDATE LEDGER — SESSION C

**Candidates, never conclusions.** Nothing here has been validated, nothing here may
influence a production decision, and nothing here was validated on the data that
generated it. Each row carries its search denominator and its multiplicity.

---

## C-001 — OWNER TENDENCIES MAY PERSIST ACROSS SEASONS (2026-08-12)

| field | value |
|---|---|
| **discovery date** | 2026-08-12 |
| **relationship tested** | do owner-level drafting tendencies correlate across season pairs |
| **discovery dataset** | `league_history.json` — 2023/24/25 drafts, **the same 10 owners with the same roster_ids in all three seasons** |
| **relationships searched** | **18** — 6 tendencies × 3 season pairs |
| **tendencies** | round of first QB, TE, K, DEF; RB share of rounds 1–5; WR share of rounds 1–5 |
| **effect direction** | positive (tendencies repeat) |
| **discovery n** | 10 owners per correlation |
| **status** | **CANDIDATE** |

### The per-test result is a clean NEGATIVE

**Zero of 18 correlations reach |ρ| ≥ 0.648** — the threshold for p<0.05 at n=10. Expected
by chance: **0.9**. Observing zero is entirely consistent with the null.

```
QB1        +0.31  -0.04  +0.16
TE1        +0.01  -0.01  -0.09
K1         +0.27  +0.39  +0.09
DEF1       +0.60  +0.13  +0.48
RB_share5  +0.62  +0.30  +0.61     <- largest, and BELOW the bar
WR_share5  +0.13  +0.19  -0.10
```

### The aggregate is what makes it a candidate — and it is POST-HOC

**14 of 18 correlations are positive** (expected 9). Two-tailed binomial **p ≈ 0.031**.
Mean ρ = **+0.225**.

**I CHOSE THE SIGN TEST AFTER SEEING THE SIGNS.** That is the exact trap this ledger
exists to catch, and it disqualifies the p-value as evidence. It is recorded because a
post-hoc pattern is a legitimate *candidate* and an illegitimate *finding* — the whole
distinction Cory drew.

### Required validation

| requirement | value |
|---|---|
| **preregistered test** | Spearman ρ on **RB share of rounds 1–5** across season pairs, plus a sign test over the same 6 tendencies **declared in advance** |
| **required n** | **~43 owner-pairs** to detect ρ=0.45 at 80% power. At 10 owners per season that is **~4 more seasons**, or an external pool of leagues with repeat owners |
| **validation period** | 2027 at the earliest; not before |
| **validation data** | must NOT include 2023–25, which generated this |

### WHY IT MATTERS BEYOND ITSELF

**This is the precondition for A's room layer being modellable at all.** The room mixture
measured 0.0% and opponent tendencies 1.4%, and Cory's distinction is whether those were
**architectural** (the mechanism could not express the signal) or **empirical** (there is
no signal).

**This result distinguishes NEITHER, and that is the honest statement.** With 10 owners
the test can only detect very strong persistence. It does not establish that tendencies
persist, and — the part that matters for A — **it does not establish that they do not.**
The 1.4% cannot be attributed to non-persistence on this evidence. That world remains
undistinguished, and the test that would distinguish it needs roughly four more seasons
than exist.

### REVISIT TRIGGER

    revisit_when   owner-seasons available >= 43, from any source with repeat owners
    revisit_n      {league_history_owner_seasons: 43}   (currently 30)

---

## WHAT THIS LEDGER'S FIRST ENTRY DEMONSTRATES

**C-001 is the first candidate this lane has ever generated.** Every prior measurement here
was a hypothesis Cory or I designed before seeing data. The audit named cross-season
persistence as the absent class most worth testing; the data was already on disk; nobody
had asked.

It also shows the machinery works in both directions at once: the per-test negative is
reported with its denominator, the aggregate is reported with its post-hoc contamination
named, and neither is allowed near a production decision.
