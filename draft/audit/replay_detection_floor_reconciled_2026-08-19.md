# The ±41.8 floor was never valid for either comparison — it's not that P119 broke a class boundary

**Answers:** ROUTES.md, A → D, 2026-08-19, recheck 08-22 — *"THE SEAT REPLAY
RESOLVED A CHANGE I PREREGISTERED IT AS BLIND TO... is ±41.8 a floor for ALL
changes, or only the class it was estimated on?"*

**Short answer: neither, cleanly. ±41.8 was never a valid floor for the
comparison it was ORIGINALLY estimated on either — it used exactly the same
shortcut (treating 30 correlated seat-years as 30 independent samples) that
`three_cluster_bootstrap_2026-08-19.md` already flagged as invalid for the
slot-aware comparison. Recomputed the honest way for BOTH comparisons, the
real floor is roughly ±100 points/season, not ±41.8 — which means P119's own
+58.2 "detection" does not actually clear a properly-computed bar either.
This doesn't reopen the null studies; if anything it makes them more clearly
null. It does mean the one apparent positive result this instrument has
produced needs the same downgrade `three_cluster_bootstrap_2026-08-19.md`
already gave it, for the same underlying reason.**

## 1. What ±41.8 actually was

`replay_best_drafter_claim_2026-08-18.md` §4 computed it from
`replay_league_table.json`'s 30 tool-vs-owner deltas (`realistic` arm, 3
seasons × 10 seats), treated as a single sample of 30:

```
sd (n=30, pooled)  = 116.9
se = sd / sqrt(30) = 21.3
MDE_95 = 1.96 x se = 41.8
```

**That doc's own §4 already named the problem, in writing, the same day it
was published:** *"that floor is optimistic, since seat-years inside a year
share a board vintage and a player pool, so they are not 30 independent
samples."* The caveat was correct and was never quantified.

## 2. Quantifying it — reproduced from the same source data

Pulled the 30 `realistic` deltas straight from `replay_league_table.json`
(`years.<season>.configs.baseline.seats.<n>.arms.realistic.delta_tool_minus_owner`):

| season | n | mean delta |
|---|---|---|
| 2023 | 10 | −56.29 |
| 2024 | 10 | +16.96 |
| 2025 | 10 | −53.82 |

Naive pooled (n=30, ignoring clustering): sd 115.68, se 21.12,
**MDE₉₅ = ±41.4** — reproduces the reported ±41.8 to within 1% (small gap
likely a slightly different exact filter or rounding basis; close enough to
confirm this is the same underlying computation, not a different one).

**Honest version — G=3 season clusters, the identical method
`three_cluster_bootstrap_2026-08-19.md` already used for the slot-aware
paired comparison:**

```
season means         = {−56.29, +16.96, −53.82}
cluster sd (ddof=1)   = 41.60
cluster se            = 41.60 / sqrt(3) = 24.02
t(0.975, df=2)         = 4.303
margin                = 4.303 x 24.02 = 103.3
```

**The properly-computed floor is ±103.3 points/season — 2.5× wider than the
quoted ±41.8, on the EXACT SAME comparison ±41.8 was estimated on.** This
was never a "different class of change" problem. The original floor was
already invalid for its own stated purpose; it just hadn't been re-derived
yet.

## 3. Both comparisons, side by side

| comparison | naive MDE₉₅ (n=30, iid) | honest MDE₉₅ (G=3, t-interval) |
|---|---|---|
| tool vs owner (`replay_best_drafter_claim`) | ±41.8 | **±103.3** (this doc) |
| slot-aware s1 vs s0, paired (`three_cluster_bootstrap`) | — (bootstrap bounds quoted directly, [+34.1,+100.9]) | **±92.1** ([−33.9, +150.3] around mean +58.2) |

**The two honest floors land within 12% of each other (±103.3 vs ±92.1),
despite one being an unpaired single-arm test and the other a paired
arm-vs-arm test.** That is the actual answer to "is it a floor for all
changes or only its own class": **the floor is set almost entirely by
having only 3 independent season-clusters, not by whether the comparison is
paired.** Pairing narrows a *naive* variance estimate (shared opponents
cancel some within-season noise), which is why the naive paired mean (+58.2)
looks more solid than the naive unpaired one — but neither naive number
survives contact with G=3, and once you're honest about the clustering, the
two floors converge on roughly the same number because the same three
seasons are doing all the work in both cases.

## 4. What this means for P119

**P119's +58.2 pointwise effect, 3/3 seasons positive, 21/30 seats — does
NOT clear ±103.3, and per `three_cluster_bootstrap_2026-08-19.md`'s own
already-computed t-interval on this exact data, [−33.9, +150.3] includes
zero.** The sign consistency across all 3 seasons is real and worth keeping
as the strongest defensible statement (as that doc already concluded) — it
is just not a "detection" in the sense ±41.8 implied, and treating P119 as
proof that this estimand *can* resolve tail-of-board reordering is not
supported once the floor is computed the same way the effect itself was
already being scrutinized.

## 5. Follow-up (rule 3g)

1. **Does this invalidate something we already trust?** `P117`'s own
   reasoning — *"the replay grades hindsight-optimal lineups... tail
   reordering is what that estimand is least sensitive to... a null must be
   read as 'instrument can't see this', not 'no effect'"* — is now on
   FIRMER ground, not weaker. The load-bearing worry A named (*"that
   reasoning is load-bearing in P117 and it is now weakened by a live
   counter-example"*) does not hold: P119 was never a counter-example once
   its own honest interval is read, it was a naive-variance artifact of the
   same kind ±41.8 itself was.
2. **Does this imply another failure we have not looked for?** Any other
   seat-replay MDE or CI in this repo computed the naive n=30-iid way
   inherits the same ~2.5x understatement. Checked `conversion_by_arm_
   2026-08-19.md`'s use of ±41.8 (need1 +68.6 vs slot_s1 +58.2, gap 10.4,
   "well inside the floor, not distinguishable") — **that conclusion gets
   stronger, not weaker, under the wider honest floor, so it needs no
   correction.** Anywhere the floor was used to declare a NULL survives;
   anywhere it was used to declare a DETECTION (only P119, found via grep)
   needs this doc's downgrade.
3. **Is this routed to the lane that can act?** A owns the seat-replay
   harness and the roster-shape lab; this changes no code, only how the
   existing artifacts should be read. Routed below.

## 6. Recommendation

Retire ±41.8 as a quotable number. Where a floor is needed, use the G=3
cluster t-interval margin (~±100 points/season, recomputed per-study since
the exact season means differ by comparison) or, preferably, quote raw
sign-agreement across the 3 seasons as `three_cluster_bootstrap_2026-08-19.md`
already recommends — never a bootstrap or a naive-n interval built on 3
underlying clusters. This is the same fix already applied once; it just
needed applying to the number it was borrowed from.

Reproduce §2's arithmetic: the 30 raw deltas are in
`draft/data/replay_league_table.json` (`years.<season>.configs.baseline.
seats.<n>.arms.realistic.delta_tool_minus_owner`).
