'use strict';
// TERRITORY: A
// THE DOUBLE-ESCAPE BUG, PROVEN ON THE ROUTE IT HAS PROBABLY BEEN BREAKING
// SINCE BEFORE THIS SESSION — /lineup/log and /lineup/override.
//
// Found 2026-08-15 while building the equivalent test for the new /stream
// forms (draft/tests/waiver_stream_surface.test.js): views/lineup.ejs's
// hidden `recommended`/`counterfactual`/`confidence` fields did
// `JSON.stringify(...).replace(/"/g, '&quot;')` INSIDE an EJS `<%= %>` tag —
// which already HTML-escapes its output by default. The manual replace ran a
// SECOND time on top of that, turning the real response's `&#34;` into
// `&amp;#34;`. A browser decodes HTML entities in a single, non-recursive
// pass, so the value it actually SUBMITS still contains the literal text
// "&#34;" where a real quote belongs — not valid JSON. `safeJson()` on the
// server then fails to parse it and silently falls back to the raw mangled
// string, corrupting `payload.recommended`/`counterfactual`/`confidence` on
// every real lineup capture. This bug predates this session; it was invisible
// to `override_capture.test.js` because that suite tests the POST route with
// a hand-built body and tests the rendered FORM's existence separately —
// never combines them, so the actual escaped `value="..."` text was never
// read back. This file combines them, on both routes, with a player name
// containing an apostrophe AND a literal double quote to stress the escaping
// for real.
//
// Run: node draft/tests/lineup_capture_escaping.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lineup-esc-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const ejs = require('ejs');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// A single, sane HTML-entity decode — exactly what a real browser's
// attribute-value parser does: one pass, no recursion.
const browserDecode = s => s.replace(/&#34;/g, '"').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const hidden = (formHtml, name) => {
  const m = formHtml.match(new RegExp('name="' + name + '" value="([^"]*)"'));
  return m ? browserDecode(m[1]) : null;
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const years = Object.values(await store.get('seasons'));
  const season = String((years.find(y => y.status !== 'complete') || years[years.length - 1]).year);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');

  // A name with BOTH an apostrophe and a literal double quote — the specific
  // character the bug corrupts. Real player nicknames do carry quotes
  // ("The Nightmare", 6'2" listed heights piped into notes elsewhere, etc.);
  // this is deliberately adversarial rather than assuming clean input.
  const TRICKY = "Le'Veon \"Bell\" Cook";
  const tp = path.join(ROOT, 'views', 'lineup.ejs');
  const tpl = fs.readFileSync(tp, 'utf8').replace(/<%-\s*include\([^%]+%>/g, '');
  const html = ejs.render(tpl, {
    me: { id: 1, name: 'Cory' }, owners: [], tab: 'live', season: { year: Number(season) },
    band: { median: 140 }, projSource: 'sleeper', roster: [], matchup: { week: 3 }, weekNo: 3,
    alert: null, posture: null, proof: null, eff: null, myLeak: 0, drill: null,
    configured: true, logged: false, overrode: false, sent: false,
    live: { calls: [], lineup: [{ slot: 'RB', name: TRICKY, pos: 'RB', proj: 18.4, pid: 'trk1' }],
      naive: [{ slot: 'RB', name: 'Boring Guy', pos: 'RB', proj: 12.1, pid: 'nv1' }],
      ev: { mean: 100, pHigh: 0.3, pWin: 0.5 }, edge: 6.4,
      projPending: false, oppKnown: true, confidence: 'high — "clear" starter' },
  }, { filename: tp });

  const logForm = (html.match(/<form method="post" action="\/lineup\/log"[\s\S]*?<\/form>/) || [''])[0];
  const ovForm = (html.match(/<form method="post" action="\/lineup\/override"[\s\S]*?<\/form>/) || [''])[0];
  ck('both lineup forms are present in the real template output', !!logForm && !!ovForm);

  // ── /lineup/log: the real rendered value must be VALID JSON ────────────
  {
    const week = hidden(logForm, 'week'), dollars = hidden(logForm, 'dollars');
    const confidence = hidden(logForm, 'confidence');
    const recommended = hidden(logForm, 'recommended'), counterfactual = hidden(logForm, 'counterfactual');
    ck('the rendered confidence field survives the quote intact',
      confidence === 'high — "clear" starter', confidence);
    ck('the rendered "recommended" field is valid JSON carrying the tricky name',
      (() => { try { return JSON.parse(recommended)[0].name === TRICKY; } catch (e) { return false; } })(),
      recommended);
    ck('the rendered "counterfactual" field is valid JSON too', (() => {
      try { return JSON.parse(counterfactual)[0].name === 'Boring Guy'; } catch (e) { return false; }
    })(), counterfactual);

    const r = await fetch(base + '/lineup/log', { method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ week, dollars, confidence, recommended, counterfactual }).toString() });
    ck('POSTing the real rendered values to /lineup/log redirects cleanly', r.status >= 200 && r.status < 400, r.status);

    const rows = await predledger.readAll(store, season);
    const entry = rows.filter(e => e.kind === 'lineup_call').sort((a, b) => b.seq - a.seq)[0];
    ck('a real, browser-shaped lineup_call lands as a PARSED object, not a mangled string',
      !!entry && Array.isArray(entry.payload.recommended) && entry.payload.recommended[0].name === TRICKY,
      entry && entry.payload);
    ck('  and the quote-bearing confidence string survives all the way to the ledger',
      !!entry && entry.payload.confidence === 'high — "clear" starter', entry && entry.payload);
  }

  // ── /lineup/override: same proof, the other route ───────────────────────
  {
    const week = hidden(ovForm, 'week'), dollars = hidden(ovForm, 'dollars');
    const confidence = hidden(ovForm, 'confidence'), recommended = hidden(ovForm, 'recommended');
    ck('the override form\'s "recommended" field is also valid JSON', (() => {
      try { return JSON.parse(recommended)[0].name === TRICKY; } catch (e) { return false; }
    })(), recommended);

    const r = await fetch(base + '/lineup/override', { method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ week, dollars, confidence, recommended, reason: 'injury news' }).toString() });
    ck('POSTing the real rendered "injury news" chip redirects cleanly', r.status >= 200 && r.status < 400, r.status);

    const rows = await predledger.readAll(store, season);
    const entry = rows.filter(e => e.kind === 'inseason_override')
      .filter(e => (e.payload || {}).reason === 'injury news').sort((a, b) => b.seq - a.seq)[0];
    ck('the override entry\'s recommended is a parsed object with the tricky name intact',
      !!entry && entry.payload.recommended[0].name === TRICKY, entry && entry.payload);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
