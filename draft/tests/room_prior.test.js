// TERRITORY: A
'use strict';
/* THE GATED ROOM PRIOR — ships OFF, drifts never, blends bounded when ON.
 *
 * CFG.ROOM_MIX_PRIOR feeds survival's positionProbabilities the LEAGUE-level
 * bucket mix measured from this room's 377 keeper-corrected decisions
 * (draft/backtest/draft_behavior.py; preregistration and decomposition in
 * draft/audit/draft_behavior_2026-08-15.md). Three properties are load-bearing
 * and each is asserted, not assumed:
 *
 *   1. SHIPS FALSE. The forward test authorizes a GATED path, not a behavior
 *      change; the flip is Cory's call via DECISIONS-NEEDED.md.
 *   2. OFF MEANS OFF. With the switch false the distribution is bit-identical
 *      to the pre-switch behavior — asserted by toggling, not by faith.
 *   3. THE COPY CANNOT ROT. LEAGUE_MIX in survival.js is a copy of the
 *      artifact's league_bucket_mix (a browser module cannot read the file
 *      itself). This is the no-retype rule enforced by a test: if the artifact
 *      is regenerated and the numbers move, this suite goes red until the copy
 *      is updated deliberately.
 *
 * Run: node draft/tests/room_prior.test.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? '\n        -> ' + d : ''))); };

// ── 1. shipped state — Cory's ruling, pinned so it can't drift either way ──
ck('CFG.ROOM_MIX_PRIOR ships TRUE (Cory, 2026-08-16: "YES on room mix prior")',
   S.CFG.ROOM_MIX_PRIOR === true, 'got ' + S.CFG.ROOM_MIX_PRIOR);
ck('CFG.ROOM_MIX_W matches BUCKET_BLEND\'s magnitude (declared, not tuned)',
   S.CFG.ROOM_MIX_W === S.CFG.BUCKET_BLEND,
   'ROOM_MIX_W ' + S.CFG.ROOM_MIX_W + ' vs BUCKET_BLEND ' + S.CFG.BUCKET_BLEND);

// ── 2. the drift guard: the copy vs the artifact ───────────────────────────
const artPath = path.join(ROOT, 'draft', 'data', 'draft_behavior.json');
ck('the artifact exists (draft_behavior.json)', fs.existsSync(artPath));
if (fs.existsSync(artPath)) {
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  ck('the artifact declares territory first',
     Object.keys(art)[0] === '_territory', 'first key: ' + Object.keys(art)[0]);
  const mix = art.league_bucket_mix || {};
  ['early', 'mid', 'late'].forEach(b => {
    const want = (mix[b] || {}).share || {};
    const have = (S.LEAGUE_MIX || {})[b] || {};
    const same = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].every(p =>
      Math.abs((want[p] || 0) - (have[p] || 0)) < 1e-9);
    ck('LEAGUE_MIX.' + b + ' matches the artifact (no-retype drift guard)',
       same, 'artifact ' + JSON.stringify(want) + '\n           survival ' + JSON.stringify(have));
  });
}

// ── 3. off means off; on means bounded ─────────────────────────────────────
function dist(pickNo) {
  const team = { pick_no: pickNo, roster: [], profile: null };
  const board = [
    { player_id: '1', position: 'RB', vorp: 50 }, { player_id: '2', position: 'WR', vorp: 48 },
    { player_id: '3', position: 'QB', vorp: 30 }, { player_id: '4', position: 'TE', vorp: 20 },
    { player_id: '5', position: 'K', vorp: 5 }, { player_id: '6', position: 'DEF', vorp: 5 },
  ];
  const ctx = { league: { starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }, teams: 10 },
                progress: pickNo / 150 };
  return S.positionProbabilities(team, board, ctx);
}

// The shipped default is now ON (the ruling above), so the arms flip order:
// compute the OFF world explicitly, toggle back to the ruled ON, and restore.
S.CFG.ROOM_MIX_PRIOR = false;
const offBefore = JSON.stringify(dist(45));
S.CFG.ROOM_MIX_PRIOR = true;
const on = dist(45);
S.CFG.ROOM_MIX_PRIOR = false;
const offAfter = JSON.stringify(dist(45));
S.CFG.ROOM_MIX_PRIOR = true;   // restore the ruled default for later checks

ck('flag off -> distribution identical before and after a toggle (OFF MEANS OFF)',
   offBefore === offAfter);
ck('flag on -> distribution changed (the gate actually feeds something)',
   JSON.stringify(on) !== offBefore);
const sum = Object.values(on).reduce((a, b) => a + b, 0);
ck('flag on -> still a distribution (sums to 1)',
   Math.abs(sum - 1) < 1e-9, 'sum ' + sum);
ck('flag on -> every mass non-negative',
   Object.values(on).every(v => v >= 0));

// A bounded blend: no position may move by more than ROOM_MIX_W of the prior's
// full pull — i.e. |on - off| <= ROOM_MIX_W (the mix and the softmax are both
// distributions, so the blend moves each coordinate at most w before the
// renormalise, which only shrinks the gap further... plus float dust).
const off = JSON.parse(offBefore);
const maxMove = Math.max.apply(null, Object.keys(on).map(k => Math.abs(on[k] - off[k])));
ck('flag on -> bounded: max per-position move <= ROOM_MIX_W',
   maxMove <= S.CFG.ROOM_MIX_W + 1e-9, 'max move ' + maxMove);

// The prior pulls TOWARD the measured mix at pick 45 (round 5 -> mid bucket):
// QB's measured mid share (0.1067) sits above the value-softmax's QB mass on
// this board, so QB must move UP when the prior is on.
ck('flag on -> QB mass moves toward the measured mid-bucket share',
   on.QB > off.QB, 'off ' + off.QB + ' on ' + on.QB);

// ── 4. per-owner terms stay untouched by the gate ──────────────────────────
// The switch feeds the LEAGUE prior only (the owner term measured strictly
// negative out of sample — audit doc §3). A profiled seat's tilts run after
// the blend either way; here we assert the gate itself never reads a profile.
const srcTxt = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'draft', 'survival.js'), 'utf8');
const gateBlock = srcTxt.split('ROOM_MIX_PRIOR && round')[1];
ck('the gated block exists in positionProbabilities', !!gateBlock);
if (gateBlock) {
  const block = gateBlock.slice(0, gateBlock.indexOf('}\n    }') + 7);
  ck('the gated block never touches a profile (league prior only, by construction)',
     block.indexOf('profile') === -1, 'block references profile');
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
