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

---

## THE COUNTERS ARE IN CODE, NOT IN THIS DOCUMENT

**A defect in my own proposal, fixed.** I told A that each retired hypothesis should carry
`revisit_when` and `revisit_n` so the standing check fires when the sample crosses rather
than when someone remembers — then wrote both of my first two candidates into a **markdown
table**. `C-001`'s counter is derivable from `league_history.json`; **`C-002`'s lived only
in prose**, so the mechanism I had just proposed could not read its own second row.

That is an intention with no trigger, committed one message after describing it.

**`draft/backtest/candidate_ledger.py` now holds the countable half.** Counters are
**derived from the archives**, never written down — a stored count drifts from the thing it
counts, which is how a trigger comes to fire late or never. Current state:

    owner_seasons              30 / 43      (C-001)
    oracle_capture_qb_slots     5 / 15      (C-002)

**And an uncountable candidate is REPORTED, not dropped.** `R-F7` and `R-ROUTE1` have no
archive that can ever fire for them, so they appear under `untriggerable()` with their
conditions in prose. *"No trigger"* and *"not yet"* are different states, and collapsing
them is exactly how a hypothesis gets retired permanently by accident.

---

## C-001 — RESOLVED: TENDENCIES PERSIST. The room layer's negative was NOT evidential.

**Pre-declaration committed at `543f144` BEFORE the run.** Method frozen as
`persistence/v1`.

**The first cut of this analysis answered nothing** — 18 pairwise Spearman correlations at
n=10, power only for |ρ| ≥ 0.648, zero crossings. The instrument could detect persistence
only if it were strong enough not to need measuring. **Replaced with a variance
decomposition and a permutation null**, which is what the dependence structure demanded:
30 owner-seasons, but only **two independent transitions per owner** and six
non-independent tendencies.

| tendency | ICC | p (permutation) | |
|---|---|---|---|
| **RB_share5** | **0.641** | **0.0048** | **survives Bonferroni (0.0083)** |
| DEF1 | 0.594 | 0.0233 | crosses 0.05, not correction |
| K1 | 0.479 | 0.0907 | |
| WR_share5 | 0.454 | 0.1165 | |
| QB1 | 0.385 | 0.2575 | |
| TE1 | 0.373 | 0.2882 | |

**POOLED: mean ICC 0.488, joint permutation p = 0.0002.** One permutation per replicate
applied across all six tendencies — permuting each independently would break the
within-owner correlation and make the null tighter than reality.

Denominator **6**; expected crossings **0.3**; observed **2**.

### What it settles, and the boundary

**Owners are statistically distinguishable from one another by how they draft.** So the
room layer's 1.4% is **not** explained by "there is no signal" — the evidential reading is
the less likely one and the architectural reading is live.

**P5 was pre-declared and holds: this does NOT justify building the room layer.** It
removes an explanation; it does not establish that another architecture would capture the
signal. Different claims, and only the first is on offer.

### The prediction whose REASONING was wrong

P1 predicted onesie **habit** (K/DEF timing) would persist most. `RB_share5` — how much of
the early draft goes to running backs — is the strongest, and `K1` does not cross.
**Strategy persists more than habit**, which is the opposite of the mechanism I argued.

### Predictions scored

P1 ✅ (two crossed) · P2 ✅ (`RB_share5` strongest) · P3 ✅ (`TE1` flat) · P4 ✅ (pooled
positive) · P5 holds by construction.

### A CAPTURE finding, not a filter finding

F1 does not bound this: our league **is** our format. What would enlarge it is external
leagues with the **same owners across seasons** — **never captured**, because the MFL
crawl takes one season per run and no run has followed a league across years. **Free, and
unrecoverable once the seasons pass.**

---

## C-003 — PRE-DECLARED BEFORE RUNNING: does IN-SEASON activity persist too? (2026-08-12)

**`persistence/v1` applied to a second behaviour, declared before the run.**

C-001 showed draft tendencies persist (pooled ICC 0.488, p = 0.0002). **Nothing has asked
whether in-season behaviour does.** The transaction archive holds **1,091 transactions
across three seasons** — more than twice the 480 draft picks — and has never been examined.

**The spread is wide enough to be worth testing:** per-roster transaction counts run 11–70
in 2025, 20–52 in 2024, 18–54 in 2023.

**Metrics, declared now:** transactions per roster per season; the waiver share of them
(waiver vs free-agent, which is priority-usage versus camping the wire); and the median
`created` hour-of-week, as an add-speed proxy.

**Prediction, blind: activity persists MORE strongly than draft tendencies.** A draft is
twelve decisions a year under time pressure; transaction volume is a season-long habit with
a hundred opportunities to express itself, so it should be less noisy per season.
**Specifically I expect transaction count to clear p < 0.05 where four of six draft
tendencies did not.**

**And a boundary declared with it:** if it holds, that is a *second* archive supporting
manager modelling — it is **not** a second reason to build the room layer, which is a draft
mechanism. In-season persistence bears on the waiver and lineup tools, not on the draft.

### C-003 RESOLVED — in-season behaviour persists MORE strongly than draft behaviour

**Pre-declared at `1f04e6b` before the run. `persistence/v1`, unchanged.**

| metric | ICC | p (permutation) | |
|---|---|---|---|
| **waiver_share** | **0.754** | **0.0001** | **survives Bonferroni (0.0167)** |
| **txn_count** | **0.603** | **0.0120** | **survives Bonferroni** |
| median_hour | 0.535 | 0.0409 | crosses 0.05, not correction |

**3 of 3 metrics cross. Expected at 5%: 0.15.**

**The prediction holds, and by the margin predicted.** Draft-side: 2 of 6 crossed, best ICC
0.641. In-season: **3 of 3 crossed, best ICC 0.754.** A draft is twelve decisions a year
under time pressure; transaction behaviour is a season-long habit with a hundred chances to
express itself, and it is measurably less noisy.

**`waiver_share` at ICC 0.754 is the strongest persistent signal measured anywhere in this
project** — draft-side or in-season. *How much of a manager's activity runs through waivers
versus free agency* is close to a fixed trait.

**The boundary I declared before running holds and matters.** This is a second archive
supporting **manager modelling**; it is **not** a second reason to build the room layer,
which is a draft mechanism. **It bears on the waiver and lineup tools** — where 37.5% of
the pot is decided, and where B is building.

**And it is measured on the half of the archive that survived the export.** The bid was
discarded (see PARKED, the `waiver_bid` path finding); `type`, `created` and `roster_ids`
were not. **Every number above comes from the fields that happened to be kept**, which is
an argument for the capture principle rather than a limitation of this result.

**REVISIT:** none needed — this is resolved, not parked. It becomes stale if the league's
membership turns over; the counter is `owner_seasons`, already tracked.

---

## C-001 — SUPERSEDED BY MEASUREMENT (2026-08-12). **The draft-side persistence does not survive.**

**The earlier entry is retained above, not deleted.** *"This was superseded by measurement"*
is a different record from *"this was wrong"*, and the reasoning that produced it — the
variance decomposition, the joint permutation, the refusal to let the sign test count — was
sound. **The input was contaminated.**

### What was wrong

`persistence.tendencies()` counted **every** pick. In this league:

    keepers                       73 of 480 picks   (15.2%)
    keepers in ROUNDS 1-5         73 of 180 picks   (40.6%)   <- the RB_share5 window
    keepers by round              R1: 28   R2: 25   R3: 20    (none after round 3)

**Two of every five picks in the measured window are not draft decisions**, and a kept
player **repeats by construction** — keeping the same running back two years running makes
a manager's early-RB share similar across seasons for a reason that has nothing to do with
how they draft. **It does not add noise. It manufactures the persistence the metric exists
to detect, in the direction of the finding.**

### Re-measured, same method, `persistence/v1` unchanged

| tendency | as published | keepers excluded | |
|---|---|---|---|
| **RB_share5** | **0.672** (p=0.0032) | **0.390** (p=0.2501) | **the Bonferroni survivor collapses** |
| WR_share5 | 0.423 (p=0.1738) | 0.167 (p=0.8960) | |
| QB1 | 0.385 (p=0.2530) | 0.249 (p=0.7319) | |
| TE1 | 0.373 (p=0.2944) | 0.330 (p=0.4893) | |
| K1 | 0.469 (p=0.1021) | **0.469** (p=0.1021) | unchanged |
| DEF1 | 0.594 (p=0.0239) | **0.594** (p=0.0239) | unchanged |
| **POOLED** | **0.486, p=0.0005** | **0.367, p=0.1698** | **fails at 0.05** |

**K1 and DEF1 being bit-identical is the check that this is the mechanism and not a
coincidence** — kickers and defences are never kept, so a keeper-driven artifact must leave
them untouched, and it does.

### What C-001 now says

**With keepers excluded, 0 of 6 tendencies survive Bonferroni and 1 of 6 crosses uncorrected
(DEF1, p=0.024) against 0.3 expected by chance. The pooled test does not cross.** There is
**no evidence here that drafting tendencies persist across seasons.**

**This is not "tendencies do not persist" either.** n=10 owners over two transitions could
only ever detect a strong effect. **The honest state is the one the FIRST cut of this
analysis reported and the second talked itself out of: the instrument cannot distinguish
the two worlds.**

### THE CLAIM TO A IS WITHDRAWN

I told A that the room layer's 1.4% was **not** explained by *"there is no signal"*, and
that the architectural reading was live. **That claim rested on this measurement and it no
longer stands.** The evidential and architectural readings are **both undistinguished
again**, which is exactly where the audit found them. *Nobody should build or decline to
build the room layer on the strength of C-001.*

### Why it went unchecked for a day

**The analysis was ad-hoc.** No runner was committed, so the number could not be
re-derived by anyone — including me — without rewriting the script. **The fix is in the
module**: `tendencies(..., exclude_keepers=True)` by default, with the measured before/after
in its docstring and three mutations covering it. **C-003 is unaffected** — transactions
have no keepers.

**And it was found by an instrument built for something else.** The population sweep printed
`is_keeper 15.2%` beside 480 picks; that number had no bearing on the sweep's purpose and it
is the reason this was caught at all.

---

## C-003 — AUDITED THE SAME WAY C-001 WAS, AND IT SURVIVES (2026-08-12)

**C-003 is now the only persistence result this lane has, so it was worth attacking
rather than leaving as the last one standing.**

### The candidate contamination, and it is a real one

**289 of 1,091 transactions are `status: failed` — 26.5%, and EVERY ONE IS A WAIVER.**
A free-agent add cannot lose to another bid. The per-owner failure rate runs **10% to
46%**, so this is a live component of `waiver_share`, not a rounding detail.

**The argument that it contaminates:** whether a claim fails depends on *other managers'
bids*, which makes the metric partly a property of the room rather than of the owner.

**The argument that it does not:** a failed claim IS an action the manager took. Unlike a
keeper — which repeats mechanically — a losing bid is a real, distinct decision.

**Both are arguable, so it was measured rather than argued.**

| metric | as published | completed only | |
|---|---|---|---|
| txn_count | 0.603 (p=0.0123) | **0.661** (p=0.0021) | *stronger* |
| waiver_share | 0.760 (p=0.0000) | **0.718** (p=0.0003) | |
| median_hour | 0.684 (p=0.0020) | **0.626** (p=0.0078) | |
| POOLED | 0.682, p=0.00005 | 0.669, p=0.00005 | unchanged |

**All three clear Bonferroni (0.0167) on both arms.** The finding does not depend on the
framing, which is the opposite of C-001, where the headline collapsed from p=0.003 to
p=0.250 on a single filter.

### WHAT DID NOT REPLICATE, and it is recorded rather than smoothed over

| metric | ledger | this reconstruction |
|---|---|---|
| txn_count | 0.603 | **0.603** — exact |
| waiver_share | 0.754 | **0.760** — within 0.006 |
| **median_hour** | **0.535** | **0.684** — does not match |

**`median_hour` is not replicated.** The other two agree closely, so the disagreement is
specific to the hour-of-week derivation — most likely a timezone or bucketing choice in
the original that was never written down. **It is reported as unreplicated, not
overwritten**, and it is exactly the cost of the ad-hoc script.

**So C-003's standing is: two of three metrics replicated and robust to the failed-claim
filter; the third is robust in this reconstruction but cannot be checked against the
original.** `waiver_share` at ICC ~0.72–0.76 is the claim that survives everything.

### THE ACTUAL DEFECT WAS NEVER THE STATISTICS

**Neither C-001 nor C-003 had a committed runner.** C-001 stood for a day with a
contamination that took ten minutes to find *once anyone looked* — and nobody could look,
because reproducing the number meant rewriting the analysis first.

**`draft/backtest/owner_persistence.py` now holds both**, with `load()`, `draft_side()`,
`in_season(completed_only=...)`, `score()` and `run()`. Nine tests, five mutations, all
killed. The replication control — the per-roster transaction ranges the ledger recorded —
is a test, so a future change that breaks the reconstruction fails rather than quietly
disagreeing.

**One number in that control disagrees with the ledger and the test pins the MEASURED
value:** 2024's floor reads **19** against a recorded **20**. A test asserting 20 would be
asserting a number this archive does not contain.

### `median_hour` — the timezone hypothesis is FALSIFIED, and the gap is unexplained

The obvious explanation for `median_hour` reading 0.684 against a recorded 0.535 was a
timezone. **It is not.** Eight a-priori-plausible derivations, all reported rather than the
one that fit best:

| derivation | UTC | US/E (EDT) | US/E (EST) | US/P (PDT) |
|---|---|---|---|---|
| hour-of-**week** (`weekday*24 + hour`) | **0.684** | 0.693 | 0.694 | 0.672 |
| hour-of-**day** (0–23) | 0.836 | 0.710 | 0.810 | 0.731 |

Plus the completed-only arm at **0.626**. **Nine reconstructions, spanning 0.626–0.836, and
not one lands near 0.535.**

**The gap runs in the CONSERVATIVE direction, which is the one saving grace.** The ledger
recorded `p = 0.0409` — *"crosses 0.05, not correction"*. **Every reconstruction here crosses
Bonferroni** (p = 0.0007–0.0078). So the recorded entry **understates** this metric rather
than overstating it, and no conclusion drawn from C-003 is at risk from it.

**But it cannot be reconciled, and the honest word is UNEXPLAINED, not "close enough".**
Further guessing at what an uncommitted script did is archaeology, not measurement, and it
would be the same mistake as the analysis it is trying to check.

**`owner_persistence.py` is the authority from here.** The recorded 0.535 is retained above
as what was reported, marked as not reproducible. **The two metrics that carry C-003's
weight — `txn_count` (replicated exactly) and `waiver_share` (within 0.006) — are
unaffected.**
