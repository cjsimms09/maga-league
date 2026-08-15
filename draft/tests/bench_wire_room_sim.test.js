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

function run(rooms, seed) {
  return execSync(`node draft/tools/bench_wire_room_sim.js --rooms ${rooms} --seed ${seed}`,
    { cwd: ROOT }).toString();
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
  const out = JSON.parse(require('fs').readFileSync(
    path.join(ROOT, 'draft', 'data', 'bench_wire_room_sim.json'), 'utf8'));
  ck('the artifact records the exact seed/room count that produced it',
    out.rooms === 3 && out.seed_start === 900, { rooms: out.rooms, seed: out.seed_start });
  ck('both arms (off/on) ran the same number of rooms',
    out.detail.off.length === 3 && out.detail.on.length === 3);
  ck('every room reports a position-count breakdown, so the shape claims are checkable',
    out.detail.off.every(r => r.posCounts && typeof r.posCounts === 'object'));
}

// ── 4. THE FLAG COMPARISON IS REAL — off/on must be able to differ ─────────
// (Regression guard for the exact bug this simulator's own first run caught:
// VONA_SLOT_AWARE defaults false, and vona()'s bench branch — where
// VONA_WIRE_BENCH applies at all — is unreachable without it, which made the
// first version of this file report byte-identical off/on results.)
{
  const out = JSON.parse(require('fs').readFileSync(
    path.join(ROOT, 'draft', 'data', 'bench_wire_room_sim.json'), 'utf8'));
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

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the simulator is deterministic per seed, seeds actually');
console.log('vary the room, the committed artifact is real and structured, and the');
console.log('VONA_WIRE_BENCH flag provably reaches the code that reads it (this exact test');
console.log('caught the simulator\'s own first draft failing to reach the bench branch at');
console.log('all, before VONA_SLOT_AWARE was force-enabled for both arms).');
console.log('WHAT IT DOES NOT: judge whether the wire-compared bench branch is a good');
console.log('change. See the claim file for the actual measured numbers and their honest');
console.log('comparison against the earlier, uncommitted claim.');
