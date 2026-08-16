// TERRITORY: A
'use strict';
// 🟠 AUDIT FINDING 4 (external persistence audit, 2026-08-16): CRON SECRETS IN
// QUERY STRINGS.
//
// /api/weekly-recap and /api/sunday-alert authenticated ONLY via `?key=` —
// the secret lands in proxy logs, Netlify function logs and browser history.
// The preferred path is now `Authorization: Bearer <secret>`, CHECKED FIRST;
// the query param KEEPS WORKING because live callers exist (the two GitHub
// workflows, now updated in-repo to send the header — they send both during
// the deploy window, since the workflow runs against the DEPLOYED site and
// must not break in the gap between merge and deploy).
//
// RED against the pre-fix routes (Bearer-only requests got 403); the red run
// is preserved in draft/audit/persistence_hardening_2026-08-16.md.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cronauth-'));
process.env.WEEKLY_RECAP_KEY = 'recap-secret';
process.env.SUNDAY_ALERT_KEY = 'sunday-secret';
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };

// Seal Sleeper off so both endpoints take their quiet off-season branch.
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  throw new Error('network sealed off in test');
};

(async () => {
  await data.ensureSeeded();
  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const hit = async (p, { key, bearer, rawAuth } = {}) => {
    const headers = {};
    if (bearer !== undefined) headers.Authorization = `Bearer ${bearer}`;
    if (rawAuth !== undefined) headers.Authorization = rawAuth;
    const r = await fetch(base + p + (key !== undefined ? `?key=${key}` : ''), { headers, redirect: 'manual' });
    let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
    return { status: r.status, body: j };
  };

  for (const [route, secret] of [['/api/weekly-recap', 'recap-secret'], ['/api/sunday-alert', 'sunday-secret']]) {
    // ── the preferred path: Authorization: Bearer, no query string ──────────
    const viaHeader = await hit(route, { bearer: secret });
    ck(`${route}: Bearer header ALONE authenticates (the preferred path)`,
      viaHeader.status === 200 && viaHeader.body && viaHeader.body.ok === true, viaHeader);

    // ── the legacy path keeps working — live callers exist ──────────────────
    const viaQuery = await hit(route, { key: secret });
    ck(`${route}: the ?key= query param still works (existing callers)`,
      viaQuery.status === 200 && viaQuery.body && viaQuery.body.ok === true, viaQuery);

    // ── the header is checked FIRST: a valid header wins even beside a wrong
    //    query value (a caller mid-migration must not be locked out) ─────────
    const both = await hit(route, { bearer: secret, key: 'stale-wrong-value' });
    ck(`${route}: a valid Bearer wins even with a wrong ?key= beside it`, both.status === 200, both);

    // ── and a wrong header does not lock out a valid query key ──────────────
    const rescue = await hit(route, { bearer: 'wrong', key: secret });
    ck(`${route}: a wrong header falls back to the still-valid query key`, rescue.status === 200, rescue);

    // ── refusals ────────────────────────────────────────────────────────────
    ck(`${route}: no credentials at all is refused`, (await hit(route)).status === 403);
    ck(`${route}: a wrong Bearer alone is refused`, (await hit(route, { bearer: 'nope' })).status === 403);
    ck(`${route}: a wrong query key alone is refused`, (await hit(route, { key: 'nope' })).status === 403);
    ck(`${route}: a malformed Authorization header is refused`, (await hit(route, { rawAuth: secret })).status === 403);
  }

  // The other secret must not open the recap door via header either
  // (weekly-recap falls back to SUNDAY_ALERT_KEY only when its own is unset —
  // here both are set, so the sunday secret must not pass the recap gate).
  ck('the sunday secret does not authenticate the recap endpoint',
    (await hit('/api/weekly-recap', { bearer: 'sunday-secret' })).status === 403);

  // ── THE IN-REPO CALLERS SEND THE HEADER ─────────────────────────────────────
  // The finding's callers: the two GitHub workflows. Each must now send
  // Authorization: Bearer (and may keep ?key= for the deploy window — the
  // workflow hits the DEPLOYED site, which may lag this repo by one deploy).
  const fsMod = require('fs');
  for (const wf of ['sunday-alert.yml', 'weekly-recap.yml']) {
    const yml = fsMod.readFileSync(path.join(ROOT, '.github', 'workflows', wf), 'utf8');
    ck(`${wf} sends the Authorization: Bearer header`,
      /Authorization:\s*Bearer/.test(yml), (yml.match(/.{0,60}Authorization.{0,60}/) || ['no header found'])[0]);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
