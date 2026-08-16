'use strict';
// TERRITORY: A
// THE FOUR ROUTES THEMSELVES, HIT FOR REAL — not just their path strings.
//
// Found 2026-08-15, right after attach_own_model() got the same treatment:
// /waivers/log, /waivers/override, /stream/log, /stream/override were each
// verified by hand (syntax, an EJS render test, the full suite passing) but
// had no test that actually POSTs to them and reads back what landed in the
// ledger. authority.test.js and loop_closure.test.js both touch these paths,
// but only as strings — one checks they're exempt from a doctrine regex, the
// other checks the KIND is "captured" by grepping source. Neither one boots
// the route and checks the payload shape. This is that test: boot the real
// app, log in as commissioner, POST realistic bodies, read src/predledger.js's
// own readAll() back and assert kind + payload on each of the four.
//
// Run: node draft/tests/inseason_capture_routes.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inseason-capture-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const comm = owners.find(o => o.is_commissioner);
  comm.password_hash = hashPassword('pw123456'); comm.must_change_password = false;
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookie = (await fetch(b + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${comm.username}&password=pw123456`, redirect: 'manual',
  }).then(r => r.headers.getSetCookie())).map(s => s.split(';')[0]).join('; ');

  const post = (p, form) => fetch(b + p, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(), redirect: 'manual',
  });

  const seasons = await store.get('seasons');
  const all = Object.values(seasons);
  const season = String((all.find(s => s.status === 'active') || all.sort((a, c) => c.year - a.year)[0]).year);
  const latest = kind => {
    // readAll() is season-scoped and read-only by contract (predledger.test.js
    // already pins that); re-used here rather than a second reader.
    return predledger.readAll(store, season).then(rows =>
      rows.filter(r => r.kind === kind).sort((a, c) => (c.seq || 0) - (a.seq || 0))[0]);
  };

  // ── /waivers/log → waiver_claim ────────────────────────────────────────
  {
    const claim = { player_id: '9', name: 'Add Guy' };
    const r = await post('/waivers/log', {
      week: '3', chosen: JSON.stringify(claim), drop: JSON.stringify({ player_id: '2', name: 'Cut Guy' }),
      dollars: '12', contested: '1',
    });
    ck('/waivers/log redirects (not a 500)', r.status === 302 && /logged=1/.test(r.headers.get('location') || ''), r.status);
    const e = await latest('waiver_claim');
    ck('waiver_claim landed in the ledger', !!e, e);
    ck('  chosen carries the claimed player', e && e.payload.chosen.player_id === '9', e && e.payload);
    ck('  drop carries the cut player', e && e.payload.drop.player_id === '2', e && e.payload);
    ck('  counterfactual is the fixed "hold priority" — never a guessed alternative',
      e && e.payload.counterfactual === 'hold priority', e && e.payload.counterfactual);
    ck('  dollars and week are numbers, not strings off the form',
      e && e.payload.dollars === 12 && e.payload.week === 3, e && e.payload);
    ck('  method identifies this route, not the lineup one',
      e && e.method === 'waiver-tool-v1', e && e.method);
  }

  // ── /waivers/override → inseason_override ──────────────────────────────
  {
    const rec = { player_id: '7', name: 'Obvious Add' };
    const r = await post('/waivers/override', {
      week: '3', recommended: JSON.stringify(rec), dollars: '9', reason: 'gut feel',
    });
    ck('/waivers/override redirects (not a 500)', r.status === 302 && /overrode=1/.test(r.headers.get('location') || ''), r.status);
    const e = await latest('inseason_override');
    ck('inseason_override landed in the ledger', !!e, e);
    ck('  recommended AND counterfactual both carry the tool\'s pick (the override convention)',
      e && e.payload.recommended.player_id === '7' && e.payload.counterfactual.player_id === '7', e && e.payload);
    ck('  method identifies the waiver override, not the lineup or stream one',
      e && e.method === 'waiver-override-v1', e && e.method);
    ck('  reason is captured (truncated, never dropped)', e && e.payload.reason === 'gut feel', e && e.payload);
  }

  // ── /stream/log → stream_call ───────────────────────────────────────────
  {
    const chosen = { player_id: '11', name: 'Streamer DEF' };
    const held = { player_id: '5', name: 'Bench DEF' };
    const r = await post('/stream/log', {
      week: '3', chosen: JSON.stringify(chosen), counterfactual: JSON.stringify(held), dollars: '0',
    });
    ck('/stream/log redirects (not a 500)', r.status === 302 && /streamed=1/.test(r.headers.get('location') || ''), r.status);
    const e = await latest('stream_call');
    ck('stream_call landed in the ledger', !!e, e);
    ck('  chosen carries the streamed player', e && e.payload.chosen.player_id === '11', e && e.payload);
    ck('  counterfactual is a REAL alternative (the rostered K/DEF), not the fixed waiver phrase',
      e && e.payload.counterfactual && e.payload.counterfactual.player_id === '5', e && e.payload.counterfactual);
    ck('  method identifies the stream route', e && e.method === 'waiver-tool-stream-v1', e && e.method);
  }

  // ── /stream/override → inseason_override ────────────────────────────────
  {
    const rec = { player_id: '11', name: 'Streamer DEF' };
    const r = await post('/stream/override', {
      week: '3', recommended: JSON.stringify(rec), dollars: '0', reason: 'trust my gut',
    });
    ck('/stream/override redirects (not a 500)', r.status === 302 && /streamoverrode=1/.test(r.headers.get('location') || ''), r.status);
    const e = await latest('inseason_override');
    ck('a SECOND inseason_override (stream\'s) landed, distinguishable by method',
      !!e && e.method === 'stream-override-v1', e && e.method);
    ck('  recommended AND counterfactual both carry the tool\'s pick, same convention as the waiver override',
      e && e.payload.recommended.player_id === '11' && e.payload.counterfactual.player_id === '11', e && e.payload);
  }

  // ── the append-only ledger is genuinely append-only across all four ─────
  {
    const rows = await predledger.readAll(store, season);
    const seqs = rows.map(r => r.seq);
    ck('every write got its own seq — no two routes silently shared/overwrote a key',
      new Set(seqs).size === seqs.length, seqs);
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
