// TERRITORY: A
/* roster_room_audit.js — mechanics checks. Runs the real simulator for a
 * small seeded batch to a TEMP path (never the committed artifact — the
 * lesson bench_wire_room_sim.js learned the hard way), then asserts:
 *   1. every non-crashed room fields a complete legal starting lineup;
 *   2. both arms and the paired K/DEF-timing metric are present;
 *   3. the artifact declares _territory as its FIRST key;
 *   4. flag hygiene — a full run leaves the engine's shipped defaults
 *      untouched (VONA_SLOT_AWARE false, CEILING_TIEBREAK true).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'draft', 'backtest', 'roster_room_audit.js');
const tmp = path.join(os.tmpdir(), 'roster_room_audit_test_' + process.pid + '.json');

execFileSync(process.execPath, [TOOL, '--rooms', '2', '--seed', '777'], {
  env: Object.assign({}, process.env, { ROSTER_ROOM_AUDIT_OUT: tmp }),
  stdio: 'pipe',
});
const raw = fs.readFileSync(tmp, 'utf8');
fs.unlinkSync(tmp);
const out = JSON.parse(raw);

// 3. territory declared first
assert.strictEqual(Object.keys(out)[0], '_territory', '_territory must be the first key');
assert.ok(/TERRITORY: A/.test(out._territory));

// 2. arms + paired metric
assert.ok(out.summary.shipped && out.summary.onesie_last, 'both arms summarized');
assert.ok(out.kdef_timing_cost_paired && typeof out.kdef_timing_cost_paired.n === 'number');
assert.strictEqual(out.tie_by_pick.length, 12, 'one tie row per live pick');

// 1. legality in every non-crashed room of both arms
['shipped', 'onesie_last'].forEach(arm => {
  out.detail[arm].forEach(r => {
    if (r.crashed) return;
    assert.strictEqual(r.rosterSize, 15, arm + ' seed ' + r.seed + ': roster is 15');
    assert.strictEqual(r.legal, true,
      arm + ' seed ' + r.seed + ': lineup illegal, missing ' + JSON.stringify(r.missing));
  });
  assert.strictEqual(out.summary[arm].crashed, 0, arm + ': no crashed rooms in this batch');
});

// 4. flag hygiene — the child process cannot leak into this one, so re-require
// the engine here and check the committed defaults the tool claims it used.
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
assert.strictEqual(E.CFG.VONA_SLOT_AWARE, false, 'shipped default: VONA_SLOT_AWARE false');
assert.strictEqual(E.CFG.CEILING_TIEBREAK, true, 'shipped default: CEILING_TIEBREAK true');
assert.strictEqual(out.engine_flags.VONA_SLOT_AWARE, false, 'artifact recorded the shipped flag');

console.log('roster_room_audit.test.js: all checks passed');
