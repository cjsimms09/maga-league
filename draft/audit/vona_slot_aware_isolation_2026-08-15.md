CLAIM: The QB2-rate anomaly (100% of simulated rooms take a second QB,
vs 56.7% in real league history) is a property of `VONA_SLOT_AWARE=true`
ITSELF, not of the wire-compared bench branch (`VONA_WIRE_BENCH`). Isolated
by adding a third, shipped-default control arm to the committed simulator
and running all three arms on the same 60 seeds. Also: the earlier
uncommitted RB-wipeout claim (66.7% of rooms with RB=0) does not reproduce
in ANY arm, at double the original sample size.

CONTEXT: draft/audit/bench_wire_comparison_claim_2026-08-15.md ended with
exactly this open question: "is the QB2-rate gap a VONA_SLOT_AWARE artifact
rather than a wire-comparison artifact? ... a run isolating VONA_SLOT_AWARE's
own effect (compare it against VONA_SLOT_AWARE=false as well, not just the
two bench variants under it) would directly test that hypothesis." This is
that run.

WHAT RAN, all committed, all reproducible:

1. `draft/tools/bench_wire_room_sim.js`, extended from two arms to THREE.
   Same mechanics as before (real board, real keepers, real `E.recommend()`
   through `live_context.js`, opponents drafting by noisy ADP with Gaussian
   perturbation scaled to each player's own real `adp_sd`, seeded mulberry32
   PRNG, paired seeds across arms). The new arm:
     shipped — VONA_SLOT_AWARE=false, VONA_WIRE_BENCH=false. Today's real,
               live, committed default. vona() returns the flat `straight`
               value and never reaches the slot/flex/bench branches.
     off     — VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=false (vorp bench).
     on      — VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=true (wire bench).
   Also added: a per-arm QB2 picks-remaining cumulative timing table in the
   same buckets `onesie_history_check.js` reports for the real drafts, so
   sim timing and history timing line up column-for-column.

2. `draft/tests/bench_wire_room_sim.test.js`, extended 6/6 -> 9/9: the
   artifact now declares each arm's exact flags; a non-vacuity control
   proves the shipped arm's picks actually differ from the slot-aware arm's
   (i.e. VONA_SLOT_AWARE provably reaches vona(), same guard that caught
   this simulator's own first-draft bug); and a flag-hygiene check proves a
   full run leaves the engine's shipped defaults untouched (both flags
   false) — no committed default changed, per the standing policy.

3. Ran it for real, at DOUBLE the previous sample:
   `node draft/tools/bench_wire_room_sim.js --rooms 60 --seed 1`
   (~2.5 min; artifact committed at draft/data/bench_wire_room_sim.json).
   Seeds 1-60, of which the 1-30 subset is the exact seed set of the
   previous committed run.

4. Baseline verification, since a comparison against an unverified number
   proves nothing: the "57% real history" figure IS real and reproducible.
   `node draft/tools/onesie_history_check.js` (committed, this branch)
   recomputes it fresh from `draft/data/league_history.json`: 30 real
   team-seasons 2023-2025, QB counts {0:1, 1:12, 2:17}, QB>=2 = 17/30 =
   56.7%, and 17/17 of those real second QBs went with <=5 picks remaining.
   (That script's own header honestly records that the companion TE2 figure
   did NOT fully reproduce — 40% vs the claimed 47% — but the QB figure,
   the one this isolation compares against, reproduces exactly.)

WHAT CAME BACK (60 rooms per arm, seeds 1-60):

    shipped: VONA_SLOT_AWARE=false (today's live default, both flags off)
      RB=0 rooms: 0/60 (0%)
      QB2 rate: 53.3% (32/60), late (<=5 picks left) when it happens: 84.4%
      QB2 rounds: {9:5, 11:2, 12:16, 13:9}
      modal shape: QB2/RB6/WR4/TE1 (26.7%)

    off: VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=false (vorp bench)
      RB=0 rooms: 0/60 (0%)
      QB2 rate: 100% (60/60), late when it happens: 3.3%
      QB2 rounds: {8:24, 9:30, 10:4, 12:2} — early-to-mid draft
      modal shape: QB2/RB3/WR6/TE2 (70%)

    on: VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=true (wire bench)
      RB=0 rooms: 0/60 (0%)
      QB2 rate: 100% (60/60), late when it happens: 90%
      QB2 rounds: {10:6, 11:23, 12:28, 13:3} — endgame
      modal shape: QB2/RB6/WR4/TE1 (38.3%)

    real history (onesie_history_check.js): QB>=2 = 56.7%, 100% <=5 left.

  Determinism cross-check: the seeds-1-30 subset of the off/on arms in this
  run reproduces the previous committed 30-room result EXACTLY (QB2 100%/
  100%, late 6.7%/93.3%, RB=0 0%/0%, modal QB2/RB3/WR6/TE2 66.7% and
  QB2/RB5/WR5/TE1 40%) — the new arm changed nothing about the old two.

WHAT IT PROVES:

1. THE ISOLATION QUESTION IS ANSWERED: the QB2-rate anomaly belongs to
   VONA_SLOT_AWARE, not to the wire comparison. Under the SAME simulator,
   same seeds, same opponent noise, same board:
     - shipped default: 53.3% QB2 — statistically indistinguishable from
       the real 56.7% (32/60; the exact binomial 95% CI is ~40-66%).
     - flip ONLY VONA_SLOT_AWARE on, keeping the OLD vorp bench formula
       (no wire code executed at all): QB2 jumps to 60/60. If the true
       rate were even 95%, seeing 60/60 has probability ~4.6%; the CI
       lower bound is ~94%. The jump is decisive, and the wire branch
       cannot be its cause because the wire branch never ran in that arm.
2. The wire comparison neither causes nor cures the RATE anomaly — both
   slot-aware arms sit at 100%. What it demonstrably changes is TIMING:
   vorp-bench takes QB2 in rounds 8-9 (96.7% NOT late), wire-bench pushes
   it to rounds 10-13 (90% late), which is where 100% of real historical
   QB2 picks land. The shipped default is also late (84.4%). So the wire
   fix moves slot-aware QB2 timing back toward both history and the
   shipped default — a real improvement WITHIN the slot-aware world — but
   the every-single-room rate remains slot-aware's own signature.
3. The RB-wipeout claim that motivated the wire branch (66.7% of rooms
   RB=0 under slot-aware vorp bench) does not reproduce ANYWHERE: 0/60 in
   all three arms, double the sample of the previous run, including the
   exact arm the claim was about. Whatever produced that number, this
   committed simulator on this committed board does not.
4. The 56.7% baseline itself is real, committed, and reproduces — it is a
   measurement, not prose.
5. Nothing shipped changed: the flag-hygiene test proves the engine's
   committed defaults are still VONA_SLOT_AWARE=false, VONA_WIRE_BENCH=
   false after a full run, and no CFG default was edited.

WHAT IT DOES NOT PROVE:

- WHY slot-aware takes QB2 in every room, in rounds 8-9. The measurement
  localizes the anomaly to VONA_SLOT_AWARE=true (with either bench
  formula) but does not trace the mechanism inside vona()'s slot/flex/
  bench pricing that makes a second QB outrank alternatives mid-draft.
  Plausible suspects (the bench branch's `rate*vorp - forgone` pricing a
  high-vorp QB duplicate above startable alternatives; flex-marginal
  interactions) are hypotheses, not measurements.
- That the shipped default is "correct" — 53.3% matching history says the
  default's aggregate QB2 behavior in THIS simulator resembles real
  drafters; it does not validate any individual recommendation.
- That the earlier 66.7% RB-wipeout number was wrong in its own setting.
  Its setup was never committed, so it cannot be re-run; all that can be
  said is it does not reproduce under this committed, reproducible one.
- Generality beyond this board: one keeper configuration, one draft seat,
  one league's starters, noisy-ADP opponents rather than real humans.
  60 rooms narrows sampling noise but does not vary any of those.

NEXT STEP: still draft-scoring/weight logic, still under the standing gate
for Cory's explicit ruling; nothing here ships anything. What this changes
about the decision: VONA_SLOT_AWARE should NOT be enabled as-is — with
EITHER bench formula it drafts a second QB in every room, rounds earlier
than real drafters, where the shipped default already matches history's
rate and roughly its timing. The wire-compared branch remains a genuine
timing improvement within the slot-aware world and is not the anomaly's
cause, but fixing slot-aware's QB2 RATE is a prerequisite to shipping
either flag, and the mechanism trace (why the slot-aware branches price
QB2 up mid-draft) is the concrete next piece of work.

Reproduce: node draft/tools/bench_wire_room_sim.js --rooms 60 --seed 1
           node draft/tools/onesie_history_check.js
           node draft/tests/bench_wire_room_sim.test.js
