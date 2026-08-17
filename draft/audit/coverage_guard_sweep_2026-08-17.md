<!-- TERRITORY: A -->
# SWEEP — SILENTLY PARTIAL SOURCES, AND GUARDS THAT CANNOT GUARD

**2026-08-17.** Cory: *"are we sure there aren't more gaps like this in our
data? … what other data are we missing or calculating off a constant when we
shouldn't be"*

The `constant_multiple_sweep` covers the first half of that question — fields
computed off a constant. The routes finding
(`routes_position_source_2026-08-17.md`) was a **different defect class** that
nothing swept for:

> a source whose coverage is silently partial, with a loss counter sitting at a
> non-zero value that has been read as inherent.

This is that sweep. Every stored artifact under `draft/backtest/` was scanned for
its own loss counters — `unjoined`, `excluded_*`, `*_without_*`, `unmatched`,
`missing`, `dropped` — and each non-zero one was chased to the reason.

---

## 1. ROUTES — REAL, FIXED

The originating case. Position lookup used a source with a row only for players
who recorded a statistic: 1,097 of 1,708 on-field players unclassified, 56
route-runners a season dropped, and a whole season (2025) absent for a reason
that was never true. Rebuilt on seasonal rosters, 0 unclassified everywhere.
Full write-up in the linked audit.

## 2. SNAP COUNTS — THE GUARD COULD NOT GUARD, FIXED

The store is healthy. Join rates across the five seasons:

| 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|
| 0.9882 | 0.9905 | 0.9919 | 0.9919 | 0.9714 |

**`MIN_JOIN_RATE` was 0.70.** Twenty-seven points below anything ever observed —
the two-hop crosswalk (`pfr_player_id → gsis_id → sleeper_id`) could have
silently lost a quarter of the league and still written a green store. A
threshold chosen to be safely un-trippable is decoration: it reads as a check and
functions as a comment.

**And the test agreed with it.** `test_the_join_floor_is_high_enough_to_be_worth_having`
opened with exactly the right sentence — *"A floor set low enough to never
trigger is decoration"* — then asserted `>= 0.70` and described twenty-seven
points of slack as *"real headroom below current reality"*. The test named the
invariant and asserted the bound that violates it.

Raised to **0.95**, and the test now pins the floor against the STORED RATES
rather than a literal: it must sit below every season we already have (or the
fetcher would refuse its own history) and within 0.10 of the worst of them (or it
cannot fire before the store stops being trustworthy). Proven to discriminate —
the old 0.70 **fails** the rewritten test, 0.95 passes.

Deliberately not tuned just under 0.9714: a bound fitted to current data fires on
ordinary variation and gets widened again, which is how a ratchet becomes a
rubber stamp (`adp_sd_ratchet_fired_2026-08-17.md` makes that argument at
length).

## 3. MODEL ACCURACY — CHECKED, ALREADY CORRECT

`excluded_no_weekly_row` is the largest counter in the store and appears across
every `model_accuracy_v*.json`: **115 for most 2025 models, 211 for
`walk_forward`**. Different exclusion counts per model looks exactly like the
comparability defect this sweep was hunting — models graded on different
populations, in the study that promoted `own_v6` to live.

**It is not.** `model_accuracy_backtest.py:186-207` already computes a
`head_to_head_shared_population` block over the INTERSECTION of every model's
coverage, with a comment stating plainly that the per-model cells are *not*
directly comparable and why. The ranking that decides which model ships is taken
on the matched denominator. No change made; recorded here so the next reader who
notices 115-vs-211 does not re-open it.

## 4. SURVIVORSHIP — DISCLOSED, STILL UNMEASURED, LEFT OPEN

The same file carries an honest caveat:

> players forecast but absent from every graded week are excluded and counted
> here — **MAE is optimistic by an unmeasured amount**

That is the "absent ≠ zero" rule applied correctly (a player who never played has
no outcome to grade against), but the size of the resulting optimism has never
been bounded. For a DRAFT tool it is not a rounding error: a player projected for
200 points who never takes a snap is a total loss to the drafter, and excluding
him flatters every model that projected him.

**Not fixed here, and not because it is small.** Bounding it means choosing what
an absent season *counts* as, which is a modelling decision that belongs in a
prereg, not in a sweep. Recorded as open. The comparison between models is
unaffected (§3); what is unmeasured is the absolute level.

## 5. WHAT THE SWEEP DID NOT FIND

Routes' own join rates (0.9556 / 0.9568 / 0.9998 / 1.0 / 1.0) sit against a
`MIN_JOIN_RATE` of 0.95 — a 0.6-point margin on the worst season. That is a
guard positioned to actually fire, and it is the pattern §2 was moved toward.

`external_unprojected_snapshot_2026.json` reports 0 missing on every declared
field. `exp_tiebreak_signals` excludes 27 for missing years-of-experience against
0 for a missing store row — a source limitation, disclosed in place.

---

**Two fixes, one confirmation, one open item.** The class is real and was worth
sweeping for; it was not endemic.
