// TERRITORY: A
// THE WIRE — does the board state survive the real server, byte for byte?
//
// `taken_ids_replay.test.js` proves the payload is built correctly and can be
// rescored, but it STUBS `fetch`, so it says nothing about the server. I flagged
// that gap and routed it to B as the one part of "deployed" I could not close.
// That was half right: the DEPLOYED Netlify function is B's, but the express app
// those functions wrap is bootable in-process — `server-ledger.test.js` already
// does exactly that. So the wire is reachable from here after all, and leaving it
// routed would have been an excuse rather than a boundary.
//
// This boots the real app on a temp store, logs in, POSTs a WORST-CASE
// recommendation over real HTTP, and reads it back through the real GET.
//
// ── WHY WORST CASE AND NOT A TOKEN PAYLOAD ─────────────────────────────────
//
// The risk this exists to catch is a size or serialisation limit that only
// appears deep in a draft. A one-id payload round-trips on any transport. The
// last pick of a fifteen-round draft carries ~150 ids, so that is what gets
// posted, and the count is asserted rather than assumed.
//
// Run: node draft/tests/taken_ids_wire.test.js
const os = require('os');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-taken-'));
const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

// The SHIPPED client serializer — the same function app.js calls, so this tests
// the real representation rather than a hand-built lookalike.
global.window = global;
const PL = require(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));
const DRAFT = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

function cookieFrom(res) {
  return res.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
}

(async function () {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('draftnight2026');
  cory.must_change_password = false;
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(base + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=draftnight2026', redirect: 'manual' });
  const cookie = cookieFrom(login);
  check('commissioner login succeeds', login.status === 302, String(login.status));

  // ── WORST CASE: the last pick of the draft ──────────────────────────────
  const ids = DRAFT.players.slice(0, 149).map(p => String(p.player_id));
  const bs = PL.boardState(new Set(ids), DRAFT.players.length - ids.length);
  check('the fixture is genuinely worst-case (~150 taken)', bs.taken_count >= 140, bs.taken_count);

  const body = {
    kind: 'recommendation', method: 'composite-v1', season: 2026, pick: 148,
    build_at: '2026-08-13T12:00:00Z', client_at: new Date().toISOString(),
    payload: Object.assign({ mock: false }, bs, {
      top: [{ player_id: ids[0], name: 'X', position: 'WR', score: 12.3 }],
    }),
  };
  const post = await fetch(base + '/admin/api/ledger/predict', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify(body), redirect: 'manual' });
  check('POST accepted (a 400/413 here is a body-parser or size limit)',
    post.status === 200, 'status ' + post.status);
  const posted = post.status === 200 ? await post.json() : {};

  // ── READ IT BACK THROUGH THE REAL GET ───────────────────────────────────
  const get = await fetch(base + '/admin/api/ledger/predict?season=2026', { headers: { Cookie: cookie } });
  const read = get.status === 200 ? await get.json() : { entries: [] };
  const row = (read.entries || []).find(e => e.kind === 'recommendation');
  check('the row reads back', !!row);

  const p = (row && row.payload) || {};
  check('taken_player_ids survived the round trip',
    Array.isArray(p.taken_player_ids) && p.taken_player_ids.length === bs.taken_count,
    (p.taken_player_ids || []).length + ' of ' + bs.taken_count);
  // EXACT, not just the count — a transport that reordered or coerced ids would
  // keep the count and destroy the replay.
  check('every id is byte-identical and IN THE SAME ORDER',
    Array.isArray(p.taken_player_ids)
      && p.taken_player_ids.length === bs.taken_player_ids.length
      && p.taken_player_ids.every((v, i) => v === bs.taken_player_ids[i]));
  check('board_size, taken_count, taken_order and mock survived',
    p.board_size === bs.board_size && p.taken_count === bs.taken_count
    && p.taken_order === bs.taken_order && p.mock === false,
    JSON.stringify({ board_size: p.board_size, taken_count: p.taken_count,
      taken_order: p.taken_order, mock: p.mock }));

  // THE END-TO-END CHECK: recompute the digest from what came BACK. This is the
  // one assertion that fails if any id was silently altered anywhere in the path.
  const recomputed = PL.boardState(p.taken_player_ids || [], p.board_size).taken_digest;
  check('DIGEST RECOMPUTED FROM THE RETURNED IDS EQUALS THE STORED DIGEST',
    recomputed === p.taken_digest && p.taken_digest === bs.taken_digest,
    'sent ' + bs.taken_digest + ' stored ' + p.taken_digest + ' recomputed ' + recomputed);

  // ── FAIL ARM: the check must be able to notice a corrupted trip ──────────
  const tampered = (p.taken_player_ids || []).slice(0, -1);
  check('FAIL ARM — a dropped id changes the recomputed digest',
    PL.boardState(tampered, p.board_size).taken_digest !== p.taken_digest);

  // ── AND IT MUST BE DURABLE, NOT JUST IN MEMORY ──────────────────────────
  // A row that lives only in process memory is lost to a redeploy, which is the
  // failure mode the whole ledger exists to prevent.
  const keys = await store.listKeys('pred:2026:');
  const stored = keys.length ? await store.get(keys[0]) : null;
  const sp = (stored && stored.payload) || {};
  check('the board state is in the BACKING STORE, not only the response',
    Array.isArray(sp.taken_player_ids) && sp.taken_player_ids.length === bs.taken_count,
    (sp.taken_player_ids || []).length);

  server.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
  if (fail) { console.log('\nFAILED — the board state does NOT survive the wire.'); process.exit(1); }
  console.log('\nWHAT THIS CLOSES: the real express app accepts, stores and returns a');
  console.log('worst-case ~150-id board state unaltered, and it is durable in the store.');
  console.log('WHAT REMAINS B\'s: the DEPLOYED Netlify function wrapping this app, and the');
  console.log('Blobs backend standing in here as a file store with the same interface.');
})();
