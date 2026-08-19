# PREREG — residual-arm harness, `actual − running_mean_baseline`

_TERRITORY: D. Written 2026-08-18, **committed before `residual_arm_fit.py`
exists.** Filed as the constructive alternative to the Sleeper-residual
design in `RESIDUAL-ARM-PROPOSAL.md`, which is not constructible on any
historical fold — see `draft/audit/residual_arm_sleeper_blocker_2026-08-18.md`.
Not a substitute for that study; a different, honestly-scoped one, run on
data that actually exists._

## THE TARGET, AND WHY IT PRESERVES THE PROPOSAL'S CORE PROPERTY

`RESIDUAL-ARM-PROPOSAL.md §1`: *"Ship `sleeper_proj + λ·residual_hat`...
λ=0 IS the champion... the challenger cannot lose to it by construction."*

Substituting `running_mean_baseline` for `sleeper_proj` (the strictly-prior
running mean every arm in this lane already uses, and the foundation
`own_weekly_v1` itself is built on) **keeps that property intact**: λ=0 still
IS the champion, still nests inside the challenger, still cannot lose to it
by construction. What changes is which champion — a real, available one
instead of one that does not exist for these seasons.

## ARMS — two, both real, both already proven tonight

| arm | signal | leak discipline |
|---|---|---|
| **vegas** | team implied total ÷ league mean that week (register 32/36's construction) | from the committed Vegas line for that week — never the outcome |
| **usage** | strictly-prior mean `tgt_share`, weeks 1..w−1 | RB/WR/TE only — QB has no `tgt_share` in `component_stats_*`; **declared gap, not silently dropped** |

**Only two of the proposal's five Tier-1 axes** (Vegas, usage — not
air-yards/EPA, pace, props). **Named as incomplete, not presented as the
full set** — the other three are queued, same harness, next runs.

## POPULATION AND FIT

2023-25, weeks 5-17 (inherited eligibility floor, same as every arm
tonight). QB/RB/WR/TE. Usage arm excludes QB (no signal exists).

**DEVIATION FROM THE PROPOSAL, DECLARED:** fit is **leave-one-season-out**,
not literal within-season week-by-week walk-forward. Same rigor this lane
has used all night (`opponent_arm.py`, `asymmetric_env_arm.py`); a true
week-by-week walk-forward is a larger build reserved for a future run if
this one clears anything worth refining.

**λ grid:** `(0.00, 0.15, 0.25, 0.35, 0.50, 0.65, 0.80, 1.00)`, non-negative,
per position, per arm — matching the proposal's own constraint.

**CI:** team-week cluster bootstrap, 500 resamples — players in the same
team-week share game script, and treating them as independent observations
is exactly the inflation `RESIDUAL-ARM-PROPOSAL.md §4a` names.

**BEST-OF-K:** attached from run one (`best_of_k.py`, register DS9), scoring
the two arms plus the do-nothing (λ=0 everywhere) baseline as the field —
so a winner is judged against what K arms with no skill would produce, not
just against the champion.

## THE BAR

`clears: true` for an arm-position pair requires **all three**:

- pooled out-of-sample ΔMAE ≥ +0.010 (same magnitude bar register 18b/32
  used, after register 18's undersized bar was flagged as a defect)
- 3 of 3 seasons positive
- team-week cluster-bootstrap CI excludes zero

## WHAT THIS DOES NOT COVER

- **Not the Sleeper-residual study.** Every number here is against the
  running-mean baseline. Labelled everywhere it appears.
- **Three of five Tier-1 axes are missing** (air-yards/EPA, pace, props) —
  named, not hidden. Pace exists as `pace_arm.py` and is the most likely
  next addition; air-yards/EPA and props need construction work this run
  does not include.
- **Not wired anywhere.** A wiring decision is A's, post-08-22, same as
  every other arm.
