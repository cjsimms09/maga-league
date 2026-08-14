// TERRITORY: A
'use strict';
/* LAYER 3 — TWO SILENT LOSSES IN `allPicks`, NOW COUNTED.
 *
 * ── 1. A PICK WITH NO ID WAS DROPPED WITHOUT TRACE ─────────────────────────
 *
 *     const id = String(p.player_id || (p.metadata && p.metadata.player_id) || '');
 *     if (!id || seen.has(id)) return;
 *
 * `currentPick` is `pickEvents + 1`. Lose one pick here and the board believes
 * fewer selections have happened than really have, so EVERY survival window is
 * computed too early and every player looks more likely to last than he is.
 *
 * That is the same failure that cost 25 slots this morning via `applySlot`,
 * arriving from a different direction — except `applySlot` at least produced a
 * number someone could disagree with. This one leaves nothing behind.
 *
 * ── 2. A MISSING pick_no IS REPLACED BY AN ARRAY POSITION ──────────────────
 *
 *     pick_no: p.pick_no || out.length + 1
 *
 * A plausible value standing in for an absent one — and it can COLLIDE with a
 * real pick_no, after which the sort between the two is arbitrary and run
 * detection reads a sequence the room never produced.
 *
 * ── WHY COUNTED AND NOT REFUSED ────────────────────────────────────────────
 *
 * Neither is worth stopping the board for mid-draft: it is still mostly right,
 * and a war room that halts at pick 40 is worse than one that is slightly off
 * and says so. The distinction that matters is between a DEGRADED board and a
 * board that lies about being intact.
 *
 * Dedup on `seen` stays silent deliberately — the same player twice is one
 * selection, and Sleeper rows are concatenated ahead of manual ones so the real
 * pick wins. Only the id-less case is a loss.
 *
 * Run: node draft/tests/sync_ingest_health.test.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global.window || {};
require(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'));
const DraftSync = global.window.DraftSync || global.DraftSync;

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };

function mk(picks) {
  const s = Object.create(DraftSync.prototype);
  s.picks = picks; s.manual = [];
  s.supersededManual = () => [];
  return s;
}
const pk = (id, no) => ({ player_id: id, pick_no: no, draft_slot: 1 });

ck('CONTROL — DraftSync and ingestHealth are the shipped ones',
  typeof DraftSync === 'function' && typeof DraftSync.prototype.ingestHealth === 'function');

// ── A CLEAN ROOM REPORTS CLEAN ──────────────────────────────────────────────
{
  const s = mk([pk('1', 1), pk('2', 2), pk('3', 3)]);
  const h = s.ingestHealth();
  ck('a normal pick list reports clean', h.clean === true, h);
  ck('...with every pick present', h.picks === 3, h);
  ck('...and nothing dropped', h.dropped_no_id === 0, h);
}

// ── 1. THE ID-LESS DROP IS COUNTED ──────────────────────────────────────────
{
  const s = mk([pk('1', 1), { pick_no: 2, draft_slot: 1 }, pk('3', 3)]);
  const h = s.ingestHealth();
  ck('a pick with no resolvable id is COUNTED, not silently lost',
    h.dropped_no_id === 1, h);
  ck('...and the room is reported NOT clean', h.clean === false, h);
  ck('THE CONSEQUENCE, stated: the pick count is short, so the clock reads '
    + 'early and every survival window is computed too soon',
    h.picks === 2, h);
}

// ── DEDUP STAYS SILENT, BECAUSE IT IS NOT A LOSS ────────────────────────────
{
  const s = mk([pk('1', 1), pk('1', 1), pk('2', 2)]);
  const h = s.ingestHealth();
  ck('the same player twice is ONE selection and is not reported as a loss',
    h.dropped_no_id === 0 && h.picks === 2, h);
  ck('...and that alone does not mark the room dirty', h.clean === true, h);
}

// ── 2. A SYNTHETIC pick_no THAT COLLIDES IS COUNTED ─────────────────────────
{
  // Second row has no pick_no, so it takes `out.length + 1` = 2 — colliding
  // with the real pick 2 that follows. After the sort their order is arbitrary.
  const s = mk([pk('1', 1), { player_id: '9', draft_slot: 1 }, pk('2', 2)]);
  const h = s.ingestHealth();
  ck('a substituted pick_no that collides with a real one is COUNTED',
    h.pick_no_collisions >= 1, h);
  ck('...and marks the room not clean', h.clean === false, h);
}
{
  const s = mk([pk('1', 1), pk('2', 2), pk('3', 3)]);
  ck('CONTROL — real pick numbers collide with nothing',
    s.ingestHealth().pick_no_collisions === 0, s.ingestHealth());
}

// ── THE ORDER CONTRACT STILL HOLDS ──────────────────────────────────────────
{
  const s = mk([pk('3', 3), pk('1', 1), pk('2', 2)]);
  const ids = s.allPicks().map(r => r.player_id);
  ck('out-of-order arrival is normalised by pick_no, not by arrival order',
    ids.join(',') === '1,2,3', ids);
}

// ── FAIL ARM: the silent-return could not have passed these ─────────────────
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('FAIL ARM — the combined silent return is gone from the source',
    !/if \(!id \|\| seen\.has\(id\)\) return;/.test(body),
    'an id-less pick can still vanish without being counted');
  ck('the id-less branch increments a counter',
    /droppedNoId/.test(body));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
