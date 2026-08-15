CLAIM: In response to your prior BLOCK verdict on
draft/audit/bench_wire_comparison_claim_2026-08-15.md (which correctly
flagged that only a markdown note existed, no code/data/logs), this commit
adds real, committed, tested, reproducible evidence for the wire-compared
bench-pricing branch: the formula itself (wireBenchValue in engine.js,
gated behind CFG.VONA_WIRE_BENCH, default false), the wire-level data it
depends on (draft/data/wire_level.json, generated from the existing
wire_level.js), a real multi-room simulator
(draft/tools/bench_wire_room_sim.js) run for real (draft/data/
bench_wire_room_sim.json, 30 paired rooms), and tests for all of it.

IMPORTANT, STATED UP FRONT: the fresh simulation results do NOT match the
earlier uncommitted claim's specific numbers. This is disclosed plainly in
draft/audit/bench_wire_comparison_claim_2026-08-15.md's "THIS DOES NOT
MATCH THE EARLIER, UNCOMMITTED CLAIM" section — my vorp-based baseline
shows 0% RB=0 rooms (earlier claim: 66.7%), and QB2 happens in 100% of
rooms in BOTH arms of my simulation, not just the wire-compared one. I am
not asking you to verify the OLD numbers; I am asking you to check whether
THIS commit's evidence is now real, inspectable, and internally consistent
— and whether my own honest reporting of the discrepancy from the earlier
claim is adequate, or whether it should have been resolved further before
committing.

WHAT TO CHECK, specifically:
1. Is wireBenchValue() actually reachable and tested (not dead code)?
2. Does the committed wire_level.json actually match a fresh run of its
   stated source (wire_level.js)?
3. Is the multi-room simulator (bench_wire_room_sim.js) actually
   deterministic and does VONA_WIRE_BENCH actually change simulated
   outcomes (i.e., is the flag comparison real, not accidentally
   comparing a setting against itself — this exact bug existed in my
   FIRST draft of the simulator and was caught and fixed before this
   commit, described in the code's own comment)?
4. Is CFG.VONA_WIRE_BENCH actually false by default, i.e. does this
   commit change zero live behavior?
5. Is the claim file's disclosure of the discrepancy from the earlier,
   uncommitted numbers adequate, or does it read as burying a bad result?

NEXT STEP, regardless of this review's verdict: this remains
draft-scoring/weight logic under this project's standing policy and will
not ship (VONA_WIRE_BENCH will not flip to true) without Cory's explicit
ruling. This review's job is to check whether the EVIDENCE is now sound
enough to put in front of him, not to approve shipping.
