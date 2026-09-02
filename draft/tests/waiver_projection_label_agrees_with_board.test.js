// TERRITORY: B — register 468 (E, 09-02, filed as 467): the wire labels every
// free-agent projection "Sleeper proj" while showing the multi-source blend.
/* CAUSE ①, fixed here: `waiverInputsFromBundle`'s `enrich()` sourced
 * `proj_sleeper` from `playersDb.players[pid].proj` — Sleeper's players DB,
 * which register 427 established never carries a per-player projection at
 * all. So `proj_sleeper` was always `undefined` on every enriched row, even
 * though the BOARD carries a real per-source `proj_sleeper` for the same
 * player (`art.proj_sleeper`) — the exact field the draft board itself
 * passes into the same shared derivation (`app.js` calls
 * `rawProjection(p, ...)` with the raw board row). `consensusProjection()`
 * then fell through to the single-field `proj_mean` fallback and defaulted
 * its label to "Sleeper proj" (the shared module's default when no
 * provenance is passed), while the VALUE shown was the multi-source blend.
 *
 * Fixed: `enrich()` now sources `proj_sleeper`/`proj_fantasypros` from the
 * board row, so a player the board prices from two sources gets an honest
 * "Consensus (2 src)" label on the wire too — and, by construction, the SAME
 * label the draft board would show for that same row, since both now feed
 * `rawProjection()` the identical per-source fields.
 *
 * Run: node draft/tests/waiver_projection_label_agrees_with_board.test.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'src', 'routes', 'waivers.js'));
const SharedConsensus = require(path.join(ROOT, 'public', 'js', 'draft', 'consensus.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// A board row with TWO real per-source projections, same shape build.py emits
// and the same shape app.js passes straight into rawProjection() for the
// draft board's own display.
const boardRow = {
  player_id: 'p1', name: 'Two-Source Guy', position: 'WR',
  proj_mean: 150.0, vorp: 40, bye: 5,
  proj_sleeper: 160.0, proj_fantasypros: 140.0,
};
// A board row with only ONE real source -- must NOT be inflated to a false
// "Consensus" label.
const singleSourceRow = {
  player_id: 'p2', name: 'One-Source Guy', position: 'RB',
  proj_mean: 90.0, vorp: 10, bye: 9,
  proj_sleeper: 90.0,
};
const artifact = { players: [boardRow, singleSourceRow] };

// Sleeper's players DB: register 427's finding, unchanged here -- `proj` is
// never present. The old code read exactly this field for proj_sleeper.
const playersDb = { players: {
  p1: { name: 'Two-Source Guy', pos: 'WR', inj: null },
  p2: { name: 'One-Source Guy', pos: 'RB', inj: null },
} };
const bundle = { rosters: [{ roster_id: 1, players: [] }] };  // both are free agents

const { freeAgents } = W.waiverInputsFromBundle(bundle, playersDb, artifact, 1);
const fa1 = freeAgents.find(p => p.player_id === 'p1');
const fa2 = freeAgents.find(p => p.player_id === 'p2');

ck('the enriched free agent carries the BOARD\'s per-source proj_sleeper, not Sleeper\'s players-DB field (which is always undefined)',
  fa1.proj_sleeper === 160.0, fa1.proj_sleeper);
ck('...and the board\'s proj_fantasypros too',
  fa1.proj_fantasypros === 140.0, fa1.proj_fantasypros);

const consensus1 = W.consensusProjection(fa1);
ck('a real two-source player gets the honest "Consensus (2 src)" label, not "Sleeper proj"',
  consensus1.label === 'Consensus (2 src)', consensus1.label);
ck('...and the VALUE is the two-source average, not proj_mean (150) or proj_sleeper alone (160)',
  Math.abs(consensus1.value - 150.0) < 1e-9, consensus1.value);

ck('CONTROL — a genuinely single-source player still gets "Sleeper proj", not falsely upgraded to Consensus',
  W.consensusProjection(fa2).label === 'Sleeper proj', W.consensusProjection(fa2).label);

// THE CONTRACT ITSELF: the wire's label for a player must equal what the
// draft board's own code path would print for the identical row -- app.js
// calls rawProjection(p, provenance) with the raw board object directly.
const boardLabel = SharedConsensus.rawProjection(boardRow, {}).label;
ck('THE C3 CONTRACT — the wire\'s label for this player now matches the draft board\'s label for the same row',
  consensus1.label === boardLabel, { wire: consensus1.label, board: boardLabel });

console.log(`\n${pass}/${pass + fail} waiver-projection-label-agrees-with-board checks passed`);
process.exit(fail ? 1 : 0);
