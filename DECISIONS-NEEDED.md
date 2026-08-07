# Decisions needed

_Questions no spec already answers. Each carries my recommended answer; I take
the conservative option and mark the item PROVISIONAL until you rule._

## D1 — Backtest grading metric — RESOLVED BY DATA (needs your acknowledgement)

The value-over-replacement cut ran alongside raw points. It did **not** clear
the round-1 alarm — under value grading the alarm still fires (round-1 +130) and
the composite is worse overall (B3−B0 −157/pick vs −66 raw). So the alarm is
**not a pure metric artifact.**

The real cause, and it is the one the pre-registration named ("investigate the
projection fit"): **B3 runs on our crude walk-forward projection; B0 runs on the
real contemporaneous market's ADP.** The projection floated Carson Wentz to
round 1 in 2024. So the backtest is measuring "composite-on-a-crude-projection
vs the market," and the projection stand-in — which the spec itself flagged as
"not a test of projection accuracy" — is the confound. B3 < B0 tells us our
era-appropriate projection is worse than the market had, which we already knew;
it does NOT tell us the composite logic is bad.

**Consequence, and it is the pre-registered "boring outcome":** the backtest
cannot grade the composite or select a strategy on this projection. **Default
stands.** No strategy install, no adp_sd fit, no Section-A exploitation fit —
all of those would be fitting to projection noise.

**What IS still valid, because it does NOT touch our projection:**
- KOV verdict (projection-independent; done directly on the production board) — proceeding.
- Exploitation Section B intel (value-fall map, reach map, run archaeology,
  faller verdict, blunder map) — these mine the ACTUAL PICKS your league-mates
  made vs contemporaneous ADP and actual outcomes. No walk-forward projection is
  involved, so they are unaffected. This is the "richest vein", and it survives.

**Your call (not blocking — Default stands meanwhile):** is it worth building a
real projection model (post-draft) to make the backtest able to grade the engine
and select a strategy? My recommendation: yes, post-draft, as part of the
in-season rankings work — a genuine projection is the prerequisite for the
backtest to mean anything, and it is out of scope before Aug 22.

_No other decisions open._


## D2 — Exact definition of the `top_picks_flat` keeper cost model (K0 blocker)

K0 needs this before the cost model can be implemented, because implementing the
wrong formula mis-costs every keeper and corrupts adjusted_adp, KOV and the
optimizer.

`top_picks_flat` is not an implemented model (only original_round, fixed_round,
escalator, no_cost exist) and the config currently uses `original_round`. I need
the precise rule. Common "flat top picks" variants:
  (a) each keeper costs a FIXED round regardless of where drafted (e.g. all
      keepers cost your round-N pick) — this is essentially `fixed_round`.
  (b) keepers cost your top picks in order: 1st keeper costs round 1, 2nd costs
      round 2, 3rd costs round 3 (flat escalating off the top).
  (c) all keepers cost the same flat round (e.g. round 3), full stop.

**My recommendation:** tell me which of (a)/(b)/(c) — or the exact rule — and I
implement it as a new `top_picks_flat` cost model with a parity test, rebuild
the artifact under it, and run the keep-0/1/2/3 optimizer. If (a) or (c) reduce
to `fixed_round`, I can proceed today by setting cost_model=fixed_round with the
right round; only (b) or a novel rule needs new code.

**Conservative action meanwhile:** the artifact stays on `original_round` (its
current, validated model) and K0's model-agnostic half — the keep-0/1/2/3
optimizer — is built and run now, so it is ready to re-run the instant D2 is
answered. K0 is NOT blocked from all progress by D2.
