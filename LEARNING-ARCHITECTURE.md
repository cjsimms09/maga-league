# LEARNING ARCHITECTURE — four tools become four views over one measurement system

Design brief (Cory, 2026-08-10, two outside reviews reconciled) plus my engineering read.
This does NOT displace the war-room fixes or the graduation gate — it is the shape they
build toward. Nothing here starts before its stated precondition; several items are
deliberately BLOCKED.

## The target state
The four tools (draft, waiver, lineup, roster/standings analyzer) stop being four programs
that share some constants and become **four views over one measurement system**. When it
holds, a better player valuation on the draft board automatically improves waiver and
rest-of-season decisions, and a graded weekly failure can propose a change that reaches
both the lineup optimizer and the draft's ceiling/stack terms.

## Contracts (partly unwired)
- **C1 — ONE VALUATION.** Draft, waiver, lineup return the same `startableValue` for the
  same player + roster state. Never recomputed on a thin pool. Permanent agreement test
  must cover all three on REAL states (thin-pool + post-claim), fail closed.
- **C2 — ONE CONFIG + PAYOUT.** Every tool reads the same league rules, derived
  `matchupValue`, and weekly-high value.
- **C3 — CONSENSUS ALONGSIDE EVERY DOLLAR.** Complete in all four surfaces, source-labelled.
- **C4 — EVERY TOOL PREDICTS, EVERY PREDICTION IS GRADED.** The self-learning contract.
  Draft is furthest along; waiver/lineup/analyzer do not yet fully emit gradeable claims.
Plus: the graduation gate for any term affecting multiple tools; the continuous proxy as
standard output of every grade; override logging wherever a human disagrees.

## My read on Cory's three questions (2026-08-10)

**1. Is the waiver stopping-problem framing buildable? — YES, and it's the right frame.**
Our league runs PRIORITY waivers, not FAAB. Priority is a depleting resource: one good
claim drops me to the bottom. So the decision is a STOPPING problem — "is he worth spending
my current priority position, or do I hold for something better" — conditional on the week,
my order position, and the expected quality of what appears later. It is tractable because
the state is small (priority position, week, positional needs, arrival distribution of
future wire talent). The gradeable claim is binary-plus-value: "claim now beats holding,"
with a dollar/proxy EV, resolved by whether a better claim actually appeared before my
priority recovered. We do NOT need FAAB precision; a coarse threshold (claim iff value >
E[best future claim | weeks left, my position]) is already gradeable and sharpens with data.
COUPLING (do not duplicate): the "probability someone else claims him" input comes FROM THE
ANALYZER'S POSTURES, which already know who is desperate/short — modelling it separately
would be the two-places disease again. Buildable as a claim emitter by ~Sep 1; the stopping
POLICY refines over the season.

**2. Can the shared store be defined now and migrated incrementally without touching the
draft path? — YES, as a read-through contract, NOT a rewrite.** History here with big
refactors is half-merges, so: define the canonical schema now (rosters/transactions,
valuation artifacts, prediction ledger, resolution/grade ledger, override log, preseason
snapshots + hierarchical priors with the pooled/local split visible, weekly actuals); have
the NEW writers (waiver/lineup/analyzer C4 emissions) write to it from day one; leave the
draft reading its existing artifacts UNCHANGED until after Aug 22. Three of these tables —
the prediction, resolution, and override ledgers — ALREADY exist as separate stores, so
they are the store's first tables with no migration. The draft's valuation gets a
read-through adapter only AFTER the draft. SINGLE-POINT-OF-FAILURE risk (Cory's, unnamed by
reviewers): a shared valuation that is uniformly wrong looks consistent, which is HARDER to
catch than a disagreement — the thin-pool bug surfaced BECAUSE two surfaces disagreed.
Therefore shared valuation ships WITH shared guards: the C1 agreement test on thin-pool +
post-claim states, failing closed, deliberately broken once to prove it catches — never
after.

**3. Can the pooled-vs-local split be stated clearly enough that hierarchical updating is
safe? — YES, and the discipline already exists (the consensus column names its sources).**
Our parameters cluster cleanly:
  - POOLABLE (foreign data allowed — league-agnostic): positional replacement curves,
    age/pace effects, market-efficiency-by-region, format-level value shapes.
  - STRICTLY LOCAL (foreign data FORBIDDEN): manager tendencies, opponent survival
    conditioning, room behaviour, our keeper structure, seat-specific parameters.
The split document is a table (param → pooled/local → why → guard) with the split VISIBLE
AT EVERY USE SITE the way C3 names its source. The fail-closed rule: **any parameter not
explicitly classified defaults to LOCAL** — foreign data cannot leak into an unclassified
param. That default is exactly Cory's honest fallback: if a param resists clean
classification, it stays local, and if the whole split feels unclear or burdensome, we do
NOT build the pooling layer. No pooling work starts until that document exists and Cory has
read it.

## The program fold-in (sequence, constrained by the Sep 1 data-start deadline)
Ordering is constrained, not chosen: all four tools must emit by ~**Sep 1**, when Week 1
starts producing data that cannot be reconstructed. Denser weekly claims are the cheapest
item, so it goes early.

1. **Denser weekly claims → lineup optimizer.** Cheapest, fastest signal, available now:
   per week emit weekly-high winner, matchup win-prob vs realized, stack points actually
   scored, posture-classification accuracy, override outcomes. Commit before games, resolve
   after, never backdate. Highest immediate learning-rate priority.
2. **C4 emission for waiver + analyzer** — waiver set INCLUDES the priority-stopping
   prediction; who-else-claims sourced from the analyzer's postures.
3. **C1 hardened across all three on real states** (thin-pool + post-claim), fail closed,
   deliberately broken once. (This is program item 2 — the thin-pool invariant.)
4. **Analyzer↔lineup coherence check**: product of weekly matchup probs ≈ analyzer playoff
   odds; divergence is a C1-class bug one level up; fail closed.
5. **Shared-store contract DEFINED now**, migrated incrementally, touching nothing the
   draft depends on before Aug 22.
6. **MFL ingest built as forward-style grades from the start** (freeze pre-draft board+ADP
   at the time, replay under the measured policy, emit the SAME forecast types, grade vs
   actual). Design spec, not a later enhancement. Contamination rules hold: no in-season
   leakage, earliest timestamp wins, resolution rule written before outcome.
7. **Trades accommodated in the architecture** (same C1 valuation; the place opponent
   modelling pays most), built when it makes sense — not now, but not reimplemented later.
8. **Hierarchical priors** — BLOCKED until the pooled/local split document exists and Cory
   has read it. Honest fallback stands: unclear split → do not build.
9. **Multi-room simulation** — only after the ingest, HARD labelling boundary: robustness
   testing only, NEVER mixed into forward calibration tables.

## What not to do (adopted verbatim)
- Do not re-fit/re-bucket the same three seasons until the numbers look better.
- Do not treat mocks as forward evidence.
- Do not expand the hypothesis space faster than evidence arrives (now a SESSION-A standing
  rule).
- Do not loosen the forward guarantee or the earliest-timestamp rule to get more points.

## The honest speed-up (held, not optimised away)
Format/player-eval questions: 5-10× more effective sample within 1-2 seasons (ingest +
safe hierarchical updating). Weekly/construction: 2-3× denser signal per season (proxy +
denser weekly claims). **The opponent-specific moat is STILL SLOW and capped at seasons
played** — the thing that makes this uncopyable is the thing that cannot be accelerated,
and any proposal claiming otherwise is probably pooling foreign data into a param that
should be ours.
