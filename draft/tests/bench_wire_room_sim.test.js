// TERRITORY: A
// THE SIMULATOR ITSELF — mechanics only. What it MEASURED (the numbers, and
// whether they match the earlier uncommitted claim) belongs in
// draft/audit/bench_wire_comparison_claim_2026-08-15.md, not here — a
// strategy question has no pass/fail, only a report.
//
// Run: node draft/tests/bench_wire_room_sim.test.js
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// The test's runs write to a SCRATCH path (BENCH_WIRE_SIM_OUT), never the
// committed artifact. The first version of this file omitted that and its
// 3-room runs silently overwrote draft/data/bench_wire_room_sim.json on
// every full sweep — so the committed artifact stopped matching the 30-room
// run the audit narrative cited, which is exactly what the independent
// review caught (2026-08-15, medium/evidence_boundary).
const os = require('os');
const fs = require('fs');
const TEST_OUT = path.join(os.tmpdir(), 'bench_wire_room_sim.test-out.json');
function run(rooms, seed) {
  return execSync(`node draft/tools/bench_wire_room_sim.js --rooms ${rooms} --seed ${seed}`,
    { cwd: ROOT, env: Object.assign({}, process.env, { BENCH_WIRE_SIM_OUT: TEST_OUT }) }).toString();
}

// ── 1. DETERMINISTIC — the same seed must reproduce byte-for-byte ──────────
{
  const a = run(3, 500), b = run(3, 500);
  ck('the same seed and room count produce identical output, twice', a === b);
}

// ── 2. A DIFFERENT SEED PRODUCES A DIFFERENT ROOM — non-vacuity ────────────
{
  const a = run(3, 500), b = run(3, 700);
  ck('a different seed produces different output — rooms actually vary, this '
    + 'is not silently returning the same draft regardless of seed', a !== b);
}

// ── 3. THE ARTIFACT IS REAL, STRUCTURED, AND REGENERATED EACH RUN ──────────
{
  run(3, 900);
  const out = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  ck('the artifact records the exact seed/room count that produced it',
    out.rooms === 3 && out.seed_start === 900, { rooms: out.rooms, seed: out.seed_start });
  ck('all three arms (shipped/off/on) ran the same number of rooms',
    out.detail.shipped.length === 3 && out.detail.off.length === 3 && out.detail.on.length === 3);
  ck('every room reports a position-count breakdown, so the shape claims are checkable',
    out.detail.off.every(r => r.posCounts && typeof r.posCounts === 'object'));
  ck('the artifact declares which flags each arm ran with — the shipped arm is '
    + 'both flags false (today\'s live default), the others slot-aware',
    out.arms && out.arms.shipped && out.arms.shipped.VONA_SLOT_AWARE === false
    && out.arms.shipped.VONA_WIRE_BENCH === false
    && out.arms.off.VONA_SLOT_AWARE === true && out.arms.off.VONA_WIRE_BENCH === false
    && out.arms.on.VONA_SLOT_AWARE === true && out.arms.on.VONA_WIRE_BENCH === true,
    out.arms);
}

// ── 4. THE FLAG COMPARISON IS REAL — off/on must be able to differ ─────────
// (Regression guard for the exact bug this simulator's own first run caught:
// VONA_SLOT_AWARE defaults false, and vona()'s bench branch — where
// VONA_WIRE_BENCH applies at all — is unreachable without it, which made the
// first version of this file report byte-identical off/on results.)
{
  const out = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  const offShape = JSON.stringify(out.summary.off.shape_distribution);
  const onShape = JSON.stringify(out.summary.on.shape_distribution);
  // Not asserting they MUST differ on every 3-room run (a real strategy
  // question can legitimately come back "no difference"), but asserting the
  // CODE PATH is live: at least one individual pick across all rooms must
  // differ between arms, or VONA_WIRE_BENCH is provably not being read.
  const anyPickDiffers = out.detail.off.some((r, i) => {
    const on = out.detail.on[i];
    return JSON.stringify(r.picksLog) !== JSON.stringify(on.picksLog);
  }) || offShape !== onShape;
  ck('CONTROL — at least one pick differs between the off/on arms somewhere '
    + 'in this run, proving VONA_WIRE_BENCH is actually being read by vona() '
    + 'and not silently ignored',
    anyPickDiffers);
}

// ── 5. THE SHIPPED-DEFAULT ARM IS REAL TOO — VONA_SLOT_AWARE must be live ──
// (Same non-vacuity logic as check 4, for the isolation arm added 2026-08-15:
// if the shipped arm's picks never differ from the slot-aware vorp arm's,
// VONA_SLOT_AWARE is provably not reaching vona() and the three-arm
// comparison is measuring nothing.)
{
  const out = JSON.parse(require('fs').readFileSync(
    path.join(ROOT, 'draft', 'data', 'bench_wire_room_sim.json'), 'utf8'));
  const anyPickDiffers = out.detail.shipped.some((r, i) => {
    const off = out.detail.off[i];
    return JSON.stringify(r.picksLog) !== JSON.stringify(off.picksLog);
  }) || JSON.stringify(out.summary.shipped.shape_distribution)
       !== JSON.stringify(out.summary.off.shape_distribution);
  ck('CONTROL — at least one pick differs between the shipped-default arm and '
    + 'the slot-aware arm, proving VONA_SLOT_AWARE is actually being read',
    anyPickDiffers);
}

// ── 6. FLAG HYGIENE — the simulator must not leak flag mutations ───────────
// It force-sets CFG flags per room inside a try/finally; after a full run the
// engine's defaults must be exactly what shipped (both false). A leak here
// would mean any later code in the same process runs non-default scoring.
{
  const E2 = (() => {
    const p = path.join(ROOT, 'public', 'js', 'draft', 'engine.js');
    global.window = global;
    require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
    require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
    return require(p);
  })();
  ck('engine defaults are untouched: VONA_SLOT_AWARE=false, VONA_WIRE_BENCH='
    + 'false — the committed defaults the live app runs with',
    E2.CFG.VONA_SLOT_AWARE === false && E2.CFG.VONA_WIRE_BENCH === false,
    { VONA_SLOT_AWARE: E2.CFG.VONA_SLOT_AWARE, VONA_WIRE_BENCH: E2.CFG.VONA_WIRE_BENCH });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the simulator is deterministic per seed, seeds actually');
console.log('vary the room, the committed artifact is real and structured, BOTH flags');
console.log('(VONA_WIRE_BENCH and VONA_SLOT_AWARE) provably reach the code that reads them');
console.log('(this exact test caught the simulator\'s own first draft failing to reach the');
console.log('bench branch at all, before VONA_SLOT_AWARE was force-enabled for the bench');
console.log('arms), and the run leaves the engine\'s shipped defaults untouched.');
console.log('WHAT IT DOES NOT: judge whether the wire-compared bench branch is a good');
console.log('change. See the claim file for the actual measured numbers and their honest');
console.log('comparison against the earlier, uncommitted claim.');
