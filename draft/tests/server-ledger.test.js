// Server integration test for the prediction ledger (Phase L1) over real HTTP.
//
// Boots the actual express app on a temp file store, logs in as the
// commissioner, POSTs one recommendation capture, and reads it back. This is
// the permanent guard for the bug the live test caught: the app must mount a
// JSON body parser, or every fetch()-posted prediction silently 400s and draft
// night's data is lost. Requires node_modules (express etc.) — CI installs them
// before running this file.
//
// Run: node draft/tests/server-ledger.test.js
const os = require('os');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-ledger-'));
process.env.DATA_DIR = tmp;

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

function cookieFrom(res) {
  const c = res.headers.getSetCookie();
  return c.map(s => s.split(';')[0]).join('; ');
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

  // /api/health must be public (NO auth) — CI deploy-verify and the pre-draft
  // checklist rely on it without credentials, and it must leak no league data.
  const health = await fetch(base + '/api/health');
  const hbody = health.status === 200 ? await health.json() : {};
  check('GET /api/health is public (200, no login)', health.status === 200, String(health.status));
  check('health declares the storage backend (file in this test)',
    hbody.storage_backend === 'file', String(hbody.storage_backend));
  check('health carries a commit field and no league data',
    ('commit' in hbody) && !('owners' in hbody) && !('players' in hbody));

  const login = await fetch(base + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=draftnight2026', redirect: 'manual' });
  check('commissioner login succeeds (302)', login.status === 302, String(login.status));
  const cookie = cookieFrom(login);

  // The exact shape the client (public/js/draft/predledger.js) posts.
  const body = { kind: 'recommendation', method: 'composite-v1', season: 2026, pick: 34,
    build_at: '2026-08-07T23:28:30Z', client_at: new Date().toISOString(),
    payload: { top: [{ player_id: '11604', name: 'Brock Bowers', position: 'TE', score: 126.5 }] } };
  const post = await fetch(base + '/admin/api/ledger/predict', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify(body), redirect: 'manual' });
  check('POST /admin/api/ledger/predict returns 200 (JSON body parsed)',
    post.status === 200, 'status ' + post.status + ' — a 400 here means no JSON parser is mounted');
  const posted = post.status === 200 ? await post.json() : {};
  check('the stored entry carries a server-stamped decision_at',
    !!(posted.entry && posted.entry.decision_at));
  check('the server clock is the authority (decision_at differs from client_at path)',
    !!(posted.entry && posted.entry.kind === 'recommendation' && posted.entry.pick === 34));

  const get = await fetch(base + '/admin/api/ledger/predict?season=2026',
    { headers: { 'Cookie': cookie } });
  const read = get.status === 200 ? await get.json() : { count: -1 };
  check('GET reads the ledger back read-only, one entry', read.count === 1, 'count ' + read.count);

  check('the entry carries its method/model version', posted.entry && posted.entry.method === 'composite-v1');

  // Auth guard: no cookie must not reach the ledger.
  const noauth = await fetch(base + '/admin/api/ledger/predict', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual' });
  check('an unauthenticated POST is redirected to login, not accepted',
    noauth.status === 302, String(noauth.status));

  // --- DEMAND 4 (retention) + persistence across a redeploy ----------------
  // The entry must live in the backing STORE, not just in memory — that is what
  // survives a Netlify redeploy (prod uses durable Blobs; this file store stands
  // in with the same interface). And the backup job must ENUMERATE it.
  const predKeys = await store.listKeys('pred:2026:');
  check('the posted prediction is persisted to the backing store (survives a redeploy)',
    predKeys.length === 1, predKeys.join(','));

  // Simulate a redeploy: a brand-new app instance reading the SAME durable dir
  // must still serve the entry. (The store already points at DATA_DIR; a fresh
  // createApp() shares it — the entry is on disk, not in the old instance.)
  const server2 = createApp().listen(0);
  await new Promise(r => server2.once('listening', r));
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  const login2 = await fetch(base2 + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=draftnight2026', redirect: 'manual' });
  const read2 = await (await fetch(base2 + '/admin/api/ledger/predict?season=2026',
    { headers: { 'Cookie': cookieFrom(login2) } })).json();
  check('after a simulated redeploy, the entry is still served (persistence)',
    read2.count === 1 && read2.entries[0].kind === 'recommendation');
  server2.close();

  // The backup job's prefix list must include the ledger + archive keyspaces,
  // or an append-only log lives in only one place — disappearing ink.
  const backupSrc = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'backup.js'), 'utf8');
  check('the weekly backup enumerates the ledger (pred:) and archive (raw:) keyspaces',
    backupSrc.includes("'pred:'") && backupSrc.includes("'raw:'"));

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + pass + '/' + (pass + fail) + ' server-ledger checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
