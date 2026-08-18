// TERRITORY: A
/* THE DEPLOYED-PATH PROOF FOR `taken_player_ids` — gated item 1 and 2.
 *
 * Cory, #24: completion means EVIDENCE EXISTS. Not "the code is written", not
 * "the test passed once". So this is not a unit test of the serializer. It runs
 * a FULL FIFTEEN-PICK MOCK through the SHIPPED PredLedger with the server
 * stubbed at the transport boundary only, captures whatever actually lands, and
 * then REPLAYS EACH RECOMMENDATION FROM THE PERSISTED ROW ALONE.
 *
 * The replay is the part that matters and it is deliberately hostile: it is
 * handed the stored row and the player universe, and NOTHING from the live run.
 * If the row is insufficient to reconstruct the board, the rebuild diverges and
 * the digest check fails loudly rather than a rescore quietly running on the
 * wrong board.
 *
 * ── WHAT THIS CAN AND CANNOT CLAIM ─────────────────────────────────────────
 *
 * CAN: the payload the app constructs contains a faithful, checkable board
 * state; it survives the write path; it is retrievable afterward; and a rescore
 * from it reproduces the recommendation that was made.
 *
 * CANNOT: that the real Netlify function stores and returns it byte-for-byte.
 * `fetch` is stubbed here, so the network and the server's own persistence are
 * NOT under test. That is a genuine gap in the word "deployed" and it is named
 * rather than papered over — closing it needs a live write against the real
 * endpoint, which is B's surface and is the one step of this proof I cannot
 * perform from A's lane.
 *
 * Run: node draft/tests/taken_ids_replay.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

/* `E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS` WAS A LATENT INSTANCE OF A DEFECT
 * THIS REPO HAS ALREADY REMOVED THREE TIMES (session E, 2026-08-17; E19).
 *
 * It is inert today because MEASURED_WEIGHTS exists. The shape is the problem:
 * if the export were ever renamed or removed, this suite would silently score
 * DEFAULT_WEIGHTS — five of eight terms differ — and stay green while grading a
 * board no surface renders. That is exactly what rec_rows.test.js measured when
 * it happened for real: the top recommendation differed at 7 of Cory's 12 picks.
 * Its conclusion is the rule followed here: a suite that cannot find the
 * production weights must STOP, not guess. */
const PROD_WEIGHTS = (function () {
  const w = E.MEASURED_WEIGHTS;
  if (!w || typeof w.value !== 'number') {
    throw new Error('REFUSING to replay: engine.js no longer exports MEASURED_WEIGHTS, '
      + 'which is what app.js initialises state.weights from.');
  }
  return w;
})();
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));

let checks = 0, failed = 0;
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log('  RED  ' + name + (detail ? '   ' + detail : '')); }
  else console.log('  ok   ' + name + (detail ? '   ' + detail : ''));
}

/* ── THE STUBBED TRANSPORT — the ONLY thing faked ─────────────────────────
 * Everything above this line is the shipped module. The stub records exactly
 * what the module tried to send, which is the artifact under examination. */
const WIRE = [];
global.fetch = function (url, opts) {
  let body = null;
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) { body = { unparseable: true }; }
  WIRE.push(body);
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
};

const PL = require(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));

/* ── THE MOCK DRAFT — fifteen real picks, real engine, real ledger ────────
 * The room is advanced in ADP order between my picks, which is the same
 * assumption draft_plan makes. The point here is not room realism; it is that
 * the board CHANGES between decisions, so a record that silently captured a
 * constant board would pass a one-pick test and fail this one. */
const universe = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = universe.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = PLAN.SCHED;

const drafted = new Set();                       // exactly app.js's state.drafted
PLAN.keep.forEach(k => drafted.add(String(k.player_id)));
const roster = PLAN.keep.map(k => Object.assign({}, k, { is_keeper: true }));
const liveTruth = [];                            // what was ACTUALLY available, kept out of the ledger

console.log('DEPLOYED-PATH PROOF — taken_player_ids survives a full mock and replays\n');
console.log('  running a 15-pick mock through the shipped PredLedger...');

SCHED.forEach((pk, i) => {
  // advance the room to this pick
  let need = (pk - 1) - (drafted.size - PLAN.keep.length);
  for (let j = 0; j < byAdp.length && need > 0; j++) {
    const p = byAdp[j];
    if (drafted.has(String(p.player_id))) continue;
    drafted.add(String(p.player_id)); need--;
  }
  const board = universe.filter(p => !drafted.has(String(p.player_id)));
  const out = E.recommend({
    board, roster, nextPick: SCHED[i + 1] || null, currentPick: pk, pick: pk,
    round: Math.ceil(pk / (DATA.league.teams || 10)),
    myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
    totalPicks: 150, league: DATA.league,
    weights: PROD_WEIGHTS,
    currentKeepers: roster.filter(p => p.is_keeper),
    ceilingAllStages: false, doctrine: null, drift: null,
    intervening: (SCHED[i + 1] || pk) - pk,
  });
  const scored = Array.isArray(out) ? out : (out && out.scored) || [];
  if (!scored.length) return;

  /* EXACTLY the app.js call, including the serializer it now shares. */
  PL.recommendation({
    season: 2026, build_at: 'proof-build', pick: pk, method: 'composite-v1',
    payload: Object.assign({ mock: true }, PL.boardState(drafted, board.length), {
      weights: {}, top: scored.slice(0, 10).map(s => ({
        player_id: String(s.player.player_id), name: s.player.name,
        position: s.player.position, score: Math.round(s.score * 10) / 10,
      })),
    }),
  });

  liveTruth.push({ pick: pk, boardIds: board.map(p => String(p.player_id)).sort(),
    top1: String(scored[0].player.player_id) });

  // I take my pick
  const mine = scored[0].player;
  drafted.add(String(mine.player_id));
  roster.push(Object.assign({}, mine));
});

/* ── 1. DID IT SURVIVE THE WRITE PATH AT ALL ─────────────────────────────*/
const recs = WIRE.filter(e => e && e.kind === 'recommendation');
check('a row was written for every pick', recs.length === liveTruth.length,
  recs.length + ' rows / ' + liveTruth.length + ' picks');
check('MOCK ROWS ARE WRITTEN AT ALL (they used to be dropped)', recs.length > 0);
check('every row is stamped mock:true so it cannot be mistaken for deployed evidence',
  recs.every(r => r.payload && r.payload.mock === true));
check('every row carries the decision join key', recs.every(r => r.payload && r.payload.key));

/* ── 2. IS THE BOARD STATE ACTUALLY THERE, ON EVERY ROW ──────────────────*/
check('every row carries taken_player_ids',
  recs.every(r => Array.isArray(r.payload.taken_player_ids)));
check('every row carries a digest and a board_size',
  recs.every(r => typeof r.payload.taken_digest === 'string' && r.payload.board_size != null));
/* THE ANTI-CONSTANT ARM. A capture that recorded the same board every time
 * would satisfy every check above. */
const uniq = new Set(recs.map(r => r.payload.taken_digest));
check('the captured board CHANGES between picks (not a constant)',
  uniq.size === recs.length, uniq.size + ' distinct digests / ' + recs.length + ' rows');
check('taken_count grows monotonically across picks',
  recs.every((r, i) => i === 0 || r.payload.taken_count > recs[i - 1].payload.taken_count));

/* ── 3. DOES THE PERSISTED STATE MATCH THE REAL BOARD ────────────────────
 * Compared against liveTruth, which was never given to the ledger. */
let mismatch = 0;
recs.forEach((r, i) => {
  const takenSet = new Set(r.payload.taken_player_ids);
  const rebuilt = universe.filter(p => !takenSet.has(String(p.player_id)))
    .map(p => String(p.player_id)).sort();
  const truth = liveTruth[i].boardIds;
  if (rebuilt.length !== truth.length || rebuilt.some((x, k) => x !== truth[k])) mismatch++;
});
check('the board REBUILT FROM THE ROW equals the board the engine actually saw',
  mismatch === 0, mismatch + ' mismatched of ' + recs.length);
check('board_size on the row equals the rebuilt board size',
  recs.every((r, i) => r.payload.board_size === liveTruth[i].boardIds.length));

/* ── 4. THE REPLAY — rescore from the row alone ──────────────────────────
 * Nothing from the live run is in scope here except the row and the universe.
 * This is the question the whole record exists to keep answerable. */
let replayed = 0, agreed = 0;
recs.forEach((r, i) => {
  const takenSet = new Set(r.payload.taken_player_ids);
  const board = universe.filter(p => !takenSet.has(String(p.player_id)));
  const pk = Number(String(r.payload.key).split('|')[2]);
  const idx = SCHED.indexOf(pk);
  /* The roster is reconstructed from the keepers plus the top pick of each
   * EARLIER row — i.e. from the ledger, not from the live run. */
  const past = PLAN.keep.map(k => Object.assign({}, k, { is_keeper: true }));
  for (let j = 0; j < i; j++) {
    const id = recs[j].payload.top[0].player_id;
    const p = universe.find(u => String(u.player_id) === String(id));
    if (p) past.push(Object.assign({}, p));
  }
  const out = E.recommend({
    board, roster: past, nextPick: SCHED[idx + 1] || null, currentPick: pk, pick: pk,
    round: Math.ceil(pk / (DATA.league.teams || 10)),
    myPicksLeft: SCHED.length - idx, myPickIndex: idx, totalMyPicks: SCHED.length,
    totalPicks: 150, league: DATA.league,
    weights: PROD_WEIGHTS,
    currentKeepers: past.filter(p => p.is_keeper),
    ceilingAllStages: false, doctrine: null, drift: null,
    intervening: (SCHED[idx + 1] || pk) - pk,
  });
  const scored = Array.isArray(out) ? out : (out && out.scored) || [];
  if (!scored.length) return;
  replayed++;
  if (String(scored[0].player.player_id) === String(r.payload.top[0].player_id)) agreed++;
});
check('every row could be replayed', replayed === recs.length,
  replayed + ' / ' + recs.length);
check('THE REPLAY REPRODUCES THE ORIGINAL RECOMMENDATION AT EVERY PICK',
  agreed === replayed, agreed + ' / ' + replayed + ' agree');

/* ── 5. THE FAIL ARM — #14: a guard is not verified by its happy path ────
 * Corrupt a stored row and confirm the digest catches it. Without this the
 * digest is decoration: every check above passes on data that was never
 * tampered with, which proves nothing about detection. */
{
  const r = recs[Math.floor(recs.length / 2)];
  const bad = r.payload.taken_player_ids.slice(0, -1);        // drop one id
  const recomputed = PL.boardState(bad, r.payload.board_size).taken_digest;
  check('FAIL ARM — a tampered taken set produces a DIFFERENT digest',
    recomputed !== r.payload.taken_digest);
  const same = PL.boardState(r.payload.taken_player_ids.slice().reverse(),
    r.payload.board_size).taken_digest;
  check('digest is invariant to ORDER (so reordering is not a false alarm)',
    same === r.payload.taken_digest);
}

console.log('\n  ' + (checks - failed) + '/' + checks + ' checks passed');
if (failed) { console.log('\n  FAILED — taken_player_ids is NOT proven.'); process.exit(1); }
console.log('\n  WHAT THIS PROVES: a recommendation made on this path carries a faithful,');
console.log('  checkable board state; it survives the write; and it can be rescored from');
console.log('  the stored row alone, reproducing the original pick at all ' + agreed + ' picks.');
console.log('  WHAT IT DOES NOT: `fetch` is stubbed, so the real endpoint\'s own storage and');
console.log('  read-back are NOT under test. That step is B\'s surface and is the one part');
console.log('  of "deployed" this cannot close from A\'s lane.');
