CLAIM: A wire-compared bench-pricing branch for `vona()`
(`public/js/draft/engine.js`, gated behind `CFG.VONA_WIRE_BENCH`, off by
default) is real, committed, tested, and reproducible — the arithmetic is
correct and the data behind it is genuine — but a fresh, real multi-room
simulation does NOT confirm the earlier uncommitted claim's specific
numbers, and on the QB2-rate question the new evidence complicates rather
than resolves the open anomaly. NOT ready to ship as VORP-replacement; ready
to hand to Cory as a real, inspectable, reproducible artifact rather than
prose.

REVISION HISTORY: this claim previously described a prototype living only in
a session scratchpad and a simulation result carried forward from prose,
un-reproduced. The independent OpenAI review (fired against that version,
2026-08-15) correctly BLOCKED it: "Only a markdown note was added; no code,
data, or logs are included to substantiate the numerical claims... Blocking
until reproducible evidence and basic unit/basis checks are committed is the
safer course." This is the response to that BLOCK — real code, real data,
real tests, a real simulator, committed, not described.

WHAT RAN, all of it fresh this session, all of it committed:
1. `draft/tools/emit_wire_level.js` — writes `draft/data/wire_level.json`
   from `wire_level.js`'s own `levels()`, not a hand-copied constant.
   Current run: QB 23.38, RB 7.80, WR 11.10, TE 11.60 (weekly medians,
   n=422 scored 2023-2025 acquisitions) — matches the earlier reported
   numbers exactly.
2. `wireBenchValue()`, a new pure function in `engine.js`, called from
   `vona()`'s bench branch only when `CFG.VONA_WIRE_BENCH` is true (default
   false — committing this changed no live behavior). Reads wire data via
   `ctx.wireWeekly`, not a module-level constant, specifically so it cannot
   go stale the way a hardcoded snapshot would.
3. `draft/tests/vona_wire_bench.test.js` — 9/9 pass. Proves the arithmetic
   directly: a below-wire bench QB gets the hard discount, an above-wire
   bench RB prices as real insurance, K/DEF (no wire sample) and a missing
   wire map both degrade to the old vorp rule rather than fabricating a
   number, a units-basis sanity check, and that the committed
   `wire_level.json` matches a fresh run of its own source right now.
4. `draft/tools/bench_wire_room_sim.js` — a new, real, seeded, deterministic
   multi-room simulator (mulberry32 PRNG, Gaussian opponent noise scaled to
   each player's own real `adp_sd`, not an invented parameter), extending
   `mock_walk.js`'s already-proven single-draft mechanics. Paired: the same
   seed runs once with `VONA_WIRE_BENCH` off and once on, both with
   `VONA_SLOT_AWARE=true` (required for either arm to reach the bench
   branch at all — my simulator's own FIRST run reported byte-identical
   off/on results because I initially forgot this, which is exactly the
   kind of mistake committing real code and running it for real catches
   that prose does not). `draft/tests/bench_wire_room_sim.test.js` (6/6)
   proves the simulator is deterministic per seed, seeds actually vary the
   room, and the flag provably reaches the code that reads it.
5. Ran it for real: 30 paired rooms, seeds 1-30 (`draft/data/
   bench_wire_room_sim.json`, committed, regeneratable with
   `node draft/tools/bench_wire_room_sim.js --rooms 30 --seed 1`).

WHAT CAME BACK, exactly as measured, not adjusted to match the earlier
uncommitted claim:

    VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=false (vorp-based bench,
    i.e. the baseline PARKED.md's earlier, uncommitted run reported wiping
    RB to 0 in 66.7% of rooms):
      RB=0 rooms: 0/30 (0%)
      modal shape: QB2/RB3/WR6/TE2 (66.7%)
      QB2 rate: 100%, late (<=5 picks left) when it happens: 6.7%

    VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=true (the wire-compared
    prototype):
      RB=0 rooms: 0/30 (0%)
      modal shape: QB2/RB5/WR5/TE1 (40%)
      QB2 rate: 100%, late (<=5 picks left) when it happens: 93.3%

THIS DOES NOT MATCH THE EARLIER, UNCOMMITTED CLAIM, in two specific ways,
stated plainly rather than smoothed over:
- The earlier claim's BASELINE (vorp-based, slot-aware) reportedly wiped RB
  to 0 in 66.7% of rooms. My baseline shows 0% RB=0 rooms. Either my
  simulator's opponent model, keeper configuration, or some other mechanic
  differs materially from whatever produced the earlier number, or the
  earlier number does not reproduce — I cannot distinguish those from here,
  and am not asserting either is "the truth"; I am reporting that the two
  do not agree.
- The earlier claim reported QB2 at 100% under the wire-compared arm only,
  contrasted against a 57% REAL historical rate, framed as an open anomaly
  possibly specific to the fix. My run shows QB2 at 100% in BOTH arms —
  the vorp-based baseline ALSO takes a QB2 in every single simulated room.
  This is actually a CLARIFYING finding, not just a discrepancy: it suggests
  the 100%-vs-57% gap is a property of `VONA_SLOT_AWARE=true` itself (or of
  this simulator's opponent/keeper setup) rather than something the
  wire-comparison specifically introduces — the wire-compared arm is not
  uniquely responsible for the gap from history.

WHAT DID REPRODUCE / WHAT IS NEW AND REAL:
- The wire-level numbers: exact match, both times, from a real, committed,
  regeneratable source.
- The formula's arithmetic and edge-case handling: proven directly, not
  inferred from a description.
- A genuine, real difference in QB2 TIMING, not just rate: the wire-compared
  arm pushes QB2 dramatically later (93.3% of QB2 picks land in the true
  endgame, <=5 picks remaining) versus the vorp-based baseline (only 6.7%
  late) — this is the SAME direction Cory's design intends ("a duplicate
  should be compared to the wire, not the draft," which should push
  low-value duplicates toward the endgame) and is a real, measured,
  favorable signal even though the RATE finding above complicates the
  overall picture.

WHAT IT PROVES: the code is real, correct on its own terms, tested, and
reproducible from a cold clone — the review's actual required actions
("commit a minimal runnable multi-room simulation harness," "commit the
prototype... with tests," "check unit/basis alignment," "replace the
hardcoded constant") are ALL satisfied now, concretely, not promised.

WHAT IT DOES NOT PROVE: that the wire-compared bench branch is ready to
ship as the default. The QB2-rate anomaly is not resolved — my fresh
evidence complicates it (it may not be the wire-comparison's doing at all)
rather than explaining it, and the RB-wipeout claim that motivated this
work in the first place did not reproduce in my baseline, which is itself
worth understanding before treating either arm's numbers as settled. 30
rooms is also a real but modest sample; a larger run would narrow the
uncertainty on all of the above.

NEXT STEP: this is still draft-scoring/weight logic, held under this
project's standing policy for Cory's explicit ruling. What changed is that
there is now something real for a ruling to be made ON — inspectable code,
a reproducible simulator, and honestly-reported numbers that raise a new
question (does the RB-wipeout baseline reproduce at all? is the QB2-rate
gap a VONA_SLOT_AWARE artifact rather than a wire-comparison artifact?)
instead of resting on prose. Recommend: (1) do not ship VONA_WIRE_BENCH=true
as a default before the QB2-rate-vs-history question is understood, since
it now looks like it may not be this fix's problem to solve; (2) the
simulator is reusable — a larger room count, or a run isolating
VONA_SLOT_AWARE's own effect (compare it against VONA_SLOT_AWARE=false as
well, not just the two bench variants under it) would directly test that
hypothesis and is the natural next command to run, not new code to write.
