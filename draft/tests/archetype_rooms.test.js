// TERRITORY: A
// THE ARCHETYPE ROOM DRIVER — mechanics only (determinism, non-vacuity, real
// keeper geometry, artifact hygiene). What the arms MEASURED belongs in
// draft/audit/roster_construction_2026-08-16.md, not here — a strategy
// question has no pass/fail, only a report.
//
// Seeds here are 9001+ — the smoke pool the policy file reserves for
// mechanics, excluded from every ranking.
//
// Run: node draft/tests/archetype_rooms.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// Runs write to a SCRATCH path, never the committed artifact — the exact
// lesson bench_wire_room_sim.test.js carries from the independent review
// (its 3-room test runs silently overwrote the committed 30-room artifact).
const TEST_OUT = path.join(os.tmpdir(), 'archetype_rooms.test-out.json');
const COMMITTED = path.join(ROOT, 'draft', 'data', 'archetype_rooms.json');
const committedHashBefore = fs.existsSync(COMMITTED)
  ? crypto.createHash('sha256').update(fs.readFileSync(COMMITTED)).digest('hex') : null;

function run(extra) {
  return execSync('node draft/tools/archetype_rooms.js ' + extra,
    { cwd: ROOT, env: Object.assign({}, process.env,
      { ARCHETYPE_ROOMS_OUT: TEST_OUT }) }).toString();
}
const FAST = '--rooms 2 --seed 9001 --arms shipped,zero_rb --sims 200';

// ── 1. deterministic per seed, and seeds actually vary the room ────────────
{
  const a = run(FAST), b = run(FAST);
  ck('same seed + config reproduce identical output, twice', a === b);
  const c = run('--rooms 2 --seed 9007 --arms shipped,zero_rb --sims 200');
  ck('a different seed produces a different room — not the same draft re-served',
    a !== c);
}

// ── 2. artifact structure + the real seat/keeper geometry ──────────────────
{
  run(FAST);
  const out = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  ck('artifact records seeds/arms/opponent model/keeper mode',
    out.seed_start === 9001 && out.rooms === 2
    && out.arms.join(',') === 'shipped,zero_rb'
    && out.opponents === 'measured' && out.keepers === 'designated');
  ck('the three designated opponent keeper teams are applied',
    out.opp_keeper_teams === 3, out.opp_keeper_teams);
  ck('the seat plan schedule is loaded (12 seats) for the seat_plan arm',
    out.plan_seats_loaded === 12, out.plan_seats_loaded);
  const rooms = out.detail.shipped;
  ck('both arms ran both rooms, no crashes',
    rooms.length === 2 && out.detail.zero_rb.length === 2
    && rooms.every(r => !r.crashed) && out.detail.zero_rb.every(r => !r.crashed));
  ck('my roster is exactly 15 (3 keepers + 12 live picks) with no missing starters',
    rooms.every(r => r.rosterSize === 15 && r.myMissingStarters === 0),
    rooms.map(r => [r.rosterSize, r.myMissingStarters]));
  ck('my first live pick is overall 33 — the real keeper arithmetic',
    rooms.every(r => r.picksLog[0].pick === 33), rooms[0] && rooms[0].picksLog[0]);
  ck('every room reports season outcomes as probabilities in [0,1]',
    ['shipped', 'zero_rb'].every(a2 => out.detail[a2].every(r =>
      r.playoff_prob >= 0 && r.playoff_prob <= 1
      && r.champ_prob >= 0 && r.champ_prob <= 1
      && r.bottom3_prob >= 0 && r.bottom3_prob <= 1
      && r.mean_weekly > 50 && r.mean_weekly < 250)));
  ck('summary + paired-vs-shipped blocks exist for the non-control arm',
    out.summary.zero_rb && out.paired_vs_shipped.zero_rb
    && out.paired_vs_shipped.zero_rb.mean_weekly
    && typeof out.paired_vs_shipped.zero_rb.mean_weekly.mean === 'number');
}

// ── 3. CONTROL — the overlay is actually read (non-vacuity) ────────────────
// If zero_rb never diverges from the engine's top pick across rooms whose
// early rounds are RB-rich, the overlay is provably not reaching the choice.
{
  const out = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  const diverged = out.detail.zero_rb.reduce((s, r) => s + r.overlayDiverged, 0);
  ck('CONTROL — zero_rb overrode the engine top pick at least once across the '
    + 'smoke rooms, proving the overlay reaches the choice', diverged > 0, diverged);
  const anyPickDiffers = out.detail.zero_rb.some((r, i) =>
    JSON.stringify(r.picksLog.map(p => p.name))
    !== JSON.stringify(out.detail.shipped[i].picksLog.map(p => p.name)));
  ck('CONTROL — the resulting rosters actually differ between arms', anyPickDiffers);
  ck('zero_rb honors its own ban: no RB drafted before round 10 in any room',
    out.detail.zero_rb.every(r =>
      r.picksLog.every(p => p.pos !== 'RB' || p.round >= 10)),
    out.detail.zero_rb.map(r => r.picksLog.filter(p => p.pos === 'RB').map(p => p.round)));
}

// ── 4. the robustness switches are real switches ───────────────────────────
{
  run('--rooms 1 --seed 9001 --arms shipped --sims 100 --keepers mine-only');
  const mineOnly = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  ck('--keepers mine-only applies zero opponent keeper teams',
    mineOnly.opp_keeper_teams === 0);
  run('--rooms 1 --seed 9001 --arms shipped --sims 100 --opponents adp');
  const adp = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  ck('--opponents adp runs and records its model', adp.opponents === 'adp');
  run('--rooms 1 --seed 9001 --arms shipped --sims 100');
  const meas = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
  ck('CONTROL — measured vs adp opponents produce different leagues from the '
    + 'same seed (the opponent model is actually consulted)',
    JSON.stringify(meas.detail.shipped[0].picksLog)
      !== JSON.stringify(adp.detail.shipped[0].picksLog)
    || meas.detail.shipped[0].mean_weekly !== adp.detail.shipped[0].mean_weekly);
}

// ── 5. artifact hygiene + flag hygiene ─────────────────────────────────────
{
  const committedHashAfter = fs.existsSync(COMMITTED)
    ? crypto.createHash('sha256').update(fs.readFileSync(COMMITTED)).digest('hex') : null;
  ck('the committed artifact was never touched by these runs '
    + '(ARCHETYPE_ROOMS_OUT redirects)', committedHashBefore === committedHashAfter);
}
{
  // The driver refuses to write if the run mutated engine CFG flags; loading
  // the engine here confirms the shipped defaults are what the ruling says.
  global.window = global;
  require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
  require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  ck('engine defaults match Cory\'s 2026-08-16 ruling after all runs '
    + '(VONA_SLOT_AWARE=false, VONA_WIRE_BENCH=true)',
    E.CFG.VONA_SLOT_AWARE === false && E.CFG.VONA_WIRE_BENCH === true);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the driver is deterministic per seed, the overlay');
console.log('and the opponent-model switch provably reach the picks, the real keeper');
console.log('slate and seat geometry are applied, and no run touches the committed');
console.log('artifact or the engine defaults.');
console.log('WHAT IT DOES NOT: judge which archetype is best — see the audit doc.');
